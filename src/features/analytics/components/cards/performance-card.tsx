import { useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import type { SerializedAnalyticsSummary } from '../../api/analytics-contracts'
import { getAnalyticsReadinessMessages } from '../analytics-readiness-state'
import type { AnalyticsTargets } from '@/features/settings/domain'
import {
  buildPerformancePresentation,
  performanceDifficultyInfluence,
  performanceRatingPoints,
} from '../../domain/performance-presentation'
import {
  AnalyticsChartPanel,
  type AnalyticsCardGeometry,
} from '../analytics-chart-panel'
import { AnalyticsCardPager } from '../analytics-card-controls'
import { AnalyticsExactTable } from '../analytics-exact-table'
import { AnalyticsTargetEditor } from '../analytics-target-editor'
import { targetMetrics, type TargetMetric } from '../analytics-target-metrics'
import {
  CombinedProblemOutcomesPlot,
  combinedProblemOutcomeRows,
} from '../combined-problem-outcomes-view'
import {
  HistoricalChart,
  type HistoricalChartTimeFrame,
} from '../charts/historical-chart'
import { CumulativeTrend } from '../charts/cumulative-trend'
import {
  formatHistoricalBucket,
  historicalIntervalContext,
  historicalReportContext,
  trimHistoricalEmptyEdges,
} from '../charts/historical-chart-model'
import {
  ComparisonChart,
  DifficultyMixChart,
  ProblemTrendChart,
} from '../problem-solving-charts'
import {
  comparisonText,
  difficulties,
  mixDifficulties,
  mixShares,
  outcomeLabel,
  outcomeNumerator,
  outcomeText,
  problemGoal,
} from '../problem-solving-model'
import type {
  DifficultyStats,
  OutcomeMeasure,
  ProblemCohort,
  ProblemView,
} from '../problem-solving-model'

type Section =
  | 'ratings'
  | 'difficulty'
  | 'mix'
  | 'intervals'
  | 'pooled'
  | 'difficultyOutcomes'
  | 'goals'
  | 'evidence'
  | 'method'
type DetailRow = {
  id: string
  label: string
  values: Record<string, ReactNode>
}
type Field = { key: string; label: string }
const ratingDescriptions = {
  again: 'Could not complete',
  hard: 'Completed with difficulty',
  good: 'Completed confidently',
  easy: 'Completed easily',
}
const ratings = Object.keys(performanceRatingPoints) as Array<
  keyof typeof performanceRatingPoints
>
const goalMetrics: TargetMetric[] = [
  'firstAttemptSuccess',
  'firstAttemptGoodEasy',
  'recall',
  'reviewSuccess',
]
const scoreText = (score: number | null) =>
  score === null ? 'Unavailable' : String(score)
const fieldsFor = (labels: readonly string[]): Field[] =>
  labels.map((label) => ({ key: label, label }))
const pageSizeFor = (geometry: AnalyticsCardGeometry) =>
  Math.min(geometry.tablePageSize, geometry.width >= 480 ? 2 : 1)
function difficultyScore(stats: DifficultyStats) {
  return stats.validRatings
    ? ratings.reduce(
        (sum, rating) => sum + stats[rating] * performanceRatingPoints[rating],
        0,
      ) / stats.validRatings
    : null
}

export interface PerformanceCardProps {
  view: ProblemView
  timeFrame?: HistoricalChartTimeFrame | undefined
  onSaveTarget?:
    | ((patch: Partial<AnalyticsTargets>) => Promise<unknown>)
    | undefined
  historicalReadiness?:
    | SerializedAnalyticsSummary['historicalReadiness']
    | undefined
  activity?: SerializedAnalyticsSummary['activity'] | undefined
}

export function PerformanceCard({
  view,
  timeFrame,
  onSaveTarget,
  historicalReadiness,
  activity,
}: PerformanceCardProps) {
  const [mode, setMode] = useState<'overview' | 'details' | 'goals'>('overview')
  const [cohort, setCohort] = useState<ProblemCohort>('newProblems')
  const [section, setSection] = useState<Section>('ratings')
  const [beforeGoals, setBeforeGoals] = useState<Section>('ratings')
  const [pagination, setPagination] = useState({ key: '', page: 0 })
  const [methodPage, setMethodPage] = useState(0)
  const [evidenceScope, setEvidenceScope] = useState<
    keyof NonNullable<PerformanceCardProps['historicalReadiness']> | 'activity'
  >('requested')
  const [pooledDisplay, setPooledDisplay] = useState<'trend' | 'values'>(
    'trend',
  )
  const [pooledVisible, setPooledVisible] = useState({
    successRate: true,
    goodEasyRate: true,
  })
  const [outcomeDisplay, setOutcomeDisplay] = useState<
    'trend' | 'compare' | 'values' | 'settings'
  >('trend')
  const [outcomeMode, setOutcomeMode] = useState<'trend' | 'compare'>('trend')
  const [measure, setMeasure] = useState<OutcomeMeasure>('successRate')
  const [visible, setVisible] = useState({
    easy: true,
    medium: true,
    hard: true,
  })
  const [mixDisplay, setMixDisplay] = useState<'values' | 'trend' | 'settings'>(
    'values',
  )
  const [mixMeasure, setMixMeasure] = useState<'assessments' | 'time'>(
    'assessments',
  )
  const [goalMetric, setGoalMetric] = useState<TargetMetric>(
    'firstAttemptSuccess',
  )
  const headerRef = useRef<HTMLButtonElement>(null)
  const selected = view.cohorts[cohort]
  const presentation = buildPerformancePresentation(selected, {
    previousPeriod: view.previousPeriod,
  })
  const totals = presentation.totals
  const context = historicalReportContext(timeFrame)
  const shown = difficulties.filter(({ key }) => visible[key])
  const activityRows = trimHistoricalEmptyEdges(selected.rows, (row) =>
    difficulties.some(
      ({ key }) => row.difficulties[key].recordedAssessments > 0,
    ),
  )
  const pooledRows = trimHistoricalEmptyEdges(
    combinedProblemOutcomeRows(selected.rows),
    (row) => row.validRatings > 0,
  )
  const goal = problemGoal(view, cohort, measure)
  const resetKey = `${timeFrame?.asOf}:${timeFrame?.requestedDays}:${timeFrame?.timeZone}:${timeFrame?.grouping?.unit}:${timeFrame?.grouping?.step}:${cohort}:${section}:${evidenceScope}:${outcomeMode}:${measure}:${mixMeasure}:${shown.map(({ key }) => key).join(':')}`
  // The report can refresh while Overview has unmounted its exact table.
  if (pagination.key !== resetKey) setPagination({ key: resetKey, page: 0 })
  const page = pagination.key === resetKey ? pagination.page : 0
  const setPage = (page: number) => setPagination({ key: resetKey, page })
  const lastUpdate = presentation.rows.at(-1)?.lastUpdatedInterval
  const chooseSection = (next: Section) => {
    if (next === 'goals' && section !== 'goals') setBeforeGoals(section)
    setSection(next)
    setMode(next === 'goals' ? 'goals' : 'details')
    setPage(0)
    setMethodPage(0)
  }
  const plotOptions = {
    view,
    cohort,
    measure,
    units: 'targetPercent' as const,
    timing: 'all' as const,
    goal: goal.value,
    timeFrame,
    resetKey,
  }
  let exactRows: DetailRow[] = []
  let labels: string[] = []
  let tableLabel = ''
  let rowHeading = ''
  if (section === 'evidence') {
    tableLabel = 'Performance Evidence exact values'
    rowHeading = 'Evidence'
    labels = ['Value']
    const evidence =
      evidenceScope === 'activity'
        ? activity
        : historicalReadiness?.[evidenceScope]
    const entries: Array<[string, ReactNode]> = []
    if (evidenceScope === 'activity') {
      entries.push(
        [
          'Population',
          'All retained selected-period assessments, independent of Performance population.',
        ],
        [
          'Exact recorded successful seconds',
          activity?.successfulRecordedSeconds ?? 'Unavailable',
        ],
      )
    } else if (
      evidenceScope === 'requested' &&
      historicalReadiness?.recommendedRange
    ) {
      const recommendation = historicalReadiness.recommendedRange
      entries.push([
        'Ready shorter view',
        <Link
          search={(previous) => ({ ...previous, range: recommendation })}
          to="/analytics"
        >
          Use ready {recommendation}-day view
        </Link>,
      ])
    }
    if (evidence && typeof evidence === 'object') {
      if ('failingReasons' in evidence)
        getAnalyticsReadinessMessages(evidence).forEach((message, index) =>
          entries.push([`Guidance ${index + 1}`, message]),
        )
      entries.push(
        ...Object.entries(evidence).map(([key, value]): [string, ReactNode] => [
          key,
          typeof value === 'object' ? JSON.stringify(value) : String(value),
        ]),
      )
    } else entries.push(['Status', 'Evidence unavailable'])
    entries.push(
      ['Report context', context],
      ['Report as of', timeFrame?.asOf ?? 'Unavailable'],
      ['Timezone', timeFrame?.timeZone ?? 'Unavailable'],
    )
    exactRows = entries.map(([label, value]) => ({
      id: label,
      label,
      values: { Value: value },
    }))
  } else if (section === 'ratings') {
    tableLabel = 'Performance Ratings exact values'
    rowHeading = 'Rating'
    labels = ['Description', 'Count', 'Fixed points', 'Weighted contribution']
    exactRows = ratings.map((rating) => ({
      id: rating,
      label: rating[0]!.toUpperCase() + rating.slice(1),
      values: {
        Description: ratingDescriptions[rating],
        Count: mixDifficulties.reduce(
          (sum, { key }) => sum + totals.difficulties[key][rating],
          0,
        ),
        'Fixed points': performanceRatingPoints[rating],
        'Weighted contribution': mixDifficulties.reduce(
          (sum, { key }) =>
            sum +
            totals.difficulties[key][rating] *
              performanceDifficultyInfluence[key] *
              performanceRatingPoints[rating],
          0,
        ),
      },
    }))
  } else if (section === 'difficulty') {
    tableLabel = 'Performance Difficulty exact values'
    rowHeading = 'Difficulty'
    labels = [
      'Recorded',
      'Valid',
      'Invalid excluded',
      'Influence',
      'Score',
      'Again',
      'Hard',
      'Good',
      'Easy',
      'Prior valid',
      'Prior score',
      'Change',
      'Prior period',
      'Prior recorded',
      'Prior invalid',
      'Prior Again',
      'Prior Hard',
      'Prior Good',
      'Prior Easy',
    ]
    exactRows = mixDifficulties.map(({ key, label }) => {
      const current = totals.difficulties[key],
        prior = view.previousPeriod ? selected.previous.difficulties[key] : null
      const score = difficultyScore(current),
        previousScore = prior ? difficultyScore(prior) : null
      const change =
        prior === null
          ? 'No previous period'
          : current.validRatings < 10 || prior.validRatings < 10
            ? 'Sparse comparison'
            : score === null || previousScore === null
              ? 'Unavailable'
              : `${score - previousScore} points`
      return {
        id: key,
        label: key === 'unknown' ? 'Unclassified' : label,
        values: {
          Recorded: current.recordedAssessments,
          Valid: current.validRatings,
          'Invalid excluded': current.excludedInvalidRatings,
          Influence: performanceDifficultyInfluence[key],
          Score: scoreText(score),
          Again: current.again,
          Hard: current.hard,
          Good: current.good,
          Easy: current.easy,
          'Prior valid': prior?.validRatings ?? 'Unavailable',
          'Prior score': scoreText(previousScore),
          Change: change,
          'Prior period': priorPeriod(view),
          'Prior recorded': prior?.recordedAssessments ?? 'Unavailable',
          'Prior invalid': prior?.excludedInvalidRatings ?? 'Unavailable',
          'Prior Again': prior?.again ?? 'Unavailable',
          'Prior Hard': prior?.hard ?? 'Unavailable',
          'Prior Good': prior?.good ?? 'Unavailable',
          'Prior Easy': prior?.easy ?? 'Unavailable',
        },
      }
    })
  } else if (section === 'intervals') {
    tableLabel = 'Performance Intervals exact values'
    rowHeading = 'Interval'
    labels = [
      'ID',
      'Start',
      'End',
      'Partial',
      'Interval score',
      'New valid',
      'Cumulative valid',
      'Weighted points',
      'Weighted units',
      'Cumulative score',
      'State',
      'Last update',
      'Recorded',
      'Invalid excluded',
      'Interval weighted points',
      'Interval weighted units',
      'Context',
      'Report as of',
      'Timezone',
    ]
    exactRows = presentation.rows.map((row) => ({
      id: row.id,
      label: formatHistoricalBucket(row, timeFrame),
      values: {
        ID: row.id,
        Start: row.bucketStart,
        End: row.bucketEnd,
        Partial: String(row.isPartial),
        'Interval score': scoreText(row.intervalStats.score),
        'New valid': row.intervalStats.validRatings,
        'Cumulative valid': row.cumulativeStats.validRatings,
        'Weighted points': row.cumulativeStats.weightedPoints,
        'Weighted units': row.cumulativeStats.weightedUnits,
        'Cumulative score': scoreText(row.cumulativeStats.score),
        State: row.state,
        'Last update': row.lastUpdatedInterval
          ? `${row.lastUpdatedInterval.id}: ${row.lastUpdatedInterval.bucketStart}–${row.lastUpdatedInterval.bucketEnd}`
          : 'None',
        Recorded: mixDifficulties.reduce(
          (sum, { key }) => sum + row.difficulties[key].recordedAssessments,
          0,
        ),
        'Invalid excluded': mixDifficulties.reduce(
          (sum, { key }) => sum + row.difficulties[key].excludedInvalidRatings,
          0,
        ),
        'Interval weighted points': row.intervalStats.weightedPoints,
        'Interval weighted units': row.intervalStats.weightedUnits,
        Context: historicalIntervalContext(row, timeFrame),
        'Report as of': timeFrame?.asOf ?? 'Unavailable',
        Timezone: timeFrame?.timeZone ?? 'Unavailable',
      },
    }))
  } else if (section === 'pooled' && pooledDisplay === 'values') {
    tableLabel = 'Performance Pooled outcomes exact values'
    rowHeading = 'Interval'
    const successGoal = problemGoal(view, cohort, 'successRate'),
      goodGoal = problemGoal(view, cohort, 'goodEasyRate')
    labels = [
      'Recorded',
      'Valid',
      'Invalid excluded',
      'Again',
      'Hard',
      'Good',
      'Easy',
      'Hard + Good + Easy',
      'Good + Easy',
      successGoal.label,
      goodGoal.label,
      'Context',
      'Report as of',
      'Timezone',
    ]
    exactRows = pooledRows.map((row) => ({
      id: row.id,
      label: formatHistoricalBucket(row, timeFrame),
      values: {
        Recorded: row.recordedAssessments,
        Valid: row.validRatings,
        'Invalid excluded': row.excludedInvalidRatings,
        Again: row.again,
        Hard: row.hard,
        Good: row.good,
        Easy: row.easy,
        'Hard + Good + Easy': `${outcomeText(row.successRate)} (${row.hardGoodEasy}/${row.validRatings})`,
        'Good + Easy': `${outcomeText(row.goodEasyRate)} (${row.goodEasy}/${row.validRatings})`,
        [successGoal.label]: outcomeText(successGoal.value),
        [goodGoal.label]: outcomeText(goodGoal.value),
        Context: historicalIntervalContext(row, timeFrame),
        'Report as of': timeFrame?.asOf ?? 'Unavailable',
        Timezone: timeFrame?.timeZone ?? 'Unavailable',
      },
    }))
  } else if (section === 'difficultyOutcomes' && outcomeDisplay === 'values') {
    tableLabel = 'Performance Difficulty outcomes exact values'
    rowHeading =
      outcomeMode === 'trend' ? 'Interval · difficulty' : 'Difficulty'
    labels = [
      'Recorded',
      'Valid',
      'Invalid excluded',
      outcomeLabel(measure),
      'Numerator / valid',
      goal.label,
      'Context',
      'Report as of',
      'Timezone',
      ...(outcomeMode === 'compare'
        ? ['Prior rate', 'Prior valid', 'Change', 'Prior period']
        : []),
    ]
    const rows =
      outcomeMode === 'trend'
        ? activityRows.flatMap((interval) =>
            shown.map((difficulty) => ({
              id: `${interval.id}:${difficulty.key}`,
              difficulty,
              stats: interval.difficulties[difficulty.key],
              interval,
              prior: null,
            })),
          )
        : difficulties.map((difficulty) => ({
            id: difficulty.key,
            difficulty,
            stats: totals.difficulties[difficulty.key],
            interval: null,
            prior: selected.previous.difficulties[difficulty.key],
          }))
    exactRows = rows.map(({ id, difficulty, stats, interval, prior }) => ({
      id,
      label: interval
        ? `${formatHistoricalBucket(interval, timeFrame)} · ${difficulty.label}`
        : difficulty.label,
      values: {
        Recorded: stats.recordedAssessments,
        Valid: stats.validRatings,
        'Invalid excluded': stats.excludedInvalidRatings,
        [outcomeLabel(measure)]: outcomeText(stats[measure]),
        'Numerator / valid': `${outcomeNumerator(stats, measure)}/${stats.validRatings}`,
        [goal.label]: outcomeText(goal.value),
        Context: interval
          ? historicalIntervalContext(interval, timeFrame)
          : 'Selected period',
        'Report as of': timeFrame?.asOf ?? 'Unavailable',
        Timezone: timeFrame?.timeZone ?? 'Unavailable',
        'Prior rate':
          prior && view.previousPeriod
            ? outcomeText(prior[measure])
            : 'Unavailable',
        'Prior valid':
          prior && view.previousPeriod ? prior.validRatings : 'Unavailable',
        Change:
          view.previousPeriod === null
            ? 'No previous period'
            : prior
              ? comparisonText(stats, prior, measure)
              : 'Unavailable',
        'Prior period': priorPeriod(view),
      },
    }))
  } else if (section === 'mix' && mixDisplay === 'values') {
    tableLabel = 'Performance Mix exact values'
    rowHeading = 'Interval · difficulty'
    labels = [
      'Assessments',
      'Recorded seconds',
      'Share',
      'Context',
      'Report as of',
      'Timezone',
    ]
    const period = {
      id: 'selected-period',
      bucketStart: selected.rows[0]?.bucketStart ?? '',
      bucketEnd: selected.rows.at(-1)?.bucketEnd ?? '',
      isPartial: false,
      difficulties: totals.difficulties,
    }
    exactRows = [period, ...selected.rows].flatMap((row) =>
      mixDifficulties.map(({ key, label }, index) => ({
        id: `${row.id}:${key}`,
        label: `${row.id === 'selected-period' ? 'Selected period' : formatHistoricalBucket(row, timeFrame)} · ${key === 'unknown' ? 'Unclassified' : label}`,
        values: {
          Assessments: row.difficulties[key].recordedAssessments,
          'Recorded seconds': row.difficulties[key].time.all.totalSeconds,
          Share:
            mixShares(row, mixMeasure)[index] === null
              ? '—'
              : `${mixShares(row, mixMeasure)[index]! * 100}%`,
          Context:
            row.id === 'selected-period'
              ? 'Selected period'
              : historicalIntervalContext(row, timeFrame),
          'Report as of': timeFrame?.asOf ?? 'Unavailable',
          Timezone: timeFrame?.timeZone ?? 'Unavailable',
        },
      })),
    )
  }
  const fields = fieldsFor(labels)
  const isTable = tableLabel !== ''
  const methodPages = [
    <div className="cp-performance-method" key="evidence">
      <p>
        Exact weighted score: <strong>{scoreText(totals.score)}</strong>
      </p>
      <p>
        <strong>
          {totals.weightedPoints} / {totals.weightedUnits}
        </strong>{' '}
        weighted points / units.
      </p>
      <p>
        {totals.assessmentDays} assessment days · {totals.recordedAssessments}{' '}
        recorded · {totals.distinctProblems} distinct problems.
      </p>
      <p>
        Good + Easy: {totals.goodEasy}/{totals.validRatings} valid (
        {outcomeText(totals.goodEasyRate)}). {totals.excludedInvalidRatings}{' '}
        invalid excluded.
      </p>
      <p>
        Prior valid:{' '}
        {presentation.comparison.previousStats?.validRatings ?? 'Unavailable'};
        comparison: {presentation.comparison.state}
        {presentation.comparison.differencePoints === null
          ? ''
          : `, ${presentation.comparison.differencePoints} points`}
        .
      </p>
    </div>,
    <div className="cp-performance-method" key="rubric">
      <p>
        Again 0, Hard 50, Good 80, Easy 100 points. Current catalog difficulty
        weights Easy 1, Medium 2, Hard 3, Unclassified 1.
      </p>
      <p>
        Sum rating points × influence, then divide by valid weighted units.
        Count pooling preserves every valid rating; it does not average
        difficulty or interval scores. Unclassified uses base influence without
        becoming Easy.
      </p>
    </div>,
    <div className="cp-performance-method" key="cohort">
      <p>
        New problems uses the earliest retained raw assessment per problem
        across cards and modes, before validity, period, difficulty or timing
        filters. Invalid first ratings do not promote later records.
      </p>
      <p>
        Hints, retries and earlier exposure are unknown. Follow-up practice uses
        every later raw assessment and differs from FSRS-paired Recall. Invalid
        ratings remain in recorded counts and Mix.
      </p>
    </div>,
    <div className="cp-performance-method" key="holds">
      <p>
        Updated intervals add valid ratings. Held intervals add none and carry
        the prior cumulative score and last update; they receive no update
        marker. Leading unavailable intervals have no score or fill.
      </p>
      <p>
        Raw outcome bridges cross missing evidence without creating
        observations. Raw outcome goals are independent aspirations; Performance
        has no score goal or grade. {context}
      </p>
    </div>,
  ]
  return (
    <AnalyticsChartPanel
      compact
      className="cp-historical-view cp-historical-problem-solving"
      historical
      id="analytics-performance"
      title="Performance"
      description="Weighted assessment score"
      mode={mode}
      headerAction={
        <Button
          ref={headerRef}
          aria-label={
            mode === 'overview' ? 'Performance Details' : 'Performance Overview'
          }
          className="cp-analytics-card-control"
          size="sm"
          variant="ghost"
          onClick={() =>
            setMode(
              mode === 'overview'
                ? section === 'goals'
                  ? 'goals'
                  : 'details'
                : 'overview',
            )
          }
        >
          {mode === 'overview' ? 'Breakdown' : 'Overview'}
        </Button>
      }
      hero={
        <div className="cp-performance-hero">
          <strong data-testid="performance-score">
            {totals.score === null
              ? 'Unavailable'
              : `${Math.round(totals.score)}/100`}
          </strong>
          <span>{totals.validRatings} valid ratings</span>
        </div>
      }
      footer={(geometry) =>
        mode === 'overview' ? (
          <>
            <span className="cp-performance-hold-key">No new ratings</span>
            <span>
              {lastUpdate
                ? `Last update ${formatHistoricalBucket(lastUpdate, timeFrame)}`
                : 'No valid ratings yet'}
            </span>
          </>
        ) : section === 'method' ? (
          <AnalyticsCardPager
            label="Performance method pages"
            page={methodPage}
            pageSize={1}
            rowCount={methodPages.length}
            onPageChange={setMethodPage}
          />
        ) : isTable ? (
          <AnalyticsCardPager
            label="Performance rows"
            page={page}
            pageSize={pageSizeFor(geometry)}
            rowCount={exactRows.length}
            onPageChange={setPage}
          />
        ) : (
          <span>
            {section === 'goals'
              ? 'Saved goals apply to raw outcomes.'
              : `${totals.recordedAssessments} recorded · ${totals.excludedInvalidRatings} invalid excluded`}
          </span>
        )
      }
    >
      {(geometry) => (
        <div className="cp-performance-content">
          {mode === 'overview' ? (
            <>
              <label className="sr-only" htmlFor="performance-population">
                Performance population
              </label>
              <select
                id="performance-population"
                className="cp-analytics-adapter-select"
                value={cohort}
                onChange={(event) =>
                  setCohort(event.target.value as ProblemCohort)
                }
              >
                <option value="newProblems">New problems</option>
                <option value="followupPractice">Follow-up practice</option>
              </select>
              {totals.score === null ? (
                <p className="m-0 text-sm text-muted-foreground">
                  No valid ratings in this period. Invalid recorded ratings are
                  excluded from the score.
                </p>
              ) : (
                <HistoricalChart
                  compact={{
                    height: Math.max(0, geometry.bodyHeight - 40),
                    showGroupingLabel: false,
                  }}
                  cumulativeAsOf
                  rows={presentation.rows}
                  config={{}}
                  name="Performance cumulative chart"
                  description={`Weighted cumulative assessment score, 0–100. ${totals.validRatings} valid ratings; ${totals.excludedInvalidRatings} invalid excluded; ${totals.unclassifiedRatings} Unclassified valid ratings at base influence. Held intervals add no evidence. ${context}`}
                  timeFrame={timeFrame}
                  yAxes={[
                    {
                      label: 'Score (0–100)',
                      scale: { domain: [0, 100], ticks: [0, 50, 100] },
                      format: String,
                    },
                  ]}
                  tooltip={(row) => (
                    <div className="rounded border border-border bg-popover p-2 text-xs shadow-md">
                      <p className="m-0">
                        {formatHistoricalBucket(row, timeFrame)} ·{' '}
                        {row.state === 'held'
                          ? 'Held'
                          : row.state === 'updated'
                            ? 'Updated'
                            : 'Unavailable'}
                      </p>
                      <p className="m-0">
                        {row.intervalStats.validRatings} new valid; interval
                        score {scoreText(row.intervalStats.score)}.
                      </p>
                      <p className="m-0">
                        Cumulative {scoreText(row.cumulativeStats.score)};{' '}
                        {row.cumulativeStats.validRatings} valid;{' '}
                        {row.cumulativeStats.weightedPoints} points /{' '}
                        {row.cumulativeStats.weightedUnits} units.
                      </p>
                      <p className="m-0">
                        Last update{' '}
                        {row.lastUpdatedInterval
                          ? formatHistoricalBucket(
                              row.lastUpdatedInterval,
                              timeFrame,
                            )
                          : 'None'}
                        . {historicalIntervalContext(row, timeFrame)} ·{' '}
                        {context}
                      </p>
                    </div>
                  )}
                >
                  {(rows, selectedRow, tooltipVisible) => (
                    <CumulativeTrend
                      rows={rows}
                      value={(row) => row.cumulativeStats.score}
                      state={(row) => row.state}
                      visibleEnd={rows.at(-1)?.endX ?? 0}
                      color="var(--cp-analytics-first-success)"
                      selectedRow={tooltipVisible ? selectedRow : null}
                      area
                      testId="performance-trend"
                    />
                  )}
                </HistoricalChart>
              )}
            </>
          ) : (
            <>
              <select
                className="cp-analytics-adapter-select"
                aria-label="Performance detail section"
                value={section}
                onChange={(event) =>
                  chooseSection(event.target.value as Section)
                }
              >
                <optgroup label="Evidence">
                  <option value="ratings">Ratings</option>
                  <option value="difficulty">Difficulty</option>
                  <option value="mix">Mix</option>
                  <option value="intervals">Intervals</option>
                </optgroup>
                <optgroup label="More">
                  <option value="pooled">Pooled outcomes</option>
                  <option value="difficultyOutcomes">
                    Difficulty outcomes
                  </option>
                  <option value="goals">Goals</option>
                  <option value="evidence">Evidence</option>
                  <option value="method">Method</option>
                </optgroup>
              </select>
              {section === 'evidence' ? (
                <select
                  className="cp-analytics-adapter-select"
                  aria-label="Performance evidence scope"
                  value={evidenceScope}
                  onChange={(event) =>
                    setEvidenceScope(event.target.value as typeof evidenceScope)
                  }
                >
                  <option value="requested">Selected range</option>
                  <option value="firstAttemptOutcomes">First attempts</option>
                  <option value="recallQuality">Recall</option>
                  <option value="practiceRhythm">Practice</option>
                  <option value="ratingsMix">Ratings</option>
                  <option value="topics">Topics</option>
                  <option value="stability">Memory strength</option>
                  <option value="overdueBacklog">Backlog</option>
                  <option value="activity">Selected activity</option>
                </select>
              ) : null}
              {section === 'pooled' ? (
                <div className="cp-performance-pooled-controls">
                  <select
                    className="cp-analytics-adapter-select"
                    aria-label="Pooled outcome display"
                    value={pooledDisplay}
                    onChange={(event) => {
                      setPooledDisplay(
                        event.target.value as typeof pooledDisplay,
                      )
                      setPage(0)
                    }}
                  >
                    <option value="trend">Trend</option>
                    <option value="values">Exact values</option>
                  </select>
                  {pooledDisplay === 'trend' ? (
                    <div className="cp-performance-series">
                      {(['successRate', 'goodEasyRate'] as const).map((key) => (
                        <button
                          type="button"
                          key={key}
                          aria-pressed={pooledVisible[key]}
                          onClick={() =>
                            setPooledVisible((current) => ({
                              ...current,
                              [key]: !current[key],
                            }))
                          }
                        >
                          {outcomeLabel(key)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {section === 'difficultyOutcomes' ? (
                <select
                  className="cp-analytics-adapter-select"
                  aria-label="Difficulty outcome display"
                  value={outcomeDisplay}
                  onChange={(event) => {
                    const next = event.target.value as typeof outcomeDisplay
                    setOutcomeDisplay(next)
                    if (next === 'trend' || next === 'compare')
                      setOutcomeMode(next)
                    setPage(0)
                  }}
                >
                  <option value="trend">Trend</option>
                  <option value="compare">Compare</option>
                  <option value="values">Exact values</option>
                  <option value="settings">Outcome settings</option>
                </select>
              ) : null}
              {section === 'mix' ? (
                <select
                  className="cp-analytics-adapter-select"
                  aria-label="Mix display"
                  value={mixDisplay}
                  onChange={(event) => {
                    setMixDisplay(event.target.value as typeof mixDisplay)
                    setPage(0)
                  }}
                >
                  <option value="values">Exact values</option>
                  <option value="trend">Trend</option>
                  <option value="settings">Mix settings</option>
                </select>
              ) : null}
              {isTable ? (
                <AnalyticsExactTable
                  key={`${tableLabel}:${outcomeMode}:${measure}`}
                  label={tableLabel}
                  rows={exactRows}
                  rowKey={(row) => row.id}
                  rowLabel={(row) => row.label}
                  rowLabelHeading={rowHeading}
                  fields={fields.map((field) => ({
                    ...field,
                    value: (row: DetailRow) => row.values[field.key],
                  }))}
                  width={geometry.width}
                  page={page}
                  pageSize={pageSizeFor(geometry)}
                  onPageChange={setPage}
                  resetKey={resetKey}
                />
              ) : null}
              {section === 'method' ? methodPages[methodPage] : null}
              {section === 'pooled' && pooledDisplay === 'trend' ? (
                <CombinedProblemOutcomesPlot
                  view={view}
                  cohort={cohort}
                  visible={pooledVisible}
                  timeFrame={timeFrame}
                  compact={{
                    height: Math.max(0, geometry.bodyHeight - 116),
                    showGroupingLabel: false,
                  }}
                />
              ) : null}
              {section === 'difficultyOutcomes' &&
              (outcomeDisplay === 'trend' || outcomeDisplay === 'compare') ? (
                outcomeDisplay === 'trend' ? (
                  <ProblemTrendChart
                    kind="outcome"
                    rows={activityRows}
                    shown={shown}
                    {...plotOptions}
                    compact={{
                      height: Math.max(0, geometry.bodyHeight - 80),
                      showGroupingLabel: false,
                    }}
                  />
                ) : (
                  <ComparisonChart
                    kind="outcome"
                    {...plotOptions}
                    compact={{
                      height: Math.max(0, geometry.bodyHeight - 80),
                      showGroupingLabel: false,
                    }}
                  />
                )
              ) : null}
              {section === 'difficultyOutcomes' &&
              outcomeDisplay === 'settings' ? (
                <div className="cp-performance-method">
                  <label>
                    Outcome measure
                    <select
                      className="cp-analytics-adapter-select"
                      aria-label="Outcome measure"
                      value={measure}
                      onChange={(event) =>
                        setMeasure(event.target.value as OutcomeMeasure)
                      }
                    >
                      <option value="successRate">Hard + Good + Easy</option>
                      <option value="goodEasyRate">Good + Easy</option>
                    </select>
                  </label>
                  <div className="cp-performance-series">
                    {difficulties.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={visible[key]}
                        onClick={() =>
                          setVisible((current) => ({
                            ...current,
                            [key]: !current[key],
                          }))
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p>
                    Trend visibility preserves dates and scales. Compare always
                    shows all three difficulties. {goal.label}:{' '}
                    {outcomeText(goal.value)}.
                  </p>
                </div>
              ) : null}
              {section === 'mix' && mixDisplay === 'settings' ? (
                <label>
                  Mix measure
                  <select
                    className="cp-analytics-adapter-select"
                    aria-label="Difficulty Mix measure"
                    value={mixMeasure}
                    onChange={(event) =>
                      setMixMeasure(event.target.value as typeof mixMeasure)
                    }
                  >
                    <option value="assessments">Assessment share</option>
                    <option value="time">Recorded-time share</option>
                  </select>
                </label>
              ) : null}
              {section === 'mix' && mixDisplay === 'trend' ? (
                <DifficultyMixChart
                  rows={selected.rows}
                  measure={mixMeasure}
                  timeFrame={timeFrame}
                  resetKey={resetKey}
                  compact={{
                    height: Math.max(0, geometry.bodyHeight - 80),
                    showGroupingLabel: false,
                  }}
                />
              ) : null}
              {section === 'goals' ? (
                <>
                  <select
                    className="cp-analytics-adapter-select"
                    aria-label="Performance goal"
                    value={goalMetric}
                    onChange={(event) =>
                      setGoalMetric(event.target.value as TargetMetric)
                    }
                  >
                    {goalMetrics.map((metric) => (
                      <option value={metric} key={metric}>
                        {targetMetrics[metric].label}
                      </option>
                    ))}
                  </select>
                  {!onSaveTarget ? (
                    <p className="m-0 text-sm">
                      {targetMetrics[goalMetric].label}:{' '}
                      {outcomeText(view.targets[targetMetrics[goalMetric].key])}
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          )}
          {onSaveTarget
            ? goalMetrics.map((metric) => (
                <AnalyticsTargetEditor
                  key={metric}
                  surface="goals"
                  metric={metric}
                  targets={view.targets}
                  onSave={onSaveTarget}
                  open={mode === 'goals' && goalMetric === metric}
                  onOpenChange={(open) => {
                    if (!open && mode === 'goals' && goalMetric === metric) {
                      setSection(beforeGoals)
                      setMode('details')
                    }
                  }}
                  returnFocusRef={headerRef}
                />
              ))
            : null}
        </div>
      )}
    </AnalyticsChartPanel>
  )
}

function priorPeriod(view: ProblemView) {
  return view.previousPeriod
    ? `${view.previousPeriod.start}–${view.previousPeriod.asOf}`
    : 'No previous period for All time'
}
