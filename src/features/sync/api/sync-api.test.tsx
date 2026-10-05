import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { queryKeys } from '@/platform/query/query-keys'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  checkRemoteOnOpenViaRuntime,
  connectGithubGistViaRuntime,
  pullLatestViaRuntime,
  pushLocalViaRuntime,
  requestOpenCheckViaRuntime,
  saveGithubTokenViaRuntime,
  validateStoredGithubTokenViaRuntime,
  usePullLatest,
  usePushLocal,
  useSyncAction,
} from './sync-api'
import type { SyncPushLocalRequest } from '..'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('sync API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends token saves through the dashboard runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValue(syncActionResult)

    await saveGithubTokenViaRuntime('ghp_secret')

    expect(sendMessage).toHaveBeenCalledWith('sync.saveGithubToken', {
      surface: 'dashboard',
      token: 'ghp_secret',
    })
  })

  it('sends stored token validation through the dashboard runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValue(syncActionResult)

    await validateStoredGithubTokenViaRuntime()

    expect(sendMessage).toHaveBeenCalledWith('sync.validateStoredGithubToken', {
      surface: 'dashboard',
    })
  })

  it('sends existing Gist connection through the runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValue(syncActionResult)

    await connectGithubGistViaRuntime('gist_1')

    expect(sendMessage).toHaveBeenCalledWith('sync.connectGithubGist', {
      surface: 'dashboard',
      gistId: 'gist_1',
    })
  })

  it('sends manual pull through the directional runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValue(syncActionResult)

    await pullLatestViaRuntime()

    expect(sendMessage).toHaveBeenCalledWith('sync.pullLatest', {
      surface: 'dashboard',
      confirmLocalOverwrite: false,
    })
  })

  it('sends confirmed manual pull through the directional runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValue(syncActionResult)

    const pullLatest = pullLatestViaRuntime as (options: {
      confirmLocalOverwrite: boolean
    }) => Promise<unknown>

    await pullLatest({ confirmLocalOverwrite: true })

    expect(sendMessage).toHaveBeenCalledWith('sync.pullLatest', {
      surface: 'dashboard',
      confirmLocalOverwrite: true,
    })
  })

  it('sends manual push through the directional runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValue(syncActionResult)

    await pushLocalViaRuntime({ confirmRemoteOverwrite: true })

    expect(sendMessage).toHaveBeenCalledWith('sync.pushLocal', {
      surface: 'dashboard',
      confirmRemoteOverwrite: true,
    })
  })

  it('checks remote on open through the claimed surface', async () => {
    vi.mocked(sendMessage).mockResolvedValue(syncActionResult)

    await checkRemoteOnOpenViaRuntime('popup')

    expect(sendMessage).toHaveBeenCalledWith('sync.checkRemoteOnOpen', {
      surface: 'popup',
    })
  })

  it('requests a background open check through the claimed surface', async () => {
    vi.mocked(sendMessage).mockResolvedValue(null)

    await requestOpenCheckViaRuntime('content-script')

    expect(sendMessage).toHaveBeenCalledWith('sync.requestOpenCheck', {
      surface: 'content-script',
    })
  })

  it('refreshes sync status after failed actions', async () => {
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(
      () =>
        useSyncAction(() => {
          return Promise.reject(new Error('GitHub unavailable.'))
        }),
      { wrapper },
    )

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(
        'GitHub unavailable.',
      )
    })

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.sync.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['backup', 'pending-replacement'],
    })
  })

  it('broad-invalidates local data views when the resolved action matches the invalidation predicate', async () => {
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(
      () =>
        useSyncAction(() => Promise.resolve(syncActionResult), {
          shouldInvalidateData: (result) =>
            result.direction === 'pull' && result.outcome === 'success',
        }),
      { wrapper },
    )

    await act(async () => {
      await result.current.mutateAsync(undefined)
    })

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.problems.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.appShell.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.sync.all,
    })
  })

  it('does not broad-invalidate local data views when the resolved action misses the invalidation predicate', async () => {
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(
      () =>
        useSyncAction(
          () =>
            Promise.resolve({
              ...syncActionResult,
              outcome: 'blocked',
              reason: 'local-dirty',
            }),
          {
            shouldInvalidateData: (result) =>
              result.direction === 'pull' && result.outcome === 'success',
          },
        ),
      { wrapper },
    )

    await act(async () => {
      await result.current.mutateAsync(undefined)
    })

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.sync.all,
    })
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.problems.all,
    })
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.appShell.all,
    })
  })

  it('usePullLatest broad-invalidates local data views only after successful pull results', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...syncActionResult,
      direction: 'pull',
      outcome: 'success',
    })
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => usePullLatest(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(undefined)
    })

    expect(sendMessage).toHaveBeenCalledWith('sync.pullLatest', {
      surface: 'dashboard',
      confirmLocalOverwrite: false,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.problems.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.appShell.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.sync.all,
    })

    invalidateQueries.mockClear()
    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...syncActionResult,
      direction: 'pull',
      outcome: 'blocked',
      reason: 'local-dirty',
    })

    await act(async () => {
      await result.current.mutateAsync(undefined)
    })

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.sync.all,
    })
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.problems.all,
    })
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.appShell.all,
    })
  })

  it('usePushLocal pushes local data without broad-invalidating local data views', async () => {
    const input = {
      confirmRemoteOverwrite: true,
    } satisfies Partial<SyncPushLocalRequest>
    vi.mocked(sendMessage).mockResolvedValue({
      ...syncActionResult,
      action: 'push-local',
      direction: 'push',
      outcome: 'success',
    })
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => usePushLocal(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(input)
    })

    expect(sendMessage).toHaveBeenCalledWith('sync.pushLocal', {
      surface: 'dashboard',
      confirmRemoteOverwrite: true,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.sync.all,
    })
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.appShell.all,
    })
  })
})

const syncActionResult = {
  message: 'GitHub sync updated.',
  status: {
    enabled: false,
    configured: false,
    tokenConfigured: false,
    tokenStatus: {
      provider: 'github:gist',
      configured: false,
      updatedAt: null,
      fingerprint: null,
    },
    gistId: null,
    isSyncing: false,
    lastSyncAt: null,
    lastSyncDirection: null,
    lastPullAt: null,
    lastPushAt: null,
    needsPush: false,
    lastBlockingReason: null,
    lastError: null,
    conflict: null,
  },
  action: 'set-enabled',
  direction: 'pull',
  outcome: 'success',
  reason: null,
  retryable: false,
  occurredAt: '2026-05-26T12:00:00.000Z',
} as const

const booleanSyncActionOptions: Parameters<typeof useSyncAction>[1] = {
  // @ts-expect-error Boolean broad invalidation is intentionally unsupported.
  shouldInvalidateData: true,
}
void booleanSyncActionOptions
