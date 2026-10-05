import { useCallback, useEffect, useReducer, useRef } from 'react'

import { useAiHintConnection } from '@/features/genai'
import { getLeetCodeSolveTimeTargetSeconds } from '@/features/assessment'
import type {
  LeetCodeProblemLocation,
  LeetCodeProblemMetadata,
} from '@/lib/leetcode'

import {
  initialOverlaySessionState,
  overlaySessionReducer,
  type OverlaySubmittedSession,
  type OverlaySessionState,
} from '../domain'
import {
  useLeetCodeCodeAnalysis,
  type CodeAnalysisState,
} from './use-leetcode-code-analysis'
import {
  useLeetCodeCodeHints,
  type OverlayHintState,
} from './use-leetcode-code-hints'
import {
  useLeetCodePageSync,
  type LeetCodeOverlayContext,
  type OverlaySyncStatus,
} from './use-leetcode-page-sync'
import {
  useOverlayReviewActions,
  type OverlayReviewActions,
} from './use-overlay-review-actions'
import { useLeetCodeSubmissionAutomation } from './use-leetcode-submission-automation'
import { useOverlayTimer, type OverlayTimerStatus } from './use-overlay-timer'

export type LeetCodeOverlaySession = {
  location: LeetCodeProblemLocation | null
  metadata: LeetCodeProblemMetadata | null
  context: LeetCodeOverlayContext | null
  status: OverlaySyncStatus
  feedback: string | null
  overlay: OverlaySessionState
  timer: {
    elapsedSeconds: number
    targetSeconds: number
    isOverTarget: boolean
    status: OverlayTimerStatus
  }
  actions: OverlayReviewActions & {
    toggleHints: () => void
    revealNextHint: () => void
    retryHints: () => void
  }
  hints: OverlayHintState
  aiAnalysis: CodeAnalysisState
  retryAiAnalysis: () => void
}

export function useLeetCodeOverlaySession(): LeetCodeOverlaySession {
  const timer = useOverlayTimer()
  const [overlay, dispatch] = useReducer(
    overlaySessionReducer,
    initialOverlaySessionState,
  )
  const latestOverlayRef = useRef(overlay)
  const timerResetRef = useRef(timer.reset)

  useEffect(() => {
    latestOverlayRef.current = overlay
  }, [overlay])

  useEffect(() => {
    timerResetRef.current = timer.reset
  }, [timer.reset])

  const handleProblemLoaded = useCallback(
    (nextContext: LeetCodeOverlayContext) => {
      const problem = nextContext.problem
      if (!problem) {
        return
      }

      dispatch({
        type: 'problem-loaded',
        problemSlug: problem.problemSlug,
        selectedRating:
          nextContext.practice?.latestAttempt?.rating ??
          nextContext.practice?.practice?.lastRating ??
          'good',
      })
    },
    [],
  )
  const handleProblemContextRefreshed = useCallback(
    (nextContext: LeetCodeOverlayContext) => {
      const problem = nextContext.problem
      if (!problem) {
        return
      }

      const submittedSession = latestOverlayRef.current.submittedSession

      dispatch({
        type: 'problem-context-refreshed',
        problemSlug: problem.problemSlug,
        selectedRating:
          nextContext.practice?.latestAttempt?.rating ??
          nextContext.practice?.practice?.lastRating ??
          'good',
        submittedSession: submittedSession
          ? createSubmittedSessionFromContext(
              nextContext,
              submittedSession.lockReason,
            )
          : null,
      })
    },
    [],
  )

  const handlePageChanged = useCallback(() => {
    timerResetRef.current()
    dispatch({ type: 'page-changed' })
  }, [])

  const pageSync = useLeetCodePageSync({
    activeProblemSlug: overlay.activeProblemSlug,
    onPageChanged: handlePageChanged,
    onProblemContextRefreshed: handleProblemContextRefreshed,
    onProblemLoaded: handleProblemLoaded,
  })

  const analysis = useLeetCodeCodeAnalysis({
    activeSlug: overlay.activeProblemSlug,
    capture: pageSync.capture,
    enabled: pageSync.context?.aiAssessmentEnabled ?? false,
    available: pageSync.context?.aiAssessmentAvailable ?? false,
  })

  const hintConnection = useAiHintConnection(Boolean(pageSync.location))
  const hints = useLeetCodeCodeHints({
    activeSlug: overlay.activeProblemSlug,
    capture: pageSync.capture,
    connection: hintConnection.status,
    connectionError: hintConnection.isError,
    readCapture: pageSync.readCapture,
    readSyncToken: () => pageSync.syncTokenRef.current,
    publishCapture: pageSync.publishHintCapture,
    readConnection: hintConnection.readStatus,
    refreshConnection: hintConnection.refresh,
  })

  const actions = useOverlayReviewActions({
    contextRef: pageSync.latestContextRef,
    dispatch,
    overlayRef: latestOverlayRef,
    refreshContext: pageSync.refreshContext,
    syncTokenRef: pageSync.syncTokenRef,
    timer,
    onRestart: () => {
      analysis.reset()
      hints.reset()
    },
  })

  useLeetCodeSubmissionAutomation({
    activeProblemSlug: overlay.activeProblemSlug,
    autoDetectSolved: pageSync.context?.automation.autoDetectSolved ?? false,
    problemSlug: pageSync.context?.problem?.problemSlug ?? null,
    reviewStatus: overlay.reviewStatus,
    saveLeetCodeSubmissionResult: actions.saveLeetCodeSubmissionResult,
    startTimer: timer.start,
    submittedSession: overlay.submittedSession,
    submissionResult: pageSync.submission.result,
  })

  const targetSeconds = getTargetSeconds(pageSync.context)
  const elapsedSeconds = timer.elapsedSeconds

  return {
    location: pageSync.location,
    metadata: pageSync.metadata,
    context: pageSync.context,
    status: pageSync.status,
    feedback: pageSync.feedback,
    overlay,
    timer: {
      elapsedSeconds,
      targetSeconds,
      isOverTarget: elapsedSeconds > targetSeconds,
      status: timer.status,
    },
    actions: {
      ...actions,
      toggleHints: hints.toggle,
      revealNextHint: hints.revealNext,
      retryHints: hints.retry,
    },
    hints: hints.state,
    aiAnalysis: analysis.state,
    retryAiAnalysis: analysis.retry,
  }
}

function getTargetSeconds(context: LeetCodeOverlayContext | null) {
  const problem = context?.problem

  if (!problem) {
    return 0
  }

  return getLeetCodeSolveTimeTargetSeconds(problem.difficulty, context.timing)
}

function createSubmittedSessionFromContext(
  context: LeetCodeOverlayContext,
  lockReason: OverlaySubmittedSession['lockReason'],
): OverlaySubmittedSession | null {
  const latestAttempt = context.practice?.latestAttempt

  if (!latestAttempt) {
    return null
  }

  return {
    rating: latestAttempt.rating,
    elapsedSeconds: latestAttempt.elapsedSeconds,
    isCorrect: latestAttempt.isCorrect ?? latestAttempt.rating !== 'again',
    lockReason,
  }
}

export type { OverlaySyncStatus } from './use-leetcode-page-sync'
