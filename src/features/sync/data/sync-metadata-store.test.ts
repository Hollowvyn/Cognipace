import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SNAPSHOT_DIRTY_KEY } from '@/platform/db/snapshot'

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
  it('treats the durable snapshot marker as dirty even with clean or invalid metadata', async () => {
    await writeSyncMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
    })
    storage.set(SNAPSHOT_DIRTY_KEY, true)
    await expect(readSyncMetadata()).resolves.toMatchObject({
      enabled: true,
      dirtySinceLastSync: true,
    })
    storage.set('cognipace_sync_metadata_v1', { enabled: true })
    await expect(readSyncMetadata()).resolves.toMatchObject({
      enabled: false,
      dirtySinceLastSync: true,
    })
  })

  it.each([false, 'true', 1, null])(
    'ignores a non-true snapshot dirty marker %j',
    async (marker) => {
      storage.set(SNAPSHOT_DIRTY_KEY, marker)
      await expect(readSyncMetadata()).resolves.toMatchObject({
        dirtySinceLastSync: false,
      })
    },
  )

  it('clears the marker atomically with an explicit clean acknowledgement', async () => {
    await markLocalDataChanged()
    storage.set(SNAPSHOT_DIRTY_KEY, true)
    const set = vi.spyOn(chrome.storage.local, 'set')
    const next = await writeSyncMetadata({ dirtySinceLastSync: false })
    expect(set).toHaveBeenLastCalledWith({
      cognipace_sync_metadata_v1: next,
      [SNAPSHOT_DIRTY_KEY]: false,
    })
    await expect(readSyncMetadata()).resolves.toMatchObject({
      dirtySinceLastSync: false,
    })
  })

  it('retains dirtiness when a clean acknowledgement cannot be saved', async () => {
    await markLocalDataChanged()
    storage.set(SNAPSHOT_DIRTY_KEY, true)
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(
      new Error('storage unavailable'),
    )
    await expect(
      writeSyncMetadata({ dirtySinceLastSync: false }),
    ).rejects.toThrow('storage unavailable')
    expect(storage.get(SNAPSHOT_DIRTY_KEY)).toBe(true)
    await expect(readSyncMetadata()).resolves.toMatchObject({
      dirtySinceLastSync: true,
    })
  })

  it('preserves the snapshot marker through unrelated updates and disconnect', async () => {
    storage.set(SNAPSHOT_DIRTY_KEY, true)
    await writeSyncMetadata({ enabled: false, gistId: null })
    expect(storage.get(SNAPSHOT_DIRTY_KEY)).toBe(true)
    await clearSyncMetadata()
    expect(storage.get(SNAPSHOT_DIRTY_KEY)).toBe(true)
    await expect(readSyncMetadata()).resolves.toMatchObject({
      enabled: false,
      gistId: null,
      dirtySinceLastSync: true,
    })
  })

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
