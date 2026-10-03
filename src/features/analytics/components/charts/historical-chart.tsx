import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from 'recharts'

import { ChartContainer } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'

import type { AnalyticsScale } from '../../domain/analytics-scales'
import {
  buildHistoricalChartModel,
  historicalGroupingLabel,
  nearestHistoricalRowIndex,
  sparseHistoricalYTicks,
} from './historical-chart-model'
import type {
  HistoricalChartRow,
  HistoricalChartTimeFrame,
  PositionedHistoricalRow,
} from './historical-chart-model'

export type {
  HistoricalChartTimeFrame,
  PositionedHistoricalRow,
} from './historical-chart-model'

export interface HistoricalYAxis {
  id?: string
  label: string
  scale: AnalyticsScale
  format: (value: number) => string
  orientation?: 'left' | 'right'
  padding?: { top: number; bottom: number }
  width?: number
}

export interface HistoricalChartProps<Row extends HistoricalChartRow> {
  rows: readonly Row[]
  timeFrame?: HistoricalChartTimeFrame | undefined
  name: string
  description: string
  config: ChartConfig
  yAxes: readonly HistoricalYAxis[]
  tooltip: (row: Row) => ReactNode
  children: (
    rows: PositionedHistoricalRow<Row>[],
    selectedRow: PositionedHistoricalRow<Row> | null,
    tooltipVisible: boolean,
  ) => ReactNode
  height?: number
  initialIndex?: number
  inspectionResetKey?: string
  chartRoleDescription?: string
  startAtFirstPoint?: boolean
}

export function HistoricalChart<Row extends HistoricalChartRow>({
  rows,
  timeFrame,
  name,
  description,
  config,
  yAxes,
  tooltip,
  children,
  height = 288,
  initialIndex = 0,
  inspectionResetKey = '',
  chartRoleDescription,
  startAtFirstPoint = false,
}: HistoricalChartProps<Row>) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const descriptionId = useId()
  const rowKey = rows
    .map((row) => `${row.id}:${row.bucketStart}:${row.bucketEnd}`)
    .join('|')
  const [inspection, setInspection] = useState({
    key: rowKey,
    index: initialIndex,
    visible: false,
    resetKey: inspectionResetKey,
  })
  const index = Math.max(
    0,
    Math.min(
      inspection.key === rowKey ? inspection.index : initialIndex,
      rows.length - 1,
    ),
  )
  const visible =
    inspection.key === rowKey &&
    inspection.resetKey === inspectionResetKey &&
    inspection.visible &&
    rows.length > 0
  const model = buildHistoricalChartModel(
    rows,
    timeFrame,
    640,
    startAtFirstPoint,
  )
  const selectedRow = model.rows[index] ?? null
  const select = useCallback(
    (nextIndex: number, nextVisible = true) =>
      setInspection({
        key: rowKey,
        index: Math.max(0, Math.min(rows.length - 1, nextIndex)),
        visible: nextVisible,
        resetKey: inspectionResetKey,
      }),
    [rowKey, rows.length, inspectionResetKey],
  )

  useEffect(() => {
    if (!visible) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') select(index, false)
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [index, select, visible])

  return (
    <ChartContainer
      accessibleName={name}
      aria-label={name}
      className="cp-historical-chart aspect-auto min-h-48 [&_.recharts-cartesian-axis-tick_text]:text-xs [&_.recharts-cartesian-axis-tick_text]:font-medium"
      config={config}
      initialDimension={{ width: 640, height }}
      ref={setHost}
      style={{ height }}
    >
      <ComposedChart
        accessibilityLayer={false}
        aria-describedby={descriptionId}
        aria-label={name}
        aria-roledescription={chartRoleDescription}
        data={model.rows}
        margin={{ bottom: 6, left: 0, right: 0, top: 32 }}
        role="img"
      >
        <desc id={descriptionId}>{description}</desc>
        <HistoricalXAxis
          rows={rows}
          startAtFirstPoint={startAtFirstPoint}
          timeFrame={timeFrame}
        />
        {yAxes.map((axis) => (
          <YAxis
            allowDataOverflow
            axisLine={false}
            domain={[...axis.scale.domain]}
            key={axis.id ?? 'primary'}
            orientation={axis.orientation ?? 'left'}
            padding={axis.padding ?? { top: 8, bottom: 10 }}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
            tickFormatter={axis.format}
            tickLine={false}
            tickMargin={10}
            ticks={sparseHistoricalYTicks(axis.scale.ticks)}
            width={axis.width ?? (axis.orientation === 'right' ? 50 : 64)}
            yAxisId={axis.id ?? 0}
          />
        ))}
        <HistoricalGrid axes={yAxes} />
        {children(model.rows, selectedRow, visible)}
        <HistoricalInspection
          host={host}
          index={index}
          name={name}
          onSelect={select}
          rows={model.rows}
          tooltip={tooltip}
          visible={visible}
        />
      </ComposedChart>
    </ChartContainer>
  )
}

