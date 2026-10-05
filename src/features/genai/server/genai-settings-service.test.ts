import { describe, expect, it, vi } from 'vitest'

import { settingsKv } from '@/platform/db/schema'
import { createTestDb } from '@/platform/db/test-db'
import { updateSettings } from '@/features/settings/server/settings-service'
import { saveSecret } from '@/platform/secrets'

import * as secretStorage from './genai-secret-storage'
import {
  clearAiProviderSecret,
  getAiProviderSecretPresence,
  getAiHintConnectionStatus,
  isAiAssessmentAvailable,
  loadActiveProviderConfig,
  loadActiveProviderConfigSnapshot,
  readAiHintConnectionSnapshot,
  resetAiHintConnectionRevisions,
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

function pauseNextSecretLoad() {
  let entered = () => {}
  let release = () => {}
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const paused = new Promise<void>((resolve) => {
    release = resolve
  })
  const load = secretStorage.loadAiProviderSecretSnapshotFromTrustedStorage
  vi.spyOn(
    secretStorage,
    'loadAiProviderSecretSnapshotFromTrustedStorage',
  ).mockImplementationOnce(async (provider) => {
    const saved = await load(provider)
    entered()
    await paused
    return saved
  })
  return { started, release }
}

describe('getAiProviderSecretPresence', () => {
  it('returns all-false on empty store', async () => {
    expect(await getAiProviderSecretPresence()).toEqual({
      openai: false,
      anthropic: false,
      gemini: false,
      openrouter: false,
    })
  })

  it('reflects which providers have keys', async () => {
    await setAiProviderSecret('anthropic', { apiKey: 'sk-ant' })
    expect(await getAiProviderSecretPresence()).toEqual({
      openai: false,
      anthropic: true,
      gemini: false,
      openrouter: false,
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
    expect(presence).toEqual({
      openai: false,
      anthropic: false,
      gemini: true,
      openrouter: false,
    })
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
  it('does not let a suspended old-model read replace a newer connection revision', async () => {
    const db = await configuredDb()
    const paused = pauseNextSecretLoad()
    const older = readAiHintConnectionSnapshot(db)
    await paused.started

    await updateSettings(db, { aiAssessment: { model: 'new-model' } })
    const current = await readAiHintConnectionSnapshot(db)
    expect(current.config?.model).toBe('new-model')
    paused.release()
    const resumed = await older

    expect(resumed.config?.model).toBe('gpt-test')
    expect(resumed.identity).not.toBe(current.identity)
    expect(resumed.status.revision).not.toBe(current.status.revision)
    expect(await getAiHintConnectionStatus(db)).toEqual(current.status)
    expect(await getAiHintConnectionStatus(db)).toEqual(current.status)
  })

  it('does not let a pre-reset read populate the replacement revision registry', async () => {
    const db = await configuredDb()
    const initial = await getAiHintConnectionStatus(db)
    const paused = pauseNextSecretLoad()
    const older = readAiHintConnectionSnapshot(db)
    await paused.started

    resetAiHintConnectionRevisions()
    paused.release()
    const resumed = await older
    const current = await getAiHintConnectionStatus(db)

    expect(current.revision).not.toBe(initial.revision)
    expect(current.revision).not.toBe(resumed.status.revision)
    expect(await getAiHintConnectionStatus(db)).toEqual(current)
  })

  it('keeps hint availability independent of automatic assessment enablement', async () => {
    const db = await configuredDb()
    const initial = await getAiHintConnectionStatus(db)
    expect(initial.available).toBe(true)
    expect(initial.provider).toBe('openai')
    expect(Object.keys(initial).sort()).toEqual([
      'available',
      'provider',
      'revision',
    ])
    expect(initial.revision).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(JSON.stringify(initial)).not.toContain('fake-private-key')

    await updateSettings(db, { aiAssessment: { enabled: false } })

    expect(await getAiHintConnectionStatus(db)).toEqual(initial)
    expect(await loadActiveProviderConfig(db)).toBeNull()
    const snapshot = await readAiHintConnectionSnapshot(db)
    expect(snapshot.status).toEqual(initial)
    expect(snapshot.config).toEqual({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'fake-private-key',
    })
    expect(snapshot.identity).toEqual(expect.any(String))
    expect(initial.revision).not.toBe(snapshot.identity)
  })

  it('rotates hint revisions for same-key and different-key replacements', async () => {
    const db = await configuredDb()
    const initial = await getAiHintConnectionStatus(db)
    await setAiProviderSecret('openai', { apiKey: 'fake-private-key' })
    const replaced = await getAiHintConnectionStatus(db)
    expect(replaced.revision).not.toBe(initial.revision)
    await setAiProviderSecret('openai', { apiKey: 'replacement-key' })
    const changed = await getAiHintConnectionStatus(db)
    expect(changed.revision).not.toBe(replaced.revision)
    expect(changed.available).toBe(true)
  })

  it('ignores changes to an unselected provider key', async () => {
    const db = await configuredDb()
    const initial = await getAiHintConnectionStatus(db)
    await setAiProviderSecret('anthropic', { apiKey: 'other-provider-key' })
    expect(await getAiHintConnectionStatus(db)).toEqual(initial)
  })

  it('rotates hint revisions after reset even for an identical connection', async () => {
    const db = await configuredDb()
    const initial = await getAiHintConnectionStatus(db)
    resetAiHintConnectionRevisions()
    const current = await getAiHintConnectionStatus(db)
    expect(current.available).toBe(initial.available)
    expect(current.provider).toBe(initial.provider)
    expect(current.revision).not.toBe(initial.revision)
  })

  it('ignores model whitespace but rotates revisions for another model', async () => {
    const db = await configuredDb()
    const initial = await getAiHintConnectionStatus(db)
    await updateSettings(db, { aiAssessment: { model: 'gpt-test' } })
    expect(await getAiHintConnectionStatus(db)).toEqual(initial)
    await updateSettings(db, { aiAssessment: { model: 'other-model' } })
    const changed = await getAiHintConnectionStatus(db)
    expect(changed.revision).not.toBe(initial.revision)
    expect(changed.available).toBe(true)
  })

  it.each(['blank-model', 'cleared-key', 'other-provider'] as const)(
    'reports an unavailable hint connection after %s',
    async (kind) => {
      const db = await configuredDb()
      const initial = await getAiHintConnectionStatus(db)
      if (kind === 'blank-model')
        await updateSettings(db, { aiAssessment: { model: '   ' } })
      if (kind === 'cleared-key') await clearAiProviderSecret('openai')
      if (kind === 'other-provider')
        await updateSettings(db, { aiAssessment: { provider: 'anthropic' } })
      const current = await getAiHintConnectionStatus(db)
      expect(current.available).toBe(false)
      expect(current.provider).toBe(
        kind === 'other-provider' ? 'anthropic' : 'openai',
      )
      expect(current.revision).not.toBe(initial.revision)
      expect(await getAiHintConnectionStatus(db)).toEqual(current)
      expect((await readAiHintConnectionSnapshot(db)).config).toBeNull()
    },
  )

  it('uses only the newly selected provider connection', async () => {
    const db = await configuredDb()
    const initial = await getAiHintConnectionStatus(db)
    await setAiProviderSecret('anthropic', { apiKey: 'anthropic-key' })
    await updateSettings(db, { aiAssessment: { provider: 'anthropic' } })
    const snapshot = await readAiHintConnectionSnapshot(db)
    expect(snapshot.config).toEqual({
      provider: 'anthropic',
      model: 'gpt-test',
      apiKey: 'anthropic-key',
    })
    expect(snapshot.status.available).toBe(true)
    expect(snapshot.status.provider).toBe('anthropic')
    expect(snapshot.status.revision).not.toBe(initial.revision)
  })

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

it('uses an OpenRouter key only for its saved active connection and preserves other keys on removal', async () => {
  const { db } = await createTestDb({ seed: false })
  await setAiProviderSecret('openai', { apiKey: 'other-provider-key' })
  await setAiProviderSecret('openrouter', { apiKey: 'private-openrouter-key' })
  await updateSettings(db, {
    aiAssessment: {
      enabled: false,
      provider: 'openrouter',
      model: 'vendor/custom-model:free',
    },
  })
  expect(await loadActiveProviderConfig(db)).toBeNull()
  await updateSettings(db, { aiAssessment: { enabled: true } })
  expect(await loadActiveProviderConfig(db)).toEqual({
    provider: 'openrouter',
    model: 'vendor/custom-model:free',
    apiKey: 'private-openrouter-key',
  })
  const rows = await db.select().from(settingsKv)
  expect(JSON.stringify(rows)).not.toContain('private-openrouter-key')
  const presence = await clearAiProviderSecret('openrouter')
  expect(presence).toEqual({
    openai: true,
    anthropic: false,
    gemini: false,
    openrouter: false,
  })
  expect(await loadActiveProviderConfig(db)).toBeNull()
})

it.each(['replacement-key', 'same-key'] as const)(
  'changes the OpenRouter trusted configuration identity on a %s save',
  async (kind) => {
    const { db } = await createTestDb({ seed: false })
    await updateSettings(db, {
      aiAssessment: {
        enabled: true,
        provider: 'openrouter',
        model: 'openrouter/free',
      },
    })
    await setAiProviderSecret('openrouter', {
      apiKey: 'private-openrouter-key',
    })
    const saved = await loadActiveProviderConfigSnapshot(db)
    expect(saved).not.toBeNull()
    await setAiProviderSecret('openrouter', {
      apiKey:
        kind === 'same-key'
          ? 'private-openrouter-key'
          : 'replacement-openrouter-key',
    })
    expect((await loadActiveProviderConfigSnapshot(db))?.identity).not.toBe(
      saved?.identity,
    )
  },
)
