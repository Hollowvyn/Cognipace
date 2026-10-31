import { describe, expect, it } from 'vitest'

import {
  aiGenerationMetricsSchema,
  projectAiMetrics,
  projectAiUsage,
} from './metrics'

describe('safe numeric metrics', () => {
  it('rejects arbitrary fields and malformed or unbounded numeric values', () => {
    expect(
      aiGenerationMetricsSchema.safeParse({ apiKey: 'private' }).success,
    ).toBe(false)
    for (const value of [
      -1,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      '10',
      null,
    ]) {
      expect(
        aiGenerationMetricsSchema.safeParse({ inputTokens: value }).success,
      ).toBe(false)
      expect(projectAiMetrics({ inputTokens: value })).toEqual({})
    }
    expect(
      projectAiMetrics({
        inputTokens: 0,
        outputTokens: 1.5,
        validationMs: 0.5,
        raw: 'private',
      }),
    ).toEqual({ inputTokens: 0, validationMs: 0.5 })
  })
  it('picks SDK usage details and never copies raw or fabricated totals', () => {
    expect(
      projectAiUsage({
        inputTokens: 20,
        outputTokens: 10,
        inputTokenDetails: { cacheReadTokens: 0 },
        outputTokenDetails: { reasoningTokens: 5 },
        raw: { apiKey: 'private' },
      }),
    ).toEqual({
      inputTokens: 20,
      outputTokens: 10,
      cacheReadTokens: 0,
      reasoningTokens: 5,
    })
    expect(projectAiUsage(undefined)).toEqual({})
    expect(
      projectAiUsage({
        inputTokens: -1,
        outputTokens: NaN,
        inputTokenDetails: null,
      }),
    ).toEqual({})
  })
})
