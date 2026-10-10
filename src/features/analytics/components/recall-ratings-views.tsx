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
import { CumulativeTrend } from './charts/cumulative-trend'
import type { CumulativeRecallPresentationRow } from '../domain/cumulative-recall-presentation'

type RecallRow = AnalyticsViews['observedRecallVsFsrs']['rows'][number]

export function ObservedRecallVsFsrsView({
  view,
  timeFrame = view.timeFrame,
  targetControl,
}: {
  view: AnalyticsViews['observedRecallVsFsrs']
  timeFrame?: HistoricalChartTimeFrame | undefined
  targetControl?: ReactNode
}) {
  const [series, setSeries] = useState({ observed: true, estimate: true })
  const rows = view.timeFrame.history
    ? view.rows
    : trimHistoricalEmptyEdges(
        view.rows,
        (row) => row.observedRecall !== null || row.fsrsEstimate !== null,
      )
  const hasValues = rows.length > 0
  const visibleDescription =
    [
      series.observed
        ? 'Observed recall is shown as a solid line with circles'
        : null,
      series.estimate
        ? 'FSRS estimate is shown with short dashes and diamonds'
        : null,
    ]
      .filter(Boolean)
      .join('; ') || 'Both data series are hidden'
  const description = `${visibleDescription}. ${series.observed || series.estimate ? 'Long-dash bridges span missing buckets without adding observations. ' : ''}Paired repeat review outcomes and reconstructed FSRS estimates. Initial reviews build memory state but do not enter the paired comparison. Scale: ${percent(view.scale.domain[0])}–${percent(view.scale.domain[1])}. Target Recall: ${percent(view.targetRecall)}. ${historicalGroupingLabel(timeFrame)}. ${historicalReportContext(timeFrame)}`

  return (
    <div className="cp-historical-view cp-historical-recall grid min-w-0 gap-2">
      {targetControl ?? (
        <p className="m-0 text-right text-xs text-muted-foreground">
          Target Recall {percent(view.targetRecall)}
        </p>
      )}
      <ChartTable
        chart={
          hasValues ? (
            <div className="grid gap-2">
              <HistoricalChart
                config={{
                  observedRecall: {
                    label: 'Observed recall',
                    color: 'var(--cp-analytics-observed)',
                  },
                  fsrsEstimate: {
                    label: 'FSRS estimate',
                    color: 'var(--cp-analytics-predicted)',
                  },
                }}
                description={description}
                height={310}
                initialIndex={Math.max(0, Math.floor(rows.length / 2) - 1)}
                inspectionResetKey={`${series.observed}:${series.estimate}`}
                name="Recall vs FSRS Estimate chart"
                rows={rows}
                startAtFirstPoint
                timeFrame={timeFrame}
                tooltip={(row) => (
                  <RecallTooltip
                    row={row}
                    series={series}
                    target={view.targetRecall}
                    timeFrame={timeFrame}
                  />
                )}
                yAxes={[
                  {
                    label: 'Recall (%)',
                    scale: view.scale,
                    format: percent,
                    padding: { top: 8, bottom: 8 },
                  },
                ]}
              >
                {(rows, selected) => (
                  <>
                    <HistoricalTargetLine
                      testId="recall-target"
                      value={view.targetRecall}
                    />
                    {series.estimate ? (
                      <LineSegments
                        activeIndex={rows.findIndex(
                          (row) => row.id === selected?.id,
                        )}
                        bridgeDasharray="9 7"
                        bridgeStrokeWidth={1.5}
                        data={rows}
                        dataKey="fsrsEstimate"
                        markerFill="var(--color-card)"
                        markerShape="diamond"
                        seriesKey="FSRS estimate"
                        showMeasuredDots
                        stroke="var(--cp-analytics-predicted)"
                        strokeDasharray="4 4"
                        strokeWidth={1.8}
                        testId="fsrs-estimate"
                        type="linear"
                      />
                    ) : null}
                    {series.observed ? (
                      <LineSegments
                        activeIndex={rows.findIndex(
                          (row) => row.id === selected?.id,
                        )}
                        bridgeDasharray="9 7"
                        bridgeStrokeWidth={1.5}
                        data={rows}
                        dataKey="observedRecall"
                        markerFill="var(--color-card)"
                        markerShape="circle"
                        seriesKey="Observed recall"
                        showMeasuredDots
                        stroke="var(--cp-analytics-observed)"
                        strokeWidth={2.5}
                        testId="observed-recall"
                        type="linear"
                      />
                    ) : null}
                  </>
                )}
              </HistoricalChart>
              <div
                aria-label="Chart series"
                className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground"
                role="list"
              >
                <span role="listitem">
                  <SeriesSwitch
                    label="Observed recall"
                    onClick={() =>
                      setSeries((current) => ({
                        ...current,
                        observed: !current.observed,
                      }))
                    }
                    pressed={series.observed}
                    shape="circle"
                  />
                </span>
                <span role="listitem">
                  <SeriesSwitch
                    label="FSRS estimate"
                    onClick={() =>
                      setSeries((current) => ({
                        ...current,
                        estimate: !current.estimate,
                      }))
                    }
                    pressed={series.estimate}
                    shape="diamond"
                  />
                </span>
                {series.observed || series.estimate ? (
                  <span
                    className="inline-flex items-center gap-1.5"
                    role="listitem"
                  >
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
                ) : null}
              </div>
              <ChartTrendNote
                pointCount={
                  rows.filter(
                    (row) =>
                      (series.observed && row.observedRecall !== null) ||
                      (series.estimate && row.fsrsEstimate !== null),
                  ).length
                }
              />
            </div>
          ) : (
            <Empty message="No repeat reviews in this period have both a valid rating and an FSRS estimate. First recorded reviews build memory for later comparisons." />
          )
        }
        table={
          <HistoricalTable
            caption="Recall vs FSRS Estimate exact values"
            cells={(row) => [
              bucketText(row, timeFrame),
              formatCount(row.recalledCount),
              formatCount(row.pairedReviews),
              percent(row.observedRecall),
              percent(row.fsrsEstimate),
              difference(row.difference),
              'Reconstructed',
              evidenceText(row.evidence),
              periodContext(row, timeFrame),
            ]}
            headers={[
              'Bucket',
              'Recalled',
              'Paired reviews',
              'Observed recall',
              'FSRS estimate',
              'Difference',
              'Provenance',
              'Evidence',
              'Period context',
            ]}
            resetKey={rows.map((row) => row.id).join('|')}
            rows={rows}
          />
        }
      />
    </div>
  )
}

