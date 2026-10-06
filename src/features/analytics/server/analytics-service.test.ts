import { describe, expect, it } from 'vitest'

import { eq } from 'drizzle-orm'

import {
  createInitialFsrsCard,
  defaultFsrsCardKind,
  scheduleReview,
  serializeFsrsReviewLogSnapshot,
  type ReviewRating,
} from '@/lib/fsrs'

import type { Db } from '@/platform/db'
import { createTestDb } from '@/platform/db/test-db'
import {
  fsrsCards,
  problemPractice,
  problemTopics,
  problems,
  reviewAttempts,
  topics,
} from '@/platform/db/schema'

import { updateSettings } from '@/features/settings/server/settings-service'
import { analyticsSummarySchema } from '../api/analytics-contracts'
import { calculateAnalyticsReadiness } from '../domain/analytics-readiness'
import { getAnalyticsSummary } from './analytics-service'

describe('getAnalyticsSummary dashboard views', () => {
  it.each([30, 90, 'all'] as const)(
    'aggregates truthful raw selected activity for %s before chart eligibility and serializes it',
    async (range) => {
      const handle = await createTestDb({ seed: false })
      await insertAnalyticsProblem(handle.db, 'repeated', 'Repeated', [
        'Arrays',
        'Hashing',
      ])
      await insertAnalyticsHistory(handle.db, 'repeated', {
        id: 'repeated',
        dates: [
          new Date('2026-03-07T12:00:00Z'),
          new Date('2026-03-08T05:00:00Z'),
          new Date('2026-03-08T05:10:00Z'),
          new Date('2026-03-08T05:30:00Z'),
          new Date('2026-03-08T05:30:00.001Z'),
        ],
        ratings: ['again', 'good', 'easy', 'good', 'good'],
        correct: [true, true, false, null, true],
        elapsedSeconds: [60, 120, 900, 900, 500],
        dueAt: new Date('2026-03-09T12:00:00Z'),
        stability: 4,
        difficulty: 4,
      })
      await insertAnalyticsProblem(handle.db, 'invalid', 'Invalid', [])
      await insertAnalyticsHistory(handle.db, 'invalid', {
        id: 'invalid',
        dates: [new Date('2026-03-08T05:20:00Z')],
        ratings: ['good'],
        correct: [true],
        dueAt: new Date('2026-03-09T12:00:00Z'),
        stability: 4,
        difficulty: 4,
      })
      await handle.db
        .update(reviewAttempts)
        .set({ rating: 'invalid' })
        .where(eq(reviewAttempts.id, 'invalid:0'))
      await insertAnalyticsProblem(handle.db, 'old', 'Old', [])
      await insertAnalyticsHistory(handle.db, 'old', {
        id: 'old',
        dates: [new Date('2025-11-01T12:00:00Z')],
        ratings: ['good'],
        correct: [true],
        elapsedSeconds: [300],
        dueAt: new Date('2026-03-09T12:00:00Z'),
        stability: 4,
        difficulty: 4,
      })
      const summary = await getAnalyticsSummary(handle.db, {
        range,
        now: new Date('2026-03-08T05:30:00Z'),
        timeZone: 'America/New_York',
      })
      const activity = {
        assessmentDays: range === 'all' ? 3 : 2,
        recordedAssessments: range === 'all' ? 6 : 5,
        knownCorrectnessAssessments: range === 'all' ? 5 : 4,
        successfulAssessments: range === 'all' ? 4 : 3,
        distinctSuccessfulProblems: range === 'all' ? 3 : 2,
        observedCorrectness: range === 'all' ? 4 / 5 : 3 / 4,
        timedSuccessfulAssessments: range === 'all' ? 3 : 2,
        untimedSuccessfulAssessments: 1,
        successfulRecordedSeconds: range === 'all' ? 480 : 180,
      }
      expect(summary.activity).toEqual(activity)
      expect(summary.observedRatingSampleSize).toBe(range === 'all' ? 5 : 4)
      expect(summary.observedRatingQuality).toBeNull()
      const response = analyticsSummarySchema.parse({
        ...summary,
        observedRatingQuality: {
          value: summary.observedRatingQuality,
          sampleSize: summary.observedRatingSampleSize,
          lowSample: summary.lowSample,
        },
      })
      expect(response.activity).toEqual(activity)
      const transported: unknown = JSON.parse(JSON.stringify(response))
      expect(transported).toMatchObject({ activity })
      expect(response).not.toHaveProperty('events')
    },
  )

  it.each([null, false] as const)(
    'preserves zero versus unavailable successful totals for a wholly %s correctness cohort',
    async (isCorrect) => {
      const handle = await createTestDb({ seed: false })
      await insertAnalyticsProblem(handle.db, 'no-success', 'No success', [])
      await insertAnalyticsHistory(handle.db, 'no-success', {
        id: 'no-success',
        dates: [new Date('2026-03-08T05:00:00Z')],
        ratings: ['easy'],
        correct: [isCorrect],
        elapsedSeconds: [300],
        dueAt: new Date('2026-03-09T12:00:00Z'),
        stability: 4,
        difficulty: 4,
      })
      const summary = await getAnalyticsSummary(handle.db, {
        range: 30,
        now: new Date('2026-03-08T05:30:00Z'),
      })
      expect(summary.activity).toEqual({
        assessmentDays: 1,
        recordedAssessments: 1,
        knownCorrectnessAssessments: isCorrect === null ? 0 : 1,
        successfulAssessments: 0,
        distinctSuccessfulProblems: isCorrect === null ? null : 0,
        observedCorrectness: isCorrect === null ? null : 0,
        timedSuccessfulAssessments: 0,
        untimedSuccessfulAssessments: 0,
        successfulRecordedSeconds: isCorrect === null ? null : 0,
      })
    },
  )

  it('preserves invalid-zone fallback provenance on the report and independent Recall and backlog frames', async () => {
    const handle = await createTestDb({ seed: false })
    await insertAnalyticsProblem(
      handle.db,
      'fallback-pair',
      'Fallback pair',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'fallback-pair', {
      id: 'fallback-pair',
      dates: [
        new Date('2026-09-24T12:00:00Z'),
        new Date('2026-10-02T12:00:00Z'),
      ],
      ratings: ['good', 'hard'],
      correct: [true, true],
      dueAt: new Date('2026-10-06T12:00:00Z'),
      stability: 4,
      difficulty: 4,
    })
    const options = {
      range: 30 as const,
      now: new Date('2026-10-05T12:00:00Z'),
    }
    const summary = await getAnalyticsSummary(handle.db, {
      ...options,
      timeZone: 'Invalid/Zone',
    })
    expect(summary.timeFrame).toMatchObject({
      timeZone: 'UTC',
      timeZoneFallback: true,
      history: { timeZone: 'UTC', timeZoneFallback: true },
    })
    expect(summary.views.overdueBacklog.timeFrame).toMatchObject({
      timeZone: 'UTC',
      timeZoneFallback: true,
    })
    expect(summary.views.observedRecallVsFsrs.timeFrame).toMatchObject({
      timeZone: 'UTC',
      timeZoneFallback: true,
      history: { timeZone: 'UTC', timeZoneFallback: true },
    })
    const utc = await getAnalyticsSummary(handle.db, {
      ...options,
      timeZone: 'UTC',
    })
    expect(summary.views.observedRecallVsFsrs.rows).toEqual(
      utc.views.observedRecallVsFsrs.rows,
    )
    expect(summary.views.observedRecallVsFsrs.timeFrame.buckets).toEqual(
      utc.views.observedRecallVsFsrs.timeFrame.buckets,
    )
    expect(
      summary.views.observedRecallVsFsrs.rows.reduce(
        (sum, row) => sum + row.pairedReviews,
        0,
      ),
    ).toBe(1)
    expect(
      analyticsSummarySchema.safeParse({
        ...summary,
        observedRatingQuality: {
          value: summary.observedRatingQuality,
          sampleSize: summary.observedRatingSampleSize,
          lowSample: summary.lowSample,
        },
      }).success,
    ).toBe(true)
  })

  it('keeps Recall readiness on the selected evidence calendar while regrouping its recent pair display', async () => {
    const handle = await createTestDb({ seed: false })
    await insertAnalyticsProblem(
      handle.db,
      'global-origin',
      'Global origin',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'global-origin', {
      id: 'global-origin',
      dates: [new Date('2025-02-01T12:00:00Z')],
      ratings: ['good'],
      correct: [true],
      dueAt: new Date('2026-10-06T12:00:00Z'),
      stability: 4,
      difficulty: 4,
    })
    await insertAnalyticsProblem(handle.db, 'recent-pairs', 'Recent pairs', [])
    const dates = [
      new Date('2026-09-08T12:00:00Z'),
      ...Array.from(
        { length: 52 },
        (_, index) =>
          new Date(
            Date.UTC(2026, 8, 9 + Math.floor(index / 2), 10 + (index % 2) * 4),
          ),
      ),
    ]
    await insertAnalyticsHistory(handle.db, 'recent-pairs', {
      id: 'recent-pairs',
      dates,
      ratings: dates.map(() => 'good'),
      correct: dates.map(() => true),
      dueAt: new Date('2026-10-06T12:00:00Z'),
      stability: 4,
      difficulty: 4,
    })
    const summary = await getAnalyticsSummary(handle.db, {
      range: 'all',
      now: new Date('2026-10-05T12:00:00Z'),
    })
    const selected = summary.timeFrame
    const recall = summary.views.observedRecallVsFsrs
    expect(selected.history?.availableDays).toBe(612)
    expect(selected.grouping).toEqual({ unit: 'month', step: 1 })
    expect(selected.buckets).toHaveLength(21)
    expect(recall.timeFrame.history?.availableDays).toBe(27)
    expect(recall.timeFrame.grouping).toEqual({ unit: 'day', step: 3 })
    expect(recall.rows).toHaveLength(9)
    expect(recall.rows.reduce((sum, row) => sum + row.pairedReviews, 0)).toBe(
      52,
    )
    const expectedReadiness = calculateAnalyticsReadiness({
      requestedDays: null,
      grouping: selected.grouping,
      availableDays: 612,
      evidenceCounts: [...Array<number>(19).fill(0), 44, 8],
      bucketKeys: selected.buckets.map((bucket) => bucket.key),
    })
    expect(summary.historicalReadiness.recallQuality).toEqual(expectedReadiness)
    expect(summary.historicalReadiness.recallQuality).toMatchObject({
      ready: false,
      policyDays: 90,
      minimumAssessments: 45,
      requestedBuckets: 21,
      assessments: 52,
      failingReasons: ['insufficient-span'],
    })
  })

  it.each([
    [12, 12],
    [30, 24],
    [120, 45],
  ] as const)(
    'uses the selected All time %s-day history span for its %s-assessment policy',
    async (availableDays, minimumAssessments) => {
      const handle = await createTestDb({ seed: false })
      await insertAnalyticsProblem(handle.db, 'policy-span', 'Policy span', [])
      await insertAnalyticsHistory(handle.db, 'policy-span', {
        id: 'policy-span',
        dates: [
          new Date(Date.UTC(2026, 9, 5, 12) - (availableDays - 1) * 86_400_000),
        ],
        ratings: ['good'],
        correct: [true],
        dueAt: new Date('2026-10-06T12:00:00Z'),
        stability: 4,
        difficulty: 4,
      })
      const summary = await getAnalyticsSummary(handle.db, {
        range: 'all',
        now: new Date('2026-10-05T12:00:00Z'),
      })
      expect(summary.timeFrame.history?.availableDays).toBe(availableDays)
      expect(summary.historicalReadiness.requested).toMatchObject({
        requestedDays: null,
        availableDays,
        policyDays: Math.min(availableDays, 90),
        minimumAssessments,
      })
    },
  )
  it('retains the complete genuinely sparse paired All time span without inflating pair counts', async () => {
    const handle = await createTestDb({ seed: false })
    await insertAnalyticsProblem(handle.db, 'sparse-pairs', 'Sparse pairs', [])
    await insertAnalyticsHistory(handle.db, 'sparse-pairs', {
      id: 'sparse-pairs',
      dates: [
        new Date('2010-01-01T12:00:00Z'),
        new Date('2015-01-02T12:00:00Z'),
        new Date('2026-10-02T12:00:00Z'),
      ],
      ratings: ['good', 'good', 'hard'],
      correct: [true, true, true],
      dueAt: new Date('2026-10-06T12:00:00Z'),
      stability: 4,
      difficulty: 4,
    })
    const summary = await getAnalyticsSummary(handle.db, {
      range: 'all',
      now: new Date('2026-10-05T12:00:00Z'),
    })
    const recall = summary.views.observedRecallVsFsrs
    expect(recall.timeFrame.history?.displayStartKey).toBe('2015-01-02')
    expect(recall.timeFrame.grouping).toEqual({ unit: 'month', step: 3 })
    expect(recall.rows).toHaveLength(48)
    expect(recall.rows[0]?.bucketStart).toBe('2015-01-02')
    expect(recall.rows.at(-1)?.bucketEnd).toBe('2026-10-05')
    expect(recall.rows.reduce((sum, row) => sum + row.pairedReviews, 0)).toBe(2)
    expect(
      recall.rows.filter((row) => row.evidence === 'measured'),
    ).toHaveLength(2)
    expect(summary.historicalReadiness.recallQuality.assessments).toBe(2)
    expect(
      analyticsSummarySchema.safeParse({
        ...summary,
        observedRatingQuality: {
          value: summary.observedRatingQuality,
          sampleSize: summary.observedRatingSampleSize,
          lowSample: summary.lowSample,
        },
      }).success,
    ).toBe(true)
  })

  it('keeps an invalid raw origin on selected history while Recall starts at the first eligible pair', async () => {
    const handle = await createTestDb({ seed: false })
    await insertAnalyticsProblem(
      handle.db,
      'invalid-origin',
      'Invalid origin',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'invalid-origin', {
      id: 'invalid-origin',
      dates: [
        new Date('2026-09-24T02:00:00Z'),
        new Date('2026-09-27T12:00:00Z'),
        new Date('2026-10-02T12:00:00Z'),
      ],
      ratings: ['good', 'good', 'hard'],
      correct: [true, true, true],
      dueAt: new Date('2026-10-06T12:00:00Z'),
      stability: 4,
      difficulty: 4,
    })
    await handle.db
      .update(reviewAttempts)
      .set({ rating: 'invalid' })
      .where(eq(reviewAttempts.id, 'invalid-origin:0'))
    const summary = await getAnalyticsSummary(handle.db, {
      range: 30,
      now: new Date('2026-10-05T12:00:00Z'),
      timeZone: 'America/New_York',
    })
    expect(summary.timeFrame.history).toMatchObject({
      historyStart: '2026-09-24T02:00:00.000Z',
      displayStartKey: '2026-09-23',
      availableDays: 13,
    })
    expect(
      summary.views.observedRecallVsFsrs.timeFrame.history?.displayStartKey,
    ).toBe('2026-10-02')
    expect(summary.views.observedRecallVsFsrs.rows[0]?.pairedReviews).toBe(1)
    expect(summary.historicalReadiness.recallQuality.assessments).toBe(1)
    expect(summary.ratingsMix[0]?.bucketStart).toBe('2026-09-23')
    expect(summary.practiceRhythm[0]?.bucketStart).toBe('2026-09-23')
    expect(summary.stability[0]?.bucketStart).toBe('2026-09-23')
  })

  it('clips young selected history while retaining nominal comparisons and fixed workload horizons', async () => {
    const handle = await createTestDb({ seed: false })
    await insertAnalyticsProblem(handle.db, 'young', 'Young', [])
    await insertAnalyticsHistory(handle.db, 'young', {
      id: 'young',
      dates: [
        new Date('2026-09-24T12:00:00Z'),
        new Date('2026-10-02T12:00:00Z'),
      ],
      ratings: ['good', 'hard'],
      correct: [true, true],
      dueAt: new Date('2026-10-06T12:00:00Z'),
      stability: 4,
      difficulty: 4,
    })
    const summary = await getAnalyticsSummary(handle.db, {
      range: 30,
      now: new Date('2026-10-05T12:00:00Z'),
      timeZone: 'UTC',
    })
    expect(summary.timeFrame).toMatchObject({
      periodStart: '2026-09-24T00:00:00.000Z',
      grouping: { unit: 'day', step: 1 },
      history: {
        nominalStartKey: '2026-09-06',
        displayStartKey: '2026-09-24',
        availableDays: 12,
        previous: { start: '2026-08-07T00:00:00.000Z' },
      },
    })
    expect(summary.timeFrame.buckets).toHaveLength(12)
    expect(summary.views.problemSolving.previousPeriod?.start).toBe(
      '2026-08-07T00:00:00.000Z',
    )
    expect(summary.views.observedRecallVsFsrs.timeFrame).toMatchObject({
      history: { displayStartKey: '2026-10-02', availableDays: 4 },
      grouping: { unit: 'day', step: 1 },
    })
    expect(summary.views.observedRecallVsFsrs.rows).toHaveLength(4)
    expect(summary.views.overdueBacklog.rows).toHaveLength(30)
    expect(summary.views.overdueBacklog.timeFrame.buckets).toHaveLength(30)
    expect(summary.views.upcomingReviewLoad.rows).toHaveLength(14)
  })

  it('returns no fabricated historical intervals or previous period for empty All time', async () => {
    const handle = await createTestDb({ seed: false })
    const summary = await getAnalyticsSummary(handle.db, {
      range: 'all',
      now: new Date('2026-10-05T12:00:00Z'),
    })
    expect(summary.timeFrame).toMatchObject({
      requestedDays: null,
      buckets: [],
      grouping: null,
      history: {
        historyStart: null,
        displayStart: null,
        availableDays: 0,
        previous: null,
      },
    })
    expect(summary.views.problemSolving.previousPeriod).toBeNull()
    expect(
      summary.views.problemSolving.cohorts.newProblems.previous
        .recordedAssessments,
    ).toBe(0)
    expect(summary.views.observedRecallVsFsrs.rows).toEqual([])
    expect(summary.historicalReadiness.requested).toMatchObject({
      requestedBuckets: 0,
      ready: false,
      assessments: 0,
      policyDays: 1,
      minimumAssessments: 12,
    })
    expect(summary.hardAgain).toMatchObject({
      previousSampleSize: 0,
      previousShare: null,
      delta: null,
      direction: null,
    })
    expect(summary.views.overdueBacklog.rows).toHaveLength(30)
  })

  it('regroups recent eligible pairs independently from old All time raw history', async () => {
    const handle = await createTestDb({ seed: false })
    await insertAnalyticsProblem(handle.db, 'old', 'Old', [])
    await insertAnalyticsHistory(handle.db, 'old', {
      id: 'old',
      dates: [new Date('2010-01-01T12:00:00Z')],
      ratings: ['good'],
      correct: [true],
      dueAt: new Date('2026-10-06T12:00:00Z'),
      stability: 4,
      difficulty: 4,
    })
    await insertAnalyticsProblem(handle.db, 'recent', 'Recent', [])
    await insertAnalyticsHistory(handle.db, 'recent', {
      id: 'recent',
      dates: [
        new Date('2026-09-24T12:00:00Z'),
        new Date('2026-10-02T12:00:00Z'),
      ],
      ratings: ['good', 'good'],
      correct: [true, true],
      dueAt: new Date('2026-10-06T12:00:00Z'),
      stability: 4,
      difficulty: 4,
    })
    const summary = await getAnalyticsSummary(handle.db, {
      range: 'all',
      now: new Date('2026-10-05T12:00:00Z'),
    })
    expect(summary.timeFrame.grouping).toEqual({ unit: 'year', step: 1 })
    expect(summary.views.observedRecallVsFsrs.timeFrame.grouping).toEqual({
      unit: 'day',
      step: 1,
    })
    expect(summary.views.observedRecallVsFsrs.rows).toHaveLength(4)
    expect(summary.views.observedRecallVsFsrs.rows[0]).toMatchObject({
      bucketStart: '2026-10-02',
      pairedReviews: 1,
    })
    expect(summary.historicalReadiness.recallQuality.assessments).toBe(1)
    expect(summary.historicalReadiness.requested).toMatchObject({
      policyDays: 90,
      minimumAssessments: 45,
    })
    expect(summary.historicalReadiness.recallQuality).toMatchObject({
      policyDays: 90,
      minimumAssessments: 45,
      grouping: { unit: 'year', step: 1 },
      requestedBuckets: summary.timeFrame.buckets.length,
    })
  })

  it('reads saved difficulty time targets and durations through the existing summary', async () => {
    const handle = await createTestDb({ seed: false })
    await insertAnalyticsProblem(handle.db, 'timed', 'Timed', [])
    await insertAnalyticsHistory(handle.db, 'timed', {
      id: 'timed',
      dates: [
        new Date('2026-08-01T12:00:00Z'),
        new Date('2026-08-02T12:00:00Z'),
      ],
      ratings: ['hard', 'again'],
      correct: [true, false],
      elapsedSeconds: [120, 240],
      dueAt: new Date('2026-08-03T12:00:00Z'),
      stability: 4,
      difficulty: 4,
    })
    const timeTargetsMinutes = { easy: 10, medium: 20, hard: 30 }
    await updateSettings(handle.db, { assessment: { timeTargetsMinutes } })
    const summary = await getAnalyticsSummary(handle.db, {
      range: 30,
      now: new Date('2026-08-02T12:00:00Z'),
    })
    expect(summary.views.problemSolving.timeTargetsMinutes).toEqual(
      timeTargetsMinutes,
    )
    expect(
      summary.views.problemSolving.cohorts.newProblems.totals.difficulties
        .medium,
    ).toMatchObject({
      validRatings: 1,
      successRate: 1,
      goodEasyRate: 0,
      time: { all: { medianSeconds: 120 }, successful: { medianSeconds: 120 } },
    })
    expect(
      summary.views.problemSolving.cohorts.followupPractice.totals.difficulties
        .medium,
    ).toMatchObject({
      validRatings: 1,
      successRate: 0,
      time: {
        all: { medianSeconds: 240 },
        successful: { medianSeconds: null, eligibleAssessments: 0 },
      },
    })
    expect(
      analyticsSummarySchema.safeParse({
        ...summary,
        observedRatingQuality: {
          value: summary.observedRatingQuality,
          sampleSize: summary.observedRatingSampleSize,
          lowSample: summary.lowSample,
        },
      }).success,
    ).toBe(true)
  })

  it('makes first-attempt readiness independent from an initial-only Recall cohort and reads persisted goals without changing cards or evidence', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-14T12:00:00Z')
    for (let index = 0; index < 14; index += 1) {
      const slug = `new-problem-${index}`
      await insertAnalyticsProblem(handle.db, slug, slug, [])
      await insertAnalyticsHistory(handle.db, slug, {
        id: `${slug}:default`,
        dates: [new Date(Date.UTC(2026, 7, index + 1, 12))],
        ratings: ['hard'],
        correct: [true],
        dueAt: new Date('2026-08-15T12:00:00Z'),
        stability: 4,
        difficulty: 4,
      })
    }
    await updateSettings(handle.db, { review: { targetRetention: 0.85 } })
    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })
    expect(summary.historicalReadiness).toMatchObject({
      firstAttemptOutcomes: {
        ready: false,
        assessments: 14,
        activeBuckets: 14,
        minimumAssessments: 24,
      },
      recallQuality: { ready: false, assessments: 0, activeBuckets: 0 },
    })
    expect(summary.recallQuality).toEqual([])
    expect(summary.predictedRecall.sampleSize).toBe(0)
    expect(
      summary.views.problemSolving.cohorts.newProblems.totals,
    ).toMatchObject({
      validRatings: 14,
      hardGoodEasy: 14,
      goodEasy: 0,
      successRate: 1,
      goodEasyRate: 0,
    })
    const cardsBefore = await handle.db.select().from(fsrsCards)

    await updateSettings(handle.db, {
      analytics: {
        targetRecall: 0,
        targetReviewSuccess: 1,
        targetFirstAttemptSuccess: 0,
        targetFirstAttemptGoodEasy: 1,
      },
    })
    const after = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(after.views).toMatchObject({
      retentionMap: summary.views.retentionMap,
      observedRecallVsFsrs: { targetRecall: 0 },
      practiceRhythm: {
        ...summary.views.practiceRhythm,
        targetReviewSuccess: 1,
        percentageScale: { domain: [0, 1] },
      },
      problemSolving: {
        targets: {
          targetFirstAttemptSuccess: 0,
          targetFirstAttemptGoodEasy: 1,
        },
        cohorts: {
          newProblems: {
            rows: summary.views.problemSolving.cohorts.newProblems.rows,
            totals: summary.views.problemSolving.cohorts.newProblems.totals,
            outcomeScale: { domain: [0, 1] },
          },
        },
      },
    })
    expect(after.targetRetention).toBe(0.85)
    expect(after.views.observedRecallVsFsrs.scale.domain[0]).toBe(0)
    expect(await handle.db.select().from(fsrsCards)).toEqual(cardsBefore)
  })

  it.each([30, 90] as const)(
    'retains the selected %s-day range in the readiness contract',
    async (range) => {
      const handle = await createTestDb()
      const now = new Date('2026-01-15T12:00:00.000Z')

      const summary = await getAnalyticsSummary(handle.db, { range, now })

      expect(summary.range).toBe(range)
      expect(summary.historicalReadiness.requested.requestedDays).toBe(range)
      expect(summary.observedRatingQuality).toBeNull()
      expect(summary.historicalReadiness.requested.ready).toBe(false)
      expect(summary.predictedRecall).toEqual({
        value: null,
        sampleSize: 0,
        lowSample: true,
      })
      expect(summary.recallQuality).toEqual([])
      expect(summary.ratingsMix).toEqual([])
      expect(summary.views.upcomingReviewLoad.rows).toHaveLength(14)
    },
  )

  it('returns truthful chart payloads for an empty database', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-15T12:00:00.000Z')

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.historicalReadiness.requested.ready).toBe(false)
    expect(summary.predictedRecall).toEqual({
      value: null,
      sampleSize: 0,
      lowSample: true,
    })
    expect(
      summary.recallQuality.every((point) => point.observedRecall === null),
    ).toBe(true)
    expect(summary.topics).toEqual([])
    expect(summary.stability).toEqual([])
    expect(summary.views.overdueBacklog.knownDays).toBe(0)
    expect(summary.views.upcomingReviewLoad.rows).toHaveLength(14)
    expect(
      summary.views.upcomingReviewLoad.rows.every(
        (point) => point.dueCount === 0,
      ),
    ).toBe(true)
  })

  it('counts same-day pre-review predictions individually in the summary', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-03T12:00:00.000Z')
    const firstReview = new Date('2026-08-02T12:00:00.000Z')
    const secondReview = new Date('2026-08-02T12:05:00.000Z')

    await insertAnalyticsProblem(handle.db, 'same-day-problem', 'Same Day', [])
    await insertAnalyticsHistory(handle.db, 'same-day-problem', {
      id: 'same-day-card:default',
      dates: [firstReview, secondReview],
      ratings: ['good', 'hard'],
      correct: [true, true],
      dueAt: new Date('2026-08-04T12:00:00.000Z'),
      stability: 4,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })
    const day = summary.recallQuality.find(
      (point) => point.bucketStart === '2026-08-02',
    )

    expect(summary.predictedRecall.sampleSize).toBe(1)
    expect(summary.predictedRecall.lowSample).toBe(true)
    expect(day).toMatchObject({ reviewCount: 1 })
  })

  it('excludes future-dated reviews from observed rating quality', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-31T12:00:00.000Z')
    const inRangeDates = Array.from(
      { length: 10 },
      (_, index) =>
        new Date(
          `2026-01-${String(20 + index).padStart(2, '0')}T12:00:00.000Z`,
        ),
    )

    await insertAnalyticsProblem(
      handle.db,
      'bounded-problem',
      'Bounded Problem',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'bounded-problem', {
      id: 'bounded-card:default',
      dates: inRangeDates,
      ratings: Array<ReviewRating>(10).fill('good'),
      correct: Array<boolean>(10).fill(true),
      dueAt: new Date('2026-02-01T12:00:00.000Z'),
      stability: 8,
      difficulty: 5,
    })
    const futureTimestamp = new Date('2026-02-01T12:00:00.001Z').getTime()
    await handle.db.insert(reviewAttempts).values({
      id: 'future-review',
      problemSlug: 'bounded-problem',
      cardId: 'bounded-card:default',
      rating: 'again',
      reviewMode: 'manual',
      reviewedAt: futureTimestamp,
      isCorrect: false,
      fsrsReviewLog: null,
      createdAt: futureTimestamp,
      updatedAt: futureTimestamp,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.observedRatingQuality).toBe(1)
    expect(summary.observedRatingSampleSize).toBe(10)
  })

  it('excludes same-local-day post-as-of reviews from Ratings Mix, Topic Performance, and its equivalent comparison', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-31T12:00:00.000Z')
    const previousDates = Array.from(
      { length: 24 },
      (_, index) => new Date(Date.UTC(2025, 11, 9 + index, 12)),
    )
    const selectedDates = Array.from(
      { length: 24 },
      (_, index) => new Date(Date.UTC(2026, 0, 8 + index, 12)),
    )
    const dates = [...previousDates, ...selectedDates]

    for (const index of [1, 2, 3]) {
      const slug = `post-as-of-graphs-${index}`
      await insertAnalyticsProblem(
        handle.db,
        slug,
        `Graphs ${index}`,
        index === 1 ? ['Graphs'] : [],
      )
      if (index > 1) {
        await handle.db.insert(problemTopics).values({
          problemSlug: slug,
          topicId: 'post-as-of-graphs-1:graphs',
        })
      }
      await insertAnalyticsHistory(handle.db, slug, {
        id: `${slug}-card:default`,
        dates,
        ratings: [
          ...Array<ReviewRating>(24).fill('again'),
          ...Array<ReviewRating>(24).fill('good'),
        ],
        correct: Array<boolean>(dates.length).fill(true),
        dueAt: new Date('2026-02-01T12:00:00.000Z'),
        stability: 8,
        difficulty: 5,
      })
    }

    const postAsOf = new Date('2026-01-31T13:00:00.000Z')
    await handle.db.insert(reviewAttempts).values({
      id: 'post-as-of-ratings-mix-review',
      problemSlug: 'post-as-of-graphs-1',
      cardId: 'post-as-of-graphs-1-card:default',
      rating: 'again',
      reviewMode: 'manual',
      reviewedAt: postAsOf.getTime(),
      isCorrect: false,
      fsrsReviewLog: null,
      createdAt: postAsOf.getTime(),
      updatedAt: postAsOf.getTime(),
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.views.ratingsMix).toMatchObject({
      selectedHardAgain: 0,
      selectedValidRatings: 72,
      comparison: {
        direction: 'down',
        previousHardAgainShare: 1,
        previousValidRatings: 72,
      },
    })
    expect(summary.views.topicPerformance.rows).toEqual([
      expect.objectContaining({
        topic: 'Graphs',
        reviewSuccess: 1,
        goodEasy: 72,
        validRatings: 72,
        distinctProblems: 3,
      }),
    ])
  })

  it('keeps never-reviewed cards in tracked and workload metrics, not fragile knowledge', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-31T12:00:00.000Z')

    await insertAnalyticsProblem(handle.db, 'new-problem', 'New Problem', [
      'Graphs',
    ])
    await insertNeverReviewedCard(handle.db, 'new-problem', {
      dueAt: new Date('2026-02-01T12:00:00.000Z'),
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(
      summary.views.upcomingReviewLoad.rows.reduce(
        (sum, point) => sum + point.dueCount,
        0,
      ),
    ).toBe(1)
  })

  it('derives chart metrics from full history and current FSRS state', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-31T12:00:00.000Z')
    const selectedDates = Array.from(
      { length: 10 },
      (_, index) =>
        new Date(
          `2026-01-${String(20 + index).padStart(2, '0')}T12:00:00.000Z`,
        ),
    )

    await insertAnalyticsProblem(
      handle.db,
      'graphs-problem',
      'Graphs Problem',
      ['Graphs'],
    )
    await insertAnalyticsProblem(
      handle.db,
      'arrays-problem',
      'Arrays Problem',
      ['Arrays'],
    )
    await insertAnalyticsHistory(handle.db, 'graphs-problem', {
      id: 'graphs-card:default',
      dates: [new Date('2025-12-20T12:00:00.000Z'), ...selectedDates],
      ratings: ['again', 'again', ...Array<ReviewRating>(9).fill('good')],
      correct: [false, ...Array<boolean>(10).fill(true)],
      dueAt: new Date('2026-02-01T12:00:00.000Z'),
      stability: 12,
      difficulty: 8,
    })
    await insertAnalyticsHistory(handle.db, 'arrays-problem', {
      id: 'arrays-card:default',
      dates: [new Date('2026-01-25T12:00:00.000Z')],
      ratings: ['good'],
      correct: [true],
      dueAt: new Date('2026-02-03T12:00:00.000Z'),
      stability: 4,
      difficulty: 4,
    })
    await updateSettings(handle.db, { review: { targetRetention: 0.85 } })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })
    const graphsPoint = summary.topics.find((topic) => topic.topic === 'Graphs')
    const recallPoint = summary.recallQuality.find(
      (point) => point.bucketStart === '2026-01-20',
    )

    expect(summary.targetRetention).toBe(0.85)
    expect(summary.predictedRecall.sampleSize).toBe(10)
    expect(summary.predictedRecall.lowSample).toBe(false)
    expect(summary.predictedRecall.value).not.toBeNull()
    expect(summary.hardAgain).toMatchObject({
      selectedShare: 1 / 11,
      sampleSize: 11,
      previousShare: null,
      previousSampleSize: 1,
      previousLowSample: true,
      direction: null,
    })
    expect(recallPoint?.predictedRecall).not.toBeNull()
    expect(graphsPoint).toMatchObject({
      topic: 'Graphs',
      recallQuality: 1,
      sampleSize: 10,
      lowSample: false,
    })
    expect(summary.stability.length).toBeGreaterThan(0)
    expect(
      summary.stability.some((point) => point.medianStabilityDays !== null),
    ).toBe(true)
    expect(
      summary.ratingsMix.reduce((sum, point) => sum + point.again, 0),
    ).toBe(1)
    expect(summary.views.upcomingReviewLoad.rows[0]?.overdueCount).toBe(0)
    expect(summary.views.upcomingReviewLoad.rows[1]?.dueCount).toBe(1)
    expect(summary.views.retentionMap.rows).toHaveLength(2)
    expect(summary.views.overdueBacklog.rows).toHaveLength(30)
  })

  it.each([30, 90] as const)(
    'marks %s-day overdue backlog readiness when reconstructed daily history is complete',
    async (range) => {
      const handle = await createTestDb({ seed: false })
      const now = new Date('2026-08-13T12:00:00.000Z')
      const dates = Array.from({ length: range }, (_, index) => {
        const date = new Date(now)
        date.setDate(date.getDate() - (range - 1 - index))
        return date
      })

      await insertAnalyticsProblem(
        handle.db,
        `complete-overdue-${range}`,
        `Complete overdue ${range}`,
        [],
      )
      await insertAnalyticsHistory(handle.db, `complete-overdue-${range}`, {
        id: `complete-overdue-${range}:default`,
        dates,
        ratings: Array<ReviewRating>(dates.length).fill('good'),
        correct: Array<boolean>(dates.length).fill(true),
        dueAt: new Date('2026-08-14T12:00:00.000Z'),
        stability: 10,
        difficulty: 5,
      })

      const summary = await getAnalyticsSummary(handle.db, { range, now })

      expect(summary.historicalReadiness.overdueBacklog).toMatchObject({
        ready: true,
        assessments: 30,
        activeBuckets:
          summary.historicalReadiness.overdueBacklog.requestedBuckets,
      })
      expect(summary.views.overdueBacklog.knownDays).toBe(30)
    },
  )

  it('keeps sparse reconstructed overdue history unready and preserves null bucket gaps', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 30 }, (_, index) => {
      const date = new Date('2026-07-15T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'sparse-overdue-history',
      'Sparse overdue history',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'sparse-overdue-history', {
      id: 'sparse-overdue-history:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })
    await handle.db
      .update(reviewAttempts)
      .set({ fsrsReviewLog: 'invalid review log' })
      .where(eq(reviewAttempts.id, 'sparse-overdue-history:default:3'))

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.historicalReadiness.overdueBacklog).toMatchObject({
      ready: false,
      assessments: 3,
    })
    expect(
      summary.views.overdueBacklog.rows.some(
        (point) => point.overdueCount === null,
      ),
    ).toBe(true)
  })

  it('uses paired repeat ratings for Recall readiness even without persisted correctness', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 24 }, (_, index) => {
      const date = new Date('2026-07-21T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'ratings-without-correctness',
      'Ratings without correctness',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'ratings-without-correctness', {
      id: 'ratings-without-correctness:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean | null>(dates.length).fill(null),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.historicalReadiness.requested).toMatchObject({
      ready: true,
      assessments: 24,
    })
    expect(summary.historicalReadiness.recallQuality).toMatchObject({
      ready: false,
      assessments: 23,
      activeBuckets: 8,
    })
    expect(summary.historicalReadiness.recallQuality.failingReasons).toContain(
      'insufficient-assessments',
    )
    expect(summary.recallQuality.length).toBeGreaterThan(0)
    expect(
      summary.recallQuality.every(
        (point) => point.observedRecall === 1 && point.predictedRecall !== null,
      ),
    ).toBe(true)
  })

  it('keeps practice rhythm unready when review volume has no persisted correctness', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 24 }, (_, index) => {
      const date = new Date('2026-07-21T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'practice-without-correctness',
      'Practice without correctness',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'practice-without-correctness', {
      id: 'practice-without-correctness:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean | null>(dates.length).fill(null),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.historicalReadiness.requested.ready).toBe(true)
    expect(summary.historicalReadiness.practiceRhythm).toMatchObject({
      ready: false,
      assessments: 0,
      activeBuckets: 0,
    })
    expect(summary.practiceRhythm.length).toBeGreaterThan(0)
    expect(summary.practiceRhythm.some((point) => point.reviewCount > 0)).toBe(
      true,
    )
    expect(
      summary.practiceRhythm.every(
        (point) => point.observedCorrectness === null,
      ),
    ).toBe(true)
  })

  it('excludes invalid persisted ratings from every historical readiness metric', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 24 }, (_, index) => {
      const date = new Date('2026-07-21T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'invalid-rating-evidence',
      'Invalid rating evidence',
      ['Graphs'],
    )
    await insertAnalyticsHistory(handle.db, 'invalid-rating-evidence', {
      id: 'invalid-rating-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })
    await handle.db
      .update(reviewAttempts)
      .set({ rating: 'unexpected-rating' })
      .where(eq(reviewAttempts.cardId, 'invalid-rating-evidence:default'))

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    for (const readiness of [
      summary.historicalReadiness.requested,
      summary.historicalReadiness.recallQuality,
      summary.historicalReadiness.practiceRhythm,
      summary.historicalReadiness.topics,
      summary.historicalReadiness.stability,
    ]) {
      expect(readiness).toMatchObject({
        ready: false,
        assessments: 0,
        activeBuckets: 0,
        effectiveStart: null,
      })
    }
    expect(summary.recallQuality).toEqual([])
    expect(summary.practiceRhythm).toHaveLength(
      summary.timeFrame.buckets.length,
    )
    expect(summary.views.observedRecallVsFsrs.rows).toEqual([])
    expect(summary.views.observedRecallVsFsrs.timeFrame).toMatchObject({
      buckets: [],
      grouping: null,
      history: { historyStart: null, displayStart: null, availableDays: 0 },
    })
    expect(
      summary.practiceRhythm.every(
        (row) =>
          row.reviewCount === 0 &&
          row.sampleSize === 0 &&
          row.observedCorrectness === null,
      ),
    ).toBe(true)
    expect(summary.ratingsMix).toHaveLength(summary.timeFrame.buckets.length)
    expect(
      summary.ratingsMix.every(
        (row) => row.total === 0 && row.hardAgainShare === null,
      ),
    ).toBe(true)
    expect(summary.topics).toEqual([])
    expect(summary.stability).toHaveLength(summary.timeFrame.buckets.length)
    expect(
      summary.stability.every(
        (row) => row.sampleSize === 0 && row.medianStabilityDays === null,
      ),
    ).toBe(true)
  })

  it('uses only valid persisted ratings for mixed historical readiness evidence', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-31T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'mixed-rating-evidence',
      'Mixed rating evidence',
      ['Graphs'],
    )
    await insertAnalyticsHistory(handle.db, 'mixed-rating-evidence', {
      id: 'mixed-rating-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })
    for (const index of [0, 2, 4, 6, 8, 10, 12]) {
      await handle.db
        .update(reviewAttempts)
        .set({ rating: 'unexpected-rating' })
        .where(eq(reviewAttempts.id, `mixed-rating-evidence:default:${index}`))
    }

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    for (const readiness of [
      summary.historicalReadiness.requested,
      summary.historicalReadiness.practiceRhythm,
      summary.historicalReadiness.topics,
      summary.historicalReadiness.stability,
    ]) {
      expect(readiness).toMatchObject({ assessments: 7, activeBuckets: 7 })
    }
    expect(summary.historicalReadiness.recallQuality).toMatchObject({
      assessments: 6,
      activeBuckets: 6,
    })
    expect(summary.historicalReadiness.firstAttemptOutcomes).toMatchObject({
      assessments: 0,
    })
    expect(
      summary.recallQuality.reduce(
        (count, point) => count + point.eligibleSampleSize,
        0,
      ),
    ).toBe(6)
    expect(
      summary.practiceRhythm.reduce(
        (count, point) => count + point.reviewCount,
        0,
      ),
    ).toBe(7)
    expect(summary.topics).toEqual([
      {
        topic: 'Graphs',
        recallQuality: 1,
        sampleSize: 7,
        lowSample: true,
      },
    ])
    expect(
      summary.stability.reduce((count, point) => count + point.sampleSize, 0),
    ).toBe(7)
  })

  it('counts only persisted correctness observations for practice rhythm readiness', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-31T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'mixed-practice-correctness',
      'Mixed practice correctness',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'mixed-practice-correctness', {
      id: 'mixed-practice-correctness:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: dates.map((_, index) =>
        index === 0 || index === 7 ? null : true,
      ),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.historicalReadiness.practiceRhythm).toMatchObject({
      ready: false,
      minimumAssessments: 24,
      assessments: 12,
      activeBuckets: 12,
    })
  })

  it('counts the exact paired repeat cohort for recall quality readiness', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-31T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'mixed-correctness',
      'Mixed correctness',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'mixed-correctness', {
      id: 'mixed-correctness:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: dates.map((_, index) =>
        index === 0 || index === 7 ? null : true,
      ),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.historicalReadiness.requested).toMatchObject({
      ready: false,
      minimumAssessments: 24,
      assessments: 14,
      activeBuckets: 14,
    })
    expect(summary.historicalReadiness.recallQuality).toMatchObject({
      ready: false,
      minimumAssessments: 24,
      assessments: 13,
      activeBuckets: 13,
    })
  })

  it('returns non-empty practice rhythm data accepted by the runtime response parser', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-31T12:00:00.000Z')

    await insertAnalyticsProblem(handle.db, 'legacy-consistency', 'Legacy', [])
    await insertAnalyticsHistory(handle.db, 'legacy-consistency', {
      id: 'legacy-consistency-card:default',
      dates: [new Date('2026-01-20T12:00:00.000Z')],
      ratings: ['good'],
      correct: [true],
      dueAt: new Date('2026-02-01T12:00:00.000Z'),
      stability: 4,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })
    const parsed = analyticsSummarySchema.parse({
      ...summary,
      observedRatingQuality: {
        value: summary.lowSample ? null : summary.observedRatingQuality,
        sampleSize: summary.observedRatingSampleSize,
        lowSample: summary.lowSample,
      },
    })

    expect(parsed.practiceRhythm).toHaveLength(12)
    expect(
      parsed.practiceRhythm.find((point) => point.reviewCount > 0),
    ).toEqual({
      bucketStart: '2026-01-20',
      bucketEnd: '2026-01-20',
      reviewCount: 1,
      observedCorrectness: 1,
      sampleSize: 1,
      associationOnly: true,
    })
  })

  it('keeps a selected unready 90-day range, recommends a ready shorter range, and preserves current-state analytics', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 24 }, (_, index) => {
      const date = new Date('2026-07-21T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'range-evidence',
      'Range evidence',
      ['Graphs'],
    )
    await insertAnalyticsHistory(handle.db, 'range-evidence', {
      id: 'range-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 90, now })
    const readiness = summary

    expect(readiness.range).toBe(90)
    expect(readiness.historicalReadiness.requested.ready).toBe(false)
    expect(readiness.historicalReadiness.requested).toMatchObject({
      requestedDays: 90,
      bucketDays: 3,
      ready: false,
      effectiveStart: '2026-07-21',
    })
    expect(readiness.historicalReadiness.recommendedRange).toBe(30)
    expect(readiness.recallQuality).toHaveLength(
      readiness.historicalReadiness.recallQuality.effectiveBuckets,
    )
    expect(readiness.views.upcomingReviewLoad.rows).toHaveLength(14)
    expect(readiness.views.retentionMap.rows.length).toBeGreaterThan(0)
  })

  it('never recommends the removed 14-day choice for short evidence', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-31T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'shorter-range-evidence',
      'Shorter range evidence',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'shorter-range-evidence', {
      id: 'shorter-range-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const selected30 = await getAnalyticsSummary(handle.db, {
      range: 30,
      now,
    })
    const selected90 = await getAnalyticsSummary(handle.db, {
      range: 90,
      now,
    })
    const selectedAll = await getAnalyticsSummary(handle.db, {
      range: 'all',
      now,
    })

    expect(selected30.historicalReadiness.requested.ready).toBe(false)
    expect(selected30.historicalReadiness.recommendedRange).toBeNull()
    expect(selected90.historicalReadiness.requested.ready).toBe(false)
    expect(selected90.historicalReadiness.recommendedRange).toBeNull()
    expect(selectedAll.historicalReadiness.requested).toMatchObject({
      ready: true,
      requestedDays: null,
      policyDays: 14,
      minimumAssessments: 12,
    })
    expect(selectedAll.historicalReadiness.recommendedRange).toBeNull()
  })

  it('never recommends a ready longer range for an unready selected range', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const earlierDates = Array.from({ length: 31 }, (_, index) => {
      const date = new Date('2026-05-16T12:00:00.000Z')
      date.setDate(date.getDate() + index * 2)
      return date
    })
    const recentDates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-31T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })
    const dates = [...earlierDates, ...recentDates]

    await insertAnalyticsProblem(
      handle.db,
      'longer-range-evidence',
      'Longer range evidence',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'longer-range-evidence', {
      id: 'longer-range-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const selected30 = await getAnalyticsSummary(handle.db, {
      range: 30,
      now,
    })
    const selected90 = await getAnalyticsSummary(handle.db, {
      range: 90,
      now,
    })

    expect(selected30.historicalReadiness.requested.ready).toBe(false)
    expect(selected90.historicalReadiness.requested.ready).toBe(true)
    expect(selected30.historicalReadiness.recommendedRange).toBeNull()
  })

  it('calculates readiness from each metric’s eligible evidence, not a copied range status', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 24 }, (_, index) => {
      const date = new Date('2026-07-21T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'topicless-evidence',
      'Topicless',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'topicless-evidence', {
      id: 'topicless-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })
    const readiness = summary as typeof summary & {
      historicalReadiness: {
        requested: { ready: boolean }
        topics: { ready: boolean; failingReasons: string[] }
        recommendedRange: number | null
      }
    }

    expect(readiness.historicalReadiness.requested.ready).toBe(true)
    expect(readiness.historicalReadiness.requested.ready).toBe(true)
    expect(readiness.historicalReadiness.recommendedRange).toBeNull()
    expect(readiness.historicalReadiness.topics.ready).toBe(false)
    expect(readiness.historicalReadiness.topics.failingReasons).toContain(
      'no-evidence',
    )
  })

  it.each([
    [30, 3],
    [90, 7],
  ] as const)(
    'uses %s-day selected history with %s-day presentation buckets',
    async (range, bucketDays) => {
      const handle = await createTestDb({ seed: false })
      const summary = await getAnalyticsSummary(handle.db, {
        range,
        now: new Date('2026-08-13T12:00:00.000Z'),
      })
      const readiness = summary as typeof summary & {
        historicalReadiness: { requested: { bucketDays: number } }
      }

      expect(readiness.historicalReadiness.requested.bucketDays).toBe(
        bucketDays,
      )
    },
  )

  it('keeps the serialized summary deterministic for the same range and time', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-15T12:00:00.000Z')

    const first = await getAnalyticsSummary(handle.db, { range: 90, now })
    const second = await getAnalyticsSummary(handle.db, { range: 90, now })

    expect(second).toEqual(first)
  })

  it('uses one requested timezone for bucket rows and forecast grouping', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-03-08T05:30:00.000Z')
    const reviewAt = new Date('2026-03-08T04:30:00.000Z')

    await insertAnalyticsProblem(
      handle.db,
      'timezone-boundary-problem',
      'Timezone Boundary Problem',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'timezone-boundary-problem', {
      id: 'timezone-boundary-card:default',
      dates: [reviewAt],
      ratings: ['good'],
      correct: [true],
      dueAt: new Date('2026-03-09T03:30:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, {
      range: 30,
      now,
      timeZone: 'America/New_York',
    })

    expect(summary.recallQuality).toEqual([])
    expect(
      summary.views.problemSolving.cohorts.newProblems.rows.find((row) =>
        Object.values(row.difficulties).some((stats) => stats.validRatings > 0),
      ),
    ).toMatchObject({
      bucketStart: '2026-03-07',
      bucketEnd: '2026-03-07',
      difficulties: { medium: { validRatings: 1 } },
      isPartial: false,
    })
    expect(summary.views.upcomingReviewLoad.rows[0]).toMatchObject({
      date: '2026-03-08',
      dueCount: 1,
    })
  })

  it('uses local frame bounds for quality and Hard + Again comparisons', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-03-08T05:30:00.000Z')
    const previous = Array.from(
      { length: 10 },
      (_, index) => new Date(Date.UTC(2026, 1, 6, 5, index)),
    )
    const previousPartialBoundary = new Date('2026-02-06T06:00:00.000Z')
    const selected = Array.from(
      { length: 10 },
      (_, index) => new Date(Date.UTC(2026, 2, 7, 12, index)),
    )
    const dates = [...previous, previousPartialBoundary, ...selected]

    await insertAnalyticsProblem(
      handle.db,
      'timezone-comparison-problem',
      'Timezone Comparison Problem',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'timezone-comparison-problem', {
      id: 'timezone-comparison-card:default',
      dates,
      ratings: [
        ...Array<ReviewRating>(10).fill('good'),
        'again',
        ...Array<ReviewRating>(10).fill('good'),
      ],
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-03-09T03:30:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, {
      range: 30,
      now,
      timeZone: 'America/New_York',
    })

    expect(summary.observedRatingSampleSize).toBe(10)
    expect(summary.observedRatingQuality).toBe(1)
    expect(summary.hardAgain).toMatchObject({
      selectedShare: 0,
      sampleSize: 10,
      previousShare: 0,
      previousSampleSize: 10,
      previousLowSample: false,
    })
  })
})

