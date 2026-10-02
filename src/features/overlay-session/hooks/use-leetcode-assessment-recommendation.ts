import { useCallback, useEffect, useRef, useState } from 'react'

import { sendMessage } from '@/extension/messaging'
import {
  evaluateLeetCodeAssessment,
  type LeetCodeAssessmentDecision,
} from '@/features/assessment'
import type { GenAiProviderMetadata } from '@/features/genai'
import {
  type AssessmentRecommendation,
  type AssessmentRecommendationProblem,
  type AssessmentRecommendationSubmission,
  type AssessmentRecommendationTiming,
  type RecommendLeetCodeAssessmentErrorCode,
  type RecommendLeetCodeAssessmentRequest,
  type RecommendLeetCodeAssessmentResponse,
} from '@/features/leetcode-review-assistant'
import type {
  LeetCodeProblemMetadata,
  LeetCodeSubmissionResult,
} from '@/lib/leetcode'

import {
  deriveOverlayAssessmentSessionContext,
  toAssessmentPracticeContext,
  type OverlaySessionAction,
  type OverlaySessionState,
  type OverlaySubmittedSession,
} from '../domain'
import type { LeetCodeOverlayContext } from './use-leetcode-page-sync'
import { createSubmissionResultKey } from './submission-result-key'

export type AssessmentRecommendationState =
  | { status: 'idle' }
  | { status: 'pending'; fingerprint: string }
  | {
      status: 'ready'
      fingerprint: string
      recommendation: AssessmentRecommendation
      providerMetadata: GenAiProviderMetadata
    }
  | { status: 'unavailable'; fingerprint: string; message: string }
  | {
      status: 'error'
      fingerprint: string
      code: RecommendLeetCodeAssessmentErrorCode
      message: string
    }

export type UseLeetCodeAssessmentRecommendationOptions = {
  activeProblemSlug: string | null
  metadata: LeetCodeProblemMetadata | null
  submissionResult: LeetCodeSubmissionResult | null
  submittedSession: OverlaySubmittedSession | null
  overlayState: OverlaySessionState
  context: LeetCodeOverlayContext | null
  timing: {
    elapsedSeconds: number
    targetSeconds: number
    timerUsed: boolean
  }
  aiEnabled: boolean
  dispatch: (action: OverlaySessionAction) => void
}

export type UseLeetCodeAssessmentRecommendationResult = {
  state: AssessmentRecommendationState
  reset: () => void
}

const IDLE_STATE: AssessmentRecommendationState = { status: 'idle' }

