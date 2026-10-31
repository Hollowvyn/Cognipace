# Reliable Backup Phase 1: Local Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make acknowledged CogniPace writes and replacements survive service-worker restarts and database sizes beyond `chrome.storage.local`'s default quota.

**Architecture:** Keep the live SQLite WASM handle, but publish binary snapshots and local backup revisions in one IndexedDB transaction before acknowledging a mutation. Migrate the existing base64 snapshot only after validating and reading back the new copy. Stage replacements with a durable recovery copy and continuation record, then resume final publication after a worker restart.

**Tech Stack:** TypeScript, SQLite WASM, Drizzle, native IndexedDB, Zod, Vitest, WXT Chrome Manifest V3.

---

## Scope and dependencies

The [approved design](../specs/2026-10-16-reliable-drive-backup-and-key-recovery-design.md) covers three related deliverables. This plan produces a working first release slice: durable local study data, migration from the old local snapshot, and restart-safe local replacement. Phase 2 gets its own plan for Google OAuth, Drive data versions, Gist migration, and force push/pull. Phase 3 gets its own plan for separate key backup and restore. The first phase creates the local revision and pending marker consumed by Phase 2; no Google dependency is needed to run its tests.

The current baseline uses `src/platform/db/instance.ts` to export SQLite and write base64 to `chrome.storage.local`. `src/platform/db/snapshot-state.ts` parses the old pair and preserves upgrade recovery records. `src/extension/background/register-handlers.ts` already awaits `flushDbSnapshot()` on most mutation paths, while `src/extension/background/backup-replacement.ts` retains unfinished work only in memory. Retain existing database migrations and the v6 backup file format. Keep the existing original checkout's unrelated `package.json` and `package-lock.json` edits out of this branch.

## File ownership map

| File                                                            | Responsibility                                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/platform/db/snapshot-idb.ts`                               | Native IndexedDB binary active snapshot, revision/ack fields, recovery snapshot, and replacement continuation record. |
| `src/platform/db/snapshot-idb.test.ts`                          | Transaction, revision, readback, failed write, and replacement atomicity tests.                                       |
| `src/platform/db/snapshot-state.ts` and `.test.ts`              | Keep legacy `chrome.storage.local` decoding and recovery parsing; expose a validated legacy source to migration.      |
| `src/platform/db/instance.ts` and `.test.ts`                    | Open IndexedDB first, migrate legacy state, publish snapshots, and enforce the local persistence barrier.             |
| `src/extension/background/backup-replacement.ts` and `.test.ts` | Resume or resolve replacement publication from durable continuation state.                                            |
| `src/extension/background/register-handlers.ts` and `.test.ts`  | Gate mutation replies on durability and block new mutations while an in-memory write is persistence-pending.          |
| `wxt.config.ts`                                                 | Add the already approved `unlimitedStorage` permission for IndexedDB quota and eviction protection.                   |
| `docs/product.md`, `docs/architecture.md`, `docs/testing.md`    | Document the shipped local-save, retry, migration, and smoke behavior.                                                |

The IDB database name is `cognipace-local-v1`. Its `records` store uses the keys `active`, `recovery`, and `replacement-continuation`. The active value has this exact shape; keep it as one structured-cloned record so bytes, revision, and acknowledgment metadata commit together:

```ts
export interface DurableSnapshotRecord {
  key: 'active'
  fingerprint: string
  bytes: Uint8Array
  revision: number
  lastVerifiedRevision: number
  savedAt: string
}

