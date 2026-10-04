# FSRS Phase B: Scheduling Evidence and Correction

Status: all five implementation tasks passed independent specification and
quality reviews. Whole-phase review found and verified a repaired sparse-history
guard bypass. Automated checks, formatting and the extension build passed. Human installed-extension
smoke and visual proof are pending.

Branch: `codex/fsrs-phase-b-scheduling-evidence`, rebased on `bbb3b5d8`
(`feat(assessment): add structured LeetCode submission analysis (#194)`). The
approved [design](../specs/2026-10-03-fsrs-remediation-design.md) and
[phase plan](../plans/2026-10-04-fsrs-phase-b-scheduling-evidence.md) own scope.

## Implemented boundary

- Complete, immutable profiles record all seven effective parameters and the
  supported ts-fsrs 5.4.0 / FSRS-6.0 versions. Imports must reconstruct exactly;
  native normalization cannot silently substitute a different model.
- Detached card/log codecs keep canonical ISO evidence and fresh decoded Dates.
  New cards with zero counters and null last review remain valid.
- Captured correction schedules once from the original pre-card, event time and
  profile. Repeated corrections replace that event without increasing its
  application count. Later settings and mutations of returned Dates cannot
  alter recorded context.
- Legacy correction validates a complete ordered log chain and the latest saved
  memory/counters/state before native rollback. Earlier logs and tied/reordered
  histories reject. The correction uses a known compatibility recipe while
  reporting `legacy-derived` evidence and `originalProfile: null`.

Existing scheduling and replay still construct the native scheduler directly
from their options. Separately normalized profiles deliberately use a distinct
construction path: passing existing callers through `generatorParameters()`
would change their omitted default weights with multiple relearning steps.

Practice Save/Update continues to use its existing path. C owns evidence storage
and backup preflight; D owns guarded commands and durable acknowledgements; E
owns prospective daily scheduling. This phase introduces no schema, backup
version, cadence, queue, assessment-lock, sync, permission or optimizer change.

## Compatibility limits

Native chronological history satisfies the strengthened nonnegative integer
and `lapses <= reps` checks. An independent probe exercised 21,840 transitions
at 75%/90% retention in short-term and long-term modes without a violation.

Malformed backups accepted by today's independent row schema can still contain
`lapses > reps`. The stricter FSRS validator rejects such cards, and current
Analytics reads can fail on them. Complete validation before destructive restore
belongs to C; B does not claim malformed imported data is compatible. Existing
malformed logs are treated as missing evidence by current consumer catch paths.

## Validation record

The fresh baseline after rebasing passed 75 tests across eight suites:

```sh
rtk npm run test -- src/lib/fsrs src/testing/architecture-boundaries.test.ts src/features/practice/practice-core.integration.test.ts
```

| Task                         | Test-first result                                 | Green result        | Review                                                              |
| ---------------------------- | ------------------------------------------------- | ------------------- | ------------------------------------------------------------------- |
| 1: profiles/options          | 33 expected failures, 35 passes                   | 68 tests / 4 suites | SPEC and QUALITY passed; custom-weight projection test strengthened |
| 2: card/log codecs           | 21 expected failures, 28 passes                   | 49 tests / 4 suites | SPEC and QUALITY passed                                             |
| 3: captured correction       | Expected missing new module, zero tests collected | 34 tests / 2 suites | SPEC and QUALITY passed                                             |
| 4: guarded legacy correction | 8 expected failures, 13 passes                    | 54 tests / 3 suites | SPEC and QUALITY passed                                             |
| 5: public facade             | 1 expected failure, 17 passes                     | 18 tests / 2 suites | SPEC and QUALITY passed                                             |

Exact task commands:

