import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GenAiTimeoutError,
  fetchWithTimeout,
  logProviderHttpFailure,
  mapHttpStatusToGenAiError,
  redactErrorMessage,
  readRedactedProviderResponseBody,
} from './shared'

describe('mapHttpStatusToGenAiError', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [500, 'network'],
    [502, 'network'],
    [503, 'network'],
    [400, 'unknown'],
    [404, 'unknown'],
  ] as const)('maps HTTP %s to %s', (status, expected) => {
    expect(mapHttpStatusToGenAiError(status)).toBe(expected)
  })

  it.each([200, 201, 204])('returns null for 2xx status %s', (status) => {
    expect(mapHttpStatusToGenAiError(status)).toBeNull()
  })
})

describe('redactErrorMessage', () => {
  it('formats an HTTP failure with status', () => {
    expect(
      redactErrorMessage({ provider: 'openai', cause: 'http', status: 429 }),
    ).toBe('openai request failed: HTTP 429')
  })

  it('formats a timeout', () => {
    expect(
      redactErrorMessage({ provider: 'anthropic', cause: 'timeout' }),
    ).toBe('anthropic request timed out')
  })

  it('formats a network failure', () => {
    expect(redactErrorMessage({ provider: 'gemini', cause: 'network' })).toBe(
      'gemini network request failed',
    )
  })

  it('formats an invalid-output failure', () => {
    expect(
      redactErrorMessage({ provider: 'openai', cause: 'invalid-output' }),
    ).toBe('openai returned output that failed schema validation')
  })

  it('formats unknown with a safe detail', () => {
    expect(
      redactErrorMessage({
        provider: 'openai',
        cause: 'unknown',
        detail: 'CORS preflight rejected',
      }),
    ).toBe('openai request failed: CORS preflight rejected')
  })

  it('omits trailing colon when no detail is provided', () => {
    expect(redactErrorMessage({ provider: 'openai', cause: 'unknown' })).toBe(
      'openai request failed',
    )
  })
})

describe('provider failure diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redacts known secrets from provider response bodies', async () => {
    const body = await readRedactedProviderResponseBody(
      new Response('{"error":"bad key sk-test-secret"}'),
      ['sk-test-secret'],
    )

    expect(body).toBe('{"error":"bad key [redacted-secret]"}')
  })

  it('logs provider, model, status, and redacted response body as an error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logProviderHttpFailure({
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      status: 400,
      responseBody: '{"error":"model not found"}',
    })

    expect(errorSpy).toHaveBeenCalledWith(
      '[CogniPace GenAI provider failure]',
      {
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        status: 400,
        responseBody: '{"error":"model not found"}',
      },
    )
  })
})

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('resolves with the Response when fetch completes before timeout', async () => {
    const response = new Response('{}', { status: 200 })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)

    const result = await fetchWithTimeout(
      'https://example.test/x',
      {},
      { timeoutMs: 5000 },
      (response) => Promise.resolve(response),
    )

    expect(result).toBe(response)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('keeps the deadline active through consumption and removes caller listeners', async () => {
    const caller = new AbortController()
    const remove = vi.spyOn(caller.signal, 'removeEventListener')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    const pending = fetchWithTimeout(
      'https://example.test/x',
      {},
      { timeoutMs: 1000, externalSignal: caller.signal },
      () => new Promise<never>(() => undefined),
    )
    const assertion = expect(pending).rejects.toBeInstanceOf(GenAiTimeoutError)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects an already aborted caller before fetching', async () => {
    const caller = new AbortController()
    caller.abort()
    const fetcher = vi.spyOn(globalThis, 'fetch')
    await expect(
      fetchWithTimeout(
        'https://example.test/x',
        {},
        { timeoutMs: 1000, externalSignal: caller.signal },
        (response) => response.json(),
      ),
    ).rejects.toBe(caller.signal.reason)
    expect(fetcher).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up timers and caller listeners on early success or failure', async () => {
    const caller = new AbortController()
    const remove = vi.spyOn(caller.signal, 'removeEventListener')
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'))
    await fetchWithTimeout(
      'https://example.test/x',
      {},
      { timeoutMs: 1000, externalSignal: caller.signal },
      (response) => response.text(),
    )
    expect(remove).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    fetcher.mockRejectedValue(new TypeError('Network failure'))
    await expect(
      fetchWithTimeout(
        'https://example.test/x',
        {},
        { timeoutMs: 1000, externalSignal: caller.signal },
        (response) => response.text(),
      ),
    ).rejects.toBeInstanceOf(TypeError)
    expect(remove).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects with GenAiTimeoutError when fetch hangs past the timeout', async () => {
    let abortReason: unknown = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            abortReason = (init.signal as AbortSignal & { reason?: unknown })
              .reason
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    const pending = fetchWithTimeout(
      'https://example.test/x',
      {},
      { timeoutMs: 5000 },
      (response) => Promise.resolve(response),
    )
    const expectTimeout =
      expect(pending).rejects.toBeInstanceOf(GenAiTimeoutError)

    await vi.advanceTimersByTimeAsync(5000)
    await expectTimeout

    expect(abortReason).toBeInstanceOf(GenAiTimeoutError)
  })

  it('re-throws the caller signal AbortError untouched', async () => {
    const callerController = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    const pending = fetchWithTimeout(
      'https://example.test/x',
      {},
      { timeoutMs: 5000, externalSignal: callerController.signal },
      (response) => Promise.resolve(response),
    )
    const expectAbort = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    })
    const expectNotTimeout =
      expect(pending).rejects.not.toBeInstanceOf(GenAiTimeoutError)

    callerController.abort()

    await expectAbort
    await expectNotTimeout
  })
})
