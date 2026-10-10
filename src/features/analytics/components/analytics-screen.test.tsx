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
import {
  createSerializedAnalyticsSummary,
  createTopicRatingCountMatrix,
} from '@/testing/analytics-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'
import { buildAnalyticsTimeFrame } from '../domain/analytics-time'

import { buildAnalyticsHistoryTimeFrame } from '../domain/analytics-history-frame'

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
    activity: {
      assessmentDays: 12,
      recordedAssessments: 60,
      knownCorrectnessAssessments: 40,
      successfulAssessments: 30,
      distinctSuccessfulProblems: 22,
      observedCorrectness: 0.75,
      timedSuccessfulAssessments: 24,
      untimedSuccessfulAssessments: 6,
      successfulRecordedSeconds: 5400,
    },
    observedRatingQuality: { value: 0.72, sampleSize: 58, lowSample: false },
    observedRatingSampleSize: 58,
  })
}

function createAnalyticsSummary(
  overrides: Partial<SerializedAnalyticsSummary> = {},
) {
  const base = baseAnalyticsSummary()
  const defaults = createSerializedAnalyticsSummary({
    timeFrame: overrides.timeFrame ?? base.timeFrame,
  })
  return { ...base, ...overrides, views: overrides.views ?? defaults.views }
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

  it('composes ten ordered compact cards with reachable Details and Overview', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(readyAnalyticsSummary())
    renderAnalyticsScreen()
    await screen.findByRole('region', { name: 'Performance' })
    const titles = [
      'Performance',
      'Time vs target',
      'Practice',
      'Topic performance',
      'Recall',
      'Memory strength',
      'Retention map',
      'Memory signals',
      'Overdue backlog',
      'Upcoming reviews',
    ]
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((node) => node.textContent)
        .filter((name) => titles.includes(name ?? '')),
    ).toEqual(titles)
    expect(
      screen.queryByRole('region', { name: 'Problem Solving' }),
    ).not.toBeInTheDocument()
    for (const name of titles) {
      const card = within(screen.getByRole('region', { name }))
      await user.click(card.getByRole('button', { name: /Details$/ }))
      await user.click(card.getByRole('button', { name: /Overview$/ }))
    }
  })

  it.each([
    ['targetRecall', 'Recall', 'Recall', 'recall', 80],
    ['targetReviewSuccess', 'Review Success', 'Recall', 'reviewSuccess', 95],
    ['targetReviewSuccess', 'Review Success', 'Practice', 'reviewSuccess', 95],
    [
      'targetReviewSuccess',
      'Review Success',
      'Topic performance',
      'reviewSuccess',
      95,
    ],
    [
      'targetFirstAttemptSuccess',
      'First-attempt Success',
      'Performance',
      'firstAttemptSuccess',
      29,
    ],
    [
      'targetFirstAttemptGoodEasy',
      'Good + Easy',
      'Performance',
      'firstAttemptGoodEasy',
      29,
    ],
    [
      'targetReviewSuccess',
      'Review Success',
      'Performance',
      'reviewSuccess',
      95,
    ],
  ] as const)(
    'wires %s through %s %s Details and saves only its key',
    async (field, name, panel, metric, percent) => {
      const user = userEvent.setup()
      const summary = baseAnalyticsSummary()
      const value = percent / 100
      vi.mocked(sendMessage)
        .mockReturnValue(new Promise(() => {}))
        .mockResolvedValueOnce(summary)
        .mockResolvedValueOnce({
          ...defaultUserSettings,
          analytics: { ...defaultUserSettings.analytics, [field]: value },
        })
      const harness = renderAnalyticsScreen()
      const region = await screen.findByRole('region', { name: panel })
      const card = within(region)
      if (panel === 'Performance') {
        await user.click(
          card.getByRole('button', { name: 'Performance Details' }),
        )
        await user.selectOptions(
          card.getByLabelText('Performance detail section'),
          'goals',
        )
        await user.selectOptions(
          card.getByLabelText('Performance goal'),
          metric,
        )
      } else if (panel === 'Topic performance') {
        await user.click(card.getByRole('button', { name: 'Topics Details' }))
        await user.selectOptions(
          card.getByLabelText('Topics detail section'),
          'ratings',
        )
        await user.click(
          card.getByRole('button', { name: 'Edit Review Success goal' }),
        )
      } else {
        await user.click(
          card.getByRole('button', {
            name:
              panel === 'Recall'
                ? 'Target Recall 90%'
                : 'Target Review Success 90%',
          }),
        )
        if (panel === 'Recall' && metric === 'reviewSuccess')
          await user.click(
            card.getByRole('button', { name: 'Target Review Success 90%' }),
          )
      }
      const input = card.getByLabelText(`Target ${name} (%)`)
      await user.clear(input)
      await user.type(input, `${percent}{Enter}`)
      await waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
          surface: 'dashboard',
          patch: { analytics: { [field]: value } },
        }),
      )
      await waitFor(() => {
        const cached = harness.queryClient
          .getQueriesData<SerializedAnalyticsSummary>({
            queryKey: ['analytics'],
          })
          .find(([, data]) => data?.views)?.[1]
        expect(cached?.views.problemSolving.targets[field]).toBe(value)
      })
      if (field === 'targetReviewSuccess') {
        const practice = within(
          screen.getByRole('region', { name: 'Practice' }),
        )
        if (panel === 'Practice')
          await user.click(
            practice.getByRole('button', { name: 'Practice Overview' }),
          )
        expect(
          practice.getByRole('button', {
            name: `Target Review Success ${percent}%`,
          }),
        ).toBeVisible()
      }
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
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    expect(await screen.findByLabelText('Review Days metric')).toBeVisible()
  })

  it('renders the recoverable error state for an incompatible summary', async () => {
    const summary = createAnalyticsSummary()
    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...summary,
      views: {
        ...summary.views,
        observedRecallVsFsrs: { rows: summary.views.observedRecallVsFsrs.rows },
      },
    } as never)
    renderAnalyticsScreen()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load Analytics.',
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  it('keeps the selected persisted activity above the chart story', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(createAnalyticsSummary())
    renderAnalyticsScreen()
    const reviewDays = await screen.findByLabelText('Review Days metric')
    expect(within(reviewDays).getByText('12')).toBeVisible()
    expect(
      within(reviewDays).getByText('Days with recorded practice'),
    ).toBeVisible()
    expect(
      within(screen.getByLabelText('Questions solved metric')).getByText('22'),
    ).toBeVisible()
    expect(
      within(screen.getByLabelText('Observed correctness metric')).getByText(
        '75%',
      ),
    ).toBeVisible()
    expect(
      within(screen.getByLabelText('Recorded solve time metric')).getByText(
        '1h 30m',
      ),
    ).toBeVisible()
    expect(
      reviewDays.compareDocumentPosition(
        screen.getByRole('region', { name: 'Performance' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('surfaces the selected range, timezone fallback, and original as-of instant', async () => {
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
      (_, node) =>
        node?.tagName === 'P' &&
        node.textContent?.includes('Range: 30 days') === true,
    )
    expect(metadata).toHaveTextContent('Time zone: UTC (fallback)')
    expect(metadata).toHaveTextContent('Period: 12/17/25–12/19/25')
    expect(metadata).toHaveTextContent('As of: Jan 15, 2026, 12:00 PM')
  })

  it('formats the scope start locally and ends it at the actual final bucket key', async () => {
    const timeFrame = buildAnalyticsTimeFrame({
      asOf: new Date('2026-01-15T16:00:00Z'),
      requestedDays: 30,
      timeZone: 'Asia/Tokyo',
    })
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createAnalyticsSummary({
        timeFrame: { ...timeFrame, buckets: timeFrame.buckets.slice(0, 1) },
      }),
    )
    renderAnalyticsScreen()
    expect(
      await screen.findByText(
        (_, node) =>
          node?.tagName === 'P' &&
          node.textContent?.includes('Period: 12/18/25–12/20/25') === true,
      ),
    ).toBeVisible()
    expect(screen.getByText(/As of:/)).toHaveTextContent(
      'As of: Jan 16, 2026, 1:00 AM',
    )
  })

  it('retains raw pooled outcomes, difficulty outcomes and Mix inside Performance Breakdown', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(readyAnalyticsSummary())
    renderAnalyticsScreen()
    const region = await screen.findByRole('region', { name: 'Performance' })
    const card = within(region)
    expect(
      card.getByRole('button', { name: 'Performance Details' }),
    ).toHaveTextContent('Breakdown')
    expect(card.getByText('No new ratings')).toBeVisible()
    await user.click(card.getByRole('button', { name: 'Performance Details' }))
    await user.selectOptions(
      card.getByLabelText('Performance detail section'),
      'pooled',
    )
    expect(card.getByLabelText('Pooled outcome display')).toBeVisible()
    expect(
      card.getByRole('button', { name: 'Hard + Good + Easy' }),
    ).toBeVisible()
    expect(card.getByRole('button', { name: 'Good + Easy' })).toBeVisible()
    await user.selectOptions(
      card.getByLabelText('Performance detail section'),
      'difficultyOutcomes',
    )
    await user.selectOptions(
      card.getByLabelText('Difficulty outcome display'),
      'settings',
    )
    expect(card.getByLabelText('Outcome measure')).toBeVisible()
    for (const name of ['Easy', 'Medium', 'Hard'])
      expect(card.getByRole('button', { name })).toBeVisible()
    await user.selectOptions(
      card.getByLabelText('Performance detail section'),
      'mix',
    )
    await user.selectOptions(card.getByLabelText('Mix display'), 'settings')
    expect(card.getByLabelText('Difficulty Mix measure')).toBeVisible()
  })

  it.each([true, false])(
    'keeps complete separate Practice and Ratings readiness when Practice is %s',
    async (practiceReady) => {
      const user = userEvent.setup()
      const summary = readyAnalyticsSummary()
      const unready = {
        ...summary.historicalReadiness.practiceRhythm,
        ready: false,
        assessments: 12,
        minimumAssessments: 24,
        failingReasons: ['insufficient-assessments'] as ReadinessFailure[],
      }
      summary.historicalReadiness.ratingsMix =
        createUnreadyHistoricalReadiness().ratingsMix
      summary.historicalReadiness.practiceRhythm = practiceReady
        ? summary.historicalReadiness.practiceRhythm
        : unready
      vi.mocked(sendMessage).mockResolvedValueOnce(summary)
      renderAnalyticsScreen()
      const card = within(
        await screen.findByRole('region', { name: 'Practice' }),
      )
      await user.click(card.getByRole('button', { name: 'Practice Details' }))
      await user.selectOptions(
        card.getByLabelText('Practice detail section'),
        'evidence',
      )
      const evidence = await collectRows(
        user,
        card,
        'Practice Evidence exact values',
        'Next Practice rows',
      )
      expect(evidence.join(' ')).toContain(
        'Practice ready ' + String(practiceReady),
      )
      expect(evidence.join(' ')).toContain('Ratings ready false')
      expect(evidence.join(' ')).toContain('Ratings failingReasons')
      if (!practiceReady)
        expect(evidence.join(' ')).toContain('insufficient-assessments')
    },
  )

  it('uses Topics qualifying rating evidence and preserves its separate report readiness', async () => {
    const user = userEvent.setup()
    const summary = readyAnalyticsSummary()
    summary.historicalReadiness.topics =
      createUnreadyHistoricalReadiness().topics
    summary.views.topicPerformance.rows = [
      {
        id: 'graphs',
        topic: 'Graphs',
        reviewSuccess: 0.6,
        goodEasy: 6,
        validRatings: 10,
        distinctProblems: 3,
        ratingCountsByDifficulty: createTopicRatingCountMatrix({
          unknown: { again: 4, good: 6 },
        }),
        evidence: 'Measured',
      },
    ]
    vi.mocked(sendMessage).mockResolvedValueOnce(summary)
    renderAnalyticsScreen()
    const topics = within(
      await screen.findByRole('region', { name: 'Topic performance' }),
    )
    expect(topics.getByText('Graphs')).toBeVisible()
    expect(topics.getByText('1 qualifying topics')).toBeVisible()
    const performance = await openEvidence(user, 'topics')
    expect(
      performance.getByText(
        'Complete your first eligible review to begin this view.',
      ),
    ).toBeVisible()
  })

  it('does not let rating low-sample guidance override persisted correctness truth', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createAnalyticsSummary({
        lowSample: true,
        observedRatingQuality: { value: null, sampleSize: 7, lowSample: true },
        observedRatingSampleSize: 7,
      }),
    )
    renderAnalyticsScreen()
    const metric = await screen.findByLabelText('Observed correctness metric')
    expect(within(metric).getByText('75%')).toBeVisible()
    expect(
      screen.queryByText(/Observed correctness needs more data/),
    ).not.toBeInTheDocument()
  })

  it('keeps measured cards visible while requested readiness and its recommendation remain reachable', async () => {
    const user = userEvent.setup()
    const summary = createAnalyticsSummary()
    summary.historicalReadiness.recommendedRange = 30
    vi.mocked(sendMessage).mockResolvedValueOnce(summary)
    renderAnalyticsScreen()
    expect(await screen.findByRole('region', { name: 'Recall' })).toBeVisible()
    expect(
      screen.queryByLabelText('30-day analytics readiness'),
    ).not.toBeInTheDocument()
    const card = await openEvidence(user)
    expect(
      card.getByRole('link', { name: 'Use ready 30-day view' }),
    ).toHaveAttribute('href', expect.stringContaining('range=30'))
    const evidence = await collectRows(
      user,
      card,
      'Performance Evidence exact values',
      'Next Performance rows',
    )
    expect(evidence.join(' ')).toContain(
      'Complete your first eligible review to begin this view.',
    )
    for (const [key, value] of Object.entries(
      summary.historicalReadiness.requested,
    )) {
      expect(evidence.join(' ')).toContain(key)
      expect(evidence.join(' ')).toContain(
        typeof value === 'object' ? JSON.stringify(value) : String(value),
      )
    }
  })

  it('keeps shortened historical-window guidance in fitting Evidence without changing range', async () => {
    const user = userEvent.setup()
    const summary = readyAnalyticsSummary({
      range: 90,
      timeFrame: buildAnalyticsTimeFrame({
        asOf: new Date(baseAnalyticsSummary().timeFrame.asOf),
        requestedDays: 90,
        timeZone: 'UTC',
      }),
    })
    summary.historicalReadiness.requested = {
      ...summary.historicalReadiness.requested,
      requestedDays: 90,
      bucketDays: 7,
      requestedBuckets: 13,
      effectiveBuckets: 8,
      effectiveStart: '2025-12-01',
    }
    vi.mocked(sendMessage).mockResolvedValueOnce(summary)
    renderAnalyticsScreen(90)
    const card = await openEvidence(user)
    expect(
      card.getByText(
        'Showing 8 weeks of usable history from your selected 90-day range.',
      ),
    ).toBeVisible()
    expect(screen.getByText(/Range: 90 days/)).toBeVisible()
  })

  it.each(['firstAttemptOutcomes', 'recallQuality'] as const)(
    'keeps %s readiness independent of the other population',
    async (key) => {
      const user = userEvent.setup()
      const summary = readyAnalyticsSummary()
      summary.historicalReadiness[key] = createUnreadyHistoricalReadiness()[key]
      vi.mocked(sendMessage).mockResolvedValueOnce(summary)
      renderAnalyticsScreen()
      const card = await openEvidence(user, 'firstAttemptOutcomes')
      const first = await collectRows(
        user,
        card,
        'Performance Evidence exact values',
        'Next Performance rows',
      )
      expect(first.join(' ')).toContain(
        'ready ' + String(key !== 'firstAttemptOutcomes'),
      )
      await user.selectOptions(
        card.getByLabelText('Performance evidence scope'),
        'recallQuality',
      )
      const recall = await collectRows(
        user,
        card,
        'Performance Evidence exact values',
        'Next Performance rows',
      )
      expect(recall.join(' ')).toContain(
        'ready ' + String(key !== 'recallQuality'),
      )
    },
  )

  it('preserves full exact selected-activity seconds independently of score population', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(createAnalyticsSummary())
    renderAnalyticsScreen()
    const card = await openEvidence(user, 'activity')
    expect(
      card.getByText(
        'All retained selected-period assessments, independent of Performance population.',
      ),
    ).toBeVisible()
    const evidence = await collectRows(
      user,
      card,
      'Performance Evidence exact values',
      'Next Performance rows',
    )
    expect(evidence.join(' ')).toContain(
      'Exact recorded successful seconds 5400',
    )
    for (const [key, value] of Object.entries(
      baseAnalyticsSummary().activity,
    )) {
      expect(evidence.join(' ')).toContain(key)
      expect(evidence.join(' ')).toContain(String(value))
    }
  })

  it('renders unavailable paired Recall inside its card while measured zero headlines remain visible', async () => {
    const summary = createSerializedAnalyticsSummary()
    vi.mocked(sendMessage).mockResolvedValueOnce(summary)
    renderAnalyticsScreen()
    const recall = within(await screen.findByRole('region', { name: 'Recall' }))
    expect(
      recall.getByText(
        'No repeat reviews have a valid rating and reconstructed FSRS estimate. Initial reviews build memory for later comparisons.',
      ),
    ).toBeVisible()
    expect(
      within(screen.getByLabelText('Questions solved metric')).getByText('0'),
    ).toBeVisible()
    expect(
      within(screen.getByLabelText('Recorded solve time metric')).getByText(
        '0m',
      ),
    ).toBeVisible()
  })

  it.each([30, 90, 'all'] as const)(
    'keeps paired Recall, current snapshots and both workload frames independent for %s',
    async (range) => {
      const user = userEvent.setup()
      const input = { asOf: new Date('2026-01-15T12:00:00Z'), timeZone: 'UTC' }
      const timeFrame = buildAnalyticsHistoryTimeFrame({
        ...input,
        selection: range,
        history: [{ reviewedAt: new Date('2024-05-14T12:00:00Z') }],
      })
      const pairedFrame = buildAnalyticsHistoryTimeFrame({
        ...input,
        selection: range,
        history: [{ reviewedAt: new Date('2026-01-14T12:00:00Z') }],
      })
      const summary = createSerializedAnalyticsSummary({ range, timeFrame })
      summary.views.observedRecallVsFsrs = {
        ...summary.views.observedRecallVsFsrs,
        timeFrame: pairedFrame,
        rows: [
          {
            id: '2026-01-14',
            bucketStart: '2026-01-14',
            bucketEnd: '2026-01-14',
            isPartial: false,
            recalledCount: 3,
            pairedReviews: 4,
            observedRecall: 0.75,
            fsrsEstimate: 0.8,
            difference: 0.75 - 0.8,
            provenance: 'reconstructed',
            evidence: 'measured',
          },
        ],
      }
      vi.mocked(sendMessage).mockResolvedValueOnce(summary)
      renderAnalyticsScreen(range)
      expect(await screen.findByTestId('recall-frame')).toHaveTextContent(
        'Paired 01/14–01/15',
      )
      expect(
        screen.getByText(
          range === 'all'
            ? /Range: All time/
            : new RegExp(`Range: ${range} days`),
        ),
      ).toBeVisible()
      expect(screen.getByText('Daily overdue · last 30 days')).toBeVisible()
      expect(screen.getByText('Scheduled reviews · next 14 days')).toBeVisible()
      const upcoming = within(
        screen.getByRole('region', { name: 'Upcoming reviews' }),
      )
      await user.click(
        upcoming.getByRole('button', { name: 'Upcoming Details' }),
      )
      await user.selectOptions(
        upcoming.getByLabelText('Upcoming detail section'),
        'summary',
      )
      const upcomingRows = await collectRows(
        user,
        upcoming,
        'Upcoming Summary exact values',
        'Next Upcoming rows',
      )
      expect(upcomingRows.join(' ')).toContain('2026-01-15 through 2026-01-28')
      const signals = within(
        screen.getByRole('region', { name: 'Memory signals' }),
      )
      await user.click(
        signals.getByRole('button', { name: 'Memory Signals Details' }),
      )
      await user.selectOptions(
        signals.getByLabelText('Memory Signals detail section'),
        'scope',
      )
      const scopeCopy: string[] = []
      for (let page = 0; page < 2; page++) {
        scopeCopy.push(
          ...signals
            .getAllByRole('paragraph')
            .map((node) => node.textContent ?? ''),
        )
        const next = signals.getByRole('button', {
          name: 'Next Memory Signals scope pages',
        })
        if (!next.hasAttribute('disabled')) await user.click(next)
      }
      expect(scopeCopy.join(' ')).toContain(
        'Current model estimates are independent of selected historical range',
      )
      expect(scopeCopy.join(' ')).toContain(input.asOf.toISOString())
    },
  )

  it('states the available young calendar history without changing the selection', async () => {
    const timeFrame = buildAnalyticsHistoryTimeFrame({
      asOf: new Date('2026-01-15T12:00:00Z'),
      selection: 30,
      timeZone: 'UTC',
      history: [{ reviewedAt: new Date('2026-01-04T12:00:00Z') }],
    })
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createSerializedAnalyticsSummary({ timeFrame }),
    )
    renderAnalyticsScreen()
    expect(
      await screen.findByText(/12 days of available history/),
    ).toHaveTextContent('Range: 30 days')
  })
})

async function openEvidence(
  user: ReturnType<typeof userEvent.setup>,
  scope = 'requested',
) {
  const card = within(
    await screen.findByRole('region', { name: 'Performance' }),
  )
  await user.click(card.getByRole('button', { name: 'Performance Details' }))
  await user.selectOptions(
    card.getByLabelText('Performance detail section'),
    'evidence',
  )
  await user.selectOptions(
    card.getByLabelText('Performance evidence scope'),
    scope,
  )
  return card
}

async function collectRows(
  user: ReturnType<typeof userEvent.setup>,
  card: Pick<typeof screen, 'getByRole'>,
  label: string,
  nextName: string,
) {
  const rows: string[] = []
  for (let count = 0; count < 100; count++) {
    rows.push(
      ...within(card.getByRole('table', { name: label }))
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          Array.from(row.children)
            .map((cell) => cell.textContent ?? '')
            .join(' '),
        ),
    )
    const next = card.getByRole('button', { name: nextName })
    if (next.hasAttribute('disabled')) return rows
    await user.click(next)
  }
  throw new Error('Evidence pagination did not reach its final page')
}

function renderAnalyticsScreen(range?: 30 | 90 | 'all') {
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
