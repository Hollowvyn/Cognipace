import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import { createSnapshotIdbStore } from '@/platform/db/snapshot-idb'
import { createNotesRepository } from '../data/notes-repository'

export async function createNotesTestContext() {
  const factory = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  const localStore = createLocalIdbStore(factory, 'notes-test')
  await createSnapshotIdbStore(factory, 'notes-test').commitSnapshot(
    new Uint8Array([1, 2, 3]),
    'test',
    new Date('2026-10-31T12:00:00Z'),
  )
  return {
    localStore,
    repository: createNotesRepository(localStore),
    close: () =>
      new Promise<void>((resolve, reject) => {
        const request = factory.deleteDatabase('notes-test')
        request.onsuccess = () => resolve()
        request.onerror = () =>
          reject(request.error ?? new Error('Delete failed.'))
      }),
  }
}
