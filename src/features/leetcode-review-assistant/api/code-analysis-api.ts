import { sendMessage } from '@/extension/messaging'

import {
  analyzeLeetCodeSubmissionResponseSchema,
  cancelLeetCodeAnalysisResponseSchema,
  type AnalyzeLeetCodeSubmissionRequest,
  type CancelLeetCodeAnalysisRequest,
} from './code-analysis-contracts'

export async function analyzeLeetCodeSubmissionViaRuntime(
  request: AnalyzeLeetCodeSubmissionRequest,
) {
  return analyzeLeetCodeSubmissionResponseSchema.parse(
    await sendMessage('genai.analyzeLeetCodeSubmission', request),
  )
}

export async function cancelLeetCodeAnalysisViaRuntime(
  request: CancelLeetCodeAnalysisRequest,
) {
  return cancelLeetCodeAnalysisResponseSchema.parse(
    await sendMessage('genai.cancelLeetCodeAnalysis', request),
  )
}
