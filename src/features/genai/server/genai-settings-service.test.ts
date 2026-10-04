import { describe, expect, it, vi } from 'vitest'

import { settingsKv } from '@/platform/db/schema'
import { createTestDb } from '@/platform/db/test-db'
import { updateSettings } from '@/features/settings/server/settings-service'
import { saveSecret } from '@/platform/secrets'

import {
  clearAiProviderSecret,
  getAiProviderSecretPresence,
  isAiAssessmentAvailable,
  loadActiveProviderConfig,
  setAiProviderSecret,
} from './genai-settings-service'

describe('getAiProviderSecretPresence', () => {
  it('returns all-false on empty store', async () => {
    expect(await getAiProviderSecretPresence()).toEqual({
      openai: false,
      anthropic: false,
      gemini: false,
    })
  })

  it('reflects which providers have keys', async () => {
    await setAiProviderSecret('anthropic', { apiKey: 'sk-ant' })
    expect(await getAiProviderSecretPresence()).toEqual({
      openai: false,
      anthropic: true,
      gemini: false,
    })
  })
})

describe('setAiProviderSecret / clearAiProviderSecret', () => {
  it('set returns updated presence', async () => {
    const presence = await setAiProviderSecret('openai', {
      apiKey: 'sk-o',
    })
    expect(presence.openai).toBe(true)
  })

  it('clear removes only the named provider', async () => {
    await setAiProviderSecret('openai', { apiKey: 'sk-o' })
    await setAiProviderSecret('gemini', { apiKey: 'g-x' })
    const presence = await clearAiProviderSecret('openai')
    expect(presence).toEqual({ openai: false, anthropic: false, gemini: true })
  })

  it('does not write GenAI API keys into settings_kv', async () => {
    const handle = await createTestDb({ seed: false })

    await setAiProviderSecret('openai', { apiKey: 'sk-test' })

    const rows = await handle.db.select().from(settingsKv)
    expect(rows.some((row) => row.key === 'genai-secrets')).toBe(false)
    expect(JSON.stringify(rows)).not.toContain('sk-test')
  })
})

describe('loadActiveProviderConfig', () => {
  it('returns null when aiAssessment.enabled is false', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: false, provider: 'openai', model: 'gpt-test' },
    })
    await setAiProviderSecret('openai', { apiKey: 'sk-test' })
    expect(await loadActiveProviderConfig(handle.db)).toBeNull()
  })

  it('returns null when model is empty', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'openai', model: '' },
    })
    await setAiProviderSecret('openai', { apiKey: 'sk-test' })
    expect(await loadActiveProviderConfig(handle.db)).toBeNull()
  })

  it('returns null when the active provider has no secret', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'anthropic', model: 'claude' },
    })
    await setAiProviderSecret('openai', { apiKey: 'sk-test' })
    expect(await loadActiveProviderConfig(handle.db)).toBeNull()
  })

  it('returns a full config when all conditions are met', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'openai', model: 'gpt-test' },
    })
    await setAiProviderSecret('openai', { apiKey: 'sk-test' })
    expect(await loadActiveProviderConfig(handle.db)).toEqual({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'sk-test',
    })
  })

  it('does not include baseUrl even when a stale saved secret has one', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'gemini', model: 'gemini-test' },
    })
    await saveSecret(
      'genai:google',
      JSON.stringify({
        apiKey: 'g-test',
        baseUrl: 'https://proxy.example.test',
      }),
    )
    expect(await loadActiveProviderConfig(handle.db)).toEqual({
      provider: 'gemini',
      model: 'gemini-test',
      apiKey: 'g-test',
    })
  })

  it('treats whitespace-only model as empty', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'openai', model: '   ' },
    })
    await setAiProviderSecret('openai', { apiKey: 'sk-test' })
    expect(await loadActiveProviderConfig(handle.db)).toBeNull()
  })
})

describe('isAiAssessmentAvailable', () => {
  it('returns false when no config can be resolved', async () => {
    const handle = await createTestDb({ seed: false })
    expect(await isAiAssessmentAvailable(handle.db)).toBe(false)
  })

  it('returns true when a full config can be resolved', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'openai', model: 'gpt-test' },
    })
    await setAiProviderSecret('openai', { apiKey: 'sk-test' })
    expect(await isAiAssessmentAvailable(handle.db)).toBe(true)
  })
})

it('publishes a durable key write before a failed presence refresh', async () => {
  const published = vi.fn(() => Promise.resolve())
  vi.spyOn(chrome.storage.local, 'get').mockRejectedValueOnce(
    new Error('readback failed'),
  )
  await expect(
    setAiProviderSecret('openai', { apiKey: 'fake-private-key' }, published),
  ).rejects.toThrow()
  expect(published).toHaveBeenCalledTimes(1)
})
