import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import { invalidateTaggedQueries } from '@/platform/query/cache-invalidation'
import { queryKeys } from '@/platform/query/query-keys'

import type {
  TracksCreateTrackRequest,
  TracksClearActiveTrackRequest,
  TracksDeleteTrackRequest,
  TracksGetActiveTrackRequest,
  TracksGetTrackForEditRequest,
  TracksGetWorkspaceRequest,
  TracksRemoveProblemRequest,
  TracksResetTrackProgressRequest,
  TracksSetActiveTrackRequest,
  TracksUpdateTrackRequest,
} from './tracks-contracts'

export const tracksQueryKeys = queryKeys.tracks

export function getActiveTrackViaRuntime(request: TracksGetActiveTrackRequest) {
  return sendMessage('tracks.getActiveTrack', request)
}

export function getTrackWorkspaceViaRuntime(
  request: TracksGetWorkspaceRequest,
) {
  return sendMessage('tracks.getWorkspace', request)
}

export function getTrackForEditViaRuntime(
  request: TracksGetTrackForEditRequest,
) {
  return sendMessage('tracks.getTrackForEdit', request)
}

export function setActiveTrackViaRuntime(request: TracksSetActiveTrackRequest) {
  return sendMessage('tracks.setActiveTrack', request)
}

export function clearActiveTrackViaRuntime(
  request: TracksClearActiveTrackRequest,
) {
  return sendMessage('tracks.clearActiveTrack', request)
}

export function createTrackViaRuntime(request: TracksCreateTrackRequest) {
  return sendMessage('tracks.createTrack', request)
}

export function updateTrackViaRuntime(request: TracksUpdateTrackRequest) {
  return sendMessage('tracks.updateTrack', request)
}

export function removeTrackProblemViaRuntime(
  request: TracksRemoveProblemRequest,
) {
  return sendMessage('tracks.removeProblem', request)
}

export function deleteTrackViaRuntime(request: TracksDeleteTrackRequest) {
  return sendMessage('tracks.deleteTrack', request)
}

export function resetTrackProgressViaRuntime(
  request: TracksResetTrackProgressRequest,
) {
  return sendMessage('tracks.resetTrackProgress', request)
}

export function useActiveTrack(request: TracksGetActiveTrackRequest) {
  return useQuery({
    queryKey: tracksQueryKeys.active(request.surface),
    queryFn: () => getActiveTrackViaRuntime(request),
  })
}

export function useTrackWorkspace(request: TracksGetWorkspaceRequest) {
  return useQuery({
    queryKey: tracksQueryKeys.workspace(request.at),
    queryFn: () => getTrackWorkspaceViaRuntime(request),
    refetchOnMount: 'always',
  })
}

export function useTrackForEdit(request: TracksGetTrackForEditRequest) {
  return useQuery({
    queryKey: tracksQueryKeys.edit(request.trackId),
    queryFn: () => getTrackForEditViaRuntime(request),
  })
}

export function useSetActiveTrack() {
  return useTrackMutation(setActiveTrackViaRuntime, ['tracks'])
}

export function useClearActiveTrack() {
  return useTrackMutation(clearActiveTrackViaRuntime, ['tracks'])
}

export function useCreateTrack() {
  return useTrackMutation(createTrackViaRuntime, ['tracks', 'problems'])
}

export function useUpdateTrack() {
  return useTrackMutation(updateTrackViaRuntime, ['tracks', 'problems'])
}

export function useRemoveTrackProblem() {
  return useTrackMutation(removeTrackProblemViaRuntime, ['tracks', 'problems'])
}

export function useDeleteTrack() {
  return useTrackMutation(deleteTrackViaRuntime, ['tracks', 'problems'])
}

export function useResetTrackProgress() {
  return useTrackMutation(resetTrackProgressViaRuntime, ['tracks', 'problems'])
}

function useTrackMutation<TRequest, TResponse>(
  mutationFn: (request: TRequest) => Promise<TResponse>,
  invalidationTags: readonly ['tracks'] | readonly ['tracks', 'problems'],
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => {
      invalidateTaggedQueries(queryClient, invalidationTags)
    },
  })
}
