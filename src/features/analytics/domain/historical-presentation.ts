import {
  isReviewRating,
  replayReviewHistorySequence,
  type NormalizedFsrsSchedulingOptions,
  type ReviewRating,
} from '@/lib/fsrs'
import {
  normalizeTopicLabelList,
  normalizeTopicLookupKey,
} from '@/features/problems/domain/topic-taxonomy'
import {
  defaultAnalyticsTargets,
  defaultUserSettings,
  type AnalyticsTargets,
  type UserSettings,
} from '@/features/settings/domain'
import {
  problemDifficulties,
  type ProblemDifficulty,
} from '@/features/problems/domain'

import {
  buildAnalyticsBucketsFromTimeFrame,
  type AnalyticsBucket,
} from './analytics-range-policy'
import {
  calculateAnalyticsReadiness,
  type AnalyticsReadiness,
} from './analytics-readiness'
import {
  addAnalyticsCalendarDays,
  buildAnalyticsTimeFrame,
  shiftAnalyticsCalendarDays,
  getAnalyticsDateKey,
  type AnalyticsTimeFrame,
} from './analytics-time'
import {
  buildAdaptiveDurationScale,
  buildAdaptivePercentageDomain,
  buildMagnitudeScale,
  type AnalyticsScale,
} from './analytics-scales'
import type { CurrentStateAnalyticsViews } from './current-state-presentation'
import type { WorkloadAnalyticsViews } from './workload-presentation'
import {
  buildRepeatReviewPairs,
  selectFirstRecordedAttempts,
  selectLaterRecordedAttempts,
} from './review-cohorts'

export interface HistoricalAnalyticsReviewEvent {
  id: string
  cardId: string
  problemSlug: string
  topicLabels: string[]
  rating: string
  reviewedAt: Date
  fsrsReviewLog: string | null
  problemDifficulty?: ProblemDifficulty | undefined
  elapsedSeconds?: number | null | undefined
}

type ValidHistoricalReviewEvent = HistoricalAnalyticsReviewEvent & {
  rating: ReviewRating
}

export interface HistoricalPresentationOptions {
  start: Date
  end: Date
  buckets: readonly AnalyticsBucket[]
  fsrsOptions: NormalizedFsrsSchedulingOptions
  timeZone: string
  timeFrame: AnalyticsTimeFrame
  analyticsTargets?: AnalyticsTargets
  timeTargetsMinutes?: UserSettings['assessment']['timeTargetsMinutes']
}

export interface HistoricalPresentationScale {
  domain: [number, number]
  ticks: number[]
}

export interface ProblemSolvingOutcomeStats {
  again: number
  hard: number
  good: number
  easy: number
  recordedAssessments: number
  excludedInvalidRatings: number
  validRatings: number
  hardGoodEasy: number
  goodEasy: number
  successRate: number | null
  goodEasyRate: number | null
}

export interface ProblemSolvingTimeStats {
  eligibleAssessments: number
  timedAssessments: number
  totalSeconds: number
  medianSeconds: number | null
  q1Seconds: number | null
  q3Seconds: number | null
}

export interface ProblemSolvingDifficultyStats extends ProblemSolvingOutcomeStats {
  time: { all: ProblemSolvingTimeStats; successful: ProblemSolvingTimeStats }
}

export type ProblemSolvingDifficulties = Record<
  ProblemDifficulty,
  ProblemSolvingDifficultyStats
>

export interface ProblemSolvingRow {
  id: string
  bucketStart: string
  bucketEnd: string
  isPartial: boolean
  difficulties: ProblemSolvingDifficulties
}

export interface ProblemSolvingPeriodStats extends ProblemSolvingOutcomeStats {
  assessmentDays: number
  distinctProblems: number
  difficulties: ProblemSolvingDifficulties
}

export interface ProblemSolvingCohortView {
  rows: ProblemSolvingRow[]
  totals: ProblemSolvingPeriodStats
  previous: ProblemSolvingPeriodStats
  outcomeScale: HistoricalPresentationScale
  timeScales: Record<
    'all' | 'successful',
    {
      minutes: HistoricalPresentationScale
      targetPercent: HistoricalPresentationScale
    }
  >
}

