import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  CartesianGrid,
  ScatterChart,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  useXAxisInverseScale,
  useYAxisInverseScale,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { ChartContainer } from '@/components/ui/chart'
import { createLeetCodeProblemUrl } from '@/lib/leetcode'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { formatCount, formatPercent } from './charts/chart-shared'
import {
  boxViewport,
  containsRow,
  durationTicks,
  formatDate,
  formatDuration,
  formatGap,
  fullViewport,
  panViewport,
  recallTicks,
  revealRow,
  statusColor,
  statusLabel,
  zoomViewport,
  type PlotPoint,
  type RetentionRow,
  type RetentionViewport,
} from './retention-map-model'

type Selection = { slug: string; candidates: string[] } | null

export function RetentionMapChart({
  rows,
  timeZone,
  view,
}: {
  rows: RetentionRow[]
  timeZone: string
  view: AnalyticsViews['retentionMap']
}) {
  const full = fullViewport(view)
  const domainKey = `${full.duration.join(',')}:${full.recall.join(',')}`
  const [storedViewport, setViewport] = useState({
    key: domainKey,
    value: full,
  })
  const viewport =
    storedViewport.key === domainKey ? storedViewport.value : full
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [hoverSlug, setHoverSlug] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const inspectionRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const regionRef = useRef<HTMLDivElement>(null)
  const cancelGestureRef = useRef<(() => boolean) | null>(null)
  const beforeClick = useRef<Selection>(null)
  const summaryId = useId()
  const detailsId = useId()
  const activeIndex = Math.max(
    0,
    rows.findIndex((row) => row.slug === activeSlug),
  )
  const pinned = rows.find((row) => row.slug === selection?.slug)
  const candidates = rows.filter((row) =>
    selection?.candidates.includes(row.slug),
  )
  const preview = !selection
    ? rows.find((row) => row.slug === hoverSlug)
    : undefined
  const visibleCount = rows.filter((row) => containsRow(viewport, row)).length
  const updateViewport = (value: RetentionViewport) =>
    setViewport({ key: domainKey, value })

  const dismiss = useCallback(() => {
    setSelection(null)
    setHoverSlug(null)
    if (!inspectionRef.current?.closest('[hidden]'))
      inspectionRef.current?.focus({ preventScroll: true })
  }, [])

  if (selection && !rows.some((row) => row.slug === selection.slug))
    setSelection(null)

  useEffect(() => {
    if (!selection) return
    closeRef.current?.focus({ preventScroll: true })
  }, [selection])

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (cancelGestureRef.current?.()) {
        event.preventDefault()
        return
      }
      if (selection || hoverSlug) dismiss()
    }
    const outside = (event: PointerEvent) => {
      const scope =
        regionRef.current?.closest('.cp-retention-map') ?? regionRef.current
      if (
        selection &&
        event.target instanceof Node &&
        !scope?.contains(event.target)
      )
        dismiss()
    }
    document.addEventListener('keydown', escape)
    document.addEventListener('pointerdown', outside, true)
    return () => {
      document.removeEventListener('keydown', escape)
      document.removeEventListener('pointerdown', outside, true)
    }
  }, [selection, hoverSlug, dismiss])

  function select(index: number) {
    const row = rows[index]
    if (!row) return
    setActiveSlug(row.slug)
    setHoverSlug(row.slug)
    updateViewport(revealRow(viewport, full, row))
  }

  function pin(slugs: string[], clickDetail?: number) {
    if (clickDetail !== undefined && clickDetail !== 2)
      beforeClick.current = selection
    if (!slugs[0] || clickDetail === 2) return
    const slug = slugs[0]
    setActiveSlug(slug)
    setHoverSlug(null)
    setSelection(
      selection?.slug === slug && slugs.length === 1
        ? null
        : { slug, candidates: slugs.length > 1 ? slugs : [] },
    )
  }

  return (
    <div className="grid min-w-0 gap-3" ref={regionRef}>
      <div className="cp-retention-references">
        <span>
          FSRS scheduling target{' '}
          <strong>{formatPercent(view.targetRetention)}</strong>
        </span>
        <span>
          Durability benchmark <strong>7d</strong>
        </span>
      </div>
      <p className="sr-only" id={summaryId}>
        Scope: active, non-suspended, reviewed problems with eligible current
        FSRS data. Memory durability is the total modeled interval from the
        latest review to crossing the scheduling target, not remaining time or a
        due-date prediction. Estimated recall now is model-estimated, not
        observed recall. The watch band spans 10 percentage points below target.
        The vertical reference is 7 days. Use arrows, Home and End to inspect
        every filtered question; Enter or Space pins details. Drag a box to
        magnify; Shift-drag pans. Wheel or touch pinch zooms; double-click
        resets the full landscape. Escape cancels a gesture or closes
        inspection.
      </p>
      <div className="cp-retention-plot-host" ref={setHost}>
        <p className="cp-retention-y-title">Estimated recall now (%)</p>
        <ChartContainer
          accessibleName="Retention Map chart"
          aria-describedby={summaryId}
          aria-label="Retention Map chart"
          aria-roledescription="interactive scatter plot"
          className="aspect-auto h-80"
          config={{}}
          initialDimension={{ width: 640, height: 320 }}
          role="region"
        >
          <ScatterChart
            accessibilityLayer={false}
            margin={{ left: 0, right: 12, top: 12, bottom: 12 }}
          >
            <CartesianGrid
              stroke="var(--color-border)"
              strokeOpacity={0.45}
              vertical={false}
            />
            <XAxis
              allowDataOverflow
              axisLine={false}
              dataKey="targetDurationDays"
              domain={viewport.duration}
              padding={{ left: 8, right: 8 }}
              scale="log"
              tickFormatter={formatDuration}
              tickLine={false}
              ticks={durationTicks(viewport.duration)}
              type="number"
            />
            <YAxis
              allowDataOverflow
              axisLine={false}
              dataKey="retrievability"
              domain={viewport.recall}
              padding={{ top: 8, bottom: 8 }}
              tickFormatter={formatPercent}
              tickLine={false}
              ticks={recallTicks(viewport.recall)}
              type="number"
              width={44}
            />
            <RetentionPlot
              activeSlug={selection?.slug ?? hoverSlug}
              cancelGestureRef={cancelGestureRef}
              controlRef={inspectionRef}
              detailsId={detailsId}
              full={full}
              host={host}
              onHover={(slug) => {
                if (!selection) {
                  setHoverSlug(slug)
                  if (slug) setActiveSlug(slug)
                }
              }}
              onPin={pin}
              onReset={() => {
                updateViewport(full)
                setSelection(beforeClick.current)
              }}
              onSelect={select}
              onViewport={updateViewport}
              pinned={!!selection}
              rows={rows}
              selectedIndex={activeIndex}
              summaryId={summaryId}
              target={view.targetRetention}
              viewport={viewport}
            />
          </ScatterChart>
        </ChartContainer>
        <p className="cp-retention-x-title">Memory durability (days, log)</p>
      </div>
      <div className="cp-retention-view-controls">
        <p className="m-0 text-xs text-muted-foreground">
          {formatCount(visibleCount)} in view · {formatCount(rows.length)}{' '}
          matching · {formatCount(view.totalEligible)} eligible
        </p>
        <div className="flex gap-1">
          <Button
            aria-label="Zoom in"
            onClick={() => updateViewport(zoomViewport(viewport, full, 1.5))}
            size="sm"
            variant="outline"
          >
            +
          </Button>
          <Button
            aria-label="Zoom out"
            onClick={() =>
              updateViewport(zoomViewport(viewport, full, 1 / 1.5))
            }
            size="sm"
            variant="outline"
          >
            −
          </Button>
          <Button
            onClick={() => updateViewport(full)}
            size="sm"
            variant="outline"
          >
            Reset view
          </Button>
        </div>
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        Drag a box to magnify · Double-click to reset · Shift-drag to pan
      </p>
      {candidates.length > 1 ? (
        <div
          aria-label="Choose a nearby memory"
          className="cp-retention-details"
          id={detailsId}
          role="dialog"
        >
          <div className="flex items-start justify-between gap-2">
            <strong>
              {formatCount(candidates.length)} memories near this point
            </strong>
            <Button
              aria-label="Close nearby memories"
              onClick={dismiss}
              ref={closeRef}
              size="sm"
              variant="ghost"
            >
              Close
            </Button>
          </div>
          <div className="cp-retention-candidates">
            {candidates.map((row) => (
              <Button
                key={row.slug}
                onClick={() => setSelection({ slug: row.slug, candidates: [] })}
                variant="outline"
              >
                <span className="min-w-0 text-left">
                  {row.title}
                  <span className="block text-xs text-muted-foreground">
                    {statusLabel(row.status)} ·{' '}
                    {formatPercent(row.retrievability)} ·{' '}
                    {formatDuration(row.targetDurationDays)}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </div>
      ) : pinned ? (
        <div
          aria-label={`${pinned.title} memory details`}
          className="cp-retention-details"
          id={detailsId}
          role="dialog"
        >
          <div className="flex items-start justify-between gap-2">
            <a
              className="break-words font-semibold text-primary hover:underline"
              href={createLeetCodeProblemUrl(pinned.slug)}
              rel="noopener noreferrer"
              target="_blank"
            >
              {pinned.title}
            </a>
            <Button
              aria-label={`Close ${pinned.title} memory details`}
              onClick={dismiss}
              ref={closeRef}
              size="sm"
              variant="ghost"
            >
              Close
            </Button>
          </div>
          <RetentionDetails row={pinned} timeZone={timeZone} />
        </div>
      ) : preview ? (
        <div aria-live="polite" className="cp-retention-preview" role="status">
          <strong>{preview.title}</strong> · {statusLabel(preview.status)} ·{' '}
          {formatPercent(preview.retrievability)} estimated recall ·{' '}
          {formatDuration(preview.targetDurationDays)} durability. Click or
          press Enter for details.
        </div>
      ) : null}
    </div>
  )
}

interface PlotProps {
  activeSlug: string | null | undefined
  cancelGestureRef: RefObject<(() => boolean) | null>
  controlRef: RefObject<HTMLButtonElement | null>
  detailsId: string
  full: RetentionViewport
  host: HTMLDivElement | null
  onHover: (slug: string | null) => void
  onPin: (slugs: string[], clickDetail?: number) => void
  onReset: () => void
  onSelect: (index: number) => void
  onViewport: (viewport: RetentionViewport) => void
  pinned: boolean
  rows: RetentionRow[]
  selectedIndex: number
  summaryId: string
  target: number
  viewport: RetentionViewport
}

function RetentionPlot({
  activeSlug,
  cancelGestureRef,
  controlRef,
  detailsId,
  full,
  host,
  onHover,
  onPin,
  onReset,
  onSelect,
  onViewport,
  pinned,
  rows,
  selectedIndex,
  summaryId,
  target,
  viewport,
}: PlotProps) {
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  const yScale = useYAxisScale()
  const inverseX = useXAxisInverseScale()
  const inverseY = useYAxisInverseScale()
  const clipId = useId()
  const [box, setBox] = useState<{ start: PlotPoint; end: PlotPoint } | null>(
    null,
  )
  const gesture = useRef<{
    mode: 'box' | 'pan' | 'touch'
    start: PlotPoint
    viewport: RetentionViewport
    moved: boolean
    distance: number | undefined
    anchor: PlotPoint | undefined
  } | null>(null)
  const touches = useRef(new Map<number, PlotPoint>())
  const suppressClick = useRef(false)
  const pointerFocusRef = useRef(false)
  const anchorAt = useCallback(
    (point: PlotPoint, current: RetentionViewport): PlotPoint => ({
      x: Math.max(
        0,
        Math.min(
          1,
          Math.log(Number(inverseX?.(point.x)) / current.duration[0]) /
            Math.log(current.duration[1] / current.duration[0]),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          1,
          (Number(inverseY?.(point.y)) - current.recall[0]) /
            (current.recall[1] - current.recall[0]),
        ),
      ),
    }),
    [inverseX, inverseY],
  )
  const cancel = useCallback(() => {
    const wasActive = gesture.current !== null
    gesture.current = null
    touches.current.clear()
    pointerFocusRef.current = false
    setBox(null)
    if (wasActive) suppressClick.current = true
    return wasActive
  }, [])

  useEffect(() => {
    cancelGestureRef.current = cancel
    window.addEventListener('blur', cancel)
    return () => {
      cancelGestureRef.current = null
      window.removeEventListener('blur', cancel)
    }
  }, [cancel, cancelGestureRef])

  useEffect(() => {
    if (!host) return
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => cancel())
    observer?.observe(host)
    window.addEventListener('resize', cancel)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', cancel)
    }
  }, [host, cancel])

  useEffect(() => {
    const control = controlRef.current
    if (!control || !plot) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      cancel()
      const rect = control.getBoundingClientRect()
      const x = Math.max(
        0,
        Math.min(1, (event.clientX - rect.left) / (rect.width || plot.width)),
      )
      const y =
        1 -
        Math.max(
          0,
          Math.min(
            1,
            (event.clientY - rect.top) / (rect.height || plot.height),
          ),
        )
      onViewport(
        zoomViewport(
          viewport,
          full,
          Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.005),
          anchorAt(
            { x: plot.x + x * plot.width, y: plot.y + (1 - y) * plot.height },
            viewport,
          ),
        ),
      )
    }
    control.addEventListener('wheel', wheel, { passive: false })
    return () => control.removeEventListener('wheel', wheel)
  }, [controlRef, plot, viewport, full, onViewport, cancel, anchorAt])

  if (!plot || !xScale || !yScale || !inverseX || !inverseY) return null
  const dataWidth = Math.abs(
    (xScale(viewport.duration[1]) ?? plot.x + plot.width) -
      (xScale(viewport.duration[0]) ?? plot.x),
  )
  const dataHeight = Math.abs(
    (yScale(viewport.recall[1]) ?? plot.y) -
      (yScale(viewport.recall[0]) ?? plot.y + plot.height),
  )
  const points = rows
    .filter((row) => containsRow(viewport, row))
    .flatMap((row) => {
      const x = xScale(row.targetDurationDays),
        y = yScale(row.retrievability)
      return x === undefined || y === undefined ? [] : [{ row, x, y }]
    })
  const ordered = points.toSorted((a, b) => {
    const priority = (row: RetentionRow) =>
      row.slug === activeSlug
        ? 3
        : row.status === 'on-target'
          ? 0
          : row.status === 'watch'
            ? 1
            : 2
    return priority(a.row) - priority(b.row)
  })
  const pointAt = (clientX: number, clientY: number): PlotPoint => {
    const rect = controlRef.current?.getBoundingClientRect()
    return {
      x:
        plot.x +
        Math.max(
          0,
          Math.min(
            plot.width,
            ((clientX - (rect?.left ?? 0)) * plot.width) /
              (rect?.width || plot.width),
          ),
        ),
      y:
        plot.y +
        Math.max(
          0,
          Math.min(
            plot.height,
            ((clientY - (rect?.top ?? 0)) * plot.height) /
              (rect?.height || plot.height),
          ),
        ),
    }
  }
  const nearby = (point: PlotPoint) =>
    points
      .map((item) => ({
        ...item,
        distance: Math.hypot(item.x - point.x, item.y - point.y),
      }))
      .toSorted((a, b) => a.distance - b.distance || a.row.rank - b.row.rank)
  const touchGeometry = () => {
    const [a, b] = [...touches.current.values()]
    return a && b
      ? {
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        }
      : null
  }
  const clampY = (value: number) =>
    Math.max(plot.y, Math.min(plot.y + plot.height, yScale(value) ?? plot.y))
  const bands = [
    {
      lower: viewport.recall[0],
      upper: Math.min(viewport.recall[1], Math.max(0, target - 0.1)),
      status: 'needs-attention' as const,
    },
    {
      lower: Math.max(viewport.recall[0], Math.max(0, target - 0.1)),
      upper: Math.min(viewport.recall[1], target),
      status: 'watch' as const,
    },
    {
      lower: Math.max(viewport.recall[0], target),
      upper: viewport.recall[1],
      status: 'on-target' as const,
    },
  ]

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect height={plot.height} width={plot.width} x={plot.x} y={plot.y} />
        </clipPath>
      </defs>
      <g aria-hidden="true" clipPath={`url(#${clipId})`}>
        {bands
          .filter((band) => band.upper > band.lower)
          .map((band) => (
            <rect
              fill={statusColor(band.status)}
              fillOpacity={0.055}
              height={clampY(band.lower) - clampY(band.upper)}
              key={band.status}
              width={plot.width}
              x={plot.x}
              y={clampY(band.upper)}
            />
          ))}
        {target >= viewport.recall[0] && target <= viewport.recall[1] ? (
          <line
            stroke="var(--cp-analytics-target)"
            strokeDasharray="5 5"
            x1={plot.x}
            x2={plot.x + plot.width}
            y1={yScale(target)}
            y2={yScale(target)}
          />
        ) : null}
        {7 >= viewport.duration[0] && 7 <= viewport.duration[1] ? (
          <line
            stroke="var(--cp-analytics-target)"
            strokeDasharray="3 5"
            strokeOpacity={0.7}
            x1={xScale(7)}
            x2={xScale(7)}
            y1={plot.y}
            y2={plot.y + plot.height}
          />
        ) : null}
        {ordered.map(({ row, x, y }) => (
          <g
            data-retention-map-point={row.slug}
            data-status={row.status}
            key={row.slug}
            opacity={
              row.status === 'on-target' && row.slug !== activeSlug ? 0.5 : 1
            }
          >
            <PointMark row={row} x={x} y={y} />
            {row.slug === activeSlug ? (
              <circle
                cx={x}
                cy={y}
                fill="none"
                r={9}
                stroke="var(--color-foreground)"
                strokeWidth={1.5}
              />
            ) : null}
          </g>
        ))}
        {box ? (
          <rect
            fill="var(--color-primary)"
            fillOpacity={0.1}
            height={Math.abs(box.end.y - box.start.y)}
            stroke="var(--color-primary)"
            strokeDasharray="4 3"
            width={Math.abs(box.end.x - box.start.x)}
            x={Math.min(box.start.x, box.end.x)}
            y={Math.min(box.start.y, box.end.y)}
          />
        ) : null}
      </g>
      {host
        ? createPortal(
            <button
              aria-controls={detailsId}
              aria-describedby={summaryId}
              aria-expanded={pinned}
              aria-label="Inspect Retention Map. Arrow keys, Home and End select questions; Enter pins details."
              className="cp-retention-inspection"
              disabled={rows.length === 0}
              onBlur={cancel}
              onClick={(event) => {
                if (suppressClick.current) {
                  suppressClick.current = false
                  return
                }
                const items = nearby(
                  pointAt(event.clientX, event.clientY),
                ).filter((item) => item.distance <= 18)
                onPin(
                  items.map((item) => item.row.slug),
                  event.detail,
                )
              }}
              onDoubleClick={(event) => {
                event.preventDefault()
                cancel()
                suppressClick.current = false
                onReset()
              }}
              onFocus={() => {
                if (!pointerFocusRef.current) onSelect(selectedIndex)
              }}
              onKeyDown={(event) => {
                let index = selectedIndex
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
                  index = Math.min(rows.length - 1, index + 1)
                else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
                  index = Math.max(0, index - 1)
                else if (event.key === 'Home') index = 0
                else if (event.key === 'End') index = rows.length - 1
                else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  const row = rows[index]
                  if (row) onPin([row.slug])
                  return
                } else return
                event.preventDefault()
                onSelect(index)
              }}
              onLostPointerCapture={(event) => {
                if (
                  touches.current.has(event.pointerId) ||
                  gesture.current?.mode !== 'touch'
                )
                  cancel()
              }}
              onPointerCancel={cancel}
              onPointerDown={(event) => {
                if (event.pointerType !== 'touch' && event.button !== 0) return
                pointerFocusRef.current = true
                const point = pointAt(event.clientX, event.clientY)
                suppressClick.current = false
                event.currentTarget.setPointerCapture?.(event.pointerId)
                if (event.pointerType === 'touch') {
                  touches.current.set(event.pointerId, point)
                  const geometry = touchGeometry()
                  gesture.current = {
                    mode: 'touch',
                    start: geometry?.center ?? point,
                    viewport,
                    moved: !!geometry,
                    distance: geometry?.distance,
                    anchor: geometry
                      ? anchorAt(geometry.center, viewport)
                      : undefined,
                  }
                } else
                  gesture.current = {
                    mode: event.shiftKey ? 'pan' : 'box',
                    start: point,
                    viewport,
                    moved: false,
                    distance: undefined,
                    anchor: undefined,
                  }
                onHover(null)
              }}
              onPointerLeave={() => {
                if (!gesture.current) onHover(null)
              }}
              onPointerMove={(event) => {
                const point = pointAt(event.clientX, event.clientY),
                  current = gesture.current
                if (!current) {
                  onHover(nearby(point)[0]?.row.slug ?? null)
                  return
                }
                if (event.pointerType === 'touch')
                  touches.current.set(event.pointerId, point)
                const geometry = touchGeometry()
                const endpoint = geometry?.center ?? point
                const dx = endpoint.x - current.start.x,
                  dy = endpoint.y - current.start.y
                current.moved ||= Math.hypot(dx, dy) > 4 || !!geometry
                if (current.mode === 'box') {
                  if (current.moved)
                    setBox({ start: current.start, end: point })
                  return
                }
                if (!current.moved) return
                const zoomed =
                  geometry && current.distance
                    ? zoomViewport(
                        current.viewport,
                        full,
                        geometry.distance / current.distance,
                        current.anchor,
                      )
                    : current.viewport
                onViewport(
                  panViewport(zoomed, full, -dx / dataWidth, dy / dataHeight),
                )
              }}
              onPointerUp={(event) => {
                const current = gesture.current
                if (!current) return
                const point = pointAt(event.clientX, event.clientY)
                if (current.mode === 'box' && current.moved) {
                  const fitted = boxViewport(
                    current.viewport,
                    full,
                    plot.width,
                    plot.height,
                    current.start,
                    point,
                    inverseX,
                    inverseY,
                  )
                  if (fitted) onViewport(fitted)
                }
                suppressClick.current = current.moved
                pointerFocusRef.current = false
                gesture.current = null
                touches.current.delete(event.pointerId)
                const remaining = [...touches.current.values()][0]
                if (remaining)
                  gesture.current = {
                    mode: 'touch',
                    start: remaining,
                    viewport,
                    moved: true,
                    distance: undefined,
                    anchor: undefined,
                  }
                setBox(null)
                event.currentTarget.releasePointerCapture?.(event.pointerId)
              }}
              ref={controlRef}
              style={{
                left: plot.x,
                top: plot.y + 24,
                width: plot.width,
                height: plot.height,
              }}
              type="button"
            >
              <span className="sr-only">Inspect questions</span>
            </button>,
            host,
          )
        : null}
    </>
  )
}

