# Ponytail Phase 1 Data Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Keep backup restoration tied to the latest file selection and permit explicitly confirmed manual sync recovery without weakening automatic pull protection.

**Architecture:** Keep backup race handling local to Data Management. Thread parsed overwrite authorization through the existing queued manual sync action only. Investigate restart durability at the current storage boundary before selecting a persistence repair.

**Tech Stack:** React, TypeScript, Vitest/Testing Library, Zod runtime contracts, Chrome local storage, existing SQLite snapshot and mutation queue.

Approved design: [Ponytail cleanup](../specs/2026-10-02-ponytail-cleanup-design.md).
All shell commands below run through `rtk`; no new packages/schema/permissions.

## Task 1: Backup selection generation

**Files:**

- Modify: `src/features/backup/components/data-management-screen.tsx`.
- Test: `src/features/backup/components/data-management-screen.test.tsx`.
- Reference: `src/features/imports/hooks/use-content-import.ts`.

- [x] Add a maintained deferred `File.text()` regression to the existing component suite using its `validBackup`, runtime mocks and Query harness. Select A whose read is unresolved, select B whose read resolves, then finish A. The visible filename and `backup.restoreFullBackup` payload must both be B. Do not assert that stale A must be validated.
- [x] Add stale read-error and stale validation-result/error coverage using deferred promises. One current selection's success must not be cleared by a prior selection's rejection. Exercise replacement while validation is pending through the component callback if the native input is disabled.
- [x] Run `rtk npm test -- src/features/backup/components/data-management-screen.test.tsx --run`; observe the new regression failing because A overwrites B.
- [x] Import `useRef`, retain a selection generation, and guard every asynchronous continuation. The essential implementation is:

```tsx
const backupSelectionGeneration = useRef(0)

async function handleFileSelect(file: File) {
  const generation = ++backupSelectionGeneration.current
  const isCurrentSelection = () =>
    generation === backupSelectionGeneration.current
  // Keep the existing synchronous selection/reset state updates here.
  let parsedBackup: unknown
  try {
    parsedBackup = JSON.parse(await readFileText(file))
  } catch {
    if (isCurrentSelection()) setBackupError('Invalid JSON backup file.')
    return
  }
  if (!isCurrentSelection()) return
  try {
    const summary = await validateBackup.mutateAsync(parsedBackup)
    if (!isCurrentSelection()) return
    setSelectedBackup(parsedBackup)
    setBackupSummary(summary)
    setBackupToast({ message: 'Backup ready to restore.', tone: 'success' })
  } catch (error) {
    if (isCurrentSelection()) {
      setBackupError(readErrorMessage(error, 'Backup validation failed.'))
    }
  }
}
```

- [x] Verify the focused suite passes and inspect the diff for unnecessary upload abstractions or changes to restore/export/reset semantics.

## Task 2: Authorized manual force-pull restore

**Files:**

- Modify: `src/extension/background/register-handlers.ts`.
- Test: `src/extension/background/register-handlers.test.ts`.
- Reference: `src/features/sync/server/sync-service.ts`, `src/features/sync/api/sync-contracts.ts` and `src/extension/background/runtime-policy.ts`.

- [x] Extend the current handler fixture so its sync-service double invokes the supplied `runRemoteRestore` callback. Exercise dirty metadata with an authorized dashboard `sync.pullLatest` request and `confirmLocalOverwrite:true`; assert the restore callback runs. Exercise omitted/false confirmation and automatic/open-check restoration; assert dirty restoration stays blocked. Use existing sender fixtures; unauthorized senders remain rejected before DB access.
- [x] Run `rtk npm test -- src/extension/background/register-handlers.test.ts src/features/sync/server/sync-service.test.ts src/extension/background/runtime-policy.test.ts --run`; observe the confirmed dirty restore failing at the real runtime guard.
- [x] Add a default-false action option and carry it only from the parsed manual request:

```ts
type SyncRestoreOptions = { confirmLocalOverwrite?: boolean }

function runQueuedSyncAction<T>(
  db: Db,
  action: (service: BackgroundSyncService) => Promise<T>,
  options: SyncRestoreOptions = {},
) {
  // Keep the existing runInMutationQueue and retryPendingDirtyMark logic.
  // Within the queued action, use:
  return action(createSyncServiceForDbInQueue(db, true, options))
}

function createSyncServiceForDbInQueue(
  db: Db,
  isInsideMutationQueue: boolean,
  options: SyncRestoreOptions = {},
) {
  // Keep existing createBackgroundSyncService and invalidation callback.
  // Its runRemoteRestore invokes:
  return runRemoteRestoreInMutationQueue(
    work,
    isInsideMutationQueue,
    options.confirmLocalOverwrite === true,
  )
}

// In the existing guard, add a default-false third argument and use:
if (metadata.dirtySinceLastSync && !confirmLocalOverwrite) {
  throw new Error(
    'Sync conflict detected. Local data changed before remote data could be applied.',
  )
}
```

