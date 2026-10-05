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
import { CombinedProblemOutcomesView } from './combined-problem-outcomes-view'
import {
  MemoryStrengthView,
  NewProblemSuccessView,
  ObservedRecallVsFsrsView,
  PracticeRatingsView,
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
        <RecentOverdueBacklogView
          timeFrame={data.timeFrame}
          view={data.views.overdueBacklog}
        />
      </AnalyticsChartPanel>
      <AnalyticsChartPanel
        description="A fixed local-date schedule for active, non-suspended FSRS cards due today and over the next 13 days."
        id="upcoming-review-load"
        question="What review work is currently scheduled for the next 14 days?"
        title="Upcoming Review Load"
      >
        <UpcomingReviewLoadView
          timeFrame={data.timeFrame}
          view={data.views.upcomingReviewLoad}
        />
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
        description="Every eligible reviewed problem, positioned by estimated recall now and memory durability. Durability is the total modeled interval from the latest review to crossing the FSRS scheduling target."
        id="retention-map"
        question="Which reviewed memories are weak now, and how durable are they?"
        title="Retention Map"
      >
        <RetentionMapView
          timeZone={data.timeFrame.timeZone}
          view={data.views.retentionMap}
        />
      </AnalyticsChartPanel>
      <AnalyticsChartPanel
        className="w-full max-w-[36rem]"
        compactBody
        description="Current problems with estimated recall below the FSRS target, an overdue review, or low target-crossing durability."
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
  const targets = data.views.problemSolving.targets
  const showRatingReadiness =
    (!data.historicalReadiness.ratingsMix.ready ||
      hasTrimmedLeadingHistory(data.historicalReadiness.ratingsMix)) &&
    JSON.stringify(data.historicalReadiness.ratingsMix) !==
      JSON.stringify(data.historicalReadiness.practiceRhythm)
  return (
    <div className="cp-analytics-history grid min-w-0 gap-4">
      <div className="cp-analytics-history-pair grid w-full min-w-0 max-w-[64rem] gap-4 lg:grid-cols-2">
        <PhaseTwoPanel
          historical
          description="Hard + Good + Easy and Good + Easy outcomes for first recorded problems across all difficulties, including Unknown. These are recorded assessments; hints and earlier exposure are unknown."
          id="new-problem-success"
          question="How are your first recorded outcomes changing overall?"
          readiness={data.historicalReadiness.firstAttemptOutcomes}
          title="New Problem Success"
        >
          <CombinedProblemOutcomesView
            onSaveTarget={updateTargets.mutateAsync}
            timeFrame={data.timeFrame}
            view={data.views.problemSolving}
          />
        </PhaseTwoPanel>
        <PhaseTwoPanel
          historical
          description="Rating-derived recalled outcomes on repeat reviews compared with reconstructed FSRS retrievability immediately before those exact reviews. First recorded reviews build memory for later comparisons."
          id="observed-recall-vs-fsrs"
          question="How did recalled repeat outcomes compare with the FSRS estimate?"
          readiness={data.historicalReadiness.recallQuality}
          title="Recall vs FSRS Estimate"
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
      </div>
      <PhaseTwoPanel
        historical
        description="Recorded outcomes and assessment time by current problem difficulty, with the full recorded difficulty mix. Choose new problems or follow-up practice; retained history cannot establish earlier exposure."
        id="problem-solving"
        question="How are recorded outcomes, time and difficulty mix changing?"
        readiness={data.historicalReadiness.firstAttemptOutcomes}
        showReadiness={false}
        title="Problem Solving"
      >
        <NewProblemSuccessView
          onSaveTarget={updateTargets.mutateAsync}
          timeFrame={data.timeFrame}
          view={data.views.problemSolving}
        />
      </PhaseTwoPanel>

      <PhaseTwoPanel
        historical
        description="Rating shares and completed review volume move together by time bucket. Good + Easy shows Review Success; the relationship is association only."
        id="practice-rhythm"
        question="How did your review ratings change with practice?"
        readiness={data.historicalReadiness.practiceRhythm}
        showReadiness={false}
        title="Practice Rhythm"
      >
        <PracticeRatingsView
          ratingsView={data.views.ratingsMix}
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
        {showRatingReadiness ? (
          <div className="mt-3 grid gap-1">
            <p className="m-0 text-xs font-medium text-muted-foreground">
              Rating composition evidence
            </p>
            <AnalyticsReadinessState
              compact
              readiness={data.historicalReadiness.ratingsMix}
              recommendedRange={null}
              title="Rating composition"
            />
          </div>
        ) : null}
        {!data.historicalReadiness.practiceRhythm.ready ? (
          <div className="mt-3 grid gap-1">
            {showRatingReadiness ? (
              <p className="m-0 text-xs font-medium text-muted-foreground">
                Practice Rhythm evidence
              </p>
            ) : null}
            <AnalyticsReadinessState
              compact
              readiness={data.historicalReadiness.practiceRhythm}
              recommendedRange={null}
              title="Practice Rhythm"
            />
          </div>
        ) : null}
      </PhaseTwoPanel>

      <div className="grid w-full min-w-0 max-w-[64rem] gap-4 lg:grid-cols-2">
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
          description="All sufficiently practiced topics, ranked from lowest to highest Good + Easy Review Success in the selected period."
          id="topic-performance"
          question="How does each practiced topic compare with your Review Success target?"
          readiness={data.historicalReadiness.topics}
          showReadiness={false}
          title="Topic Performance"
        >
          <TopicPerformanceView
            targetEditor={
              <AnalyticsTargetEditor
                targets={targets}
                metric="reviewSuccess"
                onSave={updateTargets.mutateAsync}
              />
            }
            targetReviewSuccess={data.views.practiceRhythm.targetReviewSuccess}
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
