import { describe, expect, it } from 'vitest'

import type { OverlayAppShellData } from '@/features/app-shell'
import type { SerializedPracticeDetails } from '@/features/practice'

import {
  deriveOverlayAssessmentSessionContext,
  toAssessmentPracticeContext,
  type OverlayAssessmentSessionContext,
} from './session-context'

type Context = OverlayAppShellData['overlay']

const baseAttempt = {
  id: 'attempt-1',
  problemSlug: 'two-sum',
  cardId: 'fsrs:two-sum',
  rating: 'good',
  reviewMode: 'leetcode',
  reviewedAt: '2026-05-30T10:00:00.000Z',
  elapsedSeconds: 600,
  isCorrect: true,
  log: {
    interviewPattern: null,
    timeComplexity: null,
    spaceComplexity: null,
    languages: null,
    notes: null,
  },
  createdAt: '2026-05-30T10:00:00.000Z',
  updatedAt: '2026-05-30T10:00:00.000Z',
} satisfies NonNullable<SerializedPracticeDetails['latestAttempt']>

function makePractice(
  overrides: Partial<SerializedPracticeDetails> = {},
): SerializedPracticeDetails {
  return {
    problemSlug: 'two-sum',
    cardId: 'fsrs:two-sum',
    status: 'new',
    isSuspended: false,
    phase: 'new',
    isStarted: false,
    isDue: false,
    isOverdue: false,
    overdueDays: 0,
    dueAt: null,
    lastReviewedAt: null,
    retrievability: null,
    stability: null,
    difficulty: null,
    scheduledDays: null,
    lapses: 0,
    reviewCount: 0,
    reviewHistory: [],
    recentAttempts: [],
    latestAttempt: null,
    practice: null,
    card: null,
    currentLog: {
      interviewPattern: null,
      timeComplexity: null,
      spaceComplexity: null,
      languages: null,
      notes: null,
    },
    canOverrideLatestReview: false,
    ...overrides,
  }
}

function makeContext(
  practice: SerializedPracticeDetails | null = null,
): Context {
  return {
    appearance: { themeMode: 'system' },
    automation: { autoDetectSolved: false },
    problem: {
      problemSlug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'medium',
      isPremium: false,
    },
    practice,
    timing: {
      requireSolveTime: false,
      strictTiming: false,
      timeTargetsMinutes: { easy: 20, medium: 35, hard: 50 },
    },
    nextStep: null,
    aiAssessmentEnabled: false,
    aiAssessmentAvailable: false,
  }
}