The snippets identify changes within existing function bodies; preserve their
existing surrounding queue, service construction, flush and invalidation code.
Do not replace whole functions with the abbreviated excerpts.

- [x] Pass `{ confirmLocalOverwrite: request.confirmLocalOverwrite }` as the third argument to `runQueuedSyncAction` only in `sync.pullLatest`. All automatic/open-check/push callers retain defaults.
- [x] Verify focused tests, including existing concurrent write serialization and dirty-mark retry cases; inspect every caller of the modified functions.

## Task 3: Dirty-state restart probe

**Files to inspect:** `register-handlers.ts`, its tests, `src/features/sync/data/sync-metadata-store.ts`, `src/platform/db/instance.ts`, `src/platform/db/snapshot.ts` and related tests.

- [x] Reproduce a metadata dirty-mark failure followed by successful snapshot storage, reset the handler module (worker restart), then attempt automatic remote restore against retained clean metadata. Confirm whether local changed data can be overwritten.
- [x] Use disposable in-memory state and storage mocks, never user data. Keep temporary probes outside maintained source after recording evidence.
- [x] If confirmed, derive a small durable repair and write its exact design/plan before implementation. Preserve local-save safety and do not expand sync scope. The human approved investigation and repair of this risk as part of the master design; only a materially different persistence scope requires further approval.
- [x] Do not claim restart durability until a maintained integrated regression proves it.

## Task 4: Durable snapshot dirtiness

The integrated restart probe confirmed the loss path and a protection regression
failed: automatic pull returned `success` after a local save, metadata failure,
and worker reload. The existing snapshot write is the durability boundary.

**Files:** `src/platform/db/snapshot.ts`, `instance.ts`, their tests;
`src/features/sync/data/sync-metadata-store.ts`, its tests; a maintained
`src/extension/background/sync-restart.test.ts` regression.

- [x] Copy the desired protection regression from the disposable probe into the maintained background suite and observe it fail.
- [x] Add one platform-owned local storage marker. Extend the existing snapshot storage set to include marker `true` only when publishing mutations. Never clear it on initial publication or no-op flush.
- [x] Increment a mutation version using the existing mutation hook. Capture that version before snapshot export, and advance the persisted version only after a successful storage write. This covers both the 250 ms debounce and explicit flush, preserves mutations occurring during awaited storage, and retries after failure. Reset test state consistently with DB lifecycle.
- [x] Read metadata and marker together; derive dirty state from the validated metadata OR a literal `true` marker. When a metadata patch explicitly acknowledges `dirtySinceLastSync:false`, clear the marker in the same existing storage set as that acknowledgement. Unrelated metadata patches and disconnect must preserve the marker. Preserve the in-memory pending guard for unsaved changes.
- [x] Add focused evidence for initial clean publication, mutation publication, no-op flush after acknowledgement, debounce before a failed dirty mark finishes, concurrent mutation during storage, snapshot failure/retry, restart protection, and successful/failed acknowledgement. Trace every clean acknowledgement to successful push/pull under the existing queue.
- [x] Keep local saves successful under the existing best-effort metadata policy. Add no schema, dependency, runtime contract, sync scope, or new hook. Update current architecture/testing docs to explain the marker and restart smoke flow.

## Task 5: Review, validation and handoff

- [x] Review each task against the design, then review minimality, caller coverage, authorization, snapshot ordering and error paths.
- [x] Run focused suites first, then `rtk npm run lint`, `rtk npm run check`, and `rtk npm run build`.
- [x] Run explicit Prettier checks for touched planning Markdown (override the historical-artifact ignore).
- [x] Save exact commands/results and pending human proof in the implementation ledger; update task checkboxes only after evidence.
- [x] Use conventional commits after review. Root alone stages/commits, so concurrent agents never include another task's files.

Human smoke remains pending: disposable-profile late backup selection/restore;
cancel and confirm dirty force pull; automatic dirty pull protection; restart
failure scenario if repaired. Attach redacted screenshots/recording before PR
review or merge. Skip `db:generate` because this plan changes no schema; no
live Gist/provider calls or browser proof are claimed by automated tests.
