import {
  analyticsSummaryRequestSchema,
  analyticsSummarySchema,
  backupFileSchema,
  backupPayloadRequestSchema,
  backupRequestSchema,
  backupSummarySchema,
  clearAiProviderSecretRequestSchema,
  devSmokeReportSchema,
  devSmokeRequestSchema,
  getAiProviderSecretPresenceRequestSchema,
  leetcodeProblemRemoteRuntimeRequestSchema,
  leetcodeSubmissionResultRemoteRuntimeRequestSchema,
  onMessage,
  openDashboardRequestSchema,
  pingRequestSchema,
  problemBulkUpdateResponseSchema,
  problemDeleteResponseSchema,
  problemForEditResponseSchema,
  problemLibraryResponseSchema,
  problemsBulkDeleteRequestSchema,
  problemsBulkUpdateProblemsRequestSchema,
  problemsCreateProblemRequestSchema,
  problemsDeleteProblemRequestSchema,
  problemsGetLibraryRequestSchema,
  problemsGetProblemForEditRequestSchema,
  problemsUpdateProblemRequestSchema,
  problemsUpsertFromPageRequestSchema,
  queueRequestSchema,
  recommendLeetCodeAssessmentRequestSchema,
  recommendLeetCodeAssessmentResponseSchema,
  setAiProviderSecretRequestSchema,
  testAiConnectionRequestSchema,
  testAiConnectionResponseSchema,
  settingsCycleThemeModeRequestSchema,
  settingsRequestSchema,
  settingsToggleStudyModeRequestSchema,
  settingsUpdateRequestSchema,
  syncActionResultSchema,
  syncGithubGistRequestSchema,
  syncGithubTokenRequestSchema,
  syncPullLatestRequestSchema,
  syncPushLocalRequestSchema,
  syncRequestSchema,
  syncSetEnabledRequestSchema,
  syncStatusSchema,
  todayQueueSchema,
  trackForEditResponseSchema,
  tracksClearActiveTrackRequestSchema,
  tracksCreateTrackRequestSchema,
  tracksDeleteTrackRequestSchema,
  tracksGetTrackForEditRequestSchema,
  tracksGetWorkspaceRequestSchema,
  tracksNullResponseSchema,
  tracksRemoveProblemRequestSchema,
  tracksResetTrackProgressRequestSchema,
  tracksRequestSchema,
  tracksSetActiveTrackRequestSchema,
  tracksUpdateTrackRequestSchema,
  trackWorkspaceResponseSchema,
  type SerializedActiveTrack,
  type SerializedTodayQueue,
  type UiSurface,
} from '@/extension/messaging'
import { browser } from 'wxt/browser'
import {
  appShellDataSchema,
  appShellRequestSchema,
  type AppShellRequest,
} from '@/features/app-shell/api/app-shell-contracts'
import { getAppShellData } from '@/features/app-shell/server/app-shell-service'
import { getAnalyticsSummary } from '@/features/analytics/server/analytics-service'
import {
  clearAiProviderSecret,
  getAiProviderSecretPresence,
  loadActiveProviderConfig,
  setAiProviderSecret,
} from '@/features/genai/server/genai-settings-service'
import { testAiConnection } from '@/features/genai/server/genai-connection-service'
import { aiProviderSecretPresenceSchema } from '@/features/genai/domain'
import { generateJson } from '@/lib/ai'
import {
  exportFullBackup,
  resetLocalData,
  restoreFullBackup,
  validateFullBackup,
} from '@/features/backup/server/backup-service'
import {
  readLeetCodeProblemContentInBackground,
  readLeetCodeProblemMetadataInBackground,
  readLeetCodeSubmissionResultInBackground,
} from '@/features/leetcode-capture/server/leetcode-capture-service'
import {
  analyzeLeetCodeSubmissionRequestSchema,
  analyzeLeetCodeSubmissionResponseSchema,
  cancelLeetCodeAnalysisRequestSchema,
  cancelLeetCodeAnalysisResponseSchema,
} from '@/features/leetcode-review-assistant/api/code-analysis-contracts'
import { analyzeLeetCodeSubmissionInBackground } from '@/features/leetcode-review-assistant/server/analysis-runtime-service'
import { recommendLeetCodeAssessmentInBackground } from '@/features/leetcode-review-assistant/server/runtime-handler-service'
import {
  practiceDetailsRequestSchema,
  practiceOverrideLastReviewResultRequestSchema,
  practiceResetScheduleRequestSchema,
  practiceSaveReviewResultRequestSchema,
  practiceSetSuspendedRequestSchema,
} from '@/features/practice/api/practice-contracts'
import {
  serializeNormalizedPracticeState,
  serializePracticeDetails,
} from '@/features/practice/api/practice-serializers'
import {
  getPracticeDetails,
  overrideLastReviewResultWithTrackProgress,
  resetPracticeSchedule,
  saveReviewResultWithTrackProgress,
  setPracticeSuspended,
} from '@/features/practice/server/practice-service'
import {
  bulkDeleteProblems,
  bulkUpdateProblems,
  createProblem,
  deleteProblem,
  getProblemForEdit,
  getProblemLibrary,
  updateProblem,
  upsertProblemFromPage,
} from '@/features/problems/server/problems-service'
import type { QueueItem, TodayQueue } from '@/features/queue/domain'
import { getTodayQueue } from '@/features/queue/server/queue-service'
import type { UserSettings } from '@/features/settings/domain'
import {
  cycleThemeMode,
  getSettings,
  toggleStudyMode,
  updateSettings,
} from '@/features/settings/server/settings-service'
import {
  readSyncMetadata,
  writeSyncMetadata,
} from '@/features/sync/data/sync-metadata-store'
import {
  createBackgroundSyncService,
  markSyncLocalDataChanged,
} from '@/features/sync/server/sync-service'
import { serializeActiveTrack as serializeActiveTrackContract } from '@/features/tracks/api/tracks-serializers'
import type { ActiveTrack } from '@/features/tracks/domain'
import {
  clearActiveTrack,
  createTrack,
  deleteTrack,
  getActiveTrack,
  getTrackForEdit,
  getWorkspace,
  removeTrackProblem,
  resetTrackProgress,
  setActiveTrack,
  updateTrack,
} from '@/features/tracks/server/tracks-service'
import { getDashboardUrl } from '@/platform/chrome/extension-pages'
import { flushDbSnapshot, type Db } from '@/platform/db'
import { z } from 'zod'

