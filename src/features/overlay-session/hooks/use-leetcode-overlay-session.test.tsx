import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import type { OverlayAppShellData } from '@/features/app-shell'
import {
  getOverlayAppShellDataViaRuntime,
  openDashboardViaRuntime,
} from '@/features/app-shell'
import {
  analyzeLeetCodeSubmissionViaRuntime,
  cancelLeetCodeAnalysisViaRuntime,
  type AnalyzeLeetCodeSubmissionResponse,
} from '@/features/leetcode-review-assistant'
import { makeCompleteCapture } from '@/features/leetcode-capture/testing/code-analysis-capture-fixtures'
import { analysisIdentity } from '@/features/leetcode-review-assistant/api/code-analysis-contracts'
import { makeValidAnalysis } from '@/features/leetcode-review-assistant/testing'
import {
  overrideLastReviewResultViaRuntime,
  saveReviewResultViaRuntime,
} from '@/features/practice'
import type { SerializedPracticeDetails } from '@/features/practice/api/practice-contracts'
import { upsertProblemFromPageViaRuntime } from '@/features/problems'
import type {
  LeetCodePageEvent,
  LeetCodeProblemLocation,
  LeetCodeProblemMetadata,
  LeetCodeSubmissionResult,
} from '@/lib/leetcode'
import { queryKeys } from '@/platform/query/query-keys'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { useLeetCodeOverlaySession } from './use-leetcode-overlay-session'

type LeetCodeMockState = {
  onEvent: ((event: LeetCodePageEvent) => void) | null
  problemLocation: LeetCodeProblemLocation
}

const leetcodeMockState = vi.hoisted<LeetCodeMockState>(() => ({
  onEvent: null,
  problemLocation: {
    slug: 'two-sum',
    url: 'https://leetcode.com/problems/two-sum/',
    host: 'leetcode.com',
  },
}))

const browserMocks = vi.hoisted(() => ({
  getURL: vi.fn((path: string) => `chrome-extension://extension-id${path}`),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { getURL: browserMocks.getURL },
  },
}))

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('@/lib/leetcode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/leetcode')>()

  return {
    ...actual,
    createLeetCodePageWatcher: vi.fn(
      (options: { onEvent: (event: LeetCodePageEvent) => void }) => {
        leetcodeMockState.onEvent = options.onEvent

        return {
          start: vi.fn(),
          stop: vi.fn(),
        }
      },
    ),
    parseLeetCodeProblemLocation: vi.fn(
      () => leetcodeMockState.problemLocation,
    ),
  }
})

const remote = vi.hoisted(() => ({
  readProblemMetadata: vi.fn(),
  readProblemContent: vi.fn(),
  readSubmissionResult: vi.fn(),
}))
vi.mock('@/features/leetcode-capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/leetcode-capture')>()),
  createLeetCodeCaptureRemoteClient: vi.fn(() => remote),
}))

vi.mock('@/features/problems', () => ({
  upsertProblemFromPageViaRuntime: vi.fn(),
}))

vi.mock('@/features/leetcode-review-assistant', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/leetcode-review-assistant')
    >()

  return {
    ...actual,
    analyzeLeetCodeSubmissionViaRuntime: vi.fn(),
    cancelLeetCodeAnalysisViaRuntime: vi.fn(),
  }
})

vi.mock('@/features/practice', () => ({
  overrideLastReviewResultViaRuntime: vi.fn(),
  saveReviewResultViaRuntime: vi.fn(),
}))

vi.mock('@/features/app-shell', async () => {
  const { useQuery } = await import('@tanstack/react-query')
  const appShellQueryKeys = {
    overlay: (problemSlug?: string | null) =>
      ['app-shell-data', 'overlay', problemSlug ?? null] as const,
  }
  const getOverlayAppShellDataViaRuntime =
    vi.fn<(problemSlug?: string | null) => Promise<OverlayAppShellData>>()

  return {
    appShellQueryKeys,
    getOverlayAppShellDataViaRuntime,
    openDashboardViaRuntime: vi.fn(),
    useOverlayAppShellData: (problemSlug?: string | null) =>
      useQuery({
        enabled: problemSlug !== null && problemSlug !== undefined,
        queryKey: appShellQueryKeys.overlay(problemSlug),
        queryFn: () => getOverlayAppShellDataViaRuntime(problemSlug),
      }),
  }
})

