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
    })
  })
})

it('strictly parses only provider-presence booleans', () => {
  expect(
    aiProviderSecretPresenceSchema.parse({
      openai: true,
      anthropic: false,
      gemini: false,
    }),
  ).toEqual({ openai: true, anthropic: false, gemini: false })
  expect(
    aiProviderSecretPresenceSchema.safeParse({
      openai: 'true',
      anthropic: false,
      gemini: false,
    }).success,
  ).toBe(false)
  expect(
    aiProviderSecretPresenceSchema.safeParse({
      openai: true,
      anthropic: false,
      gemini: false,
      apiKey: 'fake-key',
    }).success,
  ).toBe(false)
})
