import { describe, expect, it } from 'vitest'
import {
  boxViewport,
  containsRow,
  constrainViewport,
  revealRow,
  zoomViewport,
  type RetentionRow,
} from './retention-map-model'

const full = {
  duration: [1, 100] as [number, number],
  recall: [0, 1] as [number, number],
}
const row = { targetDurationDays: 90, retrievability: 0.9 } as RetentionRow

describe('retention viewport', () => {
  it('uniformly fits reversed boxes and preserves the entire selected extent', () => {
    const inverseX = (x: number) => 100 ** (x / 400)
    const inverseY = (y: number) => 1 - y / 200
    const a = { x: 50, y: 50 },
      b = { x: 200, y: 100 }
    const fitted = boxViewport(full, full, 400, 200, a, b, inverseX, inverseY)!
    expect(boxViewport(full, full, 400, 200, b, a, inverseX, inverseY)).toEqual(
      fitted,
    )
    expect(fitted.duration[0]).toBeLessThanOrEqual(inverseX(a.x))
    expect(fitted.duration[1]).toBeGreaterThanOrEqual(inverseX(b.x))
    expect(fitted.recall[0]).toBeLessThanOrEqual(inverseY(b.y))
    expect(fitted.recall[1]).toBeGreaterThanOrEqual(inverseY(a.y))
    expect(
      boxViewport(
        full,
        full,
        400,
        200,
        a,
        { x: 51, y: 100 },
        inverseX,
        inverseY,
      ),
    ).toBeNull()
  })
  it('caps magnification, constrains panning and reveals an offscreen row', () => {
    const zoomed = zoomViewport(full, full, 100)
    expect(Math.log(zoomed.duration[1] / zoomed.duration[0])).toBeCloseTo(
      Math.log(100) / 16,
    )
    expect(zoomed.recall[1] - zoomed.recall[0]).toBeCloseTo(1 / 16)
    expect(containsRow(zoomed, row)).toBe(false)
    expect(containsRow(revealRow(zoomed, full, row), row)).toBe(true)
    const constrained = constrainViewport(
      { duration: [0.01, 1000], recall: [-1, 3] },
      full,
    )
    expect(constrained.duration[0]).toBeCloseTo(1)
    expect(constrained.duration[1]).toBeCloseTo(100)
    expect(constrained.recall).toEqual(full.recall)
  })
})
