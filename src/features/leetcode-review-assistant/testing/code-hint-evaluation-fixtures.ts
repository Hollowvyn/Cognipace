import type {
  CodeHintInput,
  CodeHint,
  HintProblem,
} from '../api/code-hint-contracts'

const problem: HintProblem = {
  host: 'leetcode.com',
  slug: 'two-sum',
  title: 'Two Sum',
  statement:
    'Return indices of two different elements of nums whose sum equals target. Exactly one answer exists. Indices may be returned in any order. Do not modify nums.',
  examples: [
    'nums=[2,7,11,15], target=9; output=[0,1]',
    'nums=[3,3], target=6; output=[0,1]',
  ],
  constraints: [
    '2 <= nums.length <= 20',
    '-1000000000 <= nums[i], target <= 1000000000',
    'Exactly one valid answer exists.',
  ],
}
const snapshot = (code: string, capturedAt = 0) => ({
  code,
  language: 'javascript',
  capturedAt,
})
const empty = snapshot('function twoSum(nums, target) {\n}')
const buggy = snapshot(`function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    seen.set(nums[i], i);
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
  }
}`)
const complete = snapshot(`function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
}`)
const alternative = snapshot(`function twoSum(nums, target) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) return [i, j];
    }
  }
}`)
const first: CodeHint = {
  text: 'Which earlier values might help identify the complement of the current value?',
  strength: 'light',
  progress: 'initial',
}
const distinct: CodeHint = {
  text: 'Could the stored complement refer to the very same index you are examining?',
  strength: 'light',
  progress: 'initial',
}
const medium: CodeHint = {
  text: 'Track earlier values and their indices so the current complement can be found among values already visited.',
  strength: 'medium',
  progress: 'stuck',
}
const input = (
  current: CodeHintInput['snapshot'],
  history: CodeHintInput['history'],
): CodeHintInput => ({ problem, snapshot: current, history })

export const codeHintEvaluationFixtures = [
  {
    id: 'initial-empty-code',
    input: input(empty, []),
    expected: { strength: 'light', progress: 'initial' },
    criterion:
      'A conceptual initial hint grounded in the empty implementation; no full recipe or example answer.',
  },
  {
    id: 'unchanged-medium',
    input: input({ ...empty, capturedAt: 1 }, [
      { snapshot: empty, hint: first },
    ]),
    expected: { strength: 'medium', progress: 'stuck' },
    criterion:
      'Unchanged code must strengthen the prior idea to a targeted change without repeating it.',
  },
  {
    id: 'unchanged-heavy',
    input: input({ ...empty, capturedAt: 2 }, [
      { snapshot: empty, hint: first },
      { snapshot: { ...empty, capturedAt: 1 }, hint: medium },
    ]),
    expected: { strength: 'heavy', progress: 'stuck' },
    criterion:
      'Give concrete remaining steps after two unchanged turns, without a complete implementation.',
  },
  {
    id: 'real-progress',
    input: input(buggy, [{ snapshot: empty, hint: first }]),
    expected: { strength: 'light', progress: 'improved' },
    criterion:
      'Recognize meaningful reuse/lookup progress; ask a light question about the remaining same-index defect and preserve the map approach.',
  },
  {
    id: 'cosmetic-comment',
    input: input(snapshot('// Remember the complement.\n' + buggy.code, 1), [
      { snapshot: buggy, hint: distinct },
    ]),
    expected: { strength: 'medium', progress: 'stuck' },
    criterion:
      'A comment alone does not fix insertion before lookup; strengthen the guidance rather than declaring improvement.',
  },
  {
    id: 'regression',
    input: input(buggy, [
      {
        snapshot: complete,
        hint: {
          text: 'Check that the returned indices are distinct even when target is twice a value.',
          strength: 'light',
          progress: 'initial',
        },
      },
    ]),
    expected: { strength: 'medium', progress: 'stuck' },
    criterion:
      'Recognize the introduced same-index regression; identify relevant ordering and strengthen guidance.',
  },
  {
    id: 'near-complete',
    input: input(complete, [{ snapshot: buggy, hint: distinct }]),
    expected: { strength: 'light', progress: 'improved' },
    criterion:
      'Recognize the fixed distinct-index gap; offer a targeted verification check such as duplicate values, without inventing a defect or claiming executed correctness.',
  },
  {
    id: 'valid-alternative-progress',
    input: input(alternative, [{ snapshot: buggy, hint: distinct }]),
    expected: { strength: 'light', progress: 'improved' },
    criterion:
      'Preserve the correct nested-loop alternative under the small constraints. A strategy switch solving the gap counts as progress without obeying an earlier algorithm. Offer verification, not a fabricated bug.',
  },
] satisfies Array<{
  id: string
  input: CodeHintInput
  expected: Pick<CodeHint, 'strength' | 'progress'>
  criterion: string
}>
