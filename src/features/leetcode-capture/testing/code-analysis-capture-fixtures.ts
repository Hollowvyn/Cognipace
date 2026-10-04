import {
  createEmptyLeetCodeCaptureState,
  type LeetCodeCaptureState,
} from '@/lib/leetcode'

/** Complete capture shared by analysis tests; never imported by runtime code. */
export function makeCompleteCapture() {
  const location = {
    slug: 'two-sum',
    url: 'https://leetcode.com/problems/two-sum/',
    host: 'leetcode.com',
  }
  const submittedCodeSnapshot = {
    code: 'for (let i = 0; i < nums.length; i++) {',
    language: 'JavaScript',
    source: 'monaco' as const,
    completeness: 'partial' as const,
    capturedAt: 5000,
  }

  return {
    ...createEmptyLeetCodeCaptureState(location),
    location,
    metadata: {
      location,
      title: 'Two Sum',
      frontendId: '1',
      difficulty: 'Easy' as const,
      isPremium: false,
      topics: [{ name: 'Array', slug: 'array' }],
      source: 'graphql' as const,
      confidence: 'high' as const,
      capturedAt: 4000,
    },
    problemContent: {
      location,
      statement:
        'Given an integer array nums and an integer target, return the distinct zero-based indices of two numbers whose sum equals target. Each input has exactly one solution; do not use the same element twice.',
      constraints: [
        '2 <= nums.length <= 10000',
        '-1000000000 <= nums[i] <= 1000000000',
        '-1000000000 <= target <= 1000000000',
      ],
      followUps: [
        'Find an expected linear-time solution; additional memory is permitted.',
      ],
      hints: [],
      examples: [],
      completeness: 'complete' as const,
      source: 'graphql' as const,
      confidence: 'high' as const,
      capturedAt: 4000,
      contentFingerprint: 'fixture:two-sum:complete',
    },
    codeSnapshot: submittedCodeSnapshot,
    submissionClick: { location, clickedAt: 5000, buttonText: 'Submit' },
    submissionAttempt: {
      location,
      attemptId: 'fixture-attempt-1',
      clickedAt: 5000,
      submitButtonText: 'Submit',
      submittedCodeSnapshot,
    },
    submissionResult: {
      location,
      submissionId: '1234567890',
      source: 'api' as const,
      status: 'accepted' as const,
      statusText: 'Accepted',
      checkedAt: 5001,
      runtime: '34 ms',
      memory: null,
      passedTestCount: 50,
      totalTestCount: 50,
      failingTestcase: null,
      errorMessage: null,
      compileError: null,
      runtimeError: null,
      lastTestcase: null,
      codeOutput: null,
      expectedOutput: null,
      stdOutput: null,
      resultCodeSnapshot: {
        code: `var twoSum = function(nums, target) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) {
        return [i, j];
      }
    }
  }
  return [];
};
`,
        language: 'JavaScript',
        source: 'api' as const,
        completeness: 'complete' as const,
        capturedAt: 5001,
      },
    },
    lastUpdatedAt: 5001,
  } satisfies LeetCodeCaptureState
}
