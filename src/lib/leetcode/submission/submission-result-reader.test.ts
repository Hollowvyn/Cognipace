import { describe, expect, it } from 'vitest'

import type { LeetCodeProblemLocation } from '../domain/types'
import {
  leetcodeAcceptedSubmissionResultHtml,
  leetcodeCompileErrorSubmissionResultHtml,
  leetcodePendingSubmissionPageHtml,
  leetcodeRuntimeErrorSubmissionResultHtml,
  leetcodeWrongAnswerSubmissionResultHtml,
} from '../testing/submission-result-fixtures'
import { readLeetCodeSubmissionResult } from './submission-result-reader'

const location = {
  slug: 'two-sum',
  url: 'https://leetcode.com/problems/two-sum/',
  host: 'leetcode.com',
} satisfies LeetCodeProblemLocation

describe('readLeetCodeSubmissionResult', () => {
  it('reads an accepted submission result with submitted result code', () => {
    const result = readResultFromHtml(
      leetcodeAcceptedSubmissionResultHtml,
      7000,
    )

    expect(result).toEqual({
      location,
      submissionId: '1234567890',
      source: 'dom',
      status: 'accepted',
      statusText: 'Accepted',
      checkedAt: 7000,
      runtime: '42 ms',
      memory: '16.7 MB',
      passedTestCount: 58,
      totalTestCount: 58,
      failingTestcase: null,
      errorMessage: null,
      compileError: null,
      runtimeError: null,
      lastTestcase: null,
      codeOutput: null,
      expectedOutput: null,
      stdOutput: null,
      resultCodeSnapshot: {
        code: 'class Solution:\n    def twoSum(self):\n        return []',
        language: 'Python3',
        source: 'code-block',
        completeness: 'partial',
        capturedAt: 7000,
      },
    })
  })

  it.each([
    {
      name: 'wrong answer',
      html: leetcodeWrongAnswerSubmissionResultHtml,
      now: 9000,
      expected: {
        status: 'wrong-answer',
        statusText: 'Wrong Answer',
        passedTestCount: 37,
        totalTestCount: 58,
        failingTestcase: 'nums = [3,2,4], target = 6',
        lastTestcase: 'nums = [3,2,4], target = 6',
        codeOutput: '[0,1]',
        expectedOutput: '[1,2]',
        resultCodeSnapshot: {
          code: null,
          language: null,
          source: 'none',
          completeness: 'missing',
        },
      },
    },
    {
      name: 'runtime error',
      html: leetcodeRuntimeErrorSubmissionResultHtml,
      now: 12000,
      expected: {
        status: 'runtime-error',
        errorMessage: 'IndexError: list index out of range',
        runtimeError: 'IndexError: list index out of range',
        compileError: null,
        lastTestcase: '[2,7,11,15] 9',
        codeOutput: '[]',
        expectedOutput: '[0,1]',
        stdOutput: 'before crash',
      },
    },
    {
      name: 'compile error',
      html: leetcodeCompileErrorSubmissionResultHtml,
      now: 13000,
      expected: {
        status: 'compile-error',
        errorMessage: "NameError: name 'List' is not defined",
        compileError: "NameError: name 'List' is not defined",
        runtimeError: null,
        stdOutput: 'compile stdout',
      },
    },
  ])('reads $name result details from the DOM', ({ html, now, expected }) => {
    expect(readResultFromHtml(html, now)).toMatchObject(expected)
  })

  it('reads result code from the page when the status root is separate', () => {
    const result = readResultFromHtml(
      `
        <main>
          <section data-e2e-locator="submission-result">
            <h3>Accepted</h3>
            <span>Runtime 9 ms</span>
            <span>Memory 17 MB</span>
          </section>
          <section>
            <h3>Code | Python3</h3>
            <pre>class Solution:
    pass</pre>
          </section>
        </main>
      `,
      10000,
    )

    expect(result?.resultCodeSnapshot).toEqual({
      code: 'class Solution:\n    pass',
      language: 'Python3',
      source: 'code-block',
      completeness: 'partial',
      capturedAt: 10000,
    })
  })

  it('ignores problem content that looks similar to a submission result', () => {
    document.body.innerHTML = `
      <main>
        <nav>Accepted</nav>
        <article>
          <h1>Two Sum</h1>
          <p>You may assume that each input would have exactly one solution.</p>
          <p>Example 1: Input: nums = [2,7,11,15], target = 9</p>
          <p>Output: [0,1]</p>
          <p>Expected: [0,1]</p>
          <h3>Code | Python3</h3>
          <pre>problem statement code snippet</pre>
        </article>
      </main>
    `

    expect(readLeetCodeSubmissionResult(document, { location })).toBeNull()
  })

  it('reads a bounded unlabelled result container', () => {
    const result = readResultFromHtml(
      `
        <main>
          <div>
            <section>
              <div>Accepted 63 / 63 testcases passed</div>
              <div>Runtime 4 ms</div>
              <div>Memory 20.62 MB</div>
              <div>Code | Python3</div>
              <pre>class Solution:
    pass</pre>
            </section>
          </div>
        </main>
      `,
      11000,
    )

    expect(result).toMatchObject({
      status: 'accepted',
      runtime: '4 ms',
      memory: '20.62 MB',
      passedTestCount: 63,
      totalTestCount: 63,
      resultCodeSnapshot: {
        code: 'class Solution:\n    pass',
        language: 'Python3',
      },
    })
  })

  it('returns null before LeetCode renders a terminal submission result', () => {
    document.body.innerHTML = leetcodePendingSubmissionPageHtml

    expect(readLeetCodeSubmissionResult(document, { location })).toBeNull()
  })
})

function readResultFromHtml(html: string, now: number) {
  document.body.innerHTML = html

  return readLeetCodeSubmissionResult(document, {
    location,
    now: () => now,
  })
}
