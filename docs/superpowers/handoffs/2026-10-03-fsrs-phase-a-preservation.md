# FSRS Phase A preservation handoff

## Details

The shipped through-0009 database is now a supported source for a future
upgrade. Its exact ten-file SQL prefix remains pinned to `1144ce07`. Changed,
reordered, missing and unknown prefixes reject rather than silently creating a
replacement database.

The source has an independent private recovery slot,
`cognipace_db_recovery_fsrs_v1`. Topics and Tracks originals survive alongside
it. Identical retries retain the first recovery timestamp; a different original
or malformed occupied slot stops without overwriting the earlier record.
Background preparation preserves current catalog rows rather than repeating
the historical taxonomy conversion. Fresh and older supported sources keep
their existing conversion behavior.

The populated SQLite WASM fixture covers all 16 protected tables: four cards,
six attempts, corrected timestamps, tied reviews, opaque card IDs, New zeros,
suspension, custom catalog relationships, track completion, an active session,
75% retention and independent settings. Tests compare every original column
through staged upgrade, flush and reopen. Recovery, preparation, target-schema,
publication and collision failures retain the active original and earlier
copies; supported retries succeed without replacing the first recovery record.

This implements slice A, the preservation prerequisite from audit priority 8.
The other seven priorities and the remaining scaling work in 8 are still future
slices in the [execution map](../plans/2026-10-03-fsrs-remediation.md).
There is no new migration, card replay, history reset, due-date rewrite, daily
profile activation, backup-format change, sync expansion or permission change.
Opaque IDs survive loading; the subsequent Save/Update identity repair remains
in C/D. The synthetic appended table is test-only and does not establish proof
for the later real metadata migration.

Execution used Node 24.20.0 and npm 11.19.0. The planning commits were rebased
onto `origin/main` at `b2d9291f`; the shipped SQL prefix was unchanged. Work
remains on `codex/fsrs-remediation-design` in the existing managed worktree.
Core implementation commits are `a9faf4a`, `1bc5973`, `2253684` and `6180cfc`;
the final test typing repair is `ee2c24a`.
Each task received separate specification and quality review; all five passed.
Task 3 review added the missing pre-publication fingerprint assertion, and Task
5 review tightened the recovery-export and raw-due comparison wording. Required
full-check results are below. Independent whole-phase review approved the
assembled Phase A with no blocking correctness, preservation, integration or
ownership findings. It freshly reran all 77 focused tests and
`rtk proxy git diff --check b2d9291f..HEAD`, both passing. The review's stale
spec-index status was corrected to Phase A implemented with B–H and human proof
still pending.

## Issue

No issue: directly requested audit remediation with an approved design and
phase-sized implementation plan.

## Testing

Required automated checks passed, including all 2,166 tests across 196 suites.
Human installed-extension proof remains pending before PR review or merge.

Commands run during setup and test-first implementation:

- `rtk npm ci`: passed with the pinned toolchain. Existing dependency/install
  warnings did not change the lockfile.
- `rtk npm run test -- src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/instance.test.ts src/extension/background/app-db.test.ts`:
  the first run could not load generated `.wxt/tsconfig.json`, so no tests ran.
  After setup, all 63 baseline tests passed.
- `rtk npm run prepare:wxt`: passed and generated the required WXT types.
- `rtk npm run test -- src/platform/db/snapshot-upgrade.test.ts -t 'shipped FSRS snapshot baseline'`:
  reproduced two expected unsupported-fingerprint failures before registration.
- `rtk npm run test -- src/platform/db/snapshot-upgrade.test.ts`: 10 passed
  after registration.
- `rtk npm run test -- src/platform/db/snapshot-state.test.ts -t 'FSRS baseline recovery'`:
  reproduced four expected failures before key support.
- `rtk npm run test -- src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts`:
  40 passed after key support; an independent specification review also reran
  these suites successfully.
- `rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts`:
  reproduced five failures and one pass before recovery routing. Fixture setup
  succeeded; startup stopped at the occupied Topics slot. After routing and
  the added active-fingerprint assertion, all six then-existing cases passed.
- `rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/instance.test.ts`:
  73 passed; an independent specification review reran this command.
- `rtk npm run test -- src/extension/background/app-db.test.ts`: reproduced
  the new through-0009 reconciliation failure, with both existing cases passing.
- `rtk npm run test -- src/extension/background/app-db.test.ts src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/instance.test.ts`:
  27 passed after the preparation guard.
- `rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/instance.test.ts src/extension/background/app-db.test.ts`:
  all 77 focused tests passed across six suites.
- `rtk npx eslint src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts`:
  reproduced five test-only lint errors, then passed after the minimal repair.
  Three matcher results are typed as `unknown`; two unnecessary tuple
  non-null assertions were removed. Assertions and lint rules remain intact.
