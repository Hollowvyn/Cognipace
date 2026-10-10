import { describe, expect, it } from 'vitest'
import { normalizeFsrsSchedulingOptions } from '@/lib/fsrs'

import { buildAnalyticsTimeFrame } from './analytics-time'
import { buildAnalyticsBucketsFromTimeFrame } from './analytics-range-policy'
import {
  buildHistoricalAnalyticsViews,
  type HistoricalAnalyticsReviewEvent,
} from './historical-presentation'
import { buildTimeTargetPresentation } from './time-target-presentation'

const targets = { easy: 20, medium: 30, hard: 40 }

function event(
  id: string,
  overrides: Partial<HistoricalAnalyticsReviewEvent> = {},
): HistoricalAnalyticsReviewEvent {
  return {
    id,
    cardId: id,
    problemSlug: id,
    reviewedAt: new Date('2026-08-01T12:00:00Z'),
    rating: 'good',
    fsrsReviewLog: null,
    topicLabels: [],
    problemDifficulty: 'easy',
    elapsedSeconds: 600,
    ...overrides,
  }
}

function cohort(events: HistoricalAnalyticsReviewEvent[]) {
  const timeFrame = buildAnalyticsTimeFrame({
    asOf: new Date('2026-08-02T23:59:59.999Z'),
    requestedDays: 30,
    timeZone: 'UTC',
  })
  return buildHistoricalAnalyticsViews(events, {
    start: new Date(timeFrame.periodStart),
    end: new Date(timeFrame.asOf),
    buckets: buildAnalyticsBucketsFromTimeFrame(timeFrame),
    timeFrame,
    timeZone: 'UTC',
    fsrsOptions: normalizeFsrsSchedulingOptions({ targetRetention: 0.9 }),
  }).problemSolving.cohorts.newProblems
}

