import { describe, expect, it } from 'vitest'

import {
  createFsrsSchedulerProfile,
  createInitialFsrsCard,
  scheduleReview,
  scheduleReviewWithProfile,
} from '../scheduler/review-scheduler'
import type { FsrsCardSnapshot } from './card-snapshot'
import { reviewRatings } from './review-rating'
import type { FsrsSchedulerProfile } from './scheduler-profile'
import {
  assertFsrsReviewLogMatchesPreCard,
  isFsrsReviewLogSnapshot,
  parseFsrsReviewLogSnapshot,
  parseSerializedFsrsReviewLogSnapshot,
  serializeFsrsReviewLogSnapshot,
  type FsrsReviewLogSnapshot,
} from './review-log-snapshot'

describe('FSRS review log snapshot contracts', () => {
  it('serializes and parses stored review logs through a typed boundary', () => {
    const log = createReviewLogSnapshot()
    const serialized = serializeFsrsReviewLogSnapshot(log)

    expect(parseSerializedFsrsReviewLogSnapshot(serialized)).toEqual(log)
    expect(parseFsrsReviewLogSnapshot(JSON.parse(serialized))).toEqual(log)
    expect(isFsrsReviewLogSnapshot(log)).toBe(true)
  })

  it('rejects malformed review log snapshots', () => {
    const log = createReviewLogSnapshot()

    for (const malformedLog of [
      { ...log, rating: 'manual' },
      { ...log, dueAt: '2026-01-02' },
      { ...log, reviewedAt: '2026-01-01' },
    ]) {
      expect(isFsrsReviewLogSnapshot(malformedLog)).toBe(false)
    }

    expect(() =>
      parseFsrsReviewLogSnapshot({ ...log, stability: Number.NaN }),
    ).toThrow('Invalid FSRS review log snapshot.')
  })

  it('detaches and freezes parsed logs', () => {
    const input = createReviewLogSnapshot()
    const parsed = parseFsrsReviewLogSnapshot(input)

    input.learningSteps = 9

    expect(parsed.learningSteps).toBe(1)
    expect(Object.isFrozen(parsed)).toBe(true)
  })

  it('strips caller metadata when parsing and serializing review logs', () => {
    const input = {
      ...createReviewLogSnapshot(),
      metadata: { owner: 'caller' },
    }

    expect(parseFsrsReviewLogSnapshot(input)).toEqual(createReviewLogSnapshot())
    expect(JSON.parse(serializeFsrsReviewLogSnapshot(input))).toEqual(
      createReviewLogSnapshot(),
    )
    expect(isFsrsReviewLogSnapshot(Object.assign([], input))).toBe(false)
  })

  it('retains the native prior-review date meaning of dueAt', () => {
    const reviewedAt = new Date('2026-10-04T10:00:00.000Z')
    const card = scheduleReview(
      createInitialFsrsCard(reviewedAt),
      'good',
      reviewedAt,
    ).card
    const { log } = scheduleReview(card, 'good', card.dueAt)
    const parsed = parseSerializedFsrsReviewLogSnapshot(
      serializeFsrsReviewLogSnapshot(log),
    )

    expect(parsed).toEqual(log)
    expect(parsed.dueAt).toBe(card.lastReviewAt?.toISOString())
    expect(parsed.dueAt).not.toBe(card.dueAt.toISOString())
  })

  it.each(['elapsedDays', 'lastElapsedDays', 'scheduledDays', 'learningSteps'])(
    'rejects negative, fractional, and unsafe %s counters',
    (field) => {
      const log = createReviewLogSnapshot()

      for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
        expect(isFsrsReviewLogSnapshot({ ...log, [field]: value })).toBe(false)
      }
    },
  )

  it.each(['stability', 'difficulty'])(
    'rejects negative %s values',
    (field) => {
      expect(
        isFsrsReviewLogSnapshot({
          ...createReviewLogSnapshot(),
          [field]: -1,
        }),
      ).toBe(false)
    },
  )

  it('accepts valid New zero-valued memory and counters', () => {
    expect(
      parseFsrsReviewLogSnapshot({
        ...createReviewLogSnapshot(),
        state: 'new',
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        lastElapsedDays: 0,
        scheduledDays: 0,
        learningSteps: 0,
      }),
    ).toMatchObject({ state: 'new' })
  })
})

