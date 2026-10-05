import { describe, expect, it } from 'vitest'

import {
  createFsrsSchedulerProfile,
  createInitialFsrsCard,
  scheduleReviewWithProfile,
  serializeFsrsCardSnapshot,
  serializeFsrsReviewLogSnapshot,
  serializeFsrsSchedulerProfile,
  toSerializableFsrsCardSnapshot,
} from '@/lib/fsrs'

import {
  createPracticeGenerationKey,
  normalizeLegacyPracticeStorage,
  parsePracticeGenerationKey,
  practiceReceiptCommandSummarySchema,
  practiceReceiptAcknowledgementSchema,
  validatePracticeStorageData,
  type PracticeStorageReferences,
  type PracticeStorageData,
  type PracticeReceiptAcknowledgement,
} from './practice-storage'

const time = '2026-01-01T00:00:00.000Z'
const references: PracticeStorageReferences = {
  problemSlugs: ['two-sum'],
  practiceProblemSlugs: [],
  cards: [
    {
      id: 'opaque-card',
      problemSlug: 'two-sum',
      card: createInitialFsrsCard(new Date(time)),
    },
  ],
  attempts: ['z', 'a'].map((id) => ({
    id,
    cardId: 'opaque-card',
    problemSlug: 'two-sum',
    rating: 'good',
    reviewedAt: time,
    fsrsReviewLog: null,
  })),
}

