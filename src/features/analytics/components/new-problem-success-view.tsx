import { Fragment, useState } from 'react'
import type { ReactNode } from 'react'

import { ChartTable } from '@/components/ui/chart-table'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { ChartTrendNote, formatCount } from './charts/chart-shared'
import { HistoricalChart } from './charts/historical-chart'
import type { HistoricalChartTimeFrame } from './charts/historical-chart'
import {
  formatHistoricalBucket,
  historicalGroupingLabel,
  historicalIntervalContext,
  historicalReportContext,
  trimHistoricalEmptyEdges,
} from './charts/historical-chart-model'
import { HistoricalTable } from './charts/historical-table'
import { HistoricalTargetLine } from './charts/historical-target-line'
import { LineSegments } from './charts/line-segments'

type FirstRow = AnalyticsViews['firstAttemptOutcomes']['rows'][number]
type FirstView = AnalyticsViews['firstAttemptOutcomes']

const outcomes = [
  {
    key: 'firstAttemptSuccess',
    label: 'Hard + Good + Easy',
    color: 'var(--cp-analytics-first-success)',
    shape: 'circle',
    strokeWidth: 2.5,
    testId: 'first-attempt-success',
  },
  {
    key: 'firstAttemptGoodEasy',
    label: 'Good + Easy',
    color: 'var(--cp-analytics-first-good-easy)',
    shape: 'diamond',
    strokeWidth: 1.8,
    testId: 'first-attempt-good-easy',
  },
] as const

