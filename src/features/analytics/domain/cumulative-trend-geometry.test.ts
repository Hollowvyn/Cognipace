import { describe, expect, it } from 'vitest'

import {
  buildCumulativeTrendGeometry,
  type CumulativeTrendCoordinate,
  type CumulativeTrendCubicSegment,
  type CumulativeTrendPoint,
} from './cumulative-trend-geometry'

function point(
  startX: number,
  endX: number,
  value: number | null,
  state: CumulativeTrendPoint['state'] = 'updated',
): CumulativeTrendPoint {
  return { x: (startX + endX) / 2, startX, endX, value, state }
}

function sample(
  segment: CumulativeTrendCubicSegment,
  t: number,
): CumulativeTrendCoordinate {
  const complement = 1 - t
  const weights = [
    complement ** 3,
    3 * complement ** 2 * t,
    3 * complement * t ** 2,
    t ** 3,
  ]
  const coordinates = [
    segment.start,
    segment.control1,
    segment.control2,
    segment.end,
  ]
  return {
    x: coordinates.reduce(
      (sum, coordinate, index) => sum + coordinate.x * weights[index]!,
      0,
    ),
    y: coordinates.reduce(
      (sum, coordinate, index) => sum + coordinate.y * weights[index]!,
      0,
    ),
  }
}

function startSlope(segment: CumulativeTrendCubicSegment): number {
  return (
    (segment.control1.y - segment.start.y) /
    (segment.control1.x - segment.start.x)
  )
}

function endSlope(segment: CumulativeTrendCubicSegment): number {
  return (
    (segment.end.y - segment.control2.y) / (segment.end.x - segment.control2.x)
  )
}

