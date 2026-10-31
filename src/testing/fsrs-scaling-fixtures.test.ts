import { afterEach, describe, expect, it } from 'vitest'

import {
  exportFullBackup,
  prepareFullBackupRestore,
  restoreFullBackup,
} from '@/features/backup/server/backup-service'
import {
  preparePracticeStorage,
  validatePracticeStorage,
} from '@/features/practice/server/practice-storage-service'
import { getPracticeDetails } from '@/features/practice/server/practice-service'
import { defaultUserSettings } from '@/features/settings/domain'
import { parseSerializedFsrsSchedulerProfile } from '@/lib/fsrs'
import { createDb, createSqliteWasmLocator } from '@/platform/db/client'
import { deserializeDb } from '@/platform/db/snapshot'
import { createTestDb } from '@/platform/db/test-db'
import { settingsKv } from '@/platform/db/schema'

import {
  createFsrsScalingFixture,
  fsrsScalingSeed,
  type FsrsScalingFixture,
} from './fsrs-scaling-fixtures'

const fixtures: FsrsScalingFixture[] = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.handle.rawDb.close()
})

describe('FSRS scaling fixtures', () => {
  it.each([
    ['standard', 250, 5_000],
    ['stress', 2_500, 50_000],
    ['single-card', 1, 10_000],
  ] as const)(
    '%s has exact valid counts and survives detached backup and snapshot validation',
    async (kind, problems, reviews) => {
      const fixture = await createFsrsScalingFixture(kind)
      fixtures.push(fixture)

      expect(fixture.seed).toBe(fsrsScalingSeed)
      expect(fixture.counts).toEqual({ problems, reviews })
      expect(fixture.backup.data.problems).toHaveLength(problems)
      expect(fixture.backup.data.practice.reviewAttempts).toHaveLength(reviews)
      expect(fixture.backup.data.practice.reviewEvidence).toHaveLength(reviews)
      expect(fixture.backup.data.practice.commandReceipts).toHaveLength(1)
      const times = fixture.backup.data.practice.reviewAttempts.map((row) =>
        new Date(row.reviewedAt).getTime(),
      )
      const asOf = Date.UTC(2026, 9, 10, 12)
      expect(Math.min(...times)).toBeLessThan(asOf - 90 * 86_400_000)
      expect(Math.max(...times)).toBeGreaterThanOrEqual(asOf - 30 * 86_400_000)
      expect(Math.max(...times)).toBeLessThanOrEqual(asOf)
      expect(
        prepareFullBackupRestore(fixture.backup).summary.counts,
      ).toMatchObject({
        problems,
        reviewAttempts: reviews,
      })
      expect(
        fixture.handle.rawDb.exec({
          sql: 'PRAGMA foreign_key_check',
          returnValue: 'resultRows',
        }),
      ).toEqual([])
      await expect(
        validatePracticeStorage(fixture.handle.db),
      ).resolves.toBeUndefined()

      const reopened = await createDb({ locateWasm: createSqliteWasmLocator() })
      try {
        deserializeDb(reopened, fixture.snapshot)
        expect(
          reopened.rawDb.exec({
            sql: 'SELECT count(*) FROM review_attempts',
            returnValue: 'resultRows',
          }),
        ).toEqual([[reviews]])
        await expect(
          validatePracticeStorage(reopened.db),
        ).resolves.toBeUndefined()
      } finally {
        reopened.rawDb.close()
      }
    },
    180_000,
  )

  it('retains deterministic ties, corrections, profile provenance, exclusions and track links', async () => {
    const fixture = await createFsrsScalingFixture('standard')
    fixtures.push(fixture)
    const { data } = fixture.backup
    const evidenceKinds = new Set(
      data.practice.reviewEvidence.map((row) => row.schedulingEvidenceKind),
    )
    const timestamps = data.practice.reviewAttempts.map((row) => row.reviewedAt)
    expect(evidenceKinds).toEqual(
      new Set(['captured', 'legacy-derived', 'unknown']),
    )
    expect(new Set(timestamps).size).toBeLessThan(timestamps.length)
    expect(data.practice.reviewEvidence.some((row) => row.revision > 0)).toBe(
      true,
    )
    expect(data.practice.schedulerProfiles).toHaveLength(2)
    expect(data.practice.commandReceipts).toHaveLength(1)
    expect(
      data.practice.schedulerProfiles.map(
        (row) =>
          parseSerializedFsrsSchedulerProfile(row.profileJson).parameters
            .maximumInterval,
      ),
    ).toEqual([180, 180])
    expect(data.problems.some((row) => row.isPremium)).toBe(true)
    expect(data.practice.problemPractice.some((row) => row.isSuspended)).toBe(
      true,
    )
    expect(data.tracks.memberships.length).toBeGreaterThan(0)
    expect(
      data.tracks.progress.some((row) => row.reviewAttemptId !== null),
    ).toBe(true)
    expect(
      data.practice.reviewAttempts.some(
        (row) => (row.notes?.length ?? 0) > 100,
      ),
    ).toBe(true)
  }, 60_000)

  it('puts a usable captured Update target first for the benchmark runner', async () => {
    const fixture = await createFsrsScalingFixture('standard')
    fixtures.push(fixture)
    const first = fixture.backup.data.problems[0]!
    const practice = fixture.backup.data.practice.problemPractice.find(
      (row) => row.problemSlug === first.slug,
    )
    const card = fixture.backup.data.practice.fsrsCards.find(
      (row) => row.problemSlug === first.slug,
    )
    const evidence = fixture.backup.data.practice.reviewEvidence.find(
      (row) => row.cardId === card?.id && row.applicationSequence === 20,
    )
    const details = await getPracticeDetails(fixture.handle.db, first.slug)
    expect(first.isPremium).toBe(false)
    expect(practice?.isSuspended).toBe(false)
    expect(evidence?.schedulingEvidenceKind).toBe('captured')
    expect(details.canOverrideLatestReview).toBe(true)
  }, 60_000)

  it('associates earned track credit with a matching review outcome', async () => {
    const fixture = await createFsrsScalingFixture('standard')
    fixtures.push(fixture)
    const attempts = new Map(
      fixture.backup.data.practice.reviewAttempts.map((row) => [row.id, row]),
    )
    for (const row of fixture.backup.data.tracks.progress) {
      const attempt = attempts.get(row.reviewAttemptId!)
      expect(attempt?.problemSlug).toBe(row.problemSlug)
      expect(attempt?.rating).toBe(row.completedRating)
      expect(attempt?.reviewedAt).toBe(row.completedAt)
    }
  }, 60_000)

  it('loads the full backup into a fresh migrated database with exact review counts', async () => {
    const fixture = await createFsrsScalingFixture('standard')
    fixtures.push(fixture)
    const restored = await createTestDb({ seed: false })
    try {
      await restoreFullBackup(restored.db, fixture.backup)
      const reexported = await exportFullBackup(restored.db, {
        exportedAt: new Date(fixture.backup.exportedAt),
        appVersion: fixture.backup.source.appVersion ?? '2.2.0',
      })
      const fixtureSlugs = new Set(
        fixture.backup.data.problems.map((row) => row.slug),
      )
      expect(
        reexported.data.problems.filter((row) => fixtureSlugs.has(row.slug)),
      ).toEqual(fixture.backup.data.problems)
      expect(reexported.data.practice.problemPractice).toEqual(
        fixture.backup.data.practice.problemPractice,
      )
      expect(reexported.data.practice.fsrsCards).toEqual(
        fixture.backup.data.practice.fsrsCards,
      )
      expect(reexported.data.practice.reviewAttempts).toEqual(
        fixture.backup.data.practice.reviewAttempts,
      )
      expect(reexported.data.practice.reviewEvidence).toEqual(
        fixture.backup.data.practice.reviewEvidence,
      )
      expect(reexported.data.practice.schedulerProfiles).toEqual(
        fixture.backup.data.practice.schedulerProfiles,
      )
      expect(
        reexported.data.practice.generations.map((row) => [
          row.scopeId,
          row.problemSlug,
        ]),
      ).toEqual(
        fixture.backup.data.practice.generations.map((row) => [
          row.scopeId,
          row.problemSlug,
        ]),
      )
      expect(reexported.data.practice.generations[0]?.generationToken).not.toBe(
        fixture.backup.data.practice.generations[0]?.generationToken,
      )
      expect(reexported.data.practice.commandReceipts).toEqual(
        fixture.backup.data.practice.commandReceipts,
      )
      const fixtureTrackIds = new Set(
        fixture.backup.data.tracks.tracks.map((row) => row.id),
      )
      const fixtureGroupIds = new Set(
        fixture.backup.data.tracks.groups.map((row) => row.id),
      )
      expect(
        reexported.data.tracks.tracks.filter((row) =>
          fixtureTrackIds.has(row.id),
        ),
      ).toEqual(fixture.backup.data.tracks.tracks)
      expect(
        reexported.data.tracks.groups.filter((row) =>
          fixtureTrackIds.has(row.trackId),
        ),
      ).toEqual(fixture.backup.data.tracks.groups)
      expect(
        reexported.data.tracks.memberships.filter((row) =>
          fixtureGroupIds.has(row.trackGroupId),
        ),
      ).toEqual(fixture.backup.data.tracks.memberships)
      expect(
        reexported.data.tracks.progress.filter((row) =>
          fixtureTrackIds.has(row.trackId),
        ),
      ).toEqual(fixture.backup.data.tracks.progress)
      expect(reexported.data.tracks.session).toEqual(
        fixture.backup.data.tracks.session,
      )
      expect(reexported.data.settings).toEqual(fixture.backup.data.settings)
      expect(
        restored.rawDb.exec({
          sql: 'SELECT count(*) FROM review_attempts',
          returnValue: 'resultRows',
        }),
      ).toEqual([[fixture.counts.reviews]])
      await expect(
        validatePracticeStorage(restored.db),
      ).resolves.toBeUndefined()
    } finally {
      restored.rawDb.close()
    }
  }, 120_000)

  it('preserves a populated AI-disabled Settings row through full restore', async () => {
    const source = await createTestDb({ seed: false })
    const restored = await createTestDb({ seed: false })
    const stamp = Date.UTC(2026, 9, 10, 12)
    const value = JSON.stringify({
      ...defaultUserSettings,
      practice: { ...defaultUserSettings.practice, dailyGoal: 7 },
      aiAssessment: { ...defaultUserSettings.aiAssessment, enabled: false },
    })
    try {
      await preparePracticeStorage(source.db, new Date(stamp))
      await source.db.insert(settingsKv).values({
        key: 'user-settings',
        value,
        updatedAt: stamp,
      })
      await restored.db.insert(settingsKv).values({
        key: 'user-settings',
        value: JSON.stringify(defaultUserSettings),
        updatedAt: stamp - 1,
      })
      const backup = await exportFullBackup(source.db, {
        exportedAt: new Date(stamp),
      })
      expect(backup.data.settings).toHaveLength(1)

      await restoreFullBackup(restored.db, backup)

      const reexported = await exportFullBackup(restored.db, {
        exportedAt: new Date(stamp),
      })
      expect(reexported.data.settings).toEqual(backup.data.settings)
      expect(await restored.db.select().from(settingsKv)).toEqual([
        { key: 'user-settings', value, updatedAt: stamp },
      ])
    } finally {
      source.rawDb.close()
      restored.rawDb.close()
    }
  })

  it('repeats the same bytes for the same seed without touching Chrome storage', async () => {
    const first = await createFsrsScalingFixture('standard')
    const second = await createFsrsScalingFixture('standard')
    fixtures.push(first, second)
    expect(second.snapshot).toEqual(first.snapshot)
    expect(second.backup).toEqual(first.backup)
  }, 120_000)
})
