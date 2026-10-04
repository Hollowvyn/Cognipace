import type { LeetCodeAssessmentDecision } from '@/features/assessment'
import type { GenAiError } from '@/features/genai'

import {
  PROMPT_VERSION,
  type AssessmentRecommendation,
  type AssessmentRecommendationRating,
} from '../domain/recommendation-types'

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

const FALLBACK_REASON_BY_CODE: Record<GenAiError, string> = {
  'not-configured': 'AI is not configured.',
  auth: 'AI authentication failed.',
  permission: 'The API key cannot access this AI model.',
  'bad-request': 'AI rejected the request configuration.',
  'model-unavailable': 'The selected AI model is unavailable.',
  'rate-limit': 'AI is rate-limited; try again shortly.',
  network: 'AI request could not reach the provider.',
  timeout: 'AI request timed out.',
  cancelled: 'AI request was cancelled.',
  refused: 'AI could not provide a recommendation for this submission.',
  'invalid-output': 'AI returned output that did not validate.',
  unknown: 'AI request failed.',
}

export function buildFallbackRecommendation(
  deterministic: LeetCodeAssessmentDecision,
  error: { code: GenAiError; message: string } | null,
): AssessmentRecommendation {
  const baseRating: AssessmentRecommendationRating =
    deterministic.status === 'accepted' ? deterministic.rating : 'again'
  const primaryReason =
    error !== null
      ? FALLBACK_REASON_BY_CODE[error.code]
      : 'AI recommendation unavailable.'

  return {
    recommendedRating: baseRating,
    confidence: 'low',
    summary: 'Using deterministic rating; AI recommendation unavailable.',
    primaryReason,
    evidence: [],
    complexity: { time: 'unknown', space: 'unknown', confidence: 'low' },
    improvementPoints: [],
    edgeCaseNotes: [],
    shouldUpdateRating: false,
    promptVersion: PROMPT_VERSION,
  }
}
