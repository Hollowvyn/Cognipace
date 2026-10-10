import { Surface } from '@/components/ui/surface'
import type { SerializedAnalyticsSummary } from '../api/analytics-contracts'

export function AnalyticsMetricRow({
  summary,
}: {
  summary: SerializedAnalyticsSummary
}) {
  const activity = summary.activity
  const successKnown =
    activity.recordedAssessments === 0 ||
    activity.knownCorrectnessAssessments > 0
  const metrics = [
    {
      label: 'Review days',
      accessibleLabel: 'Review Days',
      value: activity.assessmentDays,
      caption: 'Days with recorded practice',
    },
    {
      label: 'Questions solved',
      value: activity.distinctSuccessfulProblems ?? 'Unavailable',
      caption: 'Unique questions marked correct',
    },
    {
      label: 'Observed correctness',
      value:
        activity.observedCorrectness === null
          ? 'Unavailable'
          : `${Math.round(activity.observedCorrectness * 100)}%`,
      caption: activity.knownCorrectnessAssessments
        ? `${activity.successfulAssessments} of ${activity.knownCorrectnessAssessments} assessed`
        : 'No recorded results yet',
    },
    {
      label: 'Recorded solve time',
      value:
        activity.successfulRecordedSeconds === null
          ? 'Unavailable'
          : formatSolveTime(activity.successfulRecordedSeconds),
      caption: successKnown
        ? `${activity.timedSuccessfulAssessments} of ${activity.successfulAssessments} successful attempts timed${activity.untimedSuccessfulAssessments ? ` · ${activity.untimedSuccessfulAssessments} untimed` : ''}`
        : 'No recorded results yet',
      exactValue:
        activity.successfulRecordedSeconds !== null
          ? `${activity.successfulRecordedSeconds} recorded seconds`
          : undefined,
    },
  ]

  return (
    <div
      className="cp-analytics-summary-grid"
      role="group"
      aria-label="Selected period summary"
    >
      {metrics.map((metric) => (
        <Surface
          key={metric.label}
          aria-label={`${metric.accessibleLabel ?? metric.label} metric`}
          className="cp-analytics-summary-card"
        >
          <h2>{metric.label}</h2>
          <strong title={metric.exactValue}>{metric.value}</strong>
          <p>{metric.caption}</p>
        </Surface>
      ))}
    </div>
  )
}

function formatSolveTime(seconds: number): string {
  if (seconds > 0 && seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}
