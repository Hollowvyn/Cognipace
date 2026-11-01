import { z } from 'zod'

export const localHeadSchema = z
  .object({
    key: z.literal('active'),
    formatVersion: z.literal(2),
    coreSnapshotId: z.string().min(1),
    archiveGeneration: z.string().min(1),
    datasetToken: z.string().min(1),
    fingerprint: z.string(),
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    lastVerifiedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    savedAt: z.string(),
    replacementId: z.string().min(1).optional(),
  })
  .refine((value) => value.lastVerifiedRevision <= value.revision)

export type LocalHead = z.infer<typeof localHeadSchema>
export type LocalStores<Name extends string = string> = Record<
  Name,
  IDBObjectStore
>
export interface LocalIdbStore {
  readHead(): Promise<LocalHead | null>
  readCore(coreSnapshotId: string): Promise<Uint8Array | null>
  readRecord(key: IDBValidKey): Promise<unknown>
  writeTechnicalRecord(key: IDBValidKey, value: unknown): Promise<void>
  transact<T, Name extends string>(
    stores: readonly Name[],
    mode: IDBTransactionMode,
    operate: (
      stores: LocalStores<Name>,
      finish: (value: T) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<T>
}

export function isBinary(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === '[object Uint8Array]'
}

// Technical provenance entries share coreSnapshots, using array keys so they
// cannot collide with immutable binary payload IDs (which are strings).
// Reachability/cleanup must follow these pointers together with record heads.
export const coreRecordReferenceSchema = z.object({
  coreSnapshotId: z.string().min(1),
})
export type CoreRecordReference = z.infer<typeof coreRecordReferenceSchema>
export function coreRecordReferenceKey(recordKey: IDBValidKey): IDBValidKey[] {
  return ['recordReference', recordKey]
}
