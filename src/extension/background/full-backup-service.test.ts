import { resumePendingReplacement } from './replacement-resume'
import {
  createBackupTransferService,
  reconcileCompletedBackupTransfers,
  transferSessionKey,
  transferChunkKey,
  transferBudgetKey,
} from '@/features/backup/server/backup-transfer-service'
import { transferDigest } from '@/features/backup/api/backup-transfer-contracts'
import { prepareGistFullBackupReplacement } from './full-backup-service'
import * as archiveOwner from '@/features/notes/data/archive-generation-repository'
import * as backupOwner from '@/features/backup/server/backup-service'
import { abortDbReplacement } from '@/platform/db/instance'
import { createCompositePublication } from '@/platform/db/composite-publication'
import { fullBackupRequestFingerprint } from './full-backup-service'
import { assertArchiveReferences } from '@/features/notes/domain/archive-validation'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import {
  getAppDb,
  resetAppDbForTesting,
  flushDbSnapshot,
} from '@/platform/db/instance'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import { createSnapshotIdbStore } from '@/platform/db/snapshot-idb'
import { preparePracticeStorage } from '@/features/practice/server/practice-storage-service'
import { createArchiveGenerationRepository } from '@/features/notes/data/archive-generation-repository'
import { createNotesRepository } from '@/features/notes/data/notes-repository'
import {
  makeNotesArchive,
  makeNotesPayload,
} from '@/features/notes/testing/notes-fixtures'
import { createFrozenV6BackupFixture } from '@/features/backup/testing/backup-v6-fixture'
import { prepareFullBackupRestore } from '@/features/backup/domain/backup-preflight'
import { createBackupReplacementCoordinator } from './backup-replacement'
import { prepareProblemDataReplacement } from './problem-data-service'
import {
  exportDurableFullBackup,
  prepareFullBackupReplacement,
  createFullBackupPreview,
  validateFullBackupConfirmation,
} from './full-backup-service'
afterEach(() => {
  resetAppDbForTesting()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function fixture() {
  resetAppDbForTesting()
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: () => Promise.resolve({}),
        set: async () => {},
        remove: async () => {},
      },
    },
  })
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  await getAppDb({ beforePublish: ({ db }) => preparePracticeStorage(db) })
  return createLocalIdbStore(indexedDB)
}
async function run(
  local: Awaited<ReturnType<typeof fixture>>,
  prepared: Awaited<ReturnType<typeof prepareFullBackupRestore>>,
  commandId: string,
) {
  return createBackupReplacementCoordinator({
    store: createSnapshotIdbStore(indexedDB),
  }).run({
    kind: 'restore',
    prepare: () => prepareFullBackupReplacement(local, { prepared, commandId }),
    onDurable: async () => {},
    finishSyncMetadata: async () => {},
  })
}
it('publishes a full pair, rotates all catalog scopes, and exports only active reachable bodies after problem reset', async () => {
  const local = await fixture()
  const archive = await makeNotesArchive()
  const report = archive.payloads.find((row) => row.kind === 'feedback-v1')!
  if (report.kind !== 'feedback-v1') throw new Error('Missing report')
  const body = Object.fromEntries(
    Object.entries(report.body).reverse(),
  ) as typeof report.body
  body.summary = '  original report  '
  archive.payloads[archive.payloads.indexOf(report)] = await makeNotesPayload(
    'feedback-v1',
    body,
    report.id,
  )
  const input = {
    ...createFrozenV6BackupFixture(),
    schemaVersion: 7,
    notesArchive: archive,
  }
  const priorScope = await createNotesRepository(local).acquireScope('two-sum')
  expect(
    (await run(local, await prepareFullBackupRestore(input), 'restore-1'))
      .status,
  ).toBe('durable')
  const head = (await local.readHead())!
  const scopes = await createArchiveGenerationRepository(
    local,
  ).readProblemScopes(head.archiveGeneration)
  expect(scopes.length).toBeGreaterThan(1)
  expect(
    await createNotesRepository(local).acquireScope('two-sum'),
  ).not.toEqual(priorScope)
  const before = await exportDurableFullBackup(local)
  expect(before.revision).toBe(head.revision)
  expect(before.backup.notesArchive).toEqual(archive)
  await assertArchiveReferences(before.backup.notesArchive, ['two-sum'])
  expect(
    JSON.stringify(
      before.backup.notesArchive.payloads.find((row) => row.id === report.id)!
        .body,
    ),
  ).toBe(JSON.stringify(body))
  const coordinator = createBackupReplacementCoordinator({
    store: createSnapshotIdbStore(indexedDB),
  })
  await coordinator.run({
    kind: 'problem-reset',
    prepare: () =>
      prepareProblemDataReplacement(local, {
        kind: 'problem-reset',
        commandId: 'reset-1',
        problemSlugs: ['two-sum'],
      }),
    onDurable: async () => {},
    finishSyncMetadata: async () => {},
  })
  const after = await exportDurableFullBackup(local)
  expect(after.backup.notesArchive).toMatchObject({
    notes: [],
    submissions: [],
    assessments: [],
    savedAiNotes: [],
    payloads: [],
  })
  expect(
    (
      await createArchiveGenerationRepository(local).readArchiveGeneration(
        head.archiveGeneration,
      )
    ).payloads.length,
  ).toBe(3)
})
it.each(['external', 'attempt', 'repeated-attempt'] as const)(
  'rejects conflicting %s aliases before preview, candidate, or active pair writes',
  async (fault) => {
    const local = await fixture()
    const archive = await makeNotesArchive()
    const validInput = {
      ...createFrozenV6BackupFixture(),
      schemaVersion: 7,
      notesArchive: structuredClone(archive),
    }
    if (fault === 'repeated-attempt') {
      archive.submissions[0]!.observedAttemptIds.push('attempt-1')
    } else {
      archive.submissions.push({
        ...structuredClone(archive.submissions[0]!),
        id: 'submission-2',
        externalSubmissionId: fault === 'external' ? '123' : null,
        observedAttemptIds: fault === 'attempt' ? ['attempt-1'] : [],
      })
    }
    expect(
      (
        await run(
          local,
          await prepareFullBackupRestore(validInput),
          'alias-baseline',
        )
      ).status,
    ).toBe('durable')
    const invalidInput = { ...validInput, notesArchive: archive }
    const error =
      fault === 'external'
        ? 'Duplicate archive external submission alias.'
        : 'Duplicate archive observed attempt alias.'
    const readRows = () =>
      local.transact(
        ['records', 'coreSnapshots'],
        'readonly',
        (stores, done) => {
          const records = stores.records.getAll()
          const cores = stores.coreSnapshots.getAll()
          cores.onsuccess = () =>
            done({ records: records.result, cores: cores.result })
        },
      )
    const head = (await local.readHead())!
    const activeArchive = await createArchiveGenerationRepository(
      local,
    ).readArchiveGeneration(head.archiveGeneration)
    const beforePreview = await readRows()
    await expect(createFullBackupPreview(local, invalidInput)).rejects.toThrow(
      error,
    )
    expect(await readRows()).toEqual(beforePreview)

    const preview = await createFullBackupPreview(local, validInput)
    const beforeConfirmation = await readRows()
    await expect(
      validateFullBackupConfirmation(
        local,
        invalidInput,
        preview.confirmationToken,
      ),
    ).rejects.toThrow(error)
    expect(await readRows()).toEqual(beforeConfirmation)

    await expect(
      createArchiveGenerationRepository(local).stageImportedArchive({
        nextGeneration: 'invalid-alias-generation',
        archive,
      }),
    ).rejects.toThrow(error)
    expect(
      await local.readRecord([
        'archive-generation',
        'invalid-alias-generation',
      ]),
    ).toBeUndefined()
    expect(await readRows()).toEqual(beforeConfirmation)
    expect(await local.readHead()).toEqual(head)
    expect(
      await createArchiveGenerationRepository(local).readArchiveGeneration(
        head.archiveGeneration,
      ),
    ).toEqual(activeArchive)
  },
)

