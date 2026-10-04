import { describe, expect, it } from 'vitest'

import {
  analyticsChartPointFixtures,
  createSerializedAnalyticsSummary,
} from '@/testing/analytics-fixtures'

import {
  analyticsReadinessSchema,
  analyticsRangeSchema,
  analyticsSummaryRequestSchema,
  analyticsSummarySchema,
  hardAgainSummarySchema,
  practiceRhythmPointSchema,
  ratingsMixPointSchema,
  type AnalyticsReadiness,
  type SerializedAnalyticsSummary,
} from './analytics-contracts'

const readiness: AnalyticsReadiness = {
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

const readyReadiness: AnalyticsReadiness = {
  ...readiness,
  ready: true,
  failingReasons: [],
}

function withRequestedReadiness(
  requested: AnalyticsReadiness,
  recommendedRange: 14 | 30 | 90 | null,
) {
  return {
    requested,
    firstAttemptOutcomes: { ...readiness },
    recallQuality: readiness,
    practiceRhythm: readiness,
    ratingsMix: readiness,
    topics: readiness,
    stability: readiness,
    overdueBacklog: readiness,
    recommendedRange,
  }
}

const validSummary = createSerializedAnalyticsSummary({
  range: 30,
  generatedAt: '2026-01-15T12:00:00.000Z',
  timeFrame: {
    asOf: '2026-01-15T12:00:00.000Z',
    timeZone: 'America/New_York',
    timeZoneFallback: false,
    requestedDays: 30,
    periodStart: '2025-12-17T05:00:00.000Z',
    periodEnd: '2026-01-16T05:00:00.000Z',
    buckets: [
      {
        key: '2025-12-17',
        start: '2025-12-17T05:00:00.000Z',
        end: '2025-12-20T05:00:00.000Z',
        startKey: '2025-12-17',
        endKey: '2025-12-19',
        isPartial: false,
      },
    ],
  },
  reviewDays: 10,
  totalReviews: 42,
  currentStreak: 3,
  observedRatingQuality: {
    value: 0.75,
    sampleSize: 20,
    lowSample: false,
  },
  predictedRecall: {
    value: null,
    sampleSize: 0,
    lowSample: true,
  },
  observedRatingSampleSize: 20,
  lowSample: false,
  targetRetention: 0.9,
  views: {
    ...createSerializedAnalyticsSummary().views,
    upcomingReviewLoad: {
      rows: Array.from({ length: 14 }, (_, index) => ({
        date: `2026-01-${String(index + 1).padStart(2, '0')}`,
        dueCount: 0,
        overdueCount: 0,
        today: index === 0,
      })),
      scale: { domain: [0, 1], ticks: [0, 1] },
    },
  },
  historicalReadiness: withRequestedReadiness(readiness, null),
})

describe('problem-solving runtime contract', () => {
  it('requires and preserves the complete problem-solving view', () => {
    const summary = createSerializedAnalyticsSummary()
    expect(analyticsSummarySchema.parse(summary).views.problemSolving).toEqual(
      summary.views.problemSolving,
    )
    expect(
      analyticsSummarySchema.safeParse({
        ...summary,
        views: { ...summary.views, problemSolving: undefined },
      }).success,
    ).toBe(false)
  })

  it.each([
    'rate',
    'coverage',
    'quartiles',
    'median',
    'conservation',
    'finite',
    'eligibility',
    'goals',
    'negative',
    'unsupported',
  ] as const)('rejects inconsistent %s evidence', (field) => {
    const summary = createSerializedAnalyticsSummary()
    const { totals } = summary.views.problemSolving.cohorts.newProblems
    const easy = totals.difficulties.easy
    if (field === 'rate') easy.successRate = 0.5
    if (field === 'coverage') easy.time.all.timedAssessments = 1
    if (field === 'quartiles')
      Object.assign(easy.time.all, { q1Seconds: 1, q3Seconds: 2 })
    if (field === 'median') easy.time.all.medianSeconds = 1
    if (field === 'conservation')
      Object.assign(totals, {
        recordedAssessments: 1,
        excludedInvalidRatings: 1,
      })
    if (field === 'finite') easy.time.all.totalSeconds = Infinity
    if (field === 'eligibility') easy.time.successful.eligibleAssessments = 1
    if (field === 'goals')
      summary.views.problemSolving.targets.targetRecall = 0.8
    if (field === 'negative') easy.validRatings = -1
    if (field === 'unsupported') Object.assign(easy, { extra: true })
    expect(analyticsSummarySchema.safeParse(summary).success).toBe(false)
  })
})

function withoutSummaryField(field: keyof SerializedAnalyticsSummary) {
  const summary: Partial<SerializedAnalyticsSummary> = { ...validSummary }
  delete summary[field]
  return summary
}

it('accepts all qualifying topics while keeping low-evidence diagnostics bounded', () => {
  const row = {
    id: 'topic',
    topic: 'Topic',
    reviewSuccess: 0,
    goodEasy: 0,
    validRatings: 10,
    distinctProblems: 3,
    evidence: 'Measured' as const,
  }
  const topicPerformance = {
    ...validSummary.views.topicPerformance,
    rows: Array.from({ length: 6 }, (_, index) => ({
      ...row,
      id: `topic-${index}`,
    })),
  }
  expect(
    analyticsSummarySchema.safeParse({
      ...validSummary,
      views: { ...validSummary.views, topicPerformance },
    }).success,
  ).toBe(true)
  topicPerformance.lowEvidenceTopics = Array.from({ length: 6 }, () => ({
    topic: 'Sparse',
    validRatings: 1,
    distinctProblems: 1,
  }))
  expect(
    analyticsSummarySchema.safeParse({
      ...validSummary,
      views: { ...validSummary.views, topicPerformance },
    }).success,
  ).toBe(false)
})

describe('analyticsSummaryRequestSchema', () => {
  it('requires independent first-attempt readiness', () => {
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        historicalReadiness: {
          ...validSummary.historicalReadiness,
          firstAttemptOutcomes: undefined,
        },
      }).success,
    ).toBe(false)
  })

  it.each([1, 0.123])(
    'validates independent whole-percent goals %s',
    (target) => {
      const summary = createSerializedAnalyticsSummary()
      Object.assign(summary.views.problemSolving.targets, {
        targetFirstAttemptSuccess: 0,
        targetFirstAttemptGoodEasy: target,
      })
      expect(analyticsSummarySchema.safeParse(summary).success).toBe(
        target === 1,
      )
    },
  )

  it('requires the feature-owned Ratings Mix and Topic Performance presentation models', () => {
    expect(() =>
      analyticsSummarySchema.parse({
        ...validSummary,
        views: {
          ...validSummary.views,
          ratingsMix: undefined,
          topicPerformance: undefined,
        },
      }),
    ).toThrow()
  })

  it('requires the dashboard surface', () => {
    expect(() => analyticsSummaryRequestSchema.parse({})).toThrow()
    expect(
      analyticsSummaryRequestSchema.parse({
        surface: 'dashboard',
        range: 30,
        timeZone: 'America/New_York',
      }),
    ).toEqual({
      surface: 'dashboard',
      range: 30,
      timeZone: 'America/New_York',
    })
  })

  it.each([14, 30, 90] as const)('accepts range %s', (range) => {
    expect(
      analyticsSummaryRequestSchema.parse({
        surface: 'dashboard',
        range,
        timeZone: 'UTC',
      }),
    ).toEqual({
      surface: 'dashboard',
      range,
      timeZone: 'UTC',
    })
  })

  it.each([undefined, 7, '30'])('rejects invalid range %s', (range) => {
    expect(
      analyticsSummaryRequestSchema.safeParse({
        surface: 'dashboard',
        range,
        timeZone: 'UTC',
      }).success,
    ).toBe(false)
  })

  it.each([undefined, '', 42])('rejects an invalid timezone %s', (timeZone) => {
    expect(
      analyticsSummaryRequestSchema.safeParse({
        surface: 'dashboard',
        range: 30,
        timeZone,
      }).success,
    ).toBe(false)
  })

  it('accepts optional ISO at', () => {
    expect(
      analyticsSummaryRequestSchema.parse({
        surface: 'dashboard',
        range: 30,
        timeZone: 'America/New_York',
        at: '2026-01-15T12:00:00.000Z',
      }),
    ).toEqual({
      surface: 'dashboard',
      range: 30,
      timeZone: 'America/New_York',
      at: '2026-01-15T12:00:00.000Z',
    })
  })
})

