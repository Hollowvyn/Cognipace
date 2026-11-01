# Notes Phase 1 review fixes

This follow-up addresses the five independently reproduced review findings after
the original Phase 1 handoff. Work remains on `codex/notes-implementation` in the
isolated notes-implementation worktree. The original handoff records its historical
validation; this document records the later corrections.

## Changes

- Shared archive preflight rejects duplicate external submission aliases and
  observed-attempt aliases, including duplicates within a row, before preview or
  candidate persistence. Immutable body collisions against the local store also
  reject before accepting new replacement work; staging retains its final check.
- Import verifies the original transferred bytes and SHA-256, then removes exactly
  one leading BOM solely from JSON parsing input. Interior string BOMs and original
  spool bytes remain intact.
- Submission paging uses a lossless derived UTC key, including arbitrary fractional
  precision and equivalent representations, with bounded indexed cursors. Original
  timestamps remain in exports. Physical IndexedDB version 3 atomically backfills
  the index; head format 2 and SQL are unchanged. Actual `oldVersion` gates the
  legacy split so version-2 data, epoch, readiness and provenance survive.
- Accepted prepublication replacements persist an atomic pending pointer, exact
  owner recipe and prepared core before staging. Original accepted backup input
  lives in a separate technical source record. Restart discovery is metadata-only;
  authenticated generic Retry hydrates lazily without rerunning SQL, rotating
  tokens, rebasing or refetching remote data. Archive and scope staging both resume.
  Malformed, missing or conflicting durable inputs fail closed. Publication swaps
  the pair and pointer to a committed continuation atomically.
- Ordinary snapshot publication promptly retires its superseded core only after
  durable commit, readback and a same-transaction root proof. Bounded metadata scans
  preserve explicit recovery provenance, unresolved candidates and pending work;
  exact completed fences discharge superseded candidate cores. Active/core-key and
  active/paired readiness checks protect races. Uncertainty, malformed roots or the
  64-entry scan cap retain bytes for reachability maintenance. Cleanup failure does
  not turn an already durable save into failure.
- Candidate discovery enumerates the complete namespace with key-only cursors,
  including malformed nested keys; it cannot mistake an unknown candidate for idle
  or fetch an adjacent source body.
- The two copy fixtures now use 501 rows against the unchanged default batch of 500. They retain multi-batch, native abort-at-write-501, first-batch durability,
  cursor, reopen/resume, tail body/scope and immutable-body assertions.

No editor or new submission/assessment capture was activated. No SQL migration,
Chrome permission, dependency, OAuth or transport was added. Production Gist
verification remains unavailable: automatic upload remains paused/action-needed;
manual copies remain honestly unverified and do not acknowledge a revision.

## Commits and independent review

| Work                                            | Commit      | Acceptance                                                               |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| Alias preflight                                 | `6bdfb35e`  | Independent SPEC and QUALITY passed                                      |
| Verified-byte BOM parsing                       | `5d4e7258`  | Independent SPEC and QUALITY passed                                      |
| Chronological paging and preserving IDB upgrade | `e24b2f4b`  | Independent SPEC and QUALITY passed after linear-time normalization fix  |
| Restart recovery                                | `be3dfd02`  | Independent SPEC and QUALITY passed after lifecycle coverage correction  |
| Ordinary core retirement                        | `89cb39b2`  | Independent SPEC and QUALITY passed after conservative-proof corrections |
| Complete discovery namespace                    | `150f7974`  | Independent SPEC and QUALITY passed                                      |
| Bounded CI fixtures                             | `bca676a8`  | Independent SPEC and separate QUALITY passed                             |
| Current persisted submission test seeds         | `90708761`  | Independent SPEC and separate QUALITY passed                             |
| Original validation handoff                     | `84b4bc5c`  | Independent SPEC and separate QUALITY passed                             |
| Native exact-byte test comparisons              | `f031d086`  | Independent SPEC and separate QUALITY passed                             |
| Postpublication CI handoff                      | This commit | Independent factual review passed (root)                                 |

Whole-fix product integration review passed for `6b341aeb..150f7974`: 18 targeted
tests passed across six files, with 119 intentionally filtered out; no actionable
finding remained. Later test-only commits receive their own independent reviews.
Combined independent SPEC and separate QUALITY passed for `150f7974..90708761`;
the spec reviewer ran all 43 tests across the three touched files successfully.
Reviewers used GPT-6 Astra at maximum reasoning. After a platform
agent/thread-capacity failure, existing independent
reviewers were reused sequentially with retained context disclosed; implementation
authors did not approve their own work. A stale pending agent could not be released
by interruption. Passing automated checks does not replace these review gates.

## Focused evidence

- Alias fix: 64 affected tests passed; native-adapter regressions preserve current
  records/core/archive when preview, confirmation or staging rejects bad aliases.