describe('FSRS review log association with recorded pre-cards', () => {
  const firstAt = new Date('2026-01-01T10:00:00.000Z')
  const reviewedAt = new Date('2026-01-10T10:00:00.000Z')
  const shortTermProfile = createFsrsSchedulerProfile({
    targetRetention: 0.75,
  })
  const longTermProfile = createFsrsSchedulerProfile({
    targetRetention: 0.75,
    enableShortTerm: false,
    learningSteps: [],
    relearningSteps: [],
  })
  const initial = createInitialFsrsCard(firstAt)
  const learning = scheduleReviewWithProfile(
    initial,
    'again',
    firstAt,
    shortTermProfile,
  ).card
  const review = scheduleReviewWithProfile(
    initial,
    'easy',
    firstAt,
    shortTermProfile,
  ).card
  const relearning = scheduleReviewWithProfile(
    review,
    'again',
    new Date('2026-01-02T10:00:00.000Z'),
    shortTermProfile,
  ).card
  const cards: readonly [string, FsrsCardSnapshot][] = [
    ['delayed New', initial],
    ['Learning', learning],
    ['Review', review],
    ['Relearning', relearning],
    [
      'New with nonzero memory and counters',
      {
        ...initial,
        stability: 0.123456789101,
        difficulty: 2.345678901234,
        elapsedDays: 3,
        scheduledDays: 7,
        learningSteps: 2,
      },
    ],
    [
      'New with a prior-review date',
      {
        ...initial,
        lastReviewAt: firstAt,
        elapsedDays: 3,
        scheduledDays: 7,
        learningSteps: 2,
      },
    ],
  ]

  it('covers every native learning state', () => {
    expect(cards.slice(0, 4).map(([, card]) => card.state)).toEqual([
      'new',
      'learning',
      'review',
      'relearning',
    ])
  })

  describe.each([
    ['short-term', shortTermProfile],
    ['long-term', longTermProfile],
  ] as const)('%s native scheduling', (_mode, profile) => {
    it.each(cards)('accepts every native rating for %s', (_name, preCard) => {
      for (const rating of reviewRatings) {
        const before = structuredClone(preCard)
        const { log } = scheduleReviewWithProfile(
          preCard,
          rating,
          reviewedAt,
          profile,
        )
        const logBefore = structuredClone(log)

        expect(() =>
          assertFsrsReviewLogMatchesPreCard(log, preCard, profile),
        ).not.toThrow()
        expect(preCard).toEqual(before)
        expect(log).toEqual(logBefore)
      }
    })
  })

  it.each([
    ['state', 'learning'],
    ['stability', review.stability + 0.000000000001],
    ['difficulty', review.difficulty + 0.000000000001],
    ['lastElapsedDays', review.elapsedDays + 1],
    ['learningSteps', review.learningSteps + 1],
    ['scheduledDays', review.scheduledDays + 1],
    ['dueAt', new Date(firstAt.getTime() + 1).toISOString()],
  ] as const)('rejects a mismatched %s association', (field, value) => {
    const { log } = scheduleReviewWithProfile(
      review,
      'good',
      reviewedAt,
      shortTermProfile,
    )
    const mismatched = parseFsrsReviewLogSnapshot({ ...log, [field]: value })

    expect(() =>
      assertFsrsReviewLogMatchesPreCard(mismatched, review, shortTermProfile),
    ).toThrow('FSRS review log does not match its recorded pre-card.')
  })

  it('rejects a valid pre-card copied from another review event', () => {
    const { log } = scheduleReviewWithProfile(
      review,
      'good',
      reviewedAt,
      shortTermProfile,
    )

    expect(() =>
      assertFsrsReviewLogMatchesPreCard(log, relearning, shortTermProfile),
    ).toThrow('FSRS review log does not match its recorded pre-card.')
  })

  it('requires zero scheduled days for a long-term New log', () => {
    const preCard = { ...initial, scheduledDays: 7 }
    const { log } = scheduleReviewWithProfile(
      preCard,
      'good',
      reviewedAt,
      longTermProfile,
    )

    expect(log.scheduledDays).toBe(0)
    expect(() =>
      assertFsrsReviewLogMatchesPreCard(log, preCard, longTermProfile),
    ).not.toThrow()
    expect(() =>
      assertFsrsReviewLogMatchesPreCard(
        { ...log, scheduledDays: preCard.scheduledDays },
        preCard,
        longTermProfile,
      ),
    ).toThrow('FSRS review log does not match its recorded pre-card.')
  })

  it('preserves nonzero scheduled days for a short-term New log', () => {
    const preCard = { ...initial, scheduledDays: 7 }
    const { log } = scheduleReviewWithProfile(
      preCard,
      'good',
      reviewedAt,
      shortTermProfile,
    )

    expect(log.scheduledDays).toBe(7)
    expect(() =>
      assertFsrsReviewLogMatchesPreCard(
        { ...log, scheduledDays: 0 },
        preCard,
        shortTermProfile,
      ),
    ).toThrow('FSRS review log does not match its recorded pre-card.')
  })

  it('validates the log before comparing recorded fields', () => {
    const { log } = scheduleReviewWithProfile(
      initial,
      'good',
      reviewedAt,
      shortTermProfile,
    )

    expect(() =>
      assertFsrsReviewLogMatchesPreCard(
        { ...log, elapsedDays: -1 },
        initial,
        shortTermProfile,
      ),
    ).toThrow('Invalid FSRS review log snapshot.')
  })

  it('validates the complete pre-card before comparing recorded fields', () => {
    const { log } = scheduleReviewWithProfile(
      initial,
      'good',
      reviewedAt,
      shortTermProfile,
    )

    expect(() =>
      assertFsrsReviewLogMatchesPreCard(
        log,
        { ...initial, lapses: 1 },
        shortTermProfile,
      ),
    ).toThrow('Invalid FSRS card snapshot: lapses cannot exceed reps.')
  })

  it('validates the profile structure before reading scheduler mode', () => {
    const { log } = scheduleReviewWithProfile(
      initial,
      'good',
      reviewedAt,
      shortTermProfile,
    )
    const invalidProfile = {
      ...shortTermProfile,
      parameters: {
        ...shortTermProfile.parameters,
        enableShortTerm: 'false',
      },
    } as unknown as FsrsSchedulerProfile

    expect(() =>
      assertFsrsReviewLogMatchesPreCard(log, initial, invalidProfile),
    ).toThrow('Invalid FSRS effective parameters.')
  })
})

function createReviewLogSnapshot(): FsrsReviewLogSnapshot {
  return {
    rating: 'good',
    state: 'learning',
    dueAt: '2026-01-02T09:00:00.000Z',
    stability: 0.5,
    difficulty: 5,
    elapsedDays: 0,
    lastElapsedDays: 0,
    scheduledDays: 1,
    learningSteps: 1,
    reviewedAt: '2026-01-01T10:00:00.000Z',
  }
}
