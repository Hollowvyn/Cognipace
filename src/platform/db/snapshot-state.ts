import { z } from 'zod'
import { FINGERPRINT_KEY, SNAPSHOT_KEY, base64ToBytes } from './snapshot'

export interface SnapshotStorage {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
}

export type SnapshotState =
  | { kind: 'empty' }
  | { kind: 'invalid'; raw: Record<string, unknown>; reason: string }
  | {
      kind: 'stored'
      raw: Record<string, unknown>
      fingerprint: string
      bytes: Uint8Array
    }

export async function readSnapshotState(
  storage: SnapshotStorage,
): Promise<SnapshotState> {
  const values = await storage.get([SNAPSHOT_KEY, FINGERPRINT_KEY])
  const raw = Object.fromEntries(
    [SNAPSHOT_KEY, FINGERPRINT_KEY]
      .filter((key) => Object.hasOwn(values, key))
      .map((key) => [key, values[key]]),
  )
  if (Object.keys(raw).length === 0) return { kind: 'empty' }

  const fingerprint = raw[FINGERPRINT_KEY]
  const encoded = raw[SNAPSHOT_KEY]
  if (
    typeof fingerprint !== 'string' ||
    !/^[a-f0-9]{8}$/.test(fingerprint) ||
    typeof encoded !== 'string' ||
    encoded.length === 0
  ) {
    return {
      kind: 'invalid',
      raw,
      reason: 'Incomplete or invalid snapshot fields.',
    }
  }

  try {
    const bytes = base64ToBytes(encoded)
    if (bytes.length === 0) throw new Error('Empty snapshot.')
    return { kind: 'stored', raw, fingerprint, bytes }
  } catch {
    return { kind: 'invalid', raw, reason: 'Snapshot bytes cannot be decoded.' }
  }
}

export const RECOVERY_KEY = 'cognipace_db_recovery_topics_v1'
export const TRACK_RECOVERY_KEY = 'cognipace_db_recovery_tracks_v1'

const recoveryRecordSchema = z.strictObject({
  version: z.literal(1),
  raw: z.record(z.string(), z.unknown()),
  savedAt: z.iso.datetime(),
})

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    )
  }
  return value
}

function stableRawValues(raw: Record<string, unknown>) {
  return JSON.stringify(
    Object.fromEntries(
      [SNAPSHOT_KEY, FINGERPRINT_KEY]
        .filter((key) => Object.hasOwn(raw, key))
        .map((key) => [key, stableValue(raw[key])]),
    ),
  )
}

export async function preserveRecovery(
  storage: SnapshotStorage,
  raw: Record<string, unknown>,
  now: Date,
  recoveryKey: typeof RECOVERY_KEY | typeof TRACK_RECOVERY_KEY = RECOVERY_KEY,
) {
  const existingValues = await storage.get([recoveryKey])
  if (Object.hasOwn(existingValues, recoveryKey)) {
    const existing = existingValues[recoveryKey]
    const candidate = recoveryRecordSchema.safeParse(existing)
    if (
      candidate.success &&
      stableRawValues(candidate.data.raw) === stableRawValues(raw)
    )
      return
    throw new Error(
      'An earlier database recovery record must be exported before another upgrade.',
    )
  }

  await storage.set({
    [recoveryKey]: { version: 1, raw, savedAt: now.toISOString() },
  })
}
