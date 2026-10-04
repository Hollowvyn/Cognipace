import { loadActiveProviderConfigSnapshot } from '@/features/genai/server/genai-settings-service'
import { AiDeadlineError, withAiDeadline } from '@/lib/ai'
import type { Db } from '@/platform/db'

import {
  analysisIdentity,
  type AnalyzeLeetCodeSubmissionRequest,
  type AnalyzeLeetCodeSubmissionResponse,
} from '../api/code-analysis-contracts'
import { analyzeCode } from './code-analysis-service'

const analysisTimeoutMs = 30_000

export async function analyzeLeetCodeSubmissionInBackground(
  request: AnalyzeLeetCodeSubmissionRequest,
  loadDb: () => Promise<Db>,
  externalSignal: AbortSignal,
): Promise<AnalyzeLeetCodeSubmissionResponse> {
  const identity = analysisIdentity(request)
  const startedAt = Date.now()

  try {
    return await withAiDeadline(
      { timeoutMs: analysisTimeoutMs, signal: externalSignal },
      async (signal): Promise<AnalyzeLeetCodeSubmissionResponse> => {
        const db = await loadDb()
        signal.throwIfAborted()
        const snapshot = await loadActiveProviderConfigSnapshot(db)
        signal.throwIfAborted()
        if (!snapshot)
          return {
            status: 'unavailable',
            ...identity,
            reason: 'configuration',
            message:
              'Enable AI assessment and save a provider, model, and API key in Settings to analyze this submission.',
          }

        const result = await analyzeCode(
          request,
          snapshot.config,
          signal,
          Math.max(0, analysisTimeoutMs - (Date.now() - startedAt)),
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
            ? 'Submission analysis timed out. Please retry.'
            : 'Submission analysis was cancelled. Please retry.',
      }
    return {
      status: 'error',
      ...identity,
      code: 'unknown',
      message: 'The submission could not be analyzed. Please retry.',
    }
  }
}