const problemLocation =
  leetcodeMockState.problemLocation satisfies LeetCodeProblemLocation

const problemMetadata = {
  location: problemLocation,
  title: 'Two Sum',
  frontendId: '1',
  difficulty: 'Easy',
  isPremium: false,
  topics: [{ name: 'Array', slug: 'array' }],
  source: 'graphql',
  confidence: 'high',
  capturedAt: 1,
} satisfies LeetCodeProblemMetadata

const defaultTiming = {
  requireSolveTime: false,
  strictTiming: false,
  timeTargetsMinutes: {
    easy: 20,
    medium: 35,
    hard: 50,
  },
}

const overlayProblem = {
  difficulty: 'easy',
  isPremium: false,
  problemSlug: 'two-sum',
  title: 'Two Sum',
} satisfies NonNullable<OverlayAppShellData['overlay']['problem']>

const nextStep = {
  category: null,
  detail: 'Next in track · easy',
  dueAt: null,
  kind: 'track',
  problem: {
    difficulty: 'easy',
    isPremium: false,
    problemSlug: 'valid-parentheses',
    title: 'Valid Parentheses',
  },
  title: 'Valid Parentheses',
} satisfies NonNullable<OverlayAppShellData['overlay']['nextStep']>

const analyze = vi.mocked(analyzeLeetCodeSubmissionViaRuntime)
const saveReview = vi.mocked(saveReviewResultViaRuntime)
const overrideReview = vi.mocked(overrideLastReviewResultViaRuntime)
const loadOverlayData = vi.mocked(getOverlayAppShellDataViaRuntime)