export function useLeetCodeAssessmentRecommendation(
  options: UseLeetCodeAssessmentRecommendationOptions,
): UseLeetCodeAssessmentRecommendationResult {
  const {
    activeProblemSlug,
    metadata,
    submissionResult,
    submittedSession,
    overlayState,
    context,
    timing,
    aiEnabled,
    dispatch,
  } = options

  const [state, setState] = useState<AssessmentRecommendationState>(IDLE_STATE)

  const dispatchRef = useRef(dispatch)
  const overlayStateRef = useRef(overlayState)
  const contextRef = useRef(context)
  const metadataRef = useRef(metadata)
  const submittedSessionRef = useRef(submittedSession)
  const timingRef = useRef(timing)
  const aiEnabledRef = useRef(aiEnabled)
  const activeProblemSlugRef = useRef(activeProblemSlug)

  const handledFingerprintsRef = useRef<Set<string>>(new Set())
  const pendingFingerprintRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    dispatchRef.current = dispatch
  }, [dispatch])
  useEffect(() => {
    overlayStateRef.current = overlayState
  }, [overlayState])
  useEffect(() => {
    contextRef.current = context
  }, [context])
  useEffect(() => {
    metadataRef.current = metadata
  }, [metadata])
  useEffect(() => {
    submittedSessionRef.current = submittedSession
  }, [submittedSession])
  useEffect(() => {
    timingRef.current = timing
  }, [timing])
  useEffect(() => {
    aiEnabledRef.current = aiEnabled
  }, [aiEnabled])
  useEffect(() => {
    activeProblemSlugRef.current = activeProblemSlug
  }, [activeProblemSlug])

  const teardown = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    pendingFingerprintRef.current = null
    handledFingerprintsRef.current.clear()
    setState(IDLE_STATE)
  }, [])

  const [trackedSlug, setTrackedSlug] = useState(activeProblemSlug)
  if (activeProblemSlug !== trackedSlug) {
    setTrackedSlug(activeProblemSlug)
    setState(IDLE_STATE)
  }

  useEffect(() => {
    const handledFingerprints = handledFingerprintsRef.current
    return () => {
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      pendingFingerprintRef.current = null
      handledFingerprints.clear()
    }
  }, [activeProblemSlug])

  useEffect(() => {
    if (!aiEnabled || !activeProblemSlug || !submissionResult) {
      return
    }

    if (submissionResult.location.slug !== activeProblemSlug) {
      return
    }

    const currentContext = contextRef.current
    const currentMetadata = metadataRef.current
    const problemSummary = currentContext?.problem ?? null

    if (!currentContext || !currentMetadata || !problemSummary) {
      return
    }

    const fingerprint = createSubmissionResultKey(submissionResult)

    if (
      handledFingerprintsRef.current.has(fingerprint) ||
      pendingFingerprintRef.current === fingerprint
    ) {
      return
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    pendingFingerprintRef.current = fingerprint
    handledFingerprintsRef.current.add(fingerprint)
    setState({ status: 'pending', fingerprint })

    const submission = buildSubmissionPayload(submissionResult)
    const sessionContext = deriveOverlayAssessmentSessionContext({
      context: currentContext,
      submissionSource: 'leetcode-watcher',
      timerUsed: timingRef.current.timerUsed,
    })
    const decision = buildDeterministicDecision({
      submissionResult,
      problemDifficulty: problemSummary.difficulty,
      timingSettings: currentContext.timing,
      elapsedSeconds: timingRef.current.elapsedSeconds,
      sessionContext,
    })

    const request: RecommendLeetCodeAssessmentRequest = {
      surface: 'content-script',
      problemSlug: activeProblemSlug,
      submissionFingerprint: fingerprint,
      problem: buildProblemPayload(problemSummary, currentMetadata),
      submission,
      timing: buildTimingPayload(timingRef.current, submissionResult),
      deterministicDecision: decision,
      sessionContext,
    }

    void sendMessage('genai.recommendLeetCodeAssessment', request).then(
      (response: RecommendLeetCodeAssessmentResponse) => {
        if (controller.signal.aborted) {
          return
        }
        if (pendingFingerprintRef.current !== fingerprint) {
          return
        }
        if (activeProblemSlugRef.current !== activeProblemSlug) {
          return
        }
        pendingFingerprintRef.current = null
        applyResponse(response, fingerprint)
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        if (pendingFingerprintRef.current !== fingerprint) {
          return
        }
        if (activeProblemSlugRef.current !== activeProblemSlug) {
          return
        }
        pendingFingerprintRef.current = null
        setState({
          status: 'error',
          fingerprint,
          code: 'unknown',
          message: error instanceof Error ? error.message : String(error),
        })
      },
    )

    function applyResponse(
      response: RecommendLeetCodeAssessmentResponse,
      currentFingerprint: string,
    ): void {
      if (response.status === 'ready') {
        setState({
          status: 'ready',
          fingerprint: currentFingerprint,
          recommendation: response.recommendation,
          providerMetadata: response.providerMetadata,
        })
        maybePreselectRating(response.recommendation.recommendedRating)
        return
      }

      if (response.status === 'unavailable') {
        setState({
          status: 'unavailable',
          fingerprint: currentFingerprint,
          message: response.message,
        })
        return
      }

      setState({
        status: 'error',
        fingerprint: currentFingerprint,
        code: response.code,
        message: response.message,
      })
    }

    function maybePreselectRating(
      rating: AssessmentRecommendation['recommendedRating'],
    ): void {
      const overlay = overlayStateRef.current
      if (overlay.ratingLockReason) return
      if (overlay.userTouchedRating) return
      if (overlay.selectedRating === rating) return

      dispatchRef.current({ type: 'ai-preselect-rating', rating })
    }
  }, [activeProblemSlug, aiEnabled, submissionResult])

  return { state, reset: teardown }
}

