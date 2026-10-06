import { normalizeLegacyPracticeStorage } from '@/features/practice/domain'
import { reconcileTopicRows } from '@/features/problems/domain/topic-reconciliation'
import {
  seedTopics,
  seedTopicAliases,
  seedTopicRelations,
} from '@/platform/db/topic-taxonomy-seed'

import {
  backupFileV1Schema,
  backupFileV2Schema,
  backupFileV3Schema,
  backupFileV4Schema,
  backupFileV5Schema,
  type BackupFileV1,
  type BackupFileV2,
  type BackupFileV3,
  type BackupFileV4,
  type BackupFileV5,
} from '../api/backup-legacy-contracts'

export function normalizeBackupV1ToV2(backup: BackupFileV1): BackupFileV2 {
  const groups = new Map(backup.data.tracks.groups.map((row) => [row.id, row]))
  return backupFileV2Schema.parse({
    ...backup,
    schemaVersion: 2,
    data: {
      ...backup.data,
      tracks: {
        ...backup.data.tracks,
        progress: backup.data.tracks.progress.map((row) => {
          const group = groups.get(row.trackGroupId)
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

export function normalizeBackupV2ToV3(backup: BackupFileV2): BackupFileV3 {
  return backupFileV3Schema.parse({
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
}

export function normalizeBackupV3ToV4(backup: BackupFileV3): BackupFileV4 {
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
    {
      legacy: true,
      now: backup.exportedAt,
      catalogue: {
        topics: seedTopics,
        aliases: seedTopicAliases,
        relations: seedTopicRelations,
      },
    },
  )
  return backupFileV4Schema.parse({
    ...backup,
    schemaVersion: 4,
    data: { ...backup.data, ...taxonomy },
  })
}

export function normalizeBackupV4ToV5(backup: BackupFileV4): BackupFileV5 {
  return backupFileV5Schema.parse({
    ...backup,
    schemaVersion: 5,
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
}

export function normalizeBackupV5ToV6(input: BackupFileV5) {
  const backup = backupFileV5Schema.parse(input)
  return {
    ...backup,
    schemaVersion: 6 as const,
    data: {
      ...backup.data,
      practice: {
        ...backup.data.practice,
        ...normalizeLegacyPracticeStorage(backup.data.practice.reviewAttempts),
      },
    },
  }
}

/** Each historical step terminates in a frozen schema, including terminal v5. */
export function normalizeLegacyBackupToV6(input: unknown) {
  const version = (input as { schemaVersion: number }).schemaVersion
  let v5: BackupFileV5
  switch (version) {
    case 1:
      v5 = normalizeBackupV4ToV5(
        normalizeBackupV3ToV4(
          normalizeBackupV2ToV3(
            normalizeBackupV1ToV2(backupFileV1Schema.parse(input)),
          ),
        ),
      )
      break
    case 2:
      v5 = normalizeBackupV4ToV5(
        normalizeBackupV3ToV4(
          normalizeBackupV2ToV3(backupFileV2Schema.parse(input)),
        ),
      )
      break
    case 3:
      v5 = normalizeBackupV4ToV5(
        normalizeBackupV3ToV4(backupFileV3Schema.parse(input)),
      )
      break
    case 4:
      v5 = normalizeBackupV4ToV5(backupFileV4Schema.parse(input))
      break
    case 5:
      v5 = backupFileV5Schema.parse(input)
      break
    default:
      throw new Error(`Unsupported legacy backup version ${version}.`)
  }
  return normalizeBackupV5ToV6(v5)
}