describe('deriveOverlayAssessmentSessionContext', () => {
  it('marks first-solve when latestAttempt is null', () => {
    const result = deriveOverlayAssessmentSessionContext({
      context: makeContext(makePractice()),

      submissionSource: 'manual-overlay',
      timerUsed: true,
    })
    expect(result.sessionKind).toBe('first-solve')
  })

  it('marks recall-review when latestAttempt is present', () => {
    const result = deriveOverlayAssessmentSessionContext({
      context: makeContext(makePractice({ latestAttempt: baseAttempt })),

      submissionSource: 'manual-overlay',
      timerUsed: true,
    })
    expect(result.sessionKind).toBe('recall-review')
  })

  it('marks first-solve when practice record is absent entirely', () => {
    const result = deriveOverlayAssessmentSessionContext({
      context: makeContext(null),

      submissionSource: 'manual-overlay',
      timerUsed: true,
    })
    expect(result).toMatchObject({
      sessionKind: 'first-solve',
      previousRating: null,
      bestElapsedSeconds: null,
      latestAttempt: null,
    })
  })

  it.each(['manual-overlay', 'collapsed-quick', 'leetcode-watcher'] as const)(
    'passes submissionSource %s through',
    (source) => {
      expect(
        deriveOverlayAssessmentSessionContext({
          context: makeContext(null),

          submissionSource: source,
          timerUsed: false,
        }).submissionSource,
      ).toBe(source)
    },
  )

  it.each([true, false])('passes timerUsed %s through', (used) => {
    expect(
      deriveOverlayAssessmentSessionContext({
        context: makeContext(null),

        submissionSource: 'manual-overlay',
        timerUsed: used,
      }).timerUsed,
    ).toBe(used)
  })

  it('reads previousRating and bestElapsedSeconds from practice.practice', () => {
    const result = deriveOverlayAssessmentSessionContext({
      context: makeContext(
        makePractice({
          practice: {
            status: 'review',
            lastReviewedAt: '2026-05-29T10:00:00.000Z',
            attemptCount: 3,
            solvedCount: 2,
            isSuspended: false,
            lastRating: 'hard',
            lastElapsedSeconds: 1200,
            bestElapsedSeconds: 900,
            log: {
              interviewPattern: null,
              timeComplexity: null,
              spaceComplexity: null,
              languages: null,
              notes: null,
            },
          },
        }),
      ),

      submissionSource: 'manual-overlay',
      timerUsed: true,
    })
    expect(result).toMatchObject({
      previousRating: 'hard',
      bestElapsedSeconds: 900,
    })
  })

  it('projects latestAttempt into the five session fields with epoch occurredAt', () => {
    const result = deriveOverlayAssessmentSessionContext({
      context: makeContext(makePractice({ latestAttempt: baseAttempt })),

      submissionSource: 'manual-overlay',
      timerUsed: true,
    })
    expect(result.latestAttempt).toEqual({
      id: 'attempt-1',
      rating: 'good',
      isCorrect: true,
      elapsedSeconds: 600,
      occurredAt: Date.parse('2026-05-30T10:00:00.000Z'),
    })
  })

  it('falls back to rating !== "again" when latestAttempt.isCorrect is null', () => {
    const result = deriveOverlayAssessmentSessionContext({
      context: makeContext(
        makePractice({
          latestAttempt: { ...baseAttempt, isCorrect: null, rating: 'hard' },
        }),
      ),

      submissionSource: 'manual-overlay',
      timerUsed: true,
    })
    expect(result.latestAttempt?.isCorrect).toBe(true)
  })

  it('falls back to false when latestAttempt.isCorrect is null and rating is again', () => {
    const result = deriveOverlayAssessmentSessionContext({
      context: makeContext(
        makePractice({
          latestAttempt: { ...baseAttempt, isCorrect: null, rating: 'again' },
        }),
      ),

      submissionSource: 'manual-overlay',
      timerUsed: true,
    })
    expect(result.latestAttempt?.isCorrect).toBe(false)
  })

  it('returns latestAttempt null when practice.latestAttempt is null', () => {
    expect(
      deriveOverlayAssessmentSessionContext({
        context: makeContext(makePractice()),

        submissionSource: 'manual-overlay',
        timerUsed: true,
      }).latestAttempt,
    ).toBeNull()
  })
})

describe('toAssessmentPracticeContext', () => {
  function makeSession(
    overrides: Partial<OverlayAssessmentSessionContext> = {},
  ): OverlayAssessmentSessionContext {
    return {
      sessionKind: 'recall-review',
      submissionSource: 'manual-overlay',
      timerUsed: true,
      previousRating: 'good',
      bestElapsedSeconds: 900,
      latestAttempt: {
        id: 'attempt-1',
        rating: 'good',
        isCorrect: true,
        elapsedSeconds: 600,
        occurredAt: Date.parse('2026-05-30T10:00:00.000Z'),
      },
      ...overrides,
    }
  }

  it('maps sessionKind first-solve to isFirstSolve true', () => {
    expect(
      toAssessmentPracticeContext(makeSession({ sessionKind: 'first-solve' }))
        .isFirstSolve,
    ).toBe(true)
  })

  it('maps sessionKind recall-review to isFirstSolve false', () => {
    expect(
      toAssessmentPracticeContext(makeSession({ sessionKind: 'recall-review' }))
        .isFirstSolve,
    ).toBe(false)
  })

  it('maps bestElapsedSeconds to previousBestSeconds (with rename)', () => {
    expect(
      toAssessmentPracticeContext(makeSession({ bestElapsedSeconds: 1234 }))
        .previousBestSeconds,
    ).toBe(1234)
  })

  it('preserves previousRating', () => {
    expect(
      toAssessmentPracticeContext(makeSession({ previousRating: 'hard' }))
        .previousRating,
    ).toBe('hard')
  })

  it('projects latestAttempt to the four policy fields and drops id', () => {
    const result = toAssessmentPracticeContext(makeSession())
    expect(result.latestAttempt).toEqual({
      rating: 'good',
      isCorrect: true,
      elapsedSeconds: 600,
      occurredAt: Date.parse('2026-05-30T10:00:00.000Z'),
    })
  })

  it('passes null latestAttempt through unchanged', () => {
    expect(
      toAssessmentPracticeContext(makeSession({ latestAttempt: null }))
        .latestAttempt,
    ).toBeNull()
  })
})
