export interface PracticeProgressAttempt {
  problemSlug: string
  reviewedAt: Date
  elapsedSeconds?: number | null | undefined
}

export interface PracticeProgressSummaryInput {
  dailyGoal: number
  now?: Date | undefined
}

export interface PracticeProgressSummary {
  completedToday: number
  recordedSecondsToday: number
  dailyGoal: number
  currentStreak: number
  goalMetToday: boolean
  todayDateKey: string
}

export function buildPracticeProgressSummary(
  attempts: readonly PracticeProgressAttempt[],
  input: PracticeProgressSummaryInput,
): PracticeProgressSummary {
  const dailyGoal = Math.max(0, Math.round(input.dailyGoal))
  const todayDateKey = toPracticeDateKey(input.now ?? new Date())
  const problemSlugsByDateKey = groupUniqueProblemSlugsByDateKey(attempts)
  const completedToday = readCompletedCount(problemSlugsByDateKey, todayDateKey)
  const goalMetToday = dailyGoal > 0 && completedToday >= dailyGoal
  const recordedSecondsToday = attempts.reduce((total, attempt) => {
    const seconds = attempt.elapsedSeconds

    if (
      Number.isNaN(attempt.reviewedAt.getTime()) ||
      toPracticeDateKey(attempt.reviewedAt) !== todayDateKey ||
      typeof seconds !== 'number' ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    ) {
      return total
    }

    return total + Math.round(seconds)
  }, 0)

  return {
    completedToday,
    recordedSecondsToday,
    dailyGoal,
    currentStreak: readCurrentStreak({
      dailyGoal,
      problemSlugsByDateKey,
      todayDateKey,
    }),
    goalMetToday,
    todayDateKey,
  }
}

export function toPracticeDateKey(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return toPracticeDateKey(new Date())
  }

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function groupUniqueProblemSlugsByDateKey(
  attempts: readonly PracticeProgressAttempt[],
) {
  const problemSlugsByDateKey = new Map<string, Set<string>>()

  for (const attempt of attempts) {
    const dateKey = toPracticeDateKey(attempt.reviewedAt)
    const problemSlugs = problemSlugsByDateKey.get(dateKey) ?? new Set<string>()

    problemSlugs.add(attempt.problemSlug)
    problemSlugsByDateKey.set(dateKey, problemSlugs)
  }

  return problemSlugsByDateKey
}

function readCurrentStreak(input: {
  dailyGoal: number
  problemSlugsByDateKey: ReadonlyMap<string, ReadonlySet<string>>
  todayDateKey: string
}) {
  if (input.dailyGoal <= 0) {
    return 0
  }

  let streak = 0
  let dateKey = input.todayDateKey

  // An unfinished local day can still meet its goal before midnight.
  if (
    readCompletedCount(input.problemSlugsByDateKey, dateKey) < input.dailyGoal
  ) {
    dateKey = readPreviousDateKey(dateKey)
  }

  while (
    readCompletedCount(input.problemSlugsByDateKey, dateKey) >= input.dailyGoal
  ) {
    streak += 1
    dateKey = readPreviousDateKey(dateKey)
  }

  return streak
}

function readCompletedCount(
  problemSlugsByDateKey: ReadonlyMap<string, ReadonlySet<string>>,
  dateKey: string,
) {
  return problemSlugsByDateKey.get(dateKey)?.size ?? 0
}

function readPreviousDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)

  date.setDate(date.getDate() - 1)

  return toPracticeDateKey(date)
}
