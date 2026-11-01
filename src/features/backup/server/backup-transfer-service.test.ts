import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import {
  createBackupTransferService,
  splitUtf8Text,
  transferDigest,
  transferSessionKey,
  transferBeginKey,
} from './backup-transfer-service'

function setup(limit = 4 * 1024 * 1024) {
  const local = createLocalIdbStore(new IDBFactory(), 'transfer-test')
  const preview = vi.fn(() =>
    Promise.resolve({ confirmationToken: 'confirmed' }),
  )
  const restore = vi.fn(() => Promise.resolve({ status: 'durable' }))
  const dependencies = {
    local,
    budgetBytes: limit,
    preview,
    restore,
    currentRevision: () => Promise.resolve(1),
    exportSnapshot: async (
      consume: (backup: unknown, revision: number) => Promise<void>,
    ) => consume({ code: '😀```\n'.repeat(90000) }, 1),
  }
  return {
    local,
    preview,
    restore,
    dependencies,
    service: createBackupTransferService(dependencies),
  }
}

describe('bounded durable backup transfer', () => {
  it('accepts UTF8 chunks in order across restart and only applies after confirmation', async () => {
    const { service, dependencies, preview, restore } = setup()
    const text = JSON.stringify({ code: '😀```\n'.repeat(90000) })
    const parts = [...splitUtf8Text(text)]
    expect(parts.length).toBeGreaterThan(2)
    expect(
      parts.every((p) => new TextEncoder().encode(p).byteLength <= 262144),
    ).toBe(true)
    expect(parts.join('')).toBe(text)
    const session = await service.begin('document-a', { direction: 'import' })
    await expect(
      service.append('document-a', session, 2, parts[2]!),
    ).rejects.toThrow(/sequence/i)
    await service.append('document-a', session, 0, parts[0]!)
    await service.append('document-a', session, 0, parts[0]!)
    await expect(
      service.append('document-a', session, 0, 'conflict'),
    ).rejects.toThrow(/retry/i)
    const restarted = createBackupTransferService(dependencies)
    for (let i = 1; i < parts.length; i++)
      await restarted.append('document-a', session, i, parts[i]!)
    await expect(
      restarted.finish('document-a', session, {
        chunks: parts.length + 1,
        digest: await transferDigest(text),
      }),
    ).rejects.toThrow(/incomplete/i)
    await expect(
      restarted.finish('document-a', session, {
        chunks: parts.length,
        digest: '0'.repeat(64),
      }),
    ).rejects.toThrow(/digest/i)
    await expect(
      restarted.finish('document-b', session, {
        chunks: parts.length,
        digest: await transferDigest(text),
      }),
    ).rejects.toThrow(/owner/i)
    const close = { chunks: parts.length, digest: await transferDigest(text) }
    await restarted.finish('document-a', session, close)
    expect(preview).toHaveBeenCalledWith(JSON.parse(text), session.sessionId)
    expect(restore).not.toHaveBeenCalled()
    await restarted.finish('document-a', session, {
      ...close,
      confirmationToken: 'confirmed',
    })
    expect(restore).toHaveBeenCalledTimes(1)
  })
  it('spools exports before serving and preserves JSON and Unicode exactly', async () => {
    const { service } = setup()
    const session = await service.begin('document-a', { direction: 'export' })
    const chunks: string[] = []
    for (let i = 0; i < session.nextSequence; i++)
      chunks.push((await service.read('document-a', session, i)).text)
    expect(
      chunks.every((p) => new TextEncoder().encode(p).byteLength <= 262144),
    ).toBe(true)
    expect(JSON.parse(chunks.join(''))).toEqual({
      code: '😀```\n'.repeat(90000),
    })
    expect(await transferDigest(chunks.join(''))).toBe(session.digest)
  })
  it('enforces aggregate budget transactionally across restarts and cancels only its spool', async () => {
    const { service, dependencies, local } = setup(5)
    const one = await service.begin('document-a', { direction: 'import' })
    const two = await service.begin('document-a', { direction: 'import' })
    await local.writeTechnicalRecord('learning-sentinel', { retained: true })
    await service.append('document-a', one, 0, '123')
    const restarted = createBackupTransferService(dependencies)
    await expect(restarted.append('document-a', two, 0, '456')).rejects.toThrow(
      /space|budget/i,
    )
    await expect(restarted.cancel('document-b', one)).rejects.toThrow(/owner/i)
    await restarted.cancel('document-a', one)
    await restarted.append('document-a', two, 0, '456')
    expect(await local.readRecord('learning-sentinel')).toEqual({
      retained: true,
    })
  })
  it('requires the previous capability on explicit resume and rotates it', async () => {
    const { service } = setup()
    const original = await service.begin('document-a', { direction: 'import' })
    await expect(
      service.begin('document-b', { direction: 'import', resume: original }),
    ).rejects.toThrow(/owner/i)
    const resumed = await service.begin('document-a', {
      direction: 'import',
      resume: original,
    })
    expect(resumed.ownerToken).not.toBe(original.ownerToken)
    await expect(
      service.append('document-a', original, 0, 'x'),
    ).rejects.toThrow(/owner/i)
    await service.append('document-a', resumed, 0, 'x')
  })
})

