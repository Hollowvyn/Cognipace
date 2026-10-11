import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/platform/db/test-db'
import { serializeDb } from '@/platform/db/snapshot'
import { preparePracticeStorage } from './server/practice-storage-service'
import {
  executePracticeReviewCommand,
  getPracticeDetails,
  previewPracticeReview,
  resetPracticeSchedule,
} from './server/practice-service'
import { createTracksRepository } from '@/features/tracks/data/tracks-repository'
import {
  trackProblemProgress,
  practiceReviewEvidence,
  reviewAttempts,
} from '@/platform/db/schema'
import {
  correctLegacyReview,
  parseSerializedFsrsReviewLogSnapshot,
  parseSerializedFsrsSchedulerProfile,
  toSerializableFsrsCardSnapshot,
} from '@/lib/fsrs'
import { createPracticeRepository } from './data/practice-repository'
import {
  exportFullBackup,
  restoreFullBackup,
  resetLocalData,
} from '@/features/backup/server/backup-service'
import { readPracticeStorageData } from './data/practice-storage-repository'
import { createSettingsRepository } from '@/features/settings/data/settings-repository'

async function fixture() {
  const handle = await createTestDb()
  await preparePracticeStorage(handle.db)
  const generation = (await getPracticeDetails(handle.db, 'two-sum'))
    .generation!
  const command = {
    operation: 'save' as const,
    commandId: 'save-one',
    problemSlug: 'two-sum',
    generation,
    rating: 'good' as const,
    reviewedAt: '2026-01-01T10:00:00.000Z',
    reviewMode: 'manual' as const,
    log: { notes: 'first' },
  }
  return { handle, command }
}

