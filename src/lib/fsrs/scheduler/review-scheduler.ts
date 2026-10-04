import {
  parseFsrsCardSnapshot,
  toSerializableFsrsCardSnapshot,
  type FsrsCardSnapshot,
} from '../domain/card-snapshot'
import type { FsrsSchedulingOptions } from '../domain/scheduling-options'
import type { FsrsReviewLogSnapshot } from '../domain/review-log-snapshot'
import type { ReviewRating } from '../domain/review-rating'
import {
  readFsrsSchedulerProfile,
  type FsrsSchedulerProfile,
} from '../domain/scheduler-profile'
import {
  assertExactFsrsSchedulerProfile,
  calculateCardRetrievability,
  calculateCardTargetRetentionDuration,
  createEmptyCardSnapshot,
  resolveFsrsSchedulerProfile,
  scheduleCardReview,
  scheduleCardReviewWithProfile,
} from '../adapter/ts-fsrs-adapter'
import type { FsrsReviewContext } from './review-correction'

/** Result of applying one review rating to a card snapshot. */
export interface FsrsScheduledReview {
  card: FsrsCardSnapshot
  log: FsrsReviewLogSnapshot
  reviewedAt: Date
  rating: ReviewRating
}

/** Minimal historical review entry needed to replay an FSRS schedule. */
export interface FsrsReviewHistoryEntry {
  reviewedAt: Date
  rating: ReviewRating
}

/** Options for simulating future review dates from an existing card. */
export interface FsrsReviewScheduleProjectionOptions extends FsrsSchedulingOptions {
  startAt?: Date | undefined
  horizonDays?: number | undefined
  maxReviews?: number | undefined
  assumedRating?: ReviewRating | undefined
}

/** One simulated future review and the resulting card/log state. */
export type FsrsProjectedReview = FsrsScheduledReview

/** Captures the complete effective configuration of the supported FSRS engine. */
export function createFsrsSchedulerProfile(
  options: FsrsSchedulingOptions = {},
): FsrsSchedulerProfile {
  return resolveFsrsSchedulerProfile(options)
}

/** Decodes a detached profile and requires exact native reconstruction. */
export function parseFsrsSchedulerProfile(
  value: unknown,
): FsrsSchedulerProfile {
  const profile = readFsrsSchedulerProfile(value)
  assertExactFsrsSchedulerProfile(profile)
  return profile
}

/** Serializes a validated profile in canonical field order. */
export function serializeFsrsSchedulerProfile(
  profile: FsrsSchedulerProfile,
): string {
  return JSON.stringify(parseFsrsSchedulerProfile(profile))
}

/** Decodes a serialized profile without changing its effective parameters. */
export function parseSerializedFsrsSchedulerProfile(
  value: string,
): FsrsSchedulerProfile {
  return parseFsrsSchedulerProfile(JSON.parse(value))
}

/** Creates a new dependency-free FSRS card snapshot. */
export function createInitialFsrsCard(now = new Date()): FsrsCardSnapshot {
  return createEmptyCardSnapshot(now)
}

/** Applies one review rating and returns the updated FSRS card snapshot. */
export function scheduleReview(
  card: FsrsCardSnapshot,
  rating: ReviewRating,
  reviewedAt = new Date(),
  options: FsrsSchedulingOptions = {},
): FsrsScheduledReview {
  const scheduledReview = scheduleCardReview(card, rating, reviewedAt, options)

  return {
    card: scheduledReview.card,
    log: scheduledReview.log,
    reviewedAt,
    rating,
  }
}

/** Applies one review while capturing its immutable original scheduling inputs. */
export function scheduleReviewWithProfile(
  card: FsrsCardSnapshot,
  rating: ReviewRating,
  reviewedAt: Date,
  inputProfile: FsrsSchedulerProfile,
): FsrsScheduledReview & { readonly context: FsrsReviewContext } {
  const preCard = toSerializableFsrsCardSnapshot(card)

  if (!(reviewedAt instanceof Date) || !Number.isFinite(reviewedAt.getTime())) {
    throw new Error('Invalid FSRS review time.')
  }

  if (card.lastReviewAt && reviewedAt.getTime() < card.lastReviewAt.getTime()) {
    throw new Error('FSRS review time precedes the captured last review.')
  }

  const profile = parseFsrsSchedulerProfile(inputProfile)
  const context: FsrsReviewContext = Object.freeze({
    preCard,
    reviewedAt: reviewedAt.toISOString(),
    profile,
  })
  const scheduled = scheduleCardReviewWithProfile(
    parseFsrsCardSnapshot(preCard),
    rating,
    new Date(context.reviewedAt),
    profile,
  )

  return {
    ...scheduled,
    rating,
    reviewedAt: new Date(context.reviewedAt),
    context,
  }
}