export interface ProblemSolvingView {
  cohorts: {
    newProblems: ProblemSolvingCohortView
    followupPractice: ProblemSolvingCohortView
  }
  targets: AnalyticsTargets
  timeTargetsMinutes: UserSettings['assessment']['timeTargetsMinutes']
  previousPeriod: { start: string; asOf: string }
}

const knownProblemDifficulties = ['easy', 'medium', 'hard'] as const

export interface ObservedRecallVsFsrsRow {
  id: string
  bucketStart: string
  bucketEnd: string
  isPartial: boolean
  recalledCount: number
  pairedReviews: number
  observedRecall: number | null
  fsrsEstimate: number | null
  difference: number | null
  provenance: 'reconstructed'
  evidence: 'measured' | 'not-measured'
}

export interface MemoryStrengthRow {
  id: string
  bucketStart: string
  bucketEnd: string
  isPartial: boolean
  medianStrengthDays: number | null
  q1: number | null
  q3: number | null
  eligibleReviews: number
  medianChangeDays: number | null
  provenance: 'reconstructed'
  evidence: 'measured' | 'not-measured'
}

export interface PracticeRhythmRow {
  id: string
  bucketStart: string
  bucketEnd: string
  isPartial: boolean
  completedReviews: number
  goodEasy: number
  validRatings: number
  reviewSuccess: number | null
  evidence: 'measured' | 'not-measured'
}

export interface RatingsMixRow {
  id: string
  bucketStart: string
  bucketEnd: string
  isPartial: boolean
  again: number
  hard: number
  good: number
  easy: number
  againShare: number | null
  hardShare: number | null
  goodShare: number | null
  easyShare: number | null
  validRatings: number
  challengingReviews: number
  evidence: 'measured' | 'not-measured'
}

export interface TopicPerformanceRow {
  id: string
  topic: string
  reviewSuccess: number
  goodEasy: number
  validRatings: number
  distinctProblems: number
  evidence: 'Measured'
}

export interface LowEvidenceTopicRow {
  topic: string
  validRatings: number
  distinctProblems: number
}

export interface HistoricalAnalyticsViews {
  problemSolving: ProblemSolvingView
  observedRecallVsFsrs: {
    rows: ObservedRecallVsFsrsRow[]
    scale: HistoricalPresentationScale
    targetRecall: number
  }
  memoryStrength: {
    rows: MemoryStrengthRow[]
    scale: HistoricalPresentationScale
  }
  practiceRhythm: {
    rows: PracticeRhythmRow[]
    countScale: HistoricalPresentationScale
    percentageScale: HistoricalPresentationScale
    targetReviewSuccess: number
  }
  ratingsMix: {
    rows: RatingsMixRow[]
    selectedHardAgain: number
    selectedValidRatings: number
    comparison: RatingsMixComparison
  }
  topicPerformance: {
    rows: TopicPerformanceRow[]
    strongerQualifyingTopics: number
    lowEvidenceTopics: LowEvidenceTopicRow[]
    additionalLowEvidenceTopics: number
  }
  retentionMap: CurrentStateAnalyticsViews['retentionMap']
  memorySignals: CurrentStateAnalyticsViews['memorySignals']
  overdueBacklog: WorkloadAnalyticsViews['overdueBacklog']
  upcomingReviewLoad: WorkloadAnalyticsViews['upcomingReviewLoad']
}

export interface RatingsMixComparison {
  previousHardAgainShare: number | null
  previousValidRatings: number
  difference: number | null
  direction: 'up' | 'down' | 'flat' | null
}

