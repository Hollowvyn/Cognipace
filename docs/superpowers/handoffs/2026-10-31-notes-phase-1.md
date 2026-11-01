# Notes Phase 1: Archive Persistence And Recovery

## Outcome And Scope

Phase 1 infrastructure is implemented locally on `codex/notes-implementation`.
Notes editing and new submission/assessment archive capture remain off; the
existing Notes tab remains a placeholder. Live analysis and hints stay
session-only. Imported/restored archives are durable, reachable by owning APIs,
and exportable. Phases 2–4 are not implemented by this work.

Tasks 1–11 received independent SPEC and QUALITY acceptance. Final integration
audit covered `48fcfeff` through `7283c984d131d407c4058cf453f000e69b4d8887`
and reported no remaining findings. Task 12 received independent SPEC and QUALITY acceptance at
`554a5d0db24a7f5c689b5086c4bc2b0ff50276f0`, with no findings. Human installed-extension proof is
**pending before PR review or merge**, not N/A; this handoff does not claim
release or merge readiness.

## Task Commits And Acceptance

| Task               | Commit                                     | Independent acceptance |
| ------------------ | ------------------------------------------ | ---------------------- |
| 1                  | `861d72b8cb7d712fec1a99ddfa8b03f5150d99a9` | SPEC + QUALITY PASS    |
| 2                  | `f6b3ee6f031e18ad3d2954debe61ccc539b18a65` | SPEC + QUALITY PASS    |
| 3                  | `8e5161bde1f40944e464efc77bce0b8b73812d12` | SPEC + QUALITY PASS    |
| 4                  | `3871225927c1d802a9c3cf44e5db03373fc94f30` | SPEC + QUALITY PASS    |
| 5                  | `0479ea167b25e56c48a66e8c36e19cfc5889efca` | SPEC + QUALITY PASS    |
| 6                  | `3665a45177e85b63a67f164ca3616536c4e0fafb` | SPEC + QUALITY PASS    |
| 7                  | `0417f438141c394672ea347abcb46f00121b2ec9` | SPEC + QUALITY PASS    |
| 8                  | `7c8b15cf3e48c66302b9661ec955d0604607aec2` | SPEC + QUALITY PASS    |
| 9                  | `98dc9110e65831d2ad29fc47c29f9f6a415a19a6` | SPEC + QUALITY PASS    |
| 10                 | `9c5c42b2774b96eca8e57cd76bf0cf0a90626dac` | SPEC + QUALITY PASS    |
| 11                 | `950498df9428f8b86436ce92823050592efa4d42` | SPEC + QUALITY PASS    |
| Integration repair | `7283c984d131d407c4058cf453f000e69b4d8887` | SPEC + QUALITY PASS    |
| 12                 | this commit                                | SPEC + QUALITY PASS    |

Acceptance statuses above were supplied by the phase coordinator, separately
from implementer checks. Human installed-extension proof remains pending.

## Details

- IndexedDB version 2 preserves v1 core bytes and legacy recovery provenance,
  splits binary cores from head metadata, and atomically publishes paired
  core/archive identities with expected-revision CAS. Corrupt/missing roots or
  readiness markers fail closed without seeding over surviving data. Downgrade
  in place is unsupported; preserve the profile and use a compatible build.
- Notes owns immutable code/report payloads, problem notes, submission
  reflections, saved AI inclusions, scopes, revision CAS, document edit leases,
  durable acknowledgements and outbox recovery. Bounded metadata/detail runtime
  APIs enforce sender, problem, scope, document and session ownership through
  Zod before access. The Phase 2 surface is recorded in Architecture.
- Detached reset/delete/Clear/restore candidates publish both stores atomically.
  Prepared restart and completed command fences resume publication/adoption or
  metadata after interruptions and lost responses without reapplying SQL or
  rotating tokens again. One prior local pair remains for recovery. Reset alters
  active data; it does not guarantee secure erase of browser/recovery/exported
  or third-party copies.
- Full v7 backups contain frozen v6 core plus active reachable archive. Legacy
  v1–v6 sources explicitly lack an archive; local/Gist previews bind original
  version, input/source identity and current local revision and warn before
  replacing existing archive data. v6 Practice profiles, evidence, generations
  and command receipts stay in the format; effective restored generations are
  fresh. New Notes technical scopes/leases/receipts/outboxes/transfers, prompts,
  raw provider responses and secrets are excluded. Property-order-only reuse of
  an identical payload ID may retain an existing valid digest; meaningful
  string/code/Markdown/report whitespace remains verbatim.
- Durable UTF-8 transfer sessions bound message chunks and protect accepted
  input across worker restart. Bounded maintenance yields to foreground work,
  validates roots/readiness/provenance/technical epochs, conservatively retains
  unknown owners and reclaims unreachable technical data without age-based
  learning eviction. Active logical usage differs from optional approximate
  browser physical usage.
