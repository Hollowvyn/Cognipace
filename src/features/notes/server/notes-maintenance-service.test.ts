import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import { createSnapshotIdbStore } from '@/platform/db/snapshot-idb'
import { createArchiveGenerationRepository } from '../data/archive-generation-repository'
import { makeNotesArchive, makeNotesPayload } from '../testing/notes-fixtures'
import {
  createNotesMaintenanceService,
  unreferencedIds,
} from './notes-maintenance-service'

afterEach(() => vi.unstubAllGlobals())
async function fixture() {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const factory = new IDBFactory()
  const local = createLocalIdbStore(factory)
  const snapshots = createSnapshotIdbStore(factory)
  await snapshots.commitSnapshot(
    new Uint8Array([1, 2, 3]),
    'test',
    new Date('2000-01-01'),
  )
  const head = (await local.readHead())!
  const archive = await makeNotesArchive()
  archive.notes[0]!.document.markdown = 'Keep forever.'
  const generations = createArchiveGenerationRepository(local)
  await generations.stageImportedArchive({ nextGeneration: 'history', archive })
  await generations.stageArchiveGeneration({
    sourceGeneration: 'history',
    nextGeneration: 'prior-history',
    excludedProblemSlugs: [],
  })
  await generations.stageArchiveGeneration({
    sourceGeneration: 'history',
    nextGeneration: 'abandoned-stage',
    excludedProblemSlugs: [],
  })
  await local.writeTechnicalRecord('active', {
    ...head,
    archiveGeneration: 'history',
  })
  await local.transact(
    ['records', 'coreSnapshots', 'payloads'],
    'readwrite',
    (s, done) => {
      s.records.put(
        {
          ...head,
          key: 'replacement',
          replacementId: 'prior',
          archiveGeneration: 'prior-history',
        },
        'recovery',
      )
      s.coreSnapshots.put(
        {
          kind: 'paired',
          coreSnapshotId: head.coreSnapshotId,
          archiveGeneration: 'prior-history',
          datasetToken: head.datasetToken,
        },
        ['recordReference', 'recovery'],
      )
      s.records.put(
        {
          commandId: 'ancient-clear',
          kind: 'reset',
          status: 'committed',
          requestFingerprint: 'reset',
        },
        ['replacement-command', 'ancient-clear'],
      )
      s.records.put(
        { coreSnapshotId: 'opaque', archiveGeneration: 'opaque' },
        'recovery:opaque',
      )
      done(undefined)
    },
  )
  await local.transact(['payloads'], 'readwrite', (s, done) => {
    s.payloads.put({ id: 'unreferenced-body' }, 'unreferenced-body')
    done(undefined)
  })
  return { factory, local, snapshots, generations, archive }
}
async function drain(
  service: ReturnType<typeof createNotesMaintenanceService>,
) {
  const removedGenerations: string[] = [],
    removedPayloadIds: string[] = []
  for (let i = 0; i < 1000; i++) {
    const result = await service.collectBatch()
    expect(result.scannedKeys).toBeLessThanOrEqual(100)
    removedGenerations.push(...result.removedGenerations)
    removedPayloadIds.push(...result.removedPayloadIds)
    if (!result.hasMore) return { removedGenerations, removedPayloadIds }
  }
  throw new Error('maintenance did not settle')
}
it('uses reachability without any age expiry', () => {
  expect(unreferencedIds(['ancient', 'orphan'], new Set(['ancient']))).toEqual([
    'orphan',
  ])
})
it('collects abandoned technical data years later and preserves exact active and recovery bodies', async () => {
  const { local, generations, archive, snapshots } = await fixture()
  const service = createNotesMaintenanceService({
    local,
    now: () => new Date('2050-01-01'),
  })
  const result = await drain(service)
  expect(result.removedGenerations).toContain('abandoned-stage')
  expect(result.removedPayloadIds).toEqual(['unreferenced-body'])
  expect(await generations.readArchiveGeneration('history')).toEqual(archive)
  const recovery = await snapshots.readReplacementRecovery('prior')
  expect(recovery?.archiveGeneration).toBe('prior-history')
  expect(
    await generations.readArchiveGeneration(recovery!.archiveGeneration!),
  ).toEqual(archive)
  expect(Array.from(recovery!.bytes)).toEqual([1, 2, 3])
  expect(
    await local.readRecord(['replacement-command', 'ancient-clear']),
  ).toBeDefined()
  expect(await local.readRecord('recovery:opaque')).toEqual({
    coreSnapshotId: 'opaque',
    archiveGeneration: 'opaque',
  })
  const usage = await service.getArchiveUsage()
  expect(usage.active.notes).toBe(1)
  expect(usage.active.payloads).toBe(3)
  expect(usage.active.logicalPayloadBytes).toBe(
    archive.payloads.reduce((n, p) => n + p.byteLength, 0),
  )
})
it.each(['missing', 'corrupt'])(
  'fails closed with zero collection for %s active readiness',
  async (kind) => {
    const { local } = await fixture()
    await local.transact(['records'], 'readwrite', (s, done) => {
      if (kind === 'missing')
        s.records.delete(['archive-generation', 'history'])
      else s.records.put({ status: 'ready' }, ['archive-generation', 'history'])
      done(undefined)
    })
    await expect(
      createNotesMaintenanceService({ local }).collectBatch(),
    ).rejects.toThrow(/maintenance|recovery/i)
    expect(
      await local.readRecord(['archive-generation', 'abandoned-stage']),
    ).toBeDefined()
    await expect(local.readHead()).rejects.toThrow(/recovery/i)
  },
)
it('refuses fresh certification when the active head is missing but archive/core evidence survives', async () => {
  const { local, snapshots } = await fixture()
  await local.transact(['records'], 'readwrite', (s, done) => {
    s.records.delete('active')
    done(undefined)
  })
  await expect(local.readHead()).rejects.toThrow(/recovery/i)
  await expect(snapshots.readActive()).rejects.toThrow(/recovery/i)
  await expect(
    snapshots.commitSnapshot(new Uint8Array([9]), 'test', new Date()),
  ).rejects.toThrow(/recovery/i)
})
it('keeps incomplete staging rooted and does not compare a stale imported digest after legitimate mutation', async () => {
  const { local, generations } = await fixture()
  await local.writeTechnicalRecord(['archive-generation', 'interrupted'], {
    identity: 'import:old',
    status: 'staging',
    storeIndex: 1,
  })
  const pending = await makeNotesPayload('submitted-code', 'pending', 'pending')
  await local.transact(['payloads'], 'readwrite', (s, done) => {
    s.payloads.put(pending, 'pending')
    done(undefined)
  })
  await drain(createNotesMaintenanceService({ local }))
  await local.transact(['payloads'], 'readonly', (s, done) => {
    const request = s.payloads.get('pending')
    request.onsuccess = () => {
      expect(request.result).toMatchObject({ body: 'pending' })
      done(undefined)
    }
  })
  expect(await local.readHead()).toMatchObject({ archiveGeneration: 'history' })
  expect(
    (await generations.readArchiveGeneration('history')).notes[0]?.document
      .markdown,
  ).toBe('Keep forever.')
})

