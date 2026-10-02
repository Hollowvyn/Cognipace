import { describe, expect, it } from 'vitest'

import { PROMPT_VERSION } from '../domain/recommendation-types'
import {
  recommendLeetCodeAssessmentRequestSchema,
  recommendLeetCodeAssessmentResponseSchema,
} from './runtime-contracts'

const validRequest = {
  surface: 'content-script' as const,
  problemSlug: 'two-sum',
  submissionFingerprint: 'fp-abc-123',
  problem: {
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'medium' as const,
    topics: ['array', 'hash-table'],
    statement: 'Find two numbers that add up to target.',
  },
  submission: {
    status: 'accepted' as const,
    code: 'function twoSum() {}',
    language: 'TypeScript',
    runtime: '42 ms',
    memory: '18 MB',
    passedTestCount: 57,
    totalTestCount: 57,
  },
  timing: {
    elapsedSeconds: 600,
    targetSeconds: 2100,
    timerUsed: true,
  },
  deterministicDecision: {
    status: 'accepted' as const,
    rating: 'good' as const,
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
  },
  sessionContext: {
    sessionKind: 'recall-review' as const,
    submissionSource: 'leetcode-watcher' as const,
    timerUsed: true,
    previousRating: 'good' as const,
    bestElapsedSeconds: 1200,
    latestAttempt: {
      id: 'attempt-1',
      rating: 'good' as const,
      isCorrect: true,
      elapsedSeconds: 1200,
      occurredAt: Date.parse('2026-05-30T10:00:00.000Z'),
    },
  },
}

const validRecommendation = {
  recommendedRating: 'good' as const,
  confidence: 'medium' as const,
  summary: 'Solved within target time.',
  primaryReason: 'Accepted on first try.',
  evidence: ['Status: accepted'],
  complexity: { time: 'O(n)', space: 'O(n)', confidence: 'high' as const },
  improvementPoints: [],
  edgeCaseNotes: [],
  shouldUpdateRating: false,
  promptVersion: PROMPT_VERSION,
}

const validProviderMetadata = {
  provider: 'openai' as const,
  model: 'gpt-4o',
  durationMs: 1234,
}

describe('recommendLeetCodeAssessmentRequestSchema', () => {
  it('accepts a canonical request', () => {
    expect(() =>
      recommendLeetCodeAssessmentRequestSchema.parse(validRequest),
    ).not.toThrow()
  })

  it('rejects surface other than content-script', () => {
    expect(() =>
      recommendLeetCodeAssessmentRequestSchema.parse({
        ...validRequest,
        surface: 'popup',
      }),
    ).toThrow()
  })

  it('rejects unknown wire fields via .strict()', () => {
    expect(() =>
      recommendLeetCodeAssessmentRequestSchema.parse({
        ...validRequest,
        unknownExtra: 'leak',
      }),
    ).toThrow()
  })

  it('rejects an empty submissionFingerprint', () => {
    expect(() =>
      recommendLeetCodeAssessmentRequestSchema.parse({
        ...validRequest,
        submissionFingerprint: '',
      }),
    ).toThrow()
  })

  it('accepts the failed submission variant', () => {
    expect(() =>
      recommendLeetCodeAssessmentRequestSchema.parse({
        ...validRequest,
        submission: {
          status: 'failed',
          code: 'function() {}',
          language: 'TypeScript',
          failingTestcase: '[1,2]',
          expectedOutput: '[0,1]',
          actualOutput: '[]',
          errorMessage: '',
          passedTestCount: 0,
          totalTestCount: 1,
        },
      }),
    ).not.toThrow()
  })

  it('accepts the no-submission variant', () => {
    expect(() =>
      recommendLeetCodeAssessmentRequestSchema.parse({
        ...validRequest,
        submission: { status: 'no-submission' },
      }),
    ).not.toThrow()
  })

  it('accepts a blocked deterministicDecision', () => {
    expect(() =>
      recommendLeetCodeAssessmentRequestSchema.parse({
        ...validRequest,
        deterministicDecision: {
          status: 'blocked',
          reason: {
            code: 'failed',
            signals: { targetSeconds: 2100 },
          },
          targetSeconds: 2100,
          elapsedSeconds: null,
        },
      }),
    ).not.toThrow()
  })

  it('accepts null latestAttempt in sessionContext', () => {
    expect(() =>
      recommendLeetCodeAssessmentRequestSchema.parse({
        ...validRequest,
        sessionContext: {
          ...validRequest.sessionContext,
          latestAttempt: null,
        },
      }),
    ).not.toThrow()
  })

  it('accepts a problem.difficulty of "unknown"', () => {
    expect(() =>
      recommendLeetCodeAssessmentRequestSchema.parse({
        ...validRequest,
        problem: { ...validRequest.problem, difficulty: 'unknown' },
      }),
    ).not.toThrow()
  })
})

describe('recommendLeetCodeAssessmentResponseSchema', () => {
  it('accepts a ready response', () => {
    expect(() =>
      recommendLeetCodeAssessmentResponseSchema.parse({
        status: 'ready',
        recommendation: validRecommendation,
        providerMetadata: validProviderMetadata,
        submissionFingerprint: 'fp-abc-123',
      }),
    ).not.toThrow()
  })

  it('accepts an unavailable response', () => {
    expect(() =>
      recommendLeetCodeAssessmentResponseSchema.parse({
        status: 'unavailable',
        message: 'AI is not configured.',
        submissionFingerprint: 'fp-abc-123',
      }),
    ).not.toThrow()
  })

  it('accepts an error response with providerMetadata', () => {
    expect(() =>
      recommendLeetCodeAssessmentResponseSchema.parse({
        status: 'error',
        code: 'network',
        message: 'AI request could not reach the provider.',
        providerMetadata: validProviderMetadata,
        submissionFingerprint: 'fp-abc-123',
      }),
    ).not.toThrow()
  })

  it('accepts an error response without providerMetadata', () => {
    expect(() =>
      recommendLeetCodeAssessmentResponseSchema.parse({
        status: 'error',
        code: 'auth',
        message: 'AI authentication failed.',
        submissionFingerprint: 'fp-abc-123',
      }),
    ).not.toThrow()
  })

  it('rejects an error code of not-configured', () => {
    expect(() =>
      recommendLeetCodeAssessmentResponseSchema.parse({
        status: 'error',
        code: 'not-configured',
        message: 'unused',
        submissionFingerprint: 'fp',
      }),
    ).toThrow()
  })

  it('rejects unknown wire fields via .strict()', () => {
    expect(() =>
      recommendLeetCodeAssessmentResponseSchema.parse({
        status: 'unavailable',
        message: 'AI is not configured.',
        submissionFingerprint: 'fp',
        leak: 'extra',
      }),
    ).toThrow()
  })
})
