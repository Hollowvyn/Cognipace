import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadActiveProviderConfigSnapshot } from '@/features/genai/server/genai-settings-service'
import { aiErrorCodes } from '@/lib/ai/types'
import type { Db } from '@/platform/db'
import {
  analysisIdentity,
  analyzeLeetCodeSubmissionResponseSchema,
} from '../api/code-analysis-contracts'
import {
  makeAnalysisRequest,
  makeValidAnalysis,
} from '../testing/code-analysis-fixtures'
import { analyzeCode } from './code-analysis-service'
import { analyzeLeetCodeSubmissionInBackground } from './analysis-runtime-service'

vi.mock('@/features/genai/server/genai-settings-service', () => ({
  loadActiveProviderConfigSnapshot: vi.fn(),
}))
vi.mock('./code-analysis-service', () => ({ analyzeCode: vi.fn() }))

const privateKey = 'fake-private-key'
const rawBody = 'raw-provider-exception-body'
const config = {
  provider: 'openai' as const,
  model: 'gpt-test',
  apiKey: privateKey,
}
const snapshot = { config, identity: `trusted-identity-${privateKey}` }
const metadata = {
  provider: config.provider,
  model: config.model,
  durationMs: 7,
}
const db = { kind: 'test-db' } as unknown as Db
const loadDb = vi.fn(() => Promise.resolve(db))
const request = makeAnalysisRequest()
const success = () => ({
  status: 'success' as const,
  data: makeValidAnalysis(),
  providerMetadata: metadata,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}
function expectSafe(result: unknown) {
  expect(
    analyzeLeetCodeSubmissionResponseSchema.safeParse(result).success,
  ).toBe(true)
  expect(result).toMatchObject(analysisIdentity(request))
  for (const value of [
    privateKey,
    rawBody,
    snapshot.identity,
    'apiKey',
    'identity',
  ])
    expect(JSON.stringify(result)).not.toContain(value)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  loadDb.mockResolvedValue(db)
  vi.mocked(loadActiveProviderConfigSnapshot).mockResolvedValue(snapshot)
  vi.mocked(analyzeCode).mockResolvedValue(success())
})
afterEach(() => {
  vi.useRealTimers()
})

