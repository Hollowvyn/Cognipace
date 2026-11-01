import {
  githubGistBackupCapabilities,
  type BackupCapabilities,
} from '@/lib/github'
import type { SyncActionResult } from '@/features/sync/api/sync-contracts'
import type { SyncMetadata } from '@/features/sync/data/sync-metadata-store'
import { readAutoSyncRetryDelayMinutes } from '@/features/sync/domain/sync-auto-retry'

import type { AlarmScheduler } from './scheduler/alarm-scheduler'

export const syncAutoPushAlarmName = 'sync:auto-push'
export const syncRetryAlarmName = 'sync:retry'
export const syncPollAlarmName = 'sync:poll'
export const syncOpenCheckAlarmName = 'sync:open-check'
export const syncAutoPushDelayMinutes = 0.5
export const syncPollPeriodMinutes = 10
export const syncOpenCheckDelayMs = 2000
export const syncOpenCheckFallbackDelayMinutes = 0.5

export type SyncAutoSyncDependencies = {
  backupCapabilities?: BackupCapabilities
  hasPendingDirtyMarkRetry?: (() => boolean) | undefined
  now: () => Date
  readMetadata: () => Promise<SyncMetadata>
  writeMetadata: (patch: Partial<SyncMetadata>) => Promise<SyncMetadata>
  runCleanPullCheck: () => Promise<SyncActionResult>
  runSafePush: (input: {
    confirmRemoteOverwrite: false
  }) => Promise<SyncActionResult>
  scheduler: Pick<
    AlarmScheduler,
    'clear' | 'register' | 'repairStartupAlarms' | 'schedule'
  >
}

