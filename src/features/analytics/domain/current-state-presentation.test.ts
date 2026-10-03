import { describe, expect, it } from 'vitest'

import { createInitialFsrsCard, scheduleReview } from '@/lib/fsrs'

import { buildCurrentStateAnalyticsViews } from './current-state-presentation'

const asOf = new Date('2026-08-22T12:00:00.000Z')

describe('current-state Analytics presentation', () => {
  it('retains the full eligible Retention Map cohort in deterministic priority order and exposes all six regions', () => {
    const views = buildCurrentStateAnalyticsViews(
      [
        input('strong', { targetDurationDays: 14, retrievability: 0.9 }),
        input('on-target-short', {
          targetDurationDays: 3,
          retrievability: 0.95,
        }),
        input('watch-durable', {
          targetDurationDays: 14,
          retrievability: 0.85,
        }),
        input('watch-short', { targetDurationDays: 3, retrievability: 0.85 }),
        input('risk-durable', { targetDurationDays: 14, retrievability: 0.6 }),
        input('risk-short', { targetDurationDays: 3, retrievability: 0.7 }),
      ],
      { asOf, targetRetention: 0.9, timeZone: 'UTC' },
    )

    expect(views.retentionMap.totalEligible).toBe(6)
    expect(views.retentionMap.statusCounts).toEqual({
      onTarget: 2,
      watch: 2,
      needsAttention: 2,
    })
    expect(views.retentionMap.rows.map((row) => row.slug)).toEqual([
      'risk-durable',
      'risk-short',
      'watch-short',
      'watch-durable',
      'on-target-short',
      'strong',
    ])
    expect(views.retentionMap.rows.map((row) => row.region)).toEqual([
      'needs-attention',
      'highest-attention',
      'watch-closely',
      'near-target-more-durable',
      'on-target-now',
      'strongest-position',
    ])
    expect(views.retentionMap.durationScale.domain).toEqual([1, 100])
    expect(views.retentionMap.recallScale.domain).toEqual([0.45, 1])
  })

  it('caps Retention Map rows at 30 while retaining the full eligible count', () => {
    const views = buildCurrentStateAnalyticsViews(
      Array.from({ length: 31 }, (_, index) =>
        input(`risk-${String(index).padStart(2, '0')}`, {
          retrievability: 0.7,
          targetDurationDays: index + 1,
        }),
      ),
      { asOf, targetRetention: 0.9, timeZone: 'UTC' },
    )

    expect(views.retentionMap.totalEligible).toBe(31)
    expect(views.retentionMap.rows).toHaveLength(30)
    expect(views.retentionMap.rows[0]).toMatchObject({
      rank: 1,
      slug: 'risk-00',
    })
    expect(views.retentionMap.rows.at(-1)).toMatchObject({
      rank: 30,
      slug: 'risk-29',
    })
    expect(
      views.retentionMap.rows.find((row) => row.slug === 'risk-30'),
    ).toBeUndefined()
  })

  it('orders on-target rows by duration and title rather than surplus recall', () => {
    const views = buildCurrentStateAnalyticsViews(
      [
        input('alpha', { retrievability: 0.99, targetDurationDays: 3 }),
        input('zeta', { retrievability: 0.9, targetDurationDays: 3 }),
      ],
      { asOf, targetRetention: 0.9, timeZone: 'UTC' },
    )

    expect(views.retentionMap.rows.map((row) => row.slug)).toEqual([
      'alpha',
      'zeta',
    ])
  })

  it('builds Memory Signals from only supported current signals with transparent severity lanes', () => {
    const views = buildCurrentStateAnalyticsViews(
      [
        input('below', { retrievability: 0.7, targetDurationDays: 10 }),
        input('overdue', {
          dueAt: new Date('2026-08-20T12:00:00.000Z'),
          retrievability: 0.95,
          targetDurationDays: 10,
        }),
        input('durability', { retrievability: 0.95, targetDurationDays: 3 }),
        input('due-now', {
          dueAt: asOf,
          retrievability: 0.95,
          targetDurationDays: 10,
        }),
      ],
      { asOf, targetRetention: 0.9, timeZone: 'UTC' },
    )

    expect(views.memorySignals.totalQualifying).toBe(3)
    expect(views.memorySignals.rows.map((row) => row.slug)).toEqual([
      'below',
      'overdue',
      'durability',
    ])
    expect(views.memorySignals.rows[0]?.reasons).toEqual([
      {
        kind: 'below-recall',
        label: 'Estimated recall 70% · below FSRS target',
      },
    ])
    expect(views.memorySignals.rows[1]?.reasons).toEqual([
      { kind: 'overdue', label: 'Overdue · 2d' },
    ])
    expect(views.memorySignals.rows[2]?.reasons).toEqual([
      { kind: 'low-durability', label: 'Low durability · 3d' },
    ])
  })

  it('does not call an earlier same-local-day due time overdue', () => {
    const views = buildCurrentStateAnalyticsViews(
      [
        input('same-day', {
          dueAt: new Date('2026-08-22T14:00:00.000Z'),
          retrievability: 0.95,
          targetDurationDays: 10,
        }),
      ],
      {
        asOf: new Date('2026-08-22T16:00:00.000Z'),
        targetRetention: 0.9,
        timeZone: 'America/New_York',
      },
    )

    expect(views.memorySignals.totalQualifying).toBe(0)
    expect(views.memorySignals.rows).toEqual([])
  })

  it('calls a prior local day overdue across a sub-24-hour boundary', () => {
    const views = buildCurrentStateAnalyticsViews(
      [
        input('prior-day', {
          dueAt: new Date('2026-08-22T03:30:00.000Z'),
          retrievability: 0.95,
          targetDurationDays: 10,
        }),
      ],
      {
        asOf: new Date('2026-08-22T16:00:00.000Z'),
        targetRetention: 0.9,
        timeZone: 'America/New_York',
      },
    )

    expect(views.memorySignals.rows[0]?.reasons).toEqual([
      { kind: 'overdue', label: 'Overdue · 1d' },
    ])
  })
})

function input(
  slug: string,
  overrides: Partial<{
    dueAt: Date
    retrievability: number
    targetDurationDays: number
  }> = {},
) {
  const lastReviewAt = new Date('2026-08-20T12:00:00.000Z')
  const card = scheduleReview(
    createInitialFsrsCard(lastReviewAt),
    'easy',
    lastReviewAt,
  ).card

  return {
    card,
    cardId: `${slug}-card`,
    difficulty: 5,
    dueAt: new Date('2026-08-25T12:00:00.000Z'),
    lapseCount: 0,
    lastReviewAt,
    retrievability: 0.95,
    slug,
    suspended: false,
    targetDurationDays: 10,
    title: slug,
    ...overrides,
  }
}
