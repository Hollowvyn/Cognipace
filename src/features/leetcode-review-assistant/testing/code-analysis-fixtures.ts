import type { AnalyzeLeetCodeSubmissionRequest } from '../api/code-analysis-contracts'

import {
  CODE_ANALYSIS_VERSION,
  type CodeAnalysisReport,
} from '../domain/code-analysis-schema'

export function makeValidAnalysis(
  overrides: Partial<CodeAnalysisReport> = {},
): CodeAnalysisReport {
  return {
    version: CODE_ANALYSIS_VERSION,
    summary:
      'Your submission passed; a hash map can improve expected time when extra memory is allowed.',
    approach: {
      score: 3,
      rationale:
        'Pair enumeration finds the required pair, but misses the follow-up asking for expected linear time.',
      confidence: 'high',
      strategyAssessment: 'material-improvement',
      current: ['Pair enumeration', 'Array'],
      suggested: ['Hash map', 'Array'],
      keyIdea:
        'Look up the complement before adding the current index to the map.',
      consider:
        'Handle repeated values while ensuring the returned indices are distinct.',
    },
    efficiency: {
      score: 3,
      rationale:
        'The hash map improves expected time from quadratic to linear while using linear extra memory.',
      confidence: 'high',
      current: {
        time: 'O(n²)',
        space: 'O(1)',
        assumptions: ['n is the input array length.'],
      },
      suggested: {
        time: 'Expected O(n)',
        space: 'O(n)',
        assumptions: ['Hash-map lookups and inserts take expected O(1) time.'],
      },
      timeComparison: 'better',
      spaceComparison: 'worse',
      suggestions: [
        'Use a hash map when the expected time improvement is worth O(n) extra memory.',
      ],
    },
    codeStyle: {
      score: 4,
      rationale:
        'The control flow is clear and the function has a focused structure; more descriptive names are an optional refinement.',
      confidence: 'medium',
      readability: 'Good',
      structure: 'Excellent',
      suggestions: [
        'Use descriptive index and complement names where helpful.',
      ],
    },
    suggestedImplementation: {
      language: 'JavaScript',
      code: [
        'function twoSum(nums, target) {',
        '  const seen = new Map();',
        '',
        '  for (let index = 0; index < nums.length; index += 1) {',
        '    const complement = target - nums[index];',
        '',
        '    if (seen.has(complement)) {',
        '      return [seen.get(complement), index];',
        '    }',
        '',
        '    seen.set(nums[index], index);',
        '  }',
        '',
        '  return [];',
        '}',
      ].join('\n'),
      changes: [
        'Check the complement before inserting the current value so the same index cannot be used twice.',
      ],
      complexity: {
        time: 'Expected O(n)',
        space: 'O(n)',
        assumptions: ['Hash-map lookups and inserts take expected O(1) time.'],
      },
      assumptions: ['The input guarantees exactly one valid pair.'],
    },
    suggestedImplementationUnavailableReason: null,
    ...overrides,
  }
}

export function makeAnalysisRequest(): AnalyzeLeetCodeSubmissionRequest {
  return {
    surface: 'content-script',
    requestId: 'request-1',
    attemptId: 'attempt-1',
    submissionId: '1234567890',
    problemSlug: 'two-sum',
    configurationRevision: 0,
    problem: {
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'Easy',
      topics: ['Array', 'Hash Table'],
      statement:
        'Return two distinct zero-based indices whose values add up to target. Exactly one pair exists.',
      examples: ['nums = [2,7,11,15], target = 9; output [0,1]'],
      constraints: ['2 <= nums.length <= 10000'],
      followUps: ['Target expected linear time; extra memory is allowed.'],
    },
    submission: {
      status: 'accepted',
      code: [
        'function twoSum(nums, target) {',
        '  for (let i = 0; i < nums.length; i++) {',
        '    for (let j = i + 1; j < nums.length; j++) {',
        '      if (nums[i] + nums[j] === target) return [i, j];',
        '    }',
        '  }',
        '  return [];',
        '}',
      ].join('\n'),
      language: 'JavaScript',
      languageVersion: null,
      runtime: '34 ms',
      memory: null,
      passedTestCount: 50,
      totalTestCount: 50,
      diagnostics: {
        errorMessage: null,
        compileError: null,
        runtimeError: null,
        failingTestcase: null,
        lastTestcase: null,
        codeOutput: null,
        expectedOutput: null,
        stdOutput: null,
      },
      omittedDiagnostics: [],
    },
  }
}