export function buildHistoricalAnalyticsViews(
  events: readonly HistoricalAnalyticsReviewEvent[],
  options: HistoricalPresentationOptions,
): HistoricalAnalyticsViews {
  const pairedByEvent = buildRepeatReviewPairs(events, options)
  const stabilityByEvent = buildStabilityObservations(events, options)
  const observedRows = options.buckets.map((bucket) => {
    const pairs = pairedByEvent.filter((pair) =>
      inBucket(pair.reviewedAt, bucket),
    )
    const pairedReviews = pairs.length
    const recalledCount = pairs.filter((pair) => pair.rating !== 'again').length
    const observedRecall =
      pairedReviews === 0 ? null : recalledCount / pairedReviews
    const fsrsEstimate =
      pairedReviews === 0 ? null : mean(pairs.map((pair) => pair.estimate))

    return {
      ...bucketRow(bucket, options.end),
      recalledCount,
      pairedReviews,
      observedRecall,
      fsrsEstimate,
      difference:
        observedRecall === null || fsrsEstimate === null
          ? null
          : observedRecall - fsrsEstimate,
      provenance: 'reconstructed' as const,
      evidence:
        pairedReviews === 0 ? ('not-measured' as const) : ('measured' as const),
    }
  })
  const memoryRows = options.buckets.map((bucket) => {
    const observations = stabilityByEvent.filter((sample) =>
      inBucket(sample.reviewedAt, bucket),
    )
    const strengths = observations.map((sample) => sample.postReviewStability)
    const changes = observations.flatMap((sample) =>
      sample.preReviewStability === null
        ? []
        : [sample.postReviewStability - sample.preReviewStability],
    )
    const [q1, q3] =
      strengths.length >= 4 ? tukeyHinges(strengths) : [null, null]

    return {
      ...bucketRow(bucket, options.end),
      medianStrengthDays: median(strengths),
      q1,
      q3,
      eligibleReviews: strengths.length,
      medianChangeDays: median(changes),
      provenance: 'reconstructed' as const,
      evidence:
        strengths.length === 0
          ? ('not-measured' as const)
          : ('measured' as const),
    }
  })
  const rhythmRows = options.buckets.map((bucket) => {
    const ratings = events.filter(
      (event) =>
        event.reviewedAt >= options.start &&
        event.reviewedAt <= options.end &&
        inBucket(event.reviewedAt, bucket) &&
        isReviewRating(event.rating),
    )
    const goodEasy = ratings.filter(
      (event) => event.rating === 'good' || event.rating === 'easy',
    ).length

    return {
      ...bucketRow(bucket, options.end),
      completedReviews: ratings.length,
      goodEasy,
      validRatings: ratings.length,
      reviewSuccess: ratings.length === 0 ? null : goodEasy / ratings.length,
      evidence: 'measured' as const,
    }
  })
  const ratingsMixRows = options.buckets.map((bucket) => {
    const counts = { again: 0, hard: 0, good: 0, easy: 0 }
    for (const event of events) {
      if (
        event.reviewedAt < options.start ||
        event.reviewedAt > options.end ||
        !inBucket(event.reviewedAt, bucket) ||
        !isReviewRating(event.rating)
      )
        continue
      counts[event.rating] += 1
    }
    const validRatings = counts.again + counts.hard + counts.good + counts.easy
    const shares =
      validRatings === 0
        ? { again: null, hard: null, good: null, easy: null }
        : {
            again: counts.again / validRatings,
            hard: counts.hard / validRatings,
            good: counts.good / validRatings,
            easy: counts.easy / validRatings,
          }

    return {
      ...bucketRow(bucket, options.end),
      again: counts.again,
      hard: counts.hard,
      good: counts.good,
      easy: counts.easy,
      againShare: shares.again,
      hardShare: shares.hard,
      goodShare: shares.good,
      easyShare: shares.easy,
      validRatings,
      challengingReviews: counts.again + counts.hard,
      evidence:
        validRatings === 0 ? ('not-measured' as const) : ('measured' as const),
    }
  })
  const topicPerformance = buildTopicPerformance(events, options)
  const selectedHardAgain = ratingsMixRows.reduce(
    (total, row) => total + row.challengingReviews,
    0,
  )
  const selectedValidRatings = ratingsMixRows.reduce(
    (total, row) => total + row.validRatings,
    0,
  )

  const durationScale = buildAdaptiveDurationScale(
    memoryRows.flatMap((row) =>
      [row.medianStrengthDays, row.q1, row.q3].filter(
        (value): value is number => value !== null,
      ),
    ),
  )
  const countScale = buildMagnitudeScale(
    rhythmRows.map((row) => row.completedReviews),
  )

  return applyHistoricalChartTargets(
    {
      problemSolving: buildProblemSolvingView(events, options),
      observedRecallVsFsrs: {
        rows: observedRows,
      },
      memoryStrength: {
        rows: memoryRows,
        scale: toPresentationScale(durationScale),
      },
      practiceRhythm: {
        rows: rhythmRows,
        countScale: toPresentationScale(countScale),
      },
      ratingsMix: {
        rows: ratingsMixRows,
        selectedHardAgain,
        selectedValidRatings,
        comparison: buildRatingsMixComparison(
          events,
          options,
          selectedHardAgain,
          selectedValidRatings,
        ),
      },
      topicPerformance,
      retentionMap: {
        rows: [],
        totalEligible: 0,
        statusCounts: { onTarget: 0, watch: 0, needsAttention: 0 },
        recallScale: { domain: [0, 1] as const, ticks: [0, 1] },
        durationScale: { domain: [1, 10] as const, ticks: [1, 10] },
        targetRetention: options.fsrsOptions.targetRetention,
      },
      memorySignals: { rows: [], totalQualifying: 0 },
      overdueBacklog: {
        rows: [],
        knownDays: 0,
        withinWatchDays: 0,
        aboveWatchDays: 0,
        selectedDays: 0,
        currentBacklog: null,
        peak: null,
        scale: { domain: [0, 5] as const, ticks: [0, 5] },
      },
      upcomingReviewLoad: {
        rows: Array.from({ length: 14 }, (_, index) => ({
          date: addAnalyticsCalendarDays(
            options.timeFrame.buckets.at(-1)?.endKey ?? '1970-01-01',
            index,
          ),
          dueCount: 0,
          overdueCount: 0,
          today: index === 0,
        })),
        scale: { domain: [0, 1] as const, ticks: [0, 1] },
      },
    },
    options.analyticsTargets ?? defaultAnalyticsTargets,
  )
}