export function SeriesSwitch({
  label,
  pressed,
  onClick,
  shape,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  shape: 'circle' | 'diamond'
}) {
  const color =
    shape === 'circle'
      ? 'var(--cp-analytics-observed)'
      : 'var(--cp-analytics-predicted)'
  return (
    <button
      aria-pressed={pressed}
      className="inline-flex items-center gap-1.5 rounded-sm border-0 bg-transparent py-1 text-xs text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-[pressed=false]:opacity-45 [@media(pointer:coarse)]:min-h-11"
      onClick={onClick}
      type="button"
    >
      <svg aria-hidden="true" height="12" width="22">
        <line
          stroke={color}
          strokeDasharray={shape === 'diamond' ? '4 4' : undefined}
          strokeWidth={2}
          x1="0"
          x2="22"
          y1="6"
          y2="6"
        />
        {shape === 'circle' ? (
          <circle
            cx="11"
            cy="6"
            fill="var(--color-card)"
            r="4"
            stroke={color}
            strokeWidth="2"
          />
        ) : (
          <path
            d="M11,2.5L14.5,6L11,9.5L7.5,6Z"
            fill="var(--color-card)"
            stroke={color}
            strokeWidth="1.5"
          />
        )}
      </svg>
      {label}
    </button>
  )
}

