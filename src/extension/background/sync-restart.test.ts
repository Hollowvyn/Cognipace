import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (message: { data: unknown; sender: unknown }) => unknown
  >(),
  getGist: vi.fn(),
  autoSyncDependencies: undefined as
    | { hasPendingDirtyMarkRetry?: () => boolean }
    | undefined,
}))

vi.mock('@/extension/messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/extension/messaging')>()),
  onMessage: (
    method: string,
    handler: (message: { data: unknown; sender: unknown }) => unknown,
  ) => {
    harness.handlers.set(method, handler)
    return () => undefined
  },
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getURL: (path: string) => `chrome-extension://extension-id${path}`,
    },
  },
}))

vi.mock('./cache-invalidation-broadcaster', () => ({
  broadcastCacheInvalidation: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./scheduler/alarm-scheduler', () => ({
  createAlarmScheduler: () => ({}),
}))
vi.mock('./sync-auto-sync', () => ({
  createSyncAutoSync: (deps: { hasPendingDirtyMarkRetry?: () => boolean }) => {
    harness.autoSyncDependencies = deps
    return {
      registerJobs: vi.fn(),
      repairStartupAlarms: vi.fn().mockResolvedValue(undefined),
      scheduleAutoPushAfterMutation: vi.fn().mockResolvedValue(undefined),
      clearPendingAutomaticSync: vi.fn().mockResolvedValue(undefined),
    }
  },
}))
vi.mock('./due-notification', () => ({
  createDueNotification: () => ({
    registerJobs: vi.fn(),
    handleStartup: vi.fn().mockResolvedValue(undefined),
    onSettingsChanged: vi.fn().mockResolvedValue(undefined),
  }),
  readDueNotificationState: vi.fn(),
  writeDueNotificationState: vi.fn(),
}))
vi.mock('@/platform/secrets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/secrets')>()),
  readSecret: vi.fn().mockResolvedValue('synthetic-github-token'),
  getSecretStatus: vi.fn().mockResolvedValue({
    provider: 'github:gist',
    configured: true,
    updatedAt: null,
    fingerprint: null,
  }),
}))
vi.mock('@/lib/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/github')>()),
  createGitHubGistClient: () => ({ getGist: harness.getGist }),
}))

const metadataKey = 'cognipace_sync_metadata_v1'
const values: Record<string, unknown> = {}
let rejectDirtyMetadata = false
let rejectedDirtyWrites = 0
let deferDirtyWrite = false
let rejectPendingDirtyWrite: ((error: Error) => void) | undefined
const storage = {
  get: vi.fn((keys: string[] | string) =>
    Promise.resolve(
      Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys])
          .filter((key) => key in values)
          .map((key) => [key, structuredClone(values[key])]),
      ),
    ),
  ),
  set: vi.fn(async (patch: Record<string, unknown>) => {
    const metadata = patch[metadataKey] as
      | { dirtySinceLastSync?: boolean }
      | undefined
    if (rejectDirtyMetadata && metadata?.dirtySinceLastSync === true) {
      rejectedDirtyWrites += 1
      if (deferDirtyWrite) {
        deferDirtyWrite = false
        return new Promise<void>((_resolve, reject) => {
          rejectPendingDirtyWrite = reject
        })
      }
      throw new Error('Transient metadata storage failure')
    }
    Object.assign(values, structuredClone(patch))
  }),
  remove: vi.fn((keys: string[] | string) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]
    return Promise.resolve()
  }),
}

