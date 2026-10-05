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

const loadConfig = vi.mocked(loadActiveProviderConfigSnapshot)
const analyzeMock = vi.mocked(analyzeCode)

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
const runAnalysis = (signal = new AbortController().signal) =>
  analyzeLeetCodeSubmissionInBackground(request, loadDb, signal)

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
  loadConfig.mockResolvedValue(snapshot)
  analyzeMock.mockResolvedValue(success())
})
afterEach(() => {
  vi.useRealTimers()
})

describe('trusted background submission analysis', () => {
  it('returns a ready report with five identity fields and one sole analysis call', async () => {
    const result = await runAnalysis()
    expect(result).toEqual({
      status: 'ready',
      ...analysisIdentity(request),
      report: makeValidAnalysis(),
      providerMetadata: metadata,
    })
    expectSafe(result)
    expect(analyzeMock).toHaveBeenCalledTimes(1)
    expect(loadConfig).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('passes only the remaining budget after database and key preparation', async () => {
    loadDb.mockImplementation(() => {
      vi.setSystemTime(Date.now() + 2_000)
      return Promise.resolve(db)
    })
    loadConfig.mockImplementation(() => {
      vi.setSystemTime(Date.now() + 3_000)
      return Promise.resolve(snapshot)
    })
    await runAnalysis()
    expect(analyzeMock).toHaveBeenCalledWith(
      request,
      config,
      expect.any(AbortSignal),
      25_000,
    )
    expect(analyzeMock).toHaveBeenCalledTimes(1)
  })

  it('returns actionable unavailable feedback without generation for missing configuration', async () => {
    loadConfig.mockResolvedValue(null)
    const result = await runAnalysis()
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'configuration',
    })
    if (result.status === 'unavailable')
      expect(result.message).toMatch(/enable.*settings/i)
    expectSafe(result)
    expect(analyzeMock).not.toHaveBeenCalled()
  })

  it.each(aiErrorCodes)(
    'returns the controlled SDK %s failure',
    async (code) => {
      analyzeMock.mockResolvedValue({
        status: 'error',
        code,
        message: 'Controlled SDK feedback.',
        providerMetadata: metadata,
      })
      const result = await runAnalysis()
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
      loadConfig.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(current)
      const result = await runAnalysis()
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
    analyzeMock.mockResolvedValue({
      status: 'error',
      code: 'auth',
      message: 'Controlled SDK feedback.',
      providerMetadata: metadata,
    })
    loadConfig.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(null)
    expect(await runAnalysis()).toMatchObject({
      status: 'error',
      code: 'stale-configuration',
    })
  })

  it.each(['database', 'key', 'generation', 'recheck'] as const)(
    'redacts unexpected %s failures',
    async (stage) => {
      const error = new Error(`${privateKey} ${rawBody}`)
      if (stage === 'database') loadDb.mockRejectedValue(error)
      if (stage === 'key') loadConfig.mockRejectedValue(error)
      if (stage === 'generation') analyzeMock.mockRejectedValue(error)
      if (stage === 'recheck')
        loadConfig.mockResolvedValueOnce(snapshot).mockRejectedValueOnce(error)
      const result = await runAnalysis()
      expect(result).toMatchObject({
        status: 'error',
        code: 'unknown',
        message: 'The submission could not be analyzed. Please retry.',
      })
      expectSafe(result)
    },
  )

  it.each([
    ['timeout', 'database'],
    ['timeout', 'key'],
    ['timeout', 'generation'],
    ['timeout', 'recheck'],
    ['cancelled', 'database'],
    ['cancelled', 'key'],
    ['cancelled', 'generation'],
    ['cancelled', 'recheck'],
  ] as const)(
    '%s while awaiting %s aborts and ignores late completion',
    async (code, stage) => {
      const stalled = deferred<never>()
      if (stage === 'database') loadDb.mockReturnValue(stalled.promise)
      if (stage === 'key') loadConfig.mockReturnValue(stalled.promise)
      if (stage === 'generation') analyzeMock.mockReturnValue(stalled.promise)
      if (stage === 'recheck')
        loadConfig
          .mockResolvedValueOnce(snapshot)
          .mockReturnValueOnce(stalled.promise)
      const controller = new AbortController()
      const pending = runAnalysis(controller.signal)
      await vi.advanceTimersByTimeAsync(code === 'timeout' ? 30_000 : 0)
      if (code === 'cancelled') controller.abort()
      const result = await pending
      expect(result).toMatchObject({ status: 'error', code })
      expectSafe(result)
      expect(vi.getTimerCount()).toBe(0)
      const callCount = loadConfig.mock.calls.length
      stalled.resolve(
        (stage === 'database'
          ? db
          : stage === 'generation'
            ? success()
            : snapshot) as never,
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(loadConfig).toHaveBeenCalledTimes(callCount)
      if (stage === 'generation' || stage === 'recheck')
        expect(analyzeMock.mock.calls[0]?.[2].aborted).toBe(true)
      else expect(analyzeMock).not.toHaveBeenCalled()
    },
  )

  it('never starts database work for an already cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await runAnalysis(controller.signal)
    expect(result).toMatchObject({ status: 'error', code: 'cancelled' })
    expectSafe(result)
    expect(loadDb).not.toHaveBeenCalled()
  })
})

it.each([
  'stable',
  'key',
  'same-key',
  'model',
  'provider',
  'removed-key',
  'disabled',
] as const)(
  'preserves requested OpenRouter identity and handles %s saved state after generation',
  async (kind) => {
    const routedConfig = {
      ...config,
      provider: 'openrouter' as const,
      model: 'openrouter/free',
    }
    const routedSnapshot = {
      config: routedConfig,
      identity: 'trusted-openrouter-snapshot',
    }
    const providerMetadata = {
      provider: 'openrouter' as const,
      model: 'openrouter/free',
      resolvedModel: 'test/served-model:free',
      durationMs: 7,
    }
    const current =
      kind === 'removed-key' || kind === 'disabled'
        ? null
        : {
            config:
              kind === 'model'
                ? { ...routedConfig, model: 'test/custom-model' }
                : kind === 'provider'
                  ? { ...routedConfig, provider: 'openai' as const }
                  : kind === 'key'
                    ? { ...routedConfig, apiKey: 'replacement-key' }
                    : routedConfig,
            identity:
              kind === 'stable' ? routedSnapshot.identity : `changed-${kind}`,
          }
    loadConfig
      .mockResolvedValueOnce(routedSnapshot)
      .mockResolvedValueOnce(current)
    analyzeMock.mockResolvedValue({
      status: 'success',
      data: makeValidAnalysis(),
      providerMetadata,
    })
    const result = await runAnalysis()
    expectSafe(result)
    expect(JSON.stringify(result)).not.toContain(routedSnapshot.identity)
    expect(analyzeMock).toHaveBeenCalledOnce()
    expect(loadConfig).toHaveBeenCalledTimes(2)
    if (kind === 'stable')
      expect(result).toEqual({
        status: 'ready',
        ...analysisIdentity(request),
        report: makeValidAnalysis(),
        providerMetadata,
      })
    else
      expect(result).toMatchObject({
        status: 'error',
        code: 'stale-configuration',
      })
    expect(vi.getTimerCount()).toBe(0)
  },
)
