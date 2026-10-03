import { describe, expect, it } from 'vitest'

import {
  buildAdaptiveDurationScale,
  buildAdaptivePercentageDomain,
  buildLogDurationDomain,
  buildMagnitudeScale,
  buildMagnitudeDomain,
} from './analytics-scales'

describe('analytics scales', () => {
  it('creates a deterministic, disclosed percentage domain around visible values', () => {
    expect(buildAdaptivePercentageDomain([0.7, 0.9], [0.8])).toEqual([
      0.65, 0.95,
    ])
  })

  it('keeps a 25-point window for an equal percentage series', () => {
    expect(buildAdaptivePercentageDomain([0.8])).toEqual([0.65, 0.95])
  })

  it('uses a zero baseline and a meaningful domain for zero-only magnitude data', () => {
    expect(buildMagnitudeDomain([0, 0])).toEqual([0, 1])
    expect(buildMagnitudeScale([0, 0]).ticks).toEqual([0, 1])
  })

  it('exposes four or five deterministic nice-number magnitude intervals', () => {
    expect(buildMagnitudeScale([12])).toEqual({
      domain: [0, 20],
      ticks: [0, 5, 10, 15, 20],
    })
    expect(buildMagnitudeScale([46])).toEqual({
      domain: [0, 100],
      ticks: [0, 20, 40, 60, 80, 100],
    })
  })

  it('keeps the approved small-count domain with whole-number ticks', () => {
    expect(buildMagnitudeScale([1])).toEqual({
      domain: [0, 2],
      ticks: [0, 1, 2],
    })
    expect(buildMagnitudeScale([2])).toEqual({
      domain: [0, 5],
      ticks: [0, 1, 2, 3, 4, 5],
    })
  })

  it('builds a centered adaptive-duration scale with deterministic nice ticks', () => {
    expect(buildAdaptiveDurationScale([3, 5])).toEqual({
      domain: [2.5, 5.5],
      ticks: [2.5, 3, 3.5, 4, 4.5, 5, 5.5],
    })
  })

  it('fits the approved median and quartile extent without transferring negative lower padding upward', () => {
    expect(buildAdaptiveDurationScale([0.5, 1, 8, 16, 32, 44])).toEqual({
      domain: [0, 50],
      ticks: [0, 10, 20, 30, 40, 50],
    })
  })

  it('includes every finite duration extreme across sub-day and large-value series', () => {
    for (const values of [
      [0.1, 0.4],
      [12, 13],
      [900, 1400],
      [3, 40, 0.2, 44],
    ]) {
      const scale = buildAdaptiveDurationScale(values)
      expect(scale.domain[0]).toBeLessThanOrEqual(Math.min(...values))
      expect(scale.domain[1]).toBeGreaterThanOrEqual(Math.max(...values))
      expect(scale.domain[1] - scale.domain[0]).toBeGreaterThanOrEqual(2)
      expect(scale.ticks[0]).toBe(scale.domain[0])
      expect(scale.ticks.at(-1)).toBe(scale.domain[1])
    }
  })

  it('keeps the minimum duration window when values are equal or clamped at zero', () => {
    expect(buildAdaptiveDurationScale([7])).toEqual({
      domain: [6, 8],
      ticks: [6, 6.5, 7, 7.5, 8],
    })
    expect(buildAdaptiveDurationScale([0, 0.2])).toEqual({
      domain: [0, 2],
      ticks: [0, 0.5, 1, 1.5, 2],
    })
  })

  it('falls back to a stable duration scale when no finite value is visible', () => {
    expect(buildAdaptiveDurationScale([Number.NaN, Infinity])).toEqual({
      domain: [0, 2],
      ticks: [0, 0.5, 1, 1.5, 2],
    })
    expect(buildAdaptiveDurationScale([])).toEqual({
      domain: [0, 2],
      ticks: [0, 0.5, 1, 1.5, 2],
    })
    expect(buildAdaptiveDurationScale([7, Number.NaN, -Infinity])).toEqual(
      buildAdaptiveDurationScale([7]),
    )
    expect(buildAdaptiveDurationScale([0.5])).toEqual({
      domain: [0, 2],
      ticks: [0, 0.5, 1, 1.5, 2],
    })
  })

  it('retains percentage boundary padding and unrelated magnitude and log policies', () => {
    expect(buildAdaptivePercentageDomain([0, 0.2])).toEqual([0, 0.3])
    expect(buildAdaptivePercentageDomain([0.8, 1])).toEqual([0.7, 1])
    expect(buildMagnitudeScale([44])).toEqual({
      domain: [0, 50],
      ticks: [0, 10, 20, 30, 40, 50],
    })
    expect(buildLogDurationDomain([0.5, 44])).toEqual([0.1, 100])
  })

  it('includes the seven-day benchmark in a logarithmic duration domain', () => {
    expect(buildLogDurationDomain([2, 16])).toEqual([1, 100])
  })
})
