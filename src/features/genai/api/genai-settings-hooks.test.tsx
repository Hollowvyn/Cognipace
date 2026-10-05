import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

import type { AiProviderSecretPresence } from '../domain/genai-secrets-types'
import type { TestAiConnectionResponse } from './genai-settings-contracts'

import { sendMessage } from '@/extension/messaging'
import { invalidateTaggedQueries } from '@/platform/query/cache-invalidation'

import {
  useClearAiProviderSecretMutation,
  useGenAiSecretPresenceQuery,
  useSetAiProviderSecretMutation,
  useTestAiConnectionMutation,
  useGenAiConfigurationRevision,
} from './genai-settings-hooks'

let queryClient: QueryClient
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  vi.mocked(sendMessage).mockReset()
})

afterEach(() => {
  queryClient.clear()
  vi.useRealTimers()
})

describe('useGenAiSecretPresenceQuery', () => {
  it('fetches presence via sendMessage with dashboard surface', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      openai: true,
      anthropic: false,
      gemini: false,
      openrouter: false,
    })

    const { result } = renderHook(() => useGenAiSecretPresenceQuery(), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({
      openai: true,
      anthropic: false,
      gemini: false,
      openrouter: false,
    })
    expect(sendMessage).toHaveBeenCalledWith(
      'genai.getAiProviderSecretPresence',
      { surface: 'dashboard' },
    )
  })
})

describe('useSetAiProviderSecretMutation', () => {
  it('translates the hook input key to apiKey at the runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      openai: true,
      anthropic: false,
      gemini: false,
      openrouter: false,
    })

    const { result } = renderHook(() => useSetAiProviderSecretMutation(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({
        provider: 'openai',
        key: 'sk-test-key',
      })
    })

    expect(sendMessage).toHaveBeenCalledWith('genai.setAiProviderSecret', {
      surface: 'dashboard',
      provider: 'openai',
      secret: { apiKey: 'sk-test-key' },
    })
  })

  it('omits baseUrl from the runtime payload when provided', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      openai: true,
      anthropic: false,
      gemini: false,
      openrouter: false,
    })

    const { result } = renderHook(() => useSetAiProviderSecretMutation(), {
      wrapper,
    })

    const input = {
      provider: 'gemini' as const,
      key: 'g-test',
      baseUrl: 'https://proxy.example.test',
    }

    await act(async () => {
      await result.current.mutateAsync(input)
    })

    expect(sendMessage).toHaveBeenCalledWith('genai.setAiProviderSecret', {
      surface: 'dashboard',
      provider: 'gemini',
      secret: { apiKey: 'g-test' },
    })
  })

  it('updates the presence cache on success', async () => {
    const presence = {
      openai: false,
      anthropic: true,
      gemini: false,
      openrouter: false,
    }
    vi.mocked(sendMessage).mockResolvedValue(presence)

    const { result } = renderHook(() => useSetAiProviderSecretMutation(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({
        provider: 'anthropic',
        key: 'sk-ant-test',
      })
    })

    expect(queryClient.getQueryData(['genai', 'secret-presence'])).toEqual(
      presence,
    )
  })
})

describe('useClearAiProviderSecretMutation', () => {
  it('calls clearAiProviderSecret via sendMessage and updates the cache', async () => {
    const presence = {
      openai: false,
      anthropic: false,
      gemini: false,
      openrouter: false,
    }
    vi.mocked(sendMessage).mockResolvedValue(presence)

    const { result } = renderHook(() => useClearAiProviderSecretMutation(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({ provider: 'openai' })
    })

    expect(sendMessage).toHaveBeenCalledWith('genai.clearAiProviderSecret', {
      surface: 'dashboard',
      provider: 'openai',
    })
    expect(queryClient.getQueryData(['genai', 'secret-presence'])).toEqual(
      presence,
    )
  })
})