- Baseline Gist advertises `verifiedFullBackup: false`. Automatic uploads pause
  with action-needed guidance and no upload retry loop. Explicit uploads are
  best effort/unverified, retain pending changes and never acknowledge complete
  remote backup. That capability remains **UNMET**; HTTP success is not proof.

## Issue

No issue: the user explicitly approved the Notes design, phase plan, delegated
implementation and task commits. No push, PR, merge or release is performed.

## Testing

Toolchain: Node `24.20.0`, npm `11.19.0`. Every npm invocation below used this
exact prefix (not the ambient shell npm):

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin
```

Final command results follow. Logs are local
`/private/tmp/task12-*.log` and contain no user profile or credentials.

Every command in this list expands with the exact prefix above:

| Command suffix                                                                                                                                                                                                                                           | Result                                                                               | Local log                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| `npm test -- src/platform/db src/features/notes src/features/backup src/features/sync src/extension/background/backup-replacement.test.ts src/extension/background/register-handlers.test.ts src/testing/architecture-boundaries.test.ts --maxWorkers=2` | PASS, 37 files / 746 tests, 23.56s                                                   | `task12-focused.log`       |
| `npm run db:check`                                                                                                                                                                                                                                       | PASS, exit 0                                                                         | `task12-db-check.log`      |
| `npm run lint`                                                                                                                                                                                                                                           | Final PASS, exit 0                                                                   | `task12-lint-final.log`    |
| `npm run check -- -- --maxWorkers=2`                                                                                                                                                                                                                     | PASS, exit 0; 283 files passed / 5 skipped; 4,440 tests passed / 19 skipped; 166.84s | `task12-check.log`         |
| `npm run build`                                                                                                                                                                                                                                          | PASS, exit 0; 5.4 MB production output                                               | `task12-build.log`         |
| `npm run zip`                                                                                                                                                                                                                                            | PASS, exit 0; `dist/cognipace-2.3.1-chrome.zip`, 1.75 MB                             | `task12-zip.log`           |
| `npm run store:check`                                                                                                                                                                                                                                    | PASS, exit 0; CogniPace 2.3.1, four icons                                            | `task12-store-check.log`   |
| `NOTES_WRITE_SMOKE_FIXTURE=1 npm test -- src/features/backup/notes-backup.integration.test.ts --maxWorkers=2`                                                                                                                                            | Final PASS, 1 file / 3 tests, 1.64s                                                  | `task12-fixture-final.log` |

The check script actually printed `npm run db:check && npm run typecheck && npm
run lint && npm run test -- --maxWorkers=2`; the test stage printed `vitest run
--maxWorkers=2`. Thus WXT prepare and TypeScript ran through the real typecheck
wrapper, with the entire existing test pipeline retained. Five skipped files
cover opt-in `COGNIPACE_SCALING`, `COGNIPACE_IDB_SCALING` and live analysis,
implementation and hint provider evaluation; no opt-in credentials or workload
flags were enabled. Existing jsdom `Window.scrollTo` notices remain. Build and
zip warn about chunks over 500 kB (dashboard 837.43 kB); they still exit 0.

Initial fixture formatting check exited 1 because JSON layout needed Prettier
reflow. The test-only exporter now uses the installed Prettier JSON formatter,
then validates exact formatted bytes and async preflight. The full suite above
ran before this presentation-only test-hook change; focused final three tests
passed afterward. No product source changed. Final affected static/format
results:

- `npm run typecheck`: PASS, exit 0 (`task12-typecheck-final.log`), including WXT
  prepare and TypeScript after the formatter import.
- `npm exec eslint -- src/features/backup/notes-backup.integration.test.ts`: PASS,
  exit 0, no warnings (`task12-eslint-final.log`).
- `npm exec prettier -- --check docs/superpowers/fixtures/notes-phase-1-v7.json`:
  initial exit 1 for JSON layout only (`task12-fixture-format.log`), corrected by
  the formatter-owned export above.
- `npm exec prettier -- --write src/features/backup/notes-backup.integration.test.ts docs/architecture.md docs/testing.md docs/product.md PRIVACY.md docs/chrome-web-store.md docs/superpowers/README.md docs/superpowers/handoffs/2026-10-31-notes-phase-1.md`:
  PASS (`task12-prettier-write-final.log`). An earlier write on the same list
  without the not-yet-created handoff also passed (`task12-prettier-write.log`).
- `npm run format`: PASS, exit 0, all matched files use Prettier style
  (`task12-format.log`). The final evidence-text update is followed by the same
  exact touched-file Prettier check below rather than repeating broad tests.
- `rtk git diff --check`: PASS. Final staged whitespace and commit status are
  independently checked before handoff.

The npm suffixes above use the exact pinned prefix stated earlier. Final
Markdown evidence check PASS, exit 0 (`task12-prettier-final.log`), uses that prefix with:
`npm exec prettier -- --check docs/architecture.md docs/testing.md docs/product.md PRIVACY.md docs/chrome-web-store.md docs/superpowers/README.md docs/superpowers/handoffs/2026-10-31-notes-phase-1.md src/features/backup/notes-backup.integration.test.ts docs/superpowers/fixtures/notes-phase-1-v7.json`.

The initial full `npm run lint` failed on
`src/testing/fsrs-scaling-fixtures.ts:84` (`no-floating-promises`). The owning
fixer added the missing `await` in
`7283c984d131d407c4058cf453f000e69b4d8887`; its focused nine tests, lint,
format and independent SPEC/QUALITY reviews passed before final validation
resumed. This failure was not suppressed or fixed by weakening expectations.

Baseline provenance supplied by the root: pinned locked `npm ci` left tracked
files clean and reported **27 pre-existing advisories (20 moderate, 5 high,
2 critical)** plus install-script approval warnings. No dependency changes were
made. Baseline `npm run check` passed 262 files/5 skipped and 4,157 tests/19
skipped in 95.88s, with existing jsdom `scrollTo` notices. Task 8's earlier
unbounded concurrent static run hit one 5-second archive-copy timeout; unchanged
isolated 25 tests and bounded 586 tests then passed. These are historical
contention/installation facts, not new final-regression claims.

Skipped commands/flows:

- `rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm run db:generate`:
  Drizzle/SQL schema and migration SQL are unchanged; Phase 1 changes IDB v2
  records/stores/indexes and archive data, not Drizzle schema.
- Unbounded `npm test` and a repeated full check after the fixture-only formatter
  change: the complete suite already passed with two workers; focused fixture
  tests and affected static checks cover the final test-only change.
- Real provider calls, human Chrome installed-profile fault/quota/smoke proof,
  large-profile/10k archive parse/hash/memory/latency measurements and future
  editor typing/autosave proof remain pending. Opt-in test skips are reported
  with final suite results below; skipped tests are not claimed as passed.

## Synthetic Fixture And Human Proof

[`../fixtures/notes-phase-1-v7.json`](../fixtures/notes-phase-1-v7.json) is
synthetic, exported through the real `exportFullBackup` serializer from
`createFrozenV6BackupFixture` and `makeNotesArchive`, with the installed Prettier JSON formatter and fixed clock/UUIDs in
`src/features/backup/notes-backup.integration.test.ts`. It includes notes,
submitted code, reflection, feedback, suggested implementation, saved AI,
Practice evidence, FSRS state and dates. No provider call, personal input or
secret was used. Its 90,377 bytes have SHA-256:

```text
9bd4b399960121fd7c779faf2527313ffa99fe0504d44c3638be57e5e3c5fce6
```

The test independently serializes twice, asserts exact byte equality with the
checked-in file, then validates parsed input through async owning preflight.
The optional export hook is test-only; it adds no product activation. Reproduce:

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin NOTES_WRITE_SMOKE_FIXTURE=1 npm test -- src/features/backup/notes-backup.integration.test.ts --maxWorkers=2
rtk proxy shasum -a 256 docs/superpowers/fixtures/notes-phase-1-v7.json
```