const AI_PROBE_SUMMARY = '__AI_PROBE_summary__'
describe('useLeetCodeOverlaySession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    leetcodeMockState.onEvent = null
    vi.mocked(upsertProblemFromPageViaRuntime).mockResolvedValue(problemRecord)
    saveReview.mockResolvedValue(createSavedPracticeDetails())
    overrideReview.mockResolvedValue(createSavedPracticeDetails())
    loadOverlayData.mockResolvedValue(createOverlayData())
    remote.readProblemContent.mockReset().mockResolvedValue({
      ok: true,
      content: makeCompleteCapture().problemContent,
    })
    remote.readSubmissionResult.mockReset().mockResolvedValue({
      result: makeCompleteCapture().submissionResult,
      debugEvents: [],
    })
    analyze.mockReset().mockImplementation((request) =>
      Promise.resolve({
        status: 'ready',
        ...analysisIdentity(request),
        report: makeValidAnalysis({ summary: AI_PROBE_SUMMARY }),
        providerMetadata: {
          provider: 'openai',
          model: 'fixture',
          durationMs: 10,
        },
      }),
    )
    vi.mocked(cancelLeetCodeAnalysisViaRuntime)
      .mockReset()
      .mockResolvedValue({ requestId: 'ignored', cancelled: true })
    vi.mocked(sendMessage).mockResolvedValue(undefined)
  })

  it('preserves selected tab across mode changes without AI or review calls', async () => {
    const startTime = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime)
    const { result } = await renderReadySession()

    act(() => result.current.actions.startTimer())
    act(() => result.current.actions.selectExpandedTab('ai'))

    for (const action of [
      'expand',
      'collapse',
      'dock',
      'restore',
      'expand',
    ] as const) {
      act(() => result.current.actions[action]())
      expect(result.current.overlay.expandedTab).toBe('ai')
      expect(result.current.timer.status).toBe('running')
    }

    for (const tab of ['notes', 'solve', 'ai'] as const) {
      act(() => result.current.actions.selectExpandedTab(tab))
      expect(result.current.timer.status).toBe('running')
    }

    nowSpy.mockReturnValue(startTime + 17000)
    act(() => result.current.actions.pauseTimer())
    expect(result.current.timer.elapsedSeconds).toBe(17)
    expect(analyze).not.toHaveBeenCalled()
    expect(saveReview).not.toHaveBeenCalled()
    expect(overrideReview).not.toHaveBeenCalled()

    act(() => result.current.actions.restartLocalSession())
    expect(result.current.overlay.expandedTab).toBe('solve')
  })

  it('preserves the tab selected while a review is saving', async () => {
    const pending = createDeferred<SerializedPracticeDetails>()
    saveReview.mockReturnValueOnce(pending.promise)
    const { result } = await renderReadySession()

    act(() => {
      result.current.actions.expand()
      result.current.actions.selectExpandedTab('ai')
    })

    let saving!: Promise<void>
    act(() => {
      saving = result.current.actions.submitReview()
    })
    await waitFor(() =>
      expect(result.current.overlay.reviewStatus).toBe('saving'),
    )
    act(() => result.current.actions.selectExpandedTab('notes'))
    await act(async () => {
      pending.resolve(createSavedPracticeDetails())
      await saving
    })

    expect(result.current.overlay.expandedTab).toBe('notes')
    expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
    expect(saveReview).toHaveBeenCalledOnce()
  })

  it.each([
    ['quick submit', 'prepareQuickSubmit', null, 'good', null, {}],
    [
      'untimed manual',
      'submitReview',
      null,
      'hard',
      null,
      { requireSolveTime: true },
    ],
    ['timed manual', 'submitReview', 73, 'good', null, {}],
    [
      'strict overtime',
      'submitReview',
      1260,
      'again',
      'hard-mode-overtime',
      { strictTiming: true },
    ],
    ['explicit failure', 'failReview', null, 'again', 'failed', {}],
    ['accepted autosave', 'auto', 95, 'good', null, {}],
    ['failed autosave', 'auto', null, 'again', 'failed', {}],
  ] as const)(
    '%s persists before analysis finishes and retains its rating, timing and lock',
    async (_name, action, elapsedSeconds, rating, lockReason, timing) => {
      const analysis = createPendingAnalysis()
      const now = Date.now()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
      const expected = { rating, elapsedSeconds, isCorrect: rating !== 'again' }
      saveReview.mockResolvedValueOnce(
        createSavedPracticeDetails({ latestAttempt: expected }),
      )
      const { result } = await renderReadySession({
        aiAssessmentEnabled: true,
        aiAssessmentAvailable: true,
        autoDetectSolved: action === 'auto',
        timing,
      })
      if (elapsedSeconds !== null) {
        if (action !== 'auto') act(() => result.current.actions.startTimer())
        clock.mockReturnValue(now + elapsedSeconds * 1000)
      }
      const submission = makeCompleteCapture().submissionResult
      if (lockReason === 'failed')
        Object.assign(submission, {
          status: 'wrong-answer',
          statusText: 'Wrong Answer',
        })
      emitCompleteAnalysisSubmission(submission)
      await expectPendingAnalysis(result)
      if (action !== 'auto') {
        act(() =>
          result.current.actions.selectRating(lockReason ? 'good' : rating),
        )
        await runOverlayAction(result.current.actions[action])
      }
      await waitFor(() =>
        expect(result.current.overlay.reviewStatus).toBe('submitted-clean'),
      )
      expect(latestSavedReviewRequest()).toEqual({
        surface: 'content-script',
        problemSlug: 'two-sum',
        reviewMode: 'leetcode',
        ...expected,
      })
      for (const status of ['pending', 'ready'] as const) {
        if (status === 'ready') await completePendingAnalysis(analysis, result)
        expect(result.current.aiAnalysis.status).toBe(status)
        expect(result.current.overlay.submittedSession).toEqual({
          ...expected,
          lockReason,
        })
        expect(result.current.overlay.visualMode).toBe('expanded')
        expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
        if (elapsedSeconds !== null)
          expect(result.current.timer).toMatchObject({
            status: 'locked',
            elapsedSeconds,
          })
        if (lockReason) {
          act(() => result.current.actions.selectRating('easy'))
          await runOverlayAction(result.current.actions.updateReview)
        }
        expect(result.current.overlay.selectedRating).toBe(rating)
        expect(result.current.overlay.ratingLockReason).toBe(lockReason)
        expect(saveReview).toHaveBeenCalledOnce()
        expect(overrideReview).not.toHaveBeenCalled()
      }
      expect(result.current.overlay.nextStep.value).toEqual(nextStep)
    },
  )

  it.each([
    [1800, 'easy'],
    [null, 'good'],
  ] as const)(
    'quick-submit Easy gate with prior solve %j selects %s',
    async (prior, rating) => {
      const startTime = Date.now()
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime)
      const { result } = await renderReadySession({
        practice:
          prior === null
            ? null
            : createSavedPracticeDetails({
                latestAttempt: { elapsedSeconds: prior },
              }),
      })
      act(() => result.current.actions.startTimer())
      nowSpy.mockReturnValue(startTime + 600_000)
      await runOverlayAction(result.current.actions.prepareQuickSubmit)
      expect(latestSavedReviewRequest()).toMatchObject({
        rating,
        elapsedSeconds: 600,
        isCorrect: true,
      })
    },
  )

  it('keeps a saved review submitted when the next-step refresh fails', async () => {
    loadOverlayData
      .mockResolvedValueOnce(createOverlayData())
      .mockRejectedValueOnce(new Error('Next problem unavailable.'))
    const { result } = await renderReadySession()

    await runOverlayAction(result.current.actions.submitReview)

    expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
    expect(result.current.overlay.submittedSession?.rating).toBe('good')
    expect(result.current.overlay.nextStep.status).toBe('error')
    expect(result.current.overlay.nextStep.message).toBe(
      'Review saved. Next problem unavailable.',
    )
  })

  it('ignores LeetCode submission results when auto-detect is disabled', async () => {
    await renderReadySession()

    emitSubmissionResult()
    await flushEffects()

    expect(saveReview).not.toHaveBeenCalled()
  })

  it('starts the timer once the current problem is ready when auto-detect is enabled', async () => {
    const { result } = await renderReadySession({ autoDetectSolved: true })

    await waitFor(() => {
      expect(result.current.timer.status).toBe('running')
    })
  })

  it('does not append a duplicate auto-detected terminal result', async () => {
    await renderReadySession({ autoDetectSolved: true })
    const submissionResult = createSubmissionResult({
      submissionId: 'duplicate-result',
    })

    emitSubmissionResult(submissionResult)
    await waitFor(() => {
      expect(saveReview).toHaveBeenCalledOnce()
    })

    emitSubmissionResult(submissionResult)
    await flushEffects()

    expect(saveReview).toHaveBeenCalledOnce()
  })

  it('can retry the same terminal result after an auto-save failure', async () => {
    saveReview
      .mockRejectedValueOnce(new Error('Review save failed.'))
      .mockResolvedValueOnce(createSavedPracticeDetails())
    const { result } = await renderReadySession({ autoDetectSolved: true })
    const submissionResult = createSubmissionResult({
      submissionId: 'retry-result',
    })

    emitSubmissionResult(submissionResult)

    await waitFor(() => {
      expect(saveReview).toHaveBeenCalledOnce()
      expect(result.current.overlay.feedback?.message).toBe(
        'Review save failed.',
      )
    })

    emitSubmissionResult({ ...submissionResult })

    await waitFor(() => {
      expect(saveReview).toHaveBeenCalledTimes(2)
      expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
    })
  })

  it('ignores stale LeetCode submission results after SPA navigation', async () => {
    await renderReadySession({ autoDetectSolved: true })

    emitNextPage()
    emitSubmissionResult()
    await flushEffects()

    expect(saveReview).not.toHaveBeenCalled()
  })

  it('updates the latest submitted review while analysis is pending instead of appending another attempt', async () => {
    const analysis = createPendingAnalysis()
    const startTime = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime)
    saveReview.mockResolvedValueOnce(
      createSavedPracticeDetails({ latestAttempt: { elapsedSeconds: 95 } }),
    )
    overrideReview.mockResolvedValueOnce(
      createSavedPracticeDetails({
        latestAttempt: {
          rating: 'again',
          elapsedSeconds: 95,
          isCorrect: false,
        },
      }),
    )
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })
    act(() => result.current.actions.startTimer())
    nowSpy.mockReturnValue(startTime + 95_000)
    emitCompleteAnalysisSubmission()
    await expectPendingAnalysis(result)
    await runOverlayAction(result.current.actions.submitReview)
    act(() => result.current.actions.selectRating('again'))
    await runOverlayAction(result.current.actions.updateReview)

    expect(latestSavedReviewRequest()).not.toHaveProperty('log')
    expect(overrideReview.mock.calls[0]?.[0]).toEqual({
      surface: 'content-script',
      problemSlug: 'two-sum',
      rating: 'again',
      elapsedSeconds: 95,
      isCorrect: false,
    })
    expect(result.current.aiAnalysis.status).toBe('pending')
    await completePendingAnalysis(analysis, result)
    expect(saveReview).toHaveBeenCalledOnce()
    expect(overrideReview).toHaveBeenCalledOnce()
    expect(result.current.overlay.submittedSession).toEqual({
      rating: 'again',
      elapsedSeconds: 95,
      isCorrect: false,
      lockReason: null,
    })
    expect(result.current.overlay.selectedRating).toBe('again')
    expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
    expect(result.current.timer).toMatchObject({
      status: 'locked',
      elapsedSeconds: 95,
    })
    expect(result.current.overlay.nextStep.value).toEqual(nextStep)
  })

  it.each(['collapse', 'dock'] as const)(
    'does not write historical logs when using %s',
    async (action) => {
      const { result } = await renderReadySession({
        practice: createPracticeDetails({
          currentLog: { ...emptyPracticeLog, notes: 'Keep this saved note.' },
        }),
      })
      act(() => {
        result.current.actions[action]()
      })
      await flushEffects()
      expect(sendMessage).not.toHaveBeenCalled()
      expect(saveReview).not.toHaveBeenCalled()
      expect(result.current.context?.practice?.currentLog.notes).toBe(
        'Keep this saved note.',
      )
    },
  )

  it('asks the background service worker to open dashboard settings', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const { result } = await renderReadySession()

    act(() => {
      result.current.actions.openSettings()
    })

    expect(openDashboardViaRuntime).toHaveBeenCalledWith('settings')
    expect(openSpy).not.toHaveBeenCalled()
    expect(result.current.overlay.feedback).toBeNull()
  })

  it('refreshes live overlay context after cross-surface cache invalidation', async () => {
    const { queryClient, result } = await renderReadySession()
    loadOverlayData.mockResolvedValueOnce(
      createOverlayData({ timing: { strictTiming: true } }),
    )

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.appShell.all,
      })
    })

    await waitFor(() => {
      expect(result.current.context?.timing.strictTiming).toBe(true)
    })
    expect(loadOverlayData).toHaveBeenLastCalledWith('two-sum')
  })

  it('sends captured topic labels when syncing the LeetCode page', async () => {
    renderOverlaySession()

    emitPageReady()

    await waitFor(() =>
      expect(upsertProblemFromPageViaRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          topicLabels: ['Array'],
        }),
      ),
    )
  })

  it.each([
    {
      outcome: 'result',
      finishSave: (deferred: DeferredReviewResult) =>
        deferred.resolve(createSavedPracticeDetails()),
    },
    {
      outcome: 'error',
      finishSave: (deferred: DeferredReviewResult) =>
        deferred.reject(new Error('Old save failed.')),
    },
  ] as const)(
    'ignores an in-flight submit $outcome after page navigation',
    async ({ finishSave }) => {
      const deferredSave = createDeferred<SerializedPracticeDetails>()
      saveReview.mockReturnValueOnce(deferredSave.promise)
      const { result } = await renderReadySession()

      const savePromise = runOverlayAction(result.current.actions.submitReview)

      emitNextPage()
      finishSave(deferredSave)
      await savePromise

      expect(result.current.status).toBe('reading-page')
      expect(result.current.overlay.submittedSession).toBeNull()
      expect(loadOverlayData).toHaveBeenCalledTimes(1)
    },
  )

  it('runs one scored report for a full matching attempt without preselecting a rating', async () => {
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })
    act(() => result.current.actions.selectRating('easy'))
    emitCompleteAnalysisSubmission()
    await waitFor(() => expect(result.current.aiAnalysis.status).toBe('ready'))
    const request = analyze.mock.calls[0]![0]
    const capture = makeCompleteCapture()
    expect(request).toMatchObject({
      attemptId: capture.submissionAttempt.attemptId,
      submissionId: capture.submissionResult.submissionId,
      problemSlug: 'two-sum',
      submission: { code: capture.submissionResult.resultCodeSnapshot.code },
      problem: { followUps: capture.problemContent.followUps },
    })
    expect(result.current.overlay.selectedRating).toBe('easy')
    expect(sendMessage).not.toHaveBeenCalled()
    for (const action of ['expand', 'collapse', 'dock', 'restore'] as const) {
      act(() => result.current.actions[action]())
      await flushEffects()
      expect(result.current.aiAnalysis.status).toBe('ready')
    }
    for (const tab of ['ai', 'notes', 'solve', 'ai'] as const) {
      act(() => result.current.actions.selectExpandedTab(tab))
      await flushEffects()
      expect(result.current.aiAnalysis.status).toBe('ready')
    }
    expect(analyze).toHaveBeenCalledOnce()
    expect(result.current.overlay.selectedRating).toBe('easy')
  })

  it('exposes Retry for the same pinned attempt with a new request identity', async () => {
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })
    emitCompleteAnalysisSubmission()
    await waitFor(() => expect(result.current.aiAnalysis.status).toBe('ready'))
    const first = analyze.mock.calls[0]![0]
    act(() => result.current.retryAiAnalysis())
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.aiAnalysis.status).toBe('ready'))
    const second = analyze.mock.calls[1]![0]
    expect(second.requestId).not.toBe(first.requestId)
    expect(second.attemptId).toBe(first.attemptId)
    expect(second.submissionId).toBe(first.submissionId)
    expect(remote.readProblemContent).toHaveBeenCalledOnce()
  })

  it('keeps disabled analysis separate from provider availability', async () => {
    const { result } = await renderReadySession({
      aiAssessmentEnabled: false,
      aiAssessmentAvailable: true,
    })
    emitCompleteAnalysisSubmission()
    await flushEffects()
    expect(result.current.aiAnalysis.status).toBe('disabled')
    expect(analyze).not.toHaveBeenCalled()
  })

  it.each(['restart', 'navigation'] as const)(
    'clears ready analysis on %s',
    async (action) => {
      const { result } = await renderReadySession({
        aiAssessmentEnabled: true,
        aiAssessmentAvailable: true,
        autoDetectSolved: true,
      })
      emitCompleteAnalysisSubmission()
      await waitFor(() =>
        expect(result.current.aiAnalysis.status).toBe('ready'),
      )
      if (action === 'restart')
        act(() => result.current.actions.restartLocalSession())
      else emitNextPage()
      expect(result.current.aiAnalysis.status).toBe(
        action === 'restart' ? 'idle' : 'disabled',
      )
    },
  )

  it('excludes a ready AI report from both save and update payloads', async () => {
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })
    emitCompleteAnalysisSubmission()
    await waitFor(() => expect(result.current.aiAnalysis.status).toBe('ready'))
    await runOverlayAction(result.current.actions.submitReview)
    act(() => result.current.actions.selectRating('hard'))
    await runOverlayAction(result.current.actions.updateReview)
    expect(overrideReview).toHaveBeenCalledOnce()
    for (const payload of [
      latestSavedReviewRequest(),
      overrideReview.mock.calls[0]![0],
    ]) {
      expect(JSON.stringify(payload)).not.toContain(AI_PROBE_SUMMARY)
      expect(payload).not.toHaveProperty('log')
    }
  })
})