export interface ReplacementContinuationRecord {
  key: 'replacement-continuation'
  replacementId: string
  kind: 'restore' | 'reset' | 'gist-pull'
  committedRevision: number
  needsInvalidation: boolean
  needsSyncMetadata: boolean
}
```

`revision > lastVerifiedRevision` is the durable data-backup-needed predicate. Phase 1 initializes `lastVerifiedRevision` to zero and does not acknowledge cloud backup. Phase 2 may advance it only for an exact verified revision. Repeated `flushDbSnapshot()` with no committed mutation must not create a new revision. Existing recovery records are migrated to IDB before their old storage keys are removed. Export a `SnapshotIdbStore` interface from the new file and add optional `snapshotStore?: SnapshotIdbStore` to `AppDbOptions` for deterministic tests; the extension path constructs the native store.

## Task 1: Binary snapshot store and revision ledger

**Files:** Create `src/platform/db/snapshot-idb.ts`, `src/platform/db/snapshot-idb.test.ts`; modify `package.json`, `package-lock.json` only if a test-only IndexedDB implementation is necessary.

- [ ] **Step 1: Write failing store tests.** Run `npm install -D fake-indexeddb` with Node 24.20.0. Import `indexedDB as testIndexedDB` from `fake-indexeddb` in the test and inject it into the store. Use a unique database name per test. Assert a 12 MB `Uint8Array` round-trips without base64, the first commit has revision 1, a second changed commit has revision 2, and `acknowledgeVerifiedRevision(1)` does not clear revision 2. Include a failed transaction test in which `readActive()` still returns the prior record. Commit the resulting package lock change with the test.

```ts
const store = createSnapshotIdbStore(
  testIndexedDB,
  `test-${crypto.randomUUID()}`,
)
const bytes = new Uint8Array(12 * 1024 * 1024)
bytes[0] = 7
const changedBytes = bytes.slice()
changedBytes[0] = 8
const fingerprint = 'abcd1234'
const now = new Date('2026-10-16T00:00:00.000Z')
const first = await store.commitSnapshot(bytes, fingerprint, now)
expect(first.revision).toBe(1)
expect((await store.readActive())?.bytes).toEqual(bytes)
await store.commitSnapshot(changedBytes, fingerprint, now)
await store.acknowledgeVerifiedRevision(1)
expect((await store.readActive())?.revision).toBe(2)
expect((await store.readActive())?.lastVerifiedRevision).toBe(1)
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/platform/db/snapshot-idb.test.ts --run`. Expected: missing module/export failure before the store exists.
- [ ] **Step 3: Implement the native store.** Export `createSnapshotIdbStore(factory: IDBFactory, databaseName = 'cognipace-local-v1')`. Open schema version 1 and create `records` during `onupgradeneeded`. Implement `readActive`, `commitSnapshot`, and `acknowledgeVerifiedRevision`; Task 4 adds recovery and continuation methods. For a write, issue `get('active')` and `put(next)` in the same read-write transaction; resolve only from `transaction.oncomplete`, reject from `onerror` or `onabort`. Copy input bytes before storing. `acknowledgeVerifiedRevision` rejects a future revision and retains a newer dirty revision.

```ts
const next: DurableSnapshotRecord = {
  key: 'active',
  fingerprint,
  bytes: bytes.slice(),
  revision: (previous?.revision ?? 0) + 1,
  lastVerifiedRevision: previous?.lastVerifiedRevision ?? 0,
  savedAt: now.toISOString(),
}
records.put(next, 'active')
```

- [ ] **Step 4: Verify GREEN and commit.** Run `npm test -- src/platform/db/snapshot-idb.test.ts --run`; expected all new tests pass. Commit `feat(db): add binary IndexedDB snapshot ledger` with only the store, its tests, and any test dependency files.

## Task 2: Validated legacy migration and recovery preservation

**Files:** Modify `src/platform/db/instance.ts`, `src/platform/db/snapshot-state.ts`, `src/platform/db/instance.test.ts`, `src/platform/db/snapshot-state.test.ts`; keep `src/platform/db/snapshot.ts` as the old decoder until migration proof passes.

- [ ] **Step 1: Write failing migration tests.** Seed the old `SNAPSHOT_KEY`/`FINGERPRINT_KEY` pair and no IDB active record. Reopen the database and assert data survives, IDB stores identical bytes/fingerprint, and old keys are removed only after IDB readback. Force the IDB write to fail: opening must fail with a recovery message while the old pair remains intact. Seed an invalid IDB active record alongside a valid legacy pair: opening must not choose an empty database or delete the legacy pair. Cover existing `RECOVERY_KEY`, `TRACK_RECOVERY_KEY`, and `FSRS_RECOVERY_KEY` preservation.

```ts
const active = await idb.readActive()
expect(active?.bytes).toEqual(legacyBytes)
expect(
  (await chrome.storage.local.get(SNAPSHOT_KEY))[SNAPSHOT_KEY],
).toBeUndefined()
const reopened = await getAppDb()
expect(
  reopened.rawDb.exec({
    sql: 'SELECT COUNT(*) FROM problems',
    returnValue: 'resultRows',
  }),
).toEqual([[originalCount]])
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/platform/db/instance.test.ts src/platform/db/snapshot-state.test.ts --run`; expected the new migration assertions fail while existing tests remain passing.
- [ ] **Step 3: Implement source selection and migration.** In `openAppDb`, read IDB first; when absent, use the existing `readSnapshotState(createSnapshotStorage())`. Validate the legacy database through `openSnapshot` before publishing its bytes to IDB. A matching fingerprint currently skips `publish`, so add a post-open migration commit before setting `activeHandle`; an upgraded fingerprint is already published through `openSnapshot.publish`. Read the new IDB record back and compare bytes/fingerprint before deleting the old pair. Convert old recovery records into IDB recovery values and remove old recovery keys only after readback. Invalid IDB data must produce a recovery error, never silently fall through to a fresh DB.

```ts
const active = await idb.readActive()
const source: SnapshotState = active
  ? {
      kind: 'stored',
      raw: {},
      fingerprint: active.fingerprint,
      bytes: active.bytes,
    }
  : await readSnapshotState(legacyStorage)
