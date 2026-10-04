import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import {
  type AppShellProblemSummary,
  type PopupAppShellData,
} from '@/features/app-shell'
import { defaultUserSettings } from '@/features/settings/domain'
import { createSerializedNormalizedPracticeState } from '@/testing/practice-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { usePopupAppShellController } from './use-popup-app-shell-controller'

const browserMocks = vi.hoisted(() => ({
  getURL: vi.fn((path: string) => `chrome-extension://extension-id${path}`),
  tabsCreate: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { getURL: browserMocks.getURL },
    tabs: { create: browserMocks.tabsCreate },
  },
}))

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

const twoSum = {
  problemSlug: 'two-sum',
  title: 'Two Sum',
  difficulty: 'easy',
  isPremium: false,
} satisfies AppShellProblemSummary

const validParentheses = {
  problemSlug: 'valid-parentheses',
  title: 'Valid Parentheses',
  difficulty: 'easy',
  isPremium: false,
} satisfies AppShellProblemSummary

const popupData = {
  surface: 'popup',
  generatedAt: '2026-01-01T00:00:00.000Z',
  status: {
    label: 'Practice ready',
    detail: '0 due, 2 new, 0 reinforcement available.',
  },
  metrics: [
    { label: 'Reviews Due', value: '0' },
    { label: 'Streak', value: '0 days' },
  ],
  practiceProgress: {
    completedToday: 0,
    recordedSecondsToday: 0,
    dailyGoal: 4,
    currentStreak: 0,
    goalMetToday: false,
    todayDateKey: '2026-01-01',
  },
  recommendation: {
    title: 'Two Sum',
    detail: 'Start easy.',
    category: 'new',
    problem: twoSum,
    dueAt: null,
  },
  activeTrack: {
    state: 'ready',
    trackId: 'leetcode-75',
    title: 'LeetCode 75',
    description: 'Focused starter track for interview patterns.',
    groupTitle: 'Arrays and Hashing',
    dueAt: null,
    progress: {
      completedCount: 0,
      totalCount: 2,
      percent: 0,
    },
    detail: 'Next: Two Sum',
    nextProblem: twoSum,
  },
  queue: {
    dueCount: 0,
    newCount: 2,
    reinforcementCount: 0,
    items: [],
  },
  settings: {
    appearance: defaultUserSettings.appearance,
    practice: defaultUserSettings.practice,
    review: defaultUserSettings.review,
    assessment: defaultUserSettings.assessment,
    aiAssessment: defaultUserSettings.aiAssessment,
  },
  popup: {
    queuePreview: [
      {
        category: 'new',
        reason: 'new-problem',
        problem: twoSum,
        state: createSerializedNormalizedPracticeState(),
      },
      {
        category: 'new',
        reason: 'new-problem',
        problem: validParentheses,
        state: createSerializedNormalizedPracticeState(),
      },
    ],
  },
} satisfies PopupAppShellData

