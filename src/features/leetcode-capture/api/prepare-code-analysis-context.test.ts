import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import {
  createLeetCodeReviewContext,
  type LeetCodeCaptureState,
  type LeetCodeProblemContentResult,
  type LeetCodeRemoteClient,
  type LeetCodeSubmissionPollingDebug,
  type LeetCodeSubmissionResultRemoteResponse,
  type LeetCodeSubmissionStatus,
} from '@/lib/leetcode'

import { makeCompleteCapture } from '../testing/code-analysis-capture-fixtures'
import { prepareLeetCodeAnalysisContext } from './prepare-code-analysis-context'

const unavailableMessage =
  'Submission capture could not finish. Retry this submission.'

function makeRemote(capture = makeCompleteCapture()) {
  return {
    readProblemMetadata: vi.fn<LeetCodeRemoteClient['readProblemMetadata']>(
      () => Promise.resolve({ ok: true, metadata: capture.metadata }),
    ),
    readProblemContent: vi.fn<LeetCodeRemoteClient['readProblemContent']>(() =>
      Promise.resolve({ ok: true, content: capture.problemContent }),
    ),
    readSubmissionResult: vi.fn<LeetCodeRemoteClient['readSubmissionResult']>(
      () =>
        Promise.resolve({ result: capture.submissionResult, debugEvents: [] }),
    ),
  }
}