it('binds a legacy confirmation to exact input digest and local revision', async () => {
  const local = await fixture()
  const input = createFrozenV6BackupFixture()
  const preview = await createFullBackupPreview(local, input)
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken),
  ).resolves.toMatchObject({ sourceSchemaVersion: 6 })
  await expect(
    validateFullBackupConfirmation(
      local,
      { ...input, exportedAt: '2026-10-30T12:00:00.000Z' },
      preview.confirmationToken,
    ),
  ).rejects.toThrow(/preview/i)
  const handle = await getAppDb()
  handle.rawDb.exec(
    "UPDATE problems SET title = 'changed' WHERE slug = 'two-sum'",
  )
  await flushDbSnapshot()
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken),
  ).rejects.toThrow(/preview/i)
})

it.each(['restore', 'gist-pull'] as const)(
  'hydrates the same prepared %s identity after staging interruption without rerunning SQL or minting scopes',
  async (kind) => {
    const local = await fixture()
    const prepared = await prepareFullBackupRestore({
      ...createFrozenV6BackupFixture(),
      schemaVersion: 7,
      notesArchive: await makeNotesArchive(),
    })
    const head = (await local.readHead())!
    const actual = archiveOwner.createArchiveGenerationRepository
    const fault = vi
      .spyOn(archiveOwner, 'createArchiveGenerationRepository')
      .mockImplementation((store) => ({
        ...actual(store),
        stageImportedArchive: () => Promise.reject(new Error('staging fault')),
      }))
    const restore = vi.spyOn(backupOwner, 'restorePreparedFullBackup')
    const prepare = () =>
      kind === 'gist-pull'
        ? prepareGistFullBackupReplacement(local, prepared)
        : prepareFullBackupReplacement(local, {
            prepared,
            commandId: 'interrupted-restore',
          })
    const first = await prepare()
    const commandId = first.replacementId
    await expect(
      first.publish({
        kind,
        replacementId: commandId,
        ...(kind === 'gist-pull'
          ? {
              syncMetadataPatch: {
                enabled: true,
                gistId: 'frozen-gist',
                lastSyncAt: '2026-10-31T00:00:00Z',
                lastSyncDirection: 'pull',
                lastPullAt: '2026-10-31T00:00:00Z',
                lastRemoteVersion: 'frozen-v',
                lastRemoteUpdatedAt: '2026-10-31T00:00:00Z',
                localDataUpdatedAt: '2026-10-31T00:00:00Z',
                dirtySinceLastSync: false,
                lastBlockingReason: null,
                conflict: null,
                lastError: null,
              },
            }
          : {}),
      }),
    ).rejects.toThrow('staging fault')
    const publication = createCompositePublication(local, head.fingerprint)
    const original = await publication.loadPrepared(
      commandId,
      fullBackupRequestFingerprint(prepared),
    )
    expect(restore).toHaveBeenCalledTimes(1)
    fault.mockRestore()
    abortDbReplacement()
    const resumed = createBackupReplacementCoordinator({
      store: createSnapshotIdbStore(indexedDB),
      resumePrepared: (record) => resumePendingReplacement(local, record),
      resume: () => ({
        onDurable: async () => {},
        finishSyncMetadata: async () => {},
      }),
    })
    await expect(resumed.retry()).resolves.toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    expect(restore).toHaveBeenCalledTimes(1)
    const active = (await local.readHead())!
    expect(active).toMatchObject({
      coreSnapshotId: original!.descriptor.coreSnapshotId,
      archiveGeneration: original!.descriptor.archiveGeneration,
      datasetToken: original!.descriptor.datasetToken,
    })
    expect(
      await createArchiveGenerationRepository(local).readProblemScopes(
        active.archiveGeneration,
      ),
    ).toEqual(
      original!.descriptor.initializedProblemScopes!.map((scope) => ({
        ...scope,
        datasetToken: active.datasetToken,
      })),
    )
    const current = await local.readHead()
    await expect(
      prepareFullBackupReplacement(local, { prepared, commandId }),
    ).rejects.toThrow(/already committed/)
    expect(await local.readHead()).toEqual(current)
  },
)

