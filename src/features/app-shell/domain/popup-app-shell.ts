import type {
  AppShellProblemSummary,
  AppShellQueueItem,
  PopupAppShellData,
} from '../api/app-shell-contracts'
import {
  getTrackTargetStatus,
  type TrackTargetStatusTone,
} from '@/features/tracks/domain'

import { getQueueItemStatusPresentation } from './queue-item-status-presentation'

export type PopupRecommendationReason = {
  label: string
  tone: 'danger' | 'warning' | 'info' | 'success'
}

export type PopupRecommendationView = {
  title: string
  emptyCopy: string | null
  problem: AppShellProblemSummary | null
  reason: PopupRecommendationReason | null
  difficulty: AppShellProblemSummary['difficulty'] | null
}

type PopupStudyPlanView = {
  kind: 'studyPlan'
  title: string
  body: string
  groupTitle: string | null
  progressPercent: number | null
  targetStatus: {
    label: string
    tone: TrackTargetStatusTone
  } | null
  nextProblem: AppShellProblemSummary | null
  modeActionLabel: string
}

type PopupFreePracticeView = {
  kind: 'freePractice'
  title: string
  body: string
  modeActionLabel: string
}

export type PopupStudyModeView = PopupStudyPlanView | PopupFreePracticeView

export type PopupAppShellView = {
  recommendation: PopupRecommendationView
  studyMode: PopupStudyModeView
}

export function buildAppShellRecommendation(
  item: AppShellQueueItem | null,
): PopupAppShellData['recommendation'] {
  if (!item) {
    return {
      title: 'Queue is clear',
      detail: 'No due reviews or new problems are queued right now.',
      category: null,
      problem: null,
      dueAt: null,
    }
  }

  return {
    title: item.problem.title,
    detail: `${formatQueueCategory(item.category)} ${formatDifficulty(item.problem.difficulty)}.`,
    category: item.category,
    problem: item.problem,
    dueAt: item.state.dueAt,
  }
}

export function selectPopupRecommendation(
  data: PopupAppShellData,
  recommendationIndex: number,
): PopupAppShellData {
  const itemCount = data.popup.queuePreview.length

  if (itemCount === 0) {
    return data
  }

  const item = data.popup.queuePreview[recommendationIndex % itemCount]

  if (!item) {
    return data
  }

  return {
    ...data,
    recommendation: buildAppShellRecommendation(item),
  }
}

export function createPopupAppShellView(
  data: PopupAppShellData,
): PopupAppShellView {
  return {
    recommendation: createPopupRecommendationView(data),
    studyMode: createPopupStudyModeView(data),
  }
}

function createPopupRecommendationView(
  data: PopupAppShellData,
): PopupRecommendationView {
  const problem = data.recommendation.problem
  const queueItem = problem
    ? (data.queue.items.find(
        (item) => item.problem.problemSlug === problem.problemSlug,
      ) ??
      data.popup.queuePreview.find(
        (item) => item.problem.problemSlug === problem.problemSlug,
      ) ??
      null)
    : null

  return {
    title: problem ? problem.title : 'Queue Clear',
    emptyCopy: problem ? null : readEmptyRecommendationCopy(),
    problem,
    reason: queueItem ? getQueueItemStatusPresentation(queueItem.reason) : null,
    difficulty: problem?.difficulty ?? null,
  }
}

function createPopupStudyModeView(data: PopupAppShellData): PopupStudyModeView {
  const activeTrack = data.activeTrack

  if (activeTrack.state === 'disabled-free-practice') {
    return {
      kind: 'freePractice',
      title: readActiveTrackTitle(data),
      body: readActiveTrackBody(data),
      modeActionLabel: 'Start study mode',
    }
  }

  const hasActiveTrack = activeTrack.trackId !== null
  const targetStatus = getTrackTargetStatus({
    dueAt: activeTrack.dueAt,
    generatedAt: data.generatedAt,
    progress: activeTrack.progress,
  })

  return {
    kind: 'studyPlan',
    title: readActiveTrackTitle(data),
    body: readActiveTrackBody(data),
    groupTitle: hasActiveTrack ? activeTrack.groupTitle : null,
    progressPercent: hasActiveTrack ? activeTrack.progress.percent : null,
    targetStatus:
      hasActiveTrack && targetStatus.popupLabel
        ? {
            label: targetStatus.popupLabel,
            tone: targetStatus.tone,
          }
        : null,
    nextProblem: activeTrack.nextProblem,
    modeActionLabel: 'Start freestyle mode',
  }
}

function readEmptyRecommendationCopy() {
  return 'No review pressure right now. Your review queue is clear.'
}

function readActiveTrackTitle(data: PopupAppShellData) {
  return data.activeTrack.title
}

function readActiveTrackBody(data: PopupAppShellData) {
  const activeTrack = data.activeTrack

  if (activeTrack.state === 'disabled-free-practice') {
    return 'Queue-first practice without track guidance.'
  }

  if (!activeTrack.trackId) {
    return 'Choose a track in the dashboard to restore guided progression.'
  }

  if (activeTrack.state === 'exhausted') {
    return 'No more problems in track.'
  }

  return activeTrack.description ?? activeTrack.detail
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
