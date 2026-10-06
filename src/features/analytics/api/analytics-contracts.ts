import { z } from 'zod'
import {
  buildAnalyticsHistoryBounds,
  buildAnalyticsHistoryBucketPlan,
  buildAnalyticsBacklogTimeFrame,
} from '../domain/analytics-history-window'
import { buildAnalyticsTimeFrame } from '../domain/analytics-time'
import {
  analyticsTargetsSchema,
  timeTargetsMinutesSchema,
} from '@/features/settings/domain'
import type { ProblemSolvingOutcomeStats } from '../domain/historical-presentation'

export const analyticsRangeSchema = z.union([
  z.literal(30),
  z.literal(90),
  z.literal('all'),
])

export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>

export const analyticsTimeBucketSchema = z.object({
  key: z.string(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  startKey: z.string(),
  endKey: z.string(),
  isPartial: z.boolean(),
})

export const analyticsHistoryGroupingSchema = z.union([
  z
    .object({
      unit: z.literal('day'),
      step: z.union([z.literal(1), z.literal(3)]),
    })
    .strict(),
  z.object({ unit: z.literal('week'), step: z.literal(1) }).strict(),
  z
    .object({
      unit: z.literal('month'),
      step: z.union([z.literal(1), z.literal(3)]),
    })
    .strict(),
  z
    .object({ unit: z.literal('year'), step: z.number().int().positive() })
    .strict(),
])

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const analyticsHistoryBoundsSchema = z
  .object({
    selection: analyticsRangeSchema,
    nominalDays: z.union([z.literal(30), z.literal(90), z.null()]),
    asOf: z.iso.datetime(),
    timeZone: z.string().min(1),
    timeZoneFallback: z.boolean(),
    historyStart: z.iso.datetime().nullable(),
    nominalStart: z.iso.datetime().nullable(),
    nominalStartKey: dateKeySchema.nullable(),
    displayStart: z.iso.datetime().nullable(),
    displayStartKey: dateKeySchema.nullable(),
    todayKey: dateKeySchema,
    periodEnd: z.iso.datetime(),
    availableDays: z.number().int().nonnegative(),
    previous: z
      .object({
        start: z.iso.datetime(),
        asOf: z.iso.datetime(),
        periodEnd: z.iso.datetime(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((bounds, context) => {
    try {
      const expected = buildAnalyticsHistoryBounds({
        selection: bounds.selection,
        asOf: new Date(bounds.asOf),
        timeZone: bounds.timeZone,
        history:
          bounds.historyStart === null
            ? []
            : [{ reviewedAt: new Date(bounds.historyStart) }],
      })
      for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
        if (key === 'timeZoneFallback') continue
        if (JSON.stringify(bounds[key]) !== JSON.stringify(expected[key]))
          context.addIssue({
            code: 'custom',
            message:
              'History bounds must describe the shared report calendar policy.',
            path: [key],
          })
      }
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'History bounds must be valid calendar metadata.',
      })
    }
  })

export const analyticsTimeFrameSchema = z
  .object({
    asOf: z.iso.datetime(),
    timeZone: z.string().min(1),
    timeZoneFallback: z.boolean(),
    requestedDays: z.union([
      z.literal(14),
      z.literal(30),
      z.literal(90),
      z.null(),
    ]),
    periodStart: z.iso.datetime(),
    periodEnd: z.iso.datetime(),
    buckets: z.array(analyticsTimeBucketSchema).max(60),
    history: analyticsHistoryBoundsSchema.optional(),
    grouping: analyticsHistoryGroupingSchema.nullable().optional(),
  })
  .superRefine((frame, context) => {
    const issue = (path: string[], message: string) =>
      context.addIssue({ code: 'custom', message, path })
    if (!frame.history) {
      if (frame.buckets.length === 0 || frame.requestedDays === null) {
        issue(
          ['history'],
          'Empty and All time frames require truthful history metadata.',
        )
        return
      }
      try {
        const dailyBacklog =
          frame.requestedDays === 30 &&
          frame.grouping?.unit === 'day' &&
          frame.grouping.step === 1
        const input = { asOf: new Date(frame.asOf), timeZone: frame.timeZone }
        const expected = dailyBacklog
          ? buildAnalyticsBacklogTimeFrame(input)
          : buildAnalyticsTimeFrame({
              ...input,
              requestedDays: frame.requestedDays,
            })
        const grouping =
          dailyBacklog || frame.requestedDays === 14
            ? { unit: 'day', step: 1 }
            : frame.requestedDays === 30
              ? { unit: 'day', step: 3 }
              : { unit: 'week', step: 1 }
        if (
          frame.grouping !== undefined &&
          JSON.stringify(frame.grouping) !== JSON.stringify(grouping)
        )
          issue(
            ['grouping'],
            'Legacy grouping must match its finite calendar policy.',
          )
        if (
          frame.timeZone !== expected.timeZone ||
          frame.periodStart !== expected.periodStart ||
          frame.periodEnd !== expected.periodEnd
        )
          issue(
            ['periodStart'],
            'Legacy bounds must match their finite report calendar.',
          )
        // Legacy helper payloads may supply a subset of bins; every supplied bin
        // must still be exact, ordered, and unique within the canonical frame.
        let previousIndex = -1
        for (const bucket of frame.buckets) {
          const index = expected.buckets.findIndex((canonical) =>
            Object.entries(canonical).every(
              ([key, value]) => bucket[key as keyof typeof bucket] === value,
            ),
          )
          if (index <= previousIndex) {
            issue(
              ['buckets'],
              'Legacy buckets must be truthful ordered calendar intervals.',
            )
            break
          }
          previousIndex = index
        }
      } catch {
        issue(
          ['buckets'],
          'Legacy frames must use a valid finite report calendar.',
        )
      }
      return
    }
    const bounds = frame.history
    if (
      frame.requestedDays !== bounds.nominalDays ||
      frame.asOf !== bounds.asOf ||
      frame.timeZone !== bounds.timeZone ||
      frame.timeZoneFallback !== bounds.timeZoneFallback ||
      frame.periodStart !== (bounds.displayStart ?? bounds.periodEnd) ||
      frame.periodEnd !== bounds.periodEnd
    )
      issue(['history'], 'The frame must match its history bounds.')
    try {
      const plan = buildAnalyticsHistoryBucketPlan(bounds)
      if (JSON.stringify(frame.grouping) !== JSON.stringify(plan.grouping))
        issue(['grouping'], 'Grouping must match the available history span.')
      if (
        frame.buckets.length !== plan.buckets.length ||
        frame.buckets.some((bucket, index) =>
          Object.entries(plan.buckets[index] ?? {}).some(
            ([key, value]) => bucket[key as keyof typeof bucket] !== value,
          ),
        )
      )
        issue(
          ['buckets'],
          'Buckets must match the shared history calendar plan.',
        )
    } catch {
      issue(['history'], 'History must form valid bounded calendar buckets.')
    }
  })

export type AnalyticsTimeFrame = z.infer<typeof analyticsTimeFrameSchema>

const percentageSchema = z.number().min(0).max(1)
const countSchema = z.number().int().nonnegative()
const nullablePercentageSchema = percentageSchema.nullable()

export const readinessFailureSchema = z.enum([
  'no-evidence',
  'insufficient-span',
  'insufficient-assessments',
  'insufficient-active-buckets',
  'gap-too-long',
  'too-many-gaps',
])

export const analyticsReadinessSchema = z.object({
  ready: z.boolean(),
  requestedDays: z.number().int().positive().nullable(),
  policyDays: z.number().int().positive().optional(),
  availableDays: z.number().int().nonnegative().optional(),
  grouping: analyticsHistoryGroupingSchema.nullable().optional(),
  bucketDays: z.number().int().positive(),
  requestedBuckets: countSchema,
  effectiveBuckets: countSchema,
  effectiveStart: z.string().nullable(),
  assessments: countSchema,
  minimumAssessments: z.number().int().positive(),
  activeBuckets: countSchema,
  minimumActiveBuckets: countSchema,
  longestGap: countSchema,
  maximumGap: z.number().int().positive(),
  gapRuns: countSchema,
  maximumGapRuns: z.number().int().positive(),
  failingReasons: z.array(readinessFailureSchema),
})

export type AnalyticsReadiness = z.infer<typeof analyticsReadinessSchema>
export type ReadinessFailure = z.infer<typeof readinessFailureSchema>

export const analyticsMetricSummarySchema = z.union([
  z.object({
    value: z.null(),
    sampleSize: countSchema,
    lowSample: z.literal(true),
  }),
  z.object({
    value: percentageSchema,
    sampleSize: countSchema,
    lowSample: z.literal(false),
  }),
])

export type AnalyticsMetricSummary = z.infer<
  typeof analyticsMetricSummarySchema
>

export const analyticsSummaryRequestSchema = z.object({
  surface: z.literal('dashboard'),
  range: analyticsRangeSchema,
  timeZone: z.string().min(1),
  at: z.iso.datetime().optional(),
})

export type AnalyticsSummaryRequest = z.infer<
  typeof analyticsSummaryRequestSchema
>

export const recallQualityPointSchema = z.object({
  bucketStart: z.string(),
  bucketEnd: z.string(),
  observedRecall: nullablePercentageSchema,
  predictedRecall: nullablePercentageSchema,
  targetRetention: percentageSchema,
  reviewCount: countSchema,
  eligibleSampleSize: countSchema,
})

export const practiceRhythmPointSchema = z.object({
  bucketStart: z.string(),
  bucketEnd: z.string(),
  reviewCount: countSchema,
  observedCorrectness: nullablePercentageSchema,
  sampleSize: countSchema,
  associationOnly: z.literal(true),
})

export const ratingsMixPointSchema = z.object({
  bucketStart: z.string(),
  bucketEnd: z.string(),
  again: countSchema,
  hard: countSchema,
  good: countSchema,
  easy: countSchema,
  total: countSchema,
  hardAgainShare: nullablePercentageSchema,
})

export const hardAgainSummarySchema = z.object({
  selectedShare: nullablePercentageSchema,
  previousShare: nullablePercentageSchema,
  delta: z.number().min(-1).max(1).nullable(),
  direction: z.enum(['up', 'down', 'flat']).nullable(),
  sampleSize: countSchema,
  previousSampleSize: countSchema,
  lowSample: z.boolean(),
  previousLowSample: z.boolean(),
})

export const topicPointSchema = z.object({
  topic: z.string(),
  recallQuality: nullablePercentageSchema,
  sampleSize: countSchema,
  lowSample: z.boolean(),
})

export const stabilityPointSchema = z.object({
  bucketStart: z.string(),
  bucketEnd: z.string(),
  medianStabilityDays: z.number().nonnegative().nullable(),
  sampleSize: countSchema,
})

const analyticsScaleSchema = z.object({
  domain: z.tuple([z.number(), z.number()]),
  ticks: z.array(z.number()).min(2),
})

const historicalRowBaseSchema = z.object({
  id: z.string().min(1),
  bucketStart: z.string(),
  bucketEnd: z.string(),
  isPartial: z.boolean(),
})

export const observedRecallVsFsrsRowSchema = historicalRowBaseSchema
  .extend({
    recalledCount: countSchema,
    pairedReviews: countSchema,
    observedRecall: nullablePercentageSchema,
    fsrsEstimate: nullablePercentageSchema,
    difference: z.number().min(-1).max(1).nullable(),
    provenance: z.literal('reconstructed'),
    evidence: z.enum(['measured', 'not-measured']),
  })
  .superRefine((row, context) => {
    const empty = row.pairedReviews === 0
    if (
      row.recalledCount > row.pairedReviews ||
      (empty
        ? row.recalledCount !== 0 ||
          row.observedRecall !== null ||
          row.fsrsEstimate !== null ||
          row.difference !== null ||
          row.evidence !== 'not-measured'
        : row.observedRecall !== row.recalledCount / row.pairedReviews ||
          row.fsrsEstimate === null ||
          row.difference !== row.observedRecall - row.fsrsEstimate ||
          row.evidence !== 'measured')
    )
      context.addIssue({
        code: 'custom',
        message:
          'Recall rates, differences, and evidence must match the actual paired population.',
      })
  })

function ratingCountTotals(value: {
  again: number
  hard: number
  good: number
  easy: number
}) {
  return {
    validRatings: value.again + value.hard + value.good + value.easy,
    hardGoodEasy: value.hard + value.good + value.easy,
    goodEasy: value.good + value.easy,
  }
}

const problemSolvingOutcomeFields = {
  again: countSchema,
  hard: countSchema,
  good: countSchema,
  easy: countSchema,
  recordedAssessments: countSchema,
  excludedInvalidRatings: countSchema,
  validRatings: countSchema,
  hardGoodEasy: countSchema,
  goodEasy: countSchema,
  successRate: nullablePercentageSchema,
  goodEasyRate: nullablePercentageSchema,
}
const problemSolvingCountKeys = [
  'again',
  'hard',
  'good',
  'easy',
  'recordedAssessments',
  'excludedInvalidRatings',
  'validRatings',
  'hardGoodEasy',
  'goodEasy',
] as const

function validateProblemSolvingOutcomes(
  value: ProblemSolvingOutcomeStats,
  context: z.RefinementCtx,
) {
  const counts = ratingCountTotals(value)
  const expected = {
    ...counts,
    recordedAssessments: counts.validRatings + value.excludedInvalidRatings,
    successRate:
      counts.validRatings === 0
        ? null
        : counts.hardGoodEasy / counts.validRatings,
    goodEasyRate:
      counts.validRatings === 0 ? null : counts.goodEasy / counts.validRatings,
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key as keyof typeof value] !== expectedValue)
      context.addIssue({
        code: 'custom',
        message:
          'Outcome counts and rates must describe the same valid-rating population.',
        path: [key],
      })
  }
}

const problemSolvingTimeStatsSchema = z
  .object({
    eligibleAssessments: countSchema,
    timedAssessments: countSchema,
    totalSeconds: z.number().nonnegative(),
    medianSeconds: z.number().positive().nullable(),
    q1Seconds: z.number().positive().nullable(),
    q3Seconds: z.number().positive().nullable(),
  })
  .strict()
  .superRefine((time, context) => {
    if (time.timedAssessments > time.eligibleAssessments)
      context.addIssue({
        code: 'custom',
        message: 'Timed assessments cannot exceed their eligible population.',
        path: ['timedAssessments'],
      })
    if (
      (time.timedAssessments === 0) !== (time.medianSeconds === null) ||
      (time.timedAssessments === 0) !== (time.totalSeconds === 0)
    )
      context.addIssue({
        code: 'custom',
        message: 'Recorded-time availability must match its observed count.',
        path: ['medianSeconds'],
      })
    const quartiles = time.timedAssessments >= 4
    if (
      quartiles
        ? time.q1Seconds === null ||
          time.q3Seconds === null ||
          time.medianSeconds === null ||
          time.q1Seconds > time.medianSeconds ||
          time.q3Seconds < time.medianSeconds
        : time.q1Seconds !== null || time.q3Seconds !== null
    )
      context.addIssue({
        code: 'custom',
        message: 'Ordered quartiles require at least four timed assessments.',
        path: ['q1Seconds'],
      })
  })

const problemSolvingDifficultyStatsSchema = z
  .object({
    ...problemSolvingOutcomeFields,
    time: z
      .object({
        all: problemSolvingTimeStatsSchema,
        successful: problemSolvingTimeStatsSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((stats, context) => {
    validateProblemSolvingOutcomes(stats, context)
    if (
      stats.time.all.eligibleAssessments !== stats.recordedAssessments ||
      stats.time.successful.eligibleAssessments !== stats.hardGoodEasy ||
      stats.time.successful.timedAssessments >
        stats.time.all.timedAssessments ||
      stats.time.successful.totalSeconds > stats.time.all.totalSeconds
    )
      context.addIssue({
        code: 'custom',
        message:
          'Timing coverage must match the raw and successful rating populations.',
        path: ['time'],
      })
  })

const problemSolvingDifficultiesSchema = z
  .object({
    easy: problemSolvingDifficultyStatsSchema,
    medium: problemSolvingDifficultyStatsSchema,
    hard: problemSolvingDifficultyStatsSchema,
    unknown: problemSolvingDifficultyStatsSchema,
  })
  .strict()

const problemSolvingRowSchema = historicalRowBaseSchema
  .extend({ difficulties: problemSolvingDifficultiesSchema })
  .strict()
const problemSolvingPeriodStatsSchema = z
  .object({
    ...problemSolvingOutcomeFields,
    assessmentDays: countSchema,
    distinctProblems: countSchema,
    difficulties: problemSolvingDifficultiesSchema,
  })
  .strict()
  .superRefine((period, context) => {
    validateProblemSolvingOutcomes(period, context)
    for (const key of problemSolvingCountKeys) {
      if (
        period[key] !==
        Object.values(period.difficulties).reduce(
          (sum, difficulty) => sum + difficulty[key],
          0,
        )
      )
        context.addIssue({
          code: 'custom',
          message: 'Difficulty counts must reconcile to the cohort total.',
          path: [key],
        })
    }
    if (
      period.assessmentDays > period.recordedAssessments ||
      period.distinctProblems > period.recordedAssessments ||
      (period.recordedAssessments === 0) !== (period.assessmentDays === 0) ||
      (period.recordedAssessments === 0) !== (period.distinctProblems === 0)
    )
      context.addIssue({
        code: 'custom',
        message:
          'Assessment days and distinct problems must match raw activity.',
        path: ['assessmentDays'],
      })
  })
const problemSolvingUnitScalesSchema = z
  .object({
    minutes: analyticsScaleSchema,
    targetPercent: analyticsScaleSchema,
  })
  .strict()
const problemSolvingCohortViewSchema = z
  .object({
    rows: z.array(problemSolvingRowSchema),
    totals: problemSolvingPeriodStatsSchema,
    previous: problemSolvingPeriodStatsSchema,
    outcomeScale: analyticsScaleSchema,
    timeScales: z
      .object({
        all: problemSolvingUnitScalesSchema,
        successful: problemSolvingUnitScalesSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((cohort, context) => {
    for (const difficulty of ['easy', 'medium', 'hard', 'unknown'] as const) {
      const totals = cohort.totals.difficulties[difficulty]
      for (const key of problemSolvingCountKeys) {
        if (
          totals[key] !==
          cohort.rows.reduce(
            (sum, row) => sum + row.difficulties[difficulty][key],
            0,
          )
        )
          context.addIssue({
            code: 'custom',
            message: 'Period counts must aggregate all supplied buckets.',
            path: ['totals', 'difficulties', difficulty, key],
          })
      }
      for (const subset of ['all', 'successful'] as const) {
        for (const key of [
          'eligibleAssessments',
          'timedAssessments',
          'totalSeconds',
        ] as const) {
          const total = cohort.rows.reduce(
            (sum, row) => sum + row.difficulties[difficulty].time[subset][key],
            0,
          )
          if (
            Math.abs(totals.time[subset][key] - total) >
            Number.EPSILON * Math.max(1, total) * cohort.rows.length
          )
            context.addIssue({
              code: 'custom',
              message:
                'Period timing counts and recorded seconds must aggregate all buckets.',
              path: ['totals', 'difficulties', difficulty, 'time', subset, key],
            })
        }
      }
    }
  })

export const problemSolvingViewSchema = z
  .object({
    cohorts: z
      .object({
        newProblems: problemSolvingCohortViewSchema,
        followupPractice: problemSolvingCohortViewSchema,
      })
      .strict(),
    targets: analyticsTargetsSchema,
    timeTargetsMinutes: timeTargetsMinutesSchema,
    previousPeriod: z
      .object({ start: z.iso.datetime(), asOf: z.iso.datetime() })
      .strict()
      .nullable(),
  })
  .strict()

export const memoryStrengthRowSchema = historicalRowBaseSchema.extend({
  medianStrengthDays: z.number().positive().nullable(),
  q1: z.number().positive().nullable(),
  q3: z.number().positive().nullable(),
  eligibleReviews: countSchema,
  medianChangeDays: z.number().nullable(),
  provenance: z.literal('reconstructed'),
  evidence: z.enum(['measured', 'not-measured']),
})

export const practiceRhythmRowSchema = historicalRowBaseSchema.extend({
  completedReviews: countSchema,
  goodEasy: countSchema,
  validRatings: countSchema,
  reviewSuccess: nullablePercentageSchema,
  evidence: z.enum(['measured', 'not-measured']),
})

export const ratingsMixRowSchema = historicalRowBaseSchema.extend({
  again: countSchema,
  hard: countSchema,
  good: countSchema,
  easy: countSchema,
  againShare: nullablePercentageSchema,
  hardShare: nullablePercentageSchema,
  goodShare: nullablePercentageSchema,
  easyShare: nullablePercentageSchema,
  validRatings: countSchema,
  challengingReviews: countSchema,
  evidence: z.enum(['measured', 'not-measured']),
})

export const topicPerformanceRowSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  reviewSuccess: percentageSchema,
  goodEasy: countSchema,
  validRatings: countSchema,
  distinctProblems: countSchema,
  evidence: z.literal('Measured'),
})

export const lowEvidenceTopicRowSchema = z.object({
  topic: z.string().min(1),
  validRatings: countSchema,
  distinctProblems: countSchema,
})

export const ratingsMixComparisonSchema = z.object({
  previousHardAgainShare: nullablePercentageSchema,
  previousValidRatings: countSchema,
  difference: z.number().min(-1).max(1).nullable(),
  direction: z.enum(['up', 'down', 'flat']).nullable(),
})

const retentionMapStatusSchema = z.enum([
  'on-target',
  'watch',
  'needs-attention',
])
const retentionMapRegionSchema = z.enum([
  'strongest-position',
  'on-target-now',
  'near-target-more-durable',
  'watch-closely',
  'needs-attention',
  'highest-attention',
])
const retentionMapRowSchema = z.object({
  rank: z.number().int().positive(),
  slug: z.string(),
  title: z.string(),
  retrievability: percentageSchema,
  targetRetention: percentageSchema,
  targetGap: z.number().min(-1).max(1),
  targetDurationDays: z.number().positive(),
  lastReviewedAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
  difficulty: z.number(),
  lapseCount: countSchema,
  status: retentionMapStatusSchema,
  region: retentionMapRegionSchema,
})
const retentionMapStatusCountsSchema = z.object({
  onTarget: countSchema,
  watch: countSchema,
  needsAttention: countSchema,
})
const memorySignalReasonSchema = z.object({
  kind: z.enum(['below-recall', 'overdue', 'low-durability']),
  label: z.string().min(1),
})
const memorySignalRowSchema = z.object({
  rank: z.number().int().positive().max(25),
  slug: z.string(),
  title: z.string(),
  reasons: z.array(memorySignalReasonSchema).min(1).max(3),
})
const overdueBacklogViewRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overdueCount: countSchema.nullable(),
  inProgress: z.boolean(),
})
const upcomingReviewLoadViewRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueCount: countSchema,
  overdueCount: countSchema,
  today: z.boolean(),
})

export const analyticsViewsSchema = z
  .object({
    problemSolving: problemSolvingViewSchema,
    observedRecallVsFsrs: z.object({
      timeFrame: analyticsTimeFrameSchema,
      rows: z.array(observedRecallVsFsrsRowSchema),
      scale: analyticsScaleSchema,
      targetRecall: percentageSchema,
    }),
    memoryStrength: z.object({
      rows: z.array(memoryStrengthRowSchema),
      scale: analyticsScaleSchema,
    }),
    practiceRhythm: z.object({
      rows: z.array(practiceRhythmRowSchema),
      countScale: analyticsScaleSchema,
      percentageScale: analyticsScaleSchema,
      targetReviewSuccess: percentageSchema,
    }),
    ratingsMix: z.object({
      rows: z.array(ratingsMixRowSchema),
      selectedHardAgain: countSchema,
      selectedValidRatings: countSchema,
      comparison: ratingsMixComparisonSchema,
    }),
    topicPerformance: z.object({
      rows: z.array(topicPerformanceRowSchema),
      strongerQualifyingTopics: countSchema,
      lowEvidenceTopics: z.array(lowEvidenceTopicRowSchema).max(5),
      additionalLowEvidenceTopics: countSchema,
    }),
    retentionMap: z.object({
      rows: z.array(retentionMapRowSchema),
      totalEligible: countSchema,
      statusCounts: retentionMapStatusCountsSchema,
      recallScale: analyticsScaleSchema,
      durationScale: analyticsScaleSchema,
      targetRetention: percentageSchema,
    }),
    memorySignals: z.object({
      rows: z.array(memorySignalRowSchema).max(25),
      totalQualifying: countSchema,
    }),
    overdueBacklog: z.object({
      timeFrame: analyticsTimeFrameSchema,
      rows: z.array(overdueBacklogViewRowSchema),
      knownDays: countSchema,
      withinWatchDays: countSchema,
      aboveWatchDays: countSchema,
      selectedDays: countSchema,
      currentBacklog: countSchema.nullable(),
      peak: countSchema.nullable(),
      scale: analyticsScaleSchema,
    }),
    upcomingReviewLoad: z.object({
      rows: z.array(upcomingReviewLoadViewRowSchema).length(14),
      scale: analyticsScaleSchema,
    }),
  })
  .superRefine((views, context) => {
    for (const [view, key, value] of [
      [
        'observedRecallVsFsrs',
        'targetRecall',
        views.observedRecallVsFsrs.targetRecall,
      ],
      [
        'practiceRhythm',
        'targetReviewSuccess',
        views.practiceRhythm.targetReviewSuccess,
      ],
    ] as const) {
      if (views.problemSolving.targets[key] !== value) {
        context.addIssue({
          code: 'custom',
          message: 'Chart goals must match the saved problem-solving goals.',
          path: [view, key],
        })
      }
    }

    const { rows } = views.upcomingReviewLoad
    if (!rows[0]?.today || rows.filter((row) => row.today).length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Upcoming Review Load must mark only its first row as today.',
        path: ['upcomingReviewLoad', 'rows'],
      })
    }
    if (rows.slice(1).some((row) => row.overdueCount !== 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only today may contain overdue reviews.',
        path: ['upcomingReviewLoad', 'rows'],
      })
    }
  })

