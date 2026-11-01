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

it('recovers exact prior archive bodies with fresh Notes and Practice write scopes through an injected owner hook', async () => {
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb')
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const { handle, command } = await fixture()
  await executePracticeReviewCommand(handle.db, command)
  await flushDbSnapshot()
  const { createLocalIdbStore } = await import('@/platform/db/local-idb')
  const { createSnapshotIdbStore } = await import('@/platform/db/snapshot-idb')
  const { createCompositePublication } =
    await import('@/platform/db/composite-publication')
  const {
    createDetachedCoreCandidate,
    prepareDbReplacement,
    adoptPublishedCoreCandidate,
  } = await import('@/platform/db/instance')
  const { createNotesRepository } =
    await import('@/features/notes/data/notes-repository')
  const { createArchiveGenerationRepository } =
    await import('@/features/notes/data/archive-generation-repository')
  const { replacePracticeStorageDataInTransaction } =
    await import('./server/practice-storage-service')
  const local = createLocalIdbStore(indexedDB)
  const store = createSnapshotIdbStore(indexedDB)
  const notes = createNotesRepository(local)
  const archive = createArchiveGenerationRepository(local)
  const scope = await notes.acquireScope('two-sum')
  const noteCommand = {
    commandId: 'old-note',
    problemSlug: 'two-sum',
    scope,
    target: { kind: 'problem' as const },
    expectedRevision: 0,
    markdown: 'historical markdown',
  }
  await notes.saveDocument(noteCommand)
  const baseline = (await local.readHead())!
  await local.transact(
    ['submissions', 'analysisReports', 'payloads'],
    'readwrite',
    (s, done) => {
      s.submissions.put(
        { problemSlug: 'two-sum', codePayloadId: 'recovery-code' },
        [baseline.archiveGeneration, 'submission'],
      )
      s.analysisReports.put(
        { problemSlug: 'two-sum', feedbackPayloadId: 'recovery-report' },
        [baseline.archiveGeneration, 'assessment'],
      )
      s.payloads.put({ body: 'return historical solution' }, 'recovery-code')
      s.payloads.put({ body: 'historical report body' }, 'recovery-report')
      done(undefined)
    },
  )
  const publication = createCompositePublication(local, baseline.fingerprint)
  async function publish(
    handle: DbHandle,
    sourceGeneration: string | null,
    id: string,
  ) {
    const head = (await local.readHead())!
    const candidate = {
      handle,
      descriptor: {
        baseRevision: head.revision,
        coreSnapshotId: `core-${id}`,
        archiveGeneration: `archive-${id}`,
        datasetToken: `dataset-${id}`,
        replacementId: id,
      },
    }
    await publication.prepare(candidate, () =>
      sourceGeneration
        ? archive.stageArchiveGeneration({
            sourceGeneration,
            nextGeneration: candidate.descriptor.archiveGeneration,
            excludedProblemSlugs: [],
          })
        : archive.stageImportedArchive({
            nextGeneration: candidate.descriptor.archiveGeneration,
            archive: {
              formatVersion: 1,
              notes: [],
              submissions: [],
              assessments: [],
              savedAiNotes: [],
              payloads: [],
            },
          }),
    )
    const published = await publication.publishCompositeCandidate(candidate, {
      kind: 'restore',
      replacementId: id,
    })
    await adoptPublishedCoreCandidate(candidate, published, local)
    await store.markInvalidated(id)
    await store.markSyncMetadataComplete(id)
    await store.completeContinuation(id)
  }
  await prepareDbReplacement()
  const replacement = await createDetachedCoreCandidate(serializeDb(handle))
  handles.push(replacement)
  await publish(replacement, null, 'replacement')
  const prior = (await store.readReplacementRecovery('replacement'))!
  expect(prior.archiveGeneration).toBe(baseline.archiveGeneration)
  await prepareDbReplacement()
  let ownerHookCalled = false
  const recovered = await createDetachedCoreCandidate(
    new Uint8Array(prior.bytes),
    async (candidate) => {
      ownerHookCalled = true
      const historical = await readPracticeStorageData(candidate.db)
      await candidate.db.transaction((tx) =>
        replacePracticeStorageDataInTransaction(tx, historical),
      )
    },
  )
  handles.push(recovered)
  await publish(recovered, prior.archiveGeneration!, 'recovery')
  expect(ownerHookCalled).toBe(true)
  await local.transact(['problemScopes'], 'readonly', (s, done) => {
    const request = s.problemScopes.get(['archive-recovery', 'two-sum'])
    request.onsuccess = () => {
      expect(request.result).toMatchObject({ datasetToken: 'dataset-recovery' })
      expect(
        (request.result as { problemToken: string }).problemToken,
      ).not.toBe(scope.problemToken)
      done(undefined)
    }
  })
  expect(
    (await notes.readDocument('two-sum', { kind: 'problem' })).markdown,
  ).toBe('historical markdown')
  const head = (await local.readHead())!
  await local.transact(
    ['submissions', 'analysisReports', 'payloads'],
    'readonly',
    (s, done) => {
      const sub = s.submissions.get([head.archiveGeneration, 'submission'])
      sub.onsuccess = () => {
        const code = s.payloads.get(
          (sub.result as { codePayloadId: string }).codePayloadId,
        )
        code.onsuccess = () =>
          expect((code.result as { body: string }).body).toBe(
            'return historical solution',
          )
      }
      const report = s.analysisReports.get([
        head.archiveGeneration,
        'assessment',
      ])
      report.onsuccess = () => {
        const body = s.payloads.get(
          (report.result as { feedbackPayloadId: string }).feedbackPayloadId,
        )
        body.onsuccess = () => {
          expect((body.result as { body: string }).body).toBe(
            'historical report body',
          )
          done(undefined)
        }
      }
    },
  )
  expect(await notes.saveDocument(noteCommand)).toEqual({
    status: 'stale-scope',
  })
  expect(
    await executePracticeReviewCommand((await getAppDb()).db, command),
  ).toMatchObject({ status: 'conflict', reason: 'stale-generation' })
  const active = (await getAppDb()).db
  expect(
    await executePracticeReviewCommand(active, {
      ...command,
      commandId: 'after-recovery',
      generation: (await getPracticeDetails(active, 'two-sum')).generation!,
    }),
  ).toMatchObject({ status: 'saved' })
  await flushDbSnapshot()
})
