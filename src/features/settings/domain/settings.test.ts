import { describe, expect, it } from 'vitest'

import {
  analyticsTargetsSchema,
  createUserSettingsPatch,
  defaultAnalyticsTargets,
  defaultUserSettings,
  deriveNextThemeMode,
  hasUserSettingsChanges,
  mergeUserSettings,
  parseStoredUserSettings,
  userSettingsPatchSchema,
  userSettingsSchema,
} from './settings'

describe('analytics target settings', () => {
  const fields = Object.keys(
    defaultAnalyticsTargets,
  ) as (keyof typeof defaultAnalyticsTargets)[]
  const firstAttemptFields = [
    'targetFirstAttemptSuccess',
    'targetFirstAttemptGoodEasy',
  ] as const
  const legacyTargets = { targetRecall: 0.825, targetReviewSuccess: 0.955 }
  const saved = {
    ...defaultUserSettings,
    analytics: {
      ...legacyTargets,
      targetFirstAttemptSuccess: 0.29,
      targetFirstAttemptGoodEasy: 0.8,
    },
    practice: { ...defaultUserSettings.practice, dailyGoal: 12 },
    review: { ...defaultUserSettings.review, targetRetention: 0.75 },
  }

  it('defaults all four goals independently of FSRS retention', () => {
    expect(defaultAnalyticsTargets).toEqual({
      targetRecall: 0.9,
      targetReviewSuccess: 0.9,
      targetFirstAttemptSuccess: 0.9,
      targetFirstAttemptGoodEasy: 0.9,
    })
    const oldSettings = { ...saved }
    delete (oldSettings as Record<string, unknown>).analytics
    expect(userSettingsSchema.parse(oldSettings)).toEqual({
      ...oldSettings,
      analytics: defaultAnalyticsTargets,
    })
    expect(
      parseStoredUserSettings({ review: { targetRetention: 0.75 } }),
    ).toMatchObject({
      analytics: defaultAnalyticsTargets,
      review: { targetRetention: 0.75 },
    })
  })

  it.each([
    legacyTargets,
    { ...legacyTargets, targetFirstAttemptSuccess: 0.29 },
    { ...legacyTargets, targetFirstAttemptGoodEasy: 0.8 },
    saved.analytics,
  ])(
    'fills only missing new goals and preserves old decimal goals: %j',
    (analytics) => {
      const settings = { ...saved, analytics }
      const expected = {
        ...settings,
        analytics: { ...defaultAnalyticsTargets, ...analytics },
      }
      expect(userSettingsSchema.parse(settings)).toEqual(expected)
      expect(parseStoredUserSettings(settings)).toEqual(expected)
    },
  )

  it.each(firstAttemptFields)(
    'validates whole-percent %s and recovers only its malformed stored value',
    (field) => {
      for (const value of [0, 0.29, 1]) {
        const analytics = { ...saved.analytics, [field]: value }
        expect(analyticsTargetsSchema.parse(analytics)).toEqual(analytics)
        expect(
          userSettingsPatchSchema.parse({ analytics: { [field]: value } }),
        ).toEqual({ analytics: { [field]: value } })
      }
      for (const value of [
        null,
        '90',
        -0.01,
        1.01,
        0.295,
        NaN,
        Infinity,
        -Infinity,
      ]) {
        const settings = {
          ...saved,
          analytics: { ...saved.analytics, [field]: value },
        }
        expect(userSettingsSchema.safeParse(settings).success).toBe(false)
        expect(
          userSettingsPatchSchema.safeParse({ analytics: { [field]: value } })
            .success,
        ).toBe(false)
        expect(parseStoredUserSettings(settings)).toEqual({
          ...saved,
          analytics: { ...saved.analytics, [field]: 0.9 },
        })
      }
    },
  )

  it.each(['targetRecall', 'targetReviewSuccess'] as const)(
    'rejects invalid %s fractions in full settings and patches',
    (field) => {
      for (const value of [null, '90', -0.01, 1.01, NaN, Infinity, -Infinity]) {
        expect(
          userSettingsSchema.safeParse({
            ...saved,
            analytics: { ...saved.analytics, [field]: value },
          }).success,
        ).toBe(false)
        expect(
          userSettingsPatchSchema.safeParse({ analytics: { [field]: value } })
            .success,
        ).toBe(false)
      }
    },
  )

  it.each([
    null,
    'invalid',
    {},
    { targetRecall: 0.8 },
    { targetRecall: -0.1, targetReviewSuccess: 0.95 },
    { targetRecall: 0.8, targetReviewSuccess: Infinity },
    { targetRecall: NaN, targetReviewSuccess: 0.95 },
    { targetRecall: 0.95, targetReviewSuccess: 0.9 },
    { targetRecall: 0.8, targetReviewSuccess: 0.95, unknown: true },
  ])(
    'recovers malformed legacy analytics without dropping unrelated settings: %j',
    (analytics) => {
      expect(parseStoredUserSettings({ ...saved, analytics })).toEqual({
        ...saved,
        analytics: defaultAnalyticsTargets,
      })
    },
  )

  it.each([
    {
      targetRecall: 0,
      targetReviewSuccess: 0,
      targetFirstAttemptSuccess: 0,
      targetFirstAttemptGoodEasy: 1,
    },
    {
      targetRecall: 0,
      targetReviewSuccess: 1,
      targetFirstAttemptSuccess: 1,
      targetFirstAttemptGoodEasy: 0,
    },
    {
      targetRecall: 1,
      targetReviewSuccess: 1,
      targetFirstAttemptSuccess: 0.29,
      targetFirstAttemptGoodEasy: 0.8,
    },
  ])(
    'accepts inclusive boundaries and independently ordered new goals: %j',
    (analytics) => {
      expect(analyticsTargetsSchema.parse(analytics)).toEqual(analytics)
    },
  )

  it('validates the merged legacy pair and reports its ordering error on Review Success', () => {
    const invalid = { targetRecall: 0.95, targetReviewSuccess: 0.9 }
    const parsed = userSettingsSchema.safeParse({
      ...saved,
      analytics: invalid,
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success)
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['analytics', 'targetReviewSuccess'],
          message: 'Review Success target must be at least your Recall target.',
        }),
      )
    expect(() =>
      mergeUserSettings(defaultUserSettings, {
        analytics: { targetRecall: 0.95 },
      }),
    ).toThrow('Review Success target must be at least your Recall target.')
    expect(
      mergeUserSettings(defaultUserSettings, {
        analytics: { targetRecall: 0.95, targetReviewSuccess: 0.98 },
      }).analytics,
    ).toEqual({
      ...defaultAnalyticsTargets,
      targetRecall: 0.95,
      targetReviewSuccess: 0.98,
    })
  })

  it.each(fields)('patches and merges only the edited %s', (field) => {
    const draft = { ...saved, analytics: { ...saved.analytics, [field]: 0.85 } }
    const patch = { analytics: { [field]: 0.85 } }
    expect(createUserSettingsPatch(saved, draft)).toEqual(patch)
    expect(userSettingsPatchSchema.parse(patch)).toEqual(patch)
    expect(mergeUserSettings(saved, patch)).toEqual(draft)
    expect(mergeUserSettings(saved, { analytics: {} })).toEqual(saved)
  })
})