type HistoricalChartTargetViews = {
  problemSolving: ProblemSolvingView
  observedRecallVsFsrs: Pick<
    HistoricalAnalyticsViews['observedRecallVsFsrs'],
    'rows'
  >
  practiceRhythm: Pick<HistoricalAnalyticsViews['practiceRhythm'], 'rows'>
}

export function applyHistoricalChartTargets<
  T extends HistoricalChartTargetViews,
>(views: T, targets: AnalyticsTargets) {
  return {
    ...views,
    problemSolving: {
      ...views.problemSolving,
      targets,
      cohorts: {
        newProblems: {
          ...views.problemSolving.cohorts.newProblems,
          outcomeScale: problemSolvingOutcomeScale(
            views.problemSolving.cohorts.newProblems.rows,
            [
              targets.targetFirstAttemptSuccess,
              targets.targetFirstAttemptGoodEasy,
            ],
          ),
        },
        followupPractice: {
          ...views.problemSolving.cohorts.followupPractice,
          outcomeScale: problemSolvingOutcomeScale(
            views.problemSolving.cohorts.followupPractice.rows,
            [targets.targetRecall, targets.targetReviewSuccess],
          ),
        },
      },
    },
    observedRecallVsFsrs: {
      ...views.observedRecallVsFsrs,
      targetRecall: targets.targetRecall,
      scale: percentageScale(
        views.observedRecallVsFsrs.rows.flatMap((row) => [
          row.observedRecall,
          row.fsrsEstimate,
        ]),
        [targets.targetRecall],
      ),
    },
    practiceRhythm: {
      ...views.practiceRhythm,
      targetReviewSuccess: targets.targetReviewSuccess,
      percentageScale: percentageScale(
        views.practiceRhythm.rows.map((row) => row.reviewSuccess),
        [targets.targetReviewSuccess],
      ),
    },
  }
}