export function createSyncAutoSync(deps: SyncAutoSyncDependencies) {
  const backupCapabilities =
    deps.backupCapabilities ?? githubGistBackupCapabilities

  async function blockUnsupportedAutoPush() {
    if (backupCapabilities.verifiedFullBackup) return false
    // Capability is authoritative across restarts and failed metadata/alarm writes.
    // Stale upload alarms may fire, but can never initiate unsupported uploads.
    await Promise.allSettled([
      deps.scheduler.clear(syncAutoPushAlarmName),
      deps.scheduler.clear(syncRetryAlarmName),
    ])
    return true
  }

  let jobsRegistered = false
  let openCheckPending = false
  let openCheckRunning = false
  let openCheckTimer: ReturnType<typeof globalThis.setTimeout> | null = null

  async function scheduleAutoPushAfterMutation() {
    if (await blockUnsupportedAutoPush()) return
    const metadata = await deps.readMetadata()

    if (!metadata.enabled || !metadata.gistId) {
      return
    }

    await deps.scheduler.schedule(syncAutoPushAlarmName, {
      delayInMinutes: syncAutoPushDelayMinutes,
    })
  }

  async function runAutoPush() {
    if (await blockUnsupportedAutoPush()) return
    const metadata = await deps.readMetadata()
    const hasPendingDirtyMarkRetry = deps.hasPendingDirtyMarkRetry?.() ?? false

    if (
      !metadata.enabled ||
      !metadata.gistId ||
      (!metadata.dirtySinceLastSync && !hasPendingDirtyMarkRetry)
    ) {
      return
    }

    let result: SyncActionResult
    try {
      result = await deps.runSafePush({ confirmRemoteOverwrite: false })
    } catch {
      await scheduleRetry(metadata)
      return
    }

    if (result.outcome === 'success' || result.outcome === 'no-change') {
      await deps.writeMetadata({
        autoSyncRetryAttempt: 0,
        lastAutoSyncAt: deps.now().toISOString(),
      })
      await deps.scheduler.clear(syncRetryAlarmName)
      return
    }

    if (
      result.outcome === 'confirmation-required' ||
      result.reason === 'remote-changed'
    ) {
      await deps.scheduler.clear(syncAutoPushAlarmName)
      await deps.scheduler.clear(syncRetryAlarmName)
      return
    }

    if (result.outcome === 'error' && result.retryable) {
      await scheduleRetry(metadata)
      return
    }

    await deps.scheduler.clear(syncRetryAlarmName)
  }

  async function runCleanPullCheck() {
    const metadata = await deps.readMetadata()

    if (!metadata.enabled || !metadata.gistId || metadata.dirtySinceLastSync) {
      return
    }

    const result = await deps.runCleanPullCheck()

    if (result.direction !== 'pull' || result.outcome !== 'success') {
      return
    }

    await deps.writeMetadata({
      autoSyncRetryAttempt: 0,
      lastAutoSyncAt: deps.now().toISOString(),
    })
    await deps.scheduler.clear(syncRetryAlarmName)
  }

  async function requestOpenCheckAfterSurfaceOpen() {
    if (openCheckPending || openCheckRunning) {
      return
    }

    openCheckPending = true
    try {
      await deps.scheduler.schedule(syncOpenCheckAlarmName, {
        delayInMinutes: syncOpenCheckFallbackDelayMinutes,
      })

      openCheckTimer = globalThis.setTimeout(() => {
        openCheckTimer = null
        void runRequestedOpenCheck()
      }, syncOpenCheckDelayMs)
    } catch (error) {
      if (openCheckTimer !== null) {
        globalThis.clearTimeout(openCheckTimer)
        openCheckTimer = null
      }
      openCheckPending = false
      openCheckRunning = false
      throw error
    }
  }

  async function runRequestedOpenCheck() {
    if (openCheckRunning) {
      return
    }

    if (openCheckTimer !== null) {
      globalThis.clearTimeout(openCheckTimer)
      openCheckTimer = null
    }

    openCheckRunning = true

    try {
      await runCleanPullCheck()
    } finally {
      try {
        await deps.scheduler.clear(syncOpenCheckAlarmName)
      } finally {
        openCheckPending = false
        openCheckRunning = false
      }
    }
  }

  async function clearPendingAutomaticSync() {
    try {
      await deps.writeMetadata({
        autoSyncRetryAttempt: 0,
        lastAutoSyncAt: deps.now().toISOString(),
      })
    } finally {
      await deps.scheduler.clear(syncAutoPushAlarmName)
      await deps.scheduler.clear(syncRetryAlarmName)
    }
  }

  async function scheduleRetry(metadata: SyncMetadata) {
    const previousAttempt = metadata.autoSyncRetryAttempt

    try {
      await deps.writeMetadata({
        autoSyncRetryAttempt: previousAttempt + 1,
        lastAutoSyncAt: deps.now().toISOString(),
      })
    } catch {
      // Keep retry alarms moving even when metadata writes are temporarily down.
    }

    await deps.scheduler.schedule(syncRetryAlarmName, {
      delayInMinutes: readAutoSyncRetryDelayMinutes(previousAttempt),
    })
  }

  async function repairStartupAlarms() {
    await deps.scheduler.repairStartupAlarms()
    if (await blockUnsupportedAutoPush()) return
    // The metadata reader also consults the durable head. A worker restart may
    // have lost both the best-effort Chrome dirty write and the push alarm.
    const metadata = await deps.readMetadata()
    if (
      metadata.enabled &&
      metadata.gistId &&
      (metadata.dirtySinceLastSync || deps.hasPendingDirtyMarkRetry?.())
    ) {
      await deps.scheduler.schedule(syncAutoPushAlarmName, {
        delayInMinutes: syncAutoPushDelayMinutes,
      })
    }
  }

  function registerJobs() {
    if (jobsRegistered) {
      return
    }

    deps.scheduler.register({
      name: syncAutoPushAlarmName,
      run: runAutoPush,
    })
    deps.scheduler.register({
      name: syncRetryAlarmName,
      run: runAutoPush,
    })
    deps.scheduler.register({
      name: syncOpenCheckAlarmName,
      run: runRequestedOpenCheck,
    })
    deps.scheduler.register({
      name: syncPollAlarmName,
      run: runCleanPullCheck,
      startup: {
        delayInMinutes: syncPollPeriodMinutes,
        periodInMinutes: syncPollPeriodMinutes,
      },
    })
    jobsRegistered = true
  }

  return {
    clearPendingAutomaticSync,
    registerJobs,
    repairStartupAlarms,
    requestOpenCheckAfterSurfaceOpen,
    runAutoPush,
    runCleanPullCheck,
    runRequestedOpenCheck,
    scheduleAutoPushAfterMutation,
  }
}
