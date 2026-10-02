import type { OverlayAppShellData } from '@/features/app-shell'
import type { AssessmentPracticeContext } from '@/features/assessment'
import type { ReviewRating } from '@/lib/fsrs'

export type OverlayAssessmentContext = OverlayAppShellData['overlay']

export type OverlaySubmissionSource =
  | 'manual-overlay'
  | 'collapsed-quick'
  | 'leetcode-watcher'

export type OverlayAssessmentLatestAttempt = {
  id: string
  rating: ReviewRating
  isCorrect: boolean
  elapsedSeconds: number | null
  occurredAt: number
}

export type OverlayAssessmentSessionContext = {
  sessionKind: 'first-solve' | 'recall-review'
  submissionSource: OverlaySubmissionSource
  timerUsed: boolean
  previousRating: ReviewRating | null
  bestElapsedSeconds: number | null
  latestAttempt: OverlayAssessmentLatestAttempt | null
  currentDraftHasChanges: boolean
}

export type DeriveOverlayAssessmentSessionContextInput = {
  context: OverlayAssessmentContext
  submissionSource: OverlaySubmissionSource
  timerUsed: boolean
}

export function deriveOverlayAssessmentSessionContext(
  input: DeriveOverlayAssessmentSessionContextInput,
): OverlayAssessmentSessionContext {
  const practice = input.context.practice
  const latestAttempt = practice?.latestAttempt ?? null

  return {
    sessionKind: latestAttempt === null ? 'first-solve' : 'recall-review',
    submissionSource: input.submissionSource,
    timerUsed: input.timerUsed,
    previousRating: practice?.practice?.lastRating ?? null,
    bestElapsedSeconds: practice?.practice?.bestElapsedSeconds ?? null,
    latestAttempt: latestAttempt
      ? {
          id: latestAttempt.id,
          rating: latestAttempt.rating,
          isCorrect:
            latestAttempt.isCorrect ?? latestAttempt.rating !== 'again',
          elapsedSeconds: latestAttempt.elapsedSeconds,
          occurredAt: Date.parse(latestAttempt.reviewedAt),
        }
      : null,
    // Retained for compatibility with the assessment runtime contract.
    currentDraftHasChanges: false,
  }
}

export function toAssessmentPracticeContext(
  session: OverlayAssessmentSessionContext,
): AssessmentPracticeContext {
  return {
    isFirstSolve: session.sessionKind === 'first-solve',
    previousRating: session.previousRating,
    previousBestSeconds: session.bestElapsedSeconds,
    latestAttempt: session.latestAttempt
      ? {
          rating: session.latestAttempt.rating,
          isCorrect: session.latestAttempt.isCorrect,
          elapsedSeconds: session.latestAttempt.elapsedSeconds,
          occurredAt: session.latestAttempt.occurredAt,
        }
      : null,
  }
}