function HistoricalXAxis<Row extends HistoricalChartRow>({
  rows,
  timeFrame,
  startAtFirstPoint,
}: {
  rows: readonly Row[]
  timeFrame?: HistoricalChartTimeFrame | undefined
  startAtFirstPoint: boolean
}) {
  const plot = usePlotArea()
  const model = buildHistoricalChartModel(
    rows,
    timeFrame,
    plot?.width ?? 576,
    startAtFirstPoint,
  )
  return (
    <XAxis
      allowDataOverflow
      axisLine={false}
      dataKey="x"
      domain={model.domain}
      height={50}
      interval={0}
      padding={{
        left: startAtFirstPoint && rows.length > 1 ? 12 : 0,
        right: 0,
      }}
      label={{
        value: `Local date · ${historicalGroupingLabel(timeFrame).toLowerCase()}`,
        position: 'insideBottom',
        offset: -2,
        fontSize: 11,
        fill: 'var(--color-muted-foreground)',
      }}
      scale="linear"
      tick={({ x, y, payload }) => (
        <text
          fill="var(--color-muted-foreground)"
          fontSize={12}
          fontWeight={500}
          textAnchor={
            payload.value === model.ticks[0]
              ? 'start'
              : payload.value === model.ticks.at(-1)
                ? 'end'
                : 'middle'
          }
          x={x}
          y={Number(y) + 14}
        >
          {model.formatTick(Number(payload.value))}
        </text>
      )}
      tickLine={false}
      ticks={model.ticks}
      type="number"
    />
  )
}

function HistoricalGrid({ axes }: { axes: readonly HistoricalYAxis[] }) {
  const plot = usePlotArea()
  const firstAxis = axes[0]
  const yScale = useYAxisScale(firstAxis?.id ?? 0)
  const labelRefs = useRef<Array<SVGTextElement | null>>([])
  const [labelWidths, setLabelWidths] = useState<number[]>([])
  const labelKey = axes.map((axis) => axis.label).join('|')
  useLayoutEffect(() => {
    const measured = labelRefs.current.map((label) =>
      label && typeof label.getComputedTextLength === 'function'
        ? label.getComputedTextLength()
        : (label?.textContent?.length ?? 0) * 7,
    )
    setLabelWidths((current) =>
      current.length === measured.length &&
      current.every((width, index) => width === measured[index])
        ? current
        : measured,
    )
  }, [labelKey, plot?.width])
  if (!plot || !yScale || !firstAxis) return null
  const leftWidth = Math.max(
    0,
    ...axes.map((axis, index) =>
      axis.orientation !== 'right'
        ? (labelWidths[index] ?? axis.label.length * 7)
        : 0,
    ),
  )
  const rightWidth = Math.max(
    0,
    ...axes.map((axis, index) =>
      axis.orientation === 'right'
        ? (labelWidths[index] ?? axis.label.length * 7)
        : 0,
    ),
  )
  const staggerHeaders =
    leftWidth > 0 && rightWidth > 0 && leftWidth + rightWidth + 20 > plot.width
  return (
    <g aria-hidden="true" data-testid="historical-chart-grid">
      {sparseHistoricalYTicks(firstAxis.scale.ticks).map((tick) => {
        const y = yScale(tick)
        return y === undefined ? null : (
          <line
            key={tick}
            stroke="var(--color-border)"
            strokeOpacity={0.55}
            x1={plot.x}
            x2={plot.x + plot.width}
            y1={y}
            y2={y}
          />
        )
      })}
      {axes.map((axis, index) => (
        <text
          fill="var(--color-muted-foreground)"
          fontSize={12}
          fontWeight={600}
          key={axis.id ?? 'primary'}
          ref={(label) => {
            labelRefs.current[index] = label
          }}
          textAnchor={axis.orientation === 'right' ? 'end' : 'start'}
          x={axis.orientation === 'right' ? plot.x + plot.width : plot.x}
          y={
            plot.y -
            (staggerHeaders ? (axis.orientation === 'right' ? 6 : 20) : 14)
          }
        >
          {axis.label}
        </text>
      ))}
    </g>
  )
}

