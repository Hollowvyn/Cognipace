import { describe, expect, it } from 'vitest'

import {
  createInitialFsrsCard,
  scheduleReview,
} from '../scheduler/review-scheduler'
import {
  defaultFsrsCardKind,
  isFsrsCardKind,
  isFsrsCardState,
  parseFsrsCardKind,
  parseFsrsCardSnapshot,
  parseFsrsCardState,
  parseSerializedFsrsCardSnapshot,
  serializeFsrsCardSnapshot,
  toSerializableFsrsCardSnapshot,
} from './card-snapshot'

describe('FSRS card snapshot contracts', () => {
  it('parses persisted card states through a typed boundary', () => {
    expect(parseFsrsCardState('new')).toBe('new')
    expect(parseFsrsCardState('learning')).toBe('learning')
    expect(parseFsrsCardState('review')).toBe('review')
    expect(parseFsrsCardState('relearning')).toBe('relearning')
    expect(() => parseFsrsCardState('invalid')).toThrow(
      'Invalid FSRS card state "invalid".',
    )
    expect(parseFsrsCardKind('default')).toBe('default')
    expect(() => parseFsrsCardKind('custom')).toThrow(
      'Invalid FSRS card kind "custom".',
    )
  })

  it('checks card states and card kinds without exposing ts-fsrs enums', () => {
    expect(isFsrsCardState('review')).toBe(true)
    expect(isFsrsCardState('Review')).toBe(false)
    expect(isFsrsCardKind(defaultFsrsCardKind)).toBe(true)
    expect(isFsrsCardKind('python')).toBe(false)
  })

  it('round-trips valid New zeros/null without retaining mutable Dates', () => {
    const card = createInitialFsrsCard(new Date('2026-10-04T10:00:00.000Z'))
    const serialized = toSerializableFsrsCardSnapshot(card)
    const parsed = parseSerializedFsrsCardSnapshot(
      serializeFsrsCardSnapshot(card),
    )

    expect(parsed).toEqual(card)
    expect(parsed.dueAt).not.toBe(card.dueAt)
    expect(serialized.lastReviewAt).toBeNull()
    expect(
      parseFsrsCardSnapshot({ ...serialized, metadata: { owner: 'caller' } }),
    ).not.toHaveProperty('metadata')

    card.dueAt.setUTCFullYear(2030)
    expect(serialized.dueAt).toBe('2026-10-04T10:00:00.000Z')
    expect(Object.isFrozen(serialized)).toBe(true)
  })

  it('detaches both Dates when decoding a reviewed card', () => {
    const reviewedAt = new Date('2026-10-04T10:00:00.000Z')
    const card = {
      ...scheduleReview(createInitialFsrsCard(reviewedAt), 'good', reviewedAt)
        .card,
      metadata: { owner: 'caller' },
    }
    const serialized = toSerializableFsrsCardSnapshot(card)
    const parsed = parseFsrsCardSnapshot(serialized)
    const parsedAgain = parseFsrsCardSnapshot(serialized)

    expect(parsed).toEqual(
      expect.objectContaining({
        dueAt: card.dueAt,
        lastReviewAt: card.lastReviewAt,
      }),
    )
    expect(parsed.dueAt).not.toBe(card.dueAt)
    expect(parsed.lastReviewAt).not.toBe(card.lastReviewAt)
    expect(parsedAgain.dueAt).not.toBe(parsed.dueAt)
    expect(parsedAgain.lastReviewAt).not.toBe(parsed.lastReviewAt)
    expect(serialized).not.toHaveProperty('metadata')

    card.lastReviewAt?.setUTCFullYear(2030)
    parsed.dueAt.setUTCFullYear(2030)
    parsed.lastReviewAt?.setUTCFullYear(2030)
    expect(serialized.lastReviewAt).toBe('2026-10-04T10:00:00.000Z')
    expect(parsedAgain.lastReviewAt?.toISOString()).toBe(
      '2026-10-04T10:00:00.000Z',
    )
    expect(parsedAgain.dueAt.toISOString()).toBe(serialized.dueAt)
  })

  it('rejects unsafe counters at the scheduler boundary', () => {
    const card = createInitialFsrsCard()

    expect(() =>
      scheduleReview({ ...card, reps: Number.MAX_SAFE_INTEGER + 1 }, 'good'),
    ).toThrow(
      'Invalid FSRS card snapshot: "reps" must be a non-negative integer.',
    )
  })

  it.each([
    { state: 'invalid' },
    { dueAt: '2026-10-04' },
    { lastReviewAt: '2026-10-04' },
    { reps: -1 },
    { lapses: 1 },
    { scheduledDays: 0.5 },
    { reps: Number.MAX_SAFE_INTEGER + 1 },
    { stability: Number.NaN },
    { state: 'review', lastReviewAt: null },
  ])('rejects malformed card values %j', (change) => {
    const card = toSerializableFsrsCardSnapshot(createInitialFsrsCard())

    expect(() => parseFsrsCardSnapshot({ ...card, ...change })).toThrow()
  })
})
