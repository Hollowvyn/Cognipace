import { describe, expect, it } from 'vitest'

import { normalizeFsrsSchedulingOptions } from '@/lib/fsrs'

import type {
  ObservedRatingQualityResult,
  HistoricalReadiness,
} from './summary'
import type { AnalyticsReadiness } from './analytics-readiness'
import type { AnalyticsReviewEvent } from './chart-data'
import {
  buildAnalyticsTimeFrame,
  type AnalyticsTimeFrame,
} from './analytics-time'
import { buildHistoricalAnalyticsViews } from './historical-presentation'
import { buildAnalyticsBucketsFromTimeFrame } from './analytics-range-policy'
import {
  buildObservedRatingQuality,
  buildAnalyticsSummary,
  buildSelectedActivity,
} from './summary'

const now = new Date(2026, 0, 15, 12, 0, 0)
const recentDate = new Date(2026, 0, 14, 12, 0, 0)
const oldDate = new Date(2025, 11, 14, 12, 0, 0) // > 30 days before now

const activityOptions = {
  start: new Date('2026-03-07T05:00:00.000Z'),
  asOf: new Date('2026-03-08T05:30:00.000Z'),
  timeZone: 'America/New_York',
}
const emptyActivity = {
  assessmentDays: 0,
  recordedAssessments: 0,
  knownCorrectnessAssessments: 0,
  successfulAssessments: 0,
  distinctSuccessfulProblems: 0,
  observedCorrectness: null,
  timedSuccessfulAssessments: 0,
  untimedSuccessfulAssessments: 0,
  successfulRecordedSeconds: 0,
}

