import type { HintProblem } from '../api/code-hint-contracts'

export const codeHintEvaluationFixtures = [
  {
    id: 'lookup-two-sum',
    problem: {
      host: 'leetcode.com',
      slug: 'two-sum',
      title: 'Two Sum',
      statement:
        'Given an integer array nums and an integer target, return indices of two different elements whose sum equals target. Exactly one answer exists. You may return the indices in any order.',
      examples: [
        'nums = [2,7,11,15], target = 9. Output: [0,1]. nums[0] + nums[1] = 9.',
      ],
      constraints: [
        '2 <= nums.length <= 10000',
        '-1000000000 <= nums[i], target <= 1000000000',
        'Exactly one valid answer exists.',
      ],
    } satisfies HintProblem,
    criterion:
      'First pointer suggests what earlier work can be reused without announcing a full algorithm. Later pointers become more concrete about complementary values and remembered indices. No executable code, complete recipe, or answer for the example.',
  },
  {
    id: 'nested-parentheses',
    problem: {
      host: 'leetcode.com',
      slug: 'valid-parentheses',
      title: 'Valid Parentheses',
      statement:
        'Given a string s containing only (, ), {, }, [ and ], determine whether it is valid. Every opening bracket must be closed by the same type in the correct order. Every closing bracket must have a corresponding opening bracket.',
      examples: ['s = "()[]{}". Output: true.', 's = "([)]". Output: false.'],
      constraints: [
        '1 <= s.length <= 10000',
        's contains only parentheses characters ()[]{}.',
      ],
    } satisfies HintProblem,
    criterion:
      'First pointer draws attention to nested order. Later pointers can suggest remembering the most recent unmatched opening bracket. Do not enumerate a complete implementation or a full solution.',
  },
  {
    id: 'course-prerequisite-cycle',
    problem: {
      host: 'leetcode.com',
      slug: 'course-schedule',
      title: 'Course Schedule',
      statement:
        'There are numCourses courses labeled from 0 to numCourses - 1. Each prerequisite pair [a,b] means course b must be taken before course a. Determine whether all courses can be completed.',
      examples: [
        'numCourses = 2, prerequisites = [[1,0]]. Output: true.',
        'numCourses = 2, prerequisites = [[1,0],[0,1]]. Output: false.',
      ],
      constraints: [
        '1 <= numCourses <= 2000',
        '0 <= prerequisites.length <= 5000',
        'prerequisites[i].length == 2',
        '0 <= a,b < numCourses',
        'Prerequisite pairs are unique.',
      ],
    } satisfies HintProblem,
    criterion:
      'Use prerequisites to prompt reasoning about circular dependencies. Later pointers may identify a useful graph property or progress signal, but must leave traversal details to the learner. Pointers must progress and remain useful on this medium problem.',
  },
] satisfies Array<{ id: string; problem: HintProblem; criterion: string }>
