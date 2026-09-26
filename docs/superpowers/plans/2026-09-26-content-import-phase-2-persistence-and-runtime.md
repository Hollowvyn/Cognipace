# Content Import Phase 2: Persistence and Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose authorized preview, atomic apply, and snapshot-retry operations that preserve existing data and avoid side effects for unchanged files.

**Architecture:** Import services compose the pure Phase 1 planner with additive repositories owned by problems and tracks. The extension boundary keeps all writes on the existing mutation queue and distinguishes database commit from durable snapshot save.

**Tech Stack:** Drizzle, SQLite WASM, Zod, Web Crypto, WXT messaging, Vitest.

---

Prerequisite: [Phase 1](./2026-09-26-content-import-phase-1-contract-and-planner.md)
passes its completion checks. Read the [master plan](./2026-09-26-non-destructive-content-import.md)
for shared vocabulary and toolchain requirements.

## File Map

| Create/modify | Files and purpose                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Create        | `src/features/problems/data/problem-import-repository.ts` and `.test.ts`: explicit projection reads and catalog inserts            |
| Create        | `src/features/problems/server/problem-import-service.ts`: public owner boundary                                                    |
| Create        | `src/features/tracks/data/track-import-repository.ts` and `.test.ts`: projection reads and curriculum inserts                      |
| Create        | `src/features/tracks/server/track-import-service.ts`: public owner boundary                                                        |
| Create        | `src/features/imports/server/import-service.ts` and `.test.ts`: preview, fingerprint, transaction orchestration                    |
| Create        | `src/features/imports/api/import-runtime-contracts.ts` and `.test.ts`: wire schemas/types                                          |
| Create        | `src/extension/background/import-handlers.ts` and `.test.ts`: registration and durable outcome handling                            |
| Modify        | `src/extension/messaging.ts`: three method signatures and public wire types                                                        |
| Modify        | `src/extension/background/runtime-policy.ts` and `.test.ts`: dashboard-only permissions                                            |
| Modify        | `src/extension/background/register-handlers.ts` and `.test.ts`: inject existing queue/lifecycle functions into import registration |
| Create        | `src/platform/db/instance.test.ts`: existing snapshot failure/retry and transaction-boundary regression coverage                   |

Do not enlarge the existing 1,000+ line problem/track repositories. Focused
import repository files remain inside the same owners. Do not change normal
edit behavior or bypass feature boundaries with SQL in the imports service.

## Task 1: Owner-Scoped Read Projections and Insert-Only Operations

**Files:** Create both owner repository/service pairs and repository tests.

- [ ] Add this real-database regression to the problem import repository test, with imports for Vitest, `createTestDb`, `problems`, and the new repository functions:

Coverage: [problem-import-repository.test.ts](../../../src/features/problems/data/problem-import-repository.test.ts).

- [ ] Run `rtk proxy npx vitest run src/features/problems/data/problem-import-repository.test.ts src/features/tracks/data/track-import-repository.test.ts`; expect absent-module/test failures until both tests exist.
- [ ] Implement catalog projections with explicit fields so timestamps and practice state cannot accidentally enter fingerprint input:

Source: [problem-import-repository.ts](../../../src/features/problems/data/problem-import-repository.ts) · coverage: [problem-import-repository.test.ts](../../../src/features/problems/data/problem-import-repository.test.ts).

Do not add conflict-update clauses. Plans contain only missing rows, and apply
rechecks while serialized. Unexpected constraints are transaction failures,
not reasons to report planned counts for rows that were silently ignored.
Batch inserts to avoid SQLite parameter ceilings; 100 rows is below the
historical 999-variable ceiling for these bounded row shapes.

- [ ] Implement the track projection/insertion functions with the same explicit ownership:

Source: [track-import-repository.ts](../../../src/features/tracks/data/track-import-repository.ts) · coverage: [track-import-repository.test.ts](../../../src/features/tracks/data/track-import-repository.test.ts).

The tiny batch loops are local implementation details. Do not introduce a shared
infrastructure layer just for this duplication. Insert functions accept the
caller's transaction `Db`; they do not start an independent transaction.

- [ ] Expose each repository pair through its owner service module, not a root barrel:

Source: [problem-import-service.ts](../../../src/features/problems/server/problem-import-service.ts).

- [ ] Add tests that all five catalog collections and all three track collections insert in foreign-key-safe order, empty arrays skip inserts, and unexpected duplicates/foreign keys throw. Close each test DB in `finally`.
- [ ] Rerun both repository tests and `rtk proxy npx vitest run src/testing/architecture-boundaries.test.ts`; expect PASS.
- [ ] Commit as `feat(imports): add owner-scoped additive persistence`.

