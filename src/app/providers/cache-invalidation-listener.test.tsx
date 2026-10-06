import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CacheInvalidationEvent } from '@/extension/messaging'
import { createQueryTestHarness } from '@/testing/query-test-harness'
import { queryKeys } from '@/platform/query/query-keys'

import { CacheInvalidationListener } from './cache-invalidation-listener'

type CacheInvalidationMessage = {
  data: CacheInvalidationEvent
  sender: { id: string }
}

type CacheInvalidationHandler = (message: CacheInvalidationMessage) => null

type OnCacheInvalidationMessage = (
  method: 'cache.invalidate',
  handler: CacheInvalidationHandler,
) => () => void

const messagingMocks = vi.hoisted(() => ({
  onMessage: vi.fn<OnCacheInvalidationMessage>(),
}))

vi.mock('@/extension/messaging', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/extension/messaging')>()

  return {
    ...actual,
    onMessage: messagingMocks.onMessage,
  }
})

describe('CacheInvalidationListener', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    messagingMocks.onMessage.mockReturnValue(() => undefined)
  })

  it('invalidates local TanStack Query caches for background cache events', async () => {
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    render(<CacheInvalidationListener />, { wrapper })

    const handler = messagingMocks.onMessage.mock.calls[0]?.[1]
    expect(handler).toBeDefined()

    if (!handler) {
      throw new Error('Expected cache invalidation handler to be registered.')
    }

    handler({
      data: {
        emittedAt: '2026-01-01T10:00:00.000Z',
        reason: 'practice-updated',
        source: 'content-script',
        tags: ['practice', 'queue', 'app-shell'],
      },
      sender: { id: 'extension-id' },
    })

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['practice-details'],
      })
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['today-queue'],
      })
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['app-shell-data'],
      })
    })
  })

  it('clears public hint metadata for the full reset and restore invalidation signature', async () => {
    const { queryClient, wrapper } = createQueryTestHarness()
    const resetQueries = vi.spyOn(queryClient, 'resetQueries')
    queryClient.setQueryData(queryKeys.genai.hintConnection(), {
      available: true,
      provider: 'gemini',
      revision: 'old',
    })
    render(<CacheInvalidationListener />, { wrapper })
    const handler = messagingMocks.onMessage.mock.calls[0]![1]
    handler({
      data: {
        emittedAt: '2026-01-01T10:00:00.000Z',
        reason: 'problem-catalog-updated',
        source: 'dashboard',
        tags: [
          'settings',
          'genai',
          'problems',
          'practice',
          'queue',
          'tracks',
          'app-shell',
        ],
      },
      sender: { id: 'extension-id' },
    })
    await waitFor(() =>
      expect(resetQueries).toHaveBeenCalledExactlyOnceWith({
        queryKey: queryKeys.genai.hintConnection(),
        exact: true,
      }),
    )
    expect(
      queryClient.getQueryData(queryKeys.genai.hintConnection()),
    ).toBeUndefined()
  })

  it.each([
    { reason: 'settings-updated', tags: ['settings', 'genai'] },
    { reason: 'genai-updated', tags: ['genai'] },
    {
      reason: 'problem-catalog-updated',
      tags: ['problems', 'practice', 'queue', 'tracks', 'app-shell'],
    },
    {
      reason: 'settings-updated',
      tags: [
        'settings',
        'genai',
        'problems',
        'practice',
        'queue',
        'tracks',
        'app-shell',
      ],
    },
  ] as const)(
    'preserves public hint metadata for ordinary $reason events with tags $tags',
    async ({ reason, tags }) => {
      const { queryClient, wrapper } = createQueryTestHarness()
      const resetQueries = vi.spyOn(queryClient, 'resetQueries')
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const saved = { available: true, provider: 'gemini', revision: 'old' }
      queryClient.setQueryData(queryKeys.genai.hintConnection(), saved)
      render(<CacheInvalidationListener />, { wrapper })
      const handler = messagingMocks.onMessage.mock.calls[0]![1]
      handler({
        data: {
          emittedAt: '2026-01-01T10:00:00.000Z',
          reason,
          source: 'dashboard',
          tags: [...tags],
        },
        sender: { id: 'extension-id' },
      })
      await waitFor(() => expect(invalidateQueries).toHaveBeenCalled())
      expect(resetQueries).not.toHaveBeenCalled()
      expect(
        queryClient.getQueryData(queryKeys.genai.hintConnection()),
      ).toEqual(saved)
    },
  )

  it.each(['popup', 'content-script'] as const)(
    'does not treat %s broadcasts as full data replacement',
    async (source) => {
      const { queryClient, wrapper } = createQueryTestHarness()
      const resetQueries = vi.spyOn(queryClient, 'resetQueries')
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const saved = { available: true, provider: 'gemini', revision: 'old' }
      queryClient.setQueryData(queryKeys.genai.hintConnection(), saved)
      render(<CacheInvalidationListener />, { wrapper })
      messagingMocks.onMessage.mock.calls[0]![1]({
        data: {
          emittedAt: '2026-01-01T10:00:00.000Z',
          reason: 'problem-catalog-updated',
          source,
          tags: [
            'settings',
            'genai',
            'problems',
            'practice',
            'queue',
            'tracks',
            'app-shell',
          ],
        },
        sender: { id: 'extension-id' },
      })
      await waitFor(() => expect(invalidateQueries).toHaveBeenCalled())
      expect(resetQueries).not.toHaveBeenCalled()
      expect(
        queryClient.getQueryData(queryKeys.genai.hintConnection()),
      ).toEqual(saved)
    },
  )
})
