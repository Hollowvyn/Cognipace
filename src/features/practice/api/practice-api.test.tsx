import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PracticeReviewCommandResult } from './practice-contracts'

import { sendMessage } from '@/extension/messaging'
import { createSerializedPracticeDetails } from '@/testing/practice-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  saveReviewResultViaRuntime,
  overrideLastReviewResultViaRuntime,
  useResetPracticeSchedule,
  useSaveReviewResult,
  useSetPracticeSuspended,
} from './practice-api'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

const queryMocks = vi.hoisted(() => ({
  invalidateTaggedQueries: vi.fn(),
}))

vi.mock('@/platform/query/cache-invalidation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/platform/query/cache-invalidation')>()

  queryMocks.invalidateTaggedQueries.mockImplementation(
    actual.invalidateTaggedQueries,
  )

  return {
    ...actual,
    invalidateTaggedQueries: queryMocks.invalidateTaggedQueries,
  }
})

describe('practice API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends saved reviews through the runtime mutation boundary', async () => {
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    vi.mocked(sendMessage).mockResolvedValue(commandResult)
    const { result } = renderHook(() => useSaveReviewResult(), {
      wrapper,
    })

    await act(async () => {
      expect(await result.current.mutateAsync(commandRequest)).toEqual(
        commandResult,
      )
    })

    expect(sendMessage).toHaveBeenCalledWith(
      'practice.saveReviewResult',
      commandRequest,
    )
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('parses typed conflicts and pending results, and rejects malformed mutation responses', async () => {
    const conflict = {
      status: 'conflict' as const,
      reason: 'stale-review' as const,
      message: 'Refresh',
      current: practiceDetails,
    }
    vi.mocked(sendMessage).mockResolvedValueOnce(conflict)
    expect(await saveReviewResultViaRuntime(commandRequest)).toEqual(conflict)
    const pending = { ...commandResult, status: 'persistence-pending' as const }
    vi.mocked(sendMessage).mockResolvedValueOnce(pending)
    const { reviewMode, ...update } = commandRequest
    expect(reviewMode).toBe('leetcode')
    expect(
      await overrideLastReviewResultViaRuntime({
        ...update,
        targetAttemptId: 'event',
        expectedRevision: 0,
      }),
    ).toEqual(pending)
    vi.mocked(sendMessage).mockResolvedValueOnce(practiceDetails)
    await expect(saveReviewResultViaRuntime(commandRequest)).rejects.toThrow()
  })

  it('sends suspend and reset mutations through the runtime boundary without client-side invalidation', async () => {
    await expectNoClientInvalidation({
      method: 'practice.setSuspended',
      request: {
        surface: 'dashboard',
        problemSlug: 'two-sum',
        suspended: true,
      },
      useHook: useSetPracticeSuspended,
    })
    await expectNoClientInvalidation({
      method: 'practice.resetSchedule',
      request: { surface: 'dashboard', problemSlug: 'two-sum' },
      useHook: useResetPracticeSchedule,
    })
  })
})

const practiceDetails = createSerializedPracticeDetails({
  cardId: 'fsrs:two-sum',
})

async function expectNoClientInvalidation<TRequest>(input: {
  method: string
  request: TRequest
  useHook: () => { mutateAsync: (request: TRequest) => Promise<unknown> }
}) {
  vi.clearAllMocks()
  const { queryClient, wrapper } = createQueryTestHarness()
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
  vi.mocked(sendMessage).mockResolvedValue(practiceDetails)
  const { result } = renderHook(() => input.useHook(), { wrapper })

  await act(async () => {
    await result.current.mutateAsync(input.request)
  })

  expect(sendMessage).toHaveBeenCalledWith(input.method, input.request)
  expect(queryMocks.invalidateTaggedQueries).not.toHaveBeenCalled()
  expect(invalidateQueries).not.toHaveBeenCalled()
}
const commandRequest = {
  surface: 'content-script',
  commandId: 'review-command',
  problemSlug: 'two-sum',
  generation: {
    localGenerationToken: 'local-generation',
    problemGenerationToken: null,
  },
  rating: 'good',
  reviewMode: 'leetcode',
  reviewedAt: '2026-01-01T00:00:00.000Z',
  log: { notes: 'Accepted notes' },
} as const
const commandResult = {
  status: 'saved',
  current: practiceDetails,
  acknowledgement: {
    schemaVersion: 1,
    operation: 'save',
    problemSlug: 'two-sum',
    cardId: 'opaque-card',
    reviewAttemptId: 'original-event',
    applicationSequence: 1,
    revision: 0,
    rating: 'good',
    reviewedAt: '2026-01-01T00:00:00.000Z',
    dueAt: '2026-01-02T00:00:00.000Z',
    status: 'review',
    card: {
      dueAt: '2026-01-02T00:00:00.000Z',
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      state: 'review',
      lastReviewAt: '2026-01-01T00:00:00.000Z',
    },
    fsrsReviewLog: null,
    schedulingEvidenceKind: 'unknown',
    schedulerProfileId: null,
  },
} satisfies PracticeReviewCommandResult
