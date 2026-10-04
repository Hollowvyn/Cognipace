import { z } from 'zod'
import {
  analyticsTargetsSchema,
  timeTargetsMinutesSchema,
} from '@/features/settings/domain'
import type { ProblemSolvingOutcomeStats } from '../domain/historical-presentation'

export const analyticsRangeSchema = z.union([
  z.literal(14),
  z.literal(30),
  z.literal(90),
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

export const analyticsTimeFrameSchema = z.object({
  asOf: z.iso.datetime(),
  timeZone: z.string().min(1),
  timeZoneFallback: z.boolean(),
  requestedDays: analyticsRangeSchema,
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  buckets: z.array(analyticsTimeBucketSchema).min(1),
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
  requestedDays: z.number().int().positive(),
  bucketDays: z.number().int().positive(),
  requestedBuckets: z.number().int().positive(),
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

export const observedRecallVsFsrsRowSchema = historicalRowBaseSchema.extend({
  recalledCount: countSchema,
  pairedReviews: countSchema,
  observedRecall: nullablePercentageSchema,
  fsrsEstimate: nullablePercentageSchema,
  difference: z.number().min(-1).max(1).nullable(),
  provenance: z.literal('reconstructed'),
  evidence: z.enum(['measured', 'not-measured']),
})

const firstAttemptOutcomeFields = {
  again: countSchema,
  hard: countSchema,
  good: countSchema,
  easy: countSchema,
  recordedFirstAttempts: countSchema,
  excludedInvalidRatings: countSchema,
  validFirstAttempts: countSchema,
  hardGoodEasy: countSchema,
  goodEasy: countSchema,
  firstAttemptSuccess: nullablePercentageSchema,
  firstAttemptGoodEasy: nullablePercentageSchema,
  evidence: z.enum(['measured', 'not-measured']),
}

const firstAttemptOutcomeCountsSchema = z.object(firstAttemptOutcomeFields)

function validateFirstAttemptOutcomes(
  value: z.infer<typeof firstAttemptOutcomeCountsSchema>,
  context: z.RefinementCtx,
) {
  const {
    validRatings: valid,
    hardGoodEasy,
    goodEasy,
  } = ratingCountTotals(value)
  const expected = {
    validFirstAttempts: valid,
    recordedFirstAttempts: valid + value.excludedInvalidRatings,
    hardGoodEasy,
    goodEasy,
    firstAttemptSuccess: valid === 0 ? null : hardGoodEasy / valid,
    firstAttemptGoodEasy: valid === 0 ? null : goodEasy / valid,
    evidence: valid === 0 ? 'not-measured' : 'measured',
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key as keyof typeof value] !== expectedValue) {
      context.addIssue({
        code: 'custom',
        message:
          'First-attempt outcomes must match their rating counts and availability.',
        path: [key],
      })
    }
  }
}

export const firstAttemptOutcomeRowSchema = historicalRowBaseSchema
  .extend(firstAttemptOutcomeFields)
  .strict()
  .superRefine(validateFirstAttemptOutcomes)

export const firstAttemptOutcomeTotalsSchema = firstAttemptOutcomeCountsSchema
  .strict()
  .superRefine(validateFirstAttemptOutcomes)

export const firstAttemptOutcomesViewSchema = z
  .object({
    rows: z.array(firstAttemptOutcomeRowSchema),
    totals: firstAttemptOutcomeTotalsSchema,
    scale: analyticsScaleSchema,
    targetFirstAttemptSuccess: percentageSchema,
    targetFirstAttemptGoodEasy: percentageSchema,
  })
  .strict()
  .superRefine((view, context) => {
    for (const key of [
      'again',
      'hard',
      'good',
      'easy',
      'recordedFirstAttempts',
      'excludedInvalidRatings',
      'validFirstAttempts',
      'hardGoodEasy',
      'goodEasy',
    ] as const) {
      if (
        view.totals[key] !== view.rows.reduce((sum, row) => sum + row[key], 0)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'First-attempt period totals must aggregate all supplied buckets.',
          path: ['totals', key],
        })
      }
    }
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
      .strict(),
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
    firstAttemptOutcomes: firstAttemptOutcomesViewSchema,
    observedRecallVsFsrs: z.object({
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
    const targets = analyticsTargetsSchema.safeParse({
      targetRecall: views.observedRecallVsFsrs.targetRecall,
      targetReviewSuccess: views.practiceRhythm.targetReviewSuccess,
      targetFirstAttemptSuccess:
        views.firstAttemptOutcomes.targetFirstAttemptSuccess,
      targetFirstAttemptGoodEasy:
        views.firstAttemptOutcomes.targetFirstAttemptGoodEasy,
    })
    if (!targets.success) {
      for (const issue of targets.error.issues) {
        context.addIssue({
          ...issue,
          path:
            issue.path[0] === 'targetRecall'
              ? ['observedRecallVsFsrs', 'targetRecall']
              : issue.path[0] === 'targetReviewSuccess'
                ? ['practiceRhythm', 'targetReviewSuccess']
                : ['firstAttemptOutcomes', ...issue.path],
        })
      }
    } else {
      for (const [key, value] of Object.entries(targets.data)) {
        if (
          views.problemSolving.targets[key as keyof typeof targets.data] !==
          value
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'Problem-solving goals must match the saved historical chart goals.',
            path: ['problemSolving', 'targets', key],
          })
        }
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
  recommendedRange: analyticsRangeSchema.nullable(),
})

export const analyticsSummarySchema = z
  .object({
    range: analyticsRangeSchema,
    generatedAt: z.iso.datetime(),
    timeFrame: analyticsTimeFrameSchema,
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
    if (summary.range !== summary.timeFrame.requestedDays) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The summary range must match the requested time-frame days.',
        path: ['timeFrame', 'requestedDays'],
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
