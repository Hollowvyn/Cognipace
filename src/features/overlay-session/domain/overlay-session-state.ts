import type { OverlayNextStep } from '@/features/app-shell'
import type { AssessmentLockReason } from '@/features/assessment'
import type { ReviewRating } from '@/lib/fsrs'

import {
  createEmptyOverlayDraft,
  overlayDraftsEqual,
  type OverlayDraftField,
  type OverlayDraftLog,
} from './overlay-draft'

export type OverlayVisualMode = 'collapsed' | 'expanded' | 'docked'
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
  draft: OverlayDraftLog
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
  reviewStatus: OverlayReviewStatus
  draft: OverlayDraftLog
  persistedDraft: OverlayDraftLog
  selectedRating: ReviewRating
  ratingLockReason: AssessmentLockReason | null
  submittedSession: OverlaySubmittedSession | null
  nextStep: OverlayNextStepState
  feedback: OverlayFeedback | null
  userTouchedRating: boolean
}

export type OverlaySessionAction =
  | {
      type: 'problem-loaded'
      problemSlug: string
      draft: OverlayDraftLog
      selectedRating: ReviewRating
    }
  | {
      type: 'problem-context-refreshed'
      problemSlug: string
      draft: OverlayDraftLog
      selectedRating: ReviewRating
      submittedSession: OverlaySubmittedSession | null
    }
  | { type: 'page-changed' }
  | { type: 'set-visual-mode'; visualMode: OverlayVisualMode }
  | { type: 'set-draft-field'; field: OverlayDraftField; value: string }
  | { type: 'set-selected-rating'; rating: ReviewRating }
  | { type: 'ai-preselect-rating'; rating: ReviewRating }
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
  | { type: 'save-cancelled' }
  | { type: 'mutation-failed'; message: string }
  | { type: 'next-step-loading' }
  | { type: 'next-step-loaded'; nextStep: OverlayNextStep | null }
  | { type: 'next-step-error'; message: string }
  | { type: 'draft-persisted'; draft: OverlayDraftLog }
  | {
      type: 'restart-local-session'
      draft: OverlayDraftLog
      selectedRating: ReviewRating
    }
  | { type: 'set-feedback'; feedback: OverlayFeedback | null }

export const initialOverlaySessionState: OverlaySessionState = {
  activeProblemSlug: null,
  visualMode: 'collapsed',
  reviewStatus: 'draft',
  draft: createEmptyOverlayDraft(),
  persistedDraft: createEmptyOverlayDraft(),
  selectedRating: 'good',
  ratingLockReason: null,
  submittedSession: null,
  nextStep: createHiddenNextStepState(),
  feedback: null,
  userTouchedRating: false,
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
        draft: action.draft,
        persistedDraft: action.draft,
        selectedRating: action.selectedRating,
      }
    case 'problem-context-refreshed':
      if (
        state.activeProblemSlug !== action.problemSlug ||
        state.reviewStatus === 'saving' ||
        state.reviewStatus === 'updating' ||
        hasUnpersistedDraftChanges(state) ||
        hasSubmittedSessionChanges(state)
      ) {
        return state
      }

      return {
        ...state,
        draft: action.draft,
        persistedDraft: action.draft,
        selectedRating:
          action.submittedSession?.rating ?? action.selectedRating,
        submittedSession:
          state.submittedSession && action.submittedSession
            ? action.submittedSession
            : state.submittedSession,
        ratingLockReason:
          action.submittedSession?.lockReason ?? state.ratingLockReason,
        userTouchedRating: false,
      }
    case 'page-changed':
      return initialOverlaySessionState
    case 'set-visual-mode':
      return {
        ...state,
        visualMode: action.visualMode,
      }
    case 'set-draft-field':
      return withDerivedReviewStatus({
        ...state,
        draft: {
          ...state.draft,
          [action.field]: action.value,
        },
      })
    case 'set-selected-rating':
      if (state.ratingLockReason) {
        return state
      }

      return withDerivedReviewStatus({
        ...state,
        selectedRating: action.rating,
        userTouchedRating: true,
      })
    case 'ai-preselect-rating':
      if (state.ratingLockReason) {
        return state
      }
      if (state.userTouchedRating) {
        return state
      }
      if (state.selectedRating === action.rating) {
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
        reviewStatus: 'submitted-clean',
        draft: action.snapshot.draft,
        persistedDraft: action.snapshot.draft,
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
        draft: action.snapshot.draft,
        persistedDraft: action.snapshot.draft,
        selectedRating: action.snapshot.rating,
        ratingLockReason: action.snapshot.lockReason,
        submittedSession: action.snapshot,
        nextStep: nextStepStateFromValue(action.nextStep),
        feedback: action.feedback,
      }
    case 'save-cancelled':
      return { ...state, reviewStatus: 'draft', feedback: null }
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
    case 'draft-persisted':
      return {
        ...state,
        persistedDraft: action.draft,
      }
    case 'restart-local-session':
      return {
        ...state,
        reviewStatus: 'draft',
        draft: action.draft,
        persistedDraft: action.draft,
        selectedRating: action.selectedRating,
        ratingLockReason: null,
        submittedSession: null,
        nextStep: createHiddenNextStepState(),
        feedback: null,
        userTouchedRating: false,
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

  return (
    state.selectedRating !== state.submittedSession.rating ||
    !overlayDraftsEqual(state.draft, state.submittedSession.draft)
  )
}

export function hasUnpersistedDraftChanges(state: OverlaySessionState) {
  return !overlayDraftsEqual(state.draft, state.persistedDraft)
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
