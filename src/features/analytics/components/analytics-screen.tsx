import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  useAnalyticsSummary,
  useUpdateAnalyticsTargets,
} from '../api/analytics-api'
import type {
  AnalyticsRange,
  SerializedAnalyticsSummary,
} from '../api/analytics-contracts'
import { AnalyticsChartPanel } from './analytics-chart-panel'
import { AnalyticsMetricRow } from './analytics-metric-row'
import { PerformanceCard } from './cards/performance-card'
import { TimeTargetCard } from './cards/time-target-card'
import { PracticeCard } from './cards/practice-card'
import { TopicsCard } from './cards/topics-card'
import { RecallCard } from './cards/recall-card'
import { MemoryStrengthCard } from './cards/memory-strength-card'
import { RetentionCard } from './cards/retention-card'
import { MemorySignalsCard } from './cards/memory-signals-card'
import { BacklogCard } from './cards/backlog-card'
import { UpcomingCard } from './cards/upcoming-card'

type ReportState = 'loading' | 'error' | 'ready' | 'updating' | 'refresh-failed'

const reportMessages: Record<ReportState, string> = {
  loading: 'Loading analytics...',
  error: 'Failed to load Analytics.',
  ready: 'Report ready.',
  updating: 'Updating analytics...',
  'refresh-failed': 'Refresh failed. Showing the last report.',
}

export function AnalyticsScreen({
  range = 30,
}: {
  range?: AnalyticsRange | undefined
}) {
  const query = useAnalyticsSummary(range)
  // The hook's range/timezone query key owns compatibility; placeholder data
  // must never give a new request the previous report's values or dates.
  const data =
    query.data?.range === range && !query.isPlaceholderData
      ? query.data
      : undefined
  const state: ReportState = data
    ? query.isFetching
      ? 'updating'
      : query.isError
        ? 'refresh-failed'
        : 'ready'
    : query.isError
      ? 'error'
      : 'loading'
  const retry = state === 'error' || state === 'refresh-failed'

  return (
    <div
      className="cp-analytics-page flex min-w-0 flex-col gap-4"
      data-report-state={state}
    >
      <div className="cp-analytics-report-metadata">
        <AnalyticsScopeMetadata data={data} range={range} />
        <div className="cp-analytics-report-status">
          <p
            role="status"
            aria-live="polite"
            aria-label="Analytics report status"
          >
            {reportMessages[state]}
          </p>
          <Button
            aria-hidden={!retry}
            tabIndex={retry ? undefined : -1}
            style={{ visibility: retry ? 'visible' : 'hidden' }}
            disabled={!retry}
            onClick={() => {
              void query.refetch()
            }}
            size="sm"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" />
            Retry
          </Button>
        </div>
      </div>
      <AnalyticsMetricRow
        summary={data}
        state={state === 'error' ? 'error' : 'loading'}
      />
      <div className="cp-analytics-card-grid">
        {data ? (
          <AnalyticsCards data={data} />
        ) : (
          <AnalyticsPendingCards failed={state === 'error'} />
        )}
      </div>
    </div>
  )
}

function AnalyticsCards({ data }: { data: SerializedAnalyticsSummary }) {
  const updateTargets = useUpdateAnalyticsTargets()
  const targets = data.views.problemSolving.targets
  const reportContext = {
    asOf: data.timeFrame.asOf,
    timeZone: data.timeFrame.timeZone,
    timeZoneFallback: data.timeFrame.timeZoneFallback,
  }

  return (
    <>
      <PerformanceCard
        view={data.views.problemSolving}
        timeFrame={data.timeFrame}
        onSaveTarget={updateTargets.mutateAsync}
        historicalReadiness={data.historicalReadiness}
        activity={data.activity}
      />
      <TimeTargetCard
        view={data.views.problemSolving}
        timeFrame={data.timeFrame}
      />
      <PracticeCard
        view={data.views.practiceRhythm}
        ratingsView={data.views.ratingsMix}
        timeFrame={data.timeFrame}
        targets={targets}
        onSaveTarget={updateTargets.mutateAsync}
        practiceReadiness={data.historicalReadiness.practiceRhythm}
        ratingsReadiness={data.historicalReadiness.ratingsMix}
      />
      <TopicsCard
        view={data.views.topicPerformance}
        timeFrame={data.timeFrame}
        targets={targets}
        onSaveTarget={updateTargets.mutateAsync}
      />
      <RecallCard
        view={data.views.observedRecallVsFsrs}
        targets={targets}
        onSaveTarget={updateTargets.mutateAsync}
        readiness={data.historicalReadiness.recallQuality}
      />
      <MemoryStrengthCard
        view={data.views.memoryStrength}
        timeFrame={data.timeFrame}
        readiness={data.historicalReadiness.stability}
      />
      <RetentionCard
        view={data.views.retentionMap}
        timeFrame={data.timeFrame}
      />
      <MemorySignalsCard
        view={data.views.memorySignals}
        reportContext={reportContext}
      />
      <BacklogCard view={data.views.overdueBacklog} />
      <UpcomingCard
        view={data.views.upcomingReviewLoad}
        reportContext={reportContext}
      />
    </>
  )
}