function buildRatingsMixComparison(
  events: readonly HistoricalAnalyticsReviewEvent[],
  options: HistoricalPresentationOptions,
  selectedHardAgain: number,
  selectedValidRatings: number,
): RatingsMixComparison {
  const previousStart = shiftAnalyticsCalendarDays(
    options.start,
    -options.timeFrame.requestedDays,
    options.timeFrame.timeZone,
  )
  const previousEnd = shiftAnalyticsCalendarDays(
    new Date(options.timeFrame.asOf),
    -options.timeFrame.requestedDays,
    options.timeFrame.timeZone,
  )
  const previousBuckets = buildAnalyticsBucketsFromTimeFrame(
    buildAnalyticsTimeFrame({
      asOf: previousEnd,
      requestedDays: options.timeFrame.requestedDays,
      timeZone: options.timeFrame.timeZone,
    }),
  )
  const previousRatings = events.filter(
    (event) =>
      event.reviewedAt >= previousStart &&
      event.reviewedAt <= previousEnd &&
      isReviewRating(event.rating),
  )
  const previousHardAgain = previousRatings.filter(
    (event) => event.rating === 'again' || event.rating === 'hard',
  ).length
  const previousValidRatings = previousRatings.length
  const qualifies =
    isRatingsMixComparisonReady(
      selectedValidRatings,
      calculateRatingsMixReadiness(events, options.buckets, options),
    ) &&
    isRatingsMixComparisonReady(
      previousValidRatings,
      calculateRatingsMixReadiness(events, previousBuckets, {
        ...options,
        end: previousEnd,
      }),
    )
  const selectedShare =
    selectedValidRatings === 0 ? null : selectedHardAgain / selectedValidRatings
  const previousHardAgainShare =
    qualifies && previousValidRatings > 0
      ? previousHardAgain / previousValidRatings
      : null
  const difference =
    selectedShare === null || previousHardAgainShare === null
      ? null
      : selectedShare - previousHardAgainShare

  return {
    previousHardAgainShare,
    previousValidRatings,
    difference,
    direction:
      difference === null
        ? null
        : difference > 0
          ? 'up'
          : difference < 0
            ? 'down'
            : 'flat',
  }
}

function calculateRatingsMixReadiness(
  events: readonly HistoricalAnalyticsReviewEvent[],
  buckets: readonly AnalyticsBucket[],
  options: Pick<HistoricalPresentationOptions, 'end' | 'timeFrame'>,
): AnalyticsReadiness {
  return calculateAnalyticsReadiness({
    requestedDays: options.timeFrame.requestedDays,
    evidenceCounts: buckets.map(
      (bucket) =>
        events.filter(
          (event) =>
            event.reviewedAt >= bucket.start &&
            event.reviewedAt <= bucket.end &&
            event.reviewedAt <= options.end &&
            isReviewRating(event.rating),
        ).length,
    ),
    bucketKeys: buckets.map((bucket) => bucket.key),
  })
}

function isRatingsMixComparisonReady(
  validRatings: number,
  readiness: AnalyticsReadiness,
): boolean {
  return validRatings >= 10 && readiness.ready
}

