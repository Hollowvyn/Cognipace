import { z } from 'zod'

import { getSettings } from '@/features/settings/server/settings-service'
import { AiDeadlineError, generateJson, withAiDeadline } from '@/lib/ai'
import type { Db } from '@/platform/db'

import type {
  TestAiConnectionRequest,
  TestAiConnectionResponse,
} from '../api/genai-settings-contracts'
import { loadAiProviderSecretSnapshotFromTrustedStorage } from './genai-secret-storage'

const connectionTimeoutMs = 20_000
const connectionOutputSchema = z.strictObject({ ok: z.literal(true) })

/** Background-only verification of one already saved configuration. */
export async function testAiConnection(
  request: TestAiConnectionRequest,
  loadDb: () => Promise<Db>,
): Promise<TestAiConnectionResponse> {
  const startedAt = Date.now()
  const identity = () => ({
    provider: request.provider,
    model: request.model,
    durationMs: Math.max(0, Date.now() - startedAt),
  })
  const stale = (): TestAiConnectionResponse => ({
    status: 'error',
    ...identity(),
    code: 'stale-configuration',
    message:
      'The saved AI connection changed. Save or reload it before testing again.',
  })
  try {
    return await withAiDeadline(
      { timeoutMs: connectionTimeoutMs },
      async (signal) => {
        // The deadline is already active before database startup or trusted storage.
        const db = await loadDb()
        signal.throwIfAborted()
        const settings = await getSettings(db)
        signal.throwIfAborted()
        if (!matchesConnection(settings.aiAssessment, request)) return stale()
        const saved = await loadAiProviderSecretSnapshotFromTrustedStorage(
          request.provider,
        )
        signal.throwIfAborted()
        if (!saved)
          return {
            status: 'error',
            ...identity(),
            code: 'not-configured',
            message:
              'Save an API key for this provider before testing the connection.',
          }
        const result = await generateJson({
          provider: request.provider,
          model: request.model,
          apiKey: saved.secret.apiKey,
          prompt: { system: '', user: 'Return {"ok":true}.' },
          schema: connectionOutputSchema,
          maxOutputTokens: 512,
          timeoutMs: Math.max(
            0,
            connectionTimeoutMs - (Date.now() - startedAt),
          ),
          signal,
        })
        signal.throwIfAborted()
        const currentSettings = await getSettings(db)
        signal.throwIfAborted()
        const currentSecret =
          await loadAiProviderSecretSnapshotFromTrustedStorage(request.provider)
        signal.throwIfAborted()
        if (
          !matchesConnection(currentSettings.aiAssessment, request) ||
          !currentSecret ||
          currentSecret.identity !== saved.identity
        )
          return stale()
        if (result.status === 'error')
          return {
            status: 'error',
            ...identity(),
            code: result.code,
            message: result.message,
          }
        return { status: 'success', ...identity() }
      },
    )
  } catch (error) {
    if (error instanceof AiDeadlineError)
      return {
        status: 'error',
        ...identity(),
        code: error.code,
        message:
          error.code === 'timeout'
            ? 'The connection test timed out. Please retry.'
            : 'The connection test was cancelled. Please retry.',
      }
    return {
      status: 'error',
      ...identity(),
      code: 'unknown',
      message: 'The saved connection could not be tested. Please retry.',
    }
  }
}

function matchesConnection(
  saved: { provider: string; model: string },
  request: TestAiConnectionRequest,
) {
  return (
    saved.provider === request.provider && saved.model.trim() === request.model
  )
}
