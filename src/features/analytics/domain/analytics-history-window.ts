import {
  addAnalyticsCalendarDays,
  getAnalyticsDateKey,
  getAnalyticsLocalDayStart,
  resolveAnalyticsTimeZone,
  shiftAnalyticsCalendarDays,
  type AnalyticsTimeBucket,
} from './analytics-time'

export type AnalyticsHistorySelection = 30 | 90 | 'all'

export interface AnalyticsHistoryBounds {
  selection: AnalyticsHistorySelection
  nominalDays: 30 | 90 | null
  asOf: string
  timeZone: string
  timeZoneFallback: boolean
  historyStart: string | null
  nominalStart: string | null
  nominalStartKey: string | null
  displayStart: string | null
  displayStartKey: string | null
  todayKey: string
  periodEnd: string
  availableDays: number
  previous: { start: string; asOf: string; periodEnd: string } | null
}

export function parseAnalyticsHistorySelection(
  value: unknown,
): AnalyticsHistorySelection {
  if (value === 'all') return 'all'
  if (value === 90 || value === '90') return 90
  return 30
}

export function buildAnalyticsHistoryBounds(input: {
  selection: AnalyticsHistorySelection
  asOf: Date
  timeZone: string
  history: readonly { reviewedAt: Date }[]
}): AnalyticsHistoryBounds {
  if (!Number.isFinite(input.asOf.getTime())) {
    throw new RangeError('Analytics as-of must be a valid date.')
  }
  if (![30, 90, 'all'].includes(input.selection)) {
    throw new RangeError('Analytics selection must be 30, 90, or all.')
  }

  const resolved = resolveAnalyticsTimeZone(input.timeZone)
  const todayKey = getAnalyticsDateKey(input.asOf, resolved.timeZone)
  let earliest: Date | null = null
  for (const event of input.history) {
    const timestamp = event.reviewedAt.getTime()
    if (!Number.isFinite(timestamp) || timestamp > input.asOf.getTime())
      continue
    if (earliest === null || timestamp < earliest.getTime()) {
      earliest = event.reviewedAt
    }
  }
  const historyKey =
    earliest === null ? null : getAnalyticsDateKey(earliest, resolved.timeZone)
  const nominalDays = input.selection === 'all' ? null : input.selection
  const nominalStartKey =
    nominalDays === null
      ? historyKey
      : addAnalyticsCalendarDays(todayKey, -(nominalDays - 1))
  const displayStartKey =
    historyKey === null || nominalStartKey === null
      ? null
      : historyKey > nominalStartKey
        ? historyKey
        : nominalStartKey
  const periodEndKey = addAnalyticsCalendarDays(todayKey, 1)
  const previous =
    nominalDays === null || nominalStartKey === null
      ? null
      : {
          start: getAnalyticsLocalDayStart(
            addAnalyticsCalendarDays(nominalStartKey, -nominalDays),
            resolved.timeZone,
          ),
          asOf: shiftAnalyticsCalendarDays(
            input.asOf,
            -nominalDays,
            resolved.timeZone,
          ).toISOString(),
          periodEnd: getAnalyticsLocalDayStart(
            nominalStartKey,
            resolved.timeZone,
          ),
        }

  return {
    selection: input.selection,
    nominalDays,
    asOf: input.asOf.toISOString(),
    timeZone: resolved.timeZone,
    timeZoneFallback: resolved.fallback,
    historyStart: earliest?.toISOString() ?? null,
    nominalStartKey,
    nominalStart:
      nominalStartKey === null
        ? null
        : getAnalyticsLocalDayStart(nominalStartKey, resolved.timeZone),
    displayStartKey,
    displayStart:
      displayStartKey === null
        ? null
        : getAnalyticsLocalDayStart(displayStartKey, resolved.timeZone),
    todayKey,
    periodEnd: getAnalyticsLocalDayStart(periodEndKey, resolved.timeZone),
    availableDays:
      displayStartKey === null
        ? 0
        : calendarOrdinal(todayKey) - calendarOrdinal(displayStartKey) + 1,
    previous,
  }
}

function calendarOrdinal(key: string): number {
  // UTC is a calendar index here, not the elapsed duration of a local day.
  return Date.parse(`${key}T00:00:00.000Z`) / 86_400_000
}

export type AnalyticsHistoryGrouping =
  | { unit: 'day'; step: 1 | 3 }
  | { unit: 'week'; step: 1 }
  | { unit: 'month'; step: 1 | 3 }
  | { unit: 'year'; step: number }

export interface AnalyticsHistoryBucketPlan {
  grouping: AnalyticsHistoryGrouping | null
  buckets: AnalyticsTimeBucket[]
}

export function buildAnalyticsHistoryBucketPlan(
  bounds: AnalyticsHistoryBounds,
): AnalyticsHistoryBucketPlan {
  if (bounds.displayStartKey === null) return { grouping: null, buckets: [] }
  const grouping = chooseGrouping(bounds)
  const anchor = bounds.nominalStartKey ?? bounds.displayStartKey
  return {
    grouping,
    buckets: buildCalendarBuckets(
      bounds.displayStartKey,
      bounds.todayKey,
      bounds.timeZone,
      grouping,
      anchor,
    ),
  }
}

