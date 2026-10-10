import { useRef } from 'react'

import {
  evaluateLeetCodeAssessment,
  type LeetCodeAssessmentDecision,
  type AssessmentSubmissionIntent,
} from '@/features/assessment'
import { openDashboardViaRuntime } from '@/features/app-shell'
import {
  overrideLastReviewResultViaRuntime,
  saveReviewResultViaRuntime,
  type PracticeReviewCommandResult,
} from '@/features/practice'
import type { ReviewRating } from '@/lib/fsrs'
import type { LeetCodeSubmissionResult } from '@/lib/leetcode'
import { readErrorMessage } from '@/utils/errors'

import {
  deriveOverlayAssessmentSessionContext,
  hasSubmittedSessionChanges,
  toAssessmentPracticeContext,
  type OverlayExpandedTab,
  type OverlayFeedback,
  type OverlaySessionState,
  type OverlaySubmittedSession,
} from '../domain'
import type {
  OverlayAcceptedCommand,
  OverlaySessionAction,
} from '../domain/overlay-session-state'
import type { OverlayTimerController } from './use-overlay-timer'
import type { LeetCodeOverlayContext } from './use-leetcode-page-sync'

type LatestRef<T> = {
  current: T
}

type AcceptedAssessmentDecision = Extract<
  LeetCodeAssessmentDecision,
  { status: 'accepted' }
