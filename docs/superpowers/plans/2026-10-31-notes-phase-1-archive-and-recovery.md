# Notes Phase 1: Archive and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish durable record-level learning storage, complete v7 backups, and atomic reset/restore without enabling submission capture or the editor in a release.

**Architecture:** Upgrade the existing physical IDB database, separate binary core payloads from its lightweight head, and let the Notes repository transact archive records and the shared revision together. Composite destructive operations build detached SQLite and staged archive candidates, then publish one pair through the existing replacement coordinator.

**Tech Stack:** TypeScript, native IndexedDB, SQLite WASM/Drizzle, Zod 4, Vitest, fake-indexeddb, current runtime messaging and sync services.

---

Read the [master plan](./2026-10-31-notes-and-submission-history.md) and [approved design](../specs/2026-10-31-notes-and-submission-history-design.md). This is the first dependency. Keep capture and editor registration inactive on releasable main. Do not modify SQL migration history or permissions.

## File and interface map

| File                                                                                                                                                                    | Responsibility                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Create `src/platform/db/local-idb.ts`, `local-idb-schema.ts`, `local-store-types.ts`                                                                                    | One IDB opener, v2 upgrade, event-driven multi-store transactions, infrastructure-only types                                  |
| Modify `src/platform/db/snapshot-idb.ts`                                                                                                                                | Preserve existing public snapshot API by composing head and core payload; add pair-aware recovery                             |
| Modify `src/platform/db/instance.ts`, `client.ts`, `proxy.ts`                                                                                                           | Detached candidates, per-handle mutation callbacks, publish/swap and pending core-save gates                                  |
| Create `src/platform/db/composite-publication.ts`                                                                                                                       | Stage and atomically publish matching core/archive roots                                                                      |
| Create `src/features/notes/domain/notes-records.ts`, `archive-validation.ts`                                                                                            | Versioned note/archive schemas and ownership/reference invariants                                                             |
| Create `src/features/notes/data/notes-repository.ts`, `archive-generation-repository.ts`                                                                                | Archive reads/CAS writes, receipts, metadata generation copy/filter                                                           |
| Create `src/features/notes/server/notes-service.ts`, `notes-maintenance-service.ts`                                                                                     | Feature-owned mutation rules, technical cleanup and usage                                                                     |
| Create `src/features/notes/api/notes-contracts.ts`                                                                                                                      | Strict runtime requests/results; no database imports                                                                          |
| Create `src/extension/background/notes-handlers.ts`, `notes-edit-scopes.ts`, `problem-data-service.ts`, `mutation-queue.ts`                                             | Trusted dispatch, durable sender scope, composite orchestration; extract the existing queue rather than create a second queue |
| Modify `src/features/backup/api/backup-contracts.ts`, `backup-legacy-contracts.ts`, `domain/backup-normalization.ts`, `backup-preflight.ts`, `server/backup-service.ts` | Frozen v6 reader, v7 archive envelope, consistent export and prepared restore                                                 |
| Create `src/features/backup/server/backup-transfer-service.ts`, `api/backup-transfer-contracts.ts`                                                                      | Ordered bounded transfer sessions, digest validation and restart-safe spool                                                   |
| Modify `src/extension/messaging.ts`, `background/runtime-policy.ts`, `register-handlers.ts`, `backup-replacement.ts`                                                    | Protocol, permissions, shared queue/barrier and durable continuation wiring                                                   |
| Modify `src/features/sync/server/sync-service.ts`, `domain/sync-envelope.ts`, `data/sync-metadata-store.ts`                                                             | Whole-dataset revision guards and legacy automatic-pull protection                                                            |
| Modify `src/platform/query/query-keys.ts`, `cache-invalidation.ts`                                                                                                      | Notes/archive cache ownership and destructive invalidation                                                                    |

Colocate tests beside new modules. Add shared fixtures in `src/features/notes/testing/notes-fixtures.ts` and `notes-test-context.ts`; neither is exported from the runtime feature barrel.

The platform transaction helper accepts a synchronous callback that schedules IDB requests and returns its result only on `transaction.oncomplete`. Async request chains are scheduled from request callbacks. Hashing, SQL work, HTTP, and arbitrary `await` calls happen outside a live IDB transaction.

## Task 1: Versioned documents, scopes and archive validation

**Files:** Create `src/features/notes/domain/notes-records.ts`, `archive-validation.ts`, `notes-records.test.ts`, `archive-validation.test.ts`, and `src/features/notes/testing/notes-fixtures.ts`.

- [ ] **Step 1: Write contract failures.** Use the following fixture and test as the first executable slice. Add cases for empty Markdown, revision zero, negative revision, unknown fields, dangling reports/payloads, duplicate IDs, cross-problem saved AI, unsupported formats and invalid ISO dates.

```ts
import { expect, it } from 'vitest'
import { saveNoteCommandSchema } from './notes-records'

it('accepts an empty note and rejects unexpected fields', () => {
  const command = {
    commandId: 'save-1',
    problemSlug: 'two-sum',
    scope: { datasetToken: 'dataset-1', problemToken: 'problem-1' },
    target: { kind: 'problem' },
    expectedRevision: 0,
    markdown: '',
  }
  expect(saveNoteCommandSchema.parse(command)).toEqual(command)
  expect(
    saveNoteCommandSchema.safeParse({ ...command, expectedRevision: -1 })
      .success,
  ).toBe(false)
  expect(
    saveNoteCommandSchema.safeParse({ ...command, providerSecret: 'fake' })
      .success,
  ).toBe(false)
})
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/domain/notes-records.test.ts src/features/notes/domain/archive-validation.test.ts`; expect missing new modules/exports or the specified validation assertion to fail.
- [ ] **Step 3: Define schemas and shared fixtures.** Start with this complete note contract; derive exported types with `z.infer`. Add archive record schemas using the field table immediately below. Store Markdown verbatim; validate byte budgets at transport boundaries without truncating a note or borrowing AI's 32,000-character code limit.