type RenderedOverlaySession = ReturnType<typeof renderOverlaySession>
type DeferredReviewResult = ReturnType<
  typeof createDeferred<SerializedPracticeDetails>
>

async function renderReadySession(
  options: Parameters<typeof createOverlayData>[0] = {},
): Promise<RenderedOverlaySession> {
  if (Object.keys(options).length)
    loadOverlayData.mockResolvedValue(createOverlayData(options))

  const session = renderOverlaySession()

  emitPageReady()
  await waitFor(() =>
    expect(session.result.current).toMatchObject({
      status: 'ready',
      overlay: { activeProblemSlug: 'two-sum' },
    }),
  )

  return session
}

function createPendingAnalysis() {
  const analysis = createDeferred<AnalyzeLeetCodeSubmissionResponse>()
  analyze.mockReturnValueOnce(analysis.promise)
  return analysis
}

async function expectPendingAnalysis(result: RenderedOverlaySession['result']) {
  await waitFor(() => expect(analyze).toHaveBeenCalledOnce())
  expect(result.current.aiAnalysis.status).toBe('pending')
}

async function completePendingAnalysis(
  analysis: ReturnType<typeof createPendingAnalysis>,
  result: RenderedOverlaySession['result'],
) {
  const request = analyze.mock.calls[0]![0]
  act(() => {
    analysis.resolve({
      status: 'ready',
      ...analysisIdentity(request),
      report: makeValidAnalysis(),
      providerMetadata: {
        provider: 'openai',
        model: 'fixture',
        durationMs: 10,
      },
    })
  })
  await waitFor(() => expect(result.current.aiAnalysis.status).toBe('ready'))
}

