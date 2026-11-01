import { createFrozenV6BackupFixture } from '@/features/backup/testing/backup-v6-fixture'
import { prepareFullBackupRestore } from '@/features/backup/domain/backup-preflight'
import { syncEnvelopeBackupInput } from './sync-envelope'
import { emptyNotesArchive } from '@/features/notes/domain/archive-validation'
import { describe, expect, it } from 'vitest'

import {
  backupSchemaVersion,
  type BackupFile,
} from '@/features/backup/api/backup-contracts'

import {
  needsArchiveRestoreReview,
  buildSyncEnvelope,
  parseSyncEnvelopeForCurrentApp,
  syncEnvelopeVersion,
} from './sync-envelope'

const backup: BackupFile = {
  schemaVersion: backupSchemaVersion,
  notesArchive: emptyNotesArchive(),
  app: 'cognipace',
  exportedAt: '2026-05-26T12:00:00.000Z',
  source: { appVersion: '0.0.0' },
  data: {
    problems: [],
    topics: [],
    topicAliases: [],
    topicRelations: [],
    companies: [],
    problemTopics: [],
    problemCompanies: [],
    practice: {
      problemPractice: [],
      fsrsCards: [],
      reviewAttempts: [],
      schedulerProfiles: [],
      reviewEvidence: [],
      generations: [],
      commandReceipts: [],
    },
    tracks: {
      tracks: [],
      groups: [],
      memberships: [],
      progress: [],
      session: [],
    },
    settings: [],
  },
}

const legacyBackup = {
  schemaVersion: 1,
  app: 'cognipace',
  exportedAt: '2026-05-26T12:00:00.000Z',
  source: { appVersion: '0.0.0' },
  data: {
    problems: [
      {
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        createdAt: '2026-05-26T12:00:00.000Z',
        updatedAt: '2026-05-26T12:00:00.000Z',
      },
    ],
    topics: [],
    companies: [],
    problemTopics: [],
    problemCompanies: [],
    practice: {
      problemPractice: [],
      fsrsCards: [],
      reviewAttempts: [],
    },
    tracks: {
      tracks: [
        {
          id: 'leetcode-75',
          slug: 'leetcode-75',
          title: 'LeetCode 75',
          description: null,
          dueAt: null,
          createdAt: '2026-05-26T12:00:00.000Z',
          updatedAt: '2026-05-26T12:00:00.000Z',
        },
      ],
      groups: [
        {
          id: 'leetcode-75:arrays',
          trackId: 'leetcode-75',
          title: 'Arrays',
          position: 1,
          createdAt: '2026-05-26T12:00:00.000Z',
          updatedAt: '2026-05-26T12:00:00.000Z',
        },
      ],
      memberships: [
        {
          trackGroupId: 'leetcode-75:arrays',
          problemSlug: 'two-sum',
          position: 1,
        },
      ],
      progress: [
        {
          trackGroupId: 'leetcode-75:arrays',
          problemSlug: 'two-sum',
          completedAt: '2026-05-26T12:00:00.000Z',
          completedRating: 'good',
          createdAt: '2026-05-26T12:00:00.000Z',
          updatedAt: '2026-05-26T12:00:00.000Z',
        },
      ],
      session: [],
    },
    settings: [],
  },
}

