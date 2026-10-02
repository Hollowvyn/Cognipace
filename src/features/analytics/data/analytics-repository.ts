import { and, asc, count, eq, gte, lt, lte, ne, sql } from 'drizzle-orm'

import { defaultFsrsCardKind } from '@/lib/fsrs'

import type { Db } from '@/platform/db'

import {
  fsrsCards,
  problemPractice,
  problems,
  problemTopics,
  reviewAttempts,
  topics,
} from '@/platform/db/schema'

export interface ReviewDayStats {
  totalReviews: number
  reviewDays: number
}

export interface ReviewEvent {
  id: string
  problemSlug: string
  cardId: string
  title: string
  topicLabels: string[]
  rating: string
  reviewedAt: Date
  isCorrect: boolean | null
  reviewMode: string
  fsrsReviewLog: string | null
}

export interface ReviewEventRange {
  since: Date
  until: Date
}

export interface UpcomingCard {
  dueAt: Date
}

export interface CurrentFsrsCard {
  cardId: string
  problemSlug: string
  title: string
  topics: string[]
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  dueAt: Date
  createdAt: Date
  lastReviewAt: Date | null
  state: string
  practiceStatus: string
  isSuspended: boolean
}

export async function getReviewDayStats(db: Db): Promise<ReviewDayStats> {
  const [totals] = await db
    .select({
      totalReviews: count(),
      reviewDays: sql<number>`COUNT(DISTINCT strftime('%Y-%m-%d', datetime(${reviewAttempts.reviewedAt} / 1000, 'unixepoch', 'localtime')))`,
    })
    .from(reviewAttempts)

  return {
    totalReviews: totals?.totalReviews ?? 0,
    reviewDays: totals?.reviewDays ?? 0,
  }
}

export async function getReviewHistory(db: Db): Promise<ReviewEvent[]> {
  return getReviewEvents(db)
}

export async function getReviewEvents(
  db: Db,
  range?: ReviewEventRange,
): Promise<ReviewEvent[]> {
  const rows = await db
    .select({
      id: reviewAttempts.id,
      problemSlug: reviewAttempts.problemSlug,
      cardId: reviewAttempts.cardId,
      title: problems.title,
      topicLabel: topics.label,
      rating: reviewAttempts.rating,
      reviewedAt: reviewAttempts.reviewedAt,
      isCorrect: reviewAttempts.isCorrect,
      reviewMode: reviewAttempts.reviewMode,
      fsrsReviewLog: reviewAttempts.fsrsReviewLog,
    })
    .from(reviewAttempts)
    .innerJoin(problems, eq(problems.slug, reviewAttempts.problemSlug))
    .leftJoin(
      problemTopics,
      eq(problemTopics.problemSlug, reviewAttempts.problemSlug),
    )
    .leftJoin(topics, eq(topics.id, problemTopics.topicId))
    .where(
      range
        ? and(
            gte(reviewAttempts.reviewedAt, range.since.getTime()),
            lte(reviewAttempts.reviewedAt, range.until.getTime()),
          )
        : undefined,
    )
    .orderBy(
      asc(reviewAttempts.reviewedAt),
      asc(reviewAttempts.id),
      asc(topics.label),
    )

  const events = new Map<string, ReviewEvent>()

  for (const row of rows) {
    const event = events.get(row.id)
    if (event) {
      if (row.topicLabel !== null) event.topicLabels.push(row.topicLabel)
      continue
    }

    events.set(row.id, {
      id: row.id,
      problemSlug: row.problemSlug,
      cardId: row.cardId,
      title: row.title,
      topicLabels: row.topicLabel === null ? [] : [row.topicLabel],
      rating: row.rating,
      reviewedAt: new Date(row.reviewedAt),
      isCorrect: row.isCorrect,
      reviewMode: row.reviewMode,
      fsrsReviewLog: row.fsrsReviewLog,
    })
  }

  return [...events.values()]
}

export async function getUpcomingCards(
  db: Db,
  until: Date,
): Promise<UpcomingCard[]> {
  const rows = await db
    .select({ dueAt: fsrsCards.dueAt })
    .from(fsrsCards)
    .innerJoin(
      problemPractice,
      eq(problemPractice.problemSlug, fsrsCards.problemSlug),
    )
    .where(
      and(
        eq(fsrsCards.cardKind, defaultFsrsCardKind),
        lt(fsrsCards.dueAt, until.getTime()),
        eq(problemPractice.isSuspended, false),
        ne(problemPractice.status, 'suspended'),
      ),
    )
    .orderBy(asc(fsrsCards.dueAt), asc(fsrsCards.problemSlug))

  return rows.map((row) => ({ dueAt: new Date(row.dueAt) }))
}

export async function getCurrentFsrsCards(db: Db): Promise<CurrentFsrsCard[]> {
  const rows = await db
    .select({
      cardId: fsrsCards.id,
      problemSlug: fsrsCards.problemSlug,
      title: problems.title,
      topicLabel: topics.label,
      stability: fsrsCards.stability,
      difficulty: fsrsCards.difficulty,
      elapsedDays: fsrsCards.elapsedDays,
      scheduledDays: fsrsCards.scheduledDays,
      learningSteps: fsrsCards.learningSteps,
      reps: fsrsCards.reps,
      lapses: fsrsCards.lapses,
      dueAt: fsrsCards.dueAt,
      createdAt: fsrsCards.createdAt,
      lastReviewAt: fsrsCards.lastReviewAt,
      state: fsrsCards.state,
      practiceStatus: problemPractice.status,
      isSuspended: problemPractice.isSuspended,
    })
    .from(fsrsCards)
    .innerJoin(problems, eq(problems.slug, fsrsCards.problemSlug))
    .innerJoin(
      problemPractice,
      eq(problemPractice.problemSlug, fsrsCards.problemSlug),
    )
    .leftJoin(
      problemTopics,
      eq(problemTopics.problemSlug, fsrsCards.problemSlug),
    )
    .leftJoin(topics, eq(topics.id, problemTopics.topicId))
    .where(eq(fsrsCards.cardKind, defaultFsrsCardKind))
    .orderBy(asc(fsrsCards.problemSlug), asc(fsrsCards.id), asc(topics.label))

  const cards = new Map<string, CurrentFsrsCard>()

  for (const row of rows) {
    const card = cards.get(row.cardId)
    if (card) {
      if (row.topicLabel !== null) card.topics.push(row.topicLabel)
      continue
    }

    cards.set(row.cardId, {
      cardId: row.cardId,
      problemSlug: row.problemSlug,
      title: row.title,
      topics: row.topicLabel === null ? [] : [row.topicLabel],
      stability: row.stability,
      difficulty: row.difficulty,
      elapsedDays: row.elapsedDays,
      scheduledDays: row.scheduledDays,
      learningSteps: row.learningSteps,
      reps: row.reps,
      lapses: row.lapses,
      dueAt: new Date(row.dueAt),
      createdAt: new Date(row.createdAt),
      lastReviewAt:
        row.lastReviewAt === null ? null : new Date(row.lastReviewAt),
      state: row.state,
      practiceStatus: row.practiceStatus,
      isSuspended: row.isSuspended,
    })
  }

  return [...cards.values()].map((card) => ({
    ...card,
    topics: [...new Set(card.topics)].sort((a, b) => a.localeCompare(b)),
  }))
}
