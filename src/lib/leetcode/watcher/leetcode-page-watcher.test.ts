import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  LeetCodePageEvent,
  LeetCodeSubmissionResultRemoteResponse,
} from '../index'
import type { LeetCodeSubmissionResultRemoteRequest } from '../remote/leetcode-remote-client'
import {
  createLeetCodeSubmissionApiFixtureFetcher,
  leetcodeAcceptedSubmissionApiFixture,
  leetcodePendingSubmissionApiFixture,
} from '../testing/submission-result-fixtures'
import { createLeetCodeProblemContentFingerprint } from '../content/content-fingerprint'
import { createLeetCodePageWatcher } from './leetcode-page-watcher'

type PageWatcherOptions = Parameters<typeof createLeetCodePageWatcher>[0]
type PageWatcherTestOptions = Omit<Partial<PageWatcherOptions>, 'onEvent'>

const problemUrl = 'https://leetcode.com/problems/two-sum/'
const problemLocation = {
  slug: 'two-sum',
  url: problemUrl,
  host: 'leetcode.com',
}

describe('createLeetCodePageWatcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits page and metadata events for a LeetCode problem page', async () => {
    vi.useFakeTimers()
    renderProblemHeader()
    const fetcher = createQuestionMetadataFetcher()
    const { events, watcher } = createWatcherTestHarness({
      fetch: fetcher,
      now: () => 1000,
    })

    watcher.start()
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(readEventTypes(events)).toEqual([
      'page-changed',
      'page-ready',
      'metadata-updated',
    ])
    expect(findEvent(events, 'page-ready')).toMatchObject({
      location: { slug: 'two-sum' },
      pageReadyAt: 1000,
      metadata: { title: 'Two Sum', source: 'graphql' },
    })
  })

  it('emits problem content when LeetCode content is readable', async () => {
    vi.useFakeTimers()
    renderProblemHeader()
    const { events, watcher } = createWatcherTestHarness({
      fetch: createQuestionContentFetcher(),
      now: () => 1000,
    })

    watcher.start()
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(findEvent(events, 'problem-content-updated')).toMatchObject({
      location: { slug: 'two-sum' },
      content: {
        statement: 'Return indices.',
        examples: [
          {
            input: 'nums = [2,7]',
            output: '[0,1]',
          },
        ],
        constraints: ['2 <= nums.length'],
        hints: ['Use a hash map.'],
        source: 'graphql',
        confidence: 'high',
      },
    })
  })

  it('emits an identical-text content update when partial capture becomes complete', async () => {
    vi.useFakeTimers()
    renderProblemHeader()
    const content = {
      location: problemLocation,
      statement: 'Return indices.',
      examples: [],
      constraints: [],
      hints: [],
      followUps: [],
      source: 'dom' as const,
      confidence: 'medium' as const,
      completeness: 'partial' as const,
      capturedAt: 1000,
    }
    const completeContent = {
      ...content,
      completeness: 'complete' as const,
      source: 'graphql' as const,
    }
    const remoteClient = {
      readProblemMetadata: vi.fn(async () => ({
        ok: true as const,
        metadata: {
          location: problemLocation,
          title: 'Two Sum',
          frontendId: '1',
          difficulty: 'Easy' as const,
          isPremium: false,
          topics: [],
          source: 'graphql' as const,
          confidence: 'high' as const,
          capturedAt: 1000,
        },
      })),
      readProblemContent: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          content: {
            ...content,
            contentFingerprint:
              createLeetCodeProblemContentFingerprint(content),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          content: {
            ...completeContent,
            contentFingerprint:
              createLeetCodeProblemContentFingerprint(completeContent),
          },
        }),
      readSubmissionResult: vi.fn(),
    }
    const { events, watcher } = createWatcherTestHarness({ remoteClient })
    watcher.start()
    await vi.runAllTimersAsync()
    watcher.refresh()
    await vi.runAllTimersAsync()
    watcher.stop()
    expect(
      filterEvents(events, 'problem-content-updated').map(
        (event) => event.content.completeness,
      ),
    ).toEqual(['partial', 'complete'])
  })

  it('reads problem details once for a slug across hydration retries', async () => {
    vi.useFakeTimers()
    renderProblemHeader()
    const fetcher = createQuestionContentFetcher()
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [0, 500, 1500],
      fetch: fetcher,
    })

    watcher.start()
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(filterEvents(events, 'metadata-updated')).toHaveLength(1)
    expect(filterEvents(events, 'problem-content-updated')).toHaveLength(1)
  })

  it('emits page changes when the active slug changes', async () => {
    vi.useFakeTimers()
    let currentUrl = problemUrl
    const { events, watcher } = createWatcherTestHarness({
      getCurrentUrl: () => currentUrl,
    })

    watcher.start()
    await vi.runAllTimersAsync()
    currentUrl = 'https://leetcode.com/problems/valid-parentheses/'
    watcher.refresh()
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(
      filterEvents(events, 'page-changed').map((event) => event.location.slug),
    ).toEqual(['two-sum', 'valid-parentheses'])
  })

  it('does not schedule full hydration refreshes for noisy same-page mutations', async () => {
    vi.useFakeTimers()
    renderProblemHeader()
    const fetcher = createQuestionMetadataFetcher({ topicTags: [] })
    const { watcher } = createWatcherTestHarness({
      fetch: fetcher,
      mutationRefreshDebounceMs: 100,
      samePageSnapshotRefreshCooldownMs: 4000,
    })

    watcher.start()
    await vi.runOnlyPendingTimersAsync()
    document.body.append(
      document.createElement('div'),
      document.createElement('section'),
      document.createElement('aside'),
    )
    await vi.advanceTimersByTimeAsync(1000)
    watcher.stop()

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('emits submit-clicked without saving a review', async () => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    const { events, watcher } = createWatcherTestHarness({
      now: () => 2000,
    })

    watcher.start()
    await vi.runAllTimersAsync()
    dispatchSubmitClick()
    watcher.stop()

    expect(events).toContainEqual({
      type: 'submit-clicked',
      click: {
        location: problemLocation,
        clickedAt: 2000,
        buttonText: 'Submit',
      },
    })
    expect(events).toContainEqual({
      type: 'submission-started',
      attempt: {
        location: problemLocation,
        attemptId: expect.any(String),
        clickedAt: 2000,
        submitButtonText: 'Submit',
        submittedCodeSnapshot: {
          code: 'class Solution:\n    pass',
          language: 'Python3',
          source: 'monaco',
          completeness: 'partial',
          capturedAt: 2000,
        },
      },
    })
  })

  it('mints one identity per submit and forwards the same identity on every poll', async () => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    const readSubmissionResult = vi.fn(
      async (_request: LeetCodeSubmissionResultRemoteRequest) => ({
        result: null,
        debugEvents: [],
      }),
    )
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [],
      submissionResultReadDelays: [0, 1000],
      now: () => 5000,
      remoteClient: {
        readSubmissionResult,
        readProblemMetadata: vi.fn(),
        readProblemContent: vi.fn(),
      },
    })
    watcher.start()
    dispatchSubmitClick()
    await vi.runAllTimersAsync()
    dispatchSubmitClick()
    await vi.runAllTimersAsync()
    watcher.stop()
    const attempts = filterEvents(events, 'submission-started').map(
      (event) => event.attempt,
    )
    expect(attempts[0]?.attemptId).toMatch(/^[0-9a-f-]{36}$/)
    expect(attempts[1]?.attemptId).not.toBe(attempts[0]?.attemptId)
    expect(
      readSubmissionResult.mock.calls.map(([request]) => request.attemptId),
    ).toEqual([
      attempts[0]?.attemptId,
      attempts[0]?.attemptId,
      attempts[1]?.attemptId,
      attempts[1]?.attemptId,
    ])
  })

  it.each(['new-attempt', 'navigation'])(
    'ignores late polling diagnostics after %s',
    async (supersedingEvent) => {
      vi.useFakeTimers()
      renderProblemEditorPage()
      let currentUrl = problemUrl
      let finishOldRead!: (
        response: LeetCodeSubmissionResultRemoteResponse,
      ) => void
      const readSubmissionResult = vi.fn(
        () =>
          new Promise<LeetCodeSubmissionResultRemoteResponse>((resolve) => {
            finishOldRead = resolve
          }),
      )
      const { events, watcher } = createWatcherTestHarness({
        getCurrentUrl: () => currentUrl,
        hydrationDelays: [],
        submissionResultReadDelays: [0],
        now: () => 5000,
        remoteClient: {
          readSubmissionResult,
          readProblemMetadata: vi.fn(),
          readProblemContent: vi.fn(),
        },
      })
      watcher.start()
      dispatchSubmitClick()
      await vi.advanceTimersByTimeAsync(0)
      if (supersedingEvent === 'new-attempt') dispatchSubmitClick()
      else {
        currentUrl = 'https://leetcode.com/problems/valid-parentheses/'
        watcher.refresh()
      }
      finishOldRead({
        result: null,
        debugEvents: [
          {
            phase: 'submission-found',
            submissionId: '1234567890',
            checkState: 'SUCCESS',
            statusText: 'Old result',
            checkedAt: 6000,
          },
        ],
      })
      await Promise.resolve()
      await Promise.resolve()
      watcher.stop()
      expect(filterEvents(events, 'submission-polling-updated')).toHaveLength(0)
      expect(filterEvents(events, 'submission-result-updated')).toHaveLength(0)
    },
  )

  it('emits submission-result-updated after LeetCode renders the result', async () => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    const { events, watcher } = createWatcherTestHarness({
      submissionResultReadDelays: [0],
      domSubmissionResultFallbackDelayMs: 0,
      now: () => 3000,
    })

    watcher.start()
    await vi.runAllTimersAsync()
    dispatchSubmitClick()
    appendAcceptedSubmissionResult({ runtime: '8 ms', memory: '17.4 MB' })
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(events).toContainEqual({
      type: 'submission-polling-updated',
      location: problemLocation,
      debug: {
        phase: 'dom-fallback-used',
        submissionId: null,
        checkState: null,
        statusText: 'No matching submission found',
        checkedAt: 3000,
      },
    })
    expect(findEvent(events, 'submission-result-updated')).toMatchObject({
      result: {
        location: problemLocation,
        source: 'dom',
        status: 'accepted',
        statusText: 'Accepted',
        runtime: '8 ms',
        memory: '17.4 MB',
        passedTestCount: 58,
        totalTestCount: 58,
        resultCodeSnapshot: {
          code: 'class Solution:\n    pass',
          language: 'Python3',
          source: 'code-block',
          completeness: 'partial',
        },
      },
    })
  })

  it.each([
    { shortcut: 'Command+Enter', metaKey: true },
    { shortcut: 'Ctrl+Enter', ctrlKey: true },
  ])('polls for the API result after $shortcut', async (shortcut) => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    const fetcher = createLeetCodeSubmissionApiFixtureFetcher(
      leetcodeAcceptedSubmissionApiFixture,
    )
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [],
      submissionResultReadDelays: [0, 1000],
      fetch: fetcher,
      now: () => 5000,
    })
    const editor = document.querySelector('.view-lines')
    expect(editor).not.toBeNull()
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      ...shortcut,
    })
    // Monaco can stop bubbling; the page watcher must observe capture events.
    const stopBubbling = (event: Event) => event.stopPropagation()
    editor?.addEventListener('keydown', stopBubbling)

    watcher.start()
    editor?.dispatchEvent(event)
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(event.defaultPrevented).toBe(false)
    expect(filterEvents(events, 'submission-started')).toHaveLength(1)
    expect(findEvent(events, 'submission-started')).toMatchObject({
      attempt: {
        location: problemLocation,
        clickedAt: 5000,
        submittedCodeSnapshot: {
          code: 'class Solution:\n    pass',
          language: 'Python3',
          source: 'monaco',
          completeness: 'partial',
          capturedAt: 5000,
        },
      },
    })
    expect(readSubmissionPollingPhases(events)).toContain('api-result-found')
    expect(filterEvents(events, 'submission-result-updated')).toHaveLength(1)
    expect(findEvent(events, 'submission-result-updated')).toMatchObject({
      result: { source: 'api', status: 'accepted' },
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it.each([
    { key: 'Enter' },
    { key: "'", metaKey: true },
    { key: 'Enter', metaKey: true, shiftKey: true },
    { key: 'Enter', ctrlKey: true, altKey: true },
    { key: 'Enter', metaKey: true, repeat: true },
    { key: 'Enter', ctrlKey: true, isComposing: true },
  ])('ignores non-submit or repeated keyboard input: %j', async (input) => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    const fetcher = createLeetCodeSubmissionApiFixtureFetcher(
      leetcodeAcceptedSubmissionApiFixture,
    )
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [],
      submissionResultReadDelays: [0],
      fetch: fetcher,
    })

    watcher.start()
    document.dispatchEvent(new KeyboardEvent('keydown', input))
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(filterEvents(events, 'submission-started')).toHaveLength(0)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('removes the shortcut listener and clears its polling on stop', async () => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    const fetcher = createLeetCodeSubmissionApiFixtureFetcher(
      leetcodeAcceptedSubmissionApiFixture,
    )
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [],
      submissionResultReadDelays: [1000],
      fetch: fetcher,
    })

    watcher.start()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }),
    )
    watcher.stop()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }),
    )
    await vi.runAllTimersAsync()

    expect(filterEvents(events, 'submission-started')).toHaveLength(1)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('ignores the shortcut after navigating away from problem pages', async () => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    let currentUrl = problemUrl
    const fetcher = createLeetCodeSubmissionApiFixtureFetcher(
      leetcodeAcceptedSubmissionApiFixture,
    )
    const { events, watcher } = createWatcherTestHarness({
      getCurrentUrl: () => currentUrl,
      hydrationDelays: [],
      submissionResultReadDelays: [0],
      fetch: fetcher,
    })

    watcher.start()
    currentUrl = 'https://leetcode.com/problemset/'
    watcher.refresh()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }),
    )
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(filterEvents(events, 'submission-started')).toHaveLength(0)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('emits API submission details after LeetCode finishes judging', async () => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [],
      submissionResultReadDelays: [0],
      fetch: createLeetCodeSubmissionApiFixtureFetcher(
        leetcodeAcceptedSubmissionApiFixture,
      ),
      now: () => 5000,
    })

    watcher.start()
    dispatchSubmitClick()
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(readSubmissionPollingPhases(events)).toEqual([
      'finding-submission',
      'submission-found',
      'checking-result',
      'api-result-found',
      'graphql-details-found',
    ])
    expect(findEvent(events, 'submission-result-updated')).toMatchObject({
      result: {
        location: problemLocation,
        submissionId: '1234567890',
        source: 'api',
        status: 'accepted',
        statusText: 'Accepted',
        runtime: '4 ms',
        memory: '20.62 MB',
        passedTestCount: 63,
        totalTestCount: 63,
        resultCodeSnapshot: {
          code: 'class Solution:\n    def twoSum(self):\n        return []',
          language: 'Python3',
          source: 'api',
          completeness: 'complete',
        },
      },
    })
  })

  it('keeps waiting instead of emitting DOM fallback while API polling is active', async () => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [],
      submissionResultReadDelays: [0],
      fetch: createLeetCodeSubmissionApiFixtureFetcher(
        leetcodePendingSubmissionApiFixture,
      ),
      now: () => 5000,
    })

    watcher.start()
    dispatchSubmitClick()
    appendRuntimeErrorSubmissionResult()
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(filterEvents(events, 'submission-result-updated')).toHaveLength(0)
    expect(readSubmissionPollingPhases(events)).not.toContain(
      'dom-fallback-used',
    )
  })

  it('emits polling timeout debug when no result becomes available', async () => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    let currentTime = 0
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [],
      submissionResultReadDelays: [1000],
      submissionResultWatchDurationMs: 1000,
      domSubmissionResultFallbackDelayMs: 1000,
      now: () => currentTime,
    })

    watcher.start()
    dispatchSubmitClick()
    currentTime = 1000
    await vi.advanceTimersByTimeAsync(1000)
    watcher.stop()

    expect(readSubmissionPollingPhases(events)).toEqual([
      'finding-submission',
      'submission-not-found',
      'dom-fallback-used',
      'timed-out',
    ])
  })

  it('stops polling after an API submission result is emitted', async () => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    let currentTime = 5000
    const fetcher = createLeetCodeSubmissionApiFixtureFetcher(
      leetcodeAcceptedSubmissionApiFixture,
    )
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [],
      submissionResultReadDelays: [0, 1000, 2000],
      fetch: fetcher,
      now: () => currentTime,
    })

    watcher.start()
    dispatchSubmitClick()
    await vi.advanceTimersByTimeAsync(0)

    expect(filterEvents(events, 'submission-result-updated')).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(3)

    currentTime = 8000
    await vi.advanceTimersByTimeAsync(3000)
    watcher.stop()

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(filterEvents(events, 'submission-result-updated')).toHaveLength(1)
  })

  it('reads the submission result when LeetCode updates the page after submit', async () => {
    vi.useFakeTimers()
    renderProblemEditorPage()
    const { events, watcher } = createWatcherTestHarness({
      submissionResultReadDelays: [10000],
      domSubmissionResultFallbackDelayMs: 0,
      mutationRefreshDebounceMs: 100,
      now: () => 4000,
    })

    watcher.start()
    await vi.runOnlyPendingTimersAsync()
    dispatchSubmitClick()
    appendAcceptedSubmissionResult({ runtime: '11 ms', includeCode: false })
    await vi.advanceTimersByTimeAsync(100)
    watcher.stop()

    expect(findEvent(events, 'submission-result-updated')).toMatchObject({
      result: {
        status: 'accepted',
        runtime: '11 ms',
      },
    })
  })
})

