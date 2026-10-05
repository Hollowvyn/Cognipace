import { describe, expect, it } from 'vitest'

import {
  createInitialFsrsCard,
  scheduleReview,
} from '../scheduler/review-scheduler'
import {
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
