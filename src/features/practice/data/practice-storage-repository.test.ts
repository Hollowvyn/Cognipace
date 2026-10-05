import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createPracticeRepository } from './practice-repository'
import {
  preparePracticeStorage,
  readPracticeStorageData,
  validatePracticeStorage,
  replacePracticeStorageDataInTransaction,
  clearPracticeStorageDataInTransaction,
} from './practice-storage-repository'
import { createTestDb } from '@/platform/db/test-db'
import {
  fsrsSchedulerProfiles,
  practiceReviewEvidence,
  practiceGenerations,
  practiceCommandReceipts,
  reviewAttempts,
  fsrsCards,
  problemPractice,
} from '@/platform/db/schema'
import {
  createFsrsSchedulerProfile,
  serializeFsrsSchedulerProfile,
  toSerializableFsrsCardSnapshot,
  parseSerializedFsrsReviewLogSnapshot,
} from '@/lib/fsrs'
import type { Db } from '@/platform/db'

describe('Practice additive storage', () => {
  it('clears imported assessment context on the selected unknown correction so current metadata stays valid', async () => {
    const { db } = await createTestDb()
    const repository = createPracticeRepository(db)
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewAttemptId: 'assessment-unknown',
    })
    await db
      .update(practiceReviewEvidence)
      .set({
        assessmentEvidenceJson: JSON.stringify({
          schemaVersion: 1,
          source: 'assessment',
          policyVersion: 'imported-v1',
          submissionIntent: 'quick-submit',
          reasonCode: 'quick-good',
          lockReason: null,
          finalRating: 'good',
        }),
      })
      .where(eq(practiceReviewEvidence.reviewAttemptId, 'assessment-unknown'))
    await validatePracticeStorage(db)
    await repository.overrideLastReviewResult({
      problemSlug: 'two-sum',
      rating: 'hard',
    })
    await validatePracticeStorage(db)
    expect((await readPracticeStorageData(db)).reviewEvidence[0]).toMatchObject(
      {
        revision: 1,
        applicationSequence: 1,
        schedulingEvidenceKind: 'unknown',
        assessmentEvidenceJson: null,
      },
    )
  })
  it('rejects partially covered cards before making any preparation changes', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewAttemptId: 'covered',
    })
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewAttemptId: 'missing',
    })
    await handle.db
      .delete(practiceReviewEvidence)
      .where(eq(practiceReviewEvidence.reviewAttemptId, 'missing'))
    await handle.db.delete(practiceGenerations)
    const before = await readPracticeStorageData(handle.db)
    await expect(preparePracticeStorage(handle.db)).rejects.toThrow(
      /partially covered/,
    )
    expect(await readPracticeStorageData(handle.db)).toEqual(before)
  })

  it('replaces active generations once while retaining imported historical receipt keys and base rows', async () => {
    const handle = await createTestDb()
    await createPracticeRepository(handle.db).saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewAttemptId: 'receipt-event',
      reviewedAt: new Date('2026-01-01T00:00:00Z'),
    })
    await insertSaveReceipt(handle.db, 'receipt-event')
    const imported = await readPracticeStorageData(handle.db)
    const before = ['fsrs_cards', 'review_attempts', 'problem_practice'].map(
      (table) =>
        handle.rawDb.exec({
          sql: `SELECT * FROM ${table}`,
          returnValue: 'resultRows',
        }),
    )
    await handle.db.transaction((tx) =>
      replacePracticeStorageDataInTransaction(
        tx as unknown as Db,
        imported,
        new Date('2026-02-01T00:00:00Z'),
      ),
    )
    const replaced = await readPracticeStorageData(handle.db)
    expect(replaced.reviewEvidence).toEqual(imported.reviewEvidence)
    expect(replaced.commandReceipts).toEqual(imported.commandReceipts)
    expect(replaced.generations.map((row) => row.generationToken)).not.toEqual(
      imported.generations.map((row) => row.generationToken),
    )
    expect(
      ['fsrs_cards', 'review_attempts', 'problem_practice'].map((table) =>
        handle.rawDb.exec({
          sql: `SELECT * FROM ${table}`,
          returnValue: 'resultRows',
        }),
      ),
    ).toEqual(before)
    await validatePracticeStorage(handle.db)
    await preparePracticeStorage(handle.db)
    expect(await readPracticeStorageData(handle.db)).toEqual(replaced)
  })

  it('clears sidecars in the caller transaction and initializes an empty replacement with only local scope', async () => {
    const { db } = await createTestDb()
    await createPracticeRepository(db).saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewAttemptId: 'cleared',
    })
    await db.transaction(async (tx) => {
      const writeDb = tx as unknown as Db
      await clearPracticeStorageDataInTransaction(writeDb)
      await writeDb.delete(reviewAttempts)
      await writeDb.delete(fsrsCards)
      await writeDb.delete(problemPractice)
      await replacePracticeStorageDataInTransaction(writeDb, {
        schedulerProfiles: [],
        reviewEvidence: [],
        generations: [],
        commandReceipts: [],
      })
    })
    const storage = await readPracticeStorageData(db)
    expect(storage.reviewEvidence).toEqual([])
    expect(storage.commandReceipts).toEqual([])
    expect(storage.generations).toEqual([
      expect.objectContaining({ scopeId: 'local', problemSlug: null }),
    ])
  })

  it('target reset removes own receipts and rotates only own scope while preserving sibling evidence and profiles', async () => {
    const { db } = await createTestDb()
    const repository = createPracticeRepository(db)
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewAttemptId: 'reset-event',
    })
    await repository.saveReviewResult({
      problemSlug: 'valid-parentheses',
      rating: 'easy',
      reviewAttemptId: 'sibling-event',
    })
    await insertSaveReceipt(db, 'reset-event')
    await insertSaveReceipt(db, 'sibling-event')
    await db.insert(fsrsSchedulerProfiles).values({
      id: 'retained-profile',
      profileJson: serializeFsrsSchedulerProfile(createFsrsSchedulerProfile()),
      createdAt: 0,
    })
    const before = await readPracticeStorageData(db)
    await repository.resetPracticeSchedule({ problemSlug: 'two-sum' })
    const after = await readPracticeStorageData(db)
    for (const scope of ['local', 'problem:valid-parentheses'])
      expect(after.generations.find((row) => row.scopeId === scope)).toEqual(
        before.generations.find((row) => row.scopeId === scope),
      )
    expect(
      after.generations.find((row) => row.scopeId === 'problem:two-sum')
        ?.generationToken,
    ).not.toBe(
      before.generations.find((row) => row.scopeId === 'problem:two-sum')
        ?.generationToken,
    )
    expect(after.commandReceipts).toEqual(
      before.commandReceipts.filter(
        (row) => row.problemSlug === 'valid-parentheses',
      ),
    )
    expect(after.reviewEvidence).toEqual(
      before.reviewEvidence.filter(
        (row) => row.reviewAttemptId === 'sibling-event',
      ),
    )
    expect(after.schedulerProfiles).toEqual(before.schedulerProfiles)
    await validatePracticeStorage(db)
  })
  it('prepares idempotently and preserves every old row value', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T00:00:00Z'),
      reviewAttemptId: 'attempt',
    })
    await handle.db.delete(practiceReviewEvidence)
    await handle.db.delete(practiceGenerations)
    const oldRows = handle.rawDb.exec({
      sql: 'SELECT * FROM review_attempts',
      returnValue: 'resultRows',
    })
    const oldCards = handle.rawDb.exec({
      sql: 'SELECT * FROM fsrs_cards',
      returnValue: 'resultRows',
    })
    const oldPractice = handle.rawDb.exec({
      sql: 'SELECT * FROM problem_practice',
      returnValue: 'resultRows',
    })
    await preparePracticeStorage(handle.db)
    const prepared = await readPracticeStorageData(handle.db)
    await preparePracticeStorage(handle.db)
    expect(await readPracticeStorageData(handle.db)).toEqual(prepared)
    expect(
      handle.rawDb.exec({
        sql: 'SELECT * FROM review_attempts',
        returnValue: 'resultRows',
      }),
    ).toEqual(oldRows)
    expect(
      handle.rawDb.exec({
        sql: 'SELECT * FROM fsrs_cards',
        returnValue: 'resultRows',
      }),
    ).toEqual(oldCards)
    expect(
      handle.rawDb.exec({
        sql: 'SELECT * FROM problem_practice',
        returnValue: 'resultRows',
      }),
    ).toEqual(oldPractice)
    expect(prepared.reviewEvidence[0]).toMatchObject({
      applicationSequence: 1,
      revision: 0,
      schedulingEvidenceKind: 'unknown',
      sequenceSource: 'legacy-inferred',
    })
    await validatePracticeStorage(handle.db)
  })

  it('enforces unique card sequence, canonical profile and receipt keys and cascades only event sidecars', async () => {
    const { db } = await createTestDb()
    await createPracticeRepository(db).saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewAttemptId: 'one',
    })
    await createPracticeRepository(db).saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewAttemptId: 'two',
    })
    const [evidence] = await db
      .select()
      .from(practiceReviewEvidence)
      .where(eq(practiceReviewEvidence.reviewAttemptId, 'one'))
    await expect(
      db
        .update(practiceReviewEvidence)
        .set({ applicationSequence: evidence!.applicationSequence })
        .where(eq(practiceReviewEvidence.reviewAttemptId, 'two')),
    ).rejects.toThrow()
    const profileJson = serializeFsrsSchedulerProfile(
      createFsrsSchedulerProfile(),
    )
    await db
      .insert(fsrsSchedulerProfiles)
      .values({ id: 'profile', profileJson, createdAt: 0 })
    await expect(
      db
        .insert(fsrsSchedulerProfiles)
        .values({ id: 'duplicate', profileJson, createdAt: 0 }),
    ).rejects.toThrow()
    const receipt = {
      generationKey: '["local",null]',
      commandId: 'cmd',
      payloadFingerprint: 'a'.repeat(64),
      operation: 'save',
      problemSlug: 'two-sum',
      cardId: evidence!.cardId,
      reviewAttemptId: 'one',
      applicationSequence: 1,
      revision: 0,
      acceptedAt: 0,
      commandSummaryJson: '{}',
      resultJson: '{}',
    }
    await db.insert(practiceCommandReceipts).values(receipt)
    await expect(
      db.insert(practiceCommandReceipts).values(receipt),
    ).rejects.toThrow()
    await db.delete(reviewAttempts).where(eq(reviewAttempts.id, 'one'))
    expect(await db.select().from(practiceCommandReceipts)).toEqual([])
    expect(await db.select().from(practiceReviewEvidence)).toHaveLength(1)
    expect(await db.select().from(fsrsSchedulerProfiles)).toHaveLength(1)
    expect(await db.select().from(practiceGenerations)).toHaveLength(2)
    const [generation] = await db
      .select()
      .from(practiceGenerations)
      .where(eq(practiceGenerations.problemSlug, 'two-sum'))
    await expect(
      db
        .insert(practiceGenerations)
        .values({ ...generation!, scopeId: 'other' }),
    ).rejects.toThrow()
    await db.delete(fsrsCards)
    expect(await db.select().from(practiceReviewEvidence)).toEqual([])
    expect(await db.select().from(fsrsSchedulerProfiles)).toHaveLength(1)
    expect(await db.select().from(practiceGenerations)).toHaveLength(2)
  })
})