async function insertAnalyticsProblem(
  db: Db,
  slug: string,
  title: string,
  topicLabels: string[],
) {
  const timestamp = new Date('2026-01-01T00:00:00.000Z').getTime()
  await db.insert(problems).values({
    slug,
    title,
    difficulty: 'medium',
    isPremium: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(problemPractice).values({
    problemSlug: slug,
    status: 'review',
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    lastReviewedAt: timestamp,
    solvedCount: 1,
    attemptCount: 1,
    isSuspended: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  for (const label of topicLabels) {
    const topicId = `${slug}:${label.toLowerCase()}`
    await db.insert(topics).values({
      id: topicId,
      label,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.insert(problemTopics).values({ problemSlug: slug, topicId })
  }
}

async function insertAnalyticsHistory(
  db: Db,
  slug: string,
  input: {
    id: string
    dates: Date[]
    ratings: ReviewRating[]
    correct: Array<boolean | null>
    elapsedSeconds?: Array<number | null>
    dueAt: Date
    stability: number
    difficulty: number
  },
) {
  const initialCard = createInitialFsrsCard(input.dates[0])
  let card = initialCard
  const rows = []

  for (const [index, reviewedAt] of input.dates.entries()) {
    const scheduled = scheduleReview(card, input.ratings[index]!, reviewedAt, {
      targetRetention: 0.85,
    })
    rows.push({
      id: `${input.id}:${index}`,
      problemSlug: slug,
      cardId: input.id,
      rating: input.ratings[index]!,
      reviewMode: 'manual',
      reviewedAt: reviewedAt.getTime(),
      isCorrect: input.correct[index]!,
      elapsedSeconds: input.elapsedSeconds?.[index] ?? null,
      fsrsReviewLog: serializeFsrsReviewLogSnapshot(scheduled.log),
      createdAt: reviewedAt.getTime(),
      updatedAt: reviewedAt.getTime(),
    })
    card = scheduled.card
  }

  await db.insert(fsrsCards).values({
    id: input.id,
    problemSlug: slug,
    cardKind: defaultFsrsCardKind,
    dueAt: input.dueAt.getTime(),
    stability: input.stability,
    difficulty: input.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReviewAt: card.lastReviewAt?.getTime() ?? null,
    createdAt: input.dates[0]!.getTime(),
    updatedAt: input.dates.at(-1)!.getTime(),
  })
  await db.insert(reviewAttempts).values(rows)
}

async function insertNeverReviewedCard(
  db: Db,
  slug: string,
  input: { dueAt: Date },
) {
  const now = new Date('2026-01-01T00:00:00.000Z').getTime()
  await db.insert(fsrsCards).values({
    id: `${slug}:default`,
    problemSlug: slug,
    cardKind: defaultFsrsCardKind,
    dueAt: input.dueAt.getTime(),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    lastReviewAt: null,
    createdAt: now,
    updatedAt: now,
  })
}
