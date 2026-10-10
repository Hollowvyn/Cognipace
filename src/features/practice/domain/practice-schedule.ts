/**
 * Derives presentation timing from the persisted FSRS due date and actual review.
 *
 * FSRS owns the due instant. A reviewed card becomes eligible on the later of
 * its raw due day and the local calendar day after its last review.
 */
export function derivePracticeScheduleTiming(input: {
  dueAt: Date | null
  lastReviewedAt?: Date | null
  isStarted: boolean
  isSuspended: boolean
  now: Date
}) {
  if (!input.isStarted || !input.dueAt || Number.isNaN(input.dueAt.getTime())) {
    return { eligibleOn: null, isDue: false, isOverdue: false, overdueDays: 0 }
  }

  const dueDay = localCalendarOrdinal(input.dueAt)
  const reviewDay =
    input.lastReviewedAt && !Number.isNaN(input.lastReviewedAt.getTime())
      ? localCalendarOrdinal(input.lastReviewedAt) + 1
      : dueDay
  const eligibleDay = Math.max(dueDay, reviewDay)
  const eligibleOn = calendarOrdinalToDateKey(eligibleDay)

  if (input.isSuspended || Number.isNaN(input.now.getTime())) {
    return { eligibleOn, isDue: false, isOverdue: false, overdueDays: 0 }
  }

  const today = localCalendarOrdinal(input.now)
  const overdueDays = Math.max(0, today - eligibleDay)

  return {
    eligibleOn,
    isDue: eligibleDay <= today,
    isOverdue: overdueDays > 0,
    overdueDays,
  }
}

function localCalendarOrdinal(date: Date): number {
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