describe('usePopupAppShellController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes an explicit loading state before popup data resolves', () => {
    vi.mocked(sendMessage).mockReturnValue(new Promise(() => undefined))
    const { wrapper } = createQueryTestHarness()

    const { result } = renderHook(() => usePopupAppShellController(), {
      wrapper,
    })

    expect(result.current.status).toMatchObject({
      scope: 'surface',
      message: 'Loading popup data...',
      isError: false,
    })
    expect(result.current.canToggleStudyMode).toBe(false)
  })

  it('exposes query failure and keeps study mode changes disabled', async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(
      new Error('Background offline'),
    )
    const { wrapper } = createQueryTestHarness()

    const { result } = renderHook(() => usePopupAppShellController(), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.status).toMatchObject({
        scope: 'surface',
        message: 'Background offline',
        isError: true,
      })
    })
    expect(result.current.canToggleStudyMode).toBe(false)
  })

  it('opens dashboard and problem actions', async () => {
    vi.mocked(sendMessage).mockImplementation(readRuntimeResponse)
    browserMocks.tabsCreate.mockResolvedValue({})
    const { wrapper } = createQueryTestHarness()

    const { result } = renderHook(() => usePopupAppShellController(), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.data.recommendation.problem?.problemSlug).toBe(
        'two-sum',
      )
    })

    act(() => {
      result.current.actions.openOverview()
      result.current.actions.openSettings()
      result.current.actions.openProblem(twoSum, 'recommendation')
    })

    expect(browserMocks.tabsCreate).toHaveBeenCalledWith({
      url: 'chrome-extension://extension-id/dashboard.html',
    })
    expect(browserMocks.tabsCreate).toHaveBeenCalledWith({
      url: 'chrome-extension://extension-id/dashboard.html#/settings',
    })
    expect(browserMocks.tabsCreate).toHaveBeenCalledWith({
      url: 'https://leetcode.com/problems/two-sum/',
    })
  })

  it('keeps study mode derived from app-shell data while toggling', async () => {
    const updateDeferred = createDeferred()
    let nextPopupData: PopupAppShellData = popupData
    vi.mocked(sendMessage).mockImplementation((method, request) => {
      if (method === 'app.getShellData') {
        expect(request).toEqual({ surface: 'popup' })
        return Promise.resolve(nextPopupData)
      }

      if (method === 'settings.toggleStudyMode') {
        expect(request).toEqual({
          surface: 'popup',
        })

        return updateDeferred.promise
      }

      return Promise.reject(new Error(`Unexpected runtime method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()

    const { result } = renderHook(() => usePopupAppShellController(), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.canToggleStudyMode).toBe(true)
    })
    expect(result.current.studyMode).toBe('studyPlan')

    act(() => {
      result.current.actions.toggleStudyMode()
    })

    await waitFor(() => {
      expect(result.current.isUpdatingStudyMode).toBe(true)
    })
    expect(result.current.studyMode).toBe('studyPlan')
    expect(result.current.status).toBeNull()
    expect(result.current.canToggleStudyMode).toBe(false)

    nextPopupData = {
      ...popupData,
      settings: {
        ...popupData.settings,
        practice: {
          ...popupData.settings.practice,
          mode: 'freePractice',
        },
      },
      activeTrack: createDisabledFreePracticeActiveTrack(),
    } satisfies PopupAppShellData
    act(() => {
      updateDeferred.resolve()
    })

    await waitFor(() => {
      expect(result.current.studyMode).toBe('freePractice')
    })
    expect(result.current.isUpdatingStudyMode).toBe(false)
    expect(result.current.status).toBeNull()
    expect(result.current.view.studyMode.kind).toBe('freePractice')
    expect(
      vi.mocked(sendMessage).mock.calls.filter(([method]) => {
        return method === 'app.getShellData'
      }).length,
    ).toBe(2)
  })

  it('keeps saved study mode when toggling fails', async () => {
    const updateDeferred = createDeferred()
    vi.mocked(sendMessage).mockImplementation((method, request) => {
      if (method === 'app.getShellData') {
        expect(request).toEqual({ surface: 'popup' })
        return Promise.resolve(popupData)
      }

      if (method === 'settings.toggleStudyMode') {
        expect(request).toEqual({
          surface: 'popup',
        })

        return updateDeferred.promise
      }

      return Promise.reject(new Error(`Unexpected runtime method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()

    const { result } = renderHook(() => usePopupAppShellController(), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.canToggleStudyMode).toBe(true)
    })
    expect(result.current.studyMode).toBe('studyPlan')

    act(() => {
      result.current.actions.toggleStudyMode()
    })

    await waitFor(() => {
      expect(result.current.isUpdatingStudyMode).toBe(true)
    })
    expect(result.current.studyMode).toBe('studyPlan')

    act(() => {
      updateDeferred.reject(new Error('Settings write failed'))
    })

    await waitFor(() => {
      expect(result.current.status).toMatchObject({
        scope: 'track',
        message: 'Settings write failed',
        isError: true,
      })
    })
    expect(result.current.studyMode).toBe('studyPlan')
    expect(result.current.isUpdatingStudyMode).toBe(false)
    expect(result.current.canToggleStudyMode).toBe(true)
  })

  it('rotates recommendations across queue preview candidates', async () => {
    vi.mocked(sendMessage).mockImplementation(readRuntimeResponse)
    const { wrapper } = createQueryTestHarness()

    const { result } = renderHook(() => usePopupAppShellController(), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.data.recommendation.problem?.problemSlug).toBe(
        'two-sum',
      )
    })

    act(() => {
      result.current.actions.shuffleRecommendation()
    })

    expect(result.current.data.recommendation.problem?.problemSlug).toBe(
      'valid-parentheses',
    )
  })
})

function readRuntimeResponse(method: string, request: unknown) {
  if (method === 'app.getShellData') {
    expect(request).toEqual({ surface: 'popup' })
    return Promise.resolve(popupData)
  }

  if (method === 'settings.toggleStudyMode') {
    expect(request).toEqual({
      surface: 'popup',
    })

    return Promise.resolve(null)
  }

  return Promise.reject(new Error(`Unexpected runtime method ${method}`))
}

function createDeferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<null>((innerResolve, innerReject) => {
    resolve = () => {
      innerResolve(null)
    }
    reject = innerReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

function createDisabledFreePracticeActiveTrack(): PopupAppShellData['activeTrack'] {
  return {
    state: 'disabled-free-practice',
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