describe('buildSelectedActivity', () => {
  it('uses persisted correctness independently from Again, Easy, Good, and invalid ratings', () => {
    const result = buildSelectedActivity(
      [
        activityEvent({
          id: 'true-again',
          rating: 'again',
          isCorrect: true,
          elapsedSeconds: 60,
        }),
        activityEvent({
          id: 'false-easy',
          rating: 'easy',
          isCorrect: false,
          elapsedSeconds: 900,
        }),
        activityEvent({
          id: 'unknown-good',
          rating: 'good',
          isCorrect: null,
          elapsedSeconds: 900,
        }),
        activityEvent({
          id: 'true-invalid',
          problemSlug: 'other',
          rating: 'invalid',
          isCorrect: true,
          elapsedSeconds: 120,
        }),
      ],
      activityOptions,
    )

    expect(result).toEqual({
      assessmentDays: 1,
      recordedAssessments: 4,
      knownCorrectnessAssessments: 3,
      successfulAssessments: 2,
      distinctSuccessfulProblems: 2,
      observedCorrectness: 2 / 3,
      timedSuccessfulAssessments: 2,
      untimedSuccessfulAssessments: 0,
      successfulRecordedSeconds: 180,
    })
  })

  it('counts one solved question and every timed success for repeated successes', () => {
    expect(
      buildSelectedActivity(
        [
          activityEvent({ id: 'first', elapsedSeconds: 60 }),
          activityEvent({ id: 'repeat', elapsedSeconds: 120 }),
        ],
        activityOptions,
      ),
    ).toEqual({
      ...emptyActivity,
      assessmentDays: 1,
      recordedAssessments: 2,
      knownCorrectnessAssessments: 2,
      successfulAssessments: 2,
      distinctSuccessfulProblems: 1,
      observedCorrectness: 1,
      timedSuccessfulAssessments: 2,
      successfulRecordedSeconds: 180,
    })
  })

  it('counts report-local dates across midnight and includes the exact start and as-of', () => {
    expect(
      buildSelectedActivity(
        [
          activityEvent({
            id: 'start',
            reviewedAt: activityOptions.start,
            isCorrect: null,
          }),
          activityEvent({
            id: 'before-midnight',
            reviewedAt: new Date('2026-03-08T04:59:59.999Z'),
            isCorrect: null,
          }),
          activityEvent({
            id: 'midnight',
            reviewedAt: new Date('2026-03-08T05:00:00.000Z'),
            isCorrect: null,
          }),
          activityEvent({
            id: 'as-of',
            reviewedAt: activityOptions.asOf,
            isCorrect: null,
          }),
          activityEvent({
            id: 'too-early',
            reviewedAt: new Date(activityOptions.start.getTime() - 1),
          }),
          activityEvent({
            id: 'future',
            reviewedAt: new Date(activityOptions.asOf.getTime() + 1),
          }),
          activityEvent({ id: 'invalid-date', reviewedAt: new Date(NaN) }),
        ],
        activityOptions,
      ),
    ).toMatchObject({
      assessmentDays: 2,
      recordedAssessments: 4,
      knownCorrectnessAssessments: 0,
      distinctSuccessfulProblems: null,
      successfulRecordedSeconds: null,
    })
  })

  it('deduplicates raw attempt IDs without removing distinct repeated successes', () => {
    const event = activityEvent({ id: 'duplicate', elapsedSeconds: 60 })
    expect(
      buildSelectedActivity(
        [
          event,
          { ...event, topicLabels: ['Different joined topic'] },
          activityEvent({ id: 'repeat', elapsedSeconds: 120 }),
        ],
        activityOptions,
      ),
    ).toMatchObject({
      assessmentDays: 1,
      recordedAssessments: 2,
      successfulAssessments: 2,
      distinctSuccessfulProblems: 1,
      successfulRecordedSeconds: 180,
    })
  })

  it.each([undefined, null, 0, -1, NaN, Infinity, -Infinity])(
    'keeps a successful record with duration %s untimed',
    (elapsedSeconds) => {
      expect(
        buildSelectedActivity(
          [activityEvent({ elapsedSeconds })],
          activityOptions,
        ),
      ).toMatchObject({
        successfulAssessments: 1,
        distinctSuccessfulProblems: 1,
        observedCorrectness: 1,
        timedSuccessfulAssessments: 0,
        untimedSuccessfulAssessments: 1,
        successfulRecordedSeconds: null,
      })
    },
  )

  it('preserves exact positive recorded seconds and partial timing coverage', () => {
    expect(
      buildSelectedActivity(
        [
          activityEvent({ id: 'timed', elapsedSeconds: 60.125 }),
          activityEvent({ id: 'untimed', elapsedSeconds: null }),
          activityEvent({
            id: 'unknown',
            isCorrect: null,
            elapsedSeconds: 500,
          }),
        ],
        activityOptions,
      ),
    ).toMatchObject({
      recordedAssessments: 3,
      knownCorrectnessAssessments: 2,
      successfulAssessments: 2,
      distinctSuccessfulProblems: 1,
      observedCorrectness: 1,
      timedSuccessfulAssessments: 1,
      untimedSuccessfulAssessments: 1,
      successfulRecordedSeconds: 60.125,
    })
  })

  it('returns honest zero totals and unavailable correctness for an empty cohort', () => {
    expect(buildSelectedActivity([], activityOptions)).toEqual(emptyActivity)
  })

  it('returns known zero solved and successful time for recorded failures', () => {
    expect(
      buildSelectedActivity(
        [
          activityEvent({
            isCorrect: false,
            rating: 'easy',
            elapsedSeconds: 300,
          }),
        ],
        activityOptions,
      ),
    ).toEqual({
      ...emptyActivity,
      assessmentDays: 1,
      recordedAssessments: 1,
      knownCorrectnessAssessments: 1,
      observedCorrectness: 0,
    })
  })

  it('does not imply known solved or time totals from wholly unknown correctness', () => {
    expect(
      buildSelectedActivity(
        [activityEvent({ isCorrect: null, elapsedSeconds: 300 })],
        activityOptions,
      ),
    ).toEqual({
      ...emptyActivity,
      assessmentDays: 1,
      recordedAssessments: 1,
      distinctSuccessfulProblems: null,
      successfulRecordedSeconds: null,
    })
  })

  it('excludes unknown correctness from a known failure denominator', () => {
    expect(
      buildSelectedActivity(
        [
          activityEvent({ id: 'false', isCorrect: false }),
          activityEvent({ id: 'unknown', isCorrect: null }),
        ],
        activityOptions,
      ),
    ).toMatchObject({
      recordedAssessments: 2,
      knownCorrectnessAssessments: 1,
      successfulAssessments: 0,
      distinctSuccessfulProblems: 0,
      observedCorrectness: 0,
      successfulRecordedSeconds: 0,
    })
  })
})