import {
  analysisOwner,
  cancelOwnedAnalysis,
  runOwnedAnalysis,
} from './leetcode-analysis-operations'
import { broadcastCacheInvalidation } from './cache-invalidation-broadcaster'
import {
  computeNotificationDryRun,
  createDevSmokeService,
} from './dev-smoke-service'
import { registerImportHandlers } from './import-handlers'
import { assertCanSenderCallExtensionMethod } from './runtime-policy'
import { getBackgroundDb as getAppDb } from './app-db'
import { createAlarmScheduler } from './scheduler/alarm-scheduler'
import { createSyncAutoSync } from './sync-auto-sync'
import {
  createDueNotification,
  readDueNotificationState,
  writeDueNotificationState,
} from './due-notification'

const alarmScheduler = createAlarmScheduler()
const syncAutoSync = createSyncAutoSync({
  scheduler: alarmScheduler,
  hasPendingDirtyMarkRetry: () => hasPendingDirtyMarkRetry,
  now: () => new Date(),
  readMetadata: readSyncMetadata,
  writeMetadata: writeSyncMetadata,
  runSafePush: async (input) => {
    const { db } = await getAppDb()

    return parseSyncActionResult(
      await runQueuedSyncAction(db, (service) => service.pushLocal(input)),
    )
  },
  runCleanPullCheck: async () => {
    const { db } = await getAppDb()

    try {
      return parseSyncActionResult(
        await runQueuedSyncAction(db, (service) => service.checkRemoteOnOpen()),
      )
    } finally {
      try {
        await broadcastSyncInvalidation('dashboard')
      } catch {
        // Sync status refresh is best-effort after background open checks.
      }
    }
  },
})

const dueNotification = createDueNotification({
  now: () => new Date(),
  readSettings: async () => {
    const { db } = await getAppDb()
    return getSettings(db)
  },
  readQueueSummary: async () => {
    const { db } = await getAppDb()
    const queue = await getTodayQueue(db, new Date())
    return { dueToday: queue.dueToday }
  },
  readState: readDueNotificationState,
  writeState: writeDueNotificationState,
  notify: async (title, message) => {
    await browser.notifications.create('due-review-reminder', {
      type: 'basic',
      iconUrl: '/icons.svg',
      title,
      message,
    })
  },
  checkAlarmScheduled: async (name) => {
    const alarm = await browser.alarms.get(name)
    return alarm !== undefined
  },
  scheduler: alarmScheduler,
})

