/**
 * Derives presentation timing from the persisted FSRS due date and actual review.
 *
 * FSRS owns the due instant. A reviewed card becomes eligible on the later of
 * its raw due day and the local calendar day after its last review.
 */
export function derivePracticeScheduleTiming(input: {
  dueAt: Date | null
  lastReviewedAt?: Date | null
  timeZone?: string
  isStarted: boolean
  isSuspended: boolean
  now: Date
}) {
  if (!input.isStarted || !input.dueAt || Number.isNaN(input.dueAt.getTime())) {
    return { eligibleOn: null, isDue: false, isOverdue: false, overdueDays: 0 }
  }

  const dateFormatter =
    input.timeZone === undefined ? null : getDateFormatter(input.timeZone)

  const dueDay = localCalendarOrdinal(input.dueAt, dateFormatter)
  const reviewDay =
    input.lastReviewedAt && !Number.isNaN(input.lastReviewedAt.getTime())
      ? localCalendarOrdinal(input.lastReviewedAt, dateFormatter) + 1
      : dueDay
  const eligibleDay = Math.max(dueDay, reviewDay)
  const eligibleOn = calendarOrdinalToDateKey(eligibleDay)

  if (input.isSuspended || Number.isNaN(input.now.getTime())) {
    return { eligibleOn, isDue: false, isOverdue: false, overdueDays: 0 }
  }

  const today = localCalendarOrdinal(input.now, dateFormatter)
  const overdueDays = Math.max(0, today - eligibleDay)

  return {
    eligibleOn,
    isDue: eligibleDay <= today,
    isOverdue: overdueDays > 0,
    overdueDays,
  }
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dateFormatters.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  dateFormatters.set(timeZone, formatter)
  return formatter
}

function localCalendarOrdinal(
  date: Date,
  formatter: Intl.DateTimeFormat | null,
): number {
  if (formatter) {
    const parts = formatter.formatToParts(date)
    const component = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value)
    return Math.floor(
      Date.UTC(component('year'), component('month') - 1, component('day')) /
        dayMs,
    )
  }

  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / dayMs,
  )
}

function calendarOrdinalToDateKey(ordinal: number): string {
  const date = new Date(ordinal * dayMs)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const dayMs = 24 * 60 * 60 * 1000
