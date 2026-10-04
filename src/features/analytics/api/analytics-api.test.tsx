import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { defaultUserSettings, type AnalyticsTargets } from '@/features/settings'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'
import {
  applyHistoricalChartTargets,
  buildHistoricalAnalyticsViews,
} from '../domain/historical-presentation'
import { buildAnalyticsBucketsFromTimeFrame } from '../domain/analytics-range-policy'
import { normalizeFsrsSchedulingOptions } from '@/lib/fsrs'
import type { SerializedAnalyticsSummary } from './analytics-contracts'

import {
  analyticsQueryKeys,
  useAnalyticsSummary,
  useUpdateAnalyticsTargets,
} from './analytics-api'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('analytics runtime API', () => {
  beforeEach(() => {
    vi.mocked(sendMessage).mockReset()
  })

  it('discards a late initial range response after saving new chart targets', async () => {
    const { queryClient, wrapper } = createQueryTestHarness()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    queryClient.setQueryDefaults(analyticsQueryKeys.all, {
      staleTime: Infinity,
    })
    const loadedSummary = summaryWithMeasuredRows(30)
    queryClient.setQueryData(
      analyticsQueryKeys.summary(30, timeZone),
      loadedSummary,
    )
    const oldRangeSummary = summaryWithMeasuredRows(90)
    const savedSettings = {
      ...defaultUserSettings,
      analytics: {
        ...defaultUserSettings.analytics,
        targetRecall: 0.8,
        targetReviewSuccess: 0.9,
      },
    }
    const freshRangeSummary = summaryWithMeasuredRows(90)
    freshRangeSummary.views = applyHistoricalChartTargets(
      freshRangeSummary.views,
      savedSettings.analytics,
    )
    let resolveSave!: (settings: typeof savedSettings) => void
    const saveResponse = new Promise<typeof savedSettings>((resolve) => {
      resolveSave = resolve
    })
    let resolveInitialRange!: (summary: SerializedAnalyticsSummary) => void
    const initialRangeResponse = new Promise<SerializedAnalyticsSummary>(
      (resolve) => {
        resolveInitialRange = resolve
      },
    )
    vi.mocked(sendMessage)
      .mockReturnValueOnce(saveResponse)
      .mockReturnValueOnce(initialRangeResponse)
      .mockResolvedValueOnce(freshRangeSummary)
    const { result, rerender } = renderHook(
      ({ range }: { range: 30 | 90 }) => ({
        summary: useAnalyticsSummary(range),
        updateTargets: useUpdateAnalyticsTargets(),
      }),
      { initialProps: { range: 30 }, wrapper },
    )

    let save!: Promise<unknown>
    act(() => {
      save = result.current.updateTargets.mutateAsync(savedSettings.analytics)
    })
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    rerender({ range: 90 })
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    expect(result.current.summary.data).toBeUndefined()

    await act(async () => {
      resolveSave(savedSettings)
      await save
    })
    await act(async () => {
      resolveInitialRange(oldRangeSummary)
      await initialRangeResponse
    })
    await waitFor(() => expect(result.current.summary.isSuccess).toBe(true))

    expect(
      result.current.summary.data?.views.observedRecallVsFsrs.targetRecall,
    ).toBe(0.8)
    expect(
      result.current.summary.data?.views.practiceRhythm.targetReviewSuccess,
    ).toBe(0.9)
    expect(
      queryClient.getQueryData<SerializedAnalyticsSummary>(
        analyticsQueryKeys.summary(30, timeZone),
      )?.views.observedRecallVsFsrs.targetRecall,
    ).toBe(0.8)
    expect(sendMessage).toHaveBeenCalledTimes(3)
  })

  it.each([
    'targetRecall',
    'targetReviewSuccess',
    'targetFirstAttemptSuccess',
    'targetFirstAttemptGoodEasy',
  ] as const)(
    'saves only %s and applies returned goals and scales across cached ranges without changing evidence',
    async (field) => {
      const { queryClient, wrapper } = createQueryTestHarness()
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const summaries = ([14, 30, 90] as const).map((range) => {
        const summary = summaryWithMeasuredRows(range)
        queryClient.setQueryData(
          analyticsQueryKeys.summary(range, 'UTC'),
          summary,
        )
        return summary
      })
      const unrelated = { stable: true }
      queryClient.setQueryData(['problems'], unrelated)
      const firstAttempt =
        field === 'targetFirstAttemptSuccess' ||
        field === 'targetFirstAttemptGoodEasy'
      const goals = {
        targetRecall: firstAttempt ? 0.9 : 0,
        targetReviewSuccess: firstAttempt ? 0.9 : 1,
        targetFirstAttemptSuccess: firstAttempt ? 0 : 0.4,
        targetFirstAttemptGoodEasy: firstAttempt ? 1 : 0.4,
      }
      const savedSettings = { ...defaultUserSettings, analytics: goals }
      vi.mocked(sendMessage).mockResolvedValueOnce(savedSettings)
      const { result } = renderHook(() => useUpdateAnalyticsTargets(), {
        wrapper,
      })

      const patch: Partial<AnalyticsTargets> = {
        [field]: firstAttempt ? 0.29 : field === 'targetRecall' ? 0.4 : 0.7,
      }
      let returned: unknown
      await act(async () => {
        returned = await result.current.mutateAsync(patch)
      })

      expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
        surface: 'dashboard',
        patch: { analytics: patch },
      })
      expect(returned).toEqual(savedSettings)
      for (const before of summaries) {
        const cached = queryClient.getQueryData<SerializedAnalyticsSummary>(
          analyticsQueryKeys.summary(before.range, 'UTC'),
        )!
        expect(cached.views.problemSolving.targets).toEqual(goals)
        expect(cached.views.observedRecallVsFsrs.targetRecall).toBe(
          goals.targetRecall,
        )
        expect(cached.views.practiceRhythm.targetReviewSuccess).toBe(
          goals.targetReviewSuccess,
        )
        expect(cached.views.observedRecallVsFsrs.rows).toEqual(
          before.views.observedRecallVsFsrs.rows,
        )
        expect(cached.views.practiceRhythm.rows).toEqual(
          before.views.practiceRhythm.rows,
        )
        for (const [key, references] of [
          [
            'newProblems',
            [goals.targetFirstAttemptSuccess, goals.targetFirstAttemptGoodEasy],
          ],
          ['followupPractice', [goals.targetRecall, goals.targetReviewSuccess]],
        ] as const) {
          const previous = before.views.problemSolving.cohorts[key]
          expect(cached.views.problemSolving.cohorts[key]).toMatchObject({
            rows: previous.rows,
            totals: previous.totals,
            previous: previous.previous,
            timeScales: previous.timeScales,
          })
          const { domain } =
            cached.views.problemSolving.cohorts[key].outcomeScale
          expect(domain[0]).toBeLessThanOrEqual(Math.min(...references))
          expect(domain[1]).toBeGreaterThanOrEqual(Math.max(...references))
        }
        if (firstAttempt) {
          expect(cached.views.observedRecallVsFsrs.targetRecall).toBe(
            before.views.observedRecallVsFsrs.targetRecall,
          )
          expect(cached.views.practiceRhythm.targetReviewSuccess).toBe(
            before.views.practiceRhythm.targetReviewSuccess,
          )
        } else {
          expect(cached.views.observedRecallVsFsrs.scale.domain[0]).toBe(0)
          expect(cached.views.practiceRhythm.percentageScale.domain[1]).toBe(1)
          expect(cached.views.observedRecallVsFsrs.scale).not.toEqual(
            before.views.observedRecallVsFsrs.scale,
          )
          expect(cached.views.practiceRhythm.percentageScale).not.toEqual(
            before.views.practiceRhythm.percentageScale,
          )
        }
      }
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: analyticsQueryKeys.all,
      })
      expect(queryClient.getQueryData(['problems'])).toEqual(unrelated)
    },
  )

  it('keeps cached chart targets and scales unchanged after a failed save', async () => {
    const { queryClient, wrapper } = createQueryTestHarness()
    const before = summaryWithMeasuredRows(30)
    const key = analyticsQueryKeys.summary(30, 'UTC')
    queryClient.setQueryData(key, before)
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error('Save failed'))
    const { result } = renderHook(() => useUpdateAnalyticsTargets(), {
      wrapper,
    })

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          targetRecall: 0,
          targetReviewSuccess: 1,
        }),
      ).rejects.toThrow('Save failed')
    })

    expect(queryClient.getQueryData(key)).toEqual(before)
  })

  it('uses the correct analytics summary query key', () => {
    expect(analyticsQueryKeys.summary(14, 'America/New_York')).toEqual([
      'analytics',
      'summary',
      14,
      'America/New_York',
    ])
  })

  it('calls sendMessage with analytics.getSummary and a dashboard surface request', async () => {
    const payload = createSerializedAnalyticsSummary()
    vi.mocked(sendMessage).mockResolvedValueOnce(payload)

    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useAnalyticsSummary(90), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    expect(sendMessage).toHaveBeenCalledWith('analytics.getSummary', {
      surface: 'dashboard',
      range: 90,
      timeZone,
    })
    expect(result.current.data).toEqual(payload)
  })

  it('rejects incompatible summaries before dashboard components render them', async () => {
    const summary = createSerializedAnalyticsSummary()

    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...summary,
      views: {
        ...summary.views,
        observedRecallVsFsrs: {
          rows: summary.views.observedRecallVsFsrs.rows,
        },
      },
    } as never)

    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useAnalyticsSummary(90), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toHaveProperty('name', 'ZodError')
  })
})

