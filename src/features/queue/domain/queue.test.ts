import { describe, expect, it } from 'vitest'

import {
  deriveNormalizedPracticeState,
  type PracticeStateSnapshot,
} from '@/features/practice'
import { defaultUserSettings } from '@/features/settings/domain'
import type { FsrsCardSnapshot, ReviewRating } from '@/lib/fsrs'

import { buildTodayQueue, type QueueCandidate } from './queue'

const generatedAt = new Date('2026-01-01T12:00:00.000Z')
const baseProblem = {
  slug: 'two-sum',
  title: 'Two Sum',
  difficulty: 'easy' as const,
  isPremium: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('buildTodayQueue', () => {
  it('uses the eligible due waterfall then new work without future cards', () => {
    const now = new Date('2026-09-13T12:00:00.000Z')
    const queue = buildTodayQueue(
      [
        candidate({
          slug: 'overdue-latest',
          card: reviewCard({
            dueAt: new Date('2026-09-10T12:00:00.000Z'),
            lastReviewAt: new Date('2026-08-01T12:00:00.000Z'),
          }),
          practice: practice({ lastRating: 'good' }),
          now,
        }),
        candidate({
          slug: 'new-b',
          now,
        }),
        candidate({
          slug: 'future-high-retrievability',
          card: reviewCard({
            dueAt: new Date('2026-09-20T12:00:00.000Z'),
            lastReviewAt: new Date('2026-09-12T12:00:00.000Z'),
            stability: 30,
          }),
          practice: practice({ lastRating: 'good' }),
          now,
        }),
        candidate({
          slug: 'due-today-late',
          card: reviewCard({
            dueAt: new Date('2026-09-13T11:00:00.000Z'),
            lastReviewAt: new Date('2026-09-01T12:00:00.000Z'),
          }),
          practice: practice({ lastRating: 'good' }),
          now,
        }),
        candidate({
          slug: 'overdue-oldest',
          card: reviewCard({
            dueAt: new Date('2026-09-02T12:00:00.000Z'),
            lastReviewAt: new Date('2026-08-01T12:00:00.000Z'),
          }),
          practice: practice({ lastRating: 'good' }),
          now,
        }),
        candidate({
          slug: 'future-low-retrievability',
          card: reviewCard({
            dueAt: new Date('2026-09-20T12:00:00.000Z'),
            lastReviewAt: new Date('2026-08-01T12:00:00.000Z'),
            stability: 10,
          }),
          practice: practice({ lastRating: 'good' }),
          now,
        }),
        candidate({
          slug: 'due-today-early',
          card: reviewCard({
            dueAt: new Date('2026-09-13T08:00:00.000Z'),
            lastReviewAt: new Date('2026-09-01T12:00:00.000Z'),
          }),
          practice: practice({ lastRating: 'good' }),
          now,
        }),
        candidate({
          slug: 'new-a',
          now,
        }),
      ],
      {
        ...defaultUserSettings,
        practice: {
          ...defaultUserSettings.practice,
          dailyGoal: 8,
        },
      },
      now,
    )

    expect(queue.items.map((item) => item.problemSlug)).toEqual([
      'overdue-oldest',
      'overdue-latest',
      'due-today-early',
      'due-today-late',
      'new-a',
      'new-b',
    ])
    expect(queue.items.map((item) => item.reason)).toEqual([
      'overdue',
      'overdue',
      'due-today',
      'due-today',
      'new-problem',
      'new-problem',
    ])
    expect(queue.dueCount).toBe(4)
    expect(queue.dueToday).toBe(4)
    expect(queue.reinforcementCount).toBe(2)
    expect(queue.newCount).toBe(2)
    expect(queue.topRecommendation?.problemSlug).toBe('overdue-oldest')
  })

  it('caps by daily goal after due items first', () => {
    const queue = buildTodayQueue(
      [
        candidate({
          slug: 'unstarted',
        }),
        candidate({
          slug: 'due',
          card: reviewCard({
            dueAt: new Date('2025-12-25T00:00:00.000Z'),
            lastReviewAt: new Date('2025-12-01T00:00:00.000Z'),
            stability: 1,
          }),
          practice: practice({ lastRating: 'hard' }),
        }),
      ],
      {
        ...defaultUserSettings,
        practice: {
          ...defaultUserSettings.practice,
          dailyGoal: 1,
        },
      },
      generatedAt,
    )

    expect(queue.items).toHaveLength(1)
    expect(queue.items[0]?.problemSlug).toBe('due')
    expect(queue.newCount).toBe(1)
  })

  it('orders overdue cards by eligible day before raw due time', () => {
    const now = new Date('2026-09-13T12:00:00.000Z')
    const queue = buildTodayQueue(
      [
        candidate({
          slug: 'raw-earlier-eligible-later',
          card: reviewCard({
            dueAt: new Date('2026-09-09T10:00:00.000Z'),
            lastReviewAt: new Date('2026-09-11T10:00:00.000Z'),
          }),
          practice: practice({
            lastReviewedAt: new Date('2026-09-11T10:00:00.000Z'),
          }),
          now,
        }),
        candidate({
          slug: 'raw-later-eligible-earlier',
          card: reviewCard({
            dueAt: new Date('2026-09-10T10:00:00.000Z'),
            lastReviewAt: new Date('2026-09-08T10:00:00.000Z'),
          }),
          practice: practice({
            lastReviewedAt: new Date('2026-09-08T10:00:00.000Z'),
          }),
          now,
        }),
      ],
      defaultUserSettings,
      now,
    )

    expect(queue.items.map((item) => item.problemSlug)).toEqual([
      'raw-later-eligible-earlier',
      'raw-earlier-eligible-later',
    ])
  })

  it('excludes manually suspended and premium-filtered candidates', () => {
    const queue = buildTodayQueue(
      [
        candidate({
          slug: 'suspended',
          practice: practice({ isSuspended: true }),
        }),
        candidate({
          slug: 'premium',
          isPremium: true,
        }),
        candidate({
          slug: 'mastered',
          practice: practice({ status: 'mastered' }),
        }),
      ],
      {
        ...defaultUserSettings,
        practice: {
          ...defaultUserSettings.practice,
          problemFilters: { skipPremium: true },
        },
      },
      generatedAt,
    )

    expect(queue.items).toEqual([])
    expect(queue.excludedCount).toBe(3)
    expect(queue.topRecommendation).toBeNull()
  })

  it('presents a legacy mastered card when its review is due', () => {
    const queue = buildTodayQueue(
      [
        candidate({
          slug: 'mastered-with-review',
          card: reviewCard(),
          practice: practice({ status: 'mastered' }),
        }),
      ],
      defaultUserSettings,
      generatedAt,
    )

    expect(queue.items.map((item) => item.problemSlug)).toEqual([
      'mastered-with-review',
    ])
    expect(queue.items[0]?.category).toBe('due')
  })

  it('orders explicitly requested extra practice by lowest current retrievability', () => {
    const queue = buildTodayQueue(
      [
        candidate({
          slug: 'high-retrievability',
          card: reviewCard({
            dueAt: new Date('2026-01-10T00:00:00.000Z'),
            lastReviewAt: new Date('2025-12-31T00:00:00.000Z'),
            stability: 30,
          }),
          practice: practice({ lastRating: 'good' }),
        }),
        candidate({
          slug: 'low-retrievability',
          card: reviewCard({
            dueAt: new Date('2026-01-10T00:00:00.000Z'),
            lastReviewAt: new Date('2025-12-01T00:00:00.000Z'),
            stability: 10,
          }),
          practice: practice({ lastRating: 'again' }),
        }),
      ],
      {
        ...defaultUserSettings,
        review: {
          ...defaultUserSettings.review,
        },
      },
      generatedAt,
      'extra-practice',
    )

    expect(queue.items.map((item) => item.problemSlug)).toEqual([
      'low-retrievability',
    ])
    expect(queue.reinforcementCount).toBe(2)
    expect(queue.queueLoad).toBe(1)
  })

  it('limits extra practice to future reviewed cards that pass suspension and premium filters', () => {
    const queue = buildTodayQueue(
      [
        candidate({ slug: 'unstarted' }),
        candidate({
          slug: 'due',
          card: reviewCard(),
          practice: practice({ lastRating: 'good' }),
        }),
        candidate({
          slug: 'suspended-future',
          card: reviewCard({ dueAt: new Date('2026-01-10T00:00:00.000Z') }),
          practice: practice({ isSuspended: true }),
        }),
        candidate({
          slug: 'premium-future',
          isPremium: true,
          card: reviewCard({ dueAt: new Date('2026-01-10T00:00:00.000Z') }),
          practice: practice({ lastRating: 'good' }),
        }),
        candidate({
          slug: 'eligible-future',
          card: reviewCard({ dueAt: new Date('2026-01-10T00:00:00.000Z') }),
          practice: practice({ lastRating: 'again' }),
        }),
      ],
      {
        ...defaultUserSettings,
        practice: {
          ...defaultUserSettings.practice,
          problemFilters: { skipPremium: true },
        },
      },
      generatedAt,
      'extra-practice',
    )

    expect(queue.items.map((item) => item.problemSlug)).toEqual([
      'eligible-future',
    ])
    expect(queue.topRecommendation?.reason).toBe('reinforcement')
    expect(queue.dueCount).toBe(1)
    expect(queue.newCount).toBe(1)
  })

  it('puts unavailable retrievability after finite extra practice values', () => {
    const queue = buildTodayQueue(
      [
        candidate({
          slug: 'finite-retrievability',
          card: reviewCard({
            dueAt: new Date('2026-01-10T00:00:00.000Z'),
            lastReviewAt: new Date('2025-12-01T00:00:00.000Z'),
            stability: 10,
          }),
          practice: practice({ lastRating: 'good' }),
        }),
        candidate({
          slug: 'unavailable-retrievability',
          card: reviewCard({
            dueAt: new Date('2026-01-10T00:00:00.000Z'),
            lastReviewAt: null,
          }),
          practice: practice({ lastRating: 'good' }),
        }),
      ],
      defaultUserSettings,
      generatedAt,
      'extra-practice',
    )

    expect(queue.items.map((item) => item.problemSlug)).toEqual([
      'finite-retrievability',
    ])
    expect(queue.reinforcementCount).toBe(2)
  })

  it('breaks extra practice ties by due date before problem identity', () => {
    const queue = buildTodayQueue(
      [
        candidate({
          slug: 'later-due',
          card: reviewCard({
            dueAt: new Date('2026-01-11T00:00:00.000Z'),
            lastReviewAt: new Date('2025-12-01T00:00:00.000Z'),
            stability: 10,
          }),
          practice: practice({ lastRating: 'good' }),
        }),
        candidate({
          slug: 'earlier-due',
          card: reviewCard({
            dueAt: new Date('2026-01-10T00:00:00.000Z'),
            lastReviewAt: new Date('2025-12-01T00:00:00.000Z'),
            stability: 10,
          }),
          practice: practice({ lastRating: 'good' }),
        }),
      ],
      defaultUserSettings,
      generatedAt,
      'extra-practice',
    )

    expect(queue.items.map((item) => item.problemSlug)).toEqual(['earlier-due'])
    expect(queue.reinforcementCount).toBe(2)
  })

  it('ignores the persisted review order setting', () => {
    const candidates = [
      candidate({
        slug: 'due-late',
        card: reviewCard({
          dueAt: new Date('2026-01-01T14:00:00.000Z'),
          lastReviewAt: new Date('2025-12-01T00:00:00.000Z'),
        }),
        practice: practice({ lastRating: 'good' }),
      }),
      candidate({
        slug: 'due-early',
        card: reviewCard({
          dueAt: new Date('2026-01-01T08:00:00.000Z'),
          lastReviewAt: new Date('2025-12-01T00:00:00.000Z'),
        }),
        practice: practice({ lastRating: 'good' }),
      }),
      candidate({ slug: 'new-b' }),
      candidate({ slug: 'new-a' }),
    ]

    const orderings = (
      ['dueFirst', 'weakestFirst', 'mixByDifficulty'] as const
    ).map((order) =>
      buildTodayQueue(
        candidates,
        {
          ...defaultUserSettings,
          review: { ...defaultUserSettings.review, order },
        },
        generatedAt,
      ).items.map((item) => item.problemSlug),
    )

    expect(orderings[0]).toEqual(['due-early', 'due-late', 'new-a', 'new-b'])
    expect(orderings[1]).toEqual(orderings[0])
    expect(orderings[2]).toEqual(orderings[0])
  })

  it('uses stable title then slug ordering within the new lane', () => {
    const queue = buildTodayQueue(
      [
        candidate({ slug: 'unstarted-a', title: 'Beta Problem' }),
        candidate({ slug: 'unstarted-b', title: 'Alpha Problem' }),
      ],
      {
        ...defaultUserSettings,
        practice: {
          ...defaultUserSettings.practice,
          dailyGoal: 3,
        },
      },
      generatedAt,
    )

    expect(queue.newCount).toBe(2)
    expect(queue.items.map((item) => item.category)).toEqual(['new', 'new'])
    expect(queue.items[0]?.reason).toBe('new-problem')
    expect(queue.items.map((item) => item.problemSlug)).toEqual([
      'unstarted-b',
      'unstarted-a',
    ])
    expect(queue.topRecommendation?.problemSlug).toBe('unstarted-b')
    expect(queue.topRecommendation?.reason).toBe('new-problem')
  })

  it('exposes shared summary aliases for due, new, load, and recommendation reason', () => {
    const queue = buildTodayQueue(
      [
        candidate({
          slug: 'due-today',
          card: reviewCard({
            dueAt: generatedAt,
            lastReviewAt: new Date('2025-12-01T00:00:00.000Z'),
            stability: 1,
          }),
          practice: practice({ lastRating: 'good' }),
        }),
        candidate({ slug: 'unstarted' }),
      ],
      defaultUserSettings,
      generatedAt,
    )

    expect(queue.dueToday).toBe(queue.dueCount)
    expect(queue.newAvailable).toBe(queue.newCount)
    expect(queue.queueLoad).toBe(queue.items.length)
    expect(queue.recommendationReason).toBe(queue.topRecommendation?.reason)
    expect(queue.topRecommendation?.reason).toBe('due-today')
  })

  it('returns null topRecommendation for an empty queue', () => {
    const queue = buildTodayQueue([], defaultUserSettings, generatedAt)

    expect(queue.topRecommendation).toBeNull()
    expect(queue.excludedCount).toBe(0)
  })
})

describe('QueueCandidate track independence', () => {
  it('accepts only problem and practice state — no track membership fields', () => {
    // QueueCandidate is { problem, state } only.
    // Track selection, membership, order, and progress play no role in queue building.
    const c: QueueCandidate = candidate({ slug: 'two-sum' })

    expect(Object.keys(c)).toEqual(['problem', 'state'])
  })
})

function candidate(input: {
  slug: string
  title?: string
  isPremium?: boolean
  practice?: PracticeStateSnapshot | null
  card?: FsrsCardSnapshot | null
  now?: Date
}): QueueCandidate {
  const problemSlug = input.slug
  const cardId = `${problemSlug}:default`

  return {
    problem: {
      ...baseProblem,
      slug: problemSlug,
      title: input.title ?? titleFromSlug(problemSlug),
      isPremium: input.isPremium ?? false,
    },
    state: deriveNormalizedPracticeState({
      problemSlug,
      cardId,
      practice: input.practice ?? null,
      card: input.card ?? null,
      attempts: [],
      now: input.now ?? generatedAt,
    }),
  }
}

function practice(input: {
  lastRating?: ReviewRating
  lastReviewedAt?: Date
  isSuspended?: boolean
  status?: PracticeStateSnapshot['status']
}): PracticeStateSnapshot {
  const lastRating = input.lastRating ?? 'good'

  return {
    status: input.status ?? (input.isSuspended ? 'suspended' : 'review'),
    lastReviewedAt:
      input.lastReviewedAt ?? new Date('2026-01-01T08:00:00.000Z'),
    attemptCount: 1,
    solvedCount: lastRating === 'again' ? 0 : 1,
    isSuspended: input.isSuspended ?? false,
    lastRating,
    lastElapsedSeconds: null,
    bestElapsedSeconds: null,
    log: {
      interviewPattern: null,
      timeComplexity: null,
      spaceComplexity: null,
      languages: null,
      notes: null,
    },
  }
}

function reviewCard(
  overrides: Partial<FsrsCardSnapshot> = {},
): FsrsCardSnapshot {
  return {
    dueAt: new Date('2025-12-25T00:00:00.000Z'),
    stability: 1,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    state: 'review',
    lastReviewAt: new Date('2025-12-01T00:00:00.000Z'),
    ...overrides,
  }
}

function titleFromSlug(slug: string) {
  return slug
    .split('-')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')
}