export type AnalyticsViews = z.infer<typeof analyticsViewsSchema>

export const historicalReadinessSchema = z.object({
  firstAttemptOutcomes: analyticsReadinessSchema,
  requested: analyticsReadinessSchema,
  recallQuality: analyticsReadinessSchema,
  practiceRhythm: analyticsReadinessSchema,
  ratingsMix: analyticsReadinessSchema,
  topics: analyticsReadinessSchema,
  stability: analyticsReadinessSchema,
  overdueBacklog: analyticsReadinessSchema,
  recommendedRange: z.union([z.literal(30), z.literal(90)]).nullable(),
})

export const analyticsSelectedActivitySchema = z
  .object({
    assessmentDays: countSchema,
    recordedAssessments: countSchema,
    knownCorrectnessAssessments: countSchema,
    successfulAssessments: countSchema,
    distinctSuccessfulProblems: countSchema.nullable(),
    observedCorrectness: nullablePercentageSchema,
    timedSuccessfulAssessments: countSchema,
    untimedSuccessfulAssessments: countSchema,
    successfulRecordedSeconds: z.number().nonnegative().nullable(),
  })
  .strict()
  .superRefine((activity, context) => {
    if (
      activity.successfulAssessments > activity.knownCorrectnessAssessments ||
      activity.knownCorrectnessAssessments > activity.recordedAssessments ||
      activity.timedSuccessfulAssessments +
        activity.untimedSuccessfulAssessments !==
        activity.successfulAssessments
    )
      context.addIssue({
        code: 'custom',
        message:
          'Activity counts must match the recorded, known-correctness, and successful populations.',
      })
    if (
      activity.assessmentDays > activity.recordedAssessments ||
      (activity.assessmentDays === 0) !== (activity.recordedAssessments === 0)
    )
      context.addIssue({
        code: 'custom',
        message: 'Assessment days must match the recorded activity population.',
        path: ['assessmentDays'],
      })
    const whollyUnknown =
      activity.recordedAssessments > 0 &&
      activity.knownCorrectnessAssessments === 0
    if (
      whollyUnknown
        ? activity.distinctSuccessfulProblems !== null
        : activity.distinctSuccessfulProblems === null ||
          activity.distinctSuccessfulProblems >
            activity.successfulAssessments ||
          (activity.distinctSuccessfulProblems === 0) !==
            (activity.successfulAssessments === 0)
    )
      context.addIssue({
        code: 'custom',
        message:
          'Solved questions must match successful assessments and known correctness coverage.',
        path: ['distinctSuccessfulProblems'],
      })
    const expectedCorrectness =
      activity.knownCorrectnessAssessments === 0
        ? null
        : activity.successfulAssessments / activity.knownCorrectnessAssessments
    if (activity.observedCorrectness !== expectedCorrectness)
      context.addIssue({
        code: 'custom',
        message:
          'Observed correctness must equal successful assessments divided by known correctness assessments.',
        path: ['observedCorrectness'],
      })
    const unavailableTime =
      whollyUnknown ||
      (activity.successfulAssessments > 0 &&
        activity.timedSuccessfulAssessments === 0)
    if (
      unavailableTime
        ? activity.successfulRecordedSeconds !== null
        : activity.timedSuccessfulAssessments === 0
          ? activity.successfulRecordedSeconds !== 0
          : activity.successfulRecordedSeconds === null ||
            activity.successfulRecordedSeconds <= 0
    )
      context.addIssue({
        code: 'custom',
        message:
          'Successful recorded time must reflect actual positive timing and correctness coverage.',
        path: ['successfulRecordedSeconds'],
      })
  })

