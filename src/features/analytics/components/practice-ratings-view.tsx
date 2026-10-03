import { Fragment, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { usePlotArea, useXAxisScale, useYAxisScale } from 'recharts'

import { ChartTable } from '@/components/ui/chart-table'
import type { AnalyticsViews } from '../api/analytics-contracts'
import { classifyLineContinuity } from '../domain/chart-buckets'
import {
  HistoricalChart,
  type HistoricalChartTimeFrame,
  type PositionedHistoricalRow,
} from './charts/historical-chart'
import {
  formatHistoricalBucket,
  historicalGroupingLabel,
  historicalIntervalContext,
  historicalReportContext,
} from './charts/historical-chart-model'
import { HistoricalTable } from './charts/historical-table'
import { HistoricalTargetLine } from './charts/historical-target-line'
import {
  ChartTrendNote,
  formatCount,
  formatPercent,
} from './charts/chart-shared'
import {
  buildPracticeRatingsRows,
  type PracticeRatingsRow,
} from './practice-ratings-model'

const categories = [
  {
    key: 'easy',
    share: 'easyShare',
    label: 'Easy',
    color: 'var(--cp-analytics-easy)',
  },
  {
    key: 'good',
    share: 'goodShare',
    label: 'Good',
    color: 'var(--cp-analytics-good)',
  },
  {
    key: 'hard',
    share: 'hardShare',
    label: 'Hard',
    color: 'var(--cp-analytics-hard)',
  },
  {
    key: 'again',
    share: 'againShare',
    label: 'Again',
    color: 'var(--cp-analytics-again)',
  },
] as const
type PositionedRow = PositionedHistoricalRow<PracticeRatingsRow>
type PixelPoint = { x: number; y: number; index: number }
type PixelConnection = {
  from: PixelPoint
  to: PixelPoint
  kind: 'solid' | 'bridge'
}
const percentScale = {
  domain: [0, 1] as [number, number],
  ticks: [0, 0.25, 0.5, 0.75, 1],
}

export function PracticeRatingsView({
  view,
  ratingsView,
  timeFrame,
  targetControl,
}: {
  view: AnalyticsViews['practiceRhythm']
  ratingsView: AnalyticsViews['ratingsMix']
  timeFrame?: HistoricalChartTimeFrame | undefined
  targetControl?: ReactNode
}) {
  const [showReviews, setShowReviews] = useState(true)
  const rows = buildPracticeRatingsRows(view.rows, ratingsView.rows)
  const rowKey = rows.map((row) => row.id).join('|')
  const challengingShare =
    ratingsView.selectedValidRatings > 0
      ? ratingsView.selectedHardAgain / ratingsView.selectedValidRatings
      : null
  return (
    <div className="cp-historical-view cp-historical-practice-ratings grid min-w-0 gap-2">
      {targetControl ?? (
        <p className="m-0 text-right text-xs text-muted-foreground">
          Target Review Success {formatPercent(view.targetReviewSuccess)}
        </p>
      )}
      <ChartTable
        chart={
          rows.length > 0 ? (
            <div className="grid min-w-0 gap-2">
              <HistoricalChart
                chartRoleDescription={
                  showReviews
                    ? 'Stacked rating shares with completed-review line'
                    : 'Stacked rating shares'
                }
                config={{
                  ...Object.fromEntries(
                    categories.map((rating) => [
                      rating.share,
                      { label: rating.label, color: rating.color },
                    ]),
                  ),
                  completedReviews: {
                    label: 'Reviews',
                    color: 'var(--cp-analytics-review-line)',
                  },
                }}
                description={`Easy, Good, Hard and Again exact supplied rating shares. Rating share scale: 0%–100%. ${showReviews ? `Completed reviews use a separate right count axis: ${view.countScale.domain.join('–')}. Known zero counts are observations; dashed lines cross unavailable count intervals.` : 'Review volume is hidden.'} The upper edge of Good + Easy represents Review Success. Target Review Success: ${formatPercent(view.targetReviewSuccess)}. Full-height gray stripes mean unavailable rating composition, including periods with no valid ratings. Labels show rounded whole percentages when they fit. Association, not causation; count-line crossings with the target have no percentage meaning. ${historicalGroupingLabel(timeFrame)}. ${historicalReportContext(timeFrame)}`}
                height={310}
                name="Practice Rhythm chart"
                rows={rows}
                timeFrame={timeFrame}
                tooltip={(row) => (
                  <PracticeRatingsTooltip
                    row={row}
                    showReviews={showReviews}
                    target={view.targetReviewSuccess}
                    timeFrame={timeFrame}
                  />
                )}
                yAxes={[
                  {
                    id: 'ratings',
                    label: 'Rating share (%)',
                    scale: percentScale,
                    format: formatPercent,
                    padding: { top: 6, bottom: 8 },
                  },
                  ...(showReviews
                    ? [
                        {
                          id: 'count',
                          label: 'Reviews',
                          scale: view.countScale,
                          format: formatCount,
                          orientation: 'right' as const,
                          width: 50,
                          padding: { top: 6, bottom: 8 },
                        },
                      ]
                    : []),
                ]}
              >
                {(positioned, selected, visible) => (
                  <>
                    <PracticeRatingsStacks
                      rows={positioned}
                      showReviews={showReviews}
                      target={view.targetReviewSuccess}
                      timeFrame={timeFrame}
                    />
                    <HistoricalTargetLine
                      testId="practice-success-target"
                      value={view.targetReviewSuccess}
                      yAxisId="ratings"
                    />
                    {showReviews ? (
                      <CompletedReviewLine
                        activeIndex={
                          visible && selected
                            ? positioned.indexOf(selected)
                            : null
                        }
                        rows={positioned}
                      />
                    ) : null}
                  </>
                )}
              </HistoricalChart>
              <PracticeRatingsLegend
                onToggle={() => setShowReviews((current) => !current)}
                showReviews={showReviews}
              />
              <ChartTrendNote
                pointCount={
                  rows.filter(
                    (row) =>
                      (row.ratings?.validRatings ?? 0) > 0 ||
                      (showReviews && row.completedReviews !== null),
                  ).length
                }
              />
            </div>
          ) : (
            <p className="m-0 grid min-h-48 place-items-center text-sm text-muted-foreground">
              No completed reviews or valid ratings are available in this
              period.
            </p>
          )
        }
        table={
          <div className="grid min-w-0 gap-2 [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <HistoricalTable
              caption="Practice Rhythm exact values"
              cells={(row) => [
                `${formatHistoricalBucket(row, timeFrame)}${row.isPartial ? ' (in progress)' : ''}`,
                countText(row.completedReviews),
                ...categories.map((rating) => ratingText(row, rating)),
                row.practice
                  ? `${formatCount(row.practice.goodEasy)} of ${formatCount(row.practice.validRatings)}`
                  : 'Unavailable',
                precisePercent(row.practice?.reviewSuccess ?? null),
                precisePercent(view.targetReviewSuccess),
                countText(row.ratings?.validRatings ?? null),
                countText(row.ratings?.challengingReviews ?? null),
                evidenceText(row.practice?.evidence),
                evidenceText(row.ratings?.evidence),
                periodContext(row, timeFrame),
              ]}
              headers={[
                'Bucket',
                'Completed reviews',
                ...categories.map((rating) => rating.label),
                'Good + Easy',
                'Review Success',
                'Target Review Success',
                'Valid ratings',
                'Challenging reviews',
                'Practice evidence',
                'Ratings evidence',
                'Period context',
              ]}
              resetKey={rowKey}
              rows={rows}
            />
            {timeFrame ? (
              <p className="m-0 text-xs text-muted-foreground">
                {historicalGroupingLabel(timeFrame)} ·{' '}
                {historicalReportContext(timeFrame)}
              </p>
            ) : null}
          </div>
        }
      />
      <p className="m-0 text-sm text-muted-foreground">
        This period&apos;s rating mix is based on{' '}
        {formatCount(ratingsView.selectedValidRatings)} valid ratings. Hard +
        Again: {formatCount(ratingsView.selectedHardAgain)} of{' '}
        {formatCount(ratingsView.selectedValidRatings)} (
        {formatPercent(challengingShare)}).
      </p>
      {ratingsView.comparison.direction !== null &&
      ratingsView.comparison.difference !== null &&
      ratingsView.comparison.previousHardAgainShare !== null ? (
        <p className="m-0 text-sm text-muted-foreground">
          Hard + Again is {ratingsView.comparison.direction}{' '}
          {Number(
            (Math.abs(ratingsView.comparison.difference) * 100).toFixed(1),
          )}{' '}
          pp from the equivalent prior period (
          {formatPercent(ratingsView.comparison.previousHardAgainShare)};{' '}
          {formatCount(ratingsView.comparison.previousValidRatings)} valid
          ratings).
        </p>
      ) : null}
      <p className="m-0 text-xs text-muted-foreground">
        Association, not causation. The separate review-count scale compares
        timing; count-line crossings with the target have no percentage meaning.
      </p>
    </div>
  )
}

function countPixels(
  rows: readonly PositionedRow[],
  xScale: (value: number) => number | undefined,
  yScale: ((value: number) => number | undefined) | undefined,
) {
  const points = rows.map((row, index): PixelPoint | null => {
    const x = xScale(row.x)
    const y =
      row.completedReviews === null ? undefined : yScale?.(row.completedReviews)
    return x === undefined || y === undefined ? null : { x, y, index }
  })
  const connections: PixelConnection[] = classifyLineContinuity(
    rows.map((row) => row.completedReviews),
  ).flatMap((segment) => {
    const from = points[segment.fromIndex]
    const to = points[segment.toIndex]
    return from && to ? [{ from, to, kind: segment.kind }] : []
  })
  return { points, connections }
}

function CompletedReviewLine({
  rows,
  activeIndex,
}: {
  rows: readonly PositionedRow[]
  activeIndex: number | null
}) {
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  const yScale = useYAxisScale('count')
  if (!plot || !xScale || !yScale) return null
  const { points, connections } = countPixels(rows, xScale, yScale)
  return (
    <g aria-hidden="true" data-testid="practice-reviews-line">
      {connections.map(({ from, to, kind }) => (
        <g key={`${from.index}-${to.index}`}>
          <path
            d={`M${from.x},${from.y}L${to.x},${to.y}`}
            fill="none"
            stroke="var(--color-card)"
            strokeOpacity={0.85}
            strokeWidth={3.5}
          />
          <path
            data-testid={`practice-reviews-${kind}-${from.index}-${to.index}`}
            d={`M${from.x},${from.y}L${to.x},${to.y}`}
            fill="none"
            stroke="var(--cp-analytics-review-line)"
            strokeDasharray={kind === 'bridge' ? '7 5' : undefined}
            strokeWidth={1.5}
          />
        </g>
      ))}
      {points.map((point) =>
        point ? (
          <circle
            cx={point.x}
            cy={point.y}
            data-active-marker={point.index === activeIndex}
            data-completed-reviews={rows[point.index]?.completedReviews}
            data-testid={`practice-reviews-marker-${point.index}`}
            fill="var(--cp-analytics-review-line)"
            key={point.index}
            r={point.index === activeIndex ? 4 : 3}
            stroke="var(--color-card)"
            strokeWidth={1}
          />
        ) : null,
      )}
    </g>
  )
}

function PracticeRatingsStacks({
  rows,
  showReviews,
  target,
  timeFrame,
}: {
  rows: readonly PositionedRow[]
  showReviews: boolean
  target: number
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  const patternId = `practice-ratings-empty-${useId().replace(/:/g, '')}`
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  const yScale = useYAxisScale('ratings')
  const countScale = useYAxisScale('count')
  if (!plot || !xScale || !yScale) return null
  const top = yScale(1)
  const bottom = yScale(0)
  const targetY = yScale(target)
  if (top === undefined || bottom === undefined) return null
  const count = showReviews
    ? countPixels(rows, xScale, countScale)
    : { points: [], connections: [] }
  return (
    <g data-testid="practice-ratings-stacks">
      <defs>
        <pattern
          height={7}
          id={patternId}
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
          width={7}
        >
          <rect fill="var(--cp-analytics-empty)" height={7} width={7} />
          <line
            stroke="var(--cp-analytics-hatch)"
            strokeWidth={1.5}
            x1={0}
            x2={0}
            y1={0}
            y2={7}
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
        if (!row.ratings || row.ratings.validRatings === 0)
          return (
            <rect
              aria-label={`${formatHistoricalBucket(row, timeFrame)}: ${row.ratings ? 'No valid ratings, composition unavailable' : 'Rating composition unavailable'}`}
              data-testid={`practice-ratings-empty-${index}`}
              fill={`url(#${patternId})`}
              height={bottom - top}
              key={row.id}
              width={width}
              x={x}
              y={top}
            />
          )
        let total = 0
        return (
          <g key={row.id}>
            {categories.map((rating) => {
              const share = row.ratings![rating.share]
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
                    data-share={share}
                    data-testid={`practice-ratings-${rating.key}-${index}`}
                    fill={rating.color}
                    height={height}
                    width={width}
                    x={x}
                    y={upper}
                  />
                  {share > 0 ? (
                    <RatingLabel
                      connections={count.connections}
                      height={height}
                      label={`${Math.round(share * 100)}%`}
                      points={count.points}
                      targetY={targetY}
                      testId={`practice-ratings-${rating.key}-label-${index}`}
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

/** Test line crossings over the measured text box, including bridges across missing counts. */
function lineCrossesLabel(
  connection: PixelConnection,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const left = Math.max(
    x - width / 2 - 3,
    Math.min(connection.from.x, connection.to.x),
  )
  const right = Math.min(
    x + width / 2 + 3,
    Math.max(connection.from.x, connection.to.x),
  )
  if (left > right) return false
  const delta = connection.to.x - connection.from.x
  const at = (px: number) =>
    delta === 0
      ? connection.from.y
      : connection.from.y +
        ((px - connection.from.x) / delta) *
          (connection.to.y - connection.from.y)
  return (
    Math.min(at(left), at(right)) <= y + height / 2 + 3 &&
    Math.max(at(left), at(right)) >= y - height / 2 - 3
  )
}

function RatingLabel({
  connections,
  points,
  targetY,
  height,
  label,
  testId,
  width,
  x,
  y,
}: {
  connections: readonly PixelConnection[]
  points: readonly (PixelPoint | null)[]
  targetY: number | undefined
  height: number
  label: string
  testId: string
  width: number
  x: number
  y: number
}) {
  return (
    <text
      aria-hidden="true"
      data-testid={testId}
      dominantBaseline="middle"
      fill="var(--cp-analytics-rating-label)"
      fontSize={12}
      fontWeight={500}
      ref={(node) => {
        if (!node) return
        node.style.display = ''
        const bounds =
          typeof node.getBBox === 'function'
            ? node.getBBox()
            : { width: label.length * 7, height: 12 }
        const fits = bounds.width + 4 <= width && bounds.height + 4 <= height
        const overlap =
          (targetY !== undefined &&
            Math.abs(targetY - y) <= bounds.height / 2 + 3) ||
          connections.some((connection) =>
            lineCrossesLabel(connection, x, y, bounds.width, bounds.height),
          ) ||
          points.some(
            (point) =>
              point &&
              Math.abs(point.x - x) <= bounds.width / 2 + 5 &&
              Math.abs(point.y - y) <= bounds.height / 2 + 5,
          )
        node.style.display = fits && !overlap ? '' : 'none'
      }}
      textAnchor="middle"
      x={x}
      y={y}
    >
      {label}
    </text>
  )
}

function PracticeRatingsLegend({
  showReviews,
  onToggle,
}: {
  showReviews: boolean
  onToggle: () => void
}) {
  return (
    <ul
      aria-label="Practice Rhythm series"
      className="m-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 p-0 text-xs text-muted-foreground"
      role="list"
    >
      {categories.map((rating) => (
        <li className="inline-flex items-center gap-1.5" key={rating.key}>
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: rating.color }}
          />
          {rating.label}
        </li>
      ))}
      <li>
        <button
          aria-pressed={showReviews}
          className="inline-flex items-center gap-1.5 rounded-sm border-0 bg-transparent py-1 text-xs text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-[pressed=false]:opacity-45 [@media(pointer:coarse)]:min-h-11"
          onClick={onToggle}
          type="button"
        >
          <svg aria-hidden="true" height={12} width={22}>
            <line
              stroke="var(--cp-analytics-review-line)"
              strokeWidth={1.5}
              x1={0}
              x2={22}
              y1={6}
              y2={6}
            />
            <circle
              cx={11}
              cy={6}
              fill="var(--cp-analytics-review-line)"
              r={3}
            />
          </svg>
          Reviews
        </button>
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3 w-3"
          style={{
            background:
              'repeating-linear-gradient(135deg, var(--cp-analytics-empty), var(--cp-analytics-empty) 4px, var(--cp-analytics-hatch) 4px, var(--cp-analytics-hatch) 5px)',
          }}
        />
        Unavailable ratings
      </li>
    </ul>
  )
}

function PracticeRatingsTooltip({
  row,
  showReviews,
  target,
  timeFrame,
}: {
  row: PracticeRatingsRow
  showReviews: boolean
  target: number
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  const values: Array<readonly [string, string]> = [
    ...(showReviews
      ? [['Completed reviews', countText(row.completedReviews)] as const]
      : []),
    ...categories.map(
      (rating) => [rating.label, ratingText(row, rating)] as const,
    ),
    [
      'Good + Easy',
      row.practice
        ? `${formatCount(row.practice.goodEasy)} of ${formatCount(row.practice.validRatings)}`
        : 'Unavailable',
    ],
    ['Review Success', precisePercent(row.practice?.reviewSuccess ?? null)],
    ['Target Review Success', precisePercent(target)],
    ['Valid ratings', countText(row.ratings?.validRatings ?? null)],
    ['Challenging reviews', countText(row.ratings?.challengingReviews ?? null)],
    ['Practice evidence', evidenceText(row.practice?.evidence)],
    ['Ratings evidence', evidenceText(row.ratings?.evidence)],
  ]
  return (
    <div className="rounded border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-sm">
      <p className="m-0 font-medium">
        {formatHistoricalBucket(row, timeFrame)} ·{' '}
        {historicalGroupingLabel(timeFrame)}
      </p>
      <dl className="m-0 mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
        {values.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="m-0 text-right tabular-nums">{value}</dd>
          </Fragment>
        ))}
      </dl>
      {!row.ratings || row.ratings.validRatings === 0 ? (
        <p className="m-0 mt-1 text-muted-foreground">
          {row.ratings
            ? 'No valid ratings · composition unavailable'
            : 'Rating composition unavailable'}
        </p>
      ) : null}
      <p className="m-0 mt-2 text-muted-foreground">
        {periodContext(row, timeFrame)}
      </p>
    </div>
  )
}
function countText(value: number | null) {
  return value === null ? 'Unavailable' : formatCount(value)
}
function ratingText(
  row: PracticeRatingsRow,
  rating: (typeof categories)[number],
) {
  if (!row.ratings) return 'Unavailable'
  const share =
    row.ratings.validRatings === 0 ? null : row.ratings[rating.share]
  return `${formatCount(row.ratings[rating.key])} (${precisePercent(share)})`
}
function precisePercent(value: number | null) {
  return value === null ? 'Unavailable' : `${Number((value * 100).toFixed(1))}%`
}
function evidenceText(value: 'measured' | 'not-measured' | undefined) {
  return value === undefined
    ? 'Unavailable'
    : value === 'measured'
      ? 'Measured'
      : 'Not measured'
}
function periodContext(
  row: PracticeRatingsRow,
  timeFrame?: HistoricalChartTimeFrame,
) {
  return [
    `${row.bucketStart}–${row.bucketEnd}`,
    historicalIntervalContext(row, timeFrame),
    historicalReportContext(timeFrame),
  ]
    .filter(Boolean)
    .join(' · ')
}