it('invalidates bounded mark progress for stores-only writes without a head revision change', async () => {
  const { local, generations } = await fixture()
  const maintenance = createNotesMaintenanceService({ local, batchSize: 1 })
  const head = (await local.readHead())!
  await maintenance.collectBatch()
  const before = await local.readRecord(['local-technical-write-epoch'])
  const archive = await makeNotesArchive()
  archive.payloads[0]!.id = 'new-code'
  archive.submissions[0]!.codePayloadId = 'new-code'
  await generations.stageImportedArchive({
    nextGeneration: 'new-pending',
    archive,
  })
  // A new unresolved descriptor roots this same-head staged generation.
  await local.writeTechnicalRecord(['composite-candidate', 'pending'], {
    status: 'prepared',
    fingerprint: 'test',
    descriptor: {
      replacementId: 'pending',
      coreSnapshotId: head.coreSnapshotId,
      archiveGeneration: 'new-pending',
      datasetToken: 'new',
      baseRevision: head.revision,
    },
  })
  expect((await local.readHead())!.revision).toBe(head.revision)
  expect(await local.readRecord(['local-technical-write-epoch'])).not.toBe(
    before,
  )
  await drain(maintenance)
  expect(
    (await generations.readArchiveGeneration('new-pending')).payloads.map(
      (p) => p.id,
    ),
  ).toContain('new-code')
})
it('rolls the technical epoch back with an aborted stores-only write', async () => {
  const { local } = await fixture()
  const before = await local.readRecord(['local-technical-write-epoch'])
  await expect(
    local.transact(['payloads'], 'readwrite', (s, _done, fail) => {
      s.payloads.put('never', 'never')
      fail(new Error('abort'))
    }),
  ).rejects.toThrow('abort')
  expect(await local.readRecord(['local-technical-write-epoch'])).toBe(before)
})