describe('Practice storage preflight', () => {
  it('infers stable per-card sequences with code-unit tie ordering without minting tokens', () => {
    const storage = normalizeLegacyPracticeStorage(references.attempts)
    expect(
      storage.reviewEvidence.map((row) => [
        row.reviewAttemptId,
        row.applicationSequence,
      ]),
    ).toEqual([
      ['a', 1],
      ['z', 2],
    ])
    expect(storage.generations).toEqual([])
    expect(validatePracticeStorageData(storage, references)).toEqual(storage)
  })

  it('requires complete evidence and rejects duplicate or unsafe sequences', () => {
    const storage = normalizeLegacyPracticeStorage(references.attempts)
    expect(() =>
      validatePracticeStorageData(
        { ...storage, reviewEvidence: storage.reviewEvidence.slice(1) },
        references,
      ),
    ).toThrow()
    expect(() =>
      validatePracticeStorageData(
        {
          ...storage,
          reviewEvidence: storage.reviewEvidence.map((row) => ({
            ...row,
            applicationSequence: 1,
          })),
        },
        references,
      ),
    ).toThrow()
    expect(() =>
      validatePracticeStorageData(
        {
          ...storage,
          reviewEvidence: storage.reviewEvidence.map((row) => ({
            ...row,
            revision: Number.MAX_SAFE_INTEGER + 1,
          })),
        },
        references,
      ),
    ).toThrow()
  })

  it('validates canonical historical generation keys separately from active scopes', () => {
    const context = {
      localGenerationToken: 'old-local',
      problemGenerationToken: null,
    }
    expect(
      parsePracticeGenerationKey(createPracticeGenerationKey(context)),
    ).toEqual(context)
    expect(() => parsePracticeGenerationKey('[ "old-local", null ]')).toThrow()
    const storage = normalizeLegacyPracticeStorage(references.attempts)
    expect(() =>
      validatePracticeStorageData(storage, references, {
        requireActiveGenerations: true,
      }),
    ).toThrow()
    expect(() =>
      validatePracticeStorageData(
        {
          ...storage,
          generations: [
            {
              scopeId: 'problem:two-sum',
              problemSlug: 'two-sum',
              generationToken: 'token',
              createdAt: time,
            },
          ],
        },
        references,
      ),
    ).toThrow()
  })

  it('returns detached strict rows and accepts a zero/null New card without fabricated history', () => {
    const storage = normalizeLegacyPracticeStorage(references.attempts)
    const detached = validatePracticeStorageData(storage, references)
    detached.reviewEvidence[0]!.revision = 4
    expect(storage.reviewEvidence[0]!.revision).toBe(0)
    expect(() =>
      validatePracticeStorageData({ ...storage, extra: true }, references),
    ).toThrow()
    expect(() =>
      validatePracticeStorageData(
        {
          ...storage,
          reviewEvidence: storage.reviewEvidence.map((row) => ({
            ...row,
            extra: true,
          })),
        },
        references,
      ),
    ).toThrow()
    expect(() =>
      validatePracticeStorageData(storage, {
        ...references,
        cards: references.cards.map((row) => ({
          ...row,
          card: { ...row.card, lapses: 1 },
        })),
      }),
    ).toThrow()
  })

  it('uses chronological event time and code-unit IDs, independently of insertion order', () => {
    const attempts = [
      {
        ...references.attempts[0]!,
        id: 'lower',
        reviewedAt: '+010000-01-01T00:00:00.000Z',
      },
      { ...references.attempts[0]!, id: 'z', reviewedAt: time },
      { ...references.attempts[0]!, id: 'Z', reviewedAt: time },
    ]
    expect(
      normalizeLegacyPracticeStorage(attempts).reviewEvidence.map(
        (row) => row.reviewAttemptId,
      ),
    ).toEqual(['Z', 'z', 'lower'])
  })

  it('accepts captured and legacy-derived evidence with exact native profile/pre-card/log association', () => {
    const fixture = capturedFixture()
    expect(
      validatePracticeStorageData(fixture.storage, fixture.references),
    ).toEqual(fixture.storage)
    fixture.storage.reviewEvidence[0]!.schedulingEvidenceKind = 'legacy-derived'
    expect(() =>
      validatePracticeStorageData(fixture.storage, fixture.references),
    ).not.toThrow()
  })

  it.each([
    'orphan',
    'wrong-card',
    'wrong-owner',
    'unknown-profile',
    'missing-profile',
    'missing-pre-card',
    'missing-log',
    'log-rating',
    'log-time',
    'noncanonical-profile',
    'duplicate-profile',
    'noncanonical-pre-card',
    'wrong-pre-card',
    'future-pre-card',
    'bad-assessment',
    'assessment-rating',
    'bad-generation',
    'duplicate-scope',
    'missing-active-problem',
  ])('rejects %s before import', (caseName) => {
    const fixture = capturedFixture()
    const { storage, references: refs } = fixture
    const evidence = storage.reviewEvidence[0]!
    if (caseName === 'orphan') evidence.reviewAttemptId = 'missing'
    if (caseName === 'wrong-card') evidence.cardId = 'missing'
    if (caseName === 'wrong-owner')
      refs.attempts = refs.attempts.map((row) => ({
        ...row,
        problemSlug: 'sibling',
      }))
    if (caseName === 'unknown-profile')
      evidence.schedulingEvidenceKind = 'unknown'
    if (caseName === 'missing-profile') evidence.schedulerProfileId = 'missing'
    if (caseName === 'missing-pre-card') evidence.preCardJson = null
    if (caseName === 'missing-log')
      refs.attempts = refs.attempts.map((row) => ({
        ...row,
        fsrsReviewLog: null,
      }))
    if (caseName === 'log-rating')
      refs.attempts = refs.attempts.map((row) => ({ ...row, rating: 'easy' }))
    if (caseName === 'log-time')
      refs.attempts = refs.attempts.map((row) => ({
        ...row,
        reviewedAt: '2026-01-02T00:00:00.000Z',
      }))
    if (caseName === 'noncanonical-profile')
      storage.schedulerProfiles[0]!.profileJson = ` ${storage.schedulerProfiles[0]!.profileJson}`
    if (caseName === 'duplicate-profile')
      storage.schedulerProfiles.push({
        ...storage.schedulerProfiles[0]!,
        id: 'other',
      })
    if (caseName === 'noncanonical-pre-card')
      evidence.preCardJson = ` ${evidence.preCardJson}`
    if (caseName === 'wrong-pre-card')
      evidence.preCardJson = serializeFsrsCardSnapshot({
        ...fixture.preCard,
        stability: fixture.preCard.stability + 1,
      })
    if (caseName === 'future-pre-card')
      evidence.preCardJson = serializeFsrsCardSnapshot({
        ...fixture.preCard,
        lastReviewAt: new Date('2026-01-02T00:00:00Z'),
      })
    if (caseName === 'bad-assessment')
      evidence.assessmentEvidenceJson = JSON.stringify({
        ...assessment,
        reasonCode: 'invented',
      })
    if (caseName === 'assessment-rating')
      evidence.assessmentEvidenceJson = JSON.stringify({
        ...assessment,
        finalRating: 'easy',
      })
    if (caseName === 'bad-generation')
      storage.generations[1]!.scopeId = 'problem:wrong'
    if (caseName === 'duplicate-scope')
      storage.generations.push({ ...storage.generations[0]! })
    if (caseName === 'missing-active-problem')
      storage.generations = storage.generations.slice(0, 1)
    expect(() =>
      validatePracticeStorageData(storage, refs, {
        requireActiveGenerations: true,
      }),
    ).toThrow()
  })

  it('validates historical acknowledgements against their own rating/card/profile after correction', () => {
    const fixture = capturedFixture()
    addHistoricalReceipts(fixture)
    // Today's event has a new rating, card, provenance and profile; receipts retain accepted results.
    const profile = createFsrsSchedulerProfile({ targetRetention: 0.8 })
    const current = scheduleReviewWithProfile(
      fixture.preCard,
      'easy',
      new Date(time),
      profile,
    )
    fixture.storage.schedulerProfiles.push({
      id: 'current-profile',
      profileJson: serializeFsrsSchedulerProfile(profile),
      createdAt: time,
    })
    fixture.storage.reviewEvidence[0] = {
      ...fixture.storage.reviewEvidence[0]!,
      revision: 2,
      schedulerProfileId: 'current-profile',
      schedulingEvidenceKind: 'legacy-derived',
    }
    fixture.references.attempts = fixture.references.attempts.map((row) => ({
      ...row,
      rating: 'easy',
      fsrsReviewLog: serializeFsrsReviewLogSnapshot(current.log),
    }))
    fixture.references.cards = fixture.references.cards.map((row) => ({
      ...row,
      card: current.card,
    }))
    expect(() =>
      validatePracticeStorageData(fixture.storage, fixture.references),
    ).not.toThrow()
  })

  it.each([
    'fingerprint',
    'key',
    'duplicate-key',
    'wrong-owner',
    'ack-identity',
    'future-revision',
    'save-target',
    'save-revision',
    'update-target',
    'update-revision',
    'summary-rating',
    'fixed-time',
    'new-card',
    'zero-reps',
    'due',
    'last-review',
    'status',
    'log-rating',
    'trusted-profile',
    'trusted-log',
    'unknown-profile',
    'unbounded-result',
  ])('rejects historical receipt %s', (caseName) => {
    const fixture = capturedFixture()
    addHistoricalReceipts(fixture)
    const receipt =
      fixture.storage.commandReceipts[caseName.startsWith('update') ? 1 : 0]!
    const summary = practiceReceiptCommandSummarySchema.parse(
      JSON.parse(receipt.commandSummaryJson),
    )
    const ack = practiceReceiptAcknowledgementSchema.parse(
      JSON.parse(receipt.resultJson),
    )
    if (caseName === 'fingerprint') receipt.payloadFingerprint = 'A'.repeat(64)
    if (caseName === 'key') receipt.generationKey = '[ "old-local", null ]'
    if (caseName === 'duplicate-key')
      fixture.storage.commandReceipts.push({ ...receipt })
    if (caseName === 'wrong-owner') receipt.problemSlug = 'sibling'
    if (caseName === 'ack-identity') ack.cardId = 'different'
    if (caseName === 'future-revision') receipt.revision = 3
    if (caseName === 'save-target') summary.targetAttemptId = 'event'
    if (caseName === 'save-revision') {
      receipt.revision = 1
      ack.revision = 1
    }
    if (caseName === 'update-target') summary.targetAttemptId = 'missing'
    if (caseName === 'update-revision') summary.expectedRevision = 1
    if (caseName === 'summary-rating') summary.rating = 'easy'
    if (caseName === 'fixed-time') {
      summary.reviewedAt = '2026-01-02T00:00:00.000Z'
      ack.reviewedAt = summary.reviewedAt
    }
    if (caseName === 'new-card')
      ack.card = toSerializableFsrsCardSnapshot(fixture.preCard)
    if (caseName === 'zero-reps') ack.card = { ...ack.card, reps: 0 }
    if (caseName === 'due') ack.dueAt = '2026-01-02T00:00:00.000Z'
    if (caseName === 'last-review')
      ack.card = { ...ack.card, lastReviewAt: '2026-01-02T00:00:00.000Z' }
    if (caseName === 'status') ack.status = 'mastered'
    if (caseName === 'log-rating')
      ack.fsrsReviewLog = { ...ack.fsrsReviewLog!, rating: 'easy' }
    if (caseName === 'trusted-profile') ack.schedulerProfileId = 'missing'
    if (caseName === 'trusted-log') ack.fsrsReviewLog = null
    if (caseName === 'unknown-profile') ack.schedulingEvidenceKind = 'unknown'
    receipt.commandSummaryJson = JSON.stringify(summary)
    receipt.resultJson = JSON.stringify(
      caseName === 'unbounded-result' ? { ...ack, history: [] } : ack,
    )
    expect(() =>
      validatePracticeStorageData(fixture.storage, fixture.references),
    ).toThrow()
  })
})

