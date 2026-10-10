import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// This platform integration test verifies feature progress reads after snapshot upgrade.
// eslint-disable-next-line no-restricted-imports
import { buildPracticeProgressSummary } from '@/features/practice/domain/practice-progress'
// This platform integration test verifies the owning settings repository reads preserved values.
// eslint-disable-next-line no-restricted-imports
import { createSettingsRepository } from '@/features/settings/data/settings-repository'
// This platform integration test verifies real feature-owned migration preparation.
// eslint-disable-next-line no-restricted-imports
import {
  preparePracticeStorage,
  readPracticeStorageData,
  validatePracticeStorage,
} from '@/features/practice/server/practice-storage-service'
import { getBackgroundDb } from '@/extension/background/app-db'
import { expectedV9MigrationFingerprint } from '@/testing/fixtures/fsrs-remediation-legacy-migrations'
import {
  makeFsrsPreservationSnapshot,
  preservationNow,
  preservationTables,
  readPreservationRows,
  readProgressAttempts,
} from '@/testing/fixtures/fsrs-preservation'
import type { DbHandle } from './client'
import { flushDbSnapshot, getAppDb, resetAppDbForTesting } from './instance'
import { migrationEntries, migrationSql } from './migration-sql'
import {
  bytesToBase64,
  computeFingerprint,
  FINGERPRINT_KEY,
  SNAPSHOT_KEY,
} from './snapshot'
import {
  FSRS_RECOVERY_KEY,
  RECOVERY_KEY,
  TRACK_RECOVERY_KEY,
} from './snapshot-state'

const handles: DbHandle[] = []

class PreservationStorage {
  readonly values: Record<string, unknown> = {}
  failure: 'recovery' | 'publication' | null = null

  get = vi.fn((keys: string[]) =>
    Promise.resolve(
      Object.fromEntries(
        keys
          .filter((key) => Object.hasOwn(this.values, key))
          .map((key) => [key, this.values[key]]),
      ),
    ),
  )

  set = vi.fn((values: Record<string, unknown>) => {
    if (this.failure === 'recovery' && FSRS_RECOVERY_KEY in values) {
      return Promise.reject(new Error('recovery storage unavailable'))
    }
    if (this.failure === 'publication' && SNAPSHOT_KEY in values) {
      return Promise.reject(new Error('snapshot storage unavailable'))
    }
    Object.assign(this.values, values)
    return Promise.resolve()
  })
}

beforeEach(() => resetAppDbForTesting())

afterEach(() => {
  resetAppDbForTesting()
  while (handles.length > 0) handles.pop()?.rawDb.close()
  vi.unstubAllGlobals()
})

async function installPopulatedStorage() {
  const fixture = await makeFsrsPreservationSnapshot()
  const storage = new PreservationStorage()
  const original = {
    [SNAPSHOT_KEY]: bytesToBase64(fixture.bytes),
    [FINGERPRINT_KEY]: expectedV9MigrationFingerprint,
  }
  const earlier = {
    [RECOVERY_KEY]: {
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: 'earlier v7 original',
        [FINGERPRINT_KEY]: 'b1c2b4d7',
      },
      savedAt: '2026-10-01T16:00:00.000Z',
    },
    [TRACK_RECOVERY_KEY]: {
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: 'earlier v8 original',
        [FINGERPRINT_KEY]: 'a35941fc',
      },
      savedAt: '2026-10-02T16:00:00.000Z',
    },
  }
  Object.assign(storage.values, original, earlier)
  vi.stubGlobal('chrome', { storage: { local: storage } })
  return { fixture, storage, earlier, original }
}

function expectEarlierRecoveries(
  storage: PreservationStorage,
  earlier: Record<string, unknown>,
) {
  expect(storage.values[RECOVERY_KEY]).toEqual(earlier[RECOVERY_KEY])
  expect(storage.values[TRACK_RECOVERY_KEY]).toEqual(
    earlier[TRACK_RECOVERY_KEY],
  )
}

function progress(attempts: ReturnType<typeof readProgressAttempts>) {
  return buildPracticeProgressSummary(attempts, {
    dailyGoal: 2,
    now: preservationNow,
  })
}