export function registerBackgroundHandlers() {
  syncAutoSync.registerJobs()
  void syncAutoSync.repairStartupAlarms()

  dueNotification.registerJobs()
  void dueNotification.handleStartup()

  registerImportHandlers({
    runInMutationQueue,
    getDb: async () => (await getAppDb()).db,
    flush: flushDbSnapshot,
    markDirty: markSyncLocalDataChangedBestEffort,
    invalidate: async () =>
      broadcastCacheInvalidation({
        reason: 'problem-catalog-updated',
        source: 'dashboard',
        tags: ['problems', 'tracks', 'analytics'],
      }),
    scheduleSync: scheduleAutoPushAfterMutationBestEffort,
  })

  onMessage('runtime.ping', ({ data, sender }) => {
    const request = pingRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod('runtime.ping', request.surface, sender)
    return {
      ok: true,
      surface: request.surface,
      receivedAt: new Date().toISOString(),
    }
  })

  onMessage('app.getShellData', ({ data, sender }) => {
    const request = appShellRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'app.getShellData',
      getAppShellRuntimeSurface(request),
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      appShellDataSchema.parse(await getAppShellData(db, request)),
    )
  })

  onMessage('app.openDashboard', ({ data, sender }) => {
    const request = openDashboardRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'app.openDashboard',
      request.surface,
      sender,
    )
    return browser.tabs
      .create({ url: getDashboardUrl(request.route) })
      .then(() => null)
  })

  onMessage('backup.exportFullBackup', ({ data, sender }) => {
    const request = backupRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'backup.exportFullBackup',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      backupFileSchema.parse(await exportFullBackup(db)),
    )
  })

  onMessage('backup.validateFullBackup', ({ data, sender }) => {
    const request = backupPayloadRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'backup.validateFullBackup',
      request.surface,
      sender,
    )
    return backupSummarySchema.parse(validateFullBackup(request.backup))
  })

  onMessage('sync.getStatus', ({ data, sender }) => {
    const request = syncRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.getStatus',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      syncStatusSchema.parse(await createSyncServiceForDb(db).getStatus()),
    )
  })

  onMessage('sync.validateGithubToken', ({ data, sender }) => {
    const request = syncGithubTokenRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.validateGithubToken',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      parseSyncActionResult(
        await runQueuedSyncAction(db, (service) =>
          service.validateGithubToken(request.token),
        ),
      ),
    )
  })

  onMessage('sync.validateStoredGithubToken', ({ data, sender }) => {
    const request = syncRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.validateStoredGithubToken',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      parseSyncActionResult(
        await runQueuedSyncAction(db, (service) =>
          service.validateStoredGithubToken(),
        ),
      ),
    )
  })

  onMessage('sync.saveGithubToken', ({ data, sender }) => {
    const request = syncGithubTokenRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.saveGithubToken',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      parseSyncActionResult(
        await runQueuedSyncAction(db, (service) =>
          service.saveGithubToken(request.token),
        ),
      ),
    )
  })

  onMessage('sync.deleteGithubToken', ({ data, sender }) => {
    const request = syncRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.deleteGithubToken',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) => {
      const result = parseSyncActionResult(
        await runQueuedSyncAction(db, (service) => service.deleteGithubToken()),
      )

      if (result.outcome === 'success') {
        await clearPendingAutomaticSyncBestEffort()
      }

      return result
    })
  })

  onMessage('sync.createGithubGist', ({ data, sender }) => {
    const request = syncRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.createGithubGist',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) => {
      const result = parseSyncActionResult(
        await runQueuedSyncAction(db, (service) => service.createGithubGist()),
      )

      if (result.outcome === 'success') {
        await clearPendingAutomaticSyncBestEffort()
      }

      return result
    })
  })

  onMessage('sync.connectGithubGist', ({ data, sender }) => {
    const request = syncGithubGistRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.connectGithubGist',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      parseSyncActionResult(
        await runQueuedSyncAction(db, (service) =>
          service.connectGithubGist(request.gistId),
        ),
      ),
    )
  })

  onMessage('sync.setEnabled', ({ data, sender }) => {
    const request = syncSetEnabledRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.setEnabled',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) => {
      const result = parseSyncActionResult(
        await runQueuedSyncAction(db, (service) =>
          service.setEnabled(request.enabled),
        ),
      )

      if (!request.enabled && result.outcome === 'success') {
        await clearPendingAutomaticSyncBestEffort()
      }

      return result
    })
  })

  onMessage('sync.checkRemoteOnOpen', ({ data, sender }) => {
    const request = syncRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.checkRemoteOnOpen',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      parseSyncActionResult(
        await runQueuedSyncAction(db, (service) => service.checkRemoteOnOpen()),
      ),
    )
  })

  onMessage('sync.requestOpenCheck', ({ data, sender }) => {
    const request = syncRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.requestOpenCheck',
      request.surface,
      sender,
    )

    void syncAutoSync.requestOpenCheckAfterSurfaceOpen().catch(() => {
      // Opening a UI surface must not fail when automatic sync scheduling fails.
    })

    return null
  })

  onMessage('sync.pullLatest', ({ data, sender }) => {
    const request = syncPullLatestRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.pullLatest',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) => {
      const result = parseSyncActionResult(
        await runQueuedSyncAction(db, (service) =>
          service.pullLatest({
            confirmLocalOverwrite: request.confirmLocalOverwrite,
          }),
        ),
      )

      if (result.outcome === 'success') {
        await clearPendingAutomaticSyncBestEffort()
      }

      return result
    })
  })

  onMessage('sync.pushLocal', ({ data, sender }) => {
    const request = syncPushLocalRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.pushLocal',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) => {
      const result = parseSyncActionResult(
        await runQueuedSyncAction(db, (service) =>
          service.pushLocal({
            confirmRemoteOverwrite: request.confirmRemoteOverwrite,
          }),
        ),
      )

      if (result.outcome === 'success') {
        await clearPendingAutomaticSyncBestEffort()
      }

      return result
    })
  })

  onMessage('backup.restoreFullBackup', ({ data, sender }) => {
    const request = backupPayloadRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'backup.restoreFullBackup',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) =>
        backupSummarySchema.parse(await restoreFullBackup(db, request.backup)),
      () => broadcastDataManagementInvalidation(request.surface),
    )
  })

  onMessage('backup.resetLocalData', ({ data, sender }) => {
    const request = backupRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'backup.resetLocalData',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) => {
        await resetLocalData(db)

        return null
      },
      () => broadcastDataManagementInvalidation(request.surface),
    )
  })

  onMessage('problems.upsertFromPage', ({ data, sender }) => {
    const request = problemsUpsertFromPageRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.upsertFromPage',
      request.surface,
      sender,
    )
    return runDbMutation(
      (db) => upsertProblemFromPage(db, request),
      (problem) =>
        broadcastProblemCatalogInvalidation({
          problemSlug: problem.slug,
          source: request.surface,
        }),
    )
  })

  onMessage('problems.getLibrary', ({ data, sender }) => {
    const request = problemsGetLibraryRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.getLibrary',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      problemLibraryResponseSchema.parse(await getProblemLibrary(db, request)),
    )
  })

  onMessage('problems.getProblemForEdit', ({ data, sender }) => {
    const request = problemsGetProblemForEditRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.getProblemForEdit',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      problemForEditResponseSchema.parse(await getProblemForEdit(db, request)),
    )
  })

  onMessage('problems.createProblem', ({ data, sender }) => {
    const request = problemsCreateProblemRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.createProblem',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) =>
        problemForEditResponseSchema.parse(await createProblem(db, request)),
      (problemForEdit) =>
        broadcastProblemCatalogInvalidation({
          problemSlug: problemForEdit.problem.slug,
          source: request.surface,
        }),
    )
  })

  onMessage('problems.updateProblem', ({ data, sender }) => {
    const request = problemsUpdateProblemRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.updateProblem',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) =>
        problemForEditResponseSchema.parse(await updateProblem(db, request)),
      (problemForEdit) =>
        broadcastProblemCatalogInvalidation({
          problemSlug: problemForEdit.problem.slug,
          source: request.surface,
        }),
    )
  })

  onMessage('problems.deleteProblem', ({ data, sender }) => {
    const request = problemsDeleteProblemRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.deleteProblem',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) =>
        problemDeleteResponseSchema.parse(await deleteProblem(db, request)),
      () =>
        broadcastProblemCatalogInvalidation({
          problemSlug: request.problemSlug,
          source: request.surface,
        }),
    )
  })

  onMessage('problems.bulkUpdateProblems', ({ data, sender }) => {
    const request = problemsBulkUpdateProblemsRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.bulkUpdateProblems',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) =>
        problemBulkUpdateResponseSchema.parse(
          await bulkUpdateProblems(db, request),
        ),
      () =>
        broadcastProblemCatalogInvalidation({
          problemSlug: readSingleChangedProblemSlug(request.problemSlugs),
          source: request.surface,
        }),
    )
  })

  onMessage('problems.bulkDelete', ({ data, sender }) => {
    const request = problemsBulkDeleteRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.bulkDelete',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) =>
        problemDeleteResponseSchema.parse(
          await bulkDeleteProblems(db, request),
        ),
      () =>
        broadcastProblemCatalogInvalidation({
          problemSlug: readSingleChangedProblemSlug(request.problemSlugs),
          source: request.surface,
        }),
    )
  })

  onMessage('practice.getDetails', ({ data, sender }) => {
    const request = practiceDetailsRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'practice.getDetails',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) => {
      const details = await getPracticeDetails(db, request.problemSlug, {
        ...(request.at ? { now: new Date(request.at) } : {}),
      })

      return serializePracticeDetails(details)
    })
  })

  onMessage('practice.saveReviewResult', ({ data, sender }) => {
    const request = practiceSaveReviewResultRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'practice.saveReviewResult',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) => {
        const settings = await getSettings(db)
        const reviewedAt = request.reviewedAt
          ? new Date(request.reviewedAt)
          : new Date()
        const reviewInput = {
          problemSlug: request.problemSlug,
          rating: request.rating,
          elapsedSeconds: request.elapsedSeconds,
          isCorrect: request.isCorrect,
          log: readReviewLogRequest(request),
          targetRetention: settings.review.targetRetention,
        }

        await saveReviewResultWithTrackProgress(
          db,
          {
            ...reviewInput,
            reviewedAt,
            ...(request.reviewMode ? { reviewMode: request.reviewMode } : {}),
          },
          settings,
        )
        const details = await getPracticeDetails(db, request.problemSlug)

        return serializePracticeDetails(details)
      },
      () =>
        broadcastPracticeInvalidation({
          problemSlug: request.problemSlug,
          source: request.surface,
        }),
    )
  })

  onMessage('practice.overrideLastReviewResult', ({ data, sender }) => {
    const request = practiceOverrideLastReviewResultRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'practice.overrideLastReviewResult',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) => {
        const settings = await getSettings(db)
        await overrideLastReviewResultWithTrackProgress(db, {
          problemSlug: request.problemSlug,
          rating: request.rating,
          elapsedSeconds: request.elapsedSeconds,
          isCorrect: request.isCorrect,
          log: readReviewLogRequest(request),
          targetRetention: settings.review.targetRetention,
        })
        const details = await getPracticeDetails(db, request.problemSlug)

        return serializePracticeDetails(details)
      },
      () =>
        broadcastPracticeInvalidation({
          problemSlug: request.problemSlug,
          source: request.surface,
        }),
    )
  })

  onMessage('practice.setSuspended', ({ data, sender }) => {
    const request = practiceSetSuspendedRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'practice.setSuspended',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) => {
        const details = await setPracticeSuspended(db, {
          problemSlug: request.problemSlug,
          suspended: request.suspended,
        })

        return serializePracticeDetails(details)
      },
      () =>
        broadcastPracticeInvalidation({
          problemSlug: request.problemSlug,
          source: request.surface,
        }),
    )
  })

  onMessage('practice.resetSchedule', ({ data, sender }) => {
    const request = practiceResetScheduleRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'practice.resetSchedule',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) => {
        const details = await resetPracticeSchedule(db, {
          problemSlug: request.problemSlug,
          keepLog: request.keepLog,
        })

        return serializePracticeDetails(details)
      },
      () =>
        broadcastPracticeInvalidation({
          problemSlug: request.problemSlug,
          source: request.surface,
        }),
    )
  })

  onMessage('analytics.getSummary', ({ data, sender }) => {
    const request = analyticsSummaryRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'analytics.getSummary',
      request.surface,
      sender,
    )

    return getAppDb().then(async ({ db }) => {
      const summaryOptions = request.at
        ? {
            range: request.range,
            now: new Date(request.at),
            timeZone: request.timeZone,
          }
        : { range: request.range, timeZone: request.timeZone }
      const summary = await getAnalyticsSummary(db, summaryOptions)

      return analyticsSummarySchema.parse({
        ...summary,
        observedRatingQuality: {
          value: summary.lowSample ? null : summary.observedRatingQuality,
          sampleSize: summary.observedRatingSampleSize,
          lowSample: summary.lowSample,
        },
      })
    })
  })

  onMessage('devSmoke.run', ({ data, sender }) => {
    const request = devSmokeRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod('devSmoke.run', request.surface, sender)

    return getAppDb().then(async ({ db }) => {
      const smoke = createDevSmokeService({
        now: () => new Date(),
        readAnalyticsSummary: () => getAnalyticsSummary(db),
        readQueueSummary: async () => {
          const queue = await getTodayQueue(db, new Date())

          return {
            dueToday: queue.dueToday,
            newAvailable: queue.newAvailable,
            queueLoad: queue.queueLoad,
            recommendationReason: queue.recommendationReason,
          }
        },
        readGenAiConfig: async () => {
          const settings = await getSettings(db)
          const ai = settings.aiAssessment
          const secretPresence = await getAiProviderSecretPresence()
          const hasConfiguredModel = ai.model.trim() !== ''

          if (!ai.enabled || !hasConfiguredModel) {
            return {
              enabled: false,
              provider: ai.provider,
              model: hasConfiguredModel ? ai.model : 'not-configured',
              hasSecret: secretPresence[ai.provider],
            }
          }

          return {
            enabled: true,
            provider: ai.provider,
            model: ai.model,
            hasSecret: secretPresence[ai.provider],
          }
        },
        runNotificationDryRun: () => runNotificationSmokeDryRun(db),
        runLiveGenAi: () => runLiveGenAiSmoke(db),
      })

      return devSmokeReportSchema.parse(
        await smoke.run({
          ...(request.runLiveGenAi !== undefined
            ? { runLiveGenAi: request.runLiveGenAi }
            : {}),
        }),
      )
    })
  })

  onMessage('queue.getTodayQueue', ({ data, sender }) => {
    const request = queueRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'queue.getTodayQueue',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      serializeTodayQueue(
        await getTodayQueue(db, request.at ? new Date(request.at) : undefined),
      ),
    )
  })

  onMessage('tracks.getActiveTrack', ({ data, sender }) => {
    const request = tracksRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'tracks.getActiveTrack',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      serializeActiveTrack(await getActiveTrack(db)),
    )
  })

  onMessage('tracks.getWorkspace', ({ data, sender }) => {
    const request = tracksGetWorkspaceRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'tracks.getWorkspace',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      trackWorkspaceResponseSchema.parse(await getWorkspace(db, request)),
    )
  })

  onMessage('tracks.getTrackForEdit', ({ data, sender }) => {
    const request = tracksGetTrackForEditRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'tracks.getTrackForEdit',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      trackForEditResponseSchema.parse(await getTrackForEdit(db, request)),
    )
  })

  onMessage('tracks.setActiveTrack', ({ data, sender }) => {
    const request = tracksSetActiveTrackRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'tracks.setActiveTrack',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) => {
        await setActiveTrack(db, request)

        return tracksNullResponseSchema.parse(null)
      },
      () =>
        broadcastTracksInvalidation({
          source: request.surface,
          tags: ['tracks'],
        }),
    )
  })

  onMessage('tracks.clearActiveTrack', ({ data, sender }) => {
    const request = tracksClearActiveTrackRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'tracks.clearActiveTrack',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) => {
        await clearActiveTrack(db, request)

        return tracksNullResponseSchema.parse(null)
      },
      () =>
        broadcastTracksInvalidation({
          source: request.surface,
          tags: ['tracks'],
        }),
    )
  })

  onMessage('tracks.createTrack', ({ data, sender }) => {
    const request = tracksCreateTrackRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'tracks.createTrack',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) =>
        trackForEditResponseSchema.parse(await createTrack(db, request)),
      () =>
        broadcastTracksInvalidation({
          source: request.surface,
          tags: ['tracks', 'problems'],
        }),
    )
  })

  onMessage('tracks.updateTrack', ({ data, sender }) => {
    const request = tracksUpdateTrackRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'tracks.updateTrack',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) =>
        trackForEditResponseSchema.parse(await updateTrack(db, request)),
      () =>
        broadcastTracksInvalidation({
          source: request.surface,
          tags: ['tracks', 'problems'],
        }),
    )
  })

  onMessage('tracks.removeProblem', ({ data, sender }) => {
    const request = tracksRemoveProblemRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'tracks.removeProblem',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) => {
        await removeTrackProblem(db, request)
        return tracksNullResponseSchema.parse(null)
      },
      () =>
        broadcastTracksInvalidation({
          source: request.surface,
          tags: ['tracks', 'problems'],
        }),
    )
  })

  onMessage('tracks.deleteTrack', ({ data, sender }) => {
    const request = tracksDeleteTrackRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'tracks.deleteTrack',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) => {
        await deleteTrack(db, request)

        return tracksNullResponseSchema.parse(null)
      },
      () =>
        broadcastTracksInvalidation({
          source: request.surface,
          tags: ['tracks', 'problems'],
        }),
    )
  })

  onMessage('tracks.resetTrackProgress', ({ data, sender }) => {
    const request = tracksResetTrackProgressRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'tracks.resetTrackProgress',
      request.surface,
      sender,
    )
    return runDbMutation(
      async (db) => {
        await resetTrackProgress(db, request)

        return tracksNullResponseSchema.parse(null)
      },
      () =>
        broadcastTracksInvalidation({
          source: request.surface,
          tags: ['tracks', 'problems'],
        }),
    )
  })

  onMessage('settings.getSettings', ({ data, sender }) => {
    const request = settingsRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'settings.getSettings',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) => {
      const settings = await getSettings(db)
      return settings satisfies UserSettings
    })
  })

  onMessage('settings.updateSettings', ({ data, sender }) => {
    const request = settingsUpdateRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'settings.updateSettings',
      request.surface,
      sender,
    )
    return runSettingsMutation(
      request.surface,
      (db) => updateSettings(db, request.patch),
      request.patch.aiAssessment !== undefined,
    )
  })

  onMessage('settings.toggleStudyMode', ({ data, sender }) => {
    const request = settingsToggleStudyModeRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'settings.toggleStudyMode',
      request.surface,
      sender,
    )
    return runSettingsMutation(request.surface, (db) =>
      toggleStudyMode(db),
    ).then(() => null)
  })

  onMessage('settings.cycleThemeMode', ({ data, sender }) => {
    const request = settingsCycleThemeModeRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'settings.cycleThemeMode',
      request.surface,
      sender,
    )
    return runSettingsMutation(request.surface, (db) =>
      cycleThemeMode(db),
    ).then(() => null)
  })

  onMessage('genai.getAiProviderSecretPresence', ({ data, sender }) => {
    const request = getAiProviderSecretPresenceRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'genai.getAiProviderSecretPresence',
      request.surface,
      sender,
    )
    return getAiProviderSecretPresence()
      .then((presence) => aiProviderSecretPresenceSchema.parse(presence))
      .catch(() => {
        throw new Error('Saved AI keys could not be loaded. Please retry.')
      })
  })

  onMessage('genai.setAiProviderSecret', ({ data, sender }) => {
    const request = setAiProviderSecretRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'genai.setAiProviderSecret',
      request.surface,
      sender,
    )
    return setAiProviderSecret(request.provider, request.secret, async () => {
      await broadcastCacheInvalidation({
        reason: 'genai-updated',
        source: request.surface,
        tags: ['genai'],
      })
    })
      .then((presence) => aiProviderSecretPresenceSchema.parse(presence))
      .catch(() => {
        throw new Error('The AI key save could not be completed. Please retry.')
      })
  })

  onMessage('genai.clearAiProviderSecret', ({ data, sender }) => {
    const request = clearAiProviderSecretRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'genai.clearAiProviderSecret',
      request.surface,
      sender,
    )
    return clearAiProviderSecret(request.provider, async () => {
      await broadcastCacheInvalidation({
        reason: 'genai-updated',
        source: request.surface,
        tags: ['genai'],
      })
    })
      .then((presence) => aiProviderSecretPresenceSchema.parse(presence))
      .catch(() => {
        throw new Error(
          'The AI key removal could not be completed. Please retry.',
        )
      })
  })

  onMessage('genai.testConnection', ({ data, sender }) => {
    const request = testAiConnectionRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'genai.testConnection',
      request.surface,
      sender,
    )
    return testAiConnection(request, async () => (await getAppDb()).db).then(
      (result) => testAiConnectionResponseSchema.parse(result),
    )
  })

  onMessage('genai.analyzeLeetCodeSubmission', ({ data, sender }) => {
    const request = analyzeLeetCodeSubmissionRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'genai.analyzeLeetCodeSubmission',
      request.surface,
      sender,
    )
    const owner = analysisOwner(sender)
    return runOwnedAnalysis(owner, request.requestId, async (signal) =>
      analyzeLeetCodeSubmissionResponseSchema.parse(
        await analyzeLeetCodeSubmissionInBackground(
          request,
          async () => (await getAppDb()).db,
          signal,
        ),
      ),
    )
  })

  onMessage('genai.cancelLeetCodeAnalysis', ({ data, sender }) => {
    const request = cancelLeetCodeAnalysisRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'genai.cancelLeetCodeAnalysis',
      request.surface,
      sender,
    )
    const owner = analysisOwner(sender)
    return cancelLeetCodeAnalysisResponseSchema.parse({
      requestId: request.requestId,
      cancelled: cancelOwnedAnalysis(owner, request.requestId),
    })
  })

  onMessage('genai.recommendLeetCodeAssessment', ({ data, sender }) => {
    const request = recommendLeetCodeAssessmentRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'genai.recommendLeetCodeAssessment',
      request.surface,
      sender,
    )
    return getAppDb().then(async ({ db }) =>
      recommendLeetCodeAssessmentResponseSchema.parse(
        await recommendLeetCodeAssessmentInBackground(db, request),
      ),
    )
  })

  onMessage('leetcode.readProblemMetadata', ({ data, sender }) => {
    const request = leetcodeProblemRemoteRuntimeRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'leetcode.readProblemMetadata',
      request.surface,
      sender,
    )
    return readLeetCodeProblemMetadataInBackground(request)
  })

  onMessage('leetcode.readProblemContent', ({ data, sender }) => {
    const request = leetcodeProblemRemoteRuntimeRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'leetcode.readProblemContent',
      request.surface,
      sender,
    )
    return readLeetCodeProblemContentInBackground(request)
  })

  onMessage('leetcode.readSubmissionResult', ({ data, sender }) => {
    const request =
      leetcodeSubmissionResultRemoteRuntimeRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'leetcode.readSubmissionResult',
      request.surface,
      sender,
    )
    return readLeetCodeSubmissionResultInBackground(request)
  })
}