export function buildAnalyticsBacklogTimeFrame(input: {
  asOf: Date
  timeZone: string
}): {
  asOf: string
  timeZone: string
  timeZoneFallback: boolean
  periodStart: string
  periodEnd: string
  buckets: AnalyticsTimeBucket[]
} {
  if (!Number.isFinite(input.asOf.getTime())) {
    throw new RangeError('Analytics as-of must be a valid date.')
  }
  const resolved = resolveAnalyticsTimeZone(input.timeZone)
  const today = getAnalyticsDateKey(input.asOf, resolved.timeZone)
  const start = addAnalyticsCalendarDays(today, -29)
  return {
    asOf: input.asOf.toISOString(),
    timeZone: resolved.timeZone,
    timeZoneFallback: resolved.fallback,
    periodStart: getAnalyticsLocalDayStart(start, resolved.timeZone),
    periodEnd: getAnalyticsLocalDayStart(
      addAnalyticsCalendarDays(today, 1),
      resolved.timeZone,
    ),
    buckets: buildCalendarBuckets(
      start,
      today,
      resolved.timeZone,
      {
        unit: 'day',
        step: 1,
      },
      start,
    ),
  }
}

function chooseGrouping(
  bounds: AnalyticsHistoryBounds,
): AnalyticsHistoryGrouping {
  if (bounds.availableDays <= 14) return { unit: 'day', step: 1 }
  if (bounds.availableDays <= 30) return { unit: 'day', step: 3 }
  if (bounds.selection !== 'all' || bounds.availableDays <= 365) {
    return { unit: 'week', step: 1 }
  }
  const start = bounds.displayStartKey!
  const end = bounds.todayKey
  if (monthIndex(end) - monthIndex(start) + 1 <= 60) {
    return { unit: 'month', step: 1 }
  }
  if (
    Math.floor(monthIndex(end) / 3) - Math.floor(monthIndex(start) / 3) + 1 <=
    60
  ) {
    return { unit: 'month', step: 3 }
  }
  let step = 1
  while (
    Math.floor(yearOf(end) / step) - Math.floor(yearOf(start) / step) + 1 >
    60
  ) {
    const base = 10 ** Math.floor(Math.log10(step))
    step =
      step / base === 1 ? base * 2 : step / base === 2 ? base * 5 : base * 10
  }
  return { unit: 'year', step }
}

function buildCalendarBuckets(
  first: string,
  today: string,
  timeZone: string,
  grouping: AnalyticsHistoryGrouping,
  anchor: string,
): AnalyticsTimeBucket[] {
  const result: AnalyticsTimeBucket[] = []
  let naturalStart = alignStart(first, grouping, anchor)
  const periodEnd = addAnalyticsCalendarDays(today, 1)
  while (naturalStart <= today) {
    const endExclusiveKey = nextBoundary(naturalStart, grouping, periodEnd)
    const startKey = naturalStart < first ? first : naturalStart
    const endKey = addAnalyticsCalendarDays(endExclusiveKey, -1)
    result.push({
      key: startKey,
      startKey,
      endKey,
      start: getAnalyticsLocalDayStart(startKey, timeZone),
      end: getAnalyticsLocalDayStart(endExclusiveKey, timeZone),
      isPartial: endKey === today,
    })
    naturalStart = endExclusiveKey
  }
  if (result.length > 60)
    throw new RangeError('Historical buckets must be bounded.')
  return result
}

function alignStart(
  key: string,
  grouping: AnalyticsHistoryGrouping,
  anchor: string,
): string {
  switch (grouping.unit) {
    case 'day':
      return addAnalyticsCalendarDays(
        anchor,
        Math.floor(
          (calendarOrdinal(key) - calendarOrdinal(anchor)) / grouping.step,
        ) * grouping.step,
      )
    case 'week': {
      const weekday = new Date(`${key}T00:00:00.000Z`).getUTCDay()
      return addAnalyticsCalendarDays(key, -((weekday + 6) % 7))
    }
    case 'month':
      return monthKey(
        Math.floor(monthIndex(key) / grouping.step) * grouping.step,
      )
    case 'year':
      return `${String(Math.floor(yearOf(key) / grouping.step) * grouping.step).padStart(4, '0')}-01-01`
  }
}

function nextBoundary(
  key: string,
  grouping: AnalyticsHistoryGrouping,
  periodEnd: string,
): string {
  // Clip calendar arithmetic before creating a key beyond the four-digit domain.
  switch (grouping.unit) {
    case 'day':
      return addAnalyticsCalendarDays(
        key,
        Math.min(
          grouping.step,
          calendarOrdinal(periodEnd) - calendarOrdinal(key),
        ),
      )
    case 'week':
      return addAnalyticsCalendarDays(
        key,
        Math.min(7, calendarOrdinal(periodEnd) - calendarOrdinal(key)),
      )
    case 'month': {
      const nextMonth = monthIndex(key) + grouping.step
      return nextMonth > monthIndex(periodEnd) ? periodEnd : monthKey(nextMonth)
    }
    case 'year': {
      const nextYear = yearOf(key) + grouping.step
      return nextYear > yearOf(periodEnd)
        ? periodEnd
        : `${String(nextYear).padStart(4, '0')}-01-01`
    }
  }
}

function yearOf(key: string): number {
  return Number(key.slice(0, 4))
}

function monthIndex(key: string): number {
  return yearOf(key) * 12 + Number(key.slice(5, 7)) - 1
}

function monthKey(index: number): string {
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}-01`
}