it('uses standard whole-file SHA256 independently of transfer boundaries', async () => {
  expect(await transferDigest('abc')).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
})
it('resumes an interrupted export with its pinned timestamp and exact accepted prefix after restart', async () => {
  const { local, dependencies } = setup()
  let stopped = false,
    revision = 1,
    timestamp = '2026-01-01T00:00:00Z'
  const original = local.transact.bind(local)
  local.transact = async function <T, Name extends string>(
    ...args: [
      readonly Name[],
      IDBTransactionMode,
      (
        stores: import('@/platform/db/local-store-types').LocalStores<Name>,
        finish: (value: T) => void,
        fail: (error: unknown) => void,
      ) => void,
    ]
  ) {
    const result = await original<T, Name>(...args)
    if (
      !stopped &&
      typeof result === 'object' &&
      result !== null &&
      'nextSequence' in result &&
      result.nextSequence === 1
    ) {
      stopped = true
      throw new Error('worker interrupted')
    }
    return result
  }
  const deps = {
    ...dependencies,
    currentRevision: () => Promise.resolve(revision),
    exportSnapshot: async (
      consume: (value: unknown, revision: number) => Promise<void>,
    ) =>
      consume(
        {
          exportedAt: timestamp,
          source: { appVersion: 'pinned' },
          code: '😀```\n'.repeat(90000),
        },
        revision,
      ),
  }
  const requestId = crypto.randomUUID()
  await expect(
    createBackupTransferService(deps).begin('document-a', {
      direction: 'export',
      requestId,
    }),
  ).rejects.toThrow('worker interrupted')
  const id = (await local.readRecord(
    transferBeginKey('document-a', requestId),
  )) as string
  const interrupted = (await local.readRecord(transferSessionKey(id))) as {
    sessionId: string
    ownerToken: string
  }
  timestamp = '2026-02-02T00:00:00Z'
  const resumed = await createBackupTransferService(deps).begin('document-a', {
    direction: 'export',
    resume: interrupted,
  })
  expect(resumed.sessionId).toBe(id)
  const service = createBackupTransferService(deps)
  let text = ''
  for (let i = 0; i < resumed.nextSequence; i++)
    text += (await service.read('document-a', resumed, i)).text
  expect(JSON.parse(text) as unknown).toMatchObject({
    exportedAt: '2026-01-01T00:00:00Z',
  })
  expect(await transferDigest(text)).toBe(resumed.digest)
  // Completed spools remain selected snapshots after later learning writes.
  revision = 2
  expect(
    (
      await service.begin('document-a', {
        direction: 'export',
        resume: resumed,
      })
    ).digest,
  ).toBe(resumed.digest)
})
it('invalidates interrupted exports after source revision changes and bounds begin receipts', async () => {
  const { service, local, dependencies } = setup()
  const requestId = crypto.randomUUID()
  const first = await service.begin('document-a', {
    direction: 'import',
    requestId,
  })
  const retry = await createBackupTransferService(dependencies).begin(
    'document-a',
    { direction: 'import', requestId },
  )
  expect(retry.sessionId).toBe(first.sessionId)
  await local.writeTechnicalRecord(transferSessionKey(first.sessionId), {
    ...first,
    direction: 'export',
    sourceRevision: 1,
  })
  const changed = createBackupTransferService({
    ...dependencies,
    currentRevision: () => Promise.resolve(2),
  })
  await expect(
    changed.begin('document-a', { direction: 'export', resume: first }),
  ).rejects.toThrow(/revision changed/i)
  expect(
    await local.readRecord(transferSessionKey(first.sessionId)),
  ).toBeUndefined()
  for (let i = 0; i < 16; i++)
    await service.begin('document-a', { direction: 'import' })
  await expect(
    service.begin('document-a', { direction: 'import' }),
  ).rejects.toThrow(/space/i)
})

