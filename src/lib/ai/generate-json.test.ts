// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { generateJson } from './generate-json'
import { aiProviderIds } from './types'
import type { AiGenerateJsonRequest, AiProviderId } from './types'

const API_KEY = 'fake-provider-key-do-not-use'
const schema = z.strictObject({ ok: z.literal(true) })
const models = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-5-20250929',
  gemini: 'gemini-3.5-flash-lite',
  openrouter: 'openrouter/free',
}

function request(
  provider: AiProviderId,
  overrides: Partial<AiGenerateJsonRequest<{ ok: true }>> = {},
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

function successBody(provider: AiProviderId, text = '{"ok":true}') {
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
    case 'openrouter':
      return {
        id: 'gen_test',
        model: 'test/resolved-text-model:free',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
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

function errorBody(provider: AiProviderId, status: number, tag = 'generic') {
  const message = `private provider diagnostic ${API_KEY}`
  if (provider === 'openrouter')
    return {
      error: {
        code: status,
        message,
        metadata: { error_type: tag, raw: message },
      },
    }

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
  it.each(aiProviderIds)(
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
        },
      })
      expectSafe(result)
      if (provider !== 'openrouter')
        expect(result.providerMetadata).not.toHaveProperty('resolvedModel')
      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0]!
      const headers = new Headers(init?.headers)
      const body: unknown = JSON.parse(requestBodyText(init?.body))
      expect(body).not.toHaveProperty('temperature')
      expect(init?.signal).toBeDefined()
      expect(init?.redirect).toBe('error')
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
      } else if (provider === 'openrouter') {
        expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
        expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`)
        expect(body).toMatchObject({
          model: 'openrouter/free',
          max_tokens: 2048,
          response_format: {
            type: 'json_schema',
            json_schema: {
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['ok'],
                properties: { ok: { const: true, type: 'boolean' } },
              },
            },
          },
          provider: { require_parameters: true },
        })
        expect(body).toHaveProperty('provider', { require_parameters: true })
        expect(body).not.toHaveProperty('models')
        expect(body).not.toHaveProperty('route')
        expect(body).not.toHaveProperty('plugins')
        expect(result).toMatchObject({
          providerMetadata: {
            model: 'openrouter/free',
            resolvedModel: 'test/resolved-text-model:free',
          },
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

  it.each(aiProviderIds)(
    'keeps original literals, nullable fields and constraints for %s',
    async (provider) => {
      const refinement = vi.fn(() => Promise.resolve(true))
      const constrained = z
        .strictObject({
          ok: z.literal(true),
          name: z.string().min(2).max(5).nullable(),
          count: z.number().int().min(1).max(3),
          tags: z.array(z.enum(['a', 'b'])).max(2),
        })
        .refine(refinement)
      const payload = { ok: true, name: null, count: 2, tags: ['a'] }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(successBody(provider, JSON.stringify(payload))),
      )
      const result = await generateJson({
        ...request(provider),
        schema: constrained,
      })
      expect(result).toMatchObject({ status: 'success', data: payload })
      expect(refinement).toHaveBeenCalledOnce()
    },
  )

  it.each(aiProviderIds)(
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

  it.each(aiProviderIds)(
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

  it('keeps an explicit custom OpenRouter model and the full analysis token budget', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(successBody('openrouter')))
    const result = await generateJson(
      request('openrouter', {
        model: 'test/custom-model',
        maxOutputTokens: 8192,
      }),
    )
    expect(result).toMatchObject({
      status: 'success',
      providerMetadata: {
        model: 'test/custom-model',
        resolvedModel: 'test/resolved-text-model:free',
      },
    })
    const body: unknown = JSON.parse(
      requestBodyText(fetchMock.mock.calls[0]![1]?.body),
    )
    expect(body).toMatchObject({
      model: 'test/custom-model',
      max_tokens: 8192,
      provider: { require_parameters: true },
    })
    expect(body).not.toHaveProperty('models')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([
    undefined,
    '',
    '   ',
    'openrouter/free',
    'openrouter/auto',
    ' openrouter/free ',
    ' openrouter/auto ',
    'x'.repeat(121),
  ])('omits unusable OpenRouter served-model identity %j', async (model) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ ...successBody('openrouter'), model }),
    )
    const result = await generateJson(request('openrouter'))
    expect(result).toMatchObject({
      status: 'success',
      providerMetadata: { provider: 'openrouter', model: 'openrouter/free' },
    })
    if (result.status === 'success')
      expect(result.providerMetadata).not.toHaveProperty('resolvedModel')
  })

  it.each(['test/custom-model', ' test/custom-model '])(
    'omits a served-model identity equal to the requested custom model %s',
    async (model) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ ...successBody('openrouter'), model }),
      )
      const result = await generateJson(
        request('openrouter', { model: 'test/custom-model' }),
      )
      expect(result).toMatchObject({
        status: 'success',
        providerMetadata: { model: 'test/custom-model' },
      })
      if (result.status === 'success')
        expect(result.providerMetadata).not.toHaveProperty('resolvedModel')
    },
  )

  it.each([42, null])(
    'rejects invalid native OpenRouter model %j',
    async (model) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ ...successBody('openrouter'), model }),
      )
      const result = await generateJson(request('openrouter'))
      expect(result).toMatchObject({ status: 'error', code: 'invalid-output' })
      expectSafe(result)
    },
  )

  it('preserves a valid 120-character resolved ID without truncation', async () => {
    const model = `test/${'x'.repeat(115)}`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ ...successBody('openrouter'), model }),
    )
    expect(await generateJson(request('openrouter'))).toMatchObject({
      status: 'success',
      providerMetadata: { model: 'openrouter/free', resolvedModel: model },
    })
  })

  it.each([
    [400, 'bad-request'],
    [401, 'auth'],
    [402, 'billing'],
    [403, 'permission'],
    [404, 'model-unavailable'],
    [408, 'network'],
    [422, 'bad-request'],
    [429, 'rate-limit'],
    [500, 'network'],
    [502, 'network'],
    [503, 'network'],
    [504, 'network'],
  ] as const)(
    'normalizes OpenRouter HTTP and embedded numeric %s to %s',
    async (code, expected) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch')
      for (const transportStatus of [code, 200]) {
        fetchMock.mockClear()
        fetchMock.mockResolvedValue(
          jsonResponse(errorBody('openrouter', code), transportStatus),
        )
        const result = await generateJson(request('openrouter'))
        expect(result).toMatchObject({ status: 'error', code: expected })
        expectSafe(result)
        expect(fetchMock).toHaveBeenCalledOnce()
        if (result.status === 'error') {
          expect(result.providerMetadata).not.toHaveProperty('resolvedModel')
          if (expected === 'billing') {
            expect(result.message).toContain('OpenRouter balance')
            expect(result.message).toContain('key spending limit')
            expect(result.message).toContain('pending paid requests')
          }
          if (expected === 'model-unavailable') {
            expect(result.message).toContain('capabilities')
            expect(result.message).toContain('privacy')
          }
        }
      }
    },
  )

  it.each([
    ['authentication', 'auth'],
    ['permission_denied', 'permission'],
    ['payment_required', 'billing'],
    ['not_found', 'model-unavailable'],
    ['rate_limit_exceeded', 'rate-limit'],
    ['provider_overloaded', 'network'],
    ['provider_unavailable', 'network'],
    ['context_length_exceeded', 'bad-request'],
    ['max_tokens_exceeded', 'invalid-output'],
    ['token_limit_exceeded', 'bad-request'],
    ['string_too_long', 'bad-request'],
    ['invalid_request', 'bad-request'],
    ['invalid_prompt', 'bad-request'],
    ['precondition_failed', 'bad-request'],
    ['payload_too_large', 'bad-request'],
    ['unprocessable', 'bad-request'],
    ['content_policy_violation', 'refused'],
    ['refusal', 'refused'],
    ['server', 'network'],
    ['timeout', 'timeout'],
  ] as const)(
    'normalizes allowlisted OpenRouter metadata.error_type %s to %s',
    async (tag, code) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch')
      for (const transportStatus of [400, 200]) {
        fetchMock.mockClear()
        fetchMock.mockResolvedValue(
          jsonResponse(errorBody('openrouter', 400, tag), transportStatus),
        )
        const result = await generateJson(request('openrouter'))
        expect(result).toMatchObject({ status: 'error', code })
        expectSafe(result)
        expect(fetchMock).toHaveBeenCalledOnce()
      }
    },
  )

  it.each([undefined, '402', 402.5, 200, 499, 999, { code: 402 }])(
    'ignores unknown or unsafe embedded OpenRouter code %j',
    async (code) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          error: {
            code,
            type: 'authentication_error',
            message: `private provider diagnostic ${API_KEY} billing auth no endpoints`,
            metadata: {
              error_type: 'unrecognized_tag',
              raw: { code: 402, error_type: 'payment_required', key: API_KEY },
            },
          },
        }),
      )
      const result = await generateJson(request('openrouter'))
      expect(result).toMatchObject({ status: 'error', code: 'invalid-output' })
      expectSafe(result)
    },
  )

  it.each([402, 499])(
    'does not let embedded code %s override failing HTTP status',
    async (code) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(errorBody('openrouter', code), 401),
      )
      expect(await generateJson(request('openrouter'))).toMatchObject({
        status: 'error',
        code: 'auth',
      })
    },
  )

  it('keeps unknown OpenRouter 503 as network without inferring a privacy cause', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 503,
            message: `private provider diagnostic ${API_KEY} no endpoints match privacy`,
          },
        },
        503,
      ),
    )
    const result = await generateJson(request('openrouter'))
    expect(result).toMatchObject({ status: 'error', code: 'network' })
    expectSafe(result)
    if (result.status === 'error')
      expect(result.message).not.toContain('privacy')
  })

  it.each(['Payment_required', 'PAYMENT_REQUIRED', 'authentication_error'])(
    'ignores non-allowlisted OpenRouter metadata tag %s',
    async (tag) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(errorBody('openrouter', 400, tag)),
      )
      const result = await generateJson(request('openrouter'))
      expect(result).toMatchObject({ status: 'error', code: 'bad-request' })
      expectSafe(result)
    },
  )

  it.each(['openai', 'anthropic', 'gemini'] as const)(
    'ignores OpenRouter billing tags for direct provider %s',
    async (provider) => {
      const body = errorBody(provider, 402)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(
          {
            ...body,
            error: {
              ...body.error,
              metadata: { error_type: 'payment_required', raw: API_KEY },
            },
          },
          402,
        ),
      )
      const result = await generateJson(request(provider))
      expect(result).toMatchObject({ status: 'error', code: 'unknown' })
      expectSafe(result)
    },
  )

  it.each([
    ['content_filter', 'refused'],
    ['length', 'invalid-output'],
  ] as const)(
    'rejects native OpenRouter %s even when the response JSON is valid',
    async (finishReason, code) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          ...successBody('openrouter'),
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '{"ok":true}' },
              finish_reason: finishReason,
            },
          ],
        }),
      )
      const result = await generateJson(request('openrouter'))
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

  it.each([
    ['gemini', 'headers'],
    ['gemini', 'success body'],
    ['gemini', 'error body'],
    ['openrouter', 'headers'],
    ['openrouter', 'success body'],
    ['openrouter', 'error body'],
  ] as const)(
    'bounds stalled %s %s even when the transport ignores abort',
    async (provider, phase) => {
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
      const pending = generateJson(request(provider, { timeoutMs: 40 }))
      await vi.advanceTimersByTimeAsync(41)
      const result = await pending
      expect(result).toMatchObject({ status: 'error', code: 'timeout' })
      expectSafe(result)
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it.each(['gemini', 'openrouter'] as const)(
    'cancels %s promptly and prevents an already cancelled request from fetching',
    async (provider) => {
      vi.useFakeTimers()
      const controller = new AbortController()
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => new Promise(() => {}))
      const pending = generateJson(
        request(provider, { signal: controller.signal }),
      )
      await vi.advanceTimersByTimeAsync(1)
      controller.abort(new Error(`private provider diagnostic ${API_KEY}`))
      const result = await pending
      expect(result).toMatchObject({ status: 'error', code: 'cancelled' })
      expectSafe(result)
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
      fetchMock.mockClear()
      expect(
        await generateJson(request(provider, { signal: controller.signal })),
      ).toMatchObject({ status: 'error', code: 'cancelled' })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each(['gemini', 'openrouter'] as const)(
    'keeps the %s deadline active during asynchronous schema validation',
    async (provider) => {
      vi.useFakeTimers()
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(successBody(provider)),
      )
      const stalledSchema = schema.refine(
        async () => new Promise<boolean>(() => {}),
      )
      const pending = generateJson({
        ...request(provider),
        schema: stalledSchema,
        timeoutMs: 40,
      })
      await vi.advanceTimersByTimeAsync(41)
      expect(await pending).toMatchObject({ status: 'error', code: 'timeout' })
      expect(vi.getTimerCount()).toBe(0)
    },
  )

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

  it.each(aiProviderIds)(
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
})
