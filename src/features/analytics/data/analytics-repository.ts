import { and, asc, count, eq, gte, lte, sql } from 'drizzle-orm'

import type { ProblemDifficulty } from '@/features/problems/domain'
import { defaultFsrsCardKind } from '@/lib/fsrs'

import type { Db } from '@/platform/db'

import {
  fsrsCards,
  fsrsSchedulerProfiles,
  practiceReviewEvidence,
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

export interface RecentRating {
  rating: string
  reviewedAt: Date
}

export interface ReviewEvent {
  id: string
  problemSlug: string
  cardId: string
  title: string
  problemDifficulty: ProblemDifficulty
  elapsedSeconds: number | null
  topicLabels: string[]
  rating: string
  reviewedAt: Date
  isCorrect: boolean | null
  reviewMode: string
  fsrsReviewLog: string | null
  applicationSequence: number | null
  schedulingEvidenceKind: 'captured' | 'legacy-derived' | 'unknown'
  schedulerProfileJson: string | null
  preCardJson: string | null
}

export interface ReviewEventRange {
  since: Date
  until: Date
}

export interface CurrentFsrsCard {
  cardId: string
  problemSlug: string
  title: string
  isPremium: boolean
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
  practiceLastReviewedAt: Date | null
  state: string
  practiceStatus: string
  isSuspended: boolean
  lastSchedulingEvidenceKind: 'captured' | 'legacy-derived' | 'unknown'
  lastSchedulerProfileJson: string | null
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

export async function getRecentRatings(
  db: Db,
  since: Date,
  until?: Date,
): Promise<RecentRating[]> {
  const rows = await db
    .select({
      rating: reviewAttempts.rating,
      reviewedAt: reviewAttempts.reviewedAt,
    })
    .from(reviewAttempts)
    .where(
      until
        ? and(
            gte(reviewAttempts.reviewedAt, since.getTime()),
            lte(reviewAttempts.reviewedAt, until.getTime()),
          )
        : gte(reviewAttempts.reviewedAt, since.getTime()),
    )
    .orderBy(asc(reviewAttempts.reviewedAt), asc(reviewAttempts.id))

  return rows.map((row) => ({
    rating: row.rating,
    reviewedAt: new Date(row.reviewedAt),
  }))
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
      problemDifficulty: problems.difficulty,
      elapsedSeconds: reviewAttempts.elapsedSeconds,
      topicLabel: topics.label,
      rating: reviewAttempts.rating,
      reviewedAt: reviewAttempts.reviewedAt,
      isCorrect: reviewAttempts.isCorrect,
      reviewMode: reviewAttempts.reviewMode,
      fsrsReviewLog: reviewAttempts.fsrsReviewLog,
      applicationSequence: practiceReviewEvidence.applicationSequence,
      schedulingEvidenceKind: practiceReviewEvidence.schedulingEvidenceKind,
      schedulerProfileJson: fsrsSchedulerProfiles.profileJson,
      preCardJson: practiceReviewEvidence.preCardJson,
    })
    .from(reviewAttempts)
    .innerJoin(problems, eq(problems.slug, reviewAttempts.problemSlug))
    .leftJoin(
      practiceReviewEvidence,
      eq(practiceReviewEvidence.reviewAttemptId, reviewAttempts.id),
    )
    .leftJoin(
      fsrsSchedulerProfiles,
      eq(fsrsSchedulerProfiles.id, practiceReviewEvidence.schedulerProfileId),
    )
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
      problemDifficulty: row.problemDifficulty,
      elapsedSeconds: row.elapsedSeconds,
      topicLabels: row.topicLabel === null ? [] : [row.topicLabel],
      rating: row.rating,
      reviewedAt: new Date(row.reviewedAt),
      isCorrect: row.isCorrect,
      reviewMode: row.reviewMode,
      fsrsReviewLog: row.fsrsReviewLog,
      applicationSequence: row.applicationSequence,
      schedulingEvidenceKind:
        row.schedulingEvidenceKind === 'captured' ||
        row.schedulingEvidenceKind === 'legacy-derived'
          ? row.schedulingEvidenceKind
          : 'unknown',
      schedulerProfileJson: row.schedulerProfileJson,
      preCardJson: row.preCardJson,
    })
  }

  return [...events.values()]
}

export async function getCurrentFsrsCards(db: Db): Promise<CurrentFsrsCard[]> {
  const recordedProfiles = await db
    .select({
      cardId: practiceReviewEvidence.cardId,
      applicationSequence: practiceReviewEvidence.applicationSequence,
      schedulingEvidenceKind: practiceReviewEvidence.schedulingEvidenceKind,
      schedulerProfileJson: fsrsSchedulerProfiles.profileJson,
    })
    .from(practiceReviewEvidence)
    .leftJoin(
      fsrsSchedulerProfiles,
      eq(fsrsSchedulerProfiles.id, practiceReviewEvidence.schedulerProfileId),
    )
    .orderBy(asc(practiceReviewEvidence.applicationSequence))
  const latestProfileByCard = new Map<
    string,
    (typeof recordedProfiles)[number]
  >()
  for (const profile of recordedProfiles) {
    const prior = latestProfileByCard.get(profile.cardId)
    if (!prior || prior.applicationSequence < profile.applicationSequence)
      latestProfileByCard.set(profile.cardId, profile)
  }
  const rows = await db
    .select({
      cardId: fsrsCards.id,
      problemSlug: fsrsCards.problemSlug,
      title: problems.title,
      isPremium: problems.isPremium,
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
      practiceLastReviewedAt: problemPractice.lastReviewedAt,
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
      isPremium: row.isPremium,
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
      practiceLastReviewedAt:
        row.practiceLastReviewedAt === null
          ? null
          : new Date(row.practiceLastReviewedAt),
      state: row.state,
      practiceStatus: row.practiceStatus,
      isSuspended: row.isSuspended,
      lastSchedulingEvidenceKind: 'unknown',
      lastSchedulerProfileJson: null,
    })
  }

  return [...cards.values()].map((card) => ({
    ...card,
    lastSchedulingEvidenceKind:
      latestProfileByCard.get(card.cardId)?.schedulingEvidenceKind ===
        'captured' ||
      latestProfileByCard.get(card.cardId)?.schedulingEvidenceKind ===
        'legacy-derived'
        ? (latestProfileByCard.get(card.cardId)!.schedulingEvidenceKind as
            | 'captured'
            | 'legacy-derived')
        : 'unknown',
    lastSchedulerProfileJson:
      latestProfileByCard.get(card.cardId)?.schedulerProfileJson ?? null,
    topics: [...new Set(card.topics)].sort((a, b) => a.localeCompare(b)),
  }))
}
