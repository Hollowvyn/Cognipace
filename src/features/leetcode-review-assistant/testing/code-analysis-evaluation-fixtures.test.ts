import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

import { analyzeLeetCodeSubmissionRequestSchema } from '../api/code-analysis-contracts'
import { buildCodeAnalysisPrompt } from '../server/build-code-analysis-prompt'
import { codeAnalysisEvaluationFixtures } from './code-analysis-evaluation-fixtures'

function fixture(id: string) {
  const value = codeAnalysisEvaluationFixtures.find((entry) => entry.id === id)
  if (!value) throw new Error(`Missing evaluation fixture: ${id}`)
  return value
}

function executeAuthoredTwoSum(id: string, nums: number[], target: number) {
  const source = fixture(id).request.submission.code
  const callable: unknown = runInNewContext(
    `${source}; twoSum`,
    {},
    { timeout: 1000 },
  )
  if (typeof callable !== 'function')
    throw new Error('Expected the authored twoSum function.')
  const twoSum = callable as (values: number[], goal: number) => number[]
  return twoSum(nums, target)
}

function expectDistinctPair(
  indices: number[],
  nums: number[],
  target: number,
  base = 0,
) {
  expect(indices).toHaveLength(2)
  const [first, second] = indices.map((index) => index - base)
  expect(first).not.toBe(second)
  expect(first).toBeGreaterThanOrEqual(0)
  expect(second).toBeLessThan(nums.length)
  expect(nums[first!]! + nums[second!]!).toBe(target)
}

describe('code analysis evaluation inputs', () => {
  it('contains exactly the six distinct rubric cases', () => {
    expect(codeAnalysisEvaluationFixtures.map(({ id }) => id)).toEqual([
      'brute-force-linear-goal',
      'small-constant-space',
      'sorted-one-based',
      'insert-before-lookup',
      'kotlin-inferred-int',
      'kotlin-long-and-generic',
    ])
  })

  it('strictly parses complete requests with neutral titles and no invented measurements', () => {
    for (const { request } of codeAnalysisEvaluationFixtures) {
      expect(analyzeLeetCodeSubmissionRequestSchema.parse(request)).toEqual(
        request,
      )
      expect(['Two Sum', 'Search Insert Position', 'Running Sum']).toContain(
        request.problem.title,
      )
      expect(request.submission).toMatchObject({
        languageVersion: null,
        runtime: null,
        memory: null,
        passedTestCount: null,
        totalTestCount: null,
        omittedDiagnostics: [],
      })
      if (request.submission.status !== 'wrong-answer')
        expect(
          Object.values(request.submission.diagnostics).every(
            (value) => value === null,
          ),
        ).toBe(true)
    }
  })

  it('keeps fixture ids and human criteria out of model inputs', () => {
    for (const { id, request, criterion } of codeAnalysisEvaluationFixtures) {
      const prompt = buildCodeAnalysisPrompt(request)
      expect(prompt.user).not.toContain(id)
      expect(prompt.user).not.toContain(criterion)
    }
  })

  it('separates the linear-time goal from the small constant-space requirement without changing correct code', () => {
    const linear = fixture('brute-force-linear-goal')
    const small = fixture('small-constant-space')
    expect(linear.request.submission.code).toBe(small.request.submission.code)
    expect(linear.request.problem.followUps).toEqual([
      'Can you achieve expected O(n) time? Extra memory is allowed.',
    ])
    expect(linear.request.problem.constraints).toContain('2 <= n <= 10000.')
    expect(small.request.problem.constraints).toContain(
      '2 <= n <= 20 (at most 190 distinct index pairs).',
    )
    expect(small.request.problem.constraints).toContain(
      'Use O(1) auxiliary space and leave nums unchanged.',
    )
    expect(small.request.problem.followUps).toEqual([])
    for (const id of [linear.id, small.id]) {
      for (const [nums, target] of [
        [[2, 7, 11, 15], 9],
        [[3, 2, 4], 6],
        [[3, 3], 6],
        [[-5, 2, 8], 3],
      ] as const) {
        const input = [...nums]
        expectDistinctPair(
          executeAuthoredTwoSum(id, input, target),
          input,
          target,
        )
        expect(input).toEqual(nums)
      }
    }
  })

  it('preserves sorted nondecreasing input and ordered one-based output while exposing the map space violation', () => {
    const sorted = fixture('sorted-one-based').request
    expect(sorted.problem.statement).toContain('nondecreasing')
    expect(sorted.problem.constraints).toContain(
      'Use O(1) auxiliary space and leave numbers unchanged.',
    )
    const numbers = [2, 7, 11, 15]
    const indices = executeAuthoredTwoSum('sorted-one-based', numbers, 9)
    expect(Array.from(indices)).toEqual([1, 2])
    expectDistinctPair(indices, numbers, 9, 1)
    expect(numbers).toEqual([2, 7, 11, 15])
  })

  it('reproduces the authored wrong-answer diagnostic and its distinct-index contradiction', () => {
    const wrong = fixture('insert-before-lookup').request
    expect(wrong.submission.status).toBe('wrong-answer')
    expect(wrong.submission.diagnostics).toMatchObject({
      failingTestcase: 'nums = [3,2,4], target = 6',
      codeOutput: '[0,0]',
      expectedOutput: '[1,2] (either order is valid)',
    })
    expect(
      Array.from(executeAuthoredTwoSum('insert-before-lookup', [3, 2, 4], 6)),
    ).toEqual([0, 0])
  })

  it('defines Kotlin insertion boundaries without implying explicit Int annotations are invalid', () => {
    const kotlin = fixture('kotlin-inferred-int')
    expect(kotlin.request.problem.statement).toContain(
      'sorted in strictly increasing order',
    )
    expect(kotlin.request.problem.examples).toHaveLength(4)
    expect(kotlin.request.submission.code).toContain(
      'fun searchInsert(nums: IntArray, target: Int): Int',
    )
    expect(kotlin.request.submission.code).toContain(
      'var high: Int = nums.size',
    )
    expect(kotlin.criterion).toContain('optional')
  })

  it('requires inclusive Long prefix sums and preserves generic typing only when the empty collection is retained', () => {
    const kotlin = fixture('kotlin-long-and-generic')
    expect(kotlin.request.problem.statement).toContain(
      'output[i] = nums[0] + ... + nums[i]',
    )
    expect(kotlin.request.problem.examples).toContain(
      'nums = [2147483647,1]; output [2147483647L,2147483648L]',
    )
    expect(kotlin.request.problem.constraints).toContain(
      '-2147483648 <= nums[i] <= 2147483647; each value is a valid Kotlin Int.',
    )
    expect(kotlin.request.submission.code).toContain(
      'fun runningSum(nums: IntArray): LongArray',
    )
    expect(kotlin.request.submission.code).toContain('var total: Long = 0')
    expect(kotlin.request.submission.code).toContain(
      'val values: MutableList<Long> = mutableListOf()',
    )
    expect(kotlin.criterion).toContain('0L')
    expect(kotlin.criterion).toContain('excluding')
  })
})