const cleanup: Array<() => void> = []
beforeEach(() => {
  for (const key of Object.keys(values)) delete values[key]
  rejectDirtyMetadata = false
  rejectedDirtyWrites = 0
  rejectPendingDirtyWrite = undefined
  deferDirtyWrite = false
  harness.handlers.clear()
  vi.clearAllMocks()
})
afterEach(() => {
  while (cleanup.length) cleanup.pop()?.()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function send(method: string, data: unknown) {
  const handler = harness.handlers.get(method)
  if (!handler) throw new Error(`Missing handler ${method}`)
  return handler({
    data,
    sender: { url: 'chrome-extension://extension-id/dashboard.html' },
  })
}

it.each([
  { phase: 'after dirty marking fails', deferred: false },
  { phase: 'while dirty marking is pending', deferred: true },
])(
  'protects a local snapshot $phase and after worker restart',
  async ({ deferred }) => {
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      storage: { local: storage },
    })
    const instance = await import('@/platform/db/instance')
    const { getBackgroundDb } = await import('./app-db')
    const { registerBackgroundHandlers } = await import('./register-handlers')
    const { createSettingsRepository } =
      await import('@/features/settings/data/settings-repository')
    const { exportFullBackup } =
      await import('@/features/backup/server/backup-service')
    const { buildSyncEnvelope } =
      await import('@/features/sync/domain/sync-envelope')
    const { readSyncMetadata, writeSyncMetadata } =
      await import('@/features/sync/data/sync-metadata-store')
    const { SNAPSHOT_KEY, SNAPSHOT_DIRTY_KEY } =
      await import('@/platform/db/snapshot')
    const first = await getBackgroundDb()
    cleanup.push(() => {
      instance.resetAppDbForTesting()
      first.rawDb.close()
    })
    await createSettingsRepository(first.db).updateSettings({
      appearance: { themeMode: 'light' },
    })
    await instance.flushDbSnapshot()
    const remoteBackup = await exportFullBackup(first.db)
    await writeSyncMetadata({
      enabled: true,
      gistId: 'synthetic-gist',
      lastRemoteVersion: 'version-1',
      dirtySinceLastSync: false,
    })
    const initialSnapshot = values[SNAPSHOT_KEY]
    harness.getGist.mockResolvedValue({
      id: 'synthetic-gist',
      htmlUrl: 'https://gist.github.com/synthetic-gist',
      updatedAt: '2026-10-02T15:00:00.000Z',
      remoteVersion: 'version-2',
      content: JSON.stringify(
        buildSyncEnvelope({
          backup: remoteBackup,
          dataUpdatedAt: '2026-10-02T15:00:00.000Z',
        }),
      ),
      contentTruncated: false,
      rawUrl: null,
    })
    registerBackgroundHandlers()
    rejectDirtyMetadata = true
    deferDirtyWrite = deferred
    if (deferred) vi.useFakeTimers()
    const save = send('settings.updateSettings', {
      surface: 'dashboard',
      patch: { appearance: { themeMode: 'dark' } },
    })
    if (deferred) {
      await vi.waitFor(() =>
        expect(rejectPendingDirtyWrite).toBeTypeOf('function'),
      )
      await vi.advanceTimersByTimeAsync(250)
      expect(values[SNAPSHOT_DIRTY_KEY]).toBe(true)
      expect(values[SNAPSHOT_KEY]).not.toBe(initialSnapshot)
      rejectPendingDirtyWrite?.(new Error('Transient metadata storage failure'))
    }
    await expect(save).resolves.toMatchObject({
      appearance: { themeMode: 'dark' },
    })
    vi.useRealTimers()
    expect(rejectedDirtyWrites).toBe(1)
    expect(values[SNAPSHOT_KEY]).not.toBe(initialSnapshot)
    expect(
      (values[metadataKey] as { dirtySinceLastSync: boolean })
        .dirtySinceLastSync,
    ).toBe(false)
    expect((await readSyncMetadata()).dirtySinceLastSync).toBe(true)
    expect(harness.autoSyncDependencies?.hasPendingDirtyMarkRetry?.()).toBe(
      true,
    )
    await expect(
      send('sync.checkRemoteOnOpen', { surface: 'dashboard' }),
    ).rejects.toThrow(
      'Local data changed but sync metadata could not be saved.',
    )
    expect(harness.getGist).not.toHaveBeenCalled()

    // Terminate worker state after the acknowledged snapshot write; preserve only Chrome storage.
    instance.resetAppDbForTesting()
    first.rawDb.close()
    cleanup.pop()
    vi.resetModules()
    harness.handlers.clear()
    rejectDirtyMetadata = false
    const nextInstance = await import('@/platform/db/instance')
    const nextAppDb = await import('./app-db')
    const nextHandlers = await import('./register-handlers')
    const nextSettings =
      await import('@/features/settings/data/settings-repository')
    const reopened = await nextAppDb.getBackgroundDb()
    cleanup.push(() => {
      nextInstance.resetAppDbForTesting()
      reopened.rawDb.close()
    })
    await expect(
      nextSettings.createSettingsRepository(reopened.db).getSettings(),
    ).resolves.toMatchObject({ appearance: { themeMode: 'dark' } })
    nextHandlers.registerBackgroundHandlers()
    expect(harness.autoSyncDependencies?.hasPendingDirtyMarkRetry?.()).toBe(
      false,
    )
    await expect(
      send('sync.checkRemoteOnOpen', { surface: 'dashboard' }),
    ).resolves.toMatchObject({ outcome: 'no-change', reason: 'local-dirty' })
    expect(harness.getGist).not.toHaveBeenCalled()
    await expect(
      nextSettings.createSettingsRepository(reopened.db).getSettings(),
    ).resolves.toMatchObject({ appearance: { themeMode: 'dark' } })
  },
  30_000,
)