```ts
import { z } from 'zod'
import { problemSlugSchema } from '@/features/problems/api/problems-contracts'

const id = z.string().min(1).max(160).regex(/\S/)
export const notesScopeSchema = z.strictObject({
  datasetToken: id,
  problemToken: id,
})
export const noteTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('problem') }),
  z.strictObject({ kind: z.literal('reflection'), submissionId: id }),
])
export const noteDocumentSchema = z.strictObject({
  formatVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  markdown: z.string(),
  updatedAt: z.iso.datetime().nullable(),
})
export const saveNoteCommandSchema = z.strictObject({
  commandId: id,
  problemSlug: problemSlugSchema,
  scope: notesScopeSchema,
  target: noteTargetSchema,
  expectedRevision: z.number().int().nonnegative(),
  markdown: z.string(),
})
export const saveNoteResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('saved'),
    commandId: id,
    document: noteDocumentSchema,
  }),
  z.strictObject({
    status: z.literal('conflict'),
    document: noteDocumentSchema,
  }),
  z.strictObject({ status: z.literal('stale-scope') }),
])
export type SaveNoteCommand = z.infer<typeof saveNoteCommandSchema>
export type SaveNoteResult = z.infer<typeof saveNoteResultSchema>
export type NotesScope = z.infer<typeof notesScopeSchema>
export type NoteDocument = z.infer<typeof noteDocumentSchema>
export type NoteTarget = z.infer<typeof noteTargetSchema>
```

Define saved-AI commands/results separately from document saves so collection revisions cannot be confused with note revisions:

```ts
export const savedAiCommandSchema = z.strictObject({
  commandId: id,
  problemSlug: problemSlugSchema,
  scope: notesScopeSchema,
  assessmentId: id,
  expectedCollectionRevision: z.number().int().nonnegative(),
  saved: z.boolean(),
})
export const savedAiResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('saved'),
    commandId: id,
    appliedRevision: z.number().int().nonnegative(),
    collectionRevision: z.number().int().nonnegative(),
    saved: z.boolean(),
  }),
  z.strictObject({
    status: z.literal('conflict'),
    collectionRevision: z.number().int().nonnegative(),
  }),
  z.strictObject({ status: z.literal('stale-scope') }),
])
```

On replay, `appliedRevision` describes the original accepted action, while `collectionRevision` and `saved` describe current membership. A receipt cannot re-add an inclusion removed by a later action.

| Archive record     | Required content                                                                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submission         | `id`, `problemSlug`, `observedAttemptIds`, nullable `externalSubmissionId`, normalized `host`, `submittedAt`, `status`, `statusText`, nullable `language`, completeness, nullable `codePayloadId`, bounded diagnostics with omitted-field names, reflection document |
| Assessment         | `id`, `problemSlug`, internal `submissionId`, originating `requestId`, `generatedAt`, `feedbackSchemaVersion: 1`, `feedbackPayloadId`, safe existing provider metadata, nullable `implementationPayloadId`                                                           |
| Saved AI inclusion | `problemSlug`, `assessmentId`, `savedAt`; uniqueness by problem/assessment; separate per-problem collection revision                                                                                                                                                 |
| Payload            | `id`, discriminated `kind` (`submitted-code`, `feedback-v1`, `implementation-v1`), byte length, SHA-256 and body parsed by the owning existing schema                                                                                                                |
| Export archive     | `formatVersion: 1`, arrays `notes`, `submissions`, `assessments`, `savedAiNotes`, `payloads`; exclude storage generations, receipts, edit leases and credentials                                                                                                     |

`assertArchiveReferences(archive, problemSlugs)` must construct ID maps once, reject duplicates and absent problems, verify payload kinds and ownership through submission → assessment → inclusion, recompute byte lengths/digests, and reject unsupported report schemas. Reuse the existing feedback/implementation schemas through allowed public contracts rather than redefine their fields. Export `emptyNotesArchive()` returning all five empty arrays and format version 1. Fixture factories return fresh objects on each call, with deterministic IDs and dates.

- [ ] **Step 4: Verify GREEN and commit.** Run the same two tests; expect every validation case to pass. Stage only the five task files and commit `feat(notes): define versioned learning archive contracts`.

## Task 2: Preserving IDB v1-to-v2 migration

**Files:** Create `src/platform/db/local-idb-schema.ts`, `local-idb.ts`, `local-store-types.ts`, `local-idb.test.ts`; modify `src/platform/db/snapshot-idb.ts`, `snapshot-idb.test.ts`.

- [ ] **Step 1: Extend real IDB tests.** Use `new IDBFactory()` from fake-indexeddb, not a Map mock. Seed a version-1 `records` store containing the existing active record, replacement recovery, historical recovery slots and a pending continuation. Open version 2 and compare exact bytes/revisions. Abort the upgrade and reopen v1 to prove the original survives. Keep blocked and future-version failures visible.

```ts
expect(await snapshotStore.readActive()).toMatchObject({
  bytes: originalBytes,
  revision: 8,
  lastVerifiedRevision: 6,
})
expect(await localStore.readHead()).toMatchObject({
  formatVersion: 2,
  revision: 8,
  lastVerifiedRevision: 6,
})
expect((await localStore.readHead())!).not.toHaveProperty('bytes')
expect(await snapshotStore.readContinuation()).toEqual(originalContinuation)
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/platform/db/local-idb.test.ts src/platform/db/snapshot-idb.test.ts`; expect missing v2 APIs or migration assertions to fail.
- [ ] **Step 3: Implement the upgrade in `onupgradeneeded`.** Create missing stores, then read and rewrite every binary active/recovery root in that same versionchange transaction. Allocate deterministic core IDs for migrated roots, preserve timestamps/revisions and publish the head only after scheduling its referenced payload write. A historical recovery value that is not a binary active record retains its original representation and validator. Register `onversionchange` to close open connections. Never catch a migration error and seed an empty database.