describe('buildTimeTargetPresentation', () => {
  it('uses period medians to calculate exact under, over, and on-target differences', () => {
    const model = buildTimeTargetPresentation(
      cohort([
        event('easy'),
        event('medium', { problemDifficulty: 'medium', elapsedSeconds: 2700 }),
        event('hard', { problemDifficulty: 'hard', elapsedSeconds: 2400 }),
      ]),
      targets,
    )

    expect(model.rows).toMatchObject([
      {
        difficulty: 'easy',
        medianSeconds: 600,
        targetMinutes: 20,
        percentOfTarget: 50,
        differenceMinutes: -10,
        differencePercent: -50,
        timedAssessments: 1,
        eligibleAssessments: 1,
      },
      {
        difficulty: 'medium',
        medianSeconds: 2700,
        targetMinutes: 30,
        percentOfTarget: 150,
        differenceMinutes: 15,
        differencePercent: 50,
      },
      {
        difficulty: 'hard',
        medianSeconds: 2400,
        targetMinutes: 40,
        percentOfTarget: 100,
        differenceMinutes: 0,
        differencePercent: 0,
      },
    ])
    expect(model.percentDomain[0]).toBe(0)
    expect(model.percentDomain[1]).toBeGreaterThan(150)
    expect(model.subset).toBe('all')
    expect(model.coverage).toEqual({
      timedAssessments: 3,
      eligibleAssessments: 3,
    })
  })

  it('keeps wholly missing recorded durations unavailable rather than zero', () => {
    const model = buildTimeTargetPresentation(
      cohort([event('missing', { elapsedSeconds: null })]),
      targets,
    )
    expect(model.rows[0]).toMatchObject({
      medianSeconds: null,
      percentOfTarget: null,
      differenceMinutes: null,
      differencePercent: null,
      timedAssessments: 0,
      eligibleAssessments: 1,
    })
    expect(model.rows[1]).toMatchObject({
      medianSeconds: null,
      percentOfTarget: null,
      eligibleAssessments: 0,
    })
    expect(model.coverage).toEqual({
      timedAssessments: 0,
      eligibleAssessments: 1,
    })
    expect(model.percentDomain[1]).toBeGreaterThanOrEqual(100)
  })

  it('retains exact per-difficulty and Unknown coverage without inferring a pooled median', () => {
    const model = buildTimeTargetPresentation(
      cohort([
        event('easy-1', { elapsedSeconds: 60 }),
        event('easy-2', { elapsedSeconds: 120 }),
        event('easy-3', { elapsedSeconds: 180 }),
        event('missing', { elapsedSeconds: null }),
        event('hard', { problemDifficulty: 'hard', elapsedSeconds: 3600 }),
        event('unclassified', {
          problemDifficulty: 'unknown',
          elapsedSeconds: 300,
        }),
      ]),
      targets,
    )

    expect(model.coverage).toEqual({
      timedAssessments: 5,
      eligibleAssessments: 6,
    })
    expect(model.rows[0]).toMatchObject({
      timedAssessments: 3,
      eligibleAssessments: 4,
      medianSeconds: 120,
    })
    expect(model.rows[2]).toMatchObject({
      timedAssessments: 1,
      eligibleAssessments: 1,
      medianSeconds: 3600,
    })
    expect(model.unclassified).toMatchObject({
      timedAssessments: 1,
      eligibleAssessments: 1,
      medianSeconds: 300,
    })
    expect(model.rows.map((row) => row.difficulty)).toEqual([
      'easy',
      'medium',
      'hard',
    ])
    expect(model.coverage).not.toHaveProperty('medianSeconds')
  })

  it('preserves all timing eligibility and the rating-defined successful subset', () => {
    const source = cohort([
      event('invalid', { rating: 'invalid', elapsedSeconds: 600 }),
      event('again', { rating: 'again', elapsedSeconds: 900 }),
      event('hard', { rating: 'hard', elapsedSeconds: 1200 }),
      event('good', { rating: 'good', elapsedSeconds: 1800 }),
      event('easy', { rating: 'easy', elapsedSeconds: null }),
    ])
    const all = buildTimeTargetPresentation(source, targets)
    const successful = buildTimeTargetPresentation(
      source,
      targets,
      'successful',
    )

    expect(all.coverage).toEqual({
      timedAssessments: 4,
      eligibleAssessments: 5,
    })
    expect(all.rows[0]!.medianSeconds).toBe(1050)
    expect(successful.coverage).toEqual({
      timedAssessments: 2,
      eligibleAssessments: 3,
    })
    expect(successful.rows[0]!.medianSeconds).toBe(1500)
    expect(successful.subset).toBe('successful')
  })

  it('changes only target-relative values when current Settings allowances change', () => {
    const source = cohort([event('timed')])
    const before = structuredClone(source)
    const oldTarget = buildTimeTargetPresentation(source, targets)
    const newTarget = buildTimeTargetPresentation(source, {
      ...targets,
      easy: 10,
    })

    expect(oldTarget.rows[0]!.percentOfTarget).toBe(50)
    expect(newTarget.rows[0]!.percentOfTarget).toBe(100)
    expect(newTarget.rows[0]!.medianSeconds).toBe(600)
    expect(newTarget.rows[0]!.totalSeconds).toBe(600)
    expect(newTarget.coverage).toEqual(oldTarget.coverage)
    expect(source).toEqual(before)
  })

  it('fits every uncapped ratio while retaining the target reference for an empty cohort', () => {
    const empty = buildTimeTargetPresentation(cohort([]), targets)
    expect(empty.coverage).toEqual({
      timedAssessments: 0,
      eligibleAssessments: 0,
    })
    expect(empty.percentDomain[1]).toBeGreaterThanOrEqual(100)
    expect(empty.rows.every((row) => row.percentOfTarget === null)).toBe(true)
    const overtime = buildTimeTargetPresentation(
      cohort([event('overtime', { elapsedSeconds: 12000 })]),
      targets,
    )
    expect(overtime.rows[0]!.percentOfTarget).toBe(1000)
    expect(overtime.percentDomain[1]).toBeGreaterThan(1000)
  })
})
