import { isFsrsCardState, type FsrsCardState } from './card-snapshot'
import { isReviewRating, type ReviewRating } from './review-rating'
import {
  isCanonicalIsoDateString,
  isNonNegativeInteger,
  isNonNegativeNumber,
  isRecord,
} from './snapshot-validation'

/** Serializable ts-fsrs review log snapshot stored for future rollback. */
export interface FsrsReviewLogSnapshot {
  rating: ReviewRating
  state: FsrsCardState
  dueAt: string
  stability: number
  difficulty: number
  /** @deprecated Upstream ts-fsrs removes elapsed_days in v6. */
  elapsedDays: number
  /** @deprecated Upstream ts-fsrs removes last_elapsed_days in v6. */
  lastElapsedDays: number
  scheduledDays: number
  learningSteps: number
  reviewedAt: string
}

/** Checks whether a parsed JSON value is a valid stored FSRS review log. */
export function isFsrsReviewLogSnapshot(
  value: unknown,
): value is FsrsReviewLogSnapshot {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.rating === 'string' &&
    isReviewRating(value.rating) &&
    typeof value.state === 'string' &&
    isFsrsCardState(value.state) &&
    isCanonicalIsoDateString(value.dueAt) &&
    isNonNegativeNumber(value.stability) &&
    isNonNegativeNumber(value.difficulty) &&
    isNonNegativeInteger(value.elapsedDays) &&
    isNonNegativeInteger(value.lastElapsedDays) &&
    isNonNegativeInteger(value.scheduledDays) &&
    isNonNegativeInteger(value.learningSteps) &&
    isCanonicalIsoDateString(value.reviewedAt)
  )
}

/** Parses a persisted FSRS review log snapshot at storage boundaries. */
export function parseFsrsReviewLogSnapshot(
  value: unknown,
): FsrsReviewLogSnapshot {
  if (!isFsrsReviewLogSnapshot(value)) {
    throw new Error('Invalid FSRS review log snapshot.')
  }

  return Object.freeze({
    rating: value.rating,
    state: value.state,
    dueAt: value.dueAt,
    stability: value.stability,
    difficulty: value.difficulty,
    elapsedDays: value.elapsedDays,
    lastElapsedDays: value.lastElapsedDays,
    scheduledDays: value.scheduledDays,
    learningSteps: value.learningSteps,
    reviewedAt: value.reviewedAt,
  })
}

/** Serializes an FSRS review log snapshot for persistence. */
export function serializeFsrsReviewLogSnapshot(
  log: FsrsReviewLogSnapshot,
): string {
  return JSON.stringify(parseFsrsReviewLogSnapshot(log))
}

/** Parses a serialized FSRS review log snapshot from persistence. */
export function parseSerializedFsrsReviewLogSnapshot(
  value: string,
): FsrsReviewLogSnapshot {
  return parseFsrsReviewLogSnapshot(JSON.parse(value))
}
