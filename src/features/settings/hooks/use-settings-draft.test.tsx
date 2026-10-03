import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { queryKeys } from '@/platform/query/query-keys'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { useSettings } from '../api/settings-api'
import { settingsUpdateRequestSchema } from '../api/settings-contracts'
import { defaultUserSettings, mergeUserSettings } from '../domain'
import { useSettingsDraft } from './use-settings-draft'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('useSettingsDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resets a successful local Save while its Settings refetch is still pending', async () => {
    let storedSettings = defaultUserSettings
    let readCount = 0
    let finishRefetch: (() => void) | undefined
    vi.mocked(sendMessage).mockImplementation((method, payload) => {
      if (method === 'settings.getSettings') {
        readCount += 1
        return readCount === 1
          ? Promise.resolve(storedSettings)
          : new Promise<typeof defaultUserSettings>((resolve) => {
              finishRefetch = () => resolve(storedSettings)
            })
      }
      if (method === 'settings.updateSettings') {
        const { patch } = settingsUpdateRequestSchema.parse(payload)
        storedSettings = mergeUserSettings(storedSettings, patch)
        return Promise.resolve(storedSettings)
      }
      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { queryClient, wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })
    await waitFor(() => {
      expect(result.current.draft).toEqual(defaultUserSettings)
    })
    act(() => {
      result.current.actions.setNumberInput('dailyGoal', '9')
    })
    await act(async () => {
      await result.current.actions.save()
    })
    await waitFor(() => {
      expect(readCount).toBeGreaterThan(1)
      expect(result.current.draft?.practice.dailyGoal).toBe(9)
    })
    expect(queryClient.getQueryData(queryKeys.settings.all)).toEqual(
      defaultUserSettings,
    )

    await act(async () => {
      await result.current.actions.resetDefaults()
    })

    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: {
        practice: { dailyGoal: defaultUserSettings.practice.dailyGoal },
        analytics: defaultUserSettings.analytics,
      },
    })
    expect(storedSettings).toEqual(defaultUserSettings)
    expect(result.current.draft).toEqual(defaultUserSettings)
    act(() => {
      finishRefetch?.()
    })
    await waitFor(() => {
      expect(
        queryClient.getQueryState(queryKeys.settings.all)?.fetchStatus,
      ).toBe('idle')
    })
  })

  it.each(['save', 'resetDefaults'] as const)(
    '%s uses externally refreshed targets without replacing a dirty draft',
    async (action) => {
      let storedSettings = defaultUserSettings
      vi.mocked(sendMessage).mockImplementation((method, payload) => {
        if (method === 'settings.getSettings')
          return Promise.resolve(storedSettings)
        if (method === 'settings.updateSettings') {
          storedSettings = mergeUserSettings(
            storedSettings,
            settingsUpdateRequestSchema.parse(payload).patch,
          )
          return Promise.resolve(storedSettings)
        }
        return Promise.reject(new Error(`Unexpected method ${method}`))
      })
      const { queryClient, wrapper } = createQueryTestHarness()
      const { result } = renderHook(
        () => ({
          controller: useSettingsDraft(),
          latestSettings: useSettings(),
        }),
        { wrapper },
      )
      await waitFor(() =>
        expect(result.current.controller.draft).toEqual(defaultUserSettings),
      )
      act(() =>
        result.current.controller.actions.setNumberInput('dailyGoal', '9'),
      )
      const refreshedTargets = {
        ...defaultUserSettings.analytics,
        targetRecall: 0.8,
        targetReviewSuccess: 0.9,
        targetFirstAttemptSuccess: 0.29,
        targetFirstAttemptGoodEasy: 1,
      }
      storedSettings = { ...defaultUserSettings, analytics: refreshedTargets }
      act(() => {
        queryClient.setQueryData(queryKeys.settings.all, storedSettings)
      })
      await waitFor(() =>
        expect(result.current.latestSettings.data?.analytics).toEqual(
          refreshedTargets,
        ),
      )
      expect(result.current.controller.draft?.analytics).toEqual(
        defaultUserSettings.analytics,
      )
      expect(result.current.controller.draft?.practice.dailyGoal).toBe(9)
      expect(result.current.controller.canResetDefaults).toBe(true)

      await act(async () => result.current.controller.actions[action]())

      expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
        surface: 'dashboard',
        patch:
          action === 'save'
            ? { practice: { dailyGoal: 9 } }
            : { analytics: defaultUserSettings.analytics },
      })
      expect(storedSettings).toEqual({
        ...defaultUserSettings,
        analytics:
          action === 'save' ? refreshedTargets : defaultUserSettings.analytics,
        practice: {
          ...defaultUserSettings.practice,
          dailyGoal:
            action === 'save' ? 9 : defaultUserSettings.practice.dailyGoal,
        },
      })
      expect(result.current.controller.draft).toEqual(storedSettings)
      expect(result.current.controller.hasChanges).toBe(false)
    },
  )

  it('tracks edits, validates numeric input, and discards to saved settings', async () => {
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(defaultUserSettings)
    })

    act(() => {
      result.current.actions.setStudyMode('freePractice')
    })

    expect(result.current.hasChanges).toBe(true)
    expect(result.current.canDiscard).toBe(true)
    expect(result.current.canSave).toBe(true)

    act(() => {
      result.current.actions.setNumberInput('dailyGoal', '')
    })

    expect(result.current.fieldErrors.dailyGoal).toBe('Required')
    expect(result.current.canSave).toBe(false)

    act(() => {
      result.current.actions.discard()
    })

    expect(result.current.draft).toEqual(defaultUserSettings)
    expect(result.current.numberInputs.dailyGoal).toBe('4')
    expect(result.current.hasChanges).toBe(false)
  })

  it('saves only changed settings fields and resets dirty state on success', async () => {
    const savedSettings = {
      ...defaultUserSettings,
      practice: {
        ...defaultUserSettings.practice,
        dailyGoal: 9,
        mode: 'freePractice' as const,
      },
    }
    let storedSettings = defaultUserSettings
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'settings.getSettings') {
        return Promise.resolve(storedSettings)
      }

      if (method === 'settings.updateSettings') {
        storedSettings = savedSettings
        return Promise.resolve(savedSettings)
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(defaultUserSettings)
    })

    act(() => {
      result.current.actions.setStudyMode('freePractice')
      result.current.actions.setNumberInput('dailyGoal', '9')
    })

    await waitFor(() => {
      expect(result.current.canSave).toBe(true)
    })

    await act(async () => {
      await result.current.actions.save()
    })

    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: {
        practice: {
          dailyGoal: 9,
          mode: 'freePractice',
        },
      },
    })
    expect(result.current.draft).toEqual(savedSettings)
    expect(result.current.hasChanges).toBe(false)
    expect(result.current.status).toMatchObject({
      tone: 'success',
      message: 'Settings saved.',
    })
  })

  it('saves appearance theme changes through the settings draft workflow', async () => {
    const savedSettings = {
      ...defaultUserSettings,
      appearance: {
        themeMode: 'dark' as const,
      },
    }
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'settings.getSettings') {
        return Promise.resolve(defaultUserSettings)
      }

      if (method === 'settings.updateSettings') {
        return Promise.resolve(savedSettings)
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(defaultUserSettings)
    })

    act(() => {
      result.current.actions.setThemeMode('dark')
    })

    expect(result.current.canSave).toBe(true)

    await act(async () => {
      await result.current.actions.save()
    })

    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: {
        appearance: {
          themeMode: 'dark',
        },
      },
    })
  })

  it('keeps local edits and shows a recoverable status when writes fail', async () => {
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'settings.getSettings') {
        return Promise.resolve(defaultUserSettings)
      }

      if (method === 'settings.updateSettings') {
        return Promise.reject(new Error('Write failed'))
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(defaultUserSettings)
    })

    act(() => {
      result.current.actions.setStudyMode('freePractice')
    })

    await act(async () => {
      await result.current.actions.save()
    })

    expect(result.current.draft?.practice.mode).toBe('freePractice')
    expect(result.current.hasChanges).toBe(true)
    expect(result.current.canSave).toBe(true)
    expect(result.current.status).toMatchObject({
      tone: 'danger',
      message: 'Write failed',
    })

    vi.clearAllMocks()
    const currentSettings = {
      ...defaultUserSettings,
      practice: {
        ...defaultUserSettings.practice,
        dailyGoal: 18,
      },
    }
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'settings.getSettings') {
        return Promise.resolve(currentSettings)
      }

      if (method === 'settings.updateSettings') {
        return Promise.reject(new Error('Reset failed'))
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const resetHarness = createQueryTestHarness()
    const resetDraft = renderHook(() => useSettingsDraft(), {
      wrapper: resetHarness.wrapper,
    })

    await waitFor(() => {
      expect(resetDraft.result.current.draft).toEqual(currentSettings)
    })

    await act(async () => {
      await resetDraft.result.current.actions.resetDefaults()
    })

    expect(resetDraft.result.current.draft).toEqual(currentSettings)
    expect(resetDraft.result.current.canResetDefaults).toBe(true)
    expect(resetDraft.result.current.status).toMatchObject({
      tone: 'danger',
      message: 'Reset failed',
    })
  })

  it('adopts external refreshes only when the local draft is clean', async () => {
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const refreshedSettings = {
      ...defaultUserSettings,
      practice: {
        ...defaultUserSettings.practice,
        dailyGoal: 11,
      },
    }
    const dirtyRefresh = {
      ...defaultUserSettings,
      practice: {
        ...defaultUserSettings.practice,
        mode: 'freePractice' as const,
      },
    }
    const { queryClient, wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(defaultUserSettings)
    })

    act(() => {
      queryClient.setQueryData(queryKeys.settings.all, refreshedSettings)
    })

    await waitFor(() => {
      expect(result.current.draft).toEqual(refreshedSettings)
    })
    expect(result.current.numberInputs.dailyGoal).toBe('11')

    act(() => {
      result.current.actions.setNumberInput('dailyGoal', '12')
      queryClient.setQueryData(queryKeys.settings.all, dirtyRefresh)
    })

    await waitFor(() => {
      expect(result.current.draft?.practice.dailyGoal).toBe(12)
      expect(result.current.draft?.practice.mode).toBe('studyPlan')
      expect(result.current.numberInputs.dailyGoal).toBe('12')
    })
  })

  it('keeps invalid timing text local until the full timing group is valid', async () => {
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(defaultUserSettings)
    })

    act(() => {
      result.current.actions.setNumberInput('easyTargetMinutes', '45')
    })

    expect(result.current.numberInputs.easyTargetMinutes).toBe('45')
    expect(result.current.draft?.assessment.timeTargetsMinutes.easy).toBe(20)
    expect(result.current.fieldErrors.easyTargetMinutes).toBe(
      'Must be less than medium',
    )
    expect(result.current.canSave).toBe(false)

    act(() => {
      result.current.actions.setNumberInput('mediumTargetMinutes', '50')
      result.current.actions.setNumberInput('hardTargetMinutes', '60')
    })

    expect(result.current.fieldErrors).toEqual({
      dailyGoal: null,
      easyTargetMinutes: null,
      mediumTargetMinutes: null,
      hardTargetMinutes: null,
    })
    expect(result.current.draft?.assessment.timeTargetsMinutes).toEqual({
      easy: 45,
      medium: 50,
      hard: 60,
    })
    expect(result.current.canSave).toBe(true)
  })

  it('clears strict timing when require solve time is disabled', async () => {
    const currentSettings = {
      ...defaultUserSettings,
      assessment: {
        ...defaultUserSettings.assessment,
        requireSolveTime: true,
        strictTiming: true,
      },
    }
    vi.mocked(sendMessage).mockImplementation((method, payload) => {
      if (method === 'settings.getSettings') {
        return Promise.resolve(currentSettings)
      }

      if (method === 'settings.updateSettings') {
        expect(payload).toEqual({
          surface: 'dashboard',
          patch: {
            assessment: {
              requireSolveTime: false,
              strictTiming: false,
            },
          },
        })
        return Promise.resolve({
          ...currentSettings,
          assessment: {
            ...currentSettings.assessment,
            requireSolveTime: false,
            strictTiming: false,
          },
        })
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(currentSettings)
    })

    act(() => {
      result.current.actions.setRequireSolveTime(false)
    })

    expect(result.current.draft?.assessment).toMatchObject({
      requireSolveTime: false,
      strictTiming: false,
    })
    expect(result.current.canSave).toBe(true)

    await act(async () => {
      await result.current.actions.save()
    })

    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: {
        assessment: {
          requireSolveTime: false,
          strictTiming: false,
        },
      },
    })
  })

  it('persists reset defaults immediately and resets dirty state', async () => {
    const currentSettings = {
      ...defaultUserSettings,
      practice: {
        ...defaultUserSettings.practice,
        dailyGoal: 18,
      },
      reminders: {
        daily: {
          ...defaultUserSettings.reminders.daily,
          enabled: true,
        },
      },
    }
    let storedSettings = currentSettings
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'settings.getSettings') {
        return Promise.resolve(storedSettings)
      }

      if (method === 'settings.updateSettings') {
        storedSettings = defaultUserSettings
        return Promise.resolve(defaultUserSettings)
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(currentSettings)
    })

    await act(async () => {
      await result.current.actions.resetDefaults()
    })

    await waitFor(() => {
      expect(result.current.draft).toEqual(defaultUserSettings)
    })

    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: {
        analytics: defaultUserSettings.analytics,
        practice: { dailyGoal: defaultUserSettings.practice.dailyGoal },
        reminders: { daily: { enabled: false } },
      },
    })
    expect(result.current.hasChanges).toBe(false)
    expect(result.current.canSave).toBe(false)
    expect(result.current.status).toMatchObject({
      tone: 'success',
      message: 'Settings reset to defaults.',
    })
  })

  it('sets aiAssessment.enabled via actions.setAiEnabled', async () => {
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).not.toBeNull()
    })

    act(() => {
      result.current.actions.setAiEnabled(true)
    })

    expect(result.current.draft?.aiAssessment.enabled).toBe(true)
  })

  it('sets aiAssessment.provider via actions.setAiProvider', async () => {
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).not.toBeNull()
    })

    act(() => {
      result.current.actions.setAiProvider('anthropic')
    })

    expect(result.current.draft?.aiAssessment.provider).toBe('anthropic')
  })

  it('sets aiAssessment.model via actions.setAiModel', async () => {
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).not.toBeNull()
    })

    act(() => {
      result.current.actions.setAiModel('gpt-test')
    })

    expect(result.current.draft?.aiAssessment.model).toBe('gpt-test')
  })

  it('sets reminders.daily.enabled via setRemindersEnabled', async () => {
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(defaultUserSettings)
    })

    act(() => {
      result.current.actions.setRemindersEnabled(true)
    })

    expect(result.current.draft?.reminders.daily.enabled).toBe(true)
    expect(result.current.hasChanges).toBe(true)
  })

  it('sets reminders.daily.time via setRemindersTime', async () => {
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(defaultUserSettings)
    })

    act(() => {
      result.current.actions.setRemindersTime('14:30')
    })

    expect(result.current.draft?.reminders.daily.time).toBe('14:30')
  })

  it('treats an empty reminder time as a validation error that blocks save', async () => {
    const currentSettings = {
      ...defaultUserSettings,
      reminders: { daily: { enabled: true, time: '09:00' } },
    }
    vi.mocked(sendMessage).mockResolvedValue(currentSettings)
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).toEqual(currentSettings)
    })

    act(() => {
      result.current.actions.setRemindersTime('')
    })

    expect(result.current.hasValidationErrors).toBe(true)
    expect(result.current.canSave).toBe(false)
  })

  it('switching provider does not auto-disable enabled', async () => {
    const currentSettings = {
      ...defaultUserSettings,
      aiAssessment: {
        enabled: true,
        provider: 'openai' as const,
        model: 'gpt-x',
      },
    }
    vi.mocked(sendMessage).mockResolvedValue(currentSettings)
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useSettingsDraft(), { wrapper })

    await waitFor(() => {
      expect(result.current.draft).not.toBeNull()
    })

    act(() => {
      result.current.actions.setAiProvider('gemini')
    })

    expect(result.current.draft?.aiAssessment.enabled).toBe(true)
    expect(result.current.draft?.aiAssessment.provider).toBe('gemini')
  })
})
