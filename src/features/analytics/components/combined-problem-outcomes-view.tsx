import { useState } from 'react'

import { ChartTable } from '@/components/ui/chart-table'
import type { AnalyticsTargets } from '@/features/settings/domain'

import { buildAdaptivePercentageDomain } from '../domain/analytics-scales'
import { AnalyticsTargetEditor } from './analytics-target-editor'
import { ChartTrendNote, formatCount } from './charts/chart-shared'
import { HistoricalChart } from './charts/historical-chart'
import type { HistoricalChartTimeFrame } from './charts/historical-chart'
import {
  formatHistoricalBucket,
  historicalIntervalContext,
  historicalReportContext,
  trimHistoricalEmptyEdges,
} from './charts/historical-chart-model'
import { HistoricalTable } from './charts/historical-table'
import { HistoricalTargetLine } from './charts/historical-target-line'
import { LineSegments } from './charts/line-segments'
import { outcomeText, problemGoal } from './problem-solving-model'
import type {
  ProblemCohort,
  ProblemRow,
  ProblemView,
} from './problem-solving-model'

const outcomeSeries = [
  {
    key: 'successRate',
    label: 'Hard + Good + Easy',
    count: 'hardGoodEasy',
    metric: 'firstAttemptSuccess',
    target: 'targetFirstAttemptSuccess',
    goalLabel: 'Target First-attempt Success',
    shape: 'circle',
    symbol: '●',
    color: 'var(--cp-analytics-first-success)',
  },
  {
    key: 'goodEasyRate',
    label: 'Good + Easy',
    count: 'goodEasy',
    metric: 'firstAttemptGoodEasy',
    target: 'targetFirstAttemptGoodEasy',
    goalLabel: 'Target Good + Easy',
    shape: 'diamond',
    symbol: '◆',
    color: 'var(--cp-analytics-first-good-easy)',
  },
] as const

function problemOutcomes(view: ProblemView, cohort: ProblemCohort) {
  return outcomeSeries.map((series) => {
    const goal = problemGoal(view, cohort, series.key)
    return {
      ...series,
      metric: goal.metric,
      target: goal.key,
      goalLabel: goal.label,
    }
  })
}

/** Pool raw counts across every difficulty; averaging rates changes the denominator. */
export function combinedProblemOutcomeRows(rows: readonly ProblemRow[]) {
  return rows.map((row) => {
    const counts = {
      recordedAssessments: 0,
      validRatings: 0,
      excludedInvalidRatings: 0,
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
    }
    for (const stats of Object.values(row.difficulties)) {
      for (const key of Object.keys(counts) as (keyof typeof counts)[])
        counts[key] += stats[key]
    }
    const hardGoodEasy = counts.hard + counts.good + counts.easy
    const goodEasy = counts.good + counts.easy
    return {
      ...row,
      ...counts,
      hardGoodEasy,
      goodEasy,
      successRate: counts.validRatings
        ? hardGoodEasy / counts.validRatings
        : null,
      goodEasyRate: counts.validRatings ? goodEasy / counts.validRatings : null,
    }
  })
}
type CombinedRow = ReturnType<typeof combinedProblemOutcomeRows>[number]

