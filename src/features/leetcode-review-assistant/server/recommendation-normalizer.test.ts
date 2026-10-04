import { describe, expect, it } from 'vitest'

import type { GenAiError } from '@/features/genai'

import { PROMPT_VERSION } from '../domain/recommendation-types'
import {
  buildFallbackRecommendation,
  normalizeRecommendation,
} from './recommendation-normalizer'
import {
  makeAcceptedDecision,
  makeFailedDecision,
  makeStrictTimingLockedDecision,
  makeValidRecommendation,
} from '../testing/recommendation-fixtures'

describe('normalizeRecommendation — failed lock', () => {
  it('forces recommendedRating to "again" even when AI says "good"', () => {
    const result = normalizeRecommendation(
      makeValidRecommendation({
        recommendedRating: 'good',
        shouldUpdateRating: true,
      }),
      makeFailedDecision(),
    )
    expect(result.recommendedRating).toBe('again')
    expect(result.shouldUpdateRating).toBe(false)
  })

  it('keeps recommendedRating "again" and clears shouldUpdateRating', () => {
    const result = normalizeRecommendation(
      makeValidRecommendation({
        recommendedRating: 'again',
        shouldUpdateRating: true,
      }),
      makeFailedDecision(),
    )
    expect(result.recommendedRating).toBe('again')
    expect(result.shouldUpdateRating).toBe(false)
  })
})

describe('normalizeRecommendation — hard-mode-overtime lock', () => {
  it('forces recommendedRating to "again" even when AI says "easy"', () => {
    const result = normalizeRecommendation(
      makeValidRecommendation({
        recommendedRating: 'easy',
        shouldUpdateRating: true,
      }),
      makeStrictTimingLockedDecision(),
    )
    expect(result.recommendedRating).toBe('again')
    expect(result.shouldUpdateRating).toBe(false)
  })
})

describe('normalizeRecommendation — matching rating', () => {
  it('passes through but forces shouldUpdateRating to false', () => {
    const result = normalizeRecommendation(
      makeValidRecommendation({
        recommendedRating: 'good',
        shouldUpdateRating: true,
      }),
      makeAcceptedDecision(),
    )
    expect(result.recommendedRating).toBe('good')
    expect(result.shouldUpdateRating).toBe(false)
  })
})

describe('normalizeRecommendation — different rating, no lock', () => {
  it('passes through unchanged including the AI shouldUpdateRating', () => {
    const aiOutput = makeValidRecommendation({
      recommendedRating: 'hard',
      shouldUpdateRating: true,
    })
    const result = normalizeRecommendation(aiOutput, makeAcceptedDecision())
    expect(result.recommendedRating).toBe('hard')
    expect(result.shouldUpdateRating).toBe(true)
  })
})

describe('buildFallbackRecommendation', () => {
  const reasonByCode: Record<GenAiError, string> = {
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

  it.each(Object.entries(reasonByCode))(
    'maps error code %s to the documented primaryReason',
    (code, expectedReason) => {
      const result = buildFallbackRecommendation(makeAcceptedDecision(), {
        code: code as GenAiError,
        message: 'irrelevant',
      })
      expect(result.primaryReason).toBe(expectedReason)
    },
  )

  it('uses a generic primaryReason when error is null', () => {
    const result = buildFallbackRecommendation(makeAcceptedDecision(), null)
    expect(result.primaryReason).toBe('AI recommendation unavailable.')
  })

  it('populates safe display fields', () => {
    const result = buildFallbackRecommendation(makeAcceptedDecision(), null)
    expect(result.confidence).toBe('low')
    expect(result.evidence).toEqual([])
    expect(result.improvementPoints).toEqual([])
    expect(result.edgeCaseNotes).toEqual([])
    expect(result.complexity).toEqual({
      time: 'unknown',
      space: 'unknown',
      confidence: 'low',
    })
    expect(result.shouldUpdateRating).toBe(false)
    expect(result.promptVersion).toBe(PROMPT_VERSION)
  })

  it('matches the deterministic rating for accepted decisions', () => {
    const result = buildFallbackRecommendation(makeAcceptedDecision(), null)
    expect(result.recommendedRating).toBe('good')
  })

  it('matches the deterministic rating "again" when failed lock applies', () => {
    const result = buildFallbackRecommendation(makeFailedDecision(), null)
    expect(result.recommendedRating).toBe('again')
  })
})
