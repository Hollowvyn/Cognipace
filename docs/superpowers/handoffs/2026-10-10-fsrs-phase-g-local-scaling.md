# FSRS Phase G: Measured Local Scaling Handoff

Status: implementation and automated measurement complete on
`codex/fsrs-phase-g-scaling`, based on the Phase F merge `c4ce5d95` from
`origin/main`. [Draft PR #209](https://github.com/Hollowvyn/Cognipace/pull/209)
contains the change. The [reviewed plan](../plans/2026-10-10-fsrs-phase-g-local-scaling.md)
defines the workloads and acceptance gate. This handoff records completed
evidence and unresolved proof; the PR must remain draft while required
human installed-extension smoke and screenshots or a recording are pending.

## Scope and preservation

Phase G uses deterministic, disposable fixtures: 250 problems/5,000 reviews,
2,500/50,000, and 10,000 events on one card. Each includes corrected/tied
events, captured/legacy-derived/unknown evidence, nondefault retention,
suspension, premium filters, tracks, logs, a historical receipt, recent and
pre-window reviews. The fixture tests validate exact counts, Practice storage,
backup preflight, foreign keys and a real v6 restore. The scaling-fixture
restore comparison preserves reviews, cards, evidence, profiles, receipts and
track state. A separate small populated, AI-disabled Settings fixture verifies
Settings replacement; the timed scaling fixtures have no Settings row. Active
generation tokens rotate by design, so scope coverage is checked instead of
token equality.

The first standard workload found that a 5,000-review full backup could not
restore: a single large SQL insert exceeded SQLite's variable limit. Backup
and Practice sidecar restoration now insert sequential 25-row statements
inside the same replacement transaction. A late-batch rejection test proves
the earlier batches roll back. No history is trimmed and no schema, backup
version, Chrome permission, sync or scheduler behavior changes.

The hidden `/dev/smoke` route has an opt-in read-only capacity view. It reads
Chrome's actual storage usage, quota and active/recovery key byte counts, plus
sequential gated Analytics and Queue service-read samples. It does not load
fixtures or invoke live AI during capacity sampling. The standalone Chrome
driver instead performs destructive restore only inside a unique disposable
profile, using the packaged extension and authorized messaging. Its results
must be reported separately from local Vitest samples.

## Measurement evidence

Local samples and packaged Chrome results are recorded as sanitized raw JSON
under `docs/superpowers/evidence/` when each run completes. The generator seed
is `20261010`. The local runner uses a fixed `2026-10-10T12:00:00.000Z` clock,
an untimed reference-output pass, three further read warmups and 20 warm
samples on standard/single-card or 10 on
stress, with nearest-rank p50/p95; each mutation starts from an identical
deserialized snapshot outside the timer. Its `coldReopen` measure is a fresh
in-process SQLite handle, not a Chrome worker restart. It records every raw
duration/error, reference-output digest, database/base64/backup sizes and
installed dependency versions. Peak heap and Chrome quota are unavailable
from that in-process harness and must not be inferred from SQLite bytes.
The raw reports' `commit` field identifies the checked-out Phase G plan commit
at sampling time; implementation files were then uncommitted. Packaged reports
also pin the exact loaded build by SHA-256, and the final PR commit contains
the measured implementation.

The two standard in-process runs have identical fixture counts, byte sizes
and nine reference-output SHA-256 digests, with no operation failures. Raw
samples are in
[`standard-local-run1.json`](../evidence/fsrs-phase-g/standard-local-run1.json)
and
[`standard-local-run2.json`](../evidence/fsrs-phase-g/standard-local-run2.json).
The snapshot is 7,290,880 bytes, its base64 representation 9,721,176
characters, and the UTF-8 backup 7,644,369 bytes on an Apple M2 Pro with
32 GiB RAM, macOS Darwin 27.0.0, Node 24.20.0, SQLite WASM
3.53.0-build1, ts-fsrs 5.4.0 and WXT 0.21.4. Both runs used 20 warm samples
per operation and five in-process reopen samples. Standard p50 ranges across
the two runs: Queue 8.35–8.74 ms, Practice details 1.34–1.45 ms, Analytics
30/90/All 812/1,720–1,739/2,260–2,321 ms, backup export 257–258 ms,
base64 encoding 169–179 ms, Save plus synthetic encoding 177–190 ms,
Update plus synthetic encoding 175–180 ms, identical-command Retry 1.85–1.86
ms, and full restore 1,113–1,114 ms. These Save/Update samples omit actual
Chrome storage publication; the packaged driver measures that separately.

The initial pre-batching standard report
[`standard-before-restore-batching.json`](../evidence/fsrs-phase-g/standard-before-restore-batching.json)
records 20/20 restore failures from SQLite's variable limit. Its other
latencies are not a valid A/B baseline: the fixture's original history dates
were corrected before the two final runs. Batching changes this reproducible
failure boundary to 20/20 successful restores; it does not support a
before/after latency claim.

The supporting 2,500-problem/50,000-review stress run
[`stress-local.json`](../evidence/fsrs-phase-g/stress-local.json) passed all 18
operations with zero failures. It took 10 warm samples per operation, except
five fresh-handle reopens. Its SQLite snapshot is 66,076,672 bytes, base64
representation 88,102,232 characters and backup 75,847,120 UTF-8 bytes.
Median local reads were Queue 82.83 ms, details 1.37 ms, Analytics 30/90/All
8,511/17,918/23,552 ms. The history query alone took 987 ms and current-card
query 305 ms, so the full Analytics calculation has substantial additional
work. Median backup export/validation were 2,584/2,189 ms, synthetic
Save/Update publication 1,515/1,529 ms, Retry 2.16 ms and full restore
11,159 ms. These are in-process costs, not Chrome capacity or UX promises.

The concentrated one-card/10,000-event supporting run
[`single-card-local.json`](../evidence/fsrs-phase-g/single-card-local.json)
passed all 18 operations with zero failures, using 20 warm samples and five
fresh-handle reopens. Its SQLite snapshot is 13,983,744 bytes, base64
representation 18,644,992 characters and backup 14,868,605 UTF-8 bytes.
Median details, Submit preview, Update preview and Retry were 372, 281, 375
and 414 ms; Analytics 30/90/All were 998/2,426/4,570 ms. The high per-card
cost is recorded without assuming this snapshot can be published under the
current Chrome quota.

### Measured Analytics change

The one-shot stress profile
[`analytics-resolver-one-shot.json`](../evidence/fsrs-phase-g/analytics-resolver-one-shot.json)
identified repeated historical scheduling-evidence resolution as 12.695 of
25.020 seconds (50.7%) in one All-history report. The same 50,000 event IDs
were resolved 295,780 times. Analytics now keeps a cache for one summary
request, keyed by attempt ID and all six resolver inputs; other domain callers
retain the pure resolver. The one-shot post-change report resolved 50,000
events, spent 2.624 seconds in that resolver, and completed in 14.729 seconds
with the exact same complete-output SHA-256 digest. These one-shot numbers are
diagnostic and separate from the repeated benchmark distributions.

Two repeated standard after-change runs
[`standard-local-after.json`](../evidence/fsrs-phase-g/standard-local-after.json)
and
[`standard-local-after2.json`](../evidence/fsrs-phase-g/standard-local-after2.json)
had identical fixture sizes and all nine reference digests versus both
baseline runs, with zero operation failures. Analytics 90 p50 was 1,720–1,739
ms before and 981–1,007 ms after; All p50 was 2,260–2,321 ms before and
1,301–1,375 ms after. Both improvements exceed the observed baseline run
range. Analytics 30 p50 moved from about 812 ms to 668–778 ms, but one
after-run had a 1,576 ms p95 outlier, so no 30-day tail improvement is claimed.
Other operation medians varied between runs, including unrelated base64
encoding; the cache change does not establish a general speedup outside
Analytics. A checked-in frozen digest test on the standard fixture verifies
the complete All-history output, including corrected/tied and mixed evidence.

The final repeated stress comparison
[`stress-local-after.json`](../evidence/fsrs-phase-g/stress-local-after.json)
passed every operation with unchanged byte sizes and all nine reference
digests. Analytics 30/90/All p50 changed from 8,511/17,918/23,552 ms to
6,600/10,115/13,325 ms, with p95 8,792/19,737/25,183 ms before and
6,804/10,675/14,965 ms after. Queue, details, previews, backup, Save,
Update, Retry, restore and reopen medians showed no material regression in
this run. The concentrated one-card comparison
[`single-card-local-after.json`](../evidence/fsrs-phase-g/single-card-local-after.json)
also passed with identical bytes and digests: Analytics All p50/p95 fell from
4,570/4,645 ms to 2,444/3,047 ms; its details, previews and mutation
medians remained near baseline. These are one before/after run each on the
large supporting workloads, so their percentile differences are evidence for
these fixtures rather than a general performance guarantee.

Packaged Chrome evidence uses request-to-response timing through durable
acknowledgement for Save, Update and identical-command Retry, plus Queue,
details, Analytics, backup, restore and reopen on the same published snapshot.
Content-script previews and Save contention require the correct installed
LeetCode sender. Each operation that cannot be executed remains explicitly
pending; a partial packaged report is not a capacity claim.

The pre-memoization full standard packaged run
[`fsrs-phase-g-chrome-standard-2026-10-11T03-23-11.057Z.json`](../evidence/fsrs-phase-g/fsrs-phase-g-chrome-standard-2026-10-11T03-23-11.057Z.json)
used Chrome for Testing 151.0.7922.47 and build SHA-256
`960726e037380e24f605a516357917a22dc3b0651b879266dad8ea19351776bf`.
All 13 dashboard operation categories succeeded in 20/20 warm samples, except
the two reopen categories at 5/5. Median/p95 milliseconds: Queue 7.2/7.8,
details 1.8/2.0, Analytics 30 708/735, 90 1,532/1,602, All 2,060/2,113,
backup export 290/340, validation 241/247, durable Save 262/291,
same-command Retry 227/244, Update 264/268, full restore 1,346/1,393,
service-worker reopen 396/429, and full browser restart 2,250/2,843. The
read-only `/dev/smoke` capacity sample matched the direct Chrome storage API:
9,776,228 bytes in use of 10,485,760 quota, leaving 709,532 bytes. The active
snapshot key uses 9,775,814 bytes; recovery keys are absent in this profile.
The maximum **observed dashboard** heap sample was 140,938,563 bytes after
commands; this is not a continuous peak and excludes service-worker heap.
The full-run report's content-script channel is pending after an unclassified
error in that run. A separate packaged, same-build
proper-sender run on the HTTPS LeetCode two-sum page
[`fsrs-phase-g-chrome-standard-2026-10-11T03-28-40.301Z.json`](../evidence/fsrs-phase-g/fsrs-phase-g-chrome-standard-2026-10-11T03-28-40.301Z.json)
measured the installed isolated content-script context with three warmups and
20/20 samples each: Submit preview p50/p95 1.30/1.67 ms, Update preview
1.62/2.10 ms, and concurrent Save+preview 283.78/295.49 ms for preview and
284.90/294.60 ms for paired durable Save. All 20 concurrent previews returned
`ready`; none returned a conflict. Its top-level status stays pending because
the other operation categories were intentionally not rerun in that probe.

The optimized packaged standard run
[`fsrs-phase-g-chrome-standard-2026-10-11T04-09-02.697Z.json`](../evidence/fsrs-phase-g/fsrs-phase-g-chrome-standard-2026-10-11T04-09-02.697Z.json)
used the rebuilt SHA-256
`04f3e137b2e3e7ce039452322f192f20649d80b05bfaaae32b3db8028ad241a8`.
All 13 dashboard operation categories and the installed content-script channel
were measured, with 20/20 successful warm samples (5/5 for both reopen
categories). Under the same Chrome version and fixture counts, Analytics
30/90/All p50 changed from 708/1,532/2,060 ms to 563/879/1,165 ms; p95
changed from 735/1,602/2,113 ms to 582/908/1,205 ms. Save p50 was 262 ms
before and 254 ms after, full restore 1,346 and 1,321 ms; other dashboard
medians did not materially regress. Total Chrome storage and active snapshot
bytes were identical before and after. The two dashboard heap observations
cannot establish a peak or a memory improvement.

The optimized preview-only run
[`fsrs-phase-g-chrome-standard-2026-10-11T04-10-30.566Z.json`](../evidence/fsrs-phase-g/fsrs-phase-g-chrome-standard-2026-10-11T04-10-30.566Z.json)
matches the baseline preview-only method: Submit p50 1.30→1.31 ms, Update
1.62→1.61 ms, and concurrent Save+preview 283.78→269.67 ms for preview.
Its Update p95 had an 18.67 ms outlier versus 2.10 ms before, so no preview
tail improvement is claimed. The preview-only report is top-level pending by
design because it intentionally omits the other operation categories.

Bounded packaged initial-restore probes left both larger workloads pending.
The 50,000-review stress input was 75,847,120 backup bytes and hit Chrome's
runtime message-size limit before fixture rows loaded; this was not a storage
quota rejection. Storage remained 786,504 bytes and all tracked
active/recovery key digests were unchanged; the live worker still returned 101
seeded catalog problems and no reviews. Raw evidence is
[`fsrs-phase-g-chrome-stress-2026-10-11T03-26-33.420Z.json`](../evidence/fsrs-phase-g/fsrs-phase-g-chrome-stress-2026-10-11T03-26-33.420Z.json).
The 10,000-event single-card input was 14,868,605 backup bytes and returned
`persistence-pending` during replacement. Total storage rose from 786,504 to
786,872 bytes, but every tracked active/recovery key byte count and digest
stayed unchanged. Its live worker remained gated pending replacement. This is
a measured publication failure and durable-state preservation, not proof of
the exact underlying quota exception. Raw evidence is
[`fsrs-phase-g-chrome-single-card-2026-10-11T03-25-03.372Z.json`](../evidence/fsrs-phase-g/fsrs-phase-g-chrome-single-card-2026-10-11T03-25-03.372Z.json).

## Review and validation

Independent SPEC and Ponytail QUALITY reviews found and resolved the driver
digest/status, synthetic-input, fixed-clock, worker/browser-reopen labeling,
protected-sidecar, browser read-shape and error-classification gaps. SPEC also
requested the opt-in gated `/dev/smoke` read observer, a build digest and a
checked-in frozen full-output Analytics parity assertion; these are present.
The reviewers checked the request cache's input equivalence and read-only
consumers. They found no remaining static code blocker. The human proof and
continuous peak/service-worker heap remain unresolved evidence limits.

Commands run and results:

- `rtk npm run test -- src/features/analytics/server/analytics-service.test.ts src/testing/fsrs-scaling-fixtures.test.ts src/features/backup/server/backup-service.test.ts src/extension/background/dev-smoke-service.test.ts src/extension/background/register-handlers.test.ts src/features/dev-smoke/components/dev-smoke-screen.test.tsx src/testing/fsrs-scaling-samples.test.ts`: 252/252 passed. This includes the full nine-test scaling fixture suite, separate populated-Settings restore, frozen Analytics digest, late-batch rollback and opt-in observer tests.
- `rtk npm run test -- src/app/dashboard/routes.test.tsx`: 62/62 passed after updating the expected default `includeCapacity: false` payload.
- `rtk proxy env COGNIPACE_SCALING=standard npm run test -- src/testing/fsrs-scaling-benchmark.test.ts`: two before and two after repeated runs passed with zero operation failures and matching bytes/digests. The first pre-batching attempt failed all 20 restore samples at SQLite's variable limit; its raw report is retained. A separate stress after-run was interrupted when a review suggested a missed resolver path; inspection showed that path did not resolve evidence, so the final stress command was rerun from the beginning.
- `rtk proxy env COGNIPACE_SCALING=stress npm run test -- src/testing/fsrs-scaling-benchmark.test.ts` and `rtk proxy env COGNIPACE_SCALING=single-card npm run test -- src/testing/fsrs-scaling-benchmark.test.ts`: each baseline and final after-run passed with zero operation failures and matching bytes/digests.
- `rtk proxy node scripts/fsrs-scaling-chrome.mjs --backup test-results/fsrs-phase-g/standard-backup.json --dataset standard --samples 20 --warmups 3`: packaged before and optimized after runs measured all dashboard categories; the after-run also measured content-script previews. The first two restricted after-run attempts failed at Chrome DevTools startup before extension load; retry with local DevTools access passed. Separate `--preview-only --samples 20 --warmups 3` runs measured the pre/post proper-sender preview path; their process exits are pending by design because dashboard categories are omitted.
- `rtk proxy node scripts/fsrs-scaling-chrome.mjs --backup test-results/fsrs-phase-g/stress-backup.json --dataset stress --initial-restore-only` and the equivalent `single-card-backup.json --dataset single-card --initial-restore-only`: both correctly reported pending boundaries, with protected durable keys unchanged, as detailed above.
- `rtk npm run db:check`: passed. `rtk npm run lint`: passed after correcting three new benchmark-helper lint errors. `rtk npm run check`: passed with 3,844 tests passing and 10 existing/opt-in skips across 251 files, after the stale dashboard route expectation was fixed. `rtk npm run build`: passed for Chrome MV3; WXT retained its existing large-chunk warning.
- `rtk npm run format`: passed after formatting eight new/edited files. `rtk proxy ./node_modules/.bin/prettier --ignore-path /dev/null --check docs/product.md docs/architecture.md docs/testing.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-10-fsrs-phase-g-local-scaling.md docs/superpowers/README.md docs/superpowers/handoffs/2026-10-10-fsrs-phase-g-local-scaling.md`: passed. `rtk git diff --check`: passed.

The first [PR #209 CI run](https://github.com/Hollowvyn/Cognipace/actions/runs/38111527747) failed only the new frozen Analytics full-summary test: building the 5,000-review fixture and calculating the summary took about six seconds under CI load, past Vitest's default five-second test timeout. The other 3,843 tests passed, with 10 skips; remote build and format passed. The test now has an explicit 30-second limit. `rtk npm run test -- src/features/analytics/server/analytics-service.test.ts` passed 48/48, and a local `rtk npm run check` rerun passed 3,844 tests with 10 skips. `rtk proxy ./node_modules/.bin/prettier --check src/features/analytics/server/analytics-service.test.ts` and `rtk git diff --check` also passed. The follow-up PR checks record the remote outcome. The initial PR hygiene check failed on its required Issue and Manual smoke tested labels; editing the draft PR body to the template's wording made that check pass, with human smoke still marked pending.

Commands skipped: `rtk npm run db:generate` because no schema/index or
migration changed; `rtk npm run zip` because package/artifact behavior did not
change. The opt-in benchmark test intentionally skips during ordinary
`rtk npm run check` unless `COGNIPACE_SCALING` names a workload. Human
installed-extension happy-path/edge-case smoke and screenshot or recording
proof remain pending, so the draft PR is not ready for review or merge.

## Remaining gate and rollback

The human engineer must run the installed-extension happy-path and edge-case
steps in [testing](../../testing.md#phase-g-local-scaling-smoke) and attach
redacted screenshots or a recording before PR review or merge. Phase F's
separately pending human preview proof was not supplied by PR #208's merge.
The current [PR #208](https://github.com/Hollowvyn/Cognipace/pull/208)
body still records that proof as pending, and its comments contain no newer
evidence. The same check on [PR #207](https://github.com/Hollowvyn/Cognipace/pull/207)
found its Phase E proof pending. Merge status is not proof of either flow.
Phase H may use only completed Phase G time, heap, storage and responsiveness
measurements as feasibility inputs; Phase G does not add an optimizer.
On this machine and Chrome build, the packaged 5,000-review standard snapshot
left 709,532 bytes of measured local-storage headroom, and optimized Analytics
All still took 1,165 ms p50. The 50,000-review fixture was blocked by Chrome's
runtime message-size limit before publication; its 13,325 ms optimized local
Analytics All p50 is supporting in-process evidence only. The one-card
workload returned publication pending. Phase H must not treat either larger
workload as an installed-extension capacity, extrapolate storage linearly, or
infer peak/service-worker memory from the sampled dashboard heap. Its optimizer
feasibility must be checked against these measured constraints without
changing the scheduler or permission boundary here.

Rollback is the prior Phase F extension build. The Phase G restore batching
does not alter persisted format or truncate history, so backups and snapshots
remain readable by the prior build. A failed replacement keeps the prior
durable snapshot and recovery copies; re-run restore only in the disposable
profile after diagnosing its recorded failure.
