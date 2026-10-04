import { describe, expect, it } from 'vitest'

import {
  setAiProviderSecretRequestSchema,
  testAiConnectionRequestSchema,
  testAiConnectionResponseSchema,
} from './genai-settings-contracts'

describe('genai settings contracts', () => {
  it('rejects baseUrl in provider secret requests via .strict()', () => {
    expect(() =>
      setAiProviderSecretRequestSchema.parse({
        surface: 'dashboard',
        provider: 'openai',
        secret: {
          apiKey: 'sk-test',
          baseUrl: 'https://proxy.example.test',
        },
      }),
    ).toThrow()
  })
})

describe('connection test contracts', () => {
  it('trims the dashboard model identity', () => {
    expect(
      testAiConnectionRequestSchema.parse({
        surface: 'dashboard',
        provider: 'gemini',
        model: ' gemini-test ',
      }),
    ).toEqual({
      surface: 'dashboard',
      provider: 'gemini',
      model: 'gemini-test',
    })
  })
  it('rejects other surfaces, blank or oversized models, and arbitrary request fields', () => {
    const request = {
      surface: 'dashboard',
      provider: 'gemini',
      model: 'gemini-test',
    }
    for (const invalid of [
      { ...request, surface: 'popup' },
      { ...request, model: ' ' },
      { ...request, model: 'x'.repeat(121) },
      { ...request, apiKey: 'secret' },
      { ...request, prompt: 'arbitrary' },
      { ...request, baseUrl: 'https://example.test' },
      { ...request, schema: {} },
    ]) {
      expect(testAiConnectionRequestSchema.safeParse(invalid).success).toBe(
        false,
      )
    }
  })
  it('accepts only strict bounded safe responses', () => {
    const identity = {
      provider: 'gemini',
      model: 'gemini-test',
      durationMs: 12,
    }
    expect(
      testAiConnectionResponseSchema.parse({ status: 'success', ...identity }),
    ).toEqual({ status: 'success', ...identity })
    expect(
      testAiConnectionResponseSchema.parse({
        status: 'error',
        ...identity,
        code: 'stale-configuration',
        message: 'Save this configuration before testing.',
      }).status,
    ).toBe('error')
    for (const invalid of [
      { status: 'success', ...identity, apiKey: 'secret' },
      { status: 'success', ...identity, durationMs: -1 },
      {
        status: 'error',
        ...identity,
        code: 'unknown',
        message: 'x'.repeat(501),
      },
    ]) {
      expect(testAiConnectionResponseSchema.safeParse(invalid).success).toBe(
        false,
      )
    }
  })
})
