import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { previewPracticeReviewViaRuntime } from '@/features/practice'
import type {
  PracticePreviewRequest,
  PracticePreviewResponse,
} from '@/features/practice'
import { invalidateTaggedQueries } from '@/platform/query/cache-invalidation'
import { initialOverlaySessionState, overlaySessionReducer } from '../domain'
import type { OverlaySessionState } from '../domain'
import { useOverlayReviewPreview } from './use-overlay-review-preview'

vi.mock('@/features/practice', () => ({
  previewPracticeReviewViaRuntime: vi.fn(),
}))

const previewRuntime = vi.mocked(previewPracticeReviewViaRuntime)
const generation = {
  localGenerationToken: 'local',
  problemGenerationToken: 'problem',
}

function createReady(request: PracticePreviewRequest): PracticePreviewResponse {
  const { surface: _surface, ...identity } = request
  void _surface
  const rating = {
    dueAt: '2026-10-12T10:00:00.000Z',
    eligibleOn: '2026-10-12',
    studyDays: 1,
    scheduledDays: 1,
  }
  return {
    status: 'ready',
    identity,
    evidence: request.mode === 'submit' ? 'active' : 'captured',
    ratings: { again: rating, hard: rating, good: rating, easy: rating },
  }
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const overlay: OverlaySessionState = {
    ...initialOverlaySessionState,
    activeProblemSlug: 'two-sum',
    previewGeneration: generation,
  }
  return { queryClient, wrapper, overlay }
}

beforeEach(() => {
  previewRuntime.mockReset()
})

