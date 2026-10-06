import type {
  AnalyticsHistoryBounds,
  AnalyticsHistoryGrouping,
} from './analytics-history-window'

export type AnalyticsHistoricalRange = 14 | 30 | 90
export type PublicAnalyticsRange = 30 | 90 | 'all'

export interface AnalyticsTimeBucket {
  key: string
  start: string
  end: string
  startKey: string
  endKey: string
  isPartial: boolean
}

export interface AnalyticsTimeFrame {
  asOf: string
  timeZone: string
  timeZoneFallback: boolean
  requestedDays: AnalyticsHistoricalRange | null
  periodStart: string
  periodEnd: string
  buckets: AnalyticsTimeBucket[]
  history?: AnalyticsHistoryBounds | undefined
  grouping?: AnalyticsHistoryGrouping | null | undefined
}

/** Prior comparisons use nominal bounds even when display history is clipped. */
export function getAnalyticsPreviousPeriod(
  frame: AnalyticsTimeFrame,
): { start: Date; asOf: Date } | null {
  if (frame.history !== undefined)
    return frame.history.previous === null
      ? null
      : {
          start: new Date(frame.history.previous.start),
          asOf: new Date(frame.history.previous.asOf),
        }
  if (frame.requestedDays === null) return null
  return {
    start: shiftAnalyticsCalendarDays(
      new Date(frame.periodStart),
      -frame.requestedDays,
      frame.timeZone,
    ),
    asOf: shiftAnalyticsCalendarDays(
      new Date(frame.asOf),
      -frame.requestedDays,
      frame.timeZone,
    ),
  }
}

interface TimeZoneResolution {
  timeZone: string
  fallback: boolean
}

const historicalRanges: readonly AnalyticsHistoricalRange[] = [14, 30, 90]

export function resolveAnalyticsTimeZone(
  requested: string,
): TimeZoneResolution {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: requested }).format()
    return { timeZone: requested, fallback: false }
  } catch {
    return { timeZone: 'UTC', fallback: true }
  }
}

export function buildAnalyticsTimeFrame(input: {
  asOf: Date
  requestedDays: AnalyticsHistoricalRange
  timeZone: string
}): AnalyticsTimeFrame {
  assertValidAsOf(input.asOf)
  assertHistoricalRange(input.requestedDays)

  const resolvedTimeZone = resolveAnalyticsTimeZone(input.timeZone)
  const todayKey = getAnalyticsDateKey(input.asOf, resolvedTimeZone.timeZone)
  const firstKey = addAnalyticsCalendarDays(
    todayKey,
    -(input.requestedDays - 1),
  )
  const periodEndKey = addAnalyticsCalendarDays(todayKey, 1)

  return {
    asOf: input.asOf.toISOString(),
    timeZone: resolvedTimeZone.timeZone,
    timeZoneFallback: resolvedTimeZone.fallback,
    requestedDays: input.requestedDays,
    periodStart: getAnalyticsLocalDayStart(firstKey, resolvedTimeZone.timeZone),
    periodEnd: getAnalyticsLocalDayStart(
      periodEndKey,
      resolvedTimeZone.timeZone,
    ),
    buckets: buildHistoricalBuckets({
      requestedDays: input.requestedDays,
      firstKey,
      todayKey,
      timeZone: resolvedTimeZone.timeZone,
    }),
  }
}

export function buildForecastBounds(input: { asOf: Date; timeZone: string }): {
  start: string
  end: string
  todayKey: string
} {
  assertValidAsOf(input.asOf)

  const { timeZone } = resolveAnalyticsTimeZone(input.timeZone)
  const todayKey = getAnalyticsDateKey(input.asOf, timeZone)

  return {
    todayKey,
    start: getAnalyticsLocalDayStart(todayKey, timeZone),
    end: getAnalyticsLocalDayStart(
      addAnalyticsCalendarDays(todayKey, 14),
      timeZone,
    ),
  }
}

function buildHistoricalBuckets(input: {
  requestedDays: AnalyticsHistoricalRange
  firstKey: string
  todayKey: string
  timeZone: string
}): AnalyticsTimeBucket[] {
  if (input.requestedDays === 14) {
    return buildFixedWidthBuckets(input, 1)
  }

  if (input.requestedDays === 30) {
    return buildFixedWidthBuckets(input, 3)
  }

  return buildMondayWeekBuckets(input)
}

function buildFixedWidthBuckets(
  input: Pick<
    Parameters<typeof buildHistoricalBuckets>[0],
    'firstKey' | 'todayKey' | 'timeZone'
  >,
  width: number,
): AnalyticsTimeBucket[] {
  const buckets: AnalyticsTimeBucket[] = []
  let startKey = input.firstKey

  while (startKey <= input.todayKey) {
    const endKey = minDateKey(
      addAnalyticsCalendarDays(startKey, width - 1),
      input.todayKey,
    )
    buckets.push(createBucket(startKey, endKey, input.todayKey, input.timeZone))
    startKey = addAnalyticsCalendarDays(endKey, 1)
  }

  return buckets
}

