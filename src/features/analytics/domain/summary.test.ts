import { describe, expect, it } from 'vitest'

import type {
  ObservedRatingQualityResult,
  HistoricalReadiness,
} from './summary'
import type { AnalyticsReadiness } from './analytics-readiness'
import { buildAnalyticsTimeFrame } from './analytics-time'
import { buildObservedRatingQuality, buildAnalyticsSummary } from './summary'

const now = new Date(2026, 0, 15, 12, 0, 0)
const recentDate = new Date(2026, 0, 14, 12, 0, 0)
const oldDate = new Date(2025, 11, 14, 12, 0, 0) // > 30 days before now

describe('buildObservedRatingQuality', () => {
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
  it('includes independent 90-percent personal targets when historical views are omitted', () => {
    const result = buildAnalyticsSummary({
      generatedAt: now,
      timeFrame: buildAnalyticsTimeFrame({
        asOf: now,
        requestedDays: 30,
        timeZone: 'UTC',
      }),
      reviewDays: 0,
      totalReviews: 0,
      currentStreak: 0,
      observedRatingQuality: {
        value: null,
        label: '—',
        sampleSize: 0,
        lowSample: true,
      },
      range: 30,
      targetRetention: 0.8,
      historicalReadiness: createHistoricalReadiness(30),
    })

    expect(result.views.observedRecallVsFsrs.targetRecall).toBe(0.9)
    expect(result.views.practiceRhythm.targetReviewSuccess).toBe(0.9)
    expect(result.targetRetention).toBe(0.8)
    expect(result.views.retentionMap.targetRetention).toBe(0.8)
  })

  it('assembles all fields into the summary shape', () => {
    const generatedAt = new Date(2026, 0, 15, 12, 0, 0)
    const retention: ObservedRatingQualityResult = {
      value: 0.75,
      label: '75%',
      sampleSize: 20,
      lowSample: false,
    }
    const result = buildAnalyticsSummary({
      generatedAt,
      timeFrame: buildAnalyticsTimeFrame({
        asOf: generatedAt,
        requestedDays: 30,
        timeZone: 'UTC',
      }),
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
  })

  it('keeps selected-range evidence and metric readiness explicit in the summary', () => {
    const result = buildAnalyticsSummary({
      generatedAt: now,
      timeFrame: buildAnalyticsTimeFrame({
        asOf: now,
        requestedDays: 90,
        timeZone: 'UTC',
      }),
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
    recallQuality,
    practiceRhythm: { ...requested },
    ratingsMix: { ...requested },
    topics: { ...requested },
    stability: { ...requested },
    overdueBacklog: { ...requested },
    recommendedRange: 30,
  }
}