function buildTopicPerformance(
  events: readonly HistoricalAnalyticsReviewEvent[],
  options: HistoricalPresentationOptions,
): HistoricalAnalyticsViews['topicPerformance'] {
  const topics = new Map<
    string,
    {
      topic: string
      normalizedTopic: string
      goodEasy: number
      validRatings: number
      problems: Set<string>
    }
  >()

  for (const event of events) {
    if (
      event.reviewedAt < options.start ||
      event.reviewedAt > options.end ||
      !isReviewRating(event.rating)
    )
      continue

    for (const label of uniqueNormalizedTopics(event.topicLabels)) {
      const entry = topics.get(label.normalizedTopic) ?? {
        topic: label.topic,
        normalizedTopic: label.normalizedTopic,
        goodEasy: 0,
        validRatings: 0,
        problems: new Set<string>(),
      }
      entry.validRatings += 1
      if (event.rating === 'good' || event.rating === 'easy')
        entry.goodEasy += 1
      entry.problems.add(event.problemSlug)
      topics.set(label.normalizedTopic, entry)
    }
  }

  const entries = [...topics.values()].map((entry) => ({
    ...entry,
    distinctProblems: entry.problems.size,
    reviewSuccess: entry.goodEasy / entry.validRatings,
  }))
  const qualifying = entries
    .filter((entry) => entry.validRatings >= 10 && entry.distinctProblems >= 3)
    .sort(
      (left, right) =>
        left.reviewSuccess - right.reviewSuccess ||
        right.validRatings - left.validRatings ||
        left.normalizedTopic.localeCompare(right.normalizedTopic),
    )
  const lowEvidence = entries
    .filter((entry) => entry.validRatings < 10 || entry.distinctProblems < 3)
    .sort((left, right) =>
      left.normalizedTopic.localeCompare(right.normalizedTopic),
    )

  return {
    rows: qualifying.map((entry) => ({
      id: entry.normalizedTopic,
      topic: entry.topic,
      reviewSuccess: entry.reviewSuccess,
      goodEasy: entry.goodEasy,
      validRatings: entry.validRatings,
      distinctProblems: entry.distinctProblems,
      evidence: 'Measured',
    })),
    strongerQualifyingTopics: 0,
    lowEvidenceTopics: lowEvidence.slice(0, 5).map((entry) => ({
      topic: entry.topic,
      validRatings: entry.validRatings,
      distinctProblems: entry.distinctProblems,
    })),
    additionalLowEvidenceTopics: Math.max(0, lowEvidence.length - 5),
  }
}

function uniqueNormalizedTopics(labels: readonly string[]) {
  const topics = new Map<string, { topic: string; normalizedTopic: string }>()
  for (const topic of normalizeTopicLabelList(labels)) {
    const normalizedTopic = normalizeTopicLookupKey(topic)
    if (!topics.has(normalizedTopic))
      topics.set(normalizedTopic, { topic, normalizedTopic })
  }
  return [...topics.values()]
}

function aggregateRatingOutcomes(
  events: readonly HistoricalAnalyticsReviewEvent[],
): ProblemSolvingOutcomeStats {
  const counts = { again: 0, hard: 0, good: 0, easy: 0 }
  for (const event of events) {
    if (isReviewRating(event.rating)) counts[event.rating] += 1
  }
  const validRatings = counts.again + counts.hard + counts.good + counts.easy
  const hardGoodEasy = counts.hard + counts.good + counts.easy
  const goodEasy = counts.good + counts.easy
  return {
    ...counts,
    recordedAssessments: events.length,
    excludedInvalidRatings: events.length - validRatings,
    validRatings,
    hardGoodEasy,
    goodEasy,
    successRate: validRatings === 0 ? null : hardGoodEasy / validRatings,
    goodEasyRate: validRatings === 0 ? null : goodEasy / validRatings,
  }
}