it('permits ordinary active note mutation after staging without comparing a stale import digest', async () => {
  const { local, generations } = await fixture()
  const { createNotesRepository } = await import('../data/notes-repository')
  const repository = createNotesRepository(local)
  const scope = await repository.acquireScope('two-sum')
  expect(
    await repository.saveDocument({
      commandId: 'edit',
      problemSlug: 'two-sum',
      scope,
      target: { kind: 'problem' },
      expectedRevision: 0,
      markdown: 'Edited after import.',
    }),
  ).toMatchObject({ status: 'saved' })
  expect(
    (await generations.readArchiveGeneration('history')).notes[0]?.document
      .markdown,
  ).toBe('Edited after import.')
  await drain(createNotesMaintenanceService({ local }))
  expect(
    (await generations.readArchiveGeneration('prior-history')).notes[0]
      ?.document.markdown,
  ).toBe('Keep forever.')
})
it('resumes a persisted bounded scan after worker restart and retains exact prior bodies', async () => {
  const { local, factory, archive } = await fixture()
  await createNotesMaintenanceService({ local, batchSize: 1 }).collectBatch()
  const reopened = createLocalIdbStore(factory)
  await drain(createNotesMaintenanceService({ local: reopened }))
  const prior =
    await createSnapshotIdbStore(factory).readReplacementRecovery('prior')
  expect(
    await createArchiveGenerationRepository(reopened).readArchiveGeneration(
      prior!.archiveGeneration!,
    ),
  ).toEqual(archive)
})

it.each(['commandId', 'kind', 'requestFingerprint'])(
  'fails closed for a parseable mismatched %s completion fence before collecting pending roots',
  async (field) => {
    const { local } = await fixture(),
      head = (await local.readHead())!
    await local.writeTechnicalRecord(['composite-candidate', 'pending'], {
      status: 'prepared',
      fingerprint: 'test',
      descriptor: {
        replacementId: 'pending',
        coreSnapshotId: head.coreSnapshotId,
        archiveGeneration: 'history',
        datasetToken: head.datasetToken,
        baseRevision: head.revision,
        commandKind: 'restore',
        commandFingerprint: '["restore","digest"]',
      },
    })
    const fence = {
      commandId: 'pending',
      kind: 'restore',
      requestFingerprint: '["restore","digest"]',
      status: 'committed',
      [field]: field === 'kind' ? 'reset' : 'different',
    }
    await local.writeTechnicalRecord(['replacement-command', 'pending'], fence)
    await expect(
      drain(createNotesMaintenanceService({ local })),
    ).rejects.toThrow(/maintenance/i)
    expect(
      await local.readRecord(['archive-generation', 'abandoned-stage']),
    ).toBeDefined()
  },
)

it('keeps interrupted receiving imports and ready exports with exact spool text across decades', async () => {
  const { local } = await fixture()
  const { createBackupTransferService } =
    await import('@/features/backup/server/backup-transfer-service')
  const transfer = createBackupTransferService({
    local,
    currentRevision: () => Promise.resolve(1),
    exportSnapshot: async (consume) => consume({ text: 'immutable export' }, 1),
    preview: () => Promise.resolve({ confirmationToken: 'token' }),
    restore: () => Promise.resolve({ status: 'durable' }),
  })
  const incoming = await transfer.begin('old-dashboard', {
    direction: 'import',
    requestId: 'pending-file',
  })
  await transfer.append('old-dashboard', incoming, 0, '{"partial":')
  const outgoing = await transfer.begin('old-dashboard', {
    direction: 'export',
    requestId: 'pending-export',
  })
  await drain(
    createNotesMaintenanceService({ local, now: () => new Date('2090-01-01') }),
  )
  expect(
    await local.readRecord(['backup-transfer-chunk', incoming.sessionId, 0]),
  ).toBe('{"partial":')
  expect((await transfer.read('old-dashboard', outgoing, 0)).text).toBe(
    '{"text":"immutable export"}',
  )
  expect(
    await local.readRecord([
      'backup-transfer-begin',
      'old-dashboard',
      'pending-file',
    ]),
  ).toBe(incoming.sessionId)
})
it('uses explicit core-only provenance without interpreting opaque recovery fields', async () => {
  const { local } = await fixture(),
    head = (await local.readHead())!
  const opaque = {
    key: 'active',
    archiveGeneration: 'does-not-exist',
    datasetToken: 'opaque',
    coreSnapshotId: 'familiar-but-not-a-pointer',
  }
  await local.transact(['records', 'coreSnapshots'], 'readwrite', (s, done) => {
    s.records.put(opaque, 'recovery')
    s.coreSnapshots.put(
      { kind: 'core-only', coreSnapshotId: head.coreSnapshotId },
      ['recordReference', 'recovery'],
    )
    done(undefined)
  })
  await drain(createNotesMaintenanceService({ local }))
  expect(await local.readRecord('recovery')).toEqual(opaque)
  expect(
    await createNotesMaintenanceService({ local }).getArchiveUsage(),
  ).toMatchObject({ recoveryLogicalPayloadBytes: 0 })
})
it('makes normal Notes reads reject a missing marker rather than synthesizing an empty document', async () => {
  const { local } = await fixture()
  const { createNotesRepository } = await import('../data/notes-repository')
  await local.transact(['records'], 'readwrite', (s, done) => {
    s.records.delete(['archive-generation', 'history'])
    done(undefined)
  })
  await expect(
    createNotesRepository(local).readDocument('two-sum', { kind: 'problem' }),
  ).rejects.toThrow(/Recovery required/)
})
