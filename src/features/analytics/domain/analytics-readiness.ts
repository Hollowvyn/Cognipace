import { getAnalyticsRangePolicy } from './analytics-range-policy'
import type { AnalyticsHistoryGrouping } from './analytics-history-window'

export type ReadinessFailure =
  | 'no-evidence'
  | 'insufficient-span'
  | 'insufficient-assessments'
  | 'insufficient-active-buckets'
  | 'gap-too-long'
  | 'too-many-gaps'

export interface AnalyticsReadinessInput {
  requestedDays: number | null
  grouping?: AnalyticsHistoryGrouping | null | undefined
  availableDays?: number | undefined
  evidenceCounts: readonly number[]
  bucketKeys: readonly string[]
}

export interface AnalyticsReadiness {
  ready: boolean
  requestedDays: number | null
  policyDays?: number | undefined
  grouping?: AnalyticsHistoryGrouping | null | undefined
  availableDays?: number | undefined
  bucketDays: number
  requestedBuckets: number
  effectiveBuckets: number
  effectiveStart: string | null
  assessments: number
  minimumAssessments: number
  activeBuckets: number
  minimumActiveBuckets: number
  longestGap: number
  maximumGap: number
  gapRuns: number
  maximumGapRuns: number
  failingReasons: ReadinessFailure[]
}

export function calculateAnalyticsReadiness({
  requestedDays,
  evidenceCounts,
  bucketKeys,
  grouping,
  availableDays,
}: AnalyticsReadinessInput): AnalyticsReadiness {
  validateEvidenceInput(evidenceCounts, bucketKeys)

  const policyDays =
    requestedDays === null
      ? Math.max(1, Math.min(availableDays ?? 0, 90))
      : requestedDays
  const policy = getAnalyticsRangePolicy(requestedDays ?? 90)
  const bucketDays =
    grouping?.unit === 'day'
      ? grouping.step
      : grouping?.unit === 'week'
        ? 7
        : policy.bucketDays
  const maximumGapBuckets = policy.maximumGapBuckets
  const firstEvidence = evidenceCounts.findIndex((count) => count > 0)
  const effectiveCounts =
    firstEvidence === -1 ? [] : evidenceCounts.slice(firstEvidence)
  const effectiveBuckets = effectiveCounts.length
  const assessments = effectiveCounts.reduce((sum, count) => sum + count, 0)
  const activeBuckets = effectiveCounts.filter((count) => count > 0).length
  const { longestGap, gapRuns } = measureGaps(effectiveCounts)
  const effectiveStart =
    firstEvidence === -1 ? null : (bucketKeys[firstEvidence] ?? null)
  const minimumAssessments = Math.ceil(
    Math.max(12, policyDays * 0.5, Math.min(policyDays, 30) * 0.8),
  )
  const minimumActiveBuckets = Math.ceil(
    coverage(policyDays) * effectiveBuckets,
  )
  const minimumEffectiveBuckets = getMinimumEffectiveBuckets(bucketKeys.length)
  const maximumGapRuns = Math.max(1, Math.ceil(effectiveBuckets * 0.2))

  const failingReasons: ReadinessFailure[] = []
  if (effectiveBuckets === 0) failingReasons.push('no-evidence')
  if (effectiveBuckets < minimumEffectiveBuckets) {
    failingReasons.push('insufficient-span')
  }
  if (assessments < minimumAssessments) {
    failingReasons.push('insufficient-assessments')
  }
  if (activeBuckets < minimumActiveBuckets) {
    failingReasons.push('insufficient-active-buckets')
  }
  if (longestGap > maximumGapBuckets) {
    failingReasons.push('gap-too-long')
  }
  if (gapRuns > maximumGapRuns) failingReasons.push('too-many-gaps')

  return {
    ready: failingReasons.length === 0,
    requestedDays,
    ...(grouping !== undefined ? { grouping } : {}),
    ...(availableDays !== undefined ? { availableDays } : {}),
    ...(requestedDays === null ? { policyDays } : {}),
    bucketDays,
    requestedBuckets: bucketKeys.length,
    effectiveBuckets,
    effectiveStart,
    assessments,
    minimumAssessments,
    activeBuckets,
    minimumActiveBuckets,
    longestGap,
    maximumGap: maximumGapBuckets,
    gapRuns,
    maximumGapRuns,
    failingReasons,
  }
}

export function findRichestReadyRange(
  ranges: readonly { range: number; ready: boolean }[],
): number | null {
  return (
    ranges
      .filter(({ ready }) => ready)
      .sort((left, right) => right.range - left.range)[0]?.range ?? null
  )
}

export function getMinimumEffectiveBuckets(requestedBuckets: number): number {
  return Math.ceil(requestedBuckets * 0.6)
}

function validateEvidenceInput(
  evidenceCounts: readonly number[],
  bucketKeys: readonly string[],
): void {
  if (evidenceCounts.length !== bucketKeys.length) {
    throw new RangeError('Analytics evidence keys and counts must align.')
  }
  if (
    evidenceCounts.some((count) => !Number.isSafeInteger(count) || count < 0)
  ) {
    throw new RangeError(
      'Analytics evidence counts must be non-negative integers.',
    )
  }
}

function coverage(requestedDays: number): number {
  return Math.min(
    0.8,
    Math.max(0.55, 0.76 - 0.06 * Math.log2(requestedDays / 7)),
  )
}

function measureGaps(counts: readonly number[]): {
  longestGap: number
  gapRuns: number
} {
  let longestGap = 0
  let gapRuns = 0
  let currentGap = 0

  for (const count of counts) {
    if (count === 0) {
      currentGap += 1
      continue
    }

    if (currentGap > 0) {
      gapRuns += 1
      longestGap = Math.max(longestGap, currentGap)
      currentGap = 0
    }
  }

  if (currentGap > 0) {
    gapRuns += 1
    longestGap = Math.max(longestGap, currentGap)
  }

  return { longestGap, gapRuns }
}
