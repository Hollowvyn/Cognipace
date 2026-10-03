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
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
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
  return createSerializedAnalyticsSummary().historicalReadiness
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
    firstAttemptOutcomes: { ...ready },
    practiceRhythm: { ...ready },
    ratingsMix: { ...ready },
    topics: { ...ready },
    stability: { ...ready },
    overdueBacklog: { ...ready },
    recommendedRange: null,
  }
}

function baseAnalyticsSummary(): SerializedAnalyticsSummary {
  return createSerializedAnalyticsSummary({
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
    observedRatingQuality: { value: 0.72, sampleSize: 58, lowSample: false },
    observedRatingSampleSize: 58,
  })
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
    ...overrides,
  })
}

describe('AnalyticsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['targetRecall', 'Recall', 'Recall vs FSRS Estimate', 80],
    ['targetReviewSuccess', 'Review Success', 'Practice Rhythm', 95],
    [
      'targetFirstAttemptSuccess',
      'First-attempt Success',
      'New Problem Success',
      29,
    ],
    ['targetFirstAttemptGoodEasy', 'Good + Easy', 'New Problem Success', 29],
  ] as const)(
    'wires %s through empty Chart/Table views and saves only its key',
    async (field, name, panel, percent) => {
      const user = userEvent.setup()
      const summary = baseAnalyticsSummary()
      const value = percent / 100
      const analytics = { ...defaultUserSettings.analytics, [field]: value }
      // Hold refetch so captions must update from the saved settings.
      vi.mocked(sendMessage)
        .mockReturnValue(new Promise(() => {}))
        .mockResolvedValueOnce(summary)
        .mockResolvedValueOnce({ ...defaultUserSettings, analytics })
      renderAnalyticsScreen()
      const region = await screen.findByRole('region', { name: panel })
      const label = `Target ${name}`
      await user.click(within(region).getByRole('tab', { name: 'Table' }))
      await user.click(
        within(region).getByRole('button', { name: `${label} 90%` }),
      )
      const input = screen.getByLabelText(`${label} (%)`)
      await user.clear(input)
      await user.type(input, `${percent}{Enter}`)
      expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
        surface: 'dashboard',
        patch: { analytics: { [field]: value } },
      })
      expect(
        await within(region).findByRole('button', {
          name: `${label} ${percent}%`,
        }),
      ).toBeVisible()
    },
  )

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
          ...baseAnalyticsSummary().views,
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
        },
      }),
    )

    renderAnalyticsScreen()

    expect(
      await screen.findByRole('heading', {
        name: 'Recall vs FSRS Estimate',
      }),
    ).toBeVisible()
    expect(screen.getAllByRole('tab', { name: 'Chart' })).toHaveLength(7)
    expect(screen.getAllByRole('tab', { name: 'Table' })).toHaveLength(7)
    expect(
      screen.queryByRole('region', { name: 'Ratings Mix' }),
    ).not.toBeInTheDocument()
  })

  it.each([true, false])(
    'distinguishes rating readiness when Practice readiness is %s',
    async (practiceReady) => {
      const summary = readyAnalyticsSummary()
      const needs12 = summary.historicalReadiness.ratingsMix
      needs12.ready = false
      needs12.assessments = 12
      needs12.failingReasons = ['insufficient-assessments']
      if (!practiceReady) summary.historicalReadiness.practiceRhythm = needs12
      summary.historicalReadiness.ratingsMix = practiceReady
        ? needs12
        : createUnreadyHistoricalReadiness().ratingsMix
      vi.mocked(sendMessage).mockResolvedValueOnce(summary)
      renderAnalyticsScreen()
      const ratingWarning = await screen.findByLabelText(
        'Rating composition readiness',
      )
      expect(screen.getByText('Rating composition evidence')).toBeVisible()
      expect(ratingWarning).toHaveTextContent(
        practiceReady
          ? '12 more assessments needed.'
          : 'Complete your first eligible review to begin this view.',
      )
      const practiceWarning = screen.queryByLabelText(
        'Practice Rhythm readiness',
      )
      if (practiceReady) expect(practiceWarning).not.toBeInTheDocument()
      else {
        expect(screen.getByText('Practice Rhythm evidence')).toBeVisible()
        expect(practiceWarning).toHaveTextContent('12 more assessments needed.')
      }
    },
  )

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
        name: 'Recall vs FSRS Estimate',
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
          firstAttemptOutcomes: readiness,
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
        name: 'Recall vs FSRS Estimate',
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
          firstAttemptOutcomes: readiness,
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
        name: 'Recall vs FSRS Estimate',
      }),
    ).toBeVisible()
    expect(
      within(
        screen.getByRole('region', {
          name: 'Recall vs FSRS Estimate',
        }),
      ).getByText(
        /reconstructed FSRS retrievability immediately before those exact reviews/,
      ),
    ).toBeVisible()
    const first = screen.getByRole('region', { name: 'New Problem Success' })
    const recall = screen.getByRole('region', {
      name: 'Recall vs FSRS Estimate',
    })
    expect(first.parentElement).toBe(recall.parentElement)
    expect(first.parentElement).toHaveClass('lg:grid-cols-2')
    expect(
      within(first).getByText('How are your first recorded outcomes changing?'),
    ).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Practice Rhythm' }).parentElement,
    ).not.toBe(first.parentElement)
    expect(
      screen.getByRole('region', { name: 'Memory Strength' }).parentElement,
    ).toBe(
      screen.getByRole('region', { name: 'Topic Performance' }).parentElement,
    )
    const chartRegionNames = [
      'New Problem Success',
      'Recall vs FSRS Estimate',
      'Practice Rhythm',
      'Memory Strength',
      'Topic Performance',
      'Retention Map',
      'Memory Signals by Problem',
      'Recent Overdue Backlog',
      'Upcoming Review Load',
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
        /Rating shares and completed review volume/,
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

  it.each([
    ['firstAttemptOutcomes', 'New Problem Success', 'Recall vs FSRS Estimate'],
    ['recallQuality', 'Recall vs FSRS Estimate', 'New Problem Success'],
  ] as const)(
    'keeps %s readiness independent of the other cohort',
    async (key, unreadyTitle, readyTitle) => {
      const summary = readyAnalyticsSummary()
      summary.historicalReadiness[key] = createUnreadyHistoricalReadiness()[key]
      vi.mocked(sendMessage).mockResolvedValueOnce(summary)
      renderAnalyticsScreen()
      expect(
        await screen.findByLabelText(`${unreadyTitle} readiness`),
      ).toBeVisible()
      expect(
        screen.queryByLabelText(`${readyTitle} readiness`),
      ).not.toBeInTheDocument()
    },
  )

  it('renders chart-level empty states when the service is ready but a series is empty', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(readyAnalyticsSummary())
    renderAnalyticsScreen()
    const recallPanel = await screen.findByRole('region', {
      name: 'Recall vs FSRS Estimate',
    })
    expect(
      within(recallPanel).getByText(
        'No repeat reviews in this period have both a valid rating and an FSRS estimate. First recorded reviews build memory for later comparisons.',
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
