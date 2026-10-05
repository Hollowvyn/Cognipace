import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type PreparedCodeAnalysisContext } from '@/features/leetcode-capture'
import { makeCompleteCapture } from '@/features/leetcode-capture/testing/code-analysis-capture-fixtures'
import {
  analysisIdentity,
  type AnalyzeLeetCodeSubmissionRequest,
  type AnalyzeLeetCodeSubmissionResponse,
} from '@/features/leetcode-review-assistant/api/code-analysis-contracts'
import {
  analyzeLeetCodeSubmissionViaRuntime,
  cancelLeetCodeAnalysisViaRuntime,
} from '@/features/leetcode-review-assistant'
import { makeValidAnalysis } from '@/features/leetcode-review-assistant/testing/code-analysis-fixtures'
import {
  createLeetCodeReviewContext,
  type LeetCodeCaptureState,
  type LeetCodeProblemContent,
  type LeetCodeSubmissionResult,
  type LeetCodeSubmissionStatus,
} from '@/lib/leetcode'
import { invalidateTaggedQueries } from '@/platform/query/cache-invalidation'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  buildCodeAnalysisRequest,
  useLeetCodeCodeAnalysis,
  type CodeAnalysisState,
  type UseLeetCodeCodeAnalysisOptions,
} from './use-leetcode-code-analysis'

const remote = vi.hoisted(() => ({
  readProblemMetadata: vi.fn(),
  readProblemContent: vi.fn(),
  readSubmissionResult: vi.fn(),
}))
vi.mock('@/features/leetcode-capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/leetcode-capture')>()),
  createLeetCodeCaptureRemoteClient: () => remote,
}))
vi.mock('@/features/leetcode-review-assistant', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/leetcode-review-assistant')
  >()),
  analyzeLeetCodeSubmissionViaRuntime: vi.fn(),
  cancelLeetCodeAnalysisViaRuntime: vi.fn(),
}))

const analyze = vi.mocked(analyzeLeetCodeSubmissionViaRuntime)
const cancelAnalysis = vi.mocked(cancelLeetCodeAnalysisViaRuntime)

