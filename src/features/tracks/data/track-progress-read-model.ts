import { and, desc, inArray } from 'drizzle-orm'

import type { Db } from '@/platform/db'
import { reviewAttempts } from '@/platform/db/schema'

import type {
  TrackCompletedRating,
  TrackProblemCompletion,
} from '../domain/track'

type SuccessfulReview = {
  id: string
  reviewedAt: number
  rating: TrackCompletedRating
}

export async function readSuccessfulReviews(
  db: Pick<Db, 'select'>,
  problemSlugs: readonly string[],
): Promise<Map<string, SuccessfulReview>> {
  const slugs = [...new Set(problemSlugs)]
  if (slugs.length === 0) return new Map()

  const reviews = await db
    .select({
      id: reviewAttempts.id,
      problemSlug: reviewAttempts.problemSlug,
      reviewedAt: reviewAttempts.reviewedAt,
      rating: reviewAttempts.rating,
    })
    .from(reviewAttempts)
    .where(
      and(
        inArray(reviewAttempts.problemSlug, slugs),
        inArray(reviewAttempts.rating, ['hard', 'good', 'easy']),
      ),
    )
    .orderBy(desc(reviewAttempts.reviewedAt), desc(reviewAttempts.id))

  const bySlug = new Map<string, SuccessfulReview>()
  for (const review of reviews) {
    if (bySlug.has(review.problemSlug)) continue
    // Runtime storage may contain ratings outside the public contract.
    if (
      review.rating !== 'hard' &&
      review.rating !== 'good' &&
      review.rating !== 'easy'
    )
      continue
    bySlug.set(review.problemSlug, { ...review, rating: review.rating })
  }
  return bySlug
}

export function resolveTrackCompletion(
  owned: TrackProblemCompletion,
  allowExternalProgress: boolean,
  external: SuccessfulReview | undefined,
): TrackProblemCompletion {
  if (owned.status === 'completed' || !allowExternalProgress || !external)
    return owned
  return {
    status: 'completed',
    source: 'external',
    completedAt: new Date(external.reviewedAt),
    completedRating: external.rating,
    reviewAttemptId: external.id,
  }
}