describe('settings domain', () => {
  it('merges partial grouped stored settings with current defaults', () => {
    expect(
      parseStoredUserSettings({
        practice: {
          dailyGoal: 6,
          problemFilters: {
            skipPremium: true,
          },
        },
        overlay: {
          autoDetectSolved: false,
        },
      }),
    ).toMatchObject({
      practice: {
        dailyGoal: 6,
        mode: defaultUserSettings.practice.mode,
        problemFilters: {
          skipPremium: true,
        },
      },
      overlay: {
        autoDetectSolved: false,
      },
    })
  })

  it('defaults missing appearance settings to system without dropping valid stored values', () => {
    expect(
      parseStoredUserSettings({
        practice: {
          dailyGoal: 6,
          problemFilters: {
            skipPremium: true,
          },
        },
      }),
    ).toMatchObject({
      appearance: {
        themeMode: 'system',
      },
      practice: {
        dailyGoal: 6,
        mode: defaultUserSettings.practice.mode,
        problemFilters: {
          skipPremium: true,
        },
      },
    })
  })

  it('validates appearance mode at the domain boundary', () => {
    expect(userSettingsSchema.parse(defaultUserSettings).appearance).toEqual({
      themeMode: 'system',
    })
    expect(() =>
      userSettingsSchema.parse({
        ...defaultUserSettings,
        appearance: {
          themeMode: 'sepia',
        },
      }),
    ).toThrow()
  })

  it('uses default appearance for invalid stored appearance while preserving valid stored branches', () => {
    expect(
      parseStoredUserSettings({
        appearance: {
          themeMode: 'sepia',
        },
        practice: {
          dailyGoal: 6,
          problemFilters: {
            skipPremium: true,
          },
        },
      }),
    ).toMatchObject({
      appearance: {
        themeMode: 'system',
      },
      practice: {
        dailyGoal: 6,
        problemFilters: {
          skipPremium: true,
        },
      },
    })
  })

  it('patches appearance mode without dropping unrelated settings', () => {
    const draft = {
      ...defaultUserSettings,
      appearance: {
        themeMode: 'dark' as const,
      },
    }

    expect(createUserSettingsPatch(defaultUserSettings, draft)).toEqual({
      appearance: { themeMode: 'dark' },
    })
    expect(
      mergeUserSettings(defaultUserSettings, {
        appearance: { themeMode: 'light' },
      }),
    ).toEqual({
      ...defaultUserSettings,
      appearance: { themeMode: 'light' },
    })
  })

  it('keeps an empty appearance patch as a no-op', () => {
    const patch = userSettingsPatchSchema.parse({ appearance: {} })

    expect(
      mergeUserSettings(
        {
          ...defaultUserSettings,
          appearance: { themeMode: 'dark' },
        },
        patch,
      ).appearance,
    ).toEqual({ themeMode: 'dark' })
  })

  it('derives the next theme mode in repository-owned cycle order', () => {
    expect(deriveNextThemeMode('system')).toBe('light')
    expect(deriveNextThemeMode('light')).toBe('dark')
    expect(deriveNextThemeMode('dark')).toBe('system')
  })

  it('falls back to defaults for invalid stored settings', () => {
    expect(
      parseStoredUserSettings({
        unknown: true,
      }),
    ).toEqual(defaultUserSettings)
    expect(
      parseStoredUserSettings({
        practice: {
          dailyGoal: 0,
        },
      }),
    ).toEqual(defaultUserSettings)
    expect(
      parseStoredUserSettings({
        assessment: {
          timeTargetsMinutes: {
            easy: 55,
          },
        },
      }),
    ).toEqual(defaultUserSettings)
  })

  it('validates settings bounds at the domain boundary', () => {
    expect(userSettingsSchema.parse(defaultUserSettings)).toEqual(
      defaultUserSettings,
    )
    expect(() =>
      userSettingsSchema.parse({
        ...defaultUserSettings,
        schemaVersion: 2,
      }),
    ).toThrow()
    expect(() =>
      userSettingsSchema.parse({
        ...defaultUserSettings,
        practice: {
          ...defaultUserSettings.practice,
          dailyGoal: 101,
        },
      }),
    ).toThrow()
    expect(() =>
      userSettingsSchema.parse({
        ...defaultUserSettings,
        review: {
          ...defaultUserSettings.review,
          targetRetention: 0.99,
        },
      }),
    ).toThrow()
    expect(() =>
      userSettingsSchema.parse({
        ...defaultUserSettings,
        assessment: {
          ...defaultUserSettings.assessment,
          timeTargetsMinutes: {
            ...defaultUserSettings.assessment.timeTargetsMinutes,
            easy: 9,
          },
        },
      }),
    ).toThrow()
    expect(() =>
      userSettingsSchema.parse({
        ...defaultUserSettings,
        assessment: {
          ...defaultUserSettings.assessment,
          timeTargetsMinutes: {
            ...defaultUserSettings.assessment.timeTargetsMinutes,
            hard: 61,
          },
        },
      }),
    ).toThrow()
    expect(() =>
      userSettingsSchema.parse({
        ...defaultUserSettings,
        assessment: {
          ...defaultUserSettings.assessment,
          timeTargetsMinutes: {
            easy: 35,
            medium: 35,
            hard: 50,
          },
        },
      }),
    ).toThrow()
    expect(() =>
      userSettingsSchema.parse({
        ...defaultUserSettings,
        assessment: {
          ...defaultUserSettings.assessment,
          strictTiming: true,
        },
      }),
    ).toThrow()
    expect(() =>
      userSettingsSchema.parse({
        ...defaultUserSettings,
        reminders: {
          daily: {
            enabled: true,
            time: '9:00',
          },
        },
      }),
    ).toThrow()
  })

  it('deep-merges nested settings patches without dropping siblings', () => {
    expect(
      mergeUserSettings(defaultUserSettings, {
        review: { order: 'weakestFirst' },
        assessment: { requireSolveTime: true, strictTiming: true },
      }),
    ).toEqual({
      ...defaultUserSettings,
      review: {
        ...defaultUserSettings.review,
        order: 'weakestFirst',
      },
      assessment: {
        ...defaultUserSettings.assessment,
        requireSolveTime: true,
        strictTiming: true,
      },
    })
  })

  it('creates minimal nested patches from saved settings and drafts', () => {
    const draft = {
      ...defaultUserSettings,
      practice: {
        ...defaultUserSettings.practice,
        dailyGoal: 8,
      },
      reminders: {
        daily: {
          ...defaultUserSettings.reminders.daily,
          enabled: true,
        },
      },
      assessment: {
        ...defaultUserSettings.assessment,
        timeTargetsMinutes: {
          ...defaultUserSettings.assessment.timeTargetsMinutes,
          medium: 40,
        },
      },
      overlay: {
        ...defaultUserSettings.overlay,
        autoDetectSolved: false,
      },
    }

    expect(createUserSettingsPatch(defaultUserSettings, draft)).toEqual({
      practice: { dailyGoal: 8 },
      reminders: { daily: { enabled: true } },
      assessment: { timeTargetsMinutes: { medium: 40 } },
      overlay: { autoDetectSolved: false },
    })
    expect(hasUserSettingsChanges(defaultUserSettings, draft)).toBe(true)
  })

  it('returns no patch when a draft matches saved settings', () => {
    expect(
      createUserSettingsPatch(defaultUserSettings, defaultUserSettings),
    ).toBeNull()
    expect(
      hasUserSettingsChanges(defaultUserSettings, defaultUserSettings),
    ).toBe(false)
  })
})

