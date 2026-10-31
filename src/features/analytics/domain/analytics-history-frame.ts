import {
  buildAnalyticsHistoryBounds,
  buildAnalyticsHistoryBucketPlan,
  type AnalyticsHistorySelection,
} from './analytics-history-window'
import type { AnalyticsTimeFrame } from './analytics-time'

/** Adapt the shared calendar policy to the runtime frame without changing bounds. */
export function buildAnalyticsHistoryTimeFrame(input: {
  selection: AnalyticsHistorySelection
  asOf: Date
  timeZone: string
  history: readonly { reviewedAt: Date }[]
}): AnalyticsTimeFrame {
  const history = buildAnalyticsHistoryBounds(input)
  const plan = buildAnalyticsHistoryBucketPlan(history)
  return {
    asOf: history.asOf,
    timeZone: history.timeZone,
    timeZoneFallback: history.timeZoneFallback,
    requestedDays: history.nominalDays,
    periodStart: history.displayStart ?? history.periodEnd,
    periodEnd: history.periodEnd,
    buckets: plan.buckets,
    history,
    grouping: plan.grouping,
  }
}
