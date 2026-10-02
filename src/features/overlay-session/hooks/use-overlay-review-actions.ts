import { useRef } from 'react'

import {
  evaluateLeetCodeAssessment,
  type LeetCodeAssessmentDecision,
} from '@/features/assessment'
import { openDashboardViaRuntime } from '@/features/app-shell'
import {
  recommendLeetCodeAssessmentViaRuntime,
  type RecommendLeetCodeAssessmentRequest,
} from '@/features/leetcode-review-assistant'
import {
  overrideLastReviewResultViaRuntime,
  saveReviewResultViaRuntime,
  type SerializedPracticeDetails,
} from '@/features/practice'
import type { ReviewRating } from '@/lib/fsrs'
import type { LeetCodeSubmissionResult } from '@/lib/leetcode'
import { readErrorMessage } from '@/utils/errors'

import {
  deriveOverlayAssessmentSessionContext,
  hasSubmittedSessionChanges,
  toAssessmentPracticeContext,
  type OverlayFeedback,
  type OverlaySessionState,
  type OverlaySubmittedSession,
} from '../domain'
import type { OverlaySessionAction } from '../domain/overlay-session-state'
import type { OverlayTimerController } from './use-overlay-timer'
import type { LeetCodeOverlayContext } from './use-leetcode-page-sync'
import type { UseLeetCodeAssessmentRecommendationResult } from './use-leetcode-assessment-recommendation'

type LatestRef<T> = {
  current: T
}

type AcceptedAssessmentDecision = Extract<
  LeetCodeAssessmentDecision,
  { status: 'accepted' }
>

type SaveAssessmentInput = {
  decision: AcceptedAssessmentDecision
  session: ReturnType<typeof deriveOverlayAssessmentSessionContext>
  submission: RecommendLeetCodeAssessmentRequest['submission']
  submissionResult?: LeetCodeSubmissionResult
}

type UseOverlayReviewActionsOptions = {
  contextRef: LatestRef<LeetCodeOverlayContext | null>
  dispatch: (action: OverlaySessionAction) => void
  overlayRef: LatestRef<OverlaySessionState>
  refreshContext: (
    problemSlug: string,
    expectedSyncToken: number,
  ) => Promise<LeetCodeOverlayContext | null>
  syncTokenRef: LatestRef<number>
  timer: OverlayTimerController
  onRestart?: () => void
  requestSubmissionRecommendation: UseLeetCodeAssessmentRecommendationResult['requestRecommendation']
}

export type OverlayReviewActions = {
  collapse: () => void
  dock: () => void
  expand: () => void
  restore: () => void
  startTimer: () => void
  pauseTimer: () => void
  resetTimer: () => void
  prepareQuickSubmit: () => Promise<void>
  submitReview: () => Promise<void>
  failReview: () => Promise<void>
  saveLeetCodeSubmissionResult: (
    result: LeetCodeSubmissionResult,
  ) => Promise<boolean>
  updateReview: () => Promise<void>
  restartLocalSession: () => void
  selectRating: (rating: ReviewRating) => void
  openSettings: () => void
}

