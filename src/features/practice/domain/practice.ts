import {
  getRetrievability,
  type FsrsCardKind,
  type FsrsCardSnapshot,
  type ReviewRating,
} from '@/lib/fsrs'
import type { ProblemSlug } from '@/features/problems/domain'

import { derivePracticeScheduleTiming } from './practice-schedule'

export const practiceStatuses = [
  'new',
  'learning',
  'review',
  'mastered',
  'suspended',
] as const

export const reviewModes = ['manual', 'leetcode'] as const

export type PracticeStatus = (typeof practiceStatuses)[number]
export type ReviewMode = (typeof reviewModes)[number]

export function parsePracticeStatus(value: string): PracticeStatus {
  if (!practiceStatuses.includes(value as PracticeStatus)) {
    throw new Error(`Invalid practice status "${value}".`)
  }

  return value as PracticeStatus
}

export const practicePhases = [
  'new',
  'learning',
  'review',
  'relearning',
  'suspended',
] as const

export type PracticePhase = (typeof practicePhases)[number]

export interface PracticeLogFields {
  interviewPattern?: string | null | undefined
  timeComplexity?: string | null | undefined
  spaceComplexity?: string | null | undefined
  languages?: string | null | undefined
  notes?: string | null | undefined
}

export interface SaveReviewResultInput {
  problemSlug: ProblemSlug
  rating: ReviewRating
  reviewedAt?: Date | undefined
  reviewMode?: ReviewMode | undefined
  elapsedSeconds?: number | null | undefined
  isCorrect?: boolean | null | undefined
  log?: PracticeLogFields | undefined
  cardKind?: FsrsCardKind | undefined
  targetRetention?: number | undefined
  reviewAttemptId?: string | undefined
}

export interface OverrideLastReviewResultInput {
  problemSlug: ProblemSlug
  rating: ReviewRating
  elapsedSeconds?: number | null | undefined
  isCorrect?: boolean | null | undefined
  log?: PracticeLogFields | undefined
  cardKind?: FsrsCardKind | undefined
  targetRetention?: number | undefined
}

export interface SetPracticeSuspendedInput {
  problemSlug: ProblemSlug
  suspended: boolean
}

export interface ResetPracticeScheduleInput {
  problemSlug: ProblemSlug
  keepLog?: boolean | undefined
}

export interface ReviewResult {
  problemSlug: ProblemSlug
  cardId: string
  reviewAttemptId: string
  rating: ReviewRating
  status: PracticeStatus
  dueAt: Date
  reviewedAt: Date
  card: FsrsCardSnapshot
  summary: PracticeSummary
}

export interface PracticeReadOptions {
  cardKind?: FsrsCardKind | undefined
  now?: Date | undefined
}

export interface PracticeStateSnapshot {
  status: PracticeStatus
  lastReviewedAt: Date | null
  attemptCount: number
  solvedCount: number
  isSuspended: boolean
  lastRating: ReviewRating | null
  lastElapsedSeconds: number | null
  bestElapsedSeconds: number | null
  log: Required<PracticeLogFields>
}

export interface PracticeReviewAttemptSnapshot {
  id: string
  problemSlug: ProblemSlug
  cardId: string
  rating: ReviewRating
  reviewMode: ReviewMode
  reviewedAt: Date
  elapsedSeconds: number | null
  isCorrect: boolean | null
  log: Required<PracticeLogFields>
  createdAt: Date
  updatedAt: Date
}

export interface PracticeSummary {
  phase: PracticePhase
  nextReviewAt: Date | null
  lastReviewedAt: Date | null
  reviewCount: number
  lapses: number
  difficulty: number | null
  stability: number | null
  scheduledDays: number | null
  suspended: boolean
  isStarted: boolean
  isDue: boolean
  isOverdue: boolean
  overdueDays: number
  retrievability: number | null
}

/**
 * Superset of NormalizedPracticeState used by the overlay session.
 * Adds raw `practice` and `card` snapshots needed by mutation logic
 * (override last review, reset schedule, update log).
 *
 * Note: some fields are intentionally redundant — e.g. `lapses` (flat, from
 * NormalizedPracticeState) and `card.lapses` (raw) are the same value.
 * Prefer the flat fields for reads. Use raw objects only when passing to
 * mutation functions that require them.
 */
export interface PracticeDetails extends NormalizedPracticeState {
  practice: PracticeStateSnapshot | null
  card: FsrsCardSnapshot | null
  currentLog: Required<PracticeLogFields>
  canOverrideLatestReview: boolean
}

/**
 * Flat read contract for scheduling consumers: Queue, Analytics, Library, Tracks.
 * All FSRS and practice facts are pre-computed here. Consumers typed to this
 * interface never touch raw DB snapshots or FSRS card objects.
 */
export interface NormalizedPracticeState {
  // Identity
  problemSlug: ProblemSlug
  cardId: string

