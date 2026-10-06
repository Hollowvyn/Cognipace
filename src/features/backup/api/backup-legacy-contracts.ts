import { z } from 'zod'

import { userSettingsSchema } from '@/features/settings/domain'

// These are the shipped v1–v5 contracts. They never depend on the current
// Backup or Practice shape; Settings JSON intentionally remains version tolerant.
const isoDatetimeSchema = z.iso.datetime()

// Durable identities are opaque. Validate blankness without rewriting bytes.
const durableIdSchema = z.string().refine((value) => value.trim().length > 0)
const problemSlugSchema = z.string().trim().min(1)
const problemDifficultySchema = z.enum(['easy', 'medium', 'hard', 'unknown'])
const trackIdSchema = durableIdSchema
const trackGroupIdSchema = durableIdSchema
const trackCompletedRatingSchema = z.enum(['hard', 'good', 'easy'])
const practiceStatuses = [
  'new',
  'learning',
  'review',
  'mastered',
  'suspended',
] as const
const reviewModes = ['manual', 'leetcode'] as const
const fsrsCardStates = ['new', 'learning', 'review', 'relearning'] as const
const reviewRatings = ['again', 'hard', 'good', 'easy'] as const

export const backupProblemRowSchema = z.strictObject({
  slug: problemSlugSchema,
  title: z.string(),
  difficulty: problemDifficultySchema,
  isPremium: z.boolean(),
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

export const backupTopicRowSchema = z.strictObject({
  id: durableIdSchema,
  label: z.string(),
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

const backupTopicV2RowSchema = z.strictObject({
  id: durableIdSchema,
  label: z.string(),
})

export const backupTopicAliasRowSchema = z.strictObject({
  aliasKey: durableIdSchema,
  label: z.string(),
  topicId: durableIdSchema,
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

const backupTopicRelationV3RowSchema = z.strictObject({
  parentTopicId: durableIdSchema,
  childTopicId: durableIdSchema,
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

export const backupTopicRelationRowSchema = z.strictObject({
  sourceTopicId: durableIdSchema,
  targetTopicId: durableIdSchema,
  kind: z.enum(['broader', 'applies-to']),
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

export const backupCompanyRowSchema = z.strictObject({
  id: durableIdSchema,
  label: z.string(),
})

export const backupProblemTopicRowSchema = z.strictObject({
  problemSlug: problemSlugSchema,
  topicId: durableIdSchema,
})

export const backupProblemCompanyRowSchema = z.strictObject({
  problemSlug: problemSlugSchema,
  companyId: durableIdSchema,
})

export const backupProblemPracticeRowSchema = z.strictObject({
  problemSlug: problemSlugSchema,
  status: z.enum(practiceStatuses),
  firstSeenAt: isoDatetimeSchema,
  lastSeenAt: isoDatetimeSchema.nullable(),
  lastReviewedAt: isoDatetimeSchema.nullable(),
  lastRating: z.enum(reviewRatings).nullable(),
  lastElapsedSeconds: z.number().int().positive().nullable(),
  bestElapsedSeconds: z.number().int().positive().nullable(),
  interviewPattern: z.string().nullable(),
  timeComplexity: z.string().nullable(),
  spaceComplexity: z.string().nullable(),
  languages: z.string().nullable(),
  notes: z.string().nullable(),
  solvedCount: z.number().int().min(0),
  attemptCount: z.number().int().min(0),
  isSuspended: z.boolean(),
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

export const backupFsrsCardRowSchema = z.strictObject({
  id: durableIdSchema,
  problemSlug: problemSlugSchema,
  cardKind: durableIdSchema,
  dueAt: isoDatetimeSchema,
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number().int().min(0),
  scheduledDays: z.number().int().min(0),
  learningSteps: z.number().int().min(0),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  state: z.enum(fsrsCardStates),
  lastReviewAt: isoDatetimeSchema.nullable(),
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

export const backupReviewAttemptRowSchema = z.strictObject({
  id: durableIdSchema,
  problemSlug: problemSlugSchema,
  cardId: durableIdSchema,
  rating: z.enum(reviewRatings),
  reviewMode: z.enum(reviewModes),
  reviewedAt: isoDatetimeSchema,
  elapsedSeconds: z.number().int().positive().nullable(),
  isCorrect: z.boolean().nullable(),
  interviewPattern: z.string().nullable(),
  timeComplexity: z.string().nullable(),
  spaceComplexity: z.string().nullable(),
  languages: z.string().nullable(),
  notes: z.string().nullable(),
  fsrsReviewLog: z.string().nullable(),
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

// Freeze the track format shipped in v1–v4. New fields must not loosen a
// legacy payload or silently enable a policy that did not exist in that version.
const backupTrackV4RowSchema = z.strictObject({
  id: trackIdSchema,
  slug: z.string().trim().min(1),
  title: z.string(),
  description: z.string().nullable(),
  dueAt: isoDatetimeSchema.nullable(),
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

export const backupTrackRowSchema = backupTrackV4RowSchema.extend({
  allowExternalProgress: z.boolean(),
})

export const backupTrackGroupRowSchema = z.strictObject({
  id: trackGroupIdSchema,
  trackId: trackIdSchema,
  title: z.string(),
  position: z.number().int().min(1),
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

export const backupTrackMembershipRowSchema = z.strictObject({
  trackGroupId: trackGroupIdSchema,
  problemSlug: problemSlugSchema,
  position: z.number().int().min(1),
})

const backupTrackProgressV1RowSchema = z.strictObject({
  trackGroupId: trackGroupIdSchema,
  problemSlug: problemSlugSchema,
  completedAt: isoDatetimeSchema,
  completedRating: trackCompletedRatingSchema,
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

export const backupTrackProgressRowSchema = z
  .strictObject({
    trackId: trackIdSchema,
    problemSlug: problemSlugSchema,
    reviewAttemptId: durableIdSchema.nullable(),
    completedAt: isoDatetimeSchema.nullable(),
    completedRating: trackCompletedRatingSchema.nullable(),
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
  })
  .superRefine((row, context) => {
    const hasCompletedAt = row.completedAt !== null
    const hasCompletedRating = row.completedRating !== null

    if (hasCompletedAt !== hasCompletedRating) {
      context.addIssue({
        code: 'custom',
        message: 'completedAt and completedRating must both be null or set',
        path: ['completedAt'],
      })
    }
  })

export const backupTrackSessionRowSchema = z.strictObject({
  id: durableIdSchema,
  activeTrackId: trackIdSchema.nullable(),
  activeGroupId: trackGroupIdSchema.nullable(),
  startedAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
})

export const backupSettingsKvRowSchema = z
  .strictObject({
    key: z.literal('user-settings'),
    value: z.string(),
    updatedAt: isoDatetimeSchema,
  })
  .superRefine((settingsKv, context) => {
    try {
      // .strip() relaxes the top-level .strict() so that fields added after
      // a row was originally written (e.g. aiAssessment) are accepted via
      // their Zod defaults rather than rejected.  Genuinely invalid field
      // values (wrong type, out-of-range numbers, etc.) still throw.
      userSettingsSchema.strip().parse(JSON.parse(settingsKv.value))
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'settings value must contain current UserSettings JSON',
        path: ['value'],
      })
    }
  })

export const backupLegacyPracticeDataSchema = z.strictObject({
  problemPractice: z.array(backupProblemPracticeRowSchema),
  fsrsCards: z.array(backupFsrsCardRowSchema),
  reviewAttempts: z.array(backupReviewAttemptRowSchema),
})

export const backupTracksDataV5Schema = z.strictObject({
  tracks: z.array(backupTrackRowSchema),
  groups: z.array(backupTrackGroupRowSchema),
  memberships: z.array(backupTrackMembershipRowSchema),
  progress: z.array(backupTrackProgressRowSchema),
  session: z.array(backupTrackSessionRowSchema),
})

export const backupTracksDataV4Schema = backupTracksDataV5Schema.extend({
  tracks: z.array(backupTrackV4RowSchema),
})

export const backupTracksDataV1Schema = backupTracksDataV4Schema.extend({
  progress: z.array(backupTrackProgressV1RowSchema),
})

export const backupDataV5Schema = z.strictObject({
  problems: z.array(backupProblemRowSchema),
  topics: z.array(backupTopicRowSchema),
  topicAliases: z.array(backupTopicAliasRowSchema),
  topicRelations: z.array(backupTopicRelationRowSchema),
  companies: z.array(backupCompanyRowSchema),
  problemTopics: z.array(backupProblemTopicRowSchema),
  problemCompanies: z.array(backupProblemCompanyRowSchema),
  practice: backupLegacyPracticeDataSchema,
  tracks: backupTracksDataV5Schema,
  settings: z.array(backupSettingsKvRowSchema),
})

export const backupDataV4Schema = backupDataV5Schema.extend({
  tracks: backupTracksDataV4Schema,
})

export const backupDataV3Schema = backupDataV4Schema.extend({
  topicRelations: z.array(backupTopicRelationV3RowSchema),
})

export const backupDataV2Schema = z.strictObject({
  problems: z.array(backupProblemRowSchema),
  topics: z.array(backupTopicV2RowSchema),
  topicAliases: z.undefined().optional(),
  topicRelations: z.undefined().optional(),
  companies: z.array(backupCompanyRowSchema),
  problemTopics: z.array(backupProblemTopicRowSchema),
  problemCompanies: z.array(backupProblemCompanyRowSchema),
  practice: backupLegacyPracticeDataSchema,
  tracks: backupTracksDataV4Schema,
  settings: z.array(backupSettingsKvRowSchema),
})

export const backupDataV1Schema = backupDataV2Schema.extend({
  tracks: backupTracksDataV1Schema,
})

export const backupFileV5Schema = z.strictObject({
  schemaVersion: z.literal(5),
  app: z.literal('cognipace'),
  exportedAt: isoDatetimeSchema,
  source: z.strictObject({
    appVersion: z.string().optional(),
    extensionVersion: z.string().optional(),
  }),
  data: backupDataV5Schema,
})

export const backupFileV1Schema = backupFileV5Schema.extend({
  schemaVersion: z.literal(1),
  data: backupDataV1Schema,
})

export const backupFileV2Schema = backupFileV5Schema.extend({
  schemaVersion: z.literal(2),
  data: backupDataV2Schema,
})

export const backupFileV3Schema = backupFileV5Schema.extend({
  schemaVersion: z.literal(3),
  data: backupDataV3Schema,
})

export const backupFileV4Schema = backupFileV5Schema.extend({
  schemaVersion: z.literal(4),
  data: backupDataV4Schema,
})

export type BackupFileV1 = z.infer<typeof backupFileV1Schema>
export type BackupFileV2 = z.infer<typeof backupFileV2Schema>
export type BackupFileV3 = z.infer<typeof backupFileV3Schema>
export type BackupFileV4 = z.infer<typeof backupFileV4Schema>
export type BackupFileV5 = z.infer<typeof backupFileV5Schema>
export type LegacyBackupFile =
  | BackupFileV1
  | BackupFileV2
  | BackupFileV3
  | BackupFileV4
  | BackupFileV5
