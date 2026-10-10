import { describe, expect, it } from 'vitest'

import type { ObservedRecallVsFsrsRow } from './historical-presentation'
import { buildCumulativeRecallPresentation } from './cumulative-recall-presentation'

function row(
  index: number,
  recalledCount = 0,
  pairedReviews = 0,
  fsrsEstimate: number | null = null,
): ObservedRecallVsFsrsRow {
  const observedRecall =
    pairedReviews > 0 ? recalledCount / pairedReviews : null
  return {
    id: `interval-${index}`,
    bucketStart: `2026-08-0${index}T00:00:00.000Z`,
    bucketEnd: `2026-08-0${index}T23:59:59.999Z`,
    isPartial: index === 5,
    recalledCount,
    pairedReviews,
    observedRecall,
    fsrsEstimate,
    difference:
      observedRecall !== null && fsrsEstimate !== null
        ? observedRecall - fsrsEstimate
        : null,
    provenance: 'reconstructed',
    evidence: pairedReviews > 0 ? 'measured' : 'not-measured',
  }
}

describe('buildCumulativeRecallPresentation', () => {
  it('pools exact shared pairs and unrounded estimates to the selected-period total', () => {
    const model = buildCumulativeRecallPresentation([
      row(1, 4, 4, 0.79),
      row(2, 44, 48, 43 / 48),
    ])

    expect(model.totals.pairedReviews).toBe(52)
    expect(model.totals.recalledCount).toBe(48)
    expect(model.totals.estimateSum).toBeCloseTo(46.16, 12)
    expect(model.totals.observedRecall).toBe(48 / 52)
    expect(model.totals.fsrsEstimate).toBeCloseTo(46.16 / 52, 14)
    expect(model.totals.difference).toBeCloseTo(48 / 52 - 46.16 / 52, 14)
    expect(model.rows[1]).toMatchObject({
      cumulativePairedReviews: 52,
      cumulativeRecalledCount: 48,
      cumulativeObservedRecall: model.totals.observedRecall,
      cumulativeFsrsEstimate: model.totals.fsrsEstimate,
      cumulativeDifference: model.totals.difference,
      state: 'updated',
    })
    expect(model.rows[1]!.cumulativeEstimateSum).toBe(model.totals.estimateSum)
  })

  it('keeps leading rows unavailable and internal/trailing rows held with the actual updated interval', () => {
    const source = [row(1), row(2, 0, 2, 0), row(3), row(4, 1, 1, 0.4), row(5)]
    const before = structuredClone(source)
    const model = buildCumulativeRecallPresentation(source)

    expect(model.rows.map((item) => item.state)).toEqual([
      'unavailable',
      'updated',
      'held',
      'updated',
      'held',
    ])
    expect(model.rows[0]).toMatchObject({
      cumulativePairedReviews: 0,
      cumulativeObservedRecall: null,
      cumulativeFsrsEstimate: null,
      cumulativeDifference: null,
      lastUpdatedInterval: null,
    })
    expect(model.rows[2]).toMatchObject({
      pairedReviews: 0,
      cumulativePairedReviews: 2,
      cumulativeObservedRecall: 0,
      cumulativeFsrsEstimate: 0,
      lastUpdatedInterval: {
        id: source[1]!.id,
        bucketStart: source[1]!.bucketStart,
        bucketEnd: source[1]!.bucketEnd,
      },
    })
    expect(model.rows[4]).toMatchObject({
      cumulativePairedReviews: 3,
      cumulativeRecalledCount: 1,
      cumulativeObservedRecall: 1 / 3,
      lastUpdatedInterval: {
        id: source[3]!.id,
        bucketStart: source[3]!.bucketStart,
        bucketEnd: source[3]!.bucketEnd,
      },
    })
    model.rows.forEach((item, index) =>
      expect(item).toMatchObject(source[index]!),
    )
    expect(source).toEqual(before)
  })

  it('does not crop or extend the service-owned paired-history frame', () => {
    const source = [row(2, 1, 1, 0.2), row(3), row(4), row(5)]
    const model = buildCumulativeRecallPresentation(source)

    expect(
      model.rows.map(({ id, bucketStart, bucketEnd, isPartial }) => ({
        id,
        bucketStart,
        bucketEnd,
        isPartial,
      })),
    ).toEqual(
      source.map(({ id, bucketStart, bucketEnd, isPartial }) => ({
        id,
        bucketStart,
        bucketEnd,
        isPartial,
      })),
    )
    expect(model.rows.at(-1)!.cumulativePairedReviews).toBe(1)
    expect(model.rows.at(-1)!.state).toBe('held')
    expect(model.rows.at(-1)!.evidence).toBe('not-measured')
  })

  it('distinguishes all-empty and empty-input populations from measured failures', () => {
    for (const source of [[], [row(1), row(2)]]) {
      const model = buildCumulativeRecallPresentation(source)
      expect(model.totals).toEqual({
        pairedReviews: 0,
        recalledCount: 0,
        estimateSum: 0,
        observedRecall: null,
        fsrsEstimate: null,
        difference: null,
      })
      expect(model.rows.every((item) => item.state === 'unavailable')).toBe(
        true,
      )
    }
    expect(
      buildCumulativeRecallPresentation([row(1, 0, 1, 0.7)]).totals
        .observedRecall,
    ).toBe(0)
  })

  it('weights unequal populations instead of averaging interval percentages', () => {
    const model = buildCumulativeRecallPresentation([
      row(1, 1, 1, 0.1),
      row(2, 0, 9, 0.9),
    ])
    expect(model.totals.observedRecall).toBe(0.1)
    expect(model.totals.fsrsEstimate).toBe(0.82)
    expect(model.totals.difference).toBe(0.1 - 0.82)
    expect(model.rows[1]!.observedRecall).toBe(0)
    expect(model.rows[1]!.fsrsEstimate).toBe(0.9)
  })
})
