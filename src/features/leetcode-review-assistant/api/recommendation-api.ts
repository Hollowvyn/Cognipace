import { sendMessage } from '@/extension/messaging'

import {
  recommendLeetCodeAssessmentResponseSchema,
  type RecommendLeetCodeAssessmentRequest,
} from './runtime-contracts'

export async function recommendLeetCodeAssessmentViaRuntime(
  request: RecommendLeetCodeAssessmentRequest,
) {
  return recommendLeetCodeAssessmentResponseSchema.parse(
    await sendMessage('genai.recommendLeetCodeAssessment', request),
  )
}
