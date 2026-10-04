import { isAiAssessmentAvailable } from '@/features/genai/server/genai-settings-service'
import {
  serializeNormalizedPracticeState,
  serializePracticeDetails,
} from '@/features/practice/api/practice-serializers'
import {
  getPracticeDetails,
  getPracticeProgressSummary,
} from '@/features/practice/server/practice-service'
import type { Problem } from '@/features/problems/domain'
import { getProblemContext } from '@/features/problems/server/problems-service'
import type { QueueItem } from '@/features/queue/domain'
import { getTodayQueue } from '@/features/queue/server/queue-service'
import type { UserSettings } from '@/features/settings/domain'
import { getSettings } from '@/features/settings/server/settings-service'
import type { ActiveTrack } from '@/features/tracks/domain'
import { getActiveTrack } from '@/features/tracks/server/tracks-service'
import type { Db } from '@/platform/db'

import type {
  AppShellData,
  AppShellProblemSummary,
  AppShellQueueItem,
  AppShellRequest,
  OverlayNextStep,
  PopupAppShellData,
} from '../api/app-shell-contracts'
import { createAppShellMetrics } from '../domain/app-shell-metrics'
import { buildAppShellRecommendation } from '../domain/popup-app-shell'

export async function getAppShellData(
  db: Db,
  request: AppShellRequest,
  now = new Date(),
): Promise<AppShellData> {
  switch (request.surface) {
    case 'popup':
      return getPopupAppShellData(db, now)
    case 'dashboard':
      return getDashboardAppShellData(db, now)
    case 'overlay':
      return getOverlayAppShellData(db, request, now)
    default:
      return assertNever(request)
  }
}

async function getPopupAppShellData(db: Db, now: Date) {
  const { baseData, queueItems } = await getMainAppShellData(db, now)

  return {
    ...baseData,
    surface: 'popup',
    popup: { queuePreview: queueItems.slice(0, 3) },
  } satisfies AppShellData
}

async function getDashboardAppShellData(db: Db, now: Date) {
  const { baseData, queueItems } = await getMainAppShellData(db, now)
  const queuePreview = queueItems.slice(0, 5)

  return {
    ...baseData,
    surface: 'dashboard',
    overview: {
      practiceProgress: baseData.practiceProgress,
      queuePreview,
    },
    dashboard: { queuePreview },
  } satisfies AppShellData
}

async function getMainAppShellData(db: Db, now: Date) {
  const [settings, queue] = await Promise.all([
    getSettings(db),
    getTodayQueue(db, now),
  ])
  const [activeTrack, practiceProgress] = await Promise.all([
    getActiveTrack(db, now),
    getPracticeProgressSummary(db, {
      dailyGoal: settings.practice.dailyGoal,
      now,
    }),
  ])
  const queueItems = queue.items.map(serializeQueueItem)
  const baseData = {
    generatedAt: now.toISOString(),
    status: {
      label: 'Practice ready',
      detail: `${queue.dueCount} due, ${queue.newCount} new, ${queue.reinforcementCount} reinforcement available.`,
    },
    metrics: createAppShellMetrics({
      dueCount: queue.dueCount,
      practiceProgress,
    }),
    practiceProgress,
    recommendation: buildAppShellRecommendation(
      queue.topRecommendation
        ? serializeQueueItem(queue.topRecommendation)
        : null,
    ),
    activeTrack: serializeActiveTrack(activeTrack, settings.practice.mode),
    queue: {
      dueCount: queue.dueCount,
      newCount: queue.newCount,
      reinforcementCount: queue.reinforcementCount,
      items: queueItems,
    },
    settings: {
      appearance: settings.appearance,
      practice: settings.practice,
      review: settings.review,
      assessment: settings.assessment,
      aiAssessment: settings.aiAssessment,
    },
  } satisfies Omit<PopupAppShellData, 'surface' | 'popup'>

  return {
    baseData,
    queueItems,
  }
}

async function getOverlayAppShellData(
  db: Db,
  request: Extract<AppShellRequest, { surface: 'overlay' }>,
  now: Date,
) {
  const [settings, aiAssessmentAvailable] = await Promise.all([
    getSettings(db),
    isAiAssessmentAvailable(db),
  ])

  return {
    generatedAt: now.toISOString(),
    surface: 'overlay',
    overlay: {
      ...(await getOverlayPayload(db, request, now, settings)),
      aiAssessmentEnabled: settings.aiAssessment.enabled,
      aiAssessmentAvailable,
    },
  } satisfies AppShellData
}