```ts
export const localDatabaseVersion = 2
export const archiveStoreNames = [
  'problemNotes',
  'submissions',
  'analysisReports',
  'savedAiNotes',
  'payloads',
  'problemScopes',
] as const

export function createArchiveStores(db: IDBDatabase) {
  for (const name of archiveStoreNames) {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
  }
}
```

Use out-of-line array keys. Notes keys are `[generation, problemSlug]`; submissions `[generation, id]`; reports `[generation, id]`; inclusions `[generation, problemSlug, assessmentId]`; scopes `[generation, problemSlug]`; immutable payloads use `id`. Add indexes to submissions on `[archiveGeneration, problemSlug, submittedAt, id]`, external alias `[archiveGeneration, host, externalSubmissionId]` (unique only when present), and attempt aliases via an indexed alias record in the same store. Omit absent external index values rather than indexing a shared null. Add per-problem indexes for report and inclusion reads. Store note reflection inline in submission metadata; code/report bodies stay in payloads.

`createLocalIdbStore(factory, databaseName?)` must expose `readHead()`, `readCore(coreSnapshotId)`, `transact(stores, mode, operate)`, `readRecord(key)` and `writeTechnicalRecord(key, value)`. Its transaction callback receives stores plus `finish`/`fail`, following the existing snapshot implementation. Read/write transactions request `{ durability: 'strict' }`; resolve on completion, reject on abort/error. The snapshot adapter's existing `readActive()` still returns bytes composed with head metadata, so callers migrate without a flag day.

- [ ] **Step 4: Verify GREEN and commit.** Run the two focused files plus `rtk npm test -- src/platform/db/instance.test.ts src/platform/db/snapshot-state.test.ts`; expect preservation, abort and old API tests to pass. Commit `feat(storage): extend IndexedDB with a preserving archive schema`.

## Task 3: Shared revision and one mutation queue

**Files:** Modify `src/platform/db/snapshot-idb.ts`, `instance.ts`, `src/features/sync/data/sync-metadata-store.ts`; create `src/extension/background/mutation-queue.ts`, `mutation-queue.test.ts`; modify `register-handlers.ts` and existing snapshot/sync tests.

- [ ] **Step 1: Write interleaving tests.** An archive save between core saves must not be overwritten by a stale head. A backup of revision 7 finishing after a note creates revision 8 leaves revision 8 pending. Core save pending/replacement pending blocks archive mutation, export and mixed reads. An archive-only write makes zero SQLite serialization calls.

```ts
await store.acknowledgeVerifiedRevision(7)
expect(await localStore.readHead()).toMatchObject({
  revision: 8,
  lastVerifiedRevision: 7,
})
expect(serializeSpy).not.toHaveBeenCalled()
expect(corePayloadPutSpy).not.toHaveBeenCalled()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/extension/background/mutation-queue.test.ts src/platform/db/snapshot-idb.test.ts src/features/sync/data/sync-metadata-store.test.ts`.
- [ ] **Step 3: Extract the current queue and add a head-only revision operation.** Move existing queue/gate state and retry behavior intact before adding Notes. Export `runInMutationQueue`, `runGatedMutationQueue`, `runConsistentRead`, and `resumePendingLocalSave`; inject replacement readiness and core-flush dependencies from registration. Preserve nested remote-restore behavior and current Practice retry acknowledgments. Do not hold this queue during provider HTTP calls.

```ts
export function nextDataHead<T extends { revision: number; savedAt: string }>(
  head: T,
  now: Date,
): T {
  return { ...head, revision: head.revision + 1, savedAt: now.toISOString() }
}
```

Each write reads the latest head **inside** its IDB transaction and changes only the intended fields. Core snapshot writes allocate a new `coreSnapshotId` while preserving active archive generation; archive writes preserve the core ID. Update `lastVerifiedRevision` monotonically and never above the current revision. Sync pending status and restart scheduling must consult `head.revision > head.lastVerifiedRevision`, even if a Chrome-storage dirty flag write or alarm scheduling failed.

- [ ] **Step 4: Verify GREEN and commit.** Run the RED files and `rtk npm test -- src/extension/background/register-handlers.test.ts src/extension/background/backup-replacement.test.ts src/extension/background/sync-auto-sync.test.ts`; expect existing review durability and new revision races to pass. Commit `refactor(storage): share revision and mutation gates with archive writes`.

## Task 4: Note/reflection repository with durable CAS and receipts

**Files:** Create `src/features/notes/data/notes-repository.ts`, `notes-repository.test.ts`, `src/features/notes/testing/notes-test-context.ts`; modify `src/features/notes/server/notes-service.ts` (create in this task).

- [ ] **Step 1: Add repository integration tests.** The shared context constructs a fresh fake-indexeddb factory, initializes a valid head/core payload through the snapshot adapter, creates the repository, and returns `{ localStore, repository, close }`. Create scopes with `repository.acquireScope(problemSlug)`. Expose `readDocument`, `saveDocument`, `readCommandReceipt`, `listSubmissionMetadata`, and `readSubmission` with the master plan's target/ID vocabulary.

```ts
import { expect, it } from 'vitest'
import { createNotesTestContext } from '../testing/notes-test-context'

it('replays a durable receipt without a second mutation', async () => {
  const context = await createNotesTestContext()
  try {
    const scope = await context.repository.acquireScope('two-sum')
    const command = {
      commandId: 'save-1',
      problemSlug: 'two-sum',
      scope,
      target: { kind: 'problem' as const },
      expectedRevision: 0,
      markdown: 'Use a map.',
    }
    const first = await context.repository.saveDocument(command)
    const revision = (await context.localStore.readHead())!.revision
    expect(await context.repository.saveDocument(command)).toEqual(first)
    expect((await context.localStore.readHead())!.revision).toBe(revision)
    expect(
      await context.repository.saveDocument({
        ...command,
        commandId: 'save-2',
      }),
    ).toMatchObject({ status: 'conflict' })
  } finally {
    await context.close()
  }
})
```

