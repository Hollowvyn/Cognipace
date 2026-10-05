import { describe, expect, it } from 'vitest'

import {
  aiProviderSecretSchema,
  aiProviderSecretPresenceSchema,
  makeEmptyAiProviderSecretPresence,
} from './genai-secrets-types'

describe('genai secrets domain', () => {
  it('accepts a per-provider secret', () => {
    expect(aiProviderSecretSchema.parse({ apiKey: 'sk-test' })).toEqual({
      apiKey: 'sk-test',
    })
  })

  it('rejects baseUrl via .strict()', () => {
    expect(() =>
      aiProviderSecretSchema.parse({
        apiKey: 'sk-x',
        baseUrl: 'https://proxy.example.test',
      }),
    ).toThrow()
  })

  it('rejects empty apiKey', () => {
    expect(() => aiProviderSecretSchema.parse({ apiKey: '' })).toThrow()
  })

  it('makeEmptyAiProviderSecretPresence returns all-false for known providers', () => {
    expect(makeEmptyAiProviderSecretPresence()).toEqual({
      openai: false,
      anthropic: false,
      gemini: false,
      openrouter: false,
    })
  })
})

it('requires exactly four provider-presence booleans without secret fields', () => {
  const presence = {
    openai: true,
    anthropic: false,
    gemini: false,
    openrouter: true,
  }
  expect(aiProviderSecretPresenceSchema.parse(presence)).toEqual(presence)
  expect(makeEmptyAiProviderSecretPresence()).toEqual({
    openai: false,
    anthropic: false,
    gemini: false,
    openrouter: false,
  })
  for (const invalid of [
    { openai: true, anthropic: false, gemini: false },
    { ...presence, openrouter: 'true' },
    { ...presence, apiKey: 'fake-private-key' },
    { ...presence, other: false },
  ]) {
    expect(aiProviderSecretPresenceSchema.safeParse(invalid).success).toBe(
      false,
    )
  }
})