export function NewProblemSuccessView({
  view,
  timeFrame,
  targetControl,
}: {
  view: FirstView
  timeFrame?: HistoricalChartTimeFrame | undefined
  targetControl?: ReactNode
}) {
  const [series, setSeries] = useState({
    firstAttemptSuccess: true,
    firstAttemptGoodEasy: true,
  })
  const rows = trimHistoricalEmptyEdges(
    view.rows,
    (row) =>
      row.firstAttemptSuccess !== null || row.firstAttemptGoodEasy !== null,
  )
  const sharedTarget =
    view.targetFirstAttemptSuccess === view.targetFirstAttemptGoodEasy
  const visibleDescription =
    outcomes
      .filter((outcome) => series[outcome.key])
      .map(
        (outcome) =>
          `${outcome.label} uses a solid line with ${outcome.shape === 'circle' ? 'circles' : 'diamonds'}`,
      )
      .join('; ') || 'Both data series are hidden'
  const description = `${visibleDescription}. Both rates use the same valid first-recorded rating population in retained history. Long-dash bridges span unavailable buckets without adding outcomes. Scale: ${percent(view.scale.domain[0])}–${percent(view.scale.domain[1])}. Target First-attempt Success: ${percent(view.targetFirstAttemptSuccess)}. Target Good + Easy: ${percent(view.targetFirstAttemptGoodEasy)}.${sharedTarget ? ' The equal goals share one neutral reference at their saved value.' : ''} ${historicalGroupingLabel(timeFrame)}. ${historicalReportContext(timeFrame)}`

  return (
    <div className="cp-historical-view cp-historical-first-outcomes grid min-w-0 gap-2">
      <div className="cp-first-attempt-targets flex min-w-0 flex-wrap items-start justify-end gap-x-4 gap-y-1">
        {targetControl ?? (
          <>
            <TargetCaption
              color={
                sharedTarget
                  ? 'var(--cp-analytics-first-shared-target)'
                  : outcomes[0].color
              }
              label="Target First-attempt Success"
              value={view.targetFirstAttemptSuccess}
            />
            <TargetCaption
              color={
                sharedTarget
                  ? 'var(--cp-analytics-first-shared-target)'
                  : outcomes[1].color
              }
              label="Target Good + Easy"
              value={view.targetFirstAttemptGoodEasy}
            />
          </>
        )}
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        Selected period: {formatCount(view.totals.recordedFirstAttempts)}{' '}
        recorded first attempts · {formatCount(view.totals.validFirstAttempts)}{' '}
        valid · {formatCount(view.totals.excludedInvalidRatings)} invalid first
        ratings excluded.
      </p>
      <ChartTable
        chart={
          rows.length > 0 ? (
            <div className="grid gap-2">
              <HistoricalChart
                config={Object.fromEntries(
                  outcomes.map((outcome) => [
                    outcome.key,
                    { label: outcome.label, color: outcome.color },
                  ]),
                )}
                description={description}
                height={310}
                initialIndex={Math.max(0, Math.floor(rows.length / 2) - 1)}
                inspectionResetKey={`${series.firstAttemptSuccess}:${series.firstAttemptGoodEasy}`}
                name="New Problem Success chart"
                rows={rows}
                startAtFirstPoint
                timeFrame={timeFrame}
                tooltip={(row) => (
                  <FirstOutcomeTooltip
                    row={row}
                    series={series}
                    view={view}
                    timeFrame={timeFrame}
                  />
                )}
                yAxes={[
                  {
                    label: 'First outcomes (%)',
                    scale: view.scale,
                    format: percent,
                    padding: { top: 8, bottom: 8 },
                  },
                ]}
              >
                {(rows, selected) => (
                  <>
                    {sharedTarget ? (
                      <HistoricalTargetLine
                        stroke="var(--cp-analytics-first-shared-target)"
                        testId="first-attempt-shared-target"
                        value={view.targetFirstAttemptSuccess}
                      />
                    ) : (
                      <>
                        <HistoricalTargetLine
                          stroke={outcomes[0].color}
                          testId="first-attempt-success-target"
                          value={view.targetFirstAttemptSuccess}
                        />
                        <HistoricalTargetLine
                          stroke={outcomes[1].color}
                          testId="first-attempt-good-easy-target"
                          value={view.targetFirstAttemptGoodEasy}
                        />
                      </>
                    )}
                    {outcomes.map((outcome) =>
                      series[outcome.key] ? (
                        <LineSegments
                          activeIndex={rows.findIndex(
                            (row) => row.id === selected?.id,
                          )}
                          bridgeDasharray="9 7"
                          bridgeStrokeWidth={1.5}
                          data={rows}
                          dataKey={outcome.key}
                          key={outcome.key}
                          markerFill="var(--color-card)"
                          markerShape={outcome.shape}
                          seriesKey={outcome.label}
                          showMeasuredDots
                          stroke={outcome.color}
                          strokeWidth={outcome.strokeWidth}
                          testId={outcome.testId}
                          type="linear"
                        />
                      ) : null,
                    )}
                  </>
                )}
              </HistoricalChart>
              <ChartTrendNote
                pointCount={
                  rows.filter(
                    (row) =>
                      row.firstAttemptSuccess !== null ||
                      row.firstAttemptGoodEasy !== null,
                  ).length
                }
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
            cells={(row) => [
              `${formatHistoricalBucket(row, timeFrame)}${row.isPartial ? ' (in progress)' : ''}`,
              formatCount(row.recordedFirstAttempts),
              formatCount(row.excludedInvalidRatings),
              formatCount(row.validFirstAttempts),
              formatCount(row.again),
              formatCount(row.hard),
              formatCount(row.good),
              formatCount(row.easy),
              formatCount(row.hardGoodEasy),
              formatCount(row.goodEasy),
              percent(row.firstAttemptSuccess),
              percent(row.firstAttemptGoodEasy),
              percent(view.targetFirstAttemptSuccess),
              percent(view.targetFirstAttemptGoodEasy),
              evidenceText(row.evidence),
              periodContext(row, timeFrame),
            ]}
            headers={[
              'Bucket',
              'Recorded first attempts',
              'Excluded invalid ratings',
              'Valid first attempts',
              'Again',
              'Hard',
              'Good',
              'Easy',
              'Hard + Good + Easy count',
              'Good + Easy count',
              'Hard + Good + Easy',
              'Good + Easy',
              'Target First-attempt Success',
              'Target Good + Easy',
              'Evidence',
              'Period context',
            ]}
            resetKey={rows.map((row) => row.id).join('|')}
            rows={rows}
          />
        }
      />
      <div
        aria-label="First outcome chart series"
        className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground"
        role="list"
      >
        {outcomes.map((outcome) => (
          <span key={outcome.key} role="listitem">
            <button
              aria-pressed={series[outcome.key]}
              className="inline-flex items-center gap-1.5 rounded-sm border-0 bg-transparent py-1 text-xs text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-[pressed=false]:opacity-45 [@media(pointer:coarse)]:min-h-11"
              onClick={() =>
                setSeries((current) => ({
                  ...current,
                  [outcome.key]: !current[outcome.key],
                }))
              }
              type="button"
            >
              <svg aria-hidden="true" height="12" width="22">
                <line
                  stroke={outcome.color}
                  strokeWidth={outcome.strokeWidth}
                  x1="0"
                  x2="22"
                  y1="6"
                  y2="6"
                />
                {outcome.shape === 'circle' ? (
                  <circle
                    cx="11"
                    cy="6"
                    fill="var(--color-card)"
                    r="4"
                    stroke={outcome.color}
                    strokeWidth="2"
                  />
                ) : (
                  <path
                    d="M11,2.5L14.5,6L11,9.5L7.5,6Z"
                    fill="var(--color-card)"
                    stroke={outcome.color}
                    strokeWidth="1.5"
                  />
                )}
              </svg>
              {outcome.label}
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5" role="listitem">
          <svg aria-hidden="true" height="12" width="22">
            <line
              stroke="currentColor"
              strokeDasharray="9 7"
              x1="0"
              x2="22"
              y1="6"
              y2="6"
            />
          </svg>
          Long dashes: missing buckets
        </span>
      </div>
      <details className="text-xs leading-relaxed text-muted-foreground">
        <summary className="cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          Calculation details
        </summary>
        <p>
          First means “first recorded in retained history”: one earliest review
          per problem, selected before the period and rating filters. Invalid
          first ratings remain excluded; a later valid review never replaces
          them. Corrections, resets, deletions, and restored history can change
          this population. Hints, retries, and prior exposure are unknown, so
          these ratings do not prove unassisted solving or first-ever exposure.
        </p>
        <p>
          Both curves divide by the same valid first attempts: Again + Hard +
          Good + Easy. Hard share is the gap between Hard + Good + Easy and Good
          + Easy. Long dashes span unavailable buckets without adding outcomes;
          a measured 0% remains a real outcome.
        </p>
        <p>
          Selected-period weighted outcomes: Hard + Good + Easy{' '}
          {percent(view.totals.firstAttemptSuccess)} (
          {formatCount(view.totals.hardGoodEasy)}/
          {formatCount(view.totals.validFirstAttempts)}); Good + Easy{' '}
          {percent(view.totals.firstAttemptGoodEasy)} (
          {formatCount(view.totals.goodEasy)}/
          {formatCount(view.totals.validFirstAttempts)}). Both personal goals
          are independent aspirations.
        </p>
      </details>
    </div>
  )
}

function TargetCaption({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: number
}) {
  return (
    <p className="m-0 inline-flex items-center gap-2 py-1 text-right text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className="w-5 border-t border-dashed"
        style={{ borderColor: color }}
      />
      {label} {percent(value)}
    </p>
  )
}

function FirstOutcomeTooltip({
  row,
  series,
  view,
  timeFrame,
}: {
  row: FirstRow
  series: { firstAttemptSuccess: boolean; firstAttemptGoodEasy: boolean }
  view: FirstView
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  const values: Array<readonly [string, string]> = [
    ...(series.firstAttemptSuccess
      ? [
          [
            'Hard + Good + Easy',
            `${percent(row.firstAttemptSuccess)} (${formatCount(row.hardGoodEasy)}/${formatCount(row.validFirstAttempts)})`,
          ] as const,
        ]
      : []),
    ...(series.firstAttemptGoodEasy
      ? [
          [
            'Good + Easy',
            `${percent(row.firstAttemptGoodEasy)} (${formatCount(row.goodEasy)}/${formatCount(row.validFirstAttempts)})`,
          ] as const,
        ]
      : []),
    ['Target First-attempt Success', percent(view.targetFirstAttemptSuccess)],
    ['Target Good + Easy', percent(view.targetFirstAttemptGoodEasy)],
    ['Evidence', evidenceText(row.evidence)],
  ]
  return (
    <div className="rounded border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-sm">
      <p className="m-0 font-medium">
        {formatHistoricalBucket(row, timeFrame)} ·{' '}
        {historicalGroupingLabel(timeFrame)}
      </p>
      <p className="m-0 mt-1 tabular-nums text-muted-foreground">
        {formatCount(row.recordedFirstAttempts)} recorded ·{' '}
        {formatCount(row.validFirstAttempts)} valid ·{' '}
        {formatCount(row.excludedInvalidRatings)} invalid excluded
      </p>
      <p className="m-0 mt-1 tabular-nums text-muted-foreground">
        Again {formatCount(row.again)} · Hard {formatCount(row.hard)} · Good{' '}
        {formatCount(row.good)} · Easy {formatCount(row.easy)}
      </p>
      <dl className="m-0 mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
        {values.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="m-0 text-right tabular-nums">{value}</dd>
          </Fragment>
        ))}
      </dl>
      {row.validFirstAttempts === 0 ? (
        <p className="m-0 mt-1 text-muted-foreground">
          No valid first recorded outcomes in this bucket
        </p>
      ) : null}
      <p className="m-0 mt-2 text-muted-foreground">
        {periodContext(row, timeFrame)}
      </p>
    </div>
  )
}

function periodContext(row: FirstRow, timeFrame?: HistoricalChartTimeFrame) {
  return [
    historicalIntervalContext(row, timeFrame),
    historicalReportContext(timeFrame),
  ]
    .filter(Boolean)
    .join(' · ')
}

function percent(value: number | null) {
  return value === null
    ? 'Not measured'
    : `${Number((value * 100).toFixed(1))}%`
}

function evidenceText(value: 'measured' | 'not-measured') {
  return value === 'measured' ? 'Measured' : 'Not measured'
}
