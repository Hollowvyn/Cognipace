import {
  createInitialFsrsCard,
  isReviewRating,
  parseSerializedFsrsReviewLogSnapshot,
  scheduleReview,
  type NormalizedFsrsSchedulingOptions,
  type ReviewRating,
} from '@/lib/fsrs'

import type { AnalyticsBucket } from './analytics-range-policy'
import {
  addAnalyticsCalendarDays,
  getAnalyticsDateKey,
  getAnalyticsLocalDayStart,
  type AnalyticsTimeFrame,
} from './analytics-time'

export interface AnalyticsReviewEvent {
  id: string
  cardId: string
  problemSlug: string
  title: string
  topicLabels: string[]
  rating: string
  reviewedAt: Date
  isCorrect: boolean | null
  fsrsReviewLog: string | null
}

export interface AnalyticsCurrentCard {
  cardId: string
  slug: string
  title: string
  topics: string[]
  retrievability: number
  targetRetention: number
  stabilityDays: number
  difficulty: number
  lapseCount: number
  dueAt: Date
  createdAt: Date
  lastReviewAt: Date | null
  suspended?: boolean
  fsrsCard?: import('@/lib/fsrs').FsrsCardSnapshot
}

export interface AnalyticsOverdueSnapshot {
  date: Date
  overdueCount: number
}

export interface UpcomingLoadPoint {
  date: string
  dueCount: number
  overdueCount: number
  today: boolean
}

export interface AnalyticsRangeOptions {
  start: Date
  end: Date
  buckets: readonly AnalyticsBucket[]
  fsrsOptions: NormalizedFsrsSchedulingOptions
  timeZone?: string
  timeFrame?: AnalyticsTimeFrame
}