export function useOverlayReviewActions({
  contextRef,
  dispatch,
  overlayRef,
  refreshContext,
  syncTokenRef,
  timer,
  onRestart,
  requestSubmissionRecommendation,
}: UseOverlayReviewActionsOptions): OverlayReviewActions {
  const sessionGenerationRef = useRef(0)
  async function refreshNextStep(problemSlug: string, saveToken: number) {
    dispatch({ type: 'next-step-loading' })

    try {
      const nextContext = await refreshContext(problemSlug, saveToken)

      if (!nextContext) {
        return
      }

      dispatch({
        type: 'next-step-loaded',
        nextStep: nextContext.nextStep,
      })
    } catch (error) {
      if (syncTokenRef.current !== saveToken) {
        return
      }

      dispatch({
        type: 'next-step-error',
        message:
          error instanceof Error
            ? `Review saved. ${error.message}`
            : 'Review saved, but the next recommendation did not load.',
      })
    }
  }

  function collapse() {
    dispatch({ type: 'set-visual-mode', visualMode: 'collapsed' })
  }

  function dock() {
    dispatch({ type: 'set-visual-mode', visualMode: 'docked' })
  }

  function expand() {
    dispatch({ type: 'set-visual-mode', visualMode: 'expanded' })
  }

  function restore() {
    dispatch({ type: 'set-visual-mode', visualMode: 'collapsed' })
  }

  async function prepareQuickSubmit() {
    const currentContext = contextRef.current
    const problem = currentContext?.problem

    if (!problem) {
      setOverlayError('CogniPace is still syncing this problem.')
      return
    }

    const session = deriveOverlayAssessmentSessionContext({
      context: currentContext,
      submissionSource: 'collapsed-quick',
      timerUsed: timer.hasStarted(),
    })

    const decision = evaluateLeetCodeAssessment({
      intent: 'quick-submit',
      difficulty: problem.difficulty,
      timing: currentContext.timing,
      elapsedSeconds: timer.readElapsedSeconds(),
      timerUsed: session.timerUsed,
      practiceContext: toAssessmentPracticeContext(session),
    })

    if (decision.status === 'blocked') {
      setOverlayError('Review can be submitted without solve time.')
      return
    }

    await saveAcceptedReview({
      decision,
      session,
      submission: { status: 'no-submission' },
    })
  }

  async function submitReview() {
    const currentContext = contextRef.current
    const problem = currentContext?.problem

    if (!currentContext || !problem) {
      setOverlayError('CogniPace is still syncing this problem.')
      return
    }

    const session = deriveOverlayAssessmentSessionContext({
      context: currentContext,
      submissionSource: 'manual-overlay',
      timerUsed: timer.hasStarted(),
    })

    const decision = evaluateLeetCodeAssessment({
      intent: 'selected-rating',
      difficulty: problem.difficulty,
      timing: currentContext.timing,
      selectedRating: overlayRef.current.selectedRating,
      elapsedSeconds: timer.readElapsedSeconds(),
      timerUsed: session.timerUsed,
      practiceContext: toAssessmentPracticeContext(session),
    })

    if (decision.status === 'blocked') {
      setOverlayError('Review can be submitted without solve time.')
      return
    }

    await saveAcceptedReview({
      decision,
      session,
      submission: { status: 'no-submission' },
    })
  }

  async function failReview() {
    const currentContext = contextRef.current
    const problem = currentContext?.problem

    if (!currentContext || !problem) {
      setOverlayError('CogniPace is still syncing this problem.')
      return
    }

    const session = deriveOverlayAssessmentSessionContext({
      context: currentContext,
      submissionSource: 'manual-overlay',
      timerUsed: timer.hasStarted(),
    })

    const decision = evaluateLeetCodeAssessment({
      intent: 'fail',
      difficulty: problem.difficulty,
      timing: currentContext.timing,
      elapsedSeconds: timer.readElapsedSeconds(),
      timerUsed: session.timerUsed,
      practiceContext: toAssessmentPracticeContext(session),
    })

    if (decision.status === 'blocked') {
      setOverlayError('Review can be submitted without solve time.')
      return
    }

    await saveAcceptedReview({
      decision,
      session,
      submission: { status: 'no-submission' },
    })
  }

  async function saveLeetCodeSubmissionResult(
    result: LeetCodeSubmissionResult,
  ) {
    const currentContext = contextRef.current
    const problem = currentContext?.problem

    if (!currentContext || !problem) {
      setOverlayError('CogniPace is still syncing this problem.')
      return false
    }

    const session = deriveOverlayAssessmentSessionContext({
      context: currentContext,
      submissionSource: 'leetcode-watcher',
      timerUsed: timer.hasStarted(),
    })
    const practiceContext = toAssessmentPracticeContext(session)

    const decision = evaluateLeetCodeAssessment(
      result.status === 'accepted'
        ? {
            intent: 'leetcode-accepted',
            difficulty: problem.difficulty,
            timing: currentContext.timing,
            elapsedSeconds: timer.readElapsedSeconds(),
            timerUsed: session.timerUsed,
            practiceContext,
          }
        : {
            intent: 'fail',
            difficulty: problem.difficulty,
            timing: currentContext.timing,
            elapsedSeconds: timer.readElapsedSeconds(),
            timerUsed: session.timerUsed,
            practiceContext,
          },
    )

    if (decision.status === 'blocked') {
      setOverlayError('Review can be submitted without solve time.')
      return false
    }

    return saveAcceptedReview({
      decision,
      session,
      submission: toAssessmentSubmission(result),
      submissionResult: result,
    })
  }

  async function saveAcceptedReview(input: SaveAssessmentInput) {
    const saveToken = syncTokenRef.current
    const saveGeneration = sessionGenerationRef.current
    const currentContext = contextRef.current
    const problem = currentContext?.problem
    const currentOverlay = overlayRef.current

    if (!currentContext || !problem || currentOverlay.submittedSession) {
      return false
    }

    dispatch({ type: 'save-started' })

    try {
      const decision = await maybeApplyAiRecommendation(input)
      if (
        syncTokenRef.current !== saveToken ||
        sessionGenerationRef.current !== saveGeneration
      ) {
        return false
      }
      if (!decision) {
        dispatch({ type: 'save-cancelled' })
        return false
      }
      const details = await saveReviewResultViaRuntime({
        surface: 'content-script',
        problemSlug: problem.problemSlug,
        rating: decision.rating,
        reviewMode: 'leetcode',
        elapsedSeconds: decision.elapsedSeconds,
        isCorrect: decision.isCorrect,
      })

      if (
        syncTokenRef.current !== saveToken ||
        sessionGenerationRef.current !== saveGeneration
      ) {
        return false
      }

      const snapshot = createSubmittedSnapshotFromPracticeDetails(
        details,
        decision.lockReason,
      )
      timer.lockAt(snapshot.elapsedSeconds)
      dispatch({
        type: 'submit-succeeded',
        snapshot,
        nextStep: null,
        feedback: formatAssessmentFeedback(decision),
      })
      await refreshNextStep(problem.problemSlug, saveToken)
      return true
    } catch (error) {
      if (
        syncTokenRef.current !== saveToken ||
        sessionGenerationRef.current !== saveGeneration
      ) {
        return false
      }

      dispatch({
        type: 'mutation-failed',
        message: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  async function updateReview() {
    const saveToken = syncTokenRef.current
    const currentContext = contextRef.current
    const problem = currentContext?.problem
    const currentOverlay = overlayRef.current
    const submittedSession = currentOverlay.submittedSession

    if (
      !currentContext ||
      !problem ||
      !submittedSession ||
      !hasSubmittedSessionChanges(currentOverlay)
    ) {
      return
    }

    const rating = currentOverlay.ratingLockReason
      ? submittedSession.rating
      : currentOverlay.selectedRating

    dispatch({ type: 'update-started' })

    try {
      const details = await overrideLastReviewResultViaRuntime({
        surface: 'content-script',
        problemSlug: problem.problemSlug,
        rating,
        elapsedSeconds: submittedSession.elapsedSeconds,
        isCorrect: rating !== 'again',
      })

      if (syncTokenRef.current !== saveToken) {
        return
      }

      const snapshot = createSubmittedSnapshotFromPracticeDetails(
        details,
        submittedSession.lockReason,
      )
      dispatch({
        type: 'update-succeeded',
        snapshot,
        nextStep: null,
        feedback: {
          tone: 'success',
          message: 'Latest review updated.',
        },
      })
      await refreshNextStep(problem.problemSlug, saveToken)
    } catch (error) {
      if (syncTokenRef.current !== saveToken) {
        return
      }

      dispatch({
        type: 'mutation-failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function restartLocalSession() {
    sessionGenerationRef.current += 1
    timer.reset()
    const currentPractice = contextRef.current?.practice
    const selectedRating =
      currentPractice?.latestAttempt?.rating ??
      currentPractice?.practice?.lastRating ??
      'good'

    dispatch({
      type: 'restart-local-session',
      selectedRating,
    })
    onRestart?.()
  }

  function selectRating(rating: ReviewRating) {
    dispatch({ type: 'set-selected-rating', rating })
  }

  function openSettings() {
    void openDashboardSettings()
  }

  async function openDashboardSettings() {
    try {
      await openDashboardViaRuntime('settings')
    } catch (error) {
      setOverlayError(
        readErrorMessage(error, 'Failed to open dashboard settings.'),
      )
    }
  }

  function setOverlayError(message: string) {
    dispatch({
      type: 'set-feedback',
      feedback: {
        tone: 'danger',
        message,
      },
    })
  }

  async function maybeApplyAiRecommendation({
    decision,
    session,
    submission,
    submissionResult,
  }: SaveAssessmentInput): Promise<AcceptedAssessmentDecision | null> {
    const currentContext = contextRef.current
    const problem = currentContext?.problem

    if (
      !currentContext?.aiAssessmentAvailable ||
      !problem ||
      !decision.isCorrect ||
      decision.lockReason !== null
    ) {
      return decision
    }

    let response: Awaited<
      ReturnType<typeof recommendLeetCodeAssessmentViaRuntime>
    > | null
    try {
      response = submissionResult
        ? await requestSubmissionRecommendation(submissionResult)
        : await recommendLeetCodeAssessmentViaRuntime({
            surface: 'content-script',
            problemSlug: problem.problemSlug,
            submissionFingerprint: createSubmissionFingerprint({
              problemSlug: problem.problemSlug,
              decision,
              session,
              submission,
            }),
            problem: {
              slug: problem.problemSlug,
              title: problem.title,
              difficulty: problem.difficulty,
              topics: [],
            },
            submission,
            timing: {
              elapsedSeconds: decision.elapsedSeconds,
              targetSeconds: decision.targetSeconds,
              timerUsed: session.timerUsed,
            },
            deterministicDecision: decision,
            sessionContext: session,
          })
    } catch {
      response = null
    }

    if (submissionResult && response === null) return null

    if (overlayRef.current.userTouchedRating) {
      const rating = overlayRef.current.selectedRating
      return { ...decision, rating, isCorrect: rating !== 'again' }
    }

    if (
      response?.status !== 'ready' ||
      !response.recommendation.shouldUpdateRating ||
      response.recommendation.recommendedRating === decision.rating
    ) {
      return decision
    }

    const recommendedRating = response.recommendation.recommendedRating

    return {
      ...decision,
      rating: recommendedRating,
      isCorrect: recommendedRating !== 'again',
    }
  }

  return {
    collapse,
    dock,
    expand,
    failReview,
    openSettings,
    pauseTimer: timer.pause,
    prepareQuickSubmit,
    resetTimer: timer.reset,
    restartLocalSession,
    restore,
    saveLeetCodeSubmissionResult,
    selectRating,
    startTimer: timer.start,
    submitReview,
    updateReview,
  }
}

function toAssessmentSubmission(
  result: LeetCodeSubmissionResult,
): RecommendLeetCodeAssessmentRequest['submission'] {
  const common = {
    code: result.resultCodeSnapshot?.code ?? undefined,
    language: result.resultCodeSnapshot?.language ?? undefined,
    passedTestCount: result.passedTestCount ?? undefined,
    totalTestCount: result.totalTestCount ?? undefined,
  }

  if (result.status === 'accepted') {
    return {
      status: 'accepted',
      ...common,
      runtime: result.runtime ?? undefined,
      memory: result.memory ?? undefined,
    }
  }

  return {
    status: 'failed',
    ...common,
    failingTestcase: result.failingTestcase ?? result.lastTestcase ?? undefined,
    expectedOutput: result.expectedOutput ?? undefined,
    actualOutput: result.codeOutput ?? undefined,
    errorMessage:
      result.errorMessage ??
      result.compileError ??
      result.runtimeError ??
      undefined,
  }
}

function createSubmissionFingerprint(input: {
  problemSlug: string
  decision: AcceptedAssessmentDecision
  session: ReturnType<typeof deriveOverlayAssessmentSessionContext>
  submission: RecommendLeetCodeAssessmentRequest['submission']
}) {
  return [
    input.problemSlug,
    input.session.submissionSource,
    input.decision.rating,
    input.decision.elapsedSeconds ?? 'untimed',
    input.submission.status,
  ].join(':')
}

function createSubmittedSnapshotFromPracticeDetails(
  details: SerializedPracticeDetails,
  lockReason: OverlaySubmittedSession['lockReason'],
): OverlaySubmittedSession {
  const latestAttempt = details.latestAttempt

  if (!latestAttempt) {
    throw new Error('Saved review did not include the latest attempt.')
  }

  return {
    rating: latestAttempt.rating,
    elapsedSeconds: latestAttempt.elapsedSeconds,
    isCorrect: latestAttempt.isCorrect ?? latestAttempt.rating !== 'again',
    lockReason,
  }
}

function formatAssessmentFeedback(
  decision: AcceptedAssessmentDecision,
): OverlayFeedback {
  if (decision.lockReason === 'hard-mode-overtime') {
    return {
      tone: 'warning',
      message: 'Strict timing saved this overtime attempt as Again.',
    }
  }

  if (decision.lockReason === 'failed') {
    return {
      tone: 'warning',
      message: 'Failed attempt saved as Again.',
    }
  }

  if (
    decision.reason.code === 'leetcode-easy-fast' ||
    decision.reason.code === 'quick-easy-fast'
  ) {
    return {
      tone: 'success',
      message: 'Fast solve — saved as Easy.',
    }
  }

  return {
    tone: 'success',
    message: 'Review saved.',
  }
}
