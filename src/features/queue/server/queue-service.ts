import { and, asc, eq } from 'drizzle-orm'

import {
  normalizeProblemDifficulty,
  type Problem,
} from '@/features/problems/domain'
import {
  deriveNormalizedPracticeState,
  normalizeReviewLogFields,
  parsePracticeStatus,
  type PracticeStateSnapshot,
} from '@/features/practice/domain'
import { getSettings } from '@/features/settings/server/settings-service'
import {
  defaultFsrsCardKind,
  parseFsrsCardState,
  parseReviewRating,
  type FsrsCardSnapshot,
} from '@/lib/fsrs'
import type { Db } from '@/platform/db'
import { fsrsCards, problemPractice, problems } from '@/platform/db/schema'

import { buildTodayQueue, type QueueCandidate } from '../domain'

export async function getTodayQueue(db: Db, generatedAt = new Date()) {
  const settings = await getSettings(db)
  const candidates = await readQueueCandidates(db, generatedAt)

  return buildTodayQueue(candidates, settings, generatedAt)
}

async function readQueueCandidates(
  db: Db,
  now: Date,
): Promise<QueueCandidate[]> {
  const rows = await db
    .select(queueCandidateSelection)
    .from(problems)
    .leftJoin(problemPractice, eq(problemPractice.problemSlug, problems.slug))
    .leftJoin(
      fsrsCards,
      and(
        eq(fsrsCards.problemSlug, problems.slug),
        eq(fsrsCards.cardKind, defaultFsrsCardKind),
      ),
    )
    .orderBy(asc(problems.slug))

  return rows.map((row) => mapQueueCandidate(row, now))
}

const queueCandidateSelection = {
  problem: {
    slug: problems.slug,
    title: problems.title,
    difficulty: problems.difficulty,
    isPremium: problems.isPremium,
    createdAt: problems.createdAt,
    updatedAt: problems.updatedAt,
  },
  practice: {
    status: problemPractice.status,
    lastReviewedAt: problemPractice.lastReviewedAt,
    attemptCount: problemPractice.attemptCount,
    solvedCount: problemPractice.solvedCount,
    isSuspended: problemPractice.isSuspended,
    lastRating: problemPractice.lastRating,
    lastElapsedSeconds: problemPractice.lastElapsedSeconds,
    bestElapsedSeconds: problemPractice.bestElapsedSeconds,
    interviewPattern: problemPractice.interviewPattern,
    timeComplexity: problemPractice.timeComplexity,
    spaceComplexity: problemPractice.spaceComplexity,
    languages: problemPractice.languages,
    notes: problemPractice.notes,
  },
  card: {
    id: fsrsCards.id,
    dueAt: fsrsCards.dueAt,
    stability: fsrsCards.stability,
    difficulty: fsrsCards.difficulty,
    elapsedDays: fsrsCards.elapsedDays,
    scheduledDays: fsrsCards.scheduledDays,
    learningSteps: fsrsCards.learningSteps,
    reps: fsrsCards.reps,
    lapses: fsrsCards.lapses,
    state: fsrsCards.state,
    lastReviewAt: fsrsCards.lastReviewAt,
  },
} as const

function mapQueueCandidate(
  row: {
    problem: QueueProblemRow
    practice: QueuePracticeRow | null
    card: QueueCardRow | null
  },
  now: Date,
): QueueCandidate {
  const problemSlug = row.problem.slug
  const cardId = row.card?.id ?? `${problemSlug}:${defaultFsrsCardKind}`
  const practice = mapPractice(row.practice)
  const card = mapCard(row.card)

  return {
    problem: mapProblem(row.problem),
    state: deriveNormalizedPracticeState({
      problemSlug,
      cardId,
      practice,
      card,
      attempts: [],
      now,
    }),
  }
}

interface QueueProblemRow {
  slug: string
  title: string
  difficulty: string
  isPremium: boolean
  createdAt: number
  updatedAt: number
}

interface QueuePracticeRow {
  status: string | null
  lastReviewedAt: number | null
  attemptCount: number | null
  solvedCount: number | null
  isSuspended: boolean | null
  lastRating: string | null
  lastElapsedSeconds: number | null
  bestElapsedSeconds: number | null
  interviewPattern: string | null
  timeComplexity: string | null
  spaceComplexity: string | null
  languages: string | null
  notes: string | null
}

interface QueueCardRow {
  id: string | null
  dueAt: number | null
  stability: number | null
  difficulty: number | null
  elapsedDays: number | null
  scheduledDays: number | null
  learningSteps: number | null
  reps: number | null
  lapses: number | null
  state: string | null
  lastReviewAt: number | null
}

function mapProblem(row: QueueProblemRow): Problem {
  return {
    slug: row.slug,
    title: row.title,
    difficulty: normalizeProblemDifficulty(row.difficulty),
    isPremium: row.isPremium,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

function mapPractice(
  row: QueuePracticeRow | null,
): PracticeStateSnapshot | null {
  if (!row || row.status === null) {
    return null
  }

  return {
    status: parsePracticeStatus(row.status),
    lastReviewedAt:
      row.lastReviewedAt === null ? null : new Date(row.lastReviewedAt),
    attemptCount: row.attemptCount ?? 0,
    solvedCount: row.solvedCount ?? 0,
    isSuspended: row.isSuspended ?? false,
    lastRating:
      row.lastRating === null ? null : parseReviewRating(row.lastRating),
    lastElapsedSeconds: row.lastElapsedSeconds,
    bestElapsedSeconds: row.bestElapsedSeconds,
    log: normalizeReviewLogFields({
      interviewPattern: row.interviewPattern,
      timeComplexity: row.timeComplexity,
      spaceComplexity: row.spaceComplexity,
      languages: row.languages,
      notes: row.notes,
    }),
  }
}

function mapCard(row: QueueCardRow | null): FsrsCardSnapshot | null {
  if (!row || row.dueAt === null || row.state === null) {
    return null
  }

  return {
    dueAt: new Date(row.dueAt),
    stability: row.stability ?? 0,
    difficulty: row.difficulty ?? 0,
    elapsedDays: row.elapsedDays ?? 0,
    scheduledDays: row.scheduledDays ?? 0,
    learningSteps: row.learningSteps ?? 0,
    reps: row.reps ?? 0,
    lapses: row.lapses ?? 0,
    state: parseFsrsCardState(row.state),
    lastReviewAt: row.lastReviewAt === null ? null : new Date(row.lastReviewAt),
  }
}
