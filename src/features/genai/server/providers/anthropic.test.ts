import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { GenAiGenerateJsonRequest } from '../../domain'
import {
  makeAnthropicSuccessResponse,
  makeProviderErrorResponse,
} from '../../testing/genai-fixtures'
import { requestJson } from './anthropic'

const schema = z.object({
  rating: z.enum(['again', 'hard', 'good', 'easy']),
  confidence: z.number(),
})
type Payload = z.infer<typeof schema>

const API_KEY = 'sk-ant-secret-1234567890'

function buildRequest(
  overrides: Partial<GenAiGenerateJsonRequest<Payload>> = {},
): GenAiGenerateJsonRequest<Payload> {
  return {
    provider: 'anthropic',
    model: 'claude-test',
    apiKey: API_KEY,
    prompt: { system: 'sys', user: 'user' },
    schema,
    ...overrides,
  }
}

describe('anthropic requestJson', () => {
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
      makeAnthropicSuccessResponse(payload),
    )

    const result = await requestJson(buildRequest())

    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.data).toEqual(payload)
      expect(result.providerMetadata).toMatchObject({
        provider: 'anthropic',
        model: 'claude-test',
        modelVersion: 'claude-test',
        totalTokens: 150,
      })
    }
  })

  it('reports totalTokens as 0 when both token counts are zero (cached prompt)', async () => {
    const payload: Payload = { rating: 'good', confidence: 0.9 }
    const body = {
      id: 'msg_test_zero',
      type: 'message',
      role: 'assistant',
      model: 'claude-test',
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    )

    const result = await requestJson(buildRequest())

    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.providerMetadata.totalTokens).toBe(0)
    }
  })

  it('returns invalid-output when schema validation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeAnthropicSuccessResponse({ rating: 'maybe', confidence: 0.5 }),
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
      content: [{ type: 'text', text: 'not json {' }],
      usage: { input_tokens: 1, output_tokens: 1 },
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

  it('returns invalid-output when content[] is missing from the response', async () => {
    const body = { usage: { input_tokens: 1, output_tokens: 1 } }
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
      makeProviderErrorResponse('anthropic', status),
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

  it('sends the prompt and schema in the Anthropic Messages body shape', async () => {
    const payload: Payload = { rating: 'good', confidence: 0.9 }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeAnthropicSuccessResponse(payload))

    await requestJson(buildRequest())

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const headers = init?.headers as Record<string, string>
    expect(headers['x-api-key']).toBe(API_KEY)
    expect(headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init?.body as string) as Record<string, unknown>
    expect(body.model).toBe('claude-test')
    expect(body.system).toBe('sys')
    expect(body.messages).toEqual([{ role: 'user', content: 'user' }])
    expect(body.output_config).toMatchObject({
      format: { type: 'json_schema' },
    })
    expect(
      (body.output_config as { format: { schema?: unknown } }).format.schema,
    ).toBeDefined()
  })
})