## Task 2: Read-Only Preview, Freshness, and Atomic Apply

**Files:** Create `import-service.ts` and its integration test. Extend
`imports/testing/import-fixtures.ts` with a valid track file containing two
questions and one existing local track/group fixture.

- [ ] Add the following no-op workflow test first, importing the Phase 1 fixtures and service functions:

Coverage: [import-service.test.ts](../../../src/features/imports/server/import-service.test.ts).

- [ ] Run `rtk proxy npx vitest run src/features/imports/server/import-service.test.ts`; expect missing-service failure.
- [ ] Implement the complete orchestration below, importing the Phase 1 planner/normalizer/types, `Db`, and Task 1 owner service functions:

Source: [import-service.ts](../../../src/features/imports/server/import-service.ts) · coverage: [import-service.test.ts](../../../src/features/imports/server/import-service.test.ts).

The service assumes callers serialize it on the existing extension mutation
queue; Phase 2 task 3 enforces that. Preview also uses this queue to avoid
reading an intermediate state. Do no external I/O in the write transaction.
The sole transaction cast follows the existing repository's Drizzle proxy
pattern. The snapshot/dirty-mark/UI lifecycle is not in this service.

- [ ] Add real-DB tests for these cases:

| Test                                | Concrete evidence                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Preview is read-only                | Capture all catalog tables, call preview, compare; mutation spies untouched                                             |
| Stale title/order/association/alias | Mutate after preview; apply returns `stale`, refreshed fingerprint, no import writes                                    |
| Unrelated practice review           | Fingerprint unchanged; practice is absent from projections                                                              |
| Mixed valid/invalid                 | Expected valid rows exist; skipped entries/containers create no implicit children                                       |
| Existing metadata and progress      | Seed reviewed/completed/suspended state; compare protected tables and all original scalar/timestamp values after import |
| Atomic rollback                     | SQLite test-only trigger aborts a late membership insert; earlier new topics/questions/tracks are absent afterward      |
| Canonical identities                | URL and slug reuse one question; renamed group title retains stable ID                                                  |
| Limits and bad header               | Blocked response; no DB writes                                                                                          |
| 250-question track                  | Exact ordered membership count; second import unchanged                                                                 |

For rollback, use the test DB's `rawDb.exec` to install a temporary SQLite
trigger before apply. This is test infrastructure only:

```sql
CREATE TEMP TRIGGER fail_import_membership
BEFORE INSERT ON track_group_problems
BEGIN
  SELECT RAISE(ABORT, 'controlled import failure');
END;
```

For protected-state comparison, query `problem_practice`, `fsrs_cards`,
`review_attempts`, `track_problem_progress`, `track_session`, and `settings_kv`
through schema exports before and after apply. Reuse existing fixture patterns
from `backup-service.test.ts`, but keep the new fixture local and small. Do not
call backup restore to set up production imports.

- [ ] Rerun the service and repository tests; expect PASS, including the intentional rejected apply in the rollback test.
- [ ] Commit as `feat(imports): preview and atomically apply additive changes`.

## Task 3: Trusted Runtime Contracts and Durability Outcomes

**Files:** Create wire contracts/tests and `import-handlers.ts`/tests; modify
messaging, runtime policy, registration, and their existing tests.

- [ ] Start wire tests proving dashboard-only request schema, fingerprint shape, and all response discriminants. Run `rtk proxy npx vitest run src/features/imports/api/import-runtime-contracts.test.ts`; expect missing schemas.
- [ ] Define wire schemas with every response field validated. Reuse the authoring resource constant, not the authoring schema itself:

Source: [import-runtime-contracts.ts](../../../src/features/imports/api/import-runtime-contracts.ts) · coverage: [import-runtime-contracts.test.ts](../../../src/features/imports/api/import-runtime-contracts.test.ts).

Import the Phase 1 `ImportPreview` type for internal use and add an assignability
test against `z.infer<typeof importPreviewSchema>` to prevent divergence. Apply
responses intentionally omit raw errors; UI copy for each status is fixed.
Reject non-string/oversized messages at the boundary before expensive parsing.

- [ ] Add the three master-plan methods to `ProtocolMap` in `messaging.ts`; use the exported request/response types. Add all three to the runtime-policy allowlist with `['dashboard']`. Extend policy tests with popup/content-script/forged-surface rejections.
- [ ] Write `import-handlers.test.ts` with injected lifecycle callbacks and captured `onMessage` handlers. Verify exact call order before implementing registration:

