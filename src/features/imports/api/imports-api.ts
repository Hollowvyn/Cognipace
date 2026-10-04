import { useMutation, useQueryClient } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import { invalidateTaggedQueries } from '@/platform/query/cache-invalidation'

import type { ImportApplyRequest } from './import-runtime-contracts'

const importInvalidationTags = ['problems', 'tracks', 'analytics'] as const

type ApplyContentImportVariables = Pick<
  ImportApplyRequest,
  'fileText' | 'fingerprint'
>

export function usePreviewContentImport() {
  return useMutation({
    mutationFn: (fileText: string) =>
      sendMessage('imports.preview', { surface: 'dashboard', fileText }),
  })
}

export function useApplyContentImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ fileText, fingerprint }: ApplyContentImportVariables) =>
      sendMessage('imports.apply', {
        surface: 'dashboard',
        fileText,
        fingerprint,
      }),
    onSuccess: (response) => {
      if (
        response.status === 'saved' ||
        response.status === 'persistence-error'
      ) {
        void invalidateTaggedQueries(queryClient, importInvalidationTags)
      }
    },
  })
}

export function useRetryImportPersistence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      sendMessage('imports.retryPersistence', { surface: 'dashboard' }),
    onSuccess: (response) => {
      if (response.status === 'saved') {
        void invalidateTaggedQueries(queryClient, importInvalidationTags)
      }
    },
  })
}
