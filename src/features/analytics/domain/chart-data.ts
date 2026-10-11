import type { ProblemDifficulty } from '@/features/problems/domain'
import {
  isReviewRating,
  type NormalizedFsrsSchedulingOptions,
  type ReviewRating,
} from '@/lib/fsrs'
import {
  resolveHistoricalSchedulingEvidence,
  summarizeHistoricalSchedulingProvenance,
  type HistoricalSchedulingProvenance,
} from './historical-scheduling-evidence'

import {
  medianBucketValues,
  recomputeBucketRatio,
  sumBucketValues,
} from './chart-buckets'
import type { AnalyticsBucket } from './analytics-range-policy'
import { buildRepeatReviewPairs } from './review-cohorts'
import {
  addAnalyticsCalendarDays,
  getAnalyticsDateKey,
  getAnalyticsLocalDayStart,
  getAnalyticsPreviousPeriod,
  type AnalyticsTimeFrame,
} from './analytics-time'

export interface AnalyticsReviewEvent {
  id: string
  cardId: string
  problemSlug: string
  title: string
  problemDifficulty?: ProblemDifficulty | undefined
  elapsedSeconds?: number | null | undefined
  topicLabels: string[]
  rating: string
  reviewedAt: Date
  isCorrect: boolean | null
  fsrsReviewLog: string | null
  applicationSequence?: number | null
  schedulingEvidenceKind?: 'captured' | 'legacy-derived' | 'unknown'
  schedulerProfileJson?: string | null
  preCardJson?: string | null
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
  modelOptions?: import('@/lib/fsrs').FsrsSchedulingOptions
  modelProvenance?: 'captured' | 'legacy-derived' | 'compatibility'
}

export interface AnalyticsOverdueSnapshot {
  date: Date
  overdueCount: number
  schedulingProvenance?: HistoricalSchedulingProvenance | undefined
}

export interface RecallQualityPoint {
  bucketStart: string
  bucketEnd: string
  observedRecall: number | null
  predictedRecall: number | null
  targetRetention: number
  reviewCount: number
  eligibleSampleSize: number
}

export interface PredictedRecallSample {
  date: string
  reviewedAt: Date
  value: number
}

export interface PracticeRhythmPoint {
  bucketStart: string
  bucketEnd: string
  reviewCount: number
  observedCorrectness: number | null
  sampleSize: number
  associationOnly: true
}

export interface RatingsMixPoint {
  bucketStart: string
  bucketEnd: string
  again: number
  hard: number
  good: number
  easy: number
  total: number
  hardAgainShare: number | null
}

export interface HardAgainSummary {
  selectedShare: number | null
  previousShare: number | null
  delta: number | null
  direction: 'up' | 'down' | 'flat' | null
  sampleSize: number
  previousSampleSize: number
  lowSample: boolean
  previousLowSample: boolean
}

export interface TopicPoint {
  topic: string
  recallQuality: number | null
  sampleSize: number
  lowSample: boolean
}

export interface StabilityPoint {
  bucketStart: string
  bucketEnd: string
  medianStabilityDays: number | null
  sampleSize: number
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
  lowSampleThreshold?: number
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
  return resolveHistoricalSchedulingEvidence(event).postCard?.stability ?? null
}

export function buildRecallQualityPoints(
  events: readonly AnalyticsReviewEvent[],
  options: AnalyticsRangeOptions,
): RecallQualityPoint[] {
  const points = options.buckets.map((bucket) => ({
    bucket,
    observed: { numerator: 0, denominator: 0 },
    predicted: [] as number[],
    reviewCount: 0,
  }))

  for (const pair of buildRepeatReviewPairs(events, options)) {
    const point = findBucketPoint(points, pair.reviewedAt)
    if (!point) continue
    point.reviewCount += 1
    point.observed.denominator += 1
    if (pair.rating !== 'again') point.observed.numerator += 1
    if (pair.estimate !== null) point.predicted.push(pair.estimate)
  }

  return presentHistoricalPoints(
    points.map((point) => ({
      ...bucketBounds(point.bucket),
      observedRecall: recomputeBucketRatio([point.observed]),
      predictedRecall: recomputeBucketRatio(
        point.predicted.map((value) => ({
          numerator: value,
          denominator: 1,
        })),
      ),
      targetRetention: options.fsrsOptions.targetRetention,
      reviewCount: point.reviewCount,
      eligibleSampleSize: point.observed.denominator,
    })),
    (point) => point.observedRecall !== null || point.predictedRecall !== null,
    options,
  )
}

