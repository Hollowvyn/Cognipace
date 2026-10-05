import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestDbHandle = { db: { kind: 'test-db' } }
type TestPublishContext = {
  kind: 'fresh' | 'upgrade'
  fromFingerprint: string | null
}
type TestAppDbOptions = {
  beforePublish: (
    handle: TestDbHandle,
    context: TestPublishContext,
  ) => Promise<void>
  validateCurrentData: (handle: TestDbHandle) => Promise<void>
}
type TestReconciliationOptions = {
  legacy: boolean
  now: Date
  catalogue: unknown
}

const appDbMocks = vi.hoisted(() => ({
  getAppDb: vi.fn<(options: TestAppDbOptions) => Promise<TestDbHandle>>(),
  reconcileTopicTaxonomy:
    vi.fn<
      (
        db: TestDbHandle['db'],
        options: TestReconciliationOptions,
      ) => Promise<void>
    >(),
  preparePracticeStorage: vi.fn<(db: TestDbHandle['db']) => Promise<void>>(),
  validatePracticeStorage: vi.fn<(db: TestDbHandle['db']) => Promise<void>>(),
}))

vi.mock('@/platform/db', () => ({ getAppDb: appDbMocks.getAppDb }))
vi.mock('@/features/problems/data/topic-reconciliation', () => ({
  reconcileTopicTaxonomy: appDbMocks.reconcileTopicTaxonomy,
}))
vi.mock('@/features/practice/server/practice-storage-service', () => ({
  preparePracticeStorage: appDbMocks.preparePracticeStorage,
  validatePracticeStorage: appDbMocks.validatePracticeStorage,
}))

import { getBackgroundDb } from './app-db'
import { legacyFsrsMigrationFingerprint } from '@/platform/db/snapshot-upgrade'
import {
  seedTopicAliases,
  seedTopicRelations,
  seedTopics,
} from '@/platform/db/topic-taxonomy-seed'

describe('background app database bridge', () => {
  const handle: TestDbHandle = { db: { kind: 'test-db' } }

  beforeEach(() => {
    vi.clearAllMocks()
    appDbMocks.reconcileTopicTaxonomy.mockResolvedValue(undefined)
    appDbMocks.preparePracticeStorage.mockResolvedValue(undefined)
    appDbMocks.validatePracticeStorage.mockResolvedValue(undefined)
    appDbMocks.getAppDb.mockImplementation(async ({ beforePublish }) => {
      await beforePublish(handle, {
        kind: 'fresh',
        fromFingerprint: null,
      })
      return handle
    })
  })

  it('passes the current curated catalogue and classifies fresh and upgrade opens', async () => {
    await expect(getBackgroundDb()).resolves.toBe(handle)
    expect(appDbMocks.getAppDb).toHaveBeenCalledTimes(1)
    const freshOptions = appDbMocks.getAppDb.mock.calls[0]?.[0]
    if (!freshOptions) throw new Error('Expected database options.')
    await freshOptions.beforePublish(handle, {
      kind: 'upgrade',
      fromFingerprint: 'legacy00',
    })

    const calls = appDbMocks.reconcileTopicTaxonomy.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]?.[0]).toBe(handle.db)
    expect(calls[0]?.[1].legacy).toBe(false)
    expect(calls[0]?.[1].now).toBeInstanceOf(Date)
    expect(calls[0]?.[1].catalogue).toEqual({
      topics: seedTopics,
      aliases: seedTopicAliases,
      relations: seedTopicRelations,
    })
    expect(calls[1]?.[0]).toBe(handle.db)
    expect(calls[1]?.[1].legacy).toBe(true)
    expect(calls[1]?.[1].now).toBeInstanceOf(Date)
    expect(calls[1]?.[1].catalogue).toEqual({
      topics: seedTopics,
      aliases: seedTopicAliases,
      relations: seedTopicRelations,
    })
  })

  it('propagates reconciliation failures so the platform cannot publish the handle', async () => {
    const failure = new Error('taxonomy collision')
    appDbMocks.reconcileTopicTaxonomy.mockRejectedValue(failure)

    await expect(getBackgroundDb()).rejects.toBe(failure)
    expect(appDbMocks.reconcileTopicTaxonomy).toHaveBeenCalledTimes(1)
  })

  it('does not rerun historical taxonomy conversion for the through-0009 source', async () => {
    appDbMocks.getAppDb.mockImplementation(async ({ beforePublish }) => {
      await beforePublish(handle, {
        kind: 'upgrade',
        fromFingerprint: legacyFsrsMigrationFingerprint,
      })
      return handle
    })

    await expect(getBackgroundDb()).resolves.toBe(handle)
    expect(appDbMocks.reconcileTopicTaxonomy).not.toHaveBeenCalled()
    expect(appDbMocks.preparePracticeStorage).toHaveBeenCalledWith(handle.db)
  })

  it('prepares Practice after taxonomy and supplies read-only current validation', async () => {
    const order: string[] = []
    appDbMocks.reconcileTopicTaxonomy.mockImplementation(() => {
      order.push('taxonomy')
      return Promise.resolve()
    })
    appDbMocks.preparePracticeStorage.mockImplementation(() => {
      order.push('practice')
      return Promise.resolve()
    })
    appDbMocks.validatePracticeStorage.mockImplementation(() => {
      order.push('validate')
      return Promise.resolve()
    })
    await getBackgroundDb()
    const options = appDbMocks.getAppDb.mock.calls[0]![0]
    await options.validateCurrentData(handle)
    expect(order).toEqual(['taxonomy', 'practice', 'validate'])
    const failure = new Error('invalid Practice metadata')
    appDbMocks.validatePracticeStorage.mockRejectedValue(failure)
    await expect(options.validateCurrentData(handle)).rejects.toBe(failure)
  })

  it('propagates preparation failure before publication', async () => {
    const failure = new Error('partial Practice evidence')
    appDbMocks.preparePracticeStorage.mockRejectedValue(failure)
    await expect(getBackgroundDb()).rejects.toBe(failure)
  })
})
