import { describe, expect, it, vi } from 'vitest'

import type {
  LeetCodeCaptureState,
  LeetCodeProblemContentResult,
  LeetCodeRemoteClient,
} from '@/lib/leetcode'

import { makeCompleteCapture } from '../testing/code-analysis-capture-fixtures'
import {
  prepareLeetCodeHintContext,
  selectLeetCodeHintProblem,
} from './prepare-code-hint-context'

const unavailableMessage =
  'Complete matching problem context is unavailable or exceeds hint limits. Retry after the problem loads.'

function makePreSubmissionCapture(): LeetCodeCaptureState {
  return {
    ...makeCompleteCapture(),
    codeSnapshot: null,
    submissionAttempt: null,
    submissionClick: null,
    submissionResult: null,
    submissionPollingDebug: null,
  }
}

function makeRemote(capture = makeCompleteCapture()) {
  return {
    readProblemMetadata: vi.fn<LeetCodeRemoteClient['readProblemMetadata']>(
      () => Promise.resolve({ ok: true, metadata: capture.metadata }),
    ),
    readProblemContent: vi.fn<LeetCodeRemoteClient['readProblemContent']>(() =>
      Promise.resolve({ ok: true, content: capture.problemContent }),
    ),
    readSubmissionResult: vi.fn<LeetCodeRemoteClient['readSubmissionResult']>(),
  }
}

