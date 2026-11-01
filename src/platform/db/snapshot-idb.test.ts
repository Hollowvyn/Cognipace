import {
  IDBDatabase as FakeIDBDatabase,
  IDBObjectStore,
  indexedDB as testIndexedDB,
} from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSnapshotIdbStore, nextDataHead } from './snapshot-idb'
import { localHeadSchema } from './local-store-types'
import * as snapshot from './snapshot'
import { createLocalIdbStore } from './local-idb'

const now = new Date('2026-10-16T00:00:00.000Z')
const fingerprint = 'abcd1234'

function createStore() {
  return createSnapshotIdbStore(testIndexedDB, `test-${crypto.randomUUID()}`)
}

afterEach(() => vi.restoreAllMocks())

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
  expect(Array.from((await local.readCore(first!.coreSnapshotId))!)).toEqual([
    3, 5,
  ])
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