async function getOverlayPayload(
  db: Db,
  request: Extract<AppShellRequest, { surface: 'overlay' }>,
  now: Date,
  settings: UserSettings,
) {
  if (!request.problemSlug) {
    return {
      appearance: settings.appearance,
      automation: serializeOverlayAutomation(settings),
      problem: null,
      practice: null,
      timing: settings.assessment,
      nextStep: null,
    }
  }

  const context = await getProblemContext(db, request.problemSlug)

  if (!context) {
    return {
      appearance: settings.appearance,
      automation: serializeOverlayAutomation(settings),
      problem: null,
      practice: null,
      timing: settings.assessment,
      nextStep: null,
    }
  }

  const [practice, queue, activeTrack] = await Promise.all([
    getPracticeDetails(db, context.problem.slug, { now }),
    getTodayQueue(db, now),
    getActiveTrack(db, now),
  ])
  const queueItems = queue.items.map(serializeQueueItem)
  const currentProblem = serializeProblemSummary(context.problem)
  const activeTrackNextProblem = activeTrack?.nextProblem
    ? serializeProblemSummary(activeTrack.nextProblem)
    : null

  return {
    appearance: settings.appearance,
    automation: serializeOverlayAutomation(settings),
    problem: currentProblem,
    practice: serializePracticeDetails(practice),
    timing: settings.assessment,
    nextStep: serializeOverlayNextStep({
      activeTrackNextProblem,
      currentProblem,
      queueItems,
    }),
  }
}

function serializeOverlayAutomation(settings: UserSettings) {
  return {
    autoDetectSolved: settings.overlay.autoDetectSolved,
  }
}

function serializeOverlayNextStep(input: {
  activeTrackNextProblem: AppShellProblemSummary | null
  currentProblem: AppShellProblemSummary
  queueItems: AppShellQueueItem[]
}): OverlayNextStep {
  if (
    input.activeTrackNextProblem &&
    input.activeTrackNextProblem.problemSlug !==
      input.currentProblem.problemSlug
  ) {
    return {
      kind: 'track',
      title: input.activeTrackNextProblem.title,
      detail: `Next in track · ${formatDifficulty(input.activeTrackNextProblem.difficulty)}`,
      problem: input.activeTrackNextProblem,
      category: null,
      dueAt: null,
    }
  }

  const recommendation = input.queueItems.find(
    (item) => item.problem.problemSlug !== input.currentProblem.problemSlug,
  )

  if (recommendation) {
    return {
      kind: 'recommendation',
      title: recommendation.problem.title,
      detail: `${formatQueueCategory(recommendation.category)} · ${formatDifficulty(recommendation.problem.difficulty)}`,
      problem: recommendation.problem,
      category: recommendation.category,
      dueAt: recommendation.state.dueAt,
    }
  }

  return {
    kind: 'empty',
    title: 'No next problem queued',
    detail: 'Review queue is clear for now.',
    problem: null,
    category: null,
    dueAt: null,
  }
}

function serializeActiveTrack(
  activeTrack: ActiveTrack | null,
  practiceMode: UserSettings['practice']['mode'],
) {
  if (practiceMode === 'freePractice') {
    return {
      state: 'disabled-free-practice' as const,
      trackId: null,
      title: 'Track guidance disabled',
      description: null,
      groupTitle: null,
      dueAt: null,
      progress: {
        completedCount: 0,
        totalCount: 0,
        percent: 0,
      },
      detail: 'Free Practice uses queue recommendations only.',
      nextProblem: null,
    }
  }

  if (!activeTrack) {
    return {
      state: 'no-active-track' as const,
      trackId: null,
      title: 'No active track',
      description: null,
      groupTitle: null,
      dueAt: null,
      progress: {
        completedCount: 0,
        totalCount: 0,
        percent: 0,
      },
      detail: 'Choose a track to restore guided progression.',
      nextProblem: null,
    }
  }

  return {
    state: activeTrack.nextProblem
      ? ('ready' as const)
      : ('exhausted' as const),
    trackId: activeTrack.track.id,
    title: activeTrack.track.title,
    description: activeTrack.track.description,
    groupTitle: activeTrack.activeGroup?.title ?? null,
    dueAt: activeTrack.track.dueAt?.toISOString() ?? null,
    progress: activeTrack.progress,
    detail: readActiveTrackDetail(activeTrack),
    nextProblem: activeTrack.nextProblem
      ? serializeProblemSummary(activeTrack.nextProblem)
      : null,
  }
}

function readActiveTrackDetail(activeTrack: ActiveTrack) {
  if (activeTrack.nextProblem) {
    return `Next: ${activeTrack.nextProblem.title}`
  }

  return 'No more problems in track.'
}

function serializeQueueItem(item: QueueItem): AppShellQueueItem {
  return {
    category: item.category,
    reason: item.reason,
    problem: {
      problemSlug: item.problemSlug,
      title: item.title,
      difficulty: item.difficulty,
      isPremium: item.isPremium,
    },
    state: serializeNormalizedPracticeState(item.state),
  }
}

function serializeProblemSummary(problem: Problem): AppShellProblemSummary {
  return {
    problemSlug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    isPremium: problem.isPremium,
  }
}

const queueCategoryLabelByCategory = {
  due: 'Review',
  new: 'Start',
  reinforcement: 'Extra Practice',
} as const satisfies Record<AppShellQueueItem['category'], string>

const difficultyLabelByDifficulty = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  unknown: 'unknown difficulty',
} as const satisfies Record<AppShellProblemSummary['difficulty'], string>

function formatQueueCategory(category: AppShellQueueItem['category']) {
  return queueCategoryLabelByCategory[category]
}

function formatDifficulty(difficulty: AppShellProblemSummary['difficulty']) {
  return difficultyLabelByDifficulty[difficulty]
}

function assertNever(value: never): never {
  void value
  throw new Error('Unhandled app-shell value')
}
