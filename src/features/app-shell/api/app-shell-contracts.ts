import { z } from 'zod'

import {
  normalizedPracticeStateSchema,
  practiceDetailsSchema,
} from '@/features/practice/api/practice-contracts'
import {
  problemDifficultySchema,
  problemSlugSchema,
} from '@/features/problems/api/problems-contracts'
import { userSettingsSchema } from '@/features/settings/domain'

export const appShellRequestSchema = z.discriminatedUnion('surface', [
  z.object({ surface: z.literal('popup') }),
  z.object({ surface: z.literal('dashboard') }),
  z.object({
    surface: z.literal('overlay'),
    problemSlug: problemSlugSchema.optional(),
  }),
])

export type AppShellRequest = z.infer<typeof appShellRequestSchema>

const appShellMetricSchema = z.object({
  label: z.string(),
  value: z.string(),
})

const appShellProblemSummarySchema = z.object({
  problemSlug: problemSlugSchema,
  title: z.string(),
  difficulty: problemDifficultySchema,
  isPremium: z.boolean(),
})

const appShellQueueItemSchema = z.object({
  category: z.enum(['due', 'new', 'reinforcement']),
  reason: z.enum(['overdue', 'due-today', 'reinforcement', 'new-problem']),
  problem: appShellProblemSummarySchema,
  state: normalizedPracticeStateSchema,
})

const appShellRecommendationSchema = z.object({
  title: z.string(),
  detail: z.string(),
  category: z.enum(['due', 'new', 'reinforcement']).nullable(),
  problem: appShellProblemSummarySchema.nullable(),
  dueAt: z.iso.datetime().nullable(),
})

const appShellTrackProgressSchema = z
  .object({
    completedCount: z.number().int().min(0),
    totalCount: z.number().int().min(0),
    percent: z.number().int().min(0).max(100),
  })
  .superRefine((progress, context) => {
    if (progress.completedCount > progress.totalCount) {
      context.addIssue({
        code: 'custom',
        message: 'completedCount cannot exceed totalCount',
        path: ['completedCount'],
      })
    }

    const expectedPercent =
      progress.totalCount === 0
        ? 0
        : Math.round((progress.completedCount / progress.totalCount) * 100)

    if (progress.percent !== expectedPercent) {
      context.addIssue({
        code: 'custom',
        message: 'percent must match completedCount and totalCount',
        path: ['percent'],
      })
    }
  })

const appShellActiveTrackStateSchema = z.enum([
  'disabled-free-practice',
  'no-active-track',
  'ready',
  'exhausted',
])

const appShellActiveTrackSchema = z.object({
  state: appShellActiveTrackStateSchema,
  trackId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  groupTitle: z.string().nullable(),
  dueAt: z.iso.datetime().nullable(),
  progress: appShellTrackProgressSchema,
  detail: z.string(),
  nextProblem: appShellProblemSummarySchema.nullable(),
})

const overlayNextStepSchema = z.object({
  kind: z.enum(['track', 'recommendation', 'empty']),
  title: z.string(),
  detail: z.string(),
  problem: appShellProblemSummarySchema.nullable(),
  category: z.enum(['due', 'new', 'reinforcement']).nullable(),
  dueAt: z.iso.datetime().nullable(),
})

const appShellAssessmentSettingsSchema = userSettingsSchema.shape.assessment
const overlayAutomationSettingsSchema = z.object({
  autoDetectSolved: userSettingsSchema.shape.overlay.shape.autoDetectSolved,
})

const appShellAiAssessmentSettingsSchema = userSettingsSchema.shape.aiAssessment

const appShellSettingsSummarySchema = z.object({
  appearance: userSettingsSchema.shape.appearance,
  practice: userSettingsSchema.shape.practice,
  review: userSettingsSchema.shape.review,
  assessment: appShellAssessmentSettingsSchema,
  aiAssessment: appShellAiAssessmentSettingsSchema,
})

const appShellPracticeProgressSchema = z.object({
  completedToday: z.number().int().min(0),
  recordedSecondsToday: z.number().int().min(0),
  dailyGoal: z.number().int().min(0),
  currentStreak: z.number().int().min(0),
  goalMetToday: z.boolean(),
  todayDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const appShellBaseDataSchema = z.object({
  generatedAt: z.iso.datetime(),
  status: z.object({
    label: z.string(),
    detail: z.string(),
  }),
  metrics: z.array(appShellMetricSchema),
  practiceProgress: appShellPracticeProgressSchema,
  recommendation: appShellRecommendationSchema,
  activeTrack: appShellActiveTrackSchema,
  queue: z.object({
    dueCount: z.number().int().min(0),
    newCount: z.number().int().min(0),
    reinforcementCount: z.number().int().min(0),
    items: z.array(appShellQueueItemSchema),
  }),
  settings: appShellSettingsSummarySchema,
})

const dashboardOverviewSchema = z.object({
  practiceProgress: appShellPracticeProgressSchema,
  queuePreview: z.array(appShellQueueItemSchema),
})

export const popupAppShellDataSchema = appShellBaseDataSchema.extend({
  surface: z.literal('popup'),
  popup: z.object({
    queuePreview: z.array(appShellQueueItemSchema),
  }),
})

export const dashboardAppShellDataSchema = appShellBaseDataSchema.extend({
  surface: z.literal('dashboard'),
  overview: dashboardOverviewSchema,
  dashboard: z.object({
    queuePreview: z.array(appShellQueueItemSchema),
  }),
})

export const overlayAppShellDataSchema = z.object({
  generatedAt: z.iso.datetime(),
  surface: z.literal('overlay'),
  overlay: z.object({
    appearance: userSettingsSchema.shape.appearance,
    automation: overlayAutomationSettingsSchema,
    problem: appShellProblemSummarySchema.nullable(),
    practice: practiceDetailsSchema.nullable(),
    timing: appShellAssessmentSettingsSchema,
    nextStep: overlayNextStepSchema.nullable(),
    aiAssessmentEnabled: z.boolean(),
    aiAssessmentAvailable: z.boolean(),
  }),
})

export const appShellDataSchema = z.discriminatedUnion('surface', [
  popupAppShellDataSchema,
  dashboardAppShellDataSchema,
  overlayAppShellDataSchema,
])

export type AppShellData = z.infer<typeof appShellDataSchema>
export type PopupAppShellData = z.infer<typeof popupAppShellDataSchema>
export type DashboardAppShellData = z.infer<typeof dashboardAppShellDataSchema>
export type DashboardOverviewData = z.infer<typeof dashboardOverviewSchema>
export type AppShellPracticeProgress = z.infer<
  typeof appShellPracticeProgressSchema
>
export type OverlayAppShellData = z.infer<typeof overlayAppShellDataSchema>
export type AppShellQueueItem = z.infer<typeof appShellQueueItemSchema>
export type AppShellProblemSummary = z.infer<
  typeof appShellProblemSummarySchema
>
export type OverlayNextStep = z.infer<typeof overlayNextStepSchema>
