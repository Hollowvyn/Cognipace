import { githubGistBackupCapabilities } from '@/lib/github'
import {
  createBackupTransferService,
  reconcileCompletedBackupTransfers,
} from '@/features/backup/server/backup-transfer-service'
import {
  beginTransferRequestSchema,
  transferRequestSchema,
  readTransferChunkRequestSchema,
  appendTransferChunkRequestSchema,
  finishTransferRequestSchema,
  transferSessionSchema,
  transferChunkSchema,
  finishTransferResultSchema,
} from '@/features/backup/api/backup-transfer-contracts'
import { backupTransferDocumentOwner } from './runtime-policy'
import {
  exportDurableFullBackup,
  createFullBackupPreview,
  validateFullBackupConfirmation,
  prepareFullBackupReplacement,
  prepareGistFullBackupReplacement,
} from './full-backup-service'
import {
  replacementCommandKey,
  replacementCommandRecordSchema,
} from '@/platform/db/snapshot-idb'
import {
  prepareProblemDataReplacement,
  problemDataRequestFingerprint,
  type ProblemDataReplacementInput,
} from './problem-data-service'
import { problemsResetProblemDataRequestSchema } from '@/features/problems/api/problems-contracts'
import { registerNotesHandlers } from './notes-handlers'
import { createNotesEditScopes } from './notes-edit-scopes'
import { createNotesRepository } from '@/features/notes/data/notes-repository'
import { createNotesService } from '@/features/notes/server/notes-service'
import { getProblemContext } from '@/features/problems/server/problems-service'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import { waitForPendingDbSnapshot } from '@/platform/db/instance'
import {
  configureMutationQueue,
  runInMutationQueue,
  runGatedMutationQueue,
  runConsistentRead,
  resumePendingLocalSave,
  isLocalSavePending,
  setPendingLocalSave,
  clearRecoveredMutationRetry,
  setRecoveredMutationRetry,
  takeRecoveredMutationRetry,
  localSaveError,
} from './mutation-queue'
import {
  generateLeetCodeImplementationRequestSchema,
  generateLeetCodeImplementationResponseSchema,
  cancelLeetCodeImplementationRequestSchema,
  cancelLeetCodeImplementationResponseSchema,
} from '@/features/leetcode-review-assistant/api/code-implementation-contracts'
import { generateLeetCodeImplementationInBackground } from '@/features/leetcode-review-assistant/server/implementation-runtime-service'
import { timeOverlayStartup } from '@/lib/performance/overlay-startup-timing'