it('binds a remote preview to the original selected source as well as input and current base', async () => {
  const local = await fixture()
  const input = createFrozenV6BackupFixture()
  const preview = await createFullBackupPreview(local, input, {
    kind: 'gist-pull',
    sourceIdentity: 'gist-1-envelope-v1',
  })
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken, {
      kind: 'gist-pull',
      sourceIdentity: 'gist-1-envelope-v2',
    }),
  ).rejects.toThrow(/preview/i)
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken, {
      kind: 'restore',
    }),
  ).rejects.toThrow(/preview/i)
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken, {
      kind: 'gist-pull',
      sourceIdentity: 'gist-1-envelope-v1',
    }),
  ).resolves.toMatchObject({ sourceSchemaVersion: 6 })
  const handle = await getAppDb()
  handle.rawDb.exec(
    "UPDATE problems SET title = 'new local data' WHERE slug = 'two-sum'",
  )
  await flushDbSnapshot()
  const before = await local.readHead()
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken, {
      kind: 'gist-pull',
      sourceIdentity: 'gist-1-envelope-v1',
    }),
  ).rejects.toThrow(/Local data changed/)
  expect(await local.readHead()).toEqual(before)
})

it.each(['future', 'digest', 'duplicate', 'dangling', 'practice'] as const)(
  'rejects %s input before minting a preview or staging replacement state',
  async (fault) => {
    const local = await fixture()
    const input = {
      ...createFrozenV6BackupFixture(),
      schemaVersion: fault === 'future' ? 8 : 7,
      notesArchive: await makeNotesArchive(),
    }
    if (fault === 'digest')
      input.notesArchive.payloads[0]!.sha256 = '0'.repeat(64)
    if (fault === 'duplicate')
      input.notesArchive.notes.push(input.notesArchive.notes[0]!)
    if (fault === 'dangling')
      input.notesArchive.submissions[0]!.codePayloadId = 'missing'
    if (fault === 'practice')
      input.data.practice.reviewEvidence[0]!.cardId = 'missing'
    const before = await local.readHead()
    const transact = vi.spyOn(local, 'transact')
    await expect(createFullBackupPreview(local, input)).rejects.toThrow(
      fault === 'future' ? /Unsupported backup version 8/ : undefined,
    )
    expect(transact.mock.calls.every(([, mode]) => mode === 'readonly')).toBe(
      true,
    )
    expect(await local.readHead()).toEqual(before)
  },
)

