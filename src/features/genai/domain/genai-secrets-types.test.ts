import { describe, expect, it } from 'vitest'

import {
  aiProviderSecretSchema,
  aiProviderSecretPresenceSchema,
  aiProviderSecretsSchema,
  emptyAiProviderSecrets,
  makeEmptyAiProviderSecretPresence,
} from './genai-secrets-types'

describe('genai secrets domain', () => {
  it('accepts a row with per-provider secrets', () => {
    const parsed = aiProviderSecretsSchema.parse({
      openai: { apiKey: 'sk-test' },
      anthropic: { apiKey: 'sk-ant-test' },
    })
    expect(parsed.openai?.apiKey).toBe('sk-test')
    expect(parsed.gemini).toBeUndefined()
  })

  it('rejects baseUrl via .strict()', () => {
    expect(() =>
      aiProviderSecretSchema.parse({
        apiKey: 'sk-x',
        baseUrl: 'https://proxy.example.test',
      }),
    ).toThrow()
  })

  it('accepts an empty row', () => {
    expect(aiProviderSecretsSchema.parse({})).toEqual({})
  })

  it('rejects unknown providers via .strict()', () => {
    expect(() =>
      aiProviderSecretsSchema.parse({
        mistral: { apiKey: 'sk-x' },
      }),
    ).toThrow()
  })

  it('rejects empty apiKey', () => {
    expect(() =>
      aiProviderSecretsSchema.parse({ openai: { apiKey: '' } }),
    ).toThrow()
  })

  it('emptyAiProviderSecrets is an empty object', () => {
    expect(emptyAiProviderSecrets).toEqual({})
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
