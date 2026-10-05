import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { settingsKv } from '@/platform/db/schema'
import { createTestDb } from '@/platform/db/test-db'

import { defaultUserSettings } from '../domain'
import { createSettingsRepository } from './settings-repository'

describe('SettingsRepository', () => {
  it.each([
    ['targetRecall', 'targetReviewSuccess', 0.85, 0.95],
    ['targetReviewSuccess', 'targetRecall', 0.95, 0.85],
    ['targetFirstAttemptSuccess', 'targetFirstAttemptGoodEasy', 0.29, 1],
    ['targetFirstAttemptGoodEasy', 'targetFirstAttemptSuccess', 1, 0.29],
  ] as const)(
    'merges %s against the latest other goals',
    async (field, counterpart, value, externalValue) => {
      const handle = await createTestDb({ seed: false })
      const repository = createSettingsRepository(handle.db)
      const external = createSettingsRepository(handle.db)
      const original = await repository.updateSettings({
        analytics: {
          targetRecall: 0.8,
          targetReviewSuccess: 0.9,
          targetFirstAttemptSuccess: 0.8,
          targetFirstAttemptGoodEasy: 0.6,
        },
        practice: { dailyGoal: 12 },
        review: { targetRetention: 0.75 },
      })
      await external.updateSettings({
        analytics: { [counterpart]: externalValue },
      })
      const saved = await repository.updateSettings({
        analytics: { [field]: value },
      })
      expect(saved).toEqual({
        ...original,
        analytics: {
          ...original.analytics,
          [counterpart]: externalValue,
          [field]: value,
        },
      })
      await expect(external.getSettings()).resolves.toEqual(saved)
      const rows = await handle.db.select().from(settingsKv)
      expect(rows).toHaveLength(1)
      expect(JSON.parse(rows[0]!.value)).toEqual(saved)
    },
  )

  it('rejects invalid target patches without writing, then persists an atomic upward pair', async () => {
    const handle = await createTestDb({ seed: false })
    const repository = createSettingsRepository(handle.db)
    const original = await repository.updateSettings({
      practice: { dailyGoal: 12 },
      analytics: { targetRecall: 0.8, targetReviewSuccess: 0.95 },
    })
    const rowsBefore = await handle.db.select().from(settingsKv)
    for (const analytics of [
      { targetRecall: 0.96 },
      { targetReviewSuccess: 0.79 },
      { targetFirstAttemptSuccess: 0.295 },
    ]) {
      await expect(
        repository.updateSettings({ analytics, practice: { dailyGoal: 20 } }),
      ).rejects.toThrow()
      expect(await handle.db.select().from(settingsKv)).toEqual(rowsBefore)
    }
    const saved = await repository.updateSettings({
      analytics: { targetRecall: 0.96, targetReviewSuccess: 0.98 },
    })
    expect(saved).toEqual({
      ...original,
      analytics: {
        ...original.analytics,
        targetRecall: 0.96,
        targetReviewSuccess: 0.98,
      },
    })
    await expect(repository.getSettings()).resolves.toEqual(saved)
  })

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

it('persists an OpenRouter connection exactly without changing unrelated defaults', async () => {
  const handle = await createTestDb({ seed: false })
  const repository = createSettingsRepository(handle.db)
  const aiAssessment = {
    enabled: false,
    provider: 'openrouter' as const,
    model: 'vendor/custom-model:free',
  }
  await repository.updateSettings({ aiAssessment })
  await repository.updateSettings({ practice: { dailyGoal: 9 } })
  const reopened = await createSettingsRepository(handle.db).getSettings()
  expect(reopened.aiAssessment).toEqual(aiAssessment)
  expect(reopened.practice.dailyGoal).toBe(9)
  expect(reopened.schemaVersion).toBe(defaultUserSettings.schemaVersion)
  await repository.updateSettings({ aiAssessment: { enabled: true } })
  expect(await repository.getSettings()).toEqual({
    ...reopened,
    aiAssessment: { ...aiAssessment, enabled: true },
  })
  const rows = await handle.db.select().from(settingsKv)
  expect(rows).toHaveLength(1)
  expect(JSON.parse(rows[0]!.value).aiAssessment).toEqual({
    ...aiAssessment,
    enabled: true,
  })
})
