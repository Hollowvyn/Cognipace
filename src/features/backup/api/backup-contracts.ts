import { z } from 'zod'

import { buildTopicGraph } from '@/features/problems/domain/topic-graph'
import { buildTopicLookup } from '@/features/problems/domain/topic-taxonomy'
import {
  practiceSchedulerProfileRecordSchema,
  practiceReviewEvidenceRecordSchema,
  practiceGenerationRecordSchema,
  practiceCommandReceiptRecordSchema,
} from '@/features/practice/domain'

import {
  backupDataV5Schema,
  backupFileV5Schema,
  backupLegacyPracticeDataSchema,
  backupTracksDataV5Schema,
} from './backup-legacy-contracts'
import { normalizeLegacyBackupToV6 } from '../domain/backup-normalization'

export {
  backupProblemRowSchema,
  backupTopicRowSchema,
  backupTopicAliasRowSchema,
  backupTopicRelationRowSchema,
  backupCompanyRowSchema,
  backupProblemTopicRowSchema,
  backupProblemCompanyRowSchema,
  backupProblemPracticeRowSchema,
  backupFsrsCardRowSchema,
  backupReviewAttemptRowSchema,
  backupTrackRowSchema,
  backupTrackGroupRowSchema,
  backupTrackMembershipRowSchema,
  backupTrackProgressRowSchema,
  backupTrackSessionRowSchema,
  backupSettingsKvRowSchema,
} from './backup-legacy-contracts'

export const backupSchemaVersion = 6
export const minimumSupportedBackupSchemaVersion = 1
const isoDatetimeSchema = z.iso.datetime()

export const backupPracticeDataSchema = backupLegacyPracticeDataSchema.extend({
  schedulerProfiles: z.array(practiceSchedulerProfileRecordSchema),
  reviewEvidence: z.array(practiceReviewEvidenceRecordSchema),
  generations: z.array(practiceGenerationRecordSchema),
  commandReceipts: z.array(practiceCommandReceiptRecordSchema),
})
export const backupTracksDataSchema = backupTracksDataV5Schema
export const backupDataSchema = backupDataV5Schema.extend({
  practice: backupPracticeDataSchema,
})
export const backupFileSchema = backupFileV5Schema.extend({
  schemaVersion: z.literal(backupSchemaVersion),
  data: backupDataSchema,
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
export type BackupData = z.infer<typeof backupDataSchema>
export type BackupRequest = z.infer<typeof backupRequestSchema>
export type BackupPayloadRequest = z.infer<typeof backupPayloadRequestSchema>
export type BackupSummary = z.infer<typeof backupSummarySchema>

export const backupReplacementKindSchema = z.enum([
  'restore',
  'reset',
  'gist-pull',
])
const pendingReplacementShape = {
  kind: backupReplacementKindSchema,
  summary: backupSummarySchema.nullable(),
}
export const backupReplacementStateSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('idle') }),
  z.strictObject({
    status: z.literal('persistence-pending'),
    ...pendingReplacementShape,
  }),
  z.strictObject({
    status: z.literal('durable-sync-metadata-pending'),
    ...pendingReplacementShape,
  }),
])
export const backupReplacementResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('no-pending') }),
  z.strictObject({
    status: z.literal('persistence-pending'),
    ...pendingReplacementShape,
  }),
  z.strictObject({
    status: z.literal('durable'),
    syncMetadataPending: z.boolean(),
    ...pendingReplacementShape,
  }),
])
export type BackupReplacementKind = z.infer<typeof backupReplacementKindSchema>
export type BackupReplacementPending = {
  kind: BackupReplacementKind
  summary: BackupSummary | null
}
export type BackupReplacementState = z.infer<
  typeof backupReplacementStateSchema
>
export type BackupReplacementResult = z.infer<
  typeof backupReplacementResultSchema
>

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
  const backup = backupFileSchema.parse(
    envelope.schemaVersion < backupSchemaVersion
      ? normalizeLegacyBackupToV6(input)
      : input,
  )
  buildTopicLookup(backup.data.topics, backup.data.topicAliases)
  buildTopicGraph(backup.data.topics, backup.data.topicRelations)
  return backup
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
