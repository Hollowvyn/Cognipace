import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

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
import { createTestDb as createUninitializedTestDb } from '@/platform/db/test-db'
import {
  createPracticeGenerationKey,
  practiceReceiptAcknowledgementSchema,
  practiceReceiptCommandSummarySchema,
  statusFromReview,
} from '@/features/practice/domain'
import { preparePracticeStorage } from '@/features/practice/server/practice-storage-service'
import {
  overrideLastReviewResult,
  saveReviewResult,
  setPracticeSuspended,
} from '@/features/practice/server/practice-service'
import {
  createInitialFsrsCard,
  createFsrsSchedulerProfile,
  scheduleReviewWithProfile,
  serializeFsrsReviewLogSnapshot,
  serializeFsrsCardSnapshot,
  serializeFsrsSchedulerProfile,
  toSerializableFsrsCardSnapshot,
} from '@/lib/fsrs'
import { createBackupRepository } from '../data/backup-repository'

import { backupSchemaVersion, type BackupFile } from '../api/backup-contracts'
import { prepareFullBackupRestore } from '../domain/backup-preflight'
import {
  exportFullBackup,
  resetLocalData,
  restoreFullBackup,
  restoreValidatedBackupData,
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
  it('retains opaque card IDs for Save and Update after export and restore', async () => {
    const source = await createTestDb({ now })
    await insertCustomState(source.db)
    const backup = await exportFullBackup(source.db, { exportedAt: now })
    const target = await createTestDb({ now })
    await restoreFullBackup(target.db, backup)
    const saved = await saveReviewResult(target.db, {
      problemSlug: 'custom-problem',
      rating: 'hard',
      reviewAttemptId: 'opaque-after-restore',
      reviewedAt: new Date(timestamp + 86_400_000),
    })
    const corrected = await overrideLastReviewResult(target.db, {
      problemSlug: 'custom-problem',
      targetAttemptId: saved.reviewAttemptId,
      expectedRevision: 0,
      rating: 'easy',
    })
    expect(saved.cardId).toBe('card-custom')
    expect(corrected.cardId).toBe('card-custom')
    expect(await target.db.select().from(fsrsCards)).toHaveLength(1)
    expect(() => validateFullBackup(backup)).not.toThrow()
    const exported = await exportFullBackup(target.db, { exportedAt: now })
    expect(() => validateFullBackup(exported)).not.toThrow()
  })

  it('corrects a new captured Save after restore while preserving retained known history', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = withSchedulingHistory(
      await exportFullBackup(db, { exportedAt: now }),
    )
    await restoreFullBackup(db, backup)
    const saved = await saveReviewResult(db, {
      problemSlug: 'custom-problem',
      rating: 'good',
      reviewAttemptId: 'new-captured-after-known',
      reviewedAt: new Date(timestamp + 172_800_000),
    })
    const before = await createBackupRepository(db).readBackupData()
    await overrideLastReviewResult(db, {
      problemSlug: 'custom-problem',
      targetAttemptId: saved.reviewAttemptId,
      expectedRevision: 0,
      rating: 'easy',
    })
    const after = await createBackupRepository(db).readBackupData()
    expect(
      after.practice.reviewAttempts.filter(
        (row) => row.id !== saved.reviewAttemptId,
      ),
    ).toEqual(
      before.practice.reviewAttempts.filter(
        (row) => row.id !== saved.reviewAttemptId,
      ),
    )
    expect(
      after.practice.reviewEvidence.filter(
        (row) => row.reviewAttemptId !== saved.reviewAttemptId,
      ),
    ).toEqual(
      before.practice.reviewEvidence.filter(
        (row) => row.reviewAttemptId !== saved.reviewAttemptId,
      ),
    )
    expect(after.practice.schedulerProfiles).toEqual(
      before.practice.schedulerProfiles,
    )
    const exported = await exportFullBackup(db, { exportedAt: now })
    expect(() => validateFullBackup(exported)).not.toThrow()
  })

  it('round trips untouched suspension and accepts New cards with zero memory and no last review', async () => {
    const { db } = await createTestDb({ now })
    await setPracticeSuspended(db, { problemSlug: 'two-sum', suspended: true })
    const backup = await exportFullBackup(db, { exportedAt: now })
    backup.data.practice.fsrsCards.push({
      id: 'new/opaque',
      problemSlug: 'two-sum',
      cardKind: 'default',
      ...toSerializableFsrsCardSnapshot(createInitialFsrsCard(now)),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    expect(() => validateFullBackup(backup)).not.toThrow()
    await restoreFullBackup(db, backup)
    const exported = await exportFullBackup(db, { exportedAt: now })
    expect(exported.data.practice.problemPractice[0]).toMatchObject({
      problemSlug: 'two-sum',
      isSuspended: true,
    })
    expect(exported.data.practice.fsrsCards).toEqual(
      backup.data.practice.fsrsCards,
    )
    expect(() => validateFullBackup(exported)).not.toThrow()
  })

  it('uses a detached synchronous preparation and preserves historical corrected receipts through restore', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = withSchedulingHistory(
      await exportFullBackup(db, { exportedAt: now }),
    )
    const original = structuredClone(backup)
    const prepared = prepareFullBackupRestore(backup)
    expect(prepared).not.toBeInstanceOf(Promise)
    expect(prepared.summary).toEqual(validateFullBackup(backup))
    expect(backup).toEqual(original)
    prepared.data.practice.reviewAttempts[0]!.notes = 'detached edit'
    expect(backup).toEqual(original)

    await restoreFullBackup(db, backup)
    const exported = await exportFullBackup(db, { exportedAt: now })
    expect(exported.data.practice).toEqual({
      ...backup.data.practice,
      generations: exported.data.practice.generations,
    })
    expect(exported.data.practice.generations).not.toEqual(
      backup.data.practice.generations,
    )
    expect(exported.data.settings).toEqual(backup.data.settings)
    expect(exported.data.tracks.progress).toEqual(backup.data.tracks.progress)
    expect(() => validateFullBackup(exported)).not.toThrow()
  })

  it.each([
    'profile-version',
    'profile-clipping',
    'profile-weights',
    'duplicate-profile',
    'missing-profile',
    'missing-evidence',
    'wrong-evidence-card',
    'duplicate-sequence',
    'negative-revision',
    'assessment-rating',
    'generation-scope',
    'generation-local',
    'generation-key',
    'dangling-receipt',
    'forged-ack',
    'update-revision',
    'save-target',
    'receipt-card',
    'receipt-status',
    'receipt-log',
  ])(
    'rejects invalid metadata before any delete through full and typed restore: %s',
    async (caseName) => {
      const { db } = await createTestDb({ now })
      await insertCustomState(db)
      const before = await createBackupRepository(db).readBackupData()
      const backup = withSchedulingHistory(
        await exportFullBackup(db, { exportedAt: now }),
      )
      const practice = backup.data.practice
      const evidence = practice.reviewEvidence[0]!
      const receipt = practice.commandReceipts[0]!
      const profile = JSON.parse(
        practice.schedulerProfiles[0]!.profileJson,
      ) as {
        libraryVersion: string
        parameters: { weights: number[]; maximumInterval: number }
      }
      const ack = practiceReceiptAcknowledgementSchema.parse(
        JSON.parse(receipt.resultJson),
      )
      const summary = practiceReceiptCommandSummarySchema.parse(
        JSON.parse(receipt.commandSummaryJson),
      )
      if (caseName === 'profile-version') profile.libraryVersion = '6.0.0'
      if (caseName === 'profile-clipping')
        profile.parameters.weights[0] = 1_000_000_000
      if (caseName === 'profile-weights') profile.parameters.weights.pop()
      if (caseName.startsWith('profile-'))
        practice.schedulerProfiles[0]!.profileJson = JSON.stringify(profile)
      if (caseName === 'duplicate-profile')
        practice.schedulerProfiles.push({
          ...practice.schedulerProfiles[0]!,
          id: 'duplicate-canonical-profile',
        })
      if (caseName === 'missing-profile')
        evidence.schedulerProfileId = 'missing'
      if (caseName === 'missing-evidence') practice.reviewEvidence.shift()
      if (caseName === 'wrong-evidence-card') evidence.cardId = 'missing'
      if (caseName === 'duplicate-sequence')
        practice.reviewEvidence[1]!.applicationSequence =
          evidence.applicationSequence
      if (caseName === 'negative-revision') evidence.revision = -1
      if (caseName === 'assessment-rating')
        evidence.assessmentEvidenceJson = JSON.stringify({
          schemaVersion: 1,
          source: 'manual',
          policyVersion: null,
          submissionIntent: null,
          reasonCode: null,
          lockReason: null,
          finalRating: 'easy',
        })
      if (caseName === 'generation-scope')
        practice.generations[0]!.scopeId = 'other'
      if (caseName === 'generation-local')
        practice.generations = practice.generations.filter(
          (row) => row.scopeId !== 'local',
        )
      if (caseName === 'generation-key')
        receipt.generationKey = '[ "old-local", "old-problem" ]'
      if (caseName === 'dangling-receipt') receipt.reviewAttemptId = 'missing'
      if (caseName === 'forged-ack') ack.cardId = 'missing'
      if (caseName === 'update-revision') summary.expectedRevision = 2
      if (caseName === 'save-target') {
        receipt.operation = 'save'
        receipt.revision = 0
        ack.operation = 'save'
        ack.revision = 0
      }
      if (caseName === 'receipt-card') ack.card.lastReviewAt = null
      if (caseName === 'receipt-status') ack.status = 'new'
      if (caseName === 'receipt-log') ack.fsrsReviewLog!.rating = 'easy'
      receipt.resultJson = JSON.stringify(ack)
      receipt.commandSummaryJson = JSON.stringify(summary)
      const transaction = vi.spyOn(db, 'transaction')

      expect(() => validateFullBackup(backup)).toThrow()
      await expect(restoreFullBackup(db, backup)).rejects.toThrow()
      await expect(restoreValidatedBackupData(db, backup)).rejects.toThrow()
      expect(transaction).not.toHaveBeenCalled()
      expect(await createBackupRepository(db).readBackupData()).toEqual(before)
    },
  )

  it.each([
    'negative-memory',
    'unsafe-counter',
    'missing-last-review',
    'log-rating',
    'log-time',
  ])('rejects malformed scheduling before any delete: %s', async (caseName) => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backup = await exportFullBackup(db, { exportedAt: now })
    const card = backup.data.practice.fsrsCards[0]!
    const attempt = backup.data.practice.reviewAttempts[0]!
    if (caseName === 'negative-memory') card.stability = -1
    if (caseName === 'unsafe-counter') card.reps = Number.MAX_SAFE_INTEGER + 1
    if (caseName === 'missing-last-review') card.lastReviewAt = null
    if (caseName.startsWith('log-')) {
      const profile = createFsrsSchedulerProfile({ targetRetention: 0.75 })
      const scheduled = scheduleReviewWithProfile(
        createInitialFsrsCard(now),
        caseName === 'log-rating' ? 'hard' : 'good',
        caseName === 'log-time' ? new Date(timestamp + 1_000) : now,
        profile,
      )
      attempt.fsrsReviewLog = serializeFsrsReviewLogSnapshot(scheduled.log)
    }
    const before = await createBackupRepository(db).readBackupData()
    const transaction = vi.spyOn(db, 'transaction')

    expect(() => validateFullBackup(backup)).toThrow()
    await expect(restoreFullBackup(db, backup)).rejects.toThrow()
    expect(transaction).not.toHaveBeenCalled()
    expect(await createBackupRepository(db).readBackupData()).toEqual(before)
  })

  it('exports and restores current external-progress policy without derived progress rows', async () => {
    const source = await createTestDb({ now })
    await insertCustomState(source.db)
    await source.db.update(tracks).set({ allowExternalProgress: true })

    const backup = await exportFullBackup(source.db, { exportedAt: now })

    expect(backup.schemaVersion).toBe(backupSchemaVersion)
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
        practice: {
          problemPractice: current.data.practice.problemPractice,
          fsrsCards: current.data.practice.fsrsCards,
          reviewAttempts: current.data.practice.reviewAttempts,
        },
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
    const secondRestore = await createBackupRepository(
      target.db,
    ).readBackupData()
    expect(secondRestore).toEqual({
      ...firstRestore,
      practice: {
        ...firstRestore.practice,
        generations: secondRestore.practice.generations,
      },
    })
    expect(secondRestore.practice.generations).not.toEqual(
      firstRestore.practice.generations,
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
  await preparePracticeStorage(db, now)
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

async function createTestDb(
  options: Parameters<typeof createUninitializedTestDb>[0],
) {
  const handle = await createUninitializedTestDb(options)
  await preparePracticeStorage(handle.db, now)
  return handle
}

function withSchedulingHistory(backup: BackupFile): BackupFile {
  const result = structuredClone(backup)
  const practice = result.data.practice
  const originalAttempt = practice.reviewAttempts[0]!
  const originalCard = practice.fsrsCards[0]!
  const oldProfile = createFsrsSchedulerProfile({ targetRetention: 0.75 })
  const currentProfile = createFsrsSchedulerProfile({ targetRetention: 0.85 })
  const initial = createInitialFsrsCard(now)
  const historical = scheduleReviewWithProfile(initial, 'good', now, oldProfile)
  const corrected = scheduleReviewWithProfile(
    initial,
    'again',
    now,
    currentProfile,
  )
  const laterTime = new Date(timestamp + 86_400_000)
  const later = scheduleReviewWithProfile(
    corrected.card,
    'good',
    laterTime,
    currentProfile,
  )
  Object.assign(originalCard, toSerializableFsrsCardSnapshot(later.card))
  originalAttempt.rating = 'again'
  originalAttempt.fsrsReviewLog = serializeFsrsReviewLogSnapshot(corrected.log)
  practice.reviewAttempts.push(
    {
      ...originalAttempt,
      id: 'later-attempt',
      rating: 'good',
      reviewedAt: laterTime.toISOString(),
      fsrsReviewLog: serializeFsrsReviewLogSnapshot(later.log),
    },
    {
      ...originalAttempt,
      id: 'unknown-tied-attempt',
      rating: 'hard',
      reviewedAt: laterTime.toISOString(),
      fsrsReviewLog: null,
    },
  )
  practice.schedulerProfiles = [
    {
      id: 'current-profile',
      profileJson: serializeFsrsSchedulerProfile(currentProfile),
      createdAt: now.toISOString(),
    },
    {
      id: 'historical-profile',
      profileJson: serializeFsrsSchedulerProfile(oldProfile),
      createdAt: now.toISOString(),
    },
  ]
  practice.reviewEvidence = [
    {
      reviewAttemptId: originalAttempt.id,
      cardId: originalCard.id,
      applicationSequence: 7,
      revision: 2,
      sequenceSource: 'applied',
      schedulingEvidenceKind: 'legacy-derived',
      schedulerProfileId: 'current-profile',
      preCardJson: serializeFsrsCardSnapshot(initial),
      assessmentEvidenceJson: null,
    },
    {
      reviewAttemptId: 'later-attempt',
      cardId: originalCard.id,
      applicationSequence: 8,
      revision: 0,
      sequenceSource: 'applied',
      schedulingEvidenceKind: 'captured',
      schedulerProfileId: 'current-profile',
      preCardJson: serializeFsrsCardSnapshot(corrected.card),
      assessmentEvidenceJson: null,
    },
    {
      reviewAttemptId: 'unknown-tied-attempt',
      cardId: originalCard.id,
      applicationSequence: 9,
      revision: 0,
      sequenceSource: 'legacy-inferred',
      schedulingEvidenceKind: 'unknown',
      schedulerProfileId: null,
      preCardJson: null,
      assessmentEvidenceJson: null,
    },
  ]
  practice.commandReceipts = [
    {
      generationKey: createPracticeGenerationKey({
        localGenerationToken: 'historical-local',
        problemGenerationToken: 'historical-problem',
      }),
      commandId: 'historical-good-correction',
      payloadFingerprint: 'a'.repeat(64),
      operation: 'update',
      problemSlug: originalAttempt.problemSlug,
      cardId: originalCard.id,
      reviewAttemptId: originalAttempt.id,
      applicationSequence: 7,
      revision: 1,
      acceptedAt: now.toISOString(),
      commandSummaryJson: JSON.stringify({
        schemaVersion: 1,
        rating: 'good',
        reviewedAt: now.toISOString(),
        targetAttemptId: originalAttempt.id,
        expectedRevision: 0,
      }),
      resultJson: JSON.stringify({
        schemaVersion: 1,
        operation: 'update',
        problemSlug: originalAttempt.problemSlug,
        cardId: originalCard.id,
        reviewAttemptId: originalAttempt.id,
        applicationSequence: 7,
        revision: 1,
        rating: 'good',
        reviewedAt: now.toISOString(),
        dueAt: historical.card.dueAt.toISOString(),
        status: statusFromReview('good', historical.card),
        card: toSerializableFsrsCardSnapshot(historical.card),
        fsrsReviewLog: historical.log,
        schedulingEvidenceKind: 'captured',
        schedulerProfileId: 'historical-profile',
      }),
    },
  ]
  return result
}
