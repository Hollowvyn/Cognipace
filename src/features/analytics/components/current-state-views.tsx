import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  type ScatterShapeProps,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { ChartContainer } from '@/components/ui/chart'
import { ChartTable } from '@/components/ui/chart-table'
import { createLeetCodeProblemUrl } from '@/lib/leetcode'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { formatCount, formatPercent } from './charts/chart-shared'

const chartDimension = { width: 640, height: 288 }

export function RetentionMapView({
  timeZone = 'UTC',
  view,
}: {
  timeZone?: string
  view: AnalyticsViews['retentionMap']
}) {
  if (view.rows.length === 0) {
    return (
      <Empty message="No active reviewed problems have enough current FSRS data for the Retention Map." />
    )
  }

  return (
    <div className="grid gap-2">
      {view.totalEligible > view.rows.length ? (
        <p className="m-0 text-sm text-muted-foreground">
          Showing the {formatCount(view.rows.length)} highest-priority problems
          of {formatCount(view.totalEligible)} eligible.
        </p>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">
          {formatCount(view.totalEligible)} eligible problem
          {view.totalEligible === 1 ? '' : 's'} shown.
        </p>
      )}
      <p className="m-0 text-sm text-muted-foreground">
        {formatCount(view.statusCounts.onTarget)} on target,{' '}
        {formatCount(view.statusCounts.watch)} watch, and{' '}
        {formatCount(view.statusCounts.needsAttention)} need attention across
        the full eligible cohort.
      </p>
      <ChartTable
        chart={<RetentionMapChart timeZone={timeZone} view={view} />}
        table={<RetentionMapTable rows={view.rows} timeZone={timeZone} />}
      />
    </div>
  )
}

export function MemorySignalsView({
  view,
}: {
  view: AnalyticsViews['memorySignals']
}) {
  if (view.rows.length === 0) {
    return <Empty message="No current problems meet these attention signals." />
  }

  return (
    <div className="grid gap-2">
      <p className="m-0 text-sm text-muted-foreground">
        {formatCount(view.totalQualifying)} qualifying problem
        {view.totalQualifying === 1 ? '' : 's'}; showing the first{' '}
        {formatCount(view.rows.length)} by severity.
      </p>
      <MemorySignalsTable rows={view.rows} />
    </div>
  )
}

