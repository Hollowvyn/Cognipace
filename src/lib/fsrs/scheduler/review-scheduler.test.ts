import { describe, expect, it } from 'vitest'

import {
  createInitialFsrsCard,
  getTargetRetentionDuration,
  getRetrievability,
  replayReviewHistory,
  replayReviewHistorySequence,
  scheduleReview,
} from './review-scheduler'
import { reviewRatings, type ReviewRating } from '../domain/review-rating'

describe('fsrs scheduler wrapper', () => {
  it('uses hour-level LeetCode defaults so learning states are persisted', () => {
    const outcomesByRating = reviewRatings.map((rating) => {
      const result = scheduleReview(
        createInitialFsrsCard(baseReviewedAt),
        rating,
        baseReviewedAt,
      )

      return [
        rating,
        result.card.state,
        hoursBetween(result.card.dueAt, baseReviewedAt),
      ] as const
    })

    expect(outcomesByRating).toEqual([
      ['again', 'learning', 12],
      ['hard', 'learning', 17.5],
      ['good', 'learning', 23],
      ['easy', 'review', 192],
    ])
  })

  it('uses relearning state for an existing review card rated again', () => {
    const reviewCard = createReviewedCard()
    const lapse = scheduleReview(reviewCard, 'again', reviewCard.dueAt)

    expect(lapse.card.state).toBe('relearning')
    expect(hoursBetween(lapse.card.dueAt, lapse.reviewedAt)).toBe(23)
    expect(lapse.card.lapses).toBe(1)
  })

  it('returns a serializable review log snapshot for future rollback support', () => {
    const result = scheduleReview(
      createInitialFsrsCard(baseReviewedAt),
      'good',
      baseReviewedAt,
    )

    expect(result.log).toMatchObject({
      rating: 'good',
      state: 'new',
      reviewedAt: baseReviewedAt.toISOString(),
    })
    expect(JSON.parse(JSON.stringify(result.log))).toEqual(result.log)
  })

  it.each([
    [{ targetRetention: 0 }, 'Invalid FSRS target retention "0".'],
    [{ learningSteps: ['1.5h'] }, 'Invalid FSRS step unit "1.5h".'],
  ] as const)('rejects invalid scheduler option $error', (options, error) => {
    expect(() =>
      scheduleReview(
        createInitialFsrsCard(baseReviewedAt),
        'good',
        baseReviewedAt,
        options,
      ),
    ).toThrow(error)
  })

  it.each([
    [
      {
        ...createInitialFsrsCard(baseReviewedAt),
        state: 'review',
        lastReviewAt: null,
      },
      'Invalid FSRS card snapshot: "review" cards require lastReviewAt.',
    ],
    [
      {
        ...createInitialFsrsCard(baseReviewedAt),
        dueAt: new Date('invalid'),
      },
      'Invalid FSRS card snapshot: "dueAt" must be a valid Date.',
    ],
  ] as const)(
    'rejects malformed card snapshots at the adapter boundary',
    (card, error) => {
      expect(() => scheduleReview(card, 'good', baseReviewedAt)).toThrow(error)
    },
  )

  it('creates a CogniPace card snapshot and schedules a review', () => {
    const initialCard = createInitialFsrsCard(baseReviewedAt)
    const result = scheduleReview(initialCard, 'good', baseReviewedAt, {
      targetRetention: 0.85,
    })

    expect(initialCard.state).toBe('new')
    expect(result.card.reps).toBe(1)
    expect(result.card.dueAt.getTime()).toBeGreaterThan(
      baseReviewedAt.getTime(),
    )
  })

  it('calculates retrievability without exposing ts-fsrs enums', () => {
    const retrievability = getRetrievability(
      createReviewedCard(),
      new Date('2026-01-02T10:00:00.000Z'),
    )

    expect(retrievability).toBeGreaterThan(0)
    expect(retrievability).toBeLessThanOrEqual(1)
  })

  it('derives a positive target-crossing duration through the same FSRS curve', () => {
    const card = createReviewedCard()
    const duration = getTargetRetentionDuration(card, 0.9)

    expect(duration).not.toBeNull()
    expect(duration).toBeGreaterThan(0)
    expect(
      getRetrievability(
        card,
        new Date(card.lastReviewAt!.getTime() + duration! * 86_400_000),
      ),
    ).toBeCloseTo(0.9, 1)
  })

  it('rejects target durations that cannot be represented on the current FSRS curve', () => {
    const card = createReviewedCard()

    expect(getTargetRetentionDuration(card, 1)).toBeNull()
    expect(getTargetRetentionDuration(card, 0)).toBeNull()
  })

  it.each(reviewRatings)(
    'schedules %s reviews through the public rating API',
    (rating) => {
      const result = scheduleReview(
        createInitialFsrsCard(baseReviewedAt),
        rating,
        baseReviewedAt,
      )

      expect(result.rating).toBe(rating)
      expect(result.reviewedAt).toBe(baseReviewedAt)
      expect(result.card.reps).toBe(1)
      expect(result.card.lastReviewAt?.getTime()).toBe(baseReviewedAt.getTime())
      expect(Number.isFinite(result.card.difficulty)).toBe(true)
      expect(Number.isFinite(result.card.stability)).toBe(true)
    },
  )

  it('replays review history in chronological order', () => {
    const expectedCard = scheduleReview(
      createReviewedCard('again'),
      'easy',
      secondReviewedAt,
    ).card

    expect(replayReviewHistory(reviewHistory)).toEqual(expectedCard)
  })

  it('replays review history with review logs for replacement flows', () => {
    const replayedReviews = replayReviewHistorySequence(reviewHistory)

    expect(replayedReviews).toHaveLength(2)
    expect(replayedReviews.at(-1)?.log).toMatchObject({
      rating: 'easy',
      reviewedAt: secondReviewedAt.toISOString(),
    })
    expect(replayReviewHistory(replayedReviews)).toEqual(
      replayedReviews.at(-1)?.card,
    )
  })
})

function createReviewedCard(rating: ReviewRating = 'easy') {
  return scheduleReview(
    createInitialFsrsCard(baseReviewedAt),
    rating,
    baseReviewedAt,
  ).card
}

function hoursBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / hourMs
}

const baseReviewedAt = new Date('2026-01-01T10:00:00.000Z')
const secondReviewedAt = new Date('2026-01-03T10:00:00.000Z')
const reviewHistory = [
  { rating: 'easy', reviewedAt: secondReviewedAt },
  { rating: 'again', reviewedAt: baseReviewedAt },
] as const
const hourMs = 60 * 60 * 1000
