import { describe, expect, it } from 'vitest'

import type {
  LeetCodeProblemLocation,
  LeetCodeSubmissionClick,
  LeetCodeSubmissionPollingDebug,
  LeetCodeSubmittedCodeSnapshot,
} from '../domain/types'
import {
  createLeetCodeSubmissionApiFixtureFetcher,
  leetcodeAcceptedSubmissionApiFixture,
  leetcodeCompileErrorSubmissionApiFixture,
  leetcodeGraphQlMissingSubmissionApiFixture,
  leetcodePendingSubmissionApiFixture,
  leetcodeRuntimeErrorSubmissionApiFixture,
  type LeetCodeSubmissionApiFixture,
  readLeetCodeFixtureRequestUrl,
  leetcodeWrongAnswerSubmissionApiFixture,
} from '../testing/submission-result-fixtures'
import { readLeetCodeSubmissionResultFromApi } from './submission-result-api-source'

const location = {
  slug: 'two-sum',
  url: 'https://leetcode.com/problems/two-sum/',
  host: 'leetcode.com',
} satisfies LeetCodeProblemLocation

const click = {
  location,
  clickedAt: 5000,
  buttonText: 'Submit',
} satisfies LeetCodeSubmissionClick

const submittedCodeSnapshot = {
  code: 'class Solution:\n    pass',
  language: 'Python3',
  source: 'monaco',
  completeness: 'partial',
  capturedAt: 5000,
} satisfies LeetCodeSubmittedCodeSnapshot

