# FSRS Phase A: Preserving The Shipped Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register today's shipped snapshot as a supported future-upgrade source and prove its history, progress and settings survive staged upgrade, failure and reopen.

**Architecture:** Extend Platform's existing baseline allowlist and recovery routing, preserving the current staged snapshot lifecycle. Test a synthetic additive suffix through the real singleton without shipping a schema migration. Background composition skips historical taxonomy reconciliation for the already-current through-0009 source while retaining fresh and older upgrade behavior.

**Tech Stack:** TypeScript, SQLite WASM, Vitest, Zod's existing recovery parser, WXT; no new dependency.

**Execution status:** Implemented with required automated checks passing. Human installed-extension proof remains pending before PR review or merge. Exact commands, repaired failures, review evidence and future migration limits are in the [handoff](../handoffs/2026-10-03-fsrs-phase-a-preservation.md). Execution rebased onto `origin/main` at `b2d9291f`; the frozen SQL prefix was unchanged.

**Archival references:** Source, test and authority-document links below are pinned to the executed pre-cleanup commit `4c3b429ef003d91060cc3db5a0cb6277432fba08`. They retain this plan's implementation evidence; current authority docs still govern current behavior. Task history, constraints, acceptance criteria and validation commands remain recorded here.

---

## Scope and prerequisites

Source: [approved design](../specs/2026-10-03-fsrs-remediation-design.md). Execution map: [all eight findings](./2026-10-03-fsrs-remediation.md). This is slice A, covering the preservation prerequisite from priority 8. Priorities 1–7 and the remaining parts of 8 have their own acceptance boundaries; this phase does not implement them.

The exact current baseline is ten lexically ordered SQL files through **`0009_mushy_beyonder.sql`**, joined with `\n`: fingerprint **`1144ce07`**, 26,882 characters at `dc0fc6f2`. The synthetic `0009_external_progress.sql` used in an older test is not the shipped filename. Preserve `b1c2b4d7` through 0007 and `a35941fc` through 0008.

Do not add 0010, change shipped SQL, change scheduling defaults, replay cards, deduplicate reviews, rewrite due dates or reconcile track credit. Matching current snapshots still skip preparation/publication. The new recovery slot becomes active only when the through-0009 fingerprint is an upgrade source.

Use the repository-pinned Node 24.20.0/npm 11.19.0. Check the existing task branch before execution. Install local dependencies using that toolchain with `rtk npm ci`; repository dependencies are absent at planning time. Do not bypass `devEngines` or rely on another worktree's WASM installation. Load `cognipace-agent-workflow`, `vitest`, the migration skill and `verification-before-completion`; use Context7 when implementation requires current library API details. The pinned references below record the executed implementation.

## File map

| File                                                                        | Change and responsibility                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Create `src/testing/fixtures/fsrs-remediation-legacy-migrations.ts`         | Pin the current shipped SQL prefix independently of the future migration list.                          |
| Modify `src/platform/db/snapshot-upgrade.ts`                                | Recognize the exact through-0009 source, validate its prefix and select only appended SQL.              |
| Modify `src/platform/db/snapshot-state.ts`                                  | Add a third private recovery slot with the existing same-original retry/collision semantics.            |
| Modify `src/platform/db/instance.ts`                                        | Route that source to the FSRS recovery slot without changing staged publication order.                  |
| Create `src/testing/fixtures/fsrs-preservation.ts`                          | Build a nonempty owned row graph and compare every original column, including catalog relationships.    |
| Create `src/platform/db/fsrs-preservation.integration.test.ts`              | Use a test-only synthetic suffix to prove actual singleton upgrade, failure, flush and reopen behavior. |
| Modify `src/platform/db/snapshot-upgrade.test.ts`, `snapshot-state.test.ts` | Freeze compatibility boundaries and exercise independent recovery records.                              |
| Modify `src/extension/background/app-db.ts`, `app-db.test.ts`               | Avoid rerunning historical catalog conversion for the already-current source.                           |
| Modify `docs/architecture.md`, `docs/testing.md` during execution           | Document the implemented allowlist, private recovery export and human proof requirements.               |

Keep `src/platform/db/open-snapshot.ts`, shipped migrations, schema declarations and backup format unchanged. Existing `openSnapshot()` already preserves/restores/validates/upgrades/prepares/revalidates/publishes in the required order.

## Task 1: Freeze and recognize the through-0009 source

**Files:** create the migration fixture; modify `snapshot-upgrade.ts` and `snapshot-upgrade.test.ts`.

- [x] **Step 1: Create the frozen fixture and failing source-selection tests.**

