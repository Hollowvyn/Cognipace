import { z } from 'zod'

import { genAiProviderIds } from '@/features/genai/domain'

export const reviewOrderSchema = z.enum([
  'dueFirst',
  'weakestFirst',
  'mixByDifficulty',
])
export const studyModeSchema = z.enum(['studyPlan', 'freePractice'])
export const themeModeSchema = z.enum(['system', 'light', 'dark'])
export const userSettingsSchemaVersion = 1

const analyticsTargetFractionSchema = z.number().finite().min(0).max(1)
const firstAttemptTargetFractionSchema = analyticsTargetFractionSchema.refine(
  (fraction) =>
    Math.abs(fraction * 100 - Math.round(fraction * 100)) <=
    Number.EPSILON * 100,
  'Use a whole percentage',
)
const analyticsTargetsShape = {
  targetRecall: analyticsTargetFractionSchema,
  targetReviewSuccess: analyticsTargetFractionSchema,
  targetFirstAttemptSuccess: firstAttemptTargetFractionSchema,
  targetFirstAttemptGoodEasy: firstAttemptTargetFractionSchema,
}

export const analyticsTargetsSchema = z
  .object({
    ...analyticsTargetsShape,
    targetFirstAttemptSuccess: firstAttemptTargetFractionSchema.default(0.9),
    targetFirstAttemptGoodEasy: firstAttemptTargetFractionSchema.default(0.9),
  })
  .strict()
  .refine((targets) => targets.targetReviewSuccess >= targets.targetRecall, {
    message: 'Review Success target must be at least your Recall target.',
    path: ['targetReviewSuccess'],
  })

export type AnalyticsTargets = z.infer<typeof analyticsTargetsSchema>

export const defaultAnalyticsTargets: AnalyticsTargets = {
  targetRecall: 0.9,
  targetReviewSuccess: 0.9,
  targetFirstAttemptSuccess: 0.9,
  targetFirstAttemptGoodEasy: 0.9,
}

export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm time')

export const dailyGoalSchema = z
  .number()
  .int('Use a whole number')
  .min(1, 'Minimum 1')
  .max(100, 'Maximum 100')

export const timingTargetMinutesSchema = z
  .number()
  .int('Use a whole number')
  .min(10, 'Minimum 10')
  .max(60, 'Maximum 60')

const timeTargetsMinutesShape = {
  easy: timingTargetMinutesSchema,
  medium: timingTargetMinutesSchema,
  hard: timingTargetMinutesSchema,
}

export const timeTargetsMinutesSchema = z
  .object(timeTargetsMinutesShape)
  .strict()
  .superRefine((targets, context) => {
    if (targets.easy >= targets.medium) {
      context.addIssue({
        code: 'custom',
        message: 'Must be less than medium',
        path: ['easy'],
      })
      context.addIssue({
        code: 'custom',
        message: 'Must be greater than easy',
        path: ['medium'],
      })
    }

    if (targets.medium >= targets.hard) {
      context.addIssue({
        code: 'custom',
        message: 'Must be less than hard',
        path: ['medium'],
      })
      context.addIssue({
        code: 'custom',
        message: 'Must be greater than medium',
        path: ['hard'],
      })
    }
  })

const appearanceSettingsSchema = z
  .object({
    themeMode: themeModeSchema.default('system'),
  })
  .strict()

const appearanceSettingsPatchSchema = z
  .object({
    themeMode: themeModeSchema.optional(),
  })
  .strict()

const practiceSettingsSchema = z
  .object({
    dailyGoal: dailyGoalSchema,
    mode: studyModeSchema,
    problemFilters: z
      .object({
        skipPremium: z.boolean(),
      })
      .strict(),
  })
  .strict()

const reviewSettingsSchema = z
  .object({
    targetRetention: z.number().min(0.7).max(0.97),
    order: reviewOrderSchema,
  })
  .strict()

const assessmentSettingsSchema = z
  .object({
    requireSolveTime: z.boolean(),
    strictTiming: z.boolean(),
    timeTargetsMinutes: timeTargetsMinutesSchema,
  })
  .strict()
  .superRefine((assessment, context) => {
    if (assessment.strictTiming && !assessment.requireSolveTime) {
      context.addIssue({
        code: 'custom',
        message: 'Require solve time before using strict timing',
        path: ['strictTiming'],
      })
    }
  })

export const aiAssessmentProviderSchema = z.enum(genAiProviderIds)

