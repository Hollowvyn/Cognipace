import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAppDb,
  flushDbSnapshot,
  resetAppDbForTesting,
} from '@/platform/db/instance'
import type { DbHandle } from '@/platform/db/client'
import {
  FINGERPRINT_KEY,
  bytesToBase64,
  SNAPSHOT_KEY,
  serializeDb,
} from '@/platform/db/snapshot'
import {
  preparePracticeStorage,
  validatePracticeStorage,
} from './server/practice-storage-service'
import {
  executePracticeReviewCommand,
  getPracticeDetails,
  resetPracticeSchedule,
} from './server/practice-service'
import {
  exportFullBackup,
  restoreFullBackup,
} from '@/features/backup/server/backup-service'
import { readPracticeStorageData } from './data/practice-storage-repository'
import {
  makeFsrsPreservationSnapshot,
  readPreservationRows,
} from '@/testing/fixtures/fsrs-preservation'
import { expectedV9MigrationFingerprint } from '@/testing/fixtures/fsrs-remediation-legacy-migrations'

const handles: DbHandle[] = []
const values: Record<string, unknown> = {}
let failPublication = false

async function open() {
  const handle = await getAppDb({
    beforePublish: async ({ db }) => preparePracticeStorage(db),
    validateCurrentData: async ({ db }) => validatePracticeStorage(db),
  })
  handles.push(handle)
  return handle
}

async function fixture() {
  resetAppDbForTesting()
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: (keys: string[]) =>
          Promise.resolve(
            Object.fromEntries(
              keys
                .filter((key) => key in values)
                .map((key) => [key, values[key]]),
            ),
          ),
        set: (patch: Record<string, unknown>) => {
          if (failPublication)
            return Promise.reject(new Error('forced storage failure'))
          Object.assign(values, patch)
          return Promise.resolve()
        },
      },
    },
  })
  const handle = await open()
  const command = {
    operation: 'save' as const,
    commandId: 'accepted-save',
    problemSlug: 'two-sum',
    generation: (await getPracticeDetails(handle.db, 'two-sum')).generation!,
    rating: 'good' as const,
    reviewedAt: '2026-10-06T10:00:00.000Z',
    reviewMode: 'manual' as const,
    elapsedSeconds: 120,
    log: { notes: 'retain accepted log', languages: 'TypeScript' },
  }
  return { handle, command }
}

afterEach(() => {
  resetAppDbForTesting()
  handles.splice(0).forEach((handle) => handle.rawDb.close())
  Object.keys(values).forEach((key) => delete values[key])
  failPublication = false
  vi.unstubAllGlobals()
})