Coverage: [import-handlers.test.ts](../../../src/extension/background/import-handlers.test.ts).

For `stale`, `blocked`, or `unchanged`, the expected sequence ends after `apply`.
For transaction rejection it also ends after `apply`, with a rejected result.
For a failed flush, expect dirty mark, failed flush, invalidation, and a
`persistence-error` result; no sync scheduling until a later successful flush.

- [ ] Implement `registerImportHandlers(deps)` with an explicit dependency interface. Capture only a worker-local boolean for unconfirmed import durability; do not build a token registry or persisted journal:

Source: [import-handlers.ts](../../../src/extension/background/import-handlers.ts).

Use existing `onMessage` and `assertCanSenderCallExtensionMethod`. For each
method, parse the request and authorize with its method name/sender/surface
before calling `getDb`. The implementation of apply's queued body is:

Source: [import-handlers.ts](../../../src/extension/background/import-handlers.ts) · coverage: [import-handlers.test.ts](../../../src/extension/background/import-handlers.test.ts).

Inject the existing best-effort dirty/sync functions and broadcaster so their
failures do not incorrectly present committed catalog data as rolled back.
Retain the original transaction rejection as a runtime error; UI will instruct
the user to preview again if delivery is uncertain.

Preview's queued body is
`importPreviewSchema.parse(await previewContentImport(await deps.getDb(), request.fileText))`.
Retry's queued body is:

Source: [import-handlers.ts](../../../src/extension/background/import-handlers.ts) · coverage: [import-handlers.test.ts](../../../src/extension/background/import-handlers.test.ts).

Keep the pending boolean true until a successful snapshot flush, including
across previews and no-op imports. A fresh worker starts with false. A second
successful import flushes the whole current database, satisfying any prior
pending snapshot. Retry results describe snapshot durability, not ownership of
the last file; the UI retains its own previously applied counts.

- [ ] Wire registration in `registerBackgroundHandlers()` with these callbacks:

Registration: [register-handlers.ts](../../../src/extension/background/register-handlers.ts) · implementation: [import-handlers.ts](../../../src/extension/background/import-handlers.ts).

Existing `problems` invalidation already reaches practice details, queue, tracks,
and shell. Include analytics because catalog/topic additions can affect its
read models. Do not mutate practice just to refresh its read model. Do not call
`runDbMutation` around this handler: that would dirty and flush no-op/stale
outcomes or attempt to enter the same queue twice.

- [ ] Add focused registration tests proving all three methods are registered and share the existing queue with normal edits/sync restore. Keep new detailed tests in `import-handlers.test.ts` instead of expanding the already large registration test unnecessarily.
- [ ] In `instance.test.ts`, test the existing snapshot wrapper with a one-time rejected `chrome.storage.local.set`, followed by a successful `flushDbSnapshot()`. Its current `finally` cleanup resets the failed promise, so no platform production change is planned. Assert the second flush serializes the current database and succeeds without rerunning import inserts.
- [ ] Verify no snapshot serializes partially applied import data. The transaction contains only the synchronous SQLite proxy operations and resolved promise continuations, followed by explicit flush after commit. Add a mutation-hook/timer regression that observes only the complete committed state; do not add network/timer waits inside the transaction. Also verify a rolled-back import cannot appear in a later debounced snapshot.
- [ ] Run the following focused suite, expecting PASS:

```sh
rtk proxy npx vitest run src/features/imports src/features/problems/data/problem-import-repository.test.ts src/features/tracks/data/track-import-repository.test.ts src/extension/background/import-handlers.test.ts src/extension/background/runtime-policy.test.ts src/extension/background/register-handlers.test.ts src/testing/architecture-boundaries.test.ts
```

Also run `rtk proxy npx vitest run src/platform/db/instance.test.ts`.

- [ ] Commit as `feat(imports): expose trusted import preview and durable apply`.

## Phase Completion

- [ ] Run `rtk proxy npm run db:check`, `rtk proxy npm run lint`, `rtk proxy npm run check`, and `rtk proxy npm run build`.
- [ ] Confirm no files under `src/platform/db/schema` or `src/platform/db/migrations` changed.
- [ ] Confirm no extension permissions, sync envelope schema, force-sync behavior, or backup contracts changed.
- [ ] Record exact failed/skipped commands and remaining risks; do not classify human smoke as unnecessary. End-to-end human proof follows the Settings UI in Phase 3.
- [ ] Review this phase's diff before proceeding to Phase 3.
