import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { requestJson as requestAnthropicJson } from './anthropic'
import { requestJson as requestGeminiJson } from './gemini'
import { requestJson as requestOpenAiJson } from './openai'

const schema = z.object({ rating: z.enum(['again', 'hard', 'good', 'easy']) })
const providers = [
  {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test-secret-1234567890',
    requestJson: requestOpenAiJson,
  },
  {
    provider: 'anthropic',
    model: 'claude-test',
    apiKey: 'sk-ant-secret-1234567890',
    requestJson: requestAnthropicJson,
  },
  {
    provider: 'gemini',
    model: 'gemini-test',
    apiKey: 'AIzaSyTestSecret1234567890',
    requestJson: requestGeminiJson,
  },
] as const
const cases = providers.flatMap((provider) =>
  [200, 429].map((status) => ({ ...provider, status })),
)

function createStalledResponse(
  status: number,
  signal: AbortSignal | null | undefined,
  onStart?: () => void,
) {
  return new Response(
    new ReadableStream({
      start(controller) {
        onStart?.()
        signal?.addEventListener(
          'abort',
          () => controller.error(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      },
    }),
    { status },
  )
}

describe('provider response-body deadlines', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(cases)(
    '$provider times out a stalled HTTP $status response body',
    async ({ provider, model, apiKey, requestJson, status }) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) =>
        Promise.resolve(createStalledResponse(status, init?.signal)),
      )
      const pending = requestJson({
        provider,
        model,
        apiKey,
        prompt: { system: 'sys', user: 'user' },
        schema,
        timeoutMs: 1000,
      })
      let settled = false
      void pending.then(() => {
        settled = true
      })

      await vi.advanceTimersByTimeAsync(1000)

      expect(settled).toBe(true)
      const result = await pending
      expect(result).toMatchObject({ status: 'error', code: 'timeout' })
      if (result.status === 'error')
        expect(result.message).not.toContain(apiKey)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it.each(cases)(
    '$provider preserves caller cancellation during HTTP $status body consumption',
    async ({ provider, model, apiKey, requestJson, status }) => {
      const caller = new AbortController()
      let bodyStarted!: () => void
      const started = new Promise<void>((resolve) => {
        bodyStarted = resolve
      })
      vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) =>
        Promise.resolve(
          createStalledResponse(status, init?.signal, bodyStarted),
        ),
      )
      const pending = requestJson({
        provider,
        model,
        apiKey,
        prompt: { system: 'sys', user: 'user' },
        schema,
        signal: caller.signal,
      })
      const rejection = pending.then(
        () => null,
        (error: unknown) => error,
      )

      await started
      caller.abort()

      const error = await rejection
      expect(error).toMatchObject({ name: 'AbortError' })
      expect(
        error instanceof Error ? error.message : String(error),
      ).not.toContain(apiKey)
      expect(vi.getTimerCount()).toBe(0)
    },
  )
})
