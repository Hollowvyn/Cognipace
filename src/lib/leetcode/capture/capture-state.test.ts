import { describe, expect, it } from 'vitest'

import type {
  LeetCodePageEvent,
  LeetCodePageSnapshot,
  LeetCodeProblemContent,
  LeetCodeProblemLocation,
  LeetCodeProblemMetadata,
  LeetCodeSubmissionAttempt,
  LeetCodeSubmissionResult,
} from '../domain/types'
import {
  createEmptyLeetCodeCaptureState,
  createLeetCodeReviewContext,
  reduceLeetCodeCaptureState,
} from './capture-state'

const location = {
  slug: 'two-sum',
  url: 'https://leetcode.com/problems/two-sum/',
  host: 'leetcode.com',
} satisfies LeetCodeProblemLocation

const nextLocation = {
  slug: 'valid-parentheses',
  url: 'https://leetcode.com/problems/valid-parentheses/',
  host: 'leetcode.com',
} satisfies LeetCodeProblemLocation

const metadata = {
  location,
  title: 'Two Sum',
  frontendId: '1',
  difficulty: 'Easy',
  isPremium: false,
  topics: [{ name: 'Array', slug: 'array' }],
  source: 'graphql',
  confidence: 'high',
  capturedAt: 1000,
} satisfies LeetCodeProblemMetadata

const content = {
  location,
  statement: 'Return indices of the two numbers.',
  examples: [
    {
      label: 'Example 1',
      input: 'nums = [2,7,11,15], target = 9',
      output: '[0,1]',
      explanation: null,
      rawText: 'Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]',
    },
  ],
  constraints: ['2 <= nums.length <= 10^4'],
  hints: ['Use a hash map.'],
  followUps: [],
  completeness: 'complete',
  source: 'graphql',
  confidence: 'high',
  capturedAt: 1200,
  contentFingerprint: 'content:two-sum',
} satisfies LeetCodeProblemContent

const submissionAttempt = {
  attemptId: 'attempt-fixed',
  location,
  clickedAt: 2000,
  submitButtonText: 'Submit',
  submittedCodeSnapshot: {
    code: 'class Solution:\n    return [0, 1]',
    language: 'Python3',
    source: 'monaco',
    completeness: 'partial',
    capturedAt: 2000,
  },
} satisfies LeetCodeSubmissionAttempt

const submissionResult = {
  location,
  submissionId: '1234567890',
  source: 'api',
  status: 'accepted',
  statusText: 'Accepted',
  checkedAt: 3000,
  runtime: '4 ms',
  memory: '20 MB',
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
    code: submissionAttempt.submittedCodeSnapshot.code,
    language: 'Python3',
    source: 'api',
    completeness: 'complete',
    capturedAt: 3000,
  },
} satisfies LeetCodeSubmissionResult

describe('LeetCode capture state', () => {
  it('creates an empty capture state for the current location', () => {
    expect(createEmptyLeetCodeCaptureState(location)).toEqual({
      location,
      metadata: null,
      problemContent: null,
      codeSnapshot: null,
      submissionClick: null,
      submissionAttempt: null,
      submissionPollingDebug: null,
      submissionResult: null,
      pageReadyAt: null,
      lastUpdatedAt: null,
    })
  })

  it('reduces watcher events into a complete capture state', () => {
    const state = reduceEvents(
      {
        type: 'page-ready',
        location,
        snapshot: nullSnapshot(),
        metadata,
        pageReadyAt: 1000,
      },
      { type: 'problem-content-updated', location, content },
      {
        type: 'submit-clicked',
        click: { location, clickedAt: 1900, buttonText: 'Submit' },
      },
      { type: 'submission-started', attempt: submissionAttempt },
      {
        type: 'submission-polling-updated',
        location,
        debug: {
          phase: 'checking-result',
          submissionId: '1234567890',
          checkState: 'PENDING',
          statusText: 'Pending',
          checkedAt: 2500,
        },
      },
      { type: 'submission-result-updated', result: submissionResult },
    )

    expect(state).toMatchObject({
      location,
      metadata,
      problemContent: content,
      codeSnapshot: submissionAttempt.submittedCodeSnapshot,
      submissionClick: { clickedAt: 1900 },
      submissionAttempt,
      submissionPollingDebug: { phase: 'checking-result' },
      submissionResult,
      pageReadyAt: 1000,
      lastUpdatedAt: 3000,
    })
  })

  it('clears stale page data when LeetCode navigates to another problem', () => {
    const populatedState = reduceEvents(
      { type: 'metadata-updated', location, metadata },
      { type: 'problem-content-updated', location, content },
      { type: 'submission-started', attempt: submissionAttempt },
      { type: 'submission-result-updated', result: submissionResult },
    )

    const nextState = reduceLeetCodeCaptureState(populatedState, {
      type: 'page-changed',
      location: nextLocation,
      previousLocation: location,
      changedAt: 4000,
    })

    expect(nextState).toEqual({
      ...createEmptyLeetCodeCaptureState(nextLocation),
      lastUpdatedAt: 4000,
    })
  })

  it('keeps the attempt fragment when result code is partial or missing', () => {
    for (const completeness of ['partial', 'missing'] as const) {
      const state = reduceEvents(
        { type: 'metadata-updated', location, metadata },
        { type: 'problem-content-updated', location, content },
        { type: 'submission-started', attempt: submissionAttempt },
        {
          type: 'submission-result-updated',
          result: {
            ...submissionResult,
            resultCodeSnapshot: {
              ...submissionResult.resultCodeSnapshot,
              code: null,
              completeness,
            },
          },
        },
      )
      expect(createLeetCodeReviewContext(state)?.submittedCode).toBe(
        submissionAttempt.submittedCodeSnapshot,
      )
    }
  })

  it('creates review context only after metadata and problem content exist', () => {
    const emptyState = createEmptyLeetCodeCaptureState(location)
    const metadataOnlyState = reduceEvents({
      type: 'metadata-updated',
      location,
      metadata,
    })
    const problemState = reduceEvents(
      { type: 'metadata-updated', location, metadata },
      { type: 'problem-content-updated', location, content },
    )
    const submittedState = reduceEventsFrom(
      problemState,
      { type: 'submission-started', attempt: submissionAttempt },
      { type: 'submission-result-updated', result: submissionResult },
    )

    expect(createLeetCodeReviewContext(emptyState)).toBeNull()
    expect(createLeetCodeReviewContext(metadataOnlyState)).toBeNull()
    expect(createLeetCodeReviewContext(problemState)).toMatchObject({
      location,
      problem: metadata,
      content,
      currentCode: null,
      submittedCode: null,
      submissionResult: null,
      capturedAt: 1200,
    })
    expect(createLeetCodeReviewContext(submittedState)).toMatchObject({
      currentCode: submissionAttempt.submittedCodeSnapshot,
      submittedCode: submissionResult.resultCodeSnapshot,
      submissionResult,
      capturedAt: 3000,
    })
  })
})

function reduceEvents(...events: LeetCodePageEvent[]) {
  return reduceEventsFrom(createEmptyLeetCodeCaptureState(location), ...events)
}

function reduceEventsFrom(
  initialState: ReturnType<typeof createEmptyLeetCodeCaptureState>,
  ...events: LeetCodePageEvent[]
) {
  return events.reduce(reduceLeetCodeCaptureState, initialState)
}

function nullSnapshot() {
  return {
    location,
    title: null,
    frontendId: null,
    difficulty: 'Unknown',
    isPremium: null,
    topics: [],
    isReady: false,
    capturedAt: 1000,
  } satisfies LeetCodePageSnapshot
}