describe('useOverlayReviewPreview', () => {
  it('uses the acknowledged Update identity and hides a pending command preview', async () => {
    const harness = createHarness()
    previewRuntime.mockImplementation((request) =>
      Promise.resolve(createReady(request)),
    )
    const submitted: OverlaySessionState = {
      ...harness.overlay,
      submittedSession: {
        reviewAttemptId: 'acknowledged-attempt',
        revision: 3,
        reviewedAt: '2026-01-01T10:00:00.000Z',
        generation,
        rating: 'good',
        elapsedSeconds: null,
        isCorrect: true,
        lockReason: null,
      },
      selectedRating: 'hard',
    }
    const props = { overlay: submitted }
    const { result, rerender } = renderHook(
      ({ overlay }: typeof props) =>
        useOverlayReviewPreview({
          overlay,
        }),
      { initialProps: props, wrapper: harness.wrapper },
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(previewRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'update',
        targetAttemptId: 'acknowledged-attempt',
        expectedRevision: 3,
        reviewedAt: '2026-01-01T10:00:00.000Z',
      }),
    )
    props.overlay = {
      ...props.overlay,
      acceptedCommand: {
        operation: 'update',
        syncToken: 1,
        lockReason: null,
        feedback: { tone: 'neutral', message: 'Saving' },
        request: {
          surface: 'content-script',
          commandId: 'command',
          problemSlug: 'two-sum',
          generation,
          targetAttemptId: 'acknowledged-attempt',
          expectedRevision: 3,
          reviewedAt: '2026-01-01T10:00:00.000Z',
          rating: 'hard',
        },
      },
    }
    rerender(props)
    expect(result.current.status).toBe('loading')
    expect(props.overlay.selectedRating).toBe('hard')
  })
  it('refreshes after both Practice and Settings invalidation without changing the draft', async () => {
    const harness = createHarness()
    previewRuntime.mockImplementation((request) =>
      Promise.resolve(createReady(request)),
    )
    const { result } = renderHook(
      () =>
        useOverlayReviewPreview({
          overlay: { ...harness.overlay, selectedRating: 'hard' },
        }),
      { wrapper: harness.wrapper },
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(previewRuntime).toHaveBeenCalledTimes(1)
    await act(async () => {
      await invalidateTaggedQueries(harness.queryClient, ['practice'])
    })
    await waitFor(() => expect(previewRuntime).toHaveBeenCalledTimes(2))
    await act(async () => {
      await invalidateTaggedQueries(harness.queryClient, ['settings'])
    })
    await waitFor(() => expect(previewRuntime).toHaveBeenCalledTimes(3))
    expect(harness.overlay.selectedRating).toBe('good')
  })

  it('ignores an old response after Restart and an Update conflict', async () => {
    const harness = createHarness()
    const pending: Array<(value: PracticePreviewResponse) => void> = []
    previewRuntime.mockImplementation(
      (request) =>
        new Promise((resolve) => {
          pending.push((value) => resolve(value))
          void request
        }),
    )
    const props = { overlay: harness.overlay }
    const { result, rerender } = renderHook(
      ({ overlay }: typeof props) =>
        useOverlayReviewPreview({
          overlay,
        }),
      { initialProps: props, wrapper: harness.wrapper },
    )
    await waitFor(() => expect(previewRuntime).toHaveBeenCalledTimes(1))
    const firstRequest = previewRuntime.mock.calls[0]![0]
    props.overlay = overlaySessionReducer(props.overlay, {
      type: 'restart-local-session',
      selectedRating: 'hard',
    })
    rerender(props)
    await waitFor(() => expect(previewRuntime).toHaveBeenCalledTimes(2))
    const secondRequest = previewRuntime.mock.calls[1]![0]
    act(() => pending[1]!(createReady(secondRequest)))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => pending[0]!(createReady(firstRequest)))
    expect(result.current.status).toBe('ready')
    expect(props.overlay.selectedRating).toBe('hard')

    props.overlay = overlaySessionReducer(props.overlay, {
      type: 'command-conflicted',
      message: 'Stale update',
    })
    rerender(props)
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(previewRuntime).toHaveBeenCalledTimes(3))
  })

  it('keeps a late previous-page result out of the next problem', async () => {
    const harness = createHarness()
    const pending: Array<(value: PracticePreviewResponse) => void> = []
    previewRuntime.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve)
        }),
    )
    const props = { overlay: harness.overlay }
    const { result, rerender } = renderHook(
      ({ overlay }: typeof props) => useOverlayReviewPreview({ overlay }),
      { initialProps: props, wrapper: harness.wrapper },
    )
    await waitFor(() => expect(previewRuntime).toHaveBeenCalledTimes(1))
    const oldRequest = previewRuntime.mock.calls[0]![0]
    props.overlay = overlaySessionReducer(props.overlay, {
      type: 'page-changed',
    })
    props.overlay = overlaySessionReducer(props.overlay, {
      type: 'problem-loaded',
      problemSlug: 'add-two-numbers',
      selectedRating: 'hard',
      previewGeneration: generation,
    })
    rerender(props)
    await waitFor(() => expect(previewRuntime).toHaveBeenCalledTimes(2))
    const nextRequest = previewRuntime.mock.calls[1]![0]
    const next = createReady(nextRequest)
    if (next.status !== 'ready') throw new Error('expected ready preview')
    next.ratings.good.eligibleOn = '2026-10-15'
    act(() => pending[1]!(next))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => pending[0]!(createReady(oldRequest)))
    expect(result.current.status).toBe('ready')
    if (result.current.status !== 'ready')
      throw new Error('expected ready preview')
    expect(result.current.result.identity.problemSlug).toBe('add-two-numbers')
    expect(result.current.result.ratings.good.eligibleOn).toBe('2026-10-15')
    expect(props.overlay.selectedRating).toBe('hard')
  })

  it('keeps a pending accepted Retry isolated from an in-flight estimate', async () => {
    const harness = createHarness()
    let resolvePreview: ((value: PracticePreviewResponse) => void) | undefined
    previewRuntime.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve
        }),
    )
    const props = { overlay: harness.overlay }
    const { result, rerender } = renderHook(
      ({ overlay }: typeof props) => useOverlayReviewPreview({ overlay }),
      { initialProps: props, wrapper: harness.wrapper },
    )
    await waitFor(() => expect(previewRuntime).toHaveBeenCalledTimes(1))
    const request = previewRuntime.mock.calls[0]![0]
    const accepted = {
      operation: 'save' as const,
      syncToken: 1,
      lockReason: null,
      feedback: { tone: 'neutral' as const, message: 'Saving' },
      request: {
        surface: 'content-script' as const,
        commandId: 'accepted',
        problemSlug: 'two-sum',
        generation,
        rating: 'good' as const,
        reviewMode: 'leetcode' as const,
        reviewedAt: '2026-10-11T10:00:00.000Z',
        log: {},
      },
    }
    props.overlay = overlaySessionReducer(props.overlay, {
      type: 'command-started',
      command: accepted,
    })
    props.overlay = overlaySessionReducer(props.overlay, {
      type: 'command-pending',
    })
    rerender(props)
    act(() => resolvePreview!(createReady(request)))
    expect(result.current.status).toBe('loading')
    expect(props.overlay.acceptedCommand?.request).toEqual(accepted.request)
    expect(props.overlay.commandStatus).toBe('persistence-pending')
  })

  it('keeps preview failure separate from review actions', async () => {
    const harness = createHarness()
    previewRuntime.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(
      () =>
        useOverlayReviewPreview({
          overlay: harness.overlay,
        }),
      { wrapper: harness.wrapper },
    )
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(harness.overlay.acceptedCommand).toBeNull()
  })
})