function buildMondayWeekBuckets(
  input: Pick<
    Parameters<typeof buildHistoricalBuckets>[0],
    'firstKey' | 'todayKey' | 'timeZone'
  >,
): AnalyticsTimeBucket[] {
  const buckets: AnalyticsTimeBucket[] = []
  let startKey = input.firstKey

  while (startKey <= input.todayKey) {
    const daysUntilSunday = 6 - getMondayWeekday(startKey)
    const endKey = minDateKey(
      addAnalyticsCalendarDays(startKey, daysUntilSunday),
      input.todayKey,
    )
    buckets.push(createBucket(startKey, endKey, input.todayKey, input.timeZone))
    startKey = addAnalyticsCalendarDays(endKey, 1)
  }

  return buckets
}

function createBucket(
  startKey: string,
  endKey: string,
  todayKey: string,
  timeZone: string,
): AnalyticsTimeBucket {
  return {
    key: startKey,
    start: getAnalyticsLocalDayStart(startKey, timeZone),
    end: getAnalyticsLocalDayStart(
      addAnalyticsCalendarDays(endKey, 1),
      timeZone,
    ),
    startKey,
    endKey,
    isPartial: endKey === todayKey,
  }
}

export function getAnalyticsDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      if (
        part.type === 'year' ||
        part.type === 'month' ||
        part.type === 'day'
      ) {
        result[part.type] = part.value
      }
      return result
    }, {})

  return `${parts.year!}-${parts.month!}-${parts.day!}`
}

export function getAnalyticsLocalDayStart(
  dateKey: string,
  timeZone: string,
): string {
  const [year, month, day] = parseDateKey(dateKey)
  const wallTime = Date.UTC(year, month - 1, day)
  let instant = wallTime

  for (let attempts = 0; attempts < 3; attempts += 1) {
    const offset = getTimeZoneOffsetMilliseconds(new Date(instant), timeZone)
    const candidate = wallTime - offset

    if (candidate === instant) return new Date(candidate).toISOString()
    instant = candidate
  }

  return new Date(instant).toISOString()
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  const wholeSecondDate = new Date(Math.floor(date.getTime() / 1000) * 1000)
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(wholeSecondDate)
    .reduce<Record<string, string>>((result, part) => {
      if (
        part.type === 'year' ||
        part.type === 'month' ||
        part.type === 'day' ||
        part.type === 'hour' ||
        part.type === 'minute' ||
        part.type === 'second'
      ) {
        result[part.type] = part.value
      }
      return result
    }, {})

  return (
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ) - wholeSecondDate.getTime()
  )
}

export function addAnalyticsCalendarDays(
  dateKey: string,
  days: number,
): string {
  const [year, month, day] = parseDateKey(dateKey)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)

  return toDateKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  )
}

export function shiftAnalyticsCalendarDays(
  date: Date,
  days: number,
  timeZone: string,
): Date {
  const localParts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .reduce<Record<string, number>>((result, part) => {
      if (
        part.type === 'year' ||
        part.type === 'month' ||
        part.type === 'day' ||
        part.type === 'hour' ||
        part.type === 'minute' ||
        part.type === 'second'
      ) {
        result[part.type] = Number(part.value)
      }
      return result
    }, {})
  const targetKey = addAnalyticsCalendarDays(
    getAnalyticsDateKey(date, timeZone),
    days,
  )
  const [year, month, day] = parseDateKey(targetKey)
  const wallTime = Date.UTC(
    year,
    month - 1,
    day,
    localParts.hour,
    localParts.minute,
    localParts.second,
    date.getUTCMilliseconds(),
  )
  let instant = wallTime

  for (let attempts = 0; attempts < 3; attempts += 1) {
    const offset = getTimeZoneOffsetMilliseconds(new Date(instant), timeZone)
    const candidate = wallTime - offset

    if (candidate === instant) return new Date(candidate)
    instant = candidate
  }

  return new Date(instant)
}

function getMondayWeekday(dateKey: string): number {
  const [year, month, day] = parseDateKey(dateKey)
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

function minDateKey(left: string, right: string): string {
  return left <= right ? left : right
}

function parseDateKey(dateKey: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new RangeError('Analytics date keys must use YYYY-MM-DD.')

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const roundTrip = toDateKey(year, month, day)

  if (roundTrip !== dateKey) {
    throw new RangeError('Analytics date keys must be valid calendar dates.')
  }

  return [year, month, day]
}

function toDateKey(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day))
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function assertHistoricalRange(
  requestedDays: number,
): asserts requestedDays is AnalyticsHistoricalRange {
  if (!historicalRanges.includes(requestedDays as AnalyticsHistoricalRange)) {
    throw new RangeError('Analytics ranges must be 14, 30, or 90 days.')
  }
}

function assertValidAsOf(asOf: Date): void {
  if (!Number.isFinite(asOf.getTime())) {
    throw new RangeError('Analytics as-of must be a valid date.')
  }
}