describe('analyticsSummarySchema', () => {
  it('serializes the personal chart targets separately from scheduling retention', () => {
    const summary = createSerializedAnalyticsSummary({
      ...validSummary,
      targetRetention: 0.8,
      views: {
        ...validSummary.views,
        observedRecallVsFsrs: {
          ...validSummary.views.observedRecallVsFsrs,
          targetRecall: 0.75,
        },
        practiceRhythm: {
          ...validSummary.views.practiceRhythm,
          targetReviewSuccess: 0.95,
        },
      },
    })

    expect(analyticsSummarySchema.parse(summary)).toMatchObject({
      targetRetention: 0.8,
      views: {
        observedRecallVsFsrs: { targetRecall: 0.75 },
        practiceRhythm: { targetReviewSuccess: 0.95 },
      },
    })
  })

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid personal chart fraction %s',
    (target) => {
      for (const view of ['observedRecallVsFsrs', 'practiceRhythm'] as const) {
        const targetField =
          view === 'observedRecallVsFsrs'
            ? 'targetRecall'
            : 'targetReviewSuccess'
        expect(
          analyticsSummarySchema.safeParse({
            ...validSummary,
            views: {
              ...validSummary.views,
              [view]: { ...validSummary.views[view], [targetField]: target },
            },
          }).success,
        ).toBe(false)
      }
    },
  )

  it('rejects personal Review Success targets below Recall targets', () => {
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        views: {
          ...validSummary.views,
          observedRecallVsFsrs: {
            ...validSummary.views.observedRecallVsFsrs,
            targetRecall: 0.95,
          },
          practiceRhythm: {
            ...validSummary.views.practiceRhythm,
            targetReviewSuccess: 0.9,
          },
        },
      }).success,
    ).toBe(false)
  })

  it('requires the Phase 2 historical view presentation models', () => {
    expect(analyticsSummarySchema.safeParse(validSummary).success).toBe(true)
    expect(
      analyticsSummarySchema.safeParse(withoutSummaryField('views')).success,
    ).toBe(false)
  })

  it('requires explicit local-time metadata and preserves partial bucket state', () => {
    expect(analyticsSummarySchema.safeParse(validSummary).success).toBe(true)
    expect(
      analyticsSummarySchema.safeParse(withoutSummaryField('timeFrame'))
        .success,
    ).toBe(false)
    expect(analyticsSummarySchema.parse(validSummary).timeFrame).toEqual(
      validSummary.timeFrame,
    )
  })

  it('rejects a summary whose range differs from its time-frame requested days', () => {
    const result = analyticsSummarySchema.safeParse({
      ...validSummary,
      range: 30,
      timeFrame: {
        ...validSummary.timeFrame,
        requestedDays: 14,
      },
    })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['timeFrame', 'requestedDays'],
          }),
        ]),
      )
  })

  it('serializes a summary without duplicate presentation metadata', () => {
    expect(
      analyticsSummarySchema.safeParse(withoutSummaryField('generatedAt'))
        .success,
    ).toBe(false)
    expect(analyticsSummarySchema.safeParse(validSummary).success).toBe(true)
  })

  it('serializes evidence readiness for the requested range and each historical metric', () => {
    expect(analyticsReadinessSchema.parse(readiness)).toEqual(readiness)

    const parsed = analyticsSummarySchema.parse({
      ...validSummary,
      historicalReadiness: withRequestedReadiness(readiness, 30),
    }) as { historicalReadiness?: unknown }

    expect(parsed.historicalReadiness).toEqual({
      requested: readiness,
      firstAttemptOutcomes: readiness,
      recallQuality: readiness,
      practiceRhythm: readiness,
      ratingsMix: readiness,
      topics: readiness,
      stability: readiness,
      overdueBacklog: readiness,
      recommendedRange: 30,
    })
  })

  it('accepts a valid full summary', () => {
    expect(analyticsSummarySchema.safeParse(validSummary).success).toBe(true)
  })

  it('accepts the complete Retention Map cohort and ranks above 30', () => {
    const retentionMap = {
      ...validSummary.views.retentionMap,
      rows: Array.from({ length: 31 }, (_, index) => ({
        rank: index + 1,
        slug: `risk-${index}`,
        title: `Risk ${index}`,
        retrievability: 0.7,
        targetRetention: 0.9,
        targetGap: -0.2,
        targetDurationDays: index + 7,
        lastReviewedAt: validSummary.generatedAt,
        dueAt: validSummary.generatedAt,
        difficulty: 5,
        lapseCount: 0,
        status: 'needs-attention' as const,
        region: 'needs-attention' as const,
      })),
      totalEligible: 31,
      statusCounts: { onTarget: 0, watch: 0, needsAttention: 31 },
    }
    expect(
      analyticsSummarySchema.parse({
        ...validSummary,
        views: { ...validSummary.views, retentionMap },
      }).views.retentionMap,
    ).toEqual(retentionMap)
  })

  it('rejects a fallback recommendation when the requested range is ready', () => {
    const result = analyticsSummarySchema.safeParse({
      ...validSummary,
      historicalReadiness: withRequestedReadiness(readyReadiness, 14),
    })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['historicalReadiness', 'recommendedRange'],
          }),
        ]),
      )
  })

  it('serializes an unready historical selection with feature-owned current and workload views', () => {
    const parsed = analyticsSummarySchema.parse({
      ...validSummary,
      range: 90,
      timeFrame: {
        ...validSummary.timeFrame,
        requestedDays: 90,
      },
      historicalReadiness: {
        ...validSummary.historicalReadiness,
        requested: {
          ...readiness,
          requestedDays: 90,
          ready: false,
        },
      },
    })

    expect(parsed.range).toBe(90)
    expect(parsed.historicalReadiness.requested.ready).toBe(false)
    expect(parsed.views.upcomingReviewLoad.rows).toHaveLength(14)
  })

  it('keeps the fixed workload forecast anchored at today and overdue only today', () => {
    const rows = validSummary.views.upcomingReviewLoad.rows
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        views: {
          ...validSummary.views,
          upcomingReviewLoad: {
            ...validSummary.views.upcomingReviewLoad,
            rows: rows.map((row, index) => ({
              ...row,
              overdueCount: index === 1 ? 1 : row.overdueCount,
            })),
          },
        },
      }).success,
    ).toBe(false)
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        views: {
          ...validSummary.views,
          upcomingReviewLoad: {
            ...validSummary.views.upcomingReviewLoad,
            rows: rows.map((row, index) => ({
              ...row,
              today: index === 1,
            })),
          },
        },
      }).success,
    ).toBe(false)
  })

  it('rejects negative integer counts', () => {
    expect(
      analyticsSummarySchema.safeParse({ ...validSummary, reviewDays: -1 })
        .success,
    ).toBe(false)
    expect(
      analyticsSummarySchema.safeParse({ ...validSummary, totalReviews: -1 })
        .success,
    ).toBe(false)
    expect(
      analyticsSummarySchema.safeParse({ ...validSummary, currentStreak: -1 })
        .success,
    ).toBe(false)
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        observedRatingSampleSize: -1,
      }).success,
    ).toBe(false)
  })

  it('accepts chart payloads without duplicate period metadata', () => {
    const chartReadySummary = {
      ...validSummary,
      historicalReadiness: withRequestedReadiness(readyReadiness, null),
      recallQuality: [
        {
          bucketStart: '2026-01-15',
          bucketEnd: '2026-01-15',
          observedRecall: 0.75,
          predictedRecall: null,
          targetRetention: 0.9,
          reviewCount: 2,
          eligibleSampleSize: 2,
        },
      ],
      ...analyticsChartPointFixtures,
    }

    expect(analyticsSummarySchema.parse(chartReadySummary)).toMatchObject({
      range: 30,
      recallQuality: chartReadySummary.recallQuality,
      practiceRhythm: chartReadySummary.practiceRhythm,
      ratingsMix: chartReadySummary.ratingsMix,
    })
  })

  it('permits sparse summaries without hiding measured chart values', () => {
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        predictedRecall: { value: null, sampleSize: 1, lowSample: true },
      }).success,
    ).toBe(true)
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        recallQuality: [
          {
            bucketStart: '2026-01-15',
            bucketEnd: '2026-01-15',
            observedRecall: 0.75,
            predictedRecall: null,
            targetRetention: 0.9,
            reviewCount: 2,
            eligibleSampleSize: 2,
          },
        ],
      }).success,
    ).toBe(true)
  })

  it('keeps low-sample metric values null instead of coercing them to zero', () => {
    expect(validSummary.predictedRecall.value).toBeNull()
    expect(analyticsSummarySchema.parse(validSummary).predictedRecall).toEqual({
      value: null,
      sampleSize: 0,
      lowSample: true,
    })
  })

  it.each([
    { value: 0.8, sampleSize: 20, lowSample: true },
    { value: null, sampleSize: 20, lowSample: false },
  ])('rejects invalid nullable metric combinations: %j', (metric) => {
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        observedRatingQuality: metric,
      }).success,
    ).toBe(false)
  })

  it('accepts a valid null low-sample metric', () => {
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        observedRatingQuality: { value: null, sampleSize: 7, lowSample: true },
        observedRatingSampleSize: 7,
        lowSample: true,
      }).success,
    ).toBe(true)
  })

  it('rejects percentages outside 0..1 and negative chart counts', () => {
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        observedRatingQuality: {
          ...validSummary.observedRatingQuality,
          value: 1.01,
        },
      }).success,
    ).toBe(false)
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        ratingsMix: [{ ...validSummary.ratingsMix[0], again: -1 }],
      }).success,
    ).toBe(false)
  })
})

