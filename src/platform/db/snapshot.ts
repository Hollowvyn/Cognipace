import type { DbHandle } from './client'

export const SNAPSHOT_KEY = 'cognipace_db_snapshot_v1'
export const FINGERPRINT_KEY = 'cognipace_db_snapshot_fingerprint_v1'
export const SNAPSHOT_DIRTY_KEY = 'cognipace_db_snapshot_dirty_v1'

export function computeFingerprint(text: string) {
  let hash = 5381

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000
  let binary = ''

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

export function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

export function serializeDb(handle: DbHandle) {
  return handle.sqlite3.capi.sqlite3_js_db_export(handle.rawDb)
}

export function deserializeDb(handle: DbHandle, bytes: Uint8Array) {
  const { capi, wasm } = handle.sqlite3
  const pointer = wasm.allocFromTypedArray(bytes)
  const flags =
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE
  const resultCode = capi.sqlite3_deserialize(
    handle.rawDb,
    'main',
    pointer,
    bytes.length,
    bytes.length,
    flags,
  )

  if (resultCode !== 0) {
    throw new Error(`sqlite3_deserialize failed with code ${resultCode}`)
  }
}

export interface StoredSnapshot {
  fingerprint: string
  bytes: Uint8Array
  hasMutations?: boolean
}

export async function writeSnapshotToStorage(snapshot: StoredSnapshot) {
  await chrome.storage.local.set({
    [SNAPSHOT_KEY]: bytesToBase64(snapshot.bytes),
    [FINGERPRINT_KEY]: snapshot.fingerprint,
    ...(snapshot.hasMutations ? { [SNAPSHOT_DIRTY_KEY]: true } : {}),
  })
}
