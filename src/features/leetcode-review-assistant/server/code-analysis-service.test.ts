import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai', () => ({ generateJson: vi.fn() }))
import { generateJson } from '@/lib/ai'
import { aiErrorCodes, type AiProviderConfig } from '@/lib/ai/types'

import { codeAnalysisSchema } from '../domain/code-analysis-schema'
import {
  makeAnalysisRequest,
  makeValidAnalysis,
} from '../testing/code-analysis-fixtures'
import { analyzeCode } from './code-analysis-service'

const config: AiProviderConfig = {
  provider: 'gemini',
  model: 'fixture-model',
  apiKey: 'fixture-secret',
}
const metadata = {
  provider: 'gemini' as const,
  model: 'fixture-model',
  durationMs: 10,
}

beforeEach(() => vi.mocked(generateJson).mockReset())

describe('analyzeCode', () => {
  it.each([
    { config, metadata, timeoutMs: 12345 },
    {
      config: {
        ...config,
        provider: 'openrouter' as const,
        model: 'openrouter/free',
      },
      metadata: {
        ...metadata,
        provider: 'openrouter' as const,
        model: 'openrouter/free',
        resolvedModel: 'test/served-model:free',
      },
      timeoutMs: 30000,
    },
  ])(
    'uses one bounded SDK generation and returns the consistent $config.provider report',
    async ({ config, metadata, timeoutMs }) => {
      const report = makeValidAnalysis()
      vi.mocked(generateJson).mockResolvedValue({
        status: 'success',
        data: report,
        providerMetadata: metadata,
      })
      const request = makeAnalysisRequest()
      const signal = new AbortController().signal
      expect(await analyzeCode(request, config, signal, timeoutMs)).toEqual({
        status: 'success',
        data: report,
        providerMetadata: metadata,
      })
      expect(generateJson).toHaveBeenCalledTimes(1)
      const call = vi.mocked(generateJson).mock.calls[0]?.[0]
      if (!call) throw new Error('Expected one SDK generation.')
      expect(call.prompt.system).toContain('leetcode-code-analysis-v1')
      expect(call).toEqual({
        ...config,
        prompt: {
          system: call.prompt.system,
          user: JSON.stringify({
            problem: request.problem,
            submission: request.submission,
          }),
        },
        schema: codeAnalysisSchema,
        signal,
        timeoutMs,
        maxOutputTokens: 8192,
      })
    },
  )

  it.each(['strategy', 'language'] as const)(
    'rejects inconsistent %s without downgrading or another call',
    async (kind) => {
      const report = makeValidAnalysis()
      if (kind === 'strategy') report.approach.score = 5
      else report.suggestedImplementation!.language = 'Kotlin'
      vi.mocked(generateJson).mockResolvedValue({
        status: 'success',
        data: report,
        providerMetadata: metadata,
      })
      const result = await analyzeCode(
        makeAnalysisRequest(),
        config,
        new AbortController().signal,
        30000,
      )
      expect(result).toEqual({
        status: 'error',
        code: 'invalid-output',
        message: 'AI returned inconsistent analysis. Retry this submission.',
        providerMetadata: metadata,
      })
      expect(generateJson).toHaveBeenCalledTimes(1)
      expect(report.approach.score).toBe(kind === 'strategy' ? 5 : 3)
    },
  )

  it.each(aiErrorCodes)(
    'returns the controlled SDK error %s unchanged',
    async (code) => {
      const error = {
        status: 'error' as const,
        code,
        message: 'Controlled SDK message.',
        providerMetadata: metadata,
      }
      vi.mocked(generateJson).mockResolvedValue(error)
      expect(
        await analyzeCode(
          makeAnalysisRequest(),
          config,
          new AbortController().signal,
          30000,
        ),
      ).toEqual(error)
      expect(generateJson).toHaveBeenCalledTimes(1)
    },
  )
})