/** Compact cumulative adapter; the legacy raw interval view remains compatible. */
export function CumulativeRecallPlot({
  rows,
  view,
  timeFrame = view.timeFrame,
  series,
  height,
}: {
  rows: readonly CumulativeRecallPresentationRow[]
  view: AnalyticsViews['observedRecallVsFsrs']
  timeFrame?: HistoricalChartTimeFrame | undefined
  series: { observed: boolean; estimate: boolean }
  height: number
}) {
  const values = rows
    .flatMap((row) => [
      row.cumulativeObservedRecall,
      row.cumulativeFsrsEstimate,
    ])
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    )
  const domain: [number, number] = [
    Math.min(view.scale.domain[0], view.targetRecall, ...values),
    Math.max(view.scale.domain[1], view.targetRecall, ...values),
  ]
  return (
    <HistoricalChart
      compact={{ height, showGroupingLabel: false }}
      cumulativeAsOf
      startAtFirstPoint
      config={{}}
      name="Recall cumulative chart"
      description={`${series.observed ? 'Observed recall: solid circles. ' : ''}${series.estimate ? 'FSRS estimate: short dashes and diamonds. ' : ''}${!series.observed && !series.estimate ? 'Both data series are hidden. ' : ''}Cumulative paired repeat reviews; long dashes hold existing evidence through as-of without adding observations. Target Recall: ${percent(view.targetRecall)}. ${historicalReportContext(timeFrame)}`}
      rows={rows}
      timeFrame={timeFrame}
      inspectionResetKey={`${series.observed}:${series.estimate}`}
      yAxes={[
        {
          label: 'Recall (%)',
          scale: { ...view.scale, domain },
          format: percent,
        },
      ]}
      tooltip={(row) => (
        <div className="rounded border border-border bg-popover p-2 text-xs shadow-md">
          <p className="m-0">
            {formatHistoricalBucket(row, timeFrame)} · {row.state}
          </p>
          <p className="m-0">
            Cumulative {row.cumulativeRecalledCount} recalled /{' '}
            {row.cumulativePairedReviews} paired reviews.
          </p>
          {series.observed ? (
            <p className="m-0">
              Observed recall: {percent(row.cumulativeObservedRecall)}
            </p>
          ) : null}
          {series.estimate ? (
            <p className="m-0">
              FSRS estimate: {percent(row.cumulativeFsrsEstimate)}
            </p>
          ) : null}
          {series.observed && series.estimate ? (
            <p className="m-0">
              Difference: {difference(row.cumulativeDifference)}
            </p>
          ) : null}
          <p className="m-0">
            Target Recall: {percent(view.targetRecall)}. Interval{' '}
            {row.recalledCount}/{row.pairedReviews};{' '}
            {row.state === 'held'
              ? 'No new paired evidence; prior value held.'
              : row.state === 'unavailable'
                ? 'No paired evidence yet.'
                : 'Updated from paired evidence.'}
          </p>
          <p className="m-0">
            Last update:{' '}
            {row.lastUpdatedInterval
              ? formatHistoricalBucket(row.lastUpdatedInterval, timeFrame)
              : 'None'}
            . Reconstructed. {historicalIntervalContext(row, timeFrame)} ·{' '}
            {historicalReportContext(timeFrame)}
          </p>
        </div>
      )}
    >
      {(positioned, selected, visible) => (
        <>
          <HistoricalTargetLine
            testId="recall-target"
            value={view.targetRecall}
          />
          {series.observed ? (
            <CumulativeTrend
              rows={positioned}
              value={(row) => row.cumulativeObservedRecall}
              state={(row) => row.state}
              visibleEnd={positioned.at(-1)?.endX ?? 0}
              color="var(--cp-analytics-observed)"
              markerShape="circle"
              selectedRow={visible ? selected : null}
              testId="recall-observed"
            />
          ) : null}
          {series.estimate ? (
            <CumulativeTrend
              rows={positioned}
              value={(row) => row.cumulativeFsrsEstimate}
              state={(row) => row.state}
              visibleEnd={positioned.at(-1)?.endX ?? 0}
              color="var(--cp-analytics-predicted)"
              markerShape="diamond"
              strokeDasharray="4 4"
              selectedRow={visible ? selected : null}
              testId="recall-estimate"
            />
          ) : null}
        </>
      )}
    </HistoricalChart>
  )
}

function RecallTooltip({
  row,
  series,
  target,
  timeFrame,
}: {
  row: RecallRow
  series: { observed: boolean; estimate: boolean }
  target: number
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  return (
    <HistoricalTooltip
      context={periodContext(row, timeFrame)}
      sample={`${formatCount(row.recalledCount)} recalled / ${formatCount(row.pairedReviews)} paired reviews`}
      title={`${formatHistoricalBucket(row, timeFrame)} · ${historicalGroupingLabel(timeFrame)}`}
      values={[
        ...(series.observed
          ? [['Observed recall', percent(row.observedRecall)] as const]
          : []),
        ...(series.estimate
          ? [['FSRS estimate', percent(row.fsrsEstimate)] as const]
          : []),
        ...(series.observed && series.estimate
          ? [['Observed − estimate', difference(row.difference)] as const]
          : []),
        ['Target Recall', percent(target)],
        ['Provenance', 'Reconstructed'],
        ['Evidence', evidenceText(row.evidence)],
      ]}
    >
      {row.observedRecall === null && row.fsrsEstimate === null ? (
        <p className="m-0 mt-1 text-muted-foreground">
          No usable paired evidence in this bucket
        </p>
      ) : null}
    </HistoricalTooltip>
  )
}

function HistoricalTooltip({
  title,
  sample,
  values,
  context,
  children,
}: {
  title: string
  sample: string
  values: readonly (readonly [string, string])[]
  context: string
  children?: ReactNode
}) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-sm">
      <p className="m-0 font-medium">{title}</p>
      <p className="m-0 mt-1 text-sm font-medium tabular-nums">{sample}</p>
      <dl className="m-0 mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
        {values.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="m-0 text-right tabular-nums">{value}</dd>
          </Fragment>
        ))}
      </dl>
      {children}
      <p className="m-0 mt-2 text-muted-foreground">{context}</p>
    </div>
  )
}

function bucketText(row: RecallRow, timeFrame?: HistoricalChartTimeFrame) {
  return `${formatHistoricalBucket(row, timeFrame)}${row.isPartial ? ' (in progress)' : ''}`
}
function periodContext(
  row: { bucketStart: string; bucketEnd: string; isPartial: boolean },
  timeFrame?: HistoricalChartTimeFrame,
) {
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
function difference(value: number | null) {
  return value === null
    ? 'Not measured'
    : `${value < 0 ? '−' : '+'}${Number((Math.abs(value) * 100).toFixed(1))} pp`
}
function evidenceText(value: 'measured' | 'not-measured') {
  return value === 'measured' ? 'Measured' : 'Not measured'
}
function Empty({ message }: { message: string }) {
  return (
    <p className="m-0 grid min-h-48 place-items-center text-sm text-muted-foreground">
      {message}
    </p>
  )
}