function createWatcherTestHarness(options: PageWatcherTestOptions = {}) {
  const events: LeetCodePageEvent[] = []
  const watcher = createLeetCodePageWatcher({
    getCurrentUrl: () => problemUrl,
    hydrationDelays: [0],
    fetch: () => Promise.resolve(new Response('', { status: 500 })),
    ...options,
    onEvent: (event) => events.push(event),
  })

  return { events, watcher }
}

function createQuestionMetadataFetcher(
  question: {
    topicTags?: { name: string; slug: string }[] | undefined
  } = {},
) {
  return vi.fn(() =>
    Promise.resolve(createQuestionMetadataResponse(question.topicTags)),
  )
}

function createQuestionContentFetcher() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const requestBody = typeof init?.body === 'string' ? init.body : ''

    if (requestBody.includes('questionContent')) {
      return Promise.resolve(
        Response.json({
          data: {
            question: {
              content:
                '<p>Return indices.</p><p><strong>Example 1:</strong></p><pre>Input: nums = [2,7]\nOutput: [0,1]</pre><p><strong>Constraints:</strong></p><ul><li>2 <= nums.length</li></ul>',
              hints: ['Use a hash map.'],
            },
          },
        }),
      )
    }

    return Promise.resolve(createQuestionMetadataResponse())
  })
}

