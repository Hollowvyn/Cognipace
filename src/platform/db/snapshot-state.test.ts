import { describe, expect, it, vi } from 'vitest'
import {
  preserveRecovery,
  readSnapshotState,
  RECOVERY_KEY,
  TRACK_RECOVERY_KEY,
} from './snapshot-state'
import { FINGERPRINT_KEY, SNAPSHOT_KEY } from './snapshot'

describe('readSnapshotState', () => {
  it('does not classify a missing fingerprint as a fresh install', async () => {
    const raw = { [SNAPSHOT_KEY]: 'AAAA' }
    const storage = { get: vi.fn().mockResolvedValue(raw), set: vi.fn() }
    expect(await readSnapshotState(storage)).toEqual({
      kind: 'invalid',
      raw,
      reason: 'Incomplete or invalid snapshot fields.',
    })
    expect(storage.set).not.toHaveBeenCalled()
  })

  it.each([
    ['only the fingerprint', { [FINGERPRINT_KEY]: 'cbf29ce4' }],
    [
      'a non-string fingerprint',
      { [FINGERPRINT_KEY]: 42, [SNAPSHOT_KEY]: 'AAAA' },
    ],
    [
      'a malformed fingerprint',
      { [FINGERPRINT_KEY]: 'not-hex', [SNAPSHOT_KEY]: 'AAAA' },
    ],
    [
      'a non-string snapshot',
      { [FINGERPRINT_KEY]: 'cbf29ce4', [SNAPSHOT_KEY]: 42 },
    ],
    [
      'empty encoded bytes',
      { [FINGERPRINT_KEY]: 'cbf29ce4', [SNAPSHOT_KEY]: '' },
    ],
    [
      'invalid base64',
      { [FINGERPRINT_KEY]: 'cbf29ce4', [SNAPSHOT_KEY]: '%%%' },
    ],
  ])(
    'classifies %s as invalid without changing storage',
    async (_label, raw) => {
      const storage = { get: vi.fn().mockResolvedValue(raw), set: vi.fn() }
      const state = await readSnapshotState(storage)
      expect(state.kind).toBe('invalid')
      expect(state).toHaveProperty('raw', raw)
      expect(storage.set).not.toHaveBeenCalled()
    },
  )

  it('classifies both absent fields as an empty install', async () => {
    await expect(
      readSnapshotState({ get: vi.fn().mockResolvedValue({}), set: vi.fn() }),
    ).resolves.toEqual({ kind: 'empty' })
  })

  it('returns decoded bytes for a valid encoded SQLite snapshot', async () => {
    const raw = {
      [FINGERPRINT_KEY]: 'cbf29ce4',
      [SNAPSHOT_KEY]: btoa('SQLite format 3\0'),
    }
    const state = await readSnapshotState({
      get: vi.fn().mockResolvedValue(raw),
      set: vi.fn(),
    })
    expect(state).toMatchObject({
      kind: 'stored',
      raw,
      fingerprint: raw[FINGERPRINT_KEY],
    })
    expect(state.kind === 'stored' && Array.from(state.bytes)).toEqual(
      Array.from(new TextEncoder().encode('SQLite format 3\0')),
    )
  })

  it('propagates storage read failures instead of treating them as empty', async () => {
    const failure = new Error('storage unavailable')
    await expect(
      readSnapshotState({
        get: vi.fn().mockRejectedValue(failure),
        set: vi.fn(),
      }),
    ).rejects.toBe(failure)
  })
})