it('binds a local transfer preview capability to its actual document and transfer identity', async () => {
  const local = await fixture()
  const input = createFrozenV6BackupFixture()
  const sourceIdentity = JSON.stringify([
    'dashboard-transfer',
    'document-a',
    'transfer-a',
  ])
  const preview = await createFullBackupPreview(local, input, {
    sourceIdentity,
  })
  for (const identity of [
    JSON.stringify(['dashboard-transfer', 'document-b', 'transfer-a']),
    JSON.stringify(['dashboard-transfer', 'document-a', 'transfer-b']),
  ]) {
    await expect(
      validateFullBackupConfirmation(local, input, preview.confirmationToken, {
        sourceIdentity: identity,
      }),
    ).rejects.toThrow(/preview no longer matches/i)
  }
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken, {
      sourceIdentity,
    }),
  ).resolves.toMatchObject({ sourceSchemaVersion: 6 })
})

it.each(['persistence', 'metadata'] as const)(
  'reconciles a real full-pair transfer after %s recovery and replays its receipt after body cleanup',
  async (failure) => {
    const local = await fixture()
    const coordinator = createBackupReplacementCoordinator({
      store: createSnapshotIdbStore(indexedDB),
    })
    const sql = vi.spyOn(backupOwner, 'restorePreparedFullBackup')
    let failPublish = failure === 'persistence',
      failMetadata = failure === 'metadata'
    const sourceIdentity = (id: string) =>
      JSON.stringify(['dashboard-transfer', 'document-a', id])
    const dependencies = {
      local,
      currentRevision: () =>
        local.readHead().then((head) => head?.revision ?? 0),
      exportSnapshot: () => Promise.reject(new Error('unused export')),
      preview: (input: unknown, id: string) =>
        createFullBackupPreview(local, input, {
          sourceIdentity: sourceIdentity(id),
        }),
      restore: async (input: unknown, token: string, id: string) => {
        const prepared = await validateFullBackupConfirmation(
          local,
          input,
          token,
          { sourceIdentity: sourceIdentity(id) },
        )
        return coordinator.run({
          kind: 'restore',
          prepare: async () => {
            const candidate = await prepareFullBackupReplacement(local, {
              prepared,
              commandId: token,
            })
            return {
              ...candidate,
              publish: async (
                ...args: Parameters<typeof candidate.publish>
              ) => {
                if (failPublish) {
                  failPublish = false
                  throw new Error('disk down')
                }
                await candidate.publish(...args)
              },
            }
          },
          onDurable: () => Promise.resolve(),
          finishSyncMetadata: () => {
            if (failMetadata) {
              failMetadata = false
              return Promise.reject(new Error('metadata down'))
            }
            return Promise.resolve()
          },
        })
      },
    }
    const service = createBackupTransferService(dependencies)
    const session = await service.begin('document-a', { direction: 'import' })
    const text = JSON.stringify(createFrozenV6BackupFixture())
    await service.append('document-a', session, 0, text)
    const finish = { chunks: 1, digest: await transferDigest(text) }
    const preview = await service.finish('document-a', session, finish)
    if (!('confirmationToken' in preview)) throw new Error('Preview missing')
    const confirmed = {
      ...finish,
      confirmationToken: preview.confirmationToken,
    }
    const first = await service.finish('document-a', session, confirmed)
    expect(first).toMatchObject(
      failure === 'persistence'
        ? { status: 'persistence-pending' }
        : { status: 'durable', syncMetadataPending: true },
    )
    expect(await reconcileCompletedBackupTransfers(local)).toBe(0)
    expect(
      await local.readRecord(transferSessionKey(session.sessionId)),
    ).toMatchObject({ status: 'ready' })
    expect(await coordinator.retry()).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    coordinator.assertIdle()
    expect(await reconcileCompletedBackupTransfers(local)).toBe(1)
    const completed = (await local.readRecord(
      transferSessionKey(session.sessionId),
    )) as { spooledBytes: number }
    expect(completed).toMatchObject({ status: 'complete' })
    await local.transact(['records'], 'readwrite', (stores, done) => {
      const budget = stores.records.get(transferBudgetKey)
      budget.onsuccess = () => {
        const current = budget.result as { bytes: number; sessions: number }
        stores.records.delete(transferChunkKey(session.sessionId, 0))
        stores.records.put(
          { ...current, bytes: current.bytes - completed.spooledBytes },
          transferBudgetKey,
        )
        stores.records.put(
          { ...completed, spooledBytes: 0 },
          transferSessionKey(session.sessionId),
        )
        done(undefined)
      }
    })
    const noReplay = vi.fn(() =>
      Promise.reject(new Error('SQL replay forbidden')),
    )
    const restarted = createBackupTransferService({
      ...dependencies,
      restore: noReplay,
    })
    expect(
      await restarted.finish('document-a', session, confirmed),
    ).toMatchObject({ status: 'durable', syncMetadataPending: false })
    expect(noReplay).not.toHaveBeenCalled()
    expect(sql).toHaveBeenCalledTimes(1)
  },
)

