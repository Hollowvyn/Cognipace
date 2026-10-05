import { afterEach, describe, expect, it, vi } from 'vitest'

import { updateSettings } from '@/features/settings/server/settings-service'
import { createTestDb } from '@/platform/db/test-db'
import type { TestAiConnectionRequest } from '../api/genai-settings-contracts'
import { makeOpenRouterSuccessResponse } from '../testing/genai-fixtures'
import { testAiConnection } from './genai-connection-service'
import {
  clearAiProviderSecret,
  setAiProviderSecret,
} from './genai-settings-service'

const request = {
  surface: 'dashboard',
  provider: 'gemini',
  model: 'gemini-test',
} as const
const openRouterRequest = {
  ...request,
  provider: 'openrouter',
  model: 'openrouter/free',
} as const
const providerBody = {
  candidates: [
    {
      content: { role: 'model', parts: [{ text: '{"ok":true}' }] },
      finishReason: 'STOP',
    },
  ],
  modelVersion: 'gemini-test',
  usageMetadata: {
    promptTokenCount: 2,
    candidatesTokenCount: 4,
    totalTokenCount: 6,
  },
}
const response = () =>
  new Response(JSON.stringify(providerBody), {
    headers: { 'content-type': 'application/json' },
  })
async function configuredDb(connection: TestAiConnectionRequest = request) {
  const { provider, model } = connection
  const { db } = await createTestDb({ seed: false })
  await updateSettings(db, {
    aiAssessment: { provider, model, enabled: false },
  })
  await setAiProviderSecret(provider, { apiKey: 'fake-private-key' })
  return db
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('fixed saved AI connection verification', () => {
  it('verifies an actual Gemini provider-shaped response while assessment is disabled', async () => {
    const db = await configuredDb()
    const fetch = vi.fn(() => Promise.resolve(response()))
    vi.stubGlobal('fetch', fetch)
    const result = await testAiConnection(request, () => Promise.resolve(db))
    expect(result).toMatchObject({
      status: 'success',
      provider: 'gemini',
      model: 'gemini-test',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    )
    expect(JSON.parse(init.body as string) as unknown).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: 'Return {"ok":true}.' }] }],
    })
    expect(JSON.stringify(result)).not.toContain('fake-private-key')
    expect(JSON.stringify(result)).not.toContain('fingerprint')
  })
  it('rejects stale saved provider/model before making a provider call', async () => {
    const db = await configuredDb()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(
      await testAiConnection({ ...request, model: 'other-model' }, () =>
        Promise.resolve(db),
      ),
    ).toMatchObject({ status: 'error', code: 'stale-configuration' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['key', 'same-key', 'model', 'removed-key'] as const)(
    'rejects a late result after %s replacement',
    async (kind) => {
      const db = await configuredDb()
      let finish!: (response: Response) => void
      const fetch = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      )
      vi.stubGlobal('fetch', fetch)
      const pending = testAiConnection(request, () => Promise.resolve(db))
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
      if (kind === 'model')
        await updateSettings(db, { aiAssessment: { model: 'other-model' } })
      else if (kind === 'removed-key') await clearAiProviderSecret('gemini')
      else
        await setAiProviderSecret('gemini', {
          apiKey: kind === 'same-key' ? 'fake-private-key' : 'replacement-key',
        })
      finish(response())
      expect(await pending).toMatchObject({
        status: 'error',
        code: 'stale-configuration',
      })
    },
  )
  it('includes a stalled database load in the complete 20-second deadline', async () => {
    vi.useFakeTimers()
    const pending = testAiConnection(request, () => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await pending).toMatchObject({
      status: 'error',
      code: 'timeout',
      durationMs: 20_000,
    })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('aborts a stalled success body within the same complete deadline', async () => {
    const db = await configuredDb()
    vi.useFakeTimers()
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(new ReadableStream({ start() {} }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetch)
    const pending = testAiConnection(request, () => Promise.resolve(db))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await pending).toMatchObject({ status: 'error', code: 'timeout' })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('returns controlled storage/startup failures without exposing raw exceptions', async () => {
    const db = await configuredDb()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          setAccessLevel: vi
            .fn()
            .mockRejectedValue(new Error('fake-private-key')),
          get: vi.fn(),
          set: vi.fn(),
          remove: vi.fn(),
        },
      },
    })
    const result = await testAiConnection(request, () => Promise.resolve(db))
    expect(result).toMatchObject({ status: 'error', code: 'unknown' })
    expect(JSON.stringify(result)).not.toContain('fake-private-key')
  })
  it('returns controlled feedback when database initialization fails', async () => {
    const result = await testAiConnection(request, () =>
      Promise.reject(new Error('fake-private-key')),
    )
    expect(result).toMatchObject({ status: 'error', code: 'unknown' })
    expect(JSON.stringify(result)).not.toContain('fake-private-key')
  })
})

