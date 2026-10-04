import { describe, expect, it } from 'vitest'

import {
  makeAnalysisRequest,
  makeValidAnalysis,
} from '../testing/code-analysis-fixtures'
import {
  analysisIdentity,
  analyzeLeetCodeSubmissionRequestSchema as requestSchema,
  analyzeLeetCodeSubmissionResponseSchema as responseSchema,
  cancelLeetCodeAnalysisRequestSchema as cancelRequestSchema,
  cancelLeetCodeAnalysisResponseSchema as cancelResponseSchema,
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
    expect(requestSchema.parse(request)).toEqual(request)
  })

  it('preserves request identities and complete source whitespace', () => {
    const request = makeAnalysisRequest()
    request.requestId = ' request-1 '
    request.attemptId = ' attempt-1 '
    request.problem.title = ' Two Sum '
    request.submission.language = ' JavaScript '
    request.submission.code = '\n  ' + request.submission.code + '\n '
    request.problem.statement = '\n  ' + request.problem.statement + '\n '
    expect(requestSchema.parse(request)).toEqual(request)
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
        const request = makeAnalysisRequest()
        request[field] = value
        expect(requestSchema.safeParse(request).success).toBe(false)
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
    const request = { ...makeAnalysisRequest(), ...change }
    expect(requestSchema.safeParse(request).success).toBe(false)
  })

  it('rejects missing identity fields', () => {
    for (const key of [
      'requestId',
      'attemptId',
      'submissionId',
      'problemSlug',
      'configurationRevision',
    ]) {
      const request = makeAnalysisRequest()
      Reflect.deleteProperty(request, key)
      expect(requestSchema.safeParse(request).success).toBe(false)
    }
  })

  it('rejects blank or oversized essential inputs without truncation', () => {
    for (const [code, statement] of [
      ['', null],
      [' \n\t', null],
      ['x'.repeat(32001), null],
      [null, ''],
      [null, ' \n\t'],
      [null, 'x'.repeat(24001)],
    ]) {
      const request = makeAnalysisRequest()
      if (code !== null) request.submission.code = code!
      if (statement !== null) request.problem.statement = statement!
      expect(requestSchema.safeParse(request).success).toBe(false)
    }
    const request = makeAnalysisRequest()
    request.submission.code = 'x'.repeat(32000)
    expect(requestSchema.safeParse(request).success).toBe(true)
  })

  it('measures the combined serialized problem including topic labels and escapes', () => {
    const request = makeAnalysisRequest()
    request.problem.statement = 'x'.repeat(24000)
    request.problem.followUps = ['x']
    expect(requestSchema.safeParse(request).success).toBe(false)
    request.problem.statement = 'x'
    request.problem.examples = []
    request.problem.constraints = []
    request.problem.followUps = []
    const overhead = JSON.stringify(request.problem).length - 1
    request.problem.statement = 'x'.repeat(24000 - overhead)
    expect(JSON.stringify(request.problem)).toHaveLength(24000)
    expect(requestSchema.safeParse(request).success).toBe(true)
    request.problem.topics.push('extra topic')
    expect(requestSchema.safeParse(request).success).toBe(false)
    request.problem = {
      ...makeAnalysisRequest().problem,
      statement: '\n'.repeat(12000),
    }
    expect(requestSchema.safeParse(request).success).toBe(false)
  })

  it('rejects whitespace-only title and language', () => {
    for (const field of ['title', 'language']) {
      const request = makeAnalysisRequest()
      if (field === 'title') request.problem.title = ' \n\t '
      else request.submission.language = ' \n\t '
      expect(requestSchema.safeParse(request).success).toBe(false)
    }
  })

  it('bounds every diagnostic independently and requires nullable keys', () => {
    for (const key of Object.keys(
      makeAnalysisRequest().submission.diagnostics,
    )) {
      const request = makeAnalysisRequest()
      Reflect.set(request.submission.diagnostics, key, 'x'.repeat(2000))
      expect(requestSchema.safeParse(request).success).toBe(true)
      Reflect.set(request.submission.diagnostics, key, 'x'.repeat(2001))
      expect(requestSchema.safeParse(request).success).toBe(false)
      Reflect.deleteProperty(request.submission.diagnostics, key)
      expect(requestSchema.safeParse(request).success).toBe(false)
    }
  })

  it('rejects credential, owner, recall, and nested extra fields', () => {
    for (const extra of [
      { apiKey: 'fixture-secret' },
      { owner: '1:0' },
      { timing: { elapsedSeconds: 5 } },
      { sessionContext: {} },
      { deterministicDecision: { rating: 'easy' } },
    ]) {
      const request = Object.assign(makeAnalysisRequest(), extra)
      expect(requestSchema.safeParse(request).success).toBe(false)
    }
    for (const field of ['problem', 'submission', 'diagnostics'] as const) {
      const request = makeAnalysisRequest()
      if (field === 'diagnostics')
        Object.assign(request.submission.diagnostics, { extra: true })
      else
        Object.assign(
          request[field],
          field === 'submission'
            ? { apiKey: 'fixture-secret' }
            : { extra: true },
        )
      expect(requestSchema.safeParse(request).success).toBe(false)
    }
  })

  it('bounds context collections and observation fields', () => {
    for (const [field, count] of [
      ['topics', 41],
      ['examples', 51],
      ['constraints', 101],
      ['followUps', 31],
    ] as const) {
      const request = makeAnalysisRequest()
      request.problem[field] = Array<string>(count).fill('x')
      expect(requestSchema.safeParse(request).success).toBe(false)
    }
    const request = makeAnalysisRequest()
    request.submission.omittedDiagnostics = Array<string>(9).fill('x')
    expect(requestSchema.safeParse(request).success).toBe(false)
    for (const field of ['languageVersion', 'runtime', 'memory'] as const) {
      const request = makeAnalysisRequest()
      request.submission[field] = 'x'.repeat(121)
      expect(requestSchema.safeParse(request).success).toBe(false)
    }
    request.submission.omittedDiagnostics = []
    request.submission.passedTestCount = -1
    expect(requestSchema.safeParse(request).success).toBe(false)
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
      expect(responseSchema.parse(response)).toEqual(response)
      for (const extra of [{ apiKey: 'fixture-secret' }, { requestId: ' ' }])
        expect(
          responseSchema.safeParse({
            ...response,
            ...extra,
          }).success,
        ).toBe(false)
    }
    for (const response of [
      { ...responses[2], code: 'raw-provider-error' },
      { ...responses[1], message: 'x'.repeat(401) },
    ])
      expect(responseSchema.safeParse(response).success).toBe(false)
  })

  it('validates cancellation without accepting a claimed owner', () => {
    const request = { surface: 'content-script', requestId: ' request-1 ' }
    expect(cancelRequestSchema.parse(request)).toEqual(request)
    for (const value of [
      { surface: 'content-script', requestId: ' ' },
      { surface: 'dashboard', requestId: 'request-1' },
      { surface: 'content-script', requestId: 'request-1', owner: '1:0' },
    ])
      expect(cancelRequestSchema.safeParse(value).success).toBe(false)
    const response = { requestId: 'request-1', cancelled: false }
    expect(cancelResponseSchema.parse(response)).toEqual(response)
    expect(
      cancelResponseSchema.safeParse({
        ...response,
        report: {},
      }).success,
    ).toBe(false)
  })
})
