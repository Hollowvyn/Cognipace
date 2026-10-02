import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  LeetCodePageEvent,
  LeetCodeProblemContentResult,
} from '../domain/types'
import { createLeetCodeFetchRemoteClient } from '../remote/leetcode-fetch-remote-client'
import {
  createLeetCodeSubmissionApiFixtureFetcher,
  leetcodeAcceptedSubmissionApiFixture,
  leetcodePendingSubmissionApiFixture,
} from '../testing/submission-result-fixtures'
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

  it.each(['http-error', 'empty-question', 'partial-question'])(
    'retries %s metadata even when remote content is already useful',
    async (failure) => {
      vi.useFakeTimers()
      renderProblemHeader()
      const successfulFetch = createQuestionContentFetcher()
      let metadataReads = 0
      const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? init.body : ''
        if (!body.includes('questionContent') && metadataReads++ === 0) {
          return Promise.resolve(
            failure === 'http-error'
              ? new Response('', { status: 503 })
              : Response.json({
                  data: {
                    question:
                      failure === 'empty-question'
                        ? {}
                        : { title: 'Partial Metadata' },
                  },
                }),
          )
        }
        return successfulFetch(input, init)
      })
      const { events, watcher } = createWatcherTestHarness({
        hydrationDelays: [0, 500, 1500],
        fetch: fetcher,
      })

      watcher.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(findEvent(events, 'page-ready')).toMatchObject({
        metadata: { source: 'fallback' },
      })
      await vi.runAllTimersAsync()
      watcher.stop()

      expect(
        filterEvents(events, 'metadata-updated').map(
          (event) => event.metadata.source,
        ),
      ).toEqual(['fallback', 'graphql'])
      expect(filterEvents(events, 'page-ready')).toHaveLength(1)
      expect(filterEvents(events, 'problem-content-updated')).toHaveLength(1)
      expect(fetcher).toHaveBeenCalledTimes(4)
    },
  )

  it.each(['failed', 'empty'])(
    'retries %s content on the next hydration refresh',
    async (failure) => {
      vi.useFakeTimers()
      renderProblemHeader()
      const successfulFetch = createQuestionContentFetcher()
      let contentReads = 0
      const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? init.body : ''
        if (body.includes('questionContent') && contentReads++ === 0) {
          return Promise.resolve(
            failure === 'failed'
              ? new Response('', { status: 503 })
              : Response.json({
                  data: { question: { content: '<p></p>', hints: [] } },
                }),
          )
        }
        return successfulFetch(input, init)
      })
      const { events, watcher } = createWatcherTestHarness({
        hydrationDelays: [0, 500, 1500],
        fetch: fetcher,
      })

      watcher.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(filterEvents(events, 'page-ready')).toHaveLength(1)
      expect(filterEvents(events, 'problem-content-updated')).toHaveLength(0)
      await vi.runAllTimersAsync()
      watcher.stop()

      expect(findEvent(events, 'problem-content-updated')).toMatchObject({
        content: { source: 'graphql', statement: 'Return indices.' },
      })
      expect(filterEvents(events, 'page-ready')).toHaveLength(1)
      expect(filterEvents(events, 'metadata-updated')).toHaveLength(1)
      expect(fetcher).toHaveBeenCalledTimes(4)
    },
  )

  it('shares an in-flight content read and emits page-ready before it resolves', async () => {
    vi.useFakeTimers()
    renderProblemHeader()
    const successfulFetch = createQuestionContentFetcher()
    let resolveContent!: (response: Response) => void
    const pendingContent = new Promise<Response>((resolve) => {
      resolveContent = resolve
    })
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? init.body : ''
      return body.includes('questionContent')
        ? pendingContent
        : successfulFetch(input, init)
    })
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [0, 500, 1500, 3000],
      fetch: fetcher,
    })

    watcher.start()
    await vi.advanceTimersByTimeAsync(1500)
    expect(filterEvents(events, 'page-ready')).toHaveLength(1)
    expect(filterEvents(events, 'problem-content-updated')).toHaveLength(0)
    expect(fetcher).toHaveBeenCalledTimes(2)
    resolveContent(await successfulFetch('', { body: 'questionContent' }))
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(filterEvents(events, 'problem-content-updated')).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('limits incomplete detail retries to the existing hydration schedule', async () => {
    vi.useFakeTimers()
    renderProblemHeader()
    const fetcher = createQuestionMetadataFetcher()
    const { events, watcher } = createWatcherTestHarness({
      hydrationDelays: [0, 500, 1500],
      fetch: fetcher,
    })

    watcher.start()
    await vi.runAllTimersAsync()
    watcher.stop()

    expect(fetcher).toHaveBeenCalledTimes(6)
    expect(filterEvents(events, 'page-ready')).toHaveLength(1)
    expect(filterEvents(events, 'problem-content-updated')).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['resolve', 'reject'])(
    'ignores a stale content %s after navigating to a different problem',
    async (outcome) => {
      vi.useFakeTimers()
      renderProblemHeader()
      let currentUrl = problemUrl
      let resolveContent!: (result: LeetCodeProblemContentResult) => void
      let rejectContent!: (error: Error) => void
      const pendingContent = new Promise<LeetCodeProblemContentResult>(
        (resolve, reject) => {
          resolveContent = resolve
          rejectContent = reject
        },
      )
      const remoteClient = createLeetCodeFetchRemoteClient({
        document,
        fetch: createQuestionContentFetcher(),
      })
      const readContent = vi
        .fn(remoteClient.readProblemContent)
        .mockReturnValueOnce(pendingContent)
      const { events, watcher } = createWatcherTestHarness({
        getCurrentUrl: () => currentUrl,
        remoteClient: { ...remoteClient, readProblemContent: readContent },
      })

      watcher.start()
      await vi.advanceTimersByTimeAsync(0)
      currentUrl = 'https://leetcode.com/problems/valid-parentheses/'
      watcher.refresh()
      await vi.advanceTimersByTimeAsync(0)
      if (outcome === 'reject') {
        rejectContent(new Error('Stale content request failed'))
      } else {
        resolveContent(
          await remoteClient.readProblemContent({ location: problemLocation }),
        )
      }
      await vi.runAllTimersAsync()
      watcher.stop()

      expect(
        filterEvents(events, 'problem-content-updated').map(
          (event) => event.location.slug,
        ),
      ).toEqual(['valid-parentheses'])
      expect(filterEvents(events, 'watcher-error')).toHaveLength(0)
    },
  )

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
        clickedAt: 2000,
        submitButtonText: 'Submit',
        submittedCodeSnapshot: {
          code: 'class Solution:\n    pass',
          language: 'Python3',
          source: 'monaco',
          capturedAt: 2000,
        },
      },
    })
  })

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
        },
      },
    })
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
