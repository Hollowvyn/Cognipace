import { describe, expect, it } from 'vitest'

import * as fsrs from './index'

describe('FSRS public API facade', () => {
  it('exports the stable feature-facing scheduler facade', () => {
    expect(Object.keys(fsrs).sort()).toEqual(
      [
        'createFsrsSchedulerProfile',
        'createInitialFsrsCard',
        'defaultFsrsCardKind',
        'defaultFsrsSchedulingOptions',
        'fsrsCardStates',
        'getRetrievability',
        'getTargetRetentionDuration',
        'isFsrsCardKind',
        'isFsrsReviewLogSnapshot',
        'isFsrsCardState',
        'isFsrsStepUnit',
        'isReviewRating',
        'normalizeFsrsSchedulingOptions',
        'parseFsrsCardKind',
        'parseFsrsReviewLogSnapshot',
        'parseFsrsCardState',
        'parseFsrsSchedulerProfile',
        'parseSerializedFsrsReviewLogSnapshot',
        'parseSerializedFsrsSchedulerProfile',
        'parseFsrsStepUnit',
        'parseReviewRating',
        'projectReviewSchedule',
        'replayReviewHistory',
        'replayReviewHistorySequence',
        'reviewRatingToScore',
        'reviewRatings',
        'scheduleReview',
        'serializeFsrsReviewLogSnapshot',
        'serializeFsrsSchedulerProfile',
      ].sort(),
    )
  })

  it('does not export raw ts-fsrs adapter helpers', () => {
    expect('toFsrsCard' in fsrs).toBe(false)
    expect('fromFsrsCard' in fsrs).toBe(false)
    expect('toFsrsRating' in fsrs).toBe(false)
    expect('toTsFsrsCard' in fsrs).toBe(false)
    expect('fromTsFsrsCard' in fsrs).toBe(false)
    expect('resolveFsrsSchedulerProfile' in fsrs).toBe(false)
    expect('assertExactFsrsSchedulerProfile' in fsrs).toBe(false)
    expect('scheduleCardReviewWithProfile' in fsrs).toBe(false)
    expect('readFsrsSchedulerProfile' in fsrs).toBe(false)
  })
})
