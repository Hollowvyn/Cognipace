import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sendMessage, type UiSurface } from '@/extension/messaging'
import {
  invalidateTaggedQueries,
  type CacheInvalidationTag,
} from '@/platform/query/cache-invalidation'
import { queryKeys } from '@/platform/query/query-keys'

import type { SyncActionResult } from './sync-contracts'

export const syncQueryKeys = queryKeys.sync

const broadSyncInvalidationTags = [
  'settings',
  'genai',
  'problems',
  'practice',
  'queue',
  'tracks',
  'app-shell',
] as const satisfies readonly CacheInvalidationTag[]

export type PullLatestOptions = {
  confirmLocalOverwrite?: boolean
}

export function getSyncStatusViaRuntime(surface: UiSurface = 'dashboard') {
  return sendMessage('sync.getStatus', { surface })
}

export function validateGithubTokenViaRuntime(token: string) {
  return sendMessage('sync.validateGithubToken', {
    surface: 'dashboard',
    token,
  })
}

export function validateStoredGithubTokenViaRuntime() {
  return sendMessage('sync.validateStoredGithubToken', {
    surface: 'dashboard',
  })
}

export function saveGithubTokenViaRuntime(token: string) {
  return sendMessage('sync.saveGithubToken', { surface: 'dashboard', token })
}

export function deleteGithubTokenViaRuntime() {
  return sendMessage('sync.deleteGithubToken', { surface: 'dashboard' })
}

export function createGithubGistViaRuntime() {
  return sendMessage('sync.createGithubGist', { surface: 'dashboard' })
}

export function connectGithubGistViaRuntime(gistId: string) {
  return sendMessage('sync.connectGithubGist', { surface: 'dashboard', gistId })
}

export function setSyncEnabledViaRuntime(enabled: boolean) {
  return sendMessage('sync.setEnabled', { surface: 'dashboard', enabled })
}

export function pullLatestViaRuntime(options: PullLatestOptions = {}) {
  return sendMessage('sync.pullLatest', {
    surface: 'dashboard',
    confirmLocalOverwrite: options.confirmLocalOverwrite ?? false,
  })
}

export function pushLocalViaRuntime(
  options: { confirmRemoteOverwrite?: boolean } = {},
) {
  return sendMessage('sync.pushLocal', {
    surface: 'dashboard',
    confirmRemoteOverwrite: options.confirmRemoteOverwrite ?? false,
  })
}

export function checkRemoteOnOpenViaRuntime(surface: UiSurface) {
  return sendMessage('sync.checkRemoteOnOpen', { surface })
}

export function requestOpenCheckViaRuntime(surface: UiSurface) {
  return sendMessage('sync.requestOpenCheck', { surface })
}

export function useSyncStatus(surface: UiSurface = 'dashboard') {
  return useQuery({
    queryKey: syncQueryKeys.status(surface),
    queryFn: () => getSyncStatusViaRuntime(surface),
  })
}

function didPullSuccessfully(result: SyncActionResult) {
  return result.direction === 'pull' && result.outcome === 'success'
}

export function useSyncAction<TVariables = void, TResult = unknown>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  options: {
    shouldInvalidateData?: (result: TResult) => boolean
  } = {},
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: syncQueryKeys.all })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.backup.pendingReplacement(),
      })
    },
    onSuccess: (result) => {
      if (options.shouldInvalidateData?.(result)) {
        void invalidateTaggedQueries(queryClient, broadSyncInvalidationTags)
      }
    },
  })
}

export function usePullLatest() {
  return useSyncAction<PullLatestOptions | undefined, SyncActionResult>(
    (input) => pullLatestViaRuntime(input),
    {
      shouldInvalidateData: didPullSuccessfully,
    },
  )
}

export function usePushLocal() {
  return useSyncAction<
    Parameters<typeof pushLocalViaRuntime>[0] | undefined,
    SyncActionResult
  >((input) => pushLocalViaRuntime(input))
}
