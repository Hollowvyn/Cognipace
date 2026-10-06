import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readAiHintConnectionSnapshot } from '@/features/genai/server/genai-settings-service'
import type { Db } from '@/platform/db'

import {
  generateLeetCodeHintsRequestSchema,
  generateLeetCodeHintsResponseSchema,
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
  connectionRevision: revision,
  connectionProvider: config.provider,
  problem,
  snapshot: { code: '', language: 'javascript', capturedAt: 0 },
  history: [],
})
const hint = {
  text: 'Think about the complement of each value.',
  strength: 'light' as const,
  progress: 'initial' as const,
}
const metadata = {
  provider: config.provider,
  model: config.model,
  durationMs: 10,
}
const success = {
  status: 'success' as const,
  data: hint,
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
  expect(result).toMatchObject({ requestId: request.requestId })
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
  it('returns one ready hint correlated only by request id', async () => {
    const result = await runHints()
    expect(result).toEqual({
      status: 'ready',
      requestId: request.requestId,
      hint,
    })
    expectSafe(result)
    expect(generateHints).toHaveBeenCalledTimes(1)
    expect(generateHints).toHaveBeenCalledWith(
      {
        problem: request.problem,
        snapshot: request.snapshot,
        history: request.history,
      },
      config,
      expect.any(AbortSignal),
    )
    expect(readSnapshot).toHaveBeenCalledTimes(2)
    expect(readSnapshot).toHaveBeenNthCalledWith(1, db)
    expect(readSnapshot).toHaveBeenNthCalledWith(2, db)
  })

  it('rejects malformed snapshot history before trusted preparation', async () => {
    const malformed = {
      ...request,
      snapshot: { ...request.snapshot, code: 'x'.repeat(32001) },
    }
    const result = await generateLeetCodeHintsInBackground(
      malformed,
      loadDb,
      new AbortController().signal,
    )
    expect(result).toMatchObject({ status: 'error', code: 'bad-request' })
    expectSafe(result)
    expect(loadDb).not.toHaveBeenCalled()
    expect(generateHints).not.toHaveBeenCalled()
  })

  it('forwards the entire validated snapshot and prior hint to generation', async () => {
    const history = [{ snapshot: request.snapshot, hint }]
    const nextRequest = {
      ...request,
      snapshot: { ...request.snapshot, code: 'updated' },
      history,
    }
    generateHints.mockResolvedValue({
      ...success,
      data: { text: 'Next gap.', strength: 'light', progress: 'improved' },
    })
    const result = await generateLeetCodeHintsInBackground(
      nextRequest,
      loadDb,
      new AbortController().signal,
    )
    expect(result).toMatchObject({
      status: 'ready',
      hint: { strength: 'light', progress: 'improved' },
    })
    expect(generateHints).toHaveBeenCalledWith(
      { problem: request.problem, snapshot: nextRequest.snapshot, history },
      config,
      expect.any(AbortSignal),
    )
    expectSafe(result)
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
      requestId: request.requestId,
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
        requestId: request.requestId,
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
        requestId: request.requestId,
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
      requestId: request.requestId,
      code: 'invalid-output',
      message: 'Controlled SDK feedback.',
    })
    expectSafe(result)
    expect(generateHints).toHaveBeenCalledTimes(1)
  })

  it('propagates the whole-operation deadline after database and trusted preparation', async () => {
    loadDb.mockImplementation(() => {
      return new Promise((resolve) => setTimeout(() => resolve(db), 2_000))
    })
    readSnapshot.mockImplementation(() => {
      return new Promise((resolve) =>
        setTimeout(() => resolve(snapshot), 3_000),
      )
    })
    generateHints.mockReturnValue(new Promise(() => {}))
    const pending = runHints()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(generateHints).toHaveBeenCalledTimes(1)
    const signal = generateHints.mock.calls[0]![2]
    expect(signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(25_000)
    expect(await pending).toMatchObject({ status: 'error', code: 'timeout' })
    expect(signal.aborted).toBe(true)
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
        requestId: request.requestId,
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
        requestId: request.requestId,
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
