# Responsive Overlay Phase 1: Startup Baseline Handoff

Status: **DONE WITH CONCERNS** for Phase 1 instrumentation, disposable packaged
page measurement and documentation. The replacement report is **partial**; human
installed-extension smoke and visual proof are pending, so this work is not
ready for PR review or merge. This phase measures the current behavior; it does
not change startup ordering, timer rules, review durability or LeetCode Submit.

## Details

The [approved design](../specs/2026-10-12-responsive-leetcode-overlay-startup-design.md)
and [Phase 1 plan](../plans/2026-10-12-responsive-overlay-phase-1-baseline.md)
call for a measurable baseline before startup behavior changes. Fixed,
content-free page and worker timing names, collector tests, and a disposable
packaged Chrome probe are implemented. The [validated compact report](../evidence/responsive-overlay/overlay-startup-standard.json)
is the evidence for the numbers below. Its source is the committed tree at
`b84c7e5781d27a0970d2ed15ddc1fb233bf87506`; its packaged `chrome-mv3`
build SHA-256 is
`f5daa4a68cf8378318aff161794ba11954c1395d426ee09e24f940e5b2628ace`.
The clean source tree was exported with `git archive HEAD` into `/private/tmp`
because the sandbox blocked `git worktree add` from creating `.git/worktrees`
metadata. The archive had a Git pointer only so the benchmark could read the
original commit SHA. It did not include the unrelated local package edits.

The synthetic standard fixture contains 250 problems and 5,000 review
attempts. The probe verified a real Two Sum LeetCode slug. It used Chrome for
Testing 151.0.7922.47, Node 24.20.0, Apple M2 Pro, and the packaged
`chrome-mv3` extension in a unique disposable
`/private/tmp` profile. Warm means 20 fresh problem tabs in the same browser
and worker; cold means 10 full browser restarts retaining that profile, each
followed by a fresh tab. Restore and known-slug setup were untimed. First
warm and cold openings include trace collection overhead.

| Page-clock stage, milliseconds |  Warm p50 / p95 |   Cold p50 / p95 |
| ------------------------------ | --------------: | ---------------: |
| Navigation to content mount    | 192.83 / 256.75 |  296.30 / 360.79 |
| Content mount to page ready    |   22.22 / 30.25 |  227.05 / 820.99 |
| Content mount to timer ready   | 302.55 / 373.45 | 569.40 / 1198.56 |
| Content mount to context ready | 302.58 / 373.49 | 569.44 / 1198.60 |
| Page metadata request          |    5.06 / 10.20 |  206.58 / 800.00 |
| Page upsert request            | 261.14 / 320.40 |  295.00 / 750.47 |
| Page app-shell request         |   14.35 / 17.10 |   23.91 / 414.24 |
| Page preview request           |     2.90 / 3.41 |      3.64 / 4.18 |

Timer and context readiness are recorded separately; each is `ok` in 20/20
warm and 10/10 cold openings. All listed stages except preview have those
same successful counts; preview has 15/20 warm and 8/10 cold measured samples.
Percentiles are nearest-rank values recalculated from the compact raw cells;
stages may overlap, so their percentiles must not be summed. Page upsert is a
large measured request span in both modes, but the page timing does not isolate
its worker or snapshot-publication share. The warm timer-ready p95 of 373.45 ms
exceeds the approved Phase 2 early-manual-timer target of 250 ms. Known-context
p95 is 373.49 ms warm and 1198.60 ms cold, inside the design's respective 1 s
and 4 s targets for this fixture. The user's approximately 30-second
live-profile delay was **not reproduced** by this disposable run; an
affected-profile trace is still needed.

Worker performance entries have fixed names and raw durations, but no request
identity. The read windows can contain delayed or duplicate work from another
opening. Consequently all per-opening worker slots remain `pending`, with no
valid worker p50/p95 or snapshot-publication share. Do not infer a database or
snapshot bottleneck from the page upsert duration alone. The first warm trace
finished and found one all-process task candidate over 50 ms; its sanitized
metadata cannot attribute that task reliably to CogniPace's renderer or worker.
The cold trace was unavailable in this rerun. No CogniPace renderer long-task
count or total can be claimed. The raw warm trace was discarded. The
unauthenticated disposable profile could not exercise real LeetCode code Submit or a
disabled-extension comparison; no code was submitted and click capture remains
unmeasured.

