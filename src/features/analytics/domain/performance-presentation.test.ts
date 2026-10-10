import { describe, expect, it } from 'vitest'
import { normalizeFsrsSchedulingOptions } from '@/lib/fsrs'

import { buildAnalyticsTimeFrame } from './analytics-time'
import {
  buildHistoricalAnalyticsViews,
  type HistoricalAnalyticsReviewEvent,
  type ProblemSolvingCohortView,
} from './historical-presentation'
import {
  aggregatePerformance,
  buildPerformancePresentation,
  performanceDifficultyInfluence,
  performanceRatingPoints,
  type PerformanceCountMatrix,
} from './performance-presentation'

const emptyRatings = { again: 0, hard: 0, good: 0, easy: 0 }
const sample: PerformanceCountMatrix = {
  easy: { again: 1, hard: 1, good: 15, easy: 8 },
  medium: { again: 5, hard: 10, good: 30, easy: 10 },
  hard: { again: 5, hard: 4, good: 9, easy: 2 },
  unknown: emptyRatings,
}

function matrix(
  overrides: Partial<PerformanceCountMatrix> = {},
): PerformanceCountMatrix {
  return {
    easy: emptyRatings,
    medium: emptyRatings,
    hard: emptyRatings,
    unknown: emptyRatings,
    ...overrides,
  }
}

function event(
  id: string,
  rating: string,
  day = 2,
  overrides: Partial<HistoricalAnalyticsReviewEvent> = {},
): HistoricalAnalyticsReviewEvent {
  return {
    id,
    cardId: id,
    problemSlug: id,
    rating,
    reviewedAt: new Date(`2026-08-0${day}T12:00:00Z`),
    fsrsReviewLog: null,
    topicLabels: [],
    problemDifficulty: 'easy',
    ...overrides,
  }
}

function cohorts(events: HistoricalAnalyticsReviewEvent[]) {
  const timeFrame = buildAnalyticsTimeFrame({
    asOf: new Date('2026-08-05T23:59:59.999Z'),
    requestedDays: 30,
    timeZone: 'UTC',
  })
  const buckets = Array.from({ length: 5 }, (_, index) => {
    const date = `2026-08-0${index + 1}`
    return {
      key: date,
      label: date,
      start: new Date(`${date}T00:00:00Z`),
      end: new Date(`${date}T23:59:59.999Z`),
    }
  })
  return buildHistoricalAnalyticsViews(events, {
    start: new Date('2026-08-01T00:00:00Z'),
    end: new Date(timeFrame.asOf),
    timeFrame,
    timeZone: 'UTC',
    buckets,
    fsrsOptions: normalizeFsrsSchedulingOptions({ targetRetention: 0.9 }),
  }).problemSolving.cohorts
}

function repeated(rating: string, count: number): ProblemSolvingCohortView {
  return cohorts(
    Array.from({ length: count }, (_, index) => event(`${index}`, rating)),
  ).newProblems
}

describe('aggregatePerformance', () => {
  it('exposes the approved rating rubric and difficulty influences', () => {
    expect(performanceRatingPoints).toEqual({
      again: 0,
      hard: 50,
      good: 80,
      easy: 100,
    })
    expect(performanceDifficultyInfluence).toEqual({
      easy: 1,
      medium: 2,
      hard: 3,
      unknown: 1,
    })
  })

  it('conserves the approved sample denominator and unrounded score', () => {
    expect(aggregatePerformance(sample)).toEqual({
      score: 13210 / 195,
      weightedPoints: 13210,
      weightedUnits: 195,
      validRatings: 100,
      unclassifiedRatings: 0,
    })
  })

  it.each([
    ['again', 0],
    ['hard', 50],
    ['good', 80],
    ['easy', 100],
  ] as const)(
    'keeps all %s at %s regardless of difficulty mix',
    (rating, score) => {
      const counts = { ...emptyRatings, [rating]: 7 }
      expect(
        aggregatePerformance({
          easy: counts,
          medium: counts,
          hard: counts,
          unknown: counts,
        }),
      ).toMatchObject({
        score,
        validRatings: 28,
        weightedUnits: 49,
        unclassifiedRatings: 7,
      })
    },
  )

  it('distinguishes an empty population from measured zero', () => {
    expect(aggregatePerformance(matrix())).toEqual({
      score: null,
      weightedPoints: 0,
      weightedUnits: 0,
      validRatings: 0,
      unclassifiedRatings: 0,
    })
    expect(
      aggregatePerformance(matrix({ hard: { ...emptyRatings, again: 2 } }))
        .score,
    ).toBe(0)
  })

  it('includes Unknown with baseline influence without classifying it as Easy', () => {
    expect(
      aggregatePerformance(
        matrix({
          hard: { ...emptyRatings, again: 1 },
          unknown: { ...emptyRatings, easy: 2 },
        }),
      ),
    ).toEqual({
      score: 40,
      weightedPoints: 200,
      weightedUnits: 5,
      validRatings: 3,
      unclassifiedRatings: 2,
    })
  })
})

