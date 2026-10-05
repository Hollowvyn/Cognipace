import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ImportApplyResponse,
  ImportPreviewResponse,
} from '@/features/imports/api/import-runtime-contracts'
import type { Db } from '@/platform/db'

const mocks = vi.hoisted(() => {
  const handlers = new Map<
    string,
    (message: { data: unknown; sender: unknown }) => unknown
  >()
  const calls: string[] = []
  const onMessage = vi.fn(
    (
      method: string,
      handler: (message: { data: unknown; sender: unknown }) => unknown,
    ) => {
      handlers.set(method, handler)
    },
  )

  return {
    handlers,
    calls,
    onMessage,
    previewContentImport: vi.fn(),
    applyContentImport: vi.fn(),
  }
})

vi.mock('@/extension/messaging', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/extension/messaging')>()
  return { ...actual, onMessage: mocks.onMessage }
})

vi.mock('@/features/imports/server/import-service', () => ({
  applyContentImport: mocks.applyContentImport,
  previewContentImport: mocks.previewContentImport,
}))

vi.mock('./runtime-policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runtime-policy')>()
  return {
    ...actual,
    assertCanSenderCallExtensionMethod: vi.fn(
      (
        method: string,
        surface: 'background' | 'popup' | 'dashboard' | 'content-script',
        sender: unknown,
      ) => {
        mocks.calls.push('authorize')
        return actual.assertCanSenderCallExtensionMethod(
          method,
          surface,
          sender,
        )
      },
    ),
  }
})

import {
  registerImportHandlers,
  type ImportHandlerDependencies,
} from './import-handlers'

const preview: ImportPreviewResponse = {
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
}

const dashboardSender = {
  url: 'chrome-extension://extension-id/dashboard.html',
}
const request = { surface: 'dashboard', fileText: '{"format":"v1"}' }
const db = { name: 'test-db' } as unknown as Db

function createDependencies(
  queueOverride?: ImportHandlerDependencies['runInMutationQueue'],
) {
  const runInMutationQueueSpy = vi.fn()
  const runInMutationQueue: ImportHandlerDependencies['runInMutationQueue'] = <
    T,
  >(
    work: () => Promise<T>,
  ) => {
    runInMutationQueueSpy()
    mocks.calls.push('queue')
    return work()
  }

  return {
    runInMutationQueue: queueOverride ?? runInMutationQueue,
    runInMutationQueueSpy,
    getDb: vi.fn(() => {
      mocks.calls.push('get-db')
      return Promise.resolve(db)
    }),
    flush: vi.fn(() => {
      mocks.calls.push('flush')
      return Promise.resolve()
    }),
    markDirty: vi.fn(() => {
      mocks.calls.push('mark-dirty')
      return Promise.resolve()
    }),
    invalidate: vi.fn(() => {
      mocks.calls.push('invalidate')
      return Promise.resolve(undefined)
    }),
    scheduleSync: vi.fn(() => {
      mocks.calls.push('schedule-sync')
      return Promise.resolve()
    }),
  }
}

function handler(method: string) {
  const registered = mocks.handlers.get(method)
  expect(registered).toBeDefined()
  return registered!
}

function applyResult(status: ImportApplyResponse['status'] | 'committed'): {
  status: string
  preview: ImportPreviewResponse
} {
  return { status, preview }
}

