import { RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

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
import { AnalyticsChartPanel } from './analytics-chart-panel'
import { AnalyticsMetricRow } from './analytics-metric-row'
import { AnalyticsReadinessState } from './analytics-readiness-state'
import { AnalyticsTargetEditor } from './analytics-target-editor'
import {
  MemoryStrengthView,
  ObservedRecallVsFsrsView,
  PracticeRhythmView,
  RatingsMixView,
  TopicPerformanceView,
} from './historical-views'
import { MemorySignalsView, RetentionMapView } from './current-state-views'
import {
  RecentOverdueBacklogView,
  UpcomingReviewLoadView,
} from './workload-views'

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

  const { data } = query

  return (
    <div className="flex min-w-0 flex-col gap-[var(--cp-surface-gap)]">
      <div className="w-full max-w-[64rem]">
        <AnalyticsMetricRow summary={data} />
      </div>
      <AnalyticsScopeMetadata data={data} />
      {!data.historicalReadiness.requested.ready ? (
        <AnalyticsReadinessState
          compact
          readiness={data.historicalReadiness.requested}
          recommendedRange={data.historicalReadiness.recommendedRange}
        />
      ) : null}
      {data.historicalReadiness.requested.ready &&
      hasTrimmedLeadingHistory(data.historicalReadiness.requested) ? (
        <AnalyticsReadinessState
          compact
          readiness={data.historicalReadiness.requested}
          recommendedRange={null}
        />
      ) : null}
      <AnalyticsHistoricalStory data={data} />
      <AnalyticsCurrentStateStory data={data} />
      <AnalyticsWorkloadStory data={data} />
    </div>
  )
}

function AnalyticsWorkloadStory({
  data,
}: {
  data: SerializedAnalyticsSummary
}) {
  return (
    <div className="grid w-full min-w-0 max-w-[64rem] gap-4 lg:grid-cols-2">
      <AnalyticsChartPanel
        description="Daily local overdue counts reconstructed from known persisted FSRS review intervals and current card state. Unknown days are deliberately not estimated."
        id="recent-overdue-backlog"
        question="Is my overdue backlog staying at an acceptable level instead of accumulating?"
        title="Recent Overdue Backlog"
      >
        <RecentOverdueBacklogView view={data.views.overdueBacklog} />
      </AnalyticsChartPanel>
      <AnalyticsChartPanel
        description="A fixed local-date schedule for active, non-suspended FSRS cards due today and over the next 13 days."
        id="upcoming-review-load"
        question="What review work is currently scheduled for the next 14 days?"
        title="Upcoming Review Load"
      >
        <UpcomingReviewLoadView view={data.views.upcomingReviewLoad} />
      </AnalyticsChartPanel>
    </div>
  )
}

