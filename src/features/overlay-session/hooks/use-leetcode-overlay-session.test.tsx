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

const AI_PROBE_SUMMARY = '__AI_PROBE_summary__'
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
    remote.readProblemContent.mockReset().mockResolvedValue({
      ok: true,
      content: makeCompleteCapture().problemContent,
    })
    remote.readSubmissionResult.mockReset().mockResolvedValue({
      result: makeCompleteCapture().submissionResult,
      debugEvents: [],
    })
    vi.mocked(analyzeLeetCodeSubmissionViaRuntime)
      .mockReset()
      .mockImplementation((request) =>
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

  it('quick submits from collapsed while analysis is pending using the assessment policy', async () => {
    const analysis = createPendingAnalysis()
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })
    emitCompleteAnalysisSubmission()
    await expectPendingAnalysis(result)

    await runOverlayAction(result.current.actions.prepareQuickSubmit)

    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'good',
      elapsedSeconds: null,
      isCorrect: true,
    })
    expect(result.current.overlay.visualMode).toBe('expanded')
    expect(result.current.overlay.selectedRating).toBe('good')
    expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
    expect(result.current.aiAnalysis.status).toBe('pending')
    await completePendingAnalysis(analysis, result)
    expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
    expect(result.current.overlay.submittedSession?.rating).toBe('good')
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

  it('submits an untimed manual rating while analysis is pending even when solve time is required', async () => {
    const analysis = createPendingAnalysis()
    vi.mocked(saveReviewResultViaRuntime).mockResolvedValueOnce(
      createSavedPracticeDetails({ latestAttempt: { rating: 'hard' } }),
    )
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      timing: { requireSolveTime: true },
    })
    emitCompleteAnalysisSubmission()
    await expectPendingAnalysis(result)
    act(() => result.current.actions.selectRating('hard'))

    await runOverlayAction(result.current.actions.submitReview)

    expect(latestSavedReviewRequest()).toEqual({
      surface: 'content-script',
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewMode: 'leetcode',
      elapsedSeconds: null,
      isCorrect: true,
    })
    expect(latestSavedReviewRequest()).not.toHaveProperty('log')
    expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
    expect(result.current.aiAnalysis.status).toBe('pending')
    await completePendingAnalysis(analysis, result)
    expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
    expect(result.current.overlay.submittedSession).toEqual({
      rating: 'hard',
      elapsedSeconds: null,
      isCorrect: true,
      lockReason: null,
    })
  })

  it('saves the manual decision before pending analysis completes and keeps it after the report arrives', async () => {
    const analysis = createDeferred<AnalyzeLeetCodeSubmissionResponse>()
    vi.mocked(analyzeLeetCodeSubmissionViaRuntime).mockReturnValueOnce(
      analysis.promise,
    )
    const startedAt = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startedAt)
    vi.mocked(saveReviewResultViaRuntime).mockResolvedValueOnce(
      createSavedPracticeDetails({ latestAttempt: { elapsedSeconds: 73 } }),
    )
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      autoDetectSolved: false,
    })
    act(() => result.current.actions.startTimer())
    nowSpy.mockReturnValue(startedAt + 73_000)
    emitCompleteAnalysisSubmission()
    await waitFor(() =>
      expect(analyzeLeetCodeSubmissionViaRuntime).toHaveBeenCalledOnce(),
    )
    expect(result.current.aiAnalysis.status).toBe('pending')
    act(() => result.current.actions.selectRating('good'))
    let save!: Promise<void>
    act(() => {
      save = result.current.actions.submitReview()
    })

    await waitFor(() =>
      expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce(),
    )
    await act(async () => {
      await save
    })
    expect(latestSavedReviewRequest()).toEqual({
      surface: 'content-script',
      problemSlug: 'two-sum',
      rating: 'good',
      reviewMode: 'leetcode',
      elapsedSeconds: 73,
      isCorrect: true,
    })
    expect(result.current.overlay.submittedSession).toEqual({
      rating: 'good',
      elapsedSeconds: 73,
      isCorrect: true,
      lockReason: null,
    })
    expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
    expect(result.current.timer).toMatchObject({
      status: 'locked',
      elapsedSeconds: 73,
    })
    expect(result.current.overlay.nextStep.value).toEqual(nextStep)
    expect(result.current.aiAnalysis.status).toBe('pending')

    const request = vi.mocked(analyzeLeetCodeSubmissionViaRuntime).mock
      .calls[0]![0]
    const capture = makeCompleteCapture()
    expect(analysisIdentity(request)).toEqual({
      requestId: request.requestId,
      attemptId: capture.submissionAttempt.attemptId,
      submissionId: capture.submissionResult.submissionId,
      problemSlug: capture.location.slug,
      configurationRevision: request.configurationRevision,
    })
    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(Number.isInteger(request.configurationRevision)).toBe(true)
    expect(request.configurationRevision).toBeGreaterThanOrEqual(0)
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
    expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
    expect(overrideLastReviewResultViaRuntime).not.toHaveBeenCalled()
    expect(result.current.overlay.selectedRating).toBe('good')
    expect(result.current.overlay.submittedSession).toEqual({
      rating: 'good',
      elapsedSeconds: 73,
      isCorrect: true,
      lockReason: null,
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

  it('keeps strict timing overtime locked to Again while analysis is pending and after it completes', async () => {
    const analysis = createPendingAnalysis()
    const startTime = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime)
    vi.mocked(saveReviewResultViaRuntime).mockResolvedValueOnce(
      createSavedPracticeDetails({
        latestAttempt: {
          rating: 'again',
          elapsedSeconds: 21 * 60,
          isCorrect: false,
        },
      }),
    )
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      timing: { strictTiming: true },
    })
    act(() => result.current.actions.startTimer())
    nowSpy.mockReturnValue(startTime + 21 * 60 * 1000)
    emitCompleteAnalysisSubmission()
    await expectPendingAnalysis(result)

    await runOverlayAction(result.current.actions.submitReview)

    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'again',
      elapsedSeconds: 21 * 60,
      isCorrect: false,
    })
    expect(result.current.overlay.ratingLockReason).toBe('hard-mode-overtime')
    expect(result.current.aiAnalysis.status).toBe('pending')
    act(() => result.current.actions.selectRating('good'))
    await runOverlayAction(result.current.actions.updateReview)
    await completePendingAnalysis(analysis, result)
    expect(result.current.overlay.submittedSession).toEqual({
      rating: 'again',
      elapsedSeconds: 21 * 60,
      isCorrect: false,
      lockReason: 'hard-mode-overtime',
    })
    expect(result.current.overlay.selectedRating).toBe('again')
    expect(result.current.timer).toMatchObject({
      status: 'locked',
      elapsedSeconds: 21 * 60,
    })
    expect(result.current.overlay.nextStep.value).toEqual(nextStep)
    expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
    expect(overrideLastReviewResultViaRuntime).not.toHaveBeenCalled()
  })

  it('saves failed attempts immediately as Again and keeps the lock after pending analysis completes', async () => {
    const analysis = createPendingAnalysis()
    vi.mocked(saveReviewResultViaRuntime).mockResolvedValueOnce(
      createSavedPracticeDetails({
        latestAttempt: { rating: 'again', isCorrect: false },
      }),
    )
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })
    emitCompleteAnalysisSubmission({
      ...makeCompleteCapture().submissionResult,
      status: 'wrong-answer',
      statusText: 'Wrong Answer',
    })
    await expectPendingAnalysis(result)

    await runOverlayAction(result.current.actions.failReview)

    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'again',
      isCorrect: false,
    })
    expect(result.current.overlay.visualMode).toBe('expanded')
    expect(result.current.overlay.ratingLockReason).toBe('failed')
    expect(result.current.aiAnalysis.status).toBe('pending')
    await completePendingAnalysis(analysis, result)
    act(() => result.current.actions.selectRating('easy'))
    await runOverlayAction(result.current.actions.updateReview)
    expect(result.current.overlay.submittedSession).toEqual({
      rating: 'again',
      elapsedSeconds: null,
      isCorrect: false,
      lockReason: 'failed',
    })
    expect(result.current.overlay.selectedRating).toBe('again')
    expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
    expect(overrideLastReviewResultViaRuntime).not.toHaveBeenCalled()
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

  it('auto-saves accepted LeetCode submission results while analysis is pending', async () => {
    const analysis = createPendingAnalysis()
    const startTime = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime)
    vi.mocked(saveReviewResultViaRuntime).mockResolvedValueOnce(
      createSavedPracticeDetails({ latestAttempt: { elapsedSeconds: 95 } }),
    )
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      autoDetectSolved: true,
    })
    nowSpy.mockReturnValue(startTime + 95_000)
    emitCompleteAnalysisSubmission()

    await waitFor(() => {
      expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
      expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
    })
    await expectPendingAnalysis(result)
    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'good',
      elapsedSeconds: 95,
      isCorrect: true,
    })
    await completePendingAnalysis(analysis, result)
    expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
    expect(overrideLastReviewResultViaRuntime).not.toHaveBeenCalled()
    expect(result.current.overlay.submittedSession).toEqual({
      rating: 'good',
      elapsedSeconds: 95,
      isCorrect: true,
      lockReason: null,
    })
    expect(result.current.timer).toMatchObject({
      status: 'locked',
      elapsedSeconds: 95,
    })
    expect(result.current.overlay.nextStep.value).toEqual(nextStep)
  })

  it('auto-saves failed LeetCode submission results as Again while analysis is pending', async () => {
    const analysis = createPendingAnalysis()
    vi.spyOn(Date, 'now').mockReturnValue(Date.now())
    vi.mocked(saveReviewResultViaRuntime).mockResolvedValueOnce(
      createSavedPracticeDetails({
        latestAttempt: { rating: 'again', isCorrect: false },
      }),
    )
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      autoDetectSolved: true,
    })
    emitCompleteAnalysisSubmission({
      ...makeCompleteCapture().submissionResult,
      status: 'wrong-answer',
      statusText: 'Wrong Answer',
      passedTestCount: 10,
      totalTestCount: 11,
      failingTestcase: '[2,7,11,15]\n9',
    })

    await waitFor(() => {
      expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
      expect(result.current.overlay.ratingLockReason).toBe('failed')
    })
    await expectPendingAnalysis(result)
    expect(latestSavedReviewRequest()).toMatchObject({
      rating: 'again',
      elapsedSeconds: null,
      isCorrect: false,
    })
    await completePendingAnalysis(analysis, result)
    expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
    expect(overrideLastReviewResultViaRuntime).not.toHaveBeenCalled()
    expect(result.current.overlay.submittedSession).toEqual({
      rating: 'again',
      elapsedSeconds: null,
      isCorrect: false,
      lockReason: 'failed',
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

  it('updates the latest submitted review while analysis is pending instead of appending another attempt', async () => {
    const analysis = createPendingAnalysis()
    const startTime = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime)
    vi.mocked(saveReviewResultViaRuntime).mockResolvedValueOnce(
      createSavedPracticeDetails({ latestAttempt: { elapsedSeconds: 95 } }),
    )
    vi.mocked(overrideLastReviewResultViaRuntime).mockResolvedValueOnce(
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
    expect(
      vi.mocked(overrideLastReviewResultViaRuntime).mock.calls[0]?.[0],
    ).toEqual({
      surface: 'content-script',
      problemSlug: 'two-sum',
      rating: 'again',
      elapsedSeconds: 95,
      isCorrect: false,
    })
    expect(result.current.aiAnalysis.status).toBe('pending')
    await completePendingAnalysis(analysis, result)
    expect(saveReviewResultViaRuntime).toHaveBeenCalledOnce()
    expect(overrideLastReviewResultViaRuntime).toHaveBeenCalledOnce()
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

  it('runs one scored report for a full matching attempt without preselecting a rating', async () => {
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })
    act(() => result.current.actions.selectRating('easy'))
    emitCompleteAnalysisSubmission()
    await waitFor(() => expect(result.current.aiAnalysis.status).toBe('ready'))
    const request = vi.mocked(analyzeLeetCodeSubmissionViaRuntime).mock
      .calls[0]![0]
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
    expect(analyzeLeetCodeSubmissionViaRuntime).toHaveBeenCalledOnce()
  })

  it('exposes Retry for the same pinned attempt with a new request identity', async () => {
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })
    emitCompleteAnalysisSubmission()
    await waitFor(() => expect(result.current.aiAnalysis.status).toBe('ready'))
    const first = vi.mocked(analyzeLeetCodeSubmissionViaRuntime).mock
      .calls[0]![0]
    act(() => result.current.retryAiAnalysis())
    await waitFor(() =>
      expect(analyzeLeetCodeSubmissionViaRuntime).toHaveBeenCalledTimes(2),
    )
    await waitFor(() => expect(result.current.aiAnalysis.status).toBe('ready'))
    const second = vi.mocked(analyzeLeetCodeSubmissionViaRuntime).mock
      .calls[1]![0]
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
    expect(analyzeLeetCodeSubmissionViaRuntime).not.toHaveBeenCalled()
  })

  it('clears the AI analysis when the overlay restart action runs', async () => {
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      autoDetectSolved: true,
    })

    emitCompleteAnalysisSubmission()

    await waitFor(() => {
      expect(result.current.aiAnalysis.status).toBe('ready')
    })

    act(() => {
      result.current.actions.restartLocalSession()
    })

    expect(result.current.aiAnalysis.status).toBe('idle')
  })

  it('clears the AI analysis when the LeetCode page changes', async () => {
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      autoDetectSolved: true,
    })

    emitCompleteAnalysisSubmission()

    await waitFor(() => {
      expect(result.current.aiAnalysis.status).toBe('ready')
    })

    emitNextPage()

    expect(result.current.aiAnalysis.status).toBe('disabled')
  })

  it('excludes AI-authored text from the save review payload', async () => {
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      autoDetectSolved: true,
    })

    emitCompleteAnalysisSubmission()

    await waitFor(() => {
      expect(result.current.aiAnalysis.status).toBe('ready')
    })

    await waitFor(() => {
      expect(saveReviewResultViaRuntime).toHaveBeenCalled()
    })

    const payload = latestSavedReviewRequest()
    expectNoAiLeak(payload)
    expect(payload).not.toHaveProperty('log')
  })

  it('excludes AI-authored text from the update review payload', async () => {
    const { result } = await renderReadySession({
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    })

    emitCompleteAnalysisSubmission()
    await waitFor(() => expect(result.current.aiAnalysis.status).toBe('ready'))

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

function createPendingAnalysis() {
  const analysis = createDeferred<AnalyzeLeetCodeSubmissionResponse>()
  vi.mocked(analyzeLeetCodeSubmissionViaRuntime).mockReturnValueOnce(
    analysis.promise,
  )
  return analysis
}

async function expectPendingAnalysis(result: RenderedOverlaySession['result']) {
  await waitFor(() =>
    expect(analyzeLeetCodeSubmissionViaRuntime).toHaveBeenCalledOnce(),
  )
  expect(result.current.aiAnalysis.status).toBe('pending')
}

async function completePendingAnalysis(
  analysis: ReturnType<typeof createPendingAnalysis>,
  result: RenderedOverlaySession['result'],
) {
  const request = vi.mocked(analyzeLeetCodeSubmissionViaRuntime).mock
    .calls[0]![0]
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
  expect(saveReviewResultViaRuntime).toHaveBeenCalled()

  const request = vi.mocked(saveReviewResultViaRuntime).mock.calls.at(-1)?.[0]

  if (!request) {
    throw new Error('Expected a saved review request.')
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

function expectNoAiLeak(payload: unknown): void {
  expect(JSON.stringify(payload)).not.toContain(AI_PROBE_SUMMARY)
}
