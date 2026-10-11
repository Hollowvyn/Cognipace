import type {
  Problem,
  ProblemDifficulty,
  ProblemSlug,
} from '@/features/problems'
import { type NormalizedPracticeState } from '@/features/practice'
import type { UserSettings } from '@/features/settings'

export type QueueItemCategory = 'due' | 'new' | 'reinforcement'
export type QueueIntent = 'automatic' | 'extra-practice'

export type RecommendationReason =
  | 'overdue'
  | 'due-today'
  | 'reinforcement'
  | 'new-problem'

export interface QueueCandidate {
  problem: Problem
  state: NormalizedPracticeState
}

export interface QueueItem {
  category: QueueItemCategory
  problemSlug: ProblemSlug
  title: string
  difficulty: ProblemDifficulty
  isPremium: boolean
  state: NormalizedPracticeState
  reason: RecommendationReason
}

export interface TodayQueue {
  generatedAt: Date
  dueCount: number
  dueToday: number
  newCount: number
  newAvailable: number
  queueLoad: number
  reinforcementCount: number
  excludedCount: number
  recommendationReason: RecommendationReason | null
  items: QueueItem[]
  topRecommendation: QueueItem | null
}

export function buildTodayQueue(
  candidates: QueueCandidate[],
  settings: UserSettings,
  generatedAt = new Date(),
  intent: QueueIntent = 'automatic',
): TodayQueue {
  const dailyGoal = Math.max(0, Math.round(settings.practice.dailyGoal))
  const { partitions, excludedCount } = partitionQueueCandidates(
    candidates,
    settings,
  )
  const overdueItems = sortByDueDate(partitions.overdue)
  const dueTodayItems = sortByDueDate(partitions.dueToday)
  const reinforcementItems = sortByRetrievability(partitions.reinforcement)
  const newItems = [...partitions.new].sort(compareNewProblemIdentity)
  const items =
    intent === 'extra-practice'
      ? reinforcementItems.slice(0, 1)
      : [...overdueItems, ...dueTodayItems, ...newItems].slice(0, dailyGoal)
  const dueCount = overdueItems.length + dueTodayItems.length

  return {
    generatedAt,
    dueCount,
    dueToday: dueCount,
    newCount: newItems.length,
    newAvailable: newItems.length,
    queueLoad: items.length,
    reinforcementCount: reinforcementItems.length,
    excludedCount,
    recommendationReason: items[0]?.reason ?? null,
    items,
    topRecommendation: items[0] ?? null,
  }
}

function partitionQueueCandidates(
  candidates: QueueCandidate[],
  settings: UserSettings,
) {
  const partitions: Record<
    'overdue' | 'dueToday' | 'new' | 'reinforcement',
    QueueItem[]
  > = {
    overdue: [],
    dueToday: [],
    new: [],
    reinforcement: [],
  }
  let excludedCount = 0

  for (const candidate of candidates) {
    if (isEffectivelySuspended(candidate, settings)) {
      excludedCount++
      continue
    }

    if (candidate.state.isOverdue) {
      partitions.overdue.push(mapQueueItem(candidate, 'due'))
      continue
    }

    if (candidate.state.isDue) {
      partitions.dueToday.push(mapQueueItem(candidate, 'due'))
      continue
    }

    if (!candidate.state.isStarted) {
      partitions.new.push(mapQueueItem(candidate, 'new'))
      continue
    }

    if (candidate.state.dueAt !== null) {
      partitions.reinforcement.push(mapQueueItem(candidate, 'reinforcement'))
    }
  }

  return { partitions, excludedCount }
}

function isEffectivelySuspended(
  candidate: QueueCandidate,
  settings: UserSettings,
) {
  return (
    candidate.state.isSuspended === true ||
    (candidate.state.status === 'mastered' && candidate.state.dueAt === null) ||
    candidate.state.status === 'suspended' ||
    (settings.practice.problemFilters.skipPremium &&
      candidate.problem.isPremium)
  )
}

function deriveRecommendationReason(
  category: QueueItemCategory,
  isOverdue: boolean,
): RecommendationReason {
  if (category === 'due') return isOverdue ? 'overdue' : 'due-today'
  if (category === 'reinforcement') return 'reinforcement'
  return 'new-problem'
}

function mapQueueItem(
  candidate: QueueCandidate,
  category: QueueItemCategory,
): QueueItem {
  return {
    category,
    problemSlug: candidate.problem.slug,
    title: candidate.problem.title,
    difficulty: candidate.problem.difficulty,
    isPremium: candidate.problem.isPremium,
    state: candidate.state,
    reason: deriveRecommendationReason(category, candidate.state.isOverdue),
  }
}

function sortByDueDate(items: QueueItem[]) {
  return [...items].sort((left, right) => {
    const eligibleComparison = (left.state.eligibleOn ?? '').localeCompare(
      right.state.eligibleOn ?? '',
    )
    if (eligibleComparison !== 0) {
      return eligibleComparison
    }

    const dueComparison = compareDates(left.state.dueAt, right.state.dueAt)

    if (dueComparison !== 0) {
      return dueComparison
    }

    return compareProblemIdentity(left, right)
  })
}

function sortByRetrievability(items: QueueItem[]) {
  return [...items].sort((left, right) => {
    const retrievabilityComparison =
      (left.state.retrievability ?? Number.MAX_SAFE_INTEGER) -
      (right.state.retrievability ?? Number.MAX_SAFE_INTEGER)

    if (retrievabilityComparison !== 0) {
      return retrievabilityComparison
    }

    const dueComparison = compareDates(left.state.dueAt, right.state.dueAt)

    return dueComparison !== 0
      ? dueComparison
      : compareProblemIdentity(left, right)
  })
}

function compareProblemIdentity(left: QueueItem, right: QueueItem) {
  const slugComparison = left.problemSlug.localeCompare(right.problemSlug)

  return slugComparison !== 0
    ? slugComparison
    : left.title.localeCompare(right.title)
}

function compareNewProblemIdentity(left: QueueItem, right: QueueItem) {
  const titleComparison = left.title.localeCompare(right.title)

  return titleComparison !== 0
    ? titleComparison
    : left.problemSlug.localeCompare(right.problemSlug)
}

function compareDates(left: Date | null, right: Date | null) {
  return (
    (left?.getTime() ?? Number.MAX_SAFE_INTEGER) -
    (right?.getTime() ?? Number.MAX_SAFE_INTEGER)
  )
}
