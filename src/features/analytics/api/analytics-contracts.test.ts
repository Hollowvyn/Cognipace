import { describe, expect, it } from 'vitest'

import {
  analyticsChartPointFixtures,
  createSerializedAnalyticsSummary,
  createTopicRatingCountMatrix,
} from '@/testing/analytics-fixtures'

import {
  analyticsTimeFrameSchema,
  observedRecallVsFsrsRowSchema,
  analyticsReadinessSchema,
  analyticsRangeSchema,
  analyticsSummaryRequestSchema,
  analyticsSummarySchema,
  hardAgainSummarySchema,
  practiceRhythmPointSchema,
  ratingsMixPointSchema,
  topicPerformanceRowSchema,
  type AnalyticsReadiness,
  type SerializedAnalyticsSummary,
} from './analytics-contracts'
import { buildAnalyticsHistoryTimeFrame } from '../domain/analytics-history-frame'
import { buildAnalyticsTimeFrame } from '../domain/analytics-time'
import { buildAnalyticsBacklogTimeFrame } from '../domain/analytics-history-window'

const selectedActivity = {
  assessmentDays: 2,
  recordedAssessments: 5,
  knownCorrectnessAssessments: 4,
  successfulAssessments: 3,
  distinctSuccessfulProblems: 2,
  observedCorrectness: 3 / 4,
  timedSuccessfulAssessments: 2,
  untimedSuccessfulAssessments: 1,
  successfulRecordedSeconds: 180.125,
}