describe('prepareLeetCodeHintContext', () => {
  it('uses complete pre-submission problem input without remote reads', async () => {
    const capture = makePreSubmissionCapture()
    const remote = makeRemote()
    const prepared = await prepareLeetCodeHintContext(
      capture,
      remote,
      new AbortController().signal,
    )

    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') throw new Error('Expected ready context')
    expect(Object.keys(prepared.problem).sort()).toEqual([
      'constraints',
      'examples',
      'host',
      'slug',
      'statement',
      'title',
    ])
    expect(prepared.problem).toEqual({
      host: 'leetcode.com',
      slug: 'two-sum',
      title: 'Two Sum',
      statement: capture.problemContent!.statement,
      examples: [],
      constraints: capture.problemContent!.constraints,
    })
    expect(prepared.inputFingerprint).toBe(JSON.stringify(prepared.problem))
    expect(prepared.capture).toBe(capture)
    expect(remote.readProblemMetadata).not.toHaveBeenCalled()
    expect(remote.readProblemContent).not.toHaveBeenCalled()
    expect(remote.readSubmissionResult).not.toHaveBeenCalled()
  })

  it('refreshes missing content with matching metadata and content', async () => {
    const capture = makePreSubmissionCapture()
    const remote = makeRemote()
    const prepared = await prepareLeetCodeHintContext(
      { ...capture, problemContent: null },
      remote,
      new AbortController().signal,
    )

    expect(prepared.status).toBe('ready')
    expect(remote.readProblemMetadata).toHaveBeenCalledExactlyOnceWith({
      location: capture.location,
      refresh: true,
    })
    expect(remote.readProblemContent).toHaveBeenCalledExactlyOnceWith({
      location: capture.location,
      refresh: true,
    })
    expect(remote.readSubmissionResult).not.toHaveBeenCalled()
  })

  it('explicitly refreshes complete input and returns the fresh capture for its owner', async () => {
    const capture = makeCompleteCapture()
    const fresh = {
      ...capture,
      metadata: { ...capture.metadata, title: 'Fresh Two Sum' },
      problemContent: {
        ...capture.problemContent,
        statement: 'Fresh full statement.\nDo not truncate.',
      },
    }
    const remote = makeRemote(fresh)
    const prepared = await prepareLeetCodeHintContext(
      capture,
      remote,
      new AbortController().signal,
      true,
    )

    if (prepared.status !== 'ready') throw new Error('Expected ready context')
    expect(prepared.problem.title).toBe(fresh.metadata.title)
    expect(prepared.problem.statement).toBe(fresh.problemContent.statement)
    expect(prepared.inputFingerprint).toBe(JSON.stringify(prepared.problem))
    expect(prepared.capture).toEqual(fresh)
    expect(prepared.capture.submissionResult).toBe(capture.submissionResult)
    expect(prepared.capture).not.toBe(capture)
    expect(capture.metadata.title).toBe('Two Sum')
    expect(remote.readProblemMetadata).toHaveBeenCalledExactlyOnceWith({
      location: capture.location,
      refresh: true,
    })
    expect(remote.readProblemContent).toHaveBeenCalledExactlyOnceWith({
      location: capture.location,
      refresh: true,
    })
    expect(remote.readSubmissionResult).not.toHaveBeenCalled()
  })

  it('requests a problem page when there is no location', async () => {
    const remote = makeRemote()
    expect(
      await prepareLeetCodeHintContext(
        { ...makePreSubmissionCapture(), location: null },
        remote,
        new AbortController().signal,
      ),
    ).toEqual({
      status: 'unavailable',
      message: 'Open a LeetCode problem before requesting hints.',
    })
    expect(remote.readProblemMetadata).not.toHaveBeenCalled()
    expect(remote.readProblemContent).not.toHaveBeenCalled()
  })

  it('does not reuse old complete content when an explicit refresh fails', async () => {
    const remote = makeRemote()
    remote.readProblemContent.mockResolvedValue({
      ok: false,
      error: new Error('Temporarily unavailable'),
    })
    expect(
      await prepareLeetCodeHintContext(
        makePreSubmissionCapture(),
        remote,
        new AbortController().signal,
        true,
      ),
    ).toEqual({ status: 'unavailable', message: unavailableMessage })
  })

  it('retains matching canonical metadata when its refresh fails', async () => {
    const remote = makeRemote()
    remote.readProblemMetadata.mockResolvedValue({
      ok: false,
      error: new Error('Temporarily unavailable'),
    })
    const capture = makePreSubmissionCapture()
    const prepared = await prepareLeetCodeHintContext(
      { ...capture, problemContent: null },
      remote,
      new AbortController().signal,
    )
    if (prepared.status !== 'ready') throw new Error('Expected ready context')
    expect(prepared.capture.metadata).toBe(capture.metadata)
  })

  it('returns unavailable when refreshed problem context is still partial', async () => {
    const complete = makeCompleteCapture()
    const remote = makeRemote()
    remote.readProblemContent.mockResolvedValue({
      ok: true,
      content: { ...complete.problemContent, completeness: 'partial' },
    })
    expect(
      await prepareLeetCodeHintContext(
        { ...makePreSubmissionCapture(), problemContent: null },
        remote,
        new AbortController().signal,
      ),
    ).toEqual({ status: 'unavailable', message: unavailableMessage })
  })

  it('bounds a hung content read at 15 seconds', async () => {
    vi.useFakeTimers()
    try {
      const remote = makeRemote()
      remote.readProblemContent.mockReturnValue(new Promise(() => {}))
      const pending = prepareLeetCodeHintContext(
        { ...makePreSubmissionCapture(), problemContent: null },
        remote,
        new AbortController().signal,
      )
      const assertion = expect(pending).rejects.toMatchObject({
        code: 'timeout',
      })
      await vi.advanceTimersByTimeAsync(15_000)
      await assertion
      expect(remote.readSubmissionResult).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects cancelled preparation and ignores a late remote completion', async () => {
    const capture = { ...makePreSubmissionCapture(), problemContent: null }
    const remote = makeRemote()
    let resolveContent!: (result: LeetCodeProblemContentResult) => void
    remote.readProblemContent.mockReturnValue(
      new Promise((resolve) => {
        resolveContent = resolve
      }),
    )
    const controller = new AbortController()
    const published = vi.fn()
    const pending = prepareLeetCodeHintContext(
      capture,
      remote,
      controller.signal,
    ).then(published)
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'cancelled',
    })
    await Promise.resolve()
    controller.abort()
    await assertion
    resolveContent({ ok: true, content: makeCompleteCapture().problemContent })
    await Promise.resolve()
    await Promise.resolve()
    expect(published).not.toHaveBeenCalled()
    expect(capture.problemContent).toBeNull()
    expect(remote.readSubmissionResult).not.toHaveBeenCalled()
  })
})