function summaryWithMeasuredRows(
  range: 14 | 30 | 90,
): SerializedAnalyticsSummary {
  const summary = createSerializedAnalyticsSummary({ range })
  summary.timeFrame.requestedDays = range
  const { timeFrame } = summary
  summary.views.problemSolving = buildHistoricalAnalyticsViews(
    Array.from({ length: 4 }, (_, index) => ({
      id: `event-${index}`,
      cardId: `card-${index % 2}`,
      problemSlug: `problem-${index % 2}`,
      problemDifficulty: 'medium' as const,
      rating: index % 2 ? 'good' : 'again',
      topicLabels: [],
      fsrsReviewLog: null,
      elapsedSeconds: (index + 1) * 60,
      reviewedAt: new Date(
        index < 2 ? '2026-05-01T12:00:00Z' : '2026-05-02T12:00:00Z',
      ),
    })),
    {
      start: new Date(timeFrame.periodStart),
      end: new Date(timeFrame.asOf),
      timeFrame,
      timeZone: 'UTC',
      buckets: buildAnalyticsBucketsFromTimeFrame(timeFrame),
      fsrsOptions: normalizeFsrsSchedulingOptions(),
      analyticsTargets: {
        ...defaultUserSettings.analytics,
        targetFirstAttemptSuccess: 0.4,
        targetFirstAttemptGoodEasy: 0.4,
      },
    },
  ).problemSolving
  summary.views.observedRecallVsFsrs.rows = [
    {
      id: 'observed',
      bucketStart: '2026-05-01',
      bucketEnd: '2026-05-03',
      isPartial: false,
      recalledCount: 1,
      pairedReviews: 2,
      observedRecall: 0.5,
      fsrsEstimate: 0.6,
      difference: -0.1,
      provenance: 'reconstructed',
      evidence: 'measured',
    },
  ]
  summary.views.practiceRhythm.rows = [
    {
      id: 'practice',
      bucketStart: '2026-05-01',
      bucketEnd: '2026-05-03',
      isPartial: false,
      completedReviews: 2,
      goodEasy: 1,
      validRatings: 2,
      reviewSuccess: 0.5,
      evidence: 'measured',
    },
  ]
  return summary
}
