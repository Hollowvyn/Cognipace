import { describe, expect, it } from 'vitest'

import {
  normalizedPracticeStateSchema,
  practiceOverrideLastReviewResultRequestSchema,
  practiceSaveReviewResultRequestSchema,
  practiceReviewResultSchema,
} from './practice-contracts'
import { serializeNormalizedPracticeState } from './practice-serializers'

describe('practice runtime contracts', () => {
  it('serializes and validates the derived eligible local day', () => {
    const state = {
      problemSlug: 'two-sum',
      cardId: 'two-sum:default',
      status: 'review' as const,
      isSuspended: false,
      phase: 'review' as const,
      isStarted: true,
      isDue: false,
      isOverdue: false,
      overdueDays: 0,
      dueAt: new Date('2026-09-13T22:00:00.000Z'),
      eligibleOn: '2026-09-14',
      lastReviewedAt: new Date('2026-09-13T01:00:00.000Z'),
      retrievability: 1,
      stability: 2,
      difficulty: 5,
      scheduledDays: 1,
      lapses: 0,
      reviewCount: 1,
      reviewHistory: [],
      recentAttempts: [],
      latestAttempt: null,
    }

    expect(serializeNormalizedPracticeState(state).eligibleOn).toBe(
      '2026-09-14',
    )
    expect(
      normalizedPracticeStateSchema.safeParse({
        ...serializeNormalizedPracticeState(state),
        eligibleOn: undefined,
      }).success,
    ).toBe(false)
  })

  it('accepts serialized review results with a review attempt id', () => {
    expect(
      practiceReviewResultSchema.parse({
        problemSlug: 'two-sum',
        cardId: 'two-sum:default',
        reviewAttemptId: 'review-1',
        rating: 'good',
        status: 'review',
        dueAt: '2026-01-02T10:00:00.000Z',
        reviewedAt: '2026-01-01T10:00:00.000Z',
        summary: {
          phase: 'review',
          nextReviewAt: '2026-01-02T10:00:00.000Z',
          eligibleOn: '2026-01-02',
          lastReviewedAt: '2026-01-01T10:00:00.000Z',
          reviewCount: 1,
          lapses: 0,
          difficulty: 5,
          stability: 2,
          scheduledDays: 1,
          suspended: false,
          isStarted: true,
          isDue: false,
          isOverdue: false,
          overdueDays: 0,
          retrievability: 1,
        },
      }),
    ).toMatchObject({
      reviewAttemptId: 'review-1',
    })
  })

  it('rejects missing or invalid review attempt ids on review results', () => {
    const reviewResult = {
      problemSlug: 'two-sum',
      cardId: 'two-sum:default',
      reviewAttemptId: 'review-1',
      rating: 'good',
      status: 'review',
      dueAt: '2026-01-02T10:00:00.000Z',
      reviewedAt: '2026-01-01T10:00:00.000Z',
      summary: {
        phase: 'review',
        nextReviewAt: '2026-01-02T10:00:00.000Z',
        eligibleOn: '2026-01-02',
        lastReviewedAt: '2026-01-01T10:00:00.000Z',
        reviewCount: 1,
        lapses: 0,
        difficulty: 5,
        stability: 2,
        scheduledDays: 1,
        suspended: false,
        isStarted: true,
        isDue: false,
        isOverdue: false,
        overdueDays: 0,
        retrievability: 1,
      },
    }

    expect(() =>
      practiceReviewResultSchema.parse({
        ...reviewResult,
        reviewAttemptId: undefined,
      }),
    ).toThrow()
    expect(() =>
      practiceReviewResultSchema.parse({
        ...reviewResult,
        reviewAttemptId: 123,
      }),
    ).toThrow()
  })

  it('requires strict identity, generation, canonical time and explicit Save mode', () => {
    const request = {
      surface: 'content-script',
      commandId: 'command',
      problemSlug: 'two-sum',
      generation: {
        localGenerationToken: 'local',
        problemGenerationToken: null,
      },
      rating: 'good',
      reviewMode: 'leetcode',
      reviewedAt: '2026-01-01T10:00:00.000Z',
      log: { notes: 'Accepted notes' },
    }
    expect(practiceSaveReviewResultRequestSchema.parse(request)).toEqual(
      request,
    )
    for (const invalid of [
      { ...request, commandId: undefined },
      { ...request, generation: undefined },
      { ...request, reviewMode: undefined },
      { ...request, reviewedAt: '2026-01-01T10:00:00Z' },
      { ...request, notes: 'legacy' },
      { ...request, log: { serverId: 'forged' } },
    ]) {
      expect(
        practiceSaveReviewResultRequestSchema.safeParse(invalid).success,
      ).toBe(false)
    }
  })

  it('requires the exact Update target and revision along with original reviewedAt', () => {
    const request = {
      surface: 'content-script',
      commandId: 'update',
      problemSlug: 'two-sum',
      generation: {
        localGenerationToken: 'local',
        problemGenerationToken: 'problem',
      },
      rating: 'good',
      reviewedAt: '2026-01-01T10:00:00.000Z',
      targetAttemptId: 'original',
      expectedRevision: 0,
    }
    expect(
      practiceOverrideLastReviewResultRequestSchema.parse(request),
    ).toEqual(request)
    for (const invalid of [
      { ...request, targetAttemptId: undefined },
      { ...request, expectedRevision: undefined },
      { ...request, expectedRevision: -1 },
      { ...request, reviewedAt: undefined },
    ]) {
      expect(
        practiceOverrideLastReviewResultRequestSchema.safeParse(invalid)
          .success,
      ).toBe(false)
    }
  })
})