it('does not resume provider work after database startup outlives the deadline', async () => {
  const db = await configuredDb()
  vi.useFakeTimers()
  let finish!: (value: typeof db) => void
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const pending = testAiConnection(
    request,
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await vi.advanceTimersByTimeAsync(20_000)
  expect(await pending).toMatchObject({ status: 'error', code: 'timeout' })
  finish(db)
  await vi.advanceTimersByTimeAsync(0)
  expect(fetch).not.toHaveBeenCalled()
})

it('returns missing-key feedback before making a network call', async () => {
  const db = await configuredDb()
  await clearAiProviderSecret('gemini')
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(
    await testAiConnection(request, () => Promise.resolve(db)),
  ).toMatchObject({
    status: 'error',
    code: 'not-configured',
  })
  expect(fetch).not.toHaveBeenCalled()
})

it('tests a saved free OpenRouter connection with its key while assessment is disabled', async () => {
  const db = await configuredDb(openRouterRequest)
  const fetchMock = vi.fn<typeof fetch>(() =>
    Promise.resolve(makeOpenRouterSuccessResponse({ ok: true })),
  )
  vi.stubGlobal('fetch', fetchMock)
  const result = await testAiConnection(openRouterRequest, () =>
    Promise.resolve(db),
  )
  expect(result).toMatchObject({
    status: 'success',
    provider: 'openrouter',
    model: 'openrouter/free',
  })
  expect(fetchMock).toHaveBeenCalledOnce()
  const [url, init] = fetchMock.mock.calls[0]!
  expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
  expect(new Headers(init?.headers).get('authorization')).toBe(
    'Bearer fake-private-key',
  )
  const body = init?.body
  if (typeof body !== 'string') throw new Error('Expected a JSON request body.')
  expect(JSON.parse(body)).toMatchObject({
    model: 'openrouter/free',
    max_tokens: 512,
  })
  expect(JSON.stringify(result)).not.toContain('fake-private-key')
  expect(result).not.toHaveProperty('resolvedModel')
})

it.each(['key', 'same-key', 'model', 'provider', 'removed-key'] as const)(
  'rejects a completed OpenRouter test after its saved %s changes',
  async (kind) => {
    const db = await configuredDb(openRouterRequest)
    let finish: (response: Response) => void = () => {}
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const pending = testAiConnection(openRouterRequest, () =>
      Promise.resolve(db),
    )
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    if (kind === 'model')
      await updateSettings(db, { aiAssessment: { model: 'test/custom-model' } })
    else if (kind === 'provider')
      await updateSettings(db, { aiAssessment: { provider: 'openai' } })
    else if (kind === 'removed-key') await clearAiProviderSecret('openrouter')
    else
      await setAiProviderSecret('openrouter', {
        apiKey: kind === 'same-key' ? 'fake-private-key' : 'replacement-key',
      })
    finish(makeOpenRouterSuccessResponse({ ok: true }))
    expect(await pending).toMatchObject({
      status: 'error',
      code: 'stale-configuration',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  },
)