function activityEvent(
  overrides: Partial<AnalyticsReviewEvent> = {},
): AnalyticsReviewEvent {
  return {
    id: 'assessment',
    cardId: 'card',
    problemSlug: 'question',
    title: 'Question',
    topicLabels: [],
    reviewedAt: new Date('2026-03-07T12:00:00.000Z'),
    rating: 'good',
    isCorrect: true,
    elapsedSeconds: null,
    fsrsReviewLog: null,
    ...overrides,
  }
}

describe('buildObservedRatingQuality', () => {
  it('includes retained pre-epoch ratings in All time when no explicit period is supplied', () => {
    const attempts = Array.from({ length: 10 }, () => ({
      rating: 'good',
      reviewedAt: new Date('1960-01-01T12:00:00Z'),
    }))
    expect(buildObservedRatingQuality(attempts, now, 'all')).toMatchObject({
      sampleSize: 10,
      value: 1,
      lowSample: false,
    })
  })

  it('returns lowSample when fewer than 10 ratings in the 30-day window', () => {
    const attempts = Array.from({ length: 9 }, () => ({
      rating: 'good',
      reviewedAt: recentDate,
    }))

    const result = buildObservedRatingQuality(attempts, now, 30)

    expect(result.lowSample).toBe(true)
    expect(result.value).toBeNull()
    expect(result.label).toBe('—')
    expect(result.sampleSize).toBe(9)
  })

  it('returns correct percentage for sufficient sample', () => {
    const attempts = [
      ...Array.from({ length: 7 }, () => ({
        rating: 'good',
        reviewedAt: recentDate,
      })),
      ...Array.from({ length: 3 }, () => ({
        rating: 'again',
        reviewedAt: recentDate,
      })),
    ]

    const result = buildObservedRatingQuality(attempts, now, 30)

    expect(result.lowSample).toBe(false)
    expect(result.value).toBeCloseTo(0.7)
    expect(result.label).toBe('70%')
    expect(result.sampleSize).toBe(10)
  })

  it('excludes invalid persisted ratings from the observed rating sample', () => {
    const attempts = [
      ...Array.from({ length: 10 }, () => ({
        rating: 'good',
        reviewedAt: recentDate,
      })),
      ...Array.from({ length: 10 }, () => ({
        rating: 'unexpected-rating',
        reviewedAt: recentDate,
      })),
    ]

    const result = buildObservedRatingQuality(attempts, now, 30)

    expect(result).toMatchObject({
      value: 1,
      sampleSize: 10,
      lowSample: false,
    })
  })

  it('counts good and easy as positive; again and hard as not positive', () => {
    const attempts = [
      { rating: 'good', reviewedAt: recentDate },
      { rating: 'easy', reviewedAt: recentDate },
      { rating: 'again', reviewedAt: recentDate },
      { rating: 'hard', reviewedAt: recentDate },
      ...Array.from({ length: 6 }, () => ({
        rating: 'good',
        reviewedAt: recentDate,
      })),
    ]

    const result = buildObservedRatingQuality(attempts, now, 30)

    expect(result.value).toBeCloseTo(0.8)
    expect(result.label).toBe('80%')
  })

  it('excludes ratings older than 30 days', () => {
    const attempts = Array.from({ length: 10 }, () => ({
      rating: 'good',
      reviewedAt: oldDate,
    }))

    const result = buildObservedRatingQuality(attempts, now, 30)

    expect(result.lowSample).toBe(true)
    expect(result.sampleSize).toBe(0)
  })

  it('boundary: exactly 10 ratings in window is not lowSample', () => {
    const attempts = Array.from({ length: 10 }, () => ({
      rating: 'good',
      reviewedAt: recentDate,
    }))

    const result = buildObservedRatingQuality(attempts, now, 30)

    expect(result.lowSample).toBe(false)
  })

  it('includes a rating at the period end and excludes one just after it', () => {
    const atEnd = Array.from({ length: 10 }, () => ({
      rating: 'good',
      reviewedAt: now,
    }))
    const justAfterEnd = {
      rating: 'again',
      reviewedAt: new Date(now.getTime() + 1),
    }

    const result = buildObservedRatingQuality([...atEnd, justAfterEnd], now, 30)

    expect(result.sampleSize).toBe(10)
    expect(result.value).toBe(1)
    expect(result.lowSample).toBe(false)
  })

  it.each([14, 30, 90] as const)(
    'uses the selected %s-day boundary',
    (range) => {
      const inside = new Date(now.getTime() - range * 24 * 60 * 60 * 1000)
      const outside = new Date(
        now.getTime() - (range + 1) * 24 * 60 * 60 * 1000,
      )
      expect(
        buildObservedRatingQuality(
          Array.from({ length: 10 }, () => ({
            rating: 'good',
            reviewedAt: inside,
          })),
          now,
          range,
        ).sampleSize,
      ).toBe(10)
      expect(
        buildObservedRatingQuality(
          [{ rating: 'good', reviewedAt: outside }],
          now,
          range,
        ).sampleSize,
      ).toBe(0)
    },
  )

  it('uses canonical local frame bounds across a DST midnight', () => {
    const asOf = new Date('2026-03-08T05:30:00.000Z')
    const frame = buildAnalyticsTimeFrame({
      asOf,
      requestedDays: 14,
      timeZone: 'America/New_York',
    })
    const result = buildObservedRatingQuality(
      Array.from({ length: 10 }, () => ({
        rating: 'good',
        reviewedAt: new Date('2026-02-22T18:00:00.000Z'),
      })),
      asOf,
      14,
      {
        periodStart: new Date(frame.periodStart),
        periodEnd: new Date(frame.periodEnd),
      },
    )

    expect(result.sampleSize).toBe(0)
    expect(result.lowSample).toBe(true)
  })
})

