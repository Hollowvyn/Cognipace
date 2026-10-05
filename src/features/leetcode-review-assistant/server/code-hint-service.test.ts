import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai')>()),
  generateJson: vi.fn(),
}))

import { generateJson, type AiProviderConfig } from '@/lib/ai'

import { hintBatchSchema, type HintProblem } from '../api/code-hint-contracts'
import { generateCodeHints } from './code-hint-service'

const problem: HintProblem = {
  host: 'leetcode.com',
  slug: 'two-sum',
  title: 'Two Sum',
  statement: 'Return indices',
  examples: [],
  constraints: ['Distinct indices'],
}
const config: AiProviderConfig = {
  provider: 'gemini',
  model: 'fixture-model',
  apiKey: 'private-key',
}

beforeEach(() => vi.mocked(generateJson).mockReset())

describe('generateCodeHints', () => {
  it('uses one bounded generation with only the quoted problem as user input', async () => {
    const result = {
      status: 'success' as const,
      data: { hints: ['Think about the complement of each value.'] },
      providerMetadata: {
        provider: config.provider,
        model: config.model,
        durationMs: 10,
      },
    }
    vi.mocked(generateJson).mockResolvedValue(result)
    const signal = new AbortController().signal

    expect(await generateCodeHints(problem, config, signal, 12345)).toEqual(
      result,
    )

    expect(generateJson).toHaveBeenCalledTimes(1)
    const call = vi.mocked(generateJson).mock.calls[0]?.[0]
    if (!call) throw new Error('Expected one SDK generation.')
    expect(call).toEqual({
      ...config,
      signal,
      timeoutMs: 12345,
      maxOutputTokens: 1024,
      schema: hintBatchSchema,
      prompt: {
        system: call.prompt.system,
        user: JSON.stringify(problem),
      },
    })
    expect(call.signal).toBe(signal)
    expect(JSON.parse(call.prompt.user)).toEqual(problem)
    expect(call.prompt.system).toContain('increasingly specific')
    expect(call.prompt.system).toContain('No code')
    expect(call.prompt.user).not.toContain('private-key')
  })
})