export function toAnalyticsDateKey(date: Date, timeZone?: string): string {
  if (timeZone) return getAnalyticsDateKey(date, timeZone)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function hasValidReviewRating(
  event: AnalyticsReviewEvent,
): event is AnalyticsReviewEvent & { rating: ReviewRating } {
  return isReviewRating(event.rating)
}

export function hasObservedCorrectnessReview(
  event: AnalyticsReviewEvent,
): event is AnalyticsReviewEvent & {
  rating: ReviewRating
  isCorrect: boolean
} {
  return hasValidReviewRating(event) && event.isCorrect !== null
}

export function hasTopicRecallEvidence(
  event: AnalyticsReviewEvent,
): event is AnalyticsReviewEvent & {
  rating: ReviewRating
  isCorrect: boolean
} {
  return hasObservedCorrectnessReview(event) && event.topicLabels.length > 0
}

export function getValidStabilitySample(
  event: AnalyticsReviewEvent,
): number | null {
  return hasValidReviewRating(event) && event.fsrsReviewLog
    ? parseValidStability(event.fsrsReviewLog)
    : null
}

export function reconstructOverdueBacklogSnapshots(
  events: readonly AnalyticsReviewEvent[],
  cards: readonly AnalyticsCurrentCard[],
  options: AnalyticsRangeOptions,
): AnalyticsOverdueSnapshot[] {
  const activeCards = cards.filter((card) => !card.suspended)
  if (activeCards.length === 0) return []

  const eventsByCard = new Map<string, AnalyticsReviewEvent[]>()
  for (const event of events) {
    const history = eventsByCard.get(event.cardId) ?? []
    history.push(event)
    eventsByCard.set(event.cardId, history)
  }

  const intervalsByCard = activeCards.map((card) => ({
    card,
    intervals: buildKnownOverdueIntervals(
      card,
      eventsByCard.get(card.cardId) ?? [],
      options,
    ),
  }))

  return dailyObservationDates(options).flatMap((observationAt) => {
    const observationKey = toAnalyticsDateKey(observationAt, options.timeZone)
    let overdueCount = 0

    for (const { card, intervals } of intervalsByCard) {
      if (observationAt < card.createdAt) continue
      const interval = intervals.find(
        (candidate) =>
          observationAt >= candidate.start &&
          observationAt < candidate.endExclusive,
      )
      if (!interval) return []
      if (
        toAnalyticsDateKey(interval.dueAt, options.timeZone) < observationKey
      ) {
        overdueCount += 1
      }
    }

    return [{ date: observationAt, overdueCount }]
  })
}

export function buildUpcomingLoadPoints(
  dueDates: readonly Date[],
  now: Date,
  timeZone?: string,
): UpcomingLoadPoint[] {
  const todayKey = timeZone
    ? getAnalyticsDateKey(now, timeZone)
    : toAnalyticsDateKey(now)
  const points = Array.from({ length: 14 }, (_, index) => {
    const localDate = new Date(now)
    localDate.setDate(localDate.getDate() + index)
    const date = timeZone
      ? addAnalyticsCalendarDays(todayKey, index)
      : toAnalyticsDateKey(localDate)
    return {
      date,
      dueCount: 0,
      overdueCount: 0,
      today: index === 0,
    }
  })
  for (const dueAt of dueDates) {
    const dueKey = toAnalyticsDateKey(dueAt, timeZone)
    if (dueKey < todayKey) points[0]!.overdueCount += 1
    else {
      const point = points.find((candidate) => candidate.date === dueKey)
      if (point) point.dueCount += 1
    }
  }
  return points
}

function dailyObservationDates(options: AnalyticsRangeOptions): Date[] {
  if (options.timeFrame) {
    const firstKey = options.timeFrame.buckets[0]?.startKey
    const lastKey = options.timeFrame.buckets.at(-1)?.endKey
    const timeZone = options.timeFrame.timeZone
    if (!firstKey || !lastKey) return []

    const observations: Date[] = []
    let dateKey = firstKey
    while (dateKey <= lastKey) {
      const nextStart = new Date(
        getAnalyticsLocalDayStart(
          addAnalyticsCalendarDays(dateKey, 1),
          timeZone,
        ),
      )
      observations.push(
        new Date(Math.min(nextStart.getTime() - 1, options.end.getTime())),
      )
      dateKey = addAnalyticsCalendarDays(dateKey, 1)
    }
    return observations
  }

  const observations: Date[] = []
  const date = new Date(options.start)
  while (date <= options.end) {
    observations.push(
      observationDateForKey(toAnalyticsDateKey(date), options.end),
    )
    date.setDate(date.getDate() + 1)
  }
  return observations
}
function compareEvents(
  a: AnalyticsReviewEvent,
  b: AnalyticsReviewEvent,
): number {
  return (
    a.reviewedAt.getTime() - b.reviewedAt.getTime() || a.id.localeCompare(b.id)
  )
}

interface KnownOverdueInterval {
  start: Date
  endExclusive: Date
  dueAt: Date
}

function buildKnownOverdueIntervals(
  card: AnalyticsCurrentCard,
  events: readonly AnalyticsReviewEvent[],
  options: AnalyticsRangeOptions,
): KnownOverdueInterval[] {
  const ordered = [...events]
    .filter((event) => event.reviewedAt <= options.end)
    .sort(compareEvents)
  const intervals: KnownOverdueInterval[] = []
  let currentCard = createInitialFsrsCard(card.createdAt)
  let segmentStart: Date | null = card.createdAt
  let historyKnown = true

  for (const event of ordered) {
    const log = parseReviewLog(event.fsrsReviewLog)
    if (
      !historyKnown ||
      !log ||
      !hasValidReviewRating(event) ||
      !isConsistentReviewLog(log, event, currentCard)
    ) {
      if (
        historyKnown &&
        segmentStart !== null &&
        segmentStart <= event.reviewedAt
      ) {
        intervals.push({
          start: segmentStart,
          endExclusive: event.reviewedAt,
          dueAt: currentCard.dueAt,
        })
      }
      segmentStart = null
      historyKnown = false
      continue
    }

    if (segmentStart !== null && segmentStart <= event.reviewedAt) {
      intervals.push({
        start: segmentStart,
        endExclusive: event.reviewedAt,
        // ReviewLog.due is prior-state rollback metadata in ts-fsrs. The
        // active due date before this review belongs to the prior card.
        dueAt: currentCard.dueAt,
      })
    }

    try {
      // The scheduled card carries the due date that becomes active after
      // this review; the review log itself does not.
      currentCard = scheduleReview(
        currentCard,
        event.rating,
        event.reviewedAt,
        options.fsrsOptions,
      ).card
    } catch {
      segmentStart = null
      historyKnown = false
      continue
    }
    segmentStart = event.reviewedAt
  }

  if (
    historyKnown &&
    card.lastReviewAt === null &&
    ordered.length === 0 &&
    card.createdAt <= options.end
  ) {
    intervals.push({
      start: card.createdAt,
      endExclusive: new Date(options.end.getTime() + 1),
      dueAt: card.dueAt,
    })
  } else if (
    historyKnown &&
    segmentStart !== null &&
    ordered.length > 0 &&
    card.lastReviewAt?.getTime() === segmentStart.getTime()
  ) {
    intervals.push({
      start: segmentStart,
      endExclusive: new Date(options.end.getTime() + 1),
      dueAt: card.dueAt,
    })
  }

  return intervals
}

function isConsistentReviewLog(
  log: ReturnType<typeof parseSerializedFsrsReviewLogSnapshot>,
  event: AnalyticsReviewEvent,
  card: ReturnType<typeof createInitialFsrsCard>,
): boolean {
  const expectedDueAt = card.lastReviewAt ?? card.dueAt

  return (
    log.rating === event.rating &&
    log.reviewedAt === event.reviewedAt.toISOString() &&
    log.dueAt === expectedDueAt.toISOString()
  )
}

function parseReviewLog(serialized: string | null) {
  if (!serialized) return null
  try {
    return parseSerializedFsrsReviewLogSnapshot(serialized)
  } catch {
    return null
  }
}

function observationDateForKey(dateKey: string, end: Date): Date {
  const [year, month, day] = dateKey.split('-')
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    23,
    59,
    59,
    999,
  )
  return date > end ? end : date
}

function parseValidStability(serialized: string): number | null {
  try {
    return parseSerializedFsrsReviewLogSnapshot(serialized).stability
  } catch {
    return null
  }
}
