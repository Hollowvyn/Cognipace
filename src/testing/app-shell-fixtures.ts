import type { DashboardAppShellData } from '@/features/app-shell'
import { createSerializedNormalizedPracticeState } from '@/testing/practice-fixtures'

export function createDashboardAppShellData(
  overrides: Partial<DashboardAppShellData> = {},
): DashboardAppShellData {
  const queueItem = createAppShellQueueItem()
  const practiceProgress = {
    completedToday: 1,
    recordedSecondsToday: 0,
    dailyGoal: 4,
    currentStreak: 0,
    goalMetToday: false,
    todayDateKey: '2026-05-25',
  } satisfies DashboardAppShellData['practiceProgress']

  return {
    surface: 'dashboard',
    generatedAt: '2026-05-25T16:30:00.000Z',
    status: {
      label: 'Practice ready',
      detail: '1 due, 0 new, 0 reinforcement available.',
    },
    metrics: [
      { label: 'Reviews Due', value: '1' },
      { label: 'Streak', value: '0 days' },
    ],
    practiceProgress,
    recommendation: {
      title: queueItem.problem.title,
      detail: 'Review easy.',
      category: 'due',
      problem: queueItem.problem,
      dueAt: queueItem.state.dueAt,
    },
    activeTrack: {
      state: 'ready',
      trackId: 'bytebytego-coding-patterns-101',
      title: 'ByteByteGo Coding Patterns 101',
      description: "ByteByteGo's coding patterns path.",
      groupTitle: 'Two Pointers',
      dueAt: null,
      progress: {
        completedCount: 1,
        totalCount: 101,
        percent: 1,
      },
      detail: 'Next: Pair Sum - Sorted',
      nextProblem: {
        problemSlug: 'two-sum-ii-input-array-is-sorted',
        title: 'Pair Sum - Sorted',
        difficulty: 'medium',
        isPremium: false,
      },
    },
    queue: {
      dueCount: 1,
      newCount: 0,
      reinforcementCount: 0,
      items: [queueItem],
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
    overview: {
      practiceProgress,
      queuePreview: [queueItem],
    },
    dashboard: {
      queuePreview: [queueItem],
    },
    ...overrides,
  }
}

export function createAppShellQueueItem(
  overrides: Partial<DashboardAppShellData['queue']['items'][number]> = {},
): DashboardAppShellData['queue']['items'][number] {
  const problem = {
    problemSlug: 'add-binary',
    title: 'Add Binary',
    difficulty: 'easy',
    isPremium: false,
    ...overrides.problem,
  } satisfies DashboardAppShellData['queue']['items'][number]['problem']

  return {
    category: 'due',
    reason: 'overdue',
    problem,
    state: createSerializedNormalizedPracticeState({
      problemSlug: problem.problemSlug,
      cardId: `${problem.problemSlug}:default`,
      status: 'review',
      phase: 'review',
      isStarted: true,
      isDue: true,
      isOverdue: true,
      overdueDays: 7,
      dueAt: '2026-05-18T00:00:00.000Z',
      lastReviewedAt: '2026-05-01T00:00:00.000Z',
      retrievability: 0.45,
      stability: 3,
      difficulty: 5,
      scheduledDays: 7,
      lapses: 1,
      reviewCount: 2,
    }),
    ...overrides,
  }
}
