import { useQuery } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'

export const devSmokeQueryKey = ['dev-smoke'] as const

export function useDevSmokeReport(
  runLiveGenAi: boolean,
  includeCapacity: boolean,
) {
  return useQuery({
    queryKey: [...devSmokeQueryKey, { runLiveGenAi, includeCapacity }] as const,
    queryFn: () =>
      sendMessage('devSmoke.run', {
        surface: 'dashboard',
        runLiveGenAi,
        includeCapacity,
      }),
    refetchOnMount: 'always',
    staleTime: 0,
  })
}