describe('durable accepted review commands', () => {
  it('preserves populated C history and opaque identities through new captured review, snapshot reopen and v6 round trip', async () => {
    const { command } = await fixture()
    const legacy = await makeFsrsPreservationSnapshot()
    values[SNAPSHOT_KEY] = bytesToBase64(legacy.bytes)
    values[FINGERPRINT_KEY] = expectedV9MigrationFingerprint
    resetAppDbForTesting()
    const upgraded = await open()
    expect(readPreservationRows(upgraded)).toEqual(legacy.rows)
    // The historical preservation fixture deliberately uses a noncanonical alias.
    // Normalize only that fixture field before exercising current v6 preflight.
    upgraded.rawDb.exec(
      "UPDATE topic_aliases SET alias_key = 'custom alias' WHERE alias_key = 'custom-alias'",
    )
    await executePracticeReviewCommand(upgraded.db, {
      ...command,
      commandId: 'captured-on-populated-C',
      problemSlug: 'fresh-zero',
      generation: (await getPracticeDetails(upgraded.db, 'fresh-zero'))
        .generation!,
    })
    expect(
      upgraded.rawDb.exec({
        sql: "SELECT id FROM fsrs_cards WHERE problem_slug = 'fresh-zero'",
        returnValue: 'resultRows',
      }),
    ).toEqual([['fresh-opaque']])
    const originalRows = readPreservationRows(upgraded)
    const originalEvidence = await readPracticeStorageData(upgraded.db)
    expect(
      originalEvidence.reviewEvidence.filter(
        (row) => row.schedulingEvidenceKind === 'unknown',
      ),
    ).toHaveLength(6)
    expect(
      originalEvidence.reviewEvidence.filter(
        (row) => row.schedulingEvidenceKind === 'captured',
      ),
    ).toHaveLength(1)
    await flushDbSnapshot()
    resetAppDbForTesting()
    const reopened = await open()
    expect(readPreservationRows(reopened)).toEqual(originalRows)
    const backup = await exportFullBackup(reopened.db)
    await restoreFullBackup(reopened.db, backup)
    const restoredRows = readPreservationRows(reopened)
    // Restore also seeds missing built-in catalog rows; every owned fixture row
    // must survive exactly, while Practice facts remain exact rather than subsets.
    for (const [table, rows] of Object.entries(originalRows)) {
      if (table === 'settings_kv') continue
      expect(restoredRows[table]).toEqual(expect.arrayContaining(rows))
    }
    for (const table of [
      'fsrs_cards',
      'review_attempts',
      'problem_practice',
      'track_problem_progress',
      'track_session',
    ]) {
      expect(restoredRows[table]).toEqual(originalRows[table])
    }
    expect(restoredRows.settings_kv).toEqual(
      originalRows.settings_kv!.filter(([key]) => key === 'user-settings'),
    )
    const imported = await readPracticeStorageData(reopened.db)
    expect(imported.reviewEvidence).toEqual(originalEvidence.reviewEvidence)
    expect(imported.schedulerProfiles).toEqual(
      originalEvidence.schedulerProfiles,
    )
    expect(imported.commandReceipts).toEqual(originalEvidence.commandReceipts)
  })

  it('reopens published receipts after lost acknowledgement and replays historical corrections after a newer revision', async () => {
    const { handle, command } = await fixture()
    const first = await executePracticeReviewCommand(handle.db, command)
    if (first.status === 'conflict') throw new Error('unexpected conflict')
    await flushDbSnapshot()
    resetAppDbForTesting()
    const restarted = await open()
    const replay = await executePracticeReviewCommand(restarted.db, command)
    if (replay.status === 'conflict') throw new Error('unexpected conflict')
    expect(replay.acknowledgement).toEqual(first.acknowledgement)
    expect(replay.current.reviewCount).toBe(1)
    const update = {
      operation: 'update' as const,
      commandId: 'accepted-correction',
      problemSlug: command.problemSlug,
      generation: replay.current.generation!,
      targetAttemptId: replay.acknowledgement.reviewAttemptId,
      expectedRevision: 0,
      rating: 'hard' as const,
      reviewedAt: command.reviewedAt,
    }
    const corrected = await executePracticeReviewCommand(restarted.db, update)
    await executePracticeReviewCommand(restarted.db, {
      ...update,
      commandId: 'newer-correction',
      expectedRevision: 1,
      rating: 'easy',
    })
    const beforeRestart = await readPracticeStorageData(restarted.db)
    await flushDbSnapshot()
    resetAppDbForTesting()
    const reopened = await open()
    expect(await readPracticeStorageData(reopened.db)).toEqual(beforeRestart)
    const beforeReplay = serializeDb(reopened)
    const oldCorrection = await executePracticeReviewCommand(
      reopened.db,
      update,
    )
    if (corrected.status === 'conflict' || oldCorrection.status === 'conflict')
      throw new Error('unexpected conflict')
    expect(oldCorrection.acknowledgement).toEqual(corrected.acknowledgement)
    expect(oldCorrection.current.latestReview?.revision).toBe(2)
    expect(oldCorrection.current.reviewCount).toBe(1)
    expect(serializeDb(reopened)).toEqual(beforeReplay)
    const originalDetails = await getPracticeDetails(reopened.db, 'two-sum')
    const backup = await exportFullBackup(reopened.db)
    await restoreFullBackup(reopened.db, backup)
    const imported = await readPracticeStorageData(reopened.db)
    expect(imported.reviewEvidence).toEqual(beforeRestart.reviewEvidence)
    expect(imported.schedulerProfiles).toEqual(beforeRestart.schedulerProfiles)
    expect(imported.commandReceipts).toEqual(beforeRestart.commandReceipts)
    expect(
      (await getPracticeDetails(reopened.db, 'two-sum')).latestReview,
    ).toEqual(originalDetails.latestReview)
    await flushDbSnapshot()
    resetAppDbForTesting()
    const restored = await open()
    expect(
      await executePracticeReviewCommand(restored.db, update),
    ).toMatchObject({ status: 'conflict', reason: 'stale-generation' })
  })

  it('retains the last durable snapshot after failed publication and applies the same unflushed bootstrap command once after restart', async () => {
    const { handle, command } = await fixture()
    const baseline = values[SNAPSHOT_KEY]
    await executePracticeReviewCommand(handle.db, command)
    failPublication = true
    await expect(flushDbSnapshot()).rejects.toThrow('forced storage failure')
    expect(values[SNAPSHOT_KEY] === baseline).toBe(true)
    resetAppDbForTesting()
    failPublication = false
    const restarted = await open()
    expect(
      (await getPracticeDetails(restarted.db, 'two-sum')).reviewCount,
    ).toBe(0)
    const first = await executePracticeReviewCommand(restarted.db, command)
    const replay = await executePracticeReviewCommand(restarted.db, command)
    if (first.status === 'conflict' || replay.status === 'conflict')
      throw new Error('unexpected conflict')
    expect(replay.acknowledgement).toEqual(first.acknowledgement)
    expect(replay.current.reviewCount).toBe(1)
    expect(
      (await readPracticeStorageData(restarted.db)).commandReceipts,
    ).toHaveLength(1)
    await flushDbSnapshot()
    await resetPracticeSchedule(restarted.db, { problemSlug: 'two-sum' })
    await flushDbSnapshot()
    resetAppDbForTesting()
    const reset = await open()
    expect(await executePracticeReviewCommand(reset.db, command)).toMatchObject(
      { status: 'conflict', reason: 'stale-generation' },
    )
  })
})
