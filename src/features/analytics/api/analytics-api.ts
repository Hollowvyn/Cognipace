import { useQuery, useQueryClient } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import { useUpdateSettings, type AnalyticsTargets } from '@/features/settings'
import { applyHistoricalChartTargets } from '../domain/historical-presentation'
import {
  analyticsSummarySchema,
  type AnalyticsRange,
  type SerializedAnalyticsSummary,
} from './analytics-contracts'

import { queryKeys } from '@/platform/query/query-keys'

export const analyticsQueryKeys = queryKeys.analytics

export function useUpdateAnalyticsTargets() {
  const queryClient = useQueryClient()
  const updateSettings = useUpdateSettings()

  return {
    mutateAsync: async (targets: Partial<AnalyticsTargets>) => {
      const settings = await updateSettings.mutateAsync({
        surface: 'dashboard',
        patch: { analytics: targets },
      })
      await queryClient.cancelQueries({ queryKey: analyticsQueryKeys.all })
      queryClient.setQueriesData<SerializedAnalyticsSummary>(
        { queryKey: [...analyticsQueryKeys.all, 'summary'] },
        (summary) =>
          summary
            ? {
                ...summary,
                views: applyHistoricalChartTargets(
                  summary.views,
                  settings.analytics,
                ),
              }
            : summary,
      )
      void queryClient.invalidateQueries({ queryKey: analyticsQueryKeys.all })
      return settings
    },
  }
}

export function useAnalyticsSummary(range: AnalyticsRange = 30) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

  return useQuery({
    queryKey: analyticsQueryKeys.summary(range, timeZone),
    queryFn: async () =>
      analyticsSummarySchema.parse(
        await sendMessage('analytics.getSummary', {
          surface: 'dashboard',
          range,
          timeZone,
        }),
      ),
  })
}
