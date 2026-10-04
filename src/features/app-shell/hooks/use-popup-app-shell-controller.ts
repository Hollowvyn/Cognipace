import { useMemo, useState } from 'react'
import { browser } from 'wxt/browser'

import { useToggleStudyMode, type StudyMode } from '@/features/settings'
import {
  getDashboardUrl,
  type DashboardRoute,
} from '@/platform/chrome/extension-pages'
import { createLeetCodeProblemUrl } from '@/lib/leetcode'
import { readErrorMessage } from '@/utils/errors'

import type {
  AppShellProblemSummary,
  PopupAppShellData,
} from '../api/app-shell-contracts'
import { usePopupAppShellData } from '../api/app-shell-api'
import {
  createPopupAppShellView,
  selectPopupRecommendation,
  type PopupAppShellView,
} from '../domain/popup-app-shell'

export type PopupControllerStatus = {
  scope: 'surface' | 'recommendation' | 'track'
  message: string
  isError: boolean
} | null

export interface PopupAppShellActions {
  openOverview: () => void
  openSettings: () => void
  openTracks: () => void
  openProblem: (
    problem: AppShellProblemSummary,
    scope: 'recommendation' | 'track',
  ) => void
  shuffleRecommendation: () => void
  toggleStudyMode: () => void
}

export interface PopupAppShellController {
  data: PopupAppShellData
  view: PopupAppShellView
  studyMode: StudyMode
  status: PopupControllerStatus
  isUpdatingStudyMode: boolean
  canToggleStudyMode: boolean
  canShuffleRecommendation: boolean
  actions: PopupAppShellActions
}

const fallbackData = {
  surface: 'popup',
  generatedAt: new Date(0).toISOString(),
  status: {
    label: 'Loading foundation',
    detail: 'Waiting for background service worker response.',
  },
  metrics: [
    { label: 'Reviews Due', value: '--' },
    { label: 'Streak', value: '--' },
  ],
  practiceProgress: {
    completedToday: 0,
    recordedSecondsToday: 0,
    dailyGoal: 0,
    currentStreak: 0,
    goalMetToday: false,
    todayDateKey: '1970-01-01',
  },
  recommendation: {
    title: 'Loading recommendation',
    detail: 'The queue service is not connected yet.',
    category: null,
    problem: null,
    dueAt: null,
  },
  activeTrack: {
    state: 'no-active-track',
    trackId: null,
    title: 'Loading track',
    description: null,
    groupTitle: null,
    dueAt: null,
    progress: {
      completedCount: 0,
      totalCount: 0,
      percent: 0,
    },
    detail: 'The track service is not connected yet.',
    nextProblem: null,
  },
  queue: {
    dueCount: 0,
    newCount: 0,
    reinforcementCount: 0,
    items: [],
  },
  settings: {
    appearance: {
      themeMode: 'system',
    },
    practice: {
      dailyGoal: 4,
      mode: 'studyPlan',
      problemFilters: {
        skipPremium: false,
      },
    },
    review: {
      targetRetention: 0.9,
      order: 'dueFirst',
    },
    assessment: {
      requireSolveTime: false,
      strictTiming: false,
      timeTargetsMinutes: {
        easy: 20,
        medium: 35,
        hard: 50,
      },
    },
    aiAssessment: { enabled: false, provider: 'openai', model: '' },
  },
  popup: {
    queuePreview: [],
  },
} satisfies PopupAppShellData

export function usePopupAppShellController(): PopupAppShellController {
  const shell = usePopupAppShellData()
  const toggleStudyModeMutation = useToggleStudyMode()
  const [recommendationIndex, setRecommendationIndex] = useState(0)
  const [status, setStatus] = useState<PopupControllerStatus>(null)
  const hasShellData = shell.data !== undefined
  const data = shell.data ?? fallbackData
  const studyMode = data.settings.practice.mode
  const displayData = useMemo(
    () => selectPopupRecommendation(data, recommendationIndex),
    [data, recommendationIndex],
  )
  const view = useMemo(
    () => createPopupAppShellView(displayData),
    [displayData],
  )
  const queryStatus = readShellQueryStatus({
    error: shell.error,
    hasData: hasShellData,
    isError: shell.isError,
    isPending: shell.isPending,
  })
  const canToggleStudyMode =
    hasShellData && !queryStatus?.isError && !toggleStudyModeMutation.isPending

  async function openDashboard(route?: DashboardRoute) {
    try {
      await browser.tabs.create({ url: getDashboardUrl(route) })
    } catch (error) {
      setStatus({
        scope: 'surface',
        message: readErrorMessage(error, 'Failed to open dashboard.'),
        isError: true,
      })
    }
  }

  async function openProblem(
    problem: AppShellProblemSummary,
    scope: 'recommendation' | 'track',
  ) {
    try {
      await browser.tabs.create({
        url: createLeetCodeProblemUrl(problem.problemSlug),
      })
    } catch (error) {
      setStatus({
        scope,
        message: readErrorMessage(error, 'Failed to open problem.'),
        isError: true,
      })
    }
  }

  async function toggleStudyMode() {
    if (!canToggleStudyMode || toggleStudyModeMutation.isPending) {
      return
    }

    setStatus(null)

    try {
      await toggleStudyModeMutation.mutateAsync({
        surface: 'popup',
      })
      setStatus(null)
    } catch (error) {
      setStatus({
        scope: 'track',
        message: readErrorMessage(error, 'Failed to update study mode.'),
        isError: true,
      })
    }
  }

  return {
    data: displayData,
    view,
    studyMode,
    status: status ?? queryStatus,
    isUpdatingStudyMode: toggleStudyModeMutation.isPending,
    canToggleStudyMode,
    canShuffleRecommendation:
      hasShellData && data.popup.queuePreview.length > 1,
    actions: {
      openOverview: () => {
        void openDashboard()
      },
      openSettings: () => {
        void openDashboard('settings')
      },
      openTracks: () => {
        void openDashboard('tracks')
      },
      openProblem: (problem, scope) => {
        void openProblem(problem, scope)
      },
      shuffleRecommendation: () => {
        if (!hasShellData) {
          return
        }

        setRecommendationIndex((current) => {
          const count = data.popup.queuePreview.length

          return count === 0 ? 0 : (current + 1) % count
        })
      },
      toggleStudyMode: () => {
        void toggleStudyMode()
      },
    },
  }
}

function readShellQueryStatus(input: {
  error: unknown
  hasData: boolean
  isError: boolean
  isPending: boolean
}): PopupControllerStatus {
  if (input.hasData) {
    return null
  }

  if (input.isError) {
    return {
      scope: 'surface',
      message: readErrorMessage(input.error, 'Failed to load popup data.'),
      isError: true,
    }
  }

  if (input.isPending) {
    return {
      scope: 'surface',
      message: 'Loading popup data...',
      isError: false,
    }
  }

  return null
}
