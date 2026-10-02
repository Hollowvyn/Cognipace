import { useId, useState, type ReactNode } from 'react'
import type { LineDrawShapeProps } from 'recharts'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { ChartContainer } from '@/components/ui/chart'
import { ChartTable } from '@/components/ui/chart-table'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { formatCount } from './charts/chart-shared'

const chartDimension = { width: 640, height: 272 }
const watchZone = 5

export function RecentOverdueBacklogView({
  view,
}: {
  view: AnalyticsViews['overdueBacklog']
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
        chart={<OverdueBacklogChart view={view} />}
        table={<OverdueBacklogTable rows={view.rows} />}
      />
    </div>
  )
}

export function UpcomingReviewLoadView({
  view,
}: {
  view: AnalyticsViews['upcomingReviewLoad']
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
            <UpcomingLoadChart view={view} />
          )
        }
        table={<UpcomingLoadTable rows={view.rows} />}
      />
    </div>
  )
}

function OverdueBacklogChart({
  view,
}: {
  view: AnalyticsViews['overdueBacklog']
}) {
  const summaryId = useId()
  const [activeIndex, setActiveIndex] = useState(0)
  const active = view.rows[activeIndex]

  if (view.knownDays === 0) {
    return (
      <p className="m-0 text-sm text-muted-foreground">
        Historical overdue backlog could not be reconstructed for this period.
      </p>
    )
  }

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
        accessibleDescription="Daily reconstructed overdue backlog; unknown days break the step line."
        accessibleName="Recent Overdue Backlog chart"
        aria-describedby={summaryId}
        aria-label="Recent Overdue Backlog chart"
        aria-roledescription="interactive daily step line"
        className="aspect-auto h-72 min-h-[18rem]"
        config={{
          overdue: 'var(--cp-analytics-attention)',
        }}
        initialDimension={chartDimension}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            setActiveIndex((index) => Math.min(view.rows.length - 1, index + 1))
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            setActiveIndex((index) => Math.max(0, index - 1))
          }
        }}
        role="region"
        tabIndex={0}
      >
        <LineChart
          accessibilityLayer={false}
          data={view.rows}
          margin={{ bottom: 8, left: 0, right: 8, top: 16 }}
        >
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <ReferenceArea
            fill="var(--cp-analytics-healthy)"
            fillOpacity={0.08}
            label="Within watch zone"
            y1={0}
            y2={watchZone}
          />
          <ReferenceArea
            fill="var(--cp-analytics-attention)"
            fillOpacity={0.08}
            label="Above watch zone"
            y1={watchZone}
            y2={view.scale.domain[1]}
          />
          <ReferenceLine
            label="Watch zone · 5"
            stroke="var(--cp-analytics-target)"
            strokeDasharray="4 4"
            y={watchZone}
          />
          <XAxis
            axisLine={false}
            allowDuplicatedCategory={false}
            dataKey="date"
            minTickGap={26}
            tickFormatter={formatShortDate}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            domain={view.scale.domain}
            ticks={view.scale.ticks}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<BacklogTooltip />} />
          <Line
            activeDot={{
              fill: 'var(--color-card)',
              r: 4,
              stroke: 'var(--cp-analytics-target)',
              strokeWidth: 2,
            }}
            dataKey="overdueCount"
            dot={false}
            isAnimationActive={false}
            shape={createThresholdStepShape(
              view.rows.map((row) => row.overdueCount),
            )}
            stroke="transparent"
            strokeWidth={2}
            type="stepAfter"
          />
        </LineChart>
      </ChartContainer>
      <p
        aria-live="polite"
        className="m-0 text-xs text-muted-foreground"
        role="status"
      >
        {active
          ? `${formatDate(active.date)}. ${active.overdueCount === null ? 'Not measured' : `${formatCount(active.overdueCount)} overdue problems`}${active.inProgress ? '. In progress' : ''}`
          : ''}
      </p>
    </div>
  )
}

interface ThresholdLinePoint {
  x: number | null
  y: number | null
}

interface ThresholdStepSegment {
  d: string
  status: 'within-watch' | 'above-watch'
}

function getThresholdStatus(value: number): ThresholdStepSegment['status'] {
  return value <= watchZone ? 'within-watch' : 'above-watch'
}