Add abort-before-complete, lost-response-after-complete, receipt reuse with changed content, empty note, reflection ownership and scope-rotation tests. A no-content-change save returns a receipt without incrementing document/global revisions.

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/data/notes-repository.test.ts`.
- [ ] **Step 3: Implement one transaction per accepted command.** Hash the validated command outside the transaction; bind the receipt key to dataset/problem token and command ID. Check active scope **before** receipt replay so a reset never returns an old Saved acknowledgment. In the transaction read scope, receipt, current document and head, then use this decision order:

```ts
if (!sameScope(currentScope, command.scope))
  return finish({ status: 'stale-scope' })
if (receipt) {
  if (receipt.commandDigest !== commandDigest)
    return fail(new Error('Command identity reused with different content.'))
  return finish({
    status: 'saved',
    commandId: command.commandId,
    document: {
      formatVersion: 1,
      revision: receipt.documentRevision,
      markdown: command.markdown,
      updatedAt: receipt.documentUpdatedAt,
    },
  })
}
if (current.revision !== command.expectedRevision)
  return finish({ status: 'conflict', document: current })
const document =
  current.markdown === command.markdown
    ? current
    : {
        formatVersion: 1 as const,
        revision: current.revision + 1,
        markdown: command.markdown,
        updatedAt: now.toISOString(),
      }
```

`sameScope` compares both token strings. Write the document, receipt and changed head in the same transaction. `finish` schedules the result, not an early success. After transaction completion verify the committed receipt/digest by a read transaction; a later document update does not invalidate that original acknowledgment. Never verify by demanding that the current body still equals an older command.

Persist compact receipts containing command digest, target, resulting document revision/update time, global revision and status; reconstruct a Saved result's Markdown from the matching digest-verified incoming command on replay. Do not persist a second complete note body for every keystroke batch. Keep valid-scope receipts until they can no longer be retried; no timed garbage collection may break command identity. The feature service validates problem existence through an injected owning read function and returns controlled conflicts; persistence failures remain retryable unsaved errors.

- [ ] **Step 4: Verify GREEN and commit.** Run the same integration file plus the task-1 contracts. Expect one durable change, no core serialization, unchanged old data after abort, and safe reflection writes. Commit `feat(notes): persist revisioned notes and reflections atomically`.

## Task 5: Trusted edit scopes, runtime methods and invalidation

**Files:** Create `src/features/notes/api/notes-contracts.ts`, `src/extension/background/notes-edit-scopes.ts`, `notes-handlers.ts` and colocated tests, plus `src/extension/messaging.test.ts` for the new protocol contracts; modify `src/extension/messaging.ts`, `background/runtime-policy.ts`, `register-handlers.ts`, `src/platform/query/query-keys.ts`, `cache-invalidation.ts` and their existing tests.

- [ ] **Step 1: Add sender and payload tests.** Reject a spoofed surface, arbitrary LeetCode slug, other tab/document lease, missing scope, unknown keys, nonexistent reflection submission and stale reset token. Issue an edit lease while the sender owns problem A; permit its already-owned final A flush after same-document SPA navigation to B, but do not allow that lease to read or mutate arbitrary B data.

```ts
expect(() =>
  assertNotesEditOwner(lease, {
    tabId: 8,
    documentId: 'document-2',
    host: 'leetcode.com',
  }),
).toThrow('owner')
expect(() =>
  assertNotesEditOwner(lease, {
    tabId: 7,
    documentId: 'document-1',
    host: 'leetcode.com',
  }),
).not.toThrow()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/extension/background/notes-edit-scopes.test.ts src/extension/background/notes-handlers.test.ts src/extension/background/runtime-policy.test.ts src/platform/query/cache-invalidation.test.ts`.
- [ ] **Step 3: Register narrow methods.** Define strict Zod input/result schemas and protocol map entries for `notes.openEditor`, `notes.saveDocument`, `notes.getProblemNotes`, `notes.listSubmissions`, `notes.getSubmission`, `notes.getAssessment`, `notes.setSavedAiNote`. Dashboard may access catalog problems; content-script reads/open require actual HTTPS LeetCode host/slug match. Popup gets no editing API. `openEditor` returns `{ scope, editLeaseId, document }`; later writes send the issued lease ID and command. Persist lease ownership in technical `records` so an accepted retry can survive worker restart. Bind Chrome tab and document IDs; reject senders without a reliable document identity rather than grant a URL-only lease. Clear local data/replacement invalidates leases via the dataset token.

`getProblemNotes` returns the main document, current scope, collection revision and saved-inclusion metadata without report bodies. `listSubmissions` accepts a limit of 3 or 50 plus a scoped cursor. `getSubmission` requires problem slug/internal submission ID and returns that selected entry's bodies. `getAssessment` requires problem slug/assessment ID and returns only that report's feedback/optional implementation, without submitted code or provider access. Mutations return the document or saved-AI result schemas above; they do not overload a document revision as a collection revision.

```ts
export function assertNotesEditOwner(
  lease: { tabId: number; documentId: string; host: string },
  owner: { tabId: number; documentId: string; host: string },
) {
  if (
    lease.tabId !== owner.tabId ||
    lease.documentId !== owner.documentId ||
    lease.host !== owner.host
  )
    throw new Error('Notes edit owner does not match.')
}
```

Use the shared queue/barrier for reads and mutations. After durable writes, broadcast `notes` and `sync` tags with the problem slug; archive capture uses `submissions` and `sync`. Assessment/implementation attachment invalidates both `notes` and `submissions` plus `sync`, so an already-saved disclosure observes new artifacts without affecting Practice caches. Add `queryKeys.notes` and `queryKeys.submissions` roots. Full reset/delete/restore invalidates those plus existing practice/problem/track/analytics/shell roots. An invalidation failure must not re-execute a committed command. Resume/emit invalidation from a compact durable outbox entry or receipt flag on the next authorized read/startup.

The new `messaging.test.ts` parses every Notes request/result through its registered schema and rejects unexpected fields, spoofed surfaces, wrong IDs and unsupported versions. Handler tests separately prove authorization happens before DB access; schema tests alone are not sender proof.

- [ ] **Step 4: Verify GREEN and commit.** Run the four RED files plus `rtk npm test -- src/extension/messaging.test.ts src/testing/architecture-boundaries.test.ts`; expect strict policy and current boundaries to pass. Commit `feat(notes): add owned runtime editing and archive queries`.

## Task 6: Detached core candidates and matching archive generations

**Files:** Modify `src/platform/db/client.ts`, `proxy.ts`, `instance.ts`, `snapshot-idb.ts`; create `src/platform/db/composite-publication.ts`, `composite-publication.test.ts`, `src/features/notes/data/archive-generation-repository.ts`, `archive-generation-repository.test.ts`; extend `src/extension/background/backup-replacement.ts` tests.

- [ ] **Step 1: Add failure-point tests.** Parameterize stops before stage, during archive copy, before IDB commit, after commit/before handle swap and during notification. Reopen from the durable store, not the prior in-memory handle. Expect an old pair, new pair or explicit recovery-required state. Recover the retained prior pair and verify its note/code/report bodies, not just counts.

```ts
expect(reopened.coreProblemSlugs).toEqual(expectedPair.coreProblemSlugs)
expect(reopened.noteMarkdown).toBe(expectedPair.noteMarkdown)
expect(reopened.submissionCode).toBe(expectedPair.submissionCode)
expect(reopened.archiveGeneration).toBe(expectedPair.archiveGeneration)
expect(candidateMutationHook).not.toHaveBeenCalled()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/platform/db/composite-publication.test.ts src/features/notes/data/archive-generation-repository.test.ts src/extension/background/backup-replacement.test.ts`.
- [ ] **Step 3: Prepare without changing live state.** Change `createProxyCallback(rawDb, onMutation?)` to receive a per-handle callback; keep existing default behavior for normal handles. `createDb({ onMutation })` carries the callback. `createDetachedCoreCandidate(bytes)` deserializes into a new handle with no live snapshot scheduling; `publishCompositeCandidate` returns only after its IDB commit and required readback; `adoptPublishedCoreCandidate` switches `activeHandle` and `handlePromise` together, closing the old handle only when no current reader owns it.

```ts
import type { DbHandle } from './client'

