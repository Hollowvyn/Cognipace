import type { UserSettings } from '@/features/settings/domain'
import {
  problemDifficulties,
  type ProblemDifficulty,
} from '@/features/problems/domain'

import type {
  ProblemSolvingCohortView,
  ProblemSolvingTimeStats,
} from './historical-presentation'
import type { AnalyticsDomain } from './analytics-scales'

export type TimeTargetSubset = 'all' | 'successful'
export type TimeTargetDifficulty = Exclude<ProblemDifficulty, 'unknown'>

export interface TimeTargetRow extends ProblemSolvingTimeStats {
  difficulty: TimeTargetDifficulty
  targetMinutes: number
  percentOfTarget: number | null
  differenceMinutes: number | null
  differencePercent: number | null
}

export interface TimeTargetPresentation {
  subset: TimeTargetSubset
  rows: TimeTargetRow[]
  coverage: Pick<
    ProblemSolvingTimeStats,
    'eligibleAssessments' | 'timedAssessments'
  >
  unclassified: ProblemSolvingTimeStats
  percentDomain: AnalyticsDomain
}

/** Period medians remain separate; coverage includes Unknown without a target. */
export function buildTimeTargetPresentation(
  cohort: ProblemSolvingCohortView,
  targets: UserSettings['assessment']['timeTargetsMinutes'],
  subset: TimeTargetSubset = 'all',
): TimeTargetPresentation {
  const knownDifficulties = problemDifficulties.filter(
    (difficulty): difficulty is TimeTargetDifficulty =>
      difficulty !== 'unknown',
  )
  const rows = knownDifficulties.map((difficulty) => {
    const time = cohort.totals.difficulties[difficulty].time[subset]
    const targetMinutes = targets[difficulty]
    const percentOfTarget =
      time.medianSeconds === null
        ? null
        : (100 * time.medianSeconds) / (targetMinutes * 60)
    return {
      ...time,
      difficulty,
      targetMinutes,
      percentOfTarget,
      differenceMinutes:
        time.medianSeconds === null
          ? null
          : time.medianSeconds / 60 - targetMinutes,
      differencePercent:
        percentOfTarget === null ? null : percentOfTarget - 100,
    }
  })
  const coverage = problemDifficulties.reduce(
    (counts, difficulty) => {
      const time = cohort.totals.difficulties[difficulty].time[subset]
      return {
        eligibleAssessments:
          counts.eligibleAssessments + time.eligibleAssessments,
        timedAssessments: counts.timedAssessments + time.timedAssessments,
      }
    },
    { eligibleAssessments: 0, timedAssessments: 0 },
  )
  return {
    subset,
    rows,
    coverage,
    unclassified: { ...cohort.totals.difficulties.unknown.time[subset] },
    percentDomain: [
      0,
      Math.max(100, ...rows.map((row) => row.percentOfTarget ?? 0)) * 1.1,
    ],
  }
}
