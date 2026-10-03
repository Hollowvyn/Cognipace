import { render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { defaultUserSettings } from '@/features/settings/domain'
import type {
  ReadinessFailure,
  SerializedAnalyticsSummary,
} from '@/features/analytics/api/analytics-contracts'
import { createQueryTestHarness } from '@/testing/query-test-harness'
import { metricDefinitions } from '../domain/metric-definitions'

import { AnalyticsScreen } from './analytics-screen'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="#/analytics?range=30">{children}</a>
  ),
}))

function createUnreadyHistoricalReadiness() {
  const readiness = {
    ready: false,
    requestedDays: 30,
    bucketDays: 3,
    requestedBuckets: 10,
    effectiveBuckets: 0,
    effectiveStart: null,
    assessments: 0,
    minimumAssessments: 24,
    activeBuckets: 0,
    minimumActiveBuckets: 0,
    longestGap: 0,
    maximumGap: 2,
    gapRuns: 0,
    maximumGapRuns: 1,
    failingReasons: [
      'no-evidence',
      'insufficient-span',
      'insufficient-assessments',
      'insufficient-active-buckets',
    ] as ReadinessFailure[],
  }

  return {
    requested: readiness,
    recallQuality: readiness,
    practiceRhythm: readiness,
    ratingsMix: readiness,
    topics: readiness,
    stability: readiness,
    overdueBacklog: readiness,
    recommendedRange: null,
  }
}

function createReadyHistoricalReadiness() {
  const historicalReadiness = createUnreadyHistoricalReadiness()
  const ready = {
    ...historicalReadiness.requested,
    ready: true,
    effectiveBuckets: 10,
    effectiveStart: '2026-01-01',
    assessments: 58,
    activeBuckets: 10,
    minimumActiveBuckets: 8,
    failingReasons: [] as ReadinessFailure[],
  }

  return {
    ...historicalReadiness,
    requested: ready,
    recallQuality: { ...ready },
    practiceRhythm: { ...ready },
    ratingsMix: { ...ready },
    topics: { ...ready },
    stability: { ...ready },
    overdueBacklog: { ...ready },
    recommendedRange: null,
  }
}

function baseAnalyticsSummary(): SerializedAnalyticsSummary {
  return {
    range: 30,
    generatedAt: '2026-01-15T12:00:00.000Z',
    timeFrame: {
      asOf: '2026-01-15T12:00:00.000Z',
      timeZone: 'UTC',
      timeZoneFallback: false,
      requestedDays: 30,
      periodStart: '2025-12-17T00:00:00.000Z',
      periodEnd: '2026-01-16T00:00:00.000Z',
      buckets: [
        {
          key: '2025-12-17',
          start: '2025-12-17T00:00:00.000Z',
          end: '2025-12-20T00:00:00.000Z',
          startKey: '2025-12-17',
          endKey: '2025-12-19',
          isPartial: false,
        },
      ],
    },
    reviewDays: 42,
    totalReviews: 381,
    currentStreak: 7,
    observedRatingQuality: { value: 0.72, sampleSize: 58, lowSample: false },
    predictedRecall: { value: null, sampleSize: 0, lowSample: true },
    observedRatingSampleSize: 58,
    lowSample: false,
    targetRetention: 0.9,
    views: {
      observedRecallVsFsrs: {
        rows: [],
        scale: { domain: [0, 1], ticks: [0, 1] },
        targetRecall: 0.9,
      },
      memoryStrength: {
        rows: [],
        scale: { domain: [0, 2], ticks: [0, 1, 2] },
      },
      practiceRhythm: {
        targetReviewSuccess: 0.9,
        rows: [],
        countScale: { domain: [0, 1], ticks: [0, 1] },
        percentageScale: { domain: [0, 1], ticks: [0, 1] },
      },
      ratingsMix: {
        rows: [],
        selectedHardAgain: 0,
        selectedValidRatings: 0,
        comparison: {
          previousHardAgainShare: null,
          previousValidRatings: 0,
          difference: null,
          direction: null,
        },
      },
      topicPerformance: {
        rows: [],
        strongerQualifyingTopics: 0,
        lowEvidenceTopics: [],
        additionalLowEvidenceTopics: 0,
      },
      retentionMap: {
        rows: [],
        totalEligible: 0,
        statusCounts: { onTarget: 0, watch: 0, needsAttention: 0 },
        recallScale: { domain: [0, 1], ticks: [0, 1] },
        durationScale: { domain: [1, 10], ticks: [1, 10] },
        targetRetention: 0.9,
      },
      memorySignals: { rows: [], totalQualifying: 0 },
      overdueBacklog: {
        rows: [],
        knownDays: 0,
        withinWatchDays: 0,
        aboveWatchDays: 0,
        selectedDays: 0,
        currentBacklog: null,
        peak: null,
        scale: { domain: [0, 5], ticks: [0, 5] },
      },
      upcomingReviewLoad: {
        rows: Array.from({ length: 14 }, (_, index) => ({
          date: `1970-01-${String(index + 1).padStart(2, '0')}`,
          dueCount: 0,
          overdueCount: 0,
          today: index === 0,
        })),
        scale: { domain: [0, 1], ticks: [0, 1] },
      },
    },
    historicalReadiness: createUnreadyHistoricalReadiness(),
    recallQuality: [],
    practiceRhythm: [],
    ratingsMix: [],
    hardAgain: {
      selectedShare: null,
      previousShare: null,
      delta: null,
      direction: null,
      sampleSize: 0,
      previousSampleSize: 0,
      lowSample: true,
      previousLowSample: true,
    },
    topics: [],
    stability: [],
  }
}

