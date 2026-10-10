import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'
import {
  useAnalyticsSummary,
  useUpdateAnalyticsTargets,
} from '../api/analytics-api'
import type {
  AnalyticsRange,
  SerializedAnalyticsSummary,
} from '../api/analytics-contracts'
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

export function AnalyticsScreen({
  range = 30,
}: {
  range?: AnalyticsRange | undefined
}) {
  const query = useAnalyticsSummary(range)

  if (query.isPending) {
    return (
      <Surface>
        <InlineStatus>Loading analytics...</InlineStatus>
      </Surface>
    )
  }
  if (query.isError || !query.data) {
    return (
      <Surface className="grid gap-3">
        <InlineStatus role="alert" tone="danger">
          Failed to load Analytics.
        </InlineStatus>
        <div>
          <Button
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
      </Surface>
    )
  }

  return <AnalyticsComposition data={query.data} />
}

function AnalyticsComposition({ data }: { data: SerializedAnalyticsSummary }) {
  const updateTargets = useUpdateAnalyticsTargets()
  const targets = data.views.problemSolving.targets
  const reportContext = {
    asOf: data.timeFrame.asOf,
    timeZone: data.timeFrame.timeZone,
    timeZoneFallback: data.timeFrame.timeZoneFallback,
  }

  return (
    <div className="cp-analytics-page flex min-w-0 flex-col gap-4">
      <AnalyticsScopeMetadata data={data} />
      <AnalyticsMetricRow summary={data} />
      <div className="cp-analytics-card-grid">
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
      </div>
    </div>
  )
}

function AnalyticsScopeMetadata({
  data,
}: {
  data: SerializedAnalyticsSummary
}) {
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
