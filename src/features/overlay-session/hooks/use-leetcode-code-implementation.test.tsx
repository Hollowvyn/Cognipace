import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  generateLeetCodeImplementationViaRuntime,
  cancelLeetCodeImplementationViaRuntime,
  implementationIdentity,
} from '@/features/leetcode-review-assistant'
import {
  makeAnalysisRequest,
  makeValidFeedback,
  makeValidAnalysis,
} from '@/features/leetcode-review-assistant/testing/code-analysis-fixtures'
import { useLeetCodeCodeImplementation } from './use-leetcode-code-implementation'
import type { CodeAnalysisState } from './use-leetcode-code-analysis'
const connection = vi.hoisted(() => ({ revision: 0 }))
vi.mock('@/features/genai', () => ({
  useGenAiConfigurationRevision: () => ({
    revision: connection.revision,
    readRevision: () => connection.revision,
  }),
}))
vi.mock('@/features/leetcode-review-assistant', async (original) => ({
  ...(await original<typeof import('@/features/leetcode-review-assistant')>()),
  generateLeetCodeImplementationViaRuntime: vi.fn(),
  cancelLeetCodeImplementationViaRuntime: vi.fn(),
}))
const generate = vi.mocked(generateLeetCodeImplementationViaRuntime)
const cancel = vi.mocked(cancelLeetCodeImplementationViaRuntime)
const ready = (): CodeAnalysisState => ({
  status: 'ready',
  requestId: 'request-1',
  report: makeValidFeedback(),
  assessment: makeAnalysisRequest(),
  host: 'leetcode.com',
})
function deferred<T>() {
  let resolve!: (value: T) => void
  return {
    promise: new Promise<T>((done) => {
      resolve = done
    }),
    resolve: (value: T) => resolve(value),
  }
}
beforeEach(() => {
  connection.revision = 0
  generate.mockReset().mockImplementation((request) =>
    Promise.resolve({
      status: 'ready',
      ...implementationIdentity(request),
      report: {
        version: 'leetcode-code-implementation-v1',
        status: 'ready',
        implementation: makeValidAnalysis().suggestedImplementation!,
      },
      providerMetadata: {
        provider: 'gemini',
        model: 'fixture',
        durationMs: 1,
      },
    }),
  )
  cancel.mockReset().mockResolvedValue({ requestId: 'unused', cancelled: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
it('does no work until explicit activation, sends the original pin and feedback, coalesces and retains code', async () => {
  const owner = ready()
  const { result, rerender } = renderHook(useLeetCodeCodeImplementation, {
    initialProps: owner,
  })
  expect(generate).not.toHaveBeenCalled()
  await act(async () => {
    result.current.generate()
    result.current.generate()
    await Promise.resolve()
  })
  expect(generate).toHaveBeenCalledTimes(1)
  expect(generate.mock.calls[0]![0]).toMatchObject({
    assessment: owner.status === 'ready' ? owner.assessment : undefined,
    feedback: owner.status === 'ready' ? owner.report : undefined,
    assessmentRequestId: 'request-1',
  })
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  rerender({ ...owner })
  await act(async () => {
    result.current.generate()
    await Promise.resolve()
  })
  expect(generate).toHaveBeenCalledTimes(1)
  expect(result.current.state.status).toBe('ready')
})
it('retries only implementation after a controlled error and preserves feedback ownership', async () => {
  generate.mockImplementationOnce((request) =>
    Promise.resolve({
      status: 'error',
      ...implementationIdentity(request),
      code: 'network',
      message: 'Offline.',
    }),
  )
  const owner = ready()
  const { result } = renderHook(useLeetCodeCodeImplementation, {
    initialProps: owner,
  })
  await act(async () => {
    result.current.generate()
    await Promise.resolve()
  })
  await waitFor(() =>
    expect(result.current.state).toEqual({
      status: 'error',
      message: 'Offline.',
    }),
  )
  await act(async () => {
    result.current.generate()
    await Promise.resolve()
  })
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(generate).toHaveBeenCalledTimes(2)
  expect(generate.mock.calls[0]![0].assessment).toEqual(
    generate.mock.calls[1]![0].assessment,
  )
  expect(generate.mock.calls[0]![0].requestId).not.toBe(
    generate.mock.calls[1]![0].requestId,
  )
})
it.each(['reset', 'attempt', 'revision', 'disable', 'navigation'] as const)(
  'cancels and discards stale code on %s',
  async (change) => {
    const pending = deferred<Awaited<ReturnType<typeof generate>>>()
    generate.mockReturnValue(pending.promise)
    const { result, rerender } = renderHook(useLeetCodeCodeImplementation, {
      initialProps: ready(),
    })
    await act(async () => {
      result.current.generate()
      await Promise.resolve()
    })
    const request = generate.mock.calls[0]![0]
    if (change === 'revision') {
      connection.revision = 1
      rerender(ready())
    } else if (change === 'attempt') {
      const next = ready()
      if (next.status === 'ready') {
        next.requestId = 'request-2'
        next.assessment.requestId = 'request-2'
        next.assessment.attemptId = 'attempt-2'
      }
      rerender(next)
    } else rerender({ status: change === 'disable' ? 'disabled' : 'idle' })
    expect(result.current.state.status).toBe('idle')
    expect(cancel).toHaveBeenCalledWith({
      surface: 'content-script',
      requestId: request.requestId,
    })
    await act(async () => {
      pending.resolve({
        status: 'ready',
        ...implementationIdentity(request),
        report: {
          version: 'leetcode-code-implementation-v1',
          status: 'ready',
          implementation: makeValidAnalysis().suggestedImplementation!,
        },
        providerMetadata: {
          provider: 'gemini',
          model: 'fixture',
          durationMs: 1,
        },
      })
      await Promise.resolve()
    })
    expect(result.current.state.status).toBe('idle')
  },
)
it('reports a responsible unavailable result without replacing feedback', async () => {
  generate.mockImplementation((request) =>
    Promise.resolve({
      status: 'ready',
      ...implementationIdentity(request),
      report: {
        version: 'leetcode-code-implementation-v1',
        status: 'unavailable',
        reason: 'Missing callable signature.',
      },
      providerMetadata: { provider: 'gemini', model: 'fixture', durationMs: 1 },
    }),
  )
  const { result } = renderHook(useLeetCodeCodeImplementation, {
    initialProps: ready(),
  })
  await act(async () => {
    result.current.generate()
    await Promise.resolve()
  })
  await waitFor(() =>
    expect(result.current.state).toEqual({
      status: 'unavailable',
      message: 'Missing callable signature.',
    }),
  )
})
it('bounds the client at 80 seconds and cancels background work', async () => {
  vi.useFakeTimers()
  generate.mockReturnValue(new Promise(() => {}))
  const { result } = renderHook(useLeetCodeCodeImplementation, {
    initialProps: ready(),
  })
  await act(async () => {
    result.current.generate()
    await Promise.resolve()
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(80_000)
  })
  expect(result.current.state.status).toBe('error')
  if (result.current.state.status === 'error')
    expect(result.current.state.message).toContain('timed out')
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})
