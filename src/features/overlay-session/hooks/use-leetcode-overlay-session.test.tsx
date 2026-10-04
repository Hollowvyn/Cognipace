import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import type { OverlayAppShellData } from '@/features/app-shell'
import {
  getOverlayAppShellDataViaRuntime,
  openDashboardViaRuntime,
} from '@/features/app-shell'
import {
  recommendLeetCodeAssessmentViaRuntime,
  type RecommendLeetCodeAssessmentRequest,
} from '@/features/leetcode-review-assistant'
import { makeValidRecommendation } from '@/features/leetcode-review-assistant/testing'
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

vi.mock('@/features/leetcode-capture', () => ({
  createLeetCodeCaptureRemoteClient: vi.fn(() => ({})),
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
    recommendLeetCodeAssessmentViaRuntime: vi.fn(),
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

const AI_PROBE_SUMMARY = '__AI_PROBE_summary__'
const AI_PROBE_PRIMARY_REASON = '__AI_PROBE_primary_reason__'
const AI_PROBE_EVIDENCE = '__AI_PROBE_evidence_item__'
const AI_PROBE_IMPROVEMENT = '__AI_PROBE_improvement_point__'
const AI_PROBE_EDGE_CASE = '__AI_PROBE_edge_case_note__'
const AI_PROBES = [
  AI_PROBE_SUMMARY,
  AI_PROBE_PRIMARY_REASON,
  AI_PROBE_EVIDENCE,
  AI_PROBE_IMPROVEMENT,
  AI_PROBE_EDGE_CASE,
] as const

describe('useLeetCodeOverlaySession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    leetcodeMockState.onEvent = null
    vi.mocked(upsertProblemFromPageViaRuntime).mockResolvedValue(problemRecord)
    vi.mocked(saveReviewResultViaRuntime).mockResolvedValue(
      createSavedPracticeDetails(),
    )
    vi.mocked(overrideLastReviewResultViaRuntime).mockResolvedValue(
      createSavedPracticeDetails(),
    )
    vi.mocked(getOverlayAppShellDataViaRuntime).mockResolvedValue(
      createOverlayData(),
    )
    vi.mocked(recommendLeetCodeAssessmentViaRuntime).mockResolvedValue({
      status: 'unavailable',
      message: 'AI assessment is not configured.',
      submissionFingerprint: 'fallback',
    })
    vi.mocked(sendMessage).mockResolvedValue({
      status: 'unavailable',
      message: 'AI assessment is not configured (test default).',
      submissionFingerprint: 'fallback',
    })
  })

  it('quick submits from collapsed using the assessment policy', async () => {
    const { result } = await renderReadySession()

    await runOverlayAction(result.current.actions.prepareQuickSubmit)

    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'good',
      elapsedSeconds: null,
      isCorrect: true,
    })
    expect(result.current.overlay.visualMode).toBe('expanded')
    expect(result.current.overlay.selectedRating).toBe('good')
    expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
  })

  it('fires the Easy gate on a fast recall solve beating the previous best', async () => {
    const startTime = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime)
    const { result } = await renderReadySession({
      practice: createSavedPracticeDetails({
        latestAttempt: { elapsedSeconds: 1800 },
      }),
    })

    act(() => {
      result.current.actions.startTimer()
    })
    // Medium target = 35 * 60 = 2100s. 600s is 28% of target and beats prior best (1800s).
    nowSpy.mockReturnValue(startTime + 600 * 1000)

    await runOverlayAction(result.current.actions.prepareQuickSubmit)

    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'easy',
      elapsedSeconds: 600,
      isCorrect: true,
    })
  })

  it('does not fire the Easy gate on a first solve even with a fast time', async () => {
    const startTime = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime)
    const { result } = await renderReadySession({
      // Default practice is null → first-solve. Easy gate cannot fire.
    })

    act(() => {
      result.current.actions.startTimer()
    })
    nowSpy.mockReturnValue(startTime + 600 * 1000)

    await runOverlayAction(result.current.actions.prepareQuickSubmit)

    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'good',
      elapsedSeconds: 600,
      isCorrect: true,
    })
  })

  it('submits selected rating without requiring timer usage', async () => {
    const { result } = await renderReadySession({
      timing: { requireSolveTime: true },
    })

    await runOverlayAction(result.current.actions.submitReview)

    expect(latestSavedReviewRequest()).toMatchObject({
      surface: 'content-script',
      problemSlug: 'two-sum',
      rating: 'good',
      elapsedSeconds: null,
      isCorrect: true,
    })
    expect(latestSavedReviewRequest()).not.toHaveProperty('log')
    expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
  })

  it('asks GenAI for an assessment recommendation before saving when configured', async () => {
    vi.mocked(recommendLeetCodeAssessmentViaRuntime).mockResolvedValueOnce({
      status: 'ready',
      recommendation: makeValidRecommendation({
        recommendedRating: 'hard',
        shouldUpdateRating: true,
      }),
      providerMetadata: {
        provider: 'openai',
        model: 'gpt-test',
        durationMs: 123,
      },
      submissionFingerprint: 'two-sum:quick-submit:good:null',
    })
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })

    await runOverlayAction(result.current.actions.prepareQuickSubmit)

    const recommendationRequest = latestAssessmentRecommendationRequest()
    expect(recommendationRequest.surface).toBe('content-script')
    expect(recommendationRequest.problemSlug).toBe('two-sum')
    expect(recommendationRequest.deterministicDecision).toMatchObject({
      rating: 'good',
    })
    expect(recommendationRequest.problem).toMatchObject({
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'easy',
    })
    expect(recommendationRequest.submission).toEqual({
      status: 'no-submission',
    })
    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'hard',
      isCorrect: true,
    })
  })

  it('falls back to deterministic assessment when GenAI is unavailable', async () => {
    vi.mocked(recommendLeetCodeAssessmentViaRuntime).mockResolvedValueOnce({
      status: 'unavailable',
      message: 'AI assessment is not configured.',
      submissionFingerprint: 'two-sum:quick-submit:good:null',
    })
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })

    await runOverlayAction(result.current.actions.prepareQuickSubmit)

    expect(recommendLeetCodeAssessmentViaRuntime).toHaveBeenCalledOnce()
    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'good',
      isCorrect: true,
    })
  })

  it('falls back to deterministic assessment when GenAI recommendation throws', async () => {
    vi.mocked(recommendLeetCodeAssessmentViaRuntime).mockRejectedValueOnce(
      new Error('Provider unavailable.'),
    )
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })

    await runOverlayAction(result.current.actions.prepareQuickSubmit)

    expect(recommendLeetCodeAssessmentViaRuntime).toHaveBeenCalledOnce()
    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'good',
      isCorrect: true,
    })
    expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
  })

  it('keeps a saved review submitted when the next-step refresh fails', async () => {
    vi.mocked(getOverlayAppShellDataViaRuntime)
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

  it('forces strict timing overtime submissions to Again', async () => {
    const startTime = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime)
    const { result } = await renderReadySession({
      timing: { strictTiming: true },
    })

    act(() => {
      result.current.actions.startTimer()
    })
    nowSpy.mockReturnValue(startTime + 21 * 60 * 1000)

    await runOverlayAction(result.current.actions.submitReview)

    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'again',
      elapsedSeconds: 21 * 60,
      isCorrect: false,
    })
    expect(result.current.overlay.ratingLockReason).toBe('hard-mode-overtime')
  })

  it('saves failed attempts immediately as Again and locks assessment', async () => {
    const { result } = await renderReadySession()

    await runOverlayAction(result.current.actions.failReview)

    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'again',
      isCorrect: false,
    })
    expect(result.current.overlay.visualMode).toBe('expanded')
    expect(result.current.overlay.ratingLockReason).toBe('failed')
  })

  it('ignores LeetCode submission results when auto-detect is disabled', async () => {
    await renderReadySession()

    emitSubmissionResult()
    await flushEffects()

    expect(saveReviewResultViaRuntime).not.toHaveBeenCalled()
  })

  it('starts the timer once the current problem is ready when auto-detect is enabled', async () => {
    const { result } = await renderReadySession({ autoDetectSolved: true })

    await waitFor(() => {
      expect(result.current.timer.status).toBe('running')
    })
  })

  it('auto-saves accepted LeetCode submission results through the review path', async () => {
    const { result } = await renderReadySession({ autoDetectSolved: true })

    emitSubmissionResult()

    await waitFor(() => {
      expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
      expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
    })
    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'good',
      elapsedSeconds: null,
      isCorrect: true,
    })
  })

  it('auto-saves failed LeetCode submission results as Again', async () => {
    const { result } = await renderReadySession({ autoDetectSolved: true })

    emitSubmissionResult(
      createSubmissionResult({
        status: 'wrong-answer',
        statusText: 'Wrong Answer',
        passedTestCount: 10,
        totalTestCount: 11,
        failingTestcase: '[2,7,11,15]\\n9',
      }),
    )

    await waitFor(() => {
      expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
      expect(result.current.overlay.ratingLockReason).toBe('failed')
    })
    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'again',
      isCorrect: false,
    })
  })

  it('does not append a duplicate auto-detected terminal result', async () => {
    await renderReadySession({ autoDetectSolved: true })
    const submissionResult = createSubmissionResult({
      submissionId: 'duplicate-result',
    })

    emitSubmissionResult(submissionResult)
    await waitFor(() => {
      expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
    })

    emitSubmissionResult(submissionResult)
    await flushEffects()

    expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
  })

  it('can retry the same terminal result after an auto-save failure', async () => {
    vi.mocked(saveReviewResultViaRuntime)
      .mockRejectedValueOnce(new Error('Review save failed.'))
      .mockResolvedValueOnce(createSavedPracticeDetails())
    const { result } = await renderReadySession({ autoDetectSolved: true })
    const submissionResult = createSubmissionResult({
      submissionId: 'retry-result',
    })

    emitSubmissionResult(submissionResult)

    await waitFor(() => {
      expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
      expect(result.current.overlay.feedback?.message).toBe(
        'Review save failed.',
      )
    })

    emitSubmissionResult({ ...submissionResult })

    await waitFor(() => {
      expect(saveReviewResultViaRuntime).toHaveBeenCalledTimes(2)
      expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
    })
  })

  it('ignores stale LeetCode submission results after SPA navigation', async () => {
    await renderReadySession({ autoDetectSolved: true })

    emitNextPage()
    emitSubmissionResult()
    await flushEffects()

    expect(saveReviewResultViaRuntime).not.toHaveBeenCalled()
  })

  it('updates the latest submitted review instead of appending another attempt', async () => {
    const { result } = await renderReadySession()

    await runOverlayAction(result.current.actions.submitReview)
    act(() => {
      result.current.actions.selectRating('hard')
    })
    await runOverlayAction(result.current.actions.updateReview)

    expect(latestSavedReviewRequest()).not.toHaveProperty('log')
    expect(
      vi.mocked(overrideLastReviewResultViaRuntime).mock.calls[0]?.[0],
    ).not.toHaveProperty('log')
    expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
    expect(overrideLastReviewResultViaRuntime).toHaveBeenCalledOnce()
    expect(
      vi.mocked(overrideLastReviewResultViaRuntime).mock.calls[0]?.[0],
    ).toMatchObject({
      problemSlug: 'two-sum',
      rating: 'hard',
    })
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
      expect(saveReviewResultViaRuntime).not.toHaveBeenCalled()
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
    vi.mocked(getOverlayAppShellDataViaRuntime).mockResolvedValueOnce(
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
    expect(getOverlayAppShellDataViaRuntime).toHaveBeenLastCalledWith('two-sum')
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
      vi.mocked(saveReviewResultViaRuntime).mockReturnValueOnce(
        deferredSave.promise,
      )
      const { result } = await renderReadySession()

      const savePromise = runOverlayAction(result.current.actions.submitReview)

      emitNextPage()
      finishSave(deferredSave)
      await savePromise

      expect(result.current.status).toBe('reading-page')
      expect(result.current.overlay.submittedSession).toBeNull()
      expect(getOverlayAppShellDataViaRuntime).toHaveBeenCalledTimes(1)
    },
  )

  it('clears the AI recommendation when the overlay restart action runs', async () => {
    setSendMessageRecommendationReady()
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      autoDetectSolved: true,
    })

    emitSubmissionResult()

    await waitFor(() => {
      expect(result.current.aiRecommendation.status).toBe('ready')
    })

    act(() => {
      result.current.actions.restartLocalSession()
    })

    expect(result.current.aiRecommendation.status).toBe('idle')
  })

  it('clears the AI recommendation when the LeetCode page changes', async () => {
    setSendMessageRecommendationReady()
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      autoDetectSolved: true,
    })

    emitSubmissionResult()

    await waitFor(() => {
      expect(result.current.aiRecommendation.status).toBe('ready')
    })

    emitNextPage()

    expect(result.current.aiRecommendation.status).toBe('idle')
  })

  it('excludes AI-authored text from the save review payload', async () => {
    setSendMessageRecommendationReady()
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      autoDetectSolved: true,
    })

    emitSubmissionResult()

    await waitFor(() => {
      expect(result.current.aiRecommendation.status).toBe('ready')
    })

    await waitFor(() => {
      expect(saveReviewResultViaRuntime).toHaveBeenCalled()
    })

    const payload = latestSavedReviewRequest()
    expectNoAiLeak(payload)
    expect(payload).not.toHaveProperty('log')
  })

  it('excludes AI-authored text from the update review payload', async () => {
    // The update path (overrideLastReviewResultViaRuntime) intentionally
    // does not consult the AI runtime — unlike saveAcceptedReview, which
    // calls maybeApplyAiRecommendation. This test pins that down: even
    // with AI fully wired and ready, the override payload carries
    // only rating and review facts.
    setSendMessageRecommendationReady()
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })

    await runOverlayAction(result.current.actions.submitReview)
    act(() => {
      result.current.actions.selectRating('hard')
    })
    await runOverlayAction(result.current.actions.updateReview)

    expect(overrideLastReviewResultViaRuntime).toHaveBeenCalled()
    const payload = vi
      .mocked(overrideLastReviewResultViaRuntime)
      .mock.calls.at(-1)?.[0]
    if (!payload) {
      throw new Error('Expected an override review request.')
    }
    expectNoAiLeak(payload)
    expect(payload).not.toHaveProperty('log')
  })
})

