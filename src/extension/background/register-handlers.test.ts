import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import {
  activeTrackSchema,
  backupFileSchema,
  backupSummarySchema,
  devSmokeReportSchema,
  queueRequestSchema,
  syncActionResultSchema,
  syncStatusSchema,
  trackForEditResponseSchema,
  tracksClearActiveTrackRequestSchema,
  tracksCreateTrackRequestSchema,
  tracksDeleteTrackRequestSchema,
  tracksGetTrackForEditRequestSchema,
  tracksGetWorkspaceRequestSchema,
  tracksRemoveProblemRequestSchema,
  tracksResetTrackProgressRequestSchema,
  tracksSetActiveTrackRequestSchema,
  tracksUpdateTrackRequestSchema,
  trackWorkspaceResponseSchema,
  todayQueueSchema,
} from '@/extension/messaging'
import {
  analysisIdentity,
  type AnalyzeLeetCodeSubmissionResponse,
} from '@/features/leetcode-review-assistant/api/code-analysis-contracts'
import {
  makeAnalysisRequest,
  makeValidAnalysis,
} from '@/features/leetcode-review-assistant/testing/code-analysis-fixtures'
import { AiDeadlineError, withAiDeadline } from '@/lib/ai/operation'
import {
  abortLeetCodeAnalyses,
  abortLeetCodeHints,
} from './leetcode-analysis-operations'
import {
  generateLeetCodeHintsRequestSchema,
  makeHintInputFingerprint,
  hintIdentity,
} from '@/features/leetcode-review-assistant/api/code-hint-contracts'
import type { PopupAppShellData } from '@/features/app-shell/api/app-shell-contracts'
import {
  backupSchemaVersion,
  createBackupSummary,
} from '@/features/backup/api/backup-contracts'
import { analyticsSummarySchema } from '@/features/analytics/api/analytics-contracts'
import { defaultUserSettings } from '@/features/settings/domain'
import type { ActiveTrack } from '@/features/tracks/domain'
import { createSerializedPracticeDetails } from '@/testing/practice-fixtures'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import {
  createProblemForEditResponse,
  createProblemLibraryResponse,
} from '@/testing/problem-fixtures'
import {
  createTrackForEditResponse,
  createTrackWorkspaceResponse,
} from '@/testing/track-fixtures'

import {
  registerBackgroundHandlers,
  serializeActiveTrack,
} from './register-handlers'

function createReadyHistoricalReadiness() {
  const historicalReadiness =
    createSerializedAnalyticsSummary().historicalReadiness

  return {
    ...historicalReadiness,
    requested: {
      ...historicalReadiness.requested,
      ready: true,
      failingReasons: [],
    },
    recommendedRange: null,
  }
}

const backgroundMocks = vi.hoisted(() => {
  const handlers = new Map<
    string,
    (message: { data: unknown; sender: unknown }) => unknown
  >()
  const db = { kind: 'test-db' }
  let syncAutoSyncDeps: unknown
  const alarmScheduler = {
    clear: vi.fn(),
    register: vi.fn(),
    repairStartupAlarms: vi.fn(),
    schedule: vi.fn(),
  }
  const syncAutoSync = {
    clearPendingAutomaticSync: vi.fn(),
    registerJobs: vi.fn(),
    requestOpenCheckAfterSurfaceOpen: vi.fn(),
    repairStartupAlarms: vi.fn(),
    runAutoPush: vi.fn(),
    runCleanPullCheck: vi.fn(),
    scheduleAutoPushAfterMutation: vi.fn(),
  }
  const dueNotification = {
    handleStartup: vi.fn(),
    onSettingsChanged: vi.fn(),
    registerJobs: vi.fn(),
    runDailyCheck: vi.fn(),
  }

  return {
    db,
    handlers,
    assertCanSenderCallExtensionMethod: vi.fn(),
    backupExportFullBackup: vi.fn(),
    backupResetLocalData: vi.fn(),
    backupRestoreFullBackup: vi.fn(),
    backupValidateFullBackup: vi.fn(),
    broadcastCacheInvalidation: vi.fn(),
    getAnalyticsSummary: vi.fn(),
    previewContentImport: vi.fn(),
    applyContentImport: vi.fn(),
    getTodayQueue: vi.fn(),
    flushDbSnapshot: vi.fn(),
    getActiveTrack: vi.fn(),
    getAppDb: vi.fn(),
    getAppShellData: vi.fn(),
    getProblemLibrary: vi.fn(),
    createProblem: vi.fn(),
    createTrack: vi.fn(),
    clearActiveTrack: vi.fn(),
    deleteTrack: vi.fn(),
    bulkUpdateProblems: vi.fn(),
    getPracticeDetails: vi.fn(),
    getTrackForEdit: vi.fn(),
    getWorkspace: vi.fn(),
    recordActiveTrackProblemCompletion: vi.fn(),
    overrideLastReviewResultWithTrackProgress: vi.fn(),
    overrideLastReviewResult: vi.fn(),
    resetPracticeSchedule: vi.fn(),
    removeTrackProblem: vi.fn(),
    resetTrackProgress: vi.fn(),
    saveReviewResultWithTrackProgress: vi.fn(),
    saveReviewResult: vi.fn(),
    setPracticeSuspended: vi.fn(),
    setActiveTrack: vi.fn(),
    getSettings: vi.fn(),
    getAiProviderSecretPresence: vi.fn(),
    getAiHintConnectionStatus: vi.fn(),
    generateLeetCodeHintsInBackground: vi.fn(),
    setAiProviderSecret: vi.fn(),
    clearAiProviderSecret: vi.fn(),
    loadActiveProviderConfig: vi.fn(),
    generateJson: vi.fn(),
    testAiConnection: vi.fn(),
    analyzeLeetCodeSubmissionInBackground:
      vi.fn<
        (typeof import('@/features/leetcode-review-assistant/server/analysis-runtime-service'))['analyzeLeetCodeSubmissionInBackground']
      >(),
    cycleThemeMode: vi.fn(),
    toggleStudyMode: vi.fn(),
    tabsCreate: vi.fn(),
    updateTrack: vi.fn(),
    onMessage: vi.fn(
      (
        method: string,
        handler: (message: { data: unknown; sender: unknown }) => unknown,
      ) => {
        handlers.set(method, handler)

        return () => undefined
      },
    ),
    updateSettings: vi.fn(),
    createBackgroundSyncService: vi.fn(),
    createAlarmScheduler: vi.fn(() => alarmScheduler),
    createSyncAutoSync: vi.fn((deps: unknown) => {
      syncAutoSyncDeps = deps

      return syncAutoSync
    }),
    readLatestSyncAutoSyncDeps: () => syncAutoSyncDeps,
    createDueNotification: vi.fn(() => dueNotification),
    readDueNotificationState: vi.fn(),
    writeDueNotificationState: vi.fn(),
    dueNotification,
    markSyncLocalDataChanged: vi.fn(),
    readSyncMetadata: vi.fn(),
    writeSyncMetadata: vi.fn(),
    readLeetCodeProblemContentInBackground: vi.fn(),
    readLeetCodeSubmissionResultInBackground: vi.fn(),
    alarmScheduler,
    syncAutoSync,
    syncService: {
      checkRemoteOnOpen: vi.fn(),
      connectGithubGist: vi.fn(),
      createGithubGist: vi.fn(),
      deleteGithubToken: vi.fn(),
      getStatus: vi.fn(),
      pullLatest: vi.fn(),
      pushLocal: vi.fn(),
      saveGithubToken: vi.fn(),
      setEnabled: vi.fn(),
      validateGithubToken: vi.fn(),
      validateStoredGithubToken: vi.fn(),
    },
  }
})
const extensionSender = { id: 'extension-id' }

vi.mock('@/extension/messaging', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/extension/messaging')>()

  return {
    ...actual,
    onMessage: backgroundMocks.onMessage,
  }
})

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getURL: (path: string) => `chrome-extension://extension-id${path}`,
    },
    tabs: {
      create: backgroundMocks.tabsCreate,
    },
  },
}))

vi.mock('@/features/app-shell/server/app-shell-service', () => ({
  getAppShellData: backgroundMocks.getAppShellData,
}))

vi.mock('@/features/analytics/server/analytics-service', () => ({
  getAnalyticsSummary: backgroundMocks.getAnalyticsSummary,
}))

vi.mock('@/features/imports/server/import-service', () => ({
  applyContentImport: backgroundMocks.applyContentImport,
  previewContentImport: backgroundMocks.previewContentImport,
}))

vi.mock('@/features/queue/server/queue-service', () => ({
  getTodayQueue: backgroundMocks.getTodayQueue,
}))

vi.mock('@/features/genai/server/genai-settings-service', () => ({
  getAiProviderSecretPresence: backgroundMocks.getAiProviderSecretPresence,
  getAiHintConnectionStatus: backgroundMocks.getAiHintConnectionStatus,
  setAiProviderSecret: backgroundMocks.setAiProviderSecret,
  clearAiProviderSecret: backgroundMocks.clearAiProviderSecret,
  loadActiveProviderConfig: backgroundMocks.loadActiveProviderConfig,
}))

vi.mock('@/features/genai/server/genai-connection-service', () => ({
  testAiConnection: backgroundMocks.testAiConnection,
}))

vi.mock('@/lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai')>()),
  generateJson: backgroundMocks.generateJson,
}))

vi.mock('@/features/backup/server/backup-service', () => ({
  exportFullBackup: backgroundMocks.backupExportFullBackup,
  resetLocalData: backgroundMocks.backupResetLocalData,
  restoreFullBackup: backgroundMocks.backupRestoreFullBackup,
  validateFullBackup: backgroundMocks.backupValidateFullBackup,
}))

vi.mock(
  '@/features/practice/server/practice-service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/practice/server/practice-service')
      >()

    return {
      ...actual,
      getPracticeDetails: backgroundMocks.getPracticeDetails,
      overrideLastReviewResultWithTrackProgress:
        backgroundMocks.overrideLastReviewResultWithTrackProgress,
      overrideLastReviewResult: backgroundMocks.overrideLastReviewResult,
      resetPracticeSchedule: backgroundMocks.resetPracticeSchedule,
      saveReviewResultWithTrackProgress:
        backgroundMocks.saveReviewResultWithTrackProgress,
      saveReviewResult: backgroundMocks.saveReviewResult,
      setPracticeSuspended: backgroundMocks.setPracticeSuspended,
    }
  },
)

vi.mock(
  '@/features/problems/server/problems-service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/problems/server/problems-service')
      >()

    return {
      ...actual,
      getProblemLibrary: backgroundMocks.getProblemLibrary,
      createProblem: backgroundMocks.createProblem,
      bulkUpdateProblems: backgroundMocks.bulkUpdateProblems,
    }
  },
)

vi.mock('@/features/tracks/server/tracks-service', () => ({
  createTrack: backgroundMocks.createTrack,
  deleteTrack: backgroundMocks.deleteTrack,
  getActiveTrack: backgroundMocks.getActiveTrack,
  getTrackForEdit: backgroundMocks.getTrackForEdit,
  getWorkspace: backgroundMocks.getWorkspace,
  recordActiveTrackProblemCompletion:
    backgroundMocks.recordActiveTrackProblemCompletion,
  removeTrackProblem: backgroundMocks.removeTrackProblem,
  resetTrackProgress: backgroundMocks.resetTrackProgress,
  setActiveTrack: backgroundMocks.setActiveTrack,
  clearActiveTrack: backgroundMocks.clearActiveTrack,
  updateTrack: backgroundMocks.updateTrack,
}))

vi.mock('@/features/settings/server/settings-service', () => ({
  cycleThemeMode: backgroundMocks.cycleThemeMode,
  getSettings: backgroundMocks.getSettings,
  toggleStudyMode: backgroundMocks.toggleStudyMode,
  updateSettings: backgroundMocks.updateSettings,
}))

vi.mock('@/features/sync/server/sync-service', () => ({
  createBackgroundSyncService: backgroundMocks.createBackgroundSyncService,
  markSyncLocalDataChanged: backgroundMocks.markSyncLocalDataChanged,
}))

vi.mock('@/features/sync/data/sync-metadata-store', () => ({
  readSyncMetadata: backgroundMocks.readSyncMetadata,
  writeSyncMetadata: backgroundMocks.writeSyncMetadata,
}))

vi.mock('@/platform/db', () => ({
  flushDbSnapshot: backgroundMocks.flushDbSnapshot,
}))

vi.mock('./app-db', () => ({
  getBackgroundDb: backgroundMocks.getAppDb,
}))

vi.mock('@/features/leetcode-capture/server/leetcode-capture-service', () => ({
  readLeetCodeProblemMetadataInBackground: vi.fn(),
  readLeetCodeProblemContentInBackground:
    backgroundMocks.readLeetCodeProblemContentInBackground,
  readLeetCodeSubmissionResultInBackground:
    backgroundMocks.readLeetCodeSubmissionResultInBackground,
}))

vi.mock(
  '@/features/leetcode-review-assistant/server/analysis-runtime-service',
  () => ({
    analyzeLeetCodeSubmissionInBackground:
      backgroundMocks.analyzeLeetCodeSubmissionInBackground,
  }),
)

vi.mock(
  '@/features/leetcode-review-assistant/server/hint-runtime-service',
  () => ({
    generateLeetCodeHintsInBackground:
      backgroundMocks.generateLeetCodeHintsInBackground,
  }),
)