export function buildPredictedRecallSamples(
  events: readonly AnalyticsReviewEvent[],
  options: AnalyticsRangeOptions,
): PredictedRecallSample[] {
  return buildRepeatReviewPairs(events, options)
    .filter((pair) => pair.estimate !== null)
    .map((pair) => ({
      date: toAnalyticsDateKey(pair.reviewedAt, options.timeZone),
      reviewedAt: pair.reviewedAt,
      value: pair.estimate!,
    }))
}

export function buildPracticeRhythmPoints(
  events: readonly AnalyticsReviewEvent[],
  options: AnalyticsRangeOptions,
): PracticeRhythmPoint[] {
  const points = options.buckets.map((bucket) => ({
    bucket,
    reviewCount: 0,
    observed: { numerator: 0, denominator: 0 },
  }))

  for (const event of events) {
    if (
      !isWithinRange(event.reviewedAt, options) ||
      !hasValidReviewRating(event)
    )
      continue
    const point = findBucketPoint(points, event.reviewedAt)
    if (!point) continue

    point.reviewCount += 1
    if (event.isCorrect !== null) {
      point.observed.denominator += 1
      if (event.isCorrect) point.observed.numerator += 1
    }
  }

  return presentHistoricalPoints(
    points.map((point) => ({
      ...bucketBounds(point.bucket),
      reviewCount: point.reviewCount,
      observedCorrectness: recomputeBucketRatio([point.observed]),
      sampleSize: point.observed.denominator,
      associationOnly: true,
    })),
    (point) => point.reviewCount > 0,
    options,
  )
}

export function buildRatingsMixPoints(
  events: readonly AnalyticsReviewEvent[],
  options: AnalyticsRangeOptions,
): RatingsMixPoint[] {
  return presentHistoricalPoints(
    options.buckets.map((bucket) => {
      const counts = { again: 0, hard: 0, good: 0, easy: 0 }
      for (const event of events)
        if (
          isWithinRange(event.reviewedAt, options) &&
          isInBucket(event.reviewedAt, bucket) &&
          hasValidReviewRating(event)
        )
          counts[event.rating] += 1
      const total = sumBucketValues(Object.values(counts))
      return {
        ...bucketBounds(bucket),
        ...counts,
        total,
        hardAgainShare:
          total === 0 ? null : (counts.again + counts.hard) / total,
      }
    }),
    (point) => point.total > 0,
    options,
  )
}

export function buildHardAgainSummary(
  events: readonly AnalyticsReviewEvent[],
  options: AnalyticsRangeOptions,
  lowSampleThreshold = 10,
): HardAgainSummary {
  const previous = options.timeFrame
    ? getAnalyticsPreviousPeriod(options.timeFrame)
    : {
        start: new Date(
          options.start.getTime() -
            (options.end.getTime() - options.start.getTime()),
        ),
        asOf: options.start,
      }
  const selectedRatings = events.filter(
    (event) =>
      event.reviewedAt >= options.start &&
      event.reviewedAt <= options.end &&
      hasValidReviewRating(event),
  )
  const previousRatings = events.filter(
    (event) =>
      previous !== null &&
      event.reviewedAt >= previous.start &&
      (options.timeFrame
        ? event.reviewedAt <= previous.asOf
        : event.reviewedAt < options.start) &&
      hasValidReviewRating(event),
  )
  const selectedShare = calculateHardAgainShare(selectedRatings)
  const previousShare = calculateHardAgainShare(previousRatings)
  const lowSample = selectedRatings.length < lowSampleThreshold
  const previousLowSample = previousRatings.length < lowSampleThreshold
  const delta =
    lowSample ||
    previousLowSample ||
    selectedShare === null ||
    previousShare === null
      ? null
      : selectedShare - previousShare

  return {
    selectedShare: lowSample ? null : selectedShare,
    previousShare: previousLowSample ? null : previousShare,
    delta,
    direction:
      delta === null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    sampleSize: selectedRatings.length,
    previousSampleSize: previousRatings.length,
    lowSample,
    previousLowSample,
  }
}