const assessment = {
  schemaVersion: 1,
  source: 'assessment',
  policyVersion: null,
  submissionIntent: 'quick-submit',
  reasonCode: 'quick-good',
  lockReason: null,
  finalRating: 'good',
}

function capturedFixture() {
  const profile = createFsrsSchedulerProfile({ targetRetention: 0.75 })
  const preCard = createInitialFsrsCard(new Date(time))
  const scheduled = scheduleReviewWithProfile(
    preCard,
    'good',
    new Date(time),
    profile,
  )
  const references: PracticeStorageReferences = {
    problemSlugs: ['two-sum', 'sibling'],
    practiceProblemSlugs: ['two-sum'],
    cards: [
      { id: 'opaque-card', problemSlug: 'two-sum', card: scheduled.card },
    ],
    attempts: [
      {
        id: 'event',
        cardId: 'opaque-card',
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt: time,
        fsrsReviewLog: serializeFsrsReviewLogSnapshot(scheduled.log),
      },
    ],
  }
  const storage: PracticeStorageData = {
    schedulerProfiles: [
      {
        id: 'profile',
        profileJson: serializeFsrsSchedulerProfile(profile),
        createdAt: time,
      },
    ],
    reviewEvidence: [
      {
        reviewAttemptId: 'event',
        cardId: 'opaque-card',
        applicationSequence: 7,
        revision: 2,
        sequenceSource: 'applied',
        schedulingEvidenceKind: 'captured',
        schedulerProfileId: 'profile',
        preCardJson: serializeFsrsCardSnapshot(preCard),
        assessmentEvidenceJson: null,
      },
    ],
    generations: [
      {
        scopeId: 'local',
        problemSlug: null,
        generationToken: 'new-local',
        createdAt: time,
      },
      {
        scopeId: 'problem:two-sum',
        problemSlug: 'two-sum',
        generationToken: 'new-problem',
        createdAt: time,
      },
    ],
    commandReceipts: [],
  }
  return { profile, preCard, scheduled, references, storage }
}