describe('buildAnalyticsSummary', () => {
  it('assembles all fields into the summary shape', () => {
    const generatedAt = new Date(2026, 0, 15, 12, 0, 0)
    const retention: ObservedRatingQualityResult = {
      value: 0.75,
      label: '75%',
      sampleSize: 20,
      lowSample: false,
    }
    const timeFrame = buildAnalyticsTimeFrame({
      asOf: generatedAt,
      requestedDays: 30,
      timeZone: 'UTC',
    })
    const views = createHistoricalViews(timeFrame)
    const result = buildAnalyticsSummary({
      generatedAt,
      timeFrame,
      activity: emptyActivity,
      views,
      reviewDays: 10,
      totalReviews: 42,
      currentStreak: 3,
      observedRatingQuality: retention,
      range: 30,
      targetRetention: 0.9,
      historicalReadiness: createHistoricalReadiness(30),
    })

    expect(result.generatedAt).toBe(generatedAt.toISOString())
    expect(result.reviewDays).toBe(10)
    expect(result.totalReviews).toBe(42)
    expect(result.currentStreak).toBe(3)
    expect(result.observedRatingQuality).toBe(0.75)
    expect(result.observedRatingQualityLabel).toBe('75%')
    expect(result.observedRatingSampleSize).toBe(20)
    expect(result.lowSample).toBe(false)
    expect(result.targetRetention).toBe(0.9)
    expect(result.views).toBe(views)
    expect(result.activity).toBe(emptyActivity)
  })

  it('keeps selected-range evidence and metric readiness explicit in the summary', () => {
    const timeFrame = buildAnalyticsTimeFrame({
      asOf: now,
      requestedDays: 90,
      timeZone: 'UTC',
    })
    const result = buildAnalyticsSummary({
      generatedAt: now,
      timeFrame,
      activity: emptyActivity,
      views: createHistoricalViews(timeFrame),
      reviewDays: 0,
      totalReviews: 0,
      currentStreak: 0,
      observedRatingQuality: {
        value: null,
        label: '—',
        sampleSize: 0,
        lowSample: true,
      },
      range: 90,
      targetRetention: 0.9,
      historicalReadiness: createDetailedHistoricalReadiness(),
    })

    expect(
      (result as { historicalReadiness?: unknown }).historicalReadiness,
    ).toMatchObject({
      requested: { requestedDays: 90 },
      recallQuality: { ready: true },
      recommendedRange: 30,
    })
  })
})

