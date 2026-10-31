import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { todayQueueSchema } from '@/extension/messaging'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { queueQueryKeys, useTodayQueue } from './queue-api'

vi.mock('@/extension/messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/extension/messaging')>()),
  sendMessage: vi.fn(),
}))

describe('queue runtime API', () => {
  it('today key uses "now" when at is omitted or null', () => {
    expect(queueQueryKeys.today()).toEqual(['today-queue', 'now', 'automatic'])
    expect(queueQueryKeys.today(null)).toEqual([
      'today-queue',
      'now',
      'automatic',
    ])
  })

  it('today key includes the at string when provided', () => {
    expect(queueQueryKeys.today('2026-01-15T12:00:00.000Z')).toEqual([
      'today-queue',
      '2026-01-15T12:00:00.000Z',
      'automatic',
    ])
  })

  it('separates automatic and extra-practice requests in the query cache', () => {
    expect(queueQueryKeys.today(undefined, 'automatic')).not.toEqual(
      queueQueryKeys.today(undefined, 'extra-practice'),
    )
  })

  it('calls sendMessage with queue.getTodayQueue and the full request', async () => {
    const payload = emptyQueue
    vi.mocked(sendMessage).mockResolvedValueOnce(payload)

    const request = { surface: 'popup' as const }
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useTodayQueue(request), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sendMessage).toHaveBeenCalledWith('queue.getTodayQueue', request)
    expect(result.current.data).toEqual(payload)
  })

  it('forwards the optional at parameter in the request', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(emptyQueue)
    const at = '2026-01-15T12:00:00.000Z'
    const request = { surface: 'popup' as const, at }
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useTodayQueue(request), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sendMessage).toHaveBeenCalledWith('queue.getTodayQueue', {
      surface: 'popup',
      at,
    })
  })

  it('requests explicit extra practice and rejects a malformed response', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({ items: [] } as never)
    const request = {
      surface: 'popup' as const,
      intent: 'extra-practice' as const,
    }
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useTodayQueue(request), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(sendMessage).toHaveBeenCalledWith('queue.getTodayQueue', request)
  })
})

const emptyQueue = todayQueueSchema.parse({
  generatedAt: '2026-01-01T12:00:00.000Z',
  dueCount: 0,
  dueToday: 0,
  newCount: 0,
  newAvailable: 0,
  queueLoad: 0,
  reinforcementCount: 0,
  excludedCount: 0,
  recommendationReason: null,
  items: [],
  topRecommendation: null,
})