function createAnalyticsSummary(
  overrides: Partial<SerializedAnalyticsSummary> = {},
) {
  return { ...baseAnalyticsSummary(), ...overrides }
}

function readyAnalyticsSummary(
  overrides: Partial<SerializedAnalyticsSummary> = {},
): SerializedAnalyticsSummary {
  return createAnalyticsSummary({
    historicalReadiness: createReadyHistoricalReadiness(),
    recallQuality: [
      {
        bucketStart: '2026-01-14',
        bucketEnd: '2026-01-14',
        observedRecall: 0.78,
        predictedRecall: 0.84,
        targetRetention: 0.9,
        reviewCount: 12,
        eligibleSampleSize: 12,
      },
    ],
    practiceRhythm: [
      {
        bucketStart: '2026-01-12',
        bucketEnd: '2026-01-14',
        reviewCount: 4,
        observedCorrectness: 0.78,
        sampleSize: 12,
        associationOnly: true,
      },
    ],
    ratingsMix: [
      {
        bucketStart: '2026-01-14',
        bucketEnd: '2026-01-14',
        again: 1,
        hard: 2,
        good: 6,
        easy: 3,
        total: 12,
        hardAgainShare: 0.25,
      },
    ],
    topics: [
      {
        topic: 'Graphs',
        recallQuality: 0.61,
        sampleSize: 12,
        lowSample: false,
      },
    ],
    stability: [
      {
        bucketStart: '2026-01-12',
        bucketEnd: '2026-01-14',
        medianStabilityDays: 8.2,
        sampleSize: 12,
      },
    ],
    ...overrides,
  })
}

