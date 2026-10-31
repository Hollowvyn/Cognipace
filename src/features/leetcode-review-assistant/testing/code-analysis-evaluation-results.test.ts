import { describe, expect, it } from 'vitest'

import { makeValidAnalysis } from './code-analysis-fixtures'
import {
  projectEvaluationResult,
  summarizeEvaluationResults,
} from './code-analysis-evaluation-results'

const metadata = {
  provider: 'openrouter' as const,
  model: 'openrouter/free',
  durationMs: 1500,
  resolvedModel: 'served/model:free',
  apiKey: 'private-secret',
}
const context = {
  fixtureId: 'fixture',
  checkedAt: '2031-01-01T00:00:00Z',
  provider: 'openrouter' as const,
  model: 'openrouter/free',
}

describe('safe evaluation artifacts', () => {
  it('projects success to an explicit allowlist with a validated report', () => {
    const report = makeValidAnalysis()
    expect(
      projectEvaluationResult(context, {
        status: 'success',
        data: report,
        providerMetadata: metadata,
      }),
    ).toEqual({
      ...context,
      durationMs: 1500,
      resolvedModel: 'served/model:free',
      status: 'success',
      report,
    })
  })
  it('projects failure without keys, raw errors, messages or extra metadata', () => {
    const artifact = projectEvaluationResult(context, {
      status: 'error',
      code: 'billing',
      message: 'private-secret',
      providerMetadata: metadata,
    })
    expect(artifact).toEqual({
      ...context,
      durationMs: 1500,
      status: 'error',
      code: 'billing',
    })
    expect(JSON.stringify(artifact)).not.toContain('private-secret')
  })
  it('rejects an invalid success report and bounds resolved model metadata', () => {
    const invalid = projectEvaluationResult(context, {
      status: 'success',
      data: {} as ReturnType<typeof makeValidAnalysis>,
      providerMetadata: metadata,
    })
    expect(invalid).toMatchObject({ status: 'error', code: 'invalid-output' })
    const artifact = projectEvaluationResult(context, {
      status: 'success',
      data: makeValidAnalysis(),
      providerMetadata: { ...metadata, resolvedModel: 'x'.repeat(121) },
    })
    expect(artifact).not.toHaveProperty('resolvedModel')
  })
  it('summarizes only the current results including failures and durations', () => {
    const success = projectEvaluationResult(context, {
      status: 'success',
      data: makeValidAnalysis(),
      providerMetadata: metadata,
    })
    const failure = projectEvaluationResult(context, {
      status: 'error',
      code: 'rate-limit',
      message: 'private-secret',
      providerMetadata: { ...metadata, durationMs: 2500 },
    })
    expect(summarizeEvaluationResults([success, failure, failure])).toEqual({
      total: 3,
      successCount: 1,
      failureCount: 2,
      errorCounts: { 'rate-limit': 2 },
      durationsMs: [1500, 2500, 2500],
      totalDurationMs: 6500,
    })
    expect(summarizeEvaluationResults([]).total).toBe(0)
  })
})

it('projects bounded metric numbers individually and summarizes known samples only', () => {
  const result = projectEvaluationResult(context, {
    status: 'success',
    data: makeValidAnalysis(),
    providerMetadata: {
      ...metadata,
      metrics: {
        inputTokens: 0,
        outputTokens: -1,
        totalTokens: Number.NaN,
        requestBodyBytes: 123,
        apiKey: 'private-secret',
      } as never,
    },
  })
  expect(result).toHaveProperty('metrics', {
    inputTokens: 0,
    requestBodyBytes: 123,
  })
  expect(JSON.stringify(result)).not.toContain('private-secret')
  const without = projectEvaluationResult(context, {
    status: 'error',
    code: 'timeout',
    message: 'private',
    providerMetadata: metadata,
  })
  expect(summarizeEvaluationResults([result, without])).toHaveProperty(
    'metricSamples',
    { inputTokens: [0], requestBodyBytes: [123] },
  )
  expect(summarizeEvaluationResults([without])).not.toHaveProperty(
    'metricSamples',
  )
})
