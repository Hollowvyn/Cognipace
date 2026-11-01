import {
  IDBDatabase as FakeIDBDatabase,
  IDBObjectStore,
  IDBKeyRange,
  indexedDB as testIndexedDB,
} from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSnapshotIdbStore, nextDataHead } from './snapshot-idb'
import { coreRecordReferenceKey, localHeadSchema } from './local-store-types'
import * as snapshot from './snapshot'
import { createLocalIdbStore } from './local-idb'

const now = new Date('2026-10-16T00:00:00.000Z')
const fingerprint = 'abcd1234'

function createStore() {
  return createSnapshotIdbStore(testIndexedDB, `test-${crypto.randomUUID()}`)
}

beforeEach(() => vi.stubGlobal('IDBKeyRange', IDBKeyRange))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('binary IndexedDB snapshot ledger', () => {
  it('keeps one selectable latest replacement recovery through repeated replacements', async () => {
    const store = createStore()
    await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
    await store.commitReplacement(new Uint8Array([2]), fingerprint, now, {
      replacementId: 'first',
      kind: 'restore',
    })
    expect(await store.listReplacementRecoveries()).toMatchObject([
      { replacementId: 'first', revision: 1 },
    ])
    expect((await store.readReplacementRecovery('first'))?.bytes[0]).toBe(1)
    await store.markInvalidated('first')
    await store.markSyncMetadataComplete('first')
    await store.completeContinuation('first')
    await store.commitRecovery('replacement:legacy', {
      bytes: new Uint8Array([0]),
    })
    await store.commitReplacement(new Uint8Array([3]), fingerprint, now, {
      replacementId: 'second',
      kind: 'reset',
    })
    expect(await store.listReplacementRecoveries()).toMatchObject([
      { replacementId: 'second', revision: 2 },
    ])
    expect(await store.readReplacementRecovery('first')).toBeNull()
    expect((await store.readReplacementRecovery('second'))?.bytes[0]).toBe(2)
    expect(await store.readRecovery('replacement:first')).toBeNull()
    expect(await store.readRecovery('replacement:second')).toBeNull()
    expect(await store.readRecovery('replacement:legacy')).toBeNull()
  })

  it('preserves the latest recovery when a later replacement aborts', async () => {
    const store = createStore()
    await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
    await store.commitReplacement(new Uint8Array([2]), fingerprint, now, {
      replacementId: 'first',
      kind: 'restore',
    })
    await store.markInvalidated('first')
    await store.markSyncMetadataComplete('first')
    await store.completeContinuation('first')
    await store.commitRecovery('replacement:legacy', {
      bytes: new Uint8Array([0]),
    })
    const originalPut = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'put',
    )!.value as typeof IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: globalThis.IDBObjectStore,
      ...args
    ) {
      const request = originalPut.apply(this, args)
      this.transaction.abort()
      return request
    })
    await expect(
      store.commitReplacement(new Uint8Array([3]), fingerprint, now, {
        replacementId: 'second',
        kind: 'reset',
      }),
    ).rejects.toThrow()
    vi.restoreAllMocks()
    expect((await store.readActive())?.bytes[0]).toBe(2)
    expect((await store.readReplacementRecovery('first'))?.bytes[0]).toBe(1)
    expect(await store.readReplacementRecovery('second')).toBeNull()
    expect(await store.readRecovery('replacement:legacy')).not.toBeNull()
  })

  it('tracks a schema-upgraded descendant of a committed replacement', async () => {
    const store = createStore()
    await store.commitSnapshot(new Uint8Array([1]), 'old-schema', now)
    const committed = await store.commitReplacement(
      new Uint8Array([2]),
      'old-schema',
      now,
      { replacementId: 'restore-1', kind: 'restore' },
    )
    const upgraded = await store.commitSnapshot(
      new Uint8Array([3]),
      'new-schema',
      now,
    )
    expect(upgraded.revision).toBe(committed.revision + 1)
    expect(upgraded.replacementId).toBe('restore-1')
    await expect(
      store.commitSnapshot(new Uint8Array([4]), 'new-schema', now),
    ).rejects.toThrow()
  })
  it('atomically replaces active data and retains recovery plus restart continuation', async () => {
    const store = createStore()
    await store.commitSnapshot(new Uint8Array([7]), fingerprint, now)
    const candidate = new Uint8Array([8])
    const committed = await store.commitReplacement(
      candidate,
      fingerprint,
      now,
      {
        replacementId: 'restore-1',
        kind: 'restore',
      },
    )
    expect(committed).toMatchObject({ revision: 2, lastVerifiedRevision: 0 })
    expect((await store.readActive())?.bytes[0]).toBe(8)
    expect((await store.readReplacementRecovery('restore-1'))?.bytes[0]).toBe(7)
    expect(await store.readContinuation()).toMatchObject({
      replacementId: 'restore-1',
      committedRevision: 2,
      needsInvalidation: true,
      needsSyncMetadata: true,
    })
    await expect(
      store.commitReplacement(new Uint8Array([9]), fingerprint, now, {
        replacementId: 'restore-2',
        kind: 'reset',
      }),
    ).rejects.toThrow()
    await store.markInvalidated('restore-1')
    await store.markSyncMetadataComplete('restore-1')
    await store.completeContinuation('restore-1')
    expect(await store.readContinuation()).toBeNull()
  })

  it('keeps the old active snapshot after replacement publication aborts', async () => {
    const store = createStore()
    await store.commitSnapshot(new Uint8Array([7]), fingerprint, now)
    const originalPut = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'put',
    )!.value as typeof IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: globalThis.IDBObjectStore,
      ...args
    ) {
      const request = originalPut.apply(this, args)
      this.transaction.abort()
      return request
    })
    await expect(
      store.commitReplacement(new Uint8Array([8]), fingerprint, now, {
        replacementId: 'restore-1',
        kind: 'restore',
      }),
    ).rejects.toThrow()
    vi.restoreAllMocks()
    expect((await store.readActive())?.bytes[0]).toBe(7)
    expect(await store.readContinuation()).toBeNull()
  })
  it('closes a late connection after a blocked open rejects', async () => {
    const databaseName = `test-${crypto.randomUUID()}`
    const request = testIndexedDB.open(databaseName, 1)
    const opened = new Promise<void>((resolve) => {
      request.addEventListener('success', () => resolve())
    })
    const close = vi.spyOn(FakeIDBDatabase.prototype, 'close')
    const factory = { open: () => request } as unknown as IDBFactory
    const store = createSnapshotIdbStore(factory, databaseName)

    const pendingRead = store.readActive()
    queueMicrotask(() => {
      request.onblocked?.call(
        request,
        new Event('blocked') as IDBVersionChangeEvent,
      )
    })

    await expect(pendingRead).rejects.toThrow('blocked')
    await opened
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('copies caller bytes before the asynchronous commit starts', async () => {
    const store = createStore()
    const bytes = new Uint8Array([7])

    const pendingCommit = store.commitSnapshot(bytes, fingerprint, now)
    bytes[0] = 8

    expect((await pendingCommit).bytes[0]).toBe(7)
    expect((await store.readActive())?.bytes[0]).toBe(7)
  })

  it('round-trips a 12 MB byte array without base64 and advances revisions', async () => {
    const store = createStore()
    const bytes = new Uint8Array(12 * 1024 * 1024)
    bytes[0] = 7

    const first = await store.commitSnapshot(bytes, fingerprint, now)
    expect(first).toMatchObject({
      key: 'active',
      fingerprint,
      revision: 1,
      lastVerifiedRevision: 0,
      savedAt: now.toISOString(),
    })
    expect(Buffer.compare(Buffer.from(first.bytes), Buffer.from(bytes))).toBe(0)
    const persistedFirst = await store.readActive()
    expect(persistedFirst?.bytes.byteLength).toBe(bytes.byteLength)
    expect(
      Buffer.compare(Buffer.from(persistedFirst!.bytes), Buffer.from(bytes)),
    ).toBe(0)
    bytes[0] = 9
    expect((await store.readActive())?.bytes[0]).toBe(7)

    const changedBytes = bytes.slice()
    changedBytes[0] = 8
    await store.commitSnapshot(changedBytes, fingerprint, now)
    await store.acknowledgeVerifiedRevision(1)

    const persistedSecond = await store.readActive()
    expect(persistedSecond).toMatchObject({
      key: 'active',
      fingerprint,
      revision: 2,
      lastVerifiedRevision: 1,
      savedAt: now.toISOString(),
    })
    expect(
      Buffer.compare(
        Buffer.from(persistedSecond!.bytes),
        Buffer.from(changedBytes),
      ),
    ).toBe(0)
  }, 30_000)

  it('keeps the prior active record when a write transaction aborts', async () => {
    const store = createStore()
    const original = await store.commitSnapshot(
      new Uint8Array([7]),
      fingerprint,
      now,
    )
    const originalPut = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'put',
    )!.value as typeof IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: globalThis.IDBObjectStore,
      ...args
    ) {
      const request = originalPut.apply(this, args)
      this.transaction.abort()
      return request
    })

    await expect(
      store.commitSnapshot(new Uint8Array([8]), fingerprint, now),
    ).rejects.toThrow()
    const persisted = await store.readActive()
    expect(persisted).toMatchObject({
      revision: original.revision,
      lastVerifiedRevision: original.lastVerifiedRevision,
      fingerprint: original.fingerprint,
      savedAt: original.savedAt,
    })
    expect(persisted?.bytes[0]).toBe(7)
  })

  it('rejects acknowledgement of a future revision', async () => {
    const store = createStore()
    const original = await store.commitSnapshot(
      new Uint8Array([7]),
      fingerprint,
      now,
    )

    await expect(store.acknowledgeVerifiedRevision(2)).rejects.toThrow()
    const persisted = await store.readActive()
    expect(persisted).toMatchObject({
      revision: original.revision,
      lastVerifiedRevision: original.lastVerifiedRevision,
      fingerprint: original.fingerprint,
      savedAt: original.savedAt,
    })
    expect(persisted?.bytes[0]).toBe(7)
  })

  it('rejects revision overflow without changing the active record', async () => {
    const databaseName = `test-${crypto.randomUUID()}`
    const store = createSnapshotIdbStore(testIndexedDB, databaseName)
    await store.commitSnapshot(new Uint8Array([7]), fingerprint, now)

    const request = testIndexedDB.open(databaseName)
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Open failed.'))
    })
    const transaction = database.transaction('records', 'readwrite')
    transaction.objectStore('records').put(
      {
        key: 'active',
        fingerprint,
        bytes: new Uint8Array([7]),
        revision: Number.MAX_SAFE_INTEGER,
        lastVerifiedRevision: 0,
        savedAt: now.toISOString(),
      },
      'active',
    )
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Write failed.'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Write aborted.'))
    })
    database.close()

    await expect(
      store.commitSnapshot(new Uint8Array([8]), fingerprint, now),
    ).rejects.toThrow()
    expect((await store.readActive())?.revision).toBe(Number.MAX_SAFE_INTEGER)
    expect((await store.readActive())?.bytes[0]).toBe(7)
  })

  it('rejects corrupt persisted active data instead of treating it as absent', async () => {
    const databaseName = `test-${crypto.randomUUID()}`
    const store = createSnapshotIdbStore(testIndexedDB, databaseName)
    await store.readActive()

    const request = testIndexedDB.open(databaseName)
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Open failed.'))
    })
    const transaction = database.transaction('records', 'readwrite')
    transaction
      .objectStore('records')
      .put({ key: 'active', revision: 'bad' }, 'active')
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Write failed.'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Write aborted.'))
    })
    database.close()

    await expect(store.readActive()).rejects.toThrow()
  })
})

