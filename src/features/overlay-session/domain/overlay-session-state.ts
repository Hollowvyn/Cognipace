import type { OverlayNextStep } from '@/features/app-shell'
import type { AssessmentLockReason } from '@/features/assessment'
import type { ReviewRating } from '@/lib/fsrs'

export type OverlayVisualMode = 'collapsed' | 'expanded' | 'docked'
export type OverlayExpandedTab = 'solve' | 'ai' | 'notes'
export type OverlayReviewStatus =
  | 'draft'
  | 'saving'
  | 'submitted-clean'
  | 'submitted-dirty'
  | 'updating'
export type OverlayNextStepStatus =
  | 'hidden'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error'

export type OverlayFeedback = {
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  message: string
}

export type OverlaySubmittedSession = {
  rating: ReviewRating
  elapsedSeconds: number | null
  isCorrect: boolean
  lockReason: AssessmentLockReason | null
}

export type OverlayNextStepState = {
  status: OverlayNextStepStatus
  value: OverlayNextStep | null
  message: string | null
}

export type OverlaySessionState = {
  activeProblemSlug: string | null
  visualMode: OverlayVisualMode
  expandedTab: OverlayExpandedTab
  reviewStatus: OverlayReviewStatus
  selectedRating: ReviewRating
  ratingLockReason: AssessmentLockReason | null
  submittedSession: OverlaySubmittedSession | null
  nextStep: OverlayNextStepState
  feedback: OverlayFeedback | null
}

export type OverlaySessionAction =
  | {
      type: 'problem-loaded'
      problemSlug: string
      selectedRating: ReviewRating
    }
  | {
      type: 'problem-context-refreshed'
      problemSlug: string
      selectedRating: ReviewRating
      submittedSession: OverlaySubmittedSession | null
    }
  | { type: 'page-changed' }
  | { type: 'set-visual-mode'; visualMode: OverlayVisualMode }
  | { type: 'set-expanded-tab'; tab: OverlayExpandedTab }
  | { type: 'set-selected-rating'; rating: ReviewRating }
  | { type: 'save-started' }
  | { type: 'update-started' }
  | {
      type: 'submit-succeeded'
      snapshot: OverlaySubmittedSession
      nextStep: OverlayNextStep | null
      feedback: OverlayFeedback | null
    }
  | {
      type: 'update-succeeded'
      snapshot: OverlaySubmittedSession
      nextStep: OverlayNextStep | null
      feedback: OverlayFeedback | null
    }
  | { type: 'mutation-failed'; message: string }
  | { type: 'next-step-loading' }
  | { type: 'next-step-loaded'; nextStep: OverlayNextStep | null }
  | { type: 'next-step-error'; message: string }
  | {
      type: 'restart-local-session'
      selectedRating: ReviewRating
    }
  | { type: 'set-feedback'; feedback: OverlayFeedback | null }

export const initialOverlaySessionState: OverlaySessionState = {
  activeProblemSlug: null,
  visualMode: 'collapsed',
  expandedTab: 'solve',
  reviewStatus: 'draft',
  selectedRating: 'good',
  ratingLockReason: null,
  submittedSession: null,
  nextStep: createHiddenNextStepState(),
  feedback: null,
}

