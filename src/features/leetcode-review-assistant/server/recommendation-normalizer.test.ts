import { describe, expect, it } from 'vitest'

import { normalizeRecommendation } from './recommendation-normalizer'
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
