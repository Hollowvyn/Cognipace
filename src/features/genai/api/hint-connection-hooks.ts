import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import { withAiDeadline } from '@/lib/ai/operation'
import { queryKeys } from '@/platform/query/query-keys'

import {
  hintConnectionStatusSchema,
  type HintConnectionStatus,
} from './hint-connection-contracts'

export function useAiHintConnection(active: boolean) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.genai.hintConnection(),
    enabled: active,
    networkMode: 'always',
    retry: false,
    queryFn: ({ signal }) =>
      withAiDeadline({ timeoutMs: 25_000, signal }, async () =>
        hintConnectionStatusSchema.parse(
          await sendMessage('genai.getHintConnection', {
            surface: 'content-script',
          }),
        ),
      ),
  })
  const readStatus = useCallback(
    () =>
      client.getQueryData<HintConnectionStatus>(
        queryKeys.genai.hintConnection(),
      ) ?? null,
    [client],
  )
  const { refetch } = query
  const refresh = useCallback(
    async () => (await refetch({ throwOnError: true })).data ?? null,
    [refetch],
  )

  return {
    status: query.data ?? null,
    isError: query.isError,
    readStatus,
    refresh,
  }
}
