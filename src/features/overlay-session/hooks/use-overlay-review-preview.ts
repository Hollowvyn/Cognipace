import { useQuery } from '@tanstack/react-query'

import {
  previewPracticeReviewViaRuntime,
  type PracticePreviewResponse,
  type PracticePreviewRequest,
} from '@/features/practice'
import { queryKeys } from '@/platform/query/query-keys'
import type { OverlaySessionState } from '../domain'

export type OverlayReviewPreviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable'; reason: string }
  | {
      status: 'ready'
      result: Extract<PracticePreviewResponse, { status: 'ready' }>
    }

/** A query key owns supersession; Restart and SPA navigation change that key. */
export function useOverlayReviewPreview(options: {
  overlay: OverlaySessionState
}): OverlayReviewPreviewState {
  const { overlay } = options
  const slug = overlay.activeProblemSlug
  const generation = overlay.previewGeneration
  const submitted = overlay.submittedSession
  const mode = submitted ? 'update' : 'submit'
  const key = JSON.stringify([
    slug,
    overlay.previewEpoch,
    mode,
    generation,
    submitted?.reviewAttemptId,
    submitted?.revision,
    submitted?.reviewedAt,
  ])
  const enabled = Boolean(slug && generation && !overlay.acceptedCommand)
  const query = useQuery({
    queryKey: queryKeys.practice.preview(key),
    enabled,
    staleTime: Infinity,
    queryFn: async () => {
      if (!slug || !generation) throw new Error('Practice is unavailable.')
      const request: PracticePreviewRequest = submitted
        ? {
            mode: 'update',
            surface: 'content-script',
            problemSlug: slug,
            generation: submitted.generation,
            targetAttemptId: submitted.reviewAttemptId,
            expectedRevision: submitted.revision,
            reviewedAt: submitted.reviewedAt,
          }
        : {
            mode: 'submit',
            surface: 'content-script',
            problemSlug: slug,
            generation,
            previewedAt: new Date().toISOString(),
          }
      const response = await previewPracticeReviewViaRuntime(request)
      const { surface: _surface, ...identity } = request
      void _surface
      if (JSON.stringify(response.identity) !== JSON.stringify(identity)) {
        throw new Error('Preview context changed. Refresh to try again.')
      }
      return response
    },
  })

  if (!enabled || query.isPending || query.isFetching)
    return { status: 'loading' }
  if (query.isError) return { status: 'error' }
  const result = query.data
  if (!result) return { status: 'loading' }
  if (result.status !== 'ready') {
    return {
      status: 'unavailable',
      reason:
        result.status === 'conflict'
          ? 'Review context changed. Refresh before using this estimate.'
          : result.reason === 'unsupported-legacy'
            ? 'Original scheduling context is ambiguous; Update estimate is unavailable.'
            : 'Scheduling context is unavailable.',
    }
  }
  return { status: 'ready', result }
}
