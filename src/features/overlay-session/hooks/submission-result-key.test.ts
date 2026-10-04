import { describe, expect, it } from 'vitest'

import type { LeetCodeSubmissionResult } from '@/lib/leetcode'

import { createSubmissionResultKey } from './submission-result-key'

describe('createSubmissionResultKey', () => {
  it('returns the same key for two equal results', () => {
    const a = createResult()
    const b = createResult()

    expect(createSubmissionResultKey(a)).toBe(createSubmissionResultKey(b))
  })

  it('returns different keys for results that differ on any captured field', () => {
    const baseline = createResult()
    const differentSubmissionId = createResult({ submissionId: 'sub-2' })
    const differentStatus = createResult({ status: 'wrong-answer' })
    const differentCode = createResult({
      resultCodeSnapshot: {
        ...baseline.resultCodeSnapshot,
        code: 'function changed() {}',
      },
    })

    expect(createSubmissionResultKey(baseline)).not.toBe(
      createSubmissionResultKey(differentSubmissionId),
    )
    expect(createSubmissionResultKey(baseline)).not.toBe(
      createSubmissionResultKey(differentStatus),
    )
    expect(createSubmissionResultKey(baseline)).not.toBe(
      createSubmissionResultKey(differentCode),
    )
  })

  it('keeps the key bounded when captured code is long', () => {
    const longCode = `function solution() { ${'return 1;'.repeat(100)} }`
    const result = createResult({
      resultCodeSnapshot: {
        code: longCode,
        language: 'typescript',
        source: 'api',
        completeness: 'complete',
        capturedAt: 999,
      },
    })

    const key = createSubmissionResultKey(result)

    expect(key.length).toBeLessThanOrEqual(200)
    expect(key).not.toContain(longCode)
  })
})

function createResult(
  overrides: Partial<LeetCodeSubmissionResult> = {},
): LeetCodeSubmissionResult {
  return {
    location: {
      slug: 'two-sum',
      url: 'https://leetcode.com/problems/two-sum/',
      host: 'leetcode.com',
    },
    submissionId: 'sub-1',
    source: 'api',
    status: 'accepted',
    statusText: 'Accepted',
    checkedAt: 1000,
    runtime: '42 ms',
    memory: '12 MB',
    passedTestCount: 10,
    totalTestCount: 10,
    failingTestcase: null,
    errorMessage: null,
    compileError: null,
    runtimeError: null,
    lastTestcase: null,
    codeOutput: null,
    expectedOutput: null,
    stdOutput: null,
    resultCodeSnapshot: {
      code: 'function solution() {}',
      language: 'typescript',
      source: 'api',
      completeness: 'complete',
      capturedAt: 999,
    },
    ...overrides,
  }
}
