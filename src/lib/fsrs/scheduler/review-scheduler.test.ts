import { describe, expect, it } from 'vitest'

import {
  createFsrsSchedulerProfile,
  createInitialFsrsCard,
  getTargetRetentionDuration,
  getRetrievability,
  projectReviewSchedule,
  previewReviewWithProfile,
  replayReviewHistory,
  replayReviewHistorySequence,
  scheduleReview,
  scheduleReviewWithProfile,
} from './review-scheduler'
import { assertFsrsReviewLogMatchesPreCard } from '../domain/review-log-snapshot'
import { reviewRatings, type ReviewRating } from '../domain/review-rating'
import type { FsrsCardSnapshot, FsrsCardState } from '../domain/card-snapshot'

describe('fsrs scheduler wrapper', () => {
  it.each([0.75, 0.9])(
    'matches native next for four ratings across daily card states at %s retention',
    (retention) => {
      const profile = createDailyProfile(retention)
      for (const state of [
        'new',
        'learning',
        'relearning',
        'review',
      ] as const) {
        const card = createDailyInputCard(state)
        const preview = previewReviewWithProfile(card, dailyReviewedAt, profile)
        for (const rating of reviewRatings) {
          const saved = scheduleReviewWithProfile(
            card,
            rating,
            dailyReviewedAt,
            profile,
          )
          expect(preview[rating]).toEqual({ card: saved.card, log: saved.log })
        }
      }
    },
  )

  it('preserves native 183-day ordering and older larger profile intervals', () => {
    const card = createDailyInputCard('review', 180)
    const boundary = createDailyProfile(0.000001)
    const preview = previewReviewWithProfile(card, dailyReviewedAt, boundary)
    expect(
      reviewRatings.map((rating) => preview[rating].card.scheduledDays),
    ).toEqual([180, 181, 182, 183])
    const olderProfile = createFsrsSchedulerProfile({
      targetRetention: 0.75,
      maximumInterval: 36_500,
      enableFuzz: false,
      enableShortTerm: true,
      learningSteps: ['12h', '23h'],
      relearningSteps: ['23h'],
    })
    const historical = previewReviewWithProfile(
      card,
      dailyReviewedAt,
      olderProfile,
    )
    for (const rating of reviewRatings) {
      const saved = scheduleReviewWithProfile(
        card,
        rating,
        dailyReviewedAt,
        olderProfile,
      )
      expect(historical[rating]).toEqual({ card: saved.card, log: saved.log })
    }
    expect(historical.easy.card.scheduledDays).toBeGreaterThan(183)
  })
  it.each([
    [0.75, 'new', [1, 7, 13, 46]],
    [0.75, 'learning', [1, 20, 32, 59]],
    [0.75, 'relearning', [4, 67, 106, 180]],
    [0.75, 'review', [31, 180, 181, 182]],
    [0.9, 'new', [1, 2, 3, 8]],
    [0.9, 'learning', [1, 4, 6, 11]],
    [0.9, 'relearning', [1, 12, 19, 34]],
    [0.9, 'review', [6, 180, 181, 182]],
    [0.7, 'new', [2, 12, 21, 77]],
    [0.7, 'learning', [2, 33, 53, 98]],
    [0.7, 'relearning', [7, 111, 176, 180]],
    [0.7, 'review', [52, 180, 181, 182]],
    [0.97, 'new', [1, 2, 3, 4]],
    [0.97, 'learning', [1, 2, 3, 4]],
    [0.97, 'relearning', [1, 3, 4, 8]],
    [0.97, 'review', [1, 123, 146, 180]],
  ] as const)(
    'preserves native daily outcomes at %s retention from %s',
    (targetRetention, state, expectedDays) => {
      const profile = createDailyProfile(targetRetention)
      const preCard = createDailyInputCard(state)

      reviewRatings.forEach((rating, index) => {
        const result = scheduleReview(
          preCard,
          rating,
          dailyReviewedAt,
          profile.parameters,
        )

        expect(result.card.state).toBe('review')
        expect(result.card.scheduledDays).toBe(expectedDays[index])
        expect(result.card.dueAt).toEqual(
          new Date(dailyReviewedAt.getTime() + expectedDays[index]! * dayMs),
        )
        expect(result.card.scheduledDays).toBeLessThanOrEqual(183)
        expect(result.log).toMatchObject({
          rating,
          state,
          reviewedAt: dailyReviewedAt.toISOString(),
        })
        expect(() =>
          assertFsrsReviewLogMatchesPreCard(result.log, preCard, profile),
        ).not.toThrow()
      })
    },
  )

  it.each([179, 180, 181, 365])(
    'keeps native 180-day ordering at %s elapsed days and validation extremes',
    (elapsedDays) => {
      const preCard = createDailyInputCard('review', elapsedDays)

      for (const [targetRetention, expectedDays] of [
        [0.000001, [180, 181, 182, 183]],
        [1, [1, 2, 3, 4]],
      ] as const) {
        const profile = createDailyProfile(targetRetention)

        reviewRatings.forEach((rating, index) => {
          const result = scheduleReview(
            preCard,
            rating,
            dailyReviewedAt,
            profile.parameters,
          )

          expect(result.card.scheduledDays).toBe(expectedDays[index])
          expect(result.card.dueAt).toEqual(
            new Date(dailyReviewedAt.getTime() + expectedDays[index]! * dayMs),
          )
          expect(result.card.scheduledDays).toBeLessThanOrEqual(183)
          expect(() =>
            assertFsrsReviewLogMatchesPreCard(result.log, preCard, profile),
          ).not.toThrow()
        })
      }
    },
  )

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

  it('projects future reviews from the stored due date', () => {
    const card = createReviewedCard()
    const projections = projectReviewSchedule(card, {
      startAt: new Date('2026-01-02T10:00:00.000Z'),
      horizonDays: 90,
      maxReviews: 5,
    })

    expect(projections.length).toBeGreaterThan(0)
    expect(projections.length).toBeLessThanOrEqual(5)
    expect(projections[0]?.reviewedAt).toEqual(card.dueAt)
    expect(projections[0]?.log).toMatchObject({
      rating: 'good',
      reviewedAt: card.dueAt.toISOString(),
    })
    expect(
      projections.every((projection, index) => {
        const previous = projections[index - 1]
        return (
          !previous ||
          projection.reviewedAt.getTime() > previous.reviewedAt.getTime()
        )
      }),
    ).toBe(true)
  })

  it('projects from start date when the card is already due', () => {
    const card = createReviewedCard()
    const startAt = new Date('2026-03-01T10:00:00.000Z')
    const [projection] = projectReviewSchedule(card, {
      startAt,
      maxReviews: 1,
    })

    expect(projection?.reviewedAt).toEqual(startAt)
  })

  it.each([
    [{ horizonDays: -1 }, 'Invalid FSRS projection horizon "-1".'],
    [{ maxReviews: 1.5 }, 'Invalid FSRS projection max reviews "1.5".'],
  ] as const)(
    'rejects invalid review projection limit $error',
    (options, error) => {
      expect(() =>
        projectReviewSchedule(createReviewedCard(), options),
      ).toThrow(error)
    },
  )
})

