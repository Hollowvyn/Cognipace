import { Fragment, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { usePlotArea, useXAxisScale, useYAxisScale } from 'recharts'

import { ChartTable } from '@/components/ui/chart-table'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { ChartTrendNote, formatCount } from './charts/chart-shared'
import { HistoricalChart } from './charts/historical-chart'
import type {
  HistoricalChartTimeFrame,
  PositionedHistoricalRow,
} from './charts/historical-chart'
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

type RecallRow = AnalyticsViews['observedRecallVsFsrs']['rows'][number]
type RatingsRow = AnalyticsViews['ratingsMix']['rows'][number]

const ratings = [
  {
    key: 'again',
    label: 'Again',
    share: 'againShare',
    color: 'var(--cp-analytics-again)',
  },
  {
    key: 'hard',
    label: 'Hard',
    share: 'hardShare',
    color: 'var(--cp-analytics-hard)',
  },
  {
    key: 'good',
    label: 'Good',
    share: 'goodShare',
    color: 'var(--cp-analytics-good)',
  },
  {
    key: 'easy',
    label: 'Easy',
    share: 'easyShare',
    color: 'var(--cp-analytics-easy)',
  },
] as const

export function ObservedRecallVsFsrsView({
  view,
  timeFrame,
  targetControl,
}: {
  view: AnalyticsViews['observedRecallVsFsrs']
  timeFrame?: HistoricalChartTimeFrame | undefined
  targetControl?: ReactNode
}) {
  const [series, setSeries] = useState({ observed: true, estimate: true })
  const rows = trimHistoricalEmptyEdges(
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
  const description = `${visibleDescription}. ${series.observed || series.estimate ? 'Long-dash bridges span missing buckets without adding observations. ' : ''}Paired review outcomes and reconstructed FSRS estimates. Scale: ${percent(view.scale.domain[0])}–${percent(view.scale.domain[1])}. Target Recall: ${percent(view.targetRecall)}. ${historicalGroupingLabel(timeFrame)}. ${historicalReportContext(timeFrame)}`

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
                name="Observed Recall vs FSRS Estimate chart"
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
            <Empty message="No reviews in this period have both a valid rating and an FSRS estimate." />
          )
        }
        table={
          <HistoricalTable
            caption="Observed Recall vs FSRS Estimate exact values"
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

function SeriesSwitch({
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

export function RatingsMixView({
  view,
  timeFrame,
}: {
  view: AnalyticsViews['ratingsMix']
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  const rows = trimHistoricalEmptyEdges(
    view.rows,
    (row) => row.validRatings > 0,
  )
  const hasRatings = rows.length > 0
  const challengingShare =
    view.selectedValidRatings === 0
      ? null
      : view.selectedHardAgain / view.selectedValidRatings
  return (
    <div className="cp-historical-view grid min-w-0 gap-2">
      <ChartTable
        chart={
          hasRatings ? (
            <div className="grid gap-2">
              <HistoricalChart
                config={Object.fromEntries(
                  ratings.map((rating) => [
                    rating.share,
                    { label: rating.label, color: rating.color },
                  ]),
                )}
                chartRoleDescription="100% stacked column chart"
                description={`Again, Hard, Good, and Easy exact shares for valid ratings in each selected-period bucket. Scale: 0%–100%. ${formatCount(view.selectedValidRatings)} valid ratings in the selected period. Full-height gray stripes mean no valid ratings and unavailable composition. Colored labels are rounded whole percentages when they fit. ${historicalGroupingLabel(timeFrame)}. ${historicalReportContext(timeFrame)}`}
                height={310}
                name="Ratings Mix chart"
                rows={rows}
                timeFrame={timeFrame}
                tooltip={(row) => (
                  <RatingsTooltip row={row} timeFrame={timeFrame} />
                )}
                yAxes={[
                  {
                    label: 'Rating share (%)',
                    scale: { domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1] },
                    format: percent,
                    padding: { top: 0, bottom: 0 },
                  },
                ]}
              >
                {(rows) => <RatingsStacks rows={rows} timeFrame={timeFrame} />}
              </HistoricalChart>
              <RatingsLegend />
              <ChartTrendNote
                pointCount={rows.filter((row) => row.validRatings > 0).length}
              />
            </div>
          ) : (
            <Empty message="No valid review ratings are available in this period." />
          )
        }
        table={
          <HistoricalTable
            caption="Ratings Mix exact values"
            cells={(row) => [
              `${bucketText(row, timeFrame)}${row.validRatings === 0 ? ' · No valid ratings' : ''}`,
              ...ratings.map((rating) =>
                ratingCell(
                  row[rating.key],
                  row.validRatings === 0 ? null : row[rating.share],
                ),
              ),
              formatCount(row.validRatings),
              formatCount(row.challengingReviews),
              `${evidenceText(row.evidence)}${row.isPartial ? ' · In progress' : ''}`,
              periodContext(row, timeFrame),
            ]}
            headers={[
              'Bucket',
              'Again',
              'Hard',
              'Good',
              'Easy',
              'Valid ratings',
              'Challenging reviews',
              'Evidence',
              'Period context',
            ]}
            resetKey={rows.map((row) => row.id).join('|')}
            rows={rows}
          />
        }
      />
      <p className="m-0 text-sm text-muted-foreground">
        This period&apos;s rating mix is based on{' '}
        {formatCount(view.selectedValidRatings)} valid ratings. Hard + Again:{' '}
        {formatCount(view.selectedHardAgain)} of{' '}
        {formatCount(view.selectedValidRatings)} ({percent(challengingShare)}).
      </p>
      {view.comparison.direction !== null &&
      view.comparison.difference !== null &&
      view.comparison.previousHardAgainShare !== null ? (
        <p className="m-0 text-sm text-muted-foreground">
          Hard + Again is {view.comparison.direction}{' '}
          {Number((Math.abs(view.comparison.difference) * 100).toFixed(1))} pp
          from the equivalent prior period (
          {percent(view.comparison.previousHardAgainShare)};{' '}
          {formatCount(view.comparison.previousValidRatings)} valid ratings).
        </p>
      ) : null}
    </div>
  )
}

function RatingsStacks({
  rows,
  timeFrame,
}: {
  rows: PositionedHistoricalRow<RatingsRow>[]
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  const patternId = `ratings-empty-${useId().replace(/:/g, '')}`
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  const yScale = useYAxisScale()
  if (!plot || !xScale || !yScale) return null
  const top = yScale(1)
  const bottom = yScale(0)
  if (top === undefined || bottom === undefined) return null
  return (
    <g data-testid="ratings-mix-stacks">
      <defs>
        <pattern
          height="7"
          id={patternId}
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
          width="7"
        >
          <rect fill="var(--cp-analytics-empty)" height="7" width="7" />
          <line
            stroke="var(--cp-analytics-hatch)"
            strokeWidth="1.5"
            x1="0"
            x2="0"
            y1="0"
            y2="7"
          />
        </pattern>
      </defs>
      {rows.map((row, index) => {
        const center = xScale(row.x)
        const start = xScale(row.startX)
        const end = xScale(row.endX)
        if (center === undefined || start === undefined || end === undefined)
          return null
        const width = Math.min(44, Math.max(0, end - start - 5))
        const x = center - width / 2
        if (row.validRatings === 0) {
          return (
            <rect
              aria-label={`${formatHistoricalBucket(row, timeFrame)}: No valid ratings, composition unavailable`}
              data-empty-bucket={index}
              data-testid={`ratings-empty-${index}`}
              fill={`url(#${patternId})`}
              height={bottom - top}
              key={row.id}
              width={width}
              x={x}
              y={top}
            />
          )
        }
        let total = 0
        return (
          <g key={row.id}>
            {ratings.map((rating) => {
              const share = row[rating.share]
              if (share === null) return null
              const lower = yScale(total)
              total += share
              const upper = yScale(total)
              if (lower === undefined || upper === undefined) return null
              const height = Math.max(0, lower - upper)
              return (
                <g key={rating.key}>
                  <rect
                    aria-hidden="true"
                    data-rating={rating.label}
                    data-testid={`ratings-${rating.key}-${index}`}
                    fill={rating.color}
                    height={height}
                    width={width}
                    x={x}
                    y={upper}
                  />
                  {share > 0 ? (
                    <RatingLabel
                      height={height}
                      label={`${Math.round(share * 100)}%`}
                      name={rating.label}
                      testId={`ratings-${rating.key}-label-${index}`}
                      width={width}
                      x={center}
                      y={(upper + lower) / 2}
                    />
                  ) : null}
                </g>
              )
            })}
          </g>
        )
      })}
    </g>
  )
}

function RatingLabel({
  height,
  label,
  name,
  testId,
  width,
  x,
  y,
}: {
  height: number
  label: string
  name: string
  testId: string
  width: number
  x: number
  y: number
}) {
  return (
    <text
      aria-hidden="true"
      data-rating-label={name}
      data-testid={testId}
      dominantBaseline="middle"
      fill="var(--cp-analytics-rating-label)"
      fontSize={12}
      fontWeight={500}
      ref={(node) => {
        if (!node || typeof node.getBBox !== 'function') return
        node.style.display = ''
        const bounds = node.getBBox()
        node.style.display =
          bounds.width + 4 <= width && bounds.height + 4 <= height ? '' : 'none'
      }}
      textAnchor="middle"
      x={x}
      y={y}
    >
      {label}
    </text>
  )
}

function RatingsLegend() {
  return (
    <ul
      aria-label="Ratings Mix categories"
      className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 p-0 text-xs text-muted-foreground"
      role="list"
    >
      {ratings.map((rating) => (
        <li className="inline-flex items-center gap-1.5" key={rating.key}>
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: rating.color }}
          />
          {rating.label}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3 w-3"
          style={{
            background:
              'repeating-linear-gradient(135deg, var(--cp-analytics-empty), var(--cp-analytics-empty) 4px, var(--cp-analytics-hatch) 4px, var(--cp-analytics-hatch) 5px)',
          }}
        />
        No valid ratings
      </li>
    </ul>
  )
}

function RatingsTooltip({
  row,
  timeFrame,
}: {
  row: RatingsRow
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  return (
    <HistoricalTooltip
      context={periodContext(row, timeFrame)}
      sample={`${formatCount(row.validRatings)} valid ratings`}
      title={`${formatHistoricalBucket(row, timeFrame)} · ${historicalGroupingLabel(timeFrame)}`}
      values={[
        ...ratings.map(
          (rating) =>
            [
              rating.label,
              ratingCell(
                row[rating.key],
                row.validRatings === 0 ? null : row[rating.share],
              ),
            ] as const,
        ),
        ['Challenging reviews', formatCount(row.challengingReviews)],
        ['Evidence', evidenceText(row.evidence)],
      ]}
    >
      {row.validRatings === 0 ? (
        <p className="m-0 mt-1 text-muted-foreground">
          No valid ratings · composition unavailable
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

function bucketText(
  row: RecallRow | RatingsRow,
  timeFrame?: HistoricalChartTimeFrame,
) {
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
function ratingCell(count: number, share: number | null) {
  return `${formatCount(count)} (${percent(share)})`
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