export function CombinedProblemOutcomesView({
  view,
  timeFrame,
  onSaveTarget,
  cohort = 'newProblems',
}: {
  view: ProblemView
  cohort?: ProblemCohort
  timeFrame?: HistoricalChartTimeFrame | undefined
  onSaveTarget?:
    | ((patch: Partial<AnalyticsTargets>) => Promise<unknown>)
    | undefined
}) {
  const outcomes = problemOutcomes(view, cohort)
  const [visible, setVisible] = useState({
    successRate: true,
    goodEasyRate: true,
  })
  const rows = trimHistoricalEmptyEdges(
    combinedProblemOutcomeRows(view.cohorts[cohort].rows),
    (row) => row.validRatings > 0,
  )
  const totals = view.cohorts[cohort].totals
  const context = historicalReportContext(timeFrame)
  return (
    <div className="cp-historical-view cp-historical-first-outcomes grid min-w-0 gap-2">
      <div className="flex min-w-0 flex-wrap justify-end gap-x-4 gap-y-1">
        {outcomes.map((outcome) =>
          onSaveTarget ? (
            <AnalyticsTargetEditor
              key={outcome.key}
              metric={outcome.metric}
              targets={view.targets}
              onSave={onSaveTarget}
            />
          ) : (
            <span
              className="py-1 text-xs text-muted-foreground"
              key={outcome.key}
            >
              {outcome.goalLabel} {outcomeText(view.targets[outcome.target])}
            </span>
          ),
        )}
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        Selected period: {formatCount(totals.recordedAssessments)} recorded{' '}
        {cohort === 'newProblems' ? 'first attempts' : 'later raw assessments'}{' '}
        · {formatCount(totals.validRatings)} valid ·{' '}
        {formatCount(totals.excludedInvalidRatings)} invalid{' '}
        {cohort === 'newProblems' ? 'first' : 'later raw'} ratings excluded.
      </p>
      <ChartTable
        chart={
          rows.length ? (
            <div className="grid gap-2">
              <CombinedProblemOutcomesPlot
                view={view}
                cohort={cohort}
                visible={visible}
                timeFrame={timeFrame}
              />
              <ChartTrendNote
                pointCount={rows.filter((row) => row.validRatings > 0).length}
              />
            </div>
          ) : (
            <p className="m-0 grid min-h-48 place-items-center text-sm text-muted-foreground">
              No valid{' '}
              {cohort === 'newProblems' ? 'first recorded' : 'later raw'}{' '}
              outcomes in this period.
            </p>
          )
        }
        table={
          <HistoricalTable
            caption={
              cohort === 'newProblems'
                ? 'New Problem Success exact values'
                : 'Follow-up outcomes exact values'
            }
            rows={rows}
            resetKey={rows.map((row) => row.id).join('|')}
            headers={[
              'Interval',
              'Recorded',
              'Valid',
              'Invalid excluded',
              'Again',
              'Hard',
              'Good',
              'Easy',
              'Hard + Good + Easy',
              'Good + Easy',
              outcomes[0]!.goalLabel,
              outcomes[1]!.goalLabel,
              'Context',
            ]}
            cells={(row) => [
              formatHistoricalBucket(row, timeFrame),
              row.recordedAssessments,
              row.validRatings,
              row.excludedInvalidRatings,
              row.again,
              row.hard,
              row.good,
              row.easy,
              `${outcomeText(row.successRate)} (${row.hardGoodEasy}/${row.validRatings})`,
              `${outcomeText(row.goodEasyRate)} (${row.goodEasy}/${row.validRatings})`,
              outcomeText(view.targets[outcomes[0]!.target]),
              outcomeText(view.targets[outcomes[1]!.target]),
              `${historicalIntervalContext(row, timeFrame)} · ${context}`,
            ]}
          />
        }
      />
      <div
        aria-label={
          cohort === 'newProblems'
            ? 'First outcome chart series'
            : 'Follow-up outcome chart series'
        }
        className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground"
        role="group"
      >
        {outcomes.map(({ key, label, color, symbol }) => (
          <button
            aria-pressed={visible[key]}
            key={key}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-sm border-0 bg-transparent py-1 text-xs text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-[pressed=false]:opacity-45 [@media(pointer:coarse)]:min-h-11"
            onClick={() =>
              setVisible((current) => ({ ...current, [key]: !current[key] }))
            }
          >
            <span aria-hidden="true" style={{ color }}>
              {symbol}
            </span>{' '}
            {label}
          </button>
        ))}
        <span>Long dashes: missing buckets</span>
      </div>
      <details className="text-xs leading-relaxed text-muted-foreground">
        <summary className="cursor-pointer">Calculation details</summary>
        <p>
          All difficulties, including Unknown, contribute their counts. Both
          curves divide by valid{' '}
          {cohort === 'newProblems' ? 'first recorded' : 'later raw'} ratings:
          Again + Hard + Good + Easy. The gap between the curves is the Hard
          share; period rates use summed counts, not averaged percentages.
        </p>
        <p>
          First means the earliest assessment per problem in retained history,
          selected before period and rating filters. Invalid first ratings are
          excluded without promoting a later record. Hints, retries and earlier
          exposure are unknown. These are recorded assessments, not proof of
          unassisted first-ever solving. Both saved goals are independent
          aspirations.
        </p>
        <p>
          Selected-period weighted outcomes: Hard + Good + Easy{' '}
          {outcomeText(totals.successRate)} ({totals.hardGoodEasy}/
          {totals.validRatings}); Good + Easy {outcomeText(totals.goodEasyRate)}{' '}
          ({totals.goodEasy}/{totals.validRatings}). {context}
        </p>
      </details>
    </div>
  )
}