function RetentionMapChart({
  timeZone,
  view,
}: {
  timeZone: string
  view: AnalyticsViews['retentionMap']
}) {
  const [pinnedSlug, setPinnedSlug] = useState<string | null>(null)
  const [transientSlug, setTransientSlug] = useState<string | null>(null)
  const [activeSlug, setActiveSlug] = useState(() => view.rows[0]?.slug ?? null)
  const chartSummaryId = useId()
  const regionRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef(new Map<string, SVGGElement>())
  const activeTimerRef = useRef<number | null>(null)
  const openTimerRef = useRef<number | null>(null)
  const restoreFocusSlugRef = useRef<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const pinnedSlugRef = useRef<string | null>(null)
  const pinned = view.rows.find((row) => row.slug === pinnedSlug) ?? null
  const transient = view.rows.find((row) => row.slug === transientSlug) ?? null
  const activePointSlug = view.rows.some((row) => row.slug === activeSlug)
    ? activeSlug
    : (view.rows[0]?.slug ?? null)
  const watchFloor = Math.max(0, view.targetRetention - 0.1)

  useEffect(() => {
    pinnedSlugRef.current = pinnedSlug
  }, [pinnedSlug])

  const clearExitTimer = useCallback(() => {
    if (activeTimerRef.current !== null) {
      window.clearTimeout(activeTimerRef.current)
      activeTimerRef.current = null
    }
  }, [])

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])

  const openTransient = useCallback(
    (slug: string) => {
      clearExitTimer()
      clearOpenTimer()
      openTimerRef.current = window.setTimeout(() => {
        if (!pinnedSlugRef.current) setTransientSlug(slug)
        openTimerRef.current = null
      })
    },
    [clearExitTimer, clearOpenTimer],
  )

  const scheduleTransientClose = useCallback(() => {
    clearExitTimer()
    activeTimerRef.current = window.setTimeout(() => {
      if (!pinnedSlugRef.current) setTransientSlug(null)
      activeTimerRef.current = null
    }, 150)
  }, [clearExitTimer])

  const dismissPinned = useCallback(() => {
    setPinnedSlug((currentSlug) => {
      if (currentSlug) restoreFocusSlugRef.current = currentSlug
      return null
    })
    setTransientSlug(null)
  }, [])

  const togglePinned = useCallback(
    (slug: string) => {
      clearExitTimer()
      clearOpenTimer()
      setTransientSlug(null)
      setPinnedSlug((currentSlug) => {
        if (currentSlug === slug) {
          restoreFocusSlugRef.current = slug
          return null
        }
        return slug
      })
    },
    [clearExitTimer, clearOpenTimer],
  )

  useEffect(() => {
    return () => {
      clearExitTimer()
      clearOpenTimer()
    }
  }, [clearExitTimer, clearOpenTimer])

  useEffect(() => {
    if (pinnedSlug !== null) return
    const slug = restoreFocusSlugRef.current
    restoreFocusSlugRef.current = null
    if (!slug) return
    const timer = window.setTimeout(() =>
      triggerRefs.current.get(slug)?.focus(),
    )
    return () => window.clearTimeout(timer)
  }, [pinnedSlug])

  useEffect(() => {
    if (!pinned) return
    const timer = window.setTimeout(() => closeButtonRef.current?.focus())
    return () => window.clearTimeout(timer)
  }, [pinned])

  useEffect(() => {
    if (!pinned) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dismissPinned()
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && !regionRef.current?.contains(target)) {
        dismissPinned()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [pinned, dismissPinned])

  const moveFocus = useCallback(
    (slug: string, offset: number) => {
      const index = view.rows.findIndex((row) => row.slug === slug)
      const target = view.rows[index + offset]
      if (!target) return
      setActiveSlug(target.slug)
      window.setTimeout(() => triggerRefs.current.get(target.slug)?.focus())
    },
    [view.rows],
  )

  const pointShape = useCallback(
    (props: ScatterShapeProps) => {
      const row =
        props.payload as AnalyticsViews['retentionMap']['rows'][number]
      const cx = props.cx
      const cy = props.cy
      if (typeof cx !== 'number' || typeof cy !== 'number' || !row) return null
      const label = `${row.title}. ${statusLabel(row.status)}. ${formatPercent(row.retrievability)} current recall. ${formatDuration(row.targetDurationDays)} above target. ${regionLabel(row.region)}.`
      const color = statusColor(row.status)

      return (
        <g
          aria-controls="retention-map-details"
          aria-expanded={pinnedSlug === row.slug}
          aria-haspopup="dialog"
          aria-label={label}
          className="cursor-pointer focus-visible:outline-none"
          data-retention-map-point={row.slug}
          onBlur={scheduleTransientClose}
          onClick={() => togglePinned(row.slug)}
          onFocus={() => {
            setActiveSlug(row.slug)
            openTransient(row.slug)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              togglePinned(row.slug)
            }
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault()
              moveFocus(row.slug, 1)
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault()
              moveFocus(row.slug, -1)
            }
          }}
          onMouseEnter={() => openTransient(row.slug)}
          onMouseLeave={scheduleTransientClose}
          ref={(node) => {
            if (node) triggerRefs.current.set(row.slug, node)
            else triggerRefs.current.delete(row.slug)
          }}
          role="button"
          tabIndex={activePointSlug === row.slug ? 0 : -1}
        >
          <title>{label}</title>
          <PointMark cx={cx} cy={cy} color={color} status={row.status} />
          <circle cx={cx} cy={cy} fill="transparent" r={12} />
        </g>
      )
    },
    [
      activePointSlug,
      moveFocus,
      openTransient,
      pinnedSlug,
      scheduleTransientClose,
      togglePinned,
    ],
  )

  return (
    <div className="relative grid gap-2" ref={regionRef}>
      <p className="sr-only" id={chartSummaryId}>
        Scope: active, non-suspended, reviewed problems with eligible current
        FSRS data. X-axis is total target-crossing duration in days on a
        logarithmic scale from {formatDuration(view.durationScale.domain[0])} to{' '}
        {formatDuration(view.durationScale.domain[1])}. Y-axis is current FSRS
        recall from {formatPercent(view.recallScale.domain[0])} to{' '}
        {formatPercent(view.recallScale.domain[1])}. Target is{' '}
        {formatPercent(view.targetRetention)}; the watch band spans 10
        percentage points from {formatPercent(watchFloor)} to below{' '}
        {formatPercent(view.targetRetention)}. The vertical reference is 7 days.
        Values are model-estimated current FSRS memory status, not observed
        recall.
      </p>
      <ChartContainer
        accessibleDescription={`Each point is one active reviewed problem. X is total target-crossing duration in days on a logarithmic scale from ${formatDuration(view.durationScale.domain[0])} to ${formatDuration(view.durationScale.domain[1])}; Y is current FSRS recall from ${formatPercent(view.recallScale.domain[0])} to ${formatPercent(view.recallScale.domain[1])}.`}
        accessibleName="Retention Map chart"
        aria-label="Retention Map chart"
        aria-describedby={chartSummaryId}
        aria-roledescription="interactive scatter plot"
        className="aspect-auto h-80 min-h-[20rem]"
        config={{
          retrievability: 'var(--cp-analytics-observed)',
        }}
        initialDimension={chartDimension}
        role="region"
      >
        <ScatterChart
          accessibilityLayer
          margin={{ bottom: 16, left: 8, right: 12, top: 12 }}
        >
          <CartesianGrid stroke="var(--color-border)" />
          <RetentionRegions
            durationDomain={view.durationScale.domain}
            recallDomain={view.recallScale.domain}
            target={view.targetRetention}
            watchFloor={watchFloor}
          />
          <XAxis
            axisLine={false}
            dataKey="targetDurationDays"
            domain={view.durationScale.domain}
            label={{
              value: 'Time above target (days, log)',
              offset: -4,
              position: 'insideBottom',
            }}
            scale="log"
            tickFormatter={formatDuration}
            ticks={view.durationScale.ticks}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="retrievability"
            domain={view.recallScale.domain}
            tickFormatter={formatPercent}
            ticks={view.recallScale.ticks}
            tickLine={false}
            type="number"
            width={44}
          />
          <ReferenceLine
            label={`Target ${formatPercent(view.targetRetention)}`}
            stroke="var(--cp-analytics-target)"
            strokeDasharray="5 5"
            y={view.targetRetention}
          />
          <ReferenceLine
            label="1 week"
            stroke="var(--cp-analytics-target)"
            strokeDasharray="5 5"
            x={7}
          />
          <Scatter data={view.rows} shape={pointShape} />
        </ScatterChart>
      </ChartContainer>
      <p className="m-0 text-xs text-muted-foreground">
        Adaptive Y-scale: current recall spans{' '}
        {formatPercent(view.recallScale.domain[0])}–
        {formatPercent(view.recallScale.domain[1])} for this eligible cohort.
      </p>
      <RetentionMapLegend />
      {pinned ? (
        <RetentionMapDetails
          closeButtonRef={closeButtonRef}
          onClose={dismissPinned}
          row={pinned}
          timeZone={timeZone}
        />
      ) : transient ? (
        <RetentionMapPreview
          onEnter={clearExitTimer}
          onLeave={scheduleTransientClose}
          row={transient}
          timeZone={timeZone}
        />
      ) : null}
    </div>
  )
}

