import { IDBObjectStore, indexedDB as testIndexedDB } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSnapshotIdbStore } from './snapshot-idb'

const now = new Date('2026-10-16T00:00:00.000Z')
const fingerprint = 'abcd1234'

function createStore() {
  return createSnapshotIdbStore(testIndexedDB, `test-${crypto.randomUUID()}`)
}

afterEach(() => vi.restoreAllMocks())

describe('binary IndexedDB snapshot ledger', () => {
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