describe('selectLeetCodeHintProblem', () => {
  it('preserves full example text and excludes code, topics, official hints, and follow-ups', () => {
    const capture = makeCompleteCapture()
    const rawText = 'Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]'
    const problem = selectLeetCodeHintProblem({
      ...capture,
      problemContent: {
        ...capture.problemContent,
        examples: [
          {
            label: 'Example 1',
            input: 'nums = [2,7,11,15], target = 9',
            output: '[0,1]',
            explanation: null,
            rawText,
          },
        ],
        hints: ['Use a map.'],
      },
    })
    expect(problem).toEqual({
      host: capture.location.host,
      slug: capture.location.slug,
      title: capture.metadata.title,
      statement: capture.problemContent.statement,
      examples: [rawText],
      constraints: capture.problemContent.constraints,
    })
  })

  it.each(['examples', 'constraints'] as const)(
    'rejects too many %s rather than trimming them',
    (field) => {
      const capture = makeCompleteCapture()
      const content = {
        ...capture.problemContent,
        ...(field === 'examples'
          ? {
              examples: Array.from({ length: 51 }, () => ({
                label: 'Example',
                input: null,
                output: null,
                explanation: null,
                rawText: 'Input and output',
              })),
            }
          : { constraints: Array.from({ length: 101 }, () => 'n > 0') }),
      }
      expect(
        selectLeetCodeHintProblem({ ...capture, problemContent: content }),
      ).toBeNull()
      expect(content[field]).toHaveLength(field === 'examples' ? 51 : 101)
    },
  )

  it.each(['location', 'metadata', 'problemContent'] as const)(
    'rejects missing %s',
    (field) => {
      expect(
        selectLeetCodeHintProblem({ ...makeCompleteCapture(), [field]: null }),
      ).toBeNull()
    },
  )

  it.each(['partial', 'missing'] as const)(
    'rejects %s problem content',
    (completeness) => {
      const capture = makeCompleteCapture()
      expect(
        selectLeetCodeHintProblem({
          ...capture,
          problemContent: { ...capture.problemContent, completeness },
        }),
      ).toBeNull()
    },
  )

  it.each(['metadata', 'problemContent'] as const)(
    'rejects %s from another problem or host',
    (field) => {
      const capture = makeCompleteCapture()
      for (const location of [
        { ...capture.location, slug: 'three-sum' },
        { ...capture.location, host: 'www.leetcode.com' },
      ]) {
        expect(
          selectLeetCodeHintProblem({
            ...capture,
            [field]: { ...capture[field], location },
          }),
        ).toBeNull()
      }
    },
  )

  it('rejects fallback metadata', () => {
    const capture = makeCompleteCapture()
    expect(
      selectLeetCodeHintProblem({
        ...capture,
        metadata: { ...capture.metadata, source: 'fallback' },
      }),
    ).toBeNull()
  })

  it.each(['   ', 'x'.repeat(301)])('rejects invalid title input', (title) => {
    const capture = makeCompleteCapture()
    expect(
      selectLeetCodeHintProblem({
        ...capture,
        metadata: { ...capture.metadata, title },
      }),
    ).toBeNull()
  })

  it.each(['   ', 'x'.repeat(24_000)])(
    'rejects blank or oversized serialized input without truncating',
    (statement) => {
      const capture = makeCompleteCapture()
      const content = { ...capture.problemContent, statement }
      expect(
        selectLeetCodeHintProblem({ ...capture, problemContent: content }),
      ).toBeNull()
      expect(content.statement).toBe(statement)
    },
  )

  it('accepts complete input with no examples or constraints', () => {
    const capture = makeCompleteCapture()
    expect(
      selectLeetCodeHintProblem({
        ...capture,
        problemContent: { ...capture.problemContent, constraints: [] },
      }),
    ).toMatchObject({ examples: [], constraints: [] })
  })
})
