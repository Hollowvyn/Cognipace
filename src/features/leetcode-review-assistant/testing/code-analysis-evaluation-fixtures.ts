import type { AnalyzeLeetCodeSubmissionRequest } from '../api/code-analysis-contracts'

import { makeAnalysisRequest } from './code-analysis-fixtures'

export type CodeAnalysisEvaluationFixture = {
  id: string
  request: AnalyzeLeetCodeSubmissionRequest
  /** Human review metadata; never supplied to the model. */
  criterion: string
}

function makeEvaluationRequest(): AnalyzeLeetCodeSubmissionRequest {
  const request = makeAnalysisRequest()
  request.submission.languageVersion = null
  request.submission.runtime = null
  request.submission.memory = null
  request.submission.passedTestCount = null
  request.submission.totalTestCount = null
  return request
}

const pairStatement =
  'Given nums and target, return two distinct zero-based indices whose values sum to target. Exactly one valid index pair exists. Either index order is valid. Leave nums unchanged.'
const pairExamples = [
  'nums = [2,7,11,15], target = 9; output [0,1]',
  'nums = [3,2,4], target = 6; output [1,2]',
  'nums = [3,3], target = 6; output [0,1]',
  'nums = [-5,2,8], target = 3; output [0,2]',
]
const pairValueBounds =
  '-1000000000 <= nums[i], target <= 1000000000; all values and target are integers.'

const linearGoal = makeEvaluationRequest()
linearGoal.problem.statement = pairStatement
linearGoal.problem.examples = [...pairExamples]
linearGoal.problem.constraints = [
  'n = nums.length.',
  '2 <= n <= 10000.',
  pairValueBounds,
  'Exactly one valid pair of distinct indices exists.',
  'Leave nums unchanged; extra memory is allowed.',
]
linearGoal.problem.followUps = [
  'Can you achieve expected O(n) time? Extra memory is allowed.',
]

const smallConstantSpace = structuredClone(linearGoal)
smallConstantSpace.problem.constraints = [
  'n = nums.length.',
  '2 <= n <= 20 (at most 190 distinct index pairs).',
  pairValueBounds,
  'Exactly one valid pair of distinct indices exists.',
  'Use O(1) auxiliary space and leave nums unchanged.',
]
smallConstantSpace.problem.followUps = []

const sortedOneBased = makeEvaluationRequest()
sortedOneBased.problemSlug = 'two-sum-ii'
sortedOneBased.problem = {
  slug: 'two-sum-ii',
  title: 'Two Sum',
  difficulty: 'Medium',
  topics: ['Array', 'Two Pointers'],
  statement:
    'Given numbers sorted in nondecreasing order and target, return the two distinct one-based indices whose values sum to target, ordered so 1 <= index1 < index2 <= numbers.length. Exactly one valid index pair exists. Leave numbers unchanged and use O(1) auxiliary space.',
  examples: [
    'numbers = [2,7,11,15], target = 9; output [1,2]',
    'numbers = [3,3], target = 6; output [1,2]',
    'numbers = [-5,2,8], target = 3; output [1,3]',
  ],
  constraints: [
    'n = numbers.length.',
    '2 <= n <= 10000.',
    '-1000000000 <= numbers[i], target <= 1000000000; all values and target are integers.',
    'numbers is sorted in nondecreasing order; exactly one valid pair of distinct indices exists.',
    'Use O(1) auxiliary space and leave numbers unchanged.',
  ],
  followUps: [],
}
sortedOneBased.submission.code = [
  'function twoSum(numbers, target) {',
  '  const seen = new Map();',
  '  for (let i = 0; i < numbers.length; i++) {',
  '    const other = seen.get(target - numbers[i]);',
  '    if (other !== undefined) return [other + 1, i + 1];',
  '    seen.set(numbers[i], i);',
  '  }',
  '  return [];',
  '}',
].join('\n')

const insertBeforeLookup = structuredClone(linearGoal)
insertBeforeLookup.submission.status = 'wrong-answer'
insertBeforeLookup.submission.code = [
  'function twoSum(nums, target) {',
  '  const seen = new Map();',
  '  for (let i = 0; i < nums.length; i++) {',
  '    seen.set(nums[i], i);',
  '    const other = seen.get(target - nums[i]);',
  '    if (other !== undefined) return [other, i];',
  '  }',
  '  return [];',
  '}',
].join('\n')
insertBeforeLookup.submission.diagnostics.failingTestcase =
  'nums = [3,2,4], target = 6'
insertBeforeLookup.submission.diagnostics.codeOutput = '[0,0]'
insertBeforeLookup.submission.diagnostics.expectedOutput =
  '[1,2] (either order is valid)'

