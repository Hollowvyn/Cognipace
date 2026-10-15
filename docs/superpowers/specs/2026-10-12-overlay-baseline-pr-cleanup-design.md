# Overlay Baseline PR Cleanup Design

Date: 2026-10-12

Status: Design approved in conversation; written spec awaiting user review.

## Purpose

Draft PR #211 adds 9,125 lines for the Phase 1 overlay startup baseline. Its
7,092-line, 193 KB JSON report accounts for most of that diff. The report
repeats all 510 page-stage samples in its summary and stores unattributed
worker read windows in a verbose form. The collector currently labels an
opening `ok` when the timer mark exists even if saved context and upsert
stages are pending. User Timing entries are recorded during ordinary use
without a retention bound. A timing API exception in a `finally` block can
replace the result or error of the measured operation.

This cleanup makes the Phase 1 measurement smaller and trustworthy before
later phases change startup behavior. It does not implement progressive
startup, change LeetCode Submit, alter a review write, change persistence, or
claim to reproduce the reported 30-second live-profile delay.

## Chosen approach and alternatives

| Approach                                                          | Benefit                                                                | Limit                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Compact only the report                                           | Smallest patch and review diff                                         | Leaves readiness classification and runtime timing risks in place |
| Compact evidence, repair measurement, rerun baseline **(chosen)** | Auditable raw data and reliable status with bounded observational work | Requires collector and timing tests plus a fresh packaged run     |
| Split benchmark and evidence into another PR                      | Smaller individual reviews                                             | Separates the timing code from the evidence used to assess it     |

The raw timing samples remain versioned in Git. The old report is replaced,
not retained beside a new report.

## Evidence format and calculations

Startup-only reports use a compact, versioned schema. A single ordered list
defines the fixed page-stage names. Each warm or cold opening has one aligned
array whose cells are either the original finite millisecond duration or an
explicit `pending`, `timeout`, or `error` status. The opening also retains its
mode, index, outcome, isolated-context result, and sanitized failure code
when applicable. All 20 warm and 10 cold openings remain individually
auditable. Numeric precision is retained; rounding is presentation-only.

Worker entries remain in a separate `unattributedWorker` section as compact
stage/duration observations grouped by read window. The report states that a
window is not a request identity and cannot yield per-opening worker
percentiles or snapshot share. Trace metadata, fixture counts and digests,
browser/extension/build details, and the pending real Submit comparison stay
in the report. URLs, slugs, page text, code, credentials, full backup data,
and raw Chrome traces do not enter the report.

The report stores only derived count, p50 and p95 for each stage, never a
second copy of raw samples. The nearest-rank summary is calculated from
finite successful cells, with failed and pending cells retained in the raw
denominator. A deterministic validator recomputes every committed summary
from the raw openings and rejects mismatches or malformed stage arrays.

Timer readiness and context readiness have separate outcomes. An opening may
have a successful timer sample while context is pending; it must not be
reported as fully ready. For this Phase 1 serial baseline, overall page
readiness requires valid timer and context marks plus successful page metadata,
upsert, and app-shell samples. The collector preserves explicit failure and
timeout statuses across all requested openings. A partial worker attribution,
renderer attribution, live-profile reproduction, or Submit comparison keeps
the overall benchmark status `partial`, even when page readiness passes.

## Runtime timing safeguards

Timing is observational and keeps fixed, content-free names. Both mark and
measure recording are best effort. If User Timing throws, the measured work
still returns its original value or throws its original error. A failed
timing call does not change LeetCode event handling, runtime messaging,
review acknowledgement, or database durability.

Retain at most 64 User Timing entries per fixed stage in each page or worker
context. Track the count in memory and clear that stage before recording the
next entry after the limit; never scan the full performance timeline during a
user operation. The disposable collector clears worker entries before each
opening and reads page entries from the fresh isolated context. If an entry is
missing or duplicated despite this, the affected stage is pending or error,
not silently successful. The generic snapshot-publication timer remains
labeled as an unattributed worker observation; it is not presented as proof
that upsert spent its time publishing a snapshot.

The helper and caller changes stay inside the existing `lib/performance`,
LeetCode watcher, overlay-session, app-shell, and background ownership
boundaries. The collector remains a startup-only mode of the existing
disposable Chrome driver. Its older FSRS scaling modes and report schema are
unchanged.

## Reproducibility and validation

The new baseline is collected from a clean checkout of a committed PR source
revision, separate from the unrelated local `package.json` and
`package-lock.json` edits. Record that source commit, the packaged extension
SHA-256, generator version, fixture digest, browser version, machine class,
and warm/cold definition. Commit the report afterward; the evidence commit may
therefore be newer than the measured source commit, but runtime and collector
code must match the recorded revision. The human-readable handoff and PR body
link to the replacement report and state this provenance explicitly.

Focused tests cover compact encoding/decoding, exact percentile reproduction,
missing and duplicate stage entries, a timer-ready opening with pending
context, failed cold restarts, retention bounds, and timing API failures around
successful and failing business work. Run focused tests first, then
`rtk npm run lint`, `rtk npm run check`, and `rtk npm run build`. Run the
packaged 20-warm/10-cold startup command and validate its output. A `partial`
status and nonzero benchmark exit are reported as such, even when page
samples succeed. Run Prettier on touched Markdown and `rtk git diff --check`.
The plan and handoff list exact commands run and exact skips with reasons.

The disposable run does not replace human installed-extension happy-path and
edge-case smoke, screenshot or recording proof, an affected live-profile
trace, or authenticated LeetCode Submit versus disabled-extension comparison.
PR #211 remains draft and is not ready for review or merge until the required
human proof is attached. No permissions, sync behavior, schema, release
artifact behavior, or saved-review semantics change.

## Phase boundary

Use one phase-sized implementation plan for this PR cleanup: repair the pure
collector and timing primitives, update focused callers and tests, replace
the report from the clean committed build, and update the handoff, testing
links, and PR body. Later startup behavior phases remain governed by the
existing responsive overlay design and their own plans.
