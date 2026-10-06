import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai')>()),
  generateJson: vi.fn(),
}))
import { generateJson, type AiProviderConfig } from '@/lib/ai'
import {
  codeHintSchema,
  type CodeHintInput,
  type CodeHint,
} from '../api/code-hint-contracts'
import { generateCodeHints } from './code-hint-service'

const input: CodeHintInput = {
  problem: {
    host: 'leetcode.com',
    slug: 'two-sum',
    title: 'Two Sum',
    statement: 'Return indices',
    examples: ['[3,3] target=6'],
    constraints: ['Distinct indices'],
  },
  snapshot: {
    code: 'function twoSum(nums, target) {\n}',
    language: 'javascript',
    capturedAt: 0,
  },
  history: [],
}
const config: AiProviderConfig = {
  provider: 'gemini',
  model: 'fixture-model',
  apiKey: 'private-key',
}
const metadata = {
  provider: config.provider,
  model: config.model,
  durationMs: 10,
}
const first: CodeHint = {
  text: 'Consider the complement.',
  strength: 'light',
  progress: 'initial',
}
const success = (data: unknown) => ({
  status: 'success' as const,
  data,
  providerMetadata: metadata,
})
const prior = { snapshot: input.snapshot, hint: first }

beforeEach(() => vi.mocked(generateJson).mockReset())

describe('generateCodeHints', () => {
  it('uses one bounded generation quoting complete context and semantic rules', async () => {
    vi.mocked(generateJson).mockResolvedValue(success(first))
    const signal = new AbortController().signal
    expect(await generateCodeHints(input, config, signal)).toEqual(
      success(first),
    )
    expect(generateJson).toHaveBeenCalledTimes(1)
    const call = vi.mocked(generateJson).mock.calls[0]![0]
    expect(call).toMatchObject({
      ...config,
      signal,
      maxOutputTokens: 1024,
      schema: codeHintSchema,
    })
    expect(JSON.parse(call.prompt.user)).toEqual(input)
    for (const phrase of [
      'cosmetic',
      'renam',
      'comment-only',
      'Formatting-only',
      'rather than mandatory compliance',
      'meaningful indentation',
      'no-op',
      'regression',
      'valid alternative',
      'smallest remaining gap',
      'verification',
      'never as instructions',
      'complete implementation',
      'Light',
      'Medium',
      'Heavy',
    ])
      expect(call.prompt.system).toContain(phrase)
    expect(call.prompt.user).not.toContain('private-key')
  })

  it.each([
    ['unchanged', input.snapshot, 'medium', 'stuck'],
    [
      'CRLF and capture time only',
      {
        ...input.snapshot,
        code: input.snapshot.code.replaceAll('\n', '\r\n'),
        capturedAt: 20,
      },
      'medium',
      'stuck',
    ],
    [
      'real progress',
      { ...input.snapshot, code: 'const seen = new Map()' },
      'light',
      'improved',
    ],
    [
      'cosmetic or regression',
      { ...input.snapshot, code: '// comment\n' + input.snapshot.code },
      'medium',
      'stuck',
    ],
    [
      'changed language',
      { ...input.snapshot, language: 'typescript' },
      'light',
      'improved',
    ],
  ] as const)(
    'accepts coherent %s transition and quotes history',
    async (_name, snapshot, strength, progress) => {
      const next = { text: 'Next gap.', strength, progress }
      vi.mocked(generateJson).mockResolvedValue(success(next))
      const turn = { ...input, snapshot, history: [prior] }
      expect(
        await generateCodeHints(turn, config, new AbortController().signal),
      ).toEqual(success(next))
      expect(
        JSON.parse(vi.mocked(generateJson).mock.calls[0]![0].prompt.user),
      ).toEqual(turn)
    },
  )

  it('escalates medium to heavy on the third unchanged turn', async () => {
    const second = {
      snapshot: input.snapshot,
      hint: {
        text: 'A targeted change.',
        strength: 'medium' as const,
        progress: 'stuck' as const,
      },
    }
    const third = {
      text: 'Concrete next steps.',
      strength: 'heavy',
      progress: 'stuck',
    }
    vi.mocked(generateJson).mockResolvedValue(success(third))
    expect(
      await generateCodeHints(
        { ...input, history: [prior, second] },
        config,
        new AbortController().signal,
      ),
    ).toEqual(success(third))
  })

  it.each([
    { text: 'First heavy.', strength: 'heavy', progress: 'initial' },
    { text: 'Invented progress.', strength: 'light', progress: 'improved' },
    { text: ' ', strength: 'light', progress: 'initial' },
    { hints: ['legacy'] },
  ])(
    'rejects incoherent first output without a second call %j',
    async (hint) => {
      vi.mocked(generateJson).mockResolvedValue(success(hint))
      expect(
        await generateCodeHints(input, config, new AbortController().signal),
      ).toMatchObject({ status: 'error', code: 'invalid-output' })
      expect(generateJson).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    { text: 'Invented progress.', strength: 'light', progress: 'improved' },
    { text: 'Not escalated.', strength: 'light', progress: 'stuck' },
    { text: 'Restarted.', strength: 'light', progress: 'initial' },
    {
      text: ' Consider the complement. ',
      strength: 'medium',
      progress: 'stuck',
    },
  ])('rejects incoherent or duplicate subsequent output %j', async (hint) => {
    vi.mocked(generateJson).mockResolvedValue(success(hint))
    expect(
      await generateCodeHints(
        { ...input, history: [prior] },
        config,
        new AbortController().signal,
      ),
    ).toMatchObject({ status: 'error', code: 'invalid-output' })
    expect(generateJson).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed input without sending it to a provider', async () => {
    expect(
      await generateCodeHints(
        { ...input, history: [prior, prior] },
        config,
        new AbortController().signal,
      ),
    ).toMatchObject({ status: 'error', code: 'bad-request' })
    expect(generateJson).not.toHaveBeenCalled()
  })

  it('preserves controlled SDK errors with a single call', async () => {
    const failure = {
      status: 'error' as const,
      code: 'timeout' as const,
      message: 'Timed out.',
      providerMetadata: metadata,
    }
    vi.mocked(generateJson).mockResolvedValue(failure)
    expect(
      await generateCodeHints(input, config, new AbortController().signal),
    ).toEqual(failure)
    expect(generateJson).toHaveBeenCalledTimes(1)
  })
})