function buildProblemSolvingView(
  events: readonly HistoricalAnalyticsReviewEvent[],
  options: HistoricalPresentationOptions,
): ProblemSolvingView {
  const targets = options.analyticsTargets ?? defaultAnalyticsTargets
  const timeTargetsMinutes =
    options.timeTargetsMinutes ??
    defaultUserSettings.assessment.timeTargetsMinutes
  const previousStart = shiftAnalyticsCalendarDays(
    options.start,
    -options.timeFrame.requestedDays,
    options.timeZone,
  )
  const previousAsOf = shiftAnalyticsCalendarDays(
    options.end,
    -options.timeFrame.requestedDays,
    options.timeZone,
  )
  const cohort = (
    raw: readonly HistoricalAnalyticsReviewEvent[],
    references: readonly number[],
  ): ProblemSolvingCohortView => {
    const selected = raw.filter(
      (event) =>
        event.reviewedAt >= options.start && event.reviewedAt <= options.end,
    )
    const previous = raw.filter(
      (event) =>
        event.reviewedAt >= previousStart && event.reviewedAt <= previousAsOf,
    )
    const rows = options.buckets.map((bucket) => ({
      ...bucketRow(bucket, options.end),
      difficulties: aggregateDifficulties(
        selected.filter((event) => inBucket(event.reviewedAt, bucket)),
      ),
    }))
    const scale = (successful: boolean) => {
      const timed = selected.filter(
        (event) =>
          event.problemDifficulty !== undefined &&
          event.problemDifficulty !== 'unknown' &&
          (!successful || isSuccessfulRating(event)) &&
          positiveRecordedSeconds(event) !== null,
      )
      return {
        minutes: toPresentationScale(
          buildAdaptiveDurationScale([
            ...timed.map((event) => event.elapsedSeconds! / 60),
            ...Object.values(timeTargetsMinutes),
          ]),
        ),
        targetPercent: toPresentationScale(
          buildAdaptiveDurationScale([
            ...timed.map(
              (event) =>
                (event.elapsedSeconds! /
                  (timeTargetsMinutes[
                    event.problemDifficulty as keyof typeof timeTargetsMinutes
                  ] *
                    60)) *
                100,
            ),
            100,
          ]),
        ),
      }
    }
    return {
      rows,
      totals: aggregateProblemSolvingPeriod(selected, options.timeZone),
      previous: aggregateProblemSolvingPeriod(previous, options.timeZone),
      outcomeScale: problemSolvingOutcomeScale(rows, references),
      timeScales: { all: scale(false), successful: scale(true) },
    }
  }
  return {
    cohorts: {
      newProblems: cohort(selectFirstRecordedAttempts(events), [
        targets.targetFirstAttemptSuccess,
        targets.targetFirstAttemptGoodEasy,
      ]),
      followupPractice: cohort(selectLaterRecordedAttempts(events), [
        targets.targetRecall,
        targets.targetReviewSuccess,
      ]),
    },
    targets,
    timeTargetsMinutes,
    previousPeriod: {
      start: previousStart.toISOString(),
      asOf: previousAsOf.toISOString(),
    },
  }
}

function aggregateProblemSolvingPeriod(
  events: readonly HistoricalAnalyticsReviewEvent[],
  timeZone: string,
): ProblemSolvingPeriodStats {
  return {
    ...aggregateRatingOutcomes(events),
    assessmentDays: new Set(
      events.map((event) => getAnalyticsDateKey(event.reviewedAt, timeZone)),
    ).size,
    distinctProblems: new Set(events.map((event) => event.problemSlug)).size,
    difficulties: aggregateDifficulties(events),
  }
}

function aggregateDifficulties(
  events: readonly HistoricalAnalyticsReviewEvent[],
): ProblemSolvingDifficulties {
  const stats = (
    difficulty: ProblemDifficulty,
  ): ProblemSolvingDifficultyStats => {
    const selected = events.filter(
      (event) => (event.problemDifficulty ?? 'unknown') === difficulty,
    )
    return {
      ...aggregateRatingOutcomes(selected),
      time: {
        all: aggregateRecordedTime(selected),
        successful: aggregateRecordedTime(selected.filter(isSuccessfulRating)),
      },
    }
  }
  return Object.fromEntries(
    problemDifficulties.map((difficulty) => [difficulty, stats(difficulty)]),
  ) as ProblemSolvingDifficulties
}

function isSuccessfulRating(event: HistoricalAnalyticsReviewEvent): boolean {
  return isReviewRating(event.rating) && event.rating !== 'again'
}

function positiveRecordedSeconds(
  event: HistoricalAnalyticsReviewEvent,
): number | null {
  return typeof event.elapsedSeconds === 'number' &&
    Number.isFinite(event.elapsedSeconds) &&
    event.elapsedSeconds > 0
    ? event.elapsedSeconds
    : null
}

function aggregateRecordedTime(
  events: readonly HistoricalAnalyticsReviewEvent[],
): ProblemSolvingTimeStats {
  const durations = events.flatMap((event) => {
    const seconds = positiveRecordedSeconds(event)
    return seconds === null ? [] : [seconds]
  })
  const [q1Seconds, q3Seconds] =
    durations.length >= 4 ? tukeyHinges(durations) : [null, null]
  return {
    eligibleAssessments: events.length,
    timedAssessments: durations.length,
    totalSeconds: durations.reduce((sum, seconds) => sum + seconds, 0),
    medianSeconds: median(durations),
    q1Seconds,
    q3Seconds,
  }
}