it('collects technical orphans then recovers the retained pair with exact note, code and report bodies', async () => {
  const local = await fixture(),
    archive = await makeNotesArchive()
  archive.notes[0]!.document.markdown = 'Keep forever.'
  const input = {
    ...createFrozenV6BackupFixture(),
    schemaVersion: 7,
    notesArchive: archive,
  }
  expect(
    await run(local, await prepareFullBackupRestore(input), 'long-lived-notes'),
  ).toMatchObject({ status: 'durable' })
  const store = createSnapshotIdbStore(indexedDB)
  expect(
    await createBackupReplacementCoordinator({ store }).run({
      kind: 'reset',
      prepare: () =>
        prepareProblemDataReplacement(local, {
          kind: 'reset',
          problemSlugs: [],
          commandId: 'clear-after-notes',
        }),
      onDurable: async () => {},
      finishSyncMetadata: async () => {},
    }),
  ).toMatchObject({ status: 'durable' })
  const { createNotesMaintenanceService } =
    await import('@/features/notes/server/notes-maintenance-service')
  const maintenance = createNotesMaintenanceService({
    local,
    now: () => new Date('2090-01-01'),
  })
  for (let i = 0; i < 80; i++)
    if (!(await maintenance.collectBatch()).hasMore) break
  const prior = (await store.readReplacementRecovery('clear-after-notes'))!
  const generationOwner = createArchiveGenerationRepository(local)
  expect(
    await generationOwner.readArchiveGeneration(prior.archiveGeneration!),
  ).toEqual(archive)
  const {
    prepareDbReplacement,
    createDetachedCoreCandidate,
    adoptPublishedCoreCandidate,
  } = await import('@/platform/db/instance')
  const { readPracticeStorageData, replacePracticeStorageDataInTransaction } =
    await import('@/features/practice/server/practice-storage-service')
  await prepareDbReplacement()
  const recovered = await createDetachedCoreCandidate(
    new Uint8Array(prior.bytes),
    async (candidate) => {
      const historical = await readPracticeStorageData(candidate.db)
      await candidate.db.transaction((tx) =>
        replacePracticeStorageDataInTransaction(tx, historical),
      )
    },
  )
  const head = (await local.readHead())!,
    descriptor = {
      baseRevision: head.revision,
      coreSnapshotId: 'recovered-core',
      archiveGeneration: 'recovered-archive',
      datasetToken: 'recovered-dataset',
      replacementId: 'recover-prior',
    }
  const publication = createCompositePublication(local, head.fingerprint),
    candidate = { handle: recovered, descriptor }
  await publication.prepare(candidate, () =>
    generationOwner.stageArchiveGeneration({
      sourceGeneration: prior.archiveGeneration!,
      nextGeneration: descriptor.archiveGeneration,
      excludedProblemSlugs: [],
    }),
  )
  const published = await publication.publishCompositeCandidate(candidate, {
    kind: 'restore',
    replacementId: descriptor.replacementId,
  })
  await adoptPublishedCoreCandidate(candidate, published, local)
  await store.markInvalidated(descriptor.replacementId)
  await store.markSyncMetadataComplete(descriptor.replacementId)
  await store.completeContinuation(descriptor.replacementId)
  const exported = await exportDurableFullBackup(local)
  expect(exported.backup.notesArchive).toEqual(archive)
  expect(exported.backup.notesArchive.notes[0]!.document.markdown).toBe(
    'Keep forever.',
  )
  expect(
    exported.backup.notesArchive.payloads.map((payload) =>
      JSON.stringify(payload.body),
    ),
  ).toEqual(archive.payloads.map((payload) => JSON.stringify(payload.body)))
})

