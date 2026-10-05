import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readAiHintConnectionSnapshot } from '@/features/genai/server/genai-settings-service'
import type { Db } from '@/platform/db'

import {
  generateLeetCodeHintsRequestSchema,
  generateLeetCodeHintsResponseSchema,
  hintIdentity,
  makeHintInputFingerprint,
  type HintProblem,
} from '../api/code-hint-contracts'
import { generateCodeHints } from './code-hint-service'
import { generateLeetCodeHintsInBackground } from './hint-runtime-service'

vi.mock('@/features/genai/server/genai-settings-service', () => ({
  readAiHintConnectionSnapshot: vi.fn(),
}))
vi.mock('./code-hint-service', () => ({ generateCodeHints: vi.fn() }))

const readSnapshot = vi.mocked(readAiHintConnectionSnapshot)
const generateHints = vi.mocked(generateCodeHints)
const privateKey = 'private-key'
const config = {
  provider: 'gemini' as const,
  model: 'fixture-model',
  apiKey: privateKey,
}
const revision = '00000000-0000-4000-8000-000000000001'
const snapshot = {
  config,
  identity: `private-identity-${privateKey}`,
  status: { available: true, provider: config.provider, revision },
}
const problem: HintProblem = {
  host: 'leetcode.com',
  slug: 'two-sum',
  title: 'Two Sum',
  statement: 'Return indices',
  examples: [],
  constraints: ['Distinct indices'],
}
const request = generateLeetCodeHintsRequestSchema.parse({
  surface: 'content-script',
  requestId: 'hint-request-1',
  problemSlug: problem.slug,
  inputFingerprint: makeHintInputFingerprint(problem),
  connectionRevision: revision,
  connectionProvider: config.provider,
  problem,
})
const batch = { hints: ['Think about the complement of each value.'] }
const metadata = {
  provider: config.provider,
  model: config.model,
  durationMs: 10,
}
const success = {
  status: 'success' as const,
  data: batch,
  providerMetadata: metadata,
}
const db = { kind: 'test-db' } as unknown as Db
const loadDb = vi.fn(() => Promise.resolve(db))
const runHints = (signal = new AbortController().signal) =>
  generateLeetCodeHintsInBackground(request, loadDb, signal)

function expectSafe(result: unknown) {
  expect(generateLeetCodeHintsResponseSchema.safeParse(result).success).toBe(
    true,
  )
  expect(result).toMatchObject(hintIdentity(request))
  for (const value of ['private', 'apiKey', 'identity', 'providerMetadata'])
    expect(JSON.stringify(result)).not.toContain(value)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  loadDb.mockResolvedValue(db)
  readSnapshot.mockResolvedValue(snapshot)
  generateHints.mockResolvedValue(success)
})
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