const genAiLiveSmokeSchema = z.object({
  ok: z.literal(true),
})

async function runNotificationSmokeDryRun(db: Db) {
  const now = new Date()
  const [settings, queue, state] = await Promise.all([
    getSettings(db),
    getTodayQueue(db, now),
    readDueNotificationState(),
  ])

  return computeNotificationDryRun({
    now,
    reminders: settings.reminders,
    dueToday: queue.dueToday,
    lastNotifiedDate: state.lastNotifiedDate,
  })
}

async function runLiveGenAiSmoke(db: Db) {
  const config = await loadActiveProviderConfig(db)

  if (!config) {
    return {
      status: 'skip' as const,
      detail: 'Live GenAI skipped because no active provider config exists.',
    }
  }

  const result = await generateJson({
    ...config,
    prompt: {
      system:
        'Return compact JSON for a CogniPace developer smoke test. No prose.',
      user: 'Return {"ok":true}.',
    },
    schema: genAiLiveSmokeSchema,
    temperature: 0,
    timeoutMs: 10_000,
  })

  if (result.status === 'success') {
    return {
      status: 'pass' as const,
      detail: `Provider ${config.provider} responded for model ${config.model}.`,
      latencyMs: result.providerMetadata.durationMs,
    }
  }

  return {
    status:
      result.code === 'rate-limit' ||
      result.code === 'network' ||
      result.code === 'timeout'
        ? ('warn' as const)
        : ('fail' as const),
    detail: `Provider ${config.provider} returned ${result.code}: ${result.message}`,
    latencyMs: result.providerMetadata.durationMs,
  }
}

