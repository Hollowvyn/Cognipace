import {
  isReviewRating,
  type NormalizedFsrsSchedulingOptions,
  type ReviewRating,
} from '@/lib/fsrs'
import {
  resolveHistoricalSchedulingEvidence,
  type HistoricalSchedulingEvidenceResolver,
  type HistoricalSchedulingEvidenceInput,
} from './historical-scheduling-evidence'

interface ReviewCohortEvent extends HistoricalSchedulingEvidenceInput {
  id: string
  cardId: string
  problemSlug: string
  applicationSequence?: number | null
}

export interface RepeatReviewPair {
  id: string
  cardId: string
  reviewedAt: Date
  rating: ReviewRating
  estimate: number | null
  provenance: 'captured' | 'legacy-derived' | 'unknown'
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

/** Select raw retained later records before report or eligibility filters. */
export function selectLaterRecordedAttempts<T extends ReviewCohortEvent>(
  events: readonly T[],
): T[] {
  const firstIds = new Set(
    selectFirstRecordedAttempts(events).map((event) => event.id),
  )
  return events
    .filter((event) => !firstIds.has(event.id))
    .sort(compareReviewEvents)
}

/** Initial reviews build replay state, but only later reviews emit pairs. */
export function buildRepeatReviewPairs(
  events: readonly ReviewCohortEvent[],
  options: {
    start: Date
    end: Date
    fsrsOptions: NormalizedFsrsSchedulingOptions
    resolveEvidence?: HistoricalSchedulingEvidenceResolver
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
    for (let index = 1; index < ordered.length; index += 1) {
      const event = ordered[index]!
      if (event.reviewedAt < options.start || event.reviewedAt > options.end)
        continue
      const evidence = (
        options.resolveEvidence ?? resolveHistoricalSchedulingEvidence
      )(event)
      pairs.push({
        id: event.id,
        cardId: event.cardId,
        reviewedAt: event.reviewedAt,
        rating: event.rating,
        estimate: evidence.estimate,
        provenance: evidence.kind,
      })
    }
  }
  return pairs.sort(compareReviewEvents)
}