function addHistoricalReceipts(fixture: ReturnType<typeof capturedFixture>) {
  const { storage, preCard, profile, scheduled } = fixture
  for (const [operation, rating, revision] of [
    ['save', 'good', 0],
    ['update', 'hard', 1],
  ] as const) {
    const result =
      operation === 'save'
        ? scheduled
        : scheduleReviewWithProfile(preCard, rating, new Date(time), profile)
    const ack: PracticeReceiptAcknowledgement = {
      schemaVersion: 1,
      operation,
      problemSlug: 'two-sum',
      cardId: 'opaque-card',
      reviewAttemptId: 'event',
      applicationSequence: 7,
      revision,
      rating,
      reviewedAt: time,
      dueAt: result.card.dueAt.toISOString(),
      status: 'learning',
      card: toSerializableFsrsCardSnapshot(result.card),
      fsrsReviewLog: result.log,
      schedulingEvidenceKind: 'captured',
      schedulerProfileId: 'profile',
    }
    storage.commandReceipts.push({
      generationKey: createPracticeGenerationKey({
        localGenerationToken: 'old-local',
        problemGenerationToken: 'old-problem',
      }),
      commandId: operation,
      payloadFingerprint: 'a'.repeat(64),
      operation,
      problemSlug: 'two-sum',
      cardId: 'opaque-card',
      reviewAttemptId: 'event',
      applicationSequence: 7,
      revision,
      acceptedAt: time,
      commandSummaryJson: JSON.stringify({
        schemaVersion: 1,
        rating,
        reviewedAt: time,
        targetAttemptId: operation === 'save' ? null : 'event',
        expectedRevision: operation === 'save' ? null : 0,
      }),
      resultJson: JSON.stringify(ack),
    })
  }
}