describe('populated FSRS snapshot preservation', () => {
  it('uses the real appended evidence migration', () => {
    expect(migrationEntries.at(-1)?.path).toBe(
      './migrations/0010_fsrs_evidence.sql',
    )
  })

  it('keeps all original rows through the production background bridge', async () => {
    const { fixture } = await installPopulatedStorage()
    const handle = await getBackgroundDb()
    handles.push(handle)

    expect(readPreservationRows(handle)).toEqual(fixture.rows)
    expect(await createSettingsRepository(handle.db).getSettings()).toEqual(
      fixture.settings,
    )
  })

  it('preserves every populated table and consumer reads across staged upgrade, flush, and matching reopen', async () => {
    const { fixture, storage, earlier, original } =
      await installPopulatedStorage()
    expect(preservationTables).toHaveLength(16)
    for (const table of preservationTables)
      expect(fixture.rows[table]).not.toHaveLength(0)
    expect(fixture.rows.review_attempts).toHaveLength(6)
    expect(fixture.rows.fsrs_cards).toHaveLength(4)
    const expectedProgress = progress(fixture.attemptsForProgress)
    expect(expectedProgress).toMatchObject({
      completedToday: 2,
      currentStreak: 2,
      goalMetToday: true,
    })

    const beforePublish = vi.fn(async (handle: DbHandle, context: unknown) => {
      expect(context).toEqual({
        kind: 'upgrade',
        fromFingerprint: expectedV9MigrationFingerprint,
      })
      expect(readPreservationRows(handle)).toEqual(fixture.rows)
      expect(storage.values[SNAPSHOT_KEY]).toBe(original[SNAPSHOT_KEY])
      expect(storage.values[FINGERPRINT_KEY]).toBe(original[FINGERPRINT_KEY])
      expect(storage.values[FSRS_RECOVERY_KEY]).toEqual({
        version: 1,
        raw: original,
        savedAt: expect.any(String) as unknown,
      })
      expect(await createSettingsRepository(handle.db).getSettings()).toEqual(
        fixture.settings,
      )
      await preparePracticeStorage(handle.db, preservationNow)
      expect(readPreservationRows(handle)).toEqual(fixture.rows)
    })
    const upgraded = await getAppDb({
      beforePublish,
      validateCurrentData: (handle) => validatePracticeStorage(handle.db),
    })
    handles.push(upgraded)
    expect(beforePublish).toHaveBeenCalledOnce()
    expect(readPreservationRows(upgraded)).toEqual(fixture.rows)
    expect(
      upgraded.rawDb.exec({
        sql: "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('fsrs_scheduler_profiles', 'practice_review_evidence', 'practice_generations', 'practice_command_receipts') ORDER BY name",
        returnValue: 'resultRows',
      }),
    ).toEqual([
      ['fsrs_scheduler_profiles'],
      ['practice_command_receipts'],
      ['practice_generations'],
      ['practice_review_evidence'],
    ])
    const metadata = await readPracticeStorageData(upgraded.db)
    expect(metadata.schedulerProfiles).toEqual([])
    expect(metadata.commandReceipts).toEqual([])
    expect(metadata.reviewEvidence).toHaveLength(6)
    expect(
      metadata.reviewEvidence.map((row) => [
        row.reviewAttemptId,
        row.cardId,
        row.applicationSequence,
      ]),
    ).toEqual([
      ['attempt-b-1', 'card-1', 1],
      ['attempt-b-2', 'card-1', 2],
      ['attempt-a-1', 'card-custom', 1],
      ['attempt-a-2', 'card-custom', 2],
      ['attempt-a-3', 'card-custom', 3],
      ['attempt-s-1', 'suspended-opaque', 1],
    ])
    for (const row of metadata.reviewEvidence)
      expect(row).toMatchObject({
        revision: 0,
        sequenceSource: 'legacy-inferred',
        schedulingEvidenceKind: 'unknown',
        schedulerProfileId: null,
        preCardJson: null,
        assessmentEvidenceJson: null,
      })
    expect(metadata.generations.map((row) => row.scopeId)).toEqual([
      'local',
      'problem:day-a',
      'problem:day-b',
      'problem:fresh-zero',
      'problem:suspended',
    ])
    expect(storage.values[FINGERPRINT_KEY]).toBe(
      computeFingerprint(migrationSql),
    )
    expectEarlierRecoveries(storage, earlier)

    const recovery = storage.values[FSRS_RECOVERY_KEY]
    await flushDbSnapshot()
    resetAppDbForTesting()
    const matchingPrepare = vi.fn()
    const reopened = await getAppDb({
      beforePublish: matchingPrepare,
      validateCurrentData: (handle) => validatePracticeStorage(handle.db),
    })
    handles.push(reopened)
    expect(matchingPrepare).not.toHaveBeenCalled()
    expect(readPreservationRows(reopened)).toEqual(fixture.rows)
    expect(await readPracticeStorageData(reopened.db)).toEqual(metadata)
    expect(await createSettingsRepository(reopened.db).getSettings()).toEqual(
      fixture.settings,
    )
    expect(progress(readProgressAttempts(reopened))).toEqual(expectedProgress)
    expect(storage.values[FSRS_RECOVERY_KEY]).toEqual(recovery)
    expectEarlierRecoveries(storage, earlier)
  })

  it.each([
    'recovery',
    'preparation',
    'target schema',
    'publication',
    'collision',
  ] as const)(
    'retains the active original and earlier recoveries when %s fails',
    async (failure) => {
      const { fixture, storage, earlier, original } =
        await installPopulatedStorage()
      storage.failure =
        failure === 'recovery' || failure === 'publication' ? failure : null
      if (failure === 'collision') {
        storage.values[FSRS_RECOVERY_KEY] = {
          version: 1,
          raw: {
            [SNAPSHOT_KEY]: 'different original',
            [FINGERPRINT_KEY]: expectedV9MigrationFingerprint,
          },
          savedAt: '2026-10-01T16:00:00.000Z',
        }
      }
      const initialRecovery = storage.values[FSRS_RECOVERY_KEY]
      const errors = {
        recovery: 'recovery storage unavailable',
        preparation: 'preparation rejected',
        'target schema':
          'The stored database schema does not match its supported version.',
        publication: 'snapshot storage unavailable',
        collision:
          'An earlier database recovery record must be exported before another upgrade.',
      }
      await expect(
        getAppDb({
          beforePublish: async (handle) => {
            if (failure === 'preparation')
              throw new Error('preparation rejected')
            if (failure === 'target schema')
              handle.rawDb.exec('CREATE TABLE unexpected_table (id TEXT)')
            await preparePracticeStorage(handle.db, preservationNow)
          },
          validateCurrentData: (handle) => validatePracticeStorage(handle.db),
        }),
      ).rejects.toThrow(new Error(errors[failure]))
      expect(storage.values[SNAPSHOT_KEY]).toBe(original[SNAPSHOT_KEY])
      expect(storage.values[FINGERPRINT_KEY]).toBe(original[FINGERPRINT_KEY])
      expectEarlierRecoveries(storage, earlier)
      if (failure === 'recovery' || failure === 'collision') {
        expect(storage.values[FSRS_RECOVERY_KEY]).toEqual(initialRecovery)
      } else {
        expect(storage.values[FSRS_RECOVERY_KEY]).toEqual({
          version: 1,
          raw: original,
          savedAt: expect.any(String) as unknown,
        })
      }
      const firstRecovery = storage.values[FSRS_RECOVERY_KEY]
      if (failure !== 'collision') {
        storage.failure = null
        resetAppDbForTesting()
        const retried = await getBackgroundDb()
        handles.push(retried)
        expect(readPreservationRows(retried)).toEqual(fixture.rows)
        expectEarlierRecoveries(storage, earlier)
        if (failure !== 'recovery')
          expect(storage.values[FSRS_RECOVERY_KEY]).toEqual(firstRecovery)
        else
          expect(storage.values[FSRS_RECOVERY_KEY]).toEqual({
            version: 1,
            raw: original,
            savedAt: expect.any(String) as unknown,
          })
      }
    },
  )

  it('retains the original through real preparation failure, then retries and reopens without replacing recovery', async () => {
    const { fixture, storage, earlier, original } =
      await installPopulatedStorage()
    await expect(
      getAppDb({
        beforePublish: async (handle) => {
          handle.rawDb.exec(
            "UPDATE review_attempts SET fsrs_review_log = '{}' WHERE id = (SELECT id FROM review_attempts LIMIT 1)",
          )
          await preparePracticeStorage(handle.db, preservationNow)
        },
        validateCurrentData: (handle) => validatePracticeStorage(handle.db),
      }),
    ).rejects.toThrow('Invalid FSRS review log snapshot.')
    expect(storage.values[SNAPSHOT_KEY]).toBe(original[SNAPSHOT_KEY])
    expect(storage.values[FINGERPRINT_KEY]).toBe(original[FINGERPRINT_KEY])
    expectEarlierRecoveries(storage, earlier)
    const recovery = storage.values[FSRS_RECOVERY_KEY]
    expect(recovery).toEqual({
      version: 1,
      raw: original,
      savedAt: expect.any(String) as unknown,
    })

    resetAppDbForTesting()
    const retried = await getBackgroundDb()
    handles.push(retried)
    expect(readPreservationRows(retried)).toEqual(fixture.rows)
    const metadata = await readPracticeStorageData(retried.db)
    await flushDbSnapshot()
    resetAppDbForTesting()
    const reopened = await getBackgroundDb()
    handles.push(reopened)
    expect(readPreservationRows(reopened)).toEqual(fixture.rows)
    expect(await readPracticeStorageData(reopened.db)).toEqual(metadata)
    expect(storage.values[FSRS_RECOVERY_KEY]).toEqual(recovery)
    expectEarlierRecoveries(storage, earlier)
  })
})