- `rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts`:
  all 17 tests passed after that typing repair.

Required full validation:

- `rtk npm run db:check`: passed.
- `rtk npm run lint`: first failed on the five test-only errors above; the
  rerun passed after repair.
- `rtk npm run check`: first passed database and TypeScript checks, then
  stopped at those same lint errors before running the tests. The rerun passed
  database, TypeScript and lint checks and all 2,166 tests across 196 suites.
  Existing JSDOM `scrollTo` warnings were non-fatal.
- `rtk npm run build`: passed, producing `dist/chrome-mv3`. The existing
  warning about chunks larger than 500 kB remains non-fatal.
- `rtk git diff --check`: passed at each task boundary and after the final
  source/documentation edits. `rtk git diff --cached --check` also runs before
  each commit.

Formatting commands:

```sh
rtk npx prettier --write src/testing/fixtures/fsrs-remediation-legacy-migrations.ts src/testing/fixtures/fsrs-preservation.ts src/platform/db/snapshot-upgrade.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.ts src/platform/db/snapshot-state.test.ts src/platform/db/instance.ts src/platform/db/fsrs-preservation.integration.test.ts src/extension/background/app-db.ts src/extension/background/app-db.test.ts
rtk npx prettier --write docs/architecture.md docs/testing.md
rtk npx prettier --check docs/architecture.md docs/testing.md
rtk npx prettier --write src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts
rtk npx prettier --ignore-path /dev/null --write docs/architecture.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-03-fsrs-remediation-design.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-03-fsrs-phase-a-preserving-baseline.md docs/superpowers/handoffs/2026-10-03-fsrs-phase-a-preservation.md
rtk npx prettier --ignore-path /dev/null --check src/testing/fixtures/fsrs-remediation-legacy-migrations.ts src/testing/fixtures/fsrs-preservation.ts src/platform/db/snapshot-upgrade.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.ts src/platform/db/snapshot-state.test.ts src/platform/db/instance.ts src/platform/db/fsrs-preservation.integration.test.ts src/extension/background/app-db.ts src/extension/background/app-db.test.ts docs/architecture.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-03-fsrs-remediation-design.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-03-fsrs-phase-a-preserving-baseline.md docs/superpowers/handoffs/2026-10-03-fsrs-phase-a-preservation.md
```

All listed formatting commands passed. The final explicit check also includes
normally ignored planning artifacts and this handoff.

Skipped commands and remaining proof:

- `rtk npm run db:generate`: no schema change or production migration.
- `rtk npm run zip`: packaging/archive behavior is unchanged; the production
  extension build passed.
- Human installed-extension smoke and screenshots/recording: pending. This is
  required by [agent governance](../../agent-governance.md#6-validate-with-proof)
  and the [workflow skill](../../../.agents/skills/cognipace-agent-workflow/SKILL.md):
  “the human engineer must run happy-path and edge-case realtime smoke tests
  with screenshot or screen recording proof before PR review or merge.”
- Later actual metadata-migration preservation, packaged scaling measurements
  and optimizer feasibility: future slices, outside Phase A.

## Screenshots

Human proof is pending. Use the
[Local Database Recovery flow](../../testing.md#local-database-recovery) in a
disposable profile loaded from `dist/chrome-mv3`:

- Compare history, raw due dates, suspension, Daily Goal/streaks, track credit,
  active session and non-default Settings before/after reload.
- Save an ordinary review and verify persistence after extension reload.
- Exercise affected older supported upgrade/recovery paths and unsupported or
  corrupt-data failure, preserving original bytes.
- Attach happy-path and edge-case screenshots or a recording with private
  recovery contents redacted. Keep recovery exports local and private.

This phase ships no new schema to trigger an installed through-0009 upgrade.
The later real migration needs its own populated original-column comparison
and human upgrade/failure/retry proof. Agent tests do not replace that proof.

## Risk, release and recovery

Risk areas: Platform snapshot compatibility and background preparation.
The third recovery copy consumes local storage quota only when this source is
actually upgraded; earlier copies remain retained. No new permission or
capacity guarantee is introduced. An occupied incompatible slot or a storage
failure stops the upgrade while retaining the active original.

Release impact: patch-level compatibility groundwork. Reverting this phase
needs no data migration because it adds no schema. A future database produced
by a real appended migration cannot be opened by an older build; automatic
downgrade remains unsupported. Export any recovery originals privately before
changing or removing their keys.

Future Practice evidence/generation initialization must run for this source.
When C extends `beforePublish`, narrow the current return to skip taxonomy
alone, rather than bypassing the new initialization.