it('keeps the published head binary-free and composes the legacy API after acknowledgement', async () => {
  const name = `test-${crypto.randomUUID()}`
  const local = createLocalIdbStore(testIndexedDB, name)
  const snapshots = createSnapshotIdbStore(testIndexedDB, name)
  await snapshots.commitSnapshot(new Uint8Array([3, 5]), fingerprint, now)
  const first = await local.readHead()
  expect(first).not.toHaveProperty('bytes')
  await snapshots.acknowledgeVerifiedRevision(1)
  const verified = await local.readHead()
  expect(verified!.coreSnapshotId).toBe(first!.coreSnapshotId)
  expect(verified!.lastVerifiedRevision).toBe(1)
  await snapshots.commitSnapshot(new Uint8Array([7]), fingerprint, now)
  const next = await local.readHead()
  expect(next!.coreSnapshotId).not.toBe(first!.coreSnapshotId)
  expect(next!.archiveGeneration).toBe(first!.archiveGeneration)
  expect(next!.datasetToken).toBe(first!.datasetToken)
  expect(await local.readCore(first!.coreSnapshotId)).toBeNull()
  expect((await snapshots.readActive())!.bytes[0]).toBe(7)
})

it.each(['active', 'replacement'])(
  'preserves historical technical recovery values with key %s that resemble head references',
  async (key) => {
    const store = createStore()
    for (const coreSnapshotId of ['historical-label', null, 42]) {
      const value = {
        formatVersion: 2,
        coreSnapshotId,
        snapshot: 'base64',
        key,
      }
      const slot = `historical-${String(coreSnapshotId)}`
      await store.commitRecovery(slot, value)
      expect(await store.readRecovery(slot)).toEqual({ value })
    }
  },
)

