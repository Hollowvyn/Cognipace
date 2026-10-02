import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { defaultUserSettings } from '@/features/settings/domain'
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
import { createTestDb } from '@/platform/db/test-db'
import { createBackupRepository } from '../data/backup-repository'

import { backupSchemaVersion, type BackupFile } from '../api/backup-contracts'
import {
  exportFullBackup,
  resetLocalData,
  restoreFullBackup,
  validateFullBackup,
} from './backup-service'

const now = new Date('2026-05-25T12:00:00.000Z')
const timestamp = now.getTime()
const settingsValue = JSON.stringify({
  ...defaultUserSettings,
  practice: {
    ...defaultUserSettings.practice,
    dailyGoal: 5,
  },
})

describe('backup service', () => {
  it('exports and restores v5 external-progress policy without derived progress rows', async () => {
    const source = await createTestDb({ now })
    await insertCustomState(source.db)
    await source.db.update(tracks).set({ allowExternalProgress: true })

    const backup = await exportFullBackup(source.db, { exportedAt: now })

    expect(backup.schemaVersion).toBe(5)
    expect(backup.data.tracks.tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'custom-track',
          allowExternalProgress: true,
        }),
      ]),
    )
    const target = await createTestDb({ now })
    await restoreFullBackup(target.db, backup)

    expect(await target.db.select().from(tracks)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'custom-track',
          allowExternalProgress: true,
        }),
      ]),
    )
    const restored = await exportFullBackup(target.db, { exportedAt: now })
    expect(restored.data.tracks.progress).toEqual(backup.data.tracks.progress)
    expect(restored.data.practice.reviewAttempts).toEqual(
      backup.data.practice.reviewAttempts,
    )
  })

  it('restores v4 tracks with external progress disabled and preserves practice history', async () => {
    const source = await createTestDb({ now })
    await insertCustomState(source.db)
    const current = await exportFullBackup(source.db, { exportedAt: now })
    const legacy = {
      ...current,
      schemaVersion: 4,
      data: {
        ...current.data,
        tracks: {
          ...current.data.tracks,
          tracks: current.data.tracks.tracks.map((track) =>
            Object.fromEntries(
              Object.entries(track).filter(
                ([key]) => key !== 'allowExternalProgress',
              ),
            ),
          ),
        },
      },
    }
    const target = await createTestDb({ now })
    await insertCustomState(target.db)
    await target.db.update(tracks).set({ allowExternalProgress: true })

    await restoreFullBackup(target.db, legacy)

    expect(await target.db.select().from(tracks)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'custom-track',
          allowExternalProgress: false,
        }),
      ]),
    )
    const restored = await exportFullBackup(target.db, { exportedAt: now })
    expect(restored.data.practice.reviewAttempts).toEqual(
      current.data.practice.reviewAttempts,
    )
    expect(restored.data.tracks.progress).toEqual(current.data.tracks.progress)
  })

  it('exports a versioned CogniPace backup including problems and tracks', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)

    const backup = await exportFullBackup(db, {
      appVersion: '1.0.0',
      exportedAt: now,
      extensionVersion: '2.0.0',
    })

    expect(backup).toMatchObject({
      schemaVersion: backupSchemaVersion,
      app: 'cognipace',
      exportedAt: now.toISOString(),
      source: { appVersion: '1.0.0', extensionVersion: '2.0.0' },
    })
    expect(backup.data.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'custom-problem' }),
      ]),
    )
    expect(backup.data.tracks.tracks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'custom-track' })]),
    )
  })

  it('validates a backup and returns counts without writing', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })

    const summary = validateFullBackup(backup)

    expect(summary).toMatchObject({
      schemaVersion: backup.schemaVersion,
      exportedAt: backup.exportedAt,
      source: backup.source,
      counts: {
        problems: backup.data.problems.length,
        tracks: backup.data.tracks.tracks.length,
        settings: 1,
      },
    })
    expect(await rowsForProblem(db, 'custom-problem')).toHaveLength(1)
  })

  it('rejects mismatched app and unsupported backup versions', async () => {
    const { db } = await createTestDb({ now })
    const backup = await exportFullBackup(db, { exportedAt: now })

    expect(() => validateFullBackup({ ...backup, app: 'other-app' })).toThrow(
      /not a CogniPace backup/i,
    )
    expect(() =>
      validateFullBackup({ ...backup, schemaVersion: backupSchemaVersion + 1 }),
    ).toThrow(/unsupported backup version/i)
  })

  it('rejects broken references before restore writes and preserves existing rows', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })
    const malformedBackup = {
      ...backup,
      data: {
        ...backup.data,
        problemTopics: [
          ...backup.data.problemTopics,
          { problemSlug: 'custom-problem', topicId: 'missing-topic' },
        ],
      },
    } satisfies BackupFile

    await expect(restoreFullBackup(db, malformedBackup)).rejects.toThrow(
      /missing topic/i,
    )

    expect(await rowsForProblem(db, 'custom-problem')).toHaveLength(1)
    expect(await db.select().from(settingsKv)).toEqual([
      {
        key: 'user-settings',
        value: settingsValue,
        updatedAt: timestamp,
      },
    ])
  })

  it('rejects review attempts whose card belongs to another problem before restore writes', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })
    const malformedBackup = {
      ...backup,
      data: {
        ...backup.data,
        problems: [
          ...backup.data.problems,
          {
            slug: 'second-problem',
            title: 'Second Problem',
            difficulty: 'easy',
            isPremium: false,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
        practice: {
          ...backup.data.practice,
          reviewAttempts: backup.data.practice.reviewAttempts.map((attempt) =>
            attempt.id === 'attempt-custom'
              ? { ...attempt, problemSlug: 'second-problem' }
              : attempt,
          ),
        },
      },
    } satisfies BackupFile

    await expect(restoreFullBackup(db, malformedBackup)).rejects.toThrow(
      /card card-custom belongs to problem custom-problem/i,
    )

    expect(await rowsForProblem(db, 'custom-problem')).toHaveLength(1)
    expect(await rowsForProblem(db, 'second-problem')).toHaveLength(0)
  })

  it('rejects progress that references a review attempt for another problem', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })
    const malformedBackup = {
      ...backup,
      data: {
        ...backup.data,
        problems: [
          ...backup.data.problems,
          {
            slug: 'second-problem',
            title: 'Second Problem',
            difficulty: 'easy',
            isPremium: false,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
        practice: {
          ...backup.data.practice,
          fsrsCards: [
            ...backup.data.practice.fsrsCards,
            {
              ...backup.data.practice.fsrsCards.find(
                (card) => card.id === 'card-custom',
              )!,
              id: 'card-second',
              problemSlug: 'second-problem',
            },
          ],
          reviewAttempts: [
            ...backup.data.practice.reviewAttempts,
            {
              ...backup.data.practice.reviewAttempts.find(
                (attempt) => attempt.id === 'attempt-custom',
              )!,
              id: 'attempt-second',
              problemSlug: 'second-problem',
              cardId: 'card-second',
            },
          ],
        },
        tracks: {
          ...backup.data.tracks,
          progress: backup.data.tracks.progress.map((row) => ({
            ...row,
            reviewAttemptId: 'attempt-second',
          })),
        },
      },
    } satisfies BackupFile

    expect(() => validateFullBackup(malformedBackup)).toThrow(
      /progress custom-problem references review attempt attempt-second for problem second-problem/i,
    )
  })

  it('rejects duplicate DB identities before restore writes', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })

    expect(() =>
      validateFullBackup({
        ...backup,
        data: {
          ...backup.data,
          topics: [
            ...backup.data.topics,
            {
              id: 'custom-topic-copy',
              label: 'Custom Topic',
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
          ],
        },
      } satisfies BackupFile),
    ).toThrow(/topic key collision for "custom topic"/i)

    expect(() =>
      validateFullBackup({
        ...backup,
        data: {
          ...backup.data,
          companies: [
            ...backup.data.companies,
            { id: 'custom-company-copy', label: 'Custom Company' },
          ],
        },
      } satisfies BackupFile),
    ).toThrow(/duplicate company label Custom Company/i)

    expect(() =>
      validateFullBackup({
        ...backup,
        data: {
          ...backup.data,
          practice: {
            ...backup.data.practice,
            fsrsCards: [
              ...backup.data.practice.fsrsCards,
              {
                ...backup.data.practice.fsrsCards.find(
                  (card) => card.id === 'card-custom',
                )!,
                id: 'card-custom-copy',
              },
            ],
          },
        },
      } satisfies BackupFile),
    ).toThrow(/duplicate FSRS card problem\/kind custom-problem:default/i)

    expect(await rowsForProblem(db, 'custom-problem')).toHaveLength(1)
  })

  it('rejects duplicate problem identity within the same track', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })

    expect(() =>
      validateFullBackup({
        ...backup,
        data: {
          ...backup.data,
          tracks: {
            ...backup.data.tracks,
            groups: [
              ...backup.data.tracks.groups,
              {
                id: 'custom-group-2',
                trackId: 'custom-track',
                title: 'Custom Group 2',
                position: 2,
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
              },
            ],
            memberships: [
              ...backup.data.tracks.memberships,
              {
                trackGroupId: 'custom-group-2',
                problemSlug: 'custom-problem',
                position: 1,
              },
            ],
          },
        },
      } satisfies BackupFile),
    ).toThrow(/duplicate track problem identity/i)
  })

  it('rejects invalid active track session states', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })

    expect(() =>
      validateFullBackup({
        ...backup,
        data: {
          ...backup.data,
          tracks: {
            ...backup.data.tracks,
            session: [
              {
                ...backup.data.tracks.session[0]!,
                id: 'stale',
              },
            ],
          },
        },
      } satisfies BackupFile),
    ).toThrow(/unsupported track session id stale/i)

    expect(() =>
      validateFullBackup({
        ...backup,
        data: {
          ...backup.data,
          tracks: {
            ...backup.data.tracks,
            session: [
              {
                ...backup.data.tracks.session[0]!,
                activeTrackId: null,
                activeGroupId: 'custom-group',
              },
            ],
          },
        },
      } satisfies BackupFile),
    ).toThrow(/cannot have an active group without an active track/i)

    expect(() =>
      validateFullBackup({
        ...backup,
        data: {
          ...backup.data,
          tracks: {
            ...backup.data.tracks,
            tracks: [
              ...backup.data.tracks.tracks,
              {
                id: 'other-track',
                slug: 'other-track',
                title: 'Other Track',
                description: null,
                dueAt: null,
                allowExternalProgress: false,
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
              },
            ],
            session: [
              {
                ...backup.data.tracks.session[0]!,
                activeTrackId: 'other-track',
                activeGroupId: 'custom-group',
              },
            ],
          },
        },
      } satisfies BackupFile),
    ).toThrow(
      /active group custom-group does not belong to active track other-track/i,
    )
  })

  it('rejects progress rows outside track/problem membership', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })

    expect(() =>
      validateFullBackup({
        ...backup,
        data: {
          ...backup.data,
          tracks: {
            ...backup.data.tracks,
            tracks: [
              ...backup.data.tracks.tracks,
              {
                id: 'other-track',
                slug: 'other-track',
                title: 'Other Track',
                description: null,
                dueAt: null,
                allowExternalProgress: false,
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
              },
            ],
            progress: [
              {
                ...backup.data.tracks.progress[0]!,
                trackId: 'other-track',
              },
            ],
          },
        },
      } satisfies BackupFile),
    ).toThrow(/progress references missing membership other-track/i)
  })

  it('restores a backup over existing data', async () => {
    const source = await createTestDb({ now })
    await insertCustomState(source.db)
    const backup = await exportFullBackup(source.db, { exportedAt: now })

    const target = await createTestDb({ now })
    await insertOtherState(target.db)

    const summary = await restoreFullBackup(target.db, backup)

    expect(summary).toMatchObject({
      counts: {
        problems: backup.data.problems.length,
        tracks: backup.data.tracks.tracks.length,
      },
    })
    expect(await rowsForProblem(target.db, 'other-problem')).toHaveLength(0)
    expect(await rowsForProblem(target.db, 'custom-problem')).toHaveLength(1)
    expect(
      await target.db
        .select()
        .from(tracks)
        .where(eq(tracks.id, 'custom-track')),
    ).toHaveLength(1)
  })

  it('exports and restores topic aliases and relations', async () => {
    const source = await createTestDb({ now })
    await insertCustomState(source.db)
    await source.db.insert(topicAliases).values({
      aliasKey: 'custom alias',
      label: 'Custom Alias',
      topicId: 'custom-topic',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await source.db.insert(topics).values({
      id: 'custom-parent',
      label: 'Custom Parent',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await source.db.insert(topicRelations).values({
      sourceTopicId: 'custom-topic',
      targetTopicId: 'custom-parent',
      kind: 'broader' as const,
      createdAt: timestamp - 1000,
      updatedAt: timestamp,
    })
    await source.db.insert(topicRelations).values({
      sourceTopicId: 'custom-topic',
      targetTopicId: 'custom-parent',
      kind: 'applies-to',
      createdAt: timestamp - 2000,
      updatedAt: timestamp,
    })

    const backup = await exportFullBackup(source.db, { exportedAt: now })
    const target = await createTestDb({ now })

    await restoreFullBackup(target.db, backup)

    expect(await target.db.select().from(topicAliases)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ aliasKey: 'custom alias' }),
      ]),
    )
    expect(await target.db.select().from(topicRelations)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceTopicId: 'custom-topic',
          targetTopicId: 'custom-parent',
          kind: 'broader' as const,
          createdAt: timestamp - 1000,
        }),
        expect.objectContaining({
          sourceTopicId: 'custom-topic',
          targetTopicId: 'custom-parent',
          kind: 'applies-to',
          createdAt: timestamp - 2000,
        }),
      ]),
    )
    const firstRestore = await createBackupRepository(
      target.db,
    ).readBackupData()
    await restoreFullBackup(target.db, backup)
    expect(await createBackupRepository(target.db).readBackupData()).toEqual(
      firstRestore,
    )
  })

  it.each([
    {
      label: 'dangling alias topic',
      patch: (backup: BackupFile) => ({
        topicAliases: [
          ...backup.data.topicAliases,
          {
            aliasKey: 'missing alias',
            label: 'Missing Alias',
            topicId: 'missing-topic',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
      }),
      message: /targets unknown topic "missing-topic"/i,
    },
    {
      label: 'dangling relation parent',
      patch: (backup: BackupFile) => ({
        topicRelations: [
          ...backup.data.topicRelations,
          {
            sourceTopicId: 'custom-topic',
            targetTopicId: 'missing-parent',
            kind: 'broader' as const,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
      }),
      message: /unknown target topic "missing-parent"/i,
    },
    {
      label: 'dangling relation child',
      patch: (backup: BackupFile) => ({
        topicRelations: [
          ...backup.data.topicRelations,
          {
            sourceTopicId: 'missing-child',
            targetTopicId: 'custom-topic',
            kind: 'broader' as const,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
      }),
      message: /unknown source topic "missing-child"/i,
    },
    {
      label: 'duplicate alias key',
      patch: (backup: BackupFile) => ({
        topicAliases: [
          ...backup.data.topicAliases,
          {
            aliasKey: 'custom alias',
            label: 'Custom Alias',
            topicId: 'custom-topic',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          {
            aliasKey: 'custom alias',
            label: 'Custom Alias',
            topicId: 'custom-topic',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
      }),
      message: /duplicate topic alias key "custom alias"/i,
    },
    {
      label: 'duplicate relation pair',
      patch: (backup: BackupFile) => ({
        topics: [
          ...backup.data.topics,
          {
            id: 'custom-parent',
            label: 'Custom Parent',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
        topicRelations: [
          ...backup.data.topicRelations,
          {
            sourceTopicId: 'custom-topic',
            targetTopicId: 'custom-parent',
            kind: 'broader' as const,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          {
            sourceTopicId: 'custom-topic',
            targetTopicId: 'custom-parent',
            kind: 'broader' as const,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
      }),
      message: /duplicate broader topic relation/i,
    },
    {
      label: 'self-parent relation',
      patch: (backup: BackupFile) => ({
        topicRelations: [
          ...backup.data.topicRelations,
          {
            sourceTopicId: 'custom-topic',
            targetTopicId: 'custom-topic',
            kind: 'broader' as const,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
      }),
      message: /cannot be a self-link/i,
    },
    {
      label: 'duplicate problem-topic join',
      patch: (backup: BackupFile) => ({
        problemTopics: [
          ...backup.data.problemTopics,
          {
            problemSlug: 'custom-problem',
            topicId: 'custom-topic',
          },
        ],
      }),
      message: /duplicate problem-topic identity custom-problem/i,
    },
  ])(
    'rejects invalid topic graph backup rows: $label',
    async ({ patch, message }) => {
      const { db } = await createTestDb({ now })
      await insertCustomState(db)
      const backup = await exportFullBackup(db, { exportedAt: now })
      const patchedData = patch(backup)

      expect(() =>
        validateFullBackup({
          ...backup,
          data: {
            ...backup.data,
            ...patchedData,
          },
        } satisfies BackupFile),
      ).toThrow(message)
    },
  )

  it('allows topic graph rows with multiple parents', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })

    expect(() =>
      validateFullBackup({
        ...backup,
        data: {
          ...backup.data,
          topics: [
            ...backup.data.topics,
            {
              id: 'custom-parent-a',
              label: 'Custom Parent A',
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
            {
              id: 'custom-parent-b',
              label: 'Custom Parent B',
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
          ],
          topicRelations: [
            ...backup.data.topicRelations,
            {
              sourceTopicId: 'custom-topic',
              targetTopicId: 'custom-parent-a',
              kind: 'broader' as const,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
            {
              sourceTopicId: 'custom-topic',
              targetTopicId: 'custom-parent-b',
              kind: 'broader' as const,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
          ],
        },
      } satisfies BackupFile),
    ).not.toThrow()
  })

  it('rejects cyclic topic relation graphs', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })

    expect(() =>
      validateFullBackup({
        ...backup,
        data: {
          ...backup.data,
          topics: [
            ...backup.data.topics,
            {
              id: 'topic-a',
              label: 'Topic A',
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
            {
              id: 'topic-b',
              label: 'Topic B',
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
          ],
          topicRelations: [
            ...backup.data.topicRelations,
            {
              sourceTopicId: 'topic-b',
              targetTopicId: 'topic-a',
              kind: 'broader' as const,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
            {
              sourceTopicId: 'topic-a',
              targetTopicId: 'topic-b',
              kind: 'broader' as const,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
          ],
        },
      } satisfies BackupFile),
    ).toThrow(/broader relations contain a cycle/i)
  })

  it('resets local data to seeded defaults', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)

    await expect(resetLocalData(db, now)).resolves.toBeNull()

    expect(await rowsForProblem(db, 'custom-problem')).toHaveLength(0)
    expect(
      await db.select().from(problems).where(eq(problems.slug, 'two-sum')),
    ).toHaveLength(1)
    expect(await db.select().from(settingsKv)).toHaveLength(0)
    expect(await db.select().from(trackSession)).toEqual([
      expect.objectContaining({ id: 'active' }),
    ])
  })
})

type TestDb = Awaited<ReturnType<typeof createTestDb>>['db']

async function rowsForProblem(db: TestDb, slug: string) {
  return db.select().from(problems).where(eq(problems.slug, slug))
}

async function insertCustomState(db: TestDb) {
  await db.insert(topics).values({
    id: 'custom-topic',
    label: 'Custom Topic',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(companies).values({
    id: 'custom-company',
    label: 'Custom Company',
  })
  await db.insert(problems).values({
    slug: 'custom-problem',
    title: 'Custom Problem',
    difficulty: 'medium',
    isPremium: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(problemTopics).values({
    problemSlug: 'custom-problem',
    topicId: 'custom-topic',
  })
  await db.insert(problemCompanies).values({
    problemSlug: 'custom-problem',
    companyId: 'custom-company',
  })
  await db.insert(problemPractice).values({
    problemSlug: 'custom-problem',
    status: 'review',
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    lastReviewedAt: timestamp,
    lastRating: 'good',
    lastElapsedSeconds: 600,
    bestElapsedSeconds: 600,
    interviewPattern: 'hash-map',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(n)',
    languages: 'TypeScript',
    notes: 'review note',
    solvedCount: 1,
    attemptCount: 1,
    isSuspended: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(fsrsCards).values({
    id: 'card-custom',
    problemSlug: 'custom-problem',
    cardKind: 'default',
    dueAt: timestamp + 86_400_000,
    stability: 2.5,
    difficulty: 4.5,
    elapsedDays: 0,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    state: 'review',
    lastReviewAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(reviewAttempts).values({
    id: 'attempt-custom',
    problemSlug: 'custom-problem',
    cardId: 'card-custom',
    rating: 'good',
    reviewMode: 'manual',
    reviewedAt: timestamp,
    elapsedSeconds: 600,
    isCorrect: true,
    interviewPattern: 'hash-map',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(n)',
    languages: 'TypeScript',
    notes: 'review note',
    fsrsReviewLog: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(tracks).values({
    id: 'custom-track',
    slug: 'custom-track',
    title: 'Custom Track',
    description: 'Track description',
    dueAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(trackGroups).values({
    id: 'custom-group',
    trackId: 'custom-track',
    title: 'Custom Group',
    position: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(trackGroupProblems).values({
    trackGroupId: 'custom-group',
    trackId: 'custom-track',
    problemSlug: 'custom-problem',
    position: 1,
  })
  await db.insert(trackProblemProgress).values({
    trackId: 'custom-track',
    problemSlug: 'custom-problem',
    reviewAttemptId: 'attempt-custom',
    completedAt: timestamp,
    completedRating: 'good',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db
    .update(trackSession)
    .set({
      activeTrackId: 'custom-track',
      activeGroupId: 'custom-group',
      updatedAt: timestamp,
    })
    .where(eq(trackSession.id, 'active'))
  await db.insert(settingsKv).values({
    key: 'user-settings',
    value: settingsValue,
    updatedAt: timestamp,
  })
}

async function insertOtherState(db: TestDb) {
  await db.insert(problems).values({
    slug: 'other-problem',
    title: 'Other Problem',
    difficulty: 'easy',
    isPremium: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}
