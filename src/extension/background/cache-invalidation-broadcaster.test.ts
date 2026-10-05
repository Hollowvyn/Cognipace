import { beforeEach, describe, expect, it, vi } from 'vitest'

import { broadcastCacheInvalidation } from './cache-invalidation-broadcaster'

const analysisMocks = vi.hoisted(() => ({
  abortLeetCodeAnalyses: vi.fn(),
  abortLeetCodeHints: vi.fn(),
}))
vi.mock('./leetcode-analysis-operations', () => analysisMocks)
const hintConnectionMocks = vi.hoisted(() => ({
  resetAiHintConnectionRevisions: vi.fn(),
}))
vi.mock(
  '@/features/genai/server/genai-settings-service',
  () => hintConnectionMocks,
)

type LeetCodeTab = { id?: number | undefined }

type TabsQuery = (queryInfo: { url: string[] }) => Promise<LeetCodeTab[]>

type RuntimeSendMessage =
  (typeof import('@/extension/messaging'))['sendMessage']

const browserMocks = vi.hoisted(() => ({
  tabsQuery: vi.fn<TabsQuery>(),
}))

const messagingMocks = vi.hoisted(() => ({
  sendMessage: vi.fn<RuntimeSendMessage>(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      query: browserMocks.tabsQuery,
    },
  },
}))

vi.mock('@/extension/messaging', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/extension/messaging')>()

  return {
    ...actual,
    sendMessage: messagingMocks.sendMessage,
  }
})

describe('cache invalidation broadcaster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    messagingMocks.sendMessage.mockResolvedValue(null)
    browserMocks.tabsQuery.mockResolvedValue([{ id: 10 }, { id: 20 }, {}])
  })

  it('aborts analyses synchronously before an unresolved GenAI broadcast', async () => {
    let finish!: (value: null) => void
    messagingMocks.sendMessage.mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          finish = resolve
        }),
    )
    browserMocks.tabsQuery.mockResolvedValue([])
    const pending = broadcastCacheInvalidation({
      reason: 'genai-updated',
      source: 'dashboard',
      tags: ['genai'],
    })
    expect(analysisMocks.abortLeetCodeAnalyses).toHaveBeenCalledTimes(1)
    expect(
      analysisMocks.abortLeetCodeAnalyses.mock.invocationCallOrder[0],
    ).toBeLessThan(messagingMocks.sendMessage.mock.invocationCallOrder[0]!)
    finish(null)
    await pending
  })

  it('leaves analyses active for unrelated invalidation tags', async () => {
    await broadcastCacheInvalidation({
      reason: 'settings-updated',
      source: 'dashboard',
      tags: ['settings'],
    })
    expect(analysisMocks.abortLeetCodeAnalyses).not.toHaveBeenCalled()
  })

  it('preserves hints for enabled-only changes while aborting reports', async () => {
    await broadcastCacheInvalidation({
      reason: 'settings-updated',
      source: 'dashboard',
      tags: ['genai'],
      hintConnectionChanged: false,
    })
    expect(analysisMocks.abortLeetCodeAnalyses).toHaveBeenCalledTimes(1)
    expect(analysisMocks.abortLeetCodeHints).not.toHaveBeenCalled()
  })

  it('aborts only the changed provider and omits background controls from the wire', async () => {
    const event = await broadcastCacheInvalidation({
      reason: 'genai-updated',
      source: 'dashboard',
      tags: ['genai'],
      hintProvider: 'gemini',
      hintConnectionChanged: true,
    })
    expect(analysisMocks.abortLeetCodeHints).toHaveBeenCalledExactlyOnceWith(
      'gemini',
    )
    expect(event).not.toHaveProperty('hintProvider')
    expect(event).not.toHaveProperty('hintConnectionChanged')
    for (const call of messagingMocks.sendMessage.mock.calls) {
      expect(call[1]).not.toHaveProperty('hintProvider')
      expect(call[1]).not.toHaveProperty('hintConnectionChanged')
    }
  })

  it('resets revisions and aborts both operations before reset broadcasts', async () => {
    const event = await broadcastCacheInvalidation({
      reason: 'problem-catalog-updated',
      source: 'dashboard',
      tags: ['genai'],
      hintConnectionReset: true,
    })
    expect(
      hintConnectionMocks.resetAiHintConnectionRevisions,
    ).toHaveBeenCalledTimes(1)
    expect(analysisMocks.abortLeetCodeAnalyses).toHaveBeenCalledTimes(1)
    expect(analysisMocks.abortLeetCodeHints).toHaveBeenCalledExactlyOnceWith(
      undefined,
    )
    for (const mock of [
      hintConnectionMocks.resetAiHintConnectionRevisions,
      analysisMocks.abortLeetCodeAnalyses,
      analysisMocks.abortLeetCodeHints,
    ])
      expect(mock.mock.invocationCallOrder[0]).toBeLessThan(
        messagingMocks.sendMessage.mock.invocationCallOrder[0]!,
      )
    expect(event).not.toHaveProperty('hintConnectionReset')
    for (const call of messagingMocks.sendMessage.mock.calls)
      expect(call[1]).not.toHaveProperty('hintConnectionReset')
  })

  it('rejects malformed events before cancelling work', async () => {
    await expect(
      broadcastCacheInvalidation({
        reason: 'genai-updated',
        source: 'dashboard',
        tags: ['genai', 'invalid' as never],
      }),
    ).rejects.toThrow()
    expect(analysisMocks.abortLeetCodeAnalyses).not.toHaveBeenCalled()
  })

  it('broadcasts typed cache invalidation events to extension pages and LeetCode tabs', async () => {
    const input = {
      problemSlug: 'two-sum',
      reason: 'practice-updated',
      source: 'content-script',
      tags: ['practice', 'queue', 'app-shell'],
    } as const
    const event = await broadcastCacheInvalidation({
      ...input,
      tags: [...input.tags],
    })
    expect(event).toMatchObject(input)
    expect(messagingMocks.sendMessage).toHaveBeenCalledWith(
      'cache.invalidate',
      expect.objectContaining(input),
    )
    expect(browserMocks.tabsQuery).toHaveBeenCalledWith({
      url: [
        'https://leetcode.com/problems/*',
        'https://www.leetcode.com/problems/*',
      ],
    })
    for (const tabId of [10, 20])
      expect(messagingMocks.sendMessage).toHaveBeenCalledWith(
        'cache.invalidate',
        expect.objectContaining(input),
        tabId,
      )
  })

  it('does not fail the source mutation when no surface can receive the event', async () => {
    messagingMocks.sendMessage.mockRejectedValue(new Error('No receiver'))
    browserMocks.tabsQuery.mockRejectedValueOnce(
      new Error('Missing tabs access'),
    )

    await expect(
      broadcastCacheInvalidation({
        reason: 'settings-updated',
        source: 'popup',
        tags: ['settings'],
      }),
    ).resolves.toMatchObject({
      reason: 'settings-updated',
    })
  })
})
