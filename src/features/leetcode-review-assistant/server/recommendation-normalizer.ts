import type { LeetCodeAssessmentDecision } from '@/features/assessment'
import type { AssessmentRecommendation } from '../domain/recommendation-types'

export function normalizeRecommendation(
  aiOutput: AssessmentRecommendation,
  deterministic: LeetCodeAssessmentDecision,
): AssessmentRecommendation {
  if (deterministic.status !== 'accepted') {
    return aiOutput
  }
  if (
    deterministic.lockReason === 'failed' ||
    deterministic.lockReason === 'hard-mode-overtime'
  ) {
    return {
      ...aiOutput,
      recommendedRating: 'again',
      shouldUpdateRating: false,
    }
  }
  if (aiOutput.recommendedRating === deterministic.rating) {
    return { ...aiOutput, shouldUpdateRating: false }
  }
  return aiOutput
}
