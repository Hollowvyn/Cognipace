import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { defaultUserSettings } from '@/features/settings/domain'
import { queryKeys } from '@/platform/query/query-keys'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  settingsQueryKeys,
  useCycleThemeMode,
  useSettings,
  useToggleStudyMode,
  useUpdateSettings,
} from './settings-api'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('settings API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the settings query key and reads settings through the dashboard surface', async () => {
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()

    const { result } = renderHook(() => useSettings(), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual(defaultUserSettings)
    })
    expect(settingsQueryKeys.all).toEqual(['settings'])
    expect(sendMessage).toHaveBeenCalledWith('settings.getSettings', {
      surface: 'dashboard',
    })
  })

  it('sends settings updates and invalidates DB-backed settings state', async () => {
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { result } = renderHook(() => useUpdateSettings(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({
        surface: 'dashboard',
        patch: { assessment: { strictTiming: true } },
      })
    })

    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: { assessment: { strictTiming: true } },
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.appShell.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.practice.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.queue.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.tracks.all,
    })
  })

  it('cancels stale Settings reads and applies authoritative AI Settings before resolving', async () => {
    const { queryClient, wrapper } = createQueryTestHarness()
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries')
    const saved = {
      ...defaultUserSettings,
      aiAssessment: {
        enabled: false,
        provider: 'gemini' as const,
        model: 'custom-model',
      },
    }
    queryClient.setQueryData(queryKeys.settings.all, defaultUserSettings)
    vi.mocked(sendMessage).mockResolvedValue(saved)
    const { result } = renderHook(() => useUpdateSettings(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        surface: 'dashboard',
        patch: { aiAssessment: { provider: 'gemini', model: 'custom-model' } },
      })
    })
    expect(cancelQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(queryClient.getQueryData(queryKeys.settings.all)).toEqual(saved)
  })

  it('sends study-mode toggles and invalidates DB-backed settings state', async () => {
    vi.mocked(sendMessage).mockResolvedValue(null)
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useToggleStudyMode(), {
      wrapper,
    })

    let response: unknown

    await act(async () => {
      response = await result.current.mutateAsync({
        surface: 'popup',
      })
    })

    expect(sendMessage).toHaveBeenCalledWith('settings.toggleStudyMode', {
      surface: 'popup',
    })
    expect(response).toBeNull()
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.appShell.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.tracks.all,
    })
  })

  it('sends theme-mode cycles and invalidates DB-backed settings state', async () => {
    vi.mocked(sendMessage).mockResolvedValue(null)
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCycleThemeMode(), {
      wrapper,
    })

    let response: unknown

    await act(async () => {
      response = await result.current.mutateAsync({
        surface: 'dashboard',
      })
    })

    expect(sendMessage).toHaveBeenCalledWith('settings.cycleThemeMode', {
      surface: 'dashboard',
    })
    expect(response).toBeNull()
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.appShell.all,
    })
  })
})