function RetentionRegions({
  durationDomain,
  recallDomain,
  target,
  watchFloor,
}: {
  durationDomain: readonly [number, number]
  recallDomain: readonly [number, number]
  target: number
  watchFloor: number
}) {
  const [x1, x2] = durationDomain
  const [y1, y2] = recallDomain
  return (
    <>
      <ReferenceArea
        fill="var(--cp-analytics-risk)"
        fillOpacity={0.1}
        label="Highest attention"
        x1={x1}
        x2={7}
        y1={y1}
        y2={watchFloor}
      />
      <ReferenceArea
        fill="var(--cp-analytics-risk)"
        fillOpacity={0.05}
        label="Needs attention"
        x1={7}
        x2={x2}
        y1={y1}
        y2={watchFloor}
      />
      <ReferenceArea
        fill="var(--cp-analytics-attention)"
        fillOpacity={0.08}
        label="Watch closely"
        x1={x1}
        x2={7}
        y1={watchFloor}
        y2={target}
      />
      <ReferenceArea
        fill="var(--cp-analytics-attention)"
        fillOpacity={0.04}
        label="Near target, more durable"
        x1={7}
        x2={x2}
        y1={watchFloor}
        y2={target}
      />
      <ReferenceArea
        fill="var(--cp-analytics-healthy)"
        fillOpacity={0.05}
        label="On target now"
        x1={x1}
        x2={7}
        y1={target}
        y2={y2}
      />
      <ReferenceArea
        fill="var(--cp-analytics-healthy)"
        fillOpacity={0.1}
        label="Strongest position"
        x1={7}
        x2={x2}
        y1={target}
        y2={y2}
      />
    </>
  )
}

function PointMark({
  cx,
  cy,
  color,
  status,
}: {
  cx: number
  cy: number
  color: string
  status: AnalyticsViews['retentionMap']['rows'][number]['status']
}) {
  if (status === 'watch') {
    return (
      <polygon
        fill={color}
        points={`${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`}
      />
    )
  }
  if (status === 'needs-attention') {
    return (
      <polygon
        fill={color}
        points={`${cx},${cy - 7} ${cx + 7},${cy + 6} ${cx - 7},${cy + 6}`}
      />
    )
  }
  return <circle cx={cx} cy={cy} fill={color} r={6} />
}