type CompositeCandidate = DbHandle & {
  baseRevision: number
  coreSnapshotId: string
  archiveGeneration: string
  datasetToken: string
  replacementId: string
}

function assertCandidateBase(
  head: { revision: number },
  candidate: CompositeCandidate,
) {
  if (head.revision !== candidate.baseRevision)
    throw new Error('Local data changed before replacement publication.')
}
```

The candidate includes its detached `DbHandle` only in memory; persist the descriptor fields and serialized core payload, never the WASM handle itself. The feature generation repository exposes `stageArchiveGeneration({ sourceGeneration, nextGeneration, excludedProblemSlugs })` and `stageImportedArchive({ nextGeneration, archive })`. Copy metadata in cursor batches of 500 and reuse immutable payload IDs. Hold the replacement barrier; record staging progress durably. Drain any already-running snapshot write and flush pending live core changes before pinning the base head; prevent a queued automatic snapshot from publishing during preparation. Non-target problem tokens and saved AI collection revisions remain unchanged during a problem reset. For full restore create fresh dataset/problem tokens. The final multi-store transaction validates base revision, writes head/recovery/continuation and scopes together. Never serialize a detached candidate with the old handle's export function.

Audit consumers that close over a `Db`, including background sync service creation. Long-lived jobs/services must resolve the current handle per operation through a loader, or be rebuilt after adoption; they cannot continue reading/writing the closed prior handle. Add a regression test that a queued sync export and a subsequent Practice write both use the adopted core after replacement.

Update the replacement coordinator to retain the prepared candidate/publication identity rather than run destructive domain writes on retry. On startup the durable head determines the active pair. If publication committed but response/readback was lost, reconcile by `replacementId`; do not rerun SQL or rotate scopes. Recovery records reference immutable core bytes and the prior metadata generation; garbage collection treats both as roots.

- [ ] **Step 4: Verify GREEN and commit.** Run the three RED files plus `rtk npm test -- src/platform/db/instance.test.ts src/platform/db/open-snapshot.test.ts src/features/practice/practice-durability.integration.test.ts`. Commit `feat(storage): publish recoverable core and archive pairs`.

## Task 7: Full and bulk problem reset, delete and Clear local data

**Files:** Create `src/extension/background/problem-data-service.ts`, `problem-data-service.test.ts`; modify `src/features/practice/domain/practice.ts`, `src/features/practice/server/practice-service.ts`, `data/practice-repository.ts`, `api/practice-contracts.ts`, `api/practice-api.ts`, `src/features/problems/server/problems-service.ts`, `api/problems-contracts.ts`, `api/problems-api.ts`, `src/features/backup/server/backup-service.ts`, `api/backup-contracts.ts`, `src/platform/db/snapshot-idb.ts`, `src/extension/background/register-handlers.ts`, `src/features/problems/components/problem-row/problem-row-actions.tsx`, `components/library/problem-bulk-action-bar.tsx` and affected tests.

- [ ] **Step 1: Add populated integration failures.** Seed practice/evidence/receipts/logs, note, submissions/code/reflections, assessments/generated code and saved inclusions for two problems. Reset one and assert the other remains exact. Delete one and assert its catalog dependencies disappear. Bulk reset is one accepted operation rather than `Promise.all` of independent problem resets. Clear local data restores fresh-install core plus an empty archive.

```ts
expect(after.target).toMatchObject({
  note: '',
  submissions: [],
  assessments: [],
  savedAiNotes: [],
})
expect(after.target.practice.latestAttempt).toBeNull()
expect(after.target.legacyLog).toEqual(emptyLegacyLog)
expect(after.other).toEqual(before.other)
expect(after.target.catalog).toEqual(before.target.catalog)
expect(after.target.trackPlacements).toEqual(before.target.trackPlacements)
expect(await notes.saveDocument(pendingOldCommand)).toEqual({
  status: 'stale-scope',
})
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/extension/background/problem-data-service.test.ts src/features/problems/components/library/problem-library-screen.test.tsx src/features/tracks/components/tracks-screen.test.tsx`.
- [ ] **Step 3: Coordinate through owning services on a detached candidate.** Add `problems.resetProblemData` for one or many validated slugs with stable operation ID; use the same composite path for existing single/bulk delete and full reset. Route the existing `practice.resetSchedule` method through this full reset boundary rather than leave an archive-bypassing destructive method. Both paths require a stable command identity; a stale client missing it receives a controlled refresh-required failure before mutation. Do not infer command identity solely from the problem slug.

Add `problem-reset` and `problem-delete` to the platform/domain replacement-kind validators and status schemas. Current reset/delete API responses use the coordinated durable/persistence-pending result rather than `void`; update their callers and tests to keep a pending confirmation open with Retry saving. Create the operation ID when the user confirms, retain the accepted request for retries, and allocate a new ID only for a new intentional action. An all-problem Clear local data still uses the existing `reset` kind.

```ts
for (const problemSlug of request.problemSlugs) {
  await resetPracticeSchedule(candidate.db, {
    problemSlug,
    keepLog: false,
    clearSuspension: true,
  })
}
```

The existing Practice workflow owns review/evidence/generation clearing and track-completion effects. Full Reset problem returns practice to new and unsuspended, and clears learning logs. Add `clearSuspension?: boolean` to `ResetPracticeScheduleInput` in `src/features/practice/domain/practice.ts`; the owning repository uses `false` for the resulting suspension when that option is true, retaining its existing default only for internal callers that do not request a full reset. Add a suspended-problem regression case. The public full-reset boundary always passes `keepLog: false` and `clearSuspension: true`; callers cannot weaken it through a payload flag. Stage the archive excluding target problems and mint new target problem tokens. Rebuild valid Practice metadata on full reset through existing preparation services. Do not alter track memberships or import a raw table deletion into Notes.

Change visible labels to **Reset problem**, dialog title to **Reset problem?**, and copy to name notes, submission history, saved AI, practice history and schedule. Bulk confirmation includes the selected count. Expand Delete/Clear confirmations with the same categories. Keep Restart and Reset track progress separate. Disable controls while publication/retry is pending and show the existing recoverable Data Management action on failure.

- [ ] **Step 4: Verify GREEN and commit.** Run the RED files plus `rtk npm test -- src/features/practice/practice-command.integration.test.ts src/features/problems/data/problems-repository.test.ts src/extension/background/register-handlers.test.ts`. Commit `feat(notes): reset problem learning data across both stores`.

## Task 8: Full backup v7 and explicit legacy replacement

**Files:** Modify `src/features/backup/api/backup-contracts.ts`, `backup-legacy-contracts.ts`, `domain/backup-normalization.ts`, `backup-preflight.ts`, `server/backup-service.ts`, `data/backup-repository.ts`; create `src/features/backup/notes-backup.integration.test.ts`, `src/features/backup/domain/backup-preflight.test.ts`, `src/features/backup/domain/backup-normalization.test.ts`; extend the existing contract/repository/service tests.

- [ ] **Step 1: Write full round-trip and legacy fixtures.** Export populated core/archive, restore into a different database, and compare exact code, report schemas, reflection text, inclusion references, timestamps and existing FSRS state. Freeze a current v6 fixture before changing exported aliases. Test versions 1–6 independently, future versions, dangling references, duplicate IDs and malformed current Practice evidence.

```ts
const restored = await readLogicalLearningDataset(restoredContext)
expect(restored.archive).toEqual(original.archive)
expect(restored.practice).toEqual(original.practice)
expect(legacyPreview).toMatchObject({
  sourceSchemaVersion: 6,
  archiveAbsent: true,
})
expect(legacyPreview.removesCurrentArchive).toBe(true)
```

Define `readLogicalLearningDataset` in this integration file: use the owning backup core reader and Notes export reader, omitting storage tokens/generations from the comparison. It must not generate reports or replay reviews.

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/backup/notes-backup.integration.test.ts src/features/backup/api/backup-contracts.test.ts`.
- [ ] **Step 3: Freeze then extend.** Preserve v6's exact schemas in the legacy module and keep v1–v5 normalization through the existing frozen chain. Normalize v6 to v7 with an empty archive but retain the original schema version in prepared metadata. Define current data as existing v6 core data plus `notesArchive`; summaries add note/submission/assessment/inclusion counts and payload bytes.