describe('buildCumulativeTrendGeometry', () => {
  it('leaves an empty or entirely unavailable history without any geometry', () => {
    for (const points of [
      [],
      [point(0, 10, null, 'unavailable')],
      [point(0, 10, null, 'unavailable'), point(10, 20, null, 'unavailable')],
    ]) {
      expect(buildCumulativeTrendGeometry(points, 20)).toEqual({
        activeRuns: [],
        heldSegments: [],
        markers: [],
      })
    }
  })

  it('starts only at the first eligible midpoint and carries a supported zero', () => {
    const geometry = buildCumulativeTrendGeometry(
      [
        point(0, 10, null, 'unavailable'),
        point(10, 20, null, 'unavailable'),
        point(20, 30, 0),
        point(30, 40, 0, 'held'),
      ],
      40,
    )

    expect(geometry).toEqual({
      activeRuns: [],
      heldSegments: [{ start: { x: 25, y: 0 }, end: { x: 40, y: 0 } }],
      markers: [{ x: 25, y: 0 }],
    })
  })

  it('retains the actual singleton coordinate and an unrounded value', () => {
    const geometry = buildCumulativeTrendGeometry(
      [point(100, 109, 13210 / 195)],
      109,
    )

    expect(geometry).toEqual({
      activeRuns: [],
      heldSegments: [
        {
          start: { x: 104.5, y: 13210 / 195 },
          end: { x: 109, y: 13210 / 195 },
        },
      ],
      markers: [{ x: 104.5, y: 13210 / 195 }],
    })
  })

  it('does not invent a path for a singleton at the visible cutoff', () => {
    expect(buildCumulativeTrendGeometry([point(0, 10, 0)], 5)).toEqual({
      activeRuns: [],
      heldSegments: [],
      markers: [{ x: 5, y: 0 }],
    })
  })

  it('places a shortened first interval and partial final interval at their numeric midpoints', () => {
    const geometry = buildCumulativeTrendGeometry(
      [point(103, 110, 10), point(110, 140, 40), point(140, 145, 60)],
      145,
    )

    expect(geometry.markers).toEqual([
      { x: 106.5, y: 10 },
      { x: 125, y: 40 },
      { x: 142.5, y: 60 },
    ])
    expect(geometry.activeRuns).toHaveLength(1)
    expect(geometry.activeRuns[0]!.start).toEqual({ x: 106.5, y: 10 })
    const segments = geometry.activeRuns[0]!.segments
    expect(segments.map((segment) => [segment.start.x, segment.end.x])).toEqual(
      [
        [106.5, 125],
        [125, 142.5],
      ],
    )
    for (const segment of segments) {
      const span = segment.end.x - segment.start.x
      expect(segment.control1.x).toBeCloseTo(segment.start.x + span / 3)
      expect(segment.control2.x).toBeCloseTo(segment.start.x + (2 * span) / 3)
    }
    expect(geometry.heldSegments).toEqual([
      { start: { x: 142.5, y: 60 }, end: { x: 145, y: 60 } },
    ])
  })

  it('keeps a long inactive span perfectly horizontal until the resumed interval starts', () => {
    const geometry = buildCumulativeTrendGeometry(
      [
        point(0, 10, 20),
        point(10, 30, 20, 'held'),
        point(30, 90, 20, 'held'),
        point(90, 100, 80),
      ],
      100,
    )

    expect(geometry.heldSegments).toEqual([
      { start: { x: 5, y: 20 }, end: { x: 90, y: 20 } },
      { start: { x: 95, y: 80 }, end: { x: 100, y: 80 } },
    ])
    expect(geometry.activeRuns).toHaveLength(1)
    expect(geometry.activeRuns[0]!.start).toEqual({ x: 90, y: 20 })
    expect(geometry.activeRuns[0]!.segments).toHaveLength(1)
    expect(geometry.activeRuns[0]!.segments[0]).toMatchObject({
      start: { x: 90, y: 20 },
      end: { x: 95, y: 80 },
    })
    expect(geometry.markers).toEqual([
      { x: 5, y: 20 },
      { x: 95, y: 80 },
    ])
  })

  it('gives held segments no evidence marker, including repeated measured zero', () => {
    const geometry = buildCumulativeTrendGeometry(
      [
        point(0, 10, 0),
        point(10, 20, 0, 'held'),
        point(20, 30, 0, 'held'),
        point(30, 40, 0),
      ],
      40,
    )

    expect(geometry.markers).toEqual([
      { x: 5, y: 0 },
      { x: 35, y: 0 },
    ])
    expect(geometry.activeRuns[0]!.segments[0]).toEqual({
      start: { x: 30, y: 0 },
      control1: { x: 30 + 5 / 3, y: 0 },
      control2: { x: 35 - 5 / 3, y: 0 },
      end: { x: 35, y: 0 },
    })
  })

  it('extends trailing inactivity through the explicit visible end rather than the last bucket', () => {
    const geometry = buildCumulativeTrendGeometry(
      [
        point(0, 10, 0.923),
        point(10, 20, 0.923, 'held'),
        point(20, 30, 0.923, 'held'),
      ],
      77.5,
    )

    expect(geometry.heldSegments).toEqual([
      { start: { x: 5, y: 0.923 }, end: { x: 77.5, y: 0.923 } },
    ])
  })

  it('caps a trailing hold inside a supplied interval without drawing beyond as-of', () => {
    const geometry = buildCumulativeTrendGeometry(
      [point(0, 10, 20), point(10, 100, 20, 'held')],
      37.25,
    )

    expect(geometry.heldSegments).toEqual([
      { start: { x: 5, y: 20 }, end: { x: 37.25, y: 20 } },
    ])
  })

  it('excludes updates beyond the visible end and does not move toward their values', () => {
    const geometry = buildCumulativeTrendGeometry(
      [point(0, 10, 20), point(10, 20, 20, 'held'), point(20, 30, 90)],
      22,
    )

    expect(geometry).toEqual({
      activeRuns: [],
      heldSegments: [{ start: { x: 5, y: 20 }, end: { x: 22, y: 20 } }],
      markers: [{ x: 5, y: 20 }],
    })
  })

  it('leaves geometry empty when the visible cutoff precedes the first supported midpoint', () => {
    expect(buildCumulativeTrendGeometry([point(0, 10, 40)], 4)).toEqual({
      activeRuns: [],
      heldSegments: [],
      markers: [],
    })
  })

  it('keeps a zero-width resumed interval at the cutoff as a genuine endpoint without a fabricated transition', () => {
    const geometry = buildCumulativeTrendGeometry(
      [point(0, 10, 20), point(10, 20, 20, 'held'), point(20, 20, 80)],
      20,
    )

    expect(geometry.activeRuns).toEqual([])
    expect(geometry.heldSegments).toEqual([
      { start: { x: 5, y: 20 }, end: { x: 20, y: 20 } },
    ])
    expect(geometry.markers).toEqual([
      { x: 5, y: 20 },
      { x: 20, y: 80 },
    ])
    const coordinates = [
      ...geometry.markers,
      ...geometry.heldSegments.flatMap((segment) => [
        segment.start,
        segment.end,
      ]),
      ...geometry.activeRuns.flatMap((run) =>
        run.segments.flatMap((segment) => [
          segment.start,
          segment.control1,
          segment.control2,
          segment.end,
        ]),
      ),
    ]
    for (const coordinate of coordinates) {
      expect(Number.isFinite(coordinate.x)).toBe(true)
      expect(Number.isFinite(coordinate.y)).toBe(true)
    }
  })

  it('keeps equal active values in one flat solid run with all genuine markers', () => {
    const geometry = buildCumulativeTrendGeometry(
      [point(0, 10, 80), point(10, 20, 80), point(20, 30, 80)],
      25,
    )

    expect(geometry.heldSegments).toEqual([])
    expect(geometry.markers).toEqual([
      { x: 5, y: 80 },
      { x: 15, y: 80 },
      { x: 25, y: 80 },
    ])
    expect(geometry.activeRuns).toHaveLength(1)
    expect(geometry.activeRuns[0]!.segments).toHaveLength(2)
    for (const segment of geometry.activeRuns[0]!.segments) {
      expect([
        segment.start.y,
        segment.control1.y,
        segment.control2.y,
        segment.end.y,
      ]).toEqual([80, 80, 80, 80])
    }
  })

  it.each([
    [0, 100, 0],
    [100, 0, 100],
  ])(
    'meets the local extremum in %j with a horizontal tangent',
    (...values) => {
      const geometry = buildCumulativeTrendGeometry(
        values.map((value, index) =>
          point(index * 10, (index + 1) * 10, value),
        ),
        25,
      )
      const [before, after] = geometry.activeRuns[0]!.segments

      expect(before!.end.y).toBe(values[1])
      expect(after!.start).toEqual(before!.end)
      expect(endSlope(before!)).toBe(0)
      expect(startSlope(after!)).toBe(0)
    },
  )

  it.each([
    [0, 25, 100],
    [100, 75, 0],
  ])(
    'shares a nonzero tangent across adjacent monotone updates in %j',
    (...values) => {
      const geometry = buildCumulativeTrendGeometry(
        [
          point(0, 2, values[0]),
          point(2, 14, values[1]),
          point(14, 22, values[2]),
        ],
        18,
      )
      const [before, after] = geometry.activeRuns[0]!.segments

      expect(after!.start).toEqual(before!.end)
      expect(Math.abs(endSlope(before!))).toBeGreaterThan(0)
      expect(endSlope(before!)).toBeCloseTo(startSlope(after!), 12)
      expect(Math.sign(endSlope(before!))).toBe(
        Math.sign(values[2] - values[0]),
      )
    },
  )

  it('meets an internal hold with flat tangents on both active sides', () => {
    const geometry = buildCumulativeTrendGeometry(
      [
        point(0, 10, 0),
        point(10, 20, 40),
        point(20, 40, 40, 'held'),
        point(40, 50, 80),
        point(50, 60, 100),
      ],
      55,
    )

    expect(geometry.activeRuns).toHaveLength(2)
    const before = geometry.activeRuns[0]!.segments.at(-1)!
    const after = geometry.activeRuns[1]!.segments[0]!
    expect(geometry.heldSegments).toEqual([
      { start: { x: 15, y: 40 }, end: { x: 40, y: 40 } },
    ])
    expect(before.end).toEqual(geometry.heldSegments[0]!.start)
    expect(after.start).toEqual(geometry.heldSegments[0]!.end)
    expect(endSlope(before)).toBe(0)
    expect(startSlope(after)).toBe(0)
    expect(endSlope(after)).toBeCloseTo(
      startSlope(geometry.activeRuns[1]!.segments[1]!),
      12,
    )
  })

  it('ends the last active run horizontally at its trailing held join', () => {
    const geometry = buildCumulativeTrendGeometry(
      [point(0, 10, 20), point(10, 20, 80)],
      20,
    )
    const lastSegment = geometry.activeRuns[0]!.segments.at(-1)!

    expect(endSlope(lastSegment)).toBe(0)
    expect(geometry.heldSegments).toEqual([
      { start: lastSegment.end, end: { x: 20, y: 80 } },
    ])
  })

  it('splits multiple inactive spans without turning synthetic anchors into observations', () => {
    const geometry = buildCumulativeTrendGeometry(
      [
        point(0, 10, null, 'unavailable'),
        point(10, 20, 40),
        point(20, 30, 40, 'held'),
        point(30, 36, 60),
        point(36, 70, 60, 'held'),
        point(70, 74, 20),
        point(74, 90, 20, 'held'),
      ],
      80,
    )

    expect(geometry.activeRuns.map((run) => run.start)).toEqual([
      { x: 30, y: 40 },
      { x: 70, y: 60 },
    ])
    expect(geometry.markers).toEqual([
      { x: 15, y: 40 },
      { x: 33, y: 60 },
      { x: 72, y: 20 },
    ])
    expect(geometry.heldSegments).toEqual([
      { start: { x: 15, y: 40 }, end: { x: 30, y: 40 } },
      { start: { x: 33, y: 60 }, end: { x: 70, y: 60 } },
      { start: { x: 72, y: 20 }, end: { x: 80, y: 20 } },
    ])
  })

  it('keeps controls and dense curve samples within endpoint bounds without reversal', () => {
    const source = [
      point(0, 2, 0),
      point(2, 4, 0.01),
      point(4, 104, 100),
      point(104, 105, 99.99),
      point(105, 109, 30),
      point(109, 112, 30),
      point(112, 120, 0),
      point(120, 121, 0.01),
      point(121, 180, 100),
    ]
    const geometry = buildCumulativeTrendGeometry(source, 180)

    expect(geometry.activeRuns[0]!.segments).toHaveLength(source.length - 1)
    for (const segment of geometry.activeRuns[0]!.segments) {
      const low = Math.min(segment.start.y, segment.end.y)
      const high = Math.max(segment.start.y, segment.end.y)
      const direction = Math.sign(segment.end.y - segment.start.y)
      for (const control of [segment.control1, segment.control2]) {
        expect(control.x).toBeGreaterThan(segment.start.x)
        expect(control.x).toBeLessThan(segment.end.x)
        expect(control.y).toBeGreaterThanOrEqual(low)
        expect(control.y).toBeLessThanOrEqual(high)
      }
      let previous = segment.start
      for (let index = 1; index <= 200; index += 1) {
        const coordinate = sample(segment, index / 200)
        expect(coordinate.x).toBeGreaterThan(previous.x)
        expect(coordinate.y).toBeGreaterThanOrEqual(low - 1e-12)
        expect(coordinate.y).toBeLessThanOrEqual(high + 1e-12)
        expect(direction * (coordinate.y - previous.y)).toBeGreaterThanOrEqual(
          -1e-12,
        )
        previous = coordinate
      }
    }
  })

  it('leaves source rows and their actual coordinates untouched', () => {
    const points = [
      point(0, 10, null, 'unavailable'),
      point(10, 20, 10),
      point(20, 30, 10, 'held'),
      point(30, 40, 90),
    ]
    const before = structuredClone(points)
    points.forEach(Object.freeze)
    Object.freeze(points)

    buildCumulativeTrendGeometry(points, 40)

    expect(points).toEqual(before)
    expect(points.map((row) => row.x)).toEqual([5, 15, 25, 35])
    expect(points).toHaveLength(4)
  })
})