it('shares revisions across archive-only writes and later core saves without touching core payloads', async () => {
  const name = `test-${crypto.randomUUID()}`
  const local = createLocalIdbStore(testIndexedDB, name)
  const snapshots = createSnapshotIdbStore(testIndexedDB, name)
  await snapshots.commitSnapshot(new Uint8Array([1]), fingerprint, now)
  const first = await local.readHead()
  const serialize = vi.spyOn(snapshot, 'serializeDb')
  const coreWrites = vi.spyOn(IDBObjectStore.prototype, 'add')
  const puts = vi.spyOn(IDBObjectStore.prototype, 'put')
  await local.transact(
    ['records', 'problemNotes'],
    'readwrite',
    (stores, finish, fail) => {
      const request = stores.records.get('active')
      request.onsuccess = () => {
        try {
          const head = nextDataHead(localHeadSchema.parse(request.result), now)
          stores.problemNotes.put(
            { id: 'note-1', archiveGeneration: head.archiveGeneration },
            'note-1',
          )
          stores.records.put(head, 'active')
          finish(undefined)
        } catch (error) {
          fail(error)
        }
      }
    },
  )
  expect(serialize).not.toHaveBeenCalled()
  expect(coreWrites).not.toHaveBeenCalled()
  expect(
    puts.mock.instances.some(
      (store) =>
        store instanceof IDBObjectStore && store.name === 'coreSnapshots',
    ),
  ).toBe(false)
  expect(await local.readHead()).toMatchObject({
    revision: 2,
    coreSnapshotId: first!.coreSnapshotId,
  })
  await snapshots.commitSnapshot(new Uint8Array([2]), fingerprint, now)
  expect(await local.readHead()).toMatchObject({
    revision: 3,
    archiveGeneration: first!.archiveGeneration,
  })
  expect(await local.readRecord('active')).not.toHaveProperty('bytes')
})