describe('trusted background hints', () => {
  it('returns one ready batch with only the five public identity fields', async () => {
    const result = await runHints()
    expect(result).toEqual({ status: 'ready', ...hintIdentity(request), batch })
    expectSafe(result)
    expect(generateHints).toHaveBeenCalledTimes(1)
    expect(generateHints).toHaveBeenCalledWith(
      request.problem,
      config,
      expect.any(AbortSignal),
      30_000,
    )
    expect(readSnapshot).toHaveBeenCalledTimes(2)
    expect(readSnapshot).toHaveBeenNthCalledWith(1, db)
    expect(readSnapshot).toHaveBeenNthCalledWith(2, db)
  })

  it('returns a controlled missing-connection error without generation', async () => {
    readSnapshot.mockResolvedValue({
      ...snapshot,
      config: null,
      status: { ...snapshot.status, available: false },
    })
    const result = await runHints()
    expect(result).toEqual({
      status: 'error',
      ...hintIdentity(request),
      code: 'not-configured',
      message:
        'Save an AI provider, model, and key in Settings to request hints.',
    })
    expectSafe(result)
    expect(generateHints).not.toHaveBeenCalled()
  })

  it.each(['provider', 'revision'] as const)(
    'rejects an initially mismatched public connection %s before generation',
    async (field) => {
      readSnapshot.mockResolvedValue({
        ...snapshot,
        status:
          field === 'provider'
            ? { ...snapshot.status, provider: 'openai' }
            : {
                ...snapshot.status,
                revision: '00000000-0000-4000-8000-000000000002',
              },
      })
      const result = await runHints()
      expect(result).toEqual({
        status: 'error',
        ...hintIdentity(request),
        code: 'stale-configuration',
        message:
          'The saved AI connection changed. Retry with the current connection.',
      })
      expectSafe(result)
      expect(generateHints).not.toHaveBeenCalled()
    },
  )

  it.each(['success', 'error'] as const)(
    'discards a generated %s result when the private connection identity changes',
    async (status) => {
      if (status === 'error')
        generateHints.mockResolvedValue({
          status: 'error',
          code: 'auth',
          message: 'Controlled SDK feedback.',
          providerMetadata: metadata,
        })
      readSnapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({
        ...snapshot,
        identity: 'changed-private-identity',
      })
      const result = await runHints()
      expect(result).toEqual({
        status: 'error',
        ...hintIdentity(request),
        code: 'stale-configuration',
        message:
          'The saved AI connection changed. Retry with the current connection.',
      })
      expect(generateHints).toHaveBeenCalledTimes(1)
      expectSafe(result)
    },
  )

  it('forwards a normalized generation error without provider metadata', async () => {
    generateHints.mockResolvedValue({
      status: 'error',
      code: 'invalid-output',
      message: 'Controlled SDK feedback.',
      providerMetadata: metadata,
    })
    const result = await runHints()
    expect(result).toEqual({
      status: 'error',
      ...hintIdentity(request),
      code: 'invalid-output',
      message: 'Controlled SDK feedback.',
    })
    expectSafe(result)
    expect(generateHints).toHaveBeenCalledTimes(1)
  })

  it('passes only the remaining budget after database and trusted preparation', async () => {
    loadDb.mockImplementation(() => {
      vi.setSystemTime(Date.now() + 2_000)
      return Promise.resolve(db)
    })
    readSnapshot.mockImplementation(() => {
      vi.setSystemTime(Date.now() + 3_000)
      return Promise.resolve(snapshot)
    })
    await runHints()
    expect(generateHints).toHaveBeenCalledTimes(1)
    expect(generateHints).toHaveBeenCalledWith(
      request.problem,
      config,
      expect.any(AbortSignal),
      25_000,
    )
  })

  it.each(['database', 'trusted-storage', 'generation', 'recheck'] as const)(
    'redacts unexpected %s errors',
    async (stage) => {
      const error = new Error(privateKey)
      if (stage === 'database') loadDb.mockRejectedValue(error)
      if (stage === 'trusted-storage') readSnapshot.mockRejectedValue(error)
      if (stage === 'generation') generateHints.mockRejectedValue(error)
      if (stage === 'recheck')
        readSnapshot
          .mockResolvedValueOnce(snapshot)
          .mockRejectedValueOnce(error)
      const result = await runHints()
      expect(result).toEqual({
        status: 'error',
        ...hintIdentity(request),
        code: 'unknown',
        message: 'Hints could not finish. Retry this problem.',
      })
      expectSafe(result)
    },
  )

  it.each([
    ['timeout', 'database'],
    ['timeout', 'trusted-storage'],
    ['timeout', 'generation'],
    ['timeout', 'recheck'],
    ['cancelled', 'database'],
    ['cancelled', 'trusted-storage'],
    ['cancelled', 'generation'],
    ['cancelled', 'recheck'],
  ] as const)(
    '%s while awaiting %s ignores late completion',
    async (code, stage) => {
      const stalled = deferred<never>()
      if (stage === 'database') loadDb.mockReturnValue(stalled.promise)
      if (stage === 'trusted-storage')
        readSnapshot.mockReturnValue(stalled.promise)
      if (stage === 'generation') generateHints.mockReturnValue(stalled.promise)
      if (stage === 'recheck')
        readSnapshot
          .mockResolvedValueOnce(snapshot)
          .mockReturnValueOnce(stalled.promise)
      const controller = new AbortController()
      const pending = runHints(controller.signal)
      await vi.advanceTimersByTimeAsync(code === 'timeout' ? 30_000 : 0)
      if (code === 'cancelled') controller.abort()
      const result = await pending
      expect(result).toEqual({
        status: 'error',
        ...hintIdentity(request),
        code,
        message:
          code === 'timeout'
            ? 'Hints timed out. Retry this problem.'
            : 'Hints could not finish. Retry this problem.',
      })
      expectSafe(result)
      expect(vi.getTimerCount()).toBe(0)
      const readCount = readSnapshot.mock.calls.length
      stalled.resolve(
        (stage === 'database'
          ? db
          : stage === 'generation'
            ? success
            : snapshot) as never,
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(readSnapshot).toHaveBeenCalledTimes(readCount)
      if (stage === 'generation' || stage === 'recheck') {
        expect(generateHints).toHaveBeenCalledTimes(1)
        expect(generateHints.mock.calls[0]?.[2].aborted).toBe(true)
      } else expect(generateHints).not.toHaveBeenCalled()
    },
  )

  it('never loads the database for an already cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await runHints(controller.signal)
    expect(result).toMatchObject({ status: 'error', code: 'cancelled' })
    expectSafe(result)
    expect(loadDb).not.toHaveBeenCalled()
    expect(generateHints).not.toHaveBeenCalled()
  })
})
