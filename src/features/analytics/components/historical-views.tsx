import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart,
  XAxis,
  YAxis,
  usePlotArea,
  useYAxisScale,
} from 'recharts'

import { ChartTable } from '@/components/ui/chart-table'
import { ChartContainer } from '@/components/ui/chart'
import type { AnalyticsViews } from '../api/analytics-contracts'
import { formatCount, formatPercent } from './charts/chart-shared'

export { ObservedRecallVsFsrsView } from './recall-ratings-views'
export { MemoryStrengthView } from './memory-practice-views'
export { PracticeRatingsView } from './practice-ratings-view'
export { NewProblemSuccessView } from './new-problem-success-view'

type TopicRow = AnalyticsViews['topicPerformance']['rows'][number]
const topicSlot = 96
const chartHeight = 340

export function TopicPerformanceView({
  selectedPeriod,
  targetReviewSuccess,
  targetEditor,
  view,
}: {
  selectedPeriod: string
  targetReviewSuccess: number
  targetEditor?: ReactNode
  view: AnalyticsViews['topicPerformance']
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Review Success · 0%–100%</span>
        {targetEditor ?? (
          <span>
            Target Review Success {formatPercent(targetReviewSuccess)}
          </span>
        )}
      </div>
      <ChartTable
        chart={
          view.rows.length ? (
            <TopicPerformanceChart
              rows={view.rows}
              selectedPeriod={selectedPeriod}
              target={targetReviewSuccess}
            />
          ) : (
            <Empty message="No topic has at least 10 valid ratings across 3 reviewed problems in this period." />
          )
        }
        table={
          <TopicPerformanceTable
            rows={view.rows}
            target={targetReviewSuccess}
          />
        }
      />
      <p className="m-0 text-xs text-muted-foreground" role="status">
        {formatTopicPerformanceStatus(view)}
      </p>
      <details className="text-xs text-muted-foreground">
        <summary>Calculation details</summary>
        <p>
          Review Success is Good + Easy divided by valid ratings, including
          initial and repeat reviews. Current direct topic assignments apply to
          this history. Reviews can belong to multiple topics; topic counts
          cannot be added into an overall rate.
        </p>
        {view.lowEvidenceTopics.length ? (
          <p>
            Low-evidence topics:{' '}
            {view.lowEvidenceTopics
              .map(
                (topic) =>
                  `${topic.topic} (${formatCount(topic.validRatings)} valid ratings across ${formatCount(topic.distinctProblems)} problems)`,
              )
              .join(', ')}
            .
            {view.additionalLowEvidenceTopics > 0
              ? ` ${formatCount(view.additionalLowEvidenceTopics)} more low-evidence topics not listed.`
              : ''}
          </p>
        ) : null}
      </details>
    </div>
  )
}