async function runSettingsMutation(
  source: 'popup' | 'dashboard',
  writeSettings: (db: Db) => Promise<UserSettings>,
  affectsGenAi = false,
) {
  let prev: UserSettings | undefined
  return runDbMutation(
    async (db) => {
      prev = await getSettings(db)
      return writeSettings(db)
    },
    async (next) => {
      await broadcastCacheInvalidation({
        reason: 'settings-updated',
        source,
        tags: affectsGenAi ? ['settings', 'genai'] : ['settings'],
      })
      if (prev !== undefined) {
        try {
          await dueNotification.onSettingsChanged(prev, next)
        } catch {
          // Notification rescheduling must not fail settings mutations.
        }
      }
    },
  )
}

function createSyncServiceForDb(db: Db) {
  return createSyncServiceForDbInQueue(db, false)
}

function createSyncServiceForDbInQueue(db: Db, isInsideMutationQueue: boolean) {
  return createBackgroundSyncService(
    db,
    async () => {
      await broadcastDataManagementInvalidation('dashboard')
    },
    {
      runRemoteRestore: (work) =>
        runRemoteRestoreInMutationQueue(work, isInsideMutationQueue),
    },
  )
}

type BackgroundSyncService = ReturnType<typeof createBackgroundSyncService>

function runQueuedSyncAction<T>(
  db: Db,
  action: (service: BackgroundSyncService) => Promise<T>,
) {
  return runInMutationQueue(async () => {
    const dirtyMarkReady = await retryPendingDirtyMark()

    if (!dirtyMarkReady) {
      throw new Error(
        'Local data changed but sync metadata could not be saved.',
      )
    }

    return action(createSyncServiceForDbInQueue(db, true))
  })
}

