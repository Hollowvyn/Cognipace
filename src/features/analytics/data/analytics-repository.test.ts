import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { problemDifficulties } from '@/features/problems/domain'
import type { Db } from '@/platform/db'
import { createTestDb } from '@/platform/db/test-db'
import {
  fsrsCards,
  problemPractice,
  problemTopics,
  problems,
  reviewAttempts,
  topics,
} from '@/platform/db/schema'

import {
  getReviewDayStats,
  getRecentRatings,
  getCurrentFsrsCards,
  getUpcomingCards,
  getReviewEvents,
  getReviewHistory,
} from './analytics-repository'

const BASE_TS = new Date('2026-01-15T12:00:00.000Z').getTime()
const ts = (d: Date) => d.getTime()

async function insertCard(
  db: Db,
  slug: string,
  opts: {
    id?: string
    cardKind?: string
    dueAt?: number
    lastReviewAt?: number | null
    lapses?: number
    difficulty?: number
    stability?: number
  } = {},
) {
  const id = opts.id ?? `${slug}:default`
  await db.insert(fsrsCards).values({
    id,
    problemSlug: slug,
    cardKind: opts.cardKind ?? 'default',
    dueAt: opts.dueAt ?? BASE_TS,
    stability: opts.stability ?? 10,
    difficulty: opts.difficulty ?? 5,
    elapsedDays: 7,
    scheduledDays: 7,
    learningSteps: 0,
    reps: 1,
    lapses: opts.lapses ?? 0,
    state: 'review',
    lastReviewAt: opts.lastReviewAt === undefined ? BASE_TS : opts.lastReviewAt,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
  })
  return id
}

async function insertPractice(
  db: Db,
  slug: string,
  opts: { isSuspended?: boolean; status?: string } = {},
) {
  await db.insert(problemPractice).values({
    problemSlug: slug,
    status: opts.status ?? 'review',
    firstSeenAt: BASE_TS,
    lastSeenAt: BASE_TS,
    lastReviewedAt: BASE_TS,
    isSuspended: opts.isSuspended ?? false,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
  })
}

async function insertAttempt(
  db: Db,
  id: string,
  slug: string,
  cardId: string,
  rating: string,
  reviewedAt: Date,
) {
  await db.insert(reviewAttempts).values({
    id,
    problemSlug: slug,
    cardId,
    rating,
    reviewMode: 'standard',
    reviewedAt: ts(reviewedAt),
    createdAt: ts(reviewedAt),
    updatedAt: ts(reviewedAt),
  })
}

async function insertProblemWithTopics(
  db: Db,
  slug: string,
  title: string,
  topicLabels: string[] = [],
) {
  await db.insert(problems).values({
    slug,
    title,
    difficulty: 'medium',
    isPremium: false,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
  })

  for (const label of topicLabels) {
    const topicId = `${slug}:${label.toLowerCase().replaceAll(' ', '-')}`
    await db.insert(topics).values({
      id: topicId,
      label,
      createdAt: BASE_TS,
      updatedAt: BASE_TS,
    })
    await db.insert(problemTopics).values({ problemSlug: slug, topicId })
  }
}

// ---------------------------------------------------------------------------

describe('getReviewDayStats', () => {
  it('returns zeros when no attempts exist', async () => {
    const { db } = await createTestDb()
    const result = await getReviewDayStats(db)
    expect(result.totalReviews).toBe(0)
    expect(result.reviewDays).toBe(0)
  })

  it('counts total reviews and distinct review days', async () => {
    const { db } = await createTestDb()
    const day1 = new Date('2026-01-10T09:00:00.000Z')
    const day2 = new Date('2026-01-11T09:00:00.000Z')

    const cardId = await insertCard(db, 'two-sum')
    await insertAttempt(db, 'a1', 'two-sum', cardId, 'good', day1)
    await insertAttempt(db, 'a2', 'two-sum', cardId, 'good', day1)
    await insertAttempt(db, 'a3', 'two-sum', cardId, 'again', day2)

    const result = await getReviewDayStats(db)
    expect(result.totalReviews).toBe(3)
    expect(result.reviewDays).toBe(2)
  })
})

// ---------------------------------------------------------------------------