describe('trusted background submission analysis', () => {
  it('returns a ready report with five identity fields and one sole analysis call', async () => {
    const result = await analyzeLeetCodeSubmissionInBackground(
      request,
      loadDb,
      new AbortController().signal,
    )
    expect(result).toEqual({
      status: 'ready',
      ...analysisIdentity(request),
      report: makeValidAnalysis(),
      providerMetadata: metadata,
    })
    expectSafe(result)
    expect(analyzeCode).toHaveBeenCalledTimes(1)
    expect(loadActiveProviderConfigSnapshot).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('passes only the remaining budget after database and key preparation', async () => {
    loadDb.mockImplementation(() => {
      vi.setSystemTime(Date.now() + 2_000)
      return Promise.resolve(db)
    })
    vi.mocked(loadActiveProviderConfigSnapshot).mockImplementation(() => {
      vi.setSystemTime(Date.now() + 3_000)
      return Promise.resolve(snapshot)
    })
    await analyzeLeetCodeSubmissionInBackground(
      request,
      loadDb,
      new AbortController().signal,
    )
    expect(analyzeCode).toHaveBeenCalledWith(
      request,
      config,
      expect.any(AbortSignal),
      25_000,
    )
    expect(analyzeCode).toHaveBeenCalledTimes(1)
  })

  it('returns actionable unavailable feedback without generation for missing configuration', async () => {
    vi.mocked(loadActiveProviderConfigSnapshot).mockResolvedValue(null)
    const result = await analyzeLeetCodeSubmissionInBackground(
      request,
      loadDb,
      new AbortController().signal,
    )
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'configuration',
    })
    if (result.status === 'unavailable')
      expect(result.message).toMatch(/enable.*settings/i)
    expectSafe(result)
    expect(analyzeCode).not.toHaveBeenCalled()
  })

  it.each(aiErrorCodes)(
    'returns the controlled SDK %s failure',
    async (code) => {
      vi.mocked(analyzeCode).mockResolvedValue({
        status: 'error',
        code,
        message: 'Controlled SDK feedback.',
        providerMetadata: metadata,
      })
      const result = await analyzeLeetCodeSubmissionInBackground(
        request,
        loadDb,
        new AbortController().signal,
      )
      expect(result).toMatchObject({
        status: 'error',
        code,
        message: 'Controlled SDK feedback.',
      })
      expectSafe(result)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it.each(['key', 'model', 'provider', 'disabled', 'removed-key'] as const)(
    'rejects a result when %s changes during generation',
    async (kind) => {
      const current =
        kind === 'disabled' || kind === 'removed-key'
          ? null
          : {
              config:
                kind === 'model'
                  ? { ...config, model: 'other-model' }
                  : kind === 'provider'
                    ? { ...config, provider: 'gemini' as const }
                    : { ...config, apiKey: 'replacement-key' },
              identity: `changed-${kind}`,
            }
      vi.mocked(loadActiveProviderConfigSnapshot)
        .mockResolvedValueOnce(snapshot)
        .mockResolvedValueOnce(current)
      const result = await analyzeLeetCodeSubmissionInBackground(
        request,
        loadDb,
        new AbortController().signal,
      )
      expect(result).toMatchObject({
        status: 'error',
        code: 'stale-configuration',
      })
      if (result.status === 'error')
        expect(result.message).toMatch(/retry.*saved connection/i)
      expectSafe(result)
    },
  )

  it('rejects a stale configuration even when generation returns a controlled failure', async () => {
    vi.mocked(analyzeCode).mockResolvedValue({
      status: 'error',
      code: 'auth',
      message: 'Controlled SDK feedback.',
      providerMetadata: metadata,
    })
    vi.mocked(loadActiveProviderConfigSnapshot)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(null)
    expect(
      await analyzeLeetCodeSubmissionInBackground(
        request,
        loadDb,
        new AbortController().signal,
      ),
    ).toMatchObject({ status: 'error', code: 'stale-configuration' })
  })

  it.each(['database', 'key', 'generation', 'recheck'] as const)(
    'redacts unexpected %s failures',
    async (stage) => {
      const error = new Error(`${privateKey} ${rawBody}`)
      if (stage === 'database') loadDb.mockRejectedValue(error)
      if (stage === 'key')
        vi.mocked(loadActiveProviderConfigSnapshot).mockRejectedValue(error)
      if (stage === 'generation')
        vi.mocked(analyzeCode).mockRejectedValue(error)
      if (stage === 'recheck')
        vi.mocked(loadActiveProviderConfigSnapshot)
          .mockResolvedValueOnce(snapshot)
          .mockRejectedValueOnce(error)
      const result = await analyzeLeetCodeSubmissionInBackground(
        request,
        loadDb,
        new AbortController().signal,
      )
      expect(result).toMatchObject({
        status: 'error',
        code: 'unknown',
        message: 'The submission could not be analyzed. Please retry.',
      })
      expectSafe(result)
    },
  )

  it.each(['database', 'key', 'generation', 'recheck'] as const)(
    'bounds an unresolved %s stage, aborts, and ignores late completion',
    async (stage) => {
      const stalled = deferred<never>()
      if (stage === 'database') loadDb.mockReturnValue(stalled.promise)
      if (stage === 'key')
        vi.mocked(loadActiveProviderConfigSnapshot).mockReturnValue(
          stalled.promise,
        )
      if (stage === 'generation')
        vi.mocked(analyzeCode).mockReturnValue(stalled.promise)
      if (stage === 'recheck')
        vi.mocked(loadActiveProviderConfigSnapshot)
          .mockResolvedValueOnce(snapshot)
          .mockReturnValueOnce(stalled.promise)
      const pending = analyzeLeetCodeSubmissionInBackground(
        request,
        loadDb,
        new AbortController().signal,
      )
      await vi.advanceTimersByTimeAsync(30_000)
      const result = await pending
      expect(result).toMatchObject({ status: 'error', code: 'timeout' })
      expectSafe(result)
      expect(vi.getTimerCount()).toBe(0)
      const callCount = vi.mocked(loadActiveProviderConfigSnapshot).mock.calls
        .length
      stalled.resolve(
        (stage === 'database'
          ? db
          : stage === 'generation'
            ? success()
            : snapshot) as never,
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(loadActiveProviderConfigSnapshot).toHaveBeenCalledTimes(callCount)
      if (stage === 'generation' || stage === 'recheck')
        expect(vi.mocked(analyzeCode).mock.calls[0]?.[2].aborted).toBe(true)
      else expect(analyzeCode).not.toHaveBeenCalled()
    },
  )

  it.each(['database', 'key', 'generation', 'recheck'] as const)(
    'cancels an unresolved %s stage immediately',
    async (stage) => {
      const stalled = deferred<never>()
      if (stage === 'database') loadDb.mockReturnValue(stalled.promise)
      if (stage === 'key')
        vi.mocked(loadActiveProviderConfigSnapshot).mockReturnValue(
          stalled.promise,
        )
      if (stage === 'generation')
        vi.mocked(analyzeCode).mockReturnValue(stalled.promise)
      if (stage === 'recheck')
        vi.mocked(loadActiveProviderConfigSnapshot)
          .mockResolvedValueOnce(snapshot)
          .mockReturnValueOnce(stalled.promise)
      const controller = new AbortController()
      const pending = analyzeLeetCodeSubmissionInBackground(
        request,
        loadDb,
        controller.signal,
      )
      await vi.advanceTimersByTimeAsync(0)
      controller.abort()
      const result = await pending
      expect(result).toMatchObject({ status: 'error', code: 'cancelled' })
      expectSafe(result)
      expect(vi.getTimerCount()).toBe(0)
      stalled.resolve(
        (stage === 'database'
          ? db
          : stage === 'generation'
            ? success()
            : snapshot) as never,
      )
      await vi.advanceTimersByTimeAsync(0)
      if (stage === 'database' || stage === 'key')
        expect(analyzeCode).not.toHaveBeenCalled()
    },
  )

  it('never starts database work for an already cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await analyzeLeetCodeSubmissionInBackground(
      request,
      loadDb,
      controller.signal,
    )
    expect(result).toMatchObject({ status: 'error', code: 'cancelled' })
    expectSafe(result)
    expect(loadDb).not.toHaveBeenCalled()
  })
})