function RetentionMapLegend() {
  return (
    <ul
      aria-label="Retention Map regions"
      className="m-0 flex flex-wrap gap-x-3 gap-y-1 p-0 text-xs text-muted-foreground"
      role="list"
    >
      {[
        ['●', 'Strongest position'],
        ['●', 'On target now'],
        ['◆', 'Near target, more durable'],
        ['◆', 'Watch closely'],
        ['▲', 'Needs attention'],
        ['▲', 'Highest attention'],
      ].map(([shape, label]) => (
        <li
          className="inline-flex items-center gap-1"
          key={label}
          role="listitem"
        >
          <span aria-hidden="true">{shape}</span>
          {label}
        </li>
      ))}
    </ul>
  )
}

function RetentionMapPreview({
  onEnter,
  onLeave,
  row,
  timeZone,
}: {
  onEnter: () => void
  onLeave: () => void
  row: AnalyticsViews['retentionMap']['rows'][number]
  timeZone: string
}) {
  return (
    <div
      aria-live="polite"
      className="absolute bottom-3 left-3 z-10 max-w-sm rounded border border-border bg-card/95 p-3 text-xs shadow-overlay"
      onBlur={onLeave}
      onFocus={onEnter}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      role="status"
    >
      <a
        className="font-semibold text-primary underline-offset-4 hover:underline"
        href={createLeetCodeProblemUrl(row.slug)}
        rel="noopener noreferrer"
        target="_blank"
      >
        {row.title}
      </a>
      <RetentionMapDetailList row={row} timeZone={timeZone} />
    </div>
  )
}

function RetentionMapDetails({
  closeButtonRef,
  onClose,
  row,
  timeZone,
}: {
  closeButtonRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  row: AnalyticsViews['retentionMap']['rows'][number]
  timeZone: string
}) {
  return (
    <div
      aria-label={`${row.title} memory details`}
      className="absolute inset-x-3 top-3 z-10 max-w-sm rounded border border-border bg-card p-3 shadow-overlay sm:left-auto sm:right-3"
      id="retention-map-details"
      role="dialog"
    >
      <div className="flex items-start justify-between gap-2">
        <a
          className="min-w-0 truncate font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={createLeetCodeProblemUrl(row.slug)}
          rel="noopener noreferrer"
          target="_blank"
        >
          {row.title}
        </a>
        <Button
          aria-label={`Close ${row.title} memory details`}
          onClick={onClose}
          ref={closeButtonRef}
          size="icon"
          variant="ghost"
        >
          ×
        </Button>
      </div>
      <RetentionMapDetailList row={row} timeZone={timeZone} />
    </div>
  )
}

function RetentionMapDetailList({
  row,
  timeZone,
}: {
  row: AnalyticsViews['retentionMap']['rows'][number]
  timeZone: string
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
      <Detail label="Status" value={statusLabel(row.status)} />
      <Detail
        label="Current recall"
        value={formatPercent(row.retrievability)}
      />
      <Detail
        label="Time above target"
        value={formatDuration(row.targetDurationDays)}
      />
      <Detail label="Target gap" value={formatGap(row.targetGap)} />
      <Detail
        label="Last reviewed"
        value={formatDate(row.lastReviewedAt, timeZone)}
      />
    </dl>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 tabular-nums">{value}</dd>
    </div>
  )
}