import {
  analyticsSummaryRequestSchema,
  analyticsSummarySchema,
  backupPayloadRequestSchema,
  backupRequestSchema,
  backupResetRequestSchema,
  backupReplacementResultSchema,
  backupReplacementStateSchema,
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
  getAiHintConnectionStatus,
  loadActiveProviderConfig,
  setAiProviderSecret,
} from '@/features/genai/server/genai-settings-service'
import { testAiConnection } from '@/features/genai/server/genai-connection-service'
import { aiProviderSecretPresenceSchema } from '@/features/genai/domain'
import { generateJson, withAiDeadline } from '@/lib/ai'
import {
  hintConnectionRequestSchema,
  hintConnectionStatusSchema,
} from '@/features/genai/api/hint-connection-contracts'
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
import {
  generateLeetCodeHintsRequestSchema,
  generateLeetCodeHintsResponseSchema,
  cancelLeetCodeHintsRequestSchema,
  cancelLeetCodeHintsResponseSchema,
} from '@/features/leetcode-review-assistant/api/code-hint-contracts'
import { generateLeetCodeHintsInBackground } from '@/features/leetcode-review-assistant/server/hint-runtime-service'
import { analyzeLeetCodeSubmissionInBackground } from '@/features/leetcode-review-assistant/server/analysis-runtime-service'
import {
  practiceDetailsRequestSchema,
  practicePreviewRequestSchema,
  practicePreviewResponseSchema,
  practiceReviewCommandResultSchema,
  practiceOverrideLastReviewResultRequestSchema,
  practiceResetScheduleRequestSchema,
  practiceSaveReviewResultRequestSchema,
  practiceSetSuspendedRequestSchema,
} from '@/features/practice/api/practice-contracts'
import {
  acceptedPracticeReviewCommandSchema,
  type AcceptedPracticeReviewCommand,
} from '@/features/practice/domain'
import {
  serializeNormalizedPracticeState,
  serializePracticeDetails,
} from '@/features/practice/api/practice-serializers'
import {
  getPracticeDetails,
  previewPracticeReview,
  executePracticeReviewCommand,
  setPracticeSuspended,
} from '@/features/practice/server/practice-service'
import {
  bulkUpdateProblems,
  createProblem,
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
  remoteReplacementMetadataSchema,
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
import {
  createSnapshotIdbStore,
  type ReplacementContinuation,
} from '@/platform/db/snapshot-idb'
import { z } from 'zod'

import {
  analysisOwner,
  runOwnedImplementation,
  cancelOwnedImplementation,
  cancelOwnedAnalysis,
  cancelOwnedHints,
  runOwnedHints,
  runOwnedAnalysis,
} from './leetcode-analysis-operations'
import { broadcastCacheInvalidation } from './cache-invalidation-broadcaster'
import {
  computeNotificationDryRun,
  createDevSmokeService,
  readChromeStorageCapacity,
} from './dev-smoke-service'
import { registerImportHandlers } from './import-handlers'
import { createBackupReplacementCoordinator } from './backup-replacement'
import {
  assertCanSenderCallExtensionMethod,
  assertHintProblemSender,
} from './runtime-policy'
import {
  getBackgroundDb as getAppDb,
  verifyBackgroundReplacementAdoption,
  withBackgroundDb,
  withBackgroundDbLoader,
} from './app-db'
import { createAlarmScheduler } from './scheduler/alarm-scheduler'
import { createSyncAutoSync } from './sync-auto-sync'
import {
  createDueNotification,
  readDueNotificationState,
  writeDueNotificationState,
} from './due-notification'

const alarmScheduler = createAlarmScheduler()
const replacementStore =
  typeof indexedDB === 'undefined'
    ? undefined
    : createSnapshotIdbStore(indexedDB)
const backupReplacement = createBackupReplacementCoordinator({
  ...(replacementStore ? { store: replacementStore } : {}),
  resumeAdoption: verifyBackgroundReplacementAdoption,
  resume: (record: ReplacementContinuation) => ({
    onDurable: () => broadcastDataManagementInvalidation('dashboard'),
    finishSyncMetadata: async () => {
      if (record.kind === 'gist-pull') {
        const patch = remoteReplacementMetadataSchema.parse(
          record.syncMetadataPatch,
        )
        const { autoSyncRetryAttempt, lastAutoSyncAt, ...required } = patch
        await writeSyncMetadata({
          ...required,
          ...(autoSyncRetryAttempt === undefined
            ? {}
            : { autoSyncRetryAttempt }),
          ...(lastAutoSyncAt === undefined ? {} : { lastAutoSyncAt }),
        })
      } else {
        await markSyncLocalDataChanged()
        hasPendingDirtyMarkRetry = false
        await scheduleAutoPushAfterMutationBestEffort()
      }
    },
  }),
})
configureMutationQueue({
  ready: () => backupReplacement.ready(),
  assertIdle: () => backupReplacement.assertIdle(),
  assertReadable: () => backupReplacement.assertReadable(),
  flush: flushDbSnapshot,
  waitForPendingCoreSave: waitForPendingDbSnapshot,
})
let clearPendingImportPersistence = () => {}
let hasPendingImportPersistence = () => false
const syncAutoSync = createSyncAutoSync({
  backupCapabilities: githubGistBackupCapabilities,
  scheduler: alarmScheduler,
  hasPendingDirtyMarkRetry: () => hasPendingDirtyMarkRetry,
  now: () => new Date(),
  readMetadata: readSyncMetadata,
  writeMetadata: (patch) =>
    runGatedMutationQueue(() => writeSyncMetadata(patch)),
  runSafePush: async (input) => {
    const { db } = await getAppDb()

    return parseSyncActionResult(
      await runQueuedSyncAction(db, (service) =>
        service.pushLocal({ ...input, automatic: true }),
      ),
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
  readSettings: () => withBackgroundDb(({ db }) => getSettings(db)),
  readQueueSummary: () =>
    withBackgroundDb(async ({ db }) => {
      const queue = await getTodayQueue(db, new Date())
      return { dueToday: queue.dueToday }
    }),
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
  // Register narrow infrastructure only. No Notes UI/capture is activated.
  const notesLocal =
    typeof indexedDB === 'undefined'
      ? undefined
      : createLocalIdbStore(indexedDB)
  const requireNotesLocal = () => {
    if (!notesLocal) throw new Error('Local Notes storage is unavailable.')
    return notesLocal
  }
  async function retryReplacementWithTransferReceipts() {
    const result = await backupReplacement.retry()
    if (notesLocal && backupReplacement.getState().status === 'idle')
      await reconcileCompletedBackupTransfers(notesLocal)
    return result
  }
  const acceptedProblemOperations = new Map<
    string,
    {
      fingerprint: string
      result: import('@/features/backup/api/backup-contracts').BackupReplacementResult
    }
  >()
  function runProblemDataReplacement(
    input: Omit<ProblemDataReplacementInput, 'commandId'> & {
      commandId?: string | undefined
    },
    surface: 'dashboard' | 'popup' | 'content-script',
  ) {
    if (!input.commandId)
      throw new Error(
        'Refresh required: reload CogniPace before resetting or deleting problem data.',
      )
    const commandId = input.commandId
    const fingerprint = problemDataRequestFingerprint(input)
    return runInMutationQueue(async () => {
      await backupReplacement.ready()
      const completed = await requireNotesLocal().readRecord(
        replacementCommandKey(commandId),
      )
      if (completed !== undefined) {
        const command = replacementCommandRecordSchema.parse(completed)
        if (
          command.requestFingerprint !== fingerprint ||
          command.kind !== input.kind
        )
          throw new Error(
            'Problem data command identity conflict. Refresh and try again.',
          )
        const continuation = await replacementStore?.readContinuation()
        if (continuation?.replacementId === commandId)
          return backupReplacementResultSchema.parse(
            await backupReplacement.retry(),
          )
        return backupReplacementResultSchema.parse({
          status: 'durable',
          kind: input.kind,
          summary: null,
          syncMetadataPending: false,
        })
      }
      const accepted = acceptedProblemOperations.get(commandId)
      if (accepted) {
        if (accepted.fingerprint !== fingerprint)
          throw new Error(
            'Problem data command identity conflict. Refresh and try again.',
          )
        if (backupReplacement.getState().status !== 'idle') {
          accepted.result = backupReplacementResultSchema.parse(
            await backupReplacement.retry(),
          )
        } else {
          accepted.result = backupReplacementResultSchema.parse({
            status: 'durable',
            kind: input.kind,
            summary: null,
            syncMetadataPending: false,
          })
        }
        return accepted.result
      }
      backupReplacement.assertIdle()
      await resumePendingLocalSave()
      await getAppDb()
      await markSyncLocalDataChanged()
      hasPendingDirtyMarkRetry = false
      const result = backupReplacementResultSchema.parse(
        await backupReplacement.run({
          kind: input.kind,
          prepare: () =>
            prepareProblemDataReplacement(requireNotesLocal(), {
              ...input,
              commandId,
            }),
          onDurable: async () => {
            clearPendingImportPersistence()
            recoveredReviewRetry = null
            clearRecoveredMutationRetry()
            await broadcastDataManagementInvalidation(surface)
          },
          finishSyncMetadata: async () => {
            await markSyncLocalDataChanged()
            hasPendingDirtyMarkRetry = false
            await scheduleAutoPushAfterMutationBestEffort()
          },
        }),
      )
      acceptedProblemOperations.set(commandId, { fingerprint, result })
      return result
    })
  }
  const notesLeases = () => createNotesEditScopes(requireNotesLocal())
  registerNotesHandlers({
    getService: async () => {
      await getAppDb()
      return createNotesService(
        createNotesRepository(requireNotesLocal()),
        (slug) =>
          withBackgroundDb(
            async ({ db: current }) =>
              (await getProblemContext(current, slug)) !== null,
          ),
      )
    },
    getLeases: notesLeases,
    runRead: runConsistentRead,
    runMutation: runGatedMutationQueue,
    // This check runs inside the same serialized callback as any legacy idle
    // technical side effects; relaxed read admission alone never permits writes.
    canMutate: () => {
      try {
        backupReplacement.assertIdle()
        return true
      } catch {
        return false
      }
    },
    emit: async (problemSlug, source, tags) => {
      await markSyncLocalDataChanged()
      await broadcastCacheInvalidation({
        reason: 'notes-updated',
        source,
        problemSlug,
        tags,
      })
      await scheduleAutoPushAfterMutationBestEffort()
    },
  })
  if (replacementStore) {
    void backupReplacement
      .ready()
      .then(() => runInMutationQueue(retryReplacementWithTransferReceipts))
      .catch(() => {
        // Failed continuation or receipt bookkeeping stays recoverable on retry.
      })
  }
  syncAutoSync.registerJobs()
  void syncAutoSync.repairStartupAlarms()

  dueNotification.registerJobs()
  void dueNotification.handleStartup()

  const importHandlers = registerImportHandlers({
    runInMutationQueue: (work, retryPersistence) =>
      retryPersistence
        ? runInMutationQueue(async () => {
            backupReplacement.assertIdle()
            if (!hasPendingImportPersistence()) await resumePendingLocalSave()
            clearRecoveredMutationRetry()
            return work()
          })
        : runGatedMutationQueue(work),
    getDb: async () => (await getAppDb()).db,
    flush: flushDbSnapshot,
    onPersistencePending: (onDurable) => {
      setPendingLocalSave(onDurable)
    },
    retrySharedPendingPersistence: resumePendingLocalSave,
    markDirty: markSyncLocalDataChangedBestEffort,
    invalidate: async () =>
      broadcastCacheInvalidation({
        reason: 'problem-catalog-updated',
        source: 'dashboard',
        tags: ['problems', 'tracks', 'analytics'],
      }),
    scheduleSync: scheduleAutoPushAfterMutationBestEffort,
  })
  clearPendingImportPersistence = importHandlers.clearPendingPersistence
  hasPendingImportPersistence = importHandlers.hasPendingPersistence

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
    return withBackgroundDb(async ({ db }) =>
      appShellDataSchema.parse(
        await timeOverlayStartup('worker.app-shell', () =>
          getAppShellData(db, request),
        ),
      ),
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

  // Legacy object IPC is explicitly disabled by runtime policy. Internal
  // object helpers remain available only to trusted owners and service tests.
  onMessage('backup.exportFullBackup', ({ data, sender }) => {
    const request = backupRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'backup.exportFullBackup',
      request.surface,
      sender,
    )
    throw new Error('Use bounded backup transfer sessions.')
  })
  onMessage('backup.validateFullBackup', ({ data, sender }) => {
    const request = backupPayloadRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'backup.validateFullBackup',
      request.surface,
      sender,
    )
    throw new Error('Use bounded backup transfer sessions.')
  })
  onMessage('backup.restoreFullBackup', ({ data, sender }) => {
    const request = backupPayloadRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'backup.restoreFullBackup',
      request.surface,
      sender,
    )
    throw new Error('Use bounded backup transfer sessions.')
  })
  onMessage('backup.beginTransfer', ({ data, sender }) => {
    const request = beginTransferRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'backup.beginTransfer',
      request.surface,
      sender,
    )
    const owner = backupTransferDocumentOwner(sender)
    const run =
      request.direction === 'export'
        ? runGatedMutationQueue
        : runInMutationQueue
    return run(async () =>
      transferSessionSchema
        .strip()
        .parse(await transferFor(owner).begin(owner, request)),
    )
  })
  onMessage('backup.appendTransferChunk', ({ data, sender }) => {
    const request = appendTransferChunkRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'backup.appendTransferChunk',
      request.surface,
      sender,
    )
    const owner = backupTransferDocumentOwner(sender)
    return runInMutationQueue(async () =>
      transferSessionSchema
        .strip()
        .parse(
          await transferFor(owner).append(
            owner,
            request,
            request.sequence,
            request.text,
          ),
        ),
    )
  })
  onMessage('backup.readTransferChunk', ({ data, sender }) => {
    const request = readTransferChunkRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'backup.readTransferChunk',
      request.surface,
      sender,
    )
    const owner = backupTransferDocumentOwner(sender)
    return runInMutationQueue(async () =>
      transferChunkSchema.parse(
        await transferFor(owner).read(owner, request, request.sequence),
      ),
    )
  })
  onMessage('backup.finishTransfer', ({ data, sender }) => {
    const request = finishTransferRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'backup.finishTransfer',
      request.surface,
      sender,
    )
    const owner = backupTransferDocumentOwner(sender)
    const run = request.confirmationToken
      ? runInMutationQueue
      : runGatedMutationQueue
    const transfer = transferFor(owner)
    return transfer
      .assertOwned(owner, request)
      .then(() =>
        run(async () =>
          finishTransferResultSchema.parse(
            await transfer.finish(owner, request, request),
          ),
        ),
      )
  })
  onMessage('backup.cancelTransfer', ({ data, sender }) => {
    const request = transferRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'backup.cancelTransfer',
      request.surface,
      sender,
    )
    const owner = backupTransferDocumentOwner(sender)
    return runInMutationQueue(() => transferFor(owner).cancel(owner, request))
  })

  onMessage('sync.getStatus', ({ data, sender }) => {
    const request = syncRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'sync.getStatus',
      request.surface,
      sender,
    )
    return withBackgroundDb(async ({ db }) =>
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
    return withBackgroundDb(async ({ db }) =>
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
    return withBackgroundDb(async ({ db }) =>
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
    return withBackgroundDb(async ({ db }) =>
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
    return withBackgroundDb(async ({ db }) => {
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
    return withBackgroundDb(async ({ db }) => {
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
    return withBackgroundDb(async ({ db }) =>
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
    return withBackgroundDb(async ({ db }) => {
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
    return withBackgroundDb(async ({ db }) =>
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

    backupReplacement.assertIdle()

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
    return withBackgroundDb(async ({ db }) => {
      const result = parseSyncActionResult(
        await runQueuedSyncAction(db, (service) =>
          service.pullLatest({
            confirmLocalOverwrite: request.confirmLocalOverwrite,
            ...(request.confirmationToken
              ? { confirmationToken: request.confirmationToken }
              : {}),
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
    return withBackgroundDb(async ({ db }) => {
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

  function transferFor(owner: string) {
    return createBackupTransferService({
      local: requireNotesLocal(),
      currentRevision: async () =>
        (await requireNotesLocal().readHead())?.revision ?? 0,
      exportSnapshot: async (consume) => {
        const snapshot = await exportDurableFullBackup(requireNotesLocal())
        await consume(snapshot.backup, snapshot.revision)
      },
      preview: (backup, sessionId) =>
        createFullBackupPreview(requireNotesLocal(), backup, {
          sourceIdentity: JSON.stringify([
            'dashboard-transfer',
            owner,
            sessionId,
          ]),
        }),
      restore: async (backup, confirmationToken, sessionId) => {
        const sourceIdentity = JSON.stringify([
          'dashboard-transfer',
          owner,
          sessionId,
        ])
        await backupReplacement.ready()
        const local = requireNotesLocal()
        const prepared = await validateFullBackupConfirmation(
          local,
          backup,
          confirmationToken,
          { sourceIdentity },
        )
        const commandId = confirmationToken
        const completed = await local.readRecord(
          replacementCommandKey(commandId),
        )
        if (completed !== undefined) {
          const continuation = await replacementStore?.readContinuation()
          return backupReplacementResultSchema.parse(
            continuation?.replacementId === commandId
              ? await backupReplacement.retry()
              : {
                  status: 'durable',
                  kind: 'restore',
                  summary: prepared.summary,
                  syncMetadataPending: false,
                },
          )
        }
        backupReplacement.assertIdle()
        await resumePendingLocalSave()
        await markSyncLocalDataChanged()
        hasPendingDirtyMarkRetry = false
        return backupReplacementResultSchema.parse(
          await backupReplacement.run({
            kind: 'restore',
            prepare: () =>
              prepareFullBackupReplacement(local, { prepared, commandId }),
            onDurable: async () => {
              clearPendingImportPersistence()
              recoveredReviewRetry = null
              clearRecoveredMutationRetry()
              await broadcastDataManagementInvalidation('dashboard')
            },
            finishSyncMetadata: async () => {
              await markSyncLocalDataChanged()
              hasPendingDirtyMarkRetry = false
              await scheduleAutoPushAfterMutationBestEffort()
            },
          }),
        )
      },
    })
  }

  onMessage('backup.resetLocalData', ({ data, sender }) => {
    const request = backupResetRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'backup.resetLocalData',
      request.surface,
      sender,
    )
    return runProblemDataReplacement(
      { kind: 'reset', problemSlugs: [], commandId: request.commandId },
      request.surface,
    )
  })

  onMessage('backup.getPendingReplacement', ({ data, sender }) => {
    const request = backupRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'backup.getPendingReplacement',
      request.surface,
      sender,
    )
    return backupReplacement
      .ready()
      .then(() =>
        backupReplacementStateSchema.parse(backupReplacement.getState()),
      )
  })

  onMessage('backup.retryPendingReplacement', ({ data, sender }) => {
    const request = backupRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'backup.retryPendingReplacement',
      request.surface,
      sender,
    )
    return runInMutationQueue(async () => {
      await backupReplacement.ready()
      await resumePendingLocalSave()
      clearRecoveredMutationRetry()
      return backupReplacementResultSchema.parse(
        await retryReplacementWithTransferReceipts(),
      )
    })
  })

  onMessage('problems.upsertFromPage', ({ data, sender }) => {
    const request = problemsUpsertFromPageRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.upsertFromPage',
      request.surface,
      sender,
    )
    return timeOverlayStartup('worker.upsert', () =>
      runDbMutation(
        (db) => upsertProblemFromPage(db, request),
        (problem) =>
          broadcastProblemCatalogInvalidation({
            problemSlug: problem.slug,
            source: request.surface,
          }),
        { retryKey: mutationRetryKey('problems.upsertFromPage', request) },
      ),
    )
  })

  onMessage('problems.getLibrary', ({ data, sender }) => {
    const request = problemsGetLibraryRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.getLibrary',
      request.surface,
      sender,
    )
    return withBackgroundDb(async ({ db }) =>
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
    return withBackgroundDb(async ({ db }) =>
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
      { retryKey: mutationRetryKey('problems.createProblem', request) },
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
      { retryKey: mutationRetryKey('problems.updateProblem', request) },
    )
  })

  onMessage('problems.resetProblemData', ({ data, sender }) => {
    const request = problemsResetProblemDataRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'problems.resetProblemData',
      request.surface,
      sender,
    )
    return runProblemDataReplacement(
      {
        kind: 'problem-reset',
        problemSlugs: request.problemSlugs,
        commandId: request.commandId,
      },
      request.surface,
    )
  })

  onMessage('problems.deleteProblem', ({ data, sender }) => {
    const request = problemsDeleteProblemRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.deleteProblem',
      request.surface,
      sender,
    )
    return runProblemDataReplacement(
      {
        kind: 'problem-delete',
        problemSlugs: [request.problemSlug],
        commandId: request.commandId,
      },
      request.surface,
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
      { retryKey: mutationRetryKey('problems.bulkUpdateProblems', request) },
    )
  })

  onMessage('problems.bulkDelete', ({ data, sender }) => {
    const request = problemsBulkDeleteRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'problems.bulkDelete',
      request.surface,
      sender,
    )
    return runProblemDataReplacement(
      {
        kind: 'problem-delete',
        problemSlugs: request.problemSlugs,
        commandId: request.commandId,
      },
      request.surface,
    )
  })

  onMessage('practice.getDetails', ({ data, sender }) => {
    const request = practiceDetailsRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'practice.getDetails',
      request.surface,
      sender,
    )
    return withBackgroundDb(async ({ db }) => {
      const details = await getPracticeDetails(db, request.problemSlug, {
        ...(request.at ? { now: new Date(request.at) } : {}),
      })

      return serializePracticeDetails(details)
    })
  })

  onMessage('practice.previewReview', ({ data, sender }) => {
    const request = practicePreviewRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'practice.previewReview',
      request.surface,
      sender,
    )
    const { surface: _surface, ...input } = request
    void _surface
    return runGatedMutationQueue(async () => {
      const { db } = await getAppDb()
      return practicePreviewResponseSchema.parse(
        await previewPracticeReview(db, input),
      )
    })
  })

  onMessage('practice.saveReviewResult', ({ data, sender }) => {
    const request = practiceSaveReviewResultRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'practice.saveReviewResult',
      request.surface,
      sender,
    )
    const { surface, ...command } = request
    return runPracticeReviewCommand(
      acceptedPracticeReviewCommandSchema.parse({
        ...command,
        operation: 'save',
      }),
      surface,
    )
  })

  onMessage('practice.overrideLastReviewResult', ({ data, sender }) => {
    const request = practiceOverrideLastReviewResultRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'practice.overrideLastReviewResult',
      request.surface,
      sender,
    )
    const { surface, ...command } = request
    return runPracticeReviewCommand(
      acceptedPracticeReviewCommandSchema.parse({
        ...command,
        operation: 'update',
      }),
      surface,
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
      { retryKey: mutationRetryKey('practice.setSuspended', request) },
    )
  })

  onMessage('practice.resetSchedule', ({ data, sender }) => {
    const request = practiceResetScheduleRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'practice.resetSchedule',
      request.surface,
      sender,
    )
    return runProblemDataReplacement(
      {
        kind: 'problem-reset',
        problemSlugs: [request.problemSlug],
        commandId: request.commandId,
      },
      request.surface,
    )
  })

  onMessage('analytics.getSummary', ({ data, sender }) => {
    const request = analyticsSummaryRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'analytics.getSummary',
      request.surface,
      sender,
    )

    return withBackgroundDb(async ({ db }) => {
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

    return withBackgroundDb(async ({ db }) => {
      const smoke = createDevSmokeService({
        now: () => new Date(),
        readAnalyticsSummary: () =>
          runGatedMutationQueue(() => getAnalyticsSummary(db)),
        readQueueSummary: () =>
          runGatedMutationQueue(async () => {
            const queue = await getTodayQueue(db, new Date())

            return {
              dueToday: queue.dueToday,
              newAvailable: queue.newAvailable,
              queueLoad: queue.queueLoad,
              recommendationReason: queue.recommendationReason,
            }
          }),
        readGenAiConfig: () =>
          runGatedMutationQueue(async () => {
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
          }),
        runNotificationDryRun: () =>
          runGatedMutationQueue(() => runNotificationSmokeDryRun(db)),
        runLiveGenAi: () => runLiveGenAiSmoke(),
        readCapacityStorage: () =>
          runGatedMutationQueue(() =>
            readChromeStorageCapacity(chrome.storage.local),
          ),
      })

      return devSmokeReportSchema.parse(
        await smoke.run({
          ...(request.runLiveGenAi !== undefined
            ? { runLiveGenAi: request.runLiveGenAi }
            : {}),
          ...(request.includeCapacity !== undefined
            ? { includeCapacity: request.includeCapacity }
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
    return withBackgroundDb(async ({ db }) =>
      serializeTodayQueue(
        await getTodayQueue(
          db,
          request.at ? new Date(request.at) : undefined,
          request.intent,
        ),
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
    return withBackgroundDb(async ({ db }) =>
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
    return withBackgroundDb(async ({ db }) =>
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
    return withBackgroundDb(async ({ db }) =>
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
      { retryKey: mutationRetryKey('tracks.setActiveTrack', request) },
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
      { retryKey: mutationRetryKey('tracks.clearActiveTrack', request) },
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
      { retryKey: mutationRetryKey('tracks.createTrack', request) },
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
      { retryKey: mutationRetryKey('tracks.updateTrack', request) },
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
      { retryKey: mutationRetryKey('tracks.removeProblem', request) },
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
      { retryKey: mutationRetryKey('tracks.deleteTrack', request) },
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
      { retryKey: mutationRetryKey('tracks.resetTrackProgress', request) },
    )
  })

  onMessage('settings.getSettings', ({ data, sender }) => {
    const request = settingsRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'settings.getSettings',
      request.surface,
      sender,
    )
    return withBackgroundDb(async ({ db }) => {
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
      mutationRetryKey('settings.updateSettings', request),
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
    return runSettingsMutation(
      mutationRetryKey('settings.toggleStudyMode', request),
      request.surface,
      (db) => toggleStudyMode(db),
    ).then(() => null)
  })

  onMessage('settings.cycleThemeMode', ({ data, sender }) => {
    const request = settingsCycleThemeModeRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'settings.cycleThemeMode',
      request.surface,
      sender,
    )
    return runSettingsMutation(
      mutationRetryKey('settings.cycleThemeMode', request),
      request.surface,
      (db) => cycleThemeMode(db),
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
        hintProvider: request.provider,
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
        hintProvider: request.provider,
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
    return withBackgroundDbLoader((loadDb) =>
      testAiConnection(request, loadDb),
    ).then((result) => testAiConnectionResponseSchema.parse(result))
  })

  onMessage('genai.getHintConnection', ({ data, sender }) => {
    const request = hintConnectionRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'genai.getHintConnection',
      request.surface,
      sender,
    )
    return withAiDeadline({ timeoutMs: 20_000 }, async (signal) => {
      return withBackgroundDb(async ({ db }) => {
        signal.throwIfAborted()
        const status = await getAiHintConnectionStatus(db)
        signal.throwIfAborted()
        return hintConnectionStatusSchema.parse(status)
      })
    }).catch(() => {
      throw new Error('Saved AI connection could not be loaded. Please retry.')
    })
  })

  onMessage('genai.generateLeetCodeHints', ({ data, sender }) => {
    const request = generateLeetCodeHintsRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'genai.generateLeetCodeHints',
      request.surface,
      sender,
    )
    assertHintProblemSender(sender, request.problem)
    return runOwnedHints(
      analysisOwner(sender),
      request.requestId,
      request.connectionProvider,
      async (signal) =>
        generateLeetCodeHintsResponseSchema.parse(
          await withBackgroundDbLoader((loadDb) =>
            generateLeetCodeHintsInBackground(request, loadDb, signal),
          ),
        ),
    )
  })

  onMessage('genai.cancelLeetCodeHints', ({ data, sender }) => {
    const request = cancelLeetCodeHintsRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'genai.cancelLeetCodeHints',
      request.surface,
      sender,
    )
    return cancelLeetCodeHintsResponseSchema.parse({
      requestId: request.requestId,
      cancelled: cancelOwnedHints(analysisOwner(sender), request.requestId),
    })
  })

  onMessage('genai.generateLeetCodeImplementation', ({ data, sender }) => {
    const request = generateLeetCodeImplementationRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'genai.generateLeetCodeImplementation',
      request.surface,
      sender,
    )
    assertHintProblemSender(sender, {
      host: request.host,
      slug: request.assessment.problemSlug,
    })
    return runOwnedImplementation(
      analysisOwner(sender),
      request.requestId,
      async (signal) =>
        generateLeetCodeImplementationResponseSchema.parse(
          await withBackgroundDbLoader((loadDb) =>
            generateLeetCodeImplementationInBackground(request, loadDb, signal),
          ),
        ),
    )
  })
  onMessage('genai.cancelLeetCodeImplementation', ({ data, sender }) => {
    const request = cancelLeetCodeImplementationRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'genai.cancelLeetCodeImplementation',
      request.surface,
      sender,
    )
    return cancelLeetCodeImplementationResponseSchema.parse({
      requestId: request.requestId,
      cancelled: cancelOwnedImplementation(
        analysisOwner(sender),
        request.requestId,
      ),
    })
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
        await withBackgroundDbLoader((loadDb) =>
          analyzeLeetCodeSubmissionInBackground(request, loadDb, signal),
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

  onMessage('leetcode.readProblemMetadata', ({ data, sender }) => {
    const request = leetcodeProblemRemoteRuntimeRequestSchema.parse(data)

    assertCanSenderCallExtensionMethod(
      'leetcode.readProblemMetadata',
      request.surface,
      sender,
    )
    return timeOverlayStartup('worker.metadata', () =>
      readLeetCodeProblemMetadataInBackground(request),
    )
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

async function runLiveGenAiSmoke() {
  const config = await runGatedMutationQueue(() =>
    withBackgroundDb(({ db }) => loadActiveProviderConfig(db)),
  )

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
  retryKey: string,
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
        ...(affectsGenAi
          ? {
              hintConnectionChanged:
                prev === undefined ||
                prev.aiAssessment.provider !== next.aiAssessment.provider ||
                prev.aiAssessment.model.trim() !==
                  next.aiAssessment.model.trim(),
            }
          : {}),
      })
      if (prev !== undefined) {
        try {
          await dueNotification.onSettingsChanged(prev, next)
        } catch {
          // Notification rescheduling must not fail settings mutations.
        }
      }
    },
    { retryKey },
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
      withDb: (work) => withBackgroundDb(({ db: current }) => work(current)),
      acknowledgeVerifiedRevision: (revision) =>
        createSnapshotIdbStore(indexedDB).acknowledgeVerifiedRevision(revision),
      exportFullBackup: () => {
        const work = () =>
          exportDurableFullBackup(createLocalIdbStore(indexedDB))
        return isInsideMutationQueue ? work() : runGatedMutationQueue(work)
      },
      previewRemoteRestore: (input, sourceIdentity) =>
        createFullBackupPreview(createLocalIdbStore(indexedDB), input, {
          kind: 'gist-pull',
          sourceIdentity,
        }),
      reconcileRemoteRestore: async (confirmationToken) => {
        const local = createLocalIdbStore(indexedDB)
        const raw = await local.readRecord(
          replacementCommandKey(confirmationToken),
        )
        if (raw === undefined) return null
        const command = replacementCommandRecordSchema.parse(raw)
        if (command.kind !== 'gist-pull')
          throw new Error(
            'Gist restore confirmation identity conflicts. Review a fresh preview.',
          )
        const continuation = await replacementStore?.readContinuation()
        return continuation?.replacementId === confirmationToken
          ? backupReplacement.retry()
          : {
              status: 'durable',
              kind: 'gist-pull',
              summary: null,
              syncMetadataPending: false,
            }
      },
      runFullBackupReplacement: async (prepared, continuations, context) => {
        const local = createLocalIdbStore(indexedDB)
        if (context?.confirmationToken) {
          prepared = await validateFullBackupConfirmation(
            local,
            context.sourceInput,
            context.confirmationToken,
            { kind: 'gist-pull', sourceIdentity: context.sourceIdentity },
          )
        }
        return backupReplacement.run({
          kind: 'gist-pull',
          prepare: () =>
            context?.confirmationToken
              ? prepareFullBackupReplacement(local, {
                  prepared,
                  commandId: context.confirmationToken,
                })
              : prepareGistFullBackupReplacement(local, prepared),
          ...continuations,
          onDurable: async () => {
            clearPendingImportPersistence()
            recoveredReviewRetry = null
            clearRecoveredMutationRetry()
            await continuations.onDurable()
          },
        })
      },
      runRemoteRestore: (work, context) =>
        runRemoteRestoreInMutationQueue(work, isInsideMutationQueue, context),
      runReplacement: () =>
        Promise.reject(
          new Error('Full backup restores require detached pair preparation.'),
        ),
    },
  )
}

type BackgroundSyncService = ReturnType<typeof createBackgroundSyncService>

function runQueuedSyncAction<T>(
  db: Db,
  action: (service: BackgroundSyncService) => Promise<T>,
) {
  return runGatedMutationQueue(async () => {
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

let hasPendingDirtyMarkRetry = false
let recoveredReviewRetry: {
  key: string
  result: ReturnType<typeof practiceReviewCommandResultSchema.parse>
} | null = null

function runPracticeReviewCommand(
  command: AcceptedPracticeReviewCommand,
  source: UiSurface,
) {
  return runGatedMutationQueue(async () => {
    const key = JSON.stringify([command, source])
    if (recoveredReviewRetry?.key === key) {
      const saved = recoveredReviewRetry.result
      recoveredReviewRetry = null
      return saved
    }
    recoveredReviewRetry = null
    const { db } = await getAppDb()
    const result = practiceReviewCommandResultSchema.parse(
      await executePracticeReviewCommand(db, command),
    )
    if (result.status === 'conflict') return result
    // Persist the overwrite guard before a published review can outlive this worker.
    await markSyncLocalDataChangedBestEffort()
    const afterDurable = async () => {
      await broadcastPracticeInvalidation({
        problemSlug: command.problemSlug,
        source,
      })
      await scheduleAutoPushAfterMutationBestEffort()
    }
    try {
      await flushDbSnapshot()
    } catch {
      hasPendingDirtyMarkRetry = true
      setPendingLocalSave(async () => {
        await afterDurable()
        recoveredReviewRetry = { key, result }
      })
      return practiceReviewCommandResultSchema.parse({
        ...result,
        status: 'persistence-pending',
      })
    }
    await afterDurable()
    return practiceReviewCommandResultSchema.parse(result)
  })
}

function runDbMutation<T>(
  write: (db: Db) => Promise<T>,
  afterFlush: ((result: T) => unknown) | undefined,
  options: { retryKey: string; syncMode?: DbMutationSyncMode },
) {
  const syncMode = options.syncMode ?? 'mark-dirty'
  return runGatedMutationQueue(async () => {
    const recovered = takeRecoveredMutationRetry<T>(options.retryKey)
    if (recovered) return recovered.result
    const { db } = await getAppDb()
    const result = await write(db)

    if (syncMode === 'mark-dirty') {
      await markSyncLocalDataChangedBestEffort()
    }

    const afterDurable = async () => {
      await afterFlush?.(result)
      if (syncMode === 'mark-dirty') {
        await scheduleAutoPushAfterMutationBestEffort()
      }
    }
    try {
      await timeOverlayStartup('worker.snapshot-publish', () =>
        flushDbSnapshot(),
      )
    } catch (error) {
      setPendingLocalSave(async () => {
        await afterDurable()
        setRecoveredMutationRetry(options.retryKey, result)
      })
      throw new Error(localSaveError, { cause: error })
    }
    await afterDurable()

    return result
  }, options.retryKey)
}

function mutationRetryKey(method: string, request: unknown) {
  return JSON.stringify([method, request])
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
    if (isLocalSavePending()) await resumePendingLocalSave()
    else await flushDbSnapshot()
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
  context: { confirmLocalOverwrite?: boolean } = {},
) {
  const guardedWork = async () => {
    backupReplacement.assertIdle()
    const metadata = await readSyncMetadata()

    if (metadata.dirtySinceLastSync && context.confirmLocalOverwrite !== true) {
      throw new Error(
        'Sync conflict detected. Local data changed before remote data could be applied.',
      )
    }

    return work()
  }

  if (isInsideMutationQueue) {
    return guardedWork()
  }

  return runGatedMutationQueue(guardedWork)
}

function readSingleChangedProblemSlug(problemSlugs: readonly string[]) {
  return problemSlugs.length === 1 ? problemSlugs[0] : undefined
}

function broadcastProblemCatalogInvalidation(input: {
  archive?: boolean
  problemSlug?: string | undefined
  source: UiSurface
}) {
  return broadcastCacheInvalidation({
    ...(input.problemSlug ? { problemSlug: input.problemSlug } : {}),
    reason: 'problem-catalog-updated',
    source: input.source,
    tags: input.archive ? ['problems', 'notes', 'submissions'] : ['problems'],
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

function broadcastDataManagementInvalidation(
  source: 'dashboard' | 'popup' | 'content-script',
) {
  return broadcastCacheInvalidation({
    hintConnectionReset: true,
    reason: 'problem-catalog-updated',
    source,
    tags: [
      'settings',
      'genai',
      'problems',
      'notes',
      'submissions',
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