describe('getRecentRatings', () => {
  it('returns empty when no attempts exist', async () => {
    const { db } = await createTestDb()
    const since = new Date('2026-01-01T00:00:00.000Z')
    const result = await getRecentRatings(db, since)
    expect(result).toEqual([])
  })

  it('includes attempts at or after the since cutoff and excludes earlier ones', async () => {
    const { db } = await createTestDb()
    const since = new Date('2026-01-10T00:00:00.000Z')
    const before = new Date('2026-01-09T23:59:59.999Z')
    const exactly = new Date('2026-01-10T00:00:00.000Z')
    const after = new Date('2026-01-11T09:00:00.000Z')

    const cardId = await insertCard(db, 'two-sum')
    await insertAttempt(db, 'a1', 'two-sum', cardId, 'hard', before)
    await insertAttempt(db, 'a2', 'two-sum', cardId, 'good', exactly)
    await insertAttempt(db, 'a3', 'two-sum', cardId, 'easy', after)

    const result = await getRecentRatings(db, since)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.rating)).toEqual(
      expect.arrayContaining(['good', 'easy']),
    )
  })

  it('returns correct rating and reviewedAt values', async () => {
    const { db } = await createTestDb()
    const reviewedAt = new Date('2026-01-12T08:00:00.000Z')
    const since = new Date('2026-01-01T00:00:00.000Z')

    const cardId = await insertCard(db, 'two-sum')
    await insertAttempt(db, 'a1', 'two-sum', cardId, 'again', reviewedAt)

    const [item] = await getRecentRatings(db, since)
    expect(item?.rating).toBe('again')
    expect(item?.reviewedAt.getTime()).toBe(reviewedAt.getTime())
  })

  it('supports an inclusive upper bound for the selected period', async () => {
    const { db } = await createTestDb()
    const since = new Date('2026-01-10T00:00:00.000Z')
    const until = new Date('2026-01-15T12:00:00.000Z')
    const inside = new Date('2026-01-15T12:00:00.000Z')
    const future = new Date('2026-01-15T12:00:00.001Z')

    const cardId = await insertCard(db, 'two-sum')
    await insertAttempt(db, 'inside', 'two-sum', cardId, 'good', inside)
    await insertAttempt(db, 'future', 'two-sum', cardId, 'again', future)

    const result = await getRecentRatings(db, since, until)

    expect(result.map((rating) => rating.rating)).toEqual(['good'])
  })
})

// ---------------------------------------------------------------------------

describe('review history reads', () => {
  it.each(problemDifficulties)('reads %s metadata', async (difficulty) => {
    const { db } = await createTestDb({ seed: false })
    const first = new Date('2026-01-10T09:00:00.000Z')
    const second = new Date('2026-01-11T09:00:00.000Z')
    const outside = new Date('2026-01-01T09:00:00.000Z')

    await insertProblemWithTopics(db, 'topic-problem', 'Topic Problem', [
      'Arrays',
      'Two Pointers',
    ])
    await insertProblemWithTopics(db, 'untagged-problem', 'Untagged Problem')
    const topicCardId = await insertCard(db, 'topic-problem')
    const untaggedCardId = await insertCard(db, 'untagged-problem')

    await db.insert(reviewAttempts).values([
      {
        id: 'outside',
        problemSlug: 'topic-problem',
        cardId: topicCardId,
        rating: 'again',
        reviewMode: 'standard',
        reviewedAt: ts(outside),
        isCorrect: false,
        fsrsReviewLog: '{"rating":"again"}',
        createdAt: ts(outside),
        updatedAt: ts(outside),
      },
      {
        id: 'later',
        problemSlug: 'untagged-problem',
        cardId: untaggedCardId,
        rating: 'easy',
        reviewMode: 'leetcode',
        reviewedAt: ts(second),
        isCorrect: null,
        fsrsReviewLog: null,
        createdAt: ts(second),
        updatedAt: ts(second),
      },
      {
        id: 'earlier',
        problemSlug: 'topic-problem',
        cardId: topicCardId,
        rating: 'good',
        reviewMode: 'manual',
        reviewedAt: ts(first),
        elapsedSeconds: 600,
        isCorrect: true,
        fsrsReviewLog: '{"rating":"good"}',
        createdAt: ts(first),
        updatedAt: ts(first),
      },
    ])

    await db
      .update(problems)
      .set({ difficulty })
      .where(eq(problems.slug, 'topic-problem'))
    const result = await getReviewEvents(db, { since: first, until: second })

    expect(result).toEqual([
      {
        id: 'earlier',
        problemSlug: 'topic-problem',
        cardId: topicCardId,
        title: 'Topic Problem',
        problemDifficulty: difficulty,
        elapsedSeconds: 600,
        topicLabels: ['Arrays', 'Two Pointers'],
        rating: 'good',
        reviewedAt: first,
        isCorrect: true,
        reviewMode: 'manual',
        fsrsReviewLog: '{"rating":"good"}',
      },
      {
        id: 'later',
        problemSlug: 'untagged-problem',
        cardId: untaggedCardId,
        title: 'Untagged Problem',
        problemDifficulty: 'medium',
        elapsedSeconds: null,
        topicLabels: [],
        rating: 'easy',
        reviewedAt: second,
        isCorrect: null,
        reviewMode: 'leetcode',
        fsrsReviewLog: null,
      },
    ])
  })

  it('returns complete replay history with deterministic timestamp and id ordering', async () => {
    const { db } = await createTestDb({ seed: false })
    const reviewedAt = new Date('2026-01-10T09:00:00.000Z')

    await insertProblemWithTopics(db, 'history-problem', 'History Problem')
    const cardId = await insertCard(db, 'history-problem')
    await db.insert(reviewAttempts).values([
      {
        id: 'z-review',
        problemSlug: 'history-problem',
        cardId,
        rating: 'good',
        reviewMode: 'manual',
        reviewedAt: ts(reviewedAt),
        isCorrect: true,
        fsrsReviewLog: null,
        createdAt: ts(reviewedAt),
        updatedAt: ts(reviewedAt),
      },
      {
        id: 'a-review',
        problemSlug: 'history-problem',
        cardId,
        rating: 'hard',
        reviewMode: 'manual',
        reviewedAt: ts(reviewedAt),
        isCorrect: null,
        fsrsReviewLog: null,
        createdAt: ts(reviewedAt),
        updatedAt: ts(reviewedAt),
      },
    ])

    const result = await getReviewHistory(db)

    expect(result.map((event) => event.id)).toEqual(['a-review', 'z-review'])
    expect(result[0]?.reviewedAt).toEqual(reviewedAt)
  })
})

