import { describe, expect, it } from 'vitest'
import {
  leetcodeCodeSnapshotSchema,
  leetcodeProblemContentSchema,
  leetcodeProblemRemoteRequestSchema,
  leetcodeSubmissionResultRemoteRequestSchema,
} from './leetcode-capture-contracts'

const location = {
  slug: 'two-sum',
  url: 'https://leetcode.com/problems/two-sum/',
  host: 'leetcode.com',
}
const codeSnapshot = {
  code: '  return []\n',
  language: 'Python3',
  source: 'monaco',
  completeness: 'partial',
  capturedAt: 5000,
}
const content = {
  location,
  statement: 'Return indices.',
  examples: [],
  constraints: [],
  hints: [],
  followUps: ['Use expected linear time.'],
  source: 'graphql',
  confidence: 'high',
  completeness: 'complete',
  capturedAt: 5000,
  contentFingerprint: 'lc-content-1',
}
const request = {
  location,
  attemptId: 'attempt-fixed',
  click: { location, clickedAt: 5000, buttonText: 'Submit' },
  submittedCodeSnapshot: codeSnapshot,
  submissionId: '1234567890',
  refresh: true,
}

describe('LeetCode capture contracts', () => {
  it('roundtrips capture provenance, follow-ups, identity, and refresh fields', () => {
    expect(leetcodeCodeSnapshotSchema.parse(codeSnapshot)).toEqual(codeSnapshot)
    expect(leetcodeProblemContentSchema.parse(content)).toEqual(content)
    expect(leetcodeSubmissionResultRemoteRequestSchema.parse(request)).toEqual(
      request,
    )
    expect(
      leetcodeProblemRemoteRequestSchema.parse({ location, refresh: true }),
    ).toEqual({ location, refresh: true })
  })

  it.each([undefined, 'unknown', null])(
    'rejects missing or invalid completeness: %j',
    (completeness) => {
      expect(
        leetcodeCodeSnapshotSchema.safeParse({ ...codeSnapshot, completeness })
          .success,
      ).toBe(false)
      expect(
        leetcodeProblemContentSchema.safeParse({ ...content, completeness })
          .success,
      ).toBe(false)
    },
  )

  it('rejects missing follow-up provenance', () => {
    expect(
      leetcodeProblemContentSchema.safeParse({
        ...content,
        followUps: undefined,
      }).success,
    ).toBe(false)
  })

  it.each([undefined, '', '   ', 42, null])(
    'rejects missing or invalid attempt identity: %j',
    (attemptId) => {
      expect(
        leetcodeSubmissionResultRemoteRequestSchema.safeParse({
          ...request,
          attemptId,
        }).success,
      ).toBe(false)
    },
  )

  it.each(['', 'abc', '-1', '1.5', 1234567890])(
    'rejects invalid submission IDs: %j',
    (submissionId) => {
      expect(
        leetcodeSubmissionResultRemoteRequestSchema.safeParse({
          ...request,
          submissionId,
        }).success,
      ).toBe(false)
    },
  )
})