function makeDebug(
  submissionId: string | null,
): LeetCodeSubmissionPollingDebug {
  return {
    phase: 'submission-found',
    submissionId,
    checkState: null,
    statusText: null,
    checkedAt: 5001,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('prepareLeetCodeAnalysisContext', () => {
  let capture: ReturnType<typeof makeCompleteCapture>
  let complete: ReturnType<typeof makeCompleteCapture>
  let remote: ReturnType<typeof makeRemote>
  let contentRead: ReturnType<typeof makeRemote>['readProblemContent']
  let resultRead: ReturnType<typeof makeRemote>['readSubmissionResult']
  beforeEach(() => {
    capture = makeCompleteCapture()
    complete = makeCompleteCapture()
    remote = makeRemote()
    contentRead = remote.readProblemContent
    resultRead = remote.readSubmissionResult
  })
  function prepare(
    input: LeetCodeCaptureState = capture,
    refresh = false,
    signal = new AbortController().signal,
  ) {
    return prepareLeetCodeAnalysisContext(input, remote, signal, refresh)
  }
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns complete matching input without transport or changing full source', async () => {
    const prepared = await prepare(capture)

    expect(prepared).toEqual({
      status: 'ready',
      context: createLeetCodeReviewContext(capture),
      submissionId: '1234567890',
      attemptId: 'fixture-attempt-1',
      capture,
    })
    expect(contentRead).not.toHaveBeenCalled()
    expect(resultRead).not.toHaveBeenCalled()
    expect(remote.readProblemMetadata).not.toHaveBeenCalled()
    if (prepared.status === 'ready') {
      expect(prepared.context.submittedCode?.code).toBe(
        capture.submissionResult.resultCodeSnapshot.code,
      )
    }
  })

  it('explicitly refreshes both reads once in parallel with the same pinned attempt', async () => {
    const content = deferred<LeetCodeProblemContentResult>()
    const result = deferred<LeetCodeSubmissionResultRemoteResponse>()
    contentRead.mockReturnValue(content.promise)
    resultRead.mockReturnValue(result.promise)
    const pending = prepare(capture, true)
    await Promise.resolve()

    expect(contentRead).toHaveBeenCalledExactlyOnceWith({
      location: capture.submissionAttempt.location,
      refresh: true,
    })
    expect(resultRead).toHaveBeenCalledExactlyOnceWith({
      location: capture.submissionAttempt.location,
      attemptId: 'fixture-attempt-1',
      submissionId: '1234567890',
      click: {
        location: capture.submissionAttempt.location,
        clickedAt: 5000,
        buttonText: 'Submit',
      },
      submittedCodeSnapshot: capture.submissionAttempt.submittedCodeSnapshot,
      refresh: true,
    })
    content.resolve({ ok: true, content: capture.problemContent })
    result.resolve({ result: capture.submissionResult, debugEvents: [] })
    expect((await pending).status).toBe('ready')
    expect(remote.readProblemMetadata).not.toHaveBeenCalled()
  })

  it('finishes unavailable at 15 seconds even when a pinned result never settles', async () => {
    vi.useFakeTimers()
    const capture: LeetCodeCaptureState = {
      ...complete,
      submissionResult: null,
      submissionPollingDebug: makeDebug('1234567890'),
    }
    resultRead.mockReturnValue(new Promise(() => {}))
    const pending = prepare(capture)
    let settled = false
    void pending.then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(14999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toMatchObject({
      status: 'unavailable',
      message: unavailableMessage,
      capture: { submissionPollingDebug: { submissionId: '1234567890' } },
    })
    expect(resultRead).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: '1234567890', refresh: true }),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['partial', 'missing'] as const)(
    'does not promote %s result code or the attempt fragment',
    async (completeness) => {
      const result = {
        ...complete.submissionResult,
        resultCodeSnapshot: {
          ...complete.submissionResult.resultCodeSnapshot,
          completeness,
          code: completeness === 'missing' ? null : 'return [0, 1]',
        },
      }
      resultRead.mockResolvedValue({ result, debugEvents: [] })
      const prepared = await prepare({ ...complete, submissionResult: result })
      expect(prepared.status).toBe('unavailable')
      expect(
        prepared.capture.submissionResult?.resultCodeSnapshot.completeness,
      ).toBe(completeness)
    },
  )

  it.each(['partial', 'missing'] as const)(
    'does not accept %s content',
    async (completeness) => {
      const content = { ...capture.problemContent, completeness }
      contentRead.mockResolvedValue({ ok: true, content })
      expect(
        (await prepare({ ...capture, problemContent: content })).status,
      ).toBe('unavailable')
    },
  )

  it.each(['code', 'language', 'statement'] as const)(
    'requires nonblank %s even with complete provenance',
    async (field) => {
      if (field === 'statement') capture.problemContent.statement = '   '
      else capture.submissionResult.resultCodeSnapshot[field] = '   '
      contentRead.mockResolvedValue({
        ok: true,
        content: capture.problemContent,
      })
      resultRead.mockResolvedValue({
        result: capture.submissionResult,
        debugEvents: [],
      })
      expect((await prepare(capture)).status).toBe('unavailable')
    },
  )

  it.each<LeetCodeSubmissionStatus>([
    'accepted',
    'wrong-answer',
    'runtime-error',
    'compile-error',
    'time-limit-exceeded',
    'memory-limit-exceeded',
    'output-limit-exceeded',
    'unknown',
  ])(
    'preserves %s terminal diagnostics and exact full code on same-ID refresh',
    async (status) => {
      const result = {
        ...capture.submissionResult,
        status,
        statusText: status,
        errorMessage: 'Original diagnostic text',
        compileError: 'Original compile diagnostic',
        runtimeError: 'Original runtime diagnostic',
        failingTestcase: '[2, 7], 9',
      }
      resultRead.mockResolvedValue({ result, debugEvents: [] })
      const prepared = await prepare(capture, true)
      expect(prepared.status).toBe('ready')
      if (prepared.status === 'ready') {
        expect(prepared.context.submissionResult).toEqual(result)
        expect(prepared.context.submittedCode?.code).toBe(
          capture.submissionResult.resultCodeSnapshot.code,
        )
      }
    },
  )

  it.each([
    'location',
    'submissionAttempt',
    'submissionResult',
    'metadata',
    'problemContent',
  ] as const)(
    'rejects a mismatched %s host or slug before transport',
    async (field) => {
      for (const mismatch of [{ host: 'leetcode.cn' }, { slug: 'three-sum' }]) {
        const capture: LeetCodeCaptureState = makeCompleteCapture()
        const value = capture[field]!
        const changedLocation = {
          ...(field === 'location'
            ? capture.location!
            : capture[field]!.location),
          ...mismatch,
        }
        Object.assign(capture, {
          [field]:
            field === 'location'
              ? changedLocation
              : { ...value, location: changedLocation },
        })
        expect((await prepare(capture, true)).status).toBe('unavailable')
        expect(contentRead).not.toHaveBeenCalled()
        expect(resultRead).not.toHaveBeenCalled()
      }
    },
  )

  it.each(['content', 'result'] as const)(
    'rejects refreshed %s from another host or slug',
    async (field) => {
      for (const mismatch of [{ host: 'leetcode.cn' }, { slug: 'three-sum' }]) {
        if (field === 'content') {
          contentRead.mockResolvedValue({
            ok: true,
            content: {
              ...capture.problemContent,
              location: { ...capture.location, ...mismatch },
            },
          })
        } else {
          resultRead.mockResolvedValue({
            result: {
              ...capture.submissionResult,
              location: { ...capture.location, ...mismatch },
            },
            debugEvents: [makeDebug('999')],
          })
        }
        const prepared = await prepare(capture, true)
        expect(prepared.status).toBe('unavailable')
        expect(prepared.capture.submissionResult?.submissionId).toBe(
          '1234567890',
        )
      }
    },
  )

  it('rejects a mismatched context location derived from mutable metadata', async () => {
    contentRead.mockImplementation(() => {
      capture.metadata.location = { ...capture.location, slug: 'three-sum' }
      return Promise.resolve({ ok: true, content: capture.problemContent })
    })
    expect((await prepare(capture, true)).status).toBe('unavailable')
  })

  it.each(['attempt', 'metadata', 'location'] as const)(
    'does not transport without required %s',
    async (field) => {
      const capture: LeetCodeCaptureState = makeCompleteCapture()
      if (field === 'attempt') capture.submissionAttempt = null
      if (field === 'metadata') capture.metadata = null
      if (field === 'location') capture.location = null
      expect((await prepare(capture, true)).status).toBe('unavailable')
      expect(contentRead).not.toHaveBeenCalled()
      expect(resultRead).not.toHaveBeenCalled()
    },
  )

  it('does not transport a blank attempt ID', async () => {
    capture.submissionAttempt.attemptId = '   '
    expect((await prepare(capture, true)).status).toBe('unavailable')
    expect(resultRead).not.toHaveBeenCalled()
  })

  it('cannot replace an existing pin with another returned submission ID', async () => {
    resultRead.mockResolvedValue({
      result: { ...capture.submissionResult, submissionId: '999' },
      debugEvents: [makeDebug('999')],
    })
    const prepared = await prepare(capture, true)
    expect(prepared.status).toBe('unavailable')
    expect(prepared.capture.submissionResult?.submissionId).toBe('1234567890')
    expect(resultRead).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: '1234567890' }),
    )
  })

  it.each([null, '', 'bad-id'])(
    'retains the existing result pin when refresh returns invalid ID %s',
    async (submissionId) => {
      resultRead.mockResolvedValueOnce({
        result: { ...capture.submissionResult, submissionId },
        debugEvents: [],
      })
      const prepared = await prepare(capture, true)
      expect(prepared.status).toBe('unavailable')
      expect(prepared.capture.submissionResult?.submissionId).toBe('1234567890')
      expect((await prepare(prepared.capture, true)).status).toBe('ready')
      expect(resultRead).toHaveBeenLastCalledWith(
        expect.objectContaining({ submissionId: '1234567890' }),
      )
    },
  )

  it('uses a result pin ahead of a conflicting current debug ID', async () => {
    const capture: LeetCodeCaptureState = {
      ...makeCompleteCapture(),
      submissionPollingDebug: makeDebug('999'),
    }
    expect((await prepare(capture, true)).status).toBe('ready')
    expect(resultRead).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: '1234567890' }),
    )
  })

  it.each(['conflicting-result', 'missing-result'] as const)(
    'retains the first valid discovery with %s and retries that pin rather than latest',
    async (kind) => {
      const pendingCapture: LeetCodeCaptureState = {
        ...complete,
        submissionResult: null,
        problemContent:
          kind === 'missing-result' ? null : complete.problemContent,
      }
      const original = structuredClone(pendingCapture)
      if (kind === 'missing-result')
        contentRead.mockResolvedValueOnce({
          ok: false,
          error: new Error('Missing'),
        })
      resultRead.mockResolvedValueOnce({
        result:
          kind === 'conflicting-result'
            ? { ...complete.submissionResult, submissionId: '999' }
            : null,
        debugEvents: [
          makeDebug(null),
          makeDebug('bad-id'),
          makeDebug('1234567890'),
          makeDebug('999'),
        ],
      })
      const first = await prepare(pendingCapture)
      expect(first).toMatchObject({
        status: 'unavailable',
        capture: { submissionPollingDebug: { submissionId: '1234567890' } },
      })
      expect(first.capture.submissionResult).toBeNull()
      expect(first.capture.problemContent).toBeNull()
      expect(pendingCapture).toEqual(original)
      resultRead.mockImplementation((request) =>
        Promise.resolve({
          result:
            request.submissionId === '1234567890'
              ? complete.submissionResult
              : { ...complete.submissionResult, submissionId: '999' },
          debugEvents: [],
        }),
      )
      expect(await prepare(first.capture, true)).toMatchObject({
        status: 'ready',
        submissionId: '1234567890',
      })
      expect(resultRead).toHaveBeenLastCalledWith(
        expect.objectContaining({ submissionId: '1234567890', refresh: true }),
      )
    },
  )

  it('retains a discovered pin when content hangs, then ignores late resolution', async () => {
    vi.useFakeTimers()
    const capture: LeetCodeCaptureState = {
      ...complete,
      submissionResult: null,
      problemContent: null,
    }
    const content = deferred<LeetCodeProblemContentResult>()
    contentRead.mockReturnValueOnce(content.promise)
    resultRead.mockResolvedValueOnce({
      result: null,
      debugEvents: [makeDebug('1234567890')],
    })
    const pending = prepare(capture)
    await vi.advanceTimersByTimeAsync(15000)
    const first = await pending
    const beforeLateResolution = structuredClone(first.capture)
    expect(first).toMatchObject({
      status: 'unavailable',
      message: unavailableMessage,
      capture: { submissionPollingDebug: { submissionId: '1234567890' } },
    })
    content.resolve({ ok: true, content: complete.problemContent })
    await Promise.resolve()
    expect(first.capture).toEqual(beforeLateResolution)
    expect((await prepare(first.capture, true)).status).toBe('ready')
    expect(resultRead).toHaveBeenLastCalledWith(
      expect.objectContaining({ submissionId: '1234567890' }),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains a newly returned result pin when content is unavailable', async () => {
    contentRead.mockResolvedValue({
      ok: false,
      error: new Error('Missing'),
    })
    const prepared = await prepare({ ...complete, submissionResult: null })
    expect(prepared).toMatchObject({
      status: 'unavailable',
      capture: { submissionResult: { submissionId: '1234567890' } },
    })
  })

  it.each(['content', 'result'] as const)(
    'never returns old complete context after %s transport failure',
    async (field) => {
      if (field === 'content')
        contentRead.mockRejectedValue(new Error('Offline'))
      if (field === 'result') resultRead.mockRejectedValue(new Error('Offline'))
      expect(await prepare(capture, true)).toMatchObject({
        status: 'unavailable',
        message: unavailableMessage,
      })
    },
  )

  it('cannot reuse an old result with fresh content on the next default call after result refresh fails', async () => {
    resultRead.mockRejectedValueOnce(new Error('Offline'))
    const first = await prepare(capture, true)
    expect(first.status).toBe('unavailable')
    expect(first.capture.submissionResult).toEqual(capture.submissionResult)
    expect(first.capture.problemContent).toBeNull()
    const callsBefore = resultRead.mock.calls.length
    expect((await prepare(first.capture)).status).toBe('ready')
    expect(resultRead).toHaveBeenCalledTimes(callsBefore + 1)
  })

  it('waits for a discovered pin even if the other transport already rejected', async () => {
    const result = deferred<LeetCodeSubmissionResultRemoteResponse>()
    contentRead.mockRejectedValue(new Error('Offline'))
    resultRead.mockReturnValue(result.promise)
    const pending = prepare({ ...complete, submissionResult: null })
    await Promise.resolve()
    result.resolve({ result: null, debugEvents: [makeDebug('1234567890')] })
    expect(await pending).toMatchObject({
      status: 'unavailable',
      capture: { submissionPollingDebug: { submissionId: '1234567890' } },
    })
  })

  it('cleans listeners and timers when parent abort rejects hanging reads', async () => {
    vi.useFakeTimers()
    const parent = new AbortController()
    const add = vi.spyOn(parent.signal, 'addEventListener')
    const remove = vi.spyOn(parent.signal, 'removeEventListener')
    resultRead.mockReturnValue(new Promise(() => {}))
    const pending = prepare(capture, true, parent.signal)
    const rejection = expect(pending).rejects.toThrow('Navigated away')
    parent.abort(new Error('Navigated away'))
    await rejection
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects an already aborted signal before returning ready or starting transport', async () => {
    const parent = new AbortController()
    parent.abort(new Error('Already gone'))
    await expect(prepare(capture, false, parent.signal)).rejects.toThrow(
      'Already gone',
    )
    expect(resultRead).not.toHaveBeenCalled()
  })

  it('cleans listeners and timers on success and leaves caller capture unchanged', async () => {
    vi.useFakeTimers()
    const original = structuredClone(capture)
    const parent = new AbortController()
    const add = vi.spyOn(parent.signal, 'addEventListener')
    const remove = vi.spyOn(parent.signal, 'removeEventListener')
    const prepared = await prepare(capture, true, parent.signal)
    expect(prepared.status).toBe('ready')
    expect(capture).toEqual(original)
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1])
    expect(vi.getTimerCount()).toBe(0)
  })
})
