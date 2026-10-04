import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/extension/messaging', () => ({ sendMessage: sendMessageMock }))

import {
  makeAnalysisRequest,
  makeValidAnalysis,
} from '../testing/code-analysis-fixtures'
import {
  analyzeLeetCodeSubmissionViaRuntime,
  cancelLeetCodeAnalysisViaRuntime,
} from './code-analysis-api'
import { analysisIdentity } from './code-analysis-contracts'

const readyResponse = {
  status: 'ready' as const,
  ...analysisIdentity(makeAnalysisRequest()),
  report: makeValidAnalysis(),
  providerMetadata: {
    provider: 'gemini' as const,
    model: 'fixture-model',
    durationMs: 1,
  },
}

beforeEach(() => sendMessageMock.mockReset())

describe('code analysis direct runtime API', () => {
  it('sends one direct analysis request and parses the report envelope', async () => {
    const request = makeAnalysisRequest()
    sendMessageMock.mockResolvedValue(readyResponse)
    expect(await analyzeLeetCodeSubmissionViaRuntime(request)).toEqual(
      readyResponse,
    )
    expect(sendMessageMock).toHaveBeenCalledExactlyOnceWith(
      'genai.analyzeLeetCodeSubmission',
      request,
    )
  })

  it('rejects unchecked provider output and response extras', async () => {
    const request = makeAnalysisRequest()
    sendMessageMock.mockResolvedValue({
      ...readyResponse,
      apiKey: 'fixture-secret',
    })
    await expect(analyzeLeetCodeSubmissionViaRuntime(request)).rejects.toThrow()
  })

  it('sends and parses explicit cancellation', async () => {
    const request = {
      surface: 'content-script' as const,
      requestId: 'request-1',
    }
    const response = { requestId: request.requestId, cancelled: true }
    sendMessageMock.mockResolvedValue(response)
    expect(await cancelLeetCodeAnalysisViaRuntime(request)).toEqual(response)
    expect(sendMessageMock).toHaveBeenCalledExactlyOnceWith(
      'genai.cancelLeetCodeAnalysis',
      request,
    )
    sendMessageMock.mockResolvedValue({
      requestId: request.requestId,
      cancelled: 'yes',
    })
    await expect(cancelLeetCodeAnalysisViaRuntime(request)).rejects.toThrow()
  })
})