// ---------------------------------------------------------------------------

describe('getUpcomingCards', () => {
  it('returns empty when no cards exist', async () => {
    const { db } = await createTestDb()
    const until = new Date('2026-02-01T00:00:00.000Z')
    const result = await getUpcomingCards(db, until)
    expect(result).toEqual([])
  })

  it('keeps the forecast end exclusive so the fixed 14-day window has no fifteenth-day card', async () => {
    const { db } = await createTestDb()
    const before = new Date('2026-01-15T00:00:00.000Z')
    const exactly = new Date('2026-01-20T00:00:00.000Z')

    await insertPractice(db, 'two-sum')
    await insertPractice(db, 'valid-parentheses')

    await insertCard(db, 'two-sum', { dueAt: ts(before) })
    await insertCard(db, 'valid-parentheses', { dueAt: ts(exactly) })

    const result = await getUpcomingCards(db, exactly)
    expect(result).toHaveLength(1)
    expect(result[0]?.dueAt.getTime()).toBe(ts(before))
  })

  it('excludes cards belonging to suspended problems', async () => {
    const { db } = await createTestDb()
    const until = new Date('2026-01-20T00:00:00.000Z')
    const due = new Date('2026-01-15T00:00:00.000Z')

    await insertPractice(db, 'two-sum', { isSuspended: true })
    await insertCard(db, 'two-sum', { dueAt: ts(due) })

    const result = await getUpcomingCards(db, until)
    expect(result).toEqual([])
  })

  it('excludes cards whose practice status is suspended', async () => {
    const { db } = await createTestDb()
    const until = new Date('2026-01-20T00:00:00.000Z')

    await insertPractice(db, 'two-sum', { status: 'suspended' })
    await insertCard(db, 'two-sum', {
      dueAt: ts(new Date('2026-01-15T00:00:00.000Z')),
    })

    await expect(getUpcomingCards(db, until)).resolves.toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('getCurrentFsrsCards', () => {
  it('returns default cards with identity, scheduling state, dates, and deterministic ordering', async () => {
    const { db } = await createTestDb({ seed: false })
    const earlierDue = new Date('2026-01-14T12:00:00.000Z')
    const laterDue = new Date('2026-01-15T12:00:00.000Z')
    const lastReview = new Date('2026-01-10T12:00:00.000Z')

    await insertProblemWithTopics(db, 'beta-problem', 'Beta Problem', ['Trees'])
    await insertProblemWithTopics(db, 'alpha-problem', 'Alpha Problem', [
      'Graphs',
      'Arrays',
    ])
    await insertPractice(db, 'beta-problem', {
      status: 'learning',
      isSuspended: true,
    })
    await insertPractice(db, 'alpha-problem', { status: 'review' })

    await insertCard(db, 'beta-problem', {
      dueAt: ts(earlierDue),
      lastReviewAt: null,
      stability: 4.5,
      difficulty: 7.25,
      lapses: 3,
    })
    await insertCard(db, 'alpha-problem', {
      dueAt: ts(laterDue),
      lastReviewAt: ts(lastReview),
      stability: 12.5,
      difficulty: 3.75,
      lapses: 1,
    })
    await insertCard(db, 'alpha-problem', {
      id: 'alpha-problem:filtered',
      cardKind: 'custom',
    })

    const result = await getCurrentFsrsCards(db)

    expect(result).toEqual([
      {
        cardId: 'alpha-problem:default',
        problemSlug: 'alpha-problem',
        title: 'Alpha Problem',
        topics: ['Arrays', 'Graphs'],
        stability: 12.5,
        difficulty: 3.75,
        elapsedDays: 7,
        scheduledDays: 7,
        learningSteps: 0,
        reps: 1,
        lapses: 1,
        dueAt: laterDue,
        createdAt: new Date(BASE_TS),
        lastReviewAt: lastReview,
        state: 'review',
        practiceStatus: 'review',
        isSuspended: false,
      },
      {
        cardId: 'beta-problem:default',
        problemSlug: 'beta-problem',
        title: 'Beta Problem',
        topics: ['Trees'],
        stability: 4.5,
        difficulty: 7.25,
        elapsedDays: 7,
        scheduledDays: 7,
        learningSteps: 0,
        reps: 1,
        lapses: 3,
        dueAt: earlierDue,
        createdAt: new Date(BASE_TS),
        lastReviewAt: null,
        state: 'review',
        practiceStatus: 'learning',
        isSuspended: true,
      },
    ])
  })
})