export const analyticsSummarySchema = z
  .object({
    range: analyticsRangeSchema,
    generatedAt: z.iso.datetime(),
    timeFrame: analyticsTimeFrameSchema,
    activity: analyticsSelectedActivitySchema,
    reviewDays: countSchema,
    totalReviews: countSchema,
    currentStreak: countSchema,
    observedRatingQuality: analyticsMetricSummarySchema,
    predictedRecall: analyticsMetricSummarySchema,
    observedRatingSampleSize: countSchema,
    lowSample: z.boolean(),
    targetRetention: percentageSchema,
    views: analyticsViewsSchema,
    historicalReadiness: historicalReadinessSchema,
    recallQuality: z.array(recallQualityPointSchema),
    practiceRhythm: z.array(practiceRhythmPointSchema),
    ratingsMix: z.array(ratingsMixPointSchema),
    hardAgain: hardAgainSummarySchema,
    topics: z.array(topicPointSchema),
    stability: z.array(stabilityPointSchema),
  })
  .superRefine((summary, context) => {
    const selectedFrame = summary.timeFrame
    if (
      selectedFrame.history &&
      summary.activity.assessmentDays > selectedFrame.history.availableDays
    )
      context.addIssue({
        code: 'custom',
        message:
          'Assessment days cannot exceed the displayed available calendar days.',
        path: ['activity', 'assessmentDays'],
      })
    const recallFrame = summary.views.observedRecallVsFsrs.timeFrame
    const backlogFrame = summary.views.overdueBacklog.timeFrame
    for (const [view, frame] of [
      ['observedRecallVsFsrs', recallFrame],
      ['overdueBacklog', backlogFrame],
    ] as const) {
      if (
        frame.asOf !== selectedFrame.asOf ||
        frame.timeZone !== selectedFrame.timeZone ||
        frame.timeZoneFallback !== selectedFrame.timeZoneFallback
      )
        context.addIssue({
          code: 'custom',
          message:
            'View frames must use the selected report instant, timezone, and fallback provenance.',
          path: ['views', view, 'timeFrame'],
        })
    }
    if (
      recallFrame.requestedDays !== selectedFrame.requestedDays ||
      (recallFrame.history && recallFrame.history.selection !== summary.range)
    )
      context.addIssue({
        code: 'custom',
        message: 'Recall pairs must use the selected report range.',
        path: ['views', 'observedRecallVsFsrs', 'timeFrame'],
      })
    const expectedBacklog = buildAnalyticsBacklogTimeFrame({
      asOf: new Date(selectedFrame.asOf),
      timeZone: selectedFrame.timeZone,
    })
    if (
      backlogFrame.requestedDays !== 30 ||
      backlogFrame.grouping?.unit !== 'day' ||
      backlogFrame.grouping.step !== 1 ||
      backlogFrame.periodStart !== expectedBacklog.periodStart ||
      backlogFrame.periodEnd !== expectedBacklog.periodEnd
    )
      context.addIssue({
        code: 'custom',
        message: 'Backlog must use its independent daily last-30-day calendar.',
        path: ['views', 'overdueBacklog', 'timeFrame'],
      })

    if (
      (summary.range === 'all' ? null : summary.range) !==
      summary.timeFrame.requestedDays
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The summary range must match the requested time-frame days.',
        path: ['timeFrame', 'requestedDays'],
      })
    }

    if (summary.range === 'all') {
      const previous = summary.views.problemSolving.previousPeriod
      const comparison = summary.views.ratingsMix.comparison
      const hardAgain = summary.hardAgain
      if (
        previous !== null ||
        summary.views.problemSolving.cohorts.newProblems.previous
          .recordedAssessments !== 0 ||
        summary.views.problemSolving.cohorts.followupPractice.previous
          .recordedAssessments !== 0 ||
        comparison.previousValidRatings !== 0 ||
        comparison.previousHardAgainShare !== null ||
        comparison.difference !== null ||
        comparison.direction !== null ||
        hardAgain.previousSampleSize !== 0 ||
        hardAgain.previousShare !== null ||
        hardAgain.delta !== null ||
        hardAgain.direction !== null
      )
        context.addIssue({
          code: 'custom',
          message: 'All time has no historical previous-period comparison.',
          path: ['views'],
        })
    }

    if (
      summary.historicalReadiness.requested.ready &&
      summary.historicalReadiness.recommendedRange !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A ready requested range must not include a recommended fallback range.',
        path: ['historicalReadiness', 'recommendedRange'],
      })
    }
  })

export type SerializedAnalyticsSummary = z.infer<typeof analyticsSummarySchema>