function RetentionMapTable({
  rows,
  timeZone,
}: {
  rows: AnalyticsViews['retentionMap']['rows']
  timeZone: string
}) {
  const { page, setPage, visibleRows, start, end, pageCount } = usePagination(
    rows,
    7,
  )
  return (
    <div className="grid gap-3">
      <div className="min-w-0 overflow-x-auto">
        <table
          aria-label={`Retention Map rows ${start} through ${end} of ${rows.length}`}
          className="w-full min-w-[64rem] border-collapse text-left text-sm"
        >
          <caption className="sr-only">Retention Map data table</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              {[
                'Rank',
                'Problem',
                'Current recall',
                'Target',
                'Target gap',
                'Time above target',
                'Last reviewed',
                'Due',
                'Difficulty',
                'Lapses',
                'Status',
              ].map((label) => (
                <th className="px-2 pb-2" key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr className="border-b border-border align-top" key={row.slug}>
                <td className="px-2 py-2 text-right tabular-nums">
                  {row.rank}
                </td>
                <th className="px-2 py-2 font-medium" scope="row">
                  <a
                    className="text-primary underline-offset-4 hover:underline"
                    href={createLeetCodeProblemUrl(row.slug)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {row.title}
                  </a>
                </th>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatPercent(row.retrievability)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatPercent(row.targetRetention)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatGap(row.targetGap)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatDuration(row.targetDurationDays)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatDate(row.lastReviewedAt, timeZone)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatDate(row.dueAt, timeZone)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {row.difficulty.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatCount(row.lapseCount)}
                </td>
                <td className="px-2 py-2">{statusLabel(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        end={end}
        onNext={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
        onPrevious={() => setPage((value) => Math.max(0, value - 1))}
        page={page}
        pageCount={pageCount}
        start={start}
        total={rows.length}
      />
    </div>
  )
}

function MemorySignalsTable({
  rows,
}: {
  rows: AnalyticsViews['memorySignals']['rows']
}) {
  const { page, setPage, visibleRows, start, end, pageCount } = usePagination(
    rows,
    5,
  )
  return (
    <div className="grid gap-3">
      <div className="min-w-0 overflow-x-auto">
        <table
          aria-label={`Memory Signals rows ${start} through ${end} of ${rows.length}`}
          className="w-full min-w-[36rem] border-collapse text-left text-sm"
        >
          <caption className="sr-only">
            Memory Signals by Problem data table
          </caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              <th className="px-2 pb-2" scope="col">
                Rank
              </th>
              <th className="px-2 pb-2" scope="col">
                Problem
              </th>
              <th className="px-2 pb-2" scope="col">
                Why it&apos;s here
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr className="border-b border-border align-top" key={row.slug}>
                <td className="px-2 py-2 text-right tabular-nums">
                  {row.rank}
                </td>
                <th className="px-2 py-2 font-medium" scope="row">
                  <a
                    className="text-primary underline-offset-4 hover:underline"
                    href={createLeetCodeProblemUrl(row.slug)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {row.title}
                  </a>
                </th>
                <td className="px-2 py-2">
                  <div className="grid max-w-md grid-cols-2 gap-1">
                    {row.reasons.map((reason) => (
                      <span
                        className="rounded border border-border px-1.5 py-0.5 text-xs"
                        key={reason.kind}
                      >
                        {reason.label}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        end={end}
        onNext={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
        onPrevious={() => setPage((value) => Math.max(0, value - 1))}
        page={page}
        pageCount={pageCount}
        start={start}
        total={rows.length}
      />
    </div>
  )
}

function usePagination<T>(rows: readonly T[], pageSize: number) {
  const [page, setPage] = useState(0)
  const [previousRows, setPreviousRows] = useState(rows)
  if (rows !== previousRows) {
    setPreviousRows(rows)
    setPage(0)
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleRows = rows.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  )
  const start = rows.length === 0 ? 0 : currentPage * pageSize + 1
  return {
    page: currentPage,
    setPage,
    visibleRows,
    start,
    end: start + visibleRows.length - 1,
    pageCount,
  }
}

function Pagination({
  end,
  onNext,
  onPrevious,
  page,
  pageCount,
  start,
  total,
}: {
  end: number
  onNext: () => void
  onPrevious: () => void
  page: number
  pageCount: number
  start: number
  total: number
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p
        aria-live="polite"
        className="m-0 text-xs text-muted-foreground"
        role="status"
      >
        Showing {start}–{end} of {total}
      </p>
      <div className="flex gap-2">
        <Button
          aria-label="Previous page"
          disabled={page === 0}
          onClick={onPrevious}
          size="sm"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          aria-label="Next page"
          disabled={page >= pageCount - 1}
          onClick={onNext}
          size="sm"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return <p className="m-0 text-sm text-muted-foreground">{message}</p>
}
function statusLabel(
  status: AnalyticsViews['retentionMap']['rows'][number]['status'],
) {
  return status === 'on-target'
    ? 'On target now'
    : status === 'watch'
      ? 'Watch'
      : 'Needs attention'
}
function statusColor(
  status: AnalyticsViews['retentionMap']['rows'][number]['status'],
) {
  return status === 'on-target'
    ? 'var(--cp-analytics-healthy)'
    : status === 'watch'
      ? 'var(--cp-analytics-attention)'
      : 'var(--cp-analytics-risk)'
}
function regionLabel(
  region: AnalyticsViews['retentionMap']['rows'][number]['region'],
) {
  return region.replaceAll('-', ' ')
}
function formatDuration(value: number) {
  return `${Number(value.toFixed(1))}d`
}
function formatGap(value: number) {
  return `${value >= 0 ? '+' : '−'}${Math.round(Math.abs(value) * 100)} pp`
}
function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: '2-digit',
  }).format(new Date(value))
}
