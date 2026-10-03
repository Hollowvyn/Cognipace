import { z } from 'zod'
import { analyticsTargetsSchema } from '@/features/settings/domain'

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
  const valid = value.again + value.hard + value.good + value.easy
  const hardGoodEasy = value.hard + value.good + value.easy
  const goodEasy = value.good + value.easy
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
  rank: z.number().int().positive().max(30),
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
      rows: z.array(retentionMapRowSchema).max(30),
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
