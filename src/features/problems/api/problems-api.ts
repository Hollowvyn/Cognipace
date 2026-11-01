import type { BackupReplacementResult } from '@/features/backup/api/backup-contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import { invalidateTaggedQueries } from '@/platform/query/cache-invalidation'
import { queryKeys } from '@/platform/query/query-keys'

import type {
  ProblemsBulkDeleteRequest,
  ProblemsResetProblemDataRequest,
  ProblemsBulkUpdateProblemsRequest,
  ProblemsCreateProblemRequest,
  ProblemsDeleteProblemRequest,
  ProblemsGetLibraryRequest,
  ProblemsGetProblemForEditRequest,
  ProblemsUpdateProblemRequest,
  ProblemsUpsertFromPageRequest,
} from './problems-contracts'

export const problemsQueryKeys = queryKeys.problems

export function upsertProblemFromPageViaRuntime(
  request: ProblemsUpsertFromPageRequest,
) {
  return sendMessage('problems.upsertFromPage', request)
}

export function getProblemLibraryViaRuntime(
  request: ProblemsGetLibraryRequest,
) {
  return sendMessage('problems.getLibrary', request)
}

export function getProblemForEditViaRuntime(
  request: ProblemsGetProblemForEditRequest,
) {
  return sendMessage('problems.getProblemForEdit', request)
}

export function createProblemViaRuntime(request: ProblemsCreateProblemRequest) {
  return sendMessage('problems.createProblem', request)
}

export function updateProblemViaRuntime(request: ProblemsUpdateProblemRequest) {
  return sendMessage('problems.updateProblem', request)
}

export function deleteProblemViaRuntime(request: ProblemsDeleteProblemRequest) {
  return sendMessage('problems.deleteProblem', request)
}

export function bulkUpdateProblemsViaRuntime(
  request: ProblemsBulkUpdateProblemsRequest,
) {
  return sendMessage('problems.bulkUpdateProblems', request)
}

export function bulkDeleteProblemsViaRuntime(
  request: ProblemsBulkDeleteRequest,
) {
  return sendMessage('problems.bulkDelete', request)
}

export function useProblemLibrary(request: ProblemsGetLibraryRequest) {
  return useQuery({
    queryKey: problemsQueryKeys.library(request.at),
    queryFn: () => getProblemLibraryViaRuntime(request),
  })
}

export function useProblemForEdit(request: ProblemsGetProblemForEditRequest) {
  return useQuery({
    queryKey: problemsQueryKeys.edit(request.problemSlug),
    queryFn: () => getProblemForEditViaRuntime(request),
  })
}

export function useUpsertProblemFromPage() {
  return useMutation({
    mutationFn: upsertProblemFromPageViaRuntime,
  })
}

export function useCreateProblem() {
  return useProblemMutation(createProblemViaRuntime)
}

export function useUpdateProblem() {
  return useProblemMutation(updateProblemViaRuntime)
}

export function useDeleteProblem() {
  return useProblemDataMutation(deleteProblemViaRuntime)
}

export function useBulkUpdateProblems() {
  return useProblemMutation(bulkUpdateProblemsViaRuntime)
}

export function useBulkDeleteProblems() {
  return useProblemDataMutation(bulkDeleteProblemsViaRuntime)
}

function useProblemMutation<TRequest, TResponse>(
  mutationFn: (request: TRequest) => Promise<TResponse>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void invalidateTaggedQueries(queryClient, ['problems'])
    },
  })
}

export function useResetProblemData() {
  return useProblemDataMutation((request: ProblemsResetProblemDataRequest) =>
    sendMessage('problems.resetProblemData', request),
  )
}

function useProblemDataMutation<TRequest>(
  mutationFn: (request: TRequest) => Promise<BackupReplacementResult>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      // Keep the accepted request and confirmation mounted until publication and
      // its continuation settle. Background publication owns broad invalidation.
      if (result.status === 'persistence-pending') {
        queryClient.setQueryData(queryKeys.backup.pendingReplacement(), result)
        return
      }
      if (result.status === 'durable' && result.syncMetadataPending) {
        queryClient.setQueryData(queryKeys.backup.pendingReplacement(), {
          ...result,
          status: 'durable-sync-metadata-pending',
        })
        return
      }
      if (result.status === 'durable') {
        queryClient.setQueryData(queryKeys.backup.pendingReplacement(), {
          status: 'idle',
        })
        void invalidateTaggedQueries(queryClient, ['problems'])
      }
    },
  })
}