describe('preserveRecovery', () => {
  const raw = {
    [SNAPSHOT_KEY]: 'damaged bytes',
    [FINGERPRINT_KEY]: 'damaged',
  }
  const now = new Date('2026-09-26T12:00:00.000Z')

  it('stores a track-upgrade original separately from the earlier topic recovery', async () => {
    const earlier = {
      version: 1,
      raw: { [SNAPSHOT_KEY]: 'earlier v7 original' },
      savedAt: now.toISOString(),
    }
    const storage = {
      get: vi.fn().mockResolvedValue({ [RECOVERY_KEY]: earlier }),
      set: vi.fn().mockResolvedValue(undefined),
    }
    await preserveRecovery(storage, raw, now, TRACK_RECOVERY_KEY)
    expect(storage.get).toHaveBeenCalledWith([TRACK_RECOVERY_KEY])
    expect(storage.set).toHaveBeenCalledWith({
      [TRACK_RECOVERY_KEY]: { version: 1, raw, savedAt: now.toISOString() },
    })
  })

  it('retains the same track original on retry and rejects a different track original', async () => {
    const first = { version: 1, raw, savedAt: '2026-09-25T12:00:00.000Z' }
    const storage = {
      get: vi.fn().mockResolvedValue({ [TRACK_RECOVERY_KEY]: first }),
      set: vi.fn(),
    }
    await preserveRecovery(storage, raw, now, TRACK_RECOVERY_KEY)
    expect(storage.set).not.toHaveBeenCalled()
    await expect(
      preserveRecovery(
        storage,
        { [SNAPSHOT_KEY]: 'different v8 original' },
        now,
        TRACK_RECOVERY_KEY,
      ),
    ).rejects.toThrow(
      'An earlier database recovery record must be exported before another upgrade.',
    )
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('writes the raw snapshot and timestamp before upgrade', async () => {
    const storage = {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    }

    await preserveRecovery(storage, raw, now)

    expect(storage.set).toHaveBeenCalledWith({
      [RECOVERY_KEY]: { version: 1, raw, savedAt: now.toISOString() },
    })
  })

  it('retains the first copy and timestamp when the same raw snapshot is retried', async () => {
    const first = {
      version: 1,
      raw,
      savedAt: '2026-09-25T12:00:00.000Z',
    }
    const storage = {
      get: vi.fn().mockResolvedValue({ [RECOVERY_KEY]: first }),
      set: vi.fn(),
    }

    await preserveRecovery(storage, raw, now)

    expect(storage.set).not.toHaveBeenCalled()
    expect(storage.get).toHaveBeenCalledWith([RECOVERY_KEY])
  })

  it('treats nested raw values with different property order as identical', async () => {
    const firstRaw = {
      [SNAPSHOT_KEY]: { payload: { first: 1, second: 2 } },
      [FINGERPRINT_KEY]: { version: 1, format: 'damaged' },
    }
    const retriedRaw = {
      [FINGERPRINT_KEY]: { format: 'damaged', version: 1 },
      [SNAPSHOT_KEY]: { payload: { second: 2, first: 1 } },
    }
    const storage = {
      get: vi.fn().mockResolvedValue({
        [RECOVERY_KEY]: {
          version: 1,
          raw: firstRaw,
          savedAt: '2026-09-25T12:00:00.000Z',
        },
      }),
      set: vi.fn(),
    }

    await preserveRecovery(storage, retriedRaw, now)

    expect(storage.set).not.toHaveBeenCalled()
  })

  it('does not overwrite a different recovery copy', async () => {
    const existing = {
      version: 1,
      raw: { [SNAPSHOT_KEY]: 'a different snapshot' },
      savedAt: '2026-09-25T12:00:00.000Z',
    }
    const storage = {
      get: vi.fn().mockResolvedValue({ [RECOVERY_KEY]: existing }),
      set: vi.fn(),
    }

    await expect(preserveRecovery(storage, raw, now)).rejects.toThrow(
      'An earlier database recovery record must be exported before another upgrade.',
    )
    expect(storage.set).not.toHaveBeenCalled()
  })

  it.each([undefined, null, { version: 2, raw, savedAt: 'invalid' }])(
    'refuses to overwrite a present malformed recovery value (%s)',
    async (existing) => {
      const storage = {
        get: vi.fn().mockResolvedValue({ [RECOVERY_KEY]: existing }),
        set: vi.fn(),
      }

      await expect(preserveRecovery(storage, raw, now)).rejects.toThrow(
        'An earlier database recovery record must be exported before another upgrade.',
      )
      expect(storage.set).not.toHaveBeenCalled()
    },
  )

  it('propagates recovery write failures', async () => {
    const failure = new Error('write failed')
    const storage = {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockRejectedValue(failure),
    }

    await expect(preserveRecovery(storage, raw, now)).rejects.toBe(failure)
  })
})
