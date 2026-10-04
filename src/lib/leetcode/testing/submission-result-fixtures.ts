import { vi } from 'vitest'

export type LeetCodeSubmissionApiFixture = {
  submissionListPayload: Record<string, unknown>
  checkPayload: Record<string, unknown>
  graphQlPayload: Record<string, unknown> | null
}

export function createLeetCodeSubmissionApiFixtureFetcher(
  fixture: LeetCodeSubmissionApiFixture,
) {
  return vi.fn((input: RequestInfo | URL) => {
    const requestUrl = readLeetCodeFixtureRequestUrl(input)

    if (requestUrl.includes('/api/submissions/two-sum/')) {
      return Promise.resolve(Response.json(fixture.submissionListPayload))
    }

    if (requestUrl.includes('/submissions/detail/1234567890/check/')) {
      return Promise.resolve(Response.json(fixture.checkPayload))
    }

    if (requestUrl.endsWith('/graphql') && fixture.graphQlPayload) {
      return Promise.resolve(Response.json(fixture.graphQlPayload))
    }

    return Promise.resolve(new Response('', { status: 500 }))
  })
}

export function readLeetCodeFixtureRequestUrl(input: RequestInfo | URL) {
  if (input instanceof URL) {
    return input.toString()
  }

  if (typeof input === 'string') {
    return input
  }

  return input.url
}

export const leetcodeAcceptedSubmissionApiFixture: LeetCodeSubmissionApiFixture =
  {
    submissionListPayload: {
      submission_list: [
        {
          id: 1234567890,
          timestamp: 5,
          status_display: 'Accepted',
          runtime: '4 ms',
          memory: '20.62 MB',
          lang_name: 'Python3',
        },
      ],
    },
    checkPayload: {
      state: 'SUCCESS',
      status_code: 10,
      status_msg: 'Accepted',
      status_runtime: '4 ms',
      status_memory: '20.62 MB',
      total_correct: 63,
      total_testcases: 63,
      pretty_lang: 'Python3',
    },
    graphQlPayload: {
      data: {
        submissionDetails: {
          id: '1234567890',
          statusCode: 10,
          statusDisplay: 'Accepted',
          runtimeDisplay: '4 ms',
          memoryDisplay: '20.62 MB',
          totalCorrect: 63,
          totalTestcases: 63,
          code: 'class Solution:\n    def twoSum(self):\n        return []',
          lang: { name: 'python3', verboseName: 'Python3' },
        },
      },
    },
  }

export const leetcodeWrongAnswerSubmissionApiFixture: LeetCodeSubmissionApiFixture =
  {
    submissionListPayload: {
      submission_list: [
        {
          id: '1234567890',
          timestamp: 6,
          status_display: 'Wrong Answer',
          lang_name: 'Python3',
        },
      ],
    },
    checkPayload: {
      state: 'SUCCESS',
      status_code: 11,
      status_msg: 'Wrong Answer',
      total_correct: 57,
      total_testcases: 63,
      last_testcase: 'nums = [3,2,4], target = 6',
      pretty_lang: 'Python3',
    },
    graphQlPayload: {
      data: {
        submissionDetails: {
          id: '1234567890',
          statusCode: 11,
          statusDisplay: 'Wrong Answer',
          totalCorrect: 57,
          totalTestcases: 63,
          lastTestcase: 'nums = [3,2,4], target = 6',
          codeOutput: '[0,1]',
          expectedOutput: '[1,2]',
          stdOutput: 'debug line',
          code: 'class Solution:\n    pass',
          lang: { name: 'python3', verboseName: 'Python3' },
        },
      },
    },
  }

export const leetcodeRuntimeErrorSubmissionApiFixture: LeetCodeSubmissionApiFixture =
  {
    submissionListPayload: {
      submission_list: [
        {
          id: '1234567890',
          timestamp: 6,
          status_display: 'Runtime Error',
          lang_name: 'Python3',
        },
      ],
    },
    checkPayload: {
      state: 'SUCCESS',
      status_code: 15,
      status_msg: 'Runtime Error',
      runtime_error: 'IndexError: list index out of range',
      last_testcase: '[2,7,11,15]\n9',
      code_output: '',
      expected_output: '[0,1]',
      std_output: 'before crash',
      total_correct: 0,
      total_testcases: 63,
      pretty_lang: 'Python3',
    },
    graphQlPayload: {
      data: {
        submissionDetails: {
          id: '1234567890',
          statusCode: 15,
          statusDisplay: 'Runtime Error',
          runtimeError: 'IndexError: list index out of range',
          lastTestcase: '[2,7,11,15]\n9',
          codeOutput: '',
          expectedOutput: '[0,1]',
          stdOutput: 'before crash',
          totalCorrect: 0,
          totalTestcases: 63,
          code: 'class Solution:\n    raise IndexError()',
          lang: { name: 'python3', verboseName: 'Python3' },
        },
      },
    },
  }