vi.mock('./cache-invalidation-broadcaster', () => ({
  broadcastCacheInvalidation: backgroundMocks.broadcastCacheInvalidation,
}))

vi.mock('./runtime-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-policy')>()),
  assertCanSenderCallExtensionMethod:
    backgroundMocks.assertCanSenderCallExtensionMethod,
}))

vi.mock('./scheduler/alarm-scheduler', () => ({
  createAlarmScheduler: backgroundMocks.createAlarmScheduler,
}))

vi.mock('./sync-auto-sync', () => ({
  createSyncAutoSync: backgroundMocks.createSyncAutoSync,
}))

vi.mock('./due-notification', () => ({
  createDueNotification: backgroundMocks.createDueNotification,
  readDueNotificationState: backgroundMocks.readDueNotificationState,
  writeDueNotificationState: backgroundMocks.writeDueNotificationState,
}))

describe('background handler registration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    backgroundMocks.handlers.clear()
    vi.clearAllMocks()
    backgroundMocks.broadcastCacheInvalidation.mockResolvedValue(null)
    backgroundMocks.previewContentImport.mockResolvedValue({
      status: 'ready',
      fingerprint: 'a'.repeat(64),
      additions: {
        problems: 1,
        topics: 0,
        companies: 0,
        problemTopics: 0,
        problemCompanies: 0,
        tracks: 0,
        groups: 0,
        memberships: 0,
      },
      items: [],
      diagnostics: [],
    })
    backgroundMocks.applyContentImport.mockResolvedValue({
      status: 'committed',
      preview: {
        status: 'ready',
        fingerprint: 'a'.repeat(64),
        additions: {
          problems: 1,
          topics: 0,
          companies: 0,
          problemTopics: 0,
          problemCompanies: 0,
          tracks: 0,
          groups: 0,
          memberships: 0,
        },
        items: [],
        diagnostics: [],
      },
    })
    backgroundMocks.getAnalyticsSummary.mockResolvedValue({
      ...createSerializedAnalyticsSummary(),
      range: 30,
      generatedAt: '2026-01-15T12:00:00.000Z',
      timeFrame: {
        ...createSerializedAnalyticsSummary().timeFrame,
        asOf: '2026-01-15T12:00:00.000Z',
        requestedDays: 30,
      },
      reviewDays: 3,
      totalReviews: 12,
      currentStreak: 2,
      observedRatingQuality: 0.75,
      observedRatingQualityLabel: '75%',
      observedRatingSampleSize: 12,
      lowSample: false,
      targetRetention: 0.9,
      predictedRecall: { value: 0.86, sampleSize: 12, lowSample: false },
      historicalReadiness: createReadyHistoricalReadiness(),
      recallQuality: [],
      practiceRhythm: [],
      ratingsMix: [],
      hardAgain: {
        selectedShare: null,
        previousShare: null,
        delta: null,
        direction: null,
        sampleSize: 0,
        previousSampleSize: 0,
        lowSample: true,
        previousLowSample: true,
      },
      topics: [],
      stability: [],
    })
    backgroundMocks.backupExportFullBackup.mockResolvedValue(validBackup)
    backgroundMocks.backupResetLocalData.mockResolvedValue(null)
    backgroundMocks.backupRestoreFullBackup.mockResolvedValue(
      validBackupSummary,
    )
    backgroundMocks.backupValidateFullBackup.mockReturnValue(validBackupSummary)
    backgroundMocks.flushDbSnapshot.mockResolvedValue(undefined)
    backgroundMocks.getAppDb.mockResolvedValue({ db: backgroundMocks.db })
    backgroundMocks.getTodayQueue.mockResolvedValue(todayQueue)
    backgroundMocks.getProblemLibrary.mockResolvedValue(problemLibraryResponse)
    backgroundMocks.createProblem.mockResolvedValue(problemForEditResponse)
    backgroundMocks.createTrack.mockResolvedValue(trackForEditResponse)
    backgroundMocks.deleteTrack.mockResolvedValue(undefined)
    backgroundMocks.bulkUpdateProblems.mockResolvedValue(undefined)
    backgroundMocks.getPracticeDetails.mockResolvedValue(practiceDetails)
    backgroundMocks.getTrackForEdit.mockResolvedValue(trackForEditResponse)
    backgroundMocks.getWorkspace.mockResolvedValue(trackWorkspaceResponse)
    backgroundMocks.recordActiveTrackProblemCompletion.mockResolvedValue(false)
    backgroundMocks.overrideLastReviewResultWithTrackProgress.mockResolvedValue(
      undefined,
    )
    backgroundMocks.resetPracticeSchedule.mockResolvedValue(practiceDetails)
    backgroundMocks.resetTrackProgress.mockResolvedValue(undefined)
    backgroundMocks.saveReviewResultWithTrackProgress.mockResolvedValue(
      undefined,
    )
    backgroundMocks.saveReviewResult.mockResolvedValue(undefined)
    backgroundMocks.setPracticeSuspended.mockResolvedValue(practiceDetails)
    backgroundMocks.setActiveTrack.mockResolvedValue(undefined)
    backgroundMocks.clearActiveTrack.mockResolvedValue(undefined)
    backgroundMocks.getSettings.mockResolvedValue(defaultUserSettings)
    backgroundMocks.getAiProviderSecretPresence.mockResolvedValue({
      openai: false,
      anthropic: false,
      gemini: false,
      openrouter: false,
    })
    backgroundMocks.setAiProviderSecret.mockImplementation(
      async (
        _provider: unknown,
        _secret: unknown,
        afterPersist?: () => Promise<void>,
      ) => {
        await afterPersist?.()
        return {
          openai: true,
          anthropic: false,
          gemini: false,
          openrouter: false,
        }
      },
    )
    backgroundMocks.clearAiProviderSecret.mockImplementation(
      async (_provider: unknown, afterPersist?: () => Promise<void>) => {
        await afterPersist?.()
        return {
          openai: false,
          anthropic: false,
          gemini: false,
          openrouter: false,
        }
      },
    )
    backgroundMocks.loadActiveProviderConfig.mockResolvedValue(null)
    backgroundMocks.generateJson.mockResolvedValue({
      status: 'success',
      data: { ok: true },
      providerMetadata: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        durationMs: 25,
      },
    })
    backgroundMocks.cycleThemeMode.mockResolvedValue(defaultUserSettings)
    backgroundMocks.toggleStudyMode.mockResolvedValue(defaultUserSettings)
    backgroundMocks.tabsCreate.mockResolvedValue({})
    backgroundMocks.updateSettings.mockResolvedValue(defaultUserSettings)
    backgroundMocks.createBackgroundSyncService.mockReturnValue(
      backgroundMocks.syncService,
    )
    backgroundMocks.createAlarmScheduler.mockReturnValue(
      backgroundMocks.alarmScheduler,
    )
    backgroundMocks.createSyncAutoSync.mockReturnValue(
      backgroundMocks.syncAutoSync,
    )
    backgroundMocks.markSyncLocalDataChanged.mockResolvedValue(
      cleanSyncMetadata,
    )
    backgroundMocks.readSyncMetadata.mockResolvedValue(cleanSyncMetadata)
    backgroundMocks.writeSyncMetadata.mockResolvedValue(cleanSyncMetadata)
    backgroundMocks.alarmScheduler.clear.mockResolvedValue(true)
    backgroundMocks.alarmScheduler.repairStartupAlarms.mockResolvedValue(
      undefined,
    )
    backgroundMocks.alarmScheduler.schedule.mockResolvedValue(undefined)
    backgroundMocks.syncAutoSync.clearPendingAutomaticSync.mockResolvedValue(
      undefined,
    )
    backgroundMocks.syncAutoSync.repairStartupAlarms.mockResolvedValue(
      undefined,
    )
    backgroundMocks.syncAutoSync.runAutoPush.mockResolvedValue(undefined)
    backgroundMocks.syncAutoSync.runCleanPullCheck.mockResolvedValue(undefined)
    backgroundMocks.syncAutoSync.requestOpenCheckAfterSurfaceOpen.mockResolvedValue(
      undefined,
    )
    backgroundMocks.syncAutoSync.scheduleAutoPushAfterMutation.mockResolvedValue(
      undefined,
    )
    backgroundMocks.syncService.connectGithubGist.mockResolvedValue(
      syncActionResult,
    )
    backgroundMocks.syncService.checkRemoteOnOpen.mockResolvedValue(
      syncOpenCheckResult,
    )
    backgroundMocks.syncService.createGithubGist.mockResolvedValue(
      syncActionResult,
    )
    backgroundMocks.syncService.deleteGithubToken.mockResolvedValue(
      syncActionResult,
    )
    backgroundMocks.syncService.getStatus.mockResolvedValue(syncStatus)
    backgroundMocks.syncService.pullLatest.mockResolvedValue(syncActionResult)
    backgroundMocks.syncService.pushLocal.mockResolvedValue(syncActionResult)
    backgroundMocks.syncService.saveGithubToken.mockResolvedValue(
      syncActionResult,
    )
    backgroundMocks.syncService.setEnabled.mockResolvedValue(syncActionResult)
    backgroundMocks.syncService.validateGithubToken.mockResolvedValue(
      syncActionResult,
    )
    backgroundMocks.dueNotification.handleStartup.mockResolvedValue(undefined)
    backgroundMocks.dueNotification.onSettingsChanged.mockResolvedValue(
      undefined,
    )
    backgroundMocks.dueNotification.registerJobs.mockReturnValue(undefined)
    backgroundMocks.dueNotification.runDailyCheck.mockResolvedValue(undefined)
    backgroundMocks.createDueNotification.mockReturnValue(
      backgroundMocks.dueNotification,
    )
    backgroundMocks.readDueNotificationState.mockResolvedValue({
      lastNotifiedDate: null,
    })
    backgroundMocks.writeDueNotificationState.mockResolvedValue(undefined)
    backgroundMocks.syncService.validateStoredGithubToken.mockResolvedValue(
      syncActionResult,
    )
  })

  afterEach(() => {
    abortLeetCodeAnalyses()
    abortLeetCodeHints()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it.each([
    ['genai.getAiProviderSecretPresence', { surface: 'dashboard' }],
    [
      'genai.setAiProviderSecret',
      {
        surface: 'dashboard',
        provider: 'gemini',
        secret: { apiKey: 'fake-key' },
      },
    ],
    [
      'genai.clearAiProviderSecret',
      { surface: 'dashboard', provider: 'gemini' },
    ],
  ])(
    'runs %s without opening the database or marking sync dirty',
    async (method, request) => {
      backgroundMocks.getAppDb.mockRejectedValue(
        new Error('database unavailable'),
      )
      await expect(sendRuntimeMessage(method, request)).resolves.toBeDefined()
      expect(backgroundMocks.getAppDb).not.toHaveBeenCalled()
      expect(backgroundMocks.flushDbSnapshot).not.toHaveBeenCalled()
      expect(backgroundMocks.markSyncLocalDataChanged).not.toHaveBeenCalled()
      if (method !== 'genai.getAiProviderSecretPresence') {
        expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith(
          {
            reason: 'genai-updated',
            source: 'dashboard',
            tags: ['genai'],
            hintProvider: 'gemini',
          },
        )
      }
    },
  )

  it('adds GenAI invalidation only to AI Settings patches', async () => {
    backgroundMocks.updateSettings.mockResolvedValue({
      ...defaultUserSettings,
      aiAssessment: {
        ...defaultUserSettings.aiAssessment,
        model: 'gemini-test',
      },
    })
    await sendRuntimeMessage('settings.updateSettings', {
      surface: 'dashboard',
      patch: { aiAssessment: { model: 'gemini-test' } },
    })
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      reason: 'settings-updated',
      source: 'dashboard',
      tags: ['settings', 'genai'],
      hintConnectionChanged: true,
    })
  })

  it('preserves hint connection for automatic enabled-only toggles', async () => {
    const enabled = !defaultUserSettings.aiAssessment.enabled
    backgroundMocks.updateSettings.mockResolvedValue({
      ...defaultUserSettings,
      aiAssessment: { ...defaultUserSettings.aiAssessment, enabled },
    })
    await sendRuntimeMessage('settings.updateSettings', {
      surface: 'dashboard',
      patch: { aiAssessment: { enabled } },
    })
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      reason: 'settings-updated',
      source: 'dashboard',
      tags: ['settings', 'genai'],
      hintConnectionChanged: false,
    })
  })

  describe('manual hint handlers', () => {
    const sender = {
      tab: { id: 7 },
      frameId: 0,
      url: 'https://leetcode.com/problems/two-sum/',
    }
    const problem = {
      host: 'leetcode.com' as const,
      slug: 'two-sum',
      title: 'Two Sum',
      statement: 'Find two indices.',
      examples: [],
      constraints: [],
    }
    const request = generateLeetCodeHintsRequestSchema.parse({
      surface: 'content-script',
      requestId: 'hint-1',
      problemSlug: problem.slug,
      problem,
      inputFingerprint: makeHintInputFingerprint(problem),
      connectionRevision: '00000000-0000-4000-8000-000000000001',
      connectionProvider: 'gemini',
    })
    const response = {
      status: 'ready',
      ...hintIdentity(request),
      batch: { hints: ['Consider lookup.'] },
    }
    beforeEach(async () => {
      const actual =
        await vi.importActual<typeof import('./runtime-policy')>(
          './runtime-policy',
        )
      backgroundMocks.assertCanSenderCallExtensionMethod.mockImplementation(
        actual.assertCanSenderCallExtensionMethod,
      )
      backgroundMocks.generateLeetCodeHintsInBackground
        .mockReset()
        .mockResolvedValue(response)
      backgroundMocks.getAiHintConnectionStatus.mockReset().mockResolvedValue({
        available: true,
        provider: 'gemini',
        revision: request.connectionRevision,
      })
    })
    afterEach(() =>
      backgroundMocks.assertCanSenderCallExtensionMethod.mockReset(),
    )

    it('rejects a different actual problem before database or provider work', () => {
      const other = { ...problem, slug: 'three-sum' }
      const mismatch = {
        ...request,
        problem: other,
        problemSlug: other.slug,
        inputFingerprint: makeHintInputFingerprint(other),
      }
      expect(() =>
        sendRuntimeMessage('genai.generateLeetCodeHints', mismatch, sender),
      ).toThrow(/must match/)
      expect(backgroundMocks.getAppDb).not.toHaveBeenCalled()
      expect(
        backgroundMocks.generateLeetCodeHintsInBackground,
      ).not.toHaveBeenCalled()
      expect(backgroundMocks.getAiHintConnectionStatus).not.toHaveBeenCalled()
    })
    it('uses strict hint responses and direct sender-owned cancellation without persistence', async () => {
      await expect(
        sendRuntimeMessage('genai.generateLeetCodeHints', request, sender),
      ).resolves.toEqual(response)
      expect(
        backgroundMocks.generateLeetCodeHintsInBackground,
      ).toHaveBeenCalledWith(
        request,
        expect.any(Function),
        expect.any(AbortSignal),
      )
      expect(
        sendRuntimeMessage(
          'genai.cancelLeetCodeHints',
          { surface: 'content-script', requestId: request.requestId },
          { ...sender, url: 'https://leetcode.com/explore/' },
        ),
      ).toEqual({ requestId: request.requestId, cancelled: false })
      backgroundMocks.generateLeetCodeHintsInBackground.mockResolvedValue({
        ...response,
        private: 'secret',
      })
      await expect(
        sendRuntimeMessage('genai.generateLeetCodeHints', request, sender),
      ).rejects.toThrow()
      expect(backgroundMocks.flushDbSnapshot).not.toHaveBeenCalled()
      expect(backgroundMocks.markSyncLocalDataChanged).not.toHaveBeenCalled()
      expect(backgroundMocks.broadcastCacheInvalidation).not.toHaveBeenCalled()
    })
    it('loads only strict public connection metadata', async () => {
      await expect(
        sendRuntimeMessage(
          'genai.getHintConnection',
          { surface: 'content-script' },
          sender,
        ),
      ).resolves.toEqual({
        available: true,
        provider: 'gemini',
        revision: request.connectionRevision,
      })
      expect(backgroundMocks.getAiHintConnectionStatus).toHaveBeenCalledWith(
        backgroundMocks.db,
      )
      backgroundMocks.getAiHintConnectionStatus.mockResolvedValue({
        available: true,
        provider: 'gemini',
        revision: request.connectionRevision,
        private: 'secret',
      })
      await expect(
        sendRuntimeMessage(
          'genai.getHintConnection',
          { surface: 'content-script' },
          sender,
        ),
      ).rejects.toThrow(
        'Saved AI connection could not be loaded. Please retry.',
      )
    })
    it('bounds metadata database preparation and hides private failures', async () => {
      backgroundMocks.getAppDb.mockReturnValue(new Promise(() => {}))
      const pending = Promise.resolve(
        sendRuntimeMessage(
          'genai.getHintConnection',
          { surface: 'content-script' },
          sender,
        ),
      )
      const assertion = expect(pending).rejects.toThrow(
        'Saved AI connection could not be loaded. Please retry.',
      )
      await vi.advanceTimersByTimeAsync(20000)
      await assertion
      expect(backgroundMocks.getAiHintConnectionStatus).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('sender-owned submission analysis handlers', () => {
    const sender = {
      tab: { id: 7 },
      frameId: 0,
      url: 'https://leetcode.com/problems/two-sum/',
    }
    const request = makeAnalysisRequest()
    const ready = (): AnalyzeLeetCodeSubmissionResponse => ({
      status: 'ready',
      ...analysisIdentity(request),
      report: makeValidAnalysis(),
      providerMetadata: {
        provider: 'openai',
        model: 'gpt-test',
        durationMs: 1,
      },
    })

    const analyzeMock = backgroundMocks.analyzeLeetCodeSubmissionInBackground
    const analyze = (data: unknown = request, from: unknown = sender) =>
      sendRuntimeMessage('genai.analyzeLeetCodeSubmission', data, from)
    const cancel = (requestId = request.requestId, from: unknown = sender) =>
      sendRuntimeMessage(
        'genai.cancelLeetCodeAnalysis',
        { surface: 'content-script', requestId },
        from,
      )

    beforeEach(async () => {
      const actualPolicy =
        await vi.importActual<typeof import('./runtime-policy')>(
          './runtime-policy',
        )
      backgroundMocks.assertCanSenderCallExtensionMethod.mockImplementation(
        actualPolicy.assertCanSenderCallExtensionMethod,
      )
      analyzeMock.mockReset().mockResolvedValue(ready())
    })
    afterEach(() => {
      backgroundMocks.assertCanSenderCallExtensionMethod.mockReset()
    })

    it('validates analysis and cancel outputs and avoids persistence or invalidation', async () => {
      await expect(analyze()).resolves.toEqual(ready())
      expectRuntimePolicy(
        'genai.analyzeLeetCodeSubmission',
        'content-script',
        sender,
      )
      expect(analyzeMock).toHaveBeenCalledWith(
        request,
        expect.any(Function),
        expect.any(AbortSignal),
      )
      expect(await cancel()).toEqual({
        requestId: request.requestId,
        cancelled: false,
      })
      expectRuntimePolicy(
        'genai.cancelLeetCodeAnalysis',
        'content-script',
        sender,
      )
      expect(backgroundMocks.broadcastCacheInvalidation).not.toHaveBeenCalled()
      expect(backgroundMocks.flushDbSnapshot).not.toHaveBeenCalled()
      expect(backgroundMocks.markSyncLocalDataChanged).not.toHaveBeenCalled()
      analyzeMock.mockResolvedValue(
        Object.assign(ready(), { apiKey: 'fake-private-key' }),
      )
      await expect(analyze()).rejects.toThrow()
    })

    it.each([
      {},
      {
        url: 'chrome-extension://extension-id/dashboard.html',
        tab: { id: 7 },
        frameId: 0,
      },
      { url: 'chrome-extension://extension-id/popup.html' },
      {
        tab: { id: 7 },
        frameId: 0,
        url: 'https://example.com/problems/two-sum/',
      },
      { frameId: 0, url: 'https://leetcode.com/problems/two-sum/' },
      { tab: { id: 7 }, url: 'https://leetcode.com/problems/two-sum/' },
    ])(
      'rejects unauthorized or incomplete actual sender %j for both methods',
      (untrusted) => {
        expect(() => analyze(request, untrusted)).toThrow()
        expect(() => cancel(request.requestId, untrusted)).toThrow()
        expect(analyzeMock).not.toHaveBeenCalled()
        expect(backgroundMocks.getAppDb).not.toHaveBeenCalled()
      },
    )

    it.each([
      { ...request, surface: 'dashboard' },
      { ...request, owner: '7:0' },
      { ...request, frameId: 0 },
      { ...request, apiKey: 'fake-private-key' },
      { ...request, submissionId: 'bad-id' },
    ])('rejects spoofed or malformed analysis payloads', (payload) => {
      expect(() => analyze(payload)).toThrow()
      expect(analyzeMock).not.toHaveBeenCalled()
    })

    it('rejects malformed cancellation payloads', () => {
      for (const payload of [
        { surface: 'dashboard', requestId: request.requestId },
        {
          surface: 'content-script',
          requestId: request.requestId,
          owner: '7:0',
        },
        { surface: 'content-script', requestId: '' },
      ])
        expect(() =>
          sendRuntimeMessage('genai.cancelLeetCodeAnalysis', payload, sender),
        ).toThrow()
    })

    it('registers ownership before database preparation and cancels while getAppDb is unresolved', async () => {
      backgroundMocks.getAppDb.mockReturnValue(new Promise(() => {}))
      analyzeMock.mockImplementation(async (input, loadDb, signal) => {
        try {
          return await withAiDeadline(
            { timeoutMs: 30_000, signal },
            async (boundedSignal) => {
              await loadDb()
              boundedSignal.throwIfAborted()
              return ready()
            },
          )
        } catch (error) {
          if (!(error instanceof AiDeadlineError)) throw error
          return {
            status: 'error',
            ...analysisIdentity(input),
            code: error.code,
            message: 'Controlled cancellation.',
          }
        }
      })
      const pending = analyze()
      await vi.advanceTimersByTimeAsync(0)
      expect(backgroundMocks.getAppDb).toHaveBeenCalledTimes(1)
      expect(cancel()).toEqual({
        requestId: request.requestId,
        cancelled: true,
      })
      await expect(pending).resolves.toMatchObject({
        status: 'error',
        code: 'cancelled',
      })
      expect(vi.getTimerCount()).toBe(0)
    })

    it('shares active duplicates, supersedes older work, and isolates actual frames and tabs', async () => {
      const signals: AbortSignal[] = []
      const finishes: Array<() => void> = []
      analyzeMock.mockImplementation((input, _loadDb, signal) => {
        signals.push(signal)
        return new Promise((resolve) => {
          finishes.push(() =>
            resolve({ ...ready(), ...analysisIdentity(input) }),
          )
        })
      })
      const first = analyze()
      const duplicate = analyze()
      expect(duplicate).toBe(first)
      await vi.advanceTimersByTimeAsync(0)
      expect(analyzeMock).toHaveBeenCalledTimes(1)
      const otherFrame = analyze(request, { ...sender, frameId: 1 })
      const otherTab = analyze(request, { ...sender, tab: { id: 8 } })
      await vi.advanceTimersByTimeAsync(0)
      const newerRequest = { ...request, requestId: 'new-request' }
      const newer = analyze(newerRequest)
      expect(signals.map((signal) => signal.aborted)).toEqual([
        true,
        false,
        false,
      ])
      expect(cancel()).toMatchObject({ cancelled: false })
      await vi.advanceTimersByTimeAsync(0)
      finishes[0]!()
      await first
      expect(
        cancel(newerRequest.requestId, {
          ...sender,
          url: 'https://leetcode.com/explore/',
        }),
      ).toMatchObject({ cancelled: true })
      expect(signals.map((signal) => signal.aborted)).toEqual([
        true,
        false,
        false,
        true,
      ])
      finishes.slice(1).forEach((finish) => finish())
      await Promise.all([otherFrame, otherTab, newer])
    })

    it('registers every protocol request method', async () => {
      const { extensionMethodNames } =
        await vi.importActual<typeof import('./runtime-policy')>(
          './runtime-policy',
        )
      registerBackgroundHandlers()
      expect([...backgroundMocks.handlers.keys()].sort()).toEqual(
        extensionMethodNames
          .filter((method) => method !== 'cache.invalidate')
          .sort(),
      )
    })
  })

  it('registers the fixed connection service with a lazy database loader and validates its response', async () => {
    const request = {
      surface: 'dashboard',
      provider: 'gemini',
      model: 'gemini-test',
    }
    backgroundMocks.testAiConnection.mockResolvedValue({
      status: 'success',
      provider: 'gemini',
      model: 'gemini-test',
      durationMs: 1,
    })
    await expect(
      sendRuntimeMessage('genai.testConnection', request),
    ).resolves.toMatchObject({ status: 'success' })
    expectRuntimePolicy('genai.testConnection', 'dashboard')
    expect(backgroundMocks.getAppDb).not.toHaveBeenCalled()
    expect(backgroundMocks.testAiConnection).toHaveBeenCalledWith(
      request,
      expect.any(Function),
    )
    backgroundMocks.testAiConnection.mockResolvedValue({
      status: 'success',
      provider: 'gemini',
      model: 'gemini-test',
      durationMs: 1,
      apiKey: 'fake-key',
    })
    await expect(
      sendRuntimeMessage('genai.testConnection', request),
    ).rejects.toThrow()
    expect(() =>
      sendRuntimeMessage('genai.testConnection', {
        ...request,
        apiKey: 'fake-key',
      }),
    ).toThrow()
  })

  it('registers and repairs sync auto-sync alarm jobs on startup', () => {
    registerBackgroundHandlers()

    expect(backgroundMocks.syncAutoSync.registerJobs).toHaveBeenCalledTimes(1)
    expect(
      backgroundMocks.syncAutoSync.repairStartupAlarms,
    ).toHaveBeenCalledTimes(1)
  })

  it('registers due-notification jobs and fires startup handler on startup', () => {
    registerBackgroundHandlers()

    expect(backgroundMocks.dueNotification.registerJobs).toHaveBeenCalledTimes(
      1,
    )
    expect(backgroundMocks.dueNotification.handleStartup).toHaveBeenCalledTimes(
      1,
    )
  })

  it('registers app-shell payload handling with policy and schema parsing', async () => {
    const popupData = createPopupShellData()
    backgroundMocks.getAppShellData.mockResolvedValue(popupData)

    const response = await sendRuntimeMessage('app.getShellData', {
      surface: 'popup',
    })

    expectRuntimePolicy('app.getShellData', 'popup')
    expect(backgroundMocks.getAppDb).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.getAppShellData).toHaveBeenCalledWith(
      backgroundMocks.db,
      { surface: 'popup' },
    )
    expect(response).toMatchObject({
      surface: 'popup',
      activeTrack: {
        dueAt: '2026-03-01T00:00:00.000Z',
      },
    })
  })

  it('registers analytics summary handling with dashboard policy and response parsing', async () => {
    const response = await sendRuntimeMessage('analytics.getSummary', {
      surface: 'dashboard',
      range: 30,
      timeZone: 'America/New_York',
      at: '2026-01-15T12:00:00.000Z',
    })

    expectRuntimePolicy('analytics.getSummary', 'dashboard')
    expect(backgroundMocks.getAppDb).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.getAnalyticsSummary).toHaveBeenCalledWith(
      backgroundMocks.db,
      {
        range: 30,
        now: new Date('2026-01-15T12:00:00.000Z'),
        timeZone: 'America/New_York',
      },
    )
    expect(response).toMatchObject({
      generatedAt: '2026-01-15T12:00:00.000Z',
      reviewDays: 3,
      totalReviews: 12,
      currentStreak: 2,
      observedRatingQuality: {
        value: 0.75,
        sampleSize: 12,
        lowSample: false,
      },
      historicalReadiness: {
        requested: { ready: true },
      },
    })
    const parsedResponse = analyticsSummarySchema.parse(response)
    expect(parsedResponse.historicalReadiness.requested.ready).toBe(true)
    expect(parsedResponse.predictedRecall).toEqual({
      value: 0.86,
      sampleSize: 12,
      lowSample: false,
    })
  })

  it('passes range without an undefined now option when at is absent', async () => {
    await sendRuntimeMessage('analytics.getSummary', {
      surface: 'dashboard',
      range: 14,
      timeZone: 'UTC',
    })

    expect(backgroundMocks.getAnalyticsSummary).toHaveBeenCalledWith(
      backgroundMocks.db,
      { range: 14, timeZone: 'UTC' },
    )
  })

  it('preserves requested timezone grouping across a DST boundary', async () => {
    const fixture = createSerializedAnalyticsSummary({
      range: 14,
      timeFrame: {
        ...createSerializedAnalyticsSummary().timeFrame,
        requestedDays: 14,
      },
      historicalReadiness: createReadyHistoricalReadiness(),
      views: {
        ...createSerializedAnalyticsSummary().views,
        upcomingReviewLoad: {
          scale: { domain: [0, 1], ticks: [0, 1] },
          rows: Array.from({ length: 14 }, (_, index) => ({
            date: `2026-03-${String(8 + index).padStart(2, '0')}`,
            dueCount: index === 0 ? 1 : 0,
            overdueCount: 0,
            today: index === 0,
          })),
        },
      },
    })

    backgroundMocks.getAnalyticsSummary.mockResolvedValueOnce({
      ...fixture,
      observedRatingQuality: 0.75,
      observedRatingSampleSize: 12,
      lowSample: false,
    })

    const response = await sendRuntimeMessage('analytics.getSummary', {
      surface: 'dashboard',
      range: 14,
      timeZone: 'America/New_York',
      at: '2026-03-08T05:30:00.000Z',
    })

    expect(backgroundMocks.getAnalyticsSummary).toHaveBeenCalledWith(
      backgroundMocks.db,
      {
        range: 14,
        now: new Date('2026-03-08T05:30:00.000Z'),
        timeZone: 'America/New_York',
      },
    )
    const parsed = analyticsSummarySchema.parse(response)

    expect(parsed.range).toBe(14)
    expect(parsed.views.upcomingReviewLoad.rows[0]).toMatchObject({
      date: '2026-03-08',
      dueCount: 1,
      today: true,
    })
  })

  it('does not expose low-sample observed rating quality as 0%', async () => {
    backgroundMocks.getAnalyticsSummary.mockResolvedValueOnce({
      ...createSerializedAnalyticsSummary(),
      range: 90,
      generatedAt: '2026-01-15T12:00:00.000Z',
      timeFrame: {
        ...createSerializedAnalyticsSummary().timeFrame,
        asOf: '2026-01-15T12:00:00.000Z',
        requestedDays: 90,
      },
      reviewDays: 3,
      totalReviews: 4,
      currentStreak: 1,
      observedRatingQuality: null,
      observedRatingQualityLabel: '—',
      observedRatingSampleSize: 4,
      lowSample: true,
      targetRetention: 0.9,
      historicalReadiness: createReadyHistoricalReadiness(),
      predictedRecall: { value: null, sampleSize: 0, lowSample: true },
      recallQuality: [],
      practiceRhythm: [],
      ratingsMix: [],
      hardAgain: {
        selectedShare: null,
        previousShare: null,
        delta: null,
        direction: null,
        sampleSize: 0,
        previousSampleSize: 0,
        lowSample: true,
        previousLowSample: true,
      },
      topics: [],
      stability: [],
    })

    const response = analyticsSummarySchema.parse(
      await sendRuntimeMessage('analytics.getSummary', {
        surface: 'dashboard',
        range: 90,
        timeZone: 'UTC',
      }),
    )

    expect(response.observedRatingQuality.value).toBeNull()
    expect(response.observedRatingQuality.value).not.toBe(0)
  })

  it('serializes current and forecast analytics when the selected historical range is unready', async () => {
    const fixture = createSerializedAnalyticsSummary({
      range: 90,
      timeFrame: {
        ...createSerializedAnalyticsSummary().timeFrame,
        requestedDays: 90,
      },
      historicalReadiness: {
        ...createSerializedAnalyticsSummary().historicalReadiness,
        requested: {
          ...createSerializedAnalyticsSummary().historicalReadiness.requested,
          requestedDays: 90,
          ready: false,
        },
      },
    })
    backgroundMocks.getAnalyticsSummary.mockResolvedValueOnce({
      ...fixture,
      observedRatingQuality: null,
      observedRatingQualityLabel: '—',
      lowSample: true,
    })

    const response = analyticsSummarySchema.parse(
      await sendRuntimeMessage('analytics.getSummary', {
        surface: 'dashboard',
        range: 90,
        timeZone: 'UTC',
      }),
    )

    expect(response.range).toBe(90)
    expect(response.historicalReadiness.requested.ready).toBe(false)
    expect(response.views.upcomingReviewLoad.rows).toHaveLength(14)
  })

  it('registers dev smoke handling with dashboard policy and response parsing', async () => {
    backgroundMocks.getSettings.mockResolvedValue({
      ...defaultUserSettings,
      reminders: {
        daily: {
          enabled: true,
          time: '09:00',
        },
      },
    })
    backgroundMocks.readDueNotificationState.mockResolvedValue({
      lastNotifiedDate: '2026-06-06',
    })

    const response = await sendRuntimeMessage('devSmoke.run', {
      surface: 'dashboard',
    })
    const report = devSmokeReportSchema.parse(response)

    expectRuntimePolicy('devSmoke.run', 'dashboard')
    expect(backgroundMocks.getAppDb).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.getSettings).toHaveBeenCalledWith(backgroundMocks.db)
    expect(backgroundMocks.getAnalyticsSummary).toHaveBeenCalledWith(
      backgroundMocks.db,
    )
    expect(backgroundMocks.getTodayQueue).toHaveBeenCalledWith(
      backgroundMocks.db,
      expect.any(Date),
    )
    expect(backgroundMocks.getAiProviderSecretPresence).toHaveBeenCalledWith()
    expect(backgroundMocks.loadActiveProviderConfig).not.toHaveBeenCalled()
    expect(backgroundMocks.readDueNotificationState).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.writeDueNotificationState).not.toHaveBeenCalled()
    expect(report.checks.map((check) => check.id)).toEqual([
      'health',
      'analytics',
      'queue',
      'notifications',
      'genai.config',
      'genai.live',
    ])
    expect(
      report.checks.find((check) => check.id === 'notifications'),
    ).toMatchObject({
      status: 'pass',
      detail: 'Would send a 09:00 reminder for 1 due review.',
    })
  })

  it('reports the selected GenAI provider and model when the secret is missing', async () => {
    backgroundMocks.getSettings.mockResolvedValue({
      ...defaultUserSettings,
      aiAssessment: {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
      },
    })
    backgroundMocks.getAiProviderSecretPresence.mockResolvedValue({
      openai: false,
      anthropic: false,
      gemini: false,
      openrouter: false,
    })

    const response = await sendRuntimeMessage('devSmoke.run', {
      surface: 'dashboard',
    })
    const report = devSmokeReportSchema.parse(response)

    expect(backgroundMocks.loadActiveProviderConfig).not.toHaveBeenCalled()
    expect(
      report.checks.find((check) => check.id === 'genai.config'),
    ).toMatchObject({
      status: 'warn',
      detail:
        'Provider anthropic is configured with model claude-3-5-sonnet-latest; secret present: no.',
    })
  })

  it('runs live GenAI smoke when requested and redacts provider errors', async () => {
    backgroundMocks.getSettings.mockResolvedValue({
      ...defaultUserSettings,
      aiAssessment: {
        enabled: true,
        provider: 'openai',
        model: 'gpt-4.1-mini',
      },
    })
    backgroundMocks.getAiProviderSecretPresence.mockResolvedValue({
      openai: true,
      anthropic: false,
      gemini: false,
      openrouter: false,
    })
    backgroundMocks.loadActiveProviderConfig.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test-secret',
    })
    backgroundMocks.generateJson.mockResolvedValue({
      status: 'error',
      code: 'auth',
      message: 'Provider rejected sk-test-secret.',
      providerMetadata: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        durationMs: 31,
      },
    })

    const response = await sendRuntimeMessage('devSmoke.run', {
      surface: 'dashboard',
      runLiveGenAi: true,
    })
    const report = devSmokeReportSchema.parse(response)

    expectRuntimePolicy('devSmoke.run', 'dashboard')
    expect(backgroundMocks.generateJson).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(report)).not.toContain('sk-test-secret')
    expect(
      report.checks.find((check) => check.id === 'genai.config'),
    ).toMatchObject({
      status: 'pass',
      detail:
        'Provider openai is configured with model gpt-4.1-mini; secret present: yes.',
    })
    expect(
      report.checks.find((check) => check.id === 'genai.live'),
    ).toMatchObject({
      status: 'fail',
      detail:
        'Provider openai returned auth: Provider rejected [redacted-secret].',
      latencyMs: 31,
    })
  })

  it('opens dashboard pages from content scripts through the background tab API', async () => {
    const contentScriptSender = {
      tab: { id: 7 },
      url: 'https://leetcode.com/problems/two-sum/',
    }

    const response = await sendRuntimeMessage(
      'app.openDashboard',
      {
        surface: 'content-script',
        route: 'settings',
      },
      contentScriptSender,
    )

    expectRuntimePolicy(
      'app.openDashboard',
      'content-script',
      contentScriptSender,
    )
    expect(backgroundMocks.tabsCreate).toHaveBeenCalledWith({
      url: 'chrome-extension://extension-id/dashboard.html#/settings',
    })
    expect(response).toBeNull()
    expect(backgroundMocks.getAppDb).not.toHaveBeenCalled()
    expect(backgroundMocks.flushDbSnapshot).not.toHaveBeenCalled()
    expect(backgroundMocks.broadcastCacheInvalidation).not.toHaveBeenCalled()
  })

  it('registers sync status handling with content-script policy and response parsing', async () => {
    const contentScriptSender = {
      tab: { id: 7 },
      url: 'https://leetcode.com/problems/two-sum/',
    }

    const response = await sendRuntimeMessage(
      'sync.getStatus',
      {
        surface: 'content-script',
      },
      contentScriptSender,
    )

    expectRuntimePolicy('sync.getStatus', 'content-script', contentScriptSender)
    expectSyncFactoryForDb()
    expect(backgroundMocks.syncService.getStatus).toHaveBeenCalledTimes(1)
    expect(response).toEqual(syncStatusSchema.parse(syncStatus))
  })

  it('registers sync open checks with UI-surface policy and response parsing', async () => {
    const contentScriptSender = {
      tab: { id: 7 },
      url: 'https://leetcode.com/problems/two-sum/',
    }

    const response = await sendRuntimeMessage(
      'sync.checkRemoteOnOpen',
      {
        surface: 'content-script',
      },
      contentScriptSender,
    )

    expectRuntimePolicy(
      'sync.checkRemoteOnOpen',
      'content-script',
      contentScriptSender,
    )
    expectSyncFactoryForDb()
    expect(backgroundMocks.syncService.checkRemoteOnOpen).toHaveBeenCalledTimes(
      1,
    )
    expect(response).toEqual(syncActionResultSchema.parse(syncOpenCheckResult))
  })

  it('registers lightweight sync open-check requests without service access', async () => {
    const contentScriptSender = {
      tab: { id: 7 },
      url: 'https://leetcode.com/problems/two-sum/',
    }

    const response = await sendRuntimeMessage(
      'sync.requestOpenCheck',
      {
        surface: 'content-script',
      },
      contentScriptSender,
    )

    expectRuntimePolicy(
      'sync.requestOpenCheck',
      'content-script',
      contentScriptSender,
    )
    expect(
      backgroundMocks.syncAutoSync.requestOpenCheckAfterSurfaceOpen,
    ).toHaveBeenCalledTimes(1)
    expect(response).toBeNull()
    expect(backgroundMocks.getAppDb).not.toHaveBeenCalled()
    expect(backgroundMocks.createBackgroundSyncService).not.toHaveBeenCalled()
    expect(backgroundMocks.syncService.checkRemoteOnOpen).not.toHaveBeenCalled()
    expect(backgroundMocks.flushDbSnapshot).not.toHaveBeenCalled()
  })

  it('broadcasts sync invalidation after background clean open-check dependency settles', async () => {
    const syncAutoSyncDeps = readLatestSyncAutoSyncDeps()
    backgroundMocks.syncService.checkRemoteOnOpen.mockResolvedValueOnce({
      ...syncOpenCheckResult,
      outcome: 'no-change',
      reason: null,
      retryable: false,
    })

    const response = await syncAutoSyncDeps.runCleanPullCheck()

    expect(backgroundMocks.getAppDb).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.syncService.checkRemoteOnOpen).toHaveBeenCalledTimes(
      1,
    )
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      reason: 'sync-updated',
      source: 'dashboard',
      tags: ['sync'],
    })
    expect(response).toEqual(
      syncActionResultSchema.parse({
        ...syncOpenCheckResult,
        outcome: 'no-change',
        reason: null,
        retryable: false,
      }),
    )
  })

  it('rejects malformed lightweight sync open-check requests before scheduling', () => {
    expect(() =>
      sendRuntimeMessage('sync.requestOpenCheck', {
        surface: 'popup',
        confirmLocalOverwrite: true,
      }),
    ).toThrow()

    expect(
      backgroundMocks.assertCanSenderCallExtensionMethod,
    ).not.toHaveBeenCalledWith(
      'sync.requestOpenCheck',
      expect.anything(),
      expect.anything(),
    )
    expect(
      backgroundMocks.syncAutoSync.requestOpenCheckAfterSurfaceOpen,
    ).not.toHaveBeenCalled()
    expect(backgroundMocks.getAppDb).not.toHaveBeenCalled()
  })

  it('rejects malformed sync open check requests before service access', () => {
    expect(() =>
      sendRuntimeMessage('sync.checkRemoteOnOpen', {
        surface: 'popup',
        confirmLocalOverwrite: true,
      }),
    ).toThrow()

    expect(
      backgroundMocks.assertCanSenderCallExtensionMethod,
    ).not.toHaveBeenCalledWith(
      'sync.checkRemoteOnOpen',
      expect.anything(),
      expect.anything(),
    )
    expect(backgroundMocks.getAppDb).not.toHaveBeenCalled()
    expect(backgroundMocks.syncService.checkRemoteOnOpen).not.toHaveBeenCalled()
  })

  it('registers privileged directional sync dashboard actions with request and response parsing', async () => {
    const savedToken = await sendRuntimeMessage('sync.saveGithubToken', {
      surface: 'dashboard',
      token: '  github-token  ',
    })
    const createdGist = await sendRuntimeMessage('sync.createGithubGist', {
      surface: 'dashboard',
    })
    const connectedGist = await sendRuntimeMessage('sync.connectGithubGist', {
      surface: 'dashboard',
      gistId: ' gist_1 ',
    })
    const pulledLatest = await sendRuntimeMessage('sync.pullLatest', {
      surface: 'dashboard',
      confirmLocalOverwrite: true,
    })
    const pushedLocal = await sendRuntimeMessage('sync.pushLocal', {
      surface: 'dashboard',
      confirmRemoteOverwrite: true,
    })

    expectRuntimePolicy('sync.saveGithubToken', 'dashboard')
    expectRuntimePolicy('sync.createGithubGist', 'dashboard')
    expectRuntimePolicy('sync.connectGithubGist', 'dashboard')
    expectRuntimePolicy('sync.pullLatest', 'dashboard')
    expectRuntimePolicy('sync.pushLocal', 'dashboard')
    expect(backgroundMocks.syncService.saveGithubToken).toHaveBeenCalledWith(
      'github-token',
    )
    expect(backgroundMocks.syncService.createGithubGist).toHaveBeenCalledTimes(
      1,
    )
    expect(backgroundMocks.syncService.connectGithubGist).toHaveBeenCalledWith(
      'gist_1',
    )
    expect(backgroundMocks.syncService.pullLatest).toHaveBeenCalledWith({
      confirmLocalOverwrite: true,
    })
    expect(backgroundMocks.syncService.pushLocal).toHaveBeenCalledWith({
      confirmRemoteOverwrite: true,
    })
    for (const response of [
      savedToken,
      createdGist,
      connectedGist,
      pulledLatest,
      pushedLocal,
    ]) {
      expect(response).toEqual(syncActionResultSchema.parse(syncActionResult))
    }
  })

  it('delegates stored token validation through dashboard policy without accepting token payloads', async () => {
    const response = await sendRuntimeMessage(
      'sync.validateStoredGithubToken',
      {
        surface: 'dashboard',
      },
    )

    expectRuntimePolicy('sync.validateStoredGithubToken', 'dashboard')
    expectSyncFactoryForDb()
    expect(
      backgroundMocks.syncService.validateStoredGithubToken,
    ).toHaveBeenCalledTimes(1)
    expect(response).toEqual(syncActionResultSchema.parse(syncActionResult))

    vi.clearAllMocks()
    expect(() =>
      sendRuntimeMessage('sync.validateStoredGithubToken', {
        surface: 'dashboard',
        token: 'ghp_secret',
      }),
    ).toThrow()
    expect(
      backgroundMocks.syncService.validateStoredGithubToken,
    ).not.toHaveBeenCalled()
    expect(backgroundMocks.getAppDb).not.toHaveBeenCalled()
  })

  it('defaults sync.pushLocal overwrite confirmation to false', async () => {
    const response = await sendRuntimeMessage('sync.pushLocal', {
      surface: 'dashboard',
    })

    expectRuntimePolicy('sync.pushLocal', 'dashboard')
    expect(backgroundMocks.syncService.pushLocal).toHaveBeenCalledWith({
      confirmRemoteOverwrite: false,
    })
    expect(response).toEqual(syncActionResultSchema.parse(syncActionResult))
  })

  it('defaults sync.pullLatest local overwrite confirmation to false', async () => {
    const response = await sendRuntimeMessage('sync.pullLatest', {
      surface: 'dashboard',
    })

    expectRuntimePolicy('sync.pullLatest', 'dashboard')
    expect(backgroundMocks.syncService.pullLatest).toHaveBeenCalledWith({
      confirmLocalOverwrite: false,
    })
    expect(response).toEqual(syncActionResultSchema.parse(syncActionResult))
  })

  it('runs sync remote restores through the queued mutation path without marking dirty', async () => {
    const workOrder: string[] = []
    backgroundMocks.syncService.pullLatest.mockImplementation(async () => {
      await readLatestSyncFactoryOptions().runRemoteRestore(async () => {
        workOrder.push('remote-restore')
        await backgroundMocks.flushDbSnapshot()
        return null
      })

      return syncActionResult
    })

    const response = await sendRuntimeMessage('sync.pullLatest', {
      surface: 'dashboard',
    })

    expect(response).toEqual(syncActionResult)
    expect(workOrder).toEqual(['remote-restore'])
    expect(backgroundMocks.readSyncMetadata).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.markSyncLocalDataChanged).not.toHaveBeenCalled()
    expect(backgroundMocks.flushDbSnapshot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(backgroundMocks.syncService.pushLocal).not.toHaveBeenCalled()
  })

  it('aborts queued sync remote restores when local data becomes dirty first', async () => {
    let remoteWorkRan = false
    backgroundMocks.readSyncMetadata.mockResolvedValueOnce(dirtySyncMetadata)
    backgroundMocks.syncService.pullLatest.mockImplementation(async () => {
      await readLatestSyncFactoryOptions().runRemoteRestore(() => {
        remoteWorkRan = true

        return Promise.resolve(null)
      })

      return syncActionResult
    })

    await expect(
      sendRuntimeMessage('sync.pullLatest', {
        surface: 'dashboard',
      }),
    ).rejects.toThrow(/Local data changed/)

    expect(remoteWorkRan).toBe(false)
    expect(backgroundMocks.markSyncLocalDataChanged).not.toHaveBeenCalled()
    expect(backgroundMocks.flushDbSnapshot).not.toHaveBeenCalled()
  })

  it('registers all import methods and serializes previews with edits and sync restores', async () => {
    registerBackgroundHandlers()
    expect(backgroundMocks.handlers.has('imports.preview')).toBe(true)
    expect(backgroundMocks.handlers.has('imports.apply')).toBe(true)
    expect(backgroundMocks.handlers.has('imports.retryPersistence')).toBe(true)

    const editGate = createDeferred<typeof trackForEditResponse>()
    backgroundMocks.updateTrack.mockReturnValueOnce(editGate.promise)
    const editPromise = sendRuntimeMessage('tracks.updateTrack', {
      ...createTrackRequest(),
      trackId: 'leetcode-75',
    })
    await waitUntil(() =>
      expect(backgroundMocks.updateTrack).toHaveBeenCalled(),
    )

    const importRequest = {
      surface: 'dashboard',
      fileText: '{"format":"cognipace-content","version":1}',
    }
    const previewAfterEdit = sendRuntimeMessage(
      'imports.preview',
      importRequest,
    )
    await Promise.resolve()
    expect(backgroundMocks.previewContentImport).not.toHaveBeenCalled()

    editGate.resolve(trackForEditResponse)
    await Promise.all([editPromise, previewAfterEdit])
    expect(backgroundMocks.previewContentImport).toHaveBeenCalledTimes(1)

    let restoreStarted = false
    const restoreGate = createDeferred<void>()
    backgroundMocks.syncService.pullLatest.mockImplementationOnce(async () => {
      await readLatestSyncFactoryOptions().runRemoteRestore(async () => {
        restoreStarted = true
        await restoreGate.promise
        return null
      })
      return syncActionResult
    })

    const syncPromise = sendRuntimeMessage('sync.pullLatest', {
      surface: 'dashboard',
    })
    await waitUntil(() => expect(restoreStarted).toBe(true))
    const previewCallsBeforeRestoreRelease =
      backgroundMocks.previewContentImport.mock.calls.length
    const previewAfterRestore = sendRuntimeMessage(
      'imports.preview',
      importRequest,
    )
    await Promise.resolve()
    expect(backgroundMocks.previewContentImport).toHaveBeenCalledTimes(
      previewCallsBeforeRestoreRelease,
    )

    restoreGate.resolve()
    await Promise.all([syncPromise, previewAfterRestore])
    expect(backgroundMocks.previewContentImport).toHaveBeenCalledTimes(
      previewCallsBeforeRestoreRelease + 1,
    )
  })

  it('wires committed imports to snapshot, dirty-mark, invalidation, and sync scheduling', async () => {
    const response = await sendRuntimeMessage('imports.apply', {
      surface: 'dashboard',
      fileText: '{"format":"cognipace-content","version":1}',
      fingerprint: 'a'.repeat(64),
    })

    expectRuntimePolicy('imports.apply', 'dashboard')
    expect(backgroundMocks.applyContentImport).toHaveBeenCalledWith(
      backgroundMocks.db,
      '{"format":"cognipace-content","version":1}',
      'a'.repeat(64),
    )
    expect(backgroundMocks.markSyncLocalDataChanged).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.flushDbSnapshot).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      reason: 'problem-catalog-updated',
      source: 'dashboard',
      tags: ['problems', 'tracks', 'analytics'],
    })
    expect(
      backgroundMocks.syncAutoSync.scheduleAutoPushAfterMutation,
    ).toHaveBeenCalledTimes(1)
    expect(response).toMatchObject({ status: 'saved' })
  })

  it('registers active-track handling with runtime serialization', async () => {
    const dueAt = new Date('2026-03-01T00:00:00.000Z')
    backgroundMocks.getActiveTrack.mockResolvedValue(createActiveTrack(dueAt))

    const response = await sendRuntimeMessage('tracks.getActiveTrack', {
      surface: 'popup',
    })

    expectRuntimePolicy('tracks.getActiveTrack', 'popup')
    expect(backgroundMocks.getActiveTrack).toHaveBeenCalledWith(
      backgroundMocks.db,
    )
    expect(response).toMatchObject({
      track: {
        id: 'leetcode-75',
        dueAt: dueAt.toISOString(),
      },
      activeGroup: {
        title: 'Arrays and Hashing',
      },
      progress: {
        completedCount: 1,
        totalCount: 2,
        percent: 50,
      },
      nextProblem: {
        slug: 'two-sum',
      },
    })
  })

  it('registers track workspace handling with request and response parsing', async () => {
    const request = {
      surface: 'dashboard',
      at: '2026-01-01T10:00:00.000Z',
    } as const

    const response = await sendRuntimeMessage('tracks.getWorkspace', request)

    expectRuntimePolicy('tracks.getWorkspace', 'dashboard')
    expect(backgroundMocks.getWorkspace).toHaveBeenCalledWith(
      backgroundMocks.db,
      tracksGetWorkspaceRequestSchema.parse(request),
    )
    expect(response).toEqual(trackWorkspaceResponseSchema.parse(response))

    backgroundMocks.getWorkspace.mockResolvedValueOnce({
      ...trackWorkspaceResponse,
      generatedAt: 'not-a-date',
    })
    await expect(
      sendRuntimeMessage('tracks.getWorkspace', request),
    ).rejects.toThrow()
  })

  it('registers track edit handling for create and edit requests', async () => {
    const createRequest = { surface: 'dashboard' } as const
    const editRequest = {
      surface: 'dashboard',
      trackId: 'leetcode-75',
    } as const

    const createResponse = await sendRuntimeMessage(
      'tracks.getTrackForEdit',
      createRequest,
    )
    const editResponse = await sendRuntimeMessage(
      'tracks.getTrackForEdit',
      editRequest,
    )

    expectRuntimePolicy('tracks.getTrackForEdit', 'dashboard')
    expectRuntimePolicy('tracks.getTrackForEdit', 'dashboard')
    expect(backgroundMocks.getTrackForEdit).toHaveBeenNthCalledWith(
      1,
      backgroundMocks.db,
      tracksGetTrackForEditRequestSchema.parse(createRequest),
    )
    expect(backgroundMocks.getTrackForEdit).toHaveBeenNthCalledWith(
      2,
      backgroundMocks.db,
      tracksGetTrackForEditRequestSchema.parse(editRequest),
    )
    expect(createResponse).toEqual(
      trackForEditResponseSchema.parse(createResponse),
    )
    expect(editResponse).toEqual(trackForEditResponseSchema.parse(editResponse))
  })

  it('flushes and broadcasts tracks invalidation after active selection writes', async () => {
    await expectTrackWrite({
      method: 'tracks.setActiveTrack',
      request: {
        surface: 'dashboard',
        trackId: 'leetcode-75',
      },
      schema: tracksSetActiveTrackRequestSchema,
      service: backgroundMocks.setActiveTrack,
      expectedResponse: null,
      expectedTags: ['tracks'],
    })

    await expectTrackWrite({
      method: 'tracks.clearActiveTrack',
      request: {
        surface: 'dashboard',
      },
      schema: tracksClearActiveTrackRequestSchema,
      service: backgroundMocks.clearActiveTrack,
      expectedResponse: null,
      expectedTags: ['tracks'],
    })
  })

  it('flushes and broadcasts tracks plus problems invalidation after management writes', async () => {
    await expectTrackWrite({
      method: 'tracks.removeProblem',
      request: {
        surface: 'dashboard',
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
      },
      schema: tracksRemoveProblemRequestSchema,
      service: backgroundMocks.removeTrackProblem,
      expectedResponse: null,
      expectedTags: ['tracks', 'problems'],
    })

    await expectTrackWrite({
      method: 'tracks.createTrack',
      request: createTrackRequest(),
      schema: tracksCreateTrackRequestSchema,
      service: backgroundMocks.createTrack,
      expectedResponse: parsedTrackForEditResponse,
      expectedTags: ['tracks', 'problems'],
    })

    await expectTrackWrite({
      method: 'tracks.updateTrack',
      request: {
        ...createTrackRequest(),
        trackId: 'leetcode-75',
      },
      schema: tracksUpdateTrackRequestSchema,
      service: backgroundMocks.updateTrack,
      expectedResponse: parsedTrackForEditResponse,
      expectedTags: ['tracks', 'problems'],
    })

    await expectTrackWrite({
      method: 'tracks.deleteTrack',
      request: {
        surface: 'dashboard',
        trackId: 'leetcode-75',
      },
      schema: tracksDeleteTrackRequestSchema,
      service: backgroundMocks.deleteTrack,
      expectedResponse: null,
      expectedTags: ['tracks', 'problems'],
    })

    await expectTrackWrite({
      method: 'tracks.resetTrackProgress',
      request: {
        surface: 'dashboard',
        trackId: 'leetcode-75',
      },
      schema: tracksResetTrackProgressRequestSchema,
      service: backgroundMocks.resetTrackProgress,
      expectedResponse: null,
      expectedTags: ['tracks', 'problems'],
    })
  })

  it('broadcasts cross-surface invalidation after settings writes', async () => {
    const updatedSettings = {
      ...defaultUserSettings,
      assessment: {
        ...defaultUserSettings.assessment,
        strictTiming: true,
      },
    }
    backgroundMocks.updateSettings.mockResolvedValue(updatedSettings)

    const response = await sendRuntimeMessage('settings.updateSettings', {
      surface: 'popup',
      patch: { assessment: { strictTiming: true } },
    })

    expectRuntimePolicy('settings.updateSettings', 'popup')
    expect(backgroundMocks.updateSettings).toHaveBeenCalledWith(
      backgroundMocks.db,
      { assessment: { strictTiming: true } },
    )
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      reason: 'settings-updated',
      source: 'popup',
      tags: ['settings'],
    })
    expectFlushBeforeBroadcast()
    expect(response).toBe(updatedSettings)

    vi.clearAllMocks()
    const toggleResponse = await sendRuntimeMessage(
      'settings.toggleStudyMode',
      {
        surface: 'popup',
      },
    )

    expectRuntimePolicy('settings.toggleStudyMode', 'popup')
    expect(backgroundMocks.toggleStudyMode).toHaveBeenCalledWith(
      backgroundMocks.db,
    )
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      reason: 'settings-updated',
      source: 'popup',
      tags: ['settings'],
    })
    expectFlushBeforeBroadcast()
    expect(toggleResponse).toBeNull()

    vi.clearAllMocks()
    const cycleResponse = await sendRuntimeMessage('settings.cycleThemeMode', {
      surface: 'dashboard',
    })

    expectRuntimePolicy('settings.cycleThemeMode', 'dashboard')
    expect(backgroundMocks.cycleThemeMode).toHaveBeenCalledWith(
      backgroundMocks.db,
    )
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      reason: 'settings-updated',
      source: 'dashboard',
      tags: ['settings'],
    })
    expectFlushBeforeBroadcast()
    expect(cycleResponse).toBeNull()
  })

  it('reads settings through the runtime policy and DB boundary', async () => {
    const response = await sendRuntimeMessage('settings.getSettings', {
      surface: 'dashboard',
    })

    expectRuntimePolicy('settings.getSettings', 'dashboard')
    expect(backgroundMocks.getSettings).toHaveBeenCalledWith(backgroundMocks.db)
    expect(response).toBe(defaultUserSettings)
  })

  it('rejects invalid settings patches before writing or broadcasting', () => {
    expect(() =>
      sendRuntimeMessage('settings.updateSettings', {
        surface: 'dashboard',
        patch: { practice: { dailyGoal: 0 } },
      }),
    ).toThrow()
    expect(backgroundMocks.updateSettings).not.toHaveBeenCalled()
    expect(backgroundMocks.flushDbSnapshot).not.toHaveBeenCalled()
    expect(backgroundMocks.broadcastCacheInvalidation).not.toHaveBeenCalled()
  })

  it('reads the Library without flushing or broadcasting invalidation', async () => {
    const response = await sendRuntimeMessage('problems.getLibrary', {
      surface: 'dashboard',
      at: '2026-01-01T10:00:00.000Z',
    })

    expectRuntimePolicy('problems.getLibrary', 'dashboard')
    expect(backgroundMocks.getProblemLibrary).toHaveBeenCalledWith(
      backgroundMocks.db,
      {
        surface: 'dashboard',
        at: '2026-01-01T10:00:00.000Z',
      },
    )
    expect(response).toEqual(problemLibraryResponse)
    expect(backgroundMocks.flushDbSnapshot).not.toHaveBeenCalled()
    expect(backgroundMocks.broadcastCacheInvalidation).not.toHaveBeenCalled()
  })

  it('registers backup export handling with dashboard policy', async () => {
    const response = await sendRuntimeMessage('backup.exportFullBackup', {
      surface: 'dashboard',
    })

    expectRuntimePolicy('backup.exportFullBackup', 'dashboard')
    expect(backgroundMocks.backupExportFullBackup).toHaveBeenCalledWith(
      backgroundMocks.db,
    )
    expect(response).toEqual(validBackup)
  })

  it('registers backup validation without flushing the snapshot', async () => {
    const response = await sendRuntimeMessage('backup.validateFullBackup', {
      surface: 'dashboard',
      backup: validBackup,
    })

    expectRuntimePolicy('backup.validateFullBackup', 'dashboard')
    expect(backgroundMocks.backupValidateFullBackup).toHaveBeenCalledWith(
      validBackup,
    )
    expect(backgroundMocks.flushDbSnapshot).not.toHaveBeenCalled()
    expect(backupSummarySchema.parse(response).counts.problems).toBe(
      validBackupSummary.counts.problems,
    )
  })

  it('passes backup payloads to service-owned validation before app and version rejection', async () => {
    const mismatchedBackup = {
      ...validBackup,
      app: 'other-app',
      schemaVersion: backupSchemaVersion + 1,
    }

    const response = await sendRuntimeMessage('backup.validateFullBackup', {
      surface: 'dashboard',
      backup: mismatchedBackup,
    })

    expectRuntimePolicy('backup.validateFullBackup', 'dashboard')
    expect(backgroundMocks.backupValidateFullBackup).toHaveBeenCalledWith(
      mismatchedBackup,
    )
    expect(response).toEqual(validBackupSummary)
  })

  it('registers restore handling with snapshot flush and broad invalidation', async () => {
    const response = await sendRuntimeMessage('backup.restoreFullBackup', {
      surface: 'dashboard',
      backup: validBackup,
    })

    expectRuntimePolicy('backup.restoreFullBackup', 'dashboard')
    expect(backgroundMocks.backupRestoreFullBackup).toHaveBeenCalledWith(
      backgroundMocks.db,
      validBackup,
    )
    expect(response).toEqual(validBackupSummary)
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      reason: 'problem-catalog-updated',
      source: 'dashboard',
      hintConnectionReset: true,
      tags: [
        'settings',
        'genai',
        'problems',
        'practice',
        'queue',
        'tracks',
        'app-shell',
      ],
    })
    expectFlushBeforeBroadcast()
  })

  it('registers local reset handling with snapshot flush and broad invalidation', async () => {
    const response = await sendRuntimeMessage('backup.resetLocalData', {
      surface: 'dashboard',
    })

    expect(response).toBeNull()
    expectRuntimePolicy('backup.resetLocalData', 'dashboard')
    expect(backgroundMocks.backupResetLocalData).toHaveBeenCalledWith(
      backgroundMocks.db,
    )
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      reason: 'problem-catalog-updated',
      source: 'dashboard',
      hintConnectionReset: true,
      tags: [
        'settings',
        'genai',
        'problems',
        'practice',
        'queue',
        'tracks',
        'app-shell',
      ],
    })
    expectFlushBeforeBroadcast()
  })

  it('flushes and broadcasts problem invalidation after create writes', async () => {
    const request = binarySearchCreateRequest()
    const response = await sendRuntimeMessage('problems.createProblem', request)

    expectRuntimePolicy('problems.createProblem', 'dashboard')
    expect(backgroundMocks.createProblem).toHaveBeenCalledWith(
      backgroundMocks.db,
      request,
    )
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      problemSlug: 'binary-search',
      reason: 'problem-catalog-updated',
      source: 'dashboard',
      tags: ['problems'],
    })
    expectFlushBeforeBroadcast()
    expect(response).toEqual(problemForEditResponse)
  })

  it('schedules auto-push after a local DB mutation flushes', async () => {
    vi.useFakeTimers()

    await sendRuntimeMessage(
      'problems.createProblem',
      binarySearchCreateRequest(),
    )
    await vi.advanceTimersByTimeAsync(600)

    expect(backgroundMocks.markSyncLocalDataChanged).toHaveBeenCalledTimes(1)
    expect(
      backgroundMocks.syncAutoSync.scheduleAutoPushAfterMutation,
    ).toHaveBeenCalledTimes(1)
    expectAutoPushScheduledAfterFlushAndBroadcast()
    expect(backgroundMocks.syncService.pushLocal).not.toHaveBeenCalled()
    expect(backgroundMocks.syncService.pullLatest).not.toHaveBeenCalled()
  })

  it('keeps local mutations successful when dirty metadata marking fails', async () => {
    backgroundMocks.markSyncLocalDataChanged.mockRejectedValueOnce(
      new Error('storage unavailable'),
    )

    await expect(
      sendRuntimeMessage('problems.createProblem', binarySearchCreateRequest()),
    ).resolves.toEqual(problemForEditResponse)

    expect(backgroundMocks.markSyncLocalDataChanged).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.flushDbSnapshot).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      problemSlug: 'binary-search',
      reason: 'problem-catalog-updated',
      source: 'dashboard',
      tags: ['problems'],
    })

    await vi.advanceTimersByTimeAsync(500)
    expect(backgroundMocks.markSyncLocalDataChanged).toHaveBeenCalledTimes(1)
    expect(backgroundMocks.syncService.pushLocal).not.toHaveBeenCalled()
    expect(backgroundMocks.syncService.pullLatest).not.toHaveBeenCalled()
  })

  it('keeps local mutations successful when auto-push scheduling fails', async () => {
    backgroundMocks.syncAutoSync.scheduleAutoPushAfterMutation.mockRejectedValueOnce(
      new Error('alarms unavailable'),
    )

    await expect(
      sendRuntimeMessage(
        'settings.updateSettings',
        {
          surface: 'dashboard',
          patch: {
            practice: {
              mode: 'freePractice',
            },
          },
        },
        { url: 'chrome-extension://extension-id/dashboard.html' },
      ),
    ).resolves.toEqual(defaultUserSettings)

    expect(backgroundMocks.flushDbSnapshot).toHaveBeenCalledTimes(1)
    expect(
      backgroundMocks.syncAutoSync.scheduleAutoPushAfterMutation,
    ).toHaveBeenCalledTimes(1)
  })

  it('clears pending automatic sync after a manual push succeeds', async () => {
    backgroundMocks.syncService.pushLocal.mockResolvedValueOnce({
      ...syncActionResult,
      action: 'push-local',
      direction: 'push',
      outcome: 'success',
    })

    const response = await sendRuntimeMessage('sync.pushLocal', {
      surface: 'dashboard',
      confirmRemoteOverwrite: false,
    })

    expect(response).toMatchObject({
      action: 'push-local',
      direction: 'push',
      outcome: 'success',
    })
    expect(
      backgroundMocks.syncAutoSync.clearPendingAutomaticSync,
    ).toHaveBeenCalledTimes(1)
  })

  it('keeps manual sync results successful when automatic alarm cleanup fails', async () => {
    backgroundMocks.syncAutoSync.clearPendingAutomaticSync.mockRejectedValueOnce(
      new Error('alarms unavailable'),
    )
    backgroundMocks.syncService.pushLocal.mockResolvedValueOnce({
      ...syncActionResult,
      action: 'push-local',
      direction: 'push',
      outcome: 'success',
    })

    await expect(
      sendRuntimeMessage('sync.pushLocal', {
        surface: 'dashboard',
        confirmRemoteOverwrite: false,
      }),
    ).resolves.toMatchObject({
      action: 'push-local',
      direction: 'push',
      outcome: 'success',
    })

    expect(
      backgroundMocks.syncAutoSync.clearPendingAutomaticSync,
    ).toHaveBeenCalledTimes(1)
  })

  it('does not clear pending automatic sync after a manual push is blocked', async () => {
    backgroundMocks.syncService.pushLocal.mockResolvedValueOnce({
      ...syncActionResult,
      action: 'push-local',
      direction: 'push',
      outcome: 'confirmation-required',
      reason: 'remote-changed',
    })

    await sendRuntimeMessage('sync.pushLocal', {
      surface: 'dashboard',
    })

    expect(
      backgroundMocks.syncAutoSync.clearPendingAutomaticSync,
    ).not.toHaveBeenCalled()
  })

  it('clears pending automatic sync after successful manual sync setup and pull actions', async () => {
    await sendRuntimeMessage('sync.createGithubGist', {
      surface: 'dashboard',
    })
    await sendRuntimeMessage('sync.pullLatest', {
      surface: 'dashboard',
    })
    await sendRuntimeMessage('sync.deleteGithubToken', {
      surface: 'dashboard',
    })

    expect(
      backgroundMocks.syncAutoSync.clearPendingAutomaticSync,
    ).toHaveBeenCalledTimes(3)
  })

  it('clears pending automatic sync only after disabling sync succeeds', async () => {
    await sendRuntimeMessage('sync.setEnabled', {
      surface: 'dashboard',
      enabled: true,
    })
    expect(
      backgroundMocks.syncAutoSync.clearPendingAutomaticSync,
    ).not.toHaveBeenCalled()

    await sendRuntimeMessage('sync.setEnabled', {
      surface: 'dashboard',
      enabled: false,
    })

    expect(
      backgroundMocks.syncAutoSync.clearPendingAutomaticSync,
    ).toHaveBeenCalledTimes(1)
  })

  it('does not clear pending automatic sync after manual sync errors', async () => {
    backgroundMocks.syncService.pullLatest.mockResolvedValueOnce({
      ...syncActionResult,
      action: 'pull-latest',
      direction: 'pull',
      outcome: 'error',
      reason: 'network',
      retryable: true,
    })

    await sendRuntimeMessage('sync.pullLatest', {
      surface: 'dashboard',
    })

    expect(
      backgroundMocks.syncAutoSync.clearPendingAutomaticSync,
    ).not.toHaveBeenCalled()
  })

  it('queues manual pull so later local mutations wait behind the sync work', async () => {
    const pullLatest = createDeferred<typeof syncActionResult>()
    backgroundMocks.syncService.pullLatest.mockReturnValueOnce(
      pullLatest.promise,
    )

    const syncPromise = sendRuntimeMessage('sync.pullLatest', {
      surface: 'dashboard',
    })
    await waitUntil(() => {
      expect(backgroundMocks.syncService.pullLatest).toHaveBeenCalled()
    })

    const mutationPromise = sendRuntimeMessage(
      'problems.createProblem',
      binarySearchCreateRequest(),
    )

    await Promise.resolve()
    expect(backgroundMocks.createProblem).not.toHaveBeenCalled()

    pullLatest.resolve(syncActionResult)
    await syncPromise
    await mutationPromise

    expect(backgroundMocks.createProblem).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid problem writes before mutation side effects', () => {
    expect(() =>
      sendRuntimeMessage('problems.bulkUpdateProblems', {
        surface: 'dashboard',
        problemSlugs: ['two-sum'],
        set: {},
      }),
    ).toThrow()
    expect(backgroundMocks.bulkUpdateProblems).not.toHaveBeenCalled()
    expect(backgroundMocks.flushDbSnapshot).not.toHaveBeenCalled()
    expect(backgroundMocks.broadcastCacheInvalidation).not.toHaveBeenCalled()
  })

  it('includes problem invalidation for practice state that changes Library rows', async () => {
    const response = await sendRuntimeMessage('practice.setSuspended', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
      suspended: true,
    })

    expectRuntimePolicy('practice.setSuspended', 'dashboard')
    expect(backgroundMocks.setPracticeSuspended).toHaveBeenCalledWith(
      backgroundMocks.db,
      {
        problemSlug: 'two-sum',
        suspended: true,
      },
    )
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      problemSlug: 'two-sum',
      reason: 'practice-updated',
      source: 'dashboard',
      tags: ['practice'],
    })
    expectFlushBeforeBroadcast()
    expect(response).toMatchObject({
      problemSlug: 'two-sum',
      isSuspended: false,
    })
  })

  it('saves review results through the atomic practice workflow', async () => {
    await sendRuntimeMessage('practice.saveReviewResult', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewedAt: '2026-01-02T00:00:00.000Z',
      elapsedSeconds: 725,
      isCorrect: false,
      notes: 'Missed a branch.',
    })

    expect(
      backgroundMocks.saveReviewResultWithTrackProgress,
    ).toHaveBeenCalledWith(
      backgroundMocks.db,
      {
        problemSlug: 'two-sum',
        rating: 'hard',
        reviewedAt: new Date('2026-01-02T00:00:00.000Z'),
        elapsedSeconds: 725,
        isCorrect: false,
        log: { notes: 'Missed a branch.' },
        targetRetention: defaultUserSettings.review.targetRetention,
      },
      defaultUserSettings,
    )
    expect(
      backgroundMocks.recordActiveTrackProblemCompletion,
    ).not.toHaveBeenCalled()
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      problemSlug: 'two-sum',
      reason: 'practice-updated',
      source: 'dashboard',
      tags: ['practice'],
    })
  })

  it('passes free-practice settings into the atomic practice workflow', async () => {
    resetRuntimeMutationMocks()
    const freePracticeSettings = {
      ...defaultUserSettings,
      practice: {
        ...defaultUserSettings.practice,
        mode: 'freePractice' as const,
      },
    }
    backgroundMocks.getSettings.mockResolvedValueOnce(freePracticeSettings)

    await sendRuntimeMessage('practice.saveReviewResult', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: '2026-01-03T00:00:00.000Z',
      reviewMode: 'leetcode',
    })

    expect(
      backgroundMocks.saveReviewResultWithTrackProgress,
    ).toHaveBeenCalledWith(
      backgroundMocks.db,
      expect.objectContaining({
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt: new Date('2026-01-03T00:00:00.000Z'),
        reviewMode: 'leetcode',
      }),
      freePracticeSettings,
    )
    expect(
      backgroundMocks.recordActiveTrackProblemCompletion,
    ).not.toHaveBeenCalled()
  })

  it('invalidates tracks after saving a review through the atomic workflow', async () => {
    resetRuntimeMutationMocks()

    await sendRuntimeMessage('practice.saveReviewResult', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
      rating: 'easy',
      reviewedAt: '2026-01-03T00:00:00.000Z',
    })

    expect(
      backgroundMocks.saveReviewResultWithTrackProgress,
    ).toHaveBeenCalledWith(
      backgroundMocks.db,
      expect.objectContaining({
        problemSlug: 'two-sum',
        rating: 'easy',
      }),
      defaultUserSettings,
    )
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      problemSlug: 'two-sum',
      reason: 'practice-updated',
      source: 'dashboard',
      tags: ['practice'],
    })
  })

  it('invalidates tracks after overriding a saved review result', async () => {
    resetRuntimeMutationMocks()
    backgroundMocks.overrideLastReviewResultWithTrackProgress.mockResolvedValue(
      undefined,
    )

    await sendRuntimeMessage('practice.overrideLastReviewResult', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
      rating: 'hard',
    })

    expect(
      backgroundMocks.overrideLastReviewResultWithTrackProgress,
    ).toHaveBeenCalledWith(
      backgroundMocks.db,
      expect.objectContaining({
        problemSlug: 'two-sum',
        rating: 'hard',
      }),
    )
    expect(backgroundMocks.overrideLastReviewResult).not.toHaveBeenCalled()
    expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
      problemSlug: 'two-sum',
      reason: 'practice-updated',
      source: 'dashboard',
      tags: ['practice'],
    })
  })

  it('forwards pinned identity and refresh through the authorized capture handlers', async () => {
    registerBackgroundHandlers()
    const location = {
      slug: 'two-sum',
      host: 'leetcode.com',
      url: 'https://leetcode.com/problems/two-sum/',
    }
    const contentRequest = {
      surface: 'content-script',
      location,
      refresh: true,
    }
    const submissionRequest = {
      ...contentRequest,
      attemptId: 'attempt-pinned',
      submissionId: '1234567890',
      click: { location, clickedAt: 5000, buttonText: 'Submit' },
      submittedCodeSnapshot: {
        code: 'fragment',
        language: 'Python3',
        source: 'monaco',
        completeness: 'partial',
        capturedAt: 5000,
      },
    }
    const sender = { tab: { id: 1 }, frameId: 0, url: location.url }
    await backgroundMocks.handlers.get('leetcode.readProblemContent')!({
      data: contentRequest,
      sender,
    })
    await backgroundMocks.handlers.get('leetcode.readSubmissionResult')!({
      data: submissionRequest,
      sender,
    })
    expect(
      backgroundMocks.readLeetCodeProblemContentInBackground,
    ).toHaveBeenCalledWith(contentRequest)
    expect(
      backgroundMocks.readLeetCodeSubmissionResultInBackground,
    ).toHaveBeenCalledWith(submissionRequest)
  })
})

