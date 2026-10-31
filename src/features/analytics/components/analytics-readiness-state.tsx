import { InlineStatus } from '@/components/ui/inline-status'
import { Link } from '@tanstack/react-router'
import type {
  AnalyticsRange,
  AnalyticsReadiness,
  ReadinessFailure,
} from '@/features/analytics/api/analytics-contracts'
import { getMinimumEffectiveBuckets } from '../domain/analytics-readiness'

const readinessMessages: Record<
  ReadinessFailure,
  (readiness: AnalyticsReadiness) => string
> = {
  'no-evidence': () =>
    'Complete your first eligible review to begin this view.',
  'insufficient-span': (readiness) =>
    `${deficit(getMinimumEffectiveBuckets(readiness.requestedBuckets), readiness.effectiveBuckets)} more buckets of history needed.`,
  'insufficient-assessments': (readiness) =>
    `${deficit(readiness.minimumAssessments, readiness.assessments)} more assessments needed.`,
  'insufficient-active-buckets': (readiness) =>
    `${deficit(readiness.minimumActiveBuckets, readiness.activeBuckets)} more active buckets needed.`,
  'gap-too-long': () => 'A practice gap is longer than this trend can bridge.',
  'too-many-gaps': () => 'Practice is too fragmented for a reliable trend.',
}

export interface AnalyticsReadinessStateProps {
  readiness: AnalyticsReadiness
  recommendedRange: Extract<AnalyticsRange, number> | null
  compact?: boolean
  title?: string
}

export function getAnalyticsReadinessMessages(
  readiness: AnalyticsReadiness,
): string[] {
  const messages = readiness.failingReasons.map((reason) =>
    readinessMessages[reason](readiness),
  )
  if (
    readiness.effectiveStart !== null &&
    readiness.effectiveBuckets < readiness.requestedBuckets
  ) {
    messages.push(
      `Showing ${readiness.effectiveBuckets} ${bucketNoun(readiness)} of usable history from your selected ${readiness.requestedDays === null ? 'All time range' : `${readiness.requestedDays}-day range`}.`,
    )
  }
  return messages
}

export function AnalyticsReadinessState({
  readiness,
  recommendedRange,
  compact = false,
  title,
}: AnalyticsReadinessStateProps) {
  const failures = readiness.failingReasons.map((reason) => ({
    message: readinessMessages[reason](readiness),
    reason,
  }))
  const accessibleName = title
    ? `${title} readiness`
    : `${readiness.requestedDays === null ? 'All time' : `${readiness.requestedDays}-day`} analytics readiness`

  return (
    <InlineStatus
      aria-label={accessibleName}
      className={compact ? 'grid gap-1' : 'grid gap-2'}
      role="status"
      tone="warning"
    >
      {title && !compact ? (
        <h2 className="m-0 text-[length:var(--cp-section-title-font-size)] font-bold leading-tight text-foreground">
          {title}
        </h2>
      ) : null}
      {failures.length > 0 ? (
        <ul
          className={
            compact
              ? 'm-0 flex flex-wrap gap-x-3 gap-y-1 pl-4'
              : 'm-0 grid list-none gap-1 p-0'
          }
        >
          {failures.map(({ message, reason }) => (
            <li key={reason}>{message}</li>
          ))}
        </ul>
      ) : null}
      <EffectiveWindowCopy readiness={readiness} />
      {recommendedRange !== null ? (
        <Link
          className="w-fit font-medium text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          search={(previous) => ({ ...previous, range: recommendedRange })}
          to="/analytics"
        >
          Use ready {recommendedRange}-day view
        </Link>
      ) : null}
    </InlineStatus>
  )
}

function EffectiveWindowCopy({ readiness }: { readiness: AnalyticsReadiness }) {
  if (
    readiness.effectiveStart === null ||
    readiness.effectiveBuckets >= readiness.requestedBuckets
  ) {
    return null
  }

  return (
    <p className="m-0">
      Showing {readiness.effectiveBuckets} {bucketNoun(readiness)} of usable
      history from your selected{' '}
      {readiness.requestedDays === null
        ? 'All time range'
        : `${readiness.requestedDays}-day range`}
      .
    </p>
  )
}

function bucketNoun(readiness: AnalyticsReadiness): string {
  if (readiness.grouping?.unit === 'month')
    return readiness.grouping.step === 3 ? 'quarters' : 'months'
  if (readiness.grouping?.unit === 'year')
    return readiness.grouping.step === 1
      ? 'years'
      : `${readiness.grouping.step}-year intervals`
  if (readiness.bucketDays === 1) {
    return readiness.effectiveBuckets === 1 ? 'day' : 'days'
  }
  if (readiness.bucketDays === 7) {
    return readiness.effectiveBuckets === 1 ? 'week' : 'weeks'
  }
  return readiness.effectiveBuckets === 1
    ? 'adaptive bucket'
    : 'adaptive buckets'
}

function deficit(minimum: number, actual: number): number {
  return Math.max(0, minimum - actual)
}