export function buildTopicPoints(
  events: readonly AnalyticsReviewEvent[],
  options: AnalyticsRangeOptions,
): TopicPoint[] {
  const topics = new Map<string, boolean[]>()
  for (const event of events) {
    if (
      !hasTopicRecallEvidence(event) ||
      event.reviewedAt < options.start ||
      event.reviewedAt > options.end
    )
      continue
    for (const topic of new Set(event.topicLabels))
      (topics.get(topic) ?? (topics.set(topic, []), topics.get(topic)!)).push(
        event.isCorrect,
      )
  }
  const threshold = options.lowSampleThreshold ?? 10
  return [...topics.entries()]
    .map(([topic, values]) => ({
      topic,
      recallQuality: recomputeBucketRatio([
        {
          numerator: values.filter(Boolean).length,
          denominator: values.length,
        },
      ]),
      sampleSize: values.length,
      lowSample: values.length < threshold,
    }))
    .sort(
      (a, b) =>
        (a.recallQuality ?? 2) - (b.recallQuality ?? 2) ||
        a.topic.localeCompare(b.topic),
    )
}

export function buildStabilityPoints(
  events: readonly AnalyticsReviewEvent[],
  options: AnalyticsRangeOptions,
): StabilityPoint[] {
  const points = options.buckets.map((bucket) => ({
    bucket,
    values: [] as number[],
  }))

  for (const event of events) {
    if (!isWithinRange(event.reviewedAt, options)) continue
    const point = findBucketPoint(points, event.reviewedAt)
    const stability = getValidStabilitySample(event)
    if (!point || stability === null) continue

    point.values.push(stability)
  }

  return presentHistoricalPoints(
    points.map((point) => ({
      ...bucketBounds(point.bucket),
      medianStabilityDays: medianBucketValues(point.values),
      sampleSize: point.values.length,
    })),
    (point) => point.sampleSize > 0,
    options,
  )
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
    let overdueCount = 0
    const intervalKinds: Array<'captured' | 'legacy-derived' | 'unknown'> = []

    for (const { card, intervals } of intervalsByCard) {
      if (observationAt < card.createdAt) continue
      const interval = intervals.find(
        (candidate) =>
          observationAt >= candidate.start &&
          observationAt < candidate.endExclusive,
      )
      if (!interval) return []
      intervalKinds.push(interval.provenance)
      if (interval.dueAt < observationAt) overdueCount += 1
    }

    return [
      {
        date: observationAt,
        overdueCount,
        schedulingProvenance:
          summarizeHistoricalSchedulingProvenance(intervalKinds),
      },
    ]
  })
}