it('transfers an archive larger than a 64 MiB message without applying it at finish', async () => {
  const { service, restore } = setup(96 * 1024 * 1024)
  const text = JSON.stringify({
    code: 'x'.repeat(64 * 1024 * 1024 + 1),
    fence: '```\n😀日本語\n```',
  })
  expect(new TextEncoder().encode(text).length).toBeGreaterThan(
    64 * 1024 * 1024,
  )
  const session = await service.begin('document-a', { direction: 'import' })
  let chunks = 0
  for (const part of splitUtf8Text(text)) {
    expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(262144)
    await service.append('document-a', session, chunks++, part)
  }
  await service.finish('document-a', session, {
    chunks,
    digest: await transferDigest(text),
  })
  expect(restore).not.toHaveBeenCalled()
}, 30000)
it('rejects oversized Unicode chunks and another preview capability without applying', async () => {
  const { service, restore } = setup()
  const session = await service.begin('document-a', { direction: 'import' })
  await expect(
    service.append('document-a', session, 0, '😀'.repeat(65537)),
  ).rejects.toThrow(/chunk/i)
  const text = '{}'
  await service.append('document-a', session, 0, text)
  const finish = { chunks: 1, digest: await transferDigest(text) }
  await service.finish('document-a', session, finish)
  await expect(
    service.finish('document-a', session, {
      ...finish,
      confirmationToken: 'other-preview',
    }),
  ).rejects.toThrow(/confirmation/i)
  expect(restore).not.toHaveBeenCalled()
})

it('retains a bounded completed receipt for lost responses after completed spool cleanup', async () => {
  const { service, local, restore } = setup()
  const session = await service.begin('document-a', { direction: 'import' })
  await service.append('document-a', session, 0, '{}')
  const input = { chunks: 1, digest: await transferDigest('{}') }
  await service.finish('document-a', session, input)
  const confirmed = { ...input, confirmationToken: 'confirmed' }
  const result = await service.finish('document-a', session, confirmed)
  expect(
    await local.readRecord(transferSessionKey(session.sessionId)),
  ).toMatchObject({ status: 'complete', completionResult: result })
  await local.transact(['records'], 'readwrite', (stores, done) => {
    stores.records.delete(['backup-transfer-chunk', session.sessionId, 0])
    done(undefined)
  })
  expect(
    await createBackupTransferService({
      ...setup().dependencies,
      local,
    }).finish('document-a', session, confirmed),
  ).toEqual(result)
  expect(restore).toHaveBeenCalledTimes(1)
})

it('acknowledges a repeated owner cancellation after restart without charging or deleting another spool', async () => {
  const { service, local, dependencies } = setup(4)
  const first = await service.begin('document-a', { direction: 'import' })
  await service.append('document-a', first, 0, '1234')
  await service.cancel('document-a', first)
  const restarted = createBackupTransferService(dependencies)
  await expect(restarted.cancel('document-a', first)).resolves.toBeNull()
  await expect(restarted.cancel('document-b', first)).rejects.toThrow(/owner/i)
  const next = await restarted.begin('document-a', { direction: 'import' })
  await restarted.append('document-a', next, 0, '5678')
  expect(await local.readRecord(['backup-transfer-budget'])).toEqual({
    bytes: 4,
    sessions: 1,
  })
})