function runOverlayAction(action: () => Promise<void>) {
  return act(async () => {
    await action()
  })
}

function flushEffects() {
  return act(async () => {
    await Promise.resolve()
  })
}

function latestSavedReviewRequest() {
  expect(saveReview).toHaveBeenCalled()
  return saveReview.mock.calls.at(-1)![0]
}

function emitNextPage() {
  emitPageChanged({
    ...problemLocation,
    slug: 'add-two-numbers',
    url: 'https://leetcode.com/problems/add-two-numbers/',
  })
}

function renderOverlaySession() {
  const { queryClient, wrapper } = createQueryTestHarness()

  return {
    ...renderHook(() => useLeetCodeOverlaySession(), {
      wrapper,
    }),
    queryClient,
  }
}

function emitPageReady() {
  act(() => {
    leetcodeMockState.onEvent?.({
      type: 'page-ready',
      location: problemLocation,
      snapshot: {
        location: problemLocation,
        title: problemMetadata.title,
        frontendId: problemMetadata.frontendId,
        difficulty: problemMetadata.difficulty,
        isPremium: problemMetadata.isPremium,
        topics: problemMetadata.topics,
        isReady: true,
        capturedAt: problemMetadata.capturedAt,
      },
      metadata: problemMetadata,
      pageReadyAt: Date.now(),
    })
  })
}