```sh
rtk npm run test -- src/lib/fsrs/domain/scheduling-options.test.ts src/lib/fsrs/domain/scheduler-profile.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/index.test.ts
rtk npm run test -- src/lib/fsrs/domain/scheduler-profile.test.ts
rtk npm run test -- src/lib/fsrs/domain/card-snapshot.test.ts src/lib/fsrs/domain/review-log-snapshot.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/index.test.ts
rtk npm run test -- src/lib/fsrs/domain/card-snapshot.test.ts src/lib/fsrs/domain/review-log-snapshot.test.ts src/lib/fsrs/domain/scheduler-profile.test.ts src/lib/fsrs/index.test.ts
rtk npm run test -- src/lib/fsrs/scheduler/review-scheduler.test.ts src/features/practice/practice-core.integration.test.ts src/testing/architecture-boundaries.test.ts
rtk npm run test -- src/lib/fsrs/scheduler/review-correction.test.ts
rtk npm run test -- src/lib/fsrs/scheduler/review-correction.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts
rtk npm run test -- src/lib/fsrs/scheduler/review-correction.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/domain/review-log-snapshot.test.ts
rtk proxy npx prettier --write src/lib/fsrs/adapter/ts-fsrs-adapter.ts src/lib/fsrs/scheduler/review-correction.ts src/lib/fsrs/scheduler/review-correction.test.ts
rtk proxy npx prettier --check src/lib/fsrs/adapter/ts-fsrs-adapter.ts src/lib/fsrs/scheduler/review-correction.ts src/lib/fsrs/scheduler/review-correction.test.ts
rtk proxy npx eslint src/lib/fsrs/adapter/ts-fsrs-adapter.ts src/lib/fsrs/scheduler/review-correction.ts src/lib/fsrs/scheduler/review-correction.test.ts
rtk proxy zsh -c 'source /Users/tobiolutimehin/.nvm/nvm.sh && nvm use 24.20.0 && rtk npm run test -- src/lib/fsrs/scheduler/review-correction.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/domain/scheduler-profile.test.ts --maxWorkers=1'
rtk npm run test -- src/lib/fsrs/index.test.ts src/testing/architecture-boundaries.test.ts
rtk npx prettier --ignore-path /dev/null --write src/lib/fsrs/index.ts src/lib/fsrs/index.test.ts docs/architecture.md
rtk npx prettier --ignore-path /dev/null --check src/lib/fsrs/index.ts src/lib/fsrs/index.test.ts docs/architecture.md
rtk npx eslint src/lib/fsrs/index.ts src/lib/fsrs/index.test.ts
rtk npm run typecheck
rtk git diff --check
rtk git diff --cached --check
```

The projection test rerun passed 30 tests. Independent codec review passed 58
tests across four suites and existing-consumer review passed 60 across three.
Independent legacy quality review passed 72 tests across three suites.
Task-local Prettier and ESLint checks passed. Final full commands are recorded
below after the review repairs.

The assembled facade and existing-consumer regressions passed 270 tests across
15 suites:

```sh
rtk npm run test -- src/lib/fsrs src/testing/architecture-boundaries.test.ts src/features/practice/practice-core.integration.test.ts src/features/analytics/domain/review-cohorts.test.ts src/features/analytics/domain/chart-data.test.ts src/features/backup/api/backup-contracts.test.ts src/features/backup/server/backup-service.test.ts src/platform/db/fsrs-preservation.integration.test.ts
```

### Whole-phase review repairs

The correctness reviewer reproduced a P2 completeness bypass: `history.map`
skipped sparse holes, so a three-review zero-lapse card accepted an array with
only its latest entry. Two added regressions failed as expected (2 failed/21
passed). `Array.from` plus an explicit missing-entry guard now checks every
position before native rollback; both sparse fixtures reject without mutation.
The focused correction/scheduler/log selection passed 56 tests across three
suites. Independent post-repair facade/architecture review passed 136 across
nine suites, with no unresolved correctness findings:

```sh
rtk npm run test -- src/lib/fsrs
rtk npm run test -- src/lib/fsrs src/testing/architecture-boundaries.test.ts
rtk npx prettier --write src/lib/fsrs
rtk npx eslint src/lib/fsrs
```

The independent facade run during RED likewise caught both regressions (118
passed/2 failed). The first focused ESLint run after the root repair failed one
`no-unsafe-assignment` in the test fixture's untyped `new Array`; adding its
generic type fixed it, and the same command passed. Repair commits: `1b450ec`
and `40cad16`.

Two additional `rtk proxy node --input-type=module` stdin probes reproduced the
bypass and passed four effective-profile round trips plus 256 replacement parity
cases. Vite's probe server logged a sandbox WebSocket `EPERM`; module execution
completed successfully. These supplemental probes do not replace committed
tests or packaged-runtime validation.

Ponytail review prompted reuse of the existing canonical ISO validator (`120c2b0e`) and
condensed the executed plan by over 1,100 lines of copied implementation/tests.
The original instructions remain in planning commit `959c8ecd`. The shared-date
cleanup passed the 136-test facade/architecture selection again.

Before the review repair, `rtk npm run lint` and `rtk npm run check` passed: 2,680
tests / 208 suites, with six opt-in live-provider evaluation tests in one suite
skipped. That initial full check is historical; the final source requires the
fresh result below.

Read-only native probes passed:

```sh
rtk proxy env TZ=America/New_York node /private/tmp/cognipace-fsrs-phase-b-probe.mjs
rtk proxy node /private/tmp/cognipace-fsrs-native-invariants.mjs
rtk proxy node /private/tmp/fsrs-b-correction-oracle.mjs
```

These temporary probes informed committed native-oracle tests; they are not a
packaged-runtime scaling benchmark. The initial exploratory attempt to clone
the native parameters Proxy failed with `DataCloneError`; explicit field copying
passed. Initial default-sandbox Git staging could not write the shared Git
index; authorized escalated staging/commits succeeded.