The [installed-extension checklist](../../testing.md#notes-phase-1-human-installed-extension-proof)
is prepared for a human with the actual packaged worker and native IndexedDB:
v1 upgrade; fixture restore/restart/re-export; paired abort/restart/lost-response
reset/restore; one/bulk reset/delete sibling preservation; legacy warning and
source binding; wrong document/session; UTF-8/large interrupted transfers;
root corruption, maintenance fairness and owner absence; and unverified/paused
Gist behavior. It explicitly rejects the historical Chrome-storage shim as
current IDB publication proof. Screenshot/screen-recording links: **pending**.

## Release Impact And Recovery

No new dependency, Chrome permission, host permission, backend or account is
introduced. Existing package version is unchanged. Privacy and Store text now
explain durable imported archives and unverified manual Gist transfer. Release
requires the unmet complete remote backup capability and Phase 4 measurements,
plus human proof above; later Notes capture/editor activation is separate.

Keep a full v7 backup and private complete IDB copy before migration/fault tests.
Do not downgrade a migrated profile or delete its database to bypass recovery.
An older client cannot read v7. Reverting documentation has no data effect;
reverting Phase 1 runtime/storage code requires a compatible recovery strategy,
not an assumed automatic downgrade. Prefer forward repair with original roots
preserved. Native Chrome durability/quota, worker timing and large-data costs
remain material unmeasured risks despite automated coverage.