function createQuestionMetadataResponse(
  topicTags: { name: string; slug: string }[] = [
    { name: 'Array', slug: 'array' },
  ],
) {
  return Response.json({
    data: {
      question: {
        title: 'Two Sum',
        questionFrontendId: '1',
        difficulty: 'Easy',
        isPaidOnly: false,
        topicTags,
      },
    },
  })
}

function renderProblemHeader() {
  document.body.innerHTML = '<main><h1>1. Two Sum</h1><span>Easy</span></main>'
}

function renderProblemEditorPage() {
  document.body.innerHTML = `
    <main>
      <h1>1. Two Sum</h1>
      <button data-cy="lang-select">Python3</button>
      <div class="view-lines">
        <div class="view-line">class Solution:</div>
        <div class="view-line">    pass</div>
      </div>
      <button data-e2e-locator="console-submit-button">Submit</button>
    </main>
  `
}

function dispatchSubmitClick() {
  const submitButton = document.querySelector(
    '[data-e2e-locator="console-submit-button"]',
  )

  expect(submitButton).not.toBeNull()
  submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function appendAcceptedSubmissionResult(options: {
  runtime: string
  memory?: string | undefined
  includeCode?: boolean | undefined
}) {
  document.querySelector('main')?.insertAdjacentHTML(
    'beforeend',
    `
      <section data-e2e-locator="submission-result">
        <h3>Accepted</h3>
        <span>Runtime ${options.runtime}</span>
        <span>Memory ${options.memory ?? '18 MB'}</span>
        <span>58 / 58 testcases passed</span>
        ${
          options.includeCode === false
            ? ''
            : `<h3>Code | Python3</h3>
              <pre>class Solution:
    pass</pre>`
        }
      </section>
    `,
  )
}

function appendRuntimeErrorSubmissionResult() {
  document.querySelector('main')?.insertAdjacentHTML(
    'beforeend',
    `
      <section data-e2e-locator="submission-result">
        <h3>Runtime Error</h3>
      </section>
    `,
  )
}

function readEventTypes(events: LeetCodePageEvent[]) {
  return events.map((event) => event.type)
}

function findEvent<TEventType extends LeetCodePageEvent['type']>(
  events: LeetCodePageEvent[],
  type: TEventType,
) {
  return events.find(
    (event): event is Extract<LeetCodePageEvent, { type: TEventType }> =>
      event.type === type,
  )
}

function filterEvents<TEventType extends LeetCodePageEvent['type']>(
  events: LeetCodePageEvent[],
  type: TEventType,
) {
  return events.filter(
    (event): event is Extract<LeetCodePageEvent, { type: TEventType }> =>
      event.type === type,
  )
}

function readSubmissionPollingPhases(events: LeetCodePageEvent[]) {
  return filterEvents(events, 'submission-polling-updated').map(
    (event) => event.debug.phase,
  )
}
