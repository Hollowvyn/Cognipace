// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { GenAiGenerateJsonRequest, GenAiProviderId } from '../domain'
import { generateJson } from './genai-service'

const API_KEY = 'fake-provider-key-do-not-use'
const schema = z.strictObject({ ok: z.literal(true) })
const models = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-5-20250929',
  gemini: 'gemini-3.5-flash-lite',
}

function request(
  provider: GenAiProviderId,
  overrides: Partial<GenAiGenerateJsonRequest<{ ok: true }>> = {},
) {
  return {
    provider,
    model: models[provider],
    apiKey: API_KEY,
    prompt: { system: 'Return valid JSON.', user: 'Return {"ok":true}.' },
    schema,
    ...overrides,
  }
}

function requestBodyText(body: RequestInit['body']) {
  if (typeof body !== 'string')
    throw new Error('Expected an SDK JSON request body')
  return body
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function successBody(provider: GenAiProviderId, text = '{"ok":true}') {
  switch (provider) {
    case 'openai':
      return {
        id: 'resp_test',
        created_at: 1,
        model: 'gpt-4.1-mini-version',
        output: [
          {
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      }
    case 'anthropic':
      return {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-version',
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 20, output_tokens: 10 },
      }
    case 'gemini':
      return {
        candidates: [
          {
            content: { role: 'model', parts: [{ text }] },
            finishReason: 'STOP',
          },
        ],
        modelVersion: 'gemini-version',
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 10,
          totalTokenCount: 30,
        },
      }
  }
}

function errorBody(provider: GenAiProviderId, status: number, tag = 'generic') {
  const message = `private provider diagnostic ${API_KEY}`
  if (provider === 'gemini')
    return { error: { code: status, status: tag, message } }
  if (provider === 'anthropic')
    return { type: 'error', error: { type: tag, message } }
  return { error: { type: tag, code: tag, message, param: null } }
}

function expectSafe(result: unknown) {
  const serialized = JSON.stringify(result)
  expect(serialized).not.toContain(API_KEY)
  expect(serialized).not.toContain('private provider diagnostic')
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('generateJson actual SDK wire', () => {
  it.each(['openai', 'anthropic', 'gemini'] as const)(
    'uses %s native structured wire with explicit credentials and bounded output',
    async (provider) => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse(successBody(provider)))
      const result = await generateJson(request(provider))
      expect(result).toMatchObject({
        status: 'success',
        data: { ok: true },
        providerMetadata: {
          provider,
          model: models[provider],
          totalTokens: 30,
        },
      })
      expectSafe(result)
      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0]!
      const headers = new Headers(init?.headers)
      const body: unknown = JSON.parse(requestBodyText(init?.body))
      expect(body).not.toHaveProperty('temperature')
      expect(init?.signal).toBeDefined()
      if (provider === 'openai') {
        expect(url).toBe('https://api.openai.com/v1/responses')
        expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`)
        expect(body).toMatchObject({ max_output_tokens: 2048 })
        expect(body).toMatchObject({
          text: {
            format: {
              schema: { properties: { ok: { const: true, type: 'boolean' } } },
            },
          },
        })
      } else if (provider === 'anthropic') {
        expect(url).toBe('https://api.anthropic.com/v1/messages')
        expect(headers.get('x-api-key')).toBe(API_KEY)
        expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe(
          'true',
        )
        expect(body).toMatchObject({ max_tokens: 2048 })
        expect(body).toMatchObject({
          output_config: { format: { type: 'json_schema' } },
        })
      } else {
        expect(url).toBe(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
        )
        expect(headers.get('x-goog-api-key')).toBe(API_KEY)
        expect(url).not.toContain(API_KEY)
        expect(body).toMatchObject({
          generationConfig: { maxOutputTokens: 2048 },
        })
        expect(body).toMatchObject({
          generationConfig: { responseMimeType: 'application/json' },
        })
      }
    },
  )

  it.each(['openai', 'anthropic', 'gemini'] as const)(
    'keeps original literals, nullable fields and constraints for %s',
    async (provider) => {
      const constrained = z.strictObject({
        ok: z.literal(true),
        name: z.string().min(2).max(5).nullable(),
        count: z.number().int().min(1).max(3),
        tags: z.array(z.enum(['a', 'b'])).max(2),
      })
      const payload = { ok: true, name: null, count: 2, tags: ['a'] }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(successBody(provider, JSON.stringify(payload))),
      )
      const result = await generateJson({
        ...request(provider),
        schema: constrained,
      })
      expect(result).toMatchObject({ status: 'success', data: payload })
    },
  )

  it.each(['openai', 'anthropic', 'gemini'] as const)(
    'rejects invalid JSON and output schema for %s',
    async (provider) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch')
      for (const text of [
        'not JSON {',
        '{"ok":false}',
        '{"ok":true,"extra":1}',
      ]) {
        fetchMock.mockResolvedValue(jsonResponse(successBody(provider, text)))
        const result = await generateJson(request(provider))
        expect(result).toMatchObject({
          status: 'error',
          code: 'invalid-output',
        })
        expectSafe(result)
      }
    },
  )

  it.each(['openai', 'anthropic', 'gemini'] as const)(
    'does not retry or log %s provider failures',
    async (provider) => {
      const logs = [
        vi.spyOn(console, 'error'),
        vi.spyOn(console, 'warn'),
        vi.spyOn(console, 'log'),
      ]
      const warnings = vi.spyOn(process, 'emitWarning')
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse(errorBody(provider, 503), 503))
      const result = await generateJson(request(provider))
      expect(result).toMatchObject({ status: 'error', code: 'network' })
      expectSafe(result)
      expect(fetchMock).toHaveBeenCalledOnce()
      for (const log of logs) expect(log).not.toHaveBeenCalled()
      expect(warnings).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['openai', 401, 'invalid_api_key', 'auth'],
    ['openai', 403, 'permission_denied', 'permission'],
    ['openai', 404, 'model_not_found', 'model-unavailable'],
    ['openai', 400, 'invalid_request_error', 'bad-request'],
    ['openai', 429, 'insufficient_quota', 'rate-limit'],
    ['anthropic', 401, 'authentication_error', 'auth'],
    ['anthropic', 403, 'permission_error', 'permission'],
    ['anthropic', 404, 'not_found_error', 'model-unavailable'],
    ['anthropic', 400, 'invalid_request_error', 'bad-request'],
    ['gemini', 400, 'INVALID_ARGUMENT', 'bad-request'],
    ['gemini', 403, 'PERMISSION_DENIED', 'permission'],
    ['gemini', 404, 'NOT_FOUND', 'model-unavailable'],
    ['gemini', 429, 'RESOURCE_EXHAUSTED', 'rate-limit'],
  ] as const)(
    'normalizes %s HTTP %s %s to %s',
    async (provider, status, tag, code) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(errorBody(provider, status, tag), status),
      )
      const result = await generateJson(request(provider))
      expect(result).toMatchObject({ status: 'error', code })
      expectSafe(result)
    },
  )

  it('recognizes Google ErrorInfo API_KEY_INVALID without interpreting raw messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 400,
            status: 'INVALID_ARGUMENT',
            message: `private provider diagnostic ${API_KEY}`,
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'API_KEY_INVALID',
                domain: 'googleapis.com',
              },
            ],
          },
        },
        400,
      ),
    )
    expect(await generateJson(request('gemini'))).toMatchObject({
      status: 'error',
      code: 'auth',
    })
  })

  it.each(['openai', 'anthropic', 'gemini'] as const)(
    'returns refused for native %s safety responses',
    async (provider) => {
      const body =
        provider === 'openai'
          ? {
              ...successBody(provider),
              output: [
                {
                  type: 'message',
                  id: 'refusal',
                  role: 'assistant',
                  content: [
                    {
                      type: 'refusal',
                      refusal: `private provider diagnostic ${API_KEY}`,
                    },
                  ],
                },
              ],
            }
          : provider === 'anthropic'
            ? { ...successBody(provider), content: [], stop_reason: 'refusal' }
            : { promptFeedback: { blockReason: 'SAFETY' } }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body))
      const result = await generateJson(request(provider))
      expect(result).toMatchObject({ status: 'error', code: 'refused' })
      expectSafe(result)
    },
  )

  it.each(['openai', 'anthropic', 'gemini'] as const)(
    'rejects %s token truncation even when partial JSON is valid',
    async (provider) => {
      const body = successBody(provider)
      const truncated =
        provider === 'openai'
          ? { ...body, incomplete_details: { reason: 'max_output_tokens' } }
          : provider === 'anthropic'
            ? { ...body, stop_reason: 'max_tokens' }
            : {
                ...body,
                candidates: [
                  {
                    content: {
                      role: 'model',
                      parts: [{ text: '{"ok":true}' }],
                    },
                    finishReason: 'MAX_TOKENS',
                  },
                ],
              }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(truncated))
      expect(await generateJson(request(provider))).toMatchObject({
        status: 'error',
        code: 'invalid-output',
      })
    },
  )

  it.each(['headers', 'success body', 'error body'] as const)(
    'bounds stalled %s even when the transport ignores abort',
    async (phase) => {
      vi.useFakeTimers()
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        phase === 'headers'
          ? new Promise(() => {})
          : Promise.resolve(
              new Response(
                new ReadableStream({
                  start(controller) {
                    controller.enqueue(new TextEncoder().encode('{'))
                  },
                }),
                {
                  status: phase === 'error body' ? 400 : 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              ),
            ),
      )
      const pending = generateJson(request('gemini', { timeoutMs: 40 }))
      await vi.advanceTimersByTimeAsync(41)
      const result = await pending
      expect(result).toMatchObject({ status: 'error', code: 'timeout' })
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('returns cancellation promptly and prevents an already cancelled request from fetching', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise(() => {}))
    const pending = generateJson(
      request('gemini', { signal: controller.signal }),
    )
    await vi.advanceTimersByTimeAsync(1)
    controller.abort(new Error(`private provider diagnostic ${API_KEY}`))
    expect(await pending).toMatchObject({ status: 'error', code: 'cancelled' })
    expect(vi.getTimerCount()).toBe(0)
    fetchMock.mockClear()
    expect(
      await generateJson(request('gemini', { signal: controller.signal })),
    ).toMatchObject({ status: 'error', code: 'cancelled' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the deadline active during asynchronous schema validation', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(successBody('gemini')),
    )
    const stalledSchema = schema.refine(
      async () => new Promise<boolean>(() => {}),
    )
    const pending = generateJson({
      ...request('gemini'),
      schema: stalledSchema,
      timeoutMs: 40,
    })
    await vi.advanceTimersByTimeAsync(41)
    expect(await pending).toMatchObject({ status: 'error', code: 'timeout' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not return a credential echoed into provider model metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ ...successBody('openai'), model: API_KEY }),
    )
    const result = await generateJson(request('openai'))
    expect(result.status).toBe('success')
    expect(result.providerMetadata).not.toHaveProperty('modelVersion')
    expectSafe(result)
  })

  it('supports the SDK JSON-tool compatibility path for older Anthropic models', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        ...successBody('anthropic'),
        model: 'claude-3-5-haiku-20241022',
        content: [
          {
            type: 'tool_use',
            id: 'tool_json',
            name: 'json',
            input: { ok: true },
          },
        ],
        stop_reason: 'tool_use',
      }),
    )
    const result = await generateJson(
      request('anthropic', { model: 'claude-3-5-haiku-20241022' }),
    )
    expect(result).toMatchObject({ status: 'success', data: { ok: true } })
    const body: unknown = JSON.parse(
      requestBodyText(fetchMock.mock.calls[0]![1]?.body),
    )
    expect(body).toMatchObject({
      tools: [
        {
          name: 'json',
          input_schema: { type: 'object', properties: { ok: { const: true } } },
        },
      ],
    })
  })

  it.each(['openai', 'anthropic', 'gemini'] as const)(
    'rejects malformed native %s envelopes and fetch failures safely',
    async (provider) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch')
      fetchMock.mockResolvedValue(
        new Response('not a JSON envelope', { status: 200 }),
      )
      expect(await generateJson(request(provider))).toMatchObject({
        status: 'error',
        code: 'invalid-output',
      })
      fetchMock.mockResolvedValue(jsonResponse({ unrelated: API_KEY }))
      expect(await generateJson(request(provider))).toMatchObject({
        status: 'error',
        code: 'invalid-output',
      })
      fetchMock.mockRejectedValue(
        new TypeError(`private provider diagnostic ${API_KEY}`),
      )
      const result = await generateJson(request(provider))
      expect(result).toMatchObject({ status: 'error', code: 'network' })
      expectSafe(result)
    },
  )

  it('omits malformed fractional token metadata from a native provider response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        ...successBody('gemini'),
        usageMetadata: {
          promptTokenCount: 1.5,
          candidatesTokenCount: 1,
          totalTokenCount: 2.5,
        },
      }),
    )
    const result = await generateJson(request('gemini'))
    expect(result.status).toBe('success')
    expect(result.providerMetadata).not.toHaveProperty('totalTokens')
  })

  it('preserves zero reported token usage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        ...successBody('anthropic'),
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    )
    expect(await generateJson(request('anthropic'))).toMatchObject({
      status: 'success',
      providerMetadata: { totalTokens: 0 },
    })
  })

  it('keeps unknown SDK failures controlled', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error(`private provider diagnostic ${API_KEY}`),
    )
    const result = await generateJson(request('openai'))
    expect(result).toMatchObject({ status: 'error', code: 'unknown' })
    expectSafe(result)
  })

  it('handles schema conversion exceptions before provider dispatch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const result = await generateJson({
      ...request('gemini'),
      schema: z.object({ ok: z.custom<true>() }),
    })
    expect(result).toMatchObject({ status: 'error', code: 'invalid-output' })
    expect(fetchMock).not.toHaveBeenCalled()
    expectSafe(result)
  })

  it('rejects unapproved endpoints before sending credentials', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(successBody('gemini')))
    const result = await generateJson(
      request('gemini', { baseUrl: 'https://unapproved.example' }),
    )
    expect(result).toMatchObject({ status: 'error', code: 'bad-request' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
