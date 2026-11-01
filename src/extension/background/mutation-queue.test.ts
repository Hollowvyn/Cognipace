import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as queue from './mutation-queue'

beforeEach(() => vi.resetModules())

async function setup() {
  const queue = await import('./mutation-queue')
  const flush = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const ready = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const assertIdle = vi.fn()
  const waitForPendingCoreSave = vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined)
  queue.configureMutationQueue({
    flush,
    ready,
    assertIdle,
    waitForPendingCoreSave,
  })
  return { queue, flush, ready, assertIdle, waitForPendingCoreSave }
}

describe('shared mutation gate', () => {
  it('exports the single shared queue entry points', () => {
    expect(queue.runConsistentRead).toBeTypeOf('function')
  })

  it.each(['archive mutation', 'export', 'mixed read'])(
    'blocks %s until pending core save is durable',
    async (operation) => {
      const { queue, flush } = await setup()
      const durable = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const work = vi.fn<() => Promise<string>>().mockResolvedValue('read')
      const run =
        operation === 'archive mutation'
          ? queue.runGatedMutationQueue
          : queue.runConsistentRead
      queue.setPendingLocalSave(durable)
      flush.mockRejectedValueOnce(new Error('disk full'))
      await expect(run(work)).rejects.toThrow('Local data still needs saving')
      expect(work).not.toHaveBeenCalled()
      expect(durable).not.toHaveBeenCalled()
      await expect(run(work)).resolves.toBe('read')
      expect(durable).toHaveBeenCalledOnce()
      expect(durable.mock.invocationCallOrder[0]).toBeLessThan(
        work.mock.invocationCallOrder[0]!,
      )
    },
  )

  it('keeps replacement readiness and the core flush ahead of queued archive writes and reads', async () => {
    const { queue, ready, assertIdle, flush } = await setup()
    const events: string[] = []
    let release!: () => void
    ready.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    queue.setPendingLocalSave(() => {
      events.push('durable')
      return Promise.resolve()
    })
    const archive = queue.runGatedMutationQueue(() => {
      events.push('archive')
      return Promise.resolve()
    })
    const read = queue.runConsistentRead(() => {
      events.push('read')
      return Promise.resolve()
    })
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce())
    expect(events).toEqual([])
    expect(flush).not.toHaveBeenCalled()
    release()
    await Promise.all([archive, read])
    expect(events).toEqual(['durable', 'archive', 'read'])
    expect(assertIdle).toHaveBeenCalledTimes(2)
    expect(flush).toHaveBeenCalledOnce()
  })

  it('rejects unresolved replacement operations without flushing or reading', async () => {
    const { queue, assertIdle, flush } = await setup()
    assertIdle.mockImplementation(() => {
      throw new Error('replacement pending')
    })
    const work = vi.fn<() => Promise<void>>()
    await expect(queue.runConsistentRead(work)).rejects.toThrow(
      'replacement pending',
    )
    expect(flush).not.toHaveBeenCalled()
    expect(work).not.toHaveBeenCalled()
  })

  it('preserves explicit nested remote restore detection without reentering the queue', async () => {
    const { queue } = await setup()
    expect(queue.isInMutationQueue()).toBe(false)
    await queue.runInMutationQueue(async () => {
      expect(queue.isInMutationQueue()).toBe(true)
      // Remote restore runs inline only when its caller explicitly knows it owns the queue.
      await Promise.resolve()
    })
    expect(queue.isInMutationQueue()).toBe(false)
  })
})

it('holds archive work behind an already-running core publication', async () => {
  const { queue, waitForPendingCoreSave, flush } = await setup()
  let release!: () => void
  waitForPendingCoreSave.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  const work = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const pending = queue.runGatedMutationQueue(work)
  await vi.waitFor(() => expect(waitForPendingCoreSave).toHaveBeenCalledOnce())
  expect(work).not.toHaveBeenCalled()
  release()
  await pending
  expect(work).toHaveBeenCalledOnce()
  expect(flush).not.toHaveBeenCalled()
})

it('turns a failed automatic-publication join into a retryable core save', async () => {
  const { queue, waitForPendingCoreSave, flush } = await setup()
  waitForPendingCoreSave.mockRejectedValueOnce(new Error('disk full'))
  const work = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  await expect(queue.runConsistentRead(work)).rejects.toThrow(
    'Local data still needs saving',
  )
  expect(work).not.toHaveBeenCalled()
  expect(queue.isLocalSavePending()).toBe(true)
  await queue.runConsistentRead(work)
  expect(flush).toHaveBeenCalledOnce()
  expect(work).toHaveBeenCalledOnce()
  expect(queue.isLocalSavePending()).toBe(false)
})
