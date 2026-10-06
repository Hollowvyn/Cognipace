import {
  assertValidFsrsCardSnapshot,
  isFsrsCardState,
  type FsrsCardSnapshot,
  type FsrsCardState,
} from './card-snapshot'
import { isReviewRating, type ReviewRating } from './review-rating'
import {
  readFsrsSchedulerProfile,
  type FsrsSchedulerProfile,
} from './scheduler-profile'
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

/**
 * Requires the pinned native prior-state log fields to match captured evidence.
 * Callers validate exact native profile reconstruction before this association.
 */
export function assertFsrsReviewLogMatchesPreCard(
  value: FsrsReviewLogSnapshot,
  preCard: FsrsCardSnapshot,
  inputProfile: FsrsSchedulerProfile,
): void {
  const log = parseFsrsReviewLogSnapshot(value)
  assertValidFsrsCardSnapshot(preCard)
  const profile = readFsrsSchedulerProfile(inputProfile)
  const expectedScheduledDays =
    preCard.state === 'new' && !profile.parameters.enableShortTerm
      ? 0
      : preCard.scheduledDays

  if (
    log.state !== preCard.state ||
    log.stability !== preCard.stability ||
    log.difficulty !== preCard.difficulty ||
    log.lastElapsedDays !== preCard.elapsedDays ||
    log.learningSteps !== preCard.learningSteps ||
    log.scheduledDays !== expectedScheduledDays ||
    log.dueAt !== (preCard.lastReviewAt ?? preCard.dueAt).toISOString()
  ) {
    throw new Error('FSRS review log does not match its recorded pre-card.')
  }
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