Phase 2 should use the measured 373.45 ms warm timer p95 to test early timer
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

For this committed-source recollection:

- [x] `rtk proxy git worktree add --detach /private/tmp/cognipace-overlay-baseline-clean HEAD`
      was attempted and failed: the sandbox denied creation of `.git/worktrees`
      metadata. `git archive HEAD` provided the clean source tree instead.
- [x] `rtk npm ci` initially failed with Node 26's engine mismatch;
      `rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm ci`
      passed with the pinned Node 24.20.0 toolchain.
- [x] `rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run build`
      passed for packaged `chrome-mv3`; Vite reported large chunk warnings.
- [x] `rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH COGNIPACE_SCALING=standard npm run test -- src/testing/fsrs-scaling-benchmark.test.ts`
      passed: 1 test. The first attempt, before the build generated `.wxt`,
      failed for missing `.wxt/tsconfig.json`; the next archive attempt required
      a Git HEAD pointer for the fixture's provenance field.
- [x] `rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH node scripts/fsrs-scaling-chrome.mjs --backup test-results/fsrs-phase-g/standard-backup.json --dataset standard --problem-url https://leetcode.com/problems/two-sum/ --startup-only --samples 20 --cold-samples 10`
      produced the linked report with 20/20 warm and 10/10 cold timer and
      context samples. It exited 1 because overall status was `partial`, not a
      complete benchmark pass. A first sandboxed attempt failed to publish
      Chrome's DevTools port; the successful collection used the same command
      with process access for its disposable Chrome profile.
- [x] `rtk proxy node scripts/validate-overlay-startup-report.mjs docs/superpowers/evidence/responsive-overlay/overlay-startup-standard.json`
      passed. An independent packaged-directory SHA-256 calculation matched the
      recorded build digest. An independent recursive string scan found no
      actual URL, problem slug, code, credential pattern, or backup payload;
      the report contains approved descriptive status and limitation strings.
- [x] `rtk npm run test -- src/lib/performance/overlay-startup-timing.test.ts src/lib/leetcode/watcher/leetcode-page-watcher.test.ts`
      passed: 2 files, 52 tests.
- [x] `rtk proxy node --test scripts/overlay-startup-samples.test.mjs`
      passed: 16 tests.
- [x] `rtk npm run lint` passed.
- [x] `rtk npm run check` passed: database check, typecheck, lint, and Vitest
      (250 files passed, 3 skipped; 3,886 tests passed, 10 skipped).
- [x] `rtk npm run build` passed in the PR worktree with the existing large
      chunk warning. The clean committed-source build above is the one used
      for the recorded baseline.
- [x] `rtk proxy ./node_modules/.bin/prettier --ignore-path /dev/null --check docs/superpowers/specs/2026-10-12-overlay-baseline-pr-cleanup-design.md docs/superpowers/plans/2026-10-12-overlay-baseline-pr-cleanup.md docs/superpowers/handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md docs/testing.md docs/superpowers/README.md`
      passed.
- [x] `rtk git diff --check` and `rtk git diff --check origin/main...HEAD`
      passed.
- [ ] Human installed-extension happy-path and edge-case smoke, authenticated
      code Submit and disabled-extension comparison, affected live-profile trace,
      and screenshot or recording proof remain pending. Use the
      [Phase 1 observation checklist](../../testing.md#phase-1-human-smoke-observe-current-behavior).
      The [progressive-startup acceptance checks](../../testing.md#future-progressive-startup-acceptance-phases-2-and-3)
      belong to later behavior phases and are not gates for this Phase 1 PR.
- Skipped `rtk npm run db:generate`: no schema change. Skipped
  `rtk npm run zip`: extension artifact behavior is unchanged. The local
  package and lockfile have unrelated uncommitted edits, so the PR-worktree
  build is less representative than the clean committed-source build recorded
  above; those edits are excluded from this PR.

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