function HistoricalInspection<Row extends HistoricalChartRow>({
  host,
  rows,
  index,
  visible,
  name,
  onSelect,
  tooltip,
}: {
  host: HTMLDivElement | null
  rows: readonly PositionedHistoricalRow<Row>[]
  index: number
  visible: boolean
  name: string
  onSelect: (index: number, visible?: boolean) => void
  tooltip: (row: Row) => ReactNode
}) {
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  const instructionsId = useId()
  const tooltipId = useId()
  const [announce, setAnnounce] = useState(false)
  if (!host || !plot || !xScale || rows.length === 0) return null
  const selected = rows[index] ?? rows[0]!
  const anchor = xScale(selected.x)
  const hostWidth =
    host.getBoundingClientRect().width || plot.x + plot.width + 50
  const tooltipWidth = Math.min(288, Math.max(0, hostWidth - 16))
  const pointerSelect = (event: PointerEvent<HTMLButtonElement>) => {
    setAnnounce(false)
    const bounds = event.currentTarget.getBoundingClientRect()
    const x =
      plot.x +
      ((event.clientX - bounds.left) / (bounds.width || plot.width)) *
        plot.width
    const pixelRows = rows.map((row) => ({ x: xScale(row.x) ?? plot.x }))
    onSelect(nearestHistoricalRowIndex(pixelRows, x))
  }
  const controlStyle: CSSProperties = {
    position: 'absolute',
    left: plot.x,
    top: plot.y,
    width: plot.width,
    height: plot.height,
    background: 'transparent',
    touchAction: 'pan-y',
  }
  return (
    <>
      {anchor !== undefined ? (
        <line
          aria-hidden="true"
          data-testid="historical-chart-selected-guide"
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
            Use Left and Right arrows to inspect each period. Press Escape to
            hide details.
          </span>
          <button
            aria-describedby={`${instructionsId}${visible ? ` ${tooltipId}` : ''}`}
            aria-label={`Inspect ${name}`}
            className="z-10 m-0 cursor-crosshair rounded-sm border-0 p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onBlur={() => onSelect(index, false)}
            onFocus={() => {
              setAnnounce(true)
              onSelect(index)
            }}
            onKeyDown={(event) => {
              setAnnounce(true)
              if (event.key === 'Escape') onSelect(index, false)
              else if (
                event.key === 'ArrowLeft' ||
                event.key === 'ArrowRight'
              ) {
                event.preventDefault()
                onSelect(index + (event.key === 'ArrowLeft' ? -1 : 1))
              } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault()
                onSelect(event.key === 'Home' ? 0 : rows.length - 1)
              } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(index)
              }
            }}
            onPointerDown={(event) => {
              // Focus first, so the focus preview cannot overwrite this tap's
              // nearest-row selection with the previously selected period.
              event.currentTarget.focus()
              pointerSelect(event)
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== 'touch') onSelect(index, false)
            }}
            onPointerMove={pointerSelect}
            style={controlStyle}
            type="button"
          />
          <div
            aria-live={announce ? 'polite' : 'off'}
            className="pointer-events-none absolute z-20 text-xs tabular-nums"
            style={{
              left: Math.max(
                8,
                Math.min((anchor ?? plot.x) + 14, hostWidth - tooltipWidth - 8),
              ),
              top: plot.y + 8,
              width: tooltipWidth,
            }}
          >
            {visible ? (
              <div id={tooltipId} role="tooltip">
                {tooltip(selected)}
              </div>
            ) : null}
          </div>
        </>,
        host,
      )}
    </>
  )
}
