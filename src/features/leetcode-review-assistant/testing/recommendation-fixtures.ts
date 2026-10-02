import type { LeetCodeAssessmentDecision } from '@/features/assessment'
import type {
  GenAiProviderConfig,
  GenAiProviderMetadata,
} from '@/features/genai'
import type {
  OverlayAssessmentLatestAttempt,
  OverlayAssessmentSessionContext,
} from '@/features/overlay-session'

import {
  PROMPT_VERSION,
  type AssessmentRecommendation,
  type AssessmentRecommendationProblem,
  type AssessmentRecommendationSubmission,
  type AssessmentRecommendationTiming,
  type RecommendAssessmentInput,
} from '../domain/recommendation-types'

const baseLatestAttempt: OverlayAssessmentLatestAttempt = {
  id: 'attempt-1',
  rating: 'good',
  isCorrect: true,
  elapsedSeconds: 1200,
  occurredAt: Date.parse('2026-05-30T10:00:00.000Z'),
}

export function makeProblem(
  overrides: Partial<AssessmentRecommendationProblem> = {},
): AssessmentRecommendationProblem {
  return {
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'medium',
    topics: ['array', 'hash-table'],
    statement: 'Find two numbers in the array that add up to the target.',
    ...overrides,
  }
}

export function makeAcceptedSubmission(
  overrides: Partial<
    Extract<AssessmentRecommendationSubmission, { status: 'accepted' }>
  > = {},
): AssessmentRecommendationSubmission {
  return {
    status: 'accepted',
    code: 'function twoSum(nums, target) { /* ... */ }',
    language: 'TypeScript',
    runtime: '42 ms',
    memory: '18 MB',
    passedTestCount: 57,
    totalTestCount: 57,
    ...overrides,
  }
}

export function makeFailedSubmission(
  overrides: Partial<
    Extract<AssessmentRecommendationSubmission, { status: 'failed' }>
  > = {},
): AssessmentRecommendationSubmission {
  return {
    status: 'failed',
    code: 'function twoSum(nums, target) { return [] }',
    language: 'TypeScript',
    failingTestcase: '[2,7,11,15]\n9',
    expectedOutput: '[0,1]',
    actualOutput: '[]',
    errorMessage: '',
    passedTestCount: 10,
    totalTestCount: 11,
    ...overrides,
  }
}

export function makeNoSubmission(): AssessmentRecommendationSubmission {
  return { status: 'no-submission' }
}

export function makeTiming(
  overrides: Partial<AssessmentRecommendationTiming> = {},
): AssessmentRecommendationTiming {
  return {
    elapsedSeconds: 600,
    targetSeconds: 2100,
    timerUsed: true,
    ...overrides,
  }
}

export function makeAcceptedDecision(
  overrides: Partial<LeetCodeAssessmentDecision> = {},
): LeetCodeAssessmentDecision {
  return {
    status: 'accepted',
    rating: 'good',
    isCorrect: true,
    elapsedSeconds: 600,
    targetSeconds: 2100,
    isOverTarget: false,
    lockReason: null,
    reason: {
      code: 'leetcode-good',
      signals: {
        elapsedSeconds: 600,
        targetSeconds: 2100,
        ratioOfTarget: 600 / 2100,
        previousBestSeconds: 1200,
        beatsPreviousBest: true,
        isRecallReview: true,
      },
    },
    warnings: [],
    confidence: 0.8,
    ...overrides,
  } as LeetCodeAssessmentDecision
}

export function makeFailedDecision(): LeetCodeAssessmentDecision {
  return {
    status: 'accepted',
    rating: 'again',
    isCorrect: false,
    elapsedSeconds: 900,
    targetSeconds: 2100,
    isOverTarget: false,
    lockReason: 'failed',
    reason: {
      code: 'failed',
      signals: {
        elapsedSeconds: 900,
        targetSeconds: 2100,
        ratioOfTarget: 900 / 2100,
        previousBestSeconds: null,
        beatsPreviousBest: null,
        isRecallReview: null,
      },
    },
    warnings: [],
    confidence: 1,
  }
}

export function makeStrictTimingLockedDecision(): LeetCodeAssessmentDecision {
  return {
    status: 'accepted',
    rating: 'again',
    isCorrect: false,
    elapsedSeconds: 2200,
    targetSeconds: 2100,
    isOverTarget: true,
    lockReason: 'hard-mode-overtime',
    reason: {
      code: 'hard-mode-overtime',
      signals: {
        elapsedSeconds: 2200,
        targetSeconds: 2100,
        ratioOfTarget: 2200 / 2100,
        previousBestSeconds: null,
        beatsPreviousBest: null,
        isRecallReview: null,
      },
    },
    warnings: [],
    confidence: 1,
  }
}

export function makeRecallSessionContext(
  overrides: Partial<OverlayAssessmentSessionContext> = {},
): OverlayAssessmentSessionContext {
  return {
    sessionKind: 'recall-review',
    submissionSource: 'leetcode-watcher',
    timerUsed: true,
    previousRating: 'good',
    bestElapsedSeconds: 1200,
    latestAttempt: baseLatestAttempt,
    ...overrides,
  }
}

export function makeFirstSolveSessionContext(): OverlayAssessmentSessionContext {
  return {
    sessionKind: 'first-solve',
    submissionSource: 'leetcode-watcher',
    timerUsed: true,
    previousRating: null,
    bestElapsedSeconds: null,
    latestAttempt: null,
  }
}

export function makeProviderConfig(
  overrides: Partial<GenAiProviderConfig> = {},
): GenAiProviderConfig {
  return {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test-fixture',
    ...overrides,
  }
}

export function makeProviderMetadata(
  overrides: Partial<GenAiProviderMetadata> = {},
): GenAiProviderMetadata {
  return {
    provider: 'openai',
    model: 'gpt-test',
    durationMs: 1234,
    ...overrides,
  }
}

export function makeValidRecommendation(
  overrides: Partial<AssessmentRecommendation> = {},
): AssessmentRecommendation {
  return {
    recommendedRating: 'good',
    confidence: 'medium',
    summary: 'Solved within target time using a hash-map.',
    primaryReason: 'Accepted on first try, normal time.',
    evidence: ['Status: accepted', 'Elapsed 600s vs 2100s target'],
    complexity: { time: 'O(n)', space: 'O(n)', confidence: 'high' },
    improvementPoints: [],
    edgeCaseNotes: [],
    shouldUpdateRating: false,
    promptVersion: PROMPT_VERSION,
    ...overrides,
  }
}

export function makeRecommendAssessmentInput(
  overrides: Partial<RecommendAssessmentInput> = {},
): RecommendAssessmentInput {
  return {
    problem: makeProblem(),
    submission: makeAcceptedSubmission(),
    timing: makeTiming(),
    deterministicDecision: makeAcceptedDecision(),
    sessionContext: makeRecallSessionContext(),
    providerConfig: makeProviderConfig(),
    ...overrides,
  }
}