/** Calculates card retrievability at a point in time. */
export function getRetrievability(
  card: FsrsCardSnapshot,
  at = new Date(),
  options: FsrsSchedulingOptions = {},
): number {
  return calculateCardRetrievability(card, at, options)
}

/**
 * Returns the total elapsed days after the latest review when the same FSRS
 * forgetting curve reaches `targetRetention`, or null when that duration is
 * not a finite positive current-card value.
 */
export function getTargetRetentionDuration(
  card: FsrsCardSnapshot,
  targetRetention: number,
  options: FsrsSchedulingOptions = {},
): number | null {
  return calculateCardTargetRetentionDuration(card, targetRetention, options)
}

/** Rebuilds a card by replaying review history in chronological order. */
export function replayReviewHistory(
  history: readonly FsrsReviewHistoryEntry[],
  options: FsrsSchedulingOptions = {},
): FsrsCardSnapshot | null {
  return replayReviewHistorySequence(history, options).at(-1)?.card ?? null
}

/** Replays review history and returns every scheduled review result. */
export function replayReviewHistorySequence(
  history: readonly FsrsReviewHistoryEntry[],
  options: FsrsSchedulingOptions = {},
): FsrsScheduledReview[] {
  const orderedHistory = history.toSorted(
    (left, right) => left.reviewedAt.getTime() - right.reviewedAt.getTime(),
  )
  const [firstReview] = orderedHistory

  if (!firstReview) {
    return []
  }

  const sequence: FsrsScheduledReview[] = []
  let currentCard = createInitialFsrsCard(firstReview.reviewedAt)

  for (const entry of orderedHistory) {
    const scheduledReview = scheduleReview(
      currentCard,
      entry.rating,
      entry.reviewedAt,
      options,
    )

    sequence.push(scheduledReview)
    currentCard = scheduledReview.card
  }

  return sequence
}

/** Projects future reviews by assuming each simulated review gets one rating. */
export function projectReviewSchedule(
  card: FsrsCardSnapshot,
  options: FsrsReviewScheduleProjectionOptions = {},
): FsrsProjectedReview[] {
  const {
    assumedRating = 'good',
    horizonDays: rawHorizonDays = defaultProjectionHorizonDays,
    maxReviews: rawMaxReviews = defaultProjectionMaxReviews,
    startAt = new Date(),
  } = options
  const horizonDays = normalizeProjectionHorizonDays(rawHorizonDays)
  const maxReviews = normalizeProjectionMaxReviews(rawMaxReviews)
  const schedulingOptions = readSchedulingOptions(options)
  const horizonAt = new Date(startAt.getTime() + horizonDays * dayMs)
  const projections: FsrsProjectedReview[] = []
  let currentCard = card
  let reviewAt = card.dueAt.getTime() > startAt.getTime() ? card.dueAt : startAt

  for (
    let reviewCount = 0;
    reviewCount < maxReviews && reviewAt.getTime() <= horizonAt.getTime();
    reviewCount += 1
  ) {
    const projected = scheduleReview(
      currentCard,
      assumedRating,
      reviewAt,
      schedulingOptions,
    )
    projections.push(projected)

    if (projected.card.dueAt.getTime() <= reviewAt.getTime()) {
      break
    }

    currentCard = projected.card
    reviewAt = projected.card.dueAt
  }

  return projections
}

function readSchedulingOptions(
  options: FsrsReviewScheduleProjectionOptions,
): FsrsSchedulingOptions {
  return {
    targetRetention: options.targetRetention,
    maximumInterval: options.maximumInterval,
    weights: options.weights,
    enableFuzz: options.enableFuzz,
    enableShortTerm: options.enableShortTerm,
    learningSteps: options.learningSteps,
    relearningSteps: options.relearningSteps,
  }
}

function normalizeProjectionHorizonDays(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Invalid FSRS projection horizon "${value}". Use a finite number greater than or equal to 0.`,
    )
  }

  return value
}

function normalizeProjectionMaxReviews(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Invalid FSRS projection max reviews "${value}". Use a whole number greater than or equal to 0.`,
    )
  }

  return value
}

const dayMs = 24 * 60 * 60 * 1000
const defaultProjectionHorizonDays = 90
const defaultProjectionMaxReviews = 50