describe('accepted Practice commands', () => {
  it.each([0.9, 0.75])(
    'previews a new card at %s retention without writes and matches all four fixed-time saves',
    async (retention) => {
      const { handle, command } = await fixture()
      await createSettingsRepository(handle.db).updateSettings({
        review: { targetRetention: retention },
      })
      const before = serializeDb(handle)
      const preview = await previewPracticeReview(handle.db, {
        mode: 'submit',
        problemSlug: command.problemSlug,
        generation: command.generation,
        previewedAt: command.reviewedAt,
      })
      expect(serializeDb(handle)).toEqual(before)
      expect(preview.status).toBe('ready')
      if (preview.status !== 'ready') throw new Error('preview unavailable')
      expect(preview.evidence).toBe('active')
      for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
        const other = await fixture()
        await createSettingsRepository(other.handle.db).updateSettings({
          review: { targetRetention: retention },
        })
        const saved = await executePracticeReviewCommand(other.handle.db, {
          ...other.command,
          rating,
        })
        if (saved.status !== 'saved') throw new Error('save unavailable')
        expect(preview.ratings[rating].dueAt).toBe(saved.acknowledgement.dueAt)
      }
    },
    20_000,
  )

  it('previews exact original-event corrections without changing state', async () => {
    const { handle, command } = await fixture()
    const saved = await executePracticeReviewCommand(handle.db, command)
    if (saved.status !== 'saved') throw new Error('save unavailable')
    const request = {
      mode: 'update' as const,
      problemSlug: command.problemSlug,
      generation: saved.current.generation!,
      targetAttemptId: saved.acknowledgement.reviewAttemptId,
      expectedRevision: 0,
      reviewedAt: command.reviewedAt,
    }
    const before = serializeDb(handle)
    const preview = await previewPracticeReview(handle.db, request)
    expect(serializeDb(handle)).toEqual(before)
    expect(preview.status).toBe('ready')
    if (preview.status !== 'ready') throw new Error('preview unavailable')
    expect(preview.ratings.easy.eligibleOn < '2026-10-10').toBe(true)
    expect(
      await previewPracticeReview(handle.db, {
        ...request,
        generation: {
          ...request.generation,
          localGenerationToken: 'old-generation',
        },
      }),
    ).toMatchObject({ status: 'conflict', reason: 'stale-generation' })
    const { reviewMode: _mode, ...updateFields } = command
    void _mode
    const updated = await executePracticeReviewCommand(handle.db, {
      ...updateFields,
      operation: 'update',
      commandId: 'update-preview',
      generation: request.generation,
      targetAttemptId: request.targetAttemptId,
      expectedRevision: 0,
      rating: 'easy',
    })
    if (updated.status !== 'saved') throw new Error(JSON.stringify(updated))
    expect(preview.ratings.easy.dueAt).toBe(updated.acknowledgement.dueAt)
    expect(await previewPracticeReview(handle.db, request)).toMatchObject({
      status: 'conflict',
      reason: 'stale-review',
    })
  })

  it.each([0.9, 0.75])(
    'matches every captured Update rating at original %s retention after Settings change',
    async (retention) => {
      for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
        const { handle, command } = await fixture()
        await createSettingsRepository(handle.db).updateSettings({
          review: { targetRetention: retention },
        })
        const saved = await executePracticeReviewCommand(handle.db, command)
        if (saved.status !== 'saved') throw new Error('save unavailable')
        await createSettingsRepository(handle.db).updateSettings({
          review: { targetRetention: retention === 0.9 ? 0.75 : 0.9 },
        })
        const request = {
          mode: 'update' as const,
          problemSlug: command.problemSlug,
          generation: saved.current.generation!,
          targetAttemptId: saved.acknowledgement.reviewAttemptId,
          expectedRevision: 0,
          reviewedAt: command.reviewedAt,
        }
        const before = serializeDb(handle)
        const preview = await previewPracticeReview(handle.db, request)
        expect(serializeDb(handle)).toEqual(before)
        expect(preview.status).toBe('ready')
        if (preview.status !== 'ready') throw new Error('preview unavailable')
        expect(preview.evidence).toBe('captured')
        const { reviewMode: _mode, ...updateFields } = command
        void _mode
        const updated = await executePracticeReviewCommand(handle.db, {
          ...updateFields,
          operation: 'update',
          commandId: `update-${retention}-${rating}`,
          generation: request.generation,
          targetAttemptId: request.targetAttemptId,
          expectedRevision: 0,
          rating,
        })
        if (updated.status !== 'saved') throw new Error('update unavailable')
        expect(preview.ratings[rating].dueAt).toBe(
          updated.acknowledgement.dueAt,
        )
        expect(preview.ratings[rating].eligibleOn).toBe(
          updated.current.eligibleOn,
        )
      }
    },
    20_000,
  )

  it('reports ambiguous legacy correction context without writes', async () => {
    const { handle, command } = await fixture()
    const repository = createPracticeRepository(handle.db)
    await repository.saveReviewResult({
      problemSlug: command.problemSlug,
      rating: 'easy',
      reviewedAt: new Date(command.reviewedAt),
      reviewAttemptId: 'earlier',
    })
    await repository.saveReviewResult({
      problemSlug: command.problemSlug,
      rating: 'good',
      reviewedAt: new Date('2026-01-10T10:00:00.000Z'),
      reviewAttemptId: 'latest',
    })
    await handle.db.update(practiceReviewEvidence).set({
      schedulingEvidenceKind: 'unknown',
      schedulerProfileId: null,
      preCardJson: null,
      sequenceSource: 'legacy-inferred',
    })
    await handle.db
      .update(reviewAttempts)
      .set({ fsrsReviewLog: null })
      .where(eq(reviewAttempts.id, 'earlier'))
    const generation = (
      await getPracticeDetails(handle.db, command.problemSlug)
    ).generation!
    const before = serializeDb(handle)
    expect(
      await previewPracticeReview(handle.db, {
        mode: 'update',
        problemSlug: command.problemSlug,
        generation,
        targetAttemptId: 'latest',
        expectedRevision: 0,
        reviewedAt: '2026-01-10T10:00:00.000Z',
      }),
    ).toMatchObject({ status: 'unavailable', reason: 'unsupported-legacy' })
    expect(serializeDb(handle)).toEqual(before)
  })
  it('replays the bootstrap receipt after settings changes and a later review, returning fresh current separately', async () => {
    const { handle, command } = await fixture()
    const tracks = createTracksRepository(handle.db)
    await tracks.setActiveTrack('leetcode-75')
    await createSettingsRepository(handle.db).updateSettings({
      practice: { mode: 'studyPlan' },
    })
    const first = await executePracticeReviewCommand(handle.db, command)
    await createSettingsRepository(handle.db).updateSettings({
      review: { targetRetention: 0.75 },
    })
    await tracks.setActiveTrack('grind-75')
    const generation = (await getPracticeDetails(handle.db, 'two-sum'))
      .generation!
    await executePracticeReviewCommand(handle.db, {
      ...command,
      commandId: 'save-two',
      generation,
      reviewedAt: '2026-01-02T10:00:00.000Z',
    })
    const before = serializeDb(handle)
    const replay = await executePracticeReviewCommand(handle.db, command)
    expect(replay.status).toBe('saved')
    if (first.status === 'conflict' || replay.status === 'conflict')
      throw new Error('unexpected conflict')
    expect(replay.acknowledgement).toEqual(first.acknowledgement)
    expect(replay.current.reviewCount).toBe(2)
    expect(serializeDb(handle)).toEqual(before)
  })
  it.each([
    { elapsedSeconds: 30 },
    { log: { notes: null } },
    { reviewedAt: '2026-01-02T10:00:00.000Z' },
  ])('rejects changed accepted payload without writes %j', async (patch) => {
    const { handle, command } = await fixture()
    await executePracticeReviewCommand(handle.db, command)
    const before = serializeDb(handle)
    expect(
      await executePracticeReviewCommand(handle.db, { ...command, ...patch }),
    ).toMatchObject({ status: 'conflict', reason: 'command-conflict' })
    expect(serializeDb(handle)).toEqual(before)
  })
  it('rejects competing corrections but replays an older correction receipt after later revision', async () => {
    const { handle, command } = await fixture()
    const saved = await executePracticeReviewCommand(handle.db, command)
    if (saved.status === 'conflict') throw new Error('unexpected conflict')
    const { reviewMode: _mode, ...updateFields } = command
    void _mode
    const update = {
      ...updateFields,
      operation: 'update' as const,
      commandId: 'update-one',
      generation: saved.current.generation!,
      targetAttemptId: saved.acknowledgement.reviewAttemptId,
      expectedRevision: 0,
      rating: 'hard' as const,
    }
    const first = await executePracticeReviewCommand(handle.db, update)
    expect(
      await executePracticeReviewCommand(handle.db, {
        ...update,
        commandId: 'competitor',
      }),
    ).toMatchObject({ status: 'conflict', reason: 'stale-review' })
    await executePracticeReviewCommand(handle.db, {
      ...update,
      commandId: 'update-two',
      expectedRevision: 1,
      rating: 'easy',
    })
    const before = serializeDb(handle)
    const replay = await executePracticeReviewCommand(handle.db, update)
    if (first.status === 'conflict' || replay.status === 'conflict')
      throw new Error('unexpected conflict')
    expect(replay.acknowledgement).toEqual(first.acknowledgement)
    expect(replay.current.latestReview?.revision).toBe(2)
    expect(serializeDb(handle)).toEqual(before)
  })
  it('captures saved retention for a legacy correction and replays it after Settings change', async () => {
    const { handle, command } = await fixture()
    const repository = createPracticeRepository(handle.db)
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'easy',
      reviewedAt: new Date(command.reviewedAt),
      targetRetention: 0.75,
      reviewAttemptId: 'legacy-first',
    })
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-10T10:00:00.000Z'),
      targetRetention: 0.75,
      reviewAttemptId: 'legacy-latest',
    })
    await handle.db.update(practiceReviewEvidence).set({
      schedulingEvidenceKind: 'unknown',
      schedulerProfileId: null,
      preCardJson: null,
      sequenceSource: 'legacy-inferred',
    })
    await createSettingsRepository(handle.db).updateSettings({
      review: { targetRetention: 0.75 },
    })
    const original = await repository.getPracticeDetails('two-sum')
    const history = await handle.db
      .select()
      .from(reviewAttempts)
      .where(eq(reviewAttempts.problemSlug, 'two-sum'))
      .orderBy(reviewAttempts.reviewedAt)
    const expected = correctLegacyReview(
      original.card!,
      history.map((attempt) => ({
        reviewedAt: new Date(attempt.reviewedAt),
        rating: attempt.rating as 'easy' | 'good',
        log: parseSerializedFsrsReviewLogSnapshot(attempt.fsrsReviewLog!),
      })),
      'hard',
      0.75,
    )
    const update = {
      operation: 'update' as const,
      commandId: 'legacy-update',
      problemSlug: 'two-sum',
      generation: original.generation!,
      targetAttemptId: 'legacy-latest',
      expectedRevision: 0,
      reviewedAt: '2026-01-10T10:00:00.000Z',
      rating: 'hard' as const,
    }
    const legacyPreview = await previewPracticeReview(handle.db, {
      mode: 'update',
      problemSlug: update.problemSlug,
      generation: update.generation,
      targetAttemptId: update.targetAttemptId,
      expectedRevision: update.expectedRevision,
      reviewedAt: update.reviewedAt,
    })
    expect(legacyPreview.status).toBe('ready')
    if (legacyPreview.status !== 'ready')
      throw new Error('legacy preview unavailable')
    expect(legacyPreview.evidence).toBe('legacy-derived')
    const first = await executePracticeReviewCommand(handle.db, update)
    if (first.status === 'conflict') throw new Error('unexpected conflict')
    const storage = await readPracticeStorageData(handle.db)
    const evidence = storage.reviewEvidence.find(
      (row) => row.reviewAttemptId === 'legacy-latest',
    )!
    expect(evidence.schedulingEvidenceKind).toBe('legacy-derived')
    const profile = parseSerializedFsrsSchedulerProfile(
      storage.schedulerProfiles.find(
        (row) => row.id === evidence.schedulerProfileId,
      )!.profileJson,
    )
    expect(profile.parameters.targetRetention).toBe(0.75)
    expect(first.acknowledgement.card).toEqual(
      toSerializableFsrsCardSnapshot(expected.card),
    )
    expect(legacyPreview.ratings.hard.dueAt).toBe(first.acknowledgement.dueAt)
    await createSettingsRepository(handle.db).updateSettings({
      review: { targetRetention: 0.95 },
    })
    const before = serializeDb(handle)
    const repeatedPreview = await previewPracticeReview(handle.db, {
      mode: 'update',
      problemSlug: update.problemSlug,
      generation: update.generation,
      targetAttemptId: update.targetAttemptId,
      expectedRevision: 1,
      reviewedAt: update.reviewedAt,
    })
    expect(repeatedPreview).toMatchObject({
      status: 'ready',
      evidence: 'legacy-derived',
    })
    const replay = await executePracticeReviewCommand(handle.db, update)
    if (replay.status === 'conflict') throw new Error('unexpected conflict')
    expect(replay.acknowledgement).toEqual(first.acknowledgement)
    expect(serializeDb(handle)).toEqual(before)

    const second = await executePracticeReviewCommand(handle.db, {
      ...update,
      commandId: 'legacy-update-two',
      expectedRevision: 1,
      rating: 'easy',
    })
    expect(second.status).toBe('saved')
    const originalStorage = await readPracticeStorageData(handle.db)
    const ownedRows = handle.rawDb.exec({
      sql: 'SELECT * FROM review_attempts ORDER BY id',
      returnValue: 'resultRows',
    })
    const cardRows = handle.rawDb.exec({
      sql: 'SELECT * FROM fsrs_cards ORDER BY id',
      returnValue: 'resultRows',
    })
    await restoreFullBackup(handle.db, await exportFullBackup(handle.db))
    const imported = await readPracticeStorageData(handle.db)
    expect(imported.reviewEvidence).toEqual(originalStorage.reviewEvidence)
    expect(imported.schedulerProfiles).toEqual(
      originalStorage.schedulerProfiles,
    )
    expect(imported.commandReceipts).toEqual(originalStorage.commandReceipts)
    expect(
      handle.rawDb.exec({
        sql: 'SELECT * FROM review_attempts ORDER BY id',
        returnValue: 'resultRows',
      }),
    ).toEqual(ownedRows)
    expect(
      handle.rawDb.exec({
        sql: 'SELECT * FROM fsrs_cards ORDER BY id',
        returnValue: 'resultRows',
      }),
    ).toEqual(cardRows)
    expect(await executePracticeReviewCommand(handle.db, update)).toMatchObject(
      { status: 'conflict', reason: 'stale-generation' },
    )
  })
  it('rejects a retained bootstrap command after targeted reset', async () => {
    const { handle, command } = await fixture()
    await executePracticeReviewCommand(handle.db, command)
    await resetPracticeSchedule(handle.db, { problemSlug: 'two-sum' })
    const before = serializeDb(handle)
    expect(
      await executePracticeReviewCommand(handle.db, command),
    ).toMatchObject({ status: 'conflict', reason: 'stale-generation' })
    expect(
      (await readPracticeStorageData(handle.db)).commandReceipts,
    ).toHaveLength(0)
    expect(serializeDb(handle)).toEqual(before)
  })
  it('rejects restored historical receipts after the local generation rotates', async () => {
    const { handle, command } = await fixture()
    await executePracticeReviewCommand(handle.db, command)
    const imported = await readPracticeStorageData(handle.db)
    const backup = await exportFullBackup(handle.db)
    await restoreFullBackup(handle.db, backup)
    expect((await readPracticeStorageData(handle.db)).commandReceipts).toEqual(
      imported.commandReceipts,
    )
    const before = serializeDb(handle)
    expect(
      await executePracticeReviewCommand(handle.db, command),
    ).toMatchObject({ status: 'conflict', reason: 'stale-generation' })
    expect(serializeDb(handle)).toEqual(before)
  })
  it('rejects retained commands after full reset rotates the local token', async () => {
    const { handle, command } = await fixture()
    await executePracticeReviewCommand(handle.db, command)
    await resetLocalData(handle.db)
    const before = serializeDb(handle)
    expect(
      await executePracticeReviewCommand(handle.db, command),
    ).toMatchObject({ status: 'conflict', reason: 'stale-generation' })
    expect(serializeDb(handle)).toEqual(before)
  })
  it('rolls all review writes back if the receipt cannot be inserted', async () => {
    const { handle, command } = await fixture()
    await createTracksRepository(handle.db).setActiveTrack('leetcode-75')
    await createSettingsRepository(handle.db).updateSettings({
      practice: { mode: 'studyPlan' },
    })
    handle.rawDb.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON practice_command_receipts BEGIN SELECT RAISE(ABORT, 'forced receipt failure'); END",
    )
    const before = serializeDb(handle)
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        executePracticeReviewCommand(handle.db, command),
      ).rejects.toThrow('practice_command_receipts')
    } finally {
      stderr.mockRestore()
    }
    expect(await handle.db.select().from(trackProblemProgress)).toEqual([])
    expect(serializeDb(handle)).toEqual(before)
  })
})