function addThresholdStepSegment(
  segments: ThresholdStepSegment[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  status: ThresholdStepSegment['status'],
) {
  if (fromX === toX && fromY === toY) return
  segments.push({
    d: `M${fromX},${fromY}L${toX},${toY}`,
    status,
  })
}

export function buildThresholdStepSegments(
  points: readonly ThresholdLinePoint[] | undefined,
  values: readonly (number | null)[],
): ThresholdStepSegment[] {
  if (!points) return []

  const segments: ThresholdStepSegment[] = []
  for (let index = 0; index < values.length - 1; index += 1) {
    const currentValue = values[index]
    const nextValue = values[index + 1]
    const currentPoint = points[index]
    const nextPoint = points[index + 1]
    const currentX = currentPoint?.x
    const currentY = currentPoint?.y
    const nextX = nextPoint?.x
    const nextY = nextPoint?.y
    if (
      typeof currentValue !== 'number' ||
      typeof nextValue !== 'number' ||
      !Number.isFinite(currentValue) ||
      !Number.isFinite(nextValue) ||
      typeof currentX !== 'number' ||
      typeof currentY !== 'number' ||
      typeof nextX !== 'number' ||
      typeof nextY !== 'number'
    ) {
      continue
    }

    const currentStatus = getThresholdStatus(currentValue)
    const nextStatus = getThresholdStatus(nextValue)
    addThresholdStepSegment(
      segments,
      currentX,
      currentY,
      nextX,
      currentY,
      currentStatus,
    )

    if (currentStatus === nextStatus) {
      addThresholdStepSegment(
        segments,
        nextX,
        currentY,
        nextX,
        nextY,
        currentStatus,
      )
      continue
    }

    const thresholdY =
      currentY +
      ((nextY - currentY) * (watchZone - currentValue)) /
        (nextValue - currentValue)
    addThresholdStepSegment(
      segments,
      nextX,
      currentY,
      nextX,
      thresholdY,
      currentStatus,
    )
    addThresholdStepSegment(
      segments,
      nextX,
      thresholdY,
      nextX,
      nextY,
      nextStatus,
    )
  }
  return segments
}

function createThresholdStepShape(values: readonly (number | null)[]) {
  return function ThresholdStepShape({ points }: LineDrawShapeProps) {
    const segments = buildThresholdStepSegments(points, values)
    return (
      <g aria-hidden="true" data-testid="overdue-threshold-step-segments">
        {segments.map((segment, index) => (
          <path
            d={segment.d}
            data-threshold-status={segment.status}
            fill="none"
            key={`${segment.status}-${index}`}
            stroke={
              segment.status === 'within-watch'
                ? 'var(--cp-analytics-healthy)'
                : 'var(--cp-analytics-attention)'
            }
            strokeWidth={2}
          />
        ))}
      </g>
    )
  }
}

function UpcomingLoadChart({
  view,
}: {
  view: AnalyticsViews['upcomingReviewLoad']
}) {
  const summaryId = useId()
  const hatchId = `overdue-hatch-${summaryId.replaceAll(':', '')}`
  const [activeIndex, setActiveIndex] = useState(0)
  const active = view.rows[activeIndex]
  return (
    <div className="grid gap-2">
      <p className="sr-only" id={summaryId}>
        Active non-suspended FSRS cards due in the fixed next 14 local dates.
        The y-axis is scheduled reviews from zero to{' '}
        {formatCount(view.scale.domain[1])}. Due is solid green and overdue is
        diagonally hatched pink. Overdue cards appear only in today&apos;s
        segment.
      </p>
      <ChartContainer
        accessibleDescription="Fixed 14-day active schedule snapshot with due and overdue review counts."
        accessibleName="Upcoming Review Load chart"
        aria-describedby={summaryId}
        aria-label="Upcoming Review Load chart"
        aria-roledescription="interactive stacked daily columns"
        className="aspect-auto h-72 min-h-[18rem]"
        config={{
          due: 'var(--cp-analytics-healthy)',
          overdue: 'var(--cp-analytics-risk)',
        }}
        initialDimension={chartDimension}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            setActiveIndex((index) => Math.min(view.rows.length - 1, index + 1))
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            setActiveIndex((index) => Math.max(0, index - 1))
          }
        }}
        role="region"
        tabIndex={0}
      >
        <BarChart
          accessibilityLayer={false}
          data={view.rows}
          margin={{ bottom: 8, left: 0, right: 8, top: 16 }}
        >
          <defs>
            <pattern
              height="6"
              id={hatchId}
              patternUnits="userSpaceOnUse"
              width="6"
              patternTransform="rotate(45)"
            >
              <rect fill="var(--cp-analytics-risk)" height="6" width="6" />
              <line
                stroke="var(--color-card)"
                strokeWidth="2"
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
            allowDuplicatedCategory={false}
            dataKey="date"
            minTickGap={24}
            tickFormatter={(date) => {
              const dateKey = typeof date === 'string' ? date : ''
              return view.rows.find((row) => row.date === dateKey)?.today
                ? 'Today'
                : formatShortDate(dateKey)
            }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            domain={view.scale.domain}
            ticks={view.scale.ticks}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<UpcomingTooltip />} />
          <Bar
            dataKey="overdueCount"
            fill={`url(#${hatchId})`}
            isAnimationActive={false}
            name="Overdue"
            stackId="load"
          />
          <Bar
            dataKey="dueCount"
            fill="var(--cp-analytics-healthy)"
            isAnimationActive={false}
            name="Due"
            stackId="load"
          />
        </BarChart>
      </ChartContainer>
      <p
        aria-live="polite"
        className="m-0 text-xs text-muted-foreground"
        role="status"
      >
        {active
          ? `${active.today ? 'Today, ' : ''}${formatDate(active.date)}. Due ${formatCount(active.dueCount)}. Overdue ${formatCount(active.overdueCount)}.`
          : ''}
      </p>
    </div>
  )
}

function BacklogTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{
    payload?: AnalyticsViews['overdueBacklog']['rows'][number]
  }>
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded border border-border bg-card px-3 py-2 text-xs shadow-overlay">
      <p className="m-0 font-medium">Date: {formatDate(row.date)}</p>
      <p className="m-0">
        Overdue problems:{' '}
        {row.overdueCount === null
          ? 'Not measured'
          : formatCount(row.overdueCount)}
      </p>
      {row.inProgress ? <p className="m-0">In progress</p> : null}
    </div>
  )
}

function UpcomingTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{
    payload?: AnalyticsViews['upcomingReviewLoad']['rows'][number]
  }>
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded border border-border bg-card px-3 py-2 text-xs shadow-overlay">
      <p className="m-0 font-medium">
        Date:{' '}
        {row.today ? `Today, ${formatDate(row.date)}` : formatDate(row.date)}
      </p>
      <p className="m-0">Due: {formatCount(row.dueCount)}</p>
      <p className="m-0">Overdue: {formatCount(row.overdueCount)}</p>
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
      columns={['Date', 'Due', 'Overdue']}
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