describe('buildPerformancePresentation', () => {
  it('keeps leading invalid evidence unavailable and holds actual cumulative zero', () => {
    const cohort = cohorts([
      event('invalid', 'invalid', 1),
      event('zero', 'again', 2, { problemDifficulty: 'hard' }),
      event('invalid-later', 'invalid', 4),
    ]).newProblems
    const before = structuredClone(cohort)
    const model = buildPerformancePresentation(cohort)

    expect(model.rows.map((row) => row.state)).toEqual([
      'unavailable',
      'updated',
      'held',
      'held',
      'held',
    ])
    expect(model.rows[0]).toMatchObject({
      cumulativeStats: { score: null },
      lastUpdatedInterval: null,
    })
    expect(model.rows[1]).toMatchObject({
      cumulativeStats: { score: 0, validRatings: 1, weightedUnits: 3 },
    })
    expect(model.rows[4]).toMatchObject({
      cumulativeStats: { score: 0, validRatings: 1, weightedUnits: 3 },
      intervalStats: { score: null, validRatings: 0 },
      lastUpdatedInterval: {
        id: cohort.rows[1]!.id,
        bucketStart: cohort.rows[1]!.bucketStart,
        bucketEnd: cohort.rows[1]!.bucketEnd,
      },
    })
    expect(model.totals).toMatchObject({
      recordedAssessments: 3,
      excludedInvalidRatings: 2,
      validRatings: 1,
      score: 0,
    })
    model.rows.forEach((row, index) =>
      expect(row).toMatchObject(cohort.rows[index]!),
    )
    expect(cohort).toEqual(before)
  })

  it('accumulates raw weights rather than averaging interval scores', () => {
    const cohort = cohorts([
      event('hard-failure', 'again', 1, { problemDifficulty: 'hard' }),
      ...Array.from({ length: 9 }, (_, index) =>
        event(`easy-${index}`, 'easy', 3),
      ),
      event('unknown', 'good', 4, { problemDifficulty: 'unknown' }),
    ]).newProblems
    const model = buildPerformancePresentation(cohort)

    expect(model.rows[2]).toMatchObject({
      intervalStats: { score: 100 },
      cumulativeStats: { score: 75, weightedUnits: 12, validRatings: 10 },
    })
    expect(model.rows.at(-1)!.cumulativeStats).toEqual(
      aggregatePerformance(cohort.totals.difficulties),
    )
    expect(model.totals.score).toBe(980 / 13)
    expect(model.totals.unclassifiedRatings).toBe(1)
  })

  it('preserves raw first/later eligibility and selected-range/as-of exclusions', () => {
    const source = cohorts([
      event('old', 'good', 1, {
        problemSlug: 'old-problem',
        reviewedAt: new Date('2026-07-31T12:00:00Z'),
      }),
      event('old-followup', 'easy', 2, { problemSlug: 'old-problem' }),
      event('first-invalid', 'invalid', 1, { problemSlug: 'invalid-problem' }),
      event('later-valid', 'hard', 3, { problemSlug: 'invalid-problem' }),
      event('future', 'easy', 6),
    ])
    const first = buildPerformancePresentation(source.newProblems)
    const later = buildPerformancePresentation(source.followupPractice)

    expect(first.totals).toMatchObject({
      recordedAssessments: 1,
      excludedInvalidRatings: 1,
      validRatings: 0,
      score: null,
    })
    expect(first.rows.every((row) => row.state === 'unavailable')).toBe(true)
    expect(later.totals).toMatchObject({
      recordedAssessments: 2,
      validRatings: 2,
      score: 75,
    })
    expect(later.rows.at(-1)!.cumulativeStats.score).toBe(75)
  })

  it('does not invent a comparison when a real prior period is absent', () => {
    const cohort = {
      ...repeated('good', 10),
      previous: repeated('easy', 10).totals,
    }
    expect(buildPerformancePresentation(cohort).comparison).toMatchObject({
      state: 'absent',
      previousStats: null,
      differencePoints: null,
    })
    expect(
      buildPerformancePresentation(cohort, { previousPeriod: null }).comparison
        .state,
    ).toBe('absent')
  })

  it.each([
    [9, 10],
    [10, 9],
  ])('keeps a %s/%s evidence comparison sparse', (current, prior) => {
    const cohort = {
      ...repeated('good', current),
      previous: repeated('easy', prior).totals,
    }
    expect(
      buildPerformancePresentation(cohort, {
        previousPeriod: {
          start: '2026-07-01T00:00:00Z',
          asOf: '2026-07-31T23:59:59Z',
        },
      }).comparison,
    ).toMatchObject({ state: 'sparse', differencePoints: null })
  })

  it('compares supported periods using unrounded score points', () => {
    const cohort = cohorts(
      (Object.keys(sample) as Array<keyof PerformanceCountMatrix>).flatMap(
        (difficulty) =>
          (
            Object.keys(sample[difficulty]) as Array<keyof typeof emptyRatings>
          ).flatMap((rating) =>
            Array.from({ length: sample[difficulty][rating] }, (_, index) =>
              event(`${difficulty}-${rating}-${index}`, rating, 2, {
                problemDifficulty: difficulty,
              }),
            ),
          ),
      ),
    ).newProblems
    cohort.previous = repeated('hard', 10).totals
    const comparison = buildPerformancePresentation(cohort, {
      previousPeriod: {
        start: '2026-07-01T00:00:00Z',
        asOf: '2026-07-31T23:59:59Z',
      },
    }).comparison
    expect(comparison.state).toBe('available')
    expect(comparison.differencePoints).toBe(13210 / 195 - 50)
  })
})
