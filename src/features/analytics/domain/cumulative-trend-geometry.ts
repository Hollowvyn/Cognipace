import type { CumulativeEvidenceState } from './performance-presentation'

export interface CumulativeTrendPoint {
  x: number
  startX: number
  endX: number
  value: number | null
  state: CumulativeEvidenceState
}

export interface CumulativeTrendCoordinate {
  x: number
  y: number
}

export interface CumulativeTrendCubicSegment {
  start: CumulativeTrendCoordinate
  control1: CumulativeTrendCoordinate
  control2: CumulativeTrendCoordinate
  end: CumulativeTrendCoordinate
}

export interface CumulativeTrendActiveRun {
  start: CumulativeTrendCoordinate
  segments: CumulativeTrendCubicSegment[]
}

export interface CumulativeTrendHeldSegment {
  start: CumulativeTrendCoordinate
  end: CumulativeTrendCoordinate
}

export interface CumulativeTrendGeometry {
  activeRuns: CumulativeTrendActiveRun[]
  heldSegments: CumulativeTrendHeldSegment[]
  markers: CumulativeTrendCoordinate[]
}

/**
 * Consume ordered calendar intervals in the caller's numeric domain. Coordinates
 * describe drawing interpolation only; source rows still own inspection.
 */
export function buildCumulativeTrendGeometry(
  points: readonly CumulativeTrendPoint[],
  visibleEnd: number,
): CumulativeTrendGeometry {
  const geometry: CumulativeTrendGeometry = {
    activeRuns: [],
    heldSegments: [],
    markers: [],
  }
  let knots: CumulativeTrendCoordinate[] = []
  let startsAtHold = false
  let holding = false
  let previous: CumulativeTrendCoordinate | null = null

  function finishRun(endsAtHold: boolean) {
    if (knots.length > 1) {
      geometry.activeRuns.push(buildActiveRun(knots, startsAtHold, endsAtHold))
    }
    knots = []
  }

  for (const point of points) {
    if (point.x > visibleEnd) break
    if (point.state !== 'updated' || point.value === null) {
      if (previous !== null) holding = true
      continue
    }

    const coordinate = { x: point.x, y: point.value }
    if (holding && previous !== null) {
      finishRun(true)
      const anchor = { x: point.startX, y: previous.y }
      geometry.heldSegments.push({ start: previous, end: anchor })
      // This boundary carries the preceding aggregate; it is never a marker.
      // A midnight-clipped interval has no width to support a transition.
      knots = anchor.x < coordinate.x ? [anchor] : []
      startsAtHold = true
    }
    knots.push(coordinate)
    geometry.markers.push(coordinate)
    previous = coordinate
    holding = false
  }

  const hasTrailingHold = previous !== null && previous.x < visibleEnd
  finishRun(hasTrailingHold)
  if (hasTrailingHold) {
    geometry.heldSegments.push({
      start: previous!,
      end: { x: visibleEnd, y: previous!.y },
    })
  }
  return geometry
}

function buildActiveRun(
  knots: readonly CumulativeTrendCoordinate[],
  startsAtHold: boolean,
  endsAtHold: boolean,
): CumulativeTrendActiveRun {
  const spans = knots.slice(1).map((end, index) => end.x - knots[index]!.x)
  const slopes = knots
    .slice(1)
    .map((end, index) => (end.y - knots[index]!.y) / spans[index]!)
  const tangents = knots.map((_, index) => {
    if (index === 0) return startsAtHold ? 0 : slopes[0]!
    if (index === knots.length - 1) return endsAtHold ? 0 : slopes.at(-1)!

    const before = slopes[index - 1]!
    const after = slopes[index]!
    if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after))
      return 0

    const beforeWeight = 2 * spans[index]! + spans[index - 1]!
    const afterWeight = spans[index]! + 2 * spans[index - 1]!
    const tangent =
      (beforeWeight + afterWeight) /
      (beforeWeight / before + afterWeight / after)
    // One shared limit keeps both adjacent controls in bounds without breaking C1.
    const limit = 3 * Math.min(Math.abs(before), Math.abs(after))
    return Math.sign(before) * Math.min(Math.abs(tangent), limit)
  })
  const segments = knots.slice(1).map((end, index) => {
    const start = knots[index]!
    const thirdSpan = spans[index]! / 3
    const low = Math.min(start.y, end.y)
    const high = Math.max(start.y, end.y)
    const bounded = (value: number) => Math.max(low, Math.min(high, value))
    return {
      start,
      control1: {
        x: start.x + thirdSpan,
        y: bounded(start.y + thirdSpan * tangents[index]!),
      },
      control2: {
        x: end.x - thirdSpan,
        y: bounded(end.y - thirdSpan * tangents[index + 1]!),
      },
      end,
    }
  })
  return { start: knots[0]!, segments }
}