type RenderedOverlaySession = ReturnType<typeof renderOverlaySession>
type DeferredReviewResult = ReturnType<
  typeof createDeferred<SerializedPracticeDetails>
>

async function renderReadySession(options?: {
  aiAssessmentEnabled?: boolean
  aiAssessmentAvailable?: boolean
  autoDetectSolved?: boolean
  timing?: Partial<OverlayAppShellData['overlay']['timing']>
  practice?: OverlayAppShellData['overlay']['practice']
}): Promise<RenderedOverlaySession> {
  if (
    options?.aiAssessmentEnabled !== undefined ||
    options?.aiAssessmentAvailable !== undefined ||
    options?.autoDetectSolved ||
    options?.timing ||
    options?.practice !== undefined
  ) {
    const overlayDataOptions: Parameters<typeof createOverlayData>[0] = {}

    if (options.aiAssessmentAvailable !== undefined) {
      overlayDataOptions.overlay = {
        aiAssessmentAvailable: options.aiAssessmentAvailable,
      }
    }

    if (options.aiAssessmentEnabled !== undefined) {
      overlayDataOptions.overlay = {
        ...overlayDataOptions.overlay,
        aiAssessmentEnabled: options.aiAssessmentEnabled,
      }
    }

    if (options.autoDetectSolved !== undefined) {
      overlayDataOptions.autoDetectSolved = options.autoDetectSolved
    }

    if (options.timing) {
      overlayDataOptions.timing = options.timing
    }

    if (options.practice !== undefined) {
      overlayDataOptions.practice = options.practice
    }

    vi.mocked(getOverlayAppShellDataViaRuntime).mockResolvedValue(
      createOverlayData(overlayDataOptions),
    )
  }

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
  expect(saveReviewResultViaRuntime).toHaveBeenCalled()

  const request = vi.mocked(saveReviewResultViaRuntime).mock.calls.at(-1)?.[0]

  if (!request) {
    throw new Error('Expected a saved review request.')
  }

  return request
}