export function CombinedProblemOutcomesPlot({
  view,
  cohort = 'newProblems',
  visible,
  timeFrame,
  compact,
}: {
  view: ProblemView
  cohort?: ProblemCohort
  visible: { successRate: boolean; goodEasyRate: boolean }
  timeFrame?: HistoricalChartTimeFrame | undefined
  compact?: { height: number; showGroupingLabel?: boolean } | undefined
}) {
  const outcomes = problemOutcomes(view, cohort)
  const rows = trimHistoricalEmptyEdges(
    combinedProblemOutcomeRows(view.cohorts[cohort].rows),
    (row) => row.validRatings > 0,
  )
  const sharedTarget =
    view.targets[outcomes[0]!.target] === view.targets[outcomes[1]!.target]
  const domain = buildAdaptivePercentageDomain(
    rows
      .flatMap((row) => [row.successRate, row.goodEasyRate])
      .filter((value): value is number => value !== null),
    outcomes.map(({ target }) => view.targets[target]),
  )
  const scale = {
    domain,
    ticks: Array.from(
      { length: Math.round((domain[1] - domain[0]) / 0.05) + 1 },
      (_, index) => Number((domain[0] + index * 0.05).toFixed(2)),
    ),
  }
  const context = historicalReportContext(timeFrame)
  const seriesDescription =
    outcomes
      .filter(({ key }) => visible[key])
      .map(
        ({ label, shape }) =>
          `${label} uses ${shape === 'circle' ? 'circles' : 'diamonds'}`,
      )
      .join('; ') || 'Both data series are hidden'
  const goalDescription = outcomes
    .map(
      ({ goalLabel, target }) =>
        `${goalLabel}: ${outcomeText(view.targets[target])}`,
    )
    .join('. ')
  if (!rows.length)
    return (
      <p className="m-0 text-sm text-muted-foreground">
        No valid {cohort === 'newProblems' ? 'first recorded' : 'later raw'}{' '}
        outcomes in this period.
      </p>
    )
  return (
    <HistoricalChart
      config={Object.fromEntries(
        outcomes.map(({ key, label, color }) => [key, { label, color }]),
      )}
      description={`${seriesDescription}. All difficulties, including Unknown. Both rates use the same valid ${cohort === 'newProblems' ? 'first recorded' : 'later raw'} outcomes. Long dashes bridge unavailable buckets without creating outcomes. Scale ${outcomeText(domain[0])}–${outcomeText(domain[1])}; hiding a curve preserves dates, scale and targets. ${goalDescription}.${sharedTarget ? ' Equal goals share one neutral reference at their saved value.' : ''} ${context}`}
      name={
        cohort === 'newProblems'
          ? 'New Problem Success chart'
          : 'Follow-up outcomes chart'
      }
      compact={compact}
      rows={rows}
      timeFrame={timeFrame}
      height={310}
      startAtFirstPoint
      inspectionResetKey={`${visible.successRate}:${visible.goodEasyRate}`}
      yAxes={[
        {
          label:
            cohort === 'newProblems'
              ? 'First outcomes (%)'
              : 'Later outcomes (%)',
          scale,
          format: outcomeText,
          padding: { top: 8, bottom: 8 },
        },
      ]}
      tooltip={(row) => (
        <CombinedTooltip
          row={row}
          view={view}
          cohort={cohort}
          visible={visible}
          timeFrame={timeFrame}
        />
      )}
    >
      {(positioned, selected) => (
        <>
          {sharedTarget ? (
            <HistoricalTargetLine
              value={view.targets[outcomes[0]!.target]}
              stroke="var(--cp-analytics-first-shared-target)"
              testId="combined-shared-target"
            />
          ) : (
            outcomes.map(({ key, target, color }) => (
              <HistoricalTargetLine
                key={key}
                value={view.targets[target]}
                stroke={color}
                testId={`combined-${key}-target`}
              />
            ))
          )}
          {outcomes.map(({ key, label, color, shape }) =>
            visible[key] ? (
              <LineSegments
                data={positioned}
                dataKey={key}
                seriesKey={label}
                key={key}
                stroke={color}
                strokeWidth={key === 'successRate' ? 2.5 : 1.8}
                markerShape={shape}
                markerFill="var(--color-card)"
                showMeasuredDots
                activeIndex={positioned.findIndex(
                  (row) => row.id === selected?.id,
                )}
                bridgeDasharray="9 7"
                bridgeStrokeWidth={1.5}
                type="linear"
                testId={`combined-${key}`}
              />
            ) : null,
          )}
        </>
      )}
    </HistoricalChart>
  )
}

function CombinedTooltip({
  row,
  view,
  visible,
  timeFrame,
  cohort = 'newProblems',
}: {
  row: CombinedRow
  cohort?: ProblemCohort
  view: ProblemView
  visible: { successRate: boolean; goodEasyRate: boolean }
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  const outcomes = problemOutcomes(view, cohort)
  return (
    <div className="grid gap-1 rounded border border-border bg-popover p-2.5 text-xs leading-relaxed shadow-md">
      <p className="m-0 font-semibold">
        {formatHistoricalBucket(row, timeFrame)}
      </p>
      <p className="m-0 text-muted-foreground">
        {row.recordedAssessments} recorded · {row.validRatings} valid ·{' '}
        {row.excludedInvalidRatings} invalid excluded
      </p>
      <p className="m-0 text-muted-foreground">
        Again {row.again} · Hard {row.hard} · Good {row.good} · Easy {row.easy}
      </p>
      {outcomes.map(({ key, label, count, target, goalLabel }) => (
        <div key={key}>
          {visible[key] ? (
            <p className="m-0">
              {label}: {outcomeText(row[key])} ({row[count]}/{row.validRatings})
            </p>
          ) : null}
          <p className="m-0 text-muted-foreground">
            {goalLabel}: {outcomeText(view.targets[target])}
          </p>
        </div>
      ))}
      {row.validRatings === 0 ? (
        <p className="m-0 text-muted-foreground">
          No valid {cohort === 'newProblems' ? 'first recorded' : 'later raw'}{' '}
          outcomes in this bucket.
        </p>
      ) : null}
      <p className="m-0 text-muted-foreground">
        {historicalIntervalContext(row, timeFrame)} ·{' '}
        {historicalReportContext(timeFrame)}
      </p>
    </div>
  )
}
