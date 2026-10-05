import { describe, expect, it } from 'vitest'

import * as fsrs from './index'

describe('FSRS public API facade', () => {
  it('exports the stable feature-facing scheduler facade', () => {
    expect(Object.keys(fsrs).sort()).toEqual(
      [
        'assertFsrsReviewLogMatchesPreCard',
        'correctLegacyReview',
        'correctReviewFromEvidence',
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
        'parseFsrsCardSnapshot',
        'parseFsrsReviewLogSnapshot',
        'parseFsrsCardState',
        'parseFsrsSchedulerProfile',
        'parseSerializedFsrsReviewLogSnapshot',
        'parseSerializedFsrsCardSnapshot',
        'parseSerializedFsrsSchedulerProfile',
        'parseFsrsStepUnit',
        'parseReviewRating',
        'projectReviewSchedule',
        'replayReviewHistory',
        'replayReviewHistorySequence',
        'reviewRatingToScore',
        'reviewRatings',
        'scheduleReview',
        'scheduleReviewWithProfile',
        'serializeFsrsReviewLogSnapshot',
        'serializeFsrsCardSnapshot',
        'serializeFsrsSchedulerProfile',
        'toSerializableFsrsCardSnapshot',
      ].sort(),
    )
  })

  it('does not export raw ts-fsrs adapter helpers', () => {
    expect('toFsrsCard' in fsrs).toBe(false)
    expect('fromFsrsCard' in fsrs).toBe(false)
    expect('toFsrsRating' in fsrs).toBe(false)
    expect('toTsFsrsCard' in fsrs).toBe(false)
    expect('fromTsFsrsCard' in fsrs).toBe(false)
    expect('rollbackCardReview' in fsrs).toBe(false)
    expect('resolveFsrsSchedulerProfile' in fsrs).toBe(false)
    expect('assertExactFsrsSchedulerProfile' in fsrs).toBe(false)
    expect('scheduleCardReviewWithProfile' in fsrs).toBe(false)
    expect('readFsrsSchedulerProfile' in fsrs).toBe(false)
    expect('assertValidFsrsCardSnapshot' in fsrs).toBe(false)
    expect('isCanonicalIsoDateString' in fsrs).toBe(false)
    expect('isNonNegativeInteger' in fsrs).toBe(false)
    expect('isNonNegativeNumber' in fsrs).toBe(false)
    expect('isRecord' in fsrs).toBe(false)
  })
})
