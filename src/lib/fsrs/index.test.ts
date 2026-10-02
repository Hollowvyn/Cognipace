import { describe, expect, it } from 'vitest'

import * as fsrs from './index'

describe('FSRS public API facade', () => {
  it('exports the stable feature-facing scheduler facade', () => {
    expect(Object.keys(fsrs).sort()).toEqual(
      [
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
        'parseSerializedFsrsReviewLogSnapshot',
        'parseFsrsStepUnit',
        'parseReviewRating',
        'replayReviewHistory',
        'replayReviewHistorySequence',
        'reviewRatingToScore',
        'reviewRatings',
        'scheduleReview',
        'serializeFsrsReviewLogSnapshot',
      ].sort(),
    )
  })

  it('does not export raw ts-fsrs adapter helpers', () => {
    expect('toFsrsCard' in fsrs).toBe(false)
    expect('fromFsrsCard' in fsrs).toBe(false)
    expect('toFsrsRating' in fsrs).toBe(false)
    expect('toTsFsrsCard' in fsrs).toBe(false)
    expect('fromTsFsrsCard' in fsrs).toBe(false)
  })
})