function TopicPerformanceChart({
  rows,
  selectedPeriod,
  target,
}: {
  rows: readonly TopicRow[]
  selectedPeriod: string
  target: number
}) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [viewportWidth, setViewportWidth] = useState(640)
  const [inspection, setInspection] = useState<{
    key: string
    index: number
    visible: boolean
    keyboard: boolean
  } | null>(null)
  const controls = useRef<(HTMLButtonElement | null)[]>([])
  const tooltipId = useId()
  const descriptionId = useId()
  const key = `${selectedPeriod}:${rows.map((row) => row.id).join('|')}`
  const selected = inspection?.key === key ? rows[inspection.index] : undefined
  const visible = selected !== undefined && inspection?.visible === true
  const minimumWidth = rows.length * topicSlot + 56
  const chartWidth = Math.max(viewportWidth, minimumWidth)
  useEffect(() => {
    if (!viewport) return
    const measure = () => {
      const width = viewport.getBoundingClientRect().width
      if (width > 0) setViewportWidth(width)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [viewport])
  useEffect(() => {
    if (!visible) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        setInspection((value) => value && { ...value, visible: false })
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [visible])
  const select = (index: number, keyboard: boolean, reveal = false) => {
    setInspection({ key, index, keyboard, visible: true })
    if (reveal) {
      controls.current[index]?.focus({ preventScroll: true })
      controls.current[index]?.scrollIntoView?.({
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }
  const dismiss = () =>
    setInspection((value) => value && { ...value, visible: false })
  return (
    <div className="relative grid min-w-0 gap-2">
      <div
        className="max-w-full overflow-x-auto overscroll-x-contain"
        data-testid="topic-plot-scroller"
        ref={setViewport}
      >
        <ChartContainer
          accessibleName="Topic Performance chart"
          aria-label="Topic Performance chart"
          className="aspect-auto shrink-0"
          config={{
            reviewSuccess: {
              label: 'Review Success',
              color: 'var(--cp-analytics-healthy)',
            },
          }}
          initialDimension={{ width: chartWidth, height: chartHeight }}
          ref={setHost}
          style={{ width: chartWidth, height: chartHeight }}
        >
          <ComposedChart
            accessibilityLayer={false}
            aria-describedby={descriptionId}
            aria-label="Topic Performance chart"
            aria-roledescription="ranked vertical bar chart"
            data={rows}
            margin={{ top: 8, right: 8, bottom: 82, left: 0 }}
            role="img"
          >
            <desc
              id={descriptionId}
            >{`Topic Review Success, ranked lowest to highest. Scale: 0%–100%. All ${formatCount(rows.length)} qualifying topics are shown. Target Review Success: ${formatPercent(target)}. ${selectedPeriod}. Use arrows, Home and End to inspect topics; Escape closes inspection.`}</desc>
            <XAxis dataKey="id" hide type="category" />
            <YAxis
              allowDataOverflow
              axisLine={false}
              domain={[0, 1]}
              padding={{ top: 18 }}
              tickFormatter={formatPercent}
              tickLine={false}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              width={48}
            />
            <TopicColumns
              activeIndex={selected ? (inspection?.index ?? 0) : 0}
              controls={controls}
              host={host}
              onDismiss={dismiss}
              onSelect={select}
              rows={rows}
              selectedIndex={visible ? inspection.index : -1}
              target={target}
              tooltipId={tooltipId}
            />
          </ComposedChart>
        </ChartContainer>
      </div>
      {minimumWidth > viewportWidth ? (
        <p className="m-0 text-xs text-muted-foreground">
          Scroll to see all topics
        </p>
      ) : null}
      <div
        className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
        aria-label="Topic goal status"
        role="list"
      >
        <span
          className="text-[color:var(--cp-analytics-attention)]"
          role="listitem"
        >
          ● Below target
        </span>
        <span
          className="text-[color:var(--cp-analytics-healthy)]"
          role="listitem"
        >
          ● Meets target
        </span>
      </div>
      {visible ? (
        <div
          className="pointer-events-none absolute right-2 top-2 z-20 w-80 max-w-[calc(100%-1rem)]"
          aria-live={inspection?.keyboard ? 'polite' : 'off'}
        >
          <TopicPerformanceTooltip
            id={tooltipId}
            row={selected}
            selectedPeriod={selectedPeriod}
            target={target}
          />
        </div>
      ) : null}
    </div>
  )
}

function TopicColumns({
  activeIndex,
  controls,
  host,
  onDismiss,
  onSelect,
  rows,
  selectedIndex,
  target,
  tooltipId,
}: {
  activeIndex: number
  controls: RefObject<(HTMLButtonElement | null)[]>
  host: HTMLDivElement | null
  onDismiss: () => void
  onSelect: (index: number, keyboard: boolean, reveal?: boolean) => void
  rows: readonly TopicRow[]
  selectedIndex: number
  target: number
  tooltipId: string
}) {
  const plot = usePlotArea()
  const scale = useYAxisScale()
  if (!plot || !scale) return null
  const bottom = scale(0)
  const targetY = scale(target)
  if (bottom === undefined || targetY === undefined) return null
  const slot = plot.width / rows.length
  return (
    <>
      <g aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((value) => (
          <line
            key={value}
            stroke="var(--color-border)"
            x1={plot.x}
            x2={plot.x + plot.width}
            y1={scale(value)}
            y2={scale(value)}
          />
        ))}
        <line
          data-testid="topic-target"
          stroke="var(--cp-analytics-target)"
          strokeDasharray="5 5"
          strokeWidth={1.5}
          x1={plot.x}
          x2={plot.x + plot.width}
          y1={targetY}
          y2={targetY}
        />
        {rows.map((row, index) => {
          const y = scale(row.reviewSuccess)
          if (y === undefined) return null
          const x = plot.x + (index + 0.5) * slot
          const color =
            row.reviewSuccess < target
              ? 'var(--cp-analytics-attention)'
              : 'var(--cp-analytics-healthy)'
          return (
            <g
              data-testid={`topic-column-${row.id}`}
              data-value={row.reviewSuccess}
              data-status={topicStatus(row, target)}
              key={row.id}
            >
              {row.reviewSuccess === 0 ? (
                <line
                  stroke={color}
                  strokeWidth={3}
                  x1={x - 18}
                  x2={x + 18}
                  y1={bottom}
                  y2={bottom}
                />
              ) : (
                <rect
                  fill={color}
                  height={bottom - y}
                  rx={3}
                  width={36}
                  x={x - 18}
                  y={y}
                />
              )}
              {selectedIndex === index ? (
                <rect
                  fill="none"
                  height={Math.max(4, bottom - y)}
                  rx={3}
                  stroke="var(--color-foreground)"
                  strokeWidth={2}
                  width={42}
                  x={x - 21}
                  y={y - (row.reviewSuccess === 0 ? 2 : 0)}
                />
              ) : null}
              <text
                fill="var(--color-foreground)"
                fontSize={12}
                fontWeight={600}
                textAnchor="middle"
                x={x}
                y={y - 8}
              >
                {formatPercent(row.reviewSuccess)}
              </text>
              <foreignObject
                height={72}
                width={slot - 12}
                x={x - (slot - 12) / 2}
                y={bottom + 12}
              >
                <div className="break-words text-center text-xs leading-tight text-muted-foreground">
                  {row.topic}
                </div>
              </foreignObject>
            </g>
          )
        })}
      </g>
      {host
        ? createPortal(
            rows.map((row, index) => (
              <button
                aria-describedby={
                  selectedIndex === index ? tooltipId : undefined
                }
                aria-label={`Inspect ${row.topic}`}
                className="absolute rounded focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                key={row.id}
                onBlur={onDismiss}
                onFocus={() => onSelect(index, true)}
                onKeyDown={(event) => {
                  let next = index
                  if (event.key === 'ArrowRight')
                    next = Math.min(rows.length - 1, index + 1)
                  else if (event.key === 'ArrowLeft')
                    next = Math.max(0, index - 1)
                  else if (event.key === 'Home') next = 0
                  else if (event.key === 'End') next = rows.length - 1
                  else if (event.key === 'Escape') {
                    event.preventDefault()
                    onDismiss()
                    return
                  } else if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onSelect(next, true, true)
                }}
                onPointerDown={(event) => {
                  event.currentTarget.focus({ preventScroll: true })
                  onSelect(index, false)
                }}
                onPointerMove={() => onSelect(index, false)}
                onPointerLeave={(event) => {
                  if (event.pointerType !== 'touch') onDismiss()
                }}
                ref={(node) => {
                  controls.current[index] = node
                }}
                style={{
                  left: plot.x + index * slot,
                  top: plot.y,
                  width: slot,
                  height: plot.height + 72,
                  touchAction: 'pan-x pan-y',
                }}
                tabIndex={index === activeIndex ? 0 : -1}
                type="button"
              />
            )),
            host,
          )
        : null}
    </>
  )
}

function topicStatus(row: TopicRow, target: number) {
  return row.reviewSuccess < target ? 'Below target' : 'Meets target'
}
function precisePercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function qualifyingTopicCount(view: AnalyticsViews['topicPerformance']) {
  return view.rows.length + view.strongerQualifyingTopics
}

function formatTopicPerformanceStatus(
  view: AnalyticsViews['topicPerformance'],
) {
  const qualifying = qualifyingTopicCount(view)
  return qualifying === 0
    ? 'No topic meets the 10 valid-rating and 3 reviewed-problem gates in this period.'
    : `${formatCount(qualifying)} qualifying topic${qualifying === 1 ? '' : 's'} ${qualifying === 1 ? 'meets' : 'meet'} the 10 valid-rating and 3 reviewed-problem gates.`
}

function TopicPerformanceTable({
  rows,
  target,
}: {
  rows: readonly TopicRow[]
  target: number
}) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Topic Performance exact values</caption>
      <thead>
        <tr>
          {[
            'Topic',
            'Review Success',
            'Goal status',
            'Good + Easy',
            'Valid ratings',
            'Distinct problems',
            'Evidence',
          ].map((header) => (
            <th
              className="px-2 py-2 text-left font-semibold"
              key={header}
              scope="col"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr className="border-t border-border" key={row.id}>
            <th className="px-2 py-2 text-left font-medium" scope="row">
              {row.topic}
            </th>
            <td className="px-2 py-2 text-right tabular-nums">
              {precisePercent(row.reviewSuccess)}
            </td>
            <td className="px-2 py-2">{topicStatus(row, target)}</td>
            {[row.goodEasy, row.validRatings, row.distinctProblems].map(
              (value, index) => (
                <td className="px-2 py-2 text-right tabular-nums" key={index}>
                  {formatCount(value)}
                </td>
              ),
            )}
            <td className="px-2 py-2">{row.evidence}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TopicPerformanceTooltip({
  id,
  row,
  selectedPeriod,
  target,
}: {
  id: string
  row: TopicRow
  selectedPeriod: string
  target: number
}) {
  return (
    <div
      className="rounded border border-border bg-popover p-2.5 text-xs leading-relaxed shadow-md"
      id={id}
      role="tooltip"
    >
      <p className="m-0 font-semibold">{row.topic}</p>
      {[
        `Review Success: ${precisePercent(row.reviewSuccess)}`,
        `Good + Easy: ${formatCount(row.goodEasy)} / ${formatCount(row.validRatings)} valid ratings`,
        `Distinct reviewed problems: ${formatCount(row.distinctProblems)}`,
        `Target Review Success: ${formatPercent(target)} · ${topicStatus(row, target)}`,
        `Selected period: ${selectedPeriod}`,
        `Evidence: ${row.evidence}`,
      ].map((value) => (
        <p className="m-0" key={value}>
          {value}
        </p>
      ))}
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
