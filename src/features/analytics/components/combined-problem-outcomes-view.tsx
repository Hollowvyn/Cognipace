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
import { outcomeText } from './problem-solving-model'
import type { ProblemRow, ProblemView } from './problem-solving-model'

const outcomes = [
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
}: {
  view: ProblemView
  timeFrame?: HistoricalChartTimeFrame | undefined
  onSaveTarget?:
    | ((patch: Partial<AnalyticsTargets>) => Promise<unknown>)
    | undefined
}) {
  const [visible, setVisible] = useState({
    successRate: true,
    goodEasyRate: true,
  })
  const rows = trimHistoricalEmptyEdges(
    combinedProblemOutcomeRows(view.cohorts.newProblems.rows),
    (row) => row.validRatings > 0,
  )
  const totals = view.cohorts.newProblems.totals
  const sharedTarget =
    view.targets.targetFirstAttemptSuccess ===
    view.targets.targetFirstAttemptGoodEasy
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
      (_, i) => Number((domain[0] + i * 0.05).toFixed(2)),
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
        Selected period: {formatCount(totals.recordedAssessments)} recorded
        first attempts · {formatCount(totals.validRatings)} valid ·{' '}
        {formatCount(totals.excludedInvalidRatings)} invalid first ratings
        excluded.
      </p>
      <ChartTable
        chart={
          rows.length ? (
            <div className="grid gap-2">
              <HistoricalChart
                config={Object.fromEntries(
                  outcomes.map(({ key, label, color }) => [
                    key,
                    { label, color },
                  ]),
                )}
                description={`${seriesDescription}. All difficulties, including Unknown. Both rates use the same valid first recorded outcomes. Long dashes bridge unavailable buckets without creating outcomes. Scale ${outcomeText(domain[0])}–${outcomeText(domain[1])}; hiding a curve preserves dates, scale and targets. ${goalDescription}.${sharedTarget ? ' Equal goals share one neutral reference at their saved value.' : ''} ${context}`}
                name="New Problem Success chart"
                rows={rows}
                timeFrame={timeFrame}
                height={310}
                startAtFirstPoint
                inspectionResetKey={`${visible.successRate}:${visible.goodEasyRate}`}
                yAxes={[
                  {
                    label: 'First outcomes (%)',
                    scale,
                    format: outcomeText,
                    padding: { top: 8, bottom: 8 },
                  },
                ]}
                tooltip={(row) => (
                  <CombinedTooltip
                    row={row}
                    view={view}
                    visible={visible}
                    timeFrame={timeFrame}
                  />
                )}
              >
                {(positioned, selected) => (
                  <>
                    {sharedTarget ? (
                      <HistoricalTargetLine
                        value={view.targets.targetFirstAttemptSuccess}
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
              <ChartTrendNote
                pointCount={rows.filter((row) => row.validRatings > 0).length}
              />
            </div>
          ) : (
            <p className="m-0 grid min-h-48 place-items-center text-sm text-muted-foreground">
              No valid first recorded outcomes in this period.
            </p>
          )
        }
        table={
          <HistoricalTable
            caption="New Problem Success exact values"
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
              'Target First-attempt Success',
              'Target Good + Easy',
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
              outcomeText(view.targets.targetFirstAttemptSuccess),
              outcomeText(view.targets.targetFirstAttemptGoodEasy),
              `${historicalIntervalContext(row, timeFrame)} · ${context}`,
            ]}
          />
        }
      />
      <div
        aria-label="First outcome chart series"
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
          curves divide by valid first recorded ratings: Again + Hard + Good +
          Easy. The gap between the curves is the Hard share; period rates use
          summed counts, not averaged percentages.
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

function CombinedTooltip({
  row,
  view,
  visible,
  timeFrame,
}: {
  row: CombinedRow
  view: ProblemView
  visible: { successRate: boolean; goodEasyRate: boolean }
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
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
          No valid first recorded outcomes in this bucket.
        </p>
      ) : null}
      <p className="m-0 text-muted-foreground">
        {historicalIntervalContext(row, timeFrame)} ·{' '}
        {historicalReportContext(timeFrame)}
      </p>
    </div>
  )
}
