import {
  getRetrievability,
  isReviewRating,
  replayReviewHistorySequence,
  type NormalizedFsrsSchedulingOptions,
  type ReviewRating,
} from '@/lib/fsrs'

interface ReviewCohortEvent {
  id: string
  cardId: string
  problemSlug: string
  rating: string
  reviewedAt: Date
}

export interface RepeatReviewPair {
  id: string
  cardId: string
  reviewedAt: Date
  rating: ReviewRating
  estimate: number
}

export function compareReviewEvents(
  left: Pick<ReviewCohortEvent, 'id' | 'reviewedAt'>,
  right: Pick<ReviewCohortEvent, 'id' | 'reviewedAt'>,
): number {
  return (
    left.reviewedAt.getTime() - right.reviewedAt.getTime() ||
    left.id.localeCompare(right.id)
  )
}

/** Select raw retained history before validating a rating or report window. */
export function selectFirstRecordedAttempts<T extends ReviewCohortEvent>(
  events: readonly T[],
): T[] {
  const firstByProblem = new Map<string, T>()
  for (const event of [...events].sort(compareReviewEvents)) {
    if (!firstByProblem.has(event.problemSlug))
      firstByProblem.set(event.problemSlug, event)
  }
  return [...firstByProblem.values()]
}

/** Initial reviews build replay state, but only later reviews emit pairs. */
export function buildRepeatReviewPairs(
  events: readonly ReviewCohortEvent[],
  options: {
    start: Date
    end: Date
    fsrsOptions: NormalizedFsrsSchedulingOptions
  },
): RepeatReviewPair[] {
  const byCard = new Map<
    string,
    Array<ReviewCohortEvent & { rating: ReviewRating }>
  >()
  for (const event of events) {
    if (!isReviewRating(event.rating)) continue
    const history = byCard.get(event.cardId) ?? []
    history.push({ ...event, rating: event.rating })
    byCard.set(event.cardId, history)
  }

  const pairs: RepeatReviewPair[] = []
  for (const history of byCard.values()) {
    const ordered = [...history].sort(compareReviewEvents)
    const replayed = replayReviewHistorySequence(ordered, options.fsrsOptions)
    for (let index = 1; index < ordered.length; index += 1) {
      const event = ordered[index]!
      if (event.reviewedAt < options.start || event.reviewedAt > options.end)
        continue
      const priorCard = replayed[index - 1]?.card
      if (!priorCard) continue
      const estimate = getRetrievability(
        priorCard,
        event.reviewedAt,
        options.fsrsOptions,
      )
      if (!Number.isFinite(estimate) || estimate < 0 || estimate > 1) continue
      pairs.push({
        id: event.id,
        cardId: event.cardId,
        reviewedAt: event.reviewedAt,
        rating: event.rating,
        estimate,
      })
    }
  }
  return pairs.sort(compareReviewEvents)
}
