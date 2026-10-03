import { normalizeLeetCodeSlug } from '@/lib/leetcode'

import type { Db } from './client'
import {
  problems,
  topicAliases,
  topicRelations,
  topics,
  trackGroupProblems,
  trackGroups,
  tracks,
  trackSession,
} from './schema'
import {
  seedTopicAliases,
  seedTopicRelations,
  seedTopics,
} from './topic-taxonomy-seed'

type SeedProblem = {
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard' | 'unknown'
  isPremium: boolean
}

type SeedProblemSeed = Omit<SeedProblem, 'isPremium'>

const byteByteGo101TrackId = 'bytebytego-coding-patterns-101'

const byteByteGo101Groups = [
  {
    title: 'Two Pointers',
    problems: [
      {
        slug: 'two-sum-ii-input-array-is-sorted',
        title: 'Pair Sum - Sorted',
        difficulty: 'easy',
      },
      { slug: '3sum', title: 'Triplet Sum', difficulty: 'medium' },
      {
        slug: 'valid-palindrome',
        title: 'Is Palindrome Valid',
        difficulty: 'easy',
      },
      {
        slug: 'container-with-most-water',
        title: 'Largest Container',
        difficulty: 'medium',
      },
      {
        slug: 'move-zeroes',
        title: 'Shift Zeros to the End',
        difficulty: 'easy',
      },
      {
        slug: 'next-permutation',
        title: 'Next Lexicographical Sequence',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Hash Maps And Sets',
    problems: [
      { slug: 'two-sum', title: 'Pair Sum - Unsorted', difficulty: 'easy' },
      {
        slug: 'valid-sudoku',
        title: 'Verify Sudoku Board',
        difficulty: 'medium',
      },
      {
        slug: 'set-matrix-zeroes',
        title: 'Zero Striping',
        difficulty: 'medium',
      },
      {
        slug: 'longest-consecutive-sequence',
        title: 'Longest Chain of Consecutive Numbers',
        difficulty: 'medium',
      },
      {
        slug: 'tuple-with-same-product',
        title: 'Geometric Sequence Triplets',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Linked Lists',
    problems: [
      {
        slug: 'reverse-linked-list',
        title: 'Linked List Reversal',
        difficulty: 'easy',
      },
      {
        slug: 'remove-nth-node-from-end-of-list',
        title: 'Remove the Kth Last Node From a Linked List',
        difficulty: 'medium',
      },
      {
        slug: 'intersection-of-two-linked-lists',
        title: 'Linked List Intersection',
        difficulty: 'easy',
      },
      { slug: 'lru-cache', title: 'LRU Cache', difficulty: 'hard' },
      {
        slug: 'palindrome-linked-list',
        title: 'Palindromic Linked List',
        difficulty: 'easy',
      },
      {
        slug: 'flatten-a-multilevel-doubly-linked-list',
        title: 'Flatten a Multi-Level Linked List',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Fast And Slow Pointers',
    problems: [
      {
        slug: 'linked-list-cycle',
        title: 'Linked List Loop',
        difficulty: 'easy',
      },
      {
        slug: 'middle-of-the-linked-list',
        title: 'Linked List Midpoint',
        difficulty: 'easy',
      },
      { slug: 'happy-number', title: 'Happy Number', difficulty: 'medium' },
    ],
  },
  {
    title: 'Sliding Window',
    problems: [
      {
        slug: 'find-all-anagrams-in-a-string',
        title: 'Substring Anagrams',
        difficulty: 'medium',
      },
      {
        slug: 'longest-substring-without-repeating-characters',
        title: 'Longest Substring With Unique Characters',
        difficulty: 'medium',
      },
      {
        slug: 'longest-repeating-character-replacement',
        title: 'Longest Uniform Substring After Replacements',
        difficulty: 'hard',
      },
    ],
  },
  {
    title: 'Binary Search',
    problems: [
      {
        slug: 'search-insert-position',
        title: 'Find the Insertion Index',
        difficulty: 'easy',
      },
      {
        slug: 'find-first-and-last-position-of-element-in-sorted-array',
        title: 'First and Last Occurrences of a Number',
        difficulty: 'medium',
      },
      { slug: 'cutting-ribbons', title: 'Cutting Wood', difficulty: 'medium' },
      {
        slug: 'search-in-rotated-sorted-array',
        title: 'Find the Target in a Rotated Sorted Array',
        difficulty: 'medium',
      },
      {
        slug: 'median-of-two-sorted-arrays',
        title: 'Find the Median From Two Sorted Arrays',
        difficulty: 'hard',
      },
      {
        slug: 'search-a-2d-matrix',
        title: 'Matrix Search',
        difficulty: 'medium',
      },
      {
        slug: 'find-peak-element',
        title: 'Local Maxima in Array',
        difficulty: 'medium',
      },
      {
        slug: 'random-pick-with-weight',
        title: 'Weighted Random Selection',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Stacks',
    problems: [
      {
        slug: 'valid-parentheses',
        title: 'Valid Parenthesis Expression',
        difficulty: 'easy',
      },
      {
        slug: 'next-greater-element-i',
        title: 'Next Largest Number to the Right',
        difficulty: 'medium',
      },
      {
        slug: 'evaluate-reverse-polish-notation',
        title: 'Evaluate Expression',
        difficulty: 'hard',
      },
      {
        slug: 'remove-all-adjacent-duplicates-in-string',
        title: 'Repeated Removal of Adjacent Duplicates',
        difficulty: 'easy',
      },
      {
        slug: 'implement-queue-using-stacks',
        title: 'Implement a Queue using Stacks',
        difficulty: 'medium',
      },
      {
        slug: 'sliding-window-maximum',
        title: 'Maximums of Sliding Window',
        difficulty: 'hard',
      },
    ],
  },
  {
    title: 'Heaps',
    problems: [
      {
        slug: 'top-k-frequent-words',
        title: 'K Most Frequent Strings',
        difficulty: 'medium',
      },
      {
        slug: 'merge-k-sorted-lists',
        title: 'Combine Sorted Linked Lists',
        difficulty: 'medium',
      },
      {
        slug: 'find-median-from-data-stream',
        title: 'Median of an Integer Stream',
        difficulty: 'hard',
      },
      {
        slug: 'sort-characters-by-frequency',
        title: 'Sort a K-Sorted Array',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Intervals',
    problems: [
      {
        slug: 'merge-intervals',
        title: 'Merge Overlapping Intervals',
        difficulty: 'medium',
      },
      {
        slug: 'interval-list-intersections',
        title: 'Identify All Interval Overlaps',
        difficulty: 'medium',
      },
      {
        slug: 'meeting-rooms-ii',
        title: 'Largest Overlap of Intervals',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Prefix Sums',
    problems: [
      {
        slug: 'range-sum-query-immutable',
        title: 'Sum Between Range',
        difficulty: 'easy',
      },
      {
        slug: 'subarray-sum-equals-k',
        title: 'K-Sum Subarrays',
        difficulty: 'medium',
      },
      {
        slug: 'product-of-array-except-self',
        title: 'Product Array Without Current Element',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Trees',
    problems: [
      {
        slug: 'invert-binary-tree',
        title: 'Invert Binary Tree',
        difficulty: 'easy',
      },
      {
        slug: 'balanced-binary-tree',
        title: 'Balanced Binary Tree Validation',
        difficulty: 'easy',
      },
      {
        slug: 'binary-tree-right-side-view',
        title: 'Rightmost Nodes of a Binary Tree',
        difficulty: 'medium',
      },
      {
        slug: 'maximum-width-of-binary-tree',
        title: 'Widest Binary Tree Level',
        difficulty: 'medium',
      },
      {
        slug: 'validate-binary-search-tree',
        title: 'Binary Search Tree Validation',
        difficulty: 'medium',
      },
      {
        slug: 'lowest-common-ancestor-of-a-binary-tree',
        title: 'Lowest Common Ancestor',
        difficulty: 'medium',
      },
      {
        slug: 'construct-binary-tree-from-preorder-and-inorder-traversal',
        title: 'Build Binary Tree From Preorder and Inorder Traversals',
        difficulty: 'medium',
      },
      {
        slug: 'binary-tree-maximum-path-sum',
        title: 'Maximum Sum of a Continuous Path in a Binary Tree',
        difficulty: 'hard',
      },
      {
        slug: 'symmetric-tree',
        title: 'Binary Tree Symmetry',
        difficulty: 'medium',
      },
      {
        slug: 'binary-tree-vertical-order-traversal',
        title: 'Binary Tree Columns',
        difficulty: 'medium',
      },
      {
        slug: 'kth-smallest-element-in-a-bst',
        title: 'Kth Smallest Number in a Binary Search Tree',
        difficulty: 'medium',
      },
      {
        slug: 'serialize-and-deserialize-binary-tree',
        title: 'Serialize and Deserialize a Binary Tree',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Tries',
    problems: [
      {
        slug: 'implement-trie-prefix-tree',
        title: 'Design a Trie',
        difficulty: 'medium',
      },
      {
        slug: 'design-add-and-search-words-data-structure',
        title: 'Insert and Search Words with Wildcards',
        difficulty: 'medium',
      },
      {
        slug: 'word-search-ii',
        title: 'Find All Words on a Board',
        difficulty: 'hard',
      },
    ],
  },
  {
    title: 'Graphs',
    problems: [
      { slug: 'clone-graph', title: 'Graph Deep Copy', difficulty: 'medium' },
      {
        slug: 'number-of-islands',
        title: 'Count Islands',
        difficulty: 'medium',
      },
      {
        slug: 'rotting-oranges',
        title: 'Matrix Infection',
        difficulty: 'medium',
      },
      {
        slug: 'is-graph-bipartite',
        title: 'Bipartite Graph Validation',
        difficulty: 'medium',
      },
      {
        slug: 'longest-increasing-path-in-a-matrix',
        title: 'Longest Increasing Path',
        difficulty: 'medium',
      },
      {
        slug: 'word-ladder',
        title: 'Shortest Transformation Sequence',
        difficulty: 'hard',
      },
      {
        slug: 'accounts-merge',
        title: 'Merging Communities',
        difficulty: 'hard',
      },
      { slug: 'course-schedule', title: 'Prerequisites', difficulty: 'medium' },
      {
        slug: 'network-delay-time',
        title: 'Shortest Path',
        difficulty: 'hard',
      },
      {
        slug: 'number-of-connected-components-in-an-undirected-graph',
        title: 'Connect the Dots',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Backtracking',
    problems: [
      {
        slug: 'permutations',
        title: 'Find All Permutations',
        difficulty: 'medium',
      },
      { slug: 'subsets', title: 'Find All Subsets', difficulty: 'medium' },
      { slug: 'n-queens', title: 'N Queens', difficulty: 'hard' },
      {
        slug: 'combination-sum',
        title: 'Combinations of a Sum',
        difficulty: 'medium',
      },
      {
        slug: 'letter-combinations-of-a-phone-number',
        title: 'Phone Keypad Combinations',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Dynamic Programming',
    problems: [
      { slug: 'climbing-stairs', title: 'Climbing Stairs', difficulty: 'easy' },
      {
        slug: 'coin-change',
        title: 'Minimum Coin Combination',
        difficulty: 'medium',
      },
      { slug: 'unique-paths', title: 'Matrix Pathways', difficulty: 'medium' },
      {
        slug: 'house-robber',
        title: 'Neighborhood Burglary',
        difficulty: 'medium',
      },
      {
        slug: 'longest-common-subsequence',
        title: 'Longest Common Subsequence',
        difficulty: 'hard',
      },
      {
        slug: 'longest-palindromic-substring',
        title: 'Longest Palindrome in a String',
        difficulty: 'medium',
      },
      {
        slug: 'maximum-subarray',
        title: 'Maximum Subarray Sum',
        difficulty: 'medium',
      },
      { slug: 'ones-and-zeroes', title: '0/1 Knapsack', difficulty: 'hard' },
      {
        slug: 'maximal-square',
        title: 'Largest Square in a Matrix',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Greedy',
    problems: [
      { slug: 'jump-game', title: 'Jump to the End', difficulty: 'medium' },
      { slug: 'gas-station', title: 'Gas Stations', difficulty: 'hard' },
      { slug: 'candy', title: 'Candies', difficulty: 'medium' },
    ],
  },
  {
    title: 'Sort And Search',
    problems: [
      { slug: 'sort-list', title: 'Sort Linked List', difficulty: 'medium' },
      { slug: 'sort-an-array', title: 'Sort Array', difficulty: 'medium' },
      {
        slug: 'kth-largest-element-in-an-array',
        title: 'Kth Largest Integer',
        difficulty: 'medium',
      },
      {
        slug: 'sort-colors',
        title: 'Dutch National Flag',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Bit Manipulation',
    problems: [
      {
        slug: 'number-of-1-bits',
        title: 'Hamming Weights of Integers',
        difficulty: 'easy',
      },
      { slug: 'single-number', title: 'Lonely Integer', difficulty: 'easy' },
      {
        slug: 'reverse-bits',
        title: 'Swap Odd and Even Bits',
        difficulty: 'medium',
      },
    ],
  },
  {
    title: 'Math And Geometry',
    problems: [
      {
        slug: 'spiral-matrix',
        title: 'Spiral Traversal',
        difficulty: 'medium',
      },
      {
        slug: 'reverse-integer',
        title: 'Reverse 32-Bit Integer',
        difficulty: 'medium',
      },
      {
        slug: 'max-points-on-a-line',
        title: 'Maximum Collinear Points',
        difficulty: 'hard',
      },
      {
        slug: 'find-the-winner-of-the-circular-game',
        title: 'The Josephus Problem',
        difficulty: 'medium',
      },
      {
        slug: 'valid-triangle-number',
        title: 'Triangle Numbers',
        difficulty: 'medium',
      },
    ],
  },
] satisfies readonly {
  title: string
  problems: readonly SeedProblemSeed[]
}[]

const seedProblems = uniqueSeedProblems([
  {
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    isPremium: false,
  },
  {
    slug: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'easy',
    isPremium: false,
  },
  ...byteByteGo101Groups.flatMap((group) =>
    group.problems.map((problem) => ({
      ...problem,
      isPremium: false,
    })),
  ),
])

const seedTracks = [
  {
    id: byteByteGo101TrackId,
    slug: byteByteGo101TrackId,
    title: 'ByteByteGo Coding Patterns 101',
    description:
      "ByteByteGo's coding patterns path, organized by interview pattern.",
  },
  {
    id: 'leetcode-75',
    slug: 'leetcode-75',
    title: 'LeetCode 75',
    description: 'Focused starter track for high-signal interview patterns.',
  },
  {
    id: 'grind-75',
    slug: 'grind-75',
    title: 'Grind 75',
    description: 'Compact practice set for repeated algorithm review.',
  },
]

const seedTrackGroups = [
  ...byteByteGo101Groups.map((group, index) => ({
    id: `${byteByteGo101TrackId}:${toSeedId(group.title)}`,
    trackId: byteByteGo101TrackId,
    title: group.title,
    position: index + 1,
  })),
  {
    id: 'leetcode-75:arrays-hashing',
    trackId: 'leetcode-75',
    title: 'Arrays and Hashing',
    position: 1,
  },
  {
    id: 'grind-75:stack',
    trackId: 'grind-75',
    title: 'Stack',
    position: 1,
  },
]

const seedTrackGroupProblems = [
  ...byteByteGo101Groups.flatMap((group) =>
    group.problems.map((problem, index) => ({
      trackGroupId: `${byteByteGo101TrackId}:${toSeedId(group.title)}`,
      trackId: byteByteGo101TrackId,
      problemSlug: problem.slug,
      position: index + 1,
    })),
  ),
  {
    trackGroupId: 'leetcode-75:arrays-hashing',
    trackId: 'leetcode-75',
    problemSlug: 'two-sum',
    position: 1,
  },
  {
    trackGroupId: 'grind-75:stack',
    trackId: 'grind-75',
    problemSlug: 'valid-parentheses',
    position: 1,
  },
]

export async function seedInitialCatalog(db: Db, now = new Date()) {
  const timestamp = now.getTime()

  await db
    .insert(problems)
    .values(
      seedProblems.map((problem) => ({
        ...problem,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
    .onConflictDoNothing()

  await db
    .insert(topics)
    .values(
      seedTopics.map((topic) => ({
        ...topic,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
    .onConflictDoNothing()

  await db
    .insert(topicAliases)
    .values(
      seedTopicAliases.map((alias) => ({
        ...alias,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
    .onConflictDoNothing()

  await db
    .insert(topicRelations)
    .values(
      seedTopicRelations.map((relation) => ({
        ...relation,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
    .onConflictDoNothing()

  await db
    .insert(tracks)
    .values(
      seedTracks.map((track) => ({
        ...track,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
    .onConflictDoNothing()

  await db
    .insert(trackGroups)
    .values(
      seedTrackGroups.map((group) => ({
        ...group,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
    .onConflictDoNothing()

  await db
    .insert(trackGroupProblems)
    .values([...seedTrackGroupProblems])
    .onConflictDoNothing()

  await db
    .insert(trackSession)
    .values({
      id: 'active',
      activeTrackId: byteByteGo101TrackId,
      activeGroupId: null,
      startedAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing()
}

function uniqueSeedProblems(input: readonly SeedProblem[]) {
  const bySlug = new Map<string, SeedProblem>()

  for (const problem of input) {
    if (!bySlug.has(problem.slug)) {
      bySlug.set(problem.slug, problem)
    }
  }

  return Array.from(bySlug.values())
}

function toSeedId(value: string) {
  return normalizeLeetCodeSlug(value)
}