describe('AnalyticsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('edits saved goals in empty charts and keeps the controls available in Table view', async () => {
    const user = userEvent.setup()
    const summary = baseAnalyticsSummary()
    const analytics = { targetRecall: 0.8, targetReviewSuccess: 0.9 }
    const savedSummary = {
      ...summary,
      views: {
        ...summary.views,
        observedRecallVsFsrs: {
          ...summary.views.observedRecallVsFsrs,
          targetRecall: analytics.targetRecall,
        },
      },
    }
    vi.mocked(sendMessage)
      .mockResolvedValue(savedSummary)
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce({ ...defaultUserSettings, analytics })

    renderAnalyticsScreen()
    const recall = await screen.findByRole('region', {
      name: 'Observed Recall vs FSRS Estimate',
    })
    const practice = screen.getByRole('region', { name: 'Practice Rhythm' })
    await user.click(
      within(recall).getByRole('button', { name: 'Target Recall 90%' }),
    )
    await user.clear(screen.getByLabelText('Target Recall (%)'))
    await user.type(screen.getByLabelText('Target Recall (%)'), '80')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: { analytics },
    })
    expect(
      await within(recall).findByRole('button', { name: 'Target Recall 80%' }),
    ).toBeVisible()
    await user.click(within(recall).getByRole('tab', { name: 'Table' }))
    expect(
      within(recall).getByRole('button', { name: 'Target Recall 80%' }),
    ).toBeVisible()
    await user.click(
      within(practice).getByRole('button', {
        name: 'Target Review Success 90%',
      }),
    )
    expect(screen.getByLabelText('Target Recall (%)')).toHaveValue(80)
    await user.clear(screen.getByLabelText('Target Review Success (%)'))
    await user.type(screen.getByLabelText('Target Review Success (%)'), '70')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Review Success target must be at least your Recall target',
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('renders loading state while analytics data is pending', () => {
    vi.mocked(sendMessage).mockReturnValueOnce(new Promise(() => {}))

    renderAnalyticsScreen()

    expect(screen.getByText('Loading analytics...')).toBeVisible()
  })

  it('renders error state then succeeds after retry', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred<never>()
    vi.mocked(sendMessage)
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce(createAnalyticsSummary())

    renderAnalyticsScreen()

    deferred.reject(new Error('network error'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load Analytics.',
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByLabelText('Review Days metric')).toBeVisible()
  })

  it('renders the recoverable error state for an incompatible summary', async () => {
    const summary = createAnalyticsSummary()
    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...summary,
      views: {
        ...summary.views,
        observedRecallVsFsrs: {
          rows: summary.views.observedRecallVsFsrs.rows,
        },
      },
    } as never)

    renderAnalyticsScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load Analytics.',
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  it('keeps the selected-period summary content above the chart story', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(createAnalyticsSummary())

    renderAnalyticsScreen()

    const reviewDaysTile = await screen.findByLabelText('Review Days metric')
    expect(within(reviewDaysTile).getByText('42')).toBeVisible()
    expect(
      within(reviewDaysTile).getByText(
        'Days with at least one review in the selected 30-day period',
      ),
    ).toBeVisible()
  })

  it('surfaces the selected range, timezone fallback, and as-of instant', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createAnalyticsSummary({
        timeFrame: {
          ...baseAnalyticsSummary().timeFrame,
          timeZone: 'UTC',
          timeZoneFallback: true,
        },
      }),
    )

    renderAnalyticsScreen()

    const metadata = await screen.findByText(
      (_, element) =>
        element?.tagName === 'P' &&
        element.textContent?.includes('Range: 30 days') === true,
    )
    expect(metadata).toHaveTextContent('Time zone: UTC (fallback)')
    expect(metadata).toHaveTextContent('Period: 12/17/25–12/19/25')
    expect(metadata).toHaveTextContent('As of: Jan 15, 2026, 12:00 PM')
  })

  it('formats the scope start as a local date and ends it at the final bucket key', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createAnalyticsSummary({
        timeFrame: {
          ...baseAnalyticsSummary().timeFrame,
          asOf: '2026-01-15T16:00:00.000Z',
          periodStart: '2025-12-16T15:00:00.000Z',
          timeZone: 'Asia/Tokyo',
        },
      }),
    )

    renderAnalyticsScreen()

    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent?.includes('Period: 12/17/25–12/19/25') === true,
      ),
    ).toBeVisible()
    expect(screen.getByText(/As of:/)).toHaveTextContent(
      'As of: Jan 16, 2026, 1:00 AM',
    )
  })

  it('renders the Phase 2–3 historical views with semantic Chart and Table tabs', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(
      readyAnalyticsSummary({
        views: {
          observedRecallVsFsrs: {
            rows: [
              {
                id: '2026-01-14',
                bucketStart: '2026-01-14',
                bucketEnd: '2026-01-14',
                isPartial: true,
                recalledCount: 3,
                pairedReviews: 4,
                observedRecall: 0.75,
                fsrsEstimate: 0.8,
                difference: -0.05,
                provenance: 'reconstructed',
                evidence: 'measured',
              },
            ],
            scale: { domain: [0.6, 1], ticks: [0.6, 0.8, 1] },
            targetRecall: 0.9,
          },
          memoryStrength: {
            rows: [],
            scale: { domain: [0, 2], ticks: [0, 1, 2] },
          },
          practiceRhythm: {
            targetReviewSuccess: 0.9,
            rows: [],
            countScale: { domain: [0, 1], ticks: [0, 1] },
            percentageScale: { domain: [0, 1], ticks: [0, 1] },
          },
          ratingsMix: {
            rows: [],
            selectedHardAgain: 0,
            selectedValidRatings: 0,
            comparison: {
              previousHardAgainShare: null,
              previousValidRatings: 0,
              difference: null,
              direction: null,
            },
          },
          topicPerformance: {
            rows: [],
            strongerQualifyingTopics: 0,
            lowEvidenceTopics: [],
            additionalLowEvidenceTopics: 0,
          },
          retentionMap: {
            rows: [],
            totalEligible: 0,
            statusCounts: { onTarget: 0, watch: 0, needsAttention: 0 },
            recallScale: { domain: [0, 1], ticks: [0, 1] },
            durationScale: { domain: [1, 10], ticks: [1, 10] },
            targetRetention: 0.9,
          },
          memorySignals: { rows: [], totalQualifying: 0 },
          overdueBacklog: {
            rows: [],
            knownDays: 0,
            withinWatchDays: 0,
            aboveWatchDays: 0,
            selectedDays: 0,
            currentBacklog: null,
            peak: null,
            scale: { domain: [0, 5], ticks: [0, 5] },
          },
          upcomingReviewLoad: {
            rows: Array.from({ length: 14 }, (_, index) => ({
              date: `1970-01-${String(index + 1).padStart(2, '0')}`,
              dueCount: 0,
              overdueCount: 0,
              today: index === 0,
            })),
            scale: { domain: [0, 1], ticks: [0, 1] },
          },
        },
      }),
    )

    renderAnalyticsScreen()

    expect(
      await screen.findByRole('heading', {
        name: 'Observed Recall vs FSRS Estimate',
      }),
    ).toBeVisible()
    expect(screen.getAllByRole('tab', { name: 'Chart' })).toHaveLength(7)
    expect(screen.getAllByRole('tab', { name: 'Table' })).toHaveLength(7)
    expect(screen.getByRole('region', { name: 'Ratings Mix' })).toBeVisible()
  })

  it('renders Ratings Mix and Topic Performance with their semantic Chart and Table alternatives', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(readyAnalyticsSummary())

    renderAnalyticsScreen()

    expect(
      await screen.findByRole('region', { name: 'Ratings Mix' }),
    ).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Topic Performance' }),
    ).toBeVisible()
    expect(screen.getAllByRole('tab', { name: 'Chart' })).toHaveLength(7)
    expect(screen.getAllByRole('tab', { name: 'Table' })).toHaveLength(7)
  })

  it('uses Topic Performance qualifying evidence instead of legacy correctness readiness', async () => {
    const summary = readyAnalyticsSummary()
    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...summary,
      historicalReadiness: {
        ...summary.historicalReadiness,
        topics: createUnreadyHistoricalReadiness().topics,
      },
      views: {
        ...summary.views,
        topicPerformance: {
          ...summary.views.topicPerformance,
          rows: [
            {
              id: 'graphs',
              topic: 'Graphs',
              reviewSuccess: 0.6,
              goodEasy: 6,
              validRatings: 10,
              distinctProblems: 3,
              evidence: 'Measured',
            },
          ],
        },
      },
    })

    renderAnalyticsScreen()

    expect(
      await screen.findByText(
        '1 qualifying topic meets the 10 valid-rating and 3 reviewed-problem gates.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByLabelText('Topic Performance readiness'),
    ).not.toBeInTheDocument()
  })

  it('shows the observed-correctness low-sample warning', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createAnalyticsSummary({
        lowSample: true,
        observedRatingQuality: { value: null, sampleSize: 7, lowSample: true },
        observedRatingSampleSize: 7,
      }),
    )

    renderAnalyticsScreen()

    expect(
      await screen.findByText(/Observed correctness needs more data/),
    ).toBeVisible()
    expect(
      within(
        screen.getByLabelText(
          `${metricDefinitions.observedCorrectness.label} metric`,
        ),
      ).getByText('—'),
    ).toBeVisible()
  })

  it('keeps measured views visible while the selected range needs more evidence', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(createAnalyticsSummary())

    renderAnalyticsScreen()

    expect(
      await screen.findByRole('region', {
        name: 'Observed Recall vs FSRS Estimate',
      }),
    ).toBeVisible()
    expect(screen.getByLabelText('30-day analytics readiness')).toBeVisible()
  })

  it('keeps the selected unready range while offering a ready shorter view and current-state panels', async () => {
    const readiness = {
      ...createUnreadyHistoricalReadiness().requested,
      requestedDays: 90,
      bucketDays: 7,
      requestedBuckets: 13,
      effectiveBuckets: 6,
      effectiveStart: '2026-01-19',
      assessments: 32,
      minimumAssessments: 45,
      activeBuckets: 4,
      minimumActiveBuckets: 5,
      failingReasons: [
        'insufficient-span',
        'insufficient-assessments',
        'insufficient-active-buckets',
      ] as ReadinessFailure[],
    }

    vi.mocked(sendMessage).mockResolvedValueOnce(
      readyAnalyticsSummary({
        range: 90,
        timeFrame: {
          ...baseAnalyticsSummary().timeFrame,
          requestedDays: 90,
        },
        historicalReadiness: {
          requested: readiness,
          recallQuality: readiness,
          practiceRhythm: readiness,
          ratingsMix: readiness,
          topics: readiness,
          stability: readiness,
          overdueBacklog: readiness,
          recommendedRange: 30,
        },
      }),
    )

    renderAnalyticsScreen(90)

    expect(
      await screen.findByRole('status', {
        name: '90-day analytics readiness',
      }),
    ).toHaveTextContent('13 more assessments needed.')
    expect(
      screen.getByRole('link', { name: 'Use ready 30-day view' }),
    ).toHaveAttribute('href', expect.stringContaining('range=30'))
    expect(
      await screen.findByRole('region', {
        name: 'Observed Recall vs FSRS Estimate',
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Practice Rhythm' }),
    ).toBeVisible()
    expect(
      within(
        screen.getByRole('status', { name: '90-day analytics readiness' }),
      ).getByText('13 more assessments needed.'),
    ).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Memory Strength' }),
    ).toBeVisible()
  })

  it('shows an effective historical window when a ready range trims leading empty buckets', async () => {
    const readiness = {
      ...createReadyHistoricalReadiness().requested,
      requestedDays: 90,
      bucketDays: 7,
      requestedBuckets: 13,
      effectiveBuckets: 8,
      effectiveStart: '2025-12-01',
    }

    vi.mocked(sendMessage).mockResolvedValueOnce(
      readyAnalyticsSummary({
        range: 90,
        timeFrame: {
          ...baseAnalyticsSummary().timeFrame,
          requestedDays: 90,
        },
        historicalReadiness: {
          requested: readiness,
          recallQuality: readiness,
          practiceRhythm: readiness,
          ratingsMix: readiness,
          topics: readiness,
          stability: readiness,
          overdueBacklog: readiness,
          recommendedRange: null,
        },
      }),
    )

    renderAnalyticsScreen(90)

    expect(
      await screen.findByText(
        'Showing 8 weeks of usable history from your selected 90-day range.',
      ),
    ).toBeVisible()
  })

  it('renders a metric-specific readiness state without hiding ready historical charts', async () => {
    const historicalReadiness = createReadyHistoricalReadiness()
    const practiceRhythm = {
      ...historicalReadiness.practiceRhythm,
      ready: false,
      assessments: 12,
      minimumAssessments: 24,
      failingReasons: ['insufficient-assessments'] as ReadinessFailure[],
    }

    const summary = readyAnalyticsSummary({
      historicalReadiness: {
        ...historicalReadiness,
        practiceRhythm,
      },
    })
    summary.views.practiceRhythm.rows = [
      {
        id: '2026-01-12',
        bucketStart: '2026-01-12',
        bucketEnd: '2026-01-14',
        isPartial: false,
        completedReviews: 4,
        goodEasy: 3,
        validRatings: 4,
        reviewSuccess: 0.75,
        evidence: 'measured',
      },
    ]
    vi.mocked(sendMessage).mockResolvedValueOnce(summary)

    renderAnalyticsScreen()

    expect(
      await screen.findByRole('status', { name: 'Practice Rhythm readiness' }),
    ).toHaveTextContent('12 more assessments needed.')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Practice Rhythm' }),
    ).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Practice Rhythm' }),
    ).toBeVisible()
    const chart = screen.getByRole('button', {
      name: 'Inspect Practice Rhythm chart',
    })
    const warning = screen.getByRole('status', {
      name: 'Practice Rhythm readiness',
    })
    expect(
      chart.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      screen.queryByRole('region', { name: 'Ratings mix' }),
    ).not.toBeInTheDocument()
  })

  it('renders the approved chart hierarchy with explanations and fragile knowledge', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(readyAnalyticsSummary())

    renderAnalyticsScreen()

    expect(
      await screen.findByRole('region', {
        name: 'Observed Recall vs FSRS Estimate',
      }),
    ).toBeVisible()
    expect(
      within(
        screen.getByRole('region', {
          name: 'Observed Recall vs FSRS Estimate',
        }),
      ).getByText(
        /reconstructed FSRS retrievability immediately before those exact reviews/,
      ),
    ).toBeVisible()
    const chartRegionNames = [
      'Observed Recall vs FSRS Estimate',
      'Memory Strength',
      'Practice Rhythm',
    ]
    const regionOrder = screen.getAllByRole('region').map((region) => {
      const labelledBy = region.getAttribute('aria-labelledby')
      return labelledBy
        ? document.getElementById(labelledBy)?.textContent
        : region.getAttribute('aria-label')
    })
    const chartOrder = regionOrder.filter((name) =>
      chartRegionNames.includes(name ?? ''),
    )

    expect(chartOrder).toEqual(chartRegionNames)
    const practiceRhythm = screen.getByRole('region', {
      name: 'Practice Rhythm',
    })
    expect(
      within(practiceRhythm).getByText(
        /Completed review volume and the Good \+ Easy share/,
      ),
    ).toBeVisible()
    expect(screen.queryByText(/practice days \/ week/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/weekly assessed reviews/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: '14-day due forecast' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Weak problems' }),
    ).not.toBeInTheDocument()
  })

  it('renders chart-level empty states when the service is ready but a series is empty', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(
      readyAnalyticsSummary({
        views: {
          ...baseAnalyticsSummary().views,
          observedRecallVsFsrs: {
            ...baseAnalyticsSummary().views.observedRecallVsFsrs,
            rows: [],
          },
        },
      }),
    )

    renderAnalyticsScreen()

    const recallPanel = await screen.findByRole('region', {
      name: 'Observed Recall vs FSRS Estimate',
    })
    expect(
      within(recallPanel).getByText(
        'No reviews in this period have both a valid rating and an FSRS estimate.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: 'Fragile knowledge' }),
    ).not.toBeInTheDocument()
  })
})

function renderAnalyticsScreen(range?: 14 | 30 | 90) {
  const harness = createQueryTestHarness()
  render(<AnalyticsScreen range={range} />, { wrapper: harness.wrapper })
  return harness
}

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}