// Regression derived from /private/tmp/cognipace-astra-correctness-review/repro.test.ts.
it('discovers interrupted prepared restore on worker restart before any DB opens', async () => {
  const local = await fixture()
  const store = createSnapshotIdbStore(indexedDB)
  const prepared = await prepareFullBackupRestore({
    ...createFrozenV6BackupFixture(),
    schemaVersion: 7,
    notesArchive: await makeNotesArchive(),
  })
  const actual = archiveOwner.createArchiveGenerationRepository
  const fault = vi
    .spyOn(archiveOwner, 'createArchiveGenerationRepository')
    .mockImplementation((store) => ({
      ...actual(store),
      stageImportedArchive: () =>
        Promise.reject(new Error('interrupted before archive staging')),
    }))
  expect(await run(local, prepared, 'restart-discovery')).toMatchObject({
    status: 'persistence-pending',
  })
  expect(await store.readContinuation()).toBeNull()
  fault.mockRestore()
  resetAppDbForTesting()
  const reopened = createBackupReplacementCoordinator({ store })
  await reopened.ready()
  expect(reopened.getState()).toMatchObject({
    status: 'persistence-pending',
    kind: 'restore',
    summary: prepared.summary,
  })
  expect(() => reopened.assertReadable()).toThrow('still needs saving')
  expect(() => reopened.assertIdle()).toThrow('still needs saving')
})

it('rejects valid-digest immutable body collisions before accepting a new durable replacement', async () => {
  const local = await fixture()
  const input = {
    ...createFrozenV6BackupFixture(),
    schemaVersion: 7,
    notesArchive: await makeNotesArchive(),
  }
  expect(
    await run(
      local,
      await prepareFullBackupRestore(input),
      'collision-baseline',
    ),
  ).toMatchObject({ status: 'durable' })
  const before = await local.readHead()
  const changed = structuredClone(input)
  changed.notesArchive.payloads[0] = await makeNotesPayload(
    'submitted-code',
    'different actual body',
    'code-1',
  )
  const prepared = await prepareFullBackupRestore(changed)
  await expect(run(local, prepared, 'collision-rejected')).rejects.toThrow(
    'Immutable archive payload identity collision',
  )
  expect(await local.readHead()).toEqual(before)
  expect(
    await local.readRecord(['composite-candidate', 'collision-rejected']),
  ).toBeUndefined()
  expect(
    await local.readRecord(['replacement-source', 'collision-rejected']),
  ).toBeUndefined()
  expect(await local.readRecord('replacement-prepublication')).toBeUndefined()
  resetAppDbForTesting()
  const restarted = createBackupReplacementCoordinator({
    store: createSnapshotIdbStore(indexedDB),
  })
  await restarted.ready()
  expect(restarted.getState()).toEqual({ status: 'idle' })
})
