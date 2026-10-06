import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HintConnectionStatus } from '@/features/genai'
import { makeCompleteCapture } from '@/features/leetcode-capture/testing/code-analysis-capture-fixtures'
import {
  generateLeetCodeHintsRequestSchema,
  generateLeetCodeHintsResponseSchema,
  type GenerateLeetCodeHintsRequest,
  type GenerateLeetCodeHintsResponse,
  type CancelLeetCodeHintsRequest,
  type CancelLeetCodeHintsResponse,
} from '@/features/leetcode-review-assistant'
import type { LeetCodeCaptureState, LeetCodeRemoteClient } from '@/lib/leetcode'

import { useLeetCodeCodeHints } from './use-leetcode-code-hints'

const mocks = vi.hoisted(() => ({
  generate:
    vi.fn<
      (
        request: GenerateLeetCodeHintsRequest,
      ) => Promise<GenerateLeetCodeHintsResponse>
    >(),
  cancel:
    vi.fn<
      (
        request: CancelLeetCodeHintsRequest,
      ) => Promise<CancelLeetCodeHintsResponse>
    >(),
  remote: vi.fn<() => LeetCodeRemoteClient>(),
}))
vi.mock('@/features/leetcode-capture', async (original) => ({
  ...(await original<object>()),
  createLeetCodeCaptureRemoteClient: mocks.remote,
}))
vi.mock('@/features/leetcode-review-assistant', async (original) => ({
  ...(await original<object>()),
  generateLeetCodeHintsViaRuntime: mocks.generate,
  cancelLeetCodeHintsViaRuntime: mocks.cancel,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function capture(): LeetCodeCaptureState {
  return {
    ...makeCompleteCapture(),
    codeSnapshot: null,
    submissionClick: null,
    submissionAttempt: null,
    submissionResult: null,
    submissionPollingDebug: null,
  }
}
const connection: HintConnectionStatus = {
  available: true,
  provider: 'gemini',
  revision: '11111111-1111-4111-8111-111111111111',
}
const nextConnection: HintConnectionStatus = {
  ...connection,
  revision: '22222222-2222-4222-8222-222222222222',
}
function ready(
  request: GenerateLeetCodeHintsRequest,
  hints = [
    'Check the pair relationship.',
    'Consider what you need to remember.',
    'Avoid repeating searches.',
  ],
): GenerateLeetCodeHintsResponse {
  return generateLeetCodeHintsResponseSchema.parse({
    status: 'ready',
    requestId: request.requestId,
    batch: { hints },
  })
}
function mount(
  initial = capture(),
  initialConnection: HintConnectionStatus | null = connection,
) {
  let currentCapture = initial
  let currentConnection = initialConnection
  let token = 0
  const remote = {
    readProblemMetadata: vi.fn<LeetCodeRemoteClient['readProblemMetadata']>(
      () =>
        Promise.resolve({ ok: true, metadata: makeCompleteCapture().metadata }),
    ),
    readProblemContent: vi.fn<LeetCodeRemoteClient['readProblemContent']>(() =>
      Promise.resolve({
        ok: true,
        content: makeCompleteCapture().problemContent,
      }),
    ),
    readSubmissionResult: vi.fn<LeetCodeRemoteClient['readSubmissionResult']>(),
  }
  mocks.remote.mockReturnValue(remote)
  const refreshConnection = vi.fn(() => Promise.resolve(currentConnection))
  const publishCapture = vi.fn(
    (prepared: LeetCodeCaptureState, expected: number) => {
      if (
        token !== expected ||
        prepared.location?.slug !== currentCapture.location?.slug ||
        prepared.location?.host !== currentCapture.location?.host
      )
        return false
      currentCapture = {
        ...currentCapture,
        metadata: prepared.metadata,
        problemContent: prepared.problemContent,
      }
      return true
    },
  )
  const options = () => ({
    activeSlug: 'two-sum',
    capture: currentCapture,
    connection: currentConnection,
    connectionError: false,
    readCapture: () => currentCapture,
    readSyncToken: () => token,
    publishCapture,
    readConnection: () => currentConnection,
    refreshConnection,
  })
  const hook = renderHook(() => useLeetCodeCodeHints(options()), {
    initialProps: options(),
  })
  return {
    ...hook,
    remote,
    publishCapture,
    refreshConnection,
    changeCapture(value: LeetCodeCaptureState) {
      currentCapture = value
      hook.rerender(options())
    },
    changeConnection(value: HintConnectionStatus | null) {
      currentConnection = value
      hook.rerender(options())
    },
    rerenderCurrent() {
      hook.rerender(options())
    },
    changeToken() {
      token += 1
    },
    readCapture: () => currentCapture,
  }
}
async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
async function requestHints(hook: ReturnType<typeof mount>) {
  act(() => hook.result.current.toggle())
  await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generate.mockImplementation((request: GenerateLeetCodeHintsRequest) =>
    Promise.resolve(ready(generateLeetCodeHintsRequestSchema.parse(request))),
  )
  mocks.cancel.mockResolvedValue({
    cancelled: true,
    requestId: 'cancelled-request',
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('explicit progressive hint sessions', () => {
  it('does no work on render and coalesces two same-turn toggles into one public-only request', async () => {
    const hook = mount()
    await settle()
    expect(hook.result.current.state).toEqual({ status: 'idle', isOpen: false })
    expect(mocks.generate).not.toHaveBeenCalled()
    act(() => {
      hook.result.current.toggle()
      hook.result.current.toggle()
    })
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
    expect(hook.result.current.state).toMatchObject({
      isOpen: true,
      revealedCount: 1,
    })
    expect(mocks.generate).toHaveBeenCalledOnce()
    expect(
      Object.keys(mocks.generate.mock.calls[0]![0].problem).sort(),
    ).toEqual(['constraints', 'examples', 'host', 'slug', 'statement', 'title'])
    expect(hook.remote.readSubmissionResult).not.toHaveBeenCalled()
  })
  it('reveals locally and preserves ready counts through reopen and excluded enrichment', async () => {
    const hook = mount()
    await requestHints(hook)
    act(() => {
      hook.result.current.revealNext()
      hook.result.current.revealNext()
      hook.result.current.revealNext()
    })
    expect(hook.result.current.state).toMatchObject({ revealedCount: 3 })
    act(() => hook.result.current.toggle())
    expect(hook.result.current.state.isOpen).toBe(false)
    hook.changeCapture({
      ...makeCompleteCapture(),
      metadata: {
        ...makeCompleteCapture().metadata,
        topics: [],
        capturedAt: 9999,
      },
      problemContent: {
        ...makeCompleteCapture().problemContent,
        hints: ['official'],
        followUps: ['extra'],
        contentFingerprint: 'new',
      },
    })
    act(() => hook.result.current.toggle())
    expect(hook.result.current.state).toMatchObject({
      status: 'ready',
      isOpen: true,
      revealedCount: 3,
    })
    expect(mocks.generate).toHaveBeenCalledOnce()
  })
  it('bounds extra reveals to the actual one-pointer batch', async () => {
    mocks.generate.mockImplementation((request) =>
      Promise.resolve(ready(request, ['One useful pointer.'])),
    )
    const hook = mount()
    await requestHints(hook)
    act(() => {
      hook.result.current.revealNext()
      hook.result.current.revealNext()
    })
    expect(hook.result.current.state).toMatchObject({ revealedCount: 1 })
    expect(mocks.generate).toHaveBeenCalledOnce()
  })
  it.each(['statement', 'constraints', 'revision'] as const)(
    'clears ready on selected %s change until another explicit request',
    async (change) => {
      const hook = mount()
      await requestHints(hook)
      if (change === 'revision') hook.changeConnection(nextConnection)
      else {
        const old = hook.readCapture()
        hook.changeCapture({
          ...old,
          problemContent: {
            ...old.problemContent!,
            [change]:
              change === 'statement'
                ? 'Changed full statement'
                : ['Changed bound'],
          },
        })
      }
      expect(hook.result.current.state).toEqual({
        status: 'idle',
        isOpen: false,
      })
      await settle()
      expect(mocks.generate).toHaveBeenCalledOnce()
      await requestHints(hook)
      expect(mocks.generate).toHaveBeenCalledTimes(2)
    },
  )
  it.each(['input', 'revision', 'reset', 'unmount'] as const)(
    'cancels dedicated pending work on %s and ignores late output',
    async (change) => {
      const pending = deferred<GenerateLeetCodeHintsResponse>()
      mocks.generate.mockReturnValue(pending.promise)
      const hook = mount()
      act(() => hook.result.current.toggle())
      await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce())
      const request = mocks.generate.mock.calls[0]![0]
      if (change === 'input')
        hook.changeCapture({
          ...capture(),
          problemContent: {
            ...makeCompleteCapture().problemContent,
            statement: 'Changed',
          },
        })
      if (change === 'revision') hook.changeConnection(nextConnection)
      if (change === 'reset') act(() => hook.result.current.reset())
      if (change === 'unmount') hook.unmount()
      expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith({
        surface: 'content-script',
        requestId: request.requestId,
      })
      await act(async () => {
        pending.resolve(ready(request))
        await Promise.resolve()
      })
      if (change !== 'unmount')
        expect(hook.result.current.state.status).toBe('idle')
      expect(mocks.generate).toHaveBeenCalledOnce()
    },
  )
  it('refreshes stale metadata once and generates once with its new revision in the same Retry', async () => {
    mocks.generate.mockImplementationOnce((request) =>
      Promise.resolve({
        status: 'error',
        requestId: request.requestId,
        code: 'stale-configuration',
        message: 'Connection changed.',
      }),
    )
    const hook = mount()
    act(() => hook.result.current.toggle())
    await waitFor(() => expect(hook.result.current.state.status).toBe('error'))
    const refreshed = deferred<HintConnectionStatus | null>()
    hook.refreshConnection.mockReturnValue(refreshed.promise)
    act(() => hook.result.current.retry())
    await settle()
    hook.changeConnection(nextConnection)
    expect(hook.result.current.state.status).toBe('pending')
    await act(async () => {
      refreshed.resolve(nextConnection)
      await Promise.resolve()
    })
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
    expect(hook.refreshConnection).toHaveBeenCalledOnce()
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    const first = mocks.generate.mock.calls[0]![0]
    const second = mocks.generate.mock.calls[1]![0]
    expect(second.connectionRevision).toBe(nextConnection.revision)
    expect(second.requestId).not.toBe(first.requestId)
  })
  it('times out hung runtime messaging at 50 seconds, cancels and ignores late completion', async () => {
    vi.useFakeTimers()
    const pending = deferred<GenerateLeetCodeHintsResponse>()
    mocks.generate.mockReturnValue(pending.promise)
    const hook = mount()
    act(() => hook.result.current.toggle())
    await settle()
    const request = mocks.generate.mock.calls[0]![0]
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000)
    })
    expect(hook.result.current.state).toMatchObject({
      status: 'error',
      code: 'timeout',
      message: 'Hint request timed out. Try again.',
    })
    expect(mocks.cancel).toHaveBeenCalledWith({
      surface: 'content-script',
      requestId: request.requestId,
    })
    await act(async () => {
      pending.resolve(ready(request))
      await Promise.resolve()
    })
    expect(hook.result.current.state.status).toBe('error')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('settles a hung metadata Retry across a revision rerender without provider work or timers', async () => {
    vi.useFakeTimers()
    const hook = mount(capture(), null)
    hook.refreshConnection.mockReturnValue(new Promise(() => {}))
    act(() => hook.result.current.toggle())
    await settle()
    act(() => hook.result.current.retry())
    await settle()
    hook.changeConnection(nextConnection)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000)
    })
    expect(hook.result.current.state).toMatchObject({
      status: 'error',
      code: 'timeout',
    })
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('redacts unexpected transport exceptions', async () => {
    mocks.generate.mockRejectedValue(new Error('private-token-and-source-code'))
    const hook = mount()
    act(() => hook.result.current.toggle())
    await waitFor(() => expect(hook.result.current.state.status).toBe('error'))
    expect(hook.result.current.state).toMatchObject({
      code: 'unknown',
      message: 'Could not generate hints. Try again.',
    })
    expect(JSON.stringify(hook.result.current.state)).not.toContain(
      'private-token',
    )
  })
  it('rejects mismatched response identity and retries with a fresh request identity', async () => {
    mocks.generate.mockImplementationOnce((request) =>
      Promise.resolve(ready({ ...request, requestId: 'other-request' })),
    )
    const hook = mount()
    act(() => hook.result.current.toggle())
    await waitFor(() => expect(hook.result.current.state.status).toBe('error'))
    act(() => hook.result.current.retry())
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
    expect(mocks.generate.mock.calls[1]![0].requestId).not.toBe(
      mocks.generate.mock.calls[0]![0].requestId,
    )
  })
  it('settles refused capture publication to idle without generation', async () => {
    const hook = mount()
    hook.publishCapture.mockReturnValue(false)
    act(() => hook.result.current.toggle())
    await settle()
    expect(hook.result.current.state).toEqual({ status: 'idle', isOpen: false })
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('accepts delayed missing-content preparation while preserving newer submission enrichment', async () => {
    const pending =
      deferred<
        Awaited<ReturnType<LeetCodeRemoteClient['readProblemContent']>>
      >()
    const initial = { ...capture(), problemContent: null }
    const hook = mount(initial)
    hook.remote.readProblemContent.mockReturnValue(pending.promise)
    act(() => hook.result.current.toggle())
    await settle()
    hook.changeCapture({ ...makeCompleteCapture(), problemContent: null })
    await act(async () => {
      pending.resolve({
        ok: true,
        content: makeCompleteCapture().problemContent,
      })
      await Promise.resolve()
    })
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
    hook.rerenderCurrent()
    expect(hook.result.current.state.status).toBe('ready')
    expect(hook.readCapture().submissionAttempt).not.toBeNull()
    expect(hook.remote.readSubmissionResult).not.toHaveBeenCalled()
    expect(mocks.generate).toHaveBeenCalledOnce()
  })
  it('rejects newly selected problem input while preparation is awaiting remote content', async () => {
    const pending =
      deferred<
        Awaited<ReturnType<LeetCodeRemoteClient['readProblemContent']>>
      >()
    const hook = mount({ ...capture(), problemContent: null })
    hook.remote.readProblemContent.mockReturnValue(pending.promise)
    act(() => hook.result.current.toggle())
    await settle()
    hook.changeCapture(capture())
    await act(async () => {
      pending.resolve({
        ok: true,
        content: makeCompleteCapture().problemContent,
      })
      await Promise.resolve()
    })
    expect(hook.result.current.state.status).toBe('idle')
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('keeps unavailable connection recovery explicit and offers Settings for saved unavailable metadata', async () => {
    const hook = mount(capture(), null)
    act(() => hook.result.current.toggle())
    await settle()
    expect(hook.result.current.state).toMatchObject({
      status: 'unavailable',
      canRetry: true,
    })
    expect(hook.refreshConnection).toHaveBeenCalledOnce()
    hook.changeConnection({ ...connection, available: false })
    act(() => hook.result.current.toggle())
    await settle()
    expect(hook.result.current.state).toMatchObject({
      status: 'unavailable',
      canRetry: false,
      showSettings: true,
    })
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('offers only Settings for an initially saved unavailable connection', async () => {
    const hook = mount(capture(), { ...connection, available: false })
    act(() => hook.result.current.toggle())
    await settle()
    expect(hook.result.current.state).toMatchObject({
      status: 'unavailable',
      isOpen: true,
      canRetry: false,
      showSettings: true,
    })
    act(() => hook.result.current.retry())
    await settle()
    expect(hook.refreshConnection).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(hook.remote.readProblemContent).not.toHaveBeenCalled()
  })
  it.each(['saved-unavailable', 'missing'] as const)(
    'offers only Settings after explicit Retry refresh yields %s metadata',
    async (status) => {
      const hook = mount(capture(), null)
      act(() => hook.result.current.toggle())
      await settle()
      expect(hook.result.current.state).toMatchObject({
        status: 'unavailable',
        canRetry: true,
      })
      const pending = deferred<HintConnectionStatus | null>()
      hook.refreshConnection.mockReturnValue(pending.promise)
      act(() => hook.result.current.retry())
      await settle()
      const unavailable =
        status === 'missing' ? null : { ...nextConnection, available: false }
      hook.changeConnection(unavailable)
      await act(async () => {
        pending.resolve(unavailable)
        await Promise.resolve()
      })
      await settle()
      expect(hook.result.current.state).toMatchObject({
        status: 'unavailable',
        isOpen: true,
        canRetry: false,
        showSettings: true,
      })
      const refreshCount = hook.refreshConnection.mock.calls.length
      act(() => hook.result.current.retry())
      await settle()
      expect(hook.refreshConnection).toHaveBeenCalledTimes(refreshCount)
      expect(mocks.generate).not.toHaveBeenCalled()
      expect(hook.remote.readProblemContent).not.toHaveBeenCalled()
    },
  )
  it('adopts its own refreshed statement before effects and retains the new batch', async () => {
    mocks.generate.mockRejectedValueOnce(new Error('transport failed'))
    const hook = mount()
    act(() => hook.result.current.toggle())
    await waitFor(() => expect(hook.result.current.state.status).toBe('error'))
    hook.remote.readProblemContent.mockResolvedValue({
      ok: true,
      content: {
        ...makeCompleteCapture().problemContent,
        statement: 'A fresh complete problem statement.',
      },
    })
    act(() => hook.result.current.retry())
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
    hook.rerenderCurrent()
    await settle()
    expect(hook.result.current.state.status).toBe('ready')
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    expect(mocks.generate.mock.calls[1]![0].problem.statement).toBe(
      'A fresh complete problem statement.',
    )
  })
  it('cannot clear a newer operation when an old cancelled request finally settles', async () => {
    const first = deferred<GenerateLeetCodeHintsResponse>()
    const second = deferred<GenerateLeetCodeHintsResponse>()
    mocks.generate
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const hook = mount()
    act(() => hook.result.current.toggle())
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce())
    const firstRequest = mocks.generate.mock.calls[0]![0]
    act(() => {
      hook.result.current.reset()
      hook.result.current.toggle()
    })
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2))
    const secondRequest = mocks.generate.mock.calls[1]![0]
    await act(async () => {
      first.resolve(ready(firstRequest))
      await Promise.resolve()
    })
    expect(hook.result.current.state).toMatchObject({
      status: 'pending',
      requestId: secondRequest.requestId,
    })
    await act(async () => {
      second.resolve(ready(secondRequest))
      await Promise.resolve()
    })
    expect(hook.result.current.state.status).toBe('ready')
  })
  it('bounds incomplete public context preparation at 15 seconds and clears both deadlines', async () => {
    vi.useFakeTimers()
    const hook = mount({ ...capture(), problemContent: null })
    hook.remote.readProblemContent.mockReturnValue(new Promise(() => {}))
    act(() => hook.result.current.toggle())
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(hook.result.current.state).toMatchObject({
      status: 'error',
      code: 'timeout',
    })
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('drops hints when connection metadata is cleared by a full data replacement', async () => {
    const hook = mount()
    await requestHints(hook)
    hook.changeConnection(null)
    expect(hook.result.current.state).toEqual({ status: 'idle', isOpen: false })
    await settle()
    expect(mocks.generate).toHaveBeenCalledOnce()
  })
  it.each([
    'auth',
    'permission',
    'bad-request',
    'model-unavailable',
    'not-configured',
    'stale-configuration',
    'billing',
  ] as const)('offers Settings recovery for %s', async (code) => {
    mocks.generate.mockImplementationOnce((request) =>
      Promise.resolve({
        status: 'error',
        requestId: request.requestId,
        code,
        message: 'Controlled provider error.',
      }),
    )
    const hook = mount()
    act(() => hook.result.current.toggle())
    await waitFor(() =>
      expect(hook.result.current.state).toMatchObject({
        status: 'error',
        code,
        canRetry: true,
        showSettings: true,
      }),
    )
    act(() => hook.result.current.toggle())
    expect(hook.result.current.state.isOpen).toBe(false)
    act(() => hook.result.current.toggle())
    expect(mocks.generate).toHaveBeenCalledOnce()
  })
  it('ignores stale sync tokens after awaiting preparation and settles pending to idle', async () => {
    const pending =
      deferred<
        Awaited<ReturnType<LeetCodeRemoteClient['readProblemContent']>>
      >()
    const hook = mount({ ...capture(), problemContent: null })
    hook.remote.readProblemContent.mockReturnValue(pending.promise)
    act(() => hook.result.current.toggle())
    await settle()
    hook.changeToken()
    await act(async () => {
      pending.resolve({
        ok: true,
        content: makeCompleteCapture().problemContent,
      })
      await Promise.resolve()
    })
    await settle()
    expect(hook.result.current.state).toEqual({ status: 'idle', isOpen: false })
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('invalidates a timed-out metadata refresh error on a subsequent revision change', async () => {
    vi.useFakeTimers()
    const hook = mount(capture(), null)
    hook.refreshConnection.mockReturnValue(new Promise(() => {}))
    act(() => hook.result.current.toggle())
    await settle()
    act(() => hook.result.current.retry())
    await settle()
    hook.changeConnection(connection)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000)
    })
    expect(hook.result.current.state.status).toBe('error')
    hook.changeConnection(nextConnection)
    expect(hook.result.current.state).toEqual({ status: 'idle', isOpen: false })
  })
})
