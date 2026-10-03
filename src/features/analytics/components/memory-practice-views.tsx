import { usePlotArea, useXAxisScale, useYAxisScale } from 'recharts'
import type { ReactNode } from 'react'

import { ChartTable } from '@/components/ui/chart-table'

import type { AnalyticsViews } from '../api/analytics-contracts'
import {
  HistoricalChart,
  type HistoricalChartTimeFrame,
  type PositionedHistoricalRow,
} from './charts/historical-chart'
import {
  formatHistoricalBucket,
  formatHistoricalDate,
  historicalGroupingLabel,
  historicalIntervalContext,
  historicalReportContext,
  trimHistoricalEmptyEdges,
} from './charts/historical-chart-model'
import { HistoricalTable } from './charts/historical-table'
import { HistoricalTargetLine } from './charts/historical-target-line'
import { LineSegments } from './charts/line-segments'
import {
  ChartTrendNote,
  formatCount,
  formatDays,
  formatPercent,
} from './charts/chart-shared'

type MemoryRow = AnalyticsViews['memoryStrength']['rows'][number]
type PracticeRow = AnalyticsViews['practiceRhythm']['rows'][number]
type HistoricalRow = MemoryRow | PracticeRow

export function MemoryStrengthView({
  view,
  timeFrame,
}: {
  view: AnalyticsViews['memoryStrength']
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  const rows = trimHistoricalEmptyEdges(view.rows, (row) =>
    isFiniteValue(row.medianStrengthDays),
  )
  const hasValues = rows.length > 0
  return (
    <div className="cp-historical-view cp-historical-memory grid min-w-0 gap-2">
      <ChartTable
        chart={
          hasValues ? (
            <div className="grid min-w-0 gap-2">
              <HistoricalChart
                config={{
                  medianStrengthDays: {
                    label: 'Median strength',
                    color: 'var(--cp-analytics-healthy)',
                  },
                }}
                description={`Median post-review FSRS stability with supported Q1–Q3 ranges. Scale: ${formatDays(view.scale.domain[0])}–${formatDays(view.scale.domain[1])}. Ranges require at least four eligible reviews. Dashed lines cross periods with no eligible evidence. ${historicalGroupingLabel(timeFrame)}. ${historicalReportContext(timeFrame)}`}
                height={290}
                name="Memory Strength chart"
                rows={rows}
                timeFrame={timeFrame}
                tooltip={(row) => (
                  <MemoryTooltip row={row} timeFrame={timeFrame} />
                )}
                yAxes={[
                  {
                    label: 'Stability (days)',
                    scale: view.scale,
                    format: formatDays,
                    padding: { top: 6, bottom: 10 },
                  },
                ]}
              >
                {(rows, selected, visible) => (
                  <>
                    <MemoryWhiskers rows={rows} />
                    <LineSegments
                      activeIndex={
                        visible && selected ? rows.indexOf(selected) : null
                      }
                      data={rows}
                      dataKey="medianStrengthDays"
                      markerFill="var(--cp-analytics-healthy)"
                      markerShape="circle"
                      seriesKey="Median strength"
                      showMeasuredDots
                      stroke="var(--cp-analytics-healthy)"
                      strokeWidth={2}
                      testId="memory-strength"
                      type="linear"
                    />
                  </>
                )}
              </HistoricalChart>
              <MemoryLegend />
              <ChartTrendNote
                pointCount={
                  rows.filter((row) => isFiniteValue(row.medianStrengthDays))
                    .length
                }
              />
            </div>
          ) : (
            <Empty message="No valid post-review FSRS stability is available in this period." />
          )
        }
        table={
          <div className="grid min-w-0 gap-2">
            <HistoricalTable
              caption="Memory Strength exact values"
              cells={(row) => [
                bucketText(row, timeFrame),
                formatDays(row.medianStrengthDays),
                memoryRangeText(row),
                row.eligibleReviews,
                formatSignedDays(row.medianChangeDays),
                'Reconstructed',
                evidenceText(row.evidence),
                historicalIntervalContext(row, timeFrame),
              ]}
              headers={[
                'Bucket',
                'Median strength',
                'Middle 50%',
                'Eligible reviews',
                'Median change',
                'Provenance',
                'Evidence',
                'Period context',
              ]}
              resetKey={rows.map((row) => row.id).join('|')}
              rows={rows}
            />
            <ReportContext timeFrame={timeFrame} />
          </div>
        }
      />
    </div>
  )
}

export function PracticeRhythmView({
  view,
  timeFrame,
  targetControl,
}: {
  view: AnalyticsViews['practiceRhythm']
  timeFrame?: HistoricalChartTimeFrame | undefined
  targetControl?: ReactNode
}) {
  const rows = trimHistoricalEmptyEdges(
    view.rows,
    (row) =>
      row.completedReviews > 0 ||
      row.validRatings > 0 ||
      isFiniteValue(row.reviewSuccess),
  )
  const hasReviews = rows.length > 0
  return (
    <div className="cp-historical-view grid min-w-0 gap-2">
      {targetControl ?? (
        <p className="m-0 text-right text-xs text-muted-foreground">
          Target Review Success {formatPercent(view.targetReviewSuccess)}
        </p>
      )}
      <ChartTable
        chart={
          hasReviews ? (
            <div className="grid min-w-0 gap-2">
              <HistoricalChart
                config={{
                  completedReviews: {
                    label: 'Completed reviews',
                    color: 'var(--cp-analytics-practice-volume)',
                  },
                  reviewSuccess: {
                    label: 'Review Success',
                    color: 'var(--cp-analytics-observed)',
                  },
                }}
                description={`Completed reviews and Review Success on separate axes. Review count scale: ${view.countScale.domain.join('–')}; Review Success scale: ${formatPercent(view.percentageScale.domain[0])}–${formatPercent(view.percentageScale.domain[1])}. Review Success is Good + Easy divided by valid ratings. Target Review Success: ${formatPercent(view.targetReviewSuccess)}. Association, not causation. Dashed lines cross periods with no eligible evidence. ${historicalGroupingLabel(timeFrame)}. ${historicalReportContext(timeFrame)}`}
                height={290}
                name="Practice Rhythm chart"
                rows={rows}
                timeFrame={timeFrame}
                tooltip={(row) => (
                  <PracticeTooltip
                    row={row}
                    target={view.targetReviewSuccess}
                    timeFrame={timeFrame}
                  />
                )}
                yAxes={[
                  {
                    id: 'count',
                    label: 'Reviews',
                    scale: view.countScale,
                    format: formatCount,
                    padding: { top: 6, bottom: 10 },
                  },
                  {
                    id: 'success',
                    label: 'Review Success (%)',
                    scale: view.percentageScale,
                    format: formatPercent,
                    orientation: 'right',
                    width: 50,
                    padding: { top: 6, bottom: 10 },
                  },
                ]}
              >
                {(rows, selected, visible) => (
                  <>
                    <PracticeVolumeColumns rows={rows} />
                    <HistoricalTargetLine
                      testId="practice-success-target"
                      value={view.targetReviewSuccess}
                      yAxisId="success"
                    />
                    <LineSegments
                      activeIndex={
                        visible && selected ? rows.indexOf(selected) : null
                      }
                      bridgeDasharray="7 5"
                      data={rows}
                      dataKey="reviewSuccess"
                      markerFill="var(--cp-analytics-observed)"
                      markerShape="circle"
                      seriesKey="Review Success"
                      showMeasuredDots
                      stroke="var(--cp-analytics-observed)"
                      strokeWidth={2}
                      testId="practice-success"
                      type="linear"
                      yAxisId="success"
                    />
                  </>
                )}
              </HistoricalChart>
              <PracticeLegend />
              <ChartTrendNote
                pointCount={
                  rows.filter((row) => isFiniteValue(row.reviewSuccess)).length
                }
              />
            </div>
          ) : (
            <Empty message="No valid review ratings are available in this period." />
          )
        }
        table={
          <div className="grid min-w-0 gap-2">
            <HistoricalTable
              caption="Practice Rhythm exact values"
              cells={(row) => [
                bucketText(row, timeFrame),
                row.completedReviews,
                `${row.goodEasy} of ${row.validRatings}`,
                formatPercent(row.reviewSuccess),
                evidenceText(row.evidence),
                historicalIntervalContext(row, timeFrame),
              ]}
              headers={[
                'Bucket',
                'Completed reviews',
                'Good + Easy',
                'Review Success',
                'Evidence',
                'Period context',
              ]}
              resetKey={rows.map((row) => row.id).join('|')}
              rows={rows}
            />
            <ReportContext timeFrame={timeFrame} />
          </div>
        }
      />
      <p className="m-0 text-xs text-muted-foreground">
        Association, not causation.
      </p>
    </div>
  )
}

function MemoryWhiskers({
  rows,
}: {
  rows: readonly PositionedHistoricalRow<MemoryRow>[]
}) {
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  const yScale = useYAxisScale()
  if (!plot || !xScale || !yScale) return null
  return (
    <g
      aria-hidden="true"
      data-testid="memory-strength-whiskers"
      stroke="var(--cp-analytics-predicted)"
      strokeWidth={1.5}
    >
      {rows.map((row) => {
        if (!hasSupportedRange(row)) return null
        const x = xScale(row.x)
        const low = yScale(row.q1!)
        const high = yScale(row.q3!)
        const start = xScale(row.startX)
        const end = xScale(row.endX)
        if (
          x === undefined ||
          low === undefined ||
          high === undefined ||
          start === undefined ||
          end === undefined
        )
          return null
        const cap = Math.min(20, Math.abs(end - start) * 0.55) / 2
        return (
          <g
            data-q1={row.q1}
            data-q3={row.q3}
            data-testid={`memory-strength-whisker-${row.id}`}
            key={row.id}
          >
            <line x1={x} x2={x} y1={low} y2={high} />
            <line x1={x - cap} x2={x + cap} y1={low} y2={low} />
            <line x1={x - cap} x2={x + cap} y1={high} y2={high} />
          </g>
        )
      })}
    </g>
  )
}

function PracticeVolumeColumns({
  rows,
}: {
  rows: readonly PositionedHistoricalRow<PracticeRow>[]
}) {
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  const yScale = useYAxisScale('count')
  if (!plot || !xScale || !yScale) return null
  const baseline = yScale(0)
  if (baseline === undefined) return null
  return (
    <g
      aria-hidden="true"
      data-testid="practice-volume-columns"
      fill="var(--cp-analytics-practice-volume)"
    >
      {rows.map((row) => {
        const x = xScale(row.x)
        const y = yScale(row.completedReviews)
        const start = xScale(row.startX)
        const end = xScale(row.endX)
        if (
          x === undefined ||
          y === undefined ||
          start === undefined ||
          end === undefined
        )
          return null
        const width = Math.min(30, Math.abs(end - start) * 0.62)
        return (
          <rect
            data-completed-reviews={row.completedReviews}
            data-testid={`practice-volume-${row.id}`}
            height={Math.max(0, baseline - y)}
            key={row.id}
            rx={2}
            width={width}
            x={x - width / 2}
            y={y}
          />
        )
      })}
    </g>
  )
}

function MemoryLegend() {
  return (
    <div
      aria-label="Memory Strength series"
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
      role="list"
    >
      <span className="inline-flex items-center gap-1.5" role="listitem">
        <LineKey color="var(--cp-analytics-healthy)" />
        Median
      </span>
      <span className="inline-flex items-center gap-1.5" role="listitem">
        <svg aria-hidden="true" height={14} width={20}>
          <path
            d="M10 2V12M5 2H15M5 12H15"
            fill="none"
            stroke="var(--cp-analytics-predicted)"
            strokeWidth={1.5}
          />
        </svg>
        Middle 50%
      </span>
    </div>
  )
}

function PracticeLegend() {
  return (
    <div
      aria-label="Practice Rhythm series"
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
      role="list"
    >
      <span className="inline-flex items-center gap-1.5" role="listitem">
        <span
          aria-hidden="true"
          className="h-2.5 w-3 rounded-sm"
          style={{ background: 'var(--cp-analytics-practice-volume)' }}
        />
        Review volume (left)
      </span>
      <span className="inline-flex items-center gap-1.5" role="listitem">
        <LineKey color="var(--cp-analytics-observed)" />
        Review Success (right)
      </span>
    </div>
  )
}

function LineKey({ color }: { color: string }) {
  return (
    <svg aria-hidden="true" height={14} width={24}>
      <line stroke={color} strokeWidth={2} x1={0} x2={24} y1={7} y2={7} />
      <circle cx={12} cy={7} fill={color} r={3} />
    </svg>
  )
}

function ReportContext({
  timeFrame,
}: {
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  return timeFrame ? (
    <p className="m-0 text-xs text-muted-foreground">
      {historicalGroupingLabel(timeFrame)} ·{' '}
      {historicalReportContext(timeFrame)}
    </p>
  ) : null
}

function MemoryTooltip({
  row,
  timeFrame,
}: {
  row: MemoryRow
  timeFrame?: HistoricalChartTimeFrame | undefined
}) {
  return (
    <TooltipBox
      row={row}
      timeFrame={timeFrame}
      values={[
        `Median strength: ${availableDays(row.medianStrengthDays)}`,
        `Middle 50%: ${hasSupportedRange(row) ? `${formatDays(row.q1)}–${formatDays(row.q3)}` : row.eligibleReviews < 4 ? 'Unavailable (needs 4 eligible reviews)' : 'Unavailable'}`,
        `Q1: ${hasSupportedRange(row) ? formatDays(row.q1) : 'Unavailable'}`,
        `Q3: ${hasSupportedRange(row) ? formatDays(row.q3) : 'Unavailable'}`,
        `Eligible reviews: ${formatCount(row.eligibleReviews)}`,
        `Median change: ${formatSignedDays(row.medianChangeDays)}`,
        'Provenance: Reconstructed',
        `Evidence: ${evidenceText(row.evidence)}`,
      ]}
    />
  )
}

function PracticeTooltip({
  row,
  timeFrame,
  target,
}: {
  row: PracticeRow
  timeFrame?: HistoricalChartTimeFrame | undefined
  target: number
}) {
  return (
    <TooltipBox
      row={row}
      timeFrame={timeFrame}
      values={[
        `Completed reviews: ${formatCount(row.completedReviews)}`,
        `Review Success: ${isFiniteValue(row.reviewSuccess) ? formatPercent(row.reviewSuccess) : 'Unavailable'}`,
        `Target Review Success: ${formatPercent(target)}`,
        `Good + Easy: ${formatCount(row.goodEasy)} of ${formatCount(row.validRatings)} valid ratings`,
        `Evidence: ${evidenceText(row.evidence)}`,
      ]}
    />
  )
}

function TooltipBox({
  row,
  timeFrame,
  values,
}: {
  row: HistoricalRow
  timeFrame?: HistoricalChartTimeFrame | undefined
  values: readonly string[]
}) {
  return (
    <div className="rounded border border-border bg-popover p-2.5 text-xs leading-relaxed shadow-md">
      <p className="m-0 font-semibold">{bucketText(row, timeFrame)}</p>
      {values.map((value) => (
        <p className="m-0" key={value}>
          {value}
        </p>
      ))}
      <p className="m-0 mt-1 text-muted-foreground">
        {historicalIntervalContext(row, timeFrame)}
        {timeFrame ? ` · ${historicalReportContext(timeFrame)}` : ''}
      </p>
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <p className="m-0 grid min-h-48 place-items-center text-sm text-muted-foreground">
      {message}
    </p>
  )
}

function isFiniteValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

function hasSupportedRange(row: MemoryRow) {
  return (
    row.eligibleReviews >= 4 &&
    isFiniteValue(row.medianStrengthDays) &&
    isFiniteValue(row.q1) &&
    isFiniteValue(row.q3)
  )
}

function memoryRangeText(row: MemoryRow) {
  return hasSupportedRange(row)
    ? `${formatDays(row.q1)}–${formatDays(row.q3)}`
    : 'Not measured'
}

function availableDays(value: number | null) {
  return isFiniteValue(value) ? formatDays(value) : 'Unavailable'
}

function bucketText(row: HistoricalRow, timeFrame?: HistoricalChartTimeFrame) {
  const range = timeFrame
    ? formatHistoricalBucket(row, timeFrame)
    : row.bucketStart === row.bucketEnd
      ? formatHistoricalDate(row.bucketStart, undefined, true)
      : `${formatHistoricalDate(row.bucketStart, undefined, true)}–${formatHistoricalDate(row.bucketEnd, undefined, true)}`
  return `${range}${row.isPartial ? ' (in progress)' : ''}`
}

function evidenceText(value: HistoricalRow['evidence']) {
  return value === 'measured' ? 'Measured' : 'Not measured'
}

function formatSignedDays(value: number | null) {
  return value === null
    ? 'Not measured'
    : `${value >= 0 ? '+' : '−'}${formatDays(Math.abs(value))}`
}