function AnalyticsCurrentStateStory({
  data,
}: {
  data: SerializedAnalyticsSummary
}) {
  return (
    <div className="grid w-full min-w-0 max-w-[64rem] gap-4">
      <AnalyticsChartPanel
        description="Current FSRS retrievability and total target-crossing duration for active reviewed problems. This is model-estimated memory health, not observed recall or a due queue."
        id="retention-map"
        question="Which active memories are below target, and how durable are they?"
        title="Retention Map"
      >
        <RetentionMapView
          timeZone={data.timeFrame.timeZone}
          view={data.views.retentionMap}
        />
      </AnalyticsChartPanel>
      <AnalyticsChartPanel
        description="Current problems that are below recall target, overdue, or have low target-crossing durability."
        id="memory-signals"
        question="Which current problems need attention, and exactly why were they flagged?"
        title="Memory Signals by Problem"
      >
        <MemorySignalsView view={data.views.memorySignals} />
      </AnalyticsChartPanel>
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
    <p className="m-0 text-sm text-muted-foreground">
      Range: {data.range} days
      {finalBucketEndKey
        ? ` · Period: ${formatScopeDateTime(data.timeFrame.periodStart, data.timeFrame.timeZone)}–${formatScopeDateKey(finalBucketEndKey)}`
        : ''}{' '}
      · Time zone: {data.timeFrame.timeZone}
      {data.timeFrame.timeZoneFallback ? ' (fallback)' : ''} · As of:{' '}
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

function AnalyticsHistoricalStory({
  data,
}: {
  data: SerializedAnalyticsSummary
}) {
  const updateTargets = useUpdateAnalyticsTargets()
  const targets = {
    targetRecall: data.views.observedRecallVsFsrs.targetRecall,
    targetReviewSuccess: data.views.practiceRhythm.targetReviewSuccess,
  }
  return (
    <div className="cp-analytics-history grid min-w-0 gap-4">
      <PhaseTwoPanel
        historical
        description="Rating-derived recalled outcomes compared with reconstructed FSRS retrievability immediately before those exact reviews."
        id="observed-recall-vs-fsrs"
        question="How did recalled review outcomes compare with the FSRS estimate?"
        readiness={data.historicalReadiness.recallQuality}
        title="Observed Recall vs FSRS Estimate"
      >
        <ObservedRecallVsFsrsView
          targetControl={
            <AnalyticsTargetEditor
              targets={targets}
              metric="recall"
              onSave={updateTargets.mutateAsync}
            />
          }
          timeFrame={data.timeFrame}
          view={data.views.observedRecallVsFsrs}
        />
      </PhaseTwoPanel>

      <div className="cp-analytics-history-pair grid min-w-0 gap-4">
        <PhaseTwoPanel
          historical
          description="FSRS's reconstructed post-review estimate of how long the memories reviewed in each bucket may remain retrievable."
          id="memory-strength"
          question="Are your reviewed memories staying strong for longer?"
          readiness={data.historicalReadiness.stability}
          title="Memory Strength"
        >
          <MemoryStrengthView
            timeFrame={data.timeFrame}
            view={data.views.memoryStrength}
          />
        </PhaseTwoPanel>
        <PhaseTwoPanel
          historical
          description="Completed review volume and the Good + Easy share move together by time bucket; the relationship is association only."
          id="practice-rhythm"
          question="When you practiced more or less, how did Review Success move?"
          readiness={data.historicalReadiness.practiceRhythm}
          title="Practice Rhythm"
        >
          <PracticeRhythmView
            targetControl={
              <AnalyticsTargetEditor
                targets={targets}
                metric="reviewSuccess"
                onSave={updateTargets.mutateAsync}
              />
            }
            timeFrame={data.timeFrame}
            view={data.views.practiceRhythm}
          />
        </PhaseTwoPanel>
      </div>

      <div className="grid w-full min-w-0 max-w-[64rem] gap-4 lg:grid-cols-2">
        <PhaseTwoPanel
          historical
          description="The changing share of valid Again, Hard, Good, and Easy review ratings across the selected period."
          id="ratings-mix"
          question="How is the balance of your review ratings changing?"
          readiness={data.historicalReadiness.ratingsMix}
          title="Ratings Mix"
        >
          <RatingsMixView
            timeFrame={data.timeFrame}
            view={data.views.ratingsMix}
          />
        </PhaseTwoPanel>
        <PhaseTwoPanel
          description="Topics ranked by sufficiently sampled Good + Easy Review Success in the selected period; this is not a mastery score."
          id="topic-performance"
          question="Which sufficiently practiced topics had lower Review Success?"
          readiness={data.historicalReadiness.topics}
          showReadiness={false}
          title="Topic Performance"
        >
          <TopicPerformanceView
            selectedPeriod={`${data.range}-day selected period`}
            view={data.views.topicPerformance}
          />
        </PhaseTwoPanel>
      </div>
    </div>
  )
}

function PhaseTwoPanel({
  description,
  historical = false,
  id,
  question,
  readiness,
  showReadiness = true,
  title,
  children,
}: {
  description: string
  historical?: boolean
  id: string
  question: string
  readiness: SerializedAnalyticsSummary['historicalReadiness']['recallQuality']
  showReadiness?: boolean
  title: string
  children: ReactNode
}) {
  return (
    <AnalyticsChartPanel
      historical={historical}
      description={description}
      id={id}
      question={question}
      title={title}
    >
      {!historical && showReadiness && !readiness.ready ? (
        <AnalyticsReadinessState
          compact
          readiness={readiness}
          recommendedRange={null}
          title={title}
        />
      ) : null}
      {children}
      {historical && showReadiness && !readiness.ready ? (
        <div className="mt-3">
          <AnalyticsReadinessState
            compact
            readiness={readiness}
            recommendedRange={null}
            title={title}
          />
        </div>
      ) : null}
    </AnalyticsChartPanel>
  )
}

function hasTrimmedLeadingHistory(
  readiness: SerializedAnalyticsSummary['historicalReadiness']['requested'],
): boolean {
  return (
    readiness.effectiveStart !== null &&
    readiness.effectiveBuckets < readiness.requestedBuckets
  )
}
