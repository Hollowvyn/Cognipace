import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fsrs from '@/lib/fsrs'

import type { AnalyticsReviewEvent } from './chart-data'
import {
  buildRepeatReviewPairs,
  selectFirstRecordedAttempts,
} from './review-cohorts'

const options = {
  start: new Date('2026-08-01T00:00:00Z'),
  end: new Date('2026-08-03T12:00:00Z'),
  fsrsOptions: fsrs.normalizeFsrsSchedulingOptions(),
}

function event(
  overrides: Partial<AnalyticsReviewEvent> = {},
): AnalyticsReviewEvent {
  return {
    id: 'initial',
    cardId: 'card',
    problemSlug: 'problem',
    title: 'Problem',
    topicLabels: [],
    rating: 'good',
    reviewedAt: new Date('2026-08-01T12:00:00Z'),
    isCorrect: null,
    fsrsReviewLog: null,
    ...overrides,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('selectFirstRecordedAttempts', () => {
  it('selects one raw chronological record per problem across modes, cards, and topics without mutating input', () => {
    const first = event({
      id: 'A1',
      rating: 'again',
      cardId: 'manual-card',
      topicLabels: ['Arrays'],
    })
    const later = event({
      id: 'A2',
      rating: 'good',
      cardId: 'timed-card',
      reviewedAt: new Date('2026-08-02T12:00:00Z'),
    })
    const invalid = event({ id: 'B1', problemSlug: 'b', rating: 'invalid' })
    const validAfterInvalid = event({
      id: 'B2',
      problemSlug: 'b',
      rating: 'easy',
      reviewedAt: new Date('2026-08-02T12:00:00Z'),
    })
    const input = [later, validAfterInvalid, invalid, first]
    expect(selectFirstRecordedAttempts(input)).toEqual([first, invalid])
    expect(input).toEqual([later, validAfterInvalid, invalid, first])
    expect(selectFirstRecordedAttempts(input)[0]).toBe(first)
  })

  it('uses lexical ID ties and restored earlier chronology rather than insertion order', () => {
    const laterId = event({ id: 'z-good', rating: 'good' })
    const earlierId = event({ id: 'a-invalid', rating: 'invalid' })
    const restored = event({
      id: 'restored',
      rating: 'again',
      reviewedAt: new Date('2026-07-01T12:00:00Z'),
    })
    expect(selectFirstRecordedAttempts([laterId, earlierId])).toEqual([
      earlierId,
    ])
    expect(selectFirstRecordedAttempts([earlierId, laterId, restored])).toEqual(
      [restored],
    )
  })
})

describe('buildRepeatReviewPairs', () => {
  it('replays full per-card valid history and pairs only repeats inside the selected range', () => {
    const initial = event({
      reviewedAt: new Date('2026-07-31T12:00:00Z'),
      rating: 'again',
    })
    const repeat = event({ id: 'repeat', rating: 'hard', isCorrect: false })
    const rows = [
      event({ id: 'other-initial', cardId: 'other-card' }),
      repeat,
      event({ id: 'invalid', rating: 'unknown' }),
      initial,
    ]
    const pairs = buildRepeatReviewPairs(rows, options)
    const priorCard = fsrs.replayReviewHistorySequence(
      [{ rating: 'again', reviewedAt: initial.reviewedAt }],
      options.fsrsOptions,
    )[0]!.card
    expect(pairs).toEqual([
      {
        id: 'repeat',
        cardId: 'card',
        reviewedAt: repeat.reviewedAt,
        rating: 'hard',
        estimate: fsrs.getRetrievability(
          priorCard,
          repeat.reviewedAt,
          options.fsrsOptions,
        ),
      },
    ])
    expect(buildRepeatReviewPairs([repeat], options)).toEqual([])
  })

  it('uses lexical ties in replay and does not treat another card for the same problem as a repeat', () => {
    const pairs = buildRepeatReviewPairs(
      [
        event({ id: 'b-good' }),
        event({ id: 'a-again', rating: 'again' }),
        event({ id: 'c-new-card', cardId: 'other-card' }),
      ],
      options,
    )
    expect(pairs.map((pair) => pair.id)).toEqual(['b-good'])
  })

  it.each([0, 1])(
    'keeps an actual repeat estimate at the probability endpoint %s',
    (estimate) => {
      vi.spyOn(fsrs, 'getRetrievability').mockReturnValue(estimate)
      expect(
        buildRepeatReviewPairs([event(), event({ id: 'repeat' })], options),
      ).toMatchObject([{ estimate }])
    },
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1])(
    'excludes unavailable repeat estimates %s',
    (estimate) => {
      vi.spyOn(fsrs, 'getRetrievability').mockReturnValue(estimate)
      expect(
        buildRepeatReviewPairs([event(), event({ id: 'repeat' })], options),
      ).toEqual([])
    },
  )
})