function parseSyncActionResult(result: unknown) {
  return syncActionResultSchema.parse(result)
}

type DbMutationSyncMode = 'mark-dirty' | 'none'

let dbMutationQueue: Promise<void> = Promise.resolve()
let dbMutationDepth = 0
let hasPendingDirtyMarkRetry = false

function runDbMutation<T>(
  write: (db: Db) => Promise<T>,
  afterFlush?: (result: T) => unknown,
  options: { syncMode?: DbMutationSyncMode } = {},
) {
  const syncMode = options.syncMode ?? 'mark-dirty'
  return runInMutationQueue(async () => {
    const { db } = await getAppDb()
    const result = await write(db)

    if (syncMode === 'mark-dirty') {
      await markSyncLocalDataChangedBestEffort()
    }

    await flushDbSnapshot()
    await afterFlush?.(result)

    if (syncMode === 'mark-dirty') {
      await scheduleAutoPushAfterMutationBestEffort()
    }

    return result
  })
}

function runInMutationQueue<T>(work: () => Promise<T>) {
  const queued = dbMutationQueue.then(async () => {
    dbMutationDepth += 1

    try {
      return await work()
    } finally {
      dbMutationDepth -= 1
    }
  })
  dbMutationQueue = queued.then(
    () => undefined,
    () => undefined,
  )

  return queued
}

