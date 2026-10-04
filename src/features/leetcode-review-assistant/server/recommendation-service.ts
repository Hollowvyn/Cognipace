import { generateJson } from '@/lib/ai'

import { assessmentRecommendationSchema } from '../domain/recommendation-schema'
import type {
  RecommendAssessmentInput,
  RecommendAssessmentOutput,
} from '../domain/recommendation-types'
import { buildAssessmentPrompt } from './build-assessment-prompt'
import { normalizeRecommendation } from './recommendation-normalizer'

export async function recommendAssessment(
  input: RecommendAssessmentInput,
): Promise<RecommendAssessmentOutput> {
  const prompt = buildAssessmentPrompt(input)

  const result = await generateJson({
    ...input.providerConfig,
    prompt,
    schema: assessmentRecommendationSchema,
  })

  if (result.status === 'error') {
    return {
      status: 'fallback',
      error: { code: result.code, message: result.message },
    }
  }

  return {
    status: 'ai',
    recommendation: normalizeRecommendation(
      result.data,
      input.deterministicDecision,
    ),
    providerMetadata: result.providerMetadata,
  }
}