describe('background handler serializers', () => {
  it('validates queue request timestamps at the runtime boundary', () => {
    expect(() =>
      queueRequestSchema.parse({
        surface: 'popup',
        at: 'not-a-date',
      }),
    ).toThrow()
    expect(() =>
      queueRequestSchema.parse({
        surface: 'popup',
        at: '2026-01-01T10:00:00.000Z',
      }),
    ).not.toThrow()
  })

  it('validates queue response timestamps and track progress consistency', () => {
    expect(() =>
      todayQueueSchema.parse({
        generatedAt: 'not-a-date',
        dueCount: 0,
        dueToday: 0,
        newCount: 0,
        newAvailable: 0,
        queueLoad: 0,
        reinforcementCount: 0,
        excludedCount: 0,
        recommendationReason: null,
        items: [],
        topRecommendation: null,
      }),
    ).toThrow()
    expect(() =>
      activeTrackSchema.parse({
        ...serializeActiveTrack(createActiveTrack(null)),
        progress: {
          completedCount: 2,
          totalCount: 1,
          percent: 100,
        },
      }),
    ).toThrow()
  })
})

function readRegisteredHandler(method: string) {
  registerBackgroundHandlers()

  const handler = backgroundMocks.handlers.get(method)
  expect(handler).toBeDefined()

  return handler!
}

