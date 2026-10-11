import { describe, expect, it } from 'vitest'

import {
  createInitialFsrsCard,
  scheduleReview,
  type FsrsCardSnapshot,
} from '@/lib/fsrs'

import {
  deriveNormalizedPracticeState,
  derivePracticeSummary,
  normalizeReviewLogFields,
  statusFromReview,
  type PracticeReviewAttemptSnapshot,
  type PracticeStateSnapshot,
} from './practice'

describe('practice domain', () => {
  it('derives a new unstarted summary without a card or practice row', () => {
    expect(
      derivePracticeSummary({
        practice: null,
        card: null,
        now: baseNow,
      }),
    ).toEqual({
      phase: 'new',
      nextReviewAt: null,
      eligibleOn: null,
      lastReviewedAt: null,
      reviewCount: 0,
      lapses: 0,
      difficulty: null,
      stability: null,
      scheduledDays: null,
      suspended: false,
      isStarted: false,
      isDue: false,
      isOverdue: false,
      overdueDays: 0,
      retrievability: null,
    })
  })

  it('uses the persisted due date for overdue state independently of retrievability', () => {
    const reviewedCard = reviewedFsrsCard({
      dueAt: new Date(2026, 8, 2, 12),
    })
    const summary = derivePracticeSummary({
      practice: practiceState({ status: 'learning' }),
      card: reviewedCard,
      now: new Date(2026, 8, 13, 2, 11, 31),
    })

    expect(summary).toMatchObject({
      phase: 'review',
      nextReviewAt: reviewedCard.dueAt,
      lastReviewedAt: reviewedCard.lastReviewAt,
      reviewCount: reviewedCard.reps,
      lapses: reviewedCard.lapses,
      isStarted: true,
      isDue: true,
      isOverdue: true,
      overdueDays: 11,
    })
    expect(summary.retrievability).not.toBeNull()
  })

  it('does not mark a future-dated card due even when retrievability is low', () => {
    const reviewedCard = reviewedFsrsCard({
      dueAt: new Date(2026, 8, 14, 12),
    })
    const summary = derivePracticeSummary({
      practice: practiceState(),
      card: reviewedCard,
      now: new Date(2026, 8, 13, 2, 11, 31),
    })

    expect(summary).toMatchObject({
      isDue: false,
      isOverdue: false,
      overdueDays: 0,
    })
    expect(summary.retrievability).toBeLessThan(0.9)
  })

  it('uses actual last review time rather than a corrected attempt update time', () => {
    const actualReviewAt = new Date(2026, 8, 12, 12)
    const rawDueAt = new Date(2026, 8, 13, 2)
    const card = reviewedFsrsCard({
      lastReviewAt: actualReviewAt,
      dueAt: rawDueAt,
    })
    const attempt = {
      ...makeAttempt('corrected'),
      reviewedAt: actualReviewAt,
      updatedAt: new Date(2026, 8, 13, 21),
    }

    const state = deriveNormalizedPracticeState({
      problemSlug: 'two-sum',
      cardId: 'two-sum:default',
      practice: practiceState({ lastReviewedAt: actualReviewAt }),
      card,
      attempts: [attempt],
      now: new Date(2026, 8, 13, 22),
    })

    expect(state).toMatchObject({
      dueAt: rawDueAt,
      eligibleOn: '2026-09-13',
      lastReviewedAt: actualReviewAt,
      isDue: true,
    })
  })

  it('falls back to practice status when an aggregate exists before a card is available', () => {
    expect(
      derivePracticeSummary({
        practice: practiceState({ status: 'mastered' }),
        card: null,
        now: baseNow,
      }),
    ).toMatchObject({
      phase: 'review',
      reviewCount: 1,
      isStarted: true,
      isDue: false,
    })
  })

  it('treats suspension as a practice-level override', () => {
    expect(
      derivePracticeSummary({
        practice: practiceState({ isSuspended: true, status: 'suspended' }),
        card: reviewedFsrsCard(),
        now: new Date('2026-06-01T10:00:00.000Z'),
      }),
    ).toMatchObject({
      phase: 'suspended',
      suspended: true,
      isDue: false,
      isOverdue: false,
    })
  })

  it('maps FSRS review states to practice statuses', () => {
    expect(statusFromReview('again', reviewedFsrsCard())).toBe('learning')
    expect(
      statusFromReview('good', reviewedFsrsCard({ state: 'learning' })),
    ).toBe('learning')
    expect(
      statusFromReview('good', reviewedFsrsCard({ state: 'relearning' })),
    ).toBe('learning')
    expect(statusFromReview('good', reviewedFsrsCard())).toBe('review')
  })

  it('normalizes blank practice log fields to null and trims text', () => {
    expect(
      normalizeReviewLogFields({
        interviewPattern: '  two pointers ',
        timeComplexity: '',
        spaceComplexity: '   ',
        languages: null,
        notes: ' remember bounds ',
      }),
    ).toEqual({
      interviewPattern: 'two pointers',
      timeComplexity: null,
      spaceComplexity: null,
      languages: null,
      notes: 'remember bounds',
    })
  })
})