function buildProblemPayload(
  summary: NonNullable<LeetCodeOverlayContext['problem']>,
  metadata: LeetCodeProblemMetadata,
): AssessmentRecommendationProblem {
  const topics = metadata.topics
    .map((topic) => topic.slug ?? topic.name)
    .filter((value): value is string => Boolean(value))

  return {
    slug: summary.problemSlug,
    title: summary.title,
    difficulty: summary.difficulty,
    topics,
  }
}

function buildSubmissionPayload(
  result: LeetCodeSubmissionResult,
): AssessmentRecommendationSubmission {
  const codeSnapshot = result.resultCodeSnapshot

  if (result.status === 'accepted') {
    const accepted: Extract<
      AssessmentRecommendationSubmission,
      { status: 'accepted' }
    > = { status: 'accepted' }
    if (codeSnapshot.code !== null) accepted.code = codeSnapshot.code
    if (codeSnapshot.language !== null)
      accepted.language = codeSnapshot.language
    if (result.runtime !== null) accepted.runtime = result.runtime
    if (result.memory !== null) accepted.memory = result.memory
    if (result.passedTestCount !== null)
      accepted.passedTestCount = result.passedTestCount
    if (result.totalTestCount !== null)
      accepted.totalTestCount = result.totalTestCount
    return accepted
  }

  const failed: Extract<
    AssessmentRecommendationSubmission,
    { status: 'failed' }
  > = { status: 'failed' }
  if (codeSnapshot.code !== null) failed.code = codeSnapshot.code
  if (codeSnapshot.language !== null) failed.language = codeSnapshot.language
  if (result.failingTestcase !== null)
    failed.failingTestcase = result.failingTestcase
  if (result.expectedOutput !== null)
    failed.expectedOutput = result.expectedOutput
  if (result.codeOutput !== null) failed.actualOutput = result.codeOutput
  const errorMessage =
    result.errorMessage ?? result.runtimeError ?? result.compileError
  if (errorMessage !== null) failed.errorMessage = errorMessage
  if (result.passedTestCount !== null)
    failed.passedTestCount = result.passedTestCount
  if (result.totalTestCount !== null)
    failed.totalTestCount = result.totalTestCount
  return failed
}

function buildTimingPayload(
  timing: {
    elapsedSeconds: number
    targetSeconds: number
    timerUsed: boolean
  },
  submissionResult: LeetCodeSubmissionResult | null,
): AssessmentRecommendationTiming {
  return {
    elapsedSeconds: submissionResult ? timing.elapsedSeconds : null,
    targetSeconds: timing.targetSeconds,
    timerUsed: timing.timerUsed,
  }
}

function buildDeterministicDecision({
  submissionResult,
  problemDifficulty,
  timingSettings,
  elapsedSeconds,
  sessionContext,
}: {
  submissionResult: LeetCodeSubmissionResult
  problemDifficulty: NonNullable<
    LeetCodeOverlayContext['problem']
  >['difficulty']
  timingSettings: LeetCodeOverlayContext['timing']
  elapsedSeconds: number
  sessionContext: ReturnType<typeof deriveOverlayAssessmentSessionContext>
}): LeetCodeAssessmentDecision {
  const practiceContext = toAssessmentPracticeContext(sessionContext)
  return evaluateLeetCodeAssessment(
    submissionResult.status === 'accepted'
      ? {
          intent: 'leetcode-accepted',
          difficulty: problemDifficulty,
          timing: timingSettings,
          elapsedSeconds,
          timerUsed: sessionContext.timerUsed,
          practiceContext,
        }
      : {
          intent: 'fail',
          difficulty: problemDifficulty,
          timing: timingSettings,
          elapsedSeconds,
          timerUsed: sessionContext.timerUsed,
          practiceContext,
        },
  )
}
