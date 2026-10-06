import type { OverlayNextStep } from '@/features/app-shell'
import type { AssessmentLockReason } from '@/features/assessment'
import type {
  PracticeSaveReviewResultRequest,
  PracticeOverrideLastReviewResultRequest,
  SerializedPracticeDetails,
} from '@/features/practice'
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

export type OverlayAcceptedCommand = (
  | { operation: 'save'; request: PracticeSaveReviewResultRequest }
  | { operation: 'update'; request: PracticeOverrideLastReviewResultRequest }
) & {
  syncToken: number
  lockReason: AssessmentLockReason | null
  feedback: OverlayFeedback
}

export type OverlaySubmittedSession = {
  reviewAttemptId: string
  revision: number
  reviewedAt: string
  generation: NonNullable<SerializedPracticeDetails['generation']>

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
  acceptedCommand: OverlayAcceptedCommand | null
  commandStatus: 'in-flight' | 'persistence-pending' | 'error' | null
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
  | { type: 'command-started'; command: OverlayAcceptedCommand }
  | { type: 'command-pending' }
  | { type: 'command-conflicted'; message: string }
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
  acceptedCommand: null,
  commandStatus: null,
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
      // Fresh Practice context belongs to the page-sync controller. It cannot
      // retarget this session's draft or acknowledged review.
      return state
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
      if (state.ratingLockReason || state.acceptedCommand) {
        return state
      }

      return withDerivedReviewStatus({
        ...state,
        selectedRating: action.rating,
      })
    case 'command-started':
      return {
        ...state,
        reviewStatus:
          action.command.operation === 'save' ? 'saving' : 'updating',
        acceptedCommand: action.command,
        commandStatus: 'in-flight',
        nextStep: createHiddenNextStepState(),
        feedback: { tone: 'neutral', message: 'Saving review...' },
      }
    case 'command-pending':
      return {
        ...state,
        visualMode: 'expanded',
        commandStatus: 'persistence-pending',
        feedback: {
          tone: 'neutral',
          message:
            'Review persistence is pending. Retry to confirm it is saved.',
        },
      }
    case 'command-conflicted':
      return {
        ...state,
        acceptedCommand: null,
        commandStatus: null,
        reviewStatus: state.submittedSession ? 'submitted-dirty' : 'draft',
        feedback: { tone: 'warning', message: action.message },
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
        acceptedCommand: null,
        commandStatus: null,
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
        acceptedCommand: null,
        commandStatus: null,
        nextStep: nextStepStateFromValue(action.nextStep),
        feedback: action.feedback,
      }
    case 'mutation-failed':
      return {
        ...state,
        visualMode: 'expanded',
        commandStatus: 'error',
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
      if (state.acceptedCommand) return state
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