export const aiAssessmentModelSchema = z
  .string()
  .max(120, 'Maximum 120 characters')

const aiAssessmentSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    provider: aiAssessmentProviderSchema.default('openai'),
    model: aiAssessmentModelSchema.default(''),
  })
  .strict()

const overlaySettingsSchema = z
  .object({
    autoDetectSolved: z.boolean().default(true),
  })
  .strict()

const remindersSettingsSchema = z
  .object({
    daily: z
      .object({
        enabled: z.boolean(),
        time: timeOfDaySchema,
      })
      .strict(),
  })
  .strict()

export const userSettingsSchema = z
  .object({
    schemaVersion: z
      .literal(userSettingsSchemaVersion)
      .default(userSettingsSchemaVersion),
    analytics: analyticsTargetsSchema.default(defaultAnalyticsTargets),
    appearance: appearanceSettingsSchema.default({ themeMode: 'system' }),
    practice: practiceSettingsSchema,
    review: reviewSettingsSchema,
    assessment: assessmentSettingsSchema,
    aiAssessment: aiAssessmentSettingsSchema.default({
      enabled: false,
      provider: 'openai',
      model: '',
    }),
    overlay: overlaySettingsSchema,
    reminders: remindersSettingsSchema,
  })
  .strict()

export const userSettingsPatchSchema = z
  .object({
    analytics: z.object(analyticsTargetsShape).partial().strict().optional(),
    appearance: appearanceSettingsPatchSchema.optional(),
    practice: z
      .object({
        dailyGoal: practiceSettingsSchema.shape.dailyGoal.optional(),
        mode: studyModeSchema.optional(),
        problemFilters: practiceSettingsSchema.shape.problemFilters
          .partial()
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    review: reviewSettingsSchema.partial().optional(),
    assessment: z
      .object({
        requireSolveTime:
          assessmentSettingsSchema.shape.requireSolveTime.optional(),
        strictTiming: assessmentSettingsSchema.shape.strictTiming.optional(),
        timeTargetsMinutes: z
          .object(timeTargetsMinutesShape)
          .partial()
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    aiAssessment: z
      .object({
        enabled: aiAssessmentSettingsSchema.shape.enabled.optional(),
        provider: aiAssessmentSettingsSchema.shape.provider.optional(),
        model: aiAssessmentSettingsSchema.shape.model.optional(),
      })
      .strict()
      .optional(),
    overlay: overlaySettingsSchema.partial().optional(),
    reminders: z
      .object({
        daily: remindersSettingsSchema.shape.daily
          .partial()
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export type UserSettings = z.infer<typeof userSettingsSchema>
export type UserSettingsPatch = z.infer<typeof userSettingsPatchSchema>
export type ReviewOrder = z.infer<typeof reviewOrderSchema>
export type StudyMode = z.infer<typeof studyModeSchema>
export type ThemeMode = z.infer<typeof themeModeSchema>

export const defaultUserSettings: UserSettings = {
  schemaVersion: userSettingsSchemaVersion,
  analytics: defaultAnalyticsTargets,
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
  aiAssessment: {
    enabled: false,
    provider: 'openai',
    model: '',
  },
  overlay: {
    autoDetectSolved: true,
  },
  reminders: {
    daily: {
      enabled: false,
      time: '09:00',
    },
  },
}

export function parseStoredUserSettings(value: unknown): UserSettings {
  const safeStoredValue = createSafeStoredValue(value)
  const parsed = userSettingsSchema.safeParse(safeStoredValue)

  if (parsed.success) {
    return parsed.data
  }

  const patch = userSettingsPatchSchema.safeParse(safeStoredValue)

  if (patch.success) {
    return mergeStoredUserSettingsPatch(patch.data) ?? defaultUserSettings
  }

  return defaultUserSettings
}

function createSafeStoredValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }

  const appearance = appearanceSettingsSchema.safeParse(value.appearance)
  const analytics = analyticsTargetsSchema.safeParse(
    isRecord(value.analytics)
      ? {
          ...value.analytics,
          targetFirstAttemptSuccess: recoverStoredFirstAttemptTarget(
            value.analytics.targetFirstAttemptSuccess,
          ),
          targetFirstAttemptGoodEasy: recoverStoredFirstAttemptTarget(
            value.analytics.targetFirstAttemptGoodEasy,
          ),
        }
      : value.analytics,
  )

  return {
    ...value,
    analytics: analytics.success ? analytics.data : defaultAnalyticsTargets,
    appearance: appearance.success
      ? appearance.data
      : defaultUserSettings.appearance,
  }
}

function recoverStoredFirstAttemptTarget(value: unknown): number {
  const parsed = firstAttemptTargetFractionSchema.safeParse(value)
  return parsed.success ? parsed.data : 0.9
}

export function mergeUserSettings(
  current: UserSettings,
  patch: UserSettingsPatch,
): UserSettings {
  return userSettingsSchema.parse(createMergedUserSettings(current, patch))
}

function mergeStoredUserSettingsPatch(
  patch: UserSettingsPatch,
): UserSettings | null {
  const result = userSettingsSchema.safeParse(
    createMergedUserSettings(defaultUserSettings, patch),
  )

  return result.success ? result.data : null
}

function createMergedUserSettings(
  current: UserSettings,
  patch: UserSettingsPatch,
) {
  return {
    ...current,
    ...patch,
    schemaVersion: userSettingsSchemaVersion,
    analytics: {
      ...current.analytics,
      ...patch.analytics,
    },
    appearance: {
      ...current.appearance,
      ...patch.appearance,
    },
    practice: {
      ...current.practice,
      ...patch.practice,
      problemFilters: {
        ...current.practice.problemFilters,
        ...patch.practice?.problemFilters,
      },
    },
    review: {
      ...current.review,
      ...patch.review,
    },
    assessment: {
      ...current.assessment,
      ...patch.assessment,
      timeTargetsMinutes: {
        ...current.assessment.timeTargetsMinutes,
        ...patch.assessment?.timeTargetsMinutes,
      },
    },
    aiAssessment: {
      ...current.aiAssessment,
      ...patch.aiAssessment,
    },
    overlay: {
      ...current.overlay,
      ...patch.overlay,
    },
    reminders: {
      ...current.reminders,
      ...patch.reminders,
      daily: {
        ...current.reminders.daily,
        ...patch.reminders?.daily,
      },
    },
  }
}

export function hasUserSettingsChanges(
  saved: UserSettings,
  draft: UserSettings,
) {
  return createUserSettingsPatch(saved, draft) !== null
}

export function createUserSettingsPatch(
  saved: UserSettings,
  draft: UserSettings,
): UserSettingsPatch | null {
  const patch: UserSettingsPatch = {}

  const analyticsPatch: NonNullable<UserSettingsPatch['analytics']> = {}
  if (saved.analytics.targetRecall !== draft.analytics.targetRecall) {
    analyticsPatch.targetRecall = draft.analytics.targetRecall
  }
  if (
    saved.analytics.targetReviewSuccess !== draft.analytics.targetReviewSuccess
  ) {
    analyticsPatch.targetReviewSuccess = draft.analytics.targetReviewSuccess
  }
  if (
    saved.analytics.targetFirstAttemptSuccess !==
    draft.analytics.targetFirstAttemptSuccess
  ) {
    analyticsPatch.targetFirstAttemptSuccess =
      draft.analytics.targetFirstAttemptSuccess
  }
  if (
    saved.analytics.targetFirstAttemptGoodEasy !==
    draft.analytics.targetFirstAttemptGoodEasy
  ) {
    analyticsPatch.targetFirstAttemptGoodEasy =
      draft.analytics.targetFirstAttemptGoodEasy
  }
  if (hasObjectKeys(analyticsPatch)) {
    patch.analytics = analyticsPatch
  }

  const appearancePatch: NonNullable<UserSettingsPatch['appearance']> = {}
  if (saved.appearance.themeMode !== draft.appearance.themeMode) {
    appearancePatch.themeMode = draft.appearance.themeMode
  }
  if (hasObjectKeys(appearancePatch)) {
    patch.appearance = appearancePatch
  }

  const practicePatch: NonNullable<UserSettingsPatch['practice']> = {}
  if (saved.practice.dailyGoal !== draft.practice.dailyGoal) {
    practicePatch.dailyGoal = draft.practice.dailyGoal
  }
  if (saved.practice.mode !== draft.practice.mode) {
    practicePatch.mode = draft.practice.mode
  }

  const problemFiltersPatch: NonNullable<
    NonNullable<UserSettingsPatch['practice']>['problemFilters']
  > = {}
  if (
    saved.practice.problemFilters.skipPremium !==
    draft.practice.problemFilters.skipPremium
  ) {
    problemFiltersPatch.skipPremium = draft.practice.problemFilters.skipPremium
  }
  if (hasObjectKeys(problemFiltersPatch)) {
    practicePatch.problemFilters = problemFiltersPatch
  }
  if (hasObjectKeys(practicePatch)) {
    patch.practice = practicePatch
  }

  const reviewPatch: NonNullable<UserSettingsPatch['review']> = {}
  if (saved.review.targetRetention !== draft.review.targetRetention) {
    reviewPatch.targetRetention = draft.review.targetRetention
  }
  if (saved.review.order !== draft.review.order) {
    reviewPatch.order = draft.review.order
  }
  if (hasObjectKeys(reviewPatch)) {
    patch.review = reviewPatch
  }

  const assessmentPatch: NonNullable<UserSettingsPatch['assessment']> = {}
  if (saved.assessment.requireSolveTime !== draft.assessment.requireSolveTime) {
    assessmentPatch.requireSolveTime = draft.assessment.requireSolveTime
  }
  if (saved.assessment.strictTiming !== draft.assessment.strictTiming) {
    assessmentPatch.strictTiming = draft.assessment.strictTiming
  }

  const timeTargetsPatch: NonNullable<
    NonNullable<UserSettingsPatch['assessment']>['timeTargetsMinutes']
  > = {}
  if (
    saved.assessment.timeTargetsMinutes.easy !==
    draft.assessment.timeTargetsMinutes.easy
  ) {
    timeTargetsPatch.easy = draft.assessment.timeTargetsMinutes.easy
  }
  if (
    saved.assessment.timeTargetsMinutes.medium !==
    draft.assessment.timeTargetsMinutes.medium
  ) {
    timeTargetsPatch.medium = draft.assessment.timeTargetsMinutes.medium
  }
  if (
    saved.assessment.timeTargetsMinutes.hard !==
    draft.assessment.timeTargetsMinutes.hard
  ) {
    timeTargetsPatch.hard = draft.assessment.timeTargetsMinutes.hard
  }
  if (hasObjectKeys(timeTargetsPatch)) {
    assessmentPatch.timeTargetsMinutes = timeTargetsPatch
  }
  if (hasObjectKeys(assessmentPatch)) {
    patch.assessment = assessmentPatch
  }

  const aiAssessmentPatch: NonNullable<UserSettingsPatch['aiAssessment']> = {}
  if (saved.aiAssessment.enabled !== draft.aiAssessment.enabled) {
    aiAssessmentPatch.enabled = draft.aiAssessment.enabled
  }
  if (saved.aiAssessment.provider !== draft.aiAssessment.provider) {
    aiAssessmentPatch.provider = draft.aiAssessment.provider
  }
  if (saved.aiAssessment.model !== draft.aiAssessment.model) {
    aiAssessmentPatch.model = draft.aiAssessment.model
  }
  if (hasObjectKeys(aiAssessmentPatch)) {
    patch.aiAssessment = aiAssessmentPatch
  }

  const overlayPatch: NonNullable<UserSettingsPatch['overlay']> = {}
  if (saved.overlay.autoDetectSolved !== draft.overlay.autoDetectSolved) {
    overlayPatch.autoDetectSolved = draft.overlay.autoDetectSolved
  }
  if (hasObjectKeys(overlayPatch)) {
    patch.overlay = overlayPatch
  }

  const remindersPatch: NonNullable<UserSettingsPatch['reminders']> = {}
  const dailyReminderPatch: NonNullable<
    NonNullable<UserSettingsPatch['reminders']>['daily']
  > = {}
  if (saved.reminders.daily.enabled !== draft.reminders.daily.enabled) {
    dailyReminderPatch.enabled = draft.reminders.daily.enabled
  }
  if (saved.reminders.daily.time !== draft.reminders.daily.time) {
    dailyReminderPatch.time = draft.reminders.daily.time
  }
  if (hasObjectKeys(dailyReminderPatch)) {
    remindersPatch.daily = dailyReminderPatch
  }
  if (hasObjectKeys(remindersPatch)) {
    patch.reminders = remindersPatch
  }

  return hasObjectKeys(patch) ? patch : null
}

function hasObjectKeys(value: object) {
  return Object.keys(value).length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function deriveNextThemeMode(themeMode: ThemeMode): ThemeMode {
  switch (themeMode) {
    case 'system':
      return 'light'
    case 'light':
      return 'dark'
    case 'dark':
      return 'system'
  }
}
