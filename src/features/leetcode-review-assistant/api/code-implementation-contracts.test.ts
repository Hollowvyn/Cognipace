import { describe, expect, it } from 'vitest'
import {
  generateLeetCodeImplementationRequestSchema,
  generateLeetCodeImplementationResponseSchema,
  implementationIdentity,
} from './code-implementation-contracts'
import { codeFeedbackSchema } from '../domain/code-feedback-schema'
import {
  makeAnalysisRequest,
  makeValidFeedback,
  makeValidAnalysis,
} from '../testing/code-analysis-fixtures'
const request = () => ({
  surface: 'content-script' as const,
  requestId: 'code-1',
  assessmentRequestId: 'request-1',
  host: 'leetcode.com' as const,
  assessment: makeAnalysisRequest(),
  feedback: makeValidFeedback(),
})
describe('strict explicit implementation contracts', () => {
  it('accepts a self-contained immutable assessment with consistent validated feedback and supported host', () => {
    const original = request()
    expect(generateLeetCodeImplementationRequestSchema.parse(original)).toEqual(
      original,
    )
    expect(
      generateLeetCodeImplementationRequestSchema.safeParse({
        ...original,
        host: 'www.leetcode.com',
      }).success,
    ).toBe(true)
    expect(
      generateLeetCodeImplementationRequestSchema.safeParse({
        ...original,
        host: 'leetcode.cn',
      }).success,
    ).toBe(false)
  })
  it('rejects legacy full reports in feedback-only contracts', () => {
    expect(codeFeedbackSchema.safeParse(makeValidAnalysis()).success).toBe(
      false,
    )
    expect(
      codeFeedbackSchema.safeParse({
        ...makeValidFeedback(),
        suggestedImplementation: null,
      }).success,
    ).toBe(false)
  })
  it.each(['request', 'assessment', 'slug', 'feedback', 'extra'] as const)(
    'rejects mismatched %s context',
    (kind) => {
      const value: Record<string, unknown> = request()
      if (kind === 'request') value.requestId = 'request-1'
      if (kind === 'assessment') value.assessmentRequestId = 'other-assessment'
      if (kind === 'slug')
        value.assessment = {
          ...makeAnalysisRequest(),
          problemSlug: 'another-problem',
        }
      if (kind === 'feedback')
        value.feedback = {
          ...makeValidFeedback(),
          approach: { ...makeValidFeedback().approach, score: 5 },
        }
      if (kind === 'extra') value.apiKey = 'forbidden'
      expect(
        generateLeetCodeImplementationRequestSchema.safeParse(value).success,
      ).toBe(false)
    },
  )
  it('binds ready and responsible unavailable results to every original assessment identity', () => {
    const value = request()
    const identity = implementationIdentity(value)
    expect(identity).toEqual({
      requestId: 'code-1',
      assessmentRequestId: 'request-1',
      attemptId: 'attempt-1',
      submissionId: '1234567890',
      problemSlug: 'two-sum',
      configurationRevision: 0,
    })
    const response = {
      status: 'ready',
      ...identity,
      report: {
        version: 'leetcode-code-implementation-v1',
        status: 'unavailable',
        reason: 'No responsible complete signature is available.',
      },
      providerMetadata: { provider: 'gemini', model: 'fixture', durationMs: 1 },
    }
    expect(
      generateLeetCodeImplementationResponseSchema.safeParse(response).success,
    ).toBe(true)
    expect(
      generateLeetCodeImplementationResponseSchema.safeParse({
        ...response,
        feedback: makeValidFeedback(),
      }).success,
    ).toBe(false)
  })
})