function createHistoricalViews(timeFrame: AnalyticsTimeFrame) {
  return buildHistoricalAnalyticsViews([], {
    buckets: buildAnalyticsBucketsFromTimeFrame(timeFrame),
    start: new Date(timeFrame.periodStart),
    end: new Date(timeFrame.asOf),
    timeZone: timeFrame.timeZone,
    timeFrame,
    fsrsOptions: normalizeFsrsSchedulingOptions(),
  })
}

function createHistoricalReadiness(
  requestedDays: 14 | 30 | 90,
): HistoricalReadiness {
  const bucketDays = requestedDays === 14 ? 1 : requestedDays === 30 ? 3 : 7
  const requestedBuckets =
    requestedDays === 14 ? 14 : requestedDays === 30 ? 10 : 13
  const readiness: AnalyticsReadiness = {
    ready: false,
    requestedDays,
    bucketDays,
    requestedBuckets,
    effectiveBuckets: 0,
    effectiveStart: null,
    assessments: 0,
    minimumAssessments: 12,
    activeBuckets: 0,
    minimumActiveBuckets: 0,
    longestGap: 0,
    maximumGap: 2,
    gapRuns: 0,
    maximumGapRuns: 1,
    failingReasons: [
      'no-evidence',
      'insufficient-span',
      'insufficient-assessments',
      'insufficient-active-buckets',
    ],
  }

  return {
    requested: readiness,
    firstAttemptOutcomes: readiness,
    recallQuality: readiness,
    practiceRhythm: readiness,
    ratingsMix: readiness,
    topics: readiness,
    stability: readiness,
    overdueBacklog: readiness,
    recommendedRange: null,
  }
}

function createDetailedHistoricalReadiness(): HistoricalReadiness {
  const requested: AnalyticsReadiness = {
    ready: false,
    requestedDays: 90,
    bucketDays: 7,
    requestedBuckets: 13,
    effectiveBuckets: 8,
    effectiveStart: '2026-06-22',
    assessments: 32,
    minimumAssessments: 45,
    activeBuckets: 6,
    minimumActiveBuckets: 7,
    longestGap: 2,
    maximumGap: 2,
    gapRuns: 2,
    maximumGapRuns: 2,
    failingReasons: ['insufficient-assessments'],
  }
  const recallQuality: AnalyticsReadiness = {
    ...requested,
    ready: true,
    assessments: 48,
    activeBuckets: 7,
    longestGap: 1,
    gapRuns: 1,
    failingReasons: [],
  }

  return {
    requested,
    firstAttemptOutcomes: { ...requested },
    recallQuality,
    practiceRhythm: { ...requested },
    ratingsMix: { ...requested },
    topics: { ...requested },
    stability: { ...requested },
    overdueBacklog: { ...requested },
    recommendedRange: 30,
  }
}
