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
  loadActiveProviderConfigSnapshot,
  setAiProviderSecret,
} from './genai-settings-service'

async function configuredDb() {
  const { db } = await createTestDb({ seed: false })
  await updateSettings(db, {
    aiAssessment: {
      enabled: true,
      provider: 'openai',
      model: '  gpt-test  ',
    },
  })
  await setAiProviderSecret('openai', { apiKey: 'fake-private-key' })
  return db
}

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

describe('active AI configuration entrypoints', () => {
  it.each([
    'disabled',
    'empty-model',
    'blank-model',
    'other-provider-only',
    'cleared-key',
    'configured',
  ] as const)(
    'handles %s consistently through all public reads',
    async (kind) => {
      const db = await configuredDb()
      if (kind === 'disabled')
        await updateSettings(db, { aiAssessment: { enabled: false } })
      if (kind === 'empty-model')
        await updateSettings(db, { aiAssessment: { model: '' } })
      if (kind === 'blank-model')
        await updateSettings(db, { aiAssessment: { model: '   ' } })
      if (kind === 'other-provider-only')
        await updateSettings(db, { aiAssessment: { provider: 'anthropic' } })
      if (kind === 'cleared-key') await clearAiProviderSecret('openai')
      const expected =
        kind === 'configured'
          ? {
              provider: 'openai',
              model: 'gpt-test',
              apiKey: 'fake-private-key',
            }
          : null
      expect(await loadActiveProviderConfig(db)).toEqual(expected)
      expect(await isAiAssessmentAvailable(db)).toBe(kind === 'configured')
      const saved = await loadActiveProviderConfigSnapshot(db)
      if (kind === 'configured') {
        expect(saved?.config).toEqual(expected)
        expect(saved?.identity).toEqual(expect.any(String))
        expect((await loadActiveProviderConfigSnapshot(db))?.identity).toBe(
          saved?.identity,
        )
      } else expect(saved).toBeNull()
    },
  )
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

describe('trusted active configuration snapshot', () => {
  it.each(['provider', 'model', 'replacement-key', 'same-key'] as const)(
    'changes identity on %s replacement',
    async (kind) => {
      const db = await configuredDb()
      const saved = await loadActiveProviderConfigSnapshot(db)
      if (kind === 'provider') {
        await setAiProviderSecret('gemini', { apiKey: 'gemini-key' })
        await updateSettings(db, { aiAssessment: { provider: 'gemini' } })
      } else if (kind === 'model')
        await updateSettings(db, { aiAssessment: { model: 'other-model' } })
      else
        await setAiProviderSecret('openai', {
          apiKey: kind === 'same-key' ? 'fake-private-key' : 'replacement-key',
        })
      const current = await loadActiveProviderConfigSnapshot(db)
      expect(current?.identity).not.toBe(saved?.identity)
    },
  )
})