it('acknowledges revision seven after an archive write creates eight without reading core bytes', async () => {
  const name = `test-${crypto.randomUUID()}`
  const local = createLocalIdbStore(testIndexedDB, name)
  const snapshots = createSnapshotIdbStore(testIndexedDB, name)
  for (let i = 0; i < 7; i++)
    await snapshots.commitSnapshot(new Uint8Array([i]), fingerprint, now)
  await local.transact(['records'], 'readwrite', (stores, finish) => {
    const read = stores.records.get('active')
    read.onsuccess = () => {
      stores.records.put(
        nextDataHead(localHeadSchema.parse(read.result), now),
        'active',
      )
      finish(undefined)
    }
  })
  const get = vi.spyOn(IDBObjectStore.prototype, 'get')
  const put = vi.spyOn(IDBObjectStore.prototype, 'put')
  await snapshots.acknowledgeVerifiedRevision(7)
  expect(
    get.mock.instances.some(
      (store) =>
        store instanceof IDBObjectStore && store.name === 'coreSnapshots',
    ),
  ).toBe(false)
  expect(
    put.mock.instances.some(
      (store) =>
        store instanceof IDBObjectStore && store.name === 'coreSnapshots',
    ),
  ).toBe(false)
  expect(await local.readHead()).toMatchObject({
    revision: 8,
    lastVerifiedRevision: 7,
  })
  await snapshots.acknowledgeVerifiedRevision(6)
  expect((await local.readHead())!.lastVerifiedRevision).toBe(7)
})