function sendRuntimeMessage(
  method: string,
  data: unknown,
  sender: unknown = extensionSender,
) {
  return readRegisteredHandler(method)({ data, sender })
}

function expectRuntimePolicy(
  method: string,
  surface: 'popup' | 'dashboard' | 'content-script',
  sender: unknown = extensionSender,
) {
  expect(
    backgroundMocks.assertCanSenderCallExtensionMethod,
  ).toHaveBeenCalledWith(method, surface, sender)
}

function expectSyncFactoryForDb() {
  const call = readLatestSyncFactoryCall()

  expect(call[0]).toBe(backgroundMocks.db)
  expect(typeof call[1]).toBe('function')
  expect(isSyncFactoryOptions(call[2])).toBe(true)
}

type SyncAutoSyncDeps = {
  runCleanPullCheck: () => Promise<unknown>
}

function readLatestSyncAutoSyncDeps(): SyncAutoSyncDeps {
  const deps = backgroundMocks.readLatestSyncAutoSyncDeps()

  if (!isSyncAutoSyncDeps(deps)) {
    throw new Error('Expected sync auto-sync dependencies to be captured.')
  }

  return deps
}

function isSyncAutoSyncDeps(value: unknown): value is SyncAutoSyncDeps {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { runCleanPullCheck?: unknown }).runCleanPullCheck ===
      'function'
  )
}