- BOM fix: 49 affected tests passed, including actual File/API streams, a BOM split
  across bytes, preview/confirmed restore, bad checksums and preserved interior BOM.
- Chronology fix: 99 affected tests passed initially, then 60 affected tests after
  the linear scan correction. Native version-2 upgrade fixtures preserve stored
  records/core bytes and roll back corrupt/aborted upgrades. A valid 100k-digit
  fraction previously took about 4.4–5 seconds in the trailing-zero regex; the
  replacement measured about 0.065–0.077 ms without timing assertions in tests.
- Restart fix: 367 affected tests passed. Registered runtime tests use real SQLite
  and the production IDB adapter backed by fake-indexeddb across module resets.
  They exercise a replacement dashboard after the original owner disappears,
  denied direct access to the old transfer, literal frozen-v6 input, frozen Gist
  source/patch, archive/scope cutoffs, atomic aborts and missing/corrupt identities.
- Retirement fix: final affected suite 119 tests passed. Independent review
  rounds added preservation tests for reserved recovery/provenance corruption,
  readiness races, an active-core deletion race and array-valued namespace keys.
  Boundary tests require actual retirement while proving unrelated bodies unread.
- Discovery follow-up: 94 affected tests passed, with 23 registered lifecycle tests
  after the final test refinements; independent targeted discovery checks passed.
- Copy-fixture comparison: local copy/abort-resume timings fell from 2,472/1,245 ms
  to 1,208/609 ms; all 25 file tests passed. The earlier remote CI run
  `41281258047` failed both original fixtures at 5,000 ms while 4,438 tests passed.
  Remote CI had not yet been rerun at that point; local improvement does not
  establish CI stability. The subsequent run is recorded below.

## Postpublication CI Follow-Up

After root published `84b4bc5c` to draft PR 218, CI run `41294002812` failed four
tests at the unchanged 5,000 ms limit: all three alias-rejection variants in
`full-backup-service.test.ts` and the two-valid-unresolved-candidates case in
`replacement-restart.test.ts`. It reported 4,514 passing, four failing and 19
skipped tests in 223.39 seconds. Build, formatting and the other reported checks
passed. The earlier archive-copy fixtures passed; these were different failures.

Actual-fixture probes isolated recursive binary assertion cost rather than IDB
collection or archive preflight. Comparing 1,179,648 alias-snapshot bytes took
1,312–1,404 ms with Vitest deep equality versus 0.137–0.355 ms with native exact
byte equality; collecting the data took 0.332–0.938 ms. Two prepared cores of
589,824 bytes each took 699–750 ms per comparison versus 0.142–0.219 ms; comparing
1,769,472 mixed-root bytes took 2,127 ms versus 0.370 ms. Temporary probes were
removed before commit.

`f031d086` changes only those two test files. Binary values use Node's built-in
`Buffer.equals` outside live IDB transactions; metadata, binary type tags, view
windows, keys and counts remain checked. Two added negative proofs reject byte,
metadata, key and count changes and exercise cross-realm buffers and offset views.
No product code, dependencies, fixtures, assertions, timeout or workflow policy
was relaxed. The four baseline cases took 4,291/4,135/4,092/4,891 ms locally;
comparable revised focused timings were 239/143/136/1,291 ms. A subsequent warm
whole-file run measured 148/140/135/170 ms. These are local observations, not proof
that the next remote CI run passes.

Focused validation passed all 44 tests across both files in 11.65 seconds,
followed by typecheck, scoped ESLint, Prettier and diff checks. Initial inferred
`unknown` typing and formatting issues were corrected before the final run.
With the pinned environment prefix below, the exact affected commands were:

```sh
npm test -- src/extension/background/full-backup-service.test.ts src/extension/background/replacement-restart.test.ts --maxWorkers=2 -t 'rejects conflicting|two individually valid unresolved' --reporter=verbose
npm test -- src/extension/background/full-backup-service.test.ts src/extension/background/replacement-restart.test.ts --maxWorkers=2 -t 'rejects conflicting|two individually valid unresolved|compares complete snapshot' --reporter=verbose
npm test -- src/extension/background/full-backup-service.test.ts src/extension/background/replacement-restart.test.ts --maxWorkers=2 --reporter=verbose
npm run typecheck
npx eslint src/extension/background/full-backup-service.test.ts src/extension/background/replacement-restart.test.ts
npx prettier --check src/extension/background/full-backup-service.test.ts src/extension/background/replacement-restart.test.ts
```

Independent SPEC passed all 44 affected tests with one worker in 15.09 seconds;
separate QUALITY passed the two new negative-proof tests independently (42 other
tests intentionally filtered). Both reviews found no actionable issue. The new
full check passed 4,520 tests, with 19 skipped; 286 files passed and five skipped
in 177.06 seconds. Database checks, WXT/TypeScript and lint also passed within the
actual check pipeline. The previous product integration acceptance remains applicable because
this follow-up changes tests only. Root owns the next push and remote CI watch.

