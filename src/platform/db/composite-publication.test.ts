import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import { createDb, createSqliteWasmLocator, type DbHandle } from './client'
import { createLocalIdbStore } from './local-idb'
import { createSnapshotIdbStore } from './snapshot-idb'
import { serializeDb, deserializeDb } from './snapshot'
import { createCompositePublication } from './composite-publication'
// Platform integration exercises the archive owner rather than duplicating it.
// eslint-disable-next-line no-restricted-imports
import { createArchiveGenerationRepository } from '@/features/notes/data/archive-generation-repository'

const handles: DbHandle[] = []
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  handles.splice(0).forEach((h) => h.rawDb.close())
})
async function core(slug: string) {
  const h = await createDb({
    locateWasm: createSqliteWasmLocator(),
    onMutation: null,
  })
  handles.push(h)
  h.rawDb.exec('CREATE TABLE problems (slug TEXT)')
  h.rawDb.exec({ sql: 'INSERT INTO problems VALUES (?)', bind: [slug] })
  return h
}
it.each([
  'before-stage',
  'during-archive-copy',
  'before-commit',
  'after-commit',
  'notification',
])(
  'reopens an exact core/archive pair at %s and retains the prior pair',
  async (point) => {
    vi.stubGlobal('IDBKeyRange', IDBKeyRange)
    const factory = new IDBFactory()
    const local = createLocalIdbStore(factory)
    const store = createSnapshotIdbStore(factory)
    const old = await core('old-problem')
    await store.commitSnapshot(serializeDb(old), 'test', new Date())
    const head = (await local.readHead())!
    await local.transact(
      ['problemNotes', 'submissions', 'analysisReports', 'payloads'],
      'readwrite',
      (s, done) => {
        s.problemNotes.put(
          {
            problemSlug: 'keep',
            document: {
              formatVersion: 1,
              revision: 1,
              markdown: 'prior markdown',
              updatedAt: null,
            },
            savedAiCollectionRevision: 7,
          },
          [head.archiveGeneration, 'keep'],
        )
        s.submissions.put(
          {
            problemSlug: 'keep',
            id: 's',
            archiveGeneration: head.archiveGeneration,
            codePayloadId: 'code',
          },
          [head.archiveGeneration, 's'],
        )
        s.analysisReports.put(
          {
            problemSlug: 'keep',
            id: 'a',
            archiveGeneration: head.archiveGeneration,
            feedbackPayloadId: 'report',
          },
          [head.archiveGeneration, 'a'],
        )
        s.payloads.put({ body: 'return prior code' }, 'code')
        s.payloads.put({ body: 'prior report body' }, 'report')
        done(undefined)
      },
    )
    const candidateMutationHook = vi.fn()
    const candidateHandle = await createDb({
      locateWasm: createSqliteWasmLocator(),
      onMutation: null,
    })
    handles.push(candidateHandle)
    deserializeDb(candidateHandle, serializeDb(old))
    const { setOnMutationHook } = await import('./proxy')
    setOnMutationHook(candidateMutationHook)
    await candidateHandle.db.run(
      (await import('drizzle-orm'))
        .sql`UPDATE problems SET slug = 'new-problem'`,
    )
    setOnMutationHook(null)
    const candidate = {
      handle: candidateHandle,
      descriptor: {
        baseRevision: head.revision,
        coreSnapshotId: 'next-core',
        archiveGeneration: 'next-archive',
        datasetToken: 'next-dataset',
        replacementId: 'replace-1',
      },
    }
    const publication = createCompositePublication(local, 'test')
    const archive = createArchiveGenerationRepository(local)
    let unpatch = () => {}
    if (point === 'before-commit') {
      const original = Object.getOwnPropertyDescriptor(
        IDBObjectStore.prototype,
        'put',
      )!.value as typeof IDBObjectStore.prototype.put
      const spy = vi
        .spyOn(IDBObjectStore.prototype, 'put')
        .mockImplementation(function (
          this: globalThis.IDBObjectStore,
          ...args
        ) {
          const request = original.apply(this, args)
          if (this.name === 'records' && args[1] === 'active')
            this.transaction.abort()
          return request
        })
      unpatch = () => spy.mockRestore()
    }
    try {
      if (point === 'before-stage') throw new Error('injected')
      await publication.prepare(candidate, async () => {
        await archive.stageArchiveGeneration({
          sourceGeneration: head.archiveGeneration,
          nextGeneration: 'next-archive',
          excludedProblemSlugs: [],
        })
        if (point === 'during-archive-copy') throw new Error('injected')
      })
      await publication.publishCompositeCandidate(candidate, {
        kind: 'restore',
        replacementId: 'replace-1',
      })
      if (point === 'after-commit' || point === 'notification')
        throw new Error('injected')
    } catch {
      /* Simulate worker death; only durable records are used below. */
    }
    unpatch()
    const reopened = createLocalIdbStore(factory)
    const active = (await reopened.readHead())!
    const expectedNew = point === 'after-commit' || point === 'notification'
    expect(active.archiveGeneration).toBe(
      expectedNew ? 'next-archive' : head.archiveGeneration,
    )
    const restored = await createDb({
      locateWasm: createSqliteWasmLocator(),
      onMutation: null,
    })
    handles.push(restored)
    deserializeDb(
      restored,
      new Uint8Array((await reopened.readCore(active.coreSnapshotId))!),
    )
    expect(
      restored.rawDb.exec({
        sql: 'SELECT slug FROM problems',
        returnValue: 'resultRows',
      }),
    ).toEqual([[expectedNew ? 'new-problem' : 'old-problem']])
    async function bodies(generation: string) {
      return reopened.transact(
        ['problemNotes', 'submissions', 'analysisReports', 'payloads'],
        'readonly',
        (s, done) => {
          const result: unknown[] = []
          const note = s.problemNotes.get([generation, 'keep'])
          note.onsuccess = () => {
            result[0] = (
              note.result as { document: { markdown: string } }
            ).document.markdown
          }
          const sub = s.submissions.get([generation, 's'])
          sub.onsuccess = () => {
            const p = s.payloads.get(
              (sub.result as { codePayloadId: string }).codePayloadId,
            )
            p.onsuccess = () => {
              result[1] = (p.result as { body: string }).body
            }
          }
          const report = s.analysisReports.get([generation, 'a'])
          report.onsuccess = () => {
            const p = s.payloads.get(
              (report.result as { feedbackPayloadId: string })
                .feedbackPayloadId,
            )
            p.onsuccess = () => {
              result[2] = (p.result as { body: string }).body
              done(result)
            }
          }
        },
      )
    }
    expect(await bodies(active.archiveGeneration)).toEqual([
      'prior markdown',
      'return prior code',
      'prior report body',
    ])
    if (expectedNew) {
      const recovery =
        (await createSnapshotIdbStore(factory).readReplacementRecovery(
          'replace-1',
        ))!
      expect(recovery.archiveGeneration).toBe(head.archiveGeneration)
      deserializeDb(restored, new Uint8Array(recovery.bytes))
      expect(
        restored.rawDb.exec({
          sql: 'SELECT slug FROM problems',
          returnValue: 'resultRows',
        }),
      ).toEqual([['old-problem']])
      expect(await bodies(recovery.archiveGeneration!)).toEqual([
        'prior markdown',
        'return prior code',
        'prior report body',
      ])
    }
    expect(candidateMutationHook).not.toHaveBeenCalled()
  },
)

