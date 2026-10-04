import {
  parseFsrsCardSnapshot,
  type FsrsSerializedCardSnapshot,
} from '../domain/card-snapshot'
import type { FsrsSchedulerProfile } from '../domain/scheduler-profile'
import type { ReviewRating } from '../domain/review-rating'
import {
  scheduleReviewWithProfile,
  type FsrsScheduledReview,
} from './review-scheduler'

/** Immutable original inputs for applying or replacing one review. */
export interface FsrsReviewContext {
  readonly preCard: FsrsSerializedCardSnapshot
  readonly reviewedAt: string
  readonly profile: FsrsSchedulerProfile
}

/** Replaces one rating by scheduling once from its captured original inputs. */
export function correctReviewFromEvidence(
  context: FsrsReviewContext,
  replacementRating: ReviewRating,
): FsrsScheduledReview & { readonly context: FsrsReviewContext } {
  const reviewedAt = new Date(context.reviewedAt)

  if (
    typeof context.reviewedAt !== 'string' ||
    !Number.isFinite(reviewedAt.getTime()) ||
    reviewedAt.toISOString() !== context.reviewedAt
  ) {
    throw new Error('Invalid FSRS review context time.')
  }

  return scheduleReviewWithProfile(
    parseFsrsCardSnapshot(context.preCard),
    replacementRating,
    reviewedAt,
    context.profile,
  )
}
