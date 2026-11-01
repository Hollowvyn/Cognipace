import { assertArchiveReferences } from '@/features/notes/domain/archive-validation'
import type { Db } from '@/platform/db'
import {
  clearPracticeStorageDataInTransaction,
  readPracticeStorageData,
  replacePracticeStorageDataInTransaction,
} from '@/features/practice/server/practice-storage-service'
import { seedInitialCatalog } from '@/platform/db/seed'
import {
  companies,
  fsrsCards,
  problemCompanies,
  problemPractice,
  problems,
  problemTopics,
  reviewAttempts,
  settingsKv,
  topicAliases,
  topicRelations,
  topics,
  trackGroupProblems,
  trackGroups,
  trackProblemProgress,
  trackSession,
  tracks,
} from '@/platform/db/schema'

import { backupSummarySchema, type BackupData } from '../api/backup-contracts'
import {
  prepareCurrentBackupData,
  validateCurrentBackupData,
  type PreparedBackupRestore,
} from '../domain/backup-preflight'
import { buildTopicGraph } from '@/features/problems/domain/topic-graph'
import { buildTopicLookup } from '@/features/problems/domain/topic-taxonomy'

export function createBackupRepository(db: Db) {
  return new BackupRepository(db)
}

export class BackupRepository {
  constructor(private readonly db: Db) {}

  async readBackupData(): Promise<BackupData> {
    const [
      problemRows,
      topicRows,
      topicAliasRows,
      topicRelationRows,
      companyRows,
      problemTopicRows,
      problemCompanyRows,
      practiceRows,
      cardRows,
      attemptRows,
      trackRows,
      groupRows,
      membershipRows,
      progressRows,
      sessionRows,
      settingsRows,
      practiceStorage,
    ] = await Promise.all([
      this.db.select().from(problems),
      this.db.select().from(topics),
      this.db.select().from(topicAliases),
      this.db.select().from(topicRelations),
      this.db.select().from(companies),
      this.db.select().from(problemTopics),
      this.db.select().from(problemCompanies),
      this.db.select().from(problemPractice),
      this.db.select().from(fsrsCards),
      this.db.select().from(reviewAttempts),
      this.db.select().from(tracks),
      this.db.select().from(trackGroups),
      this.db.select().from(trackGroupProblems),
      this.db.select().from(trackProblemProgress),
      this.db.select().from(trackSession),
      this.db.select().from(settingsKv),
      readPracticeStorageData(this.db),
    ])

    return validateCurrentBackupData(
      {
        problems: problemRows.map((row) => ({
          ...row,
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        })),
        topics: topicRows.map((row) => ({
          ...row,
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        })),
        topicAliases: topicAliasRows.map((row) => ({
          ...row,
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        })),
        topicRelations: topicRelationRows.map((row) => ({
          ...row,
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        })),
        companies: companyRows,
        problemTopics: problemTopicRows,
        problemCompanies: problemCompanyRows,
        practice: {
          ...practiceStorage,
          problemPractice: practiceRows.map((row) => ({
            ...row,
            firstSeenAt: toIso(row.firstSeenAt),
            lastSeenAt: toIsoOrNull(row.lastSeenAt),
            lastReviewedAt: toIsoOrNull(row.lastReviewedAt),
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          })),
          fsrsCards: cardRows.map((row) => ({
            ...row,
            dueAt: toIso(row.dueAt),
            lastReviewAt: toIsoOrNull(row.lastReviewAt),
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          })),
          reviewAttempts: attemptRows.map((row) => ({
            ...row,
            reviewedAt: toIso(row.reviewedAt),
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          })),
        },
        tracks: {
          tracks: trackRows.map((row) => ({
            ...row,
            dueAt: toIsoOrNull(row.dueAt),
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          })),
          groups: groupRows.map((row) => ({
            ...row,
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          })),
          memberships: membershipRows.map((row) => ({
            trackGroupId: row.trackGroupId,
            problemSlug: row.problemSlug,
            position: row.position,
          })),
          progress: progressRows.map((row) => ({
            trackId: row.trackId,
            problemSlug: row.problemSlug,
            reviewAttemptId: row.reviewAttemptId,
            completedAt: toIsoOrNull(row.completedAt),
            completedRating: row.completedRating,
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          })),
          session: sessionRows.map((row) => ({
            ...row,
            startedAt: toIso(row.startedAt),
            updatedAt: toIso(row.updatedAt),
          })),
        },
        // Filter to only the user-settings row; never include genai-secrets in backups
        settings: settingsRows
          .filter((row) => row.key === 'user-settings')
          .map((row) => ({
            ...row,
            updatedAt: toIso(row.updatedAt),
          })),
      },
      { requireActiveGenerations: true },
    )
  }
}

