# Overlay Baseline PR Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make draft PR #211's Phase 1 startup measurement compact, correctly classified, low impact during ordinary use, and reproducible from committed source.

**Architecture:** Keep fixed-name page and worker User Timing entries behind one best-effort, bounded helper. Serialize each startup opening once using a shared stage order, derive summaries from those raw cells, and validate the checked-in report. Recollect evidence from a clean committed checkout; later progressive-startup behavior remains outside this plan.

**Tech Stack:** TypeScript, React, WXT Chrome MV3, Vitest, Node test runner, Chrome DevTools Protocol, existing disposable FSRS scaling fixture.

---

**Approved spec:** [Overlay Baseline PR Cleanup Design](../specs/2026-10-12-overlay-baseline-pr-cleanup-design.md). Work on `codex/overlay-startup-baseline` and update draft PR #211. The unrelated local `package.json` and `package-lock.json` edits are not part of this plan; stage exact files only. Use a separate clean checkout for the final packaged measurement.

## File map

| File                                                                                                                           | Responsibility                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/lib/performance/overlay-startup-timing.ts` and `.test.ts`                                                                 | Best-effort fixed-name marks/measures and per-stage retention bound                                     |
| `src/lib/leetcode/watcher/leetcode-page-watcher.ts` and `.test.ts`                                                             | Route the recognized Submit click measure through the safe helper                                       |
| `scripts/overlay-startup-samples.mjs` and `.test.mjs`                                                                          | Stage order, compact raw encoding, status classification, nearest-rank summaries, and report validation |
| `scripts/validate-overlay-startup-report.mjs`                                                                                  | CLI wrapper around the pure report validator for checked-in evidence                                    |
| `scripts/fsrs-scaling-chrome.mjs`                                                                                              | Startup-only report assembly and provenance; preserve other probe modes                                 |
| `docs/superpowers/evidence/responsive-overlay/*.json`                                                                          | Replace the verbose raw report with one compact report from the committed source                        |
| `docs/superpowers/handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md`, `docs/testing.md`, `docs/superpowers/README.md` | Link the replacement report and record exact status, validation, and remaining proof                    |
| PR #211 body                                                                                                                   | Match the final committed evidence and validation; keep draft                                           |

## Task 1: Make timing observational and bounded

**Files:** `src/lib/performance/overlay-startup-timing.ts`, `src/lib/performance/overlay-startup-timing.test.ts`, `src/lib/leetcode/watcher/leetcode-page-watcher.ts`, `src/lib/leetcode/watcher/leetcode-page-watcher.test.ts`.

- [ ] **Step 1: Write failing helper tests.** Mock `performance.mark`/`measure` to throw and assert that a successful synchronous or asynchronous operation still returns its own value, while a failing operation still throws its original error. Call one stage 65 times and assert that `performance.clearMeasures('cognipace.overlay.page.upsert')` occurs before the 65th measure and that no more than 64 same-name entries remain. Do the equivalent for marks with `clearMarks`. Use `vi.spyOn` and restore mocks after each test.
- [ ] **Step 2: Run red.** `rtk npm run test -- src/lib/performance/overlay-startup-timing.test.ts`; expect the new exception and retention tests to fail against the current helper.
- [ ] **Step 3: Implement the helper.** Keep the existing stage unions and work signatures. Add a private `Map<string, number>` per entry kind and `MAX_ENTRIES_PER_STAGE = 64`. Before writing the 65th entry, clear only that fixed name and reset its count. Wrap _only_ mark/measure/clear operations in a `try/catch`; leave `work()` outside the catch so its result and error are preserved. The synchronous wrapper must have this shape:

  ```ts
  export function timeOverlayStartupSync<T>(
    stage: OverlayStartupMeasure,
    work: () => T,
  ): T {
    const start = performance.now()
    try {
      return work()
    } finally {
      recordMeasure(stage, start, performance.now())
    }
  }
  ```

  The private recorder uses `const name = \`cognipace.overlay.${stage}\``. If `count >= 64`, call `performance.clearMeasures(name)`and set count to zero before`performance.measure(name, { start, end })`. Increment only after a successful measure. Catch and discard exceptions from recording. `markOverlayStartup`uses the same rule with a separate counter and`performance.clearMarks(name)`. Do not call `getEntries()` from a user operation.

- [ ] **Step 4: Replace the direct click measurement.** In `handleClick`, retain the initial `performance.now()` before button detection and the existing early returns. Replace the direct `performance.measure(...)` in its `finally` with a safe helper call that accepts the already captured start time, or wrap only that measurement in the shared best-effort recorder. Keep the click and capture event order unchanged. Add a watcher test in which timing recording throws but the recognized Submit event and captured attempt are still emitted.
- [ ] **Step 5: Run green and commit.** `rtk npm run test -- src/lib/performance/overlay-startup-timing.test.ts src/lib/leetcode/watcher/leetcode-page-watcher.test.ts`; expect pass. Stage only the four files above and commit `fix(overlay): bound startup timing entries`.

## Task 2: Correct startup status and compact raw evidence

**Files:** `scripts/overlay-startup-samples.mjs`, `scripts/overlay-startup-samples.test.mjs`, `scripts/validate-overlay-startup-report.mjs`, `scripts/fsrs-scaling-chrome.mjs`.

- [ ] **Step 1: Write failing pure tests.** Prove `startupOpeningStatus` does not return fully ready for a timer mark with pending context/upsert. Prove `encodeStartupOpening` and `decodeStartupOpening` round trip all 17 ordered stage values, exact numeric precision, explicit `pending`/`timeout`/`error`, and opening identity. Prove nearest-rank p50/p95 from compact rows matches the former sample representation and that `validateStartupReport` rejects a tampered summary. Prove a failed cold restart still fills all requested slots. Assert serialized output contains no URL, slug, code, or backup payload.
- [ ] **Step 2: Run red.** `rtk proxy node --test scripts/overlay-startup-samples.test.mjs`; expect only the new assertions to fail.
- [ ] **Step 3: Add a versioned compact projection.** Reuse `STARTUP_OPENING_STAGES` as the one stage-order source. `encodeStartupOpening(open)` maps each `samples` item to one aligned `values` cell: finite `ms` when status is `ok`, otherwise the status string. `decodeStartupOpening(open)` reconstructs `{ stage, status, ms }` from each cell and rejects wrong array length, non-finite number, or unknown status. Keep `mode`, `index`, `status`, `isolatedContext`, `wallMs` when present, and sanitized failure metadata. Worker read-window observations become `[stageIndex, durationMs]` tuples under `unattributedWorker`, not per-opening worker samples.
- [ ] **Step 4: Define independent readiness checks.** `startupOpeningStatus(samples)` returns `{ timer: 'ok' | 'pending' | 'timeout' | 'error', context: 'ok' | 'pending' | 'timeout' | 'error', page: 'ok' | 'pending' | 'timeout' | 'error' }`. `page` is `ok` only when `content-mount-to-timer-ready`, `content-mount-to-context-ready`, `page.metadata`, `page.upsert`, and `page.app-shell` are all `ok`; otherwise carry the first `error`, then `timeout`, then `pending` status from these required stages. Store the result on each opening. Keep the overall benchmark `partial` while worker/renderer attribution and real Submit remain pending.
- [ ] **Step 5: Update only startup-only report assembly.** In `collectStartup`, encode warm/cold openings once, store count/p50/p95 summaries without a `samples` field, retain worker observations only under `unattributedWorker`, and set `startup.schemaVersion = 2`. Startup-only mode writes the fixed replacement path `docs/superpowers/evidence/responsive-overlay/overlay-startup-standard.json`; the other probe modes retain their timestamped output paths. Export `validateStartupReport(report)` from the pure helper; it decodes every opening, recomputes all summaries, and rejects a mismatch or malformed opening. Add `scripts/validate-overlay-startup-report.mjs` as a CLI accepting exactly one report path and exiting nonzero on validation failure. The existing FSRS operation, restore, and preview report shapes stay unchanged. Record the source commit and packaged build SHA-256.
- [ ] **Step 6: Run green and commit.** `rtk proxy node --test scripts/overlay-startup-samples.test.mjs`; expect pass. Stage only the four script files and commit `fix(overlay): validate compact startup samples`.

## Task 3: Recollect evidence and reconcile documentation

**Files:** replacement `docs/superpowers/evidence/responsive-overlay/overlay-startup-*.json`, `docs/superpowers/handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md`, `docs/testing.md`, `docs/superpowers/README.md`.

- [ ] **Step 1: Validate committed source.** Ensure Tasks 1–2 are committed. Run `rtk proxy git worktree add --detach /private/tmp/cognipace-overlay-baseline-clean HEAD` from the PR branch, then run `rtk npm ci`, `rtk proxy env COGNIPACE_SCALING=standard npm run test -- src/testing/fsrs-scaling-benchmark.test.ts`, and `rtk npm run build` in that clean checkout. Record its `rtk git rev-parse HEAD` output and build digest. Never restore the fixture in a personal Chrome profile.
- [ ] **Step 2: Run the packaged baseline.** In the clean checkout, run `rtk proxy node scripts/fsrs-scaling-chrome.mjs --backup test-results/fsrs-phase-g/standard-backup.json --dataset standard --problem-url https://leetcode.com/problems/two-sum/ --startup-only --samples 20 --cold-samples 10`. Expect `docs/superpowers/evidence/responsive-overlay/overlay-startup-standard.json` with 20 warm and 10 cold slots. A `partial` report is expected to exit 1; record that as an incomplete benchmark, not a pass. If Chrome or LeetCode is unavailable, record the exact failure and do not reuse the old report as a new measurement.
- [ ] **Step 3: Validate the report.** In the clean checkout, run `rtk proxy node scripts/validate-overlay-startup-report.mjs docs/superpowers/evidence/responsive-overlay/overlay-startup-standard.json`. Check that all summary counts and percentiles derive from its compact raw arrays, all statuses and fixture/build metadata are present, no forbidden content appears, and the source commit matches the clean checkout. Copy only the sanitized report into the PR branch; delete the old 7,092-line report. Recheck the Markdown numbers against the new report rather than copying old percentiles. Remove the temporary clean checkout with `rtk proxy git worktree remove /private/tmp/cognipace-overlay-baseline-clean` after copying its report.
- [ ] **Step 4: Update the handoff and links.** In `docs/testing.md`, `docs/superpowers/README.md`, and the handoff, link the replacement report and state its measured/partial/pending facts. Explain the separate timer/context statuses, worker and renderer attribution limits, and provenance. Keep human installed-extension smoke, screenshots, affected-profile trace, and authenticated Submit comparison marked pending. Stage only the replacement evidence and named Markdown files; commit `docs(overlay): replace verbose startup baseline`.

## Task 4: Final validation and PR handoff

**Files:** only any focused fixes found by validation; PR #211 body.

- [ ] **Step 1: Run required gates.** From the PR worktree, run `rtk npm run test -- src/lib/performance/overlay-startup-timing.test.ts src/lib/leetcode/watcher/leetcode-page-watcher.test.ts`, `rtk proxy node --test scripts/overlay-startup-samples.test.mjs`, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk proxy ./node_modules/.bin/prettier --ignore-path /dev/null --check docs/superpowers/specs/2026-10-12-overlay-baseline-pr-cleanup-design.md docs/superpowers/plans/2026-10-12-overlay-baseline-pr-cleanup.md docs/superpowers/handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md docs/testing.md docs/superpowers/README.md`, and `rtk git diff --check`. Report exact results. `rtk npm run db:generate` is skipped if schema is unchanged; `rtk npm run zip` is skipped if extension artifact behavior is unchanged. If the unrelated package edits make the local build nonrepresentative, use the clean checkout's build result and state that distinction.
- [ ] **Step 2: Review the actual diff.** Check that the old report is deleted, the new report has no duplicated samples or private content, the collector's other modes still work, and the branch contains no unrelated package edits. Verify PR size and inspect any failing checks. Resolve concrete issues and rerun only affected gates.
- [ ] **Step 3: Push and update draft PR #211.** Push `codex/overlay-startup-baseline`; update its body with the new evidence link, exact validation commands, remaining manual proof, release impact, and rollback. Keep it draft until human installed-extension happy/edge smoke and visual proof are attached. Do not claim the reported 30-second live delay or LeetCode judging effect is fixed by this phase.