function deferred<T>() {
  let resolve!: (value: T) => void
  return {
    promise: new Promise<T>((done) => {
      resolve = done
    }),
    resolve: (value: T) => resolve(value),
  }
}
function ready(
  request: AnalyzeLeetCodeSubmissionRequest,
): AnalyzeLeetCodeSubmissionResponse {
  return {
    status: 'ready',
    ...analysisIdentity(request),
    report: makeValidAnalysis(),
    providerMetadata: { provider: 'gemini', model: 'fixture', durationMs: 10 },
  }
}
function prepare(
  capture: LeetCodeCaptureState = makeCompleteCapture(),
): Extract<PreparedCodeAnalysisContext, { status: 'ready' }> {
  return {
    status: 'ready',
    context: createLeetCodeReviewContext(capture)!,
    capture,
    attemptId: capture.submissionAttempt!.attemptId,
    submissionId: capture.submissionResult!.submissionId!,
  }
}
let harness: ReturnType<typeof createQueryTestHarness>
beforeEach(() => {
  harness = createQueryTestHarness()
  analyze
    .mockReset()
    .mockImplementation((request) => Promise.resolve(ready(request)))
  cancelAnalysis
    .mockReset()
    .mockResolvedValue({ requestId: 'ignored', cancelled: true })
  remote.readProblemMetadata.mockReset()
  remote.readProblemContent.mockReset().mockResolvedValue({
    ok: true,
    content: makeCompleteCapture().problemContent,
  })
  remote.readSubmissionResult.mockReset().mockResolvedValue({
    result: makeCompleteCapture().submissionResult,
    debugEvents: [],
  })
})
afterEach(() => {
  cleanup()
  harness.queryClient.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
function mount(overrides: Partial<UseLeetCodeCodeAnalysisOptions> = {}) {
  const options: UseLeetCodeCodeAnalysisOptions = {
    activeSlug: 'two-sum',
    capture: makeCompleteCapture(),
    enabled: true,
    available: true,
    ...overrides,
  }
  const observed: CodeAnalysisState[] = []
  const hook = renderHook(
    (props) => {
      const value = useLeetCodeCodeAnalysis(props)
      observed.push(value.state)
      return value
    },
    { initialProps: options, wrapper: harness.wrapper },
  )
  return { ...hook, options, observed }
}
function nextAttempt(capture: LeetCodeCaptureState) {
  const next = structuredClone(capture)
  next.submissionAttempt!.attemptId = 'fixture-attempt-2'
  next.submissionResult!.submissionId = '2222222222'
  return next
}
async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('buildCodeAnalysisRequest', () => {
  it('preserves complete code, exact context, follow-ups, names and nullable version', () => {
    const capture = makeCompleteCapture()
    const content: LeetCodeProblemContent = capture.problemContent
    content.examples = [
      {
        label: 'Example 1',
        input: null,
        output: null,
        explanation: null,
        rawText: '  exact example\noutput=[0,1]  ',
      },
    ]
    capture.problemContent.followUps = [
      '  full follow-up\nKeep extra detail.  ',
    ]
    capture.submissionResult.resultCodeSnapshot.code = 'x'.repeat(32000)
    const request = buildCodeAnalysisRequest(prepare(capture), 'request-2', 3)!
    expect(request).toMatchObject({
      requestId: 'request-2',
      attemptId: capture.submissionAttempt.attemptId,
      submissionId: '1234567890',
      problemSlug: 'two-sum',
      configurationRevision: 3,
      problem: {
        title: 'Two Sum',
        difficulty: 'Easy',
        topics: ['Array'],
        statement: capture.problemContent.statement,
        constraints: capture.problemContent.constraints,
        examples: ['  exact example\noutput=[0,1]  '],
        followUps: capture.problemContent.followUps,
      },
      submission: {
        code: 'x'.repeat(32000),
        language: 'JavaScript',
        languageVersion: null,
        runtime: '34 ms',
        memory: null,
        passedTestCount: 50,
        totalTestCount: 50,
      },
    })
    capture.submissionResult.resultCodeSnapshot.code += 'x'
    expect(buildCodeAnalysisRequest(prepare(capture), 'request', 0)).toBeNull()
  })
  it('accepts exactly 24000 serialized problem characters and rejects 24001 without truncating', () => {
    const capture = makeCompleteCapture()
    const baseline = buildCodeAnalysisRequest(prepare(capture), 'request', 0)!
    capture.problemContent.statement += 'x'.repeat(
      24000 - JSON.stringify(baseline.problem).length,
    )
    expect(
      JSON.stringify(
        buildCodeAnalysisRequest(prepare(capture), 'request', 0)!.problem,
      ),
    ).toHaveLength(24000)
    capture.problemContent.statement += 'x'
    expect(buildCodeAnalysisRequest(prepare(capture), 'request', 0)).toBeNull()
  })
  it('omits oversized optional diagnostics explicitly and preserves all eight nullable fields', () => {
    const capture = makeCompleteCapture()
    const source: LeetCodeSubmissionResult = capture.submissionResult
    source.errorMessage = 'x'.repeat(2001)
    source.failingTestcase = 'x'.repeat(2000)
    const submission = buildCodeAnalysisRequest(
      prepare(capture),
      'request',
      0,
    )!.submission
    expect(submission.omittedDiagnostics).toEqual(['errorMessage'])
    expect(submission.diagnostics).toEqual({
      errorMessage: null,
      compileError: null,
      runtimeError: null,
      failingTestcase: 'x'.repeat(2000),
      lastTestcase: null,
      codeOutput: null,
      expectedOutput: null,
      stdOutput: null,
    })
  })
})

describe('useLeetCodeCodeAnalysis', () => {
  it('automatically generates once and ignores source/diagnostic enrichment without caching reports', async () => {
    const { result, rerender, options } = mount()
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    rerender({
      ...options,
      capture: {
        ...options.capture,
        submissionResult: {
          ...options.capture.submissionResult!,
          source: 'dom',
          stdOutput: 'enriched',
        },
      },
    })
    await settle()
    expect(analyze).toHaveBeenCalledOnce()
    expect(harness.queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(harness.queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(remote.readSubmissionResult).not.toHaveBeenCalled()
  })
  it.each<LeetCodeSubmissionStatus>([
    'accepted',
    'wrong-answer',
    'compile-error',
    'runtime-error',
    'time-limit-exceeded',
    'memory-limit-exceeded',
    'output-limit-exceeded',
    'unknown',
  ])('preserves terminal status %s', async (status) => {
    const capture = makeCompleteCapture()
    const source: LeetCodeSubmissionResult = capture.submissionResult
    source.status = status
    source.errorMessage = status === 'accepted' ? null : 'captured diagnostic'
    const { result } = mount({ capture })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(analyze.mock.calls[0]![0].submission).toMatchObject({
      status,
      diagnostics: { errorMessage: source.errorMessage },
    })
  })
  it.each([
    'requestId',
    'attemptId',
    'submissionId',
    'problemSlug',
    'configurationRevision',
  ] as const)('returns a retryable error for mismatched %s', async (field) => {
    analyze.mockImplementation((request) =>
      Promise.resolve({
        ...ready(request),
        [field]:
          field === 'configurationRevision'
            ? 99
            : field === 'submissionId'
              ? '999'
              : 'other',
      }),
    )
    const { result } = mount()
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'error',
        canRetry: true,
        showSettings: false,
      }),
    )
  })
  it.each([false, true])(
    'missing metadata preserves automatic eligibility after manual Retry=%s',
    async (retry) => {
      const capture = makeCompleteCapture()
      const { result, options, rerender } = mount({
        capture: { ...capture, metadata: null },
      })
      expect(result.current.state).toMatchObject({
        status: 'unavailable',
        canRetry: true,
      })
      if (retry) {
        act(() => result.current.retry())
        await waitFor(() =>
          expect(result.current.state.status).toBe('unavailable'),
        )
      }
      expect(analyze).not.toHaveBeenCalled()
      rerender({ ...options, capture })
      await waitFor(() => expect(result.current.state.status).toBe('ready'))
      expect(analyze).toHaveBeenCalledOnce()
    },
  )
  it('recovers matching metadata after an unavailable manual Retry while retaining the original submission pin', async () => {
    const complete = makeCompleteCapture()
    const { result, options, rerender } = mount({
      capture: { ...complete, metadata: null },
    })
    act(() => result.current.retry())
    const firstId =
      result.current.state.status === 'pending'
        ? result.current.state.requestId
        : null
    await waitFor(() => expect(result.current.state.status).toBe('unavailable'))
    expect(analyze).not.toHaveBeenCalled()
    rerender({
      ...options,
      capture: {
        ...complete,
        submissionResult: {
          ...complete.submissionResult,
          submissionId: '9999999999',
        },
      },
    })
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(remote.readSubmissionResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ submissionId: '1234567890', refresh: true }),
    )
    const request = analyze.mock.calls[0]![0]
    expect(request.submissionId).toBe('1234567890')
    expect(request.requestId).not.toBe(firstId)
  })
  it('recovers first missing configuration once availability returns', async () => {
    const { result, options, rerender } = mount({ available: false })
    expect(result.current.state).toMatchObject({
      status: 'unavailable',
      showSettings: true,
    })
    rerender({ ...options, available: true })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(analyze).toHaveBeenCalledOnce()
  })
  it('rejects oversized essentials without a generation call', async () => {
    const capture = makeCompleteCapture()
    capture.submissionResult.resultCodeSnapshot.code = 'x'.repeat(32001)
    const { result } = mount({ capture })
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'unavailable',
        canRetry: true,
      }),
    )
    expect(analyze).not.toHaveBeenCalled()
  })
  it('retains a discovered pin after unavailable preparation, config changes, disable and reset; Retry refreshes it with a new UUID', async () => {
    remote.readProblemContent.mockResolvedValueOnce({
      ok: false,
      error: new Error('capture unavailable'),
    })
    remote.readSubmissionResult.mockResolvedValueOnce({
      result: null,
      debugEvents: [
        {
          phase: 'submission-found',
          submissionId: '1234567890',
          checkState: null,
          statusText: null,
          checkedAt: 10,
        },
      ],
    })
    const capture: LeetCodeCaptureState = makeCompleteCapture()
    capture.submissionResult!.submissionId = null
    capture.problemContent = null
    const { result, options, rerender } = mount({ capture })
    const firstRequestId =
      result.current.state.status === 'pending'
        ? result.current.state.requestId
        : null
    await waitFor(() => expect(result.current.state.status).toBe('unavailable'))
    expect(analyze).not.toHaveBeenCalled()
    act(() => {
      void invalidateTaggedQueries(harness.queryClient, ['genai'])
    })
    rerender({ ...options, enabled: false })
    rerender({
      ...options,
      enabled: true,
      capture: {
        ...options.capture,
        submissionResult: {
          ...capture.submissionResult!,
          submissionId: '9999999999',
        },
      },
    })
    act(() => result.current.reset())
    expect(result.current.state.status).toBe('idle')
    await settle()
    expect(analyze).not.toHaveBeenCalled()
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(remote.readSubmissionResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        submissionId: '1234567890',
        refresh: true,
        attemptId: capture.submissionAttempt!.attemptId,
      }),
    )
    const request = analyze.mock.calls[0]![0]
    expect(request.requestId).not.toBe(firstRequestId)
    expect(request.configurationRevision).toBe(1)
    expect(request.submissionId).toBe('1234567890')
  })
  it('bounds hung messaging at 50000ms, cancels, and ignores its late result', async () => {
    vi.useFakeTimers()
    const pending = deferred<AnalyzeLeetCodeSubmissionResponse>()
    analyze.mockReturnValue(pending.promise)
    const { result } = mount()
    await settle()
    expect(result.current.state).toMatchObject({
      status: 'pending',
      phase: 'analysis',
    })
    const request = analyze.mock.calls[0]![0]
    await act(async () => {
      await vi.advanceTimersByTimeAsync(49999)
    })
    expect(result.current.state.status).toBe('pending')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(result.current.state).toMatchObject({
      status: 'error',
      code: 'timeout',
      canRetry: true,
    })
    expect(cancelAnalysis).toHaveBeenCalledWith({
      surface: 'content-script',
      requestId: request.requestId,
    })
    await act(async () => {
      pending.resolve(ready(request))
      await Promise.resolve()
    })
    expect(result.current.state.status).toBe('error')
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each([
    'navigation',
    'new-attempt',
    'reset',
    'disable',
    'configuration',
    'unmount',
  ] as const)('cancels and hides deferred output on %s', async (change) => {
    const pending = deferred<AnalyzeLeetCodeSubmissionResponse>()
    analyze.mockReturnValue(pending.promise)
    const { result, options, rerender, unmount, observed } = mount()
    await waitFor(() => expect(analyze).toHaveBeenCalledOnce())
    const request = analyze.mock.calls[0]![0]
    observed.length = 0
    if (change === 'navigation')
      rerender({ ...options, activeSlug: 'three-sum' })
    if (change === 'new-attempt')
      rerender({
        ...options,
        capture: { ...nextAttempt(options.capture), submissionResult: null },
      })
    if (change === 'reset') act(() => result.current.reset())
    if (change === 'disable') rerender({ ...options, enabled: false })
    if (change === 'configuration')
      act(() => {
        void invalidateTaggedQueries(harness.queryClient, ['genai'])
      })
    if (change === 'unmount') unmount()
    expect(cancelAnalysis).toHaveBeenCalledWith({
      surface: 'content-script',
      requestId: request.requestId,
    })
    await act(async () => {
      pending.resolve(ready(request))
      await Promise.resolve()
    })
    expect(
      observed.some(
        (state) => state.status === 'ready' || state.status === 'pending',
      ),
    ).toBe(false)
    expect(analyze).toHaveBeenCalledOnce()
  })
  it.each(['ready', 'pending'] as const)(
    'hides %s and cancels active work when availability becomes false independently',
    async (status) => {
      if (status === 'pending') analyze.mockReturnValue(new Promise(() => {}))
      const { result, options, rerender, observed } = mount()
      await waitFor(() => expect(result.current.state.status).toBe(status))
      observed.length = 0
      rerender({ ...options, available: false })
      expect(observed[0]).toMatchObject({
        status: 'unavailable',
        showSettings: true,
      })
      if (status === 'pending') expect(cancelAnalysis).toHaveBeenCalledTimes(1)
      rerender(options)
      await settle()
      expect(result.current.state).toMatchObject({
        status: 'unavailable',
        canRetry: true,
      })
      expect(analyze).toHaveBeenCalledOnce()
    },
  )
  it('requires manual Retry after disable/enable or config changes on a handled attempt', async () => {
    const { result, options, rerender } = mount()
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    rerender({ ...options, enabled: false })
    expect(result.current.state.status).toBe('disabled')
    rerender(options)
    expect(result.current.state).toMatchObject({
      status: 'unavailable',
      canRetry: true,
    })
    act(() => {
      void invalidateTaggedQueries(harness.queryClient, ['genai'])
    })
    await settle()
    expect(analyze).toHaveBeenCalledOnce()
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(analyze).toHaveBeenCalledTimes(2)
    expect(analyze.mock.calls[1]![0].configurationRevision).toBe(1)
  })
  it('rejects a response if revision changes synchronously before React effects', async () => {
    const pending = deferred<AnalyzeLeetCodeSubmissionResponse>()
    analyze.mockReturnValue(pending.promise)
    const { result, observed } = mount()
    await waitFor(() => expect(analyze).toHaveBeenCalledOnce())
    const request = analyze.mock.calls[0]![0]
    observed.length = 0
    await act(async () => {
      void invalidateTaggedQueries(harness.queryClient, ['genai'])
      pending.resolve(ready(request))
      await Promise.resolve()
    })
    expect(result.current.state.status).not.toBe('ready')
    expect(observed.some((state) => state.status === 'ready')).toBe(false)
  })
  it('Retry uses the synchronous current configuration even before React effects update the scope', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    await act(async () => {
      void invalidateTaggedQueries(harness.queryClient, ['genai'])
      result.current.retry()
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(analyze).toHaveBeenCalledTimes(2)
    expect(analyze.mock.calls[1]![0].configurationRevision).toBe(1)
  })
  it('reset suppresses retained capture while a new submit remains eligible', async () => {
    const { result, options, rerender } = mount()
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    act(() => result.current.reset())
    rerender({ ...options, capture: { ...options.capture } })
    await settle()
    expect(result.current.state.status).toBe('idle')
    expect(analyze).toHaveBeenCalledOnce()
    rerender({ ...options, capture: nextAttempt(options.capture) })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(analyze).toHaveBeenCalledTimes(2)
  })
  it.each(['configuration', 'disable-enable', 'availability'] as const)(
    'keeps a reset attempt idle through %s until explicit Retry',
    async (change) => {
      const { result, options, rerender } = mount()
      await waitFor(() => expect(result.current.state.status).toBe('ready'))
      act(() => result.current.reset())
      expect(result.current.state.status).toBe('idle')
      if (change === 'configuration')
        act(() => {
          void invalidateTaggedQueries(harness.queryClient, ['genai'])
        })
      if (change === 'disable-enable') {
        rerender({ ...options, enabled: false })
        expect(result.current.state.status).toBe('disabled')
        rerender(options)
      }
      if (change === 'availability') {
        rerender({ ...options, available: false })
        expect(result.current.state).toMatchObject({
          status: 'unavailable',
          showSettings: true,
        })
        rerender(options)
      }
      await settle()
      expect(result.current.state.status).toBe('idle')
      expect(analyze).toHaveBeenCalledOnce()
      act(() => result.current.retry())
      await waitFor(() => expect(result.current.state.status).toBe('ready'))
      expect(analyze).toHaveBeenCalledTimes(2)
      const requests = analyze.mock.calls
      expect(requests[1]![0].submissionId).toBe(requests[0]![0].submissionId)
      expect(requests[1]![0].requestId).not.toBe(requests[0]![0].requestId)
    },
  )
  it('an old finally cannot clear a newer operation', async () => {
    const first = deferred<AnalyzeLeetCodeSubmissionResponse>()
    const second = deferred<AnalyzeLeetCodeSubmissionResponse>()
    analyze
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result, options, rerender } = mount()
    await waitFor(() => expect(analyze).toHaveBeenCalledOnce())
    const request1 = analyze.mock.calls[0]![0]
    rerender({ ...options, capture: nextAttempt(options.capture) })
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2))
    const request2 = analyze.mock.calls[1]![0]
    await act(async () => {
      first.resolve(ready(request1))
      await Promise.resolve()
    })
    expect(result.current.state).toMatchObject({
      status: 'pending',
      requestId: request2.requestId,
    })
    await act(async () => {
      second.resolve(ready(request2))
      await Promise.resolve()
    })
    expect(result.current.state).toMatchObject({
      status: 'ready',
      requestId: request2.requestId,
    })
  })
  it.each([
    'auth',
    'permission',
    'bad-request',
    'model-unavailable',
    'billing',
    'not-configured',
    'stale-configuration',
  ] as const)('offers Settings for %s', async (code) => {
    analyze.mockImplementation((request) =>
      Promise.resolve({
        status: 'error',
        ...analysisIdentity(request),
        code,
        message: 'Controlled message.',
      }),
    )
    const { result } = mount()
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'error',
        code,
        showSettings: true,
        canRetry: true,
      }),
    )
  })
  it('redacts unexpected transport exceptions', async () => {
    analyze.mockRejectedValue(new Error('private-token-and-code'))
    const { result } = mount()
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(JSON.stringify(result.current.state)).not.toContain(
      'private-token-and-code',
    )
  })
})