```ts
export function legacyArchiveDisposition(
  sourceSchemaVersion: number,
  currentArchiveHasData: boolean,
) {
  return {
    sourceSchemaVersion,
    archiveAbsent: sourceSchemaVersion < 7,
    removesCurrentArchive: sourceSchemaVersion < 7 && currentArchiveHasData,
  }
}
```

`prepareFullBackupRestore` must return validated core/archive plus this disposition; never lose it by normalizing before sync policy inspects the source. Export under `runConsistentRead`: flush/gate pending core state, pin one head/revision and matching archive generation, read the core through its owner and archive through Notes. Return `{ backup, revision }` internally so transport acknowledges the exact pair. Manual legacy replacement requires a preview-bound confirmation token for the selected input digest and current local revision. Revalidate on confirm if local data changed. Restore stages data and publishes through task 6.

Historical readers stay immutable. Update current repository types/tests rather than editing old fixtures to pretend archives existed. Ordinary exports omit tokens, command receipts, transfer sessions, hint state, prompts, raw provider bodies and secrets.

- [ ] **Step 4: Verify GREEN and commit.** Run the RED files and `rtk npm test -- src/features/backup/server/backup-service.test.ts src/features/backup/domain/backup-preflight.test.ts src/features/backup/domain/backup-normalization.test.ts src/features/sync/domain/sync-envelope.test.ts`. Commit `feat(backup): include the full learning archive in version seven`.

