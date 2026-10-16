import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { IDBObjectStore, indexedDB } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import { createSnapshotIdbStore } from '@/platform/db/snapshot-idb'

import {
  createFsrsScalingFixture,
  type FsrsScalingKind,
} from './fsrs-scaling-fixtures'

const selectedKind = process.env.COGNIPACE_IDB_SCALING
const kinds: FsrsScalingKind[] = ['standard', 'stress']
if (selectedKind && !kinds.includes(selectedKind as FsrsScalingKind)) {
  throw new Error('COGNIPACE_IDB_SCALING must be standard or stress.')
}

describe('binary snapshot scaling proof', () => {
  it.skipIf(!selectedKind)(
    'records fixture size, IDB commit, reopen and aborted-write behavior',
    async () => {
      const kind = selectedKind as FsrsScalingKind
      const fixture = await createFsrsScalingFixture(kind)
      const databaseName = `scaling-${kind}-${crypto.randomUUID()}`
      const store = createSnapshotIdbStore(indexedDB, databaseName)
      try {
        const startedCommit = performance.now()
        const committed = await store.commitSnapshot(
          fixture.snapshot,
          'scaling-fingerprint',
          new Date('2026-10-16T00:00:00.000Z'),
        )
        const commitMs = performance.now() - startedCommit
        const reopenedStore = createSnapshotIdbStore(indexedDB, databaseName)
        const startedReopen = performance.now()
        const reopened = await reopenedStore.readActive()
        const reopenMs = performance.now() - startedReopen
        expect(reopened?.bytes.byteLength).toBe(fixture.snapshot.byteLength)
        expect(
          Buffer.compare(
            Buffer.from(reopened!.bytes),
            Buffer.from(fixture.snapshot),
          ),
        ).toBe(0)

        // fake-indexeddb has no browser quota. A forced transaction abort proves
        // that a failed publication leaves the previous active revision intact.
        const tooLarge = new Uint8Array(fixture.snapshot.byteLength + 1)
        const failure = await Promise.resolve().then(async () => {
          const originalPut = Object.getOwnPropertyDescriptor(
            IDBObjectStore.prototype,
            'put',
          )!.value as typeof IDBObjectStore.prototype.put
          vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(
            function (this: globalThis.IDBObjectStore, ...args) {
              const request = originalPut.apply(this, args)
              this.transaction.abort()
              return request
            },
          )
          try {
            await store.commitSnapshot(
              tooLarge,
              'scaling-fingerprint',
              new Date(),
            )
            return 'unexpected-success'
          } catch (error) {
            return error instanceof Error ? error.name : 'UnknownError'
          } finally {
            vi.restoreAllMocks()
          }
        })
        expect(failure).not.toBe('unexpected-success')
        expect((await reopenedStore.readActive())?.revision).toBe(
          committed.revision,
        )

        const report = {
          fixture: kind,
          reviews: fixture.counts.reviews,
          sqliteBytes: fixture.snapshot.byteLength,
          backupJsonBytes: Buffer.byteLength(JSON.stringify(fixture.backup)),
          idbCommitMs: commitMs,
          idbReopenMs: reopenMs,
          simulatedAbort: failure,
          quota:
            'not measured: fake-indexeddb does not enforce Chrome profile quota',
        }
        await mkdir(join('test-results', 'idb-scaling'), { recursive: true })
        await writeFile(
          join('test-results', 'idb-scaling', `${kind}.json`),
          `${JSON.stringify(report, null, 2)}\n`,
        )
      } finally {
        fixture.handle.rawDb.close()
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(databaseName)
          request.onsuccess = () => resolve()
          request.onerror = () =>
            reject(
              request.error ?? new Error('Scaling database deletion failed.'),
            )
          request.onblocked = () =>
            reject(new Error('Scaling database deletion was blocked.'))
        })
      }
    },
    1_800_000,
  )
})