function emitPageChanged(location: LeetCodeProblemLocation) {
  act(() => {
    leetcodeMockState.onEvent?.({
      type: 'page-changed',
      location,
      previousLocation: problemLocation,
      changedAt: Date.now(),
    })
  })
}

function emitSubmissionResult(result = createSubmissionResult()) {
  act(() => {
    const event = {
      type: 'submission-result-updated',
      result,
    } satisfies Extract<
      LeetCodePageEvent,
      { type: 'submission-result-updated' }
    >

    leetcodeMockState.onEvent?.(event)
  })
}

function emitCompleteAnalysisSubmission(
  submissionResult?: LeetCodeSubmissionResult,
) {
  const capture = makeCompleteCapture()
  act(() => {
    leetcodeMockState.onEvent?.({
      type: 'problem-content-updated',
      location: capture.location,
      content: capture.problemContent,
    })
    leetcodeMockState.onEvent?.({
      type: 'submission-started',
      attempt: capture.submissionAttempt,
    })
    leetcodeMockState.onEvent?.({
      type: 'submission-result-updated',
      result: submissionResult ?? capture.submissionResult,
    })
  })
}

function createOverlayData(options?: {
  autoDetectSolved?: boolean
  aiAssessmentEnabled?: boolean
  aiAssessmentAvailable?: boolean
  overlay?: Partial<OverlayAppShellData['overlay']>
  practice?: OverlayAppShellData['overlay']['practice']
  timing?: Partial<OverlayAppShellData['overlay']['timing']>
}): OverlayAppShellData {
  return {
    generatedAt: '2026-01-01T10:00:00.000Z',
    surface: 'overlay',
    overlay: {
      appearance: {
        themeMode: 'system',
      },
      automation: {
        autoDetectSolved: options?.autoDetectSolved ?? false,
      },
      problem: overlayProblem,
      practice: options?.practice ?? null,
      timing: {
        ...defaultTiming,
        ...options?.timing,
      },
      nextStep,
      aiAssessmentEnabled: options?.aiAssessmentEnabled ?? false,
      aiAssessmentAvailable: options?.aiAssessmentAvailable ?? false,
      ...options?.overlay,
    },
  }
}