describe('ordinary core retirement', () => {
  function setup() {
    const name = `retirement-${crypto.randomUUID()}`
    return {
      name,
      local: createLocalIdbStore(testIndexedDB, name),
      store: createSnapshotIdbStore(testIndexedDB, name),
    }
  }
  it('bounds retained binary bytes across repeated ordinary commits', async () => {
    const { local, store } = setup()
    const bytes = new Uint8Array(1024 * 1024)
    for (let i = 0; i < 20; i++) {
      bytes[0] = i
      await store.commitSnapshot(bytes, fingerprint, now)
    }
    const rows = await local.transact<Uint8Array[], 'coreSnapshots'>(
      ['coreSnapshots'],
      'readonly',
      (s, done) => {
        const request = s.coreSnapshots.getAll()
        request.onsuccess = () => done(request.result as Uint8Array[])
      },
    )
    expect(rows.reduce((sum, row) => sum + row.byteLength, 0)).toBe(
      bytes.byteLength,
    )
  })
  it.each(['paired', 'core-only', 'legacy'])(
    'preserves %s explicit recovery provenance after restart',
    async (kind) => {
      const { name, local, store } = setup()
      await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
      const head = (await local.readHead())!
      await local.transact(['coreSnapshots'], 'readwrite', (s, done) => {
        s.coreSnapshots.put(
          kind === 'paired'
            ? {
                kind,
                coreSnapshotId: head.coreSnapshotId,
                archiveGeneration: head.archiveGeneration,
                datasetToken: head.datasetToken,
              }
            : {
                ...(kind === 'legacy' ? {} : { kind }),
                coreSnapshotId: head.coreSnapshotId,
              },
          ['recordReference', 'recovery:explicit'],
        )
        done(undefined)
      })
      await createSnapshotIdbStore(testIndexedDB, name).commitSnapshot(
        new Uint8Array([2]),
        fingerprint,
        now,
      )
      expect(Array.from((await local.readCore(head.coreSnapshotId))!)).toEqual([
        1,
      ])
    },
  )
  it.each([
    'replacement-prepublication',
    'replacement-continuation',
    'candidate',
    'malformed',
    'cap',
  ])('keeps outgoing bytes for uncertain %s roots', async (root) => {
    const { local, store } = setup()
    await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
    const head = (await local.readHead())!
    if (root === 'replacement-continuation') {
      await local.writeTechnicalRecord(root, {
        key: root,
        replacementId: 'pending',
        kind: 'restore',
        committedRevision: 1,
        needsInvalidation: true,
        needsSyncMetadata: true,
      })
    } else if (root === 'candidate')
      await local.writeTechnicalRecord(['composite-candidate', 'pending'], {
        sourceBase: head,
      })
    else if (root === 'replacement-prepublication')
      await local.writeTechnicalRecord(root, { sourceBase: head })
    else
      await local.transact(
        ['coreSnapshots', 'records'],
        'readwrite',
        (s, done) => {
          if (root === 'cap') s.coreSnapshots.put(new Uint8Array([9]), 'other')
          for (let i = 0; i < (root === 'cap' ? 64 : 1); i++) {
            s.coreSnapshots.put(
              root === 'malformed'
                ? {}
                : { kind: 'core-only', coreSnapshotId: 'other' },
              ['recordReference', String(i)],
            )
            if (root === 'cap')
              s.records.put(
                { ...head, key: 'replacement', coreSnapshotId: 'other' },
                String(i),
              )
          }
          done(undefined)
        },
      )
    await store.commitSnapshot(new Uint8Array([2]), 'new-schema', now)
    expect(Array.from((await local.readCore(head.coreSnapshotId))!)).toEqual([
      1,
    ])
  })
  it('does not invent roots from opaque recovery lookalikes', async () => {
    const { local, store } = setup()
    await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
    const head = (await local.readHead())!
    await store.commitRecovery('opaque', { ...head, key: 'replacement' })
    await store.commitSnapshot(new Uint8Array([2]), fingerprint, now)
    expect(await local.readCore(head.coreSnapshotId)).toBeNull()
  })
  it.each(['readback-failure', 'changed-head'])(
    'skips retirement after %s',
    async (fault) => {
      const { local, store } = setup()
      await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
      const head = (await local.readHead())!
      const original = Object.getOwnPropertyDescriptor(
        IDBObjectStore.prototype,
        'get',
      )!.value as typeof IDBObjectStore.prototype.get
      let coreReads = 0
      vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
        this: globalThis.IDBObjectStore,
        key,
      ) {
        if (
          this.name === 'coreSnapshots' &&
          typeof key === 'string' &&
          ++coreReads === 2
        ) {
          if (fault === 'readback-failure') throw new Error('readback failed')
          // Queued on the same database while readback is live; executes before
          // the retirement transaction and changes its expected head revision.
          const change = this.transaction.db.transaction('records', 'readwrite')
          const records = change.objectStore('records')
          const active = original.call(records, 'active')
          active.onsuccess = () => {
            const changed = localHeadSchema.parse(active.result)
            records.put(
              { ...changed, revision: changed.revision + 1 },
              'active',
            )
          }
        }
        return original.call(this, key)
      })
      await expect(
        store.commitSnapshot(new Uint8Array([2]), fingerprint, now),
      ).resolves.toMatchObject({ revision: 2 })
      expect(coreReads).toBe(2)
      vi.restoreAllMocks()
      expect(Array.from((await local.readCore(head.coreSnapshotId))!)).toEqual([
        1,
      ])
      expect((await store.readActive())!.bytes[0]).toBe(2)
    },
  )
  it.each(['completed', 'completed-own-core', 'bad-fence'])(
    'checks exact %s candidate fences before retirement',
    async (fault) => {
      const { local, store } = setup()
      await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
      const head = (await local.readHead())!
      await local.writeTechnicalRecord(['composite-candidate', 'completed'], {
        status: 'prepared',
        fingerprint,
        descriptor: {
          baseRevision: 1,
          coreSnapshotId:
            fault === 'completed-own-core' ? head.coreSnapshotId : 'unrelated',
          archiveGeneration: 'archive',
          datasetToken: 'dataset',
          replacementId: 'completed',
          commandKind: 'restore',
          commandFingerprint: 'accepted',
        },
      })
      await local.writeTechnicalRecord(['replacement-command', 'completed'], {
        commandId: 'completed',
        kind: 'restore',
        requestFingerprint: fault !== 'bad-fence' ? 'accepted' : 'wrong',
        status: 'committed',
      })
      await store.commitSnapshot(new Uint8Array([2]), fingerprint, now)
      expect((await local.readCore(head.coreSnapshotId)) === null).toBe(
        fault !== 'bad-fence',
      )
    },
  )
  it.each([
    'missing-reserved-provenance',
    'mismatched-reserved-provenance',
    'dangling-typed-provenance',
  ])(
    'retains outgoing bytes when %s makes recovery roots uncertain',
    async (fault) => {
      const { local, store } = setup()
      await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
      const head = (await local.readHead())!
      if (fault !== 'dangling-typed-provenance')
        await local.writeTechnicalRecord('recovery', {
          ...head,
          key: 'replacement',
        })
      if (fault !== 'missing-reserved-provenance')
        await local.transact(['coreSnapshots'], 'readwrite', (s, done) => {
          s.coreSnapshots.put(new Uint8Array([9]), 'unrelated')
          s.coreSnapshots.put(
            { kind: 'core-only', coreSnapshotId: 'unrelated' },
            [
              'recordReference',
              fault === 'mismatched-reserved-provenance'
                ? 'recovery'
                : 'recovery:dangling',
            ],
          )
          done(undefined)
        })
      await expect(
        store.commitSnapshot(new Uint8Array([2]), fingerprint, now),
      ).resolves.toMatchObject({ revision: 2 })
      expect((await local.readCore(head.coreSnapshotId))?.[0]).toBe(1)
      expect((await store.readActive())!.bytes[0]).toBe(2)
    },
  )
  it.each(['active', 'paired-recovery'])(
    'retains outgoing bytes if %s readiness disappears after readback',
    async (root) => {
      const { local, store } = setup()
      await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
      const head = (await local.readHead())!
      const generation =
        root === 'active' ? head.archiveGeneration : 'recovery-archive'
      if (root === 'paired-recovery') {
        await local.transact(
          ['coreSnapshots', 'records'],
          'readwrite',
          (s, done) => {
            const recovery = {
              ...head,
              key: 'replacement',
              coreSnapshotId: 'unrelated',
              archiveGeneration: generation,
            }
            s.records.put(recovery, 'recovery')
            s.records.put(
              { identity: 'test', status: 'ready', storeIndex: 5 },
              ['archive-generation', generation],
            )
            s.coreSnapshots.put(new Uint8Array([9]), 'unrelated')
            s.coreSnapshots.put(
              {
                kind: 'paired',
                coreSnapshotId: 'unrelated',
                archiveGeneration: generation,
                datasetToken: head.datasetToken,
              },
              ['recordReference', 'recovery'],
            )
            done(undefined)
          },
        )
      }
      const original = Object.getOwnPropertyDescriptor(
        IDBObjectStore.prototype,
        'get',
      )!.value as typeof IDBObjectStore.prototype.get
      let coreReads = 0
      vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
        this: globalThis.IDBObjectStore,
        key,
      ) {
        if (
          this.name === 'coreSnapshots' &&
          typeof key === 'string' &&
          ++coreReads === 2
        ) {
          const change = this.transaction.db.transaction('records', 'readwrite')
          change
            .objectStore('records')
            .delete(['archive-generation', generation])
        }
        return original.call(this, key)
      })
      await expect(
        store.commitSnapshot(new Uint8Array([2]), fingerprint, now),
      ).resolves.toMatchObject({ revision: 2 })
      expect(coreReads).toBe(2)
      vi.restoreAllMocks()
      expect((await local.readCore(head.coreSnapshotId))?.[0]).toBe(1)
      const next = localHeadSchema.parse(await local.readRecord('active'))
      expect(Array.from((await local.readCore(next.coreSnapshotId))!)).toEqual([
        2,
      ])
    },
  )
  it('retains outgoing bytes if the new active core disappears after readback', async () => {
    const { local, store } = setup()
    await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
    const head = (await local.readHead())!
    const original = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'get',
    )!.value as typeof IDBObjectStore.prototype.get
    let coreReads = 0
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
      this: globalThis.IDBObjectStore,
      key,
    ) {
      if (
        this.name === 'coreSnapshots' &&
        typeof key === 'string' &&
        ++coreReads === 2
      ) {
        const change = this.transaction.db.transaction(
          'coreSnapshots',
          'readwrite',
        )
        change.objectStore('coreSnapshots').delete(key)
      }
      return original.call(this, key)
    })
    await expect(
      store.commitSnapshot(new Uint8Array([2]), fingerprint, now),
    ).resolves.toMatchObject({ revision: 2 })
    expect(coreReads).toBe(2)
    vi.restoreAllMocks()
    const next = localHeadSchema.parse(await local.readRecord('active'))
    expect(await local.readCore(next.coreSnapshotId)).toBeNull()
    expect((await local.readCore(head.coreSnapshotId))?.[0]).toBe(1)
  })
  it('preserves explicit provenance whose record target uses an array key', async () => {
    const { local, store } = setup()
    await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
    const head = (await local.readHead())!
    const recordKey = ['recovery', 'typed-array-key']
    await local.transact(
      ['records', 'coreSnapshots'],
      'readwrite',
      (s, done) => {
        s.records.put({ ...head, key: 'replacement' }, recordKey)
        s.coreSnapshots.put(
          { kind: 'core-only', coreSnapshotId: head.coreSnapshotId },
          coreRecordReferenceKey(recordKey),
        )
        done(undefined)
      },
    )
    await store.commitSnapshot(new Uint8Array([2]), fingerprint, now)
    expect((await local.readCore(head.coreSnapshotId))?.[0]).toBe(1)
    expect((await store.readActive())!.bytes[0]).toBe(2)
  })
  it('retains outgoing bytes for malformed candidates with array-valued keys', async () => {
    const { local, store } = setup()
    await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
    const head = (await local.readHead())!
    await local.writeTechnicalRecord(['composite-candidate', ['bad-key']], {})
    await store.commitSnapshot(new Uint8Array([2]), fingerprint, now)
    expect((await local.readCore(head.coreSnapshotId))?.[0]).toBe(1)
    expect((await store.readActive())!.bytes[0]).toBe(2)
  })
  it('stops namespace cursors before reading unrelated source or core bodies', async () => {
    const { local, store } = setup()
    await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
    const head = (await local.readHead())!
    await local.transact(
      ['records', 'coreSnapshots'],
      'readwrite',
      (s, done) => {
        s.records.put(new Uint8Array(1024), ['replacement-source', 'unrelated'])
        s.coreSnapshots.put(new Uint8Array(1024), [
          'unrelated-body',
          'after-prefix',
        ])
        done(undefined)
      },
    )
    const original = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'get',
    )!.value as typeof IDBObjectStore.prototype.get
    let unrelatedReads = 0
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
      this: globalThis.IDBObjectStore,
      key,
    ) {
      if (
        Array.isArray(key) &&
        (key[0] === 'replacement-source' || key[0] === 'unrelated-body')
      ) {
        unrelatedReads++
        throw new Error('unrelated body must stay lazy')
      }
      return original.call(this, key)
    })
    const bodyCursor = vi.spyOn(IDBObjectStore.prototype, 'openCursor')
    await store.commitSnapshot(new Uint8Array([2]), fingerprint, now)
    expect(unrelatedReads).toBe(0)
    expect(bodyCursor).not.toHaveBeenCalled()
    expect(await local.readCore(head.coreSnapshotId)).toBeNull()
    expect((await store.readActive())!.bytes[0]).toBe(2)
  })
  it('keeps a durable save successful when retirement metadata reads throw', async () => {
    const { local, store } = setup()
    await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
    const head = (await local.readHead())!
    const original = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'openKeyCursor',
    )!.value as typeof IDBObjectStore.prototype.openKeyCursor
    const cursor = vi
      .spyOn(IDBObjectStore.prototype, 'openKeyCursor')
      .mockImplementation(function (this: globalThis.IDBObjectStore, ...args) {
        if (this.name === 'coreSnapshots')
          throw new Error('metadata read failed')
        return original.apply(this, args)
      })
    await expect(
      store.commitSnapshot(new Uint8Array([2]), fingerprint, now),
    ).resolves.toMatchObject({ revision: 2 })
    expect(cursor).toHaveBeenCalled()
    vi.restoreAllMocks()
    expect(Array.from((await local.readCore(head.coreSnapshotId))!)).toEqual([
      1,
    ])
    expect((await store.readActive())!.bytes[0]).toBe(2)
  })
  it('keeps a durable save successful when retirement aborts', async () => {
    const { local, store } = setup()
    await store.commitSnapshot(new Uint8Array([1]), fingerprint, now)
    const head = (await local.readHead())!
    const original = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'delete',
    )!.value as typeof IDBObjectStore.prototype.delete
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: globalThis.IDBObjectStore,
      key,
    ) {
      const request = original.call(this, key)
      if (this.name === 'coreSnapshots') this.transaction.abort()
      return request
    })
    await expect(
      store.commitSnapshot(new Uint8Array([2]), fingerprint, now),
    ).resolves.toMatchObject({ revision: 2 })
    expect(Array.from((await local.readCore(head.coreSnapshotId))!)).toEqual([
      1,
    ])
    expect(Array.from((await store.readActive())!.bytes)).toEqual([2])
  })
})
