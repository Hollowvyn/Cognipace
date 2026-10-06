import { describe, expect, it } from 'vitest'

import {
  cancelLeetCodeHintsRequestSchema,
  cancelLeetCodeHintsResponseSchema,
  generateLeetCodeHintsRequestSchema,
  generateLeetCodeHintsResponseSchema,
  codeHintSchema,
  codeHintInputSchema,
  hintProblemSchema,
  makeHintInputFingerprint,
} from './code-hint-contracts'

const problem = {
  host: 'leetcode.com' as const,
  slug: 'two-sum',
  title: 'Two Sum',
  statement: 'Return two different indices whose values sum to target.',
  examples: ['nums=[2,7], target=9; output=[0,1]'],
  constraints: ['2 <= nums.length <= 10000'],
}

const request = {
  surface: 'content-script' as const,
  requestId: 'request-1',
  connectionRevision: '11111111-1111-4111-8111-111111111111',
  connectionProvider: 'gemini' as const,
  problem,
  snapshot: { code: '', language: 'javascript', capturedAt: 0 },
  history: [],
}

describe('code hint contracts', () => {
  it('requires a complete snapshot and prior history, preserving empty code', () => {
    expect(generateLeetCodeHintsRequestSchema.parse(request)).toEqual(request)
    const missing = { ...request }
    Reflect.deleteProperty(missing, 'snapshot')
    expect(generateLeetCodeHintsRequestSchema.safeParse(missing).success).toBe(
      false,
    )
    expect(
      codeHintSchema.parse({
        text: ' idea ',
        strength: 'light',
        progress: 'initial',
      }),
    ).toEqual({ text: 'idea', strength: 'light', progress: 'initial' })
  })

  it.each([
    { text: ' ' },
    { text: 'x'.repeat(601) },
    { strength: 'strong' },
    { progress: 'done' },
    { code: 'return answer' },
  ])('rejects malformed single hints %j', (change) => {
    expect(
      codeHintSchema.safeParse({
        text: 'idea',
        strength: 'light',
        progress: 'initial',
        ...change,
      }).success,
    ).toBe(false)
  })

  it.each([
    { code: 'x'.repeat(32001) },
    { language: ' ' },
    { language: 'x'.repeat(81) },
    { capturedAt: -1 },
    { capturedAt: Infinity },
    { extra: true },
  ])('rejects malformed snapshots %j', (change) => {
    expect(
      generateLeetCodeHintsRequestSchema.safeParse({
        ...request,
        snapshot: { ...request.snapshot, ...change },
      }).success,
    ).toBe(false)
  })

  it('accepts snapshot and hint text boundaries', () => {
    expect(
      codeHintInputSchema.safeParse({
        problem,
        snapshot: {
          code: 'x'.repeat(32000),
          language: 'x'.repeat(80),
          capturedAt: 0,
        },
        history: [],
      }).success,
    ).toBe(true)
    expect(
      codeHintSchema.safeParse({
        text: 'x'.repeat(600),
        strength: 'heavy',
        progress: 'stuck',
      }).success,
    ).toBe(true)
  })

  it('validates prior order, first light, unchanged escalation and duplicate hints', () => {
    const first = {
      snapshot: request.snapshot,
      hint: { text: 'idea', strength: 'light', progress: 'initial' },
    }
    const second = {
      snapshot: { ...request.snapshot, capturedAt: 1 },
      hint: { text: 'targeted change', strength: 'medium', progress: 'stuck' },
    }
    const parse = (history: unknown[]) =>
      codeHintInputSchema.safeParse({
        problem,
        snapshot: request.snapshot,
        history,
      }).success
    expect(parse([first, second])).toBe(true)
    expect(parse([first, second, second])).toBe(false)
    expect(parse([second, first])).toBe(false)
    expect(
      parse([{ ...first, hint: { ...first.hint, strength: 'medium' } }]),
    ).toBe(false)
    expect(
      parse([
        first,
        { ...second, hint: { ...second.hint, progress: 'initial' } },
      ]),
    ).toBe(false)
    expect(
      parse([
        first,
        {
          ...second,
          hint: { ...second.hint, progress: 'improved', strength: 'light' },
        },
      ]),
    ).toBe(false)
    expect(
      parse([first, { ...second, hint: { ...second.hint, text: ' idea ' } }]),
    ).toBe(false)
    expect(parse([{ ...first, private: true }])).toBe(false)
    expect(
      parse([
        first,
        {
          ...second,
          snapshot: { ...second.snapshot, code: 'changed' },
          hint: { ...second.hint, strength: 'light', progress: 'improved' },
        },
      ]),
    ).toBe(true)
  })

  it.each(['code', 'diagnostics', 'auth', 'hints', 'followUps'])(
    'rejects problem fields outside public input: %s',
    (field) => {
      expect(
        generateLeetCodeHintsRequestSchema.safeParse({
          ...request,
          problem: { ...problem, [field]: 'private-probe' },
        }).success,
      ).toBe(false)
    },
  )

  it.each([
    { problemSlug: 'three-sum' },
    { inputFingerprint: 'other-input' },
    { surface: 'dashboard' },
    { requestId: ' ' },
    { requestId: 'x'.repeat(161) },
    { connectionRevision: 'invalid-revision' },
    { connectionProvider: 'unknown-provider' },
    { auth: 'private-probe' },
  ])('rejects invalid request identity or envelope %j', (change) => {
    expect(
      generateLeetCodeHintsRequestSchema.safeParse({ ...request, ...change })
        .success,
    ).toBe(false)
  })

  it('rejects oversized serialized input without truncation', () => {
    const oversizedProblem = { ...problem, statement: 'x'.repeat(24000) }
    expect(
      generateLeetCodeHintsRequestSchema.safeParse({
        ...request,
        problem: oversizedProblem,
      }).success,
    ).toBe(false)
  })

  it('accepts the serialized size boundary with empty optional collections', () => {
    const boundaryProblem = {
      ...problem,
      statement: 'x',
      examples: [],
      constraints: [],
    }
    const overhead = JSON.stringify(boundaryProblem).length - 1
    boundaryProblem.statement = 'x'.repeat(24000 - overhead)
    const boundaryRequest = {
      ...request,
      problem: boundaryProblem,
    }
    expect(generateLeetCodeHintsRequestSchema.parse(boundaryRequest)).toEqual(
      boundaryRequest,
    )
    expect(
      hintProblemSchema.safeParse({
        ...boundaryProblem,
        statement: boundaryProblem.statement + 'x',
      }).success,
    ).toBe(false)
  })

  it.each([
    { host: 'example.com' },
    { title: ' ' },
    { title: 'x'.repeat(301) },
    { statement: ' ' },
    { examples: Array<string>(51).fill('') },
    { constraints: Array<string>(101).fill('') },
  ])('rejects invalid public problem bounds %j', (change) => {
    expect(hintProblemSchema.safeParse({ ...problem, ...change }).success).toBe(
      false,
    )
  })

  it('accepts www host and preserves exact public text identity regardless of property order', () => {
    const reordered = {
      constraints: problem.constraints,
      examples: problem.examples,
      statement: problem.statement,
      title: problem.title,
      slug: problem.slug,
      host: problem.host,
    }
    expect(makeHintInputFingerprint(reordered)).toBe(JSON.stringify(problem))
    const changed = {
      ...problem,
      host: 'www.leetcode.com' as const,
      title: ' Two Sum ',
    }
    expect(hintProblemSchema.parse(changed)).toEqual(changed)
    expect(makeHintInputFingerprint(changed)).not.toBe(
      makeHintInputFingerprint(problem),
    )
  })

  it('parses strict ready and controlled-error envelopes correlated by request id', () => {
    const identity = { requestId: request.requestId }
    const responses = [
      {
        status: 'ready',
        ...identity,
        hint: {
          text: 'Consider lookup.',
          strength: 'light',
          progress: 'initial',
        },
      },
      {
        status: 'error',
        ...identity,
        code: 'stale-configuration',
        message: '',
      },
    ]
    for (const response of responses) {
      const parsed = generateLeetCodeHintsResponseSchema.parse(response)
      expect(parsed).toEqual(response)
      expect(parsed.requestId).toBe(request.requestId)
      expect(
        generateLeetCodeHintsResponseSchema.safeParse({
          ...response,
          auth: 'private-probe',
        }).success,
      ).toBe(false)
    }
    expect(
      generateLeetCodeHintsResponseSchema.safeParse({
        ...responses[1],
        code: 'raw-provider-error',
      }).success,
    ).toBe(false)
    expect(
      generateLeetCodeHintsResponseSchema.safeParse({
        ...responses[1],
        message: 'x'.repeat(401),
      }).success,
    ).toBe(false)
  })

  it('parses cancellation without accepting a claimed owner', () => {
    const cancellation = { surface: 'content-script', requestId: 'request-1' }
    expect(cancelLeetCodeHintsRequestSchema.parse(cancellation)).toEqual(
      cancellation,
    )
    expect(
      cancelLeetCodeHintsRequestSchema.safeParse({
        ...cancellation,
        owner: '1:0',
      }).success,
    ).toBe(false)
    const response = { requestId: 'request-1', cancelled: false }
    expect(cancelLeetCodeHintsResponseSchema.parse(response)).toEqual(response)
    expect(
      cancelLeetCodeHintsResponseSchema.safeParse({ ...response, batch: {} })
        .success,
    ).toBe(false)
  })
})