function PointMark({ row, x, y }: { row: RetentionRow; x: number; y: number }) {
  const fill = statusColor(row.status)
  return row.status === 'watch' ? (
    <polygon
      fill={fill}
      points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`}
    />
  ) : row.status === 'needs-attention' ? (
    <polygon
      fill={fill}
      points={`${x},${y - 6} ${x + 6},${y + 5} ${x - 6},${y + 5}`}
    />
  ) : (
    <circle cx={x} cy={y} fill={fill} r={4.5} />
  )
}

function RetentionDetails({
  row,
  timeZone,
}: {
  row: RetentionRow
  timeZone: string
}) {
  const details = [
    ['Status', statusLabel(row.status)],
    ['Estimated recall now', formatPercent(row.retrievability)],
    ['FSRS scheduling target', formatPercent(row.targetRetention)],
    ['Target gap', formatGap(row.targetGap)],
    ['Memory durability', formatDuration(row.targetDurationDays)],
    ['Last reviewed', formatDate(row.lastReviewedAt, timeZone)],
    ['Due', formatDate(row.dueAt, timeZone)],
    ['Difficulty', row.difficulty.toFixed(1)],
    ['Lapses', formatCount(row.lapseCount)],
  ]
  return (
    <dl className="cp-retention-detail-values">
      {details.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="m-0 tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
