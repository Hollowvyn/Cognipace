import { z } from 'zod'

import { fsrsCardStates, reviewRatings } from '@/lib/fsrs'

import { practicePhases, practiceStatuses, reviewModes } from '../domain'

export const practiceRuntimeSurfaceSchema = z.enum([
  'popup',
  'dashboard',
  'content-script',
])

export const practiceLogSnapshotSchema = z.object({
  interviewPattern: z.string().nullable(),
  timeComplexity: z.string().nullable(),
  spaceComplexity: z.string().nullable(),
  languages: z.string().nullable(),
  notes: z.string().nullable(),
})

export const practiceLogPatchSchema = practiceLogSnapshotSchema.partial()

const practiceSummarySchema = z.object({
  phase: z.enum(practicePhases),
  nextReviewAt: z.iso.datetime().nullable(),
  lastReviewedAt: z.iso.datetime().nullable(),
  reviewCount: z.number().int().min(0),
  lapses: z.number().int().min(0),
  difficulty: z.number().nullable(),
  stability: z.number().nullable(),
  scheduledDays: z.number().int().min(0).nullable(),
  suspended: z.boolean(),
  isStarted: z.boolean(),
  isDue: z.boolean(),
  isOverdue: z.boolean(),
  overdueDays: z.number().int().min(0),
  retrievability: z.number().nullable(),
})

export const fsrsCardSnapshotSchema = z.object({
  dueAt: z.iso.datetime(),
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number().int(),
  scheduledDays: z.number().int(),
  learningSteps: z.number().int(),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  state: z.enum(fsrsCardStates),
  lastReviewAt: z.iso.datetime().nullable(),
})

export const practiceStateSnapshotSchema = z.object({
  status: z.enum(practiceStatuses),
  lastReviewedAt: z.iso.datetime().nullable(),
  attemptCount: z.number().int().min(0),
  solvedCount: z.number().int().min(0),
  isSuspended: z.boolean(),
  lastRating: z.enum(reviewRatings).nullable(),
  lastElapsedSeconds: z.number().int().positive().nullable(),
  bestElapsedSeconds: z.number().int().positive().nullable(),
  log: practiceLogSnapshotSchema,
})

export const practiceReviewAttemptSchema = z.object({
  id: z.string(),
  problemSlug: z.string(),
  cardId: z.string(),
  rating: z.enum(reviewRatings),
  reviewMode: z.enum(reviewModes),
  reviewedAt: z.iso.datetime(),
  elapsedSeconds: z.number().int().positive().nullable(),
  isCorrect: z.boolean().nullable(),
  log: practiceLogSnapshotSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const normalizedPracticeStateSchema = z.object({
  problemSlug: z.string(),
  cardId: z.string(),
  status: z.enum(practiceStatuses),
  isSuspended: z.boolean(),
  phase: z.enum(practicePhases),
  isStarted: z.boolean(),
  isDue: z.boolean(),
  isOverdue: z.boolean(),
  overdueDays: z.number().int().min(0),
  dueAt: z.iso.datetime().nullable(),
  lastReviewedAt: z.iso.datetime().nullable(),
  retrievability: z.number().nullable(),
  stability: z.number().nullable(),
  difficulty: z.number().nullable(),
  scheduledDays: z.number().int().min(0).nullable(),
  lapses: z.number().int().min(0),
  reviewCount: z.number().int().min(0),
  reviewHistory: z.array(practiceReviewAttemptSchema),
  recentAttempts: z.array(practiceReviewAttemptSchema),
  latestAttempt: practiceReviewAttemptSchema.nullable(),
})

export type SerializedNormalizedPracticeState = z.infer<
  typeof normalizedPracticeStateSchema
>

// Extends the normalized contract with overlay-session fields
export const practiceDetailsSchema = normalizedPracticeStateSchema.extend({
  practice: practiceStateSnapshotSchema.nullable(),
  card: fsrsCardSnapshotSchema.nullable(),
  currentLog: practiceLogSnapshotSchema,
  canOverrideLatestReview: z.boolean(),
})

export type SerializedPracticeDetails = z.infer<typeof practiceDetailsSchema>

export const practiceReviewResultSchema = z.object({
  problemSlug: z.string(),
  cardId: z.string(),
  reviewAttemptId: z.string(),
  rating: z.enum(reviewRatings),
  status: z.enum(practiceStatuses),
  dueAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime(),
  summary: practiceSummarySchema,
})

export type SerializedReviewResult = z.infer<typeof practiceReviewResultSchema>

export const practiceDetailsRequestSchema = z.object({
  surface: practiceRuntimeSurfaceSchema,
  problemSlug: z.string(),
  at: z.iso.datetime().optional(),
})

export type PracticeDetailsRequest = z.infer<
  typeof practiceDetailsRequestSchema
>

export const practiceSaveReviewResultRequestSchema = z.object({
  surface: practiceRuntimeSurfaceSchema,
  problemSlug: z.string(),
  rating: z.enum(reviewRatings),
  reviewedAt: z.iso.datetime().optional(),
  reviewMode: z.enum(reviewModes).optional(),
  elapsedSeconds: z.number().int().positive().nullish(),
  isCorrect: z.boolean().nullish(),
  notes: z.string().nullish(),
  log: practiceLogPatchSchema.optional(),
})

export type PracticeSaveReviewResultRequest = z.infer<
  typeof practiceSaveReviewResultRequestSchema
>

export const practiceOverrideLastReviewResultRequestSchema = z
  .object({
    surface: practiceRuntimeSurfaceSchema,
    problemSlug: z.string(),
    rating: z.enum(reviewRatings),
    elapsedSeconds: z.number().int().positive().nullish(),
    isCorrect: z.boolean().nullish(),
    log: practiceLogPatchSchema.optional(),
  })
  .strict()

export type PracticeOverrideLastReviewResultRequest = z.infer<
  typeof practiceOverrideLastReviewResultRequestSchema
>

export const practiceSetSuspendedRequestSchema = z.object({
  surface: practiceRuntimeSurfaceSchema,
  problemSlug: z.string(),
  suspended: z.boolean(),
})

export type PracticeSetSuspendedRequest = z.infer<
  typeof practiceSetSuspendedRequestSchema
>

export const practiceResetScheduleRequestSchema = z.object({
  surface: practiceRuntimeSurfaceSchema,
  problemSlug: z.string(),
  keepLog: z.boolean().optional(),
})

export type PracticeResetScheduleRequest = z.infer<
  typeof practiceResetScheduleRequestSchema
>