  // Status (from DB practice row)
  status: PracticeStatus
  isSuspended: boolean

  // Scheduling (computed)
  phase: PracticePhase
  isStarted: boolean
  isDue: boolean
  isOverdue: boolean
  overdueDays: number
  dueAt: Date | null
  lastReviewedAt: Date | null

  // FSRS metrics (computed from card)
  retrievability: number | null
  stability: number | null
  difficulty: number | null
  scheduledDays: number | null
  lapses: number
  reviewCount: number

  // History
  reviewHistory: PracticeReviewAttemptSnapshot[] // full list
  recentAttempts: PracticeReviewAttemptSnapshot[] // last 5
  latestAttempt: PracticeReviewAttemptSnapshot | null
}

export function deriveNormalizedPracticeState(input: {
  problemSlug: ProblemSlug
  cardId: string
  practice: PracticeStateSnapshot | null
  card: FsrsCardSnapshot | null
  attempts: PracticeReviewAttemptSnapshot[]
  now?: Date
}): NormalizedPracticeState {
  const summary = derivePracticeSummary({
    practice: input.practice,
    card: input.card,
    now: input.now,
  })

  return {
    problemSlug: input.problemSlug,
    cardId: input.cardId,
    status: input.practice?.status ?? 'new',
    isSuspended: summary.suspended,
    phase: summary.phase,
    isStarted: summary.isStarted,
    isDue: summary.isDue,
    isOverdue: summary.isOverdue,
    overdueDays: summary.overdueDays,
    dueAt: summary.nextReviewAt,
    lastReviewedAt: summary.lastReviewedAt,
    retrievability: summary.retrievability,
    stability: summary.stability,
    difficulty: summary.difficulty,
    scheduledDays: summary.scheduledDays,
    lapses: summary.lapses,
    reviewCount: summary.reviewCount,
    reviewHistory: input.attempts,
    recentAttempts: input.attempts.slice(-5).reverse(),
    latestAttempt: input.attempts.at(-1) ?? null,
  }
}

export function statusFromReview(
  rating: ReviewRating,
  card: FsrsCardSnapshot,
): PracticeStatus {
  if (rating === 'again') {
    return 'learning'
  }

  if (card.state === 'new' || card.state === 'learning') {
    return 'learning'
  }

  if (card.state === 'relearning') {
    return 'learning'
  }

  return 'review'
}

export function derivePracticeSummary(input: {
  practice: PracticeStateSnapshot | null
  card: FsrsCardSnapshot | null
  now?: Date | undefined
}): PracticeSummary {
  const now = input.now ?? new Date()
  const suspended =
    input.practice?.isSuspended === true ||
    input.practice?.status === 'suspended'
  const reviewCount = input.card?.reps ?? input.practice?.attemptCount ?? 0
  const lastReviewedAt =
    input.card?.lastReviewAt ?? input.practice?.lastReviewedAt ?? null
  const isStarted =
    reviewCount > 0 ||
    Boolean(lastReviewedAt) ||
    (input.practice?.attemptCount ?? 0) > 0
  const retrievability =
    input.card && input.card.lastReviewAt
      ? getRetrievability(input.card, now)
      : null
  const timing = derivePracticeScheduleTiming({
    dueAt: input.card?.dueAt ?? null,
    isStarted,
    isSuspended: suspended,
    now,
  })

  return {
    phase: suspended
      ? 'suspended'
      : phaseFromPracticeAndCard(input.practice, input.card),
    nextReviewAt: input.card?.dueAt ?? null,
    lastReviewedAt,
    reviewCount,
    lapses: input.card?.lapses ?? 0,
    difficulty: input.card?.difficulty ?? null,
    stability: input.card?.stability ?? null,
    scheduledDays: input.card?.scheduledDays ?? null,
    suspended,
    isStarted,
    isDue: timing.isDue,
    isOverdue: timing.isOverdue,
    overdueDays: timing.overdueDays,
    retrievability,
  }
}

export function normalizeReviewLogFields(
  log?: PracticeLogFields | null,
): Required<PracticeLogFields> {
  return {
    interviewPattern: normalizeOptionalLogValue(log?.interviewPattern),
    timeComplexity: normalizeOptionalLogValue(log?.timeComplexity),
    spaceComplexity: normalizeOptionalLogValue(log?.spaceComplexity),
    languages: normalizeOptionalLogValue(log?.languages),
    notes: normalizeOptionalLogValue(log?.notes),
  }
}

function phaseFromPracticeAndCard(
  practice: PracticeStateSnapshot | null,
  card: FsrsCardSnapshot | null,
): PracticePhase {
  if (card) {
    return card.state
  }

  switch (practice?.status) {
    case 'learning':
      return 'learning'
    case 'review':
    case 'mastered':
      return 'review'
    case 'new':
    case 'suspended':
    case undefined:
      return 'new'
  }
}

function normalizeOptionalLogValue(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