## Task 9: Bounded local backup transfer sessions

**Files:** Create `src/features/backup/api/backup-transfer-contracts.ts`, `server/backup-transfer-service.ts` and tests; modify `src/features/backup/api/backup-api.ts`, `components/backup-restore-panel.tsx`, `src/extension/messaging.ts`, `background/runtime-policy.ts`, `register-handlers.ts`.

- [ ] **Step 1: Add transfer tests.** Transfer a synthetic archive larger than one runtime message using 256 KiB chunks. Reject out-of-order chunks, conflicting retries, wrong owner, wrong final digest and incomplete close. Restart the service after an accepted chunk and continue. Cancellation removes only that transfer's technical spool. No restore mutation runs until validation and user confirmation succeed.

```ts
expect(
  sentChunks.every(
    (chunk) => new TextEncoder().encode(chunk.text).byteLength <= 262144,
  ),
).toBe(true)
expect(
  await receiver.append({ sessionId, index: 2, text: 'late' }),
).toMatchObject({ status: 'out-of-order' })
expect(restoreSpy).not.toHaveBeenCalled()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/backup/server/backup-transfer-service.test.ts src/features/backup/api/backup-api.test.tsx`.
- [ ] **Step 3: Add dashboard-only session protocol.** Define `backup.beginTransfer`, `backup.readTransferChunk`, `backup.appendTransferChunk`, `backup.finishTransfer`, `backup.cancelTransfer`. Each strict request has dashboard surface, session ID and sequence as applicable. Bind sessions to the extension dashboard document owner; issue a new owner token on explicit resume rather than trust a caller's ID. Persist session direction, source revision/digest, next sequence, byte total, owner, status and chunks in the technical records namespace. Bound aggregate active spools and refuse a new transfer visibly when needed; never delete learning records to make space.

```ts
export function splitUtf8Text(text: string, maximumBytes = 262144): string[] {
  const parts: string[] = []
  let part = ''
  let bytes = 0
  for (const character of text) {
    const width = new TextEncoder().encode(character).byteLength
    if (bytes + width > maximumBytes && part) {
      parts.push(part)
      part = ''
      bytes = 0
    }
    part += character
    bytes += width
  }
  if (part) parts.push(part)
  return parts
}
```

Use an incremental emitter/buffer in production rather than materialize this helper's entire parts array for a large export. Keep UTF-8 boundaries and JSON syntax exact. Hold the consistent-read barrier until a complete export is spooled; only then release writes and serve dashboard chunks. An interrupted spool resumes only if its pinned source revision is still current, otherwise invalidate that transfer and request a fresh export. Never concatenate old/new revisions into a completed backup. The dashboard creates a Blob from received chunks and revokes the object URL after download initiation. Imports read `File.stream()` with a streaming TextDecoder, send ordered text chunks, then validate the assembled input in the worker. Worker restart retries parsing from the durable spool, never replays a partially applied restore. Whole-file parsing is still measured in Phase 4; do not describe it as constant-memory streaming validation. Existing object-level service tests remain useful, but the user-facing path uses bounded transfers.

- [ ] **Step 4: Verify GREEN and commit.** Run the RED files plus `rtk npm test -- src/extension/messaging.test.ts src/extension/background/runtime-policy.test.ts`; include Unicode code fences spanning a chunk boundary. Commit `feat(backup): transfer large learning archives in bounded chunks`.

## Task 10: Full remote contract and legacy auto-pull guard

**Files:** Modify `src/features/sync/server/sync-service.ts`, `domain/sync-envelope.ts`, `data/sync-metadata-store.ts`, `src/extension/background/sync-auto-sync.ts` and their tests. The master plan names the separate approved transport dependency.

- [ ] **Step 1: Add policy tests.** A note-only change blocks automatic pull, survives failed dirty-flag/alarm writes and restarts, and exports v7. An older remote backup with no archive cannot silently erase a populated archive. A newer edit during upload remains pending after exact-revision verification. Upload HTTP success without complete readback does not advance the verified revision.

```ts
expect(autoPullResult).toMatchObject({
  outcome: 'blocked',
  reason: 'archive-review-required',
})
expect(restoreSpy).not.toHaveBeenCalled()
expect((await localStore.readHead())!.lastVerifiedRevision).toBe(7)
expect((await localStore.readHead())!.revision).toBe(8)
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/sync/server/sync-service.test.ts src/features/sync/domain/sync-envelope.test.ts src/extension/background/sync-auto-sync.test.ts`.
- [ ] **Step 3: Preserve source format and exact revision.** Parse envelope metadata before normalizing its backup. If an automatic replacement lacks an archive and local archive data exists, return the explicit review-required state; a manual confirmed replacement still uses the full preview-bound restore. Wire export to `{ backup, revision }` from task 8, not a fresh revision read after serialization.

```ts
export function needsArchiveRestoreReview(input: {
  automatic: boolean
  sourceSchemaVersion: number
  currentArchiveHasData: boolean
}) {
  return (
    input.automatic &&
    input.sourceSchemaVersion < 7 &&
    input.currentArchiveHasData
  )
}
```