export function overlaySessionReducer(
  state: OverlaySessionState,
  action: OverlaySessionAction,
): OverlaySessionState {
  switch (action.type) {
    case 'problem-loaded':
      return {
        ...initialOverlaySessionState,
        activeProblemSlug: action.problemSlug,
        selectedRating: action.selectedRating,
      }
    case 'problem-context-refreshed':
      if (
        state.activeProblemSlug !== action.problemSlug ||
        state.reviewStatus === 'saving' ||
        state.reviewStatus === 'updating' ||
        hasSubmittedSessionChanges(state)
      ) {
        return state
      }

      return {
        ...state,
        selectedRating:
          action.submittedSession?.rating ?? action.selectedRating,
        submittedSession:
          state.submittedSession && action.submittedSession
            ? action.submittedSession
            : state.submittedSession,
        ratingLockReason:
          action.submittedSession?.lockReason ?? state.ratingLockReason,
      }
    case 'page-changed':
      return initialOverlaySessionState
    case 'set-visual-mode':
      return {
        ...state,
        visualMode: action.visualMode,
      }
    case 'set-expanded-tab':
      return {
        ...state,
        expandedTab: action.tab,
      }
    case 'set-selected-rating':
      if (state.ratingLockReason) {
        return state
      }

      return withDerivedReviewStatus({
        ...state,
        selectedRating: action.rating,
      })
    case 'save-started':
      return {
        ...state,
        reviewStatus: 'saving',
        feedback: null,
      }
    case 'update-started':
      return {
        ...state,
        reviewStatus: 'updating',
        feedback: null,
      }
    case 'submit-succeeded':
      return {
        ...state,
        visualMode: 'expanded',
        expandedTab:
          state.visualMode === 'expanded' ? state.expandedTab : 'solve',
        reviewStatus: 'submitted-clean',
        selectedRating: action.snapshot.rating,
        ratingLockReason: action.snapshot.lockReason,
        submittedSession: action.snapshot,
        nextStep: nextStepStateFromValue(action.nextStep),
        feedback: action.feedback,
      }
    case 'update-succeeded':
      return {
        ...state,
        reviewStatus: 'submitted-clean',
        selectedRating: action.snapshot.rating,
        ratingLockReason: action.snapshot.lockReason,
        submittedSession: action.snapshot,
        nextStep: nextStepStateFromValue(action.nextStep),
        feedback: action.feedback,
      }
    case 'mutation-failed':
      return {
        ...state,
        reviewStatus: state.submittedSession ? 'submitted-dirty' : 'draft',
        feedback: {
          tone: 'danger',
          message: action.message,
        },
      }
    case 'next-step-loading':
      return {
        ...state,
        nextStep: {
          status: 'loading',
          value: null,
          message: 'Finding next problem...',
        },
      }
    case 'next-step-loaded':
      return {
        ...state,
        nextStep: nextStepStateFromValue(action.nextStep),
      }
    case 'next-step-error':
      return {
        ...state,
        nextStep: {
          status: 'error',
          value: null,
          message: action.message,
        },
      }
    case 'restart-local-session':
      return {
        ...state,
        expandedTab: 'solve',
        reviewStatus: 'draft',
        selectedRating: action.selectedRating,
        ratingLockReason: null,
        submittedSession: null,
        nextStep: createHiddenNextStepState(),
        feedback: null,
      }
    case 'set-feedback':
      return {
        ...state,
        feedback: action.feedback,
      }
    default:
      return assertNever(action)
  }
}

export function hasSubmittedSessionChanges(state: OverlaySessionState) {
  if (!state.submittedSession) {
    return false
  }

  return state.selectedRating !== state.submittedSession.rating
}

function withDerivedReviewStatus(
  state: OverlaySessionState,
): OverlaySessionState {
  if (!state.submittedSession) {
    return state.reviewStatus === 'saving'
      ? state
      : { ...state, reviewStatus: 'draft' }
  }

  if (state.reviewStatus === 'updating') {
    return state
  }

  return {
    ...state,
    reviewStatus: hasSubmittedSessionChanges(state)
      ? 'submitted-dirty'
      : 'submitted-clean',
  }
}

function nextStepStateFromValue(
  nextStep: OverlayNextStep | null,
): OverlayNextStepState {
  if (!nextStep) {
    return createHiddenNextStepState()
  }

  return {
    status: nextStep.kind === 'empty' ? 'empty' : 'ready',
    value: nextStep,
    message: null,
  }
}

function createHiddenNextStepState(): OverlayNextStepState {
  return {
    status: 'hidden',
    value: null,
    message: null,
  }
}

function assertNever(value: never): never {
  void value
  throw new Error('Unhandled overlay session action')
}