>

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
  retryReview: () => Promise<void>
  restartLocalSession: () => void
  selectExpandedTab: (tab: OverlayExpandedTab) => void
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
}: UseOverlayReviewActionsOptions): OverlayReviewActions {
  // React dispatch is deferred. These refs also guard multiple events in one tick.
  const acceptedRef = useRef<OverlayAcceptedCommand | null>(null)
  const inFlightRef = useRef<OverlayAcceptedCommand | null>(null)
  const nextStepCommandRef = useRef<OverlayAcceptedCommand | null>(null)

  function readAcceptedCommand() {
    if (acceptedRef.current?.syncToken !== syncTokenRef.current) {
      acceptedRef.current = null
    }
    const command = acceptedRef.current ?? overlayRef.current.acceptedCommand
    return command?.syncToken === syncTokenRef.current ? command : null
  }

  async function refreshNextStep(command: OverlayAcceptedCommand) {
    const { problemSlug } = command.request
    const saveToken = command.syncToken
    const isCurrentSession = () =>
      syncTokenRef.current === saveToken &&
      nextStepCommandRef.current === command
    dispatch({ type: 'next-step-loading' })

    try {
      const nextContext = await refreshContext(problemSlug, saveToken)

      if (!nextContext || !isCurrentSession()) {
        return
      }

      dispatch({
        type: 'next-step-loaded',
        nextStep: nextContext.nextStep,
      })
    } catch (error) {
      if (!isCurrentSession()) {
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

    await saveAcceptedReview(decision, 'quick-submit')
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

    await saveAcceptedReview(decision, 'selected-rating')
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

    await saveAcceptedReview(decision, 'fail')
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

    return saveAcceptedReview(
      decision,
      result.status === 'accepted' ? 'leetcode-accepted' : 'fail',
    )
  }

  async function saveAcceptedReview(
    decision: AcceptedAssessmentDecision,
    intent: AssessmentSubmissionIntent,
  ) {
    const currentContext = contextRef.current
    const problem = currentContext?.problem
    const currentOverlay = overlayRef.current
    if (
      !currentContext ||
      !problem ||
      currentOverlay.submittedSession ||
      readAcceptedCommand()
    )
      return false
    const generation = currentContext.practice?.generation
    if (!generation) {
      setOverlayError('CogniPace is still syncing this problem.')
      return false
    }
    const command: OverlayAcceptedCommand = {
      operation: 'save',
      syncToken: syncTokenRef.current,
      lockReason: decision.lockReason,
      feedback: formatAssessmentFeedback(decision),
      request: {
        surface: 'content-script',
        commandId: crypto.randomUUID(),
        problemSlug: problem.problemSlug,
        generation: { ...generation },
        reviewedAt: readReviewEventTime(),
        rating: decision.rating,
        reviewMode: 'leetcode',
        elapsedSeconds: decision.elapsedSeconds,
        isCorrect: decision.isCorrect,
        assessmentEvidence: {
          schemaVersion: 1,
          source: 'assessment',
          policyVersion: null,
          submissionIntent: intent,
          reasonCode: decision.reason.code,
          lockReason: decision.lockReason,
          finalRating: decision.rating,
        },
      },
    }
    return executeAcceptedCommand(freezeCommand(command))
  }

  async function updateReview() {
    const currentContext = contextRef.current
    const problem = currentContext?.problem
    const currentOverlay = overlayRef.current
    const submittedSession = currentOverlay.submittedSession
    if (
      !currentContext ||
      !problem ||
      !submittedSession ||
      readAcceptedCommand() ||
      !hasSubmittedSessionChanges(currentOverlay)
    )
      return
    const rating = currentOverlay.ratingLockReason
      ? submittedSession.rating
      : currentOverlay.selectedRating
    // Target and generation are one acknowledged identity. Refetch must not
    // rebase a correction onto a reset or restored lifecycle.
    const generation = submittedSession.generation
    await executeAcceptedCommand(
      freezeCommand({
        operation: 'update',
        syncToken: syncTokenRef.current,
        lockReason: submittedSession.lockReason,
        feedback: { tone: 'success', message: 'Latest review updated.' },
        request: {
          surface: 'content-script',
          commandId: crypto.randomUUID(),
          problemSlug: problem.problemSlug,
          generation: { ...generation },
          targetAttemptId: submittedSession.reviewAttemptId,
          expectedRevision: submittedSession.revision,
          reviewedAt: submittedSession.reviewedAt,
          rating,
          elapsedSeconds: submittedSession.elapsedSeconds,
          isCorrect: rating !== 'again',
          assessmentEvidence: {
            schemaVersion: 1,
            source: 'manual',
            policyVersion: null,
            submissionIntent: 'selected-rating',
            reasonCode: null,
            lockReason: submittedSession.lockReason,
            finalRating: rating,
          },
        },
      }),
    )
  }

  async function retryReview() {
    const command = readAcceptedCommand()
    if (command) await executeAcceptedCommand(command)
  }

  async function executeAcceptedCommand(command: OverlayAcceptedCommand) {
    if (inFlightRef.current?.syncToken === syncTokenRef.current) return false
    if (command.syncToken !== syncTokenRef.current) return false
    acceptedRef.current = command
    inFlightRef.current = command
    nextStepCommandRef.current = null
    dispatch({ type: 'command-started', command })
    const isCurrentCommand = () =>
      syncTokenRef.current === command.syncToken &&
      acceptedRef.current === command
    try {
      const result =
        command.operation === 'save'
          ? await saveReviewResultViaRuntime(command.request)
          : await overrideLastReviewResultViaRuntime(command.request)
      if (!isCurrentCommand()) return false
      if (contextRef.current)
        contextRef.current = { ...contextRef.current, practice: result.current }
      if (result.status === 'conflict') {
        acceptedRef.current = null
        dispatch({ type: 'command-conflicted', message: result.message })
        return false
      }
      if (result.status === 'persistence-pending') {
        dispatch({ type: 'command-pending' })
        return false
      }
      const snapshot = createSubmittedSnapshot(result, command)
      acceptedRef.current = null
      inFlightRef.current = null
      nextStepCommandRef.current = command
      timer.lockAt(snapshot.elapsedSeconds)
      dispatch({
        type:
          command.operation === 'save'
            ? 'submit-succeeded'
            : 'update-succeeded',
        snapshot,
        nextStep: null,
        feedback: command.feedback,
      })
      await refreshNextStep(command)
      return true
    } catch (error) {
      if (!isCurrentCommand()) return false
      dispatch({
        type: 'mutation-failed',
        message: readErrorMessage(
          error,
          'Review could not be confirmed. Retry to confirm it is saved.',
        ),
      })
      return false
    } finally {
      // An old SPA request must never release a newer request's guard.
      if (inFlightRef.current === command) inFlightRef.current = null
    }
  }

  function restartLocalSession() {
    if (readAcceptedCommand()) return
    nextStepCommandRef.current = null
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

  function selectExpandedTab(tab: OverlayExpandedTab) {
    dispatch({ type: 'set-expanded-tab', tab })
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

  return {
    collapse,
    dock,
    expand,
    failReview,
    openSettings,
    pauseTimer: () => {
      if (!readAcceptedCommand()) timer.pause()
    },
    prepareQuickSubmit,
    resetTimer: () => {
      if (!readAcceptedCommand()) timer.reset()
    },
    restartLocalSession,
    restore,
    saveLeetCodeSubmissionResult,
    selectExpandedTab,
    selectRating,
    startTimer: () => {
      if (!readAcceptedCommand()) timer.start()
    },
    submitReview,
    updateReview,
    retryReview,
  }
}

function readReviewEventTime() {
  return new Date().toISOString()
}

function freezeCommand(
  command: OverlayAcceptedCommand,
): OverlayAcceptedCommand {
  Object.freeze(command.request.generation)
  if (command.request.log) Object.freeze(command.request.log)
  if (command.request.assessmentEvidence)
    Object.freeze(command.request.assessmentEvidence)
  Object.freeze(command.request)
  Object.freeze(command.feedback)
  return Object.freeze(command)
}

function createSubmittedSnapshot(
  result: Exclude<PracticeReviewCommandResult, { status: 'conflict' }>,
  command: OverlayAcceptedCommand,
): OverlaySubmittedSession {
  const acknowledgement = result.acknowledgement
  const generation = result.current.generation
  if (!generation)
    throw new Error('Saved review did not include its current generation.')
  return {
    reviewAttemptId: acknowledgement.reviewAttemptId,
    revision: acknowledgement.revision,
    reviewedAt: acknowledgement.reviewedAt,
    generation: { ...generation },
    rating: acknowledgement.rating,
    elapsedSeconds: command.request.elapsedSeconds ?? null,
    isCorrect: command.request.isCorrect ?? acknowledgement.rating !== 'again',
    lockReason: command.lockReason,
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
