import { useState } from 'react'
import { createPortal } from 'react-dom'
import { DefaultZIndexes, Line, ZIndexLayer } from 'recharts'
import type { DotItemDotProps, LineDrawShapeProps } from 'recharts'

import { classifyLineContinuity } from '../../domain/chart-buckets'
import { DASHED_LINE_EVIDENCE_LABEL } from './chart-shared'

export { DASHED_LINE_EVIDENCE_LABEL }

interface LineSegment {
  fromIndex: number
  toIndex: number
  kind: 'bridge' | 'solid'
}

export interface LineSegmentsProps<T extends Record<string, unknown>> {
  data: readonly T[]
  dataKey: keyof T & string
  seriesKey: string
  showMeasuredDots?: boolean
  markerShape?: 'circle' | 'diamond' | 'triangle'
  markerFill?: string
  activeIndex?: number | null
  bridgeDasharray?: string
  bridgeStrokeWidth?: number
  stroke: string
  strokeDasharray?: string
  strokeWidth?: number
  testId?: string
  type?: 'linear' | 'monotone'
  yAxisId?: string
}

function getNumericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildLineSegments<T extends Record<string, unknown>>(
  data: readonly T[],
  dataKey: keyof T & string,
): LineSegment[] {
  const continuity = classifyLineContinuity(
    data.map((point) => getNumericValue(point[dataKey])),
  )
  const numericIndexes = data.flatMap((point, index) =>
    getNumericValue(point[dataKey]) === null ? [] : [index],
  )
  if (numericIndexes.length === 1) {
    return [
      {
        kind: 'solid',
        fromIndex: numericIndexes[0]!,
        toIndex: numericIndexes[0]!,
      },
    ]
  }
  const segments: LineSegment[] = []
  let solidStart: number | null = null
  let solidEnd: number | null = null
  const flushSolid = () => {
    if (solidStart === null || solidEnd === null) return
    segments.push({
      fromIndex: solidStart,
      toIndex: solidEnd,
      kind: 'solid',
    })
    solidStart = null
    solidEnd = null
  }
  for (const connection of continuity) {
    if (connection.kind === 'solid') {
      if (solidEnd === connection.fromIndex) solidEnd = connection.toIndex
      else {
        flushSolid()
        solidStart = connection.fromIndex
        solidEnd = connection.toIndex
      }
      continue
    }
    flushSolid()
    if (connection.kind === 'bridge') {
      segments.push({
        fromIndex: connection.fromIndex,
        toIndex: connection.toIndex,
        kind: 'bridge',
      })
    }
  }
  flushSolid()
  return segments
}

const SEGMENT_VALUE_KEY = '__cpAnalyticsSegmentValue'

function maskSegmentData<T extends Record<string, unknown>>(
  data: readonly T[],
  dataKey: keyof T & string,
  fromIndex: number,
  toIndex: number,
): Array<T & Record<typeof SEGMENT_VALUE_KEY, number | null>> {
  return data.map((point, index) => ({
    ...point,
    [SEGMENT_VALUE_KEY]:
      index >= fromIndex && index <= toIndex
        ? getNumericValue(point[dataKey])
        : null,
  }))
}

function createBridgeShape(testId: string) {
  return function BridgeShape({
    points,
    stroke,
    strokeDasharray,
    strokeWidth,
  }: LineDrawShapeProps) {
    const endpoints = points?.filter(
      (point) => point.x !== null && point.y !== null,
    )
    const from = endpoints?.[0]
    const to = endpoints?.at(-1)

    if (!from || !to || from === to) return null

    return (
      <path
        aria-hidden="true"
        d={`M${from.x},${from.y}L${to.x},${to.y}`}
        data-testid={testId}
        fill="none"
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeWidth={strokeWidth}
      />
    )
  }
}

function createMeasuredMarker({
  activeIndex,
  fill,
  shape,
  stroke,
  testId,
  target,
}: {
  activeIndex: number | null | undefined
  fill: string
  shape: 'circle' | 'diamond' | 'triangle' | undefined
  stroke: string
  testId: string
  target: SVGGElement | null
}) {
  return function MeasuredMarker({ cx, cy, index, value }: DotItemDotProps) {
    if (getNumericValue(value) === null || cx === undefined || cy === undefined)
      return null
    const active = index === activeIndex
    const radius = active ? 5 : shape === 'circle' ? 4 : 3.5
    const markerStrokeWidth =
      shape === 'diamond'
        ? active
          ? 2
          : 1.5
        : active
          ? 3
          : shape === 'circle'
            ? 2.5
            : 2
    return target
      ? createPortal(
          <g
            aria-hidden="true"
            data-active-marker={active}
            data-marker-shape={shape ?? 'circle'}
            data-testid={`${testId}-marker-${index}`}
          >
            {shape === 'diamond' ? (
              <path
                d={`M${cx},${cy - radius}L${cx + radius},${cy}L${cx},${cy + radius}L${cx - radius},${cy}Z`}
                fill={fill}
                stroke={stroke}
                strokeWidth={markerStrokeWidth}
              />
            ) : shape === 'triangle' ? (
              <path
                d={`M${cx},${cy - radius}L${cx + radius},${cy + radius}L${cx - radius},${cy + radius}Z`}
                fill={fill}
                stroke={stroke}
                strokeWidth={markerStrokeWidth}
              />
            ) : (
              <circle
                cx={cx}
                cy={cy}
                fill={fill}
                r={radius}
                stroke={stroke}
                strokeWidth={markerStrokeWidth}
              />
            )}
          </g>,
          target,
        )
      : null
  }
}