Create `src/testing/fixtures/fsrs-remediation-legacy-migrations.ts` using the pinned fixture reference:

[Frozen through-0009 fixture](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/testing/fixtures/fsrs-remediation-legacy-migrations.ts#L5).

Add `selectSnapshotBaselineSql` to the existing `snapshot-upgrade` import in `src/platform/db/snapshot-upgrade.test.ts`. Use the pinned fixture-import reference:

[Frozen-fixture test imports](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/snapshot-upgrade.test.ts#L23).

Append the source-selection regressions in the pinned test reference. It uses the existing imports `migrationEntries`, `computeFingerprint` and `selectUpgradeSql`:

[Shipped FSRS snapshot baseline regressions](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/snapshot-upgrade.test.ts#L205).

- [x] **Step 2: Run the focused red test.**

Run: `rtk npm run test -- src/platform/db/snapshot-upgrade.test.ts -t 'shipped FSRS snapshot baseline'`.

Expected: the new source is rejected as unsupported. If the failure is dependency/toolchain setup, repair setup first; that is not the intended regression failure.

- [x] **Step 3: Register the immutable baseline.**

In `src/platform/db/snapshot-upgrade.ts`, insert after `legacyTrackMigrationPaths`:

[Immutable through-0009 migration paths](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/snapshot-upgrade.ts#L22).

Insert after `legacyTrackMigrationSql`:

[Frozen through-0009 SQL](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/snapshot-upgrade.ts#L45).

Insert beside the two existing literal fingerprints:

[Literal through-0009 fingerprint](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/snapshot-upgrade.ts#L50).

Add the through-0009 object to `supportedBaselines`, after the existing objects, as recorded in the pinned source reference:

[Supported through-0009 baseline record](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/snapshot-upgrade.ts#L63).

Reuse existing `getSupportedBaseline()` prefix-path/fingerprint validation. Do not widen it to arbitrary fingerprints or infer source SQL from the current schema.

- [x] **Step 4: Run all source-selection and schema-integrity tests.**

Run: `rtk npm run test -- src/platform/db/snapshot-upgrade.test.ts`.

Expected: new and old baseline tests pass, including corruption and invalid selected-suffix cases.

- [x] **Step 5: Commit the compatibility boundary.**

```sh
rtk git add src/testing/fixtures/fsrs-remediation-legacy-migrations.ts src/platform/db/snapshot-upgrade.ts src/platform/db/snapshot-upgrade.test.ts
rtk git commit -m "fix(db): support the shipped FSRS snapshot baseline"
```

## Task 2: Retain the FSRS original independently

**Files:** modify `snapshot-state.ts` and `snapshot-state.test.ts`.

- [x] **Step 1: Add failing recovery-slot tests.**

Add `FSRS_RECOVERY_KEY` to the `snapshot-state` import in `src/platform/db/snapshot-state.test.ts`. Append the recovery regressions in the pinned test reference:

[Independent FSRS recovery regressions](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/snapshot-state.test.ts#L235).

- [x] **Step 2: Run the focused red test.**

Run: `rtk npm run test -- src/platform/db/snapshot-state.test.ts -t 'FSRS baseline recovery'`.

Expected: missing recovery-key export/type support fails the new cases.

- [x] **Step 3: Add the key and extend the existing recovery argument.**

Insert after `TRACK_RECOVERY_KEY` in `src/platform/db/snapshot-state.ts`:

[FSRS recovery key and supported key type](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/snapshot-state.ts#L56).

Replace only the fourth parameter declaration of `preserveRecovery()` using the pinned parameter reference:

[Typed recovery-key parameter](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/snapshot-state.ts#L95).

Keep the existing strict parser, same-original comparison, original timestamp and collision error. No replacement/removal of earlier recovery slots is permitted.

- [x] **Step 4: Verify all classification and recovery behavior.**

Run: `rtk npm run test -- src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts`.

Expected: all tests pass; partial fields, read/write failure and old recovery behavior remain covered.

- [x] **Step 5: Commit the independent recovery slot.**

```sh
rtk git add src/platform/db/snapshot-state.ts src/platform/db/snapshot-state.test.ts
rtk git commit -m "fix(db): retain an independent FSRS recovery original"
```

## Task 3: Prove populated singleton upgrade and reopen

**Files:** create `fsrs-preservation.ts` and `fsrs-preservation.integration.test.ts`; modify `instance.ts`.

- [x] **Step 1: Create the populated fixture.**

Create `src/testing/fixtures/fsrs-preservation.ts` using the pinned implementation below. Rows are preservation evidence, not an assertion that unknown legacy histories reproduce these cards under a particular profile.

[Populated preservation fixture](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/testing/fixtures/fsrs-preservation.ts#L70).

- [x] **Step 2: Create the failing real startup test.**

Create `src/platform/db/fsrs-preservation.integration.test.ts` using the pinned suite reference:

[Populated singleton preservation suite](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/fsrs-preservation.integration.test.ts#L130).

This synthetic target is scoped to this test module. Existing `snapshot-upgrade.test.ts`, `open-snapshot.test.ts` and `instance.test.ts` still prove unknown fingerprints, source schema/integrity failure, matching-current opens and older upgrades. The later real schema phase must reuse this fixture against its actual migration and project original columns explicitly when adding columns.

- [x] **Step 3: Run the focused red test.**

Run: `rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts`.

Expected: source selection now succeeds, but the independent FSRS recovery expectation fails because `instance.ts` still routes this source to the Topics slot. That slot is occupied by a different original, so startup rejects rather than overwriting it.

- [x] **Step 4: Route the exact source to its recovery slot.**

Add `legacyFsrsMigrationFingerprint` to the existing `snapshot-upgrade` import and `FSRS_RECOVERY_KEY` to the existing `snapshot-state` import in `src/platform/db/instance.ts`. Replace the complete `preserve` callback in `openAppDb()` using the pinned routing reference:

[Baseline-specific recovery routing](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/instance.ts#L82).

Keep existing restore/validate/upgrade/prepare/publish ordering, error cleanup, active-handle activation and serialized snapshot writes unchanged.

- [x] **Step 5: Verify the populated lifecycle and existing regressions.**

```sh
rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/instance.test.ts
```

Expected: all pass; failed publication retains the old active pair, retry succeeds with the original recovery timestamp, and populated reopen retains every pre-existing value. No production migration is added.

- [x] **Step 6: Commit the preservation proof and routing.**

```sh
rtk git add src/testing/fixtures/fsrs-preservation.ts src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/instance.ts
rtk git commit -m "fix(db): preserve populated FSRS state across staged upgrades"
```

## Task 4: Preserve the background preparation boundary

**Files:** modify `src/extension/background/app-db.ts`, `app-db.test.ts` and the new integration test.

- [x] **Step 1: Add a failing bridge test.**

In `src/extension/background/app-db.test.ts`, import `legacyFsrsMigrationFingerprint` from `@/platform/db/snapshot-upgrade`. Append the test in the pinned bridge reference inside the existing describe block, reusing `handle` and `appDbMocks`:

[Through-0009 background bridge regression](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/extension/background/app-db.test.ts#L97).

- [x] **Step 2: Run the red bridge test.**

Run: `rtk npm run test -- src/extension/background/app-db.test.ts`.

Expected: the new test fails because all upgrades currently run taxonomy reconciliation; existing fresh/older/failure tests pass.

- [x] **Step 3: Guard only the already-current baseline.**

Add the import in the pinned source reference to `src/extension/background/app-db.ts`:

[Background baseline import](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/extension/background/app-db.ts#L2).

Insert at the start of `beforePublish`, before `reconcileTopicTaxonomy()`:

[Through-0009 taxonomy preparation guard](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/extension/background/app-db.ts#L13).

Keep the existing fresh/older catalog mapping and failure propagation. Do not broadly skip preparation for every upgrade.

- [x] **Step 4: Add the real background preservation case.**

Add `getBackgroundDb` imported from `@/extension/background/app-db` to `src/platform/db/fsrs-preservation.integration.test.ts`; this is the existing Platform integration-test convention also used by `instance.test.ts`. Append the case in the pinned preservation reference inside its describe block:

[Production background preservation case](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/src/platform/db/fsrs-preservation.integration.test.ts#L131).

- [x] **Step 5: Run the bridge and populated tests.**

Run: `rtk npm run test -- src/extension/background/app-db.test.ts src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/instance.test.ts`.

Expected: all pass, including fresh taxonomy setup, older supported conversion and the exact no-reconciliation source.

- [x] **Step 6: Commit the composition guard.**

```sh
rtk git add src/extension/background/app-db.ts src/extension/background/app-db.test.ts src/platform/db/fsrs-preservation.integration.test.ts
rtk git commit -m "fix(db): preserve current catalog rows during FSRS upgrades"
```

## Task 5: Document compatibility and finish verification

**Files:** modify `docs/architecture.md` and `docs/testing.md`; record validation and human smoke evidence in the implementation handoff.

- [x] **Step 1: Update the current architecture documentation.**

In `docs/architecture.md`'s Database And Persistence section, update the exact baseline sentence using the pinned compatibility reference:

[Implemented snapshot compatibility boundary](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/docs/architecture.md#L577).

Update the recovery-slot paragraph using the pinned recovery reference:

[Implemented independent recovery slots](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/docs/architecture.md#L589).

Retain the adjacent private-export, failure and no-silent-reseed guidance. In the later Problem Topic Graph compatibility paragraph, update the allowlisted-prefix sentence using the pinned catalog-upgrade reference:

[Implemented catalog-upgrade boundary](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/docs/architecture.md#L662).

Keep the existing backup-v5, external-progress and older recovery behavior paragraphs accurate. Add the preservation limits after the Migration 0009 paragraph, as recorded in the pinned reference:

[Implemented through-0009 preservation limits](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/docs/architecture.md#L682).

- [x] **Step 2: Update recovery testing and prepare human proof.**

In `docs/testing.md`'s Local Database Recovery section, update the allowlist sentence using the pinned recovery reference:

[Implemented recovery allowlist](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/docs/testing.md#L66).

Change "four database recovery keys" to "five database snapshot/recovery keys" and add `'cognipace_db_recovery_fsrs_v1',` after the Track recovery key in the existing scoped export expression. Do not export all storage. After that recovery section's introduction, add the preservation evidence and human-proof requirements in the pinned reference:

[Preservation evidence and required human proof](https://github.com/Hollowvyn/Cognipace/blob/4c3b429ef003d91060cc3db5a0cb6277432fba08/docs/testing.md#L103).

- [x] **Step 3: Format touched files and run the focused suite.**

```sh
rtk npx prettier --write src/testing/fixtures/fsrs-remediation-legacy-migrations.ts src/testing/fixtures/fsrs-preservation.ts src/platform/db/snapshot-upgrade.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.ts src/platform/db/snapshot-state.test.ts src/platform/db/instance.ts src/platform/db/fsrs-preservation.integration.test.ts src/extension/background/app-db.ts src/extension/background/app-db.test.ts docs/architecture.md docs/testing.md
rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/instance.test.ts src/extension/background/app-db.test.ts
```

Expected: formatting completes and every listed suite passes. Repair concrete failures before the full checks. Later code/API adjustments belong in their own phase plan; retain these pinned references as the executed historical baseline.

- [x] **Step 4: Run the governance-required checks.**

```sh
rtk npm run db:check
rtk npm run lint
rtk npm run check
rtk npm run build
rtk git diff --check
```

Expected: all exit successfully. `db:generate` is skipped because no schema changes; `zip` is skipped because packaging/artifact behavior is unchanged. A test failure must not be reported as a passing check. Full checks can expose unrelated failures; record exact failures and resolve only within authorized scope.

- [x] **Step 5: Commit documentation and prepare the review handoff.**

```sh
rtk git add docs/architecture.md docs/testing.md
rtk git commit -m "docs(db): record FSRS baseline preservation and recovery proof"
```

Report the exact focused/full commands run, any skipped command with reason, synthetic-versus-real migration limits, no reset/no scheduling change, private recovery quota cost, and human happy/edge smoke proof or its outstanding status. Use the existing PR template. Do not declare merge readiness while human proof is missing.

## Done when

- The ten-file source is pinned to `1144ce07`; changed/reordered/missing prefixes and unknown sources reject.
- A third recovery record never overwrites the earlier records or a different original of its own.
- The populated fixture is nonempty in every protected table; all original columns, six attempts, four cards, raw due/memory/counters, suspension, completion/session/settings and derived daily/streak progress survive synthetic upgrade and reopen.
- Preservation/preparation/target-validation/publication failures retain the active pair; supported retries preserve the first recovery record and succeed.
- Background preparation retains through-0009 catalog values; fresh/older behavior stays covered.
- Focused and required checks pass; human installed-extension proof is attached before review/merge, or the handoff explicitly remains pending it.
- No new migration, card replay, daily-profile activation, backup-version change or permission change is included.

## Planning validation status

The original planning pass ran Markdown formatting and whitespace checks only. Implementation is now executed and required automated checks pass; the handoff records both earlier failures and final results. Test helper factoring preserves the planned signatures and coverage. Specification review added the active-fingerprint assertion beside the pre-publication snapshot assertion, and full lint removed the unnecessary tuple non-null assertions in the executed tests. The implementation types three `expect.any(String)` results as `unknown` without changing the recovery assertions. `rtk npm run db:generate` remains intentionally inapplicable to this phase; the actual metadata-storage slice must generate/check its appended migration and rerun preservation proof. Human installed-extension proof is still pending before PR review or merge.