// Pass `read: async () => source` into the existing openSnapshot call.
// Keep its current fresh/restore/validate/upgrade/prepare callbacks.
```

- [ ] **Step 4: Verify GREEN and commit.** Run the two focused test files again; expected migration, interrupted migration, and old recovery cases pass. Commit `feat(db): migrate validated snapshots into IndexedDB`.

## Task 3: Durable acknowledgment for normal mutations

**Files:** Modify `src/platform/db/instance.ts`, `src/platform/db/proxy.ts` only if the mutation hook needs an explicit committed-dirty signal, `src/extension/background/register-handlers.ts`, and corresponding tests.

- [ ] **Step 1: Write failing acknowledgment tests.** A regular settings write must not return success until IDB `transaction.oncomplete`. On write rejection, a generic mutation returns a persistence error; a practice review retains its existing `persistence-pending` result. Further writes in that worker are blocked until `flushDbSnapshot()` succeeds. A restart reopens the last durable record and does not claim that a failed write was saved. A no-change flush retains its revision.

```ts
let releaseWrite!: () => void
const blockedWrite = new Promise<void>((resolve) => {
  releaseWrite = resolve
})
const realCommit = store.commitSnapshot.bind(store)
vi.spyOn(store, 'commitSnapshot').mockImplementation(async (...args) => {
  await blockedWrite
  return realCommit(...args)
})
const now = new Date('2026-10-16T00:00:00.000Z')
const handle = await getAppDb({ snapshotStore: store })
await createSettingsRepository(handle.db).updateSettings(
  { appearance: { themeMode: 'dark' } },
  now,
)
let resolved = false
const write = flushDbSnapshot().then(() => {
  resolved = true
})
await Promise.resolve()
expect(resolved).toBe(false)
releaseWrite()
await write
expect(resolved).toBe(true)
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/platform/db/instance.test.ts src/extension/background/register-handlers.test.ts --run`; expected the new durability and gate assertions fail.
- [ ] **Step 3: Replace the snapshot publication path.** Keep the existing mutation queue and `flushDbSnapshot()` API. Track whether SQLite committed data changed; `flushDbSnapshot()` serializes only after SQLite autocommit and awaits `idb.commitSnapshot`. It clears the pending local-persistence error only after the IDB commit. In `runGatedMutationQueue` and the practice-review path, return success only after this barrier. Stop new mutations while a failed in-memory write awaits retry; a restarted worker simply opens the last durable snapshot. Remove `chrome.storage.local` snapshot writes from the steady-state path, while retaining the legacy reader for upgrade.

```ts
if (localPersistencePending) {
  throw new Error('Local data still needs saving. Retry saving before editing.')
}
const result = await write(db)
try {
  await flushDbSnapshot()
  localPersistencePending = false
} catch (error) {
  localPersistencePending = true
  throw error
}
return result
```

- [ ] **Step 4: Verify GREEN and commit.** Run the two focused test files and `npm test -- src/platform/db/fsrs-preservation.integration.test.ts --run`; expected all pass. Commit `fix(db): acknowledge writes after IndexedDB commit`.

## Task 4: Atomic local replacement and restart continuation

**Files:** Modify `src/platform/db/snapshot-idb.ts`, `src/platform/db/instance.ts`, `src/extension/background/backup-replacement.ts`, `src/extension/background/register-handlers.ts`, `src/features/backup/server/backup-replacement-work.ts`, and focused tests beside them.

- [ ] **Step 1: Write failing replacement tests.** Start with populated active data. Make an import/restore commit but fail the IDB publication: the old active bytes stay durable and a worker restart reopens them. On success, one IDB transaction stores the new active snapshot, the old snapshot under `recovery`, and a continuation record with the committed revision. Restart between IDB commit and invalidation/metadata completion: startup resumes only those continuations, never replays the destructive SQLite replacement. A second replacement is blocked while a continuation is unresolved.

```ts
const store = createSnapshotIdbStore(
  testIndexedDB,
  `test-${crypto.randomUUID()}`,
)
const beforeBytes = new Uint8Array([9, 8, 7])
await store.commitSnapshot(
  beforeBytes,
  'abcd1234',
  new Date('2026-10-16T00:00:00.000Z'),
)
const replacementId = crypto.randomUUID()
const candidate = {
  key: 'active' as const,
  fingerprint: 'abcd1234',
  bytes: new Uint8Array([1, 2, 3]),
  revision: 2,
  lastVerifiedRevision: 0,
  savedAt: '2026-10-16T00:00:00.000Z',
}
await store.commitReplacement(candidate, { replacementId, kind: 'restore' })
expect((await store.readRecovery())?.bytes).toEqual(beforeBytes)
expect((await store.readActive())?.bytes).toEqual(candidate.bytes)
expect((await store.readContinuation())?.replacementId).toBe(replacementId)
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/platform/db/snapshot-idb.test.ts src/extension/background/backup-replacement.test.ts --run`; expected new restart and atomicity tests fail.
- [ ] **Step 3: Implement the replacement transaction and startup resume.** `commitReplacement` reads the current active record and writes recovery, candidate active, and continuation inside one read-write transaction. Add `markInvalidated(replacementId)`, `markSyncMetadataComplete(replacementId)`, and `completeContinuation(replacementId)` so each completed step is durable and the record is deleted only when both flags are false. The background coordinator reconstructs pending work from this record on startup using `kind` to choose existing invalidation/metadata continuations, gates new mutations, and never invokes `commit` again for an already durable replacement. Keep the current `BackupReplacementResult` statuses truthful when invalidation or metadata is still pending.

```ts
records.put({ ...previous, key: 'recovery' }, 'recovery')
records.put(candidate, 'active')
records.put(
  {
    key: 'replacement-continuation',
    replacementId,
    kind,
    committedRevision: candidate.revision,
    needsInvalidation: true,
    needsSyncMetadata: true,
  } satisfies ReplacementContinuationRecord,
  'replacement-continuation',
)
```

- [ ] **Step 4: Verify GREEN and commit.** Run `npm test -- src/platform/db/snapshot-idb.test.ts src/extension/background/backup-replacement.test.ts src/features/backup/server/backup-service.test.ts src/extension/background/register-handlers.test.ts --run`; expected rollback and restart cases pass. Commit `fix(backup): persist replacement recovery and continuation`.

## Task 5: Storage permission, scaling proof, and authority docs

**Files:** Modify `wxt.config.ts`, `docs/product.md`, `docs/architecture.md`, `docs/testing.md`; add focused manifest and size tests to the existing config/DB test location.

- [ ] **Step 1: Add a manifest assertion and approve the exact edit.** The user approved `unlimitedStorage` during design. Assert the production manifest includes it without adding Google or Gist hosts in this phase. Add `'unlimitedStorage'` to the existing permission array.

```ts
permissions: ['storage', 'alarms', 'notifications', 'unlimitedStorage'],
```

- [ ] **Step 2: Run scaling and failure fixtures.** Exercise the repository's 5,000-review fixture and larger scaling fixture with an installed extension. Record serialized size, IDB commit latency, reopen time, quota behavior, and whether a failed commit is reported as failed. A 50,000-review browser-runtime message failure in earlier work is not proof of IDB quota failure; test these separately. If the synchronous full-snapshot barrier causes unacceptable review latency, stop the phase for a storage strategy revision before release rather than shipping a delayed durability acknowledgment.
- [ ] **Step 3: Update current docs.** Document IDB as the active local snapshot store, legacy migration and recovery, exact local-save failure wording, Retry saving, and manual smoke in the authority docs. Keep the future Drive/key behavior labeled as planned until it ships.
- [ ] **Step 4: Run full required validation.** With Node 24.20.0 and installed dependencies, run `npm run db:check`, `npm run lint`, `npm run check`, `npm run build`, and `npm run zip` because the extension manifest changes. Run the focused tests from Tasks 1–4 first. Record exact command outcomes and failures. Human engineers run installed-extension happy-path and edge-case smoke for normal save, storage failure, restart, legacy migration, replacement rollback, and recovery copy, attaching screenshots or recordings before PR review or merge.
- [ ] **Step 5: Commit and hand off.** Commit `docs(db): document durable local storage and recovery` for authority docs after the code commits. Write a PR-ready summary with commands run/skipped, release impact, rollback path, and remaining manual proof. Do not mark the phase review-ready until that proof exists.

## Phase completion criteria

Phase 1 is complete when a reported successful write survives a worker restart, a failed local commit cannot be reported as saved, old snapshots migrate without data loss, a replacement keeps a recoverable old copy, large snapshots bypass the default `chrome.storage.local` quota, and the required automated and human gates pass. The phase leaves `revision > lastVerifiedRevision` ready for the Drive uploader. Phase 2 then implements the approved one-way backup schedule and force behavior; Phase 3 implements separate key recovery.
