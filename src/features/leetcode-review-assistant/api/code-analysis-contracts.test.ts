import { describe, expect, it } from 'vitest'

import {
  makeAnalysisRequest,
  makeValidAnalysis,
} from '../testing/code-analysis-fixtures'
import {
  analysisIdentity,
  analyzeLeetCodeSubmissionRequestSchema,
  analyzeLeetCodeSubmissionResponseSchema,
  cancelLeetCodeAnalysisRequestSchema,
  cancelLeetCodeAnalysisResponseSchema,
} from './code-analysis-contracts'

describe('code analysis contracts', () => {
  it.each([
    'accepted',
    'wrong-answer',
    'runtime-error',
    'compile-error',
    'time-limit-exceeded',
    'memory-limit-exceeded',
    'output-limit-exceeded',
    'unknown',
  ] as const)('accepts terminal status %s with complete input', (status) => {
    const request = makeAnalysisRequest()
    request.submission.status = status
    expect(analyzeLeetCodeSubmissionRequestSchema.parse(request)).toEqual(
      request,
    )
  })

  it('preserves request identities and complete source whitespace', () => {
    const request = makeAnalysisRequest()
    request.requestId = ' request-1 '
    request.attemptId = ' attempt-1 '
    request.problem.title = ' Two Sum '
    request.submission.language = ' JavaScript '
    request.submission.code = '\n  ' + request.submission.code + '\n '
    request.problem.statement = '\n  ' + request.problem.statement + '\n '
    expect(analyzeLeetCodeSubmissionRequestSchema.parse(request)).toEqual(
      request,
    )
    expect(analysisIdentity(request)).toEqual({
      requestId: request.requestId,
      attemptId: request.attemptId,
      submissionId: request.submissionId,
      problemSlug: request.problemSlug,
      configurationRevision: request.configurationRevision,
    })
  })

  it.each(['requestId', 'attemptId'] as const)(
    'rejects blank or oversized %s',
    (field) => {
      for (const value of ['', ' \n\t ', 'x'.repeat(161)]) {
        expect(
          analyzeLeetCodeSubmissionRequestSchema.safeParse({
            ...makeAnalysisRequest(),
            [field]: value,
          }).success,
        ).toBe(false)
      }
    },
  )

  it.each([
    { submissionId: 'no-id' },
    { submissionId: '' },
    { configurationRevision: -1 },
    { configurationRevision: 1.2 },
    { problemSlug: 'another-problem' },
    { surface: 'dashboard' },
  ])('rejects invalid identity %j', (change) => {
    expect(
      analyzeLeetCodeSubmissionRequestSchema.safeParse({
        ...makeAnalysisRequest(),
        ...change,
      }).success,
    ).toBe(false)
  })

  it('rejects missing identity fields', () => {
    for (const key of [
      'requestId',
      'attemptId',
      'submissionId',
      'problemSlug',
      'configurationRevision',
    ]) {
      const request: Record<string, unknown> = { ...makeAnalysisRequest() }
      delete request[key]
      expect(
        analyzeLeetCodeSubmissionRequestSchema.safeParse(request).success,
      ).toBe(false)
    }
  })

  it('rejects blank or oversized essential inputs without truncation', () => {
    const request = makeAnalysisRequest()
    for (const code of ['', ' \n\t', 'x'.repeat(32001)]) {
      expect(
        analyzeLeetCodeSubmissionRequestSchema.safeParse({
          ...request,
          submission: { ...request.submission, code },
        }).success,
      ).toBe(false)
    }
    for (const statement of ['', ' \n\t', 'x'.repeat(24001)]) {
      expect(
        analyzeLeetCodeSubmissionRequestSchema.safeParse({
          ...request,
          problem: { ...request.problem, statement },
        }).success,
      ).toBe(false)
    }
    expect(
      analyzeLeetCodeSubmissionRequestSchema.safeParse({
        ...request,
        submission: { ...request.submission, code: 'x'.repeat(32000) },
      }).success,
    ).toBe(true)
  })

  it('measures the combined serialized problem including topic labels and escapes', () => {
    const request = makeAnalysisRequest()
    expect(
      analyzeLeetCodeSubmissionRequestSchema.safeParse({
        ...request,
        problem: {
          ...request.problem,
          statement: 'x'.repeat(24000),
          followUps: ['x'],
        },
      }).success,
    ).toBe(false)
    request.problem.statement = 'x'
    request.problem.examples = []
    request.problem.constraints = []
    request.problem.followUps = []
    const overhead = JSON.stringify(request.problem).length - 1
    request.problem.statement = 'x'.repeat(24000 - overhead)
    expect(JSON.stringify(request.problem)).toHaveLength(24000)
    expect(
      analyzeLeetCodeSubmissionRequestSchema.safeParse(request).success,
    ).toBe(true)
    request.problem.topics.push('extra topic')
    expect(
      analyzeLeetCodeSubmissionRequestSchema.safeParse(request).success,
    ).toBe(false)
    request.problem = {
      ...makeAnalysisRequest().problem,
      statement: '\n'.repeat(12000),
    }
    expect(
      analyzeLeetCodeSubmissionRequestSchema.safeParse(request).success,
    ).toBe(false)
  })

  it('rejects whitespace-only title and language', () => {
    const request = makeAnalysisRequest()
    expect(
      analyzeLeetCodeSubmissionRequestSchema.safeParse({
        ...request,
        problem: { ...request.problem, title: ' \n\t ' },
      }).success,
    ).toBe(false)
    expect(
      analyzeLeetCodeSubmissionRequestSchema.safeParse({
        ...request,
        submission: { ...request.submission, language: ' \n\t ' },
      }).success,
    ).toBe(false)
  })

  it('bounds every diagnostic independently and requires nullable keys', () => {
    const request = makeAnalysisRequest()
    for (const key of Object.keys(request.submission.diagnostics)) {
      const diagnostics = {
        ...request.submission.diagnostics,
        [key]: 'x'.repeat(2000),
      }
      expect(
        analyzeLeetCodeSubmissionRequestSchema.safeParse({
          ...request,
          submission: { ...request.submission, diagnostics },
        }).success,
      ).toBe(true)
      diagnostics[key as keyof typeof diagnostics] = 'x'.repeat(2001)
      expect(
        analyzeLeetCodeSubmissionRequestSchema.safeParse({
          ...request,
          submission: { ...request.submission, diagnostics },
        }).success,
      ).toBe(false)
      const missing: Record<string, unknown> = {
        ...request.submission.diagnostics,
      }
      delete missing[key]
      expect(
        analyzeLeetCodeSubmissionRequestSchema.safeParse({
          ...request,
          submission: { ...request.submission, diagnostics: missing },
        }).success,
      ).toBe(false)
    }
  })

  it('rejects credential, owner, recall, and nested extra fields', () => {
    const request = makeAnalysisRequest()
    for (const extra of [
      { apiKey: 'fixture-secret' },
      { owner: '1:0' },
      { timing: { elapsedSeconds: 5 } },
      { sessionContext: {} },
      { deterministicDecision: { rating: 'easy' } },
    ]) {
      expect(
        analyzeLeetCodeSubmissionRequestSchema.safeParse({
          ...request,
          ...extra,
        }).success,
      ).toBe(false)
    }
    for (const value of [
      { ...request, problem: { ...request.problem, extra: true } },
      {
        ...request,
        submission: { ...request.submission, apiKey: 'fixture-secret' },
      },
      {
        ...request,
        submission: {
          ...request.submission,
          diagnostics: { ...request.submission.diagnostics, extra: true },
        },
      },
    ])
      expect(
        analyzeLeetCodeSubmissionRequestSchema.safeParse(value).success,
      ).toBe(false)
  })

  it('bounds context collections and observation fields', () => {
    const request = makeAnalysisRequest()
    for (const [field, count] of [
      ['topics', 41],
      ['examples', 51],
      ['constraints', 101],
      ['followUps', 31],
    ] as const) {
      expect(
        analyzeLeetCodeSubmissionRequestSchema.safeParse({
          ...request,
          problem: {
            ...request.problem,
            [field]: Array.from({ length: count }, () => 'x'),
          },
        }).success,
      ).toBe(false)
    }
    expect(
      analyzeLeetCodeSubmissionRequestSchema.safeParse({
        ...request,
        submission: {
          ...request.submission,
          omittedDiagnostics: Array(9).fill('x'),
        },
      }).success,
    ).toBe(false)
    for (const field of ['languageVersion', 'runtime', 'memory'] as const) {
      expect(
        analyzeLeetCodeSubmissionRequestSchema.safeParse({
          ...request,
          submission: { ...request.submission, [field]: 'x'.repeat(121) },
        }).success,
      ).toBe(false)
    }
    expect(
      analyzeLeetCodeSubmissionRequestSchema.safeParse({
        ...request,
        submission: { ...request.submission, passedTestCount: -1 },
      }).success,
    ).toBe(false)
  })

  it('parses strict ready, unavailable, and controlled-error envelopes', () => {
    const identity = analysisIdentity(makeAnalysisRequest())
    const responses = [
      {
        status: 'ready',
        ...identity,
        report: makeValidAnalysis(),
        providerMetadata: {
          provider: 'gemini',
          model: 'fixture-model',
          durationMs: 10,
        },
      },
      {
        status: 'unavailable',
        ...identity,
        reason: 'capture',
        message: 'Full code is unavailable.',
      },
      {
        status: 'error',
        ...identity,
        code: 'stale-configuration',
        message: 'Retry with the saved connection.',
      },
    ]
    for (const response of responses) {
      expect(analyzeLeetCodeSubmissionResponseSchema.parse(response)).toEqual(
        response,
      )
      expect(
        analyzeLeetCodeSubmissionResponseSchema.safeParse({
          ...response,
          apiKey: 'fixture-secret',
        }).success,
      ).toBe(false)
      expect(
        analyzeLeetCodeSubmissionResponseSchema.safeParse({
          ...response,
          requestId: ' ',
        }).success,
      ).toBe(false)
    }
    expect(
      analyzeLeetCodeSubmissionResponseSchema.safeParse({
        ...responses[2],
        code: 'raw-provider-error',
      }).success,
    ).toBe(false)
    expect(
      analyzeLeetCodeSubmissionResponseSchema.safeParse({
        ...responses[1],
        message: 'x'.repeat(401),
      }).success,
    ).toBe(false)
  })

  it('validates cancellation without accepting a claimed owner', () => {
    expect(
      cancelLeetCodeAnalysisRequestSchema.parse({
        surface: 'content-script',
        requestId: ' request-1 ',
      }),
    ).toEqual({ surface: 'content-script', requestId: ' request-1 ' })
    for (const value of [
      { surface: 'content-script', requestId: ' ' },
      { surface: 'dashboard', requestId: 'request-1' },
      { surface: 'content-script', requestId: 'request-1', owner: '1:0' },
    ])
      expect(cancelLeetCodeAnalysisRequestSchema.safeParse(value).success).toBe(
        false,
      )
    expect(
      cancelLeetCodeAnalysisResponseSchema.parse({
        requestId: 'request-1',
        cancelled: false,
      }),
    ).toEqual({ requestId: 'request-1', cancelled: false })
    expect(
      cancelLeetCodeAnalysisResponseSchema.safeParse({
        requestId: 'request-1',
        cancelled: false,
        report: {},
      }).success,
    ).toBe(false)
  })
})
