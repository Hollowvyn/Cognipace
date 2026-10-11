import { describe, expect, it } from 'vitest'
import * as fsrs from '@/lib/fsrs'

import type { AnalyticsReviewEvent } from './chart-data'
import {
  buildRepeatReviewPairs,
  selectFirstRecordedAttempts,
  selectLaterRecordedAttempts,
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
      cardId: 'other-card',
      reviewedAt: new Date('2026-08-02T12:00:00Z'),
    })
    const input = [validAfterInvalid, later, invalid, first]
    const subsequent = selectLaterRecordedAttempts(input)
    expect(selectFirstRecordedAttempts(input)).toEqual([first, invalid])
    expect(subsequent).toEqual([later, validAfterInvalid])
    expect(input).toEqual([validAfterInvalid, later, invalid, first])
    expect(selectFirstRecordedAttempts(input)[0]).toBe(first)
    expect(subsequent[0]).toBe(later)
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
    expect(selectLaterRecordedAttempts([laterId, earlierId])).toEqual([laterId])
  })
})

describe('buildRepeatReviewPairs', () => {
  it('keeps observed repeats when recorded scheduling evidence is missing', () => {
    const pairs = buildRepeatReviewPairs(
      [event(), event({ id: 'repeat', rating: 'again' })],
      options,
    )
    expect(pairs).toMatchObject([
      { id: 'repeat', rating: 'again', estimate: null, provenance: 'unknown' },
    ])
  })

  it('uses observed chronology for repeat eligibility despite a different application sequence', () => {
    const firstApplied = event({
      id: 'z-first',
      applicationSequence: 1,
      reviewedAt: new Date('2026-08-02T12:00:00Z'),
    })
    const secondApplied = event({
      id: 'a-second',
      applicationSequence: 2,
      reviewedAt: new Date('2026-08-01T12:00:00Z'),
    })
    expect(
      buildRepeatReviewPairs([secondApplied, firstApplied], options).map(
        (pair) => pair.id,
      ),
    ).toEqual(['z-first'])
  })
  it('keeps full per-card observed history and pairs only repeats inside the selected range', () => {
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
    expect(pairs).toEqual([
      {
        id: 'repeat',
        cardId: 'card',
        reviewedAt: repeat.reviewedAt,
        rating: 'hard',
        estimate: null,
        provenance: 'unknown',
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

  it('uses a recorded custom profile for a captured repeat instead of current options', () => {
    const profile = fsrs.createFsrsSchedulerProfile({ targetRetention: 0.75 })
    const firstAt = new Date('2026-08-01T12:00:00Z')
    const repeatAt = new Date('2026-08-02T12:00:00Z')
    const preCard = fsrs.scheduleReviewWithProfile(
      fsrs.createInitialFsrsCard(firstAt),
      'good',
      firstAt,
      profile,
    ).card
    const scheduled = fsrs.scheduleReviewWithProfile(
      preCard,
      'hard',
      repeatAt,
      profile,
    )
    const pairs = buildRepeatReviewPairs(
      [
        event({ id: 'initial', reviewedAt: firstAt, applicationSequence: 1 }),
        event({
          id: 'repeat',
          rating: 'hard',
          reviewedAt: repeatAt,
          applicationSequence: 2,
          schedulingEvidenceKind: 'captured',
          schedulerProfileJson: fsrs.serializeFsrsSchedulerProfile(profile),
          preCardJson: fsrs.serializeFsrsCardSnapshot(preCard),
          fsrsReviewLog: fsrs.serializeFsrsReviewLogSnapshot(scheduled.log),
        }),
      ],
      options,
    )
    expect(pairs).toMatchObject([
      {
        id: 'repeat',
        provenance: 'captured',
        estimate: fsrs.getRetrievability(preCard, repeatAt, profile.parameters),
      },
    ])
  })
})
