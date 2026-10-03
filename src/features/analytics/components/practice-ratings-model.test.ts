import { describe, expect, it } from 'vitest'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { buildPracticeRatingsRows } from './practice-ratings-model'

type PracticeRow = AnalyticsViews['practiceRhythm']['rows'][number]
type RatingsRow = AnalyticsViews['ratingsMix']['rows'][number]

function practice(
  day: number,
  overrides: Partial<PracticeRow> = {},
): PracticeRow {
  const date = `2026-09-${String(day).padStart(2, '0')}`
  return {
    id: `day-${day}`,
    bucketStart: date,
    bucketEnd: date,
    isPartial: false,
    completedReviews: 3,
    validRatings: 2,
    goodEasy: 1,
    reviewSuccess: 0.5,
    evidence: 'measured',
    ...overrides,
  }
}
function ratings(day: number, overrides: Partial<RatingsRow> = {}): RatingsRow {
  const row = practice(day)
  return {
    id: row.id,
    bucketStart: row.bucketStart,
    bucketEnd: row.bucketEnd,
    isPartial: false,
    again: 1,
    hard: 0,
    good: 1,
    easy: 0,
    againShare: 0.5,
    hardShare: 0,
    goodShare: 0.5,
    easyShare: 0,
    validRatings: 2,
    challengingReviews: 1,
    evidence: 'measured',
    ...overrides,
  }
}
const emptyPractice = (day: number) =>
  practice(day, {
    completedReviews: 0,
    validRatings: 0,
    goodEasy: 0,
    reviewSuccess: null,
    evidence: 'not-measured',
  })
const emptyRatings = (day: number) =>
  ratings(day, {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    validRatings: 0,
    challengingReviews: 0,
    againShare: null,
    hardShare: null,
    goodShare: null,
    easyShare: null,
    evidence: 'not-measured',
  })

describe('merged Practice Rhythm intervals', () => {
  it('joins exact identity rather than order and retains frozen original objects', () => {
    const p = Object.freeze([
      Object.freeze(practice(3)),
      Object.freeze(practice(1)),
    ])
    const r = Object.freeze([
      Object.freeze(ratings(1)),
      Object.freeze(ratings(3)),
    ])
    const rows = buildPracticeRatingsRows(p, r)
    expect(rows.map((row) => row.bucketStart)).toEqual([
      '2026-09-01',
      '2026-09-03',
    ])
    expect(rows[0]?.practice).toBe(p[1])
    expect(rows[0]?.ratings).toBe(r[0])
    expect(rows[1]?.practice).toBe(p[0])
    expect(rows[1]?.ratings).toBe(r[1])
    expect(rows[0]?.id).toBe(
      JSON.stringify(['day-1', '2026-09-01', '2026-09-01']),
    )
    expect(p.map((row) => row.bucketStart)).toEqual([
      '2026-09-03',
      '2026-09-01',
    ])
  })

  it('keeps unequal boundaries and IDs separate with unavailable counterparts', () => {
    const p = practice(1, { id: 'same' })
    const r = ratings(1, { id: 'same', bucketEnd: '2026-09-03' })
    const other = ratings(1, { id: 'different' })
    const rows = buildPracticeRatingsRows([p], [r, other])
    expect(rows).toHaveLength(3)
    expect(rows.find((row) => row.practice === p)).toMatchObject({
      ratings: null,
      completedReviews: 3,
    })
    expect(rows.find((row) => row.ratings === r)).toMatchObject({
      practice: null,
      completedReviews: null,
    })
    expect(new Set(rows.map((row) => row.id)).size).toBe(3)
  })

  it('trims only unsupported outer rows and keeps internal gaps and known zeros', () => {
    const rows = buildPracticeRatingsRows(
      [
        emptyPractice(1),
        practice(2, { validRatings: 0, reviewSuccess: null }),
        emptyPractice(3),
        practice(4, { completedReviews: 0, validRatings: 0, reviewSuccess: 0 }),
        emptyPractice(5),
      ],
      [emptyRatings(1), emptyRatings(3), emptyRatings(4), emptyRatings(5)],
    )
    expect(rows.map((row) => row.bucketStart)).toEqual([
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ])
    expect(rows.map((row) => row.completedReviews)).toEqual([3, 0, 0])
    expect(rows[2]?.practice?.reviewSuccess).toBe(0)
  })

  it('supports ratings-only and practice-rating-only edges independently', () => {
    const rows = buildPracticeRatingsRows(
      [
        practice(1, { completedReviews: 0, reviewSuccess: null }),
        emptyPractice(2),
      ],
      [ratings(3)],
    )
    expect(rows.map((row) => row.bucketStart)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ])
    expect(rows[2]?.completedReviews).toBeNull()
  })

  it('returns no observations for wholly unsupported history, including nonfinite success', () => {
    expect(
      buildPracticeRatingsRows(
        [
          emptyPractice(1),
          practice(2, {
            completedReviews: 0,
            validRatings: 0,
            reviewSuccess: Number.NaN,
          }),
        ],
        [emptyRatings(3)],
      ),
    ).toEqual([])
    expect(buildPracticeRatingsRows([], [])).toEqual([])
  })
})
