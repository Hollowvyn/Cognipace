import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearAiProviderSecretFromTrustedStorage,
  getAiProviderSecretPresenceFromTrustedStorage,
  loadAiProviderSecretFromTrustedStorage,
  saveAiProviderSecretToTrustedStorage,
} from './genai-secret-storage'

const secretStoreMocks = vi.hoisted(() => ({
  deleteSecret: vi.fn(),
  getSecretStatus: vi.fn(),
  readSecret: vi.fn(),
  saveSecret: vi.fn(),
}))

vi.mock('@/platform/secrets', () => ({
  deleteSecret: secretStoreMocks.deleteSecret,
  getSecretStatus: secretStoreMocks.getSecretStatus,
  readSecret: secretStoreMocks.readSecret,
  saveSecret: secretStoreMocks.saveSecret,
}))

describe('genai trusted secret storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    secretStoreMocks.getSecretStatus.mockResolvedValue({
      provider: 'genai:openai',
      configured: false,
      updatedAt: null,
      fingerprint: null,
    })
    secretStoreMocks.readSecret.mockResolvedValue(null)
  })

  it('saves provider keys through platform secret storage', async () => {
    await saveAiProviderSecretToTrustedStorage('openai', {
      apiKey: ' sk-test ',
    })

    expect(secretStoreMocks.saveSecret).toHaveBeenCalledWith(
      'genai:openai',
      JSON.stringify({ apiKey: 'sk-test' }),
    )
  })

  it('loads provider keys without exposing them through presence', async () => {
    secretStoreMocks.readSecret.mockResolvedValue(
      JSON.stringify({ apiKey: 'sk-test' }),
    )

    await expect(
      loadAiProviderSecretFromTrustedStorage('openai'),
    ).resolves.toEqual({ apiKey: 'sk-test' })

    expect(secretStoreMocks.readSecret).toHaveBeenCalledWith('genai:openai')
  })

  it('loads legacy raw-string keys as apiKey-only secrets', async () => {
    secretStoreMocks.readSecret.mockResolvedValue('sk-legacy')

    await expect(
      loadAiProviderSecretFromTrustedStorage('openai'),
    ).resolves.toEqual({ apiKey: 'sk-legacy' })
  })

  it('loads stale stored baseUrl as an apiKey-only secret', async () => {
    secretStoreMocks.readSecret.mockResolvedValue(
      JSON.stringify({
        apiKey: 'g-test',
        baseUrl: 'https://proxy.example.test',
      }),
    )

    await expect(
      loadAiProviderSecretFromTrustedStorage('gemini'),
    ).resolves.toEqual({
      apiKey: 'g-test',
    })
  })

  it('maps Gemini to the existing genai:google secret provider id', async () => {
    await clearAiProviderSecretFromTrustedStorage('gemini')

    expect(secretStoreMocks.deleteSecret).toHaveBeenCalledWith('genai:google')
  })

  it('returns provider presence without raw secret values', async () => {
    secretStoreMocks.getSecretStatus.mockImplementation((provider: string) =>
      Promise.resolve({
        provider,
        configured: provider === 'genai:anthropic',
        updatedAt:
          provider === 'genai:anthropic' ? '2026-06-07T00:00:00.000Z' : null,
        fingerprint: provider === 'genai:anthropic' ? 'abcdef123456' : null,
      }),
    )

    const presence = await getAiProviderSecretPresenceFromTrustedStorage()

    expect(presence).toEqual({
      openai: false,
      anthropic: true,
      gemini: false,
      openrouter: false,
    })
    expect(JSON.stringify(presence)).not.toContain('sk-')
  })

  it('maps OpenRouter save, load, and removal to its own trusted secret ID', async () => {
    await saveAiProviderSecretToTrustedStorage('openrouter', {
      apiKey: ' local-key ',
    })
    expect(secretStoreMocks.saveSecret).toHaveBeenCalledWith(
      'genai:openrouter',
      JSON.stringify({ apiKey: 'local-key' }),
    )
    secretStoreMocks.readSecret.mockResolvedValue(
      JSON.stringify({ apiKey: 'local-key' }),
    )
    await expect(
      loadAiProviderSecretFromTrustedStorage('openrouter'),
    ).resolves.toEqual({ apiKey: 'local-key' })
    expect(secretStoreMocks.readSecret).toHaveBeenCalledWith('genai:openrouter')
    await clearAiProviderSecretFromTrustedStorage('openrouter')
    expect(secretStoreMocks.deleteSecret).toHaveBeenCalledWith(
      'genai:openrouter',
    )
  })

  it('includes the fourth provider in presence without reading secret values', async () => {
    secretStoreMocks.getSecretStatus.mockImplementation((provider: string) =>
      Promise.resolve({
        provider,
        configured: provider === 'genai:openrouter',
        updatedAt: null,
        fingerprint: null,
      }),
    )
    expect(await getAiProviderSecretPresenceFromTrustedStorage()).toEqual({
      openai: false,
      anthropic: false,
      gemini: false,
      openrouter: true,
    })
    expect(secretStoreMocks.getSecretStatus).toHaveBeenCalledWith(
      'genai:openrouter',
    )
    expect(secretStoreMocks.readSecret).not.toHaveBeenCalled()
  })
})
