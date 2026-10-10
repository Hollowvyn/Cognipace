import type { ReviewRating } from '@/lib/fsrs'
import {
  problemDifficulties,
  type ProblemDifficulty,
} from '@/features/problems/domain'

import type {
  ProblemSolvingCohortView,
  ProblemSolvingPeriodStats,
  ProblemSolvingRow,
  ProblemSolvingView,
} from './historical-presentation'

export const performanceRatingPoints = {
  again: 0,
  hard: 50,
  good: 80,
  easy: 100,
} as const satisfies Record<ReviewRating, number>

export const performanceDifficultyInfluence = {
  easy: 1,
  medium: 2,
  hard: 3,
  unknown: 1,
} as const satisfies Record<ProblemDifficulty, number>

export type PerformanceRatingCounts = Readonly<Record<ReviewRating, number>>
export type PerformanceCountMatrix = Readonly<
  Record<ProblemDifficulty, PerformanceRatingCounts>
>

export interface PerformanceStats {
  score: number | null
  weightedPoints: number
  weightedUnits: number
  validRatings: number
  unclassifiedRatings: number
}

export type CumulativeEvidenceState = 'unavailable' | 'updated' | 'held'
export type PresentationInterval = Pick<
  ProblemSolvingRow,
  'id' | 'bucketStart' | 'bucketEnd'
>

export interface PerformancePresentationRow extends ProblemSolvingRow {
  intervalStats: PerformanceStats
  cumulativeStats: PerformanceStats
  state: CumulativeEvidenceState
  lastUpdatedInterval: PresentationInterval | null
}

export interface PerformancePeriodStats
  extends ProblemSolvingPeriodStats, PerformanceStats {}

export interface PerformanceComparison {
  state: 'absent' | 'sparse' | 'available'
  previousPeriod: ProblemSolvingView['previousPeriod']
  previousStats: PerformanceStats | null
  differencePoints: number | null
}

export interface PerformancePresentation {
  totals: PerformancePeriodStats
  rows: PerformancePresentationRow[]
  comparison: PerformanceComparison
}

/** The matrix contains only eligible rating counts; raw evidence stays separate. */
export function aggregatePerformance(
  matrix: PerformanceCountMatrix,
): PerformanceStats {
  let weightedPoints = 0
  let weightedUnits = 0
  let validRatings = 0
  let unclassifiedRatings = 0
  for (const difficulty of problemDifficulties) {
    const influence = performanceDifficultyInfluence[difficulty]
    for (const rating of Object.keys(
      performanceRatingPoints,
    ) as ReviewRating[]) {
      const count = matrix[difficulty][rating]
      weightedPoints += count * performanceRatingPoints[rating] * influence
      weightedUnits += count * influence
      validRatings += count
      if (difficulty === 'unknown') unclassifiedRatings += count
    }
  }
  return {
    score: weightedUnits > 0 ? weightedPoints / weightedUnits : null,
    weightedPoints,
    weightedUnits,
    validRatings,
    unclassifiedRatings,
  }
}

/** Consume ordered service buckets without changing their frame or eligibility. */
export function buildPerformancePresentation(
  cohort: ProblemSolvingCohortView,
  options: { previousPeriod?: ProblemSolvingView['previousPeriod'] } = {},
): PerformancePresentation {
  const totals = {
    ...cohort.totals,
    ...aggregatePerformance(cohort.totals.difficulties),
  }
  let cumulativeStats: PerformanceStats = {
    score: null,
    weightedPoints: 0,
    weightedUnits: 0,
    validRatings: 0,
    unclassifiedRatings: 0,
  }
  let lastUpdatedInterval: PresentationInterval | null = null
  const rows: PerformancePresentationRow[] = cohort.rows.map((row) => {
    const intervalStats = aggregatePerformance(row.difficulties)
    if (intervalStats.validRatings > 0) {
      const weightedPoints =
        cumulativeStats.weightedPoints + intervalStats.weightedPoints
      const weightedUnits =
        cumulativeStats.weightedUnits + intervalStats.weightedUnits
      cumulativeStats = {
        score: weightedPoints / weightedUnits,
        weightedPoints,
        weightedUnits,
        validRatings: cumulativeStats.validRatings + intervalStats.validRatings,
        unclassifiedRatings:
          cumulativeStats.unclassifiedRatings +
          intervalStats.unclassifiedRatings,
      }
      lastUpdatedInterval = {
        id: row.id,
        bucketStart: row.bucketStart,
        bucketEnd: row.bucketEnd,
      }
    }
    return {
      ...row,
      intervalStats,
      cumulativeStats,
      state:
        intervalStats.validRatings > 0
          ? 'updated'
          : cumulativeStats.validRatings > 0
            ? 'held'
            : 'unavailable',
      lastUpdatedInterval,
    }
  })

  const previousPeriod = options.previousPeriod ?? null
  const previousStats =
    previousPeriod === null
      ? null
      : aggregatePerformance(cohort.previous.difficulties)
  const supported =
    previousStats !== null &&
    totals.validRatings >= 10 &&
    previousStats.validRatings >= 10
  return {
    totals,
    rows,
    comparison: {
      state:
        previousPeriod === null ? 'absent' : supported ? 'available' : 'sparse',
      previousPeriod,
      previousStats,
      differencePoints: supported ? totals.score! - previousStats.score! : null,
    },
  }
}
