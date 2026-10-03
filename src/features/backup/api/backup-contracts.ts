import { z } from 'zod'

import {
  problemDifficultySchema,
  problemSlugSchema,
} from '@/features/problems/api/problems-contracts'
import { practiceStatuses, reviewModes } from '@/features/practice/domain'
import { userSettingsSchema } from '@/features/settings/domain'
import {
  trackCompletedRatingSchema,
  trackGroupIdSchema,
  trackIdSchema,
} from '@/features/tracks/api/tracks-contracts'
import { fsrsCardStates, reviewRatings } from '@/lib/fsrs'
import { reconcileTopicRows } from '@/features/problems/domain/topic-reconciliation'
import { buildTopicGraph } from '@/features/problems/domain/topic-graph'
import { buildTopicLookup } from '@/features/problems/domain/topic-taxonomy'
import {
  seedTopics,
  seedTopicAliases,
  seedTopicRelations,
} from '@/platform/db/topic-taxonomy-seed'

export const backupSchemaVersion = 5

export const minimumSupportedBackupSchemaVersion = 1

const isoDatetimeSchema = z.iso.datetime()

const durableIdSchema = z.string().trim().min(1)

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

export const backupPracticeDataSchema = z.strictObject({
  problemPractice: z.array(backupProblemPracticeRowSchema),
  fsrsCards: z.array(backupFsrsCardRowSchema),
  reviewAttempts: z.array(backupReviewAttemptRowSchema),
})

export const backupTracksDataSchema = z.strictObject({
  tracks: z.array(backupTrackRowSchema),
  groups: z.array(backupTrackGroupRowSchema),
  memberships: z.array(backupTrackMembershipRowSchema),
  progress: z.array(backupTrackProgressRowSchema),
  session: z.array(backupTrackSessionRowSchema),
})

const backupTracksDataV4Schema = backupTracksDataSchema.extend({
  tracks: z.array(backupTrackV4RowSchema),
})

const backupTracksDataV1Schema = backupTracksDataV4Schema.extend({
  progress: z.array(backupTrackProgressV1RowSchema),
})

export const backupDataSchema = z.strictObject({
  problems: z.array(backupProblemRowSchema),
  topics: z.array(backupTopicRowSchema),
  topicAliases: z.array(backupTopicAliasRowSchema),
  topicRelations: z.array(backupTopicRelationRowSchema),
  companies: z.array(backupCompanyRowSchema),
  problemTopics: z.array(backupProblemTopicRowSchema),
  problemCompanies: z.array(backupProblemCompanyRowSchema),
  practice: backupPracticeDataSchema,
  tracks: backupTracksDataSchema,
  settings: z.array(backupSettingsKvRowSchema),
})

const backupDataV4Schema = backupDataSchema.extend({
  tracks: backupTracksDataV4Schema,
})

const backupDataV3Schema = backupDataV4Schema.extend({
  topicRelations: z.array(backupTopicRelationV3RowSchema),
})

const backupDataV2Schema = z.strictObject({
  problems: z.array(backupProblemRowSchema),
  topics: z.array(backupTopicV2RowSchema),
  topicAliases: z.undefined().optional(),
  topicRelations: z.undefined().optional(),
  companies: z.array(backupCompanyRowSchema),
  problemTopics: z.array(backupProblemTopicRowSchema),
  problemCompanies: z.array(backupProblemCompanyRowSchema),
  practice: backupPracticeDataSchema,
  tracks: backupTracksDataV4Schema,
  settings: z.array(backupSettingsKvRowSchema),
})

const backupDataV1Schema = backupDataV2Schema.extend({
  tracks: backupTracksDataV1Schema,
})

export const backupFileSchema = z.strictObject({
  schemaVersion: z.literal(backupSchemaVersion),
  app: z.literal('cognipace'),
  exportedAt: isoDatetimeSchema,
  source: z.strictObject({
    appVersion: z.string().optional(),
    extensionVersion: z.string().optional(),
  }),
  data: backupDataSchema,
})

