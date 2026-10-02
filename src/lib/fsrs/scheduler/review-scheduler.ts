import type { FsrsCardSnapshot } from '../domain/card-snapshot'
import type { FsrsSchedulingOptions } from '../domain/scheduling-options'
import type { FsrsReviewLogSnapshot } from '../domain/review-log-snapshot'
import type { ReviewRating } from '../domain/review-rating'
import {
  calculateCardRetrievability,
  calculateCardTargetRetentionDuration,
  createEmptyCardSnapshot,
  scheduleCardReview,
} from '../adapter/ts-fsrs-adapter'

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