function problemSolvingOutcomeScale(
  rows: readonly ProblemSolvingRow[],
  references: readonly number[],
): HistoricalPresentationScale {
  return percentageScale(
    rows.flatMap((row) =>
      knownProblemDifficulties.flatMap((difficulty) => [
        row.difficulties[difficulty].successRate,
        row.difficulties[difficulty].goodEasyRate,
      ]),
    ),
    references,
  )
}

function buildStabilityObservations(
  events: readonly HistoricalAnalyticsReviewEvent[],
  options: HistoricalPresentationOptions,
) {
  const observations: Array<{
    reviewedAt: Date
    postReviewStability: number
    preReviewStability: number | null
  }> = []
  const byCard = new Map<string, ValidHistoricalReviewEvent[]>()
  for (const event of events) {
    if (!hasValidRating(event)) continue
    const cardEvents = byCard.get(event.cardId) ?? []
    cardEvents.push(event)
    byCard.set(event.cardId, cardEvents)
  }
  for (const cardEvents of byCard.values()) {
    const ordered = [...cardEvents].sort(compareEvents)
    const replayed = replayReviewHistorySequence(
      ordered.map((event) => ({
        rating: event.rating,
        reviewedAt: event.reviewedAt,
      })),
      options.fsrsOptions,
    )
    for (const [index, event] of ordered.entries()) {
      if (event.reviewedAt < options.start || event.reviewedAt > options.end)
        continue
      const postReviewStability = replayed[index]?.card.stability
      if (
        postReviewStability === undefined ||
        !Number.isFinite(postReviewStability) ||
        postReviewStability <= 0
      )
        continue
      const preReviewStability = replayed[index - 1]?.card.stability
      observations.push({
        reviewedAt: event.reviewedAt,
        postReviewStability,
        preReviewStability:
          preReviewStability !== undefined &&
          Number.isFinite(preReviewStability) &&
          preReviewStability > 0
            ? preReviewStability
            : null,
      })
    }
  }
  return observations
}

function bucketRow(bucket: AnalyticsBucket, end: Date) {
  return {
    id: bucket.key,
    bucketStart: bucket.startKey ?? bucket.key,
    bucketEnd: bucket.endKey ?? bucket.key,
    isPartial: bucket.end.getTime() >= end.getTime(),
  }
}

function percentageScale(
  values: readonly (number | null)[],
  references: readonly number[] = [],
): { domain: [number, number]; ticks: number[] } {
  const domain = buildAdaptivePercentageDomain(
    values.filter((value): value is number => value !== null),
    references,
  )
  const ticks = Array.from(
    { length: Math.round((domain[1] - domain[0]) / 0.05) + 1 },
    (_, index) => Number((domain[0] + index * 0.05).toFixed(2)),
  )
  return { domain: [domain[0], domain[1]], ticks }
}

function toPresentationScale(
  scale: AnalyticsScale,
): HistoricalPresentationScale {
  return { domain: [scale.domain[0], scale.domain[1]], ticks: [...scale.ticks] }
}

function inBucket(date: Date, bucket: AnalyticsBucket): boolean {
  return date >= bucket.start && date <= bucket.end
}

function compareEvents(
  left: HistoricalAnalyticsReviewEvent,
  right: HistoricalAnalyticsReviewEvent,
): number {
  return (
    left.reviewedAt.getTime() - right.reviewedAt.getTime() ||
    left.id.localeCompare(right.id)
  )
}

function hasValidRating(
  event: HistoricalAnalyticsReviewEvent,
): event is ValidHistoricalReviewEvent {
  return isReviewRating(event.rating)
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function tukeyHinges(values: readonly number[]): [number, number] {
  const sorted = [...values].sort((a, b) => a - b)
  const split = Math.floor(sorted.length / 2)
  const lower = sorted.slice(0, split)
  const upper = sorted.slice(sorted.length % 2 === 0 ? split : split + 1)
  return [median(lower)!, median(upper)!]
}