describe('selected activity contract', () => {
  it('requires the additive activity read model and preserves exact recorded seconds', () => {
    const summary = createSerializedAnalyticsSummary()
    expect(
      analyticsSummarySchema.parse({ ...summary, activity: selectedActivity })
        .activity,
    ).toEqual(selectedActivity)
    expect(
      analyticsSummarySchema.safeParse({ ...summary, activity: undefined })
        .success,
    ).toBe(false)
  })

  it.each(Object.keys(selectedActivity))('requires %s', (field) => {
    const activity = { ...selectedActivity, [field]: undefined }
    expect(
      analyticsSummarySchema.safeParse({
        ...createSerializedAnalyticsSummary(),
        activity,
      }).success,
    ).toBe(false)
  })

  it('rejects more assessment days than the displayed available history', () => {
    const timeFrame = buildAnalyticsHistoryTimeFrame({
      selection: 30,
      asOf: new Date('2026-10-05T12:00:00Z'),
      timeZone: 'UTC',
      history: [{ reviewedAt: new Date('2026-10-05T11:00:00Z') }],
    })
    expect(
      analyticsSummarySchema.safeParse({
        ...createSerializedAnalyticsSummary({ timeFrame }),
        activity: selectedActivity,
      }).success,
    ).toBe(false)
  })

  it.each([
    { assessmentDays: -1 },
    { assessmentDays: 1.5 },
    { recordedAssessments: -1 },
    { knownCorrectnessAssessments: 1.5 },
    { successfulAssessments: -1 },
    { distinctSuccessfulProblems: 1.5 },
    { timedSuccessfulAssessments: -1 },
    { untimedSuccessfulAssessments: 1.5 },
    { successfulRecordedSeconds: -1 },
    { successfulRecordedSeconds: NaN },
    { successfulRecordedSeconds: Infinity },
    { observedCorrectness: 2 },
    { assessmentDays: 6 },
    { assessmentDays: 0 },
    { knownCorrectnessAssessments: 6 },
    { successfulAssessments: 5 },
    { distinctSuccessfulProblems: 4 },
    { distinctSuccessfulProblems: 0 },
    { distinctSuccessfulProblems: null },
    { timedSuccessfulAssessments: 1 },
    { untimedSuccessfulAssessments: 0 },
    { observedCorrectness: null },
    { observedCorrectness: 0.5 },
    { successfulRecordedSeconds: null },
    { successfulRecordedSeconds: 0 },
  ])('rejects inconsistent selected activity %j', (overrides) => {
    expect(
      analyticsSummarySchema.safeParse({
        ...createSerializedAnalyticsSummary(),
        activity: { ...selectedActivity, ...overrides },
      }).success,
    ).toBe(false)
  })

  const empty = {
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
  const unknown = {
    ...empty,
    assessmentDays: 1,
    recordedAssessments: 2,
    distinctSuccessfulProblems: null,
    successfulRecordedSeconds: null,
  }
  const failure = {
    ...empty,
    assessmentDays: 1,
    recordedAssessments: 2,
    knownCorrectnessAssessments: 1,
    observedCorrectness: 0,
  }
  const untimed = {
    ...empty,
    assessmentDays: 1,
    recordedAssessments: 2,
    knownCorrectnessAssessments: 1,
    successfulAssessments: 1,
    distinctSuccessfulProblems: 1,
    observedCorrectness: 1,
    untimedSuccessfulAssessments: 1,
    successfulRecordedSeconds: null,
  }
  it.each([empty, unknown, failure, untimed])(
    'accepts truthful empty, unknown, known-failure, and untimed semantics %j',
    (activity) => {
      const result = analyticsSummarySchema.parse({
        ...createSerializedAnalyticsSummary(),
        activity,
      })
      expect(result.activity).toEqual(activity)
    },
  )
  it.each([
    { ...empty, distinctSuccessfulProblems: null },
    { ...empty, successfulRecordedSeconds: null },
    { ...empty, observedCorrectness: 0 },
    { ...empty, assessmentDays: 1 },
    { ...unknown, distinctSuccessfulProblems: 0 },
    { ...unknown, successfulRecordedSeconds: 0 },
    { ...unknown, observedCorrectness: 0 },
    { ...failure, distinctSuccessfulProblems: null },
    { ...failure, successfulRecordedSeconds: null },
    { ...failure, successfulRecordedSeconds: 10 },
    { ...untimed, successfulRecordedSeconds: 0 },
    { ...untimed, successfulRecordedSeconds: 10 },
  ])('rejects fabricated zero or unknown totals %j', (activity) => {
    expect(
      analyticsSummarySchema.safeParse({
        ...createSerializedAnalyticsSummary(),
        activity,
      }).success,
    ).toBe(false)
  })
})

describe('history frame and paired Recall invariants', () => {
  it('requires view frames to preserve the selected report fallback provenance', () => {
    const summary = createSerializedAnalyticsSummary()
    for (const view of ['observedRecallVsFsrs', 'overdueBacklog'] as const) {
      const timeFrame = {
        ...summary.views[view].timeFrame,
        timeZoneFallback: true,
      }
      expect(analyticsTimeFrameSchema.safeParse(timeFrame).success).toBe(true)
      expect(
        analyticsSummarySchema.safeParse({
          ...summary,
          views: {
            ...summary.views,
            [view]: { ...summary.views[view], timeFrame },
          },
        }).success,
      ).toBe(false)
    }
  })

  it('rejects coherent view frames that belong to a different report or workload horizon', () => {
    const input = { asOf: new Date('2026-10-05T12:00:00Z'), timeZone: 'UTC' }
    const report = buildAnalyticsHistoryTimeFrame({
      ...input,
      selection: 30,
      history: [{ reviewedAt: new Date('2026-09-24T12:00:00Z') }],
    })
    const summary = createSerializedAnalyticsSummary({ timeFrame: report })
    summary.views.overdueBacklog.timeFrame = {
      ...buildAnalyticsBacklogTimeFrame(input),
      requestedDays: 30,
      grouping: { unit: 'day', step: 1 },
    }
    const recallFrame = (
      overrides: Partial<typeof input> = {},
      selection: 30 | 90 = 30,
    ) =>
      buildAnalyticsHistoryTimeFrame({
        ...input,
        ...overrides,
        selection,
        history: [{ reviewedAt: new Date('2026-10-02T12:00:00Z') }],
      })
    const backlogFrame = (overrides: Partial<typeof input> = {}) => ({
      ...buildAnalyticsBacklogTimeFrame({ ...input, ...overrides }),
      requestedDays: 30,
      grouping: { unit: 'day', step: 1 },
    })
    for (const [view, timeFrame] of [
      ['observedRecallVsFsrs', recallFrame({}, 90)],
      [
        'observedRecallVsFsrs',
        recallFrame({ asOf: new Date('2026-10-04T12:00:00Z') }),
      ],
      ['observedRecallVsFsrs', recallFrame({ timeZone: 'America/New_York' })],
      [
        'overdueBacklog',
        backlogFrame({ asOf: new Date('2026-10-04T12:00:00Z') }),
      ],
      ['overdueBacklog', backlogFrame({ timeZone: 'America/New_York' })],
      [
        'overdueBacklog',
        {
          ...buildAnalyticsTimeFrame({ ...input, requestedDays: 14 }),
          grouping: { unit: 'day', step: 1 },
        },
      ],
      [
        'overdueBacklog',
        {
          ...buildAnalyticsTimeFrame({ ...input, requestedDays: 30 }),
          grouping: { unit: 'day', step: 3 },
        },
      ],
      ['overdueBacklog', report],
    ] as const) {
      expect(
        analyticsSummarySchema.safeParse({
          ...summary,
          views: {
            ...summary.views,
            [view]: { ...summary.views[view], timeFrame },
          },
        }).success,
      ).toBe(false)
    }
  })

  it('rejects false grouping and fabricated bucket metadata on a legacy finite frame', () => {
    const legacy = buildAnalyticsTimeFrame({
      asOf: new Date('2026-10-05T12:00:00Z'),
      requestedDays: 30,
      timeZone: 'UTC',
    })
    for (const invalid of [
      { grouping: { unit: 'month', step: 1 } },
      { grouping: null },
      { periodStart: '2026-09-24T00:00:00.000Z' },
      {
        buckets: [
          {
            ...legacy.buckets[0],
            startKey: '2026-09-99',
            endKey: '2026-01-00',
          },
        ],
      },
      {
        buckets: [{ ...legacy.buckets[0], start: '2026-09-07T00:00:00.000Z' }],
      },
      { buckets: [{ ...legacy.buckets[0], isPartial: true }] },
      { buckets: [legacy.buckets[1], legacy.buckets[0]] },
      { buckets: [legacy.buckets[0], legacy.buckets[0]] },
    ])
      expect(
        analyticsTimeFrameSchema.safeParse({ ...legacy, ...invalid }).success,
      ).toBe(false)
  })
  it('accepts canonical finite helper frames and the independent daily30 backlog frame', () => {
    const input = { asOf: new Date('2026-10-05T12:00:00Z'), timeZone: 'UTC' }
    for (const requestedDays of [14, 30, 90] as const)
      expect(
        analyticsTimeFrameSchema.safeParse(
          buildAnalyticsTimeFrame({ ...input, requestedDays }),
        ).success,
      ).toBe(true)
    const backlog = {
      ...buildAnalyticsBacklogTimeFrame(input),
      requestedDays: 30,
      grouping: { unit: 'day', step: 1 },
    }
    expect(analyticsTimeFrameSchema.safeParse(backlog).success).toBe(true)
  })

  const frame = buildAnalyticsHistoryTimeFrame({
    selection: 30,
    asOf: new Date('2026-10-05T12:00:00Z'),
    timeZone: 'UTC',
    history: [{ reviewedAt: new Date('2026-09-24T12:00:00Z') }],
  })
  it('preserves a coherent clipped frame and rejects inconsistent bounds and grouping', () => {
    expect(analyticsTimeFrameSchema.safeParse(frame).success).toBe(true)
    expect(
      analyticsTimeFrameSchema.safeParse({
        ...frame,
        history: { ...frame.history, availableDays: 30 },
      }).success,
    ).toBe(false)
    expect(
      analyticsTimeFrameSchema.safeParse({
        ...frame,
        grouping: { unit: 'week', step: 1 },
      }).success,
    ).toBe(false)
    expect(
      analyticsTimeFrameSchema.safeParse({ ...frame, requestedDays: 90 })
        .success,
    ).toBe(false)
    expect(
      analyticsTimeFrameSchema.safeParse({
        ...frame,
        buckets: Array(61).fill(frame.buckets[0]),
      }).success,
    ).toBe(false)
  })
  const pair = {
    id: 'pair',
    bucketStart: '2026-10-02',
    bucketEnd: '2026-10-02',
    isPartial: false,
    recalledCount: 1,
    pairedReviews: 2,
    observedRecall: 0.5,
    fsrsEstimate: 0.6,
    difference: 0.5 - 0.6,
    provenance: 'reconstructed',
    evidence: 'measured',
  }
  it('requires exact rates and unrounded differences for the actual pair counts', () => {
    expect(observedRecallVsFsrsRowSchema.safeParse(pair).success).toBe(true)
    for (const invalid of [
      { recalledCount: 3 },
      { observedRecall: 0.6 },
      { difference: -0.1 },
      { pairedReviews: 0 },
      { fsrsEstimate: null },
      { evidence: 'not-measured' },
    ])
      expect(
        observedRecallVsFsrsRowSchema.safeParse({ ...pair, ...invalid })
          .success,
      ).toBe(false)
    expect(
      observedRecallVsFsrsRowSchema.safeParse({
        ...pair,
        recalledCount: 0,
        pairedReviews: 0,
        observedRecall: null,
        fsrsEstimate: null,
        difference: null,
        evidence: 'not-measured',
      }).success,
    ).toBe(true)
  })
})

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
  recommendedRange: 30 | 90 | null,
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

const validTimeFrame = buildAnalyticsTimeFrame({
  asOf: new Date('2026-01-15T12:00:00Z'),
  timeZone: 'America/New_York',
  requestedDays: 30,
})
validTimeFrame.buckets = validTimeFrame.buckets.slice(0, 1)
const validSummary = createSerializedAnalyticsSummary({
  range: 30,
  generatedAt: validTimeFrame.asOf,
  timeFrame: validTimeFrame,
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
    ...createSerializedAnalyticsSummary({ timeFrame: validTimeFrame }).views,
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
    ratingCountsByDifficulty: createTopicRatingCountMatrix({
      unknown: { again: 10 },
    }),
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

describe('topic joint rating evidence contract', () => {
  const difficulties = ['easy', 'medium', 'hard', 'unknown'] as const
  const ratings = ['again', 'hard', 'good', 'easy'] as const
  const cells = difficulties.flatMap((difficulty) =>
    ratings.map((rating) => ({ difficulty, rating })),
  )
  const topicRow = () => ({
    id: 'graphs',
    topic: 'Graphs',
    reviewSuccess: 0.5,
    goodEasy: 8,
    validRatings: 16,
    distinctProblems: 4,
    evidence: 'Measured',
    ratingCountsByDifficulty: createTopicRatingCountMatrix(
      Object.fromEntries(
        difficulties.map((difficulty) => [
          difficulty,
          { again: 1, hard: 1, good: 1, easy: 1 },
        ]),
      ),
    ),
  })

  it('preserves all sixteen joint counts and the reconciled raw fields', () => {
    expect(topicPerformanceRowSchema.parse(topicRow())).toEqual(topicRow())
  })

  it('requires the joint matrix', () => {
    expect(
      topicPerformanceRowSchema.safeParse({
        ...topicRow(),
        ratingCountsByDifficulty: undefined,
      }).success,
    ).toBe(false)
  })

  it.each(cells)('rejects negative $difficulty/$rating counts', (cell) => {
    const row = topicRow()
    row.ratingCountsByDifficulty = {
      ...row.ratingCountsByDifficulty,
      [cell.difficulty]: {
        ...row.ratingCountsByDifficulty[cell.difficulty],
        [cell.rating]: -1,
      },
    }
    expect(topicPerformanceRowSchema.safeParse(row).success).toBe(false)
  })

  it.each(cells)('rejects fractional $difficulty/$rating counts', (cell) => {
    const row = topicRow()
    row.ratingCountsByDifficulty = {
      ...row.ratingCountsByDifficulty,
      [cell.difficulty]: {
        ...row.ratingCountsByDifficulty[cell.difficulty],
        [cell.rating]: 1.5,
      },
    }
    expect(topicPerformanceRowSchema.safeParse(row).success).toBe(false)
  })

  it.each(cells)('requires the $difficulty/$rating cell', (cell) => {
    const row = topicRow()
    expect(
      topicPerformanceRowSchema.safeParse({
        ...row,
        ratingCountsByDifficulty: {
          ...row.ratingCountsByDifficulty,
          [cell.difficulty]: {
            ...row.ratingCountsByDifficulty[cell.difficulty],
            [cell.rating]: undefined,
          },
        },
      }).success,
    ).toBe(false)
  })

  it.each(difficulties)('requires the %s difficulty', (difficulty) => {
    const row = topicRow()
    expect(
      topicPerformanceRowSchema.safeParse({
        ...row,
        ratingCountsByDifficulty: {
          ...row.ratingCountsByDifficulty,
          [difficulty]: undefined,
        },
      }).success,
    ).toBe(false)
  })

  it.each(difficulties)('rejects additional %s rating cells', (difficulty) => {
    const row = topicRow()
    expect(
      topicPerformanceRowSchema.safeParse({
        ...row,
        ratingCountsByDifficulty: {
          ...row.ratingCountsByDifficulty,
          [difficulty]: {
            ...row.ratingCountsByDifficulty[difficulty],
            other: 0,
          },
        },
      }).success,
    ).toBe(false)
  })

  it('rejects additional difficulty cells', () => {
    const row = topicRow()
    expect(
      topicPerformanceRowSchema.safeParse({
        ...row,
        ratingCountsByDifficulty: {
          ...row.ratingCountsByDifficulty,
          other: { again: 0, hard: 0, good: 0, easy: 0 },
        },
      }).success,
    ).toBe(false)
  })

  it.each([
    {
      overrides: { validRatings: 17, reviewSuccess: 8 / 17 },
      path: 'validRatings',
    },
    {
      overrides: { goodEasy: 9, reviewSuccess: 9 / 16 },
      path: 'goodEasy',
    },
    { overrides: { reviewSuccess: 0.49 }, path: 'reviewSuccess' },
  ])('rejects an inconsistent $path independently', ({ overrides, path }) => {
    const result = topicPerformanceRowSchema.safeParse({
      ...topicRow(),
      ...overrides,
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path)).toEqual([[path]])
  })

  it('rejects zero raw counts paired with populated joint evidence', () => {
    expect(
      topicPerformanceRowSchema.safeParse({
        ...topicRow(),
        validRatings: 0,
        goodEasy: 0,
        reviewSuccess: 0,
      }).success,
    ).toBe(false)
  })
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

  it.each([30, 90, 'all'] as const)('accepts range %s', (range) => {
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
      historicalReadiness: withRequestedReadiness(readyReadiness, 30),
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
    const timeFrame = buildAnalyticsTimeFrame({
      asOf: new Date(validSummary.timeFrame.asOf),
      requestedDays: 90,
      timeZone: validSummary.timeFrame.timeZone,
    })
    const parsed = analyticsSummarySchema.parse({
      ...validSummary,
      range: 90,
      timeFrame,
      views: {
        ...validSummary.views,
        observedRecallVsFsrs: {
          ...validSummary.views.observedRecallVsFsrs,
          timeFrame,
        },
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
  it('accepts only the public finite and All time choices', () => {
    expect(
      [30, 90, 'all'].every(
        (range) => analyticsRangeSchema.safeParse(range).success,
      ),
    ).toBe(true)
    expect(analyticsRangeSchema.safeParse(14).success).toBe(false)
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