describe('import background handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.calls.length = 0
    vi.clearAllMocks()
    mocks.previewContentImport.mockResolvedValue(preview)
    mocks.applyContentImport.mockImplementation(() => {
      mocks.calls.push('apply')
      return Promise.resolve(applyResult('committed'))
    })
  })

  it('registers dashboard-only preview, apply, and persistence-retry handlers', () => {
    registerImportHandlers(createDependencies())

    expect(mocks.onMessage.mock.calls.map(([method]) => method)).toEqual([
      'imports.preview',
      'imports.apply',
      'imports.retryPersistence',
    ])
  })

  it('authorizes and queues preview before opening the database', async () => {
    const deps = createDependencies()
    registerImportHandlers(deps)

    await expect(
      handler('imports.preview')({ data: request, sender: dashboardSender }),
    ).resolves.toEqual(preview)

    expect(mocks.calls).toEqual(['authorize', 'queue', 'get-db'])
    expect(mocks.previewContentImport).toHaveBeenCalledWith(
      db,
      request.fileText,
    )
    expect(deps.runInMutationQueueSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects forged surfaces before opening the database or entering the queue', () => {
    const deps = createDependencies()
    registerImportHandlers(deps)

    expect(() =>
      handler('imports.preview')({
        data: request,
        sender: { url: 'chrome-extension://extension-id/popup.html' },
      }),
    ).toThrow(/cannot claim/)

    expect(mocks.calls).toEqual(['authorize'])
    expect(deps.getDb).not.toHaveBeenCalled()
    expect(deps.runInMutationQueueSpy).not.toHaveBeenCalled()
  })

  it('validates request bytes and fields before authorization or database access', () => {
    const deps = createDependencies()
    registerImportHandlers(deps)

    expect(() =>
      handler('imports.preview')({
        data: { ...request, fileText: 'é'.repeat(2_621_441) },
        sender: dashboardSender,
      }),
    ).toThrow()
    expect(() =>
      handler('imports.apply')({
        data: { ...request, fingerprint: 'bad' },
        sender: dashboardSender,
      }),
    ).toThrow()

    expect(mocks.calls).toEqual([])
    expect(deps.getDb).not.toHaveBeenCalled()
  })

  it('commits, marks dirty, flushes, invalidates, and schedules sync in order', async () => {
    const deps = createDependencies()
    registerImportHandlers(deps)

    await expect(
      handler('imports.apply')({
        data: { ...request, fingerprint: preview.fingerprint },
        sender: dashboardSender,
      }),
    ).resolves.toEqual({ status: 'saved', preview })

    expect(mocks.calls).toEqual([
      'authorize',
      'queue',
      'get-db',
      'apply',
      'mark-dirty',
      'flush',
      'invalidate',
      'schedule-sync',
    ])
    expect(mocks.applyContentImport).toHaveBeenCalledWith(
      db,
      request.fileText,
      preview.fingerprint,
    )
  })

  it('keeps a preview behind every step of a multi-insert apply', async () => {
    let releaseSecondInsert!: () => void
    let signalApplyStarted!: () => void
    const secondInsert = new Promise<void>((resolve) => {
      releaseSecondInsert = resolve
    })
    const applyStarted = new Promise<void>((resolve) => {
      signalApplyStarted = resolve
    })
    let queueCalls = 0
    let queueTail: Promise<void> = Promise.resolve()
    const runInMutationQueue: ImportHandlerDependencies['runInMutationQueue'] =
      <T>(work: () => Promise<T>) => {
        queueCalls += 1
        const queued = queueTail.then(work)
        queueTail = queued.then(
          () => undefined,
          () => undefined,
        )
        return queued
      }
    const deps = createDependencies(runInMutationQueue)
    mocks.applyContentImport.mockImplementationOnce(async () => {
      mocks.calls.push('insert-one')
      signalApplyStarted()
      await secondInsert
      mocks.calls.push('insert-two')
      return applyResult('committed')
    })
    registerImportHandlers(deps)

    const applyPromise = handler('imports.apply')({
      data: { ...request, fingerprint: preview.fingerprint },
      sender: dashboardSender,
    })
    await applyStarted
    const previewPromise = handler('imports.preview')({
      data: request,
      sender: dashboardSender,
    })

    await Promise.resolve()
    expect(mocks.previewContentImport).not.toHaveBeenCalled()
    expect(mocks.calls).toEqual([
      'authorize',
      'get-db',
      'insert-one',
      'authorize',
    ])

    releaseSecondInsert()
    await Promise.all([applyPromise, previewPromise])

    expect(mocks.calls.indexOf('insert-two')).toBeLessThan(
      mocks.calls.indexOf('mark-dirty'),
    )
    expect(mocks.previewContentImport).toHaveBeenCalledTimes(1)
    expect(queueCalls).toBe(2)
  })

  it.each(['stale', 'blocked', 'unchanged'] as const)(
    'stops after apply for %s outcomes',
    async (status) => {
      const deps = createDependencies()
      mocks.applyContentImport.mockResolvedValueOnce(applyResult(status))
      registerImportHandlers(deps)

      await expect(
        handler('imports.apply')({
          data: { ...request, fingerprint: preview.fingerprint },
          sender: dashboardSender,
        }),
      ).resolves.toEqual({ status, preview })

      expect(mocks.calls).toEqual(['authorize', 'queue', 'get-db'])
      expect(mocks.applyContentImport).toHaveBeenCalledTimes(1)
    },
  )

  it('lets transaction failures reject without persistence side effects', async () => {
    const deps = createDependencies()
    mocks.applyContentImport.mockRejectedValueOnce(
      new Error('transaction failed'),
    )
    registerImportHandlers(deps)

    await expect(
      handler('imports.apply')({
        data: { ...request, fingerprint: preview.fingerprint },
        sender: dashboardSender,
      }),
    ).rejects.toThrow('transaction failed')

    expect(mocks.calls).toEqual(['authorize', 'queue', 'get-db'])
    expect(mocks.applyContentImport).toHaveBeenCalledTimes(1)
  })

  it('retains a failed snapshot for retry and clears it only after a successful flush', async () => {
    const deps = createDependencies()
    deps.flush.mockImplementation(() => {
      mocks.calls.push('flush')
      return Promise.reject(new Error('storage is temporarily unavailable'))
    })
    registerImportHandlers(deps)

    await expect(
      handler('imports.apply')({
        data: { ...request, fingerprint: preview.fingerprint },
        sender: dashboardSender,
      }),
    ).resolves.toEqual({ status: 'persistence-error', preview })
    expect(mocks.calls).toEqual([
      'authorize',
      'queue',
      'get-db',
      'apply',
      'mark-dirty',
      'flush',
      'invalidate',
    ])

    mocks.calls.length = 0
    deps.flush.mockImplementationOnce(() => {
      mocks.calls.push('flush')
      return Promise.resolve()
    })
    await expect(
      handler('imports.retryPersistence')({
        data: { surface: 'dashboard' },
        sender: dashboardSender,
      }),
    ).resolves.toEqual({ status: 'saved' })
    expect(mocks.calls).toEqual([
      'authorize',
      'queue',
      'flush',
      'invalidate',
      'schedule-sync',
    ])

    mocks.calls.length = 0
    await expect(
      handler('imports.retryPersistence')({
        data: { surface: 'dashboard' },
        sender: dashboardSender,
      }),
    ).resolves.toEqual({ status: 'repreview' })
    expect(mocks.calls).toEqual(['authorize', 'queue'])
  })

  it('uses a later successful import flush to resolve an earlier pending snapshot', async () => {
    let flushAttempts = 0
    const deps = createDependencies()
    deps.flush.mockImplementation(() => {
      mocks.calls.push('flush')
      flushAttempts += 1
      if (flushAttempts <= 3) {
        return Promise.reject(new Error('storage unavailable'))
      }
      return Promise.resolve()
    })
    registerImportHandlers(deps)

    const apply = () =>
      handler('imports.apply')({
        data: { ...request, fingerprint: preview.fingerprint },
        sender: dashboardSender,
      })

    await expect(apply()).resolves.toMatchObject({
      status: 'persistence-error',
    })
    await expect(
      handler('imports.retryPersistence')({
        data: { surface: 'dashboard' },
        sender: dashboardSender,
      }),
    ).resolves.toEqual({ status: 'persistence-error' })
    mocks.calls.length = 0
    await expect(
      handler('imports.retryPersistence')({
        data: { surface: 'dashboard' },
        sender: dashboardSender,
      }),
    ).resolves.toEqual({ status: 'persistence-error' })

    mocks.calls.length = 0
    mocks.applyContentImport.mockImplementationOnce(() => {
      mocks.calls.push('apply')
      return Promise.resolve(applyResult('committed'))
    })
    await expect(apply()).resolves.toEqual({ status: 'saved', preview })
    expect(mocks.calls).toEqual([
      'authorize',
      'queue',
      'get-db',
      'apply',
      'mark-dirty',
      'flush',
      'invalidate',
      'schedule-sync',
    ])

    mocks.calls.length = 0
    await expect(
      handler('imports.retryPersistence')({
        data: { surface: 'dashboard' },
        sender: dashboardSender,
      }),
    ).resolves.toEqual({ status: 'repreview' })
  })

  it('keeps persistence and invalidation callbacks best-effort after a DB commit', async () => {
    const deps = createDependencies()
    deps.markDirty.mockImplementation(() => {
      mocks.calls.push('mark-dirty')
      return Promise.reject(new Error('metadata store unavailable'))
    })
    deps.invalidate.mockImplementation(() => {
      mocks.calls.push('invalidate')
      return Promise.reject(new Error('dashboard closed'))
    })
    deps.scheduleSync.mockImplementation(() => {
      mocks.calls.push('schedule-sync')
      return Promise.reject(new Error('alarm unavailable'))
    })
    registerImportHandlers(deps)

    await expect(
      handler('imports.apply')({
        data: { ...request, fingerprint: preview.fingerprint },
        sender: dashboardSender,
      }),
    ).resolves.toEqual({ status: 'saved', preview })
    expect(mocks.calls.slice(-4)).toEqual([
      'mark-dirty',
      'flush',
      'invalidate',
      'schedule-sync',
    ])
  })

  it('runs every handler through the injected queue and leaves pending persistence on no-op applies', async () => {
    let flushAttempts = 0
    const deps = createDependencies()
    deps.flush.mockImplementation(() => {
      mocks.calls.push('flush')
      flushAttempts += 1
      if (flushAttempts === 1) {
        return Promise.reject(new Error('first flush failed'))
      }
      return Promise.resolve()
    })
    registerImportHandlers(deps)

    await handler('imports.apply')({
      data: { ...request, fingerprint: preview.fingerprint },
      sender: dashboardSender,
    })
    mocks.applyContentImport.mockResolvedValueOnce(applyResult('unchanged'))
    mocks.calls.length = 0
    await handler('imports.preview')({ data: request, sender: dashboardSender })
    await handler('imports.apply')({
      data: { ...request, fingerprint: preview.fingerprint },
      sender: dashboardSender,
    })

    expect(deps.runInMutationQueueSpy).toHaveBeenCalledTimes(3)
    expect(deps.flush).toHaveBeenCalledTimes(1)
    expect(mocks.calls.filter((call) => call === 'queue')).toHaveLength(2)

    mocks.calls.length = 0
    await handler('imports.retryPersistence')({
      data: { surface: 'dashboard' },
      sender: dashboardSender,
    })
    expect(mocks.calls).toContain('flush')
    expect(mocks.calls).toContain('schedule-sync')
  })

  it('starts a fresh handler registration with no pending snapshot', async () => {
    const first = createDependencies()
    first.flush.mockImplementation(() => {
      mocks.calls.push('flush')
      return Promise.reject(new Error('first flush failed'))
    })
    registerImportHandlers(first)
    await handler('imports.apply')({
      data: { ...request, fingerprint: preview.fingerprint },
      sender: dashboardSender,
    })

    mocks.handlers.clear()
    mocks.calls.length = 0
    registerImportHandlers(createDependencies())
    await expect(
      handler('imports.retryPersistence')({
        data: { surface: 'dashboard' },
        sender: dashboardSender,
      }),
    ).resolves.toEqual({ status: 'repreview' })
  })

  it('clears only the obsolete acknowledgement when accepted replacement owns the data', async () => {
    const deps = createDependencies()
    deps.flush.mockRejectedValueOnce(new Error('disk'))
    const registered = registerImportHandlers(deps)
    await handler('imports.apply')({
      data: { ...request, fingerprint: preview.fingerprint },
      sender: dashboardSender,
    })
    registered.clearPendingPersistence()
    const count = deps.flush.mock.calls.length
    await expect(
      handler('imports.retryPersistence')({
        data: { surface: 'dashboard' },
        sender: dashboardSender,
      }),
    ).resolves.toEqual({ status: 'repreview' })
    expect(deps.flush).toHaveBeenCalledTimes(count)
    expect(mocks.applyContentImport).toHaveBeenCalledTimes(1)
  })
})