type SyncFactoryOptions = {
  runRemoteRestore: <T>(work: () => Promise<T>) => Promise<T>
}

function readLatestSyncFactoryOptions(): SyncFactoryOptions {
  const options = readLatestSyncFactoryCall()[2]

  if (!isSyncFactoryOptions(options)) {
    throw new Error('Expected sync factory runRemoteRestore option.')
  }

  return options
}

function readLatestSyncFactoryCall(): [unknown, unknown, unknown] {
  const call = backgroundMocks.createBackgroundSyncService.mock.calls.at(-1) as
    | [unknown, unknown, unknown]
    | undefined

  if (!call) {
    throw new Error('Expected sync service factory to be called.')
  }

  return call
}

function isSyncFactoryOptions(value: unknown): value is SyncFactoryOptions {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return (
    typeof (value as { runRemoteRestore?: unknown }).runRemoteRestore ===
    'function'
  )
}

function resetRuntimeMutationMocks() {
  vi.clearAllMocks()
  backgroundMocks.getAppDb.mockResolvedValue({ db: backgroundMocks.db })
  backgroundMocks.broadcastCacheInvalidation.mockResolvedValue(null)
  backgroundMocks.flushDbSnapshot.mockResolvedValue(undefined)
  backgroundMocks.getSettings.mockResolvedValue(defaultUserSettings)
  backgroundMocks.getPracticeDetails.mockResolvedValue(practiceDetails)
  backgroundMocks.overrideLastReviewResultWithTrackProgress.mockResolvedValue(
    undefined,
  )
  backgroundMocks.saveReviewResultWithTrackProgress.mockResolvedValue(undefined)
  backgroundMocks.saveReviewResult.mockResolvedValue(undefined)
  backgroundMocks.createBackgroundSyncService.mockReturnValue(
    backgroundMocks.syncService,
  )
  backgroundMocks.markSyncLocalDataChanged.mockResolvedValue(cleanSyncMetadata)
  backgroundMocks.readSyncMetadata.mockResolvedValue(cleanSyncMetadata)
}

