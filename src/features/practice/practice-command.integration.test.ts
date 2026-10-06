import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/platform/db/test-db'
import { serializeDb } from '@/platform/db/snapshot'
import { preparePracticeStorage } from './server/practice-storage-service'
import {
  executePracticeReviewCommand,
  getPracticeDetails,
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
    await handle.db
      .update(practiceReviewEvidence)
      .set({
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
    await createSettingsRepository(handle.db).updateSettings({
      review: { targetRetention: 0.95 },
    })
    const before = serializeDb(handle)
    const replay = await executePracticeReviewCommand(handle.db, update)
    if (replay.status === 'conflict') throw new Error('unexpected conflict')
    expect(replay.acknowledgement).toEqual(first.acknowledgement)
    expect(serializeDb(handle)).toEqual(before)
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
