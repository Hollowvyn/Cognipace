import { describe, expect, it } from 'vitest'

import type { OverlayNextStep } from '@/features/app-shell'

import {
  hasSubmittedSessionChanges,
  initialOverlaySessionState,
  overlaySessionReducer,
  type OverlaySessionState,
  type OverlaySubmittedSession,
} from './overlay-session-state'

describe('overlaySessionReducer', () => {
  it('preserves tab selection through modes and context refresh', () => {
    let state = overlaySessionReducer(
      { ...initialOverlaySessionState, activeProblemSlug: 'two-sum' },
      { type: 'set-expanded-tab', tab: 'ai' },
    )

    for (const visualMode of [
      'expanded',
      'collapsed',
      'docked',
      'collapsed',
      'expanded',
    ] as const) {
      state = overlaySessionReducer(state, {
        type: 'set-visual-mode',
        visualMode,
      })
      expect(state.expandedTab).toBe('ai')
    }

    state = overlaySessionReducer(state, {
      type: 'problem-context-refreshed',
      problemSlug: 'two-sum',
      selectedRating: 'good',
      submittedSession: null,
    })
    expect(state.expandedTab).toBe('ai')
  })

  it.each(['collapsed', 'docked', 'expanded'] as const)(
    'uses the completion-time visual mode %s for successful save selection',
    (visualMode) => {
      const saving = {
        ...initialOverlaySessionState,
        visualMode,
        expandedTab: 'notes' as const,
        reviewStatus: 'saving' as const,
      }
      const state = overlaySessionReducer(saving, {
        type: 'submit-succeeded',
        snapshot: createSubmittedSession(),
        nextStep: null,
        feedback: null,
      })

      expect(state.visualMode).toBe('expanded')
      expect(state.expandedTab).toBe(
        visualMode === 'expanded' ? 'notes' : 'solve',
      )
    },
  )

  it('resets tab on restart, new problem and navigation', () => {
    const state = { ...initialOverlaySessionState, expandedTab: 'ai' as const }

    expect(
      overlaySessionReducer(state, {
        type: 'restart-local-session',
        selectedRating: 'good',
      }).expandedTab,
    ).toBe('solve')
    expect(
      overlaySessionReducer(state, {
        type: 'problem-loaded',
        problemSlug: 'two-sum',
        selectedRating: 'good',
      }).expandedTab,
    ).toBe('solve')
    expect(
      overlaySessionReducer(state, { type: 'page-changed' }).expandedTab,
    ).toBe('solve')
  })

  it('loads a problem with the selected rating', () => {
    const state = overlaySessionReducer(
      {
        ...initialOverlaySessionState,
        feedback: { tone: 'danger', message: 'Old page failed.' },
        reviewStatus: 'submitted-clean',
        visualMode: 'expanded',
      },
      {
        type: 'problem-loaded',
        problemSlug: 'two-sum',
        selectedRating: 'hard',
      },
    )

    expect(state).toMatchObject({
      activeProblemSlug: 'two-sum',
      feedback: null,
      reviewStatus: 'draft',
      selectedRating: 'hard',
      visualMode: 'collapsed',
    })
  })

  it('derives submitted dirty and clean status from rating changes', () => {
    const submittedState = createSubmittedState()

    const changedRatingState = overlaySessionReducer(submittedState, {
      type: 'set-selected-rating',
      rating: 'hard',
    })

    expect(changedRatingState.reviewStatus).toBe('submitted-dirty')
    expect(hasSubmittedSessionChanges(changedRatingState)).toBe(true)

    const cleanState = overlaySessionReducer(changedRatingState, {
      type: 'set-selected-rating',
      rating: 'good',
    })

    expect(cleanState.reviewStatus).toBe('submitted-clean')
    expect(hasSubmittedSessionChanges(cleanState)).toBe(false)
  })

  it('ignores rating changes when the submitted rating is locked', () => {
    const state = createSubmittedState({
      lockReason: 'failed',
      rating: 'again',
    })

    const nextState = overlaySessionReducer(state, {
      type: 'set-selected-rating',
      rating: 'easy',
    })

    expect(nextState).toBe(state)
  })

  it('maps submit success into a locked submitted session with next step state', () => {
    const snapshot = createSubmittedSession({
      lockReason: 'hard-mode-overtime',
      rating: 'again',
    })
    const state = overlaySessionReducer(initialOverlaySessionState, {
      type: 'submit-succeeded',
      feedback: { tone: 'warning', message: 'Saved as Again.' },
      nextStep: nextProblem,
      snapshot,
    })

    expect(state).toMatchObject({
      visualMode: 'expanded',
      reviewStatus: 'submitted-clean',
      selectedRating: 'again',
      ratingLockReason: 'hard-mode-overtime',
      submittedSession: snapshot,
      nextStep: {
        status: 'ready',
        value: nextProblem,
      },
    })
  })

  it('restarts local session without carrying submitted state', () => {
    const state = overlaySessionReducer(createSubmittedState(), {
      type: 'restart-local-session',
      selectedRating: 'hard',
    })

    expect(state).toMatchObject({
      reviewStatus: 'draft',
      selectedRating: 'hard',
      ratingLockReason: null,
      submittedSession: null,
      feedback: null,
      nextStep: {
        status: 'hidden',
        value: null,
      },
    })
  })
})

function createSubmittedState(
  overrides: Partial<OverlaySubmittedSession> = {},
): OverlaySessionState {
  const snapshot = createSubmittedSession(overrides)

  return {
    ...initialOverlaySessionState,
    reviewStatus: 'submitted-clean',
    selectedRating: snapshot.rating,
    ratingLockReason: snapshot.lockReason,
    submittedSession: snapshot,
  }
}

function createSubmittedSession(
  overrides: Partial<OverlaySubmittedSession> = {},
): OverlaySubmittedSession {
  return {
    elapsedSeconds: 95,
    isCorrect: true,
    lockReason: null,
    rating: 'good',
    ...overrides,
  }
}

const nextProblem = {
  category: null,
  detail: 'Next in track - easy',
  dueAt: null,
  kind: 'track',
  problem: {
    difficulty: 'easy',
    isPremium: false,
    problemSlug: 'valid-parentheses',
    title: 'Valid Parentheses',
  },
  title: 'Valid Parentheses',
} satisfies OverlayNextStep