const kotlinInferredInt = makeEvaluationRequest()
kotlinInferredInt.problemSlug = 'search-insert-position'
kotlinInferredInt.problem = {
  slug: 'search-insert-position',
  title: 'Search Insert Position',
  difficulty: 'Easy',
  topics: ['Array', 'Binary Search'],
  statement:
    'Given nums sorted in strictly increasing order and target, return its zero-based index if found, otherwise the insertion position that preserves order. The insertion position is in 0..nums.size. Leave nums unchanged.',
  examples: [
    'nums = [1,3,5,6], target = 5; output 2 (found)',
    'nums = [1,3,5,6], target = 2; output 1 (absent between values)',
    'nums = [1,3,5,6], target = 0; output 0 (before all values)',
    'nums = [1,3,5,6], target = 7; output 4 (after all values)',
  ],
  constraints: [
    'n = nums.size.',
    '1 <= n <= 10000.',
    '-1000000000 <= nums[i], target <= 1000000000; all values and target are Kotlin Ints.',
    'nums contains distinct values sorted in strictly increasing order.',
    'Leave nums unchanged.',
  ],
  followUps: ['Use O(log n) time.'],
}
kotlinInferredInt.submission.language = 'Kotlin'
kotlinInferredInt.submission.code = [
  'class Solution {',
  '    fun searchInsert(nums: IntArray, target: Int): Int {',
  '        var low: Int = 0',
  '        var high: Int = nums.size',
  '        while (low < high) {',
  '            val middle: Int = low + (high - low) / 2',
  '            if (nums[middle] < target) low = middle + 1',
  '            else high = middle',
  '        }',
  '        return low',
  '    }',
  '}',
].join('\n')

const kotlinLongAndGeneric = makeEvaluationRequest()
kotlinLongAndGeneric.problemSlug = 'running-sum-long'
kotlinLongAndGeneric.problem = {
  slug: 'running-sum-long',
  title: 'Running Sum',
  difficulty: 'Easy',
  topics: ['Array', 'Prefix Sum'],
  statement:
    'Given an IntArray nums, return a LongArray of the same length containing inclusive prefix sums: output[i] = nums[0] + ... + nums[i], computed as Long. Leave nums unchanged. Preserve Solution.runningSum(IntArray): LongArray.',
  examples: [
    'nums = [1,2,3,4]; output [1L,3L,6L,10L]',
    'nums = [2147483647,1]; output [2147483647L,2147483648L]',
    'nums = [-2,3,-1]; output [-2L,1L,0L]',
  ],
  constraints: [
    'n = nums.size.',
    '1 <= n <= 10000; prefix sums fit in Long.',
    '-2147483648 <= nums[i] <= 2147483647; each value is a valid Kotlin Int.',
    'Return exactly n inclusive prefix sums as LongArray and leave nums unchanged.',
  ],
  followUps: [],
}
kotlinLongAndGeneric.submission.language = 'Kotlin'
kotlinLongAndGeneric.submission.code = [
  'class Solution {',
  '    fun runningSum(nums: IntArray): LongArray {',
  '        var total: Long = 0',
  '        val values: MutableList<Long> = mutableListOf()',
  '        for (value in nums) {',
  '            total += value',
  '            values.add(total)',
  '        }',
  '        return values.toLongArray()',
  '    }',
  '}',
].join('\n')

export const codeAnalysisEvaluationFixtures: CodeAnalysisEvaluationFixture[] = [
  {
    id: 'brute-force-linear-goal',
    request: linearGoal,
    criterion:
      'Recognize correct pair enumeration as O(n²) time and O(1) auxiliary space. A materially preferred hash-map replacement requires Approach below 5 without forcing an exact score. Compare expected O(n) time as better and O(n) auxiliary space as worse independently. Preserve distinct indices, unchanged input and function signature.',
  },
  {
    id: 'small-constant-space',
    request: smallConstantSpace,
    criterion:
      'Recognize that correct brute force is appropriate for n <= 20, at most 190 pairs, unchanged input and O(1) auxiliary space; do not automatically cap Approach. A hash map is O(n) auxiliary space and violates this requirement. Do not modify input or hide an O(n) copy behind a sorting suggestion.',
  },
  {
    id: 'sorted-one-based',
    request: sortedOneBased,
    criterion:
      'Identify the accepted map solution’s O(n) auxiliary-space violation. A materially preferred two-pointer strategy requires Approach below 5 and principally improves space to O(1), retaining O(n) time, nondecreasing order and ordered distinct one-based indices. Do not falsely claim a better asymptotic time order; justified expected versus worst-case distinctions are allowed.',
  },
  {
    id: 'insert-before-lookup',
    request: insertBeforeLookup,
    criterion:
      'Identify the distinct-index correctness defect: insertion before complement lookup returns [0,0] for [3,2,4] and target 6. Check the complement before insertion, preserving either valid zero-based index order. Do not praise the incorrect early exit. Explain expected linear time and linear auxiliary space with memory allowed.',
  },
  {
    id: 'kotlin-inferred-int',
    request: kotlinInferredInt,
    criterion:
      'Treat valid explicit initialized Int annotations as optional style polish, not compilation defects. Preserve Solution.searchInsert(nums: IntArray, target: Int): Int, lower-bound binary-search invariant, O(log n) time and positions 0..nums.size for found, absent, before and after cases. Keep required parameter and return types.',
  },
  {
    id: 'kotlin-long-and-generic',
    request: kotlinLongAndGeneric,
    criterion:
      'Preserve valid Solution.runningSum(nums: IntArray): LongArray and inclusive prefix sums beyond Int range. total: Long = 0 is valid; inference must use 0L. If retaining an empty generic collection, keep Long on its annotation or initializer. A justified direct LongArray is valid and avoids the intermediate list: O(n) time for both, O(n) current auxiliary space to O(1) auxiliary space excluding required O(n) output. Do not narrow intended types or return IntArray.',
  },
]
