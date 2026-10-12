# Responsive Overlay Phase 1: Startup Baseline Handoff

Status: **DONE WITH CONCERNS** for Phase 1 instrumentation, disposable packaged
page measurement and documentation. The report is **partial**; human
installed-extension smoke and visual proof are pending, so this work is not
ready for PR review or merge. This phase measures the current behavior; it does
not change startup ordering, timer rules, review durability or LeetCode Submit.

## Details

The [approved design](../specs/2026-10-12-responsive-leetcode-overlay-startup-design.md)
and [Phase 1 plan](../plans/2026-10-12-responsive-overlay-phase-1-baseline.md)
call for a measurable baseline before startup behavior changes. Fixed,
content-free page and worker timing names, collector tests, and a disposable
packaged Chrome probe are implemented. The [sanitized raw report](../evidence/responsive-overlay/overlay-startup-standard-2026-10-12T06-38-38.694Z.json)
is the evidence for the numbers below. It identifies the loaded build by
SHA-256 `683030a5dab9765c63886cc0e7a57f02b4c775d3ff446efc23a4a92737ede512`;
the observed Git HEAD `af80c53eaa6cdab97a544f9f34df20bdad99fcaa` is
only the checkout state at measurement time and may omit uncommitted build
source.

The synthetic standard fixture contains 250 problem slugs and 5,000 review
attempts. Restore verification found the expected history, plus 101 seeded
catalog rows in the installed database. The probe verified a real Two Sum
LeetCode slug. It used Chrome for Testing 151.0.7922.47, Node 24.20.0,
Apple M2 Pro, and the packaged `chrome-mv3` extension in a unique disposable
`/private/tmp` profile. Warm means 20 fresh problem tabs in the same browser
and worker; cold means 10 full browser restarts retaining that profile, each
followed by a fresh tab. Restore and known-slug setup were untimed. First
warm and cold openings include trace collection overhead.

| Page-clock stage, milliseconds |  Warm p50 / p95 |   Cold p50 / p95 |
| ------------------------------ | --------------: | ---------------: |
| Navigation to content mount    | 170.59 / 180.90 |  292.80 / 303.27 |
| Content mount to page ready    |   21.26 / 28.33 |  252.93 / 393.47 |
| Content mount to timer ready   | 295.22 / 318.19 | 947.79 / 1014.25 |
| Content mount to context ready | 295.25 / 318.22 | 947.81 / 1014.29 |
| Page metadata request          |     2.47 / 6.91 |  235.08 / 374.57 |
| Page upsert request            | 258.02 / 277.13 |  656.61 / 728.44 |
| Page app-shell request         |   13.94 / 15.00 |   25.09 / 447.51 |
| Page preview request           |     2.81 / 3.21 |     3.77 / 31.08 |

All listed page stages have 20/20 warm and 10/10 cold successful samples,
with no page-stage timeouts. Percentiles are the report's nearest-rank values;
stages may overlap, so their percentiles must not be summed. Page upsert is the
largest measured request span in the warm and cold samples and dominates the
current timer-ready path. Cold metadata and intermittent app-shell waits add
delay. The warm timer-ready p95 of 318.19 ms exceeds the approved Phase 2
early-manual-timer target of 250 ms. Known-context p95 is 318.22 ms warm and
1014.29 ms cold, inside the design's respective 1 s and 4 s targets for this
fixture. The user's approximately 30-second live-profile delay was **not
reproduced** by this disposable run; an affected-profile trace is still needed.

Worker performance entries have fixed names and raw durations, but no request
identity. The read windows can contain delayed or duplicate work from another
opening. Consequently all per-opening worker slots remain `pending`, with no
valid worker p50/p95 or snapshot-publication share. Do not infer a database or
snapshot bottleneck from the page upsert duration alone. Chrome traces finished
for first warm and cold openings and found 1 and 5 all-process task candidates
over 50 ms, respectively. The sanitized trace metadata cannot attribute them
reliably to CogniPace's renderer or worker. No CogniPace renderer long-task
count or total can be claimed. The raw trace was discarded. The unauthenticated
disposable profile could not exercise real LeetCode code Submit or a
disabled-extension comparison; no code was submitted and click capture remains
unmeasured.

Phase 2 should use the measured 318.19 ms warm timer p95 to test early timer
availability without waiting for upsert or metadata. Phase 3 should examine
the measured upsert wait and cold metadata/app-shell waits while preserving
upsert durability. A later measured repair needs request-correlated worker
timings before assigning snapshot share. If authenticated click capture exceeds
50 ms, reserve its repair for Phase 4 with an attributed trace. No behavior
change is authorized by this handoff alone.

## Issue

No issue: this is the approved Phase 1 baseline of the responsive overlay
startup design and plan.

## Testing

- [x] `rtk npm run test -- src/lib/performance/overlay-startup-timing.test.ts`
      passed: 1 file, 5 tests.
- [x] `rtk proxy node --test scripts/overlay-startup-samples.test.mjs`
      passed: 10 tests.
- [x] `rtk npm run lint` passed.
- [x] `rtk npm run check` passed: `db:check`, WXT type generation, TypeScript,
      ESLint and Vitest (250 files passed, 3 skipped; 3,869 tests passed, 10
      skipped). The skipped tests are the suite's existing exclusions; the command
      exited 0. jsdom printed its existing `scrollTo()` warnings.
- [x] `rtk npm run build` passed for `chrome-mv3`; Vite reported large chunk
      warnings.
- [x] `rtk proxy ./node_modules/.bin/prettier --ignore-path /dev/null --check docs/testing.md docs/superpowers/README.md docs/superpowers/plans/2026-10-12-responsive-overlay-phase-1-baseline.md docs/superpowers/handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md` passed after formatting the handoff. The first check found that file unformatted; it was fixed with `rtk proxy ./node_modules/.bin/prettier --ignore-path /dev/null --write docs/superpowers/handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md`.
- [x] `rtk git diff --check` passed.
- [ ] The exact startup benchmark command in [Testing](../../testing.md#responsive-overlay-startup-baseline-and-smoke)
      produced the linked report with 20/20 warm and 10/10 cold page samples, but
      exited 1 because its overall status was `partial`. It did not pass end to end.
- [ ] Human installed-extension happy-path and edge-case smoke, authenticated
      code Submit and disabled-extension comparison, affected live-profile trace,
      and screenshot or recording proof remain pending. Use the exact checklist
      in [Testing](../../testing.md#responsive-overlay-startup-baseline-and-smoke).
- Skipped `rtk npm run db:generate`: no schema change. A separate
  `rtk npm run db:check` is skipped because `rtk npm run check` includes it.
  Skipped `rtk npm run zip`: extension artifact behavior is unchanged.

Remaining validation risk: the disposable run does not identify per-opening
worker cost, renderer ownership, real Submit latency or the reported
live-profile delay. Human proof is required before PR review or merge.

## Screenshots

Pending: attach redacted installed-extension screenshots or a screen recording
for the happy and edge paths, including timer availability, saved context and
real code Submit comparison. The packaged probe's trace metadata is not visual
proof.

## Risk, release impact and rollback

Timing entries and the disposable probe add observational work only; no runtime
payload, schema, Chrome permission, sync, review acceptance or release artifact
behavior changes. The principal risk is measurement overhead or interpreting
uncorrelated worker entries as a causal breakdown. Release impact is none
beyond shipping instrumentation with the extension. If instrumentation causes
regression, revert the Phase 1 timing/collector commits and rebuild; the
disposable fixture contains no personal data and changes no installed profile.