## Final automated validation

Initial validated source commit: `120c2b0e`; the later ponytail cleanup is recorded
below. The fresh compatibility selection passed **272
tests across 15 suites**. Fresh `rtk npm run lint` passed, and `rtk npm run check`
passed database checks, WXT/TypeScript, lint and **2,682 tests across 208 suites**.
Six tests in one existing opt-in live-provider evaluation suite were skipped
because explicit evaluation configuration was absent; this phase does not invoke
providers. Existing jsdom `scrollTo` notices were non-fatal.

The extension build passed and produced `dist/chrome-mv3` (4.68 MB total).
Existing large-chunk notices were non-fatal; this is build compatibility proof,
not a capacity or scaling benchmark. Final touched-file and repository formatting
checks and whitespace checks passed:

```sh
rtk npx prettier --write src/lib/fsrs
rtk npx prettier --ignore-path /dev/null --write docs/architecture.md docs/superpowers/README.md docs/superpowers/specs/2026-10-03-fsrs-remediation-design.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-04-fsrs-phase-b-scheduling-evidence.md docs/superpowers/handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md
rtk npx prettier --ignore-path /dev/null --check src/lib/fsrs docs/architecture.md docs/superpowers/README.md docs/superpowers/specs/2026-10-03-fsrs-remediation-design.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-04-fsrs-phase-b-scheduling-evidence.md docs/superpowers/handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk git diff --check
rtk git diff --cached --check
```

Not run / remaining validation:

- `rtk npm run db:generate`: no schema or migration change.
- `rtk npm run db:check` separately: the same database check passed inside
  `rtk npm run check`.
- `rtk npm run zip`: archive behavior is unchanged; the unpacked build is the
  smoke-test artifact.
- `rtk npm ci`: not repeated; the existing pinned Node 24.20.0/npm 11.19.0
  dependency installation was reused. Package manifests and lockfile did not
  change in B or the fetched predecessor.
- Human installed-extension smoke and screenshot/recording proof: pending,
  required before PR review or merge. Checklist below.
- C/D integration, E daily activation, G packaged scaling and H live optimizer
  evaluation: outside B; no such readiness is claimed.

## Follow-up ponytail cleanup

The user approved both remaining review findings. Projections now pass the
existing options directly to scheduling, whose adapter selects only scheduler
fields. The redundant seven-field copy/helper is removed. The native card test
oracle compares one named-field object instead of parallel lists, retaining all
ten values and Date comparisons. Net source/test reduction: **26 lines**.

The focused selection passed **74 tests across three suites** before and after
the cleanup. Fresh lint, full check, build and formatting passed. Full check
again passed **2,682 tests across 208 suites**, with the same six opt-in provider
tests skipped. The rebuilt unpacked extension remains ready for human smoke:

```sh
rtk npm run test -- src/lib/fsrs/domain/scheduler-profile.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/scheduler/review-correction.test.ts
rtk npx prettier --write src/lib/fsrs/scheduler/review-scheduler.ts src/lib/fsrs/scheduler/review-correction.test.ts
rtk npx prettier --ignore-path /dev/null --write docs/superpowers/handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md
rtk npx prettier --ignore-path /dev/null --check src/lib/fsrs/scheduler/review-scheduler.ts src/lib/fsrs/scheduler/review-correction.test.ts docs/superpowers/handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk git diff --check
rtk git diff --cached --check
```

Skipped commands and human proof remain as listed above; there is no additional
schema, dependency, runtime or UI change.

## Human compatibility smoke

Load the completed `dist/chrome-mv3` build in a disposable Chrome profile with
ordinary existing history. Follow the relevant flows in
[`docs/testing.md`](../../testing.md), record results and attach screenshots or
a recording:

1. Compare history, raw due dates, suspension, Daily Goal/streak and track
   progress before/after extension reload.
2. Save an ordinary review, explicitly reselect and Update its rating, then
   verify one corrected attempt, assessment locks and reload persistence.
3. Change retention from 75% to 90%; verify existing due timestamps remain intact
   before a genuine review and the preference survives reload. The future
   original-profile UI correction is D.
4. Restore a valid supported backup containing New zero counters/null last
   review and older logs. Verify IDs/history remain intact under the current
   backup format.

The workflow skill requires that “the human engineer must run happy-path and
edge-case realtime smoke tests with screenshot or screen recording proof before
PR review or merge.” See
[cognipace-agent-workflow/SKILL.md](../../../.agents/skills/cognipace-agent-workflow/SKILL.md).
That proof remains outstanding; automated helper tests do not establish
end-to-end command durability or daily eligibility.

## Release and rollback

Patch-level FSRS foundation. Reverting the Phase B code requires no stored-data
migration or schedule rewrite. Captured profiles are exposed by pure helpers;
they are not yet persisted or connected to the product correction flow.
