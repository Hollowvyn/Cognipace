import { generateJson } from '@/lib/ai'
import type { AiProviderConfig } from '@/lib/ai/types'

import type { AnalyzeLeetCodeSubmissionRequest } from '../api/code-analysis-contracts'
import { isCodeFeedbackConsistent } from '../domain/code-analysis-consistency'
import { codeFeedbackSchema } from '../domain/code-feedback-schema'
import { buildCodeAnalysisPrompt } from './build-code-analysis-prompt'

export async function analyzeCode(
  request: AnalyzeLeetCodeSubmissionRequest,
  config: AiProviderConfig,
  signal: AbortSignal,
  timeoutMs: number,
) {
  const result = await generateJson({
    ...config,
    prompt: buildCodeAnalysisPrompt(request),
    schema: codeFeedbackSchema,
    signal,
    timeoutMs,
    maxOutputTokens: 8192,
    retryTransientErrors: true,
    collectMetrics: true,
  })
  if (result.status === 'success' && !isCodeFeedbackConsistent(result.data)) {
    return {
      status: 'error' as const,
      code: 'invalid-output' as const,
      message: 'AI returned inconsistent analysis. Retry this submission.',
      providerMetadata: result.providerMetadata,
    }
  }
  return result
}