describe('sync envelope', () => {
  it('wraps a CogniPace backup with sync metadata', () => {
    expect(
      buildSyncEnvelope({
        backup,
        exportedAt: new Date('2026-05-26T12:00:01.000Z'),
        dataUpdatedAt: '2026-05-26T12:00:00.000Z',
      }),
    ).toMatchObject({
      syncEnvelopeVersion: 1,
      app: 'cognipace',
      exportedAt: '2026-05-26T12:00:01.000Z',
      dataUpdatedAt: '2026-05-26T12:00:00.000Z',
      backup: { ...backup, schemaVersion: 7 },
    })
  })

  it('rejects future sync envelope versions before restore', () => {
    expect(() =>
      parseSyncEnvelopeForCurrentApp({
        syncEnvelopeVersion: syncEnvelopeVersion + 1,
        app: 'cognipace',
        exportedAt: '2026-05-26T12:00:00.000Z',
        dataUpdatedAt: '2026-05-26T12:00:00.000Z',
        backup,
      }),
    ).toThrow('Unsupported sync envelope version')
  })

  it('rejects non-CogniPace sync files before restore', () => {
    expect(() =>
      parseSyncEnvelopeForCurrentApp({
        syncEnvelopeVersion,
        app: 'other-app',
        exportedAt: '2026-05-26T12:00:00.000Z',
        dataUpdatedAt: '2026-05-26T12:00:00.000Z',
        backup,
      }),
    ).toThrow('not a CogniPace sync file')
  })

  it('rejects future backup versions with the backup version error', () => {
    expect(() =>
      parseSyncEnvelopeForCurrentApp({
        syncEnvelopeVersion,
        app: 'cognipace',
        exportedAt: '2026-05-26T12:00:00.000Z',
        dataUpdatedAt: '2026-05-26T12:00:00.000Z',
        backup: {
          ...backup,
          schemaVersion: backupSchemaVersion + 1,
        },
      }),
    ).toThrow('Unsupported backup version')
  })

  it('normalizes a v1 backup payload inside a sync envelope', () => {
    const envelope = parseSyncEnvelopeForCurrentApp({
      syncEnvelopeVersion,
      app: 'cognipace',
      exportedAt: '2026-05-26T12:00:01.000Z',
      dataUpdatedAt: '2026-05-26T12:00:00.000Z',
      backup: legacyBackup,
    })

    expect(envelope.backup.schemaVersion).toBe(backupSchemaVersion)
    expect(envelope.backup.data.tracks.tracks[0]).toMatchObject({
      allowExternalProgress: false,
    })
    expect(envelope.backup.data.tracks.progress).toEqual([
      expect.objectContaining({
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
        reviewAttemptId: null,
      }),
    ])
  })

  it('normalizes v3 topic rows inside the unchanged sync envelope version', () => {
    const v3Backup = {
      ...Object.fromEntries(
        Object.entries(backup).filter(([key]) => key !== 'notesArchive'),
      ),
      schemaVersion: 3,
      data: {
        ...backup.data,
        practice: {
          problemPractice: backup.data.practice.problemPractice,
          fsrsCards: backup.data.practice.fsrsCards,
          reviewAttempts: backup.data.practice.reviewAttempts,
        },
        topics: [
          {
            id: 'array',
            label: 'Array',
            createdAt: backup.exportedAt,
            updatedAt: backup.exportedAt,
          },
          {
            id: 'hash-table',
            label: 'Hash Table',
            createdAt: backup.exportedAt,
            updatedAt: backup.exportedAt,
          },
        ],
        topicAliases: [],
        topicRelations: [
          {
            parentTopicId: 'array',
            childTopicId: 'hash-table',
            createdAt: backup.exportedAt,
            updatedAt: backup.exportedAt,
          },
        ],
      },
    }

    const envelope = parseSyncEnvelopeForCurrentApp({
      syncEnvelopeVersion,
      app: 'cognipace',
      exportedAt: backup.exportedAt,
      dataUpdatedAt: backup.exportedAt,
      backup: v3Backup,
    })

    expect(envelope.syncEnvelopeVersion).toBe(syncEnvelopeVersion)
    expect(envelope.backup.schemaVersion).toBe(backupSchemaVersion)
    expect(envelope.backup.data.topicRelations).toContainEqual(
      expect.objectContaining({
        sourceTopicId: 'hash-table',
        targetTopicId: 'array',
        kind: 'broader',
      }),
    )
  })
})

it('retains original legacy format through envelope normalization without serializing a second backup', async () => {
  const legacy = createFrozenV6BackupFixture()
  const envelope = parseSyncEnvelopeForCurrentApp({
    syncEnvelopeVersion: 1,
    app: 'cognipace',
    exportedAt: legacy.exportedAt,
    dataUpdatedAt: legacy.exportedAt,
    backup: legacy,
  })
  expect(envelope.backup.schemaVersion).toBe(7)
  const prepared = await prepareFullBackupRestore(
    syncEnvelopeBackupInput(envelope),
  )
  expect(prepared).toMatchObject({
    sourceSchemaVersion: 6,
    archiveAbsent: true,
  })
  expect(
    Object.keys(
      JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>,
    ),
  ).toEqual([
    'syncEnvelopeVersion',
    'app',
    'exportedAt',
    'dataUpdatedAt',
    'backup',
  ])
})

it('requires review only for automatic legacy replacement of a populated archive', () => {
  expect(
    needsArchiveRestoreReview({
      automatic: true,
      sourceSchemaVersion: 6,
      currentArchiveHasData: true,
    }),
  ).toBe(true)
  expect(
    needsArchiveRestoreReview({
      automatic: false,
      sourceSchemaVersion: 6,
      currentArchiveHasData: true,
    }),
  ).toBe(false)
  expect(
    needsArchiveRestoreReview({
      automatic: true,
      sourceSchemaVersion: 7,
      currentArchiveHasData: true,
    }),
  ).toBe(false)
  expect(
    needsArchiveRestoreReview({
      automatic: true,
      sourceSchemaVersion: 6,
      currentArchiveHasData: false,
    }),
  ).toBe(false)
})