export function buildUpcomingLoadPoints(
  eligibleDays: readonly string[],
  now: Date,
  timeZone?: string,
): UpcomingLoadPoint[] {
  const todayKey = timeZone
    ? getAnalyticsDateKey(now, timeZone)
    : toAnalyticsDateKey(now)
  const points = Array.from({ length: 14 }, (_, index) => {
    return {
      date: addAnalyticsCalendarDays(todayKey, index),
      dueCount: 0,
      overdueCount: 0,
      today: index === 0,
    }
  })
  for (const eligibleOn of eligibleDays) {
    if (eligibleOn < todayKey) points[0]!.overdueCount += 1
    else {
      const point = points.find((candidate) => candidate.date === eligibleOn)
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
function bucketBounds(bucket: AnalyticsBucket) {
  return {
    bucketStart: bucket.startKey ?? toAnalyticsDateKey(bucket.start),
    bucketEnd: bucket.endKey ?? toAnalyticsDateKey(bucket.end),
  }
}

function presentHistoricalPoints<T>(
  points: readonly T[],
  hasEvidence: (point: T) => boolean,
  options: AnalyticsRangeOptions,
): T[] {
  return options.timeFrame?.history
    ? [...points]
    : trimLeadingEmptyBuckets(points, hasEvidence)
}

function trimLeadingEmptyBuckets<T>(
  points: readonly T[],
  hasEvidence: (point: T) => boolean,
): T[] {
  const firstEvidenceIndex = points.findIndex(hasEvidence)
  return firstEvidenceIndex === -1 ? [] : points.slice(firstEvidenceIndex)
}

function isInBucket(date: Date, bucket: AnalyticsBucket): boolean {
  return date >= bucket.start && date <= bucket.end
}

function isWithinRange(date: Date, options: AnalyticsRangeOptions): boolean {
  return date >= options.start && date <= options.end
}

function findBucketPoint<T extends { bucket: AnalyticsBucket }>(
  points: readonly T[],
  date: Date,
): T | undefined {
  return points.find((point) => isInBucket(date, point.bucket))
}

function calculateHardAgainShare(
  events: readonly AnalyticsReviewEvent[],
): number | null {
  if (events.length === 0) return null
  return (
    events.filter(
      (event) => event.rating === 'again' || event.rating === 'hard',
    ).length / events.length
  )
}

interface KnownOverdueInterval {
  start: Date
  endExclusive: Date
  dueAt: Date
  provenance: 'captured' | 'legacy-derived' | 'unknown'
}

function buildKnownOverdueIntervals(
  card: AnalyticsCurrentCard,
  events: readonly AnalyticsReviewEvent[],
  options: AnalyticsRangeOptions,
): KnownOverdueInterval[] {
  const ordered = events.filter((event) => event.reviewedAt <= options.end)
  const hasCompleteApplicationOrder = ordered.every(
    (event) => event.applicationSequence != null,
  )
  ordered.sort((left, right) =>
    hasCompleteApplicationOrder
      ? left.applicationSequence! - right.applicationSequence! ||
        left.id.localeCompare(right.id)
      : left.reviewedAt.getTime() - right.reviewedAt.getTime() ||
        left.id.localeCompare(right.id),
  )
  const intervals: KnownOverdueInterval[] = []
  let currentCard: import('@/lib/fsrs').FsrsCardSnapshot | null = null
  let segmentStart: Date | null = null
  let currentProvenance: 'captured' | 'legacy-derived' | 'unknown' = 'unknown'

  for (const [index, event] of ordered.entries()) {
    const evidence = resolveHistoricalSchedulingEvidence(event)
    if (currentCard && segmentStart && segmentStart <= event.reviewedAt) {
      intervals.push({
        start: segmentStart,
        endExclusive: event.reviewedAt,
        dueAt: currentCard.dueAt,
        provenance: currentProvenance,
      })
    } else if (
      index === 0 &&
      evidence.preCard?.state === 'new' &&
      card.createdAt <= event.reviewedAt
    ) {
      intervals.push({
        start: card.createdAt,
        endExclusive: event.reviewedAt,
        dueAt: evidence.preCard.dueAt,
        provenance: evidence.kind,
      })
    }
    currentCard = evidence.postCard
    currentProvenance = evidence.kind
    segmentStart = currentCard ? event.reviewedAt : null
  }

  if (
    card.lastReviewAt === null &&
    ordered.length === 0 &&
    card.createdAt <= options.end
  ) {
    intervals.push({
      start: card.createdAt,
      endExclusive: new Date(options.end.getTime() + 1),
      dueAt: card.dueAt,
      provenance: 'unknown',
    })
  } else if (
    currentCard &&
    segmentStart !== null &&
    ordered.length > 0 &&
    card.lastReviewAt?.getTime() === segmentStart.getTime()
  ) {
    intervals.push({
      start: segmentStart,
      endExclusive: new Date(options.end.getTime() + 1),
      dueAt: card.dueAt,
      provenance: currentProvenance,
    })
  }

  return intervals
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
