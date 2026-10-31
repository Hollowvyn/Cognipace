import { describe, expect, it, vi } from 'vitest'

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
