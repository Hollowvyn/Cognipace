import { useId } from 'react'
import { usePlotArea, useXAxisScale, useYAxisScale } from 'recharts'

import { buildCumulativeTrendGeometry } from '../../domain/cumulative-trend-geometry'
import type { CumulativeEvidenceState } from '../../domain/performance-presentation'

interface CumulativeTrendRow {
  id: string
  x: number
  startX: number
  endX: number
}

export interface CumulativeTrendProps<Row extends CumulativeTrendRow> {
  rows: readonly Row[]
  value: (row: Row) => number | null
  state: (row: Row) => CumulativeEvidenceState
  visibleEnd: number
  color: string
  markerShape?: 'circle' | 'diamond'
  strokeDasharray?: string | undefined
  selectedRow?: Row | null
  area?: boolean
  yAxisId?: string | number
  testId?: string
}

/** Cumulative drawing only; exact interval evidence remains in the caller's rows. */
export function CumulativeTrend<Row extends CumulativeTrendRow>({
  rows,
  value,
  state,
  visibleEnd,
  color,
  markerShape = 'circle',
  strokeDasharray,
  selectedRow = null,
  area = false,
  yAxisId = 0,
  testId = 'cumulative-trend',
}: CumulativeTrendProps<Row>) {
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  const yScale = useYAxisScale(yAxisId)
  const clipId = useId()
  if (!plot || !xScale || !yScale) return null
  const points = rows.map((row) => ({
    x: row.x,
    startX: row.startX,
    endX: row.endX,
    value: value(row),
    state: state(row),
  }))
  const geometry = buildCumulativeTrendGeometry(points, visibleEnd)
  const project = (point: { x: number; y: number }) => ({
    x: xScale(point.x)!,
    y: yScale(point.y)!,
  })
  const activePaths = geometry.activeRuns.map((run) => {
    const start = project(run.start)
    const segments = run.segments.map((segment) => ({
      control1: project(segment.control1),
      control2: project(segment.control2),
      end: project(segment.end),
    }))
    const end = segments.at(-1)!.end
    const d = `M${start.x},${start.y}${segments.map((segment) => `C${segment.control1.x},${segment.control1.y} ${segment.control2.x},${segment.control2.y} ${segment.end.x},${segment.end.y}`).join('')}`
    return { start, end, d }
  })
  const heldSegments = geometry.heldSegments
    .filter((segment) => segment.end.x > segment.start.x)
    .map((segment) => ({
      start: project(segment.start),
      end: project(segment.end),
    }))
  const updatedRows = rows.filter(
    (row) =>
      state(row) === 'updated' && value(row) !== null && row.x <= visibleEnd,
  )
  const baseline = Math.max(
    plot.y,
    Math.min(plot.y + plot.height, yScale(0) ?? plot.y + plot.height),
  )
  return (
    <g aria-hidden="true" data-testid={testId}>
      <defs>
        <clipPath id={clipId}>
          <rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {area ? (
          <>
            {activePaths.map((path, index) => (
              <path
                key={`active-${index}`}
                data-testid={`${testId}-area-active-${index}`}
                d={`${path.d}L${path.end.x},${baseline}L${path.start.x},${baseline}Z`}
                fill={color}
                fillOpacity={0.1}
              />
            ))}
            {heldSegments.map((segment, index) => (
              <path
                key={`held-${index}`}
                data-testid={`${testId}-area-held-${index}`}
                d={`M${segment.start.x},${segment.start.y}L${segment.end.x},${segment.end.y}L${segment.end.x},${baseline}L${segment.start.x},${baseline}Z`}
                fill={color}
                fillOpacity={0.1}
              />
            ))}
          </>
        ) : null}
        {activePaths.map((path, index) => (
          <path
            key={index}
            data-testid={`${testId}-active-${index}`}
            d={path.d}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeDasharray={strokeDasharray}
          />
        ))}
        {heldSegments.map((segment, index) => (
          <line
            key={index}
            data-testid={`${testId}-held-${index}`}
            x1={segment.start.x}
            y1={segment.start.y}
            x2={segment.end.x}
            y2={segment.end.y}
            stroke={color}
            strokeWidth={2.5}
            strokeDasharray="9 7"
          />
        ))}
        {geometry.markers.map((point, index) => {
          const coordinate = project(point)
          const row = updatedRows[index]!
          const active = selectedRow?.id === row.id
          const radius = active ? 5 : 4
          return (
            <g
              key={row.id}
              data-testid={`${testId}-marker-${row.id}`}
              data-row-id={row.id}
              data-active-marker={active}
              data-marker-shape={markerShape}
            >
              {markerShape === 'diamond' ? (
                <path
                  d={`M${coordinate.x},${coordinate.y - radius}L${coordinate.x + radius},${coordinate.y}L${coordinate.x},${coordinate.y + radius}L${coordinate.x - radius},${coordinate.y}Z`}
                  fill={color}
                  stroke={color}
                  strokeWidth={active ? 3 : 1.5}
                />
              ) : (
                <circle
                  cx={coordinate.x}
                  cy={coordinate.y}
                  r={radius}
                  fill={color}
                  stroke={color}
                  strokeWidth={active ? 3 : 2}
                />
              )}
            </g>
          )
        })}
      </g>
    </g>
  )
}