const backupFileV1Schema = backupFileSchema.extend({
  schemaVersion: z.literal(1),
  data: backupDataV1Schema,
})

const backupFileV2Schema = backupFileSchema.extend({
  schemaVersion: z.literal(2),
  data: backupDataV2Schema,
})

const backupFileV3Schema = backupFileSchema.extend({
  schemaVersion: z.literal(3),
  data: backupDataV3Schema,
})

const backupFileV4Schema = backupFileSchema.extend({
  schemaVersion: z.literal(4),
  data: backupDataV4Schema,
})

export const backupRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
})

export const backupPayloadRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  backup: z.unknown(),
})

const backupSourceSchema = z.strictObject({
  appVersion: z.string().optional(),
  extensionVersion: z.string().optional(),
})

const backupSummaryCountsSchema = z.strictObject({
  problems: z.number().int().min(0),
  topics: z.number().int().min(0),
  topicAliases: z.number().int().min(0),
  topicRelations: z.number().int().min(0),
  companies: z.number().int().min(0),
  problemTopics: z.number().int().min(0),
  problemCompanies: z.number().int().min(0),
  problemPractice: z.number().int().min(0),
  fsrsCards: z.number().int().min(0),
  reviewAttempts: z.number().int().min(0),
  tracks: z.number().int().min(0),
  trackGroups: z.number().int().min(0),
  trackMemberships: z.number().int().min(0),
  trackProgress: z.number().int().min(0),
  trackSession: z.number().int().min(0),
  settings: z.number().int().min(0),
})

export const backupSummarySchema = z.strictObject({
  schemaVersion: z.number().int().positive(),
  exportedAt: isoDatetimeSchema,
  source: backupSourceSchema,
  counts: backupSummaryCountsSchema,
})

export type BackupFile = z.infer<typeof backupFileSchema>
type BackupFileV1 = z.infer<typeof backupFileV1Schema>
type BackupFileV2 = z.infer<typeof backupFileV2Schema>
type BackupFileV3 = z.infer<typeof backupFileV3Schema>
type BackupFileV4 = z.infer<typeof backupFileV4Schema>
export type BackupData = z.infer<typeof backupDataSchema>
export type BackupRequest = z.infer<typeof backupRequestSchema>
export type BackupPayloadRequest = z.infer<typeof backupPayloadRequestSchema>
export type BackupSummary = z.infer<typeof backupSummarySchema>

const backupEnvelopePreflightSchema = z.object({
  schemaVersion: z.number().int(),
  app: z.string(),
})

export function parseBackupFileForCurrentApp(input: unknown): BackupFile {
  const envelope = backupEnvelopePreflightSchema.parse(input)

  if (envelope.app !== 'cognipace') {
    throw new Error('Selected file is not a CogniPace backup.')
  }

  if (
    envelope.schemaVersion < minimumSupportedBackupSchemaVersion ||
    envelope.schemaVersion > backupSchemaVersion
  ) {
    throw new Error(
      `Unsupported backup version ${envelope.schemaVersion}. CogniPace supports backup versions ${minimumSupportedBackupSchemaVersion}-${backupSchemaVersion}.`,
    )
  }

  if (envelope.schemaVersion === 1) {
    return normalizeBackupV1ToCurrent(backupFileV1Schema.parse(input))
  }

  if (envelope.schemaVersion === 2) {
    return normalizeBackupV2ToCurrent(backupFileV2Schema.parse(input))
  }

  if (envelope.schemaVersion === 3) {
    return normalizeBackupV3ToCurrent(backupFileV3Schema.parse(input))
  }

  if (envelope.schemaVersion === 4) {
    return normalizeBackupV4ToV5(backupFileV4Schema.parse(input))
  }

  const backup = backupFileSchema.parse(input)
  buildTopicLookup(backup.data.topics, backup.data.topicAliases)
  buildTopicGraph(backup.data.topics, backup.data.topicRelations)
  return backup
}