it('rejects a changed base and reconciles a committed replacement after lost readback without another revision', async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const factory = new IDBFactory()
  const local = createLocalIdbStore(factory)
  const store = createSnapshotIdbStore(factory)
  const handle = await core('first')
  await store.commitSnapshot(serializeDb(handle), 'test', new Date())
  const head = (await local.readHead())!
  const candidate = {
    handle,
    descriptor: {
      baseRevision: head.revision,
      coreSnapshotId: 'candidate',
      archiveGeneration: 'new',
      datasetToken: 'fresh',
      replacementId: 'replace',
    },
  }
  const publication = createCompositePublication(local, 'test')
  await publication.prepare(candidate, () =>
    local.writeTechnicalRecord(['archive-generation', 'new'], {
      identity: 'test:ready',
      storeIndex: 5,
      status: 'ready',
    }),
  )
  await store.commitSnapshot(serializeDb(handle), 'test', new Date())
  await expect(
    publication.publishCompositeCandidate(candidate, {
      kind: 'restore',
      replacementId: 'replace',
    }),
  ).rejects.toThrow('Local data changed before replacement publication.')
  expect((await local.readHead())!.archiveGeneration).toBe(
    head.archiveGeneration,
  )
  const latest = (await local.readHead())!
  const next = {
    handle,
    descriptor: {
      ...candidate.descriptor,
      baseRevision: latest.revision,
      coreSnapshotId: 'candidate2',
      archiveGeneration: 'new2',
      replacementId: 'replace2',
    },
  }
  await publication.prepare(next, () =>
    local.writeTechnicalRecord(['archive-generation', 'new2'], {
      identity: 'test:ready',
      storeIndex: 5,
      status: 'ready',
    }),
  )
  const read = local.readHead.bind(local)
  vi.spyOn(local, 'readHead')
    .mockImplementationOnce(read)
    .mockRejectedValueOnce(new Error('lost readback'))
  await expect(
    publication.publishCompositeCandidate(next, {
      kind: 'restore',
      replacementId: 'replace2',
    }),
  ).rejects.toThrow('lost readback')
  vi.restoreAllMocks()
  const committed = (await local.readHead())!
  expect(committed.replacementId).toBe('replace2')
  await publication.publishCompositeCandidate(next, {
    kind: 'restore',
    replacementId: 'replace2',
  })
  expect((await local.readHead())!.revision).toBe(committed.revision)
})

