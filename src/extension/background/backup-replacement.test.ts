import { describe, expect, it, vi } from 'vitest'
import { indexedDB as testIndexedDB } from 'fake-indexeddb'
import { createSnapshotIdbStore } from '@/platform/db/snapshot-idb'

import type { BackupReplacementWork } from '@/features/backup/server/backup-replacement-work'

import { createBackupReplacementCoordinator } from './backup-replacement'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function work(): BackupReplacementWork {
  return {
    kind: 'restore',
    commit: vi.fn().mockResolvedValue(null),
    flush: vi.fn().mockResolvedValue(undefined),
    onDurable: vi.fn().mockResolvedValue(undefined),
    finishSyncMetadata: vi.fn().mockResolvedValue(undefined),
  }
}

describe('backup replacement coordinator', () => {
  it('reports durable pending when the first continuation read fails after publication', async () => {
    const databaseName = `replacement-read-${crypto.randomUUID()}`
    const store = createSnapshotIdbStore(testIndexedDB, databaseName)
    await store.commitSnapshot(new Uint8Array([1]), 'fingerprint', new Date())
    vi.spyOn(store, 'readContinuation')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('readback unavailable'))
    const replacement = work()
    replacement.flush = (input) =>
      store.commitReplacement(
        new Uint8Array([2]),
        'fingerprint',
        new Date(),
        input!,
      )
    const coordinator = createBackupReplacementCoordinator({
      store,
      resume: () => ({
        onDurable: replacement.onDurable,
        finishSyncMetadata: replacement.finishSyncMetadata,
      }),
    })
    expect(await coordinator.run(replacement)).toMatchObject({
      status: 'durable',
      syncMetadataPending: true,
    })
    expect(coordinator.getState().status).toBe('durable-sync-metadata-pending')
    expect(replacement.onDurable).not.toHaveBeenCalled()
    const reopenedStore = createSnapshotIdbStore(testIndexedDB, databaseName)
    const reopened = createBackupReplacementCoordinator({
      store: reopenedStore,
      resume: () => ({
        onDurable: replacement.onDurable,
        finishSyncMetadata: replacement.finishSyncMetadata,
      }),
    })
    await reopened.ready()
    expect(await reopened.retry()).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    expect(replacement.commit).toHaveBeenCalledTimes(1)
    expect((await reopenedStore.readActive())?.bytes[0]).toBe(2)
  })
  it('restarts after invalidation flag persistence fails without replaying the replacement', async () => {
    const databaseName = `replacement-invalidation-${crypto.randomUUID()}`
    const store = createSnapshotIdbStore(testIndexedDB, databaseName)
    const direct = createSnapshotIdbStore(testIndexedDB, databaseName)
    await store.commitSnapshot(new Uint8Array([1]), 'fingerprint', new Date())
    const replacement = work()
    replacement.flush = (input) =>
      store.commitReplacement(
        new Uint8Array([2]),
        'fingerprint',
        new Date(),
        input!,
      )
    vi.spyOn(store, 'markInvalidated').mockImplementationOnce(async (id) => {
      await direct.markInvalidated(id)
      throw new Error('ack lost')
    })
    const initial = createBackupReplacementCoordinator({
      store,
      resume: () => ({
        onDurable: replacement.onDurable,
        finishSyncMetadata: replacement.finishSyncMetadata,
      }),
    })
    expect(await initial.run(replacement)).toMatchObject({
      status: 'durable',
      syncMetadataPending: true,
    })
    expect((await direct.readContinuation())?.needsInvalidation).toBe(false)
    const reopened = createBackupReplacementCoordinator({
      store: direct,
      resume: () => ({
        onDurable: replacement.onDurable,
        finishSyncMetadata: replacement.finishSyncMetadata,
      }),
    })
    await reopened.ready()
    expect(await reopened.retry()).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    expect(replacement.commit).toHaveBeenCalledTimes(1)
    expect(replacement.onDurable).toHaveBeenCalledTimes(1)
    expect(replacement.finishSyncMetadata).toHaveBeenCalledTimes(1)
  })

  it('restarts after metadata flag persistence fails without repeating completed steps', async () => {
    const databaseName = `replacement-metadata-${crypto.randomUUID()}`
    const store = createSnapshotIdbStore(testIndexedDB, databaseName)
    const direct = createSnapshotIdbStore(testIndexedDB, databaseName)
    await store.commitSnapshot(new Uint8Array([1]), 'fingerprint', new Date())
    const replacement = work()
    replacement.flush = (input) =>
      store.commitReplacement(
        new Uint8Array([2]),
        'fingerprint',
        new Date(),
        input!,
      )
    vi.spyOn(store, 'markSyncMetadataComplete').mockImplementationOnce(
      async (id) => {
        await direct.markSyncMetadataComplete(id)
        throw new Error('ack lost')
      },
    )
    const initial = createBackupReplacementCoordinator({
      store,
      resume: () => ({
        onDurable: replacement.onDurable,
        finishSyncMetadata: replacement.finishSyncMetadata,
      }),
    })
    expect(await initial.run(replacement)).toMatchObject({
      status: 'durable',
      syncMetadataPending: true,
    })
    expect((await direct.readContinuation())?.needsSyncMetadata).toBe(false)
    const reopened = createBackupReplacementCoordinator({
      store: direct,
      resume: () => ({
        onDurable: replacement.onDurable,
        finishSyncMetadata: replacement.finishSyncMetadata,
      }),
    })
    await reopened.ready()
    expect(await reopened.retry()).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    expect(replacement.commit).toHaveBeenCalledTimes(1)
    expect(replacement.onDurable).toHaveBeenCalledTimes(1)
    expect(replacement.finishSyncMetadata).toHaveBeenCalledTimes(1)
  })

  it('reports pending if completion acknowledgement and readback fail, then restarts idle', async () => {
    const databaseName = `replacement-complete-${crypto.randomUUID()}`
    const store = createSnapshotIdbStore(testIndexedDB, databaseName)
    const direct = createSnapshotIdbStore(testIndexedDB, databaseName)
    await store.commitSnapshot(new Uint8Array([1]), 'fingerprint', new Date())
    const replacement = work()
    replacement.flush = (input) =>
      store.commitReplacement(
        new Uint8Array([2]),
        'fingerprint',
        new Date(),
        input!,
      )
    vi.spyOn(store, 'completeContinuation').mockImplementationOnce(
      async (id) => {
        await direct.completeContinuation(id)
        throw new Error('ack lost')
      },
    )
    vi.spyOn(store, 'readContinuation')
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => direct.readContinuation())
      .mockRejectedValueOnce(new Error('readback unavailable'))
    const initial = createBackupReplacementCoordinator({
      store,
      resume: () => ({
        onDurable: replacement.onDurable,
        finishSyncMetadata: replacement.finishSyncMetadata,
      }),
    })
    expect(await initial.run(replacement)).toMatchObject({
      status: 'durable',
      syncMetadataPending: true,
    })
    expect(await direct.readContinuation()).toBeNull()
    const reopened = createBackupReplacementCoordinator({
      store: direct,
      resume: () => ({
        onDurable: replacement.onDurable,
        finishSyncMetadata: replacement.finishSyncMetadata,
      }),
    })
    await reopened.ready()
    expect(reopened.getState()).toEqual({ status: 'idle' })
    expect(await reopened.retry()).toEqual({ status: 'no-pending' })
    expect(replacement.commit).toHaveBeenCalledTimes(1)
    expect(replacement.onDurable).toHaveBeenCalledTimes(1)
    expect(replacement.finishSyncMetadata).toHaveBeenCalledTimes(1)
  })
  it('resumes a committed replacement after restart without replaying its commit', async () => {
    const databaseName = `replacement-${crypto.randomUUID()}`
    const store = createSnapshotIdbStore(testIndexedDB, databaseName)
    await store.commitSnapshot(new Uint8Array([1]), 'fingerprint', new Date())
    const replacement = work()
    replacement.syncMetadataPatch = { gistId: 'gist-1' }
    replacement.flush = (input) =>
      store.commitReplacement(
        new Uint8Array([2]),
        'fingerprint',
        new Date(),
        input!,
      )
    vi.mocked(replacement.onDurable).mockRejectedValueOnce(
      new Error('transport'),
    )
    const initial = createBackupReplacementCoordinator({
      store,
      resume: () => ({
        onDurable: replacement.onDurable,
        finishSyncMetadata: replacement.finishSyncMetadata,
      }),
    })
    expect(await initial.run(replacement)).toMatchObject({
      status: 'durable',
      syncMetadataPending: true,
    })
    const continuation = await store.readContinuation()
    expect(continuation?.syncMetadataPatch).toEqual({ gistId: 'gist-1' })
    expect(continuation?.needsInvalidation).toBe(true)
    const reopenedStore = createSnapshotIdbStore(testIndexedDB, databaseName)
    const reopened = createBackupReplacementCoordinator({
      store: reopenedStore,
      resume: () => ({
        onDurable: replacement.onDurable,
        finishSyncMetadata: replacement.finishSyncMetadata,
      }),
    })
    await reopened.ready()
    expect(reopened.getState().status).toBe('durable-sync-metadata-pending')
    await expect(reopened.run(work())).rejects.toThrow('still needs saving')
    expect(await reopened.retry()).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    expect(replacement.commit).toHaveBeenCalledTimes(1)
    expect((await reopenedStore.readActive())?.bytes[0]).toBe(2)
    expect(await reopenedStore.readContinuation()).toBeNull()
  })
  it('retains only publication work after flush failure and retries without committing again', async () => {
    const coordinator = createBackupReplacementCoordinator()
    const replacement = work()
    vi.mocked(replacement.flush).mockRejectedValueOnce(new Error('disk'))
    expect(await coordinator.run(replacement)).toEqual({
      status: 'persistence-pending',
      kind: 'restore',
      summary: null,
    })
    expect(coordinator.getState()).toEqual({
      status: 'persistence-pending',
      kind: 'restore',
      summary: null,
    })
    expect(() => coordinator.assertIdle()).toThrow(
      'Local data replacement still needs saving. Open Settings > Data Management and choose Retry saving.',
    )
    await expect(coordinator.run(work())).rejects.toThrow('still needs saving')
    expect(await coordinator.retry()).toEqual({
      status: 'durable',
      syncMetadataPending: false,
      kind: 'restore',
      summary: null,
    })
    expect(replacement.commit).toHaveBeenCalledTimes(1)
    expect(replacement.flush).toHaveBeenCalledTimes(2)
    expect(replacement.onDurable).toHaveBeenCalledTimes(1)
    expect(replacement.finishSyncMetadata).toHaveBeenCalledTimes(1)
    expect(coordinator.getState()).toEqual({ status: 'idle' })
    expect(await coordinator.retry()).toEqual({ status: 'no-pending' })
    await coordinator.run(replacement)
    expect(replacement.commit).toHaveBeenCalledTimes(2)
  })

  it('retries only strict metadata completion after durable data and a transport failure', async () => {
    const coordinator = createBackupReplacementCoordinator()
    const replacement = work()
    vi.mocked(replacement.onDurable).mockRejectedValue(new Error('transport'))
    vi.mocked(replacement.finishSyncMetadata).mockRejectedValueOnce(
      new Error('storage'),
    )
    expect(await coordinator.run(replacement)).toMatchObject({
      status: 'durable',
      syncMetadataPending: true,
    })
    expect(coordinator.getState()).toMatchObject({
      status: 'durable-sync-metadata-pending',
    })
    expect(await coordinator.retry()).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    expect(replacement.commit).toHaveBeenCalledTimes(1)
    expect(replacement.flush).toHaveBeenCalledTimes(1)
    expect(replacement.onDurable).toHaveBeenCalledTimes(1)
    expect(replacement.finishSyncMetadata).toHaveBeenCalledTimes(2)
  })

  it('rejects concurrent admission during commit, flush and metadata, preserving order', async () => {
    const coordinator = createBackupReplacementCoordinator()
    const replacement = work()
    const commit = deferred(),
      flush = deferred(),
      metadata = deferred()
    vi.mocked(replacement.commit).mockImplementation(async () => {
      await commit.promise
      return null
    })
    vi.mocked(replacement.flush).mockReturnValue(flush.promise)
    vi.mocked(replacement.finishSyncMetadata).mockReturnValue(metadata.promise)
    const result = coordinator.run(replacement)
    expect(() => coordinator.assertIdle()).toThrow()
    expect(replacement.flush).not.toHaveBeenCalled()
    commit.resolve()
    await vi.waitFor(() => expect(replacement.flush).toHaveBeenCalledTimes(1))
    expect(replacement.onDurable).not.toHaveBeenCalled()
    await expect(coordinator.retry()).rejects.toThrow()
    flush.resolve()
    await vi.waitFor(() =>
      expect(replacement.finishSyncMetadata).toHaveBeenCalledTimes(1),
    )
    expect(() => coordinator.assertIdle()).toThrow()
    metadata.resolve()
    await result
    coordinator.assertIdle()
  })

  it('leaves idle on rejected commit and starts a new worker with no remembered callbacks', async () => {
    const coordinator = createBackupReplacementCoordinator()
    const replacement = work()
    vi.mocked(replacement.commit).mockRejectedValueOnce(new Error('rollback'))
    await expect(coordinator.run(replacement)).rejects.toThrow('rollback')
    expect(coordinator.getState()).toEqual({ status: 'idle' })
    expect(replacement.flush).not.toHaveBeenCalled()
    vi.mocked(replacement.flush).mockRejectedValueOnce(new Error('disk'))
    await coordinator.run(replacement)
    const reopened = createBackupReplacementCoordinator()
    expect(reopened.getState()).toEqual({ status: 'idle' })
    expect(await reopened.retry()).toEqual({ status: 'no-pending' })
  })
})