describe('readLeetCodeSubmissionResultFromApi', () => {
  it('polls LeetCode submission APIs and returns accepted result details', async () => {
    const { debugEvents, fetcher, result } = await readSubmissionApiResult({
      fixture: leetcodeAcceptedSubmissionApiFixture,
      now: 7000,
    })

    expect(result).toEqual({
      location,
      submissionId: '1234567890',
      source: 'api',
      status: 'accepted',
      statusText: 'Accepted',
      checkedAt: 7000,
      runtime: '4 ms',
      memory: '20.62 MB',
      passedTestCount: 63,
      totalTestCount: 63,
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
        source: 'api',
        completeness: 'complete',
        capturedAt: 7000,
      },
    })
    expect(debugEvents.map((debug) => debug.phase)).toEqual([
      'finding-submission',
      'submission-found',
      'checking-result',
      'api-result-found',
      'graphql-details-found',
    ])
    expect(
      fetcher.mock.calls.map(([input]) => readLeetCodeFixtureRequestUrl(input)),
    ).toEqual([
      expect.stringContaining('/api/submissions/two-sum/'),
      expect.stringContaining('/submissions/detail/1234567890/check/'),
      'https://leetcode.com/graphql',
    ])
  })

  it('reads only a pinned submission even when a newer unrelated ID exists', async () => {
    const { result, fetcher } = await readSubmissionApiResult({
      fixture: {
        ...leetcodeAcceptedSubmissionApiFixture,
        submissionListPayload: {
          submission_list: [
            { id: '9999999999', timestamp: 6, status_display: 'Accepted' },
          ],
        },
      },
      submissionId: '1234567890',
      now: 7000,
    })
    expect(result?.submissionId).toBe('1234567890')
    expect(
      fetcher.mock.calls.map(([input]) => readLeetCodeFixtureRequestUrl(input)),
    ).toEqual([
      expect.stringContaining('/submissions/detail/1234567890/check/'),
      'https://leetcode.com/graphql',
    ])
  })

  it.each(['', 'bad-id'])(
    'refuses invalid pinned ID %j without discovering a replacement',
    async (submissionId) => {
      const { result, fetcher } = await readSubmissionApiResult({
        fixture: leetcodeAcceptedSubmissionApiFixture,
        submissionId,
        now: 7000,
      })
      expect(result).toBeNull()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )

  it('retries incomplete details for the same pinned submission', async () => {
    const fixture: LeetCodeSubmissionApiFixture = {
      ...leetcodeAcceptedSubmissionApiFixture,
      graphQlPayload: null,
    }
    const fetcher = createLeetCodeSubmissionApiFixtureFetcher(fixture)
    const request = {
      location,
      click,
      submittedCodeSnapshot,
      submissionId: '1234567890',
      fetch: fetcher,
    }
    const first = await readLeetCodeSubmissionResultFromApi(request)
    expect(first?.resultCodeSnapshot.completeness).toBe('partial')
    fixture.graphQlPayload = leetcodeAcceptedSubmissionApiFixture.graphQlPayload
    const second = await readLeetCodeSubmissionResultFromApi(request)
    expect(second?.resultCodeSnapshot).toMatchObject({
      source: 'api',
      completeness: 'complete',
    })
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it.each([
    { name: 'pre-click', entries: [{ id: '1234567890', timestamp: 4 }] },
    { name: 'after-window', entries: [{ id: '1234567890', timestamp: 11 }] },
    {
      name: 'ambiguous-window',
      entries: [
        { id: '1234567890', timestamp: 5 },
        { id: '9999999999', timestamp: 6 },
      ],
    },
    { name: 'invalid-ID', entries: [{ id: 'bad-id', timestamp: 5 }] },
    {
      name: 'internal-error',
      entries: [
        { id: '1234567890', timestamp: 5, status_display: 'Internal Error' },
      ],
    },
  ])(
    'refuses $name initial discovery instead of selecting another submission',
    async ({ entries }) => {
      const { result, fetcher, debugEvents } = await readSubmissionApiResult({
        fixture: {
          ...leetcodeAcceptedSubmissionApiFixture,
          submissionListPayload: { submission_list: entries },
        },
        now: 7000,
      })
      expect(result).toBeNull()
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(debugEvents.at(-1)?.phase).toBe('submission-not-found')
    },
  )

  it.each([
    { name: 'whitespace', code: '  class Solution:\n    pass\n\n' },
    {
      name: 'source beyond 4000 characters',
      code:
        '\n  class Solution:\n' +
        Array.from(
          { length: 400 },
          (_, index) => `    # preserve source line ${index}`,
        ).join('\n') +
        '\n    return []\n\n',
    },
  ])('preserves exact full details $name', async ({ name, code }) => {
    if (name === 'source beyond 4000 characters')
      expect(code.length).toBeGreaterThan(4000)
    const { result } = await readSubmissionApiResult({
      fixture: fixtureWithDetails({ id: '1234567890', code }),
      now: 7000,
    })
    expect(result?.resultCodeSnapshot).toMatchObject({
      code,
      source: 'api',
      completeness: 'complete',
    })
  })

  it.each([
    { id: '9999999999', code: 'wrong submission' },
    { code: 'unidentified submission' },
  ])('rejects nonmatching details provenance: %j', async (details) => {
    const { result, debugEvents } = await readSubmissionApiResult({
      fixture: fixtureWithDetails(details),
      submissionId: '1234567890',
      now: 7000,
    })
    expect(result?.resultCodeSnapshot).toMatchObject({
      code: submittedCodeSnapshot.code,
      source: 'monaco',
      completeness: 'partial',
    })
    expect(debugEvents.at(-1)?.phase).toBe('graphql-details-missing')
  })

  it.each([null, '', '   '])(
    'keeps fragment provenance when details code is empty: %j',
    async (code) => {
      const { result } = await readSubmissionApiResult({
        fixture: fixtureWithDetails({ id: '1234567890', code }),
        now: 7000,
      })
      expect(result?.resultCodeSnapshot).toMatchObject({
        code: submittedCodeSnapshot.code,
        source: 'monaco',
        completeness: 'partial',
      })
    },
  )

  it('returns null while LeetCode is still judging the submission', async () => {
    const { debugEvents, result } = await readSubmissionApiResult({
      fixture: leetcodePendingSubmissionApiFixture,
      now: 7000,
    })

    expect(result).toBeNull()
    expect(debugEvents.map((debug) => debug.phase)).toEqual([
      'finding-submission',
      'submission-found',
      'checking-result',
    ])
    expect(debugEvents.at(-1)).toMatchObject({
      submissionId: '1234567890',
      checkState: 'PENDING',
      statusText: 'Pending',
    })
  })

  it('ignores submissions outside the click matching window', async () => {
    const { debugEvents, fetcher, result } = await readSubmissionApiResult({
      fixture: leetcodeAcceptedSubmissionApiFixture,
      click: { ...click, clickedAt: 100000 },
      now: 7000,
    })

    expect(result).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(debugEvents.map((debug) => debug.phase)).toEqual([
      'finding-submission',
      'submission-not-found',
    ])
  })

  it.each([
    {
      name: 'wrong answer',
      fixture: leetcodeWrongAnswerSubmissionApiFixture,
      expected: {
        source: 'api',
        status: 'wrong-answer',
        statusText: 'Wrong Answer',
        passedTestCount: 57,
        totalTestCount: 63,
        failingTestcase: 'nums = [3,2,4], target = 6',
        lastTestcase: 'nums = [3,2,4], target = 6',
        codeOutput: '[0,1]',
        expectedOutput: '[1,2]',
        stdOutput: 'debug line',
        resultCodeSnapshot: {
          code: 'class Solution:\n    pass',
          source: 'api',
          completeness: 'complete',
        },
      },
    },
    {
      name: 'runtime error',
      fixture: leetcodeRuntimeErrorSubmissionApiFixture,
      expected: {
        status: 'runtime-error',
        statusText: 'Runtime Error',
        errorMessage: 'IndexError: list index out of range',
        runtimeError: 'IndexError: list index out of range',
        compileError: null,
        lastTestcase: '[2,7,11,15]\n9',
        codeOutput: null,
        expectedOutput: '[0,1]',
        stdOutput: 'before crash',
      },
    },
    {
      name: 'compile error',
      fixture: leetcodeCompileErrorSubmissionApiFixture,
      expected: {
        status: 'compile-error',
        statusText: 'Compile Error',
        errorMessage: "NameError: name 'List' is not defined",
        compileError: "NameError: name 'List' is not defined",
        runtimeError: null,
        stdOutput: 'compile stdout',
      },
    },
  ])(
    'returns $name details without accepted-only assumptions',
    async (testCase) => {
      const { result } = await readSubmissionApiResult({
        fixture: testCase.fixture,
        now: 8000,
      })

      expect(result).toMatchObject(testCase.expected)
    },
  )

  it('reports missing GraphQL details while keeping check API result data', async () => {
    const { debugEvents, result } = await readSubmissionApiResult({
      fixture: leetcodeGraphQlMissingSubmissionApiFixture,
      now: 8000,
    })

    expect(result).toMatchObject({
      source: 'api',
      status: 'accepted',
      statusText: 'Accepted',
      runtime: '4 ms',
      memory: '20.62 MB',
      resultCodeSnapshot: {
        code: submittedCodeSnapshot.code,
        source: 'monaco',
        completeness: 'partial',
      },
    })
    expect(debugEvents.at(-1)).toEqual({
      phase: 'graphql-details-missing',
      submissionId: '1234567890',
      checkState: 'SUCCESS',
      statusText: 'Accepted',
      checkedAt: 8000,
    })
  })
})

async function readSubmissionApiResult(options: {
  fixture: LeetCodeSubmissionApiFixture
  submissionId?: string | undefined
  click?: LeetCodeSubmissionClick | undefined
  now: number
}) {
  const debugEvents: LeetCodeSubmissionPollingDebug[] = []
  const fetcher = createLeetCodeSubmissionApiFixtureFetcher(options.fixture)
  const result = await readLeetCodeSubmissionResultFromApi({
    location,
    submissionId: options.submissionId,
    click: options.click ?? click,
    submittedCodeSnapshot,
    fetch: fetcher,
    now: () => options.now,
    onDebug: (debug) => debugEvents.push(debug),
  })

  return { debugEvents, fetcher, result }
}

function fixtureWithDetails(
  details: Record<string, unknown>,
): LeetCodeSubmissionApiFixture {
  return {
    ...leetcodeAcceptedSubmissionApiFixture,
    graphQlPayload: { data: { submissionDetails: details } },
  }
}
