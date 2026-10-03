import {
  buildAdaptivePercentageDomain,
  buildLogDurationDomain,
  type AnalyticsScale,
} from './analytics-scales'
import { getAnalyticsDateKey } from './analytics-time'

export type RetentionMapStatus = 'on-target' | 'watch' | 'needs-attention'
export interface RetentionMapStatusCounts {
  onTarget: number
  watch: number
  needsAttention: number
}
export type RetentionMapRegion =
  | 'strongest-position'
  | 'on-target-now'
  | 'near-target-more-durable'
  | 'watch-closely'
  | 'needs-attention'
  | 'highest-attention'

export interface CurrentStateAnalyticsInput {
  cardId: string
  slug: string
  title: string
  retrievability: number
  targetDurationDays: number | null
  dueAt: Date
  difficulty: number
  lapseCount: number
  lastReviewAt: Date | null
  suspended: boolean
}

export interface CurrentStatePresentationOptions {
  asOf: Date
  targetRetention: number
  timeZone: string
}

export interface CurrentStateAnalyticsViews {
  retentionMap: {
    rows: RetentionMapRow[]
    totalEligible: number
    statusCounts: RetentionMapStatusCounts
    recallScale: AnalyticsScale
    durationScale: AnalyticsScale
    targetRetention: number
  }
  memorySignals: {
    rows: MemorySignalRow[]
    totalQualifying: number
  }
}

export interface RetentionMapRow {
  rank: number
  slug: string
  title: string
  retrievability: number
  targetRetention: number
  targetGap: number
  targetDurationDays: number
  lastReviewedAt: string
  dueAt: string
  difficulty: number
  lapseCount: number
  status: RetentionMapStatus
  region: RetentionMapRegion
}

export interface MemorySignalRow {
  rank: number
  slug: string
  title: string
  reasons: MemorySignalReason[]
}

export interface MemorySignalReason {
  kind: 'below-recall' | 'overdue' | 'low-durability'
  label: string
}

export function buildCurrentStateAnalyticsViews(
  inputs: readonly CurrentStateAnalyticsInput[],
  options: CurrentStatePresentationOptions,
): CurrentStateAnalyticsViews {
  const candidates = inputs.filter(
    (input): input is CurrentStateAnalyticsInput & { lastReviewAt: Date } =>
      !input.suspended && input.lastReviewAt !== null,
  )
  const retentionRows = candidates.flatMap((input) => {
    if (!isRetentionMapEligible(input, options.targetRetention)) return []

    const status = retentionMapStatus(
      input.retrievability,
      options.targetRetention,
    )
    const targetDurationDays = input.targetDurationDays
    return [
      {
        slug: input.slug,
        title: input.title,
        retrievability: input.retrievability,
        targetRetention: options.targetRetention,
        targetGap: input.retrievability - options.targetRetention,
        targetDurationDays,
        lastReviewedAt: input.lastReviewAt.toISOString(),
        dueAt: input.dueAt.toISOString(),
        difficulty: input.difficulty,
        lapseCount: input.lapseCount,
        status,
        region: retentionMapRegion(status, targetDurationDays),
      },
    ]
  })
  const orderedRetentionRows = retentionRows.toSorted(compareRetentionRows)
  const retainedRetentionRows = orderedRetentionRows
    .slice(0, 30)
    .map((row, index) => ({ ...row, rank: index + 1 }))

  const signalRows = candidates
    .flatMap((input) => buildMemorySignalCandidate(input, options))
    .toSorted(compareMemorySignals)
    .slice(0, 25)
    .map((row, index) => ({ ...row, rank: index + 1 }))

  return {
    retentionMap: {
      rows: retainedRetentionRows,
      totalEligible: orderedRetentionRows.length,
      statusCounts: countRetentionStatuses(orderedRetentionRows),
      recallScale: percentageScale(
        orderedRetentionRows.map((row) => row.retrievability),
        [options.targetRetention, Math.max(0, options.targetRetention - 0.1)],
      ),
      durationScale: logScale(
        orderedRetentionRows.map((row) => row.targetDurationDays),
      ),
      targetRetention: options.targetRetention,
    },
    memorySignals: {
      rows: signalRows,
      totalQualifying: candidates.filter((input) =>
        hasMemorySignal(input, options),
      ).length,
    },
  }
}

export function retentionMapStatus(
  retrievability: number,
  targetRetention: number,
): RetentionMapStatus {
  if (retrievability >= targetRetention) return 'on-target'
  if (retrievability >= Math.max(0, targetRetention - 0.1)) return 'watch'
  return 'needs-attention'
}

function isRetentionMapEligible(
  input: CurrentStateAnalyticsInput,
  targetRetention: number,
): input is CurrentStateAnalyticsInput & {
  lastReviewAt: Date
  targetDurationDays: number
} {
  return (
    Number.isFinite(input.retrievability) &&
    input.retrievability >= 0 &&
    input.retrievability <= 1 &&
    Number.isFinite(targetRetention) &&
    targetRetention > 0 &&
    targetRetention < 1 &&
    input.targetDurationDays !== null &&
    Number.isFinite(input.targetDurationDays) &&
    input.targetDurationDays > 0
  )
}

function retentionMapRegion(
  status: RetentionMapStatus,
  targetDurationDays: number,
): RetentionMapRegion {
  const durable = targetDurationDays >= 7
  if (status === 'on-target') {
    return durable ? 'strongest-position' : 'on-target-now'
  }
  if (status === 'watch') {
    return durable ? 'near-target-more-durable' : 'watch-closely'
  }
  return durable ? 'needs-attention' : 'highest-attention'
}