export async function clearAndRestoreBackupData(
  db: Db,
  prepared: PreparedBackupRestore,
  now = new Date(),
) {
  const summary = backupSummarySchema.parse(prepared.summary)
  const backupData = prepareCurrentBackupData(prepared.data, summary.exportedAt)

  await assertArchiveReferences(
    prepared.notesArchive,
    backupData.problems.map((row) => row.slug),
  )

  await db.transaction(async (transactionDb) => {
    const tx = transactionDb as unknown as Db

    await clearAllTables(tx)
    await insertBackupData(tx, backupData)
    await seedInitialCatalog(tx, now)
    await validateTopicRegistry(tx)
    await replacePracticeStorageDataInTransaction(
      tx,
      {
        schedulerProfiles: backupData.practice.schedulerProfiles,
        reviewEvidence: backupData.practice.reviewEvidence,
        generations: backupData.practice.generations,
        commandReceipts: backupData.practice.commandReceipts,
      },
      now,
    )
  })
}

export async function resetLocalDataToFreshInstall(db: Db, now = new Date()) {
  await db.transaction(async (transactionDb) => {
    const tx = transactionDb as unknown as Db

    await clearAllTables(tx)
    await seedInitialCatalog(tx, now)
    await validateTopicRegistry(tx)
    await replacePracticeStorageDataInTransaction(
      tx,
      {
        schedulerProfiles: [],
        reviewEvidence: [],
        generations: [],
        commandReceipts: [],
      },
      now,
    )
  })
}

async function validateTopicRegistry(db: Db) {
  const [topicRows, aliasRows, relationRows] = await Promise.all([
    db.select().from(topics),
    db.select().from(topicAliases),
    db.select().from(topicRelations),
  ])
  buildTopicLookup(topicRows, aliasRows)
  buildTopicGraph(topicRows, relationRows)
}

async function clearAllTables(db: Db) {
  await clearPracticeStorageDataInTransaction(db)
  await db.delete(reviewAttempts)
  await db.delete(fsrsCards)
  await db.delete(problemPractice)
  await db.delete(trackProblemProgress)
  await db.delete(trackGroupProblems)
  await db.delete(trackSession)
  await db.delete(trackGroups)
  await db.delete(tracks)
  await db.delete(problemTopics)
  await db.delete(topicRelations)
  await db.delete(topicAliases)
  await db.delete(problemCompanies)
  await db.delete(problems)
  await db.delete(topics)
  await db.delete(companies)
  await db.delete(settingsKv)
}

