import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/extension/messaging', () => ({ sendMessage: sendMessageMock }))

import {
  generateLeetCodeHintsViaRuntime,
  cancelLeetCodeHintsViaRuntime,
} from './code-hint-api'
import { type GenerateLeetCodeHintsRequest } from './code-hint-contracts'

const problem = {
  host: 'leetcode.com' as const,
  slug: 'two-sum',
  title: 'Two Sum',
  statement: 'Find two indices.',
  examples: ['[2,7], target 9'],
  constraints: ['2 <= nums.length'],
}
const request: GenerateLeetCodeHintsRequest = {
  surface: 'content-script',
  requestId: 'hint-1',
  problem,
  snapshot: { code: '', language: 'javascript', capturedAt: 0 },
  history: [],
  connectionRevision: '00000000-0000-4000-8000-000000000001',
  connectionProvider: 'gemini',
}
const response = {
  status: 'ready' as const,
  requestId: request.requestId,
  hint: { text: 'Think about lookup.', strength: 'light', progress: 'initial' },
}

beforeEach(() => sendMessageMock.mockReset())

describe('direct hint runtime API', () => {
  it('sends generation directly and validates its response', async () => {
    sendMessageMock.mockResolvedValue(response)
    expect(await generateLeetCodeHintsViaRuntime(request)).toEqual(response)
    expect(sendMessageMock).toHaveBeenCalledExactlyOnceWith(
      'genai.generateLeetCodeHints',
      request,
    )
    sendMessageMock.mockResolvedValue({ ...response, private: 'secret' })
    await expect(generateLeetCodeHintsViaRuntime(request)).rejects.toThrow()
  })
  it('uses dedicated strict cancellation contracts', async () => {
    const cancellation = {
      surface: 'content-script' as const,
      requestId: 'hint-1',
    }
    const result = { requestId: 'hint-1', cancelled: true }
    sendMessageMock.mockResolvedValue(result)
    expect(await cancelLeetCodeHintsViaRuntime(cancellation)).toEqual(result)
    expect(sendMessageMock).toHaveBeenCalledExactlyOnceWith(
      'genai.cancelLeetCodeHints',
      cancellation,
    )
    sendMessageMock.mockResolvedValue({ ...result, private: 'secret' })
    await expect(cancelLeetCodeHintsViaRuntime(cancellation)).rejects.toThrow()
  })
})
