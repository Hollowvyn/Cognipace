import {
  useId,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { ChartContainer } from '@/components/ui/chart'
import { ChartTable } from '@/components/ui/chart-table'

import type {
  AnalyticsViews,
  SerializedAnalyticsSummary,
} from '../api/analytics-contracts'
import { formatCount } from './charts/chart-shared'
import { historicalReportContext } from './charts/historical-chart-model'

const chartDimension = { width: 640, height: 272 }
const watchZone = 5
const overdueFill = '#d994aa'
type ReportTimeFrame = SerializedAnalyticsSummary['timeFrame']
type BacklogRow = AnalyticsViews['overdueBacklog']['rows'][number]
type UpcomingRow = AnalyticsViews['upcomingReviewLoad']['rows'][number]

export function RecentOverdueBacklogView({
  view,
  timeFrame,
}: {
  view: AnalyticsViews['overdueBacklog']
  timeFrame?: ReportTimeFrame | undefined
}) {
  return (
    <div className="grid gap-2">
      <p className="m-0 text-sm text-muted-foreground">
        {formatCount(view.knownDays)} known days of{' '}
        {formatCount(view.selectedDays)}; current backlog:{' '}
        {view.currentBacklog === null
          ? 'Not measured'
          : formatCount(view.currentBacklog)}
        ; known peak:{' '}
        {view.peak === null ? 'Not measured' : formatCount(view.peak)}.
      </p>
      <p className="m-0 text-sm text-muted-foreground">
        {formatCount(view.withinWatchDays)} known days within the 5-problem
        watch zone; {formatCount(view.aboveWatchDays)} known days above it.
      </p>
      <ChartTable
        chart={<OverdueBacklogChart view={view} timeFrame={timeFrame} />}
        table={<OverdueBacklogTable rows={view.rows} />}
      />
    </div>
  )
}

export function UpcomingReviewLoadView({
  view,
  timeFrame,
}: {
  view: AnalyticsViews['upcomingReviewLoad']
  timeFrame?: ReportTimeFrame | undefined
}) {
  const noReviews = view.rows.every(
    (row) => row.dueCount === 0 && row.overdueCount === 0,
  )
  return (
    <div className="grid gap-2">
      <p className="m-0 text-sm text-muted-foreground">
        Fixed schedule snapshot for today plus the next 13 local dates.
      </p>
      <ul
        aria-label="Upcoming Review Load legend"
        className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted-foreground"
      >
        <li>Due — solid green</li>
        <li>Overdue — diagonally hatched pink</li>
      </ul>
      <ChartTable
        chart={
          noReviews ? (
            <p className="m-0 text-sm text-muted-foreground">
              No reviews are currently scheduled in the next 14 days.
            </p>
          ) : (
            <UpcomingLoadChart view={view} timeFrame={timeFrame} />
          )
        }
        table={<UpcomingLoadTable rows={view.rows} />}
      />
    </div>
  )
}

function useWorkloadInspection(rowCount: number) {
  const [state, setState] = useState({
    index: 0,
    visible: false,
    pinned: false,
    announce: false,
  })
  const index = Math.max(0, Math.min(state.index, rowCount - 1))
  return {
    ...state,
    index,
    select: (next: number, visible = true, pinned = false, announce = false) =>
      setState({
        index: Math.max(0, Math.min(next, rowCount - 1)),
        visible,
        pinned,
        announce,
      }),
  }
}

function OverdueBacklogChart({
  view,
  timeFrame,
}: {
  view: AnalyticsViews['overdueBacklog']
  timeFrame?: ReportTimeFrame | undefined
}) {
  const summaryId = useId()
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const inspection = useWorkloadInspection(view.rows.length)
  if (view.knownDays === 0)
    return (
      <p className="m-0 text-sm text-muted-foreground">
        Historical overdue backlog could not be reconstructed for this period.
      </p>
    )
  return (
    <div className="grid gap-2">
      <p className="sr-only" id={summaryId}>
        Active non-suspended overdue backlog reconstructed from persisted FSRS
        review logs and current card state. Daily local rows span the selected
        period; unknown days are not measured and break the line. The y-axis is
        overdue problems from zero to {formatCount(view.scale.domain[1])}. Five
        problems is the CogniPace watch zone. Today is measured through as of
        time and is in progress.
      </p>
      <ChartContainer
        accessibleDescription="Daily reconstructed overdue backlog; unknown days break the line."
        accessibleName="Recent Overdue Backlog chart"
        aria-describedby={summaryId}
        aria-label="Recent Overdue Backlog chart"
        aria-roledescription="interactive daily line"
        className="aspect-auto h-72 min-h-[18rem]"
        config={{
          overdue: {
            label: 'Overdue problems',
            color: 'var(--cp-analytics-attention)',
          },
        }}
        initialDimension={chartDimension}
        ref={setHost}
        role="region"
      >
        <ComposedChart
          accessibilityLayer={false}
          data={view.rows.map((row, position) => ({ ...row, position }))}
          margin={{ bottom: 8, left: 0, right: 8, top: 16 }}
        >
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <ReferenceArea
            fill="var(--cp-analytics-healthy)"
            fillOpacity={0.035}
            label="Within watch zone"
            y1={0}
            y2={watchZone}
          />
          <ReferenceArea
            fill="var(--cp-analytics-attention)"
            fillOpacity={0.035}
            label="Above watch zone"
            y1={watchZone}
            y2={view.scale.domain[1]}
          />
          <ReferenceLine
            stroke="var(--cp-analytics-target)"
            strokeDasharray="4 4"
            y={watchZone}
          />
          <XAxis
            axisLine={false}
            dataKey="position"
            domain={
              view.rows.length === 1 ? [-0.5, 0.5] : [0, view.rows.length - 1]
            }
            minTickGap={26}
            padding={{ left: 8, right: 8 }}
            tickFormatter={(position) =>
              formatShortDate(
                view.rows[Number(position)]?.date ?? view.rows[0]!.date,
              )
            }
            tickLine={false}
            ticks={view.rows.map((_, index) => index)}
            type="number"
          />
          <YAxis
            allowDataOverflow
            allowDecimals={false}
            axisLine={false}
            domain={view.scale.domain}
            padding={{ top: 8, bottom: 8 }}
            ticks={view.scale.ticks}
            tickLine={false}
            width={32}
          />
          <BacklogMarks
            rows={view.rows}
            selectedIndex={inspection.visible ? inspection.index : -1}
          />
          <WorkloadInspection
            host={host}
            inspection={inspection}
            name="Recent Overdue Backlog chart"
            rows={view.rows}
            describe={(row) =>
              `${formatDate(row.date)}. ${row.overdueCount === null ? 'Not measured. Watch status unknown' : `${formatCount(row.overdueCount)} overdue problems. ${row.overdueCount <= watchZone ? 'Within' : 'Above'} watch zone`}${row.inProgress ? '. In progress' : ''}`
            }
            tooltip={(row) => (
              <BacklogTooltip row={row} timeFrame={timeFrame} />
            )}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

interface ThresholdLinePoint {
  x: number | null
  y: number | null
}
interface ThresholdLineSegment {
  d: string
  status: 'within-watch' | 'above-watch'
}
function getThresholdStatus(value: number): ThresholdLineSegment['status'] {
  return value <= watchZone ? 'within-watch' : 'above-watch'
}

export function buildThresholdLineSegments(
  points: readonly ThresholdLinePoint[] | undefined,
  values: readonly (number | null)[],
): ThresholdLineSegment[] {
  const segments: ThresholdLineSegment[] = []
  if (!points) return segments
  const add = (
    from: ThresholdLinePoint,
    to: ThresholdLinePoint,
    status: ThresholdLineSegment['status'],
  ) => {
    if (from.x !== to.x || from.y !== to.y)
      segments.push({ d: `M${from.x},${from.y}L${to.x},${to.y}`, status })
  }
  for (let index = 0; index < values.length - 1; index += 1) {
    const a = values[index],
      b = values[index + 1],
      from = points[index],
      to = points[index + 1]
    if (
      typeof a !== 'number' ||
      typeof b !== 'number' ||
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      !from ||
      !to ||
      typeof from.x !== 'number' ||
      typeof from.y !== 'number' ||
      typeof to.x !== 'number' ||
      typeof to.y !== 'number' ||
      !Number.isFinite(from.x) ||
      !Number.isFinite(from.y) ||
      !Number.isFinite(to.x) ||
      !Number.isFinite(to.y)
    )
      continue
    const fromStatus = getThresholdStatus(a),
      toStatus = getThresholdStatus(b)
    if (fromStatus === toStatus) {
      add(from, to, fromStatus)
      continue
    }
    const fraction = (watchZone - a) / (b - a)
    const crossing = {
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction,
    }
    add(from, crossing, fromStatus)
    add(crossing, to, toStatus)
  }
  return segments
}

function BacklogMarks({
  rows,
  selectedIndex,
}: {
  rows: BacklogRow[]
  selectedIndex: number
}) {
  const xScale = useXAxisScale(),
    yScale = useYAxisScale()
  if (!xScale || !yScale) return null
  const points = rows.map((row, index) => ({
    x: xScale(index) ?? null,
    y: row.overdueCount === null ? null : (yScale(row.overdueCount) ?? null),
  }))
  const segments = buildThresholdLineSegments(
    points,
    rows.map((row) => row.overdueCount),
  )
  return (
    <g aria-hidden="true">
      {segments.map((segment, index) => (
        <path
          d={segment.d}
          data-threshold-status={segment.status}
          fill="none"
          key={index}
          stroke={
            segment.status === 'within-watch'
              ? 'var(--cp-analytics-healthy)'
              : 'var(--cp-analytics-attention)'
          }
          strokeWidth={2}
        />
      ))}
      {rows.map((row, index) => {
        const point = points[index]!
        return row.overdueCount === null ||
          !Number.isFinite(row.overdueCount) ||
          point.x === null ||
          point.y === null ? null : (
          <circle
            cx={point.x}
            cy={point.y}
            data-date={row.date}
            data-selected={index === selectedIndex}
            data-workload-dot=""
            fill={
              row.overdueCount <= watchZone
                ? 'var(--cp-analytics-healthy)'
                : 'var(--cp-analytics-attention)'
            }
            key={row.date}
            r={index === selectedIndex ? 4.5 : 2.5}
            stroke="var(--color-card)"
            strokeWidth={1.5}
          />
        )
      })}
    </g>
  )
}

function UpcomingLoadChart({
  view,
  timeFrame,
}: {
  view: AnalyticsViews['upcomingReviewLoad']
  timeFrame?: ReportTimeFrame | undefined
}) {
  const summaryId = useId(),
    hatchId = `overdue-hatch-${summaryId.replaceAll(':', '')}`
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const inspection = useWorkloadInspection(view.rows.length)
  return (
    <div className="grid gap-2">
      <p className="sr-only" id={summaryId}>
        Active non-suspended FSRS cards due in the fixed next 14 local dates.
        The y-axis is scheduled reviews from zero to{' '}
        {formatCount(view.scale.domain[1])}. Due is solid green and overdue is
        diagonally hatched pink. Overdue cards appear only in today's segment.
        This snapshot does not simulate future rescheduling.
      </p>
      <ChartContainer
        accessibleDescription="Fixed 14-day active schedule snapshot with due and overdue review counts."
        accessibleName="Upcoming Review Load chart"
        aria-describedby={summaryId}
        aria-label="Upcoming Review Load chart"
        aria-roledescription="interactive stacked daily columns"
        className="aspect-auto h-72 min-h-[18rem]"
        config={{
          due: { label: 'Due', color: 'var(--cp-analytics-healthy)' },
          overdue: { label: 'Overdue', color: overdueFill },
        }}
        initialDimension={chartDimension}
        ref={setHost}
        role="region"
      >
        <ComposedChart
          accessibilityLayer={false}
          data={view.rows.map((row, position) => ({ ...row, position }))}
          margin={{ bottom: 8, left: 0, right: 8, top: 76 }}
        >
          <defs>
            <pattern
              height="6"
              id={hatchId}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
              width="6"
            >
              <rect fill={overdueFill} height="6" width="6" />
              <line
                stroke="#381822"
                strokeOpacity={0.28}
                strokeWidth={1.5}
                x1="0"
                x2="0"
                y1="0"
                y2="6"
              />
            </pattern>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="position"
            domain={[-0.5, 13.5]}
            minTickGap={24}
            tickFormatter={(position) => {
              const row = view.rows[Number(position)]
              return row?.today ? 'Today' : row ? formatShortDate(row.date) : ''
            }}
            tickLine={false}
            ticks={view.rows.map((_, index) => index)}
            type="number"
          />
          <YAxis
            allowDataOverflow
            allowDecimals={false}
            axisLine={false}
            domain={view.scale.domain}
            ticks={view.scale.ticks}
            tickLine={false}
            width={32}
          />
          <UpcomingMarks
            hatchId={hatchId}
            rows={view.rows}
            selectedIndex={inspection.visible ? inspection.index : -1}
          />
          <WorkloadInspection
            host={host}
            inspection={inspection}
            name="Upcoming Review Load chart"
            rows={view.rows}
            describe={(row) =>
              `${row.today ? 'Today, ' : ''}${formatDate(row.date)}. Due ${formatCount(row.dueCount)}. Overdue ${formatCount(row.overdueCount)}. Total ${formatCount(row.dueCount + row.overdueCount)}.`
            }
            tooltip={(row) => (
              <UpcomingTooltip row={row} timeFrame={timeFrame} />
            )}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

function UpcomingMarks({
  hatchId,
  rows,
  selectedIndex,
}: {
  hatchId: string
  rows: UpcomingRow[]
  selectedIndex: number
}) {
  const plot = usePlotArea(),
    xScale = useXAxisScale(),
    yScale = useYAxisScale()
  const labelRefs = useRef(new Map<string, SVGTextElement>())
  const [measurements, setMeasurements] = useState<
    Record<string, { width: number; height: number }>
  >({})
  const labels = [
    ...new Set(
      rows.flatMap((row) => [
        String(row.dueCount),
        String(row.overdueCount),
        `Due ${row.dueCount}`,
        `Overdue ${row.overdueCount}`,
        `Due ${row.dueCount} · Overdue ${row.overdueCount}`,
      ]),
    ),
  ]
  const labelKey = labels.join('|')
  useLayoutEffect(() => {
    const next = Object.fromEntries(
      [...labelRefs.current].map(([text, element]) => [
        text,
        {
          width: element.getComputedTextLength?.() || text.length * 7,
          height: element.getBBox?.().height || 14,
        },
      ]),
    )
    setMeasurements((previous) =>
      Object.keys(next).every(
        (key) =>
          next[key]!.width === previous[key]?.width &&
          next[key]!.height === previous[key]?.height,
      )
        ? previous
        : next,
    )
  }, [labelKey, plot?.width])
  if (!plot || !xScale || !yScale) return null
  const widthOf = (text: string) => measurements[text]?.width ?? text.length * 7
  const heightOf = (text: string) => measurements[text]?.height ?? 14
  const width = Math.min(36, (plot.width / rows.length) * 0.72)
  const outside: Array<{
    index: number
    anchor: number
    x: number
    y: number
    top: number
    width: number
    lines: string[]
  }> = []
  const bars = rows.map((row, index) => {
    const center = xScale(index) ?? plot.x,
      baseline = yScale(0) ?? plot.y + plot.height
    const middle = yScale(row.overdueCount) ?? baseline,
      top = yScale(row.overdueCount + row.dueCount) ?? middle
    const dueFits =
      row.dueCount > 0 &&
      width >= widthOf(String(row.dueCount)) + 4 &&
      middle - top >= heightOf(String(row.dueCount)) + 4
    const overdueFits =
      row.overdueCount > 0 &&
      width >= widthOf(String(row.overdueCount)) + 4 &&
      baseline - middle >= heightOf(String(row.overdueCount)) + 4
    const parts: string[] = []
    if (row.dueCount > 0 && !dueFits)
      parts.push(
        row.overdueCount > 0 ? `Due ${row.dueCount}` : String(row.dueCount),
      )
    if (row.overdueCount > 0 && !overdueFits)
      parts.push(`Overdue ${row.overdueCount}`)
    if (parts.length) {
      const joined = parts.join(' · ')
      const lines =
        widthOf(joined) > Math.min(plot.width - 8, plot.width / 3) &&
        parts.length > 1
          ? parts
          : [joined]
      const labelWidth = Math.max(...lines.map(widthOf))
      const x = Math.max(
        plot.x + labelWidth / 2 + 4,
        Math.min(center, plot.x + plot.width - labelWidth / 2 - 4),
      )
      let y = top - 8
      for (let attempt = 0; attempt < outside.length + 1; attempt += 1) {
        const collision = outside.find(
          (label) =>
            Math.abs(label.x - x) < (label.width + labelWidth) / 2 + 4 &&
            y - lines.length * 14 < label.y + 4 &&
            y > label.top - 4,
        )
        if (!collision) break
        y = collision.top - 4
      }
      outside.push({
        index,
        anchor: center,
        x,
        y,
        top: y - lines.length * 14,
        width: labelWidth,
        lines,
      })
    }
    return { row, index, center, baseline, middle, top, dueFits, overdueFits }
  })
  return (
    <g aria-hidden="true" fontSize={12} fontWeight={600} textAnchor="middle">
      <g visibility="hidden">
        {labels.map((text) => (
          <text
            key={text}
            ref={(element) => {
              if (element) labelRefs.current.set(text, element)
              else labelRefs.current.delete(text)
            }}
          >
            {text}
          </text>
        ))}
      </g>
      {bars.map(
        ({
          row,
          index,
          center,
          baseline,
          middle,
          top,
          dueFits,
          overdueFits,
        }) => (
          <g
            data-date={row.date}
            data-selected={index === selectedIndex}
            data-workload-bar=""
            key={row.date}
          >
            {row.overdueCount > 0 ? (
              <rect
                fill={`url(#${hatchId})`}
                height={baseline - middle}
                width={width}
                x={center - width / 2}
                y={middle}
              />
            ) : null}
            {row.dueCount > 0 ? (
              <rect
                fill="var(--cp-analytics-healthy)"
                height={middle - top}
                width={width}
                x={center - width / 2}
                y={top}
              />
            ) : null}
            {index === selectedIndex && row.dueCount + row.overdueCount > 0 ? (
              <rect
                fill="none"
                height={baseline - top}
                stroke="var(--cp-analytics-target)"
                strokeWidth={2}
                width={width}
                x={center - width / 2}
                y={top}
              />
            ) : null}
            {dueFits ? (
              <text
                data-count-label="due"
                dominantBaseline="central"
                fill="var(--color-card)"
                x={center}
                y={(top + middle) / 2}
              >
                {row.dueCount}
              </text>
            ) : null}
            {overdueFits ? (
              <text
                data-count-label="overdue"
                dominantBaseline="central"
                fill="#381822"
                paintOrder="stroke"
                stroke={overdueFill}
                strokeWidth={4}
                strokeLinejoin="round"
                x={center}
                y={(middle + baseline) / 2}
              >
                {row.overdueCount}
              </text>
            ) : null}
          </g>
        ),
      )}
      {outside.map((label) => (
        <g key={label.index}>
          <path
            d={`M${label.anchor},${bars[label.index]!.top - 2}L${label.anchor},${label.y + 4}L${label.x},${label.y + 4}`}
            fill="none"
            stroke="var(--color-muted-foreground)"
            strokeOpacity={0.5}
          />
          <text
            data-count-label="outside"
            data-date={rows[label.index]!.date}
            fill="var(--color-foreground)"
            paintOrder="stroke"
            stroke="var(--color-card)"
            strokeWidth={3}
            strokeLinejoin="round"
            x={label.x}
            y={label.y - (label.lines.length - 1) * 14}
          >
            {label.lines.map((line, index) => (
              <tspan dy={index === 0 ? 0 : 14} key={line} x={label.x}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ))}
    </g>
  )
}

function WorkloadInspection<Row extends { date: string }>({
  host,
  rows,
  inspection,
  name,
  tooltip,
  describe,
}: {
  host: HTMLDivElement | null
  rows: Row[]
  inspection: ReturnType<typeof useWorkloadInspection>
  name: string
  tooltip: (row: Row) => ReactNode
  describe: (row: Row) => string
}) {
  const plot = usePlotArea(),
    xScale = useXAxisScale()
  const instructionsId = useId(),
    tooltipId = useId()
  useEffect(() => {
    if (!inspection.visible) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') inspection.select(inspection.index, false)
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [inspection])
  if (!host || !plot || !xScale || !rows.length) return null
  const row = rows[inspection.index]!,
    anchor = xScale(inspection.index) ?? plot.x
  const hostWidth =
    host.getBoundingClientRect().width || plot.x + plot.width + 8
  const tooltipWidth = Math.min(272, Math.max(0, hostWidth - 16))
  const pointerSelect = (
    event: PointerEvent<HTMLButtonElement>,
    pinned = false,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x =
      plot.x +
      ((event.clientX - bounds.left) / (bounds.width || plot.width)) *
        plot.width
    let nearest = 0
    rows.forEach((_, index) => {
      if (
        Math.abs((xScale(index) ?? plot.x) - x) <
        Math.abs((xScale(nearest) ?? plot.x) - x)
      )
        nearest = index
    })
    inspection.select(nearest, true, pinned)
  }
  return (
    <>
      {inspection.visible ? (
        <line
          aria-hidden="true"
          data-workload-guide=""
          stroke="var(--color-muted-foreground)"
          strokeDasharray="3 5"
          strokeOpacity={0.35}
          x1={anchor}
          x2={anchor}
          y1={plot.y}
          y2={plot.y + plot.height}
        />
      ) : null}
      {createPortal(
        <>
          <span className="sr-only" id={instructionsId}>
            Use Left and Right arrows or Home and End to inspect each date.
            Enter or Space shows details; Escape hides them.
          </span>
          <button
            aria-describedby={`${instructionsId}${inspection.visible ? ` ${tooltipId}` : ''}`}
            aria-label={`Inspect ${name}`}
            className="absolute z-10 m-0 cursor-crosshair rounded-sm border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onBlur={() => inspection.select(inspection.index, false)}
            onFocus={() =>
              inspection.select(inspection.index, true, false, true)
            }
            onKeyDown={(event) => {
              if (
                ![
                  'ArrowLeft',
                  'ArrowRight',
                  'Home',
                  'End',
                  'Enter',
                  ' ',
                  'Escape',
                ].includes(event.key)
              )
                return
              event.preventDefault()
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? rows.length - 1
                    : inspection.index +
                      (event.key === 'ArrowLeft'
                        ? -1
                        : event.key === 'ArrowRight'
                          ? 1
                          : 0)
              inspection.select(next, event.key !== 'Escape', false, true)
            }}
            onPointerDown={(event) => {
              event.currentTarget.focus()
              pointerSelect(event, event.pointerType === 'touch')
            }}
            onPointerLeave={() => {
              if (!inspection.pinned) inspection.select(inspection.index, false)
            }}
            onPointerMove={(event) => {
              if (!inspection.pinned) pointerSelect(event)
            }}
            style={{
              left: plot.x,
              top: plot.y,
              width: plot.width,
              height: plot.height,
              touchAction: 'pan-y',
            }}
            type="button"
          />
          {inspection.visible ? (
            <div
              className="pointer-events-none absolute z-20 text-xs tabular-nums"
              id={tooltipId}
              role="tooltip"
              style={{
                left: Math.max(
                  8,
                  Math.min(anchor + 14, hostWidth - tooltipWidth - 8),
                ),
                top: plot.y + 8,
                width: tooltipWidth,
              }}
            >
              {tooltip(row)}
            </div>
          ) : null}
          <span aria-live="polite" className="sr-only" role="status">
            {inspection.announce && inspection.visible ? describe(row) : ''}
          </span>
        </>,
        host,
      )}
    </>
  )
}

function ReportContext({
  timeFrame,
}: {
  timeFrame?: ReportTimeFrame | undefined
}) {
  return timeFrame ? (
    <p className="m-0 text-muted-foreground">
      {historicalReportContext(timeFrame)}
    </p>
  ) : null
}
function BacklogTooltip({
  row,
  timeFrame,
}: {
  row: BacklogRow
  timeFrame?: ReportTimeFrame | undefined
}) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2 text-xs shadow-overlay">
      <p className="m-0 font-medium">Date: {formatDate(row.date)}</p>
      <p className="m-0">
        Overdue problems:{' '}
        {row.overdueCount === null
          ? 'Not measured'
          : formatCount(row.overdueCount)}
      </p>
      <p className="m-0">
        Watch status:{' '}
        {row.overdueCount === null
          ? 'Unknown'
          : row.overdueCount <= watchZone
            ? 'Within watch zone (≤5)'
            : 'Above watch zone (>5)'}
      </p>
      <p className="m-0 text-muted-foreground">
        Reconstructed{' '}
        {row.inProgress ? 'through as of · In progress' : 'at local day end'}
      </p>
      <ReportContext timeFrame={timeFrame} />
    </div>
  )
}
function UpcomingTooltip({
  row,
  timeFrame,
}: {
  row: UpcomingRow
  timeFrame?: ReportTimeFrame | undefined
}) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2 text-xs shadow-overlay">
      <p className="m-0 font-medium">
        Date:{' '}
        {row.today ? `Today, ${formatDate(row.date)}` : formatDate(row.date)}
      </p>
      <p className="m-0">Due: {formatCount(row.dueCount)}</p>
      <p className="m-0">Overdue: {formatCount(row.overdueCount)}</p>
      <p className="m-0">
        Total: {formatCount(row.dueCount + row.overdueCount)}
      </p>
      <ReportContext timeFrame={timeFrame} />
    </div>
  )
}

function OverdueBacklogTable({
  rows,
}: {
  rows: AnalyticsViews['overdueBacklog']['rows']
}) {
  const page = usePage(rows, 7)
  return (
    <PaginatedTable
      caption="Recent Overdue Backlog data table"
      columns={['Date', 'Overdue problems']}
      page={page}
      rows={page.visibleRows.map((row) => (
        <tr key={row.date}>
          <th className="px-2 py-2 font-medium" scope="row">
            {formatDate(row.date)}
            {row.inProgress ? ' · In progress' : ''}
          </th>
          <td className="px-2 py-2 text-right tabular-nums">
            {row.overdueCount === null
              ? 'Not measured'
              : formatCount(row.overdueCount)}
          </td>
        </tr>
      ))}
    />
  )
}

function UpcomingLoadTable({
  rows,
}: {
  rows: AnalyticsViews['upcomingReviewLoad']['rows']
}) {
  const page = usePage(rows, 7)
  return (
    <PaginatedTable
      caption="Upcoming Review Load data table"
      columns={['Date', 'Due', 'Overdue', 'Total']}
      page={page}
      rows={page.visibleRows.map((row) => (
        <tr key={row.date}>
          <th className="px-2 py-2 font-medium" scope="row">
            {row.today
              ? `Today · ${formatDate(row.date)}`
              : formatDate(row.date)}
          </th>
          <td className="px-2 py-2 text-right tabular-nums">
            {formatCount(row.dueCount)}
          </td>
          <td className="px-2 py-2 text-right tabular-nums">
            {formatCount(row.overdueCount)}
          </td>
          <td className="px-2 py-2 text-right tabular-nums">
            {formatCount(row.dueCount + row.overdueCount)}
          </td>
        </tr>
      ))}
    />
  )
}

function usePage<T>(rows: readonly T[], pageSize: number) {
  const [index, setIndex] = useState(0)
  const [previousRows, setPreviousRows] = useState(rows)
  if (rows !== previousRows) {
    setPreviousRows(rows)
    setIndex(0)
  }
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(index, pages - 1)
  const visibleRows = rows.slice(page * pageSize, page * pageSize + pageSize)
  const start = rows.length === 0 ? 0 : page * pageSize + 1
  return {
    page,
    pages,
    setIndex,
    visibleRows,
    start,
    end: start + visibleRows.length - 1,
    total: rows.length,
  }
}

function PaginatedTable<T>({
  caption,
  columns,
  page,
  rows,
}: {
  caption: string
  columns: string[]
  page: ReturnType<typeof usePage<T>>
  rows: ReactNode
}) {
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto">
        <table
          aria-label={caption}
          className="w-full min-w-[28rem] border-collapse text-left text-sm"
        >
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              {columns.map((column) => (
                <th className="px-2 pb-2" key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p
          aria-live="polite"
          className="m-0 text-xs text-muted-foreground"
          role="status"
        >
          Showing {page.start}–{page.end} of {page.total}
        </p>
        <div className="flex gap-2">
          <Button
            aria-label="Previous page"
            disabled={page.page === 0}
            onClick={() => page.setIndex((value) => Math.max(0, value - 1))}
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            aria-label="Next page"
            disabled={page.page >= page.pages - 1}
            onClick={() =>
              page.setIndex((value) => Math.min(page.pages - 1, value + 1))
            }
            size="sm"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
    year: '2-digit',
  }).format(new Date(`${date}T00:00:00.000Z`))
}
function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`))
}