it.each(['historical', 'unbound-new-dataset', 'prepared-new-dataset'] as const)(
  'preserves only descriptor-bound fresh scope tokens, rotating %s scopes otherwise',
  async (provenance) => {
    vi.stubGlobal('IDBKeyRange', IDBKeyRange)
    const factory = new IDBFactory()
    const local = createLocalIdbStore(factory)
    const store = createSnapshotIdbStore(factory)
    const handle = await core('scope-problem')
    await store.commitSnapshot(serializeDb(handle), 'test', new Date())
    const head = (await local.readHead())!
    const descriptor = {
      baseRevision: head.revision,
      coreSnapshotId: 'scope-core',
      archiveGeneration: 'scope-archive',
      datasetToken: 'fresh-dataset',
      replacementId: 'scope-replacement',
      initializedProblemScopes: [
        { problemSlug: 'scope-problem', problemToken: 'prepared-token' },
      ],
    }
    await local.transact(['problemScopes'], 'readwrite', (s, done) => {
      s.problemScopes.put(
        {
          datasetToken:
            provenance === 'historical'
              ? head.datasetToken
              : descriptor.datasetToken,
          problemToken:
            provenance === 'unbound-new-dataset'
              ? 'unbound-token'
              : 'prepared-token',
        },
        [descriptor.archiveGeneration, 'scope-problem'],
      )
      done(undefined)
    })
    const publication = createCompositePublication(local, 'test')
    const candidate = { handle, descriptor }
    await publication.prepare(candidate, () =>
      local.writeTechnicalRecord(
        ['archive-generation', descriptor.archiveGeneration],
        { identity: 'test:ready', storeIndex: 5, status: 'ready' },
      ),
    )
    await publication.publishCompositeCandidate(candidate, {
      kind: 'restore',
      replacementId: descriptor.replacementId,
    })
    const scope = await local.transact<
      { datasetToken: string; problemToken: string },
      'problemScopes'
    >(['problemScopes'], 'readonly', (s, done) => {
      const request = s.problemScopes.get([
        descriptor.archiveGeneration,
        'scope-problem',
      ])
      request.onsuccess = () =>
        done(request.result as { datasetToken: string; problemToken: string })
    })
    expect(scope.datasetToken).toBe(descriptor.datasetToken)
    if (provenance === 'prepared-new-dataset')
      expect(scope.problemToken).toBe('prepared-token')
    else
      expect(scope.problemToken).not.toBe(
        provenance === 'historical' ? 'prepared-token' : 'unbound-token',
      )
  },
)

