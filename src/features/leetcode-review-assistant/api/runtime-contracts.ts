import { assessmentLockReasons } from '@/features/assessment'
import { genAiProviderIds } from '@/features/genai/domain/genai-types'
import {
  problemDifficultySchema,
  problemSlugSchema,
} from '@/features/problems/api/problems-contracts'
import { z } from 'zod'

import { assessmentRecommendationSchema } from '../domain/recommendation-schema'

const reviewRatingSchema = z.enum(['again', 'hard', 'good', 'easy'])

const assessmentRecommendationProblemSchema = z
  .object({
    slug: problemSlugSchema,
    title: z.string(),
    difficulty: problemDifficultySchema,
    topics: z.array(z.string()).readonly(),
    statement: z.string().optional(),
  })
  .strict()

const assessmentRecommendationSubmissionSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        status: z.literal('accepted'),
        code: z.string().optional(),
        language: z.string().optional(),
        runtime: z.string().optional(),
        memory: z.string().optional(),
        passedTestCount: z.number().int().nonnegative().optional(),
        totalTestCount: z.number().int().nonnegative().optional(),
      })
      .strict(),
    z
      .object({
        status: z.literal('failed'),
        code: z.string().optional(),
        language: z.string().optional(),
        failingTestcase: z.string().optional(),
        expectedOutput: z.string().optional(),
        actualOutput: z.string().optional(),
        errorMessage: z.string().optional(),
        passedTestCount: z.number().int().nonnegative().optional(),
        totalTestCount: z.number().int().nonnegative().optional(),
      })
      .strict(),
    z.object({ status: z.literal('no-submission') }).strict(),
  ],
)

const assessmentRecommendationTimingSchema = z
  .object({
    elapsedSeconds: z.number().nullable(),
    targetSeconds: z.number(),
    timerUsed: z.boolean(),
  })
  .strict()

const assessmentReasonSchema = z
  .object({
    code: z.string(),
    signals: z.record(
      z.string(),
      z.union([z.number(), z.string(), z.boolean(), z.null()]),
    ),
  })
  .strict()

const assessmentBlockedReasonSchema = z
  .object({
    code: z.string(),
    signals: z.object({ targetSeconds: z.number() }).strict(),
  })
  .strict()

// .loose() so future warning codes can carry extra context without breaking
// the wire parse. The handler reads only `.code` from each warning.
const assessmentWarningSchema = z.object({ code: z.string() }).loose()

const leetCodeAssessmentDecisionSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('accepted'),
      rating: reviewRatingSchema,
      isCorrect: z.boolean(),
      elapsedSeconds: z.number().nullable(),
      targetSeconds: z.number(),
      isOverTarget: z.boolean(),
      lockReason: z.enum(assessmentLockReasons).nullable(),
      reason: assessmentReasonSchema,
      warnings: z.array(assessmentWarningSchema),
      confidence: z.number(),
    })
    .strict(),
  z
    .object({
      status: z.literal('blocked'),
      reason: assessmentBlockedReasonSchema,
      targetSeconds: z.number(),
      elapsedSeconds: z.null(),
    })
    .strict(),
])

const overlayAssessmentLatestAttemptSchema = z
  .object({
    id: z.string(),
    rating: reviewRatingSchema,
    isCorrect: z.boolean(),
    elapsedSeconds: z.number().nullable(),
    occurredAt: z.number(),
  })
  .strict()

const overlayAssessmentSessionContextSchema = z
  .object({
    sessionKind: z.enum(['first-solve', 'recall-review']),
    submissionSource: z.enum([
      'manual-overlay',
      'collapsed-quick',
      'leetcode-watcher',
    ]),
    timerUsed: z.boolean(),
    previousRating: reviewRatingSchema.nullable(),
    bestElapsedSeconds: z.number().nullable(),
    latestAttempt: overlayAssessmentLatestAttemptSchema.nullable(),
  })
  .strict()

export const recommendLeetCodeAssessmentRequestSchema = z
  .object({
    surface: z.literal('content-script'),
    problemSlug: problemSlugSchema,
    submissionFingerprint: z.string().min(1).max(200),
    problem: assessmentRecommendationProblemSchema,
    submission: assessmentRecommendationSubmissionSchema,
    timing: assessmentRecommendationTimingSchema,
    deterministicDecision: leetCodeAssessmentDecisionSchema,
    sessionContext: overlayAssessmentSessionContextSchema,
  })
  .strict()

export type RecommendLeetCodeAssessmentRequest = z.infer<
  typeof recommendLeetCodeAssessmentRequestSchema
>

const assessmentRecommendationSchemaForResponse =
  assessmentRecommendationSchema.extend({
    evidence: assessmentRecommendationSchema.shape.evidence.readonly(),
    improvementPoints:
      assessmentRecommendationSchema.shape.improvementPoints.readonly(),
    edgeCaseNotes:
      assessmentRecommendationSchema.shape.edgeCaseNotes.readonly(),
  })

const genAiProviderMetadataSchemaForResponse = z
  .object({
    provider: z.enum(genAiProviderIds),
    model: z.string(),
    durationMs: z.number().nonnegative(),
  })
  .strict()

const recommendLeetCodeAssessmentErrorCodeSchema = z.enum([
  'auth',
  'permission',
  'bad-request',
  'model-unavailable',
  'rate-limit',
  'network',
  'timeout',
  'cancelled',
  'refused',
  'invalid-output',
  'unknown',
])

export type RecommendLeetCodeAssessmentErrorCode = z.infer<
  typeof recommendLeetCodeAssessmentErrorCodeSchema
>

export const recommendLeetCodeAssessmentResponseSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        status: z.literal('ready'),
        recommendation: assessmentRecommendationSchemaForResponse,
        providerMetadata: genAiProviderMetadataSchemaForResponse,
        submissionFingerprint: z.string(),
      })
      .strict(),
    z
      .object({
        status: z.literal('unavailable'),
        message: z.string(),
        submissionFingerprint: z.string(),
      })
      .strict(),
    z
      .object({
        status: z.literal('error'),
        code: recommendLeetCodeAssessmentErrorCodeSchema,
        message: z.string(),
        providerMetadata: genAiProviderMetadataSchemaForResponse.optional(),
        submissionFingerprint: z.string(),
      })
      .strict(),
  ],
)

export type RecommendLeetCodeAssessmentResponse = z.infer<
  typeof recommendLeetCodeAssessmentResponseSchema
>
