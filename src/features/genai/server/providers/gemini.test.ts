import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { GenAiGenerateJsonRequest } from '../../domain'
import {
  makeGeminiSuccessResponse,
  makeProviderErrorResponse,
} from '../../testing/genai-fixtures'
import { requestJson } from './gemini'

const schema = z.object({
  rating: z.enum(['again', 'hard', 'good', 'easy']),
  confidence: z.number(),
})
type Payload = z.infer<typeof schema>

const API_KEY = 'AIzaSyTestSecret1234567890'

function buildRequest(
  overrides: Partial<GenAiGenerateJsonRequest<Payload>> = {},
): GenAiGenerateJsonRequest<Payload> {
  return {
    provider: 'gemini',
    model: 'gemini-test',
    apiKey: API_KEY,
    prompt: { system: 'sys', user: 'user' },
    schema,
    ...overrides,
  }
}

describe('gemini requestJson', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function expectNoKeyLeak(result: { message?: string }) {
    expect(result.message ?? '').not.toContain(API_KEY)
  }

  it('returns success with parsed data and metadata on 200', async () => {
    const payload: Payload = { rating: 'good', confidence: 0.9 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeGeminiSuccessResponse(payload),
    )

    const result = await requestJson(buildRequest())

    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.data).toEqual(payload)
      expect(result.providerMetadata).toMatchObject({
        provider: 'gemini',
        model: 'gemini-test',
        totalTokens: 150,
        modelVersion: 'gemini-test-001',
      })
    }
  })

  it('returns invalid-output when schema validation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeGeminiSuccessResponse({ rating: 'maybe', confidence: 0.5 }),
    )

    const result = await requestJson(buildRequest())
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.code).toBe('invalid-output')
      expectNoKeyLeak(result)
    }
  })

  it('returns invalid-output when the model returns non-JSON text', async () => {
    const body = {
      candidates: [
        { content: { parts: [{ text: 'not json {' }], role: 'model' } },
      ],
      usageMetadata: {
        promptTokenCount: 1,
        candidatesTokenCount: 1,
        totalTokenCount: 2,
      },
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    )

    const result = await requestJson(buildRequest())
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.code).toBe('invalid-output')
      expectNoKeyLeak(result)
    }
  })

  it('returns invalid-output when the response body is not JSON at all', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    const result = await requestJson(buildRequest())
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.code).toBe('invalid-output')
      expectNoKeyLeak(result)
    }
  })

  it('returns invalid-output when candidates[] is empty', async () => {
    const body = {
      candidates: [],
      usageMetadata: {
        promptTokenCount: 1,
        candidatesTokenCount: 0,
        totalTokenCount: 1,
      },
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    )

    const result = await requestJson(buildRequest())
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.code).toBe('invalid-output')
      expectNoKeyLeak(result)
    }
  })

  it.each([
    [401, 'auth'],
    [429, 'rate-limit'],
    [503, 'network'],
  ] as const)('maps HTTP %s to %s', async (status, code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeProviderErrorResponse('gemini', status),
    )

    const result = await requestJson(buildRequest())
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.code).toBe(code)
      expectNoKeyLeak(result)
    }
  })

  it('returns network on a thrown TypeError from fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('fetch failed'),
    )

    const result = await requestJson(buildRequest())
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.code).toBe('network')
      expectNoKeyLeak(result)
    }
  })

  it('returns timeout when fetch hangs past timeoutMs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    const pending = requestJson(buildRequest({ timeoutMs: 1000 }))
    const expectTimeout = expect(pending).resolves.toMatchObject({
      status: 'error',
      code: 'timeout',
    })
    await vi.advanceTimersByTimeAsync(1000)
    await expectTimeout
  })

  it('re-throws caller-cancelled AbortError instead of reporting it', async () => {
    const controller = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    const pending = requestJson(buildRequest({ signal: controller.signal }))
    const expectAbort = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    })
    controller.abort()
    await expectAbort
  })

  it('sends the prompt and schema in the Gemini generateContent body shape', async () => {
    const payload: Payload = { rating: 'good', confidence: 0.9 }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeGeminiSuccessResponse(payload))

    await requestJson(buildRequest())

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    )
    const headers = init?.headers as Record<string, string>
    expect(headers['x-goog-api-key']).toBe(API_KEY)
    const body = JSON.parse(init?.body as string) as Record<string, unknown>
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys' }] })
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'user' }] }])
    const generationConfig = body.generationConfig as {
      responseMimeType?: unknown
      responseSchema?: unknown
      responseFormat?: unknown
    }
    expect(generationConfig).toMatchObject({
      responseMimeType: 'application/json',
    })
    expect(generationConfig.responseSchema).toBeDefined()
    expect(generationConfig.responseFormat).toBeUndefined()
  })
})