## Storage Measurement

The standard synthetic 250-problem/5,000-review fixture performs 20 existing
Library suspension-service mutations with snapshot flushes. Before correction,
ordinary publication retained 21 cores (153,108,480 bytes). After correction it
retains one active core (7,290,880 bytes). After an actual completed composite
replacement the same sequence retains two cores (14,581,760 bytes): the latest
active core and its explicitly paired prior recovery. The superseded published
replacement core is asserted absent. Twenty 1 MiB ordinary commits similarly
retain 1 MiB instead of 20 MiB. These are SQLite/fake-indexeddb measurements, not
Chrome storage or latency proof. Unknown/capped roots intentionally retain more.

## Final validation

Pinned environment for every npm command:

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin
```

| Command after that prefix            | Result                                             |
| ------------------------------------ | -------------------------------------------------- |
| `npm run db:check`                   | Passed                                             |
| `npm run lint`                       | Passed                                             |
| `npm run check -- -- --maxWorkers=2` | Passed: 4,520 tests; 19 skipped                    |
| `npm run build`                      | Passed: 5.41 MB                                    |
| `npm run format`                     | Passed                                             |
| `npm run zip`                        | Passed: `dist/cognipace-2.3.1-chrome.zip`, 1.75 MB |
| `npm run store:check`                | Passed: CogniPace 2.3.1, four icons                |

Exact focused commands and failure/correction evidence are retained in the task
execution records and `/private/tmp/cognipace-fix4-handoff.md`; final matrix logs
use `/private/tmp/notes-review-fixes-*.log`. The latest postpublication check is
`notes-review-fixes-post-ci-check.log`; build/format/zip/store-check logs use the
same `notes-review-fixes-post-ci-` prefix. Standalone database/lint checks passed
earlier and both commands also passed in the latest full check.

The first full check failed with 4,516 passing, two failing and 19 skipped tests
(284 passing, two failing and five skipped files; 187.53 seconds). Both failures
were direct test seeds predating the new persisted submission shape: the Notes
handler seed omitted its derived index key and the Practice recovery seed omitted
the complete submission contract. Focused reproduction confirmed both failures;
test-only corrections preserve every existing behavior assertion and raw historical
payload. No production validation is relaxed. The prepublication rerun passed: 4,518 tests
and 286 files passed; 19 tests and five files skipped; 186.53 seconds. The printed
pipeline ran database checks, WXT generation/TypeScript, lint and
`vitest run --maxWorkers=2`. Existing jsdom `scrollTo` notices remain.
The five skipped files cover opt-in scaling/IDB scaling and live analysis,
implementation and hint-provider evaluation. Credentials and workload flags were
not enabled; skipped tests are not counted as passed.

The first formatting check caught the handoff draft after its status-table edits;
the formatted draft and full repository then passed the final rerun. Build retains the existing warning for chunks
larger than 500 kB (dashboard 837.42 kB); this task does not change chunk policy.

Skipped: `npm run db:generate`, because SQL/Drizzle schema and migrations are
unchanged; the physical IDB index upgrade is implemented and tested separately.
Success for the next remote CI run and installed-extension smoke are not claimed.
The coordinator made no push, posted review comment or PR edits. Root published
the earlier accepted commits to draft PR 218 and owns the next publication.

Baseline installation warnings remain unchanged: 27 dependency advisories
(20 moderate, 5 high, 2 critical) and install-script approval warnings. The fixes
do not change dependencies or claim those advisories resolved.

## Human proof still required

Before PR review/merge, a human must run the current Notes Phase 1 checklist in
`docs/testing.md` using the packaged extension in a disposable Chrome profile and
attach screenshots or a recording. Include:

- Reject conflicting alias and immutable-body inputs while preserving active data;
  successfully restore a valid BOM-prefixed archive with interior Unicode intact.
- Upgrade actual version-1 and version-2 profiles, verify mixed-precision paging,
  original exports and atomic failed-upgrade preservation.
- Interrupt archive and scope staging, stop the worker and close the original
  dashboard, then use Settings generic Retry from a new dashboard. Verify pending
  gates, one application, exact identities, original Gist source/patch and no refetch.
- Verify missing/corrupt source/core/roots and competing candidates preserve data
  and require recovery. Exercise transaction abort and lost-response replay.
- Perform repeated Library suspensions/saves before and after restore, inspect
  active/recovery retained bytes, and inject proof/cleanup aborts. Unknown roots
  must retain copies; foreground work must remain usable.

Whole-file source hashing/parsing and large root-manifest memory, 10k-archive
capacity, native quota/worker lifetime and Chrome latency remain unmeasured Phase 4
work. Retain the branch and worktree; no merge, discard or release is performed.
