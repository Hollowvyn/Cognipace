import { act, renderHook } from '@testing-library/react'
import type { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { queryKeys } from '@/platform/query/query-keys'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  useApplyContentImport,
  usePreviewContentImport,
  useRetryImportPersistence,
} from './imports-api'
import type {
  ImportApplyResponse,
  ImportRetryPersistenceResponse,
} from './import-runtime-contracts'
import { readyPreview } from '../testing/import-fixtures'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

const fileText = '{"format":"cognipace-content","version":1}'
const fingerprint = 'a'.repeat(64)

const affectedQueryKeys = [
  queryKeys.problems.all,
  queryKeys.appShell.all,
  queryKeys.practice.all,
  queryKeys.queue.all,
  queryKeys.tracks.all,
  queryKeys.analytics.all,
]

describe('imports API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('previews file text through the dashboard runtime without invalidating queries', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      ...readyPreview,
    })
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => usePreviewContentImport(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(fileText)
    })

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('imports.preview', {
      surface: 'dashboard',
      fileText,
    })
    expect(invalidateQueries).not.toHaveBeenCalled()
    expect(queryClient.getQueryCache().getAll()).toEqual([])
  })

  it.each(['saved', 'persistence-error'] as const)(
    'invalidates affected queries after an apply returns %s, without settings',
    async (status) => {
      const response = applyResponse(status)
      vi.mocked(sendMessage).mockResolvedValue(response)
      const { queryClient, wrapper } = createQueryTestHarness()
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useApplyContentImport(), { wrapper })

      await act(async () => {
        await result.current.mutateAsync({ fileText, fingerprint })
      })

      expect(sendMessage).toHaveBeenCalledExactlyOnceWith('imports.apply', {
        surface: 'dashboard',
        fileText,
        fingerprint,
      })
      expect(
        canonicalQueryKeys(invalidatedKeys(invalidateQueries.mock.calls)),
      ).toEqual(canonicalQueryKeys(affectedQueryKeys))
      expect(invalidatedKeys(invalidateQueries.mock.calls)).not.toContainEqual(
        queryKeys.settings.all,
      )
    },
  )

  it.each(['stale', 'unchanged', 'blocked'] as const)(
    'does not invalidate queries when apply returns %s',
    async (status) => {
      vi.mocked(sendMessage).mockResolvedValue(applyResponse(status))
      const { queryClient, wrapper } = createQueryTestHarness()
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useApplyContentImport(), { wrapper })

      await act(async () => {
        await result.current.mutateAsync({ fileText, fingerprint })
      })

      expect(invalidateQueries).not.toHaveBeenCalled()
    },
  )

  it('retries persistence through the dashboard runtime and invalidates after saved', async () => {
    vi.mocked(sendMessage).mockResolvedValue(retryResponse('saved'))
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRetryImportPersistence(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith(
      'imports.retryPersistence',
      { surface: 'dashboard' },
    )
    expect(
      canonicalQueryKeys(invalidatedKeys(invalidateQueries.mock.calls)),
    ).toEqual(canonicalQueryKeys(affectedQueryKeys))
    expect(invalidatedKeys(invalidateQueries.mock.calls)).not.toContainEqual(
      queryKeys.settings.all,
    )
  })

  it.each(['repreview', 'persistence-error'] as const)(
    'does not invalidate queries when persistence retry returns %s',
    async (status) => {
      vi.mocked(sendMessage).mockResolvedValue(retryResponse(status))
      const { queryClient, wrapper } = createQueryTestHarness()
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useRetryImportPersistence(), {
        wrapper,
      })

      await act(async () => {
        await result.current.mutateAsync()
      })

      expect(sendMessage).toHaveBeenCalledExactlyOnceWith(
        'imports.retryPersistence',
        { surface: 'dashboard' },
      )
      expect(invalidateQueries).not.toHaveBeenCalled()
    },
  )
})

function applyResponse(status: ImportApplyResponse['status']) {
  return {
    status,
    preview: readyPreview,
  } satisfies ImportApplyResponse
}

function retryResponse(status: ImportRetryPersistenceResponse['status']) {
  return { status } satisfies ImportRetryPersistenceResponse
}

function invalidatedKeys(
  calls: Parameters<QueryClient['invalidateQueries']>[],
) {
  return calls.map(([filters]) => filters?.queryKey)
}

function canonicalQueryKeys(keys: readonly unknown[]) {
  return keys.map((key) => JSON.stringify(key) ?? 'undefined').sort()
}
