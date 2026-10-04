import { generateJson } from '@/lib/ai'
import type { AiProviderConfig } from '@/lib/ai/types'

import type { AnalyzeLeetCodeSubmissionRequest } from '../api/code-analysis-contracts'
import { isCodeAnalysisConsistent } from '../domain/code-analysis-consistency'
import { codeAnalysisSchema } from '../domain/code-analysis-schema'
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
    schema: codeAnalysisSchema,
    signal,
    timeoutMs,
    maxOutputTokens: 8192,
  })
  if (
    result.status === 'success' &&
    !isCodeAnalysisConsistent(result.data, request.submission.language)
  ) {
    return {
      status: 'error' as const,
      code: 'invalid-output' as const,
      message: 'AI returned inconsistent analysis. Retry this submission.',
      providerMetadata: result.providerMetadata,
    }
  }
  return result
}