function createReviewedCard(rating: ReviewRating = 'easy') {
  return scheduleReview(
    createInitialFsrsCard(baseReviewedAt),
    rating,
    baseReviewedAt,
  ).card
}

function createDailyProfile(targetRetention: number) {
  return createFsrsSchedulerProfile({
    targetRetention,
    maximumInterval: 180,
    enableShortTerm: false,
    learningSteps: [],
    relearningSteps: [],
    enableFuzz: false,
  })
}

function createDailyInputCard(
  state: FsrsCardState,
  elapsedDays = 180,
): FsrsCardSnapshot {
  if (state === 'new') return createInitialFsrsCard(dailyReviewedAt)

  const first = createInitialFsrsCard(legacyReviewedAt)
  if (state === 'learning') {
    return scheduleReview(first, 'again', legacyReviewedAt).card
  }

  const review = scheduleReview(first, 'easy', legacyReviewedAt).card
  if (state === 'relearning') {
    return scheduleReview(review, 'again', review.dueAt).card
  }

  const lastReviewAt = new Date(dailyReviewedAt.getTime() - elapsedDays * dayMs)
  return {
    ...review,
    dueAt: new Date(lastReviewAt.getTime() + 180 * dayMs),
    stability: 400,
    difficulty: 5,
    scheduledDays: 180,
    reps: 10,
    lastReviewAt,
  }
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
const dayMs = 24 * hourMs
const legacyReviewedAt = new Date('2026-01-01T10:00:00.000Z')
const dailyReviewedAt = new Date('2026-07-01T10:00:00.000Z')