async function expectTrackWrite<TRequest>(input: {
  method: string
  request: TRequest
  schema: { parse: (value: unknown) => unknown }
  service: ReturnType<typeof vi.fn>
  expectedResponse: unknown
  expectedTags: readonly string[]
}) {
  vi.clearAllMocks()
  backgroundMocks.getAppDb.mockResolvedValue({ db: backgroundMocks.db })
  backgroundMocks.broadcastCacheInvalidation.mockResolvedValue(null)
  backgroundMocks.flushDbSnapshot.mockResolvedValue(undefined)
  input.service.mockResolvedValue(input.expectedResponse ?? undefined)

  const response = await sendRuntimeMessage(input.method, input.request)

  expectRuntimePolicy(input.method, 'dashboard')
  expect(input.service).toHaveBeenCalledWith(
    backgroundMocks.db,
    input.schema.parse(input.request),
  )
  expect(backgroundMocks.flushDbSnapshot).toHaveBeenCalledTimes(1)
  expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledWith({
    reason: 'tracks-updated',
    source: 'dashboard',
    tags: input.expectedTags,
  })
  expectFlushBeforeBroadcast()
  expect(response).toEqual(input.expectedResponse)
}

function binarySearchCreateRequest() {
  return {
    surface: 'dashboard',
    slugOrUrl: 'binary-search',
    title: 'Binary Search',
    difficulty: 'easy',
    isPremium: false,
    topicLabels: [],
    companyLabels: [],
  } as const
}

