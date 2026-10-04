import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { recommendLeetCodeAssessmentRequestSchema } from '@/features/leetcode-review-assistant'
import type {
  AssessmentRecommendation,
  RecommendLeetCodeAssessmentResponse,
} from '@/features/leetcode-review-assistant'
import type {
  LeetCodeProblemMetadata,
  LeetCodeSubmissionResult,
} from '@/lib/leetcode'

import {
  initialOverlaySessionState,
  type OverlaySessionAction,
  type OverlaySessionState,
} from '../domain'
import type { LeetCodeOverlayContext } from './use-leetcode-page-sync'
import { createSubmissionResultKey } from './submission-result-key'
import {
  useLeetCodeAssessmentRecommendation,
  type UseLeetCodeAssessmentRecommendationOptions,
} from './use-leetcode-assessment-recommendation'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

const sendMessageMock = vi.mocked(sendMessage)

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const baseMetadata: LeetCodeProblemMetadata = {
  location: {
    slug: 'two-sum',
    url: 'https://leetcode.com/problems/two-sum/',
    host: 'leetcode.com',
  },
  title: 'Two Sum',
  frontendId: '1',
  difficulty: 'Easy',
  isPremium: false,
  topics: [
    { name: 'Array', slug: 'array' },
    { name: 'Hash Table', slug: 'hash-table' },
  ],
  source: 'graphql',
  confidence: 'high',
  capturedAt: 1000,
}

const baseContext: LeetCodeOverlayContext = {
  appearance: { theme: 'system', accent: 'indigo' },
  automation: { autoDetectSolved: true },
  problem: {
    problemSlug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    isPremium: false,
  },
  practice: null,
  timing: {
    requireSolveTime: false,
    strictTiming: false,
    timeTargetsMinutes: { easy: 15, medium: 25, hard: 35 },
  },
  nextStep: null,
  aiAssessmentEnabled: true,
  aiAssessmentAvailable: true,
} as unknown as LeetCodeOverlayContext

function makeSubmissionResult(
  overrides: Partial<LeetCodeSubmissionResult> = {},
): LeetCodeSubmissionResult {
  return {
    location: {
      slug: 'two-sum',
      url: 'https://leetcode.com/problems/two-sum/',
      host: 'leetcode.com',
    },
    submissionId: 'sub-1',
    source: 'api',
    status: 'accepted',
    statusText: 'Accepted',
    checkedAt: 1000,
    runtime: '42 ms',
    memory: '12 MB',
    passedTestCount: 10,
    totalTestCount: 10,
    failingTestcase: null,
    errorMessage: null,
    compileError: null,
    runtimeError: null,
    lastTestcase: null,
    codeOutput: null,
    expectedOutput: null,
    stdOutput: null,
    resultCodeSnapshot: {
      code: 'function twoSum(nums, target) { return [] }',
      language: 'typescript',
      source: 'api',
      completeness: 'complete',
      capturedAt: 999,
    },
    ...overrides,
  }
}

function makeRecommendation(
  overrides: Partial<AssessmentRecommendation> = {},
): AssessmentRecommendation {
  return {
    recommendedRating: 'hard',
    confidence: 'medium',
    summary: 'Solved within target.',
    primaryReason: 'Accepted on first try.',
    evidence: ['Status: accepted'],
    complexity: { time: 'O(n)', space: 'O(n)', confidence: 'medium' },
    improvementPoints: [],
    edgeCaseNotes: [],
    shouldUpdateRating: true,
    promptVersion: 'leetcode-assessment-v1',
    ...overrides,
  }
}

function makeReadyResponse(
  recommendation = makeRecommendation(),
  fingerprint = expectedFingerprint(makeSubmissionResult()),
): RecommendLeetCodeAssessmentResponse {
  return {
    status: 'ready',
    recommendation,
    providerMetadata: {
      provider: 'openai',
      model: 'gpt-test',
      durationMs: 100,
    },
    submissionFingerprint: fingerprint,
  }
}

