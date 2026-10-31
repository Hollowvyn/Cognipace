import { sendMessage } from '@/extension/messaging'
import {
  generateLeetCodeImplementationResponseSchema,
  cancelLeetCodeImplementationResponseSchema,
  type GenerateLeetCodeImplementationRequest,
} from './code-implementation-contracts'
import type { CancelLeetCodeAnalysisRequest } from './code-analysis-contracts'
export async function generateLeetCodeImplementationViaRuntime(
  request: GenerateLeetCodeImplementationRequest,
) {
  return generateLeetCodeImplementationResponseSchema.parse(
    await sendMessage('genai.generateLeetCodeImplementation', request),
  )
}
export async function cancelLeetCodeImplementationViaRuntime(
  request: CancelLeetCodeAnalysisRequest,
) {
  return cancelLeetCodeImplementationResponseSchema.parse(
    await sendMessage('genai.cancelLeetCodeImplementation', request),
  )
}