function createTrackRequest() {
  return {
    surface: 'dashboard',
    title: 'Interview Track',
    description: null,
    dueAt: null,
    groups: [{ title: 'Arrays', problemSlugs: ['two-sum'] }],
    setActive: true,
  } as const
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

async function waitUntil(assertion: () => void) {
  let lastError: unknown

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await Promise.resolve()
    }
  }

  throw lastError
}

function expectFlushBeforeBroadcast() {
  expect(backgroundMocks.flushDbSnapshot).toHaveBeenCalledTimes(1)
  expect(backgroundMocks.broadcastCacheInvalidation).toHaveBeenCalledTimes(1)

  const flushOrder =
    backgroundMocks.flushDbSnapshot.mock.invocationCallOrder[0] ?? 0
  const broadcastOrder =
    backgroundMocks.broadcastCacheInvalidation.mock.invocationCallOrder[0] ?? 0

  expect(flushOrder).toBeGreaterThan(0)
  expect(flushOrder).toBeLessThan(broadcastOrder)
}

function expectAutoPushScheduledAfterFlushAndBroadcast() {
  const flushOrder =
    backgroundMocks.flushDbSnapshot.mock.invocationCallOrder[0] ?? 0
  const broadcastOrder =
    backgroundMocks.broadcastCacheInvalidation.mock.invocationCallOrder[0] ?? 0
  const autoPushScheduleOrder =
    backgroundMocks.syncAutoSync.scheduleAutoPushAfterMutation.mock
      .invocationCallOrder[0] ?? 0

  expect(autoPushScheduleOrder).toBeGreaterThan(flushOrder)
  expect(autoPushScheduleOrder).toBeGreaterThan(broadcastOrder)
}