function expectedFingerprint(result: LeetCodeSubmissionResult): string {
  return createSubmissionResultKey(result)
}

type RecordedAction = OverlaySessionAction

function makeOptions(
  overrides: Partial<UseLeetCodeAssessmentRecommendationOptions> = {},
): {
  options: UseLeetCodeAssessmentRecommendationOptions
  actions: RecordedAction[]
} {
  const actions: RecordedAction[] = []
  const dispatch = (action: OverlaySessionAction) => {
    actions.push(action)
  }
  const options: UseLeetCodeAssessmentRecommendationOptions = {
    activeProblemSlug: 'two-sum',
    metadata: baseMetadata,
    submissionResult: null,
    submittedSession: null,
    overlayState: initialOverlaySessionState,
    context: baseContext,
    timing: { elapsedSeconds: 600, targetSeconds: 2100, timerUsed: true },
    aiEnabled: true,
    dispatch,
    ...overrides,
  }
  return { options, actions }
}

beforeEach(() => {
  sendMessageMock.mockReset()
})

describe('useLeetCodeAssessmentRecommendation', () => {
  it('1. fires sendMessage once with the correct fingerprint on an accepted submission', () => {
    const deferred = createDeferred<RecommendLeetCodeAssessmentResponse>()
    sendMessageMock.mockReturnValueOnce(deferred.promise)
    const submissionResult = makeSubmissionResult()
    const fingerprint = expectedFingerprint(submissionResult)

    const { options } = makeOptions({ submissionResult })
    renderHook((props) => useLeetCodeAssessmentRecommendation(props), {
      initialProps: options,
    })

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    const [name, payload] = sendMessageMock.mock.calls[0]!
    expect(name).toBe('genai.recommendLeetCodeAssessment')
    expect(payload).toMatchObject({
      surface: 'content-script',
      problemSlug: 'two-sum',
      submissionFingerprint: fingerprint,
      problem: { slug: 'two-sum', topics: ['array', 'hash-table'] },
      submission: { status: 'accepted' },
    })
  })

  it('sends a schema-valid bounded fingerprint when submitted code is long', () => {
    const deferred = createDeferred<RecommendLeetCodeAssessmentResponse>()
    sendMessageMock.mockReturnValueOnce(deferred.promise)
    const baseline = makeSubmissionResult()
    const longCode = `function solution() { ${'return nums[0];'.repeat(100)} }`
    const submissionResult = makeSubmissionResult({
      resultCodeSnapshot: {
        ...baseline.resultCodeSnapshot,
        code: longCode,
      },
    })

    const { options } = makeOptions({ submissionResult })
    renderHook((props) => useLeetCodeAssessmentRecommendation(props), {
      initialProps: options,
    })

    const [, payload] = sendMessageMock.mock.calls[0]!
    const request = recommendLeetCodeAssessmentRequestSchema.parse(payload)
    expect(request.submissionFingerprint.length).toBeLessThanOrEqual(200)
    expect(request.submissionFingerprint).not.toContain(longCode)
  })

  it('2. fires sendMessage for a failed submission', () => {
    const deferred = createDeferred<RecommendLeetCodeAssessmentResponse>()
    sendMessageMock.mockReturnValueOnce(deferred.promise)
    const submissionResult = makeSubmissionResult({
      status: 'wrong-answer',
      statusText: 'Wrong Answer',
      failingTestcase: '[1]\n2',
      expectedOutput: '[0]',
      codeOutput: '[]',
    })

    const { options } = makeOptions({ submissionResult })
    renderHook((props) => useLeetCodeAssessmentRecommendation(props), {
      initialProps: options,
    })

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    const [, payload] = sendMessageMock.mock.calls[0]!
    expect(payload).toMatchObject({
      submission: {
        status: 'failed',
        failingTestcase: '[1]\n2',
        expectedOutput: '[0]',
        actualOutput: '[]',
      },
    })
  })

  it('3. does not fire when aiEnabled is false', () => {
    const submissionResult = makeSubmissionResult()
    const { options } = makeOptions({ submissionResult, aiEnabled: false })
    renderHook((props) => useLeetCodeAssessmentRecommendation(props), {
      initialProps: options,
    })

    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('4. dedupes duplicate terminal results by fingerprint', () => {
    const deferred = createDeferred<RecommendLeetCodeAssessmentResponse>()
    sendMessageMock.mockReturnValue(deferred.promise)
    const submissionResult = makeSubmissionResult()

    const { options } = makeOptions({ submissionResult })
    const { rerender } = renderHook(
      (props) => useLeetCodeAssessmentRecommendation(props),
      { initialProps: options },
    )

    expect(sendMessageMock).toHaveBeenCalledTimes(1)

    rerender({ ...options, submissionResult: { ...submissionResult } })
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it('5. a new fingerprint after a previous in-flight request fires a fresh sendMessage', () => {
    const firstDeferred = createDeferred<RecommendLeetCodeAssessmentResponse>()
    const secondDeferred = createDeferred<RecommendLeetCodeAssessmentResponse>()
    sendMessageMock
      .mockReturnValueOnce(firstDeferred.promise)
      .mockReturnValueOnce(secondDeferred.promise)

    const first = makeSubmissionResult()
    const { options } = makeOptions({ submissionResult: first })
    const { rerender } = renderHook(
      (props) => useLeetCodeAssessmentRecommendation(props),
      { initialProps: options },
    )

    expect(sendMessageMock).toHaveBeenCalledTimes(1)

    const second = makeSubmissionResult({ submissionId: 'sub-2' })
    rerender({ ...options, submissionResult: second })

    expect(sendMessageMock).toHaveBeenCalledTimes(2)
  })

  it('6. resets to idle when activeProblemSlug changes', async () => {
    const deferred = createDeferred<RecommendLeetCodeAssessmentResponse>()
    sendMessageMock.mockReturnValueOnce(deferred.promise)
    const submissionResult = makeSubmissionResult()

    const { options } = makeOptions({ submissionResult })
    const { result, rerender } = renderHook(
      (props) => useLeetCodeAssessmentRecommendation(props),
      { initialProps: options },
    )

    expect(result.current.state.status).toBe('pending')

    rerender({ ...options, activeProblemSlug: 'three-sum' })
    expect(result.current.state).toEqual({ status: 'idle' })

    await act(async () => {
      deferred.resolve(makeReadyResponse())
      await Promise.resolve()
    })
    expect(result.current.state.status).toBe('idle')
  })

  it('7. reset() aborts in-flight and returns state to idle', async () => {
    const deferred = createDeferred<RecommendLeetCodeAssessmentResponse>()
    sendMessageMock.mockReturnValueOnce(deferred.promise)
    const submissionResult = makeSubmissionResult()

    const { options } = makeOptions({ submissionResult })
    const { result } = renderHook(
      (props) => useLeetCodeAssessmentRecommendation(props),
      { initialProps: options },
    )

    expect(result.current.state.status).toBe('pending')

    act(() => {
      result.current.reset()
    })

    expect(result.current.state).toEqual({ status: 'idle' })

    await act(async () => {
      deferred.resolve(makeReadyResponse())
      await Promise.resolve()
    })
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('8. silently drops a late response after slug changed', async () => {
    const deferred = createDeferred<RecommendLeetCodeAssessmentResponse>()
    sendMessageMock.mockReturnValueOnce(deferred.promise)
    const submissionResult = makeSubmissionResult()

    const { options, actions } = makeOptions({ submissionResult })
    const { result, rerender } = renderHook(
      (props) => useLeetCodeAssessmentRecommendation(props),
      { initialProps: options },
    )

    rerender({ ...options, activeProblemSlug: 'three-sum' })

    await act(async () => {
      deferred.resolve(makeReadyResponse())
      await Promise.resolve()
    })

    expect(result.current.state).toEqual({ status: 'idle' })
    expect(actions).toEqual([])
  })

  it('9. dispatches ai-preselect-rating when ready and conditions are safe', async () => {
    const submissionResult = makeSubmissionResult()
    const ready = makeReadyResponse(
      makeRecommendation({ recommendedRating: 'hard' }),
      expectedFingerprint(submissionResult),
    )
    sendMessageMock.mockResolvedValueOnce(ready)

    const { options, actions } = makeOptions({ submissionResult })
    const { result } = renderHook(
      (props) => useLeetCodeAssessmentRecommendation(props),
      { initialProps: options },
    )

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready')
    })

    expect(actions).toEqual([{ type: 'ai-preselect-rating', rating: 'hard' }])
  })

  it('10. does not dispatch when userTouchedRating is true', async () => {
    const submissionResult = makeSubmissionResult()
    const ready = makeReadyResponse(
      makeRecommendation({ recommendedRating: 'hard' }),
      expectedFingerprint(submissionResult),
    )
    sendMessageMock.mockResolvedValueOnce(ready)

    const touchedState: OverlaySessionState = {
      ...initialOverlaySessionState,
      userTouchedRating: true,
      selectedRating: 'good',
    }
    const { options, actions } = makeOptions({
      submissionResult,
      overlayState: touchedState,
    })
    const { result } = renderHook(
      (props) => useLeetCodeAssessmentRecommendation(props),
      { initialProps: options },
    )

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready')
    })

    expect(actions).toEqual([])
  })

  it('11. does not dispatch when ratingLockReason is set, but state still becomes ready', async () => {
    const submissionResult = makeSubmissionResult()
    const ready = makeReadyResponse(
      makeRecommendation({ recommendedRating: 'easy' }),
      expectedFingerprint(submissionResult),
    )
    sendMessageMock.mockResolvedValueOnce(ready)

    const lockedState: OverlaySessionState = {
      ...initialOverlaySessionState,
      ratingLockReason: 'hard-mode-overtime',
      selectedRating: 'again',
    }
    const { options, actions } = makeOptions({
      submissionResult,
      overlayState: lockedState,
    })
    const { result } = renderHook(
      (props) => useLeetCodeAssessmentRecommendation(props),
      { initialProps: options },
    )

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready')
    })

    expect(actions).toEqual([])
  })

  it('12. surfaces an unavailable response without dispatching', async () => {
    const submissionResult = makeSubmissionResult()
    sendMessageMock.mockResolvedValueOnce({
      status: 'unavailable',
      message: 'AI is not configured.',
      submissionFingerprint: expectedFingerprint(submissionResult),
    })

    const { options, actions } = makeOptions({ submissionResult })
    const { result } = renderHook(
      (props) => useLeetCodeAssessmentRecommendation(props),
      { initialProps: options },
    )

    await waitFor(() => {
      expect(result.current.state.status).toBe('unavailable')
    })
    if (result.current.state.status === 'unavailable') {
      expect(result.current.state.message).toBe('AI is not configured.')
    }
    expect(actions).toEqual([])
  })

  it('13. surfaces an error response with code and message, no dispatch', async () => {
    const submissionResult = makeSubmissionResult()
    sendMessageMock.mockResolvedValueOnce({
      status: 'error',
      code: 'rate-limit',
      message: 'AI is rate-limited.',
      submissionFingerprint: expectedFingerprint(submissionResult),
    })

    const { options, actions } = makeOptions({ submissionResult })
    const { result } = renderHook(
      (props) => useLeetCodeAssessmentRecommendation(props),
      { initialProps: options },
    )

    await waitFor(() => {
      expect(result.current.state.status).toBe('error')
    })
    if (result.current.state.status === 'error') {
      expect(result.current.state.code).toBe('rate-limit')
      expect(result.current.state.message).toBe('AI is rate-limited.')
    }
    expect(actions).toEqual([])
  })
})