async function scheduleAutoPushAfterMutationBestEffort() {
  try {
    await syncAutoSync.scheduleAutoPushAfterMutation()
  } catch {
    // Local saves already succeeded; automatic sync scheduling must not fail them.
  }
}

async function clearPendingAutomaticSyncBestEffort() {
  try {
    await syncAutoSync.clearPendingAutomaticSync()
  } catch {
    // Manual sync already succeeded; alarm cleanup should not change its result.
  }
}

async function markSyncLocalDataChangedBestEffort() {
  try {
    await markSyncLocalDataChanged()
    hasPendingDirtyMarkRetry = false
  } catch {
    hasPendingDirtyMarkRetry = true
    // Local data is already written; sync metadata failure must not fail saves.
  }
}

async function retryPendingDirtyMark() {
  if (!hasPendingDirtyMarkRetry) {
    return true
  }

  try {
    await markSyncLocalDataChanged()
    hasPendingDirtyMarkRetry = false
    return true
  } catch {
    return false
  }
}

function runRemoteRestoreInMutationQueue<T>(
  work: () => Promise<T>,
  isInsideMutationQueue: boolean,
) {
  const guardedWork = async () => {
    const metadata = await readSyncMetadata()

    if (metadata.dirtySinceLastSync) {
      throw new Error(
        'Sync conflict detected. Local data changed before remote data could be applied.',
      )
    }

    return work()
  }

  if (isInsideMutationQueue && dbMutationDepth > 0) {
    return guardedWork()
  }

  return runInMutationQueue(guardedWork)
}