Extend sync reason/status schemas and Settings copy for this controlled state. Keep local-save success independent of remote failure. Call `acknowledgeVerifiedRevision(exportedRevision)` only from verified transport completion. The baseline Gist transport is not upgraded to large-payload verified status by changing this call alone; mark that capability unmet until its approved transport changes and Phase 4 acceptance pass. Drive integration uses the same v7 preflight and revision; do not create another serializer.

- [ ] **Step 4: Verify GREEN and commit.** Run the three RED files and `rtk npm test -- src/features/sync/components/github-sync-panel.test.tsx src/features/sync/hooks/use-github-sync-controller.test.tsx`. Commit `fix(sync): protect complete archives and exact backup revisions`.

## Task 11: Retention, technical cleanup and usage

**Files:** Create `src/features/notes/server/notes-maintenance-service.ts`, `notes-maintenance-service.test.ts`; modify `src/extension/background/notes-handlers.ts`, `runtime-policy.ts`, `register-handlers.ts`, `src/features/notes/api/notes-contracts.ts` and `src/extension/messaging.ts`; extend archive generation/snapshot tests and Data Management status contracts.

- [ ] **Step 1: Add root-preservation tests.** Seed old-but-active notes/history, prior replacement recovery, unresolved commands, interrupted import/export and an abandoned completed staging generation. Advance the clock by years. Only demonstrably unreferenced technical records are eligible for deletion. Reopen recovery after cleanup and compare exact content.

```ts
expect(await maintenance.collectTechnicalLeftovers()).toEqual({
  removedGenerations: ['abandoned-stage'],
  removedPayloadIds: ['unreferenced-body'],
})
expect(
  await repository.readDocument('two-sum', { kind: 'problem' }),
).toMatchObject({ markdown: 'Keep forever.' })
expect(await store.readReplacementRecovery(recoveryId)).not.toBeNull()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/server/notes-maintenance-service.test.ts`.
- [ ] **Step 3: Implement reachability, not age expiry.** Discover roots from active head, retained recovery, pending continuation, active scopes/receipts and unresolved transfer/staging records. Traverse metadata to payload IDs; delete in bounded batches only while the root revision remains unchanged or under the mutation barrier. Remove completed/cancelled transfer spools, acknowledged draft checkpoints and unreachable staging generations. If root discovery fails, collect nothing and report a controlled maintenance error.

```ts
export function unreferencedIds(
  allIds: readonly string[],
  reachable: ReadonlySet<string>,
) {
  return allIds.filter((id) => !reachable.has(id))
}
```

Expose actual counts and logical payload bytes through dashboard-only `notes.getArchiveUsage`; report `navigator.storage.estimate()` separately when available. Distinguish logical bytes from browser-reported usage/quota. Compose maintenance through the existing background alarm scheduler using a `notes-maintenance` daily job plus a post-replacement cleanup request. Run only bounded batches while the mutation queue is idle; persist progress and postpone when foreground work needs the queue. A maintenance failure cannot fail an already durable note save. Add a scheduler test that an active recovery root is preserved across a job restart. Provide no retention selector, automatic learning-data deletion or cross-profile promise. Storage failure leaves existing data and drafts intact.

- [ ] **Step 4: Verify GREEN and commit.** Run the maintenance tests plus task-6 recovery tests. Commit `feat(storage): collect only unreachable archive technical data`.

## Task 12: Phase validation, documentation and human proof

**Files:** Modify `docs/architecture.md`, `docs/testing.md`, `docs/product.md`, `PRIVACY.md`; create `docs/superpowers/handoffs/2026-10-31-notes-phase-1.md` during execution, recording actual outcomes.

- [ ] **Step 1: Run focused phase tests.** Run `rtk npm test -- src/platform/db src/features/notes src/features/backup src/features/sync src/extension/background/backup-replacement.test.ts src/extension/background/register-handlers.test.ts src/testing/architecture-boundaries.test.ts`. Expect all pass; investigate actual regressions rather than updating expectations to match lost data.
- [ ] **Step 2: Run required full checks.** Run `rtk npm run db:check`, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, and `rtk npm run format`. Skip `rtk npm run db:generate` only when Drizzle schema is unchanged, recording that exact reason. Package with `rtk npm run zip` if task 9 changes artifact behavior.
- [ ] **Step 3: Prepare and obtain human installed-extension proof.** Export a deterministic populated v7 fixture from the integration test's owning serializer for use in a disposable profile. Upgrade from v1, import that fixture through Data Management, restart/re-export and compare its exact note/code/report content. Abort one real IDB publication, restart around a composite reset/restore, retry a lost response, reset one/bulk problems, delete and explicitly restore v6 after the removal preview; verify unrelated problem state remains. Use the actual packaged worker/IDB, not a Chrome-storage interception shim. Attach redacted screenshots/recording before PR review/merge. Infrastructure-only production surfaces still show Notes as unavailable; actual typing/autosave proof is supplied in Phase 3 before feature release.
- [ ] **Step 4: Update honest authority docs and commit.** Describe shipped infrastructure/reset/backup behavior only; do not claim the editor/capture is live. Record IDB upgrade/downgrade recovery, remote dependency status, exact checks/skips and phase-2 public APIs in the handoff. Commit `docs(notes): record archive persistence and recovery validation` after proof/status is accurately recorded.

## Done when

- [ ] Existing profiles and all recovery slots survive the upgrade or remain recoverable on failure.
- [ ] Archive-only saves change one shared revision without SQLite serialization or core payload writes.
- [ ] CAS, command replay, sender ownership and reset generations survive real IDB transactions and worker restart.
- [ ] Core/archive reset, delete, restore and selectable recovery are one consistent published pair.
- [ ] v7 round-trips complete content; versions 1–6 have truthful previews; automatic legacy replacement cannot erase the archive.
- [ ] The user-facing local backup path uses bounded IPC and detects partial transfers.
- [ ] Cleanup cannot evict old learning records or retained recovery roots.
- [ ] Required checks and human proof status are recorded; remote transport readiness is explicit and capture/editor remain unreleased.
