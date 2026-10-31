import { beforeEach, expect, it, vi } from 'vitest'
import { generateJson } from '@/lib/ai'
import * as services from './index'
import {
  makeAnalysisRequest,
  makeValidFeedback,
  makeValidAnalysis,
} from '../testing/code-analysis-fixtures'
vi.mock('@/lib/ai', () => ({ generateJson: vi.fn() }))
beforeEach(() => vi.mocked(generateJson).mockReset())
it('generates only a complete implementation from the immutable assessed submission and feedback', async () => {
  expect(services.generateCodeImplementation).toBeTypeOf('function')
  const request = {
    surface: 'content-script' as const,
    requestId: 'code-1',
    assessmentRequestId: 'request-1',
    host: 'leetcode.com' as const,
    assessment: makeAnalysisRequest(),
    feedback: makeValidFeedback(),
  }
  const report = {
    version: 'leetcode-code-implementation-v1' as const,
    status: 'ready' as const,
    implementation: makeValidAnalysis().suggestedImplementation!,
  }
  vi.mocked(generateJson).mockResolvedValue({
    status: 'success',
    data: report,
    providerMetadata: { provider: 'gemini', model: 'fixture', durationMs: 1 },
  })
  expect(
    await services.generateCodeImplementation(
      request,
      { provider: 'gemini', model: 'fixture', apiKey: 'fixture' },
      new AbortController().signal,
      1234,
    ),
  ).toMatchObject({ status: 'success', data: report })
  const call = vi.mocked(generateJson).mock.calls[0]![0]
  expect(call).toMatchObject({
    timeoutMs: 1234,
    collectMetrics: true,
    retryTransientErrors: true,
  })
  expect(JSON.parse(call.prompt.user)).toMatchObject({
    problem: request.assessment.problem,
    feedback: request.feedback,
    submission: { code: request.assessment.submission.code },
  })
  expect(call.prompt.system).toContain('Do not produce scores')
  expect(
    call.schema.safeParse({ ...report, summary: 'Another assessment' }).success,
  ).toBe(false)
  expect(generateJson).toHaveBeenCalledTimes(1)
})
it('rejects a wrong implementation language without another generation', async () => {
  expect(services.generateCodeImplementation).toBeTypeOf('function')
  const implementation = {
    ...makeValidAnalysis().suggestedImplementation!,
    language: 'Kotlin',
  }
  vi.mocked(generateJson).mockResolvedValue({
    status: 'success',
    data: {
      version: 'leetcode-code-implementation-v1',
      status: 'ready',
      implementation,
    },
    providerMetadata: { provider: 'gemini', model: 'fixture', durationMs: 1 },
  })
  expect(
    await services.generateCodeImplementation(
      {
        surface: 'content-script',
        requestId: 'code-1',
        assessmentRequestId: 'request-1',
        host: 'leetcode.com',
        assessment: makeAnalysisRequest(),
        feedback: makeValidFeedback(),
      },
      { provider: 'gemini', model: 'fixture', apiKey: 'fixture' },
      new AbortController().signal,
      1000,
    ),
  ).toMatchObject({ status: 'error', code: 'invalid-output' })
  expect(generateJson).toHaveBeenCalledTimes(1)
})

it('rejects claims of execution while leaving raw inert code untouched', async () => {
  const implementation = {
    ...makeValidAnalysis().suggestedImplementation!,
    changes: ['I tested this code against all cases.'],
  }
  vi.mocked(generateJson).mockResolvedValue({
    status: 'success',
    data: {
      version: 'leetcode-code-implementation-v1',
      status: 'ready',
      implementation,
    },
    providerMetadata: { provider: 'gemini', model: 'fixture', durationMs: 1 },
  })
  expect(
    await services.generateCodeImplementation(
      {
        surface: 'content-script',
        requestId: 'code-1',
        assessmentRequestId: 'request-1',
        host: 'leetcode.com',
        assessment: makeAnalysisRequest(),
        feedback: makeValidFeedback(),
      },
      { provider: 'gemini', model: 'fixture', apiKey: 'fixture' },
      new AbortController().signal,
      1000,
    ),
  ).toMatchObject({ status: 'error', code: 'invalid-output' })
})