describe('aiAssessment settings', () => {
  it.each([
    { enabled: true },
    { enabled: false },
    { provider: 'gemini' },
    { model: 'custom-model' },
    {},
  ])('preserves absent AI patch fields when parsing %j', (aiAssessment) => {
    expect(userSettingsPatchSchema.parse({ aiAssessment })).toEqual({
      aiAssessment,
    })
  })

  it('keeps a saved Gemini connection when toggling assessment through a parsed patch', () => {
    const saved = {
      ...defaultUserSettings,
      aiAssessment: {
        enabled: false,
        provider: 'gemini' as const,
        model: 'custom-gemini',
      },
    }
    const patch = userSettingsPatchSchema.parse({
      aiAssessment: { enabled: true },
    })
    expect(mergeUserSettings(saved, patch).aiAssessment).toEqual({
      enabled: true,
      provider: 'gemini',
      model: 'custom-gemini',
    })
  })

  it('parses old rows missing the aiAssessment block by filling defaults', () => {
    const oldRow = {
      schemaVersion: 1,
      appearance: { themeMode: 'system' },
      practice: {
        dailyGoal: 4,
        mode: 'studyPlan',
        problemFilters: { skipPremium: false },
      },
      review: { targetRetention: 0.9, order: 'dueFirst' },
      assessment: {
        requireSolveTime: false,
        strictTiming: false,
        timeTargetsMinutes: { easy: 20, medium: 35, hard: 50 },
      },
      overlay: { autoDetectSolved: true },
      reminders: { daily: { enabled: false, time: '09:00' } },
    }
    const parsed = parseStoredUserSettings(oldRow)
    expect(parsed.aiAssessment).toEqual({
      enabled: false,
      provider: 'openai',
      model: '',
    })
  })

  it('defaultUserSettings.aiAssessment matches documented defaults', () => {
    expect(defaultUserSettings.aiAssessment).toEqual({
      enabled: false,
      provider: 'openai',
      model: '',
    })
  })

  it('merges an aiAssessment patch into existing settings', () => {
    const next = mergeUserSettings(defaultUserSettings, {
      aiAssessment: { enabled: true, model: 'gpt-test' },
    })
    expect(next.aiAssessment).toEqual({
      enabled: true,
      provider: 'openai',
      model: 'gpt-test',
    })
  })

  it('createUserSettingsPatch produces a diff containing changed aiAssessment fields only', () => {
    const draft = {
      ...defaultUserSettings,
      aiAssessment: {
        ...defaultUserSettings.aiAssessment,
        enabled: true,
        provider: 'anthropic' as const,
      },
    }
    const patch = createUserSettingsPatch(defaultUserSettings, draft)
    expect(patch).toEqual({
      aiAssessment: { enabled: true, provider: 'anthropic' },
    })
  })

  it('rejects an invalid provider value', () => {
    expect(() =>
      mergeUserSettings(defaultUserSettings, {
        // @ts-expect-error — invalid provider id, deliberately ill-typed
        aiAssessment: { provider: 'mistral' },
      }),
    ).toThrow()
  })
})