function reviewedFsrsCard(
  overrides: Partial<FsrsCardSnapshot> = {},
): FsrsCardSnapshot {
  return {
    ...scheduleReview(createInitialFsrsCard(reviewedAt), 'easy', reviewedAt)
      .card,
    ...overrides,
  }
}

function practiceState(
  overrides: Partial<PracticeStateSnapshot> = {},
): PracticeStateSnapshot {
  return {
    status: 'review',
    lastReviewedAt: reviewedAt,
    attemptCount: 1,
    solvedCount: 1,
    isSuspended: false,
    lastRating: 'easy',
    lastElapsedSeconds: 600,
    bestElapsedSeconds: 600,
    log: {
      interviewPattern: null,
      timeComplexity: null,
      spaceComplexity: null,
      languages: null,
      notes: null,
    },
    ...overrides,
  }
}

const reviewedAt = new Date('2026-01-01T10:00:00.000Z')
const baseNow = new Date('2026-01-01T12:00:00.000Z')

describe('deriveNormalizedPracticeState', () => {
  it('returns a fully unstarted state when no practice, card, or attempts exist', () => {
    const state = deriveNormalizedPracticeState({
      problemSlug: 'two-sum',
      cardId: 'two-sum:default',
      practice: null,
      card: null,
      attempts: [],
      now: baseNow,
    })

    expect(state).toMatchObject({
      problemSlug: 'two-sum',
      cardId: 'two-sum:default',
      status: 'new',
      isSuspended: false,
      phase: 'new',
      isStarted: false,
      isDue: false,
      isOverdue: false,
      overdueDays: 0,
      dueAt: null,
      eligibleOn: null,
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
    })
  })

  it('reflects status and isSuspended from practice row', () => {
    const state = deriveNormalizedPracticeState({
      problemSlug: 'two-sum',
      cardId: 'two-sum:default',
      practice: practiceState({ status: 'review', isSuspended: false }),
      card: null,
      attempts: [],
      now: baseNow,
    })

    expect(state.status).toBe('review')
    expect(state.isSuspended).toBe(false)
  })

  it('sets isSuspended from practice row suspended flag', () => {
    const state = deriveNormalizedPracticeState({
      problemSlug: 'two-sum',
      cardId: 'two-sum:default',
      practice: practiceState({ isSuspended: true, status: 'suspended' }),
      card: reviewedFsrsCard(),
      attempts: [],
      now: new Date('2026-06-01T10:00:00.000Z'),
    })

    expect(state.isSuspended).toBe(true)
    expect(state.phase).toBe('suspended')
    expect(state.isDue).toBe(false)
  })

  it('populates reviewHistory and recentAttempts correctly', () => {
    const attempt = makeAttempt('attempt-1')
    const state = deriveNormalizedPracticeState({
      problemSlug: 'two-sum',
      cardId: 'two-sum:default',
      practice: null,
      card: null,
      attempts: [attempt],
      now: baseNow,
    })

    expect(state.reviewHistory).toEqual([attempt])
    expect(state.recentAttempts).toEqual([attempt])
    expect(state.latestAttempt).toEqual(attempt)
  })

  it('caps recentAttempts at 5 and reverses them, keeping reviewHistory full', () => {
    const attempts = Array.from({ length: 7 }, (_, i) =>
      makeAttempt(`attempt-${i + 1}`),
    )
    const state = deriveNormalizedPracticeState({
      problemSlug: 'two-sum',
      cardId: 'two-sum:default',
      practice: null,
      card: null,
      attempts,
      now: baseNow,
    })

    expect(state.reviewHistory).toHaveLength(7)
    expect(state.recentAttempts).toHaveLength(5)
    // recentAttempts should be the last 5, reversed (most recent first)
    expect(state.recentAttempts[0]).toEqual(attempts[6])
    expect(state.recentAttempts[4]).toEqual(attempts[2])
    expect(state.latestAttempt).toEqual(attempts[6])
  })
})

function makeAttempt(id: string): PracticeReviewAttemptSnapshot {
  return {
    id,
    problemSlug: 'two-sum',
    cardId: 'two-sum:default',
    rating: 'good',
    reviewMode: 'manual',
    reviewedAt: reviewedAt,
    elapsedSeconds: null,
    isCorrect: null,
    log: {
      interviewPattern: null,
      timeComplexity: null,
      spaceComplexity: null,
      languages: null,
      notes: null,
    },
    createdAt: reviewedAt,
    updatedAt: reviewedAt,
  }
}