function readReviewLogRequest(request: {
  log?:
    | {
        interviewPattern?: string | null | undefined
        timeComplexity?: string | null | undefined
        spaceComplexity?: string | null | undefined
        languages?: string | null | undefined
        notes?: string | null | undefined
      }
    | undefined
  notes?: string | null | undefined
}) {
  if (request.log) {
    return request.log
  }

  return request.notes === undefined ? undefined : { notes: request.notes }
}

function readSingleChangedProblemSlug(problemSlugs: readonly string[]) {
  return problemSlugs.length === 1 ? problemSlugs[0] : undefined
}

function broadcastProblemCatalogInvalidation(input: {
  problemSlug?: string | undefined
  source: UiSurface
}) {
  return broadcastCacheInvalidation({
    ...(input.problemSlug ? { problemSlug: input.problemSlug } : {}),
    reason: 'problem-catalog-updated',
    source: input.source,
    tags: ['problems'],
  })
}

function broadcastPracticeInvalidation(input: {
  problemSlug: string
  source: UiSurface
}) {
  return broadcastCacheInvalidation({
    problemSlug: input.problemSlug,
    reason: 'practice-updated',
    source: input.source,
    tags: ['practice'],
  })
}

function broadcastTracksInvalidation(input: {
  source: UiSurface
  tags?: Parameters<typeof broadcastCacheInvalidation>[0]['tags']
}) {
  return broadcastCacheInvalidation({
    reason: 'tracks-updated',
    source: input.source,
    tags: input.tags ?? ['tracks'],
  })
}

function broadcastSyncInvalidation(source: 'dashboard') {
  return broadcastCacheInvalidation({
    reason: 'sync-updated',
    source,
    tags: ['sync'],
  })
}

function broadcastDataManagementInvalidation(source: 'dashboard') {
  return broadcastCacheInvalidation({
    reason: 'problem-catalog-updated',
    source,
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
}

function serializeTodayQueue(queue: TodayQueue): SerializedTodayQueue {
  const serializeItem = (item: QueueItem) => ({
    category: item.category,
    problemSlug: item.problemSlug,
    title: item.title,
    difficulty: item.difficulty,
    isPremium: item.isPremium,
    state: serializeNormalizedPracticeState(item.state),
    reason: item.reason,
  })

  return todayQueueSchema.parse({
    generatedAt: queue.generatedAt.toISOString(),
    dueCount: queue.dueCount,
    dueToday: queue.dueToday,
    newCount: queue.newCount,
    newAvailable: queue.newAvailable,
    queueLoad: queue.queueLoad,
    reinforcementCount: queue.reinforcementCount,
    excludedCount: queue.excludedCount,
    recommendationReason: queue.recommendationReason,
    items: queue.items.map(serializeItem),
    topRecommendation: queue.topRecommendation
      ? serializeItem(queue.topRecommendation)
      : null,
  })
}

export function getAppShellRuntimeSurface(
  request: AppShellRequest,
): 'popup' | 'dashboard' | 'content-script' {
  return request.surface === 'overlay' ? 'content-script' : request.surface
}

export function serializeActiveTrack(
  activeTrack: ActiveTrack | null,
): SerializedActiveTrack {
  return serializeActiveTrackContract(activeTrack)
}