const pendingCards = [
  [
    'performance',
    'Performance',
    'Weighted assessment score',
    'Performance',
    'Selected period',
  ],
  [
    'time-target',
    'Time vs target',
    'Median time by difficulty',
    'Time',
    'Selected period',
  ],
  [
    'practice',
    'Practice',
    'Rating mix and completed reviews',
    'Practice',
    'Selected period',
  ],
  [
    'topics',
    'Topic performance',
    'Weighted scores across all assessments',
    'Topics',
    'Selected period',
  ],
  [
    'recall',
    'Recall',
    'Observed recall and FSRS estimate',
    'Recall',
    'Selected paired history',
  ],
  [
    'memory-strength',
    'Memory strength',
    'Post-review FSRS stability',
    'Memory strength',
    'Selected period',
  ],
  [
    'retention-map',
    'Retention map',
    'Current FSRS memory landscape',
    'Retention Map',
    'Current state',
  ],
  [
    'memory-signals',
    'Memory signals',
    'Problems that need attention',
    'Memory Signals',
    'Current state',
  ],
  [
    'backlog',
    'Overdue backlog',
    'Daily overdue · last 30 days',
    'Backlog',
    'Last 30 days',
  ],
  [
    'upcoming',
    'Upcoming reviews',
    'Scheduled reviews · next 14 days',
    'Upcoming',
    'Next 14 days',
  ],
] as const

function AnalyticsPendingCards({ failed }: { failed: boolean }) {
  return pendingCards.map(([id, title, description, control, scope]) => (
    <AnalyticsChartPanel
      compact
      id={`analytics-${id}`}
      key={id}
      title={title}
      description={description}
      headerAction={
        <Button
          disabled
          aria-label={`${control} Details`}
          className="cp-analytics-card-control"
          size="sm"
          variant="ghost"
        >
          {id === 'performance' ? 'Breakdown' : 'Details'}
        </Button>
      }
      hero={
        <strong className="text-2xl font-semibold text-muted-foreground">
          —
        </strong>
      }
      footer={<span>{scope} · awaiting report</span>}
    >
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        {failed ? 'Report unavailable' : 'Awaiting report'}
      </div>
    </AnalyticsChartPanel>
  ))
}

function AnalyticsScopeMetadata({
  data,
  range,
}: {
  data?: SerializedAnalyticsSummary | undefined
  range: AnalyticsRange
}) {
  if (!data)
    return (
      <p className="cp-analytics-scope">
        Range: {range === 'all' ? 'All time' : `${range} days`} · Period:
        awaiting report · Time zone:{' '}
        {Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'} · As of:
        awaiting report
      </p>
    )
  const finalBucketEndKey = data.timeFrame.buckets.at(-1)?.endKey
  return (
    <p className="cp-analytics-scope">
      Range: {data.range === 'all' ? 'All time' : `${data.range} days`}
      {finalBucketEndKey
        ? ` · Period: ${formatScopeDateTime(data.timeFrame.periodStart, data.timeFrame.timeZone)}–${formatScopeDateKey(finalBucketEndKey)}`
        : ''}
      {data.timeFrame.history
        ? ` · ${data.timeFrame.history.availableDays} days of available history`
        : ''}
      {' · Time zone: '}
      {data.timeFrame.timeZone}
      {data.timeFrame.timeZoneFallback ? ' (fallback)' : ''}
      {' · As of: '}
      {formatScopeAsOf(data.timeFrame.asOf, data.timeFrame.timeZone)}
    </p>
  )
}

function formatScopeDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: '2-digit',
  }).format(new Date(value))
}
function formatScopeDateKey(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
    year: '2-digit',
  }).format(new Date(`${value}T00:00:00.000Z`))
}
function formatScopeAsOf(value: string, timeZone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date)
}