async function insertSaveReceipt(db: Db, attemptId: string) {
  const [attempt] = await db
    .select()
    .from(reviewAttempts)
    .where(eq(reviewAttempts.id, attemptId))
  const [evidence] = await db
    .select()
    .from(practiceReviewEvidence)
    .where(eq(practiceReviewEvidence.reviewAttemptId, attemptId))
  if (!attempt || !evidence) throw new Error('Missing fixture event.')
  const details = await createPracticeRepository(db).getPracticeDetails(
    attempt.problemSlug,
  )
  if (!details.card) throw new Error('Missing fixture card.')
  const reviewedAt = new Date(attempt.reviewedAt).toISOString()
  await db.insert(practiceCommandReceipts).values({
    generationKey: '["historical-local","historical-problem"]',
    commandId: attemptId,
    payloadFingerprint: 'a'.repeat(64),
    operation: 'save',
    problemSlug: attempt.problemSlug,
    cardId: attempt.cardId,
    reviewAttemptId: attemptId,
    applicationSequence: evidence.applicationSequence,
    revision: 0,
    acceptedAt: attempt.reviewedAt,
    commandSummaryJson: JSON.stringify({
      schemaVersion: 1,
      rating: attempt.rating,
      reviewedAt,
      targetAttemptId: null,
      expectedRevision: null,
    }),
    resultJson: JSON.stringify({
      schemaVersion: 1,
      operation: 'save',
      problemSlug: attempt.problemSlug,
      cardId: attempt.cardId,
      reviewAttemptId: attemptId,
      applicationSequence: evidence.applicationSequence,
      revision: 0,
      rating: attempt.rating,
      reviewedAt,
      dueAt: details.card.dueAt.toISOString(),
      status: details.status,
      card: toSerializableFsrsCardSnapshot(details.card),
      fsrsReviewLog: attempt.fsrsReviewLog
        ? parseSerializedFsrsReviewLogSnapshot(attempt.fsrsReviewLog)
        : null,
      schedulingEvidenceKind: 'unknown',
      schedulerProfileId: null,
    }),
  })
}
