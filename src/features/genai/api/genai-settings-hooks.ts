import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import { invalidateTaggedQueries } from '@/platform/query/cache-invalidation'
import { queryKeys } from '@/platform/query/query-keys'

import {
  aiProviderSecretPresenceSchema,
  type AiProviderSecretPresence,
} from '../domain/genai-secrets-types'
import type { GenAiProviderId } from '../domain/genai-types'
import {
  testAiConnectionRequestSchema,
  testAiConnectionResponseSchema,
  type TestAiConnectionResponse,
} from './genai-settings-contracts'

type GenAiHookSurface = 'popup' | 'dashboard'

export function useGenAiSecretPresenceQuery(
  surface: GenAiHookSurface = 'dashboard',
) {
  return useQuery({
    queryKey: queryKeys.genai.secretPresence(),
    networkMode: 'always',
    queryFn: async (): Promise<AiProviderSecretPresence> => {
      try {
        return aiProviderSecretPresenceSchema.parse(
          await sendMessage('genai.getAiProviderSecretPresence', { surface }),
        )
      } catch {
        throw new Error('Saved AI keys could not be loaded. Please retry.')
      }
    },
  })
}

export type SetAiProviderSecretHookInput = {
  provider: GenAiProviderId
  key: string
}

// Secret input stays in this local action and never enters MutationCache variables.
export function useSetAiProviderSecretMutation(
  surface: GenAiHookSurface = 'dashboard',
) {
  const queryClient = useQueryClient()
  const pending = useRef(false)
  const [state, setState] = useState<{
    isPending: boolean
    error: Error | null
    data: AiProviderSecretPresence | undefined
  }>({ isPending: false, error: null, data: undefined })
  const mutateAsync = useCallback(
    async (input: SetAiProviderSecretHookInput) => {
      if (pending.current)
        throw new Error('An AI key save is already in progress.')
      pending.current = true
      setState({ isPending: true, error: null, data: undefined })
      try {
        const presence = aiProviderSecretPresenceSchema.parse(
          await sendMessage('genai.setAiProviderSecret', {
            surface,
            provider: input.provider,
            secret: { apiKey: input.key },
          }),
        )
        await applySecretPresence(queryClient, presence)
        setState({ isPending: false, error: null, data: presence })
        return presence
      } catch {
        const error = new Error(
          'The AI key save could not be completed. Please retry.',
        )
        setState({ isPending: false, error, data: undefined })
        throw error
      } finally {
        pending.current = false
      }
    },
    [queryClient, surface],
  )
  const reset = useCallback(() => {
    if (!pending.current)
      setState({ isPending: false, error: null, data: undefined })
  }, [])
  return {
    ...state,
    mutateAsync,
    reset,
    isError: state.error !== null,
    isSuccess: state.data !== undefined,
  }
}

export type ClearAiProviderSecretHookInput = { provider: GenAiProviderId }

export function useClearAiProviderSecretMutation(
  surface: GenAiHookSurface = 'dashboard',
) {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (input: ClearAiProviderSecretHookInput) => {
      try {
        return aiProviderSecretPresenceSchema.parse(
          await sendMessage('genai.clearAiProviderSecret', {
            surface,
            provider: input.provider,
          }),
        )
      } catch {
        throw new Error(
          'The AI key removal could not be completed. Please retry.',
        )
      }
    },
    onSuccess: (presence) => applySecretPresence(queryClient, presence),
  })
}

async function applySecretPresence(
  queryClient: QueryClient,
  presence: AiProviderSecretPresence,
) {
  await queryClient.cancelQueries({
    queryKey: queryKeys.genai.secretPresence(),
  })
  await invalidateTaggedQueries(queryClient, ['genai'])
  queryClient.setQueryData(queryKeys.genai.secretPresence(), presence)
}

export function useGenAiConfigurationRevision() {
  const queryClient = useQueryClient()
  const readRevision = useCallback(
    () =>
      queryClient.getQueryData<number>(
        queryKeys.genai.configurationRevision(),
      ) ?? 0,
    [queryClient],
  )
  const subscribe = useCallback(
    (listener: () => void) => queryClient.getQueryCache().subscribe(listener),
    [queryClient],
  )
  const revision = useSyncExternalStore(subscribe, readRevision, readRevision)
  return { revision, readRevision }
}

export type TestAiConnectionHookInput = {
  provider: GenAiProviderId
  model: string
}

export function useTestAiConnectionMutation() {
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (
      input: TestAiConnectionHookInput,
    ): Promise<TestAiConnectionResponse> => {
      const parsed = testAiConnectionRequestSchema.safeParse({
        surface: 'dashboard',
        provider: input.provider,
        model: input.model,
      })
      if (!parsed.success)
        throw new Error('Choose a provider and a valid model before testing.')
      const request = parsed.data
      const startedAt = Date.now()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const raw = await Promise.race([
          sendMessage('genai.testConnection', request),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new ClientConnectionDeadlineError()),
              25_000,
            )
          }),
        ])
        const result = testAiConnectionResponseSchema.safeParse(raw)
        if (
          !result.success ||
          result.data.provider !== request.provider ||
          result.data.model !== request.model
        ) {
          return {
            status: 'error',
            provider: request.provider,
            model: request.model,
            durationMs: Math.max(0, Date.now() - startedAt),
            code: 'unknown',
            message:
              'The connection test returned an invalid response. Please retry.',
          }
        }
        return result.data
      } catch (error) {
        return {
          status: 'error',
          provider: request.provider,
          model: request.model,
          durationMs: Math.max(0, Date.now() - startedAt),
          code:
            error instanceof ClientConnectionDeadlineError
              ? 'timeout'
              : 'network',
          message:
            error instanceof ClientConnectionDeadlineError
              ? 'The connection test timed out. Please retry.'
              : 'The background connection test was interrupted. Please retry.',
        }
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }
    },
  })
}

class ClientConnectionDeadlineError extends Error {}
