// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AiDeadlineError, withAiDeadline } from './operation'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('withAiDeadline', () => {
  it('returns the operation value and removes timeout and caller listener', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    let receivedSignal: AbortSignal | undefined
    const result = await withAiDeadline(
      { timeoutMs: 100, signal: controller.signal },
      (signal) => {
        receivedSignal = signal
        return Promise.resolve(42)
      },
    )
    expect(result).toBe(42)
    expect(receivedSignal?.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1])
  })

  it('rejects a stalled operation even when it ignores the abort signal', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const pending = withAiDeadline({ timeoutMs: 100 }, async (input) => {
      signal = input
      return new Promise(() => {})
    })
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AiDeadlineError',
      code: 'timeout',
    })
    await vi.advanceTimersByTimeAsync(101)
    await assertion
    expect(signal?.aborted).toBe(true)
    expect(signal?.reason).toBeInstanceOf(AiDeadlineError)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses a controlled cancellation reason and cleans up on external abort', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    let signal: AbortSignal | undefined
    const pending = withAiDeadline(
      { timeoutMs: 100, signal: controller.signal },
      async (input) => {
        signal = input
        return new Promise(() => {})
      },
    )
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'cancelled',
      message: 'AI request was cancelled.',
    })
    await Promise.resolve()
    controller.abort(new Error('private key from caller'))
    await assertion
    const reason: unknown = signal?.reason
    expect(reason).toBeInstanceOf(AiDeadlineError)
    if (reason instanceof AiDeadlineError)
      expect(reason.message).not.toContain('private key')
    expect(remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not invoke the operation for an already aborted signal', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    controller.abort()
    const operation = vi.fn(() => Promise.resolve(1))
    await expect(
      withAiDeadline({ timeoutMs: 100, signal: controller.signal }, operation),
    ).rejects.toMatchObject({ code: 'cancelled' })
    expect(operation).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up on a synchronous preparation exception', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const exception = new Error('preparation failed')
    await expect(
      withAiDeadline({ timeoutMs: 100, signal: controller.signal }, () => {
        throw exception
      }),
    ).rejects.toBe(exception)
    expect(remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not dispatch work after a zero or invalid deadline', async () => {
    vi.useFakeTimers()
    const operation = vi.fn(() => Promise.resolve(1))
    for (const timeoutMs of [0, -1, NaN, Infinity]) {
      await expect(
        withAiDeadline({ timeoutMs }, operation),
      ).rejects.toMatchObject({ code: 'timeout' })
    }
    expect(operation).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