function countRetentionStatuses(
  rows: readonly Omit<RetentionMapRow, 'rank'>[],
): RetentionMapStatusCounts {
  return rows.reduce<RetentionMapStatusCounts>(
    (counts, row) => {
      if (row.status === 'on-target') counts.onTarget += 1
      else if (row.status === 'watch') counts.watch += 1
      else counts.needsAttention += 1
      return counts
    },
    { onTarget: 0, watch: 0, needsAttention: 0 },
  )
}

function compareRetentionRows(
  left: Omit<RetentionMapRow, 'rank'>,
  right: Omit<RetentionMapRow, 'rank'>,
): number {
  return (
    retentionPriority(left) - retentionPriority(right) ||
    Math.min(0, left.targetGap) - Math.min(0, right.targetGap) ||
    left.targetDurationDays - right.targetDurationDays ||
    normalizedTitle(left.title).localeCompare(normalizedTitle(right.title))
  )
}

function retentionPriority(row: Omit<RetentionMapRow, 'rank'>): number {
  if (row.status === 'needs-attention') return 0
  if (row.status === 'watch') return 1
  return row.targetDurationDays < 7 ? 2 : 3
}

interface MemorySignalCandidate extends Omit<MemorySignalRow, 'rank'> {
  lane: 0 | 1 | 2
  targetShortfall: number
  overdueDays: number
  targetDurationDays: number | null
}

function buildMemorySignalCandidate(
  input: CurrentStateAnalyticsInput,
  options: CurrentStatePresentationOptions,
): MemorySignalCandidate[] {
  const belowRecall =
    Number.isFinite(input.retrievability) &&
    input.retrievability < options.targetRetention
  const overdue = isOverdueOnCalendarDate(
    input.dueAt,
    options.asOf,
    options.timeZone,
  )
  const lowDurability =
    input.targetDurationDays !== null &&
    Number.isFinite(input.targetDurationDays) &&
    input.targetDurationDays < 7
  if (!belowRecall && !overdue && !lowDurability) return []

  const overdueDays = overdue
    ? crossedLocalDays(input.dueAt, options.asOf, options.timeZone)
    : 0
  const reasons: MemorySignalReason[] = []
  if (belowRecall) {
    reasons.push({
      kind: 'below-recall',
      label: `Estimated recall ${formatPercent(input.retrievability)} · below FSRS target`,
    })
  }
  if (overdue) {
    reasons.push({
      kind: 'overdue',
      label: `Overdue · ${overdueDays}d`,
    })
  }
  if (lowDurability) {
    reasons.push({
      kind: 'low-durability',
      label: `Low durability · ${formatDays(input.targetDurationDays!)}`,
    })
  }

  return [
    {
      slug: input.slug,
      title: input.title,
      reasons,
      lane: belowRecall ? 0 : overdue ? 1 : 2,
      targetShortfall: belowRecall
        ? options.targetRetention - input.retrievability
        : 0,
      overdueDays,
      targetDurationDays: input.targetDurationDays,
    },
  ]
}

function hasMemorySignal(
  input: CurrentStateAnalyticsInput,
  options: CurrentStatePresentationOptions,
): boolean {
  return (
    (Number.isFinite(input.retrievability) &&
      input.retrievability < options.targetRetention) ||
    isOverdueOnCalendarDate(input.dueAt, options.asOf, options.timeZone) ||
    (input.targetDurationDays !== null &&
      Number.isFinite(input.targetDurationDays) &&
      input.targetDurationDays < 7)
  )
}

function compareMemorySignals(
  left: MemorySignalCandidate,
  right: MemorySignalCandidate,
): number {
  const laneDifference = left.lane - right.lane
  if (laneDifference !== 0) return laneDifference
  if (left.lane === 0) {
    return (
      right.targetShortfall - left.targetShortfall ||
      normalizedTitle(left.title).localeCompare(normalizedTitle(right.title))
    )
  }
  if (left.lane === 1) {
    return (
      right.overdueDays - left.overdueDays ||
      normalizedTitle(left.title).localeCompare(normalizedTitle(right.title))
    )
  }
  return (
    (left.targetDurationDays ?? Infinity) -
      (right.targetDurationDays ?? Infinity) ||
    normalizedTitle(left.title).localeCompare(normalizedTitle(right.title))
  )
}

function percentageScale(
  values: readonly number[],
  references: readonly number[],
): AnalyticsScale {
  const domain = buildAdaptivePercentageDomain(values, references)
  const [start, end] = domain
  const tickCount = 4
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) =>
    Number((start + ((end - start) * index) / tickCount).toFixed(2)),
  )
  return { domain, ticks }
}

function logScale(values: readonly number[]): AnalyticsScale {
  const domain = buildLogDurationDomain(values)
  const ticks: number[] = []
  for (let tick = domain[0]; tick <= domain[1]; tick *= 10) ticks.push(tick)
  return { domain, ticks }
}

function crossedLocalDays(start: Date, end: Date, timeZone: string): number {
  const startKey = getAnalyticsDateKey(start, timeZone)
  const endKey = getAnalyticsDateKey(end, timeZone)
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${endKey}T00:00:00.000Z`) -
        Date.parse(`${startKey}T00:00:00.000Z`)) /
        86_400_000,
    ),
  )
}

function isOverdueOnCalendarDate(
  dueAt: Date,
  asOf: Date,
  timeZone: string,
): boolean {
  return (
    getAnalyticsDateKey(dueAt, timeZone) < getAnalyticsDateKey(asOf, timeZone)
  )
}

function normalizedTitle(title: string): string {
  return title.trim().toLocaleLowerCase()
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatDays(value: number): string {
  return `${Number(value.toFixed(1))}d`
}
