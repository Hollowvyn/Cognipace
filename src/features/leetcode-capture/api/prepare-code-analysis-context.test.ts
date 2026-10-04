import { afterEach, describe, expect, it, vi } from 'vitest'

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

function prepare(
  capture: LeetCodeCaptureState,
  remote = makeRemote(),
  refresh = false,
) {
  return prepareLeetCodeAnalysisContext(
    capture,
    remote,
    new AbortController().signal,
    refresh,
  )
}

describe('prepareLeetCodeAnalysisContext', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns complete matching input without transport or changing full source', async () => {
    const capture = makeCompleteCapture()
    const remote = makeRemote()
    const prepared = await prepare(capture, remote)

    expect(prepared).toEqual({
      status: 'ready',
      context: createLeetCodeReviewContext(capture),
      submissionId: '1234567890',
      attemptId: 'fixture-attempt-1',
      capture,
    })
    expect(remote.readProblemContent).not.toHaveBeenCalled()
    expect(remote.readSubmissionResult).not.toHaveBeenCalled()
    expect(remote.readProblemMetadata).not.toHaveBeenCalled()
    if (prepared.status === 'ready') {
      expect(prepared.context.submittedCode?.code).toBe(
        capture.submissionResult.resultCodeSnapshot.code,
      )
    }
  })

  it('explicitly refreshes both reads once in parallel with the same pinned attempt', async () => {
    const capture = makeCompleteCapture()
    const remote = makeRemote()
    const content = deferred<LeetCodeProblemContentResult>()
    const result = deferred<LeetCodeSubmissionResultRemoteResponse>()
    remote.readProblemContent.mockReturnValue(content.promise)
    remote.readSubmissionResult.mockReturnValue(result.promise)
    const pending = prepare(capture, remote, true)

    expect(remote.readProblemContent).toHaveBeenCalledExactlyOnceWith({
      location: capture.submissionAttempt.location,
      refresh: true,
    })
    expect(remote.readSubmissionResult).toHaveBeenCalledExactlyOnceWith({
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
    const complete = makeCompleteCapture()
    const capture: LeetCodeCaptureState = {
      ...complete,
      submissionResult: null,
      submissionPollingDebug: makeDebug('1234567890'),
    }
    const remote = makeRemote()
    remote.readSubmissionResult.mockReturnValue(new Promise(() => {}))
    const pending = prepare(capture, remote)
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
    expect(remote.readSubmissionResult).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: '1234567890', refresh: true }),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['partial', 'missing'] as const)(
    'does not promote %s result code or the attempt fragment',
    async (completeness) => {
      const full = makeCompleteCapture()
      const remote = makeRemote()
      const result = {
        ...full.submissionResult,
        resultCodeSnapshot: {
          ...full.submissionResult.resultCodeSnapshot,
          completeness,
          code: completeness === 'missing' ? null : 'return [0, 1]',
        },
      }
      remote.readSubmissionResult.mockResolvedValue({ result, debugEvents: [] })
      const prepared = await prepare(
        { ...full, submissionResult: result },
        remote,
      )
      expect(prepared.status).toBe('unavailable')
      expect(
        prepared.capture.submissionResult?.resultCodeSnapshot.completeness,
      ).toBe(completeness)
    },
  )

  it.each(['partial', 'missing'] as const)(
    'does not accept %s content',
    async (completeness) => {
      const capture = makeCompleteCapture()
      const content = { ...capture.problemContent, completeness }
      const remote = makeRemote()
      remote.readProblemContent.mockResolvedValue({ ok: true, content })
      expect(
        (await prepare({ ...capture, problemContent: content }, remote)).status,
      ).toBe('unavailable')
    },
  )

  it.each(['code', 'language', 'statement'] as const)(
    'requires nonblank %s even with complete provenance',
    async (field) => {
      const capture = makeCompleteCapture()
      const incomplete: LeetCodeCaptureState = {
        ...capture,
        problemContent: {
          ...capture.problemContent,
          statement:
            field === 'statement' ? '   ' : capture.problemContent.statement,
        },
        submissionResult: {
          ...capture.submissionResult,
          resultCodeSnapshot: {
            ...capture.submissionResult.resultCodeSnapshot,
            ...(field === 'code' ? { code: '   ' } : {}),
            ...(field === 'language' ? { language: '   ' } : {}),
          },
        },
      }
      const remote = makeRemote()
      remote.readProblemContent.mockResolvedValue({
        ok: true,
        content: incomplete.problemContent!,
      })
      remote.readSubmissionResult.mockResolvedValue({
        result: incomplete.submissionResult,
        debugEvents: [],
      })
      expect((await prepare(incomplete, remote)).status).toBe('unavailable')
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
      const capture = makeCompleteCapture()
      const remote = makeRemote()
      const result = {
        ...capture.submissionResult,
        status,
        statusText: status,
        errorMessage: 'Original diagnostic text',
        compileError: 'Original compile diagnostic',
        runtimeError: 'Original runtime diagnostic',
        failingTestcase: '[2, 7], 9',
      }
      remote.readSubmissionResult.mockResolvedValue({ result, debugEvents: [] })
      const prepared = await prepare(capture, remote, true)
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
        if (field === 'location') {
          capture.location = { ...capture.location!, ...mismatch }
        } else {
          const value = capture[field]!
          const changedLocation = { ...value.location, ...mismatch }
          if (field === 'submissionAttempt') {
            capture.submissionAttempt = {
              ...capture.submissionAttempt!,
              location: changedLocation,
            }
          } else if (field === 'submissionResult') {
            capture.submissionResult = {
              ...capture.submissionResult!,
              location: changedLocation,
            }
          } else if (field === 'metadata') {
            capture.metadata = {
              ...capture.metadata!,
              location: changedLocation,
            }
          } else {
            capture.problemContent = {
              ...capture.problemContent!,
              location: changedLocation,
            }
          }
        }
        const remote = makeRemote()
        expect((await prepare(capture, remote, true)).status).toBe(
          'unavailable',
        )
        expect(remote.readProblemContent).not.toHaveBeenCalled()
        expect(remote.readSubmissionResult).not.toHaveBeenCalled()
      }
    },
  )

  it.each(['content', 'result'] as const)(
    'rejects refreshed %s from another host or slug',
    async (field) => {
      for (const mismatch of [{ host: 'leetcode.cn' }, { slug: 'three-sum' }]) {
        const capture = makeCompleteCapture()
        const remote = makeRemote()
        if (field === 'content') {
          remote.readProblemContent.mockResolvedValue({
            ok: true,
            content: {
              ...capture.problemContent,
              location: { ...capture.location, ...mismatch },
            },
          })
        } else {
          remote.readSubmissionResult.mockResolvedValue({
            result: {
              ...capture.submissionResult,
              location: { ...capture.location, ...mismatch },
            },
            debugEvents: [makeDebug('999')],
          })
        }
        const prepared = await prepare(capture, remote, true)
        expect(prepared.status).toBe('unavailable')
        expect(prepared.capture.submissionResult?.submissionId).toBe(
          '1234567890',
        )
      }
    },
  )

  it('rejects a mismatched context location derived from mutable metadata', async () => {
    const capture = makeCompleteCapture()
    const remote = makeRemote()
    remote.readProblemContent.mockImplementation(() => {
      capture.metadata.location = { ...capture.location, slug: 'three-sum' }
      return Promise.resolve({ ok: true, content: capture.problemContent })
    })
    expect((await prepare(capture, remote, true)).status).toBe('unavailable')
  })

  it.each(['attempt', 'metadata', 'location'] as const)(
    'does not transport without required %s',
    async (field) => {
      const capture: LeetCodeCaptureState = makeCompleteCapture()
      if (field === 'attempt') capture.submissionAttempt = null
      if (field === 'metadata') capture.metadata = null
      if (field === 'location') capture.location = null
      const remote = makeRemote()
      expect((await prepare(capture, remote, true)).status).toBe('unavailable')
      expect(remote.readProblemContent).not.toHaveBeenCalled()
      expect(remote.readSubmissionResult).not.toHaveBeenCalled()
    },
  )

  it('does not transport a blank attempt ID', async () => {
    const capture = makeCompleteCapture()
    capture.submissionAttempt.attemptId = '   '
    const remote = makeRemote()
    expect((await prepare(capture, remote, true)).status).toBe('unavailable')
    expect(remote.readSubmissionResult).not.toHaveBeenCalled()
  })

  it('cannot replace an existing pin with another returned submission ID', async () => {
    const capture = makeCompleteCapture()
    const remote = makeRemote()
    remote.readSubmissionResult.mockResolvedValue({
      result: { ...capture.submissionResult, submissionId: '999' },
      debugEvents: [makeDebug('999')],
    })
    const prepared = await prepare(capture, remote, true)
    expect(prepared.status).toBe('unavailable')
    expect(prepared.capture.submissionResult?.submissionId).toBe('1234567890')
    expect(remote.readSubmissionResult).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: '1234567890' }),
    )
  })

  it.each([null, '', 'bad-id'])(
    'retains the existing result pin when refresh returns invalid ID %s',
    async (submissionId) => {
      const capture = makeCompleteCapture()
      const remote = makeRemote()
      remote.readSubmissionResult.mockResolvedValueOnce({
        result: { ...capture.submissionResult, submissionId },
        debugEvents: [],
      })
      const prepared = await prepare(capture, remote, true)
      expect(prepared.status).toBe('unavailable')
      expect(prepared.capture.submissionResult?.submissionId).toBe('1234567890')
      expect((await prepare(prepared.capture, remote, true)).status).toBe(
        'ready',
      )
      expect(remote.readSubmissionResult).toHaveBeenLastCalledWith(
        expect.objectContaining({ submissionId: '1234567890' }),
      )
    },
  )

  it('uses a result pin ahead of a conflicting current debug ID', async () => {
    const capture: LeetCodeCaptureState = {
      ...makeCompleteCapture(),
      submissionPollingDebug: makeDebug('999'),
    }
    const remote = makeRemote()
    expect((await prepare(capture, remote, true)).status).toBe('ready')
    expect(remote.readSubmissionResult).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: '1234567890' }),
    )
  })

  it('discovers the result pin ahead of conflicting response debug IDs', async () => {
    const complete = makeCompleteCapture()
    const capture: LeetCodeCaptureState = {
      ...complete,
      submissionResult: null,
    }
    const remote = makeRemote()
    remote.readSubmissionResult.mockResolvedValue({
      result: complete.submissionResult,
      debugEvents: [makeDebug('999')],
    })
    const prepared = await prepare(capture, remote)
    expect(prepared).toMatchObject({
      status: 'ready',
      submissionId: '1234567890',
    })
    expect(prepared.capture.submissionPollingDebug?.submissionId).not.toBe(
      '999',
    )
  })

  it('retains the first valid discovery with no result and retries that pin rather than latest', async () => {
    const complete = makeCompleteCapture()
    const capture: LeetCodeCaptureState = {
      ...complete,
      submissionResult: null,
      problemContent: null,
    }
    const remote = makeRemote()
    remote.readProblemContent.mockResolvedValueOnce({
      ok: false,
      error: new Error('Missing'),
    })
    remote.readSubmissionResult.mockResolvedValueOnce({
      result: null,
      debugEvents: [
        makeDebug(null),
        makeDebug('bad-id'),
        makeDebug('1234567890'),
        makeDebug('999'),
      ],
    })
    const first = await prepare(capture, remote)
    expect(first).toMatchObject({
      status: 'unavailable',
      capture: { submissionPollingDebug: { submissionId: '1234567890' } },
    })
    remote.readSubmissionResult.mockImplementation((request) =>
      Promise.resolve({
        result:
          request.submissionId === '1234567890'
            ? complete.submissionResult
            : { ...complete.submissionResult, submissionId: '999' },
        debugEvents: [],
      }),
    )
    expect((await prepare(first.capture, remote, true)).status).toBe('ready')
    expect(remote.readSubmissionResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ submissionId: '1234567890' }),
    )
  })

  it('retains a discovered pin when content hangs, then ignores late resolution', async () => {
    vi.useFakeTimers()
    const complete = makeCompleteCapture()
    const capture: LeetCodeCaptureState = {
      ...complete,
      submissionResult: null,
      problemContent: null,
    }
    const remote = makeRemote()
    const content = deferred<LeetCodeProblemContentResult>()
    remote.readProblemContent.mockReturnValueOnce(content.promise)
    remote.readSubmissionResult.mockResolvedValueOnce({
      result: null,
      debugEvents: [makeDebug('1234567890')],
    })
    const pending = prepare(capture, remote)
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
    expect((await prepare(first.capture, remote, true)).status).toBe('ready')
    expect(remote.readSubmissionResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ submissionId: '1234567890' }),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains a newly returned result pin when content is unavailable', async () => {
    const complete = makeCompleteCapture()
    const remote = makeRemote()
    remote.readProblemContent.mockResolvedValue({
      ok: false,
      error: new Error('Missing'),
    })
    const prepared = await prepare(
      { ...complete, submissionResult: null },
      remote,
    )
    expect(prepared).toMatchObject({
      status: 'unavailable',
      capture: { submissionResult: { submissionId: '1234567890' } },
    })
  })

  it.each(['content', 'result'] as const)(
    'never returns old complete context after %s transport failure',
    async (field) => {
      const capture = makeCompleteCapture()
      const remote = makeRemote()
      if (field === 'content')
        remote.readProblemContent.mockRejectedValue(new Error('Offline'))
      if (field === 'result')
        remote.readSubmissionResult.mockRejectedValue(new Error('Offline'))
      expect(await prepare(capture, remote, true)).toMatchObject({
        status: 'unavailable',
        message: unavailableMessage,
      })
    },
  )

  it('cannot reuse an old result with fresh content on the next default call after result refresh fails', async () => {
    const capture = makeCompleteCapture()
    const remote = makeRemote()
    remote.readSubmissionResult.mockRejectedValueOnce(new Error('Offline'))
    const first = await prepare(capture, remote, true)
    expect(first.status).toBe('unavailable')
    expect(first.capture.submissionResult).toEqual(capture.submissionResult)
    expect(first.capture.problemContent).toBeNull()
    const callsBefore = remote.readSubmissionResult.mock.calls.length
    expect((await prepare(first.capture, remote)).status).toBe('ready')
    expect(remote.readSubmissionResult).toHaveBeenCalledTimes(callsBefore + 1)
  })

  it('waits for a discovered pin even if the other transport already rejected', async () => {
    const complete = makeCompleteCapture()
    const remote = makeRemote()
    const result = deferred<LeetCodeSubmissionResultRemoteResponse>()
    remote.readProblemContent.mockRejectedValue(new Error('Offline'))
    remote.readSubmissionResult.mockReturnValue(result.promise)
    const pending = prepare({ ...complete, submissionResult: null }, remote)
    await Promise.resolve()
    result.resolve({ result: null, debugEvents: [makeDebug('1234567890')] })
    expect(await pending).toMatchObject({
      status: 'unavailable',
      capture: { submissionPollingDebug: { submissionId: '1234567890' } },
    })
  })

  it('cleans listeners and timers when parent abort rejects hanging reads', async () => {
    vi.useFakeTimers()
    const capture = makeCompleteCapture()
    const remote = makeRemote()
    const parent = new AbortController()
    const add = vi.spyOn(parent.signal, 'addEventListener')
    const remove = vi.spyOn(parent.signal, 'removeEventListener')
    remote.readSubmissionResult.mockReturnValue(new Promise(() => {}))
    const pending = prepareLeetCodeAnalysisContext(
      capture,
      remote,
      parent.signal,
      true,
    )
    const rejection = expect(pending).rejects.toThrow('Navigated away')
    parent.abort(new Error('Navigated away'))
    await rejection
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects an already aborted signal before returning ready or starting transport', async () => {
    const parent = new AbortController()
    parent.abort(new Error('Already gone'))
    const remote = makeRemote()
    await expect(
      prepareLeetCodeAnalysisContext(
        makeCompleteCapture(),
        remote,
        parent.signal,
      ),
    ).rejects.toThrow('Already gone')
    expect(remote.readSubmissionResult).not.toHaveBeenCalled()
  })

  it('cleans listeners and timers on success and leaves caller capture unchanged', async () => {
    vi.useFakeTimers()
    const capture = makeCompleteCapture()
    const original = structuredClone(capture)
    const parent = new AbortController()
    const add = vi.spyOn(parent.signal, 'addEventListener')
    const remove = vi.spyOn(parent.signal, 'removeEventListener')
    const prepared = await prepareLeetCodeAnalysisContext(
      capture,
      makeRemote(),
      parent.signal,
      true,
    )
    expect(prepared.status).toBe('ready')
    expect(capture).toEqual(original)
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1])
    expect(vi.getTimerCount()).toBe(0)
  })
})
