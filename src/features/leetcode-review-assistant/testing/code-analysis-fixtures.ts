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
