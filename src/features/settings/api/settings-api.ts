import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import { invalidateTaggedQueries } from '@/platform/query/cache-invalidation'
import { queryKeys } from '@/platform/query/query-keys'

import type {
  SettingsCycleThemeModeRequest,
  SettingsToggleStudyModeRequest,
  SettingsUpdateRequest,
} from './settings-contracts'

export const settingsQueryKeys = queryKeys.settings

export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKeys.all,
    queryFn: () =>
      sendMessage('settings.getSettings', { surface: 'dashboard' }),
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: SettingsUpdateRequest) =>
      sendMessage('settings.updateSettings', request),
    onSuccess: async (settings, request) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.all })
      queryClient.setQueryData(settingsQueryKeys.all, settings)
      await invalidateTaggedQueries(
        queryClient,
        request.patch.aiAssessment ? ['settings', 'genai'] : ['settings'],
      )
    },
  })
}

export function useToggleStudyMode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: SettingsToggleStudyModeRequest) =>
      sendMessage('settings.toggleStudyMode', request),
    onSuccess: () => {
      void invalidateTaggedQueries(queryClient, ['settings'])
    },
  })
}

export function useCycleThemeMode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: SettingsCycleThemeModeRequest) =>
      sendMessage('settings.cycleThemeMode', request),
    onSuccess: () => {
      void invalidateTaggedQueries(queryClient, ['settings'])
    },
  })
}