describe('secret cache coherence and privacy', () => {
  it('does not retain a secret in the mutation cache and works offline', async () => {
    const { onlineManager } = await import('@tanstack/react-query')
    onlineManager.setOnline(false)
    try {
      vi.mocked(sendMessage).mockResolvedValue({
        openai: true,
        anthropic: false,
        gemini: false,
        openrouter: false,
      })
      const { result } = renderHook(() => useSetAiProviderSecretMutation(), {
        wrapper,
      })
      await act(async () => {
        await result.current.mutateAsync({
          provider: 'openai',
          key: 'fake-private-key',
        })
      })
      expect(
        JSON.stringify(
          queryClient
            .getMutationCache()
            .getAll()
            .map((mutation) => mutation.state.variables),
        ),
      ).not.toContain('fake-private-key')
      expect(sendMessage).toHaveBeenCalledTimes(1)
    } finally {
      onlineManager.setOnline(true)
    }
  })
  it('prevents a stale presence read from overwriting a successful save', async () => {
    let finishRead!: (value: AiProviderSecretPresence) => void
    vi.mocked(sendMessage)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRead = resolve
          }),
      )
      .mockResolvedValue({
        openai: true,
        anthropic: false,
        gemini: false,
        openrouter: false,
      })
    const { result } = renderHook(
      () => ({
        presence: useGenAiSecretPresenceQuery(),
        save: useSetAiProviderSecretMutation(),
      }),
      { wrapper },
    )
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    await act(async () => {
      await result.current.save.mutateAsync({
        provider: 'openai',
        key: 'fake-private-key',
      })
    })
    await act(async () => {
      finishRead({
        openai: false,
        anthropic: false,
        gemini: false,
        openrouter: false,
      })
      await Promise.resolve()
    })
    expect(queryClient.getQueryData(['genai', 'secret-presence'])).toEqual({
      openai: true,
      anthropic: false,
      gemini: false,
      openrouter: false,
    })
  })
  it('rejects malformed presence responses and hides raw runtime errors', async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error('fake-private-key'))
    const { result } = renderHook(() => useSetAiProviderSecretMutation(), {
      wrapper,
    })
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          provider: 'openai',
          key: 'fake-private-key',
        }),
      ).rejects.toMatchObject({
        message: 'The AI key save could not be completed. Please retry.',
      })
    })
    vi.mocked(sendMessage).mockResolvedValue({
      openai: 'true',
      anthropic: false,
      gemini: false,
      openrouter: false,
    } as unknown as AiProviderSecretPresence)
    await act(async () => {
      await expect(
        result.current.mutateAsync({ provider: 'openai', key: 'other-key' }),
      ).rejects.toThrow()
    })
    expect(
      queryClient.getQueryData(['genai', 'secret-presence']),
    ).toBeUndefined()
  })
  it('rejects duplicate secret saves while the first is running', async () => {
    let finish!: (value: AiProviderSecretPresence) => void
    vi.mocked(sendMessage).mockImplementation(
      () =>
        new Promise<AiProviderSecretPresence>((resolve) => {
          finish = resolve
        }),
    )
    const { result } = renderHook(() => useSetAiProviderSecretMutation(), {
      wrapper,
    })
    await act(async () => {
      const first = result.current.mutateAsync({
        provider: 'openai',
        key: 'first-key',
      })
      await expect(
        result.current.mutateAsync({ provider: 'openai', key: 'second-key' }),
      ).rejects.toThrow(/progress/)
      finish({
        openai: true,
        anthropic: false,
        gemini: false,
        openrouter: false,
      })
      await first
    })
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })
  it('reads external configuration revisions synchronously through QueryCache', () => {
    const { result } = renderHook(() => useGenAiConfigurationRevision(), {
      wrapper,
    })
    expect(result.current.revision).toBe(0)
    act(() => {
      void invalidateTaggedQueries(queryClient, ['genai'])
      expect(result.current.readRevision()).toBe(1)
    })
    expect(result.current.revision).toBe(1)
  })
})

