import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { settingsKv } from '@/platform/db/schema'
import { createTestDb } from '@/platform/db/test-db'

import { defaultUserSettings } from '../domain'
import { createSettingsRepository } from './settings-repository'

describe('SettingsRepository', () => {
  it('keeps all other goals when separate clients save first-attempt goals', async () => {
    const handle = await createTestDb({ seed: false })
    const firstClient = createSettingsRepository(handle.db)
    const secondClient = createSettingsRepository(handle.db)
    const original = await firstClient.updateSettings({
      analytics: {
        targetRecall: 0.825,
        targetReviewSuccess: 0.955,
        targetFirstAttemptSuccess: 0.8,
        targetFirstAttemptGoodEasy: 0.6,
      },
      review: { targetRetention: 0.75 },
    })

    await secondClient.updateSettings({
      analytics: { targetFirstAttemptGoodEasy: 1 },
    })
    const saved = await firstClient.updateSettings({
      analytics: { targetFirstAttemptSuccess: 0.29 },
    })

    expect(saved).toEqual({
      ...original,
      analytics: {
        ...original.analytics,
        targetFirstAttemptSuccess: 0.29,
        targetFirstAttemptGoodEasy: 1,
      },
    })
    await expect(
      createSettingsRepository(handle.db).getSettings(),
    ).resolves.toEqual(saved)
  })

  it('recovers one malformed stored first-attempt goal and preserves the other saved goals', async () => {
    const handle = await createTestDb({ seed: false })
    const analytics = {
      targetRecall: 0.825,
      targetReviewSuccess: 0.955,
      targetFirstAttemptSuccess: 0.295,
      targetFirstAttemptGoodEasy: 0.29,
    }
    await handle.db.insert(settingsKv).values({
      key: 'user-settings',
      value: JSON.stringify({ ...defaultUserSettings, analytics }),
      updatedAt: 1,
    })

    await expect(
      createSettingsRepository(handle.db).getSettings(),
    ).resolves.toEqual({
      ...defaultUserSettings,
      analytics: { ...analytics, targetFirstAttemptSuccess: 0.9 },
    })
  })

  it('rejects malformed first-attempt patches atomically', async () => {
    const handle = await createTestDb({ seed: false })
    const repository = createSettingsRepository(handle.db)
    await repository.updateSettings({ practice: { dailyGoal: 12 } })
    const rowsBefore = await handle.db.select().from(settingsKv)

    await expect(
      repository.updateSettings({
        analytics: { targetFirstAttemptSuccess: 0.295 },
        practice: { dailyGoal: 20 },
      }),
    ).rejects.toThrow()
    expect(await handle.db.select().from(settingsKv)).toEqual(rowsBefore)
  })

  it('reads old settings with independent default analytics targets', async () => {
    const handle = await createTestDb({ seed: false })
    const oldSettings = {
      ...defaultUserSettings,
      review: { ...defaultUserSettings.review, targetRetention: 0.75 },
    }
    delete (oldSettings as Record<string, unknown>).analytics
    await handle.db.insert(settingsKv).values({
      key: 'user-settings',
      value: JSON.stringify(oldSettings),
      updatedAt: 1,
    })

    await expect(
      createSettingsRepository(handle.db).getSettings(),
    ).resolves.toEqual({
      ...oldSettings,
      analytics: defaultUserSettings.analytics,
    })
  })

  it('atomically persists both targets and reloads them without changing FSRS retention', async () => {
    const handle = await createTestDb({ seed: false })
    const repository = createSettingsRepository(handle.db)
    const savedAt = new Date('2026-10-02T12:00:00.000Z')
    await repository.updateSettings({ review: { targetRetention: 0.75 } })

    const saved = await repository.updateSettings(
      { analytics: { targetRecall: 0.95, targetReviewSuccess: 0.98 } },
      savedAt,
    )
    const rows = await handle.db.select().from(settingsKv)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.updatedAt).toBe(savedAt.getTime())
    expect(JSON.parse(rows[0]!.value)).toEqual(saved)
    expect(saved.analytics).toEqual({
      ...defaultUserSettings.analytics,
      targetRecall: 0.95,
      targetReviewSuccess: 0.98,
    })
    expect(saved.review.targetRetention).toBe(0.75)
    await expect(
      createSettingsRepository(handle.db).getSettings(),
    ).resolves.toEqual(saved)
  })

  it('rejects invalid merged targets without changing the saved record', async () => {
    const handle = await createTestDb({ seed: false })
    const repository = createSettingsRepository(handle.db)
    const saved = await repository.updateSettings({
      practice: { dailyGoal: 12 },
      analytics: { targetRecall: 0.8, targetReviewSuccess: 0.95 },
    })
    const rowsBefore = await handle.db.select().from(settingsKv)

    for (const analytics of [
      { targetRecall: 0.96 },
      { targetRecall: 0.96, targetReviewSuccess: 0.94 },
      { targetReviewSuccess: 0.79 },
    ]) {
      await expect(
        repository.updateSettings({ analytics, practice: { dailyGoal: 20 } }),
      ).rejects.toThrow(
        'Review Success target must be at least your Recall target.',
      )
      expect(await handle.db.select().from(settingsKv)).toEqual(rowsBefore)
      await expect(repository.getSettings()).resolves.toEqual(saved)
    }
  })

  it.each([
    {
      field: 'targetRecall',
      externalPatch: { targetReviewSuccess: 0.95 },
      editedPatch: { targetRecall: 0.85 },
      expected: { targetRecall: 0.85, targetReviewSuccess: 0.95 },
    },
    {
      field: 'targetReviewSuccess',
      externalPatch: { targetRecall: 0.85 },
      editedPatch: { targetReviewSuccess: 0.95 },
      expected: { targetRecall: 0.85, targetReviewSuccess: 0.95 },
    },
  ])(
    'preserves a newer counterpart when saving only $field',
    async ({ externalPatch, editedPatch, expected }) => {
      const handle = await createTestDb({ seed: false })
      const repository = createSettingsRepository(handle.db)
      const externalRepository = createSettingsRepository(handle.db)
      const original = await repository.updateSettings({
        analytics: { targetRecall: 0.8, targetReviewSuccess: 0.9 },
        practice: { dailyGoal: 12 },
      })

      await externalRepository.updateSettings({ analytics: externalPatch })
      const saved = await repository.updateSettings({ analytics: editedPatch })

      expect(saved).toEqual({
        ...original,
        analytics: { ...original.analytics, ...expected },
      })
      await expect(repository.getSettings()).resolves.toEqual(saved)
      const rows = await handle.db.select().from(settingsKv)
      expect(rows).toHaveLength(1)
      expect(JSON.parse(rows[0]!.value)).toEqual(saved)
    },
  )

  it('returns defaults when no settings row exists', async () => {
    const handle = await createTestDb({ seed: false })

    await expect(
      createSettingsRepository(handle.db).getSettings(),
    ).resolves.toEqual(defaultUserSettings)
  })

  it('falls back to defaults for unreadable stored settings', async () => {
    for (const value of ['{bad-json', JSON.stringify({ unknown: true })]) {
      const handle = await createTestDb({ seed: false })
      await handle.db.insert(settingsKv).values({
        key: 'user-settings',
        value,
        updatedAt: 1,
      })

      await expect(
        createSettingsRepository(handle.db).getSettings(),
      ).resolves.toEqual(defaultUserSettings)
    }
  })

  it('upserts a single settings row and preserves nested siblings', async () => {
    const handle = await createTestDb({ seed: false })
    const repository = createSettingsRepository(handle.db)
    const firstWriteAt = new Date('2026-01-01T00:00:00.000Z')
    const secondWriteAt = new Date('2026-01-02T00:00:00.000Z')

    await repository.updateSettings(
      {
        reminders: { daily: { enabled: true } },
        assessment: { requireSolveTime: true, strictTiming: true },
      },
      firstWriteAt,
    )
    const saved = await repository.updateSettings(
      {
        reminders: { daily: { time: '18:30' } },
        assessment: { timeTargetsMinutes: { medium: 42 } },
      },
      secondWriteAt,
    )
    const rows = await handle.db
      .select()
      .from(settingsKv)
      .where(eq(settingsKv.key, 'user-settings'))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.updatedAt).toBe(secondWriteAt.getTime())
    expect(saved).toEqual({
      ...defaultUserSettings,
      reminders: {
        daily: {
          enabled: true,
          time: '18:30',
        },
      },
      assessment: {
        ...defaultUserSettings.assessment,
        requireSolveTime: true,
        strictTiming: true,
        timeTargetsMinutes: {
          ...defaultUserSettings.assessment.timeTargetsMinutes,
          medium: 42,
        },
      },
    })
    await expect(repository.getSettings()).resolves.toEqual(saved)
  })

  it('toggles study mode through the generic settings write path', async () => {
    const handle = await createTestDb({ seed: false })
    const repository = createSettingsRepository(handle.db)

    await repository.updateSettings({
      practice: { dailyGoal: 12 },
      reminders: { daily: { enabled: true } },
      assessment: { timeTargetsMinutes: { hard: 60 } },
    })

    await expect(repository.toggleStudyMode()).resolves.toEqual({
      ...defaultUserSettings,
      practice: {
        ...defaultUserSettings.practice,
        dailyGoal: 12,
        mode: 'freePractice',
      },
      reminders: {
        daily: {
          ...defaultUserSettings.reminders.daily,
          enabled: true,
        },
      },
      assessment: {
        ...defaultUserSettings.assessment,
        timeTargetsMinutes: {
          ...defaultUserSettings.assessment.timeTargetsMinutes,
          hard: 60,
        },
      },
    })
    await expect(repository.toggleStudyMode()).resolves.toMatchObject({
      practice: {
        dailyGoal: 12,
        mode: 'studyPlan',
      },
      reminders: {
        daily: {
          enabled: true,
        },
      },
      assessment: {
        timeTargetsMinutes: {
          hard: 60,
        },
      },
    })
  })

  it('cycles theme mode through the generic settings write path', async () => {
    const handle = await createTestDb({ seed: false })
    const repository = createSettingsRepository(handle.db)

    await repository.updateSettings({
      practice: { dailyGoal: 12 },
      appearance: { themeMode: 'system' },
    })

    await expect(repository.cycleThemeMode()).resolves.toEqual({
      ...defaultUserSettings,
      appearance: { themeMode: 'light' },
      practice: {
        ...defaultUserSettings.practice,
        dailyGoal: 12,
      },
    })
    await expect(repository.cycleThemeMode()).resolves.toMatchObject({
      appearance: { themeMode: 'dark' },
      practice: { dailyGoal: 12 },
    })
    await expect(repository.cycleThemeMode()).resolves.toMatchObject({
      appearance: { themeMode: 'system' },
      practice: { dailyGoal: 12 },
    })
  })
})
