import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  abortLeetCodeAnalyses,
  analysisOwner,
  cancelOwnedAnalysis,
  runOwnedAnalysis,
} from './leetcode-analysis-operations'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish
    reject = fail
  })
  return { promise, resolve, reject }
}
afterEach(() => {
  abortLeetCodeAnalyses()
})

describe('analysis ownership from actual Chrome sender', () => {
  it('allows zero tab/frame ids and separates frames and tabs', () => {
    expect(analysisOwner({ tab: { id: 0 }, frameId: 0 })).toBe('0:0')
    expect(analysisOwner({ tab: { id: 7 }, frameId: 2 })).toBe('7:2')
  })
  it.each([
    null,
    {},
    { tab: { id: 1 } },
    { frameId: 0 },
    { tab: { id: -1 }, frameId: 0 },
    { tab: { id: 1.5 }, frameId: 0 },
    { tab: { id: 1 }, frameId: -1 },
    { tab: { id: 1 }, frameId: 0.5 },
    { tab: { id: '1' }, frameId: 0 },
    { tab: { id: 1 }, frameId: '0' },
  ])('rejects incomplete or invalid owner %j', (sender) => {
    expect(() => analysisOwner(sender)).toThrow(/tab.*frame/i)
  })
})

describe('volatile sender-owned operations', () => {
  it('registers synchronously and shares the exact promise for active duplicate ids', async () => {
    const finish = deferred<string>()
    const work = vi.fn<(signal: AbortSignal) => Promise<string>>(
      () => finish.promise,
    )
    const first = runOwnedAnalysis('duplicate', 'request-1', work)
    const duplicate = runOwnedAnalysis('duplicate', 'request-1', work)
    expect(duplicate).toBe(first)
    expect(work).not.toHaveBeenCalled()
    expect(cancelOwnedAnalysis('duplicate', 'request-1')).toBe(true)
    await Promise.resolve()
    expect(work).toHaveBeenCalledTimes(1)
    expect(work.mock.calls[0]?.[0].aborted).toBe(true)
    finish.resolve('done')
    await expect(first).resolves.toBe('done')
    expect(cancelOwnedAnalysis('duplicate', 'request-1')).toBe(false)
  })

  it('supersedes old work and never lets older completion delete the newer operation', async () => {
    const old = deferred<string>()
    const current = deferred<string>()
    let oldSignal!: AbortSignal
    const first = runOwnedAnalysis('supersession', 'old', (signal) => {
      oldSignal = signal
      return old.promise
    })
    await Promise.resolve()
    const second = runOwnedAnalysis(
      'supersession',
      'new',
      () => current.promise,
    )
    expect(oldSignal.aborted).toBe(true)
    expect(cancelOwnedAnalysis('supersession', 'old')).toBe(false)
    old.resolve('old-done')
    await first
    expect(cancelOwnedAnalysis('supersession', 'new')).toBe(true)
    current.resolve('new-done')
    await second
  })

  it('isolates cancellation by tab, frame, and current request id', async () => {
    const finishes = [deferred<void>(), deferred<void>(), deferred<void>()]
    const owners = ['10:0', '10:1', '11:0']
    const signals: AbortSignal[] = []
    const pending = owners.map((owner, index) =>
      runOwnedAnalysis(owner, 'shared-id', (signal) => {
        signals[index] = signal
        return finishes[index]!.promise
      }),
    )
    await Promise.resolve()
    expect(cancelOwnedAnalysis('10:0', 'stale-id')).toBe(false)
    expect(cancelOwnedAnalysis('12:0', 'shared-id')).toBe(false)
    expect(cancelOwnedAnalysis('10:0', 'shared-id')).toBe(true)
    expect(signals.map((signal) => signal.aborted)).toEqual([
      true,
      false,
      false,
    ])
    finishes.forEach((finish) => finish.resolve())
    await Promise.all(pending)
  })

  it.each(['resolve', 'reject', 'throw'] as const)(
    'cleans up %s completion and allows the same id to run again',
    async (kind) => {
      const finish = deferred<string>()
      const first = runOwnedAnalysis(`cleanup-${kind}`, 'id', () => {
        if (kind === 'throw') throw new Error('controlled test error')
        return finish.promise
      })
      const assertion =
        kind === 'resolve'
          ? expect(first).resolves.toBe('done')
          : expect(first).rejects.toThrow('controlled test error')
      if (kind === 'resolve') finish.resolve('done')
      if (kind === 'reject') finish.reject(new Error('controlled test error'))
      await assertion
      expect(cancelOwnedAnalysis(`cleanup-${kind}`, 'id')).toBe(false)
      const work = vi.fn(() => Promise.resolve('again'))
      const second = runOwnedAnalysis(`cleanup-${kind}`, 'id', work)
      expect(second).not.toBe(first)
      await expect(second).resolves.toBe('again')
      expect(work).toHaveBeenCalledTimes(1)
    },
  )

  it('aborts every active owner without deleting pending ownership early', async () => {
    const finishes = [deferred<void>(), deferred<void>()]
    const signals: AbortSignal[] = []
    const pending = finishes.map((finish, index) =>
      runOwnedAnalysis(`all-${index}`, 'id', (signal) => {
        signals[index] = signal
        return finish.promise
      }),
    )
    await Promise.resolve()
    abortLeetCodeAnalyses()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(cancelOwnedAnalysis('all-0', 'id')).toBe(true)
    finishes.forEach((finish) => finish.resolve())
    await Promise.all(pending)
    expect(cancelOwnedAnalysis('all-0', 'id')).toBe(false)
  })
})