function createSubmissionResult(
  overrides: Partial<LeetCodeSubmissionResult> = {},
): LeetCodeSubmissionResult {
  return {
    ...makeCompleteCapture().submissionResult,
    checkedAt: Date.now(),
    ...overrides,
  }
}

type PracticeAttempt = NonNullable<SerializedPracticeDetails['latestAttempt']>

function createPracticeDetails(
  overrides: Partial<SerializedPracticeDetails> = {},
): SerializedPracticeDetails {
  return {
    problemSlug: 'two-sum',
    cardId: 'fsrs:two-sum',
    status: 'new',
    isSuspended: false,
    phase: 'new',
    isStarted: false,
    isDue: false,
    isOverdue: false,
    overdueDays: 0,
    dueAt: null,
    lastReviewedAt: null,
    retrievability: null,
    stability: null,
    difficulty: null,
    scheduledDays: null,
    lapses: 0,
    reviewCount: 0,
    reviewHistory: [],
    practice: null,
    card: null,
    currentLog: emptyPracticeLog,
    recentAttempts: [],
    latestAttempt: null,
    canOverrideLatestReview: false,
    ...overrides,
  }
}

function createSavedPracticeDetails(options?: {
  latestAttempt?: Partial<PracticeAttempt>
}): SerializedPracticeDetails {
  const latestAttempt = createPracticeAttempt(options?.latestAttempt)

  return createPracticeDetails({
    status: 'learning',
    phase: 'learning',
    dueAt: '2026-01-02T10:00:00.000Z',
    lastReviewedAt: latestAttempt.reviewedAt,
    reviewCount: 1,
    difficulty: 5,
    stability: 1,
    scheduledDays: 1,
    isStarted: true,
    retrievability: 1,
    practice: {
      status: 'learning',
      lastReviewedAt: latestAttempt.reviewedAt,
      attemptCount: 1,
      solvedCount: latestAttempt.isCorrect ? 1 : 0,
      isSuspended: false,
      lastRating: latestAttempt.rating,
      lastElapsedSeconds: latestAttempt.elapsedSeconds,
      bestElapsedSeconds: latestAttempt.elapsedSeconds,
      log: latestAttempt.log,
    },
    currentLog: latestAttempt.log,
    recentAttempts: [latestAttempt],
    latestAttempt,
    canOverrideLatestReview: true,
  })
}

function createPracticeAttempt(
  overrides: Partial<PracticeAttempt> = {},
): PracticeAttempt {
  return {
    id: 'attempt-1',
    problemSlug: 'two-sum',
    cardId: 'fsrs:two-sum',
    rating: 'good',
    reviewMode: 'leetcode',
    reviewedAt: '2026-01-01T10:00:00.000Z',
    elapsedSeconds: null,
    isCorrect: true,
    log: emptyPracticeLog,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((resolver, rejecter) => {
    resolve = resolver
    reject = rejecter
  })

  return {
    promise,
    reject,
    resolve,
  }
}

const problemRecord = {
  slug: overlayProblem.problemSlug,
  title: overlayProblem.title,
  difficulty: overlayProblem.difficulty,
  isPremium: overlayProblem.isPremium,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
} as const

const emptyPracticeLog = {
  interviewPattern: null,
  timeComplexity: null,
  spaceComplexity: null,
  languages: null,
  notes: null,
} satisfies SerializedPracticeDetails['currentLog']