function latestAssessmentRecommendationRequest() {
  expect(recommendLeetCodeAssessmentViaRuntime).toHaveBeenCalled()

  const request = vi
    .mocked(recommendLeetCodeAssessmentViaRuntime)
    .mock.calls.at(-1)?.[0]

  if (!request) {
    throw new Error('Expected an assessment recommendation request.')
  }

  return request
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
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

  return {
    ...renderHook(() => useLeetCodeOverlaySession(), {
      wrapper,
    }),
    invalidateQueries,
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

function createOverlayData(options?: {
  autoDetectSolved?: boolean
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
      aiAssessmentEnabled: false,
      aiAssessmentAvailable: false,
      ...options?.overlay,
    },
  }
}

function createSubmissionResult(
  overrides: Partial<LeetCodeSubmissionResult> = {},
): LeetCodeSubmissionResult {
  return {
    location: problemLocation,
    submissionId: '1234567890',
    source: 'api',
    status: 'accepted',
    statusText: 'Accepted',
    checkedAt: Date.now(),
    runtime: '42 ms',
    memory: '18 MB',
    passedTestCount: 57,
    totalTestCount: 57,
    failingTestcase: null,
    errorMessage: null,
    compileError: null,
    runtimeError: null,
    lastTestcase: null,
    codeOutput: null,
    expectedOutput: null,
    stdOutput: null,
    resultCodeSnapshot: {
      code: 'return nums;',
      language: 'TypeScript',
      source: 'api',
      completeness: 'complete',
      capturedAt: Date.now(),
    },
    ...overrides,
  } satisfies LeetCodeSubmissionResult
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

function buildReadyAssessmentResponse(fingerprint: string) {
  return {
    status: 'ready' as const,
    submissionFingerprint: fingerprint,
    recommendation: {
      recommendedRating: 'hard' as const,
      confidence: 'medium' as const,
      summary: AI_PROBE_SUMMARY,
      primaryReason: AI_PROBE_PRIMARY_REASON,
      evidence: [AI_PROBE_EVIDENCE] as const,
      complexity: {
        time: 'O(n)',
        space: 'O(n)',
        confidence: 'medium' as const,
      },
      improvementPoints: [AI_PROBE_IMPROVEMENT] as const,
      edgeCaseNotes: [AI_PROBE_EDGE_CASE] as const,
      shouldUpdateRating: true,
      promptVersion: 'leetcode-assessment-v1' as const,
    },
    providerMetadata: {
      provider: 'openai' as const,
      model: 'gpt-test',
      durationMs: 100,
    },
  }
}

function setSendMessageRecommendationReady(): void {
  vi.mocked(sendMessage).mockImplementation(
    (name: string, request?: unknown) => {
      if (name === 'genai.recommendLeetCodeAssessment') {
        const fingerprint =
          (request as RecommendLeetCodeAssessmentRequest | undefined)
            ?.submissionFingerprint ?? 'unknown'
        return Promise.resolve(buildReadyAssessmentResponse(fingerprint))
      }
      return Promise.reject(
        new Error(`Unexpected sendMessage call in test: ${name}`),
      )
    },
  )
}

function expectNoAiLeak(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  for (const probe of AI_PROBES) {
    expect(serialized).not.toContain(probe)
  }
}