it.each(['missing', 'mismatched'] as const)(
  'rejects %s descriptor-bound Clear scope staging without changing the active pair',
  async (failure) => {
    vi.stubGlobal('IDBKeyRange', IDBKeyRange)
    const factory = new IDBFactory()
    const local = createLocalIdbStore(factory)
    const store = createSnapshotIdbStore(factory)
    const handle = await core('clear-scope')
    await store.commitSnapshot(serializeDb(handle), 'test', new Date())
    const head = (await local.readHead())!
    const descriptor = {
      baseRevision: head.revision,
      coreSnapshotId: 'clear-core',
      archiveGeneration: 'clear-archive',
      datasetToken: 'clear-dataset',
      replacementId: 'clear-operation',
      commandFingerprint: 'clear-request',
      initializedProblemScopes: [
        { problemSlug: 'clear-scope', problemToken: 'prepared-clear-token' },
      ],
    }
    if (failure === 'mismatched')
      await local.transact(['problemScopes'], 'readwrite', (s, done) => {
        s.problemScopes.put(
          {
            datasetToken: descriptor.datasetToken,
            problemToken: 'unexpected-token',
          },
          [descriptor.archiveGeneration, 'clear-scope'],
        )
        done(undefined)
      })
    const publication = createCompositePublication(local, 'test')
    const candidate = { handle, descriptor }
    await publication.prepare(candidate, () =>
      local.writeTechnicalRecord(
        ['archive-generation', descriptor.archiveGeneration],
        { identity: 'test:ready', storeIndex: 5, status: 'ready' },
      ),
    )
    await expect(
      publication.publishCompositeCandidate(candidate, {
        kind: 'reset',
        replacementId: descriptor.replacementId,
        commandFingerprint: descriptor.commandFingerprint,
      }),
    ).rejects.toThrow('Prepared Clear scope')
    expect(await local.readHead()).toEqual(head)
    expect(await store.readContinuation()).toBeNull()
  },
)

it('rejects a corrupt ready generation before committing a replacement head', async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const factory = new IDBFactory(),
    local = createLocalIdbStore(factory),
    store = createSnapshotIdbStore(factory),
    handle = await core('live')
  await store.commitSnapshot(serializeDb(handle), 'test', new Date())
  const head = (await local.readHead())!,
    publication = createCompositePublication(local, 'test')
  const candidate = {
    handle,
    descriptor: {
      baseRevision: head.revision,
      coreSnapshotId: 'corrupt-core',
      archiveGeneration: 'corrupt-generation',
      datasetToken: 'fresh',
      replacementId: 'corrupt-ready',
    },
  }
  await publication.prepare(candidate, () =>
    local.writeTechnicalRecord(['archive-generation', 'corrupt-generation'], {
      identity: 'bad',
      status: 'ready',
      storeIndex: 4,
    }),
  )
  await expect(
    publication.publishCompositeCandidate(candidate, {
      kind: 'restore',
      replacementId: 'corrupt-ready',
    }),
  ).rejects.toThrow(/readiness|incomplete/i)
  expect(await local.readHead()).toEqual(head)
})