function createPopupShellData(): PopupAppShellData {
  return {
    surface: 'popup',
    generatedAt: '2026-01-01T00:00:00.000Z',
    status: {
      label: 'Practice ready',
      detail: '0 due, 1 new, 0 reinforcement available.',
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
      problem: {
        problemSlug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
      },
      dueAt: null,
    },
    activeTrack: {
      state: 'ready',
      trackId: 'leetcode-75',
      title: 'LeetCode 75',
      description: 'Focused starter track.',
      groupTitle: 'Arrays and Hashing',
      dueAt: '2026-03-01T00:00:00.000Z',
      progress: {
        completedCount: 1,
        totalCount: 2,
        percent: 50,
      },
      detail: 'Next: Two Sum',
      nextProblem: {
        problemSlug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
      },
    },
    queue: {
      dueCount: 0,
      newCount: 1,
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
      queuePreview: [],
    },
  }
}

function createActiveTrack(dueAt: Date | null): ActiveTrack {
  return {
    track: {
      id: 'leetcode-75',
      slug: 'leetcode-75',
      title: 'LeetCode 75',
      description: 'Focused starter track.',
      dueAt,
      allowExternalProgress: false,
    },
    activeGroup: {
      id: 'leetcode-75:arrays-hashing',
      trackId: 'leetcode-75',
      title: 'Arrays and Hashing',
      position: 1,
    },
    progress: {
      completedCount: 1,
      totalCount: 2,
      percent: 50,
    },
    nextProblem: {
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'easy',
      isPremium: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  }
}

const problemForEditResponse = createProblemForEditResponse()
const problemLibraryResponse = createProblemLibraryResponse()
const practiceDetails = createSerializedPracticeDetails()
const trackForEditResponse = createTrackForEditResponse()
const parsedTrackForEditResponse =
  trackForEditResponseSchema.parse(trackForEditResponse)
const trackWorkspaceResponse = createTrackWorkspaceResponse()
const todayQueue = todayQueueSchema.parse({
  generatedAt: '2026-06-07T12:00:00.000Z',
  dueCount: 1,
  dueToday: 1,
  newCount: 2,
  newAvailable: 2,
  queueLoad: 3,
  reinforcementCount: 0,
  excludedCount: 0,
  recommendationReason: 'due-today',
  items: [],
  topRecommendation: null,
})
const backupTimestamp = '2026-05-25T12:00:00.000Z'
const syncTimestamp = '2026-05-26T12:00:00.000Z'
const syncStatus = syncStatusSchema.parse({
  enabled: true,
  configured: true,
  tokenConfigured: true,
  tokenStatus: {
    provider: 'github:gist',
    configured: true,
    updatedAt: syncTimestamp,
    fingerprint: '12345678',
  },
  gistId: 'gist_1',
  isSyncing: false,
  lastSyncAt: syncTimestamp,
  lastSyncDirection: 'pull',
  lastPullAt: syncTimestamp,
  lastPushAt: null,
  needsPush: false,
  lastBlockingReason: null,
  lastError: null,
  conflict: null,
})
const syncActionResult = syncActionResultSchema.parse({
  action: 'pull-latest',
  direction: 'pull',
  outcome: 'success',
  reason: null,
  retryable: false,
  status: syncStatus,
  message: 'Sync complete.',
  occurredAt: syncTimestamp,
})
const syncOpenCheckResult = syncActionResultSchema.parse({
  ...syncActionResult,
  action: 'check-remote-on-open',
  message: 'Remote check complete.',
})
const cleanSyncMetadata = {
  enabled: true,
  gistId: 'gist_1',
  lastSyncAt: syncTimestamp,
  lastSyncDirection: 'pull',
  lastPullAt: syncTimestamp,
  lastPushAt: null,
  lastRemoteVersion: 'remote_1',
  lastRemoteUpdatedAt: syncTimestamp,
  localDataUpdatedAt: syncTimestamp,
  dirtySinceLastSync: false,
  lastBlockingReason: null,
  lastError: null,
  conflict: null,
}
const dirtySyncMetadata = {
  ...cleanSyncMetadata,
  dirtySinceLastSync: true,
  localDataUpdatedAt: '2026-05-26T12:01:00.000Z',
}
const validBackup = backupFileSchema.parse({
  schemaVersion: backupSchemaVersion,
  app: 'cognipace',
  exportedAt: backupTimestamp,
  source: { appVersion: '0.0.0' },
  data: {
    problems: [
      {
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        createdAt: backupTimestamp,
        updatedAt: backupTimestamp,
      },
    ],
    topics: [
      {
        id: 'array',
        label: 'Array',
        createdAt: backupTimestamp,
        updatedAt: backupTimestamp,
      },
    ],
    topicAliases: [],
    topicRelations: [],
    companies: [{ id: 'meta', label: 'Meta' }],
    problemTopics: [{ problemSlug: 'two-sum', topicId: 'array' }],
    problemCompanies: [{ problemSlug: 'two-sum', companyId: 'meta' }],
    practice: {
      problemPractice: [
        {
          problemSlug: 'two-sum',
          status: 'review',
          firstSeenAt: backupTimestamp,
          lastSeenAt: backupTimestamp,
          lastReviewedAt: backupTimestamp,
          lastRating: 'good',
          lastElapsedSeconds: 600,
          bestElapsedSeconds: 600,
          interviewPattern: 'hash-map',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(n)',
          languages: 'TypeScript',
          notes: 'review note',
          solvedCount: 1,
          attemptCount: 1,
          isSuspended: false,
          createdAt: backupTimestamp,
          updatedAt: backupTimestamp,
        },
      ],
      fsrsCards: [
        {
          id: 'card-1',
          problemSlug: 'two-sum',
          cardKind: 'default',
          dueAt: backupTimestamp,
          stability: 2.5,
          difficulty: 4.5,
          elapsedDays: 0,
          scheduledDays: 1,
          learningSteps: 0,
          reps: 1,
          lapses: 0,
          state: 'review',
          lastReviewAt: backupTimestamp,
          createdAt: backupTimestamp,
          updatedAt: backupTimestamp,
        },
      ],
      reviewAttempts: [
        {
          id: 'attempt-1',
          problemSlug: 'two-sum',
          cardId: 'card-1',
          rating: 'good',
          reviewMode: 'manual',
          reviewedAt: backupTimestamp,
          elapsedSeconds: 600,
          isCorrect: true,
          interviewPattern: 'hash-map',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(n)',
          languages: 'TypeScript',
          notes: 'review note',
          fsrsReviewLog: null,
          createdAt: backupTimestamp,
          updatedAt: backupTimestamp,
        },
      ],
    },
    tracks: {
      tracks: [
        {
          id: 'custom-track',
          slug: 'custom-track',
          title: 'Custom Track',
          description: 'A local track',
          dueAt: null,
          allowExternalProgress: false,
          createdAt: backupTimestamp,
          updatedAt: backupTimestamp,
        },
      ],
      groups: [
        {
          id: 'custom-track:arrays',
          trackId: 'custom-track',
          title: 'Arrays',
          position: 1,
          createdAt: backupTimestamp,
          updatedAt: backupTimestamp,
        },
      ],
      memberships: [
        {
          trackGroupId: 'custom-track:arrays',
          problemSlug: 'two-sum',
          position: 1,
        },
      ],
      progress: [
        {
          trackId: 'custom-track',
          problemSlug: 'two-sum',
          reviewAttemptId: null,
          completedAt: backupTimestamp,
          completedRating: 'good',
          createdAt: backupTimestamp,
          updatedAt: backupTimestamp,
        },
      ],
      session: [
        {
          id: 'active',
          activeTrackId: 'custom-track',
          activeGroupId: 'custom-track:arrays',
          startedAt: backupTimestamp,
          updatedAt: backupTimestamp,
        },
      ],
    },
    settings: [
      {
        key: 'user-settings',
        value: JSON.stringify(defaultUserSettings),
        updatedAt: backupTimestamp,
      },
    ],
  },
})
const validBackupSummary = createBackupSummary(validBackup)