describe('hardAgainSummarySchema', () => {
  it('preserves valid period comparison semantics', () => {
    expect(
      hardAgainSummarySchema.parse({
        selectedShare: 0.18,
        previousShare: 0.27,
        delta: -0.09,
        direction: 'down',
        sampleSize: 50,
        previousSampleSize: 48,
        lowSample: false,
        previousLowSample: false,
      }),
    ).toMatchObject({ direction: 'down', sampleSize: 50 })
  })
})

describe('analyticsRangeSchema', () => {
  it('accepts only the supported numeric ranges', () => {
    expect(
      [14, 30, 90].every(
        (range) => analyticsRangeSchema.safeParse(range).success,
      ),
    ).toBe(true)
  })
})

describe('analyticsSummarySchema', () => {
  it('rejects a summary missing targetRetention', () => {
    const withoutField = withoutSummaryField('targetRetention')
    expect(analyticsSummarySchema.safeParse(withoutField).success).toBe(false)
  })

  it('rejects targetRetention outside 0–1', () => {
    expect(
      analyticsSummarySchema.safeParse({
        ...validSummary,
        targetRetention: 1.5,
      }).success,
    ).toBe(false)
  })
})

describe('chart point contracts', () => {
  it('preserves association semantics and Hard + Again share during serialization', () => {
    expect(
      practiceRhythmPointSchema.parse({
        bucketStart: '2026-01-12',
        bucketEnd: '2026-01-18',
        reviewCount: 3,
        observedCorrectness: 0.75,
        sampleSize: 4,
        associationOnly: true,
      }),
    ).toMatchObject({ associationOnly: true })
    expect(
      ratingsMixPointSchema.parse({
        bucketStart: '2026-01-15',
        bucketEnd: '2026-01-15',
        again: 1,
        hard: 1,
        good: 2,
        easy: 0,
        total: 4,
        hardAgainShare: 0.5,
      }),
    ).toMatchObject({ hardAgainShare: 0.5 })
  })
})
