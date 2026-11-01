import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { createSnapshotIdbStore } from '@/platform/db/snapshot-idb'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearSyncMetadata,
  markLocalDataChanged,
  readSyncMetadata,
  writeSyncMetadata,
} from './sync-metadata-store'

const storage = new Map<string, unknown>()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get(keys: string[] | string) {
          const output: Record<string, unknown> = {}
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            output[key] = storage.get(key)
          }
          return Promise.resolve(output)
        },
        set(values: Record<string, unknown>) {
          for (const [key, value] of Object.entries(values)) {
            storage.set(key, value)
          }
          return Promise.resolve()
        },
        remove(keys: string[] | string) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            storage.delete(key)
          }
          return Promise.resolve()
        },
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sync metadata store', () => {
  it('defaults to disabled clean metadata', async () => {
    await expect(readSyncMetadata()).resolves.toMatchObject({
      enabled: false,
      gistId: null,
      dirtySinceLastSync: false,
      lastPullAt: null,
      lastPushAt: null,
      lastBlockingReason: null,
      conflict: null,
    })
  })

  it('adds directional defaults when reading metadata written before directional sync', async () => {
    storage.set('cognipace_sync_metadata_v1', {
      enabled: true,
      gistId: 'gist_1',
      lastSyncAt: '2026-05-26T12:00:00.000Z',
      lastSyncDirection: 'push',
      lastRemoteVersion: 'remote_1',
      lastRemoteUpdatedAt: '2026-05-26T12:00:00.000Z',
      localDataUpdatedAt: '2026-05-26T11:55:00.000Z',
      dirtySinceLastSync: false,
      lastError: null,
      conflict: null,
    })

    await expect(readSyncMetadata()).resolves.toMatchObject({
      enabled: true,
      gistId: 'gist_1',
      lastPullAt: null,
      lastPushAt: null,
      lastBlockingReason: null,
    })
  })

  it('adds auto-sync retry defaults when reading metadata written before retry state', async () => {
    storage.set('cognipace_sync_metadata_v1', {
      enabled: true,
      gistId: 'gist_1',
      lastSyncAt: '2026-05-26T12:00:00.000Z',
      lastSyncDirection: 'push',
      lastRemoteVersion: 'remote_1',
      lastRemoteUpdatedAt: '2026-05-26T12:00:00.000Z',
      localDataUpdatedAt: '2026-05-26T11:55:00.000Z',
      dirtySinceLastSync: false,
      lastPullAt: null,
      lastPushAt: null,
      lastBlockingReason: null,
      lastError: null,
      conflict: null,
    })

    await expect(readSyncMetadata()).resolves.toMatchObject({
      autoSyncRetryAttempt: 0,
      lastAutoSyncAt: null,
    })
  })

  it('falls back to fresh default metadata when stored metadata is invalid', async () => {
    storage.set('cognipace_sync_metadata_v1', { enabled: true })

    const firstRead = await readSyncMetadata()
    firstRead.enabled = true

    await expect(readSyncMetadata()).resolves.toMatchObject({
      enabled: false,
      gistId: null,
      dirtySinceLastSync: false,
    })
  })

  it('persists metadata patches', async () => {
    await writeSyncMetadata({
      enabled: true,
      gistId: 'gist_1',
      lastRemoteVersion: 'remote_1',
    })

    await expect(readSyncMetadata()).resolves.toMatchObject({
      enabled: true,
      gistId: 'gist_1',
      lastRemoteVersion: 'remote_1',
    })
  })

  it('persists auto-sync retry metadata patches', async () => {
    await writeSyncMetadata({
      autoSyncRetryAttempt: 2,
      lastAutoSyncAt: '2026-05-31T12:00:00.000Z',
    })

    await expect(readSyncMetadata()).resolves.toMatchObject({
      autoSyncRetryAttempt: 2,
      lastAutoSyncAt: '2026-05-31T12:00:00.000Z',
    })
  })

  it('marks local durable data dirty with timestamp', async () => {
    await markLocalDataChanged(new Date('2026-05-26T12:00:00.000Z'))

    await expect(readSyncMetadata()).resolves.toMatchObject({
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:00:00.000Z',
    })
  })

  it('clears metadata', async () => {
    await writeSyncMetadata({ enabled: true, gistId: 'gist_1' })
    await clearSyncMetadata()

    await expect(readSyncMetadata()).resolves.toMatchObject({
      enabled: false,
      gistId: null,
    })
  })
})

it('recovers pending sync from the durable head after a worker restart loses the dirty flag', async () => {
  const factory = new IDBFactory()
  vi.stubGlobal('indexedDB', factory)
  const store = createSnapshotIdbStore(factory)
  await store.commitSnapshot(
    new Uint8Array([1]),
    'test',
    new Date('2026-10-31T00:00:00.000Z'),
  )
  await writeSyncMetadata({
    enabled: true,
    gistId: 'gist_1',
    dirtySinceLastSync: false,
  })
  const get = vi.spyOn(IDBObjectStore.prototype, 'get')
  expect(await readSyncMetadata()).toMatchObject({
    dirtySinceLastSync: true,
    localDataUpdatedAt: '2026-10-31T00:00:00.000Z',
  })
  expect(
    get.mock.instances.some(
      (store) =>
        store instanceof IDBObjectStore && store.name === 'coreSnapshots',
    ),
  ).toBe(false)
  await store.acknowledgeVerifiedRevision(1)
  expect((await readSyncMetadata()).dirtySinceLastSync).toBe(false)
})
