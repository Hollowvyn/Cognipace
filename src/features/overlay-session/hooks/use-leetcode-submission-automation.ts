import { useEffect, useRef } from 'react'

import type { LeetCodeSubmissionResult } from '@/lib/leetcode'

import type { OverlayReviewStatus, OverlaySubmittedSession } from '../domain'
import { createSubmissionResultKey } from './submission-result-key'

type UseLeetCodeSubmissionAutomationOptions = {
  activeProblemSlug: string | null
  autoDetectSolved: boolean
  problemSlug: string | null
  reviewStatus: OverlayReviewStatus
  submissionResult: LeetCodeSubmissionResult | null
  submittedSession: OverlaySubmittedSession | null
  saveLeetCodeSubmissionResult: (
    result: LeetCodeSubmissionResult,
  ) => Promise<boolean>
  startTimer: () => void
}

export function useLeetCodeSubmissionAutomation({
  activeProblemSlug,
  autoDetectSolved,
  problemSlug,
  reviewStatus,
  submissionResult,
  submittedSession,
  saveLeetCodeSubmissionResult,
  startTimer,
}: UseLeetCodeSubmissionAutomationOptions) {
  const autoStartedProblemSlugRef = useRef<string | null>(null)
  const handledResultKeysRef = useRef(new Set<string>())
  const pendingResultKeysRef = useRef(new Set<string>())
  const lastAttemptedResultRef = useRef<LeetCodeSubmissionResult | null>(null)
  const reviewStatusRef = useRef(reviewStatus)
  const saveResultRef = useRef(saveLeetCodeSubmissionResult)
  const startTimerRef = useRef(startTimer)

  useEffect(() => {
    reviewStatusRef.current = reviewStatus
  }, [reviewStatus])

  useEffect(() => {
    saveResultRef.current = saveLeetCodeSubmissionResult
  }, [saveLeetCodeSubmissionResult])

  useEffect(() => {
    startTimerRef.current = startTimer
  }, [startTimer])

  useEffect(() => {
    if (activeProblemSlug) {
      return
    }

    autoStartedProblemSlugRef.current = null
    handledResultKeysRef.current.clear()
    pendingResultKeysRef.current.clear()
    lastAttemptedResultRef.current = null
  }, [activeProblemSlug])

  useEffect(() => {
    if (
      !autoDetectSolved ||
      !activeProblemSlug ||
      autoStartedProblemSlugRef.current === activeProblemSlug
    ) {
      return
    }

    autoStartedProblemSlugRef.current = activeProblemSlug
    startTimerRef.current()
  }, [activeProblemSlug, autoDetectSolved])

  useEffect(() => {
    if (!submissionResult) {
      return
    }

    const resultKey = createSubmissionResultKey(submissionResult)

    if (
      handledResultKeysRef.current.has(resultKey) ||
      pendingResultKeysRef.current.has(resultKey) ||
      lastAttemptedResultRef.current === submissionResult
    ) {
      return
    }

    if (!autoDetectSolved) {
      handledResultKeysRef.current.add(resultKey)
      return
    }

    if (!problemSlug) {
      return
    }

    if (submissionResult.location.slug !== problemSlug || submittedSession) {
      handledResultKeysRef.current.add(resultKey)
      return
    }

    if (isReviewMutating(reviewStatusRef.current)) {
      return
    }

    lastAttemptedResultRef.current = submissionResult
    pendingResultKeysRef.current.add(resultKey)
    void saveResultRef
      .current(submissionResult)
      .then((saved) => {
        if (saved) {
          handledResultKeysRef.current.add(resultKey)
        }
      })
      .finally(() => {
        pendingResultKeysRef.current.delete(resultKey)
      })
  }, [
    autoDetectSolved,
    problemSlug,
    reviewStatus,
    submissionResult,
    submittedSession,
  ])
}

function isReviewMutating(reviewStatus: OverlayReviewStatus) {
  return reviewStatus === 'saving' || reviewStatus === 'updating'
}