function normalizeBackupV1ToCurrent(backup: BackupFileV1): BackupFile {
  const groupsById = new Map(
    backup.data.tracks.groups.map((group) => [group.id, group]),
  )

  return normalizeBackupV2ToCurrent({
    ...backup,
    schemaVersion: 2,
    data: {
      ...backup.data,
      tracks: {
        ...backup.data.tracks,
        progress: backup.data.tracks.progress.map((row) => {
          const group = groupsById.get(row.trackGroupId)

          if (!group) {
            throw new Error(
              `Invalid backup: progress references missing group ${row.trackGroupId}.`,
            )
          }

          return {
            trackId: group.trackId,
            problemSlug: row.problemSlug,
            reviewAttemptId: null,
            completedAt: row.completedAt,
            completedRating: row.completedRating,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
        }),
      },
    },
  })
}

function normalizeBackupV2ToCurrent(backup: BackupFileV2): BackupFile {
  const v3 = backupFileV3Schema.parse({
    ...backup,
    schemaVersion: 3,
    data: {
      ...backup.data,
      topics: backup.data.topics.map((topic) => ({
        ...topic,
        createdAt: backup.exportedAt,
        updatedAt: backup.exportedAt,
      })),
      topicAliases: [],
      topicRelations: [],
    },
  })
  return normalizeBackupV3ToCurrent(v3)
}

function normalizeBackupV3ToCurrent(backup: BackupFileV3): BackupFile {
  const catalogue = {
    topics: seedTopics,
    aliases: seedTopicAliases,
    relations: seedTopicRelations,
  }
  const taxonomy = reconcileTopicRows(
    {
      topics: backup.data.topics,
      topicAliases: backup.data.topicAliases,
      problemTopics: backup.data.problemTopics,
      topicRelations: backup.data.topicRelations.map((edge) => ({
        sourceTopicId: edge.childTopicId,
        targetTopicId: edge.parentTopicId,
        kind: 'broader' as const,
        createdAt: edge.createdAt,
        updatedAt: edge.updatedAt,
      })),
    },
    { legacy: true, now: backup.exportedAt, catalogue },
  )
  return normalizeBackupV4ToV5({
    ...backup,
    schemaVersion: 4,
    data: { ...backup.data, ...taxonomy },
  })
}

function normalizeBackupV4ToV5(backup: BackupFileV4): BackupFile {
  const normalized = backupFileSchema.parse({
    ...backup,
    schemaVersion: backupSchemaVersion,
    data: {
      ...backup.data,
      tracks: {
        ...backup.data.tracks,
        tracks: backup.data.tracks.tracks.map((track) => ({
          ...track,
          allowExternalProgress: false,
        })),
      },
    },
  })
  buildTopicLookup(normalized.data.topics, normalized.data.topicAliases)
  buildTopicGraph(normalized.data.topics, normalized.data.topicRelations)
  return normalized
}

export function createBackupSummary(backup: BackupFile): BackupSummary {
  return backupSummarySchema.parse({
    schemaVersion: backup.schemaVersion,
    exportedAt: backup.exportedAt,
    source: backup.source,
    counts: {
      problems: backup.data.problems.length,
      topics: backup.data.topics.length,
      topicAliases: backup.data.topicAliases.length,
      topicRelations: backup.data.topicRelations.length,
      companies: backup.data.companies.length,
      problemTopics: backup.data.problemTopics.length,
      problemCompanies: backup.data.problemCompanies.length,
      problemPractice: backup.data.practice.problemPractice.length,
      fsrsCards: backup.data.practice.fsrsCards.length,
      reviewAttempts: backup.data.practice.reviewAttempts.length,
      tracks: backup.data.tracks.tracks.length,
      trackGroups: backup.data.tracks.groups.length,
      trackMemberships: backup.data.tracks.memberships.length,
      trackProgress: backup.data.tracks.progress.length,
      trackSession: backup.data.tracks.session.length,
      settings: backup.data.settings.length,
    },
  })
}
