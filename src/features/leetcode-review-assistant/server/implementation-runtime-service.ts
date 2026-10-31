import { loadActiveProviderConfigSnapshot } from '@/features/genai/server/genai-settings-service'
import { AiDeadlineError, withAiDeadline } from '@/lib/ai'
import type { Db } from '@/platform/db'

import {
  implementationIdentity,
  type GenerateLeetCodeImplementationRequest,
  type GenerateLeetCodeImplementationResponse,
} from '../api/code-implementation-contracts'
import { generateCodeImplementation } from './code-implementation-service'

const implementationTimeoutMs = 60_000

export async function generateLeetCodeImplementationInBackground(
  request: GenerateLeetCodeImplementationRequest,
  loadDb: () => Promise<Db>,
  externalSignal: AbortSignal,
): Promise<GenerateLeetCodeImplementationResponse> {
  const identity = implementationIdentity(request)
  const startedAt = Date.now()

  try {
    return await withAiDeadline(
      { timeoutMs: implementationTimeoutMs, signal: externalSignal },
      async (signal): Promise<GenerateLeetCodeImplementationResponse> => {
        const db = await loadDb()
        signal.throwIfAborted()
        const snapshot = await loadActiveProviderConfigSnapshot(db)
        signal.throwIfAborted()
        if (!snapshot)
          return {
            status: 'unavailable',
            ...identity,
            message:
              'Enable AI assessment and save a provider, model, and API key in Settings to generate suggested code.',
          }

        const result = await generateCodeImplementation(
          request,
          snapshot.config,
          signal,
          Math.max(0, implementationTimeoutMs - (Date.now() - startedAt)),
        )
        signal.throwIfAborted()
        const current = await loadActiveProviderConfigSnapshot(db)
        signal.throwIfAborted()
        if (!current || current.identity !== snapshot.identity)
          return {
            status: 'error',
            ...identity,
            code: 'stale-configuration',
            message:
              'The AI connection changed. Retry with the saved connection.',
          }
        if (result.status === 'error')
          return {
            status: 'error',
            ...identity,
            code: result.code,
            message: result.message,
          }

        return {
          status: 'ready',
          ...identity,
          report: result.data,
          providerMetadata: result.providerMetadata,
        }
      },
    )
  } catch (error) {
    if (error instanceof AiDeadlineError)
      return {
        status: 'error',
        ...identity,
        code: error.code,
        message:
          error.code === 'timeout'
            ? 'Suggested implementation timed out. Please retry.'
            : 'Suggested implementation was cancelled. Please retry.',
      }
    return {
      status: 'error',
      ...identity,
      code: 'unknown',
      message:
        'The suggested implementation could not be generated. Please retry.',
    }
  }
}
