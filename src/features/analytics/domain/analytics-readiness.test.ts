import { describe, expect, it } from 'vitest'

import {
  calculateAnalyticsReadiness,
  findRichestReadyRange,
} from './analytics-readiness'

const keys = (count: number) =>
  Array.from({ length: count }, (_, index) => `b${index + 1}`)

describe('analytics readiness', () => {
  it.each([
    [12, 12],
    [30, 24],
    [120, 45],
  ] as const)(
    'caps All time policy to its actual %s-day span with a %s assessment minimum',
    (availableDays, minimumAssessments) => {
      const readiness = calculateAnalyticsReadiness({
        requestedDays: null,
        availableDays,
        grouping: { unit: 'day', step: 1 },
        evidenceCounts: [1],
        bucketKeys: ['2026-10-05'],
      })
      expect(readiness).toMatchObject({
        requestedDays: null,
        policyDays: Math.min(availableDays, 90),
        availableDays,
        minimumAssessments,
      })
    },
  )
  it('reports the shared evidence measurements alongside readiness', () => {
    const readiness = calculateAnalyticsReadiness({
      requestedDays: 30 as const,
      evidenceCounts: [0, 0, 4, 2, 0, 3, 0, 0, 5, 1],
      bucketKeys: keys(10),
    })

    expect(readiness).toMatchObject({
      requestedBuckets: 10,
      effectiveBuckets: 8,
      assessments: 15,
      activeBuckets: 5,
      longestGap: 2,
      gapRuns: 2,
    })
  })

  it('trims leading empty buckets and reports explainable measurements', () => {
    const readiness = calculateAnalyticsReadiness({
      requestedDays: 30,
      evidenceCounts: [0, 0, 4, 2, 0, 3, 0, 0, 5, 1],
      bucketKeys: keys(10),
    })

    expect(readiness).toMatchObject({
      requestedDays: 30,
      bucketDays: 3,
      requestedBuckets: 10,
      effectiveBuckets: 8,
      effectiveStart: 'b3',
      assessments: 15,
      activeBuckets: 5,
      longestGap: 2,
      gapRuns: 2,
      maximumGap: 2,
      maximumGapRuns: 2,
    })
    expect(readiness.failingReasons).toEqual([
      'insufficient-assessments',
      'insufficient-active-buckets',
    ])
    expect(readiness.ready).toBe(false)
  })

  it('reports too many gaps for fragmented 14-day evidence', () => {
    const readiness = calculateAnalyticsReadiness({
      requestedDays: 14,
      evidenceCounts: [3, 0, 0, 3, 0, 0, 3, 0, 0, 3, 0, 0, 3, 3],
      bucketKeys: keys(14),
    })

    expect(readiness.ready).toBe(false)
    expect(readiness.failingReasons).toEqual([
      'insufficient-active-buckets',
      'too-many-gaps',
    ])
  })

  it('accepts a 14-day range with two consecutive empty buckets', () => {
    const readiness = calculateAnalyticsReadiness({
      requestedDays: 14,
      evidenceCounts: [2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2],
      bucketKeys: keys(14),
    })

    expect(readiness).toMatchObject({
      ready: true,
      effectiveBuckets: 14,
      longestGap: 2,
      gapRuns: 1,
    })
    expect(readiness.failingReasons).toEqual([])
  })

  it('finds the largest passing range regardless of input order', () => {
    const input = [
      { range: 90, ready: false },
      { range: 14, ready: true },
      { range: 30, ready: true },
    ]
    const originalInput = structuredClone(input)

    expect(findRichestReadyRange(input)).toBe(30)
    expect(input).toEqual(originalInput)
  })

  it('returns null when no configured range passes', () => {
    expect(
      findRichestReadyRange([
        { range: 90, ready: false },
        { range: 14, ready: false },
        { range: 30, ready: false },
      ]),
    ).toBeNull()
  })

  it('reports no evidence without inventing an effective start', () => {
    const readiness = calculateAnalyticsReadiness({
      requestedDays: 14,
      evidenceCounts: Array(14).fill(0),
      bucketKeys: keys(14),
    })

    expect(readiness.effectiveStart).toBeNull()
    expect(readiness.effectiveBuckets).toBe(0)
    expect(readiness.failingReasons).toEqual([
      'no-evidence',
      'insufficient-span',
      'insufficient-assessments',
    ])
  })

  it('rejects mismatched keys and counts', () => {
    expect(() =>
      calculateAnalyticsReadiness({
        requestedDays: 14,
        evidenceCounts: [1],
        bucketKeys: ['b1', 'b2'],
      }),
    ).toThrow(RangeError)
  })

  it('accepts empty aligned evidence as unavailable All time history', () => {
    expect(
      calculateAnalyticsReadiness({
        requestedDays: null,
        grouping: null,
        availableDays: 0,
        evidenceCounts: [],
        bucketKeys: [],
      }),
    ).toMatchObject({
      ready: false,
      requestedDays: null,
      policyDays: 1,
      requestedBuckets: 0,
      assessments: 0,
      minimumAssessments: 12,
      failingReasons: ['no-evidence', 'insufficient-assessments'],
    })
  })

  it('rejects negative, non-integer, and unsafe integer counts', () => {
    for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        calculateAnalyticsReadiness({
          requestedDays: 14,
          evidenceCounts: [count],
          bucketKeys: ['b1'],
        }),
      ).toThrow(RangeError)
    }
  })

  it('reports every failed gate in stable order', () => {
    const readiness = calculateAnalyticsReadiness({
      requestedDays: 14,
      evidenceCounts: [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0],
      bucketKeys: keys(14),
    })

    expect(readiness).toMatchObject({
      effectiveBuckets: 8,
      longestGap: 3,
      gapRuns: 3,
    })
    expect(readiness.failingReasons).toEqual([
      'insufficient-span',
      'insufficient-assessments',
      'insufficient-active-buckets',
      'gap-too-long',
      'too-many-gaps',
    ])
  })
})