export const leetcodeCompileErrorSubmissionApiFixture: LeetCodeSubmissionApiFixture =
  {
    submissionListPayload: {
      submission_list: [
        {
          id: '1234567890',
          timestamp: 6,
          status_display: 'Compile Error',
          lang_name: 'Python3',
        },
      ],
    },
    checkPayload: {
      state: 'SUCCESS',
      status_code: 20,
      status_msg: 'Compile Error',
      compile_error: "NameError: name 'List' is not defined",
      std_output: 'compile stdout',
      pretty_lang: 'Python3',
    },
    graphQlPayload: {
      data: {
        submissionDetails: {
          id: '1234567890',
          statusCode: 20,
          statusDisplay: 'Compile Error',
          compileError: "NameError: name 'List' is not defined",
          stdOutput: 'compile stdout',
          code: 'class Solution:\n    def twoSum(self, nums, target)',
          lang: { name: 'python3', verboseName: 'Python3' },
        },
      },
    },
  }

export const leetcodeGraphQlMissingSubmissionApiFixture: LeetCodeSubmissionApiFixture =
  {
    submissionListPayload: {
      submission_list: [
        {
          id: '1234567890',
          timestamp: 5,
          status_display: 'Accepted',
          runtime: '4 ms',
          memory: '20.62 MB',
          lang_name: 'Python3',
        },
      ],
    },
    checkPayload: {
      state: 'SUCCESS',
      status_code: 10,
      status_msg: 'Accepted',
      total_correct: 63,
      total_testcases: 63,
      pretty_lang: 'Python3',
    },
    graphQlPayload: {
      data: {
        submissionDetails: null,
      },
    },
  }

export const leetcodePendingSubmissionApiFixture: LeetCodeSubmissionApiFixture =
  {
    submissionListPayload: {
      submission_list: [
        {
          id: '1234567890',
          timestamp: 6,
          status_display: 'Runtime Error',
          lang_name: 'Python3',
        },
      ],
    },
    checkPayload: {
      state: 'PENDING',
      status_msg: 'Pending',
      pretty_lang: 'Python3',
    },
    graphQlPayload: null,
  }

export const leetcodeAcceptedSubmissionResultHtml = `
  <main>
    <section data-e2e-locator="submission-result">
      <h3>Accepted</h3>
      <a href="/submissions/detail/1234567890/">Details</a>
      <dl>
        <dt>Runtime</dt>
        <dd>42 ms</dd>
        <dt>Memory</dt>
        <dd>16.7 MB</dd>
      </dl>
      <p>58 / 58 testcases passed</p>
      <h3>Code | Python3</h3>
      <pre>class Solution:
    def twoSum(self):
        return []</pre>
    </section>
  </main>
`

export const leetcodeWrongAnswerSubmissionResultHtml = `
  <main>
    <section class="submission-result-panel">
      <h3>Wrong Answer</h3>
      <p>37 / 58 testcases passed</p>
      <div>Input nums = [3,2,4], target = 6</div>
      <div>Output [0,1]</div>
      <div>Expected [1,2]</div>
    </section>
  </main>
`

export const leetcodeRuntimeErrorSubmissionResultHtml = `
  <main>
    <section data-e2e-locator="submission-result">
      <h3>Runtime Error</h3>
      <pre>IndexError: list index out of range</pre>
      <div>Last Testcase [2,7,11,15]\n9</div>
      <div>Output []</div>
      <div>Expected [0,1]</div>
      <div>Stdout before crash</div>
    </section>
  </main>
`

export const leetcodeCompileErrorSubmissionResultHtml = `
  <main>
    <section data-e2e-locator="submission-result">
      <h3>Compile Error</h3>
      <pre>NameError: name 'List' is not defined</pre>
      <div>Stdout compile stdout</div>
    </section>
  </main>
`

export const leetcodePendingSubmissionPageHtml = `
  <main>
    <h1>Two Sum</h1>
    <button data-e2e-locator="console-submit-button">Submit</button>
  </main>
`