export function LineSegments<T extends Record<string, unknown>>({
  data,
  dataKey,
  seriesKey,
  showMeasuredDots = false,
  markerShape,
  markerFill,
  activeIndex,
  bridgeDasharray = '5 5',
  bridgeStrokeWidth,
  stroke,
  strokeDasharray,
  strokeWidth = 2.5,
  testId = seriesKey,
  type = 'monotone',
  yAxisId,
}: LineSegmentsProps<T>) {
  const [markerLayer, setMarkerLayer] = useState<SVGGElement | null>(null)
  const segments = buildLineSegments(data, dataKey)
  const semanticTooltipSourceTestId = `${testId}-semantic-tooltip-source`
  const customMarkers =
    markerShape !== undefined ||
    markerFill !== undefined ||
    activeIndex !== undefined
  const measuredMarker = customMarkers
    ? createMeasuredMarker({
        activeIndex,
        fill: markerFill ?? 'var(--color-card)',
        shape: markerShape,
        stroke,
        testId,
        target: markerLayer,
      })
    : { fill: 'var(--color-card)', r: 3.5, stroke, strokeWidth: 2 }

  if (segments.length === 0) return null

  return (
    <>
      <Line
        activeDot={false}
        aria-hidden="true"
        data={data}
        data-testid={
          showMeasuredDots ? `${testId}-markers` : semanticTooltipSourceTestId
        }
        dataKey={dataKey as never}
        dot={showMeasuredDots ? measuredMarker : false}
        isAnimationActive={false}
        legendType="none"
        name={seriesKey}
        stroke="transparent"
        {...(strokeDasharray === undefined ? {} : { strokeDasharray })}
        strokeWidth={0}
        type={type}
        {...(yAxisId === undefined ? {} : { yAxisId })}
      />
      {segments.map((segment) => {
        // Recharts draws a singleton dot even when dot={false}. The semantic
        // marker line already owns this point in the optional marker mode.
        if (
          showMeasuredDots &&
          customMarkers &&
          segment.fromIndex === segment.toIndex
        )
          return null
        const segmentTestId =
          segment.fromIndex === segment.toIndex
            ? `${testId}-single-${segment.fromIndex}`
            : `${testId}-${segment.kind}-${segment.fromIndex}-${segment.toIndex}`

        const segmentStrokeDasharray =
          segment.kind === 'bridge' ? bridgeDasharray : strokeDasharray

        return (
          <Line
            activeDot={false}
            aria-hidden="true"
            data={maskSegmentData(
              data,
              dataKey,
              segment.fromIndex,
              segment.toIndex,
            )}
            data-testid={segmentTestId}
            dataKey={
              SEGMENT_VALUE_KEY as keyof (T &
                Record<typeof SEGMENT_VALUE_KEY, number | null>) &
                string as never
            }
            dot={
              segment.fromIndex === segment.toIndex &&
              !(showMeasuredDots && customMarkers)
                ? { r: 4, stroke, strokeWidth: 1 }
                : false
            }
            isAnimationActive={false}
            key={`${segment.kind}-${segment.fromIndex}-${segment.toIndex}`}
            legendType="none"
            name={seriesKey}
            stroke={stroke}
            {...(segmentStrokeDasharray === undefined
              ? {}
              : { strokeDasharray: segmentStrokeDasharray })}
            {...(segment.kind === 'bridge'
              ? {
                  shape: createBridgeShape(segmentTestId),
                }
              : {})}
            strokeWidth={
              segment.kind === 'bridge'
                ? (bridgeStrokeWidth ?? strokeWidth)
                : strokeWidth
            }
            tooltipType="none"
            type={type}
            {...(yAxisId === undefined ? {} : { yAxisId })}
          />
        )
      })}
      {showMeasuredDots && customMarkers ? (
        <ZIndexLayer zIndex={DefaultZIndexes.scatter}>
          <g
            aria-hidden="true"
            data-testid={`${testId}-marker-layer`}
            ref={setMarkerLayer}
          />
        </ZIndexLayer>
      ) : null}
    </>
  )
}