describe('connection test mutation', () => {
  it('uses only dashboard provider/model and validates the response', async () => {
    const response = {
      status: 'success',
      provider: 'gemini',
      model: 'gemini-test',
      durationMs: 12,
    } as const
    vi.mocked(sendMessage).mockResolvedValue(response)
    const { result } = renderHook(() => useTestAiConnectionMutation(), {
      wrapper,
    })
    await act(async () => {
      expect(
        await result.current.mutateAsync({
          provider: 'gemini',
          model: ' gemini-test ',
        }),
      ).toEqual(response)
    })
    expect(sendMessage).toHaveBeenCalledWith('genai.testConnection', {
      surface: 'dashboard',
      provider: 'gemini',
      model: 'gemini-test',
    })
    vi.mocked(sendMessage).mockResolvedValue({
      ...response,
      apiKey: 'fake-private-key',
    } as unknown as TestAiConnectionResponse)
    await act(async () => {
      expect(
        await result.current.mutateAsync({
          provider: 'gemini',
          model: 'gemini-test',
        }),
      ).toMatchObject({ status: 'error', code: 'unknown' })
    })
  })
  it('returns controlled feedback for worker loss without retry', async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error('fake-private-key'))
    const { result } = renderHook(() => useTestAiConnectionMutation(), {
      wrapper,
    })
    await act(async () => {
      const resultValue = await result.current.mutateAsync({
        provider: 'gemini',
        model: 'gemini-test',
      })
      expect(resultValue).toMatchObject({ status: 'error', code: 'network' })
      expect(JSON.stringify(resultValue)).not.toContain('fake-private-key')
    })
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })
})

it('validates presence query output without caching unknown fields', async () => {
  vi.mocked(sendMessage).mockResolvedValue({
    openai: true,
    anthropic: false,
    gemini: false,
    openrouter: false,
    apiKey: 'fake-private-key',
  } as unknown as AiProviderSecretPresence)
  const { result } = renderHook(() => useGenAiSecretPresenceQuery(), {
    wrapper,
  })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).not.toContain('fake-private-key')
  expect(queryClient.getQueryData(['genai', 'secret-presence'])).toBeUndefined()
})

it('bounds a lost worker response at 25 seconds and cleans the client timer', async () => {
  vi.useFakeTimers()
  vi.mocked(sendMessage).mockImplementation(() => new Promise(() => {}))
  const { result } = renderHook(() => useTestAiConnectionMutation(), {
    wrapper,
  })
  await act(async () => {
    const pending = result.current.mutateAsync({
      provider: 'gemini',
      model: 'gemini-test',
    })
    await vi.advanceTimersByTimeAsync(25_000)
    expect(await pending).toMatchObject({
      status: 'error',
      code: 'timeout',
      durationMs: 25_000,
    })
  })
  expect(sendMessage).toHaveBeenCalledTimes(1)
  // TanStack's cache-GC timer is separate from the cleared deadline.
  expect(vi.getTimerCount()).toBeLessThanOrEqual(1)
})

it('saves and removes the OpenRouter key with strict presence and no secret in caches', async () => {
  const savedPresence = {
    openai: false,
    anthropic: false,
    gemini: false,
    openrouter: true,
  }
  vi.mocked(sendMessage).mockResolvedValue(savedPresence)
  const { result } = renderHook(
    () => ({
      save: useSetAiProviderSecretMutation(),
      remove: useClearAiProviderSecretMutation(),
    }),
    { wrapper },
  )
  await act(async () => {
    await result.current.save.mutateAsync({
      provider: 'openrouter',
      key: 'private-openrouter-key',
    })
  })
  expect(sendMessage).toHaveBeenCalledWith('genai.setAiProviderSecret', {
    surface: 'dashboard',
    provider: 'openrouter',
    secret: { apiKey: 'private-openrouter-key' },
  })
  expect(queryClient.getQueryData(['genai', 'secret-presence'])).toEqual(
    savedPresence,
  )
  expect(
    JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain('private-openrouter-key')
  expect(
    JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.variables),
    ),
  ).not.toContain('private-openrouter-key')
  const removedPresence = { ...savedPresence, openrouter: false }
  vi.mocked(sendMessage).mockResolvedValue(removedPresence)
  await act(async () => {
    await result.current.remove.mutateAsync({ provider: 'openrouter' })
  })
  expect(sendMessage).toHaveBeenCalledWith('genai.clearAiProviderSecret', {
    surface: 'dashboard',
    provider: 'openrouter',
  })
  expect(queryClient.getQueryData(['genai', 'secret-presence'])).toEqual(
    removedPresence,
  )
})
