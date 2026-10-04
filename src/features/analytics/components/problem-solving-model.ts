import type { AnalyticsViews } from '../api/analytics-contracts'

export type ProblemView = AnalyticsViews['problemSolving']
export type ProblemCohort = keyof ProblemView['cohorts']
export type ProblemRow = ProblemView['cohorts']['newProblems']['rows'][number]
export type DifficultyStats = ProblemRow['difficulties']['easy']
export type KnownDifficulty = 'easy' | 'medium' | 'hard'
export type OutcomeMeasure = 'successRate' | 'goodEasyRate'
export type TimeUnits = 'targetPercent' | 'minutes'
export type TimingPopulation = 'all' | 'successful'

export const difficulties = [
  {
    key: 'easy',
    label: 'Easy',
    shape: 'circle',
    symbol: '●',
    color: 'var(--cp-analytics-first-success)',
  },
  {
    key: 'medium',
    label: 'Medium',
    shape: 'diamond',
    symbol: '◆',
    color: 'var(--cp-analytics-first-good-easy)',
  },
  {
    key: 'hard',
    label: 'Hard',
    shape: 'triangle',
    symbol: '▲',
    color: 'var(--cp-analytics-attention)',
  },
] as const
export const mixDifficulties = [
  ...difficulties,
  {
    key: 'unknown',
    label: 'Unknown',
    symbol: '■',
    color: 'var(--cp-analytics-first-shared-target)',
  },
] as const

export function outcomeLabel(measure: OutcomeMeasure) {
  return measure === 'successRate' ? 'Hard + Good + Easy' : 'Good + Easy'
}
export function outcomeNumerator(
  stats: DifficultyStats,
  measure: OutcomeMeasure,
) {
  return measure === 'successRate' ? stats.hardGoodEasy : stats.goodEasy
}
export function problemGoal(
  view: ProblemView,
  cohort: ProblemCohort,
  measure: OutcomeMeasure,
) {
  const goal =
    cohort === 'newProblems'
      ? measure === 'successRate'
        ? ({
            metric: 'firstAttemptSuccess',
            key: 'targetFirstAttemptSuccess',
            label: 'Target First-attempt Success',
          } as const)
        : ({
            metric: 'firstAttemptGoodEasy',
            key: 'targetFirstAttemptGoodEasy',
            label: 'Target Good + Easy',
          } as const)
      : measure === 'successRate'
        ? ({
            metric: 'recall',
            key: 'targetRecall',
            label: 'Target Recall',
          } as const)
        : ({
            metric: 'reviewSuccess',
            key: 'targetReviewSuccess',
            label: 'Target Review Success',
          } as const)
  return { ...goal, value: view.targets[goal.key] }
}
export function timeValue(
  seconds: number | null,
  difficulty: KnownDifficulty,
  units: TimeUnits,
  targets: ProblemView['timeTargetsMinutes'],
) {
  return seconds === null
    ? null
    : units === 'minutes'
      ? seconds / 60
      : (seconds / (targets[difficulty] * 60)) * 100
}
export function outcomeText(value: number | null) {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}
export function timeText(value: number | null, units: TimeUnits) {
  return value === null
    ? '—'
    : `${value.toFixed(1)}${units === 'minutes' ? ' min' : '%'}`
}
export function comparisonText(
  current: DifficultyStats,
  previous: DifficultyStats,
  measure: OutcomeMeasure,
) {
  if (current.validRatings < 10 || previous.validRatings < 10)
    return 'Sparse comparison'
  const now = current[measure]
  const before = previous[measure]
  if (now === null || before === null) return 'Unavailable comparison'
  const delta = (now - before) * 100
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp`
}
export function mixShares(row: ProblemRow, measure: 'assessments' | 'time') {
  const values = mixDifficulties.map(({ key }) =>
    measure === 'assessments'
      ? row.difficulties[key].recordedAssessments
      : row.difficulties[key].time.all.totalSeconds,
  )
  const total = values.reduce((sum, value) => sum + value, 0)
  return values.map((value) => (total > 0 ? value / total : null))
}
