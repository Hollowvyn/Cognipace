# FSRS Phase D: Reliable Reviews and Guarded Correction

Status: implementation and independent final SPEC then QUALITY/Ponytail review
passed, including the final-review repairs. Root full validation passed with
3,290 tests and nine live-provider skips. [Draft PR #205](https://github.com/Hollowvyn/Cognipace/pull/205)
is created and attached to the task. Human installed-extension happy-path,
edge-case smoke and screenshot/recording proof remain pending; C's explicitly
approved post-merge exception is historical and does not authorize D's proof.

Branch: `codex/fsrs-phase-d-reliable-reviews`, after merged C (`9230a709`,
PR #198). The [approved master design](../specs/2026-10-03-fsrs-remediation-design.md)
and [Phase D plan](../plans/2026-10-06-fsrs-phase-d-reliable-reviews.md) own scope.
The owner approved continuing D and requested getting its PR in on October 6.

## Result and boundaries

Save captures complete canonical profile, pre-card and accepted original event
time. Update corrects one exact latest attempt/revision from that context,
retaining event identity/order, time/log and count. Verified legacy correction
records legacy-derived context using saved retention at first acceptance; this
is compatibility evidence, not recovery of the unknown original profile.
Ambiguous/incomplete legacy histories reject with a plain explanation; a genuine
new review establishes capture without rewriting history.

Frozen accepted command identity covers the whole Practice/track transaction.
Bounded receipts retain the original acknowledgement independently of fresh
current reads. Same-command retry skips scheduling/track effects; changed payload
conflicts. Runtime acknowledges Saved only after snapshot publication, retaining
the accepted command on transport or persistence failure. Overlay pending locks,
accessible Retry, stale draft preservation and explicit Restart remain in the
existing state owner. Authenticated senders, strict Zod parsing, permissions,
assessment locks and existing best-effort dirty/auto-sync bookkeeping remain.

Final quality review repaired sync admission: conservative existing dirty intent
is persisted before explicit publication, protecting a published receipt if the
worker stops before acknowledgement. A failed flush retains the existing dirty
recovery flag; sync recovery flushes before marking dirty/admitting a service.
Saved, invalidation and automatic push still follow successful publication.
This changes the original plan's post-flush dirty-marker order after a real
remote-replacement regression, without adding metadata fields or an outbox.

No schema/migration or legacy backup codec changes, second queue, generic outbox,
worker-local command identity or full-history receipt copies. Daily policy,
180-day cap, interval previews and optimizer remain E–H work.

## Repairs and proof

- Task 1 (`c182bc9`): seven meaningful RED failures preceded capture/correction
  work; 263 tests in eight focused suites and 62 FSRS/core tests passed. Missing
  legacy log now produces typed unsupported context; malformed native failure
  behavior remains intact. Migration check and lint passed.
- Task 2 (`3761da4`): 13 new executor/hash tests, 210 broad tests before the
  legacy retention repair and 52 after it passed. A missing-Settings legacy
  Update incorrectly used 90% instead of the saved 75%; RED/GREEN fixed it.
- Task 3 (`40d86c5`): 207 runtime/API/architecture tests and 18 backup component
  tests passed. RED/GREEN covered malformed responses, pending persistence and
  concurrency; authentication and backup admission remain enforced.
- Task 4 (`a932fa6`): 338 tests across 23 overlay/assessment/architecture suites,
  typecheck, lint and build passed. RED/GREEN fixed overlapping three writes,
  restore generation rebasing, enabled collapsed reset and stale next-step
  completion overwriting Restart. Explicit Restart/refetch behavior passed.
- Task 5: a real SQLite WASM probe showed export includes uncommitted pages.
  Three meaningful regression failures reproduced publication during stalled
  ROLLBACK/COMMIT transactions and explicit flush reporting success. The guard
  checks autocommit at actual queued serialization time. Automatic writes defer
  with the existing 250 ms timer; explicit flush rejects the open transaction.
  All 25 platform snapshot integration tests then passed.
- Stored-snapshot reopen tests prove published receipt deduplication after lost
  acknowledgement, historical correction replay after revision 2, failed
  publication retaining the durable baseline, same bootstrap retry applying once
  after unflushed state is lost, and actual target reset/full restore generation
  rejection after reopen. Three affected suites passed 38 tests.
- Populated C preservation fixture retains all original rows through upgrade and
  snapshot reopen. New review reuses `fresh-opaque`, leaves six legacy unknown
  events and adds one captured event. v6 round trip preserves Practice facts,
  time/log/profile evidence, supported user settings and owned track metadata.
  Existing legacy compatibility test now also round-trips legacy-derived
  evidence and historical correction receipts after a later revision.

Fixture/setup failures were repaired without changing production behavior:
the first transaction test accidentally nested the Settings repository's own
transaction, then used a nonexistent settings key; direct valid SQL fixed the
fixture before the meaningful RED. The new durability suite initially compared
runtime ISO time to domain Date, then looked for a card ID in the snapshot read
model; it now compares matching domain details and the stored opaque ID. The
historical preservation fixture's intentionally noncanonical alias is normalized
only in the test after initial preservation proof so current v6 preflight can
run. Restore legitimately seeds missing built-in catalog rows and only includes
supported user settings, not arbitrary settings KV keys; the assertions retain
all owned rows and compare exact Practice facts and supported settings. Finally,
changed-file lint caught two async mock functions without awaits; Promise-return
mocks repaired both, and changed-file lint passed.

October 10 final-review repairs:

- Two root `rtk npm run check` runs reproduced the same stale-target integration
  timeout (5,426 ms and 5,688 ms against 5,000 ms), with 3,287 other tests passing
  and nine skipped. Isolated Practice core passed all 39 tests. Instrumentation
  showed four 589,824-byte snapshots cost 642–783 ms per generic deep comparison;
  operations/serialization took 1.3–2.2 ms and native comparison 0.13–0.24 ms.
  Replacing only that test's equality with `Buffer.equals` retains exact whole
  database byte/length proof. The selected regression passed in 78 ms, then all
  39 core tests passed. No timeout, fixture or production behavior was weakened.
- Ponytail quality found automatic Gist replacement could erase a pending review
  while metadata still looked clean, and a published receipt remained unprotected
  if the worker stopped during invalidation before dirty bookkeeping. A real
  WASM review/actual backup restore/actual sync service RED applied changed remote
  data. Two RED regressions then proved missing pending and durable dirty intent.
  The minimal existing-marker/recovery repair passed 269 tests in five
  runtime/sync/architecture suites. Persisted metadata with a fresh sync service
  also proves a stalled post-flush invalidation cannot admit a clean remote pull.
- The new runtime fixture first failed typecheck when spreading an unknown
  response; parsing through the existing result schema fixed it. Typecheck,
  targeted lint/Prettier and diff checks then passed.

## Task 5 commands run

```sh
rtk npm run test -- src/platform/db/instance.test.ts
rtk npm run test -- src/features/practice/practice-durability.integration.test.ts
rtk npm run test -- src/features/practice/practice-durability.integration.test.ts src/features/practice/practice-command.integration.test.ts src/platform/db/instance.test.ts
rtk npm run typecheck
rtk proxy npx eslint src/platform/db/instance.ts src/platform/db/instance.test.ts src/features/practice/practice-durability.integration.test.ts src/features/practice/practice-command.integration.test.ts
rtk npm run db:check
rtk npm run test -- src/features/practice/practice-core.integration.test.ts -t 'rejects stale targets and revisions'
rtk npm run test -- src/features/practice/practice-core.integration.test.ts
rtk npx eslint src/features/practice/practice-core.integration.test.ts
rtk npx prettier --check src/features/practice/practice-core.integration.test.ts
rtk npm run test -- src/extension/background/register-handlers.test.ts -t 'protects a pending review'
rtk npm run test -- src/extension/background/register-handlers.test.ts src/features/sync/server/sync-service.test.ts src/extension/background/sync-auto-sync.test.ts src/extension/background/runtime-policy.test.ts src/testing/architecture-boundaries.test.ts
rtk npx eslint src/extension/background/register-handlers.ts src/extension/background/register-handlers.test.ts
rtk npx prettier --check src/extension/background/register-handlers.ts src/extension/background/register-handlers.test.ts
```

Final affected focused result: 38 passing tests across three suites. Typecheck,
changed-file lint and migration consistency check passed. Focused command
reruns after formatting, explicit touched Markdown formatting and diff checks
are recorded below before handoff freeze.

## Root final validation and review

Independent final SPEC passed the original Task 5 scope with 38 focused tests.
Repair SPEC passed three selected sync/core regressions. Final QUALITY/Ponytail
passed after the sync repair, with no remaining actionable quality or simplicity
finding at the current extension load. The existing non-atomic metadata limit is
recorded below. No human browser or visual proof is inferred from these reviews.

Root `rtk npm run check` passed: 222 suites, 3,290 tests; two live-provider suites
and nine tests skipped without configured evaluation credentials. Database check,
typecheck and lint passed within that command, and standalone database/lint
checks passed. The final Chrome MV3 build passed (4.87 MB; existing large-chunk
warning), repository format and explicit touched-Markdown Prettier checks passed,
and `rtk git diff --check` passed. Fresh `origin/main` remained the C baseline;
no integration conflict was present.

```sh
rtk npm run db:check
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy npx prettier --ignore-path /dev/null --check docs/product.md docs/architecture.md docs/testing.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-06-fsrs-phase-d-reliable-reviews.md docs/superpowers/README.md docs/superpowers/handoffs/2026-10-06-fsrs-phase-d-reliable-reviews.md
rtk git diff --check
```

Independent repair SPEC command:

```sh
rtk npm run test -- src/extension/background/register-handlers.test.ts src/features/practice/practice-core.integration.test.ts -t 'protects a pending review|persists review dirty intent|rejects stale targets and revisions'
```

Skipped commands: `rtk npm run db:generate` (no schema changes),
`rtk npm run zip` (archive behavior unchanged). Live AI provider evaluation and
performance/optimizer experiments have no matching D command: provider behavior
and credentials are outside this change; optimizer/performance work belongs to
G/H. Human browser smoke is pending rather than marked N/A.

## Human checklist, release and rollback

Follow [Reliable Review Commands](../../testing.md#reliable-review-commands-phase-d)
with a disposable installed extension and a pre-D full backup. Attach redacted
screenshots or a recording for durable Submit; repeated reselect/Update with
unchanged count/event/solve time; Restart creating a genuine new review; two-tab
stale conflict preserving the draft; snapshot fault pending then same-command
Retry; worker restart after lost acknowledgement; actual target reset/full
restore rejecting old pending generations; assessment locks; and v6 preserved
captured/legacy-derived evidence. The existing `cpBackupSmoke` shim is test-only:
install in the service-worker console, set `state.failSnapshots = true`, perform
the review, clear faults then Retry; clean up after each run. Do not inspect or
publish private history in diagnostics.

For configured Gist sync, also exercise the changed-remote pending-publication
and delayed-acknowledgement restart checks in step 8. They verify the existing
automatic overwrite guard rather than authorizing a remote overwrite.

Release signal: `feat` for user-visible reliable review acceptance and safe
correction. Rollback restores C-compatible code with C's existing additive
tables/v6 format intact; no data reset or migration reversal is needed. Captured
history remains retained, but C code cannot safely Update protected captured
history. Retain a pre-D backup and reapply D to restore correction capability.
Durability still depends on Chrome local storage succeeding. Receipt identity
and generation scopes are local; imported historical keys are inert after
replacement. A crash before publication may lose an unacknowledged in-memory
attempt ID, but retry against the intact baseline creates one final event.

Existing sync metadata remains best effort and is not atomic with the SQLite
snapshot: if the dirty-marker write itself fails but snapshot publication
succeeds, worker restart can lose the in-memory recovery flag while metadata
still looks clean. This phase does not claim to close that prior architecture
limit. The repaired normal marker-success path protects publication and pending
sync admission without adding a new persisted protocol.