async function insertBackupData(db: Db, data: BackupData) {
  if (data.topics.length > 0) {
    await insertRowsInBatches(
      data.topics.map((row) => ({
        ...row,
        createdAt: toMillis(row.createdAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(topics).values(batch),
    )
  }

  if (data.topicAliases.length > 0) {
    await insertRowsInBatches(
      data.topicAliases.map((row) => ({
        ...row,
        createdAt: toMillis(row.createdAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(topicAliases).values(batch),
    )
  }

  if (data.topicRelations.length > 0) {
    await insertRowsInBatches(
      data.topicRelations.map((row) => ({
        ...row,
        createdAt: toMillis(row.createdAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(topicRelations).values(batch),
    )
  }

  if (data.companies.length > 0) {
    await insertRowsInBatches(data.companies, (batch) =>
      db.insert(companies).values(batch),
    )
  }

  if (data.problems.length > 0) {
    await insertRowsInBatches(
      data.problems.map((row) => ({
        ...row,
        createdAt: toMillis(row.createdAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(problems).values(batch),
    )
  }

  if (data.problemTopics.length > 0) {
    await insertRowsInBatches(data.problemTopics, (batch) =>
      db.insert(problemTopics).values(batch),
    )
  }

  if (data.problemCompanies.length > 0) {
    await insertRowsInBatches(data.problemCompanies, (batch) =>
      db.insert(problemCompanies).values(batch),
    )
  }

  if (data.tracks.tracks.length > 0) {
    await insertRowsInBatches(
      data.tracks.tracks.map((row) => ({
        ...row,
        dueAt: toMillisOrNull(row.dueAt),
        createdAt: toMillis(row.createdAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(tracks).values(batch),
    )
  }

  if (data.tracks.groups.length > 0) {
    await insertRowsInBatches(
      data.tracks.groups.map((row) => ({
        ...row,
        createdAt: toMillis(row.createdAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(trackGroups).values(batch),
    )
  }

  if (data.tracks.memberships.length > 0) {
    const trackIdByGroupId = new Map(
      data.tracks.groups.map((group) => [group.id, group.trackId]),
    )

    await insertRowsInBatches(
      data.tracks.memberships.map((row) => ({
        ...row,
        trackId: requireGroupTrackId(trackIdByGroupId, row.trackGroupId),
      })),
      (batch) => db.insert(trackGroupProblems).values(batch),
    )
  }

  if (data.tracks.session.length > 0) {
    await insertRowsInBatches(
      data.tracks.session.map((row) => ({
        ...row,
        startedAt: toMillis(row.startedAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(trackSession).values(batch),
    )
  }

  if (data.practice.problemPractice.length > 0) {
    await insertRowsInBatches(
      data.practice.problemPractice.map((row) => ({
        ...row,
        firstSeenAt: toMillis(row.firstSeenAt),
        lastSeenAt: toMillisOrNull(row.lastSeenAt),
        lastReviewedAt: toMillisOrNull(row.lastReviewedAt),
        createdAt: toMillis(row.createdAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(problemPractice).values(batch),
    )
  }

  if (data.practice.fsrsCards.length > 0) {
    await insertRowsInBatches(
      data.practice.fsrsCards.map((row) => ({
        ...row,
        dueAt: toMillis(row.dueAt),
        lastReviewAt: toMillisOrNull(row.lastReviewAt),
        createdAt: toMillis(row.createdAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(fsrsCards).values(batch),
    )
  }

  if (data.practice.reviewAttempts.length > 0) {
    await insertRowsInBatches(
      data.practice.reviewAttempts.map((row) => ({
        ...row,
        reviewedAt: toMillis(row.reviewedAt),
        createdAt: toMillis(row.createdAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(reviewAttempts).values(batch),
    )
  }

  if (data.tracks.progress.length > 0) {
    await insertRowsInBatches(
      data.tracks.progress.map((row) => ({
        trackId: row.trackId,
        problemSlug: row.problemSlug,
        reviewAttemptId: row.reviewAttemptId,
        completedAt: toMillisOrNull(row.completedAt),
        completedRating: row.completedRating,
        createdAt: toMillis(row.createdAt),
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(trackProblemProgress).values(batch),
    )
  }

  if (data.settings.length > 0) {
    await insertRowsInBatches(
      data.settings.map((row) => ({
        ...row,
        updatedAt: toMillis(row.updatedAt),
      })),
      (batch) => db.insert(settingsKv).values(batch),
    )
  }
}

// Keep each statement beneath older SQLite builds' variable limit. The caller
// owns one restore transaction, so a later batch failure still rolls all rows back.
const restoreInsertBatchSize = 25

async function insertRowsInBatches<Row>(
  rows: readonly Row[],
  insert: (batch: Row[]) => unknown,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += restoreInsertBatchSize) {
    await insert(rows.slice(offset, offset + restoreInsertBatchSize))
  }
}

function toIso(value: number) {
  return new Date(value).toISOString()
}

function toIsoOrNull(value: number | null) {
  return value === null ? null : toIso(value)
}

function toMillis(value: string) {
  return new Date(value).getTime()
}

function toMillisOrNull(value: string | null) {
  return value === null ? null : toMillis(value)
}

function requireGroupTrackId(
  trackIdByGroupId: ReadonlyMap<string, string>,
  trackGroupId: string,
) {
  const trackId = trackIdByGroupId.get(trackGroupId)

  if (trackId === undefined) {
    throw new Error(
      `Invalid backup: membership references missing group ${trackGroupId}.`,
    )
  }

  return trackId
}
