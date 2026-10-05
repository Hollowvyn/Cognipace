import { readAiHintConnectionSnapshot } from '@/features/genai/server/genai-settings-service'
import { AiDeadlineError, withAiDeadline } from '@/lib/ai/operation'
import type { Db } from '@/platform/db'

import {
  type GenerateLeetCodeHintsRequest,
  type GenerateLeetCodeHintsResponse,
} from '../api/code-hint-contracts'
import { generateCodeHints } from './code-hint-service'

const hintTimeoutMs = 30_000

export async function generateLeetCodeHintsInBackground(
  request: GenerateLeetCodeHintsRequest,
  loadDb: () => Promise<Db>,
  externalSignal: AbortSignal,
): Promise<GenerateLeetCodeHintsResponse> {
  const identity = { requestId: request.requestId }
  const stale = (): GenerateLeetCodeHintsResponse => ({
    status: 'error',
    ...identity,
    code: 'stale-configuration',
    message:
      'The saved AI connection changed. Retry with the current connection.',
  })

  try {
    return await withAiDeadline(
      { timeoutMs: hintTimeoutMs, signal: externalSignal },
      async (signal): Promise<GenerateLeetCodeHintsResponse> => {
        const db = await loadDb()
        signal.throwIfAborted()
        const snapshot = await readAiHintConnectionSnapshot(db)
        signal.throwIfAborted()
        if (!snapshot.config)
          return {
            status: 'error',
            ...identity,
            code: 'not-configured',
            message:
              'Save an AI provider, model, and key in Settings to request hints.',
          }
        if (
          snapshot.status.revision !== request.connectionRevision ||
          snapshot.status.provider !== request.connectionProvider
        )
          return stale()

        const result = await generateCodeHints(
          request.problem,
          snapshot.config,
          signal,
        )
        signal.throwIfAborted()
        const current = await readAiHintConnectionSnapshot(db)
        signal.throwIfAborted()
        if (current.identity !== snapshot.identity) return stale()
        if (result.status === 'error')
          return {
            status: 'error',
            ...identity,
            code: result.code,
            message: result.message,
          }

        return { status: 'ready', ...identity, batch: result.data }
      },
    )
  } catch (error) {
    return {
      status: 'error',
      ...identity,
      code: error instanceof AiDeadlineError ? error.code : 'unknown',
      message:
        error instanceof AiDeadlineError && error.code === 'timeout'
          ? 'Hints timed out. Retry this problem.'
          : 'Hints could not finish. Retry this problem.',
    }
  }
}
