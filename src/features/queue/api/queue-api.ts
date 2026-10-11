import { useQuery } from '@tanstack/react-query'

import {
  sendMessage,
  todayQueueSchema,
  type QueueRequest,
} from '@/extension/messaging'
import { queryKeys } from '@/platform/query/query-keys'

export const queueQueryKeys = queryKeys.queue

export function useTodayQueue(request: QueueRequest) {
  return useQuery({
    queryKey: queueQueryKeys.today(request.at, request.intent),
    queryFn: async () =>
      todayQueueSchema.parse(await sendMessage('queue.getTodayQueue', request)),
  })
}

export function useExtraPractice(
  surface: 'popup' | 'dashboard',
  enabled: boolean,
) {
  return useQuery({
    enabled,
    queryKey: queueQueryKeys.today(undefined, 'extra-practice'),
    queryFn: async () =>
      todayQueueSchema.parse(
        await sendMessage('queue.getTodayQueue', {
          surface,
          intent: 'extra-practice',
        }),
      ),
  })
}
