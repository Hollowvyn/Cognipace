# Responsive Overlay Phase 1: Startup Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify the stage responsible for delayed LeetCode overlay readiness and record a reproducible packaged-extension baseline before changing startup behavior.

**Architecture:** Fixed-name User Timing entries measure content-script and service-worker stages on their own clocks. An extension trace and a disposable Chrome profile with the existing 5,000-review fixture provide raw warm/cold samples and renderer long-task evidence. Measurement does not change runtime payloads, database writes, timer rules, review acceptance, sync, or LeetCode submission handling.

**Tech Stack:** WXT Chrome MV3, TypeScript, React, Vitest, Chrome DevTools Performance/User Timing, existing Phase G fixture and packaged Chrome driver.

---

**Approved design:** [Responsive LeetCode overlay startup](../specs/2026-10-12-responsive-leetcode-overlay-startup-design.md), Phase 1 only. Phase 2 (early identity and timer), Phase 3 (narrow local core read), and any measured repair require their own implementation plans. This phase is complete even if the user's 30-second live-profile delay cannot be reproduced; record that gap explicitly.

**Plan status:** Historical execution plan, with its original step checkboxes retained as planning prompts rather than a completion ledger. Phase 1 page-stage measurement and documentation were implemented on `codex/overlay-startup-baseline`. The packaged baseline is partial: worker attribution, renderer attribution, real Submit comparison and human installed-extension proof remain pending. The [handoff](../handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md) records actual results, validation and open gates. Phase 2 and later plans remain separate.

## File map

| File                                                                                                      | Responsibility                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/lib/performance/overlay-startup-timing.ts` (new)                                                     | Fixed, content-free stage names and a small timing wrapper usable in page and worker contexts.   |
| `src/lib/performance/overlay-startup-timing.test.ts` (new)                                                | Verify stage names, timing and exception propagation without recording payloads.                 |
| `src/entrypoints/leetcode.content.tsx`                                                                    | Mark the moment the content script begins mounting.                                              |
| `src/lib/leetcode/watcher/leetcode-page-watcher.ts`                                                       | Time page snapshot and submit-click capture; mark metadata request boundaries.                   |
| `src/features/overlay-session/hooks/use-leetcode-page-sync.ts`                                            | Time upsert response and app-shell context arrival on the content-script clock.                  |
| `src/features/overlay-session/hooks/use-overlay-review-preview.ts`                                        | Time the FSRS preview request after generation is known.                                         |
| `src/features/app-shell/api/app-shell-api.ts`                                                             | Time the overlay app-shell runtime request, including initial query and refresh.                 |
| `src/features/app-shell/server/app-shell-service.ts`                                                      | Time Practice, queue and track work inside the existing overlay read.                            |
| `src/features/overlay-session/components/overlay-shell.tsx`                                               | Mark when the rendered timer control is enabled in the current session.                          |
| `src/extension/background/register-handlers.ts`                                                           | Time authorized metadata, app-shell, upsert and snapshot-publication stages on the worker clock. |
| `scripts/fsrs-scaling-chrome.mjs`                                                                         | Extend the disposable packaged driver with startup-only sampling.                                |
| `scripts/overlay-startup-samples.mjs` and `.test.mjs` (new)                                               | Summarize successful samples and project sanitized raw records.                                  |
| `docs/superpowers/evidence/responsive-overlay/` (new)                                                     | Sanitized raw samples and trace metadata, without page or review contents.                       |
| `docs/testing.md` and `docs/superpowers/handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md` (new) | Reproduction steps, measured findings and explicit remaining proof.                              |

## Task 1: Add fixed-name timing primitives

**Files:** Create `src/lib/performance/overlay-startup-timing.ts` and `src/lib/performance/overlay-startup-timing.test.ts`.

- [ ] **Step 1: Write the failing test.** Check fixed stage labels, numeric elapsed time, synchronous return values, and asynchronous error propagation. The central assertions are:

  ```ts
  const mark = vi.spyOn(performance, 'mark')
  const measure = vi.spyOn(performance, 'measure')
  markOverlayStartup('content-mount')
  expect(mark).toHaveBeenCalledWith('cognipace.overlay.content-mount')
  expect(timeOverlayStartupSync('page.snapshot', () => 7)).toBe(7)
  expect(measure).toHaveBeenCalledWith(
    'cognipace.overlay.page.snapshot',
    expect.objectContaining({
      start: expect.any(Number),
      end: expect.any(Number),
    }),
  )
  await expect(
    timeOverlayStartup('page.upsert', async () => {
      throw new Error('offline')
    }),
  ).rejects.toThrow('offline')
  expect(measure).toHaveBeenCalledWith(
    'cognipace.overlay.page.upsert',
    expect.objectContaining({
      start: expect.any(Number),
      end: expect.any(Number),
    }),
  )
  ```

- [ ] **Step 2: Run the focused test red.** Run `rtk npm run test -- src/lib/performance/overlay-startup-timing.test.ts`; expect an import failure before the module exists.
- [ ] **Step 3: Implement the complete primitive with fixed stage names only.** Use the following module; call sites never pass a slug, URL, code, payload, or error text to a mark or measure.

  ```ts
  export type OverlayStartupMark =
    | 'content-mount'
    | 'url-ready'
    | 'page-ready'
    | 'context-ready'
    | 'timer-ready'

  export type OverlayStartupMeasure =
    | 'page.snapshot'
    | 'page.metadata'
    | 'page.upsert'
    | 'page.app-shell'
    | 'page.preview'
    | 'page.submit-event'
    | 'page.submit-capture'
    | 'worker.metadata'
    | 'worker.app-shell'
    | 'worker.overlay-practice'
    | 'worker.overlay-queue'
    | 'worker.overlay-track'
    | 'worker.upsert'
    | 'worker.snapshot-publish'

  export function markOverlayStartup(stage: OverlayStartupMark): void {
    performance.mark(`cognipace.overlay.${stage}`)
  }

  export function timeOverlayStartupSync<T>(
    stage: OverlayStartupMeasure,
    work: () => T,
  ): T {
    const start = performance.now()
    try {
      return work()
    } finally {
      performance.measure(`cognipace.overlay.${stage}`, {
        start,
        end: performance.now(),
      })
    }
  }

  export async function timeOverlayStartup<T>(
    stage: OverlayStartupMeasure,
    work: () => Promise<T> | T,
  ): Promise<T> {
    const start = performance.now()
    try {
      return await work()
    } finally {
      performance.measure(`cognipace.overlay.${stage}`, {
        start,
        end: performance.now(),
      })
    }
  }
  ```

- [ ] **Step 4: Run green and commit.** Run `rtk npm run test -- src/lib/performance/overlay-startup-timing.test.ts`; expect pass. Commit with `rtk git add src/lib/performance/overlay-startup-timing.ts src/lib/performance/overlay-startup-timing.test.ts` and `rtk git commit -m "test(overlay): add startup timing primitives"`.

## Task 2: Mark the existing serial startup and synchronous click work

**Files:** Modify `src/entrypoints/leetcode.content.tsx`, `src/lib/leetcode/watcher/leetcode-page-watcher.ts`, `src/features/overlay-session/hooks/use-leetcode-page-sync.ts`, `src/features/app-shell/api/app-shell-api.ts`, `src/features/overlay-session/components/overlay-shell.tsx`, and `src/extension/background/register-handlers.ts`; test `src/lib/leetcode/watcher/leetcode-page-watcher.test.ts`, `src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx`, `src/features/app-shell/api/app-shell-api.test.ts`, and `src/features/overlay-session/components/overlay-shell.test.tsx`.

- [ ] **Step 1: Write focused failing tests.** Spy on `performance.measure` in the watcher suite. A held `readProblemMetadata` promise must leave `page.metadata` open while `page.snapshot` has completed; a recognized Submit click must record both `page.submit-event` and nested `page.submit-capture` without changing the emitted attempt. In the overlay-session hook suite, keep the upsert promise pending and assert `page.upsert` has not completed; resolve it and assert the stage completes before saved context is ready. Do not add a fake timer assertion that assumes LeetCode's network speed.
- [ ] **Step 2: Run red.** Run `rtk npm run test -- src/lib/leetcode/watcher/leetcode-page-watcher.test.ts src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx`; expect only the new timing assertions to fail.
- [ ] **Step 3: Instrument page boundaries without reordering work.** Import the primitive from `@/lib/performance/overlay-startup-timing`. In the content script, call `markOverlayStartup('content-mount')` at the beginning of `onMount`. In `activateFromCurrentUrl`, mark `url-ready` immediately after accepting a new location. In `readAndEmitProblemDetails`, use the synchronous wrapper for the DOM snapshot and the asynchronous wrapper for the remote read; mark `page-ready` where that event is emitted. Wrap the entire synchronous `handleClick` body and accepted Command/Ctrl+Enter branch in `page.submit-event`, including `readLeetCodeSubmissionClickFromMouseEvent`. In `handleSubmission`, use a nested `page.submit-capture` measure around the existing code capture so event dispatch stays synchronous:

  ```ts
  const pageSnapshot = timeOverlayStartupSync('page.snapshot', () =>
    readLeetCodePageSnapshot(documentRef, { location, now }),
  )
  const metadataReadResult = await timeOverlayStartup('page.metadata', () =>
    remoteClient.readProblemMetadata({
      location,
      auth: readLeetCodeRemoteAuthFromDocument(documentRef),
    }),
  )
  // In handleSubmission, retain the surrounding event order:
  const attempt = timeOverlayStartupSync('page.submit-capture', () =>
    readLeetCodeSubmissionAttempt({
      attemptId: crypto.randomUUID(),
      click,
      editorRoot: documentRef,
    }),
  )
  ```

- [ ] **Step 4: Instrument content-script runtime waits.** In `syncProblem`, replace only the awaited upsert expression with:

  ```ts
  await timeOverlayStartup('page.upsert', () =>
    upsertProblemFromPageViaRuntime({
      surface: 'content-script',
      url: nextMetadata.location.url,
      slug: nextMetadata.location.slug,
      title: nextMetadata.title,
      difficulty: nextMetadata.difficulty,
      isPremium: nextMetadata.isPremium,
      topicLabels: nextMetadata.topics.map((topic) => topic.name),
    }),
  )
  ```

  In `src/features/app-shell/api/app-shell-api.ts`, wrap the body of `getOverlayAppShellDataViaRuntime` in `timeOverlayStartup('page.app-shell', async () => ...)`, so the initial query and `refreshContext` are covered. In `use-leetcode-page-sync.ts`, mark `context-ready` in the existing effect only after `context.problem` passes its guard. In `overlay-shell.tsx`, use a ref keyed by the valid location slug and mark `timer-ready` in an effect after `canUseProblem` becomes true; reset that ref on slug change. This records baseline readiness after the button has rendered without changing its disabled logic. Keep `syncTokenRef` stale-result checks and review-generation behavior intact.
  In `src/features/overlay-session/hooks/use-overlay-review-preview.ts`, wrap the existing `previewPracticeReviewViaRuntime(request)` expression with `timeOverlayStartup('page.preview', () => previewPracticeReviewViaRuntime(request))`. Keep the preview query key and its enabled condition unchanged.

- [ ] **Step 5: Instrument worker boundaries after sender validation.** Wrap the existing metadata handler's service call in `timeOverlayStartup('worker.metadata', () => readLeetCodeProblemMetadataInBackground(request))`, the app-shell service call in `worker.app-shell`, and the validated page upsert's `runDbMutation(...)` in `worker.upsert`. In `getOverlayPayload` in `src/features/app-shell/server/app-shell-service.ts`, time the existing `getPracticeDetails`, `getTodayQueue` and `getActiveTrack` expressions as `worker.overlay-practice`, `worker.overlay-queue` and `worker.overlay-track` inside the existing `Promise.all`; preserve their concurrency and output. In `runDbMutation`, replace only `await flushDbSnapshot()` with `await timeOverlayStartup('worker.snapshot-publish', () => flushDbSnapshot())`; preserve the same awaited order and exception path. This stage is generic to durable mutations, so correlate its entry with the surrounding upsert span rather than treating every snapshot entry as startup work.
- [ ] **Step 6: Run green and commit.** Run the focused command from Step 2, then `rtk npm run test -- src/features/app-shell/api/app-shell-api.test.ts src/features/app-shell/server/app-shell-service.test.ts src/features/overlay-session/components/overlay-shell.test.tsx src/extension/background/register-handlers.test.ts`. Expect no changed event order, acknowledgement, or review behavior. Commit the exact files touched in this task with `rtk git commit -m "perf(overlay): trace startup stages"`.

## Task 3: Collect packaged warm and cold evidence

**Files:** Modify `scripts/fsrs-scaling-chrome.mjs`; create `scripts/overlay-startup-samples.mjs`, `scripts/overlay-startup-samples.test.mjs`, and `docs/superpowers/evidence/responsive-overlay/` records. Keep all profile writes under `/private/tmp`.

- [ ] **Step 1: Add a collector self-test for sample math and redaction.** In `scripts/overlay-startup-samples.test.mjs`, use five successful samples `[10, 20, 30, 40, 50]` plus one timeout. Assert nearest-rank p95 is `50`, the timeout remains in the raw list but does not affect p95, and serialized output has no URL, slug, code or review payload. Run `rtk proxy node --test scripts/overlay-startup-samples.test.mjs`; expect red before the helper exists. Implement the pure core as:

  ```js
  export function summarizeStartupSamples(samples) {
    const successful = samples
      .filter((sample) => sample.status === 'ok')
      .map((sample) => sample.ms)
      .sort((left, right) => left - right)
    const rank = (fraction) =>
      successful[Math.ceil(successful.length * fraction) - 1] ?? null
    return {
      samples: samples.map(({ stage, status, ms }) => ({ stage, status, ms })),
      count: successful.length,
      p50: successful.length >= 5 ? rank(0.5) : null,
      p95: successful.length >= 5 ? rank(0.95) : null,
    }
  }
  ```

- [ ] **Step 2: Build the packaged extension and fixture.** Run `rtk npm run build` and `rtk proxy env COGNIPACE_SCALING=standard npm run test -- src/testing/fsrs-scaling-benchmark.test.ts`; expect `dist/chrome-mv3` and `test-results/fsrs-phase-g/standard-backup.json`. Verify 250 problems and 5,000 reviews using the existing Phase G restore validation; do not load it into a personal Chrome profile.
- [ ] **Step 3: Add `--startup-only` and `--cold-samples 10` to the existing driver.** After the existing verified fixture restore, open `https://leetcode.com/problems/two-sum/` once outside measurement to let the current page upsert add a real known slug; verify the saved problem exists. The 5,000-review fixture remains intact, while this extra unreviewed problem gives a real page URL for subsequent known-problem opens. In startup-only mode, skip the existing Save/Update/backup operation loop and use its `launchChrome`, `openTarget`, `evaluate`, context discovery and cleanup functions. Record 20 fresh-tab warm opens on the same worker and 10 full-browser cold restarts on the same published profile. For each open, require a fresh extension isolated context, await `timer-ready` or a bounded 30-second timeout, and collect only fixed-prefix marks and measures:

  ```js
  const entries = await evaluate(
    chrome.cdp,
    tab,
    `performance.getEntries().filter(e => e.name.startsWith('cognipace.overlay.')).map(e => ({name:e.name,kind:e.entryType,startTime:e.startTime,duration:e.duration}))`,
    30_000,
    isolated.id,
  )
  ```

  Associate marks within each fresh page context; read worker measures from the worker target separately and never subtract clocks across contexts. Record navigation-to-content-mount, content-mount-to-timer-ready, content-mount-to-context-ready, per-stage durations, failures and exact profile/build metadata. Capture one warm and one cold Chrome Performance trace; name any CogniPace renderer task over 50 ms. Do not store the full trace if it contains page or code text; save only the sanitized timing projection and an attribution note.

- [ ] **Step 4: Sample LeetCode Submit separately.** In the same disposable profile, capture a Performance trace around a real LeetCode code Submit. Report the full synchronous `page.submit-event` duration, nested `page.submit-capture` duration, any CogniPace-attributed long task, and whether a comparison run with CogniPace disabled was available. Do not infer that judging latency is caused by the extension from a spinner alone. Do not submit private code or store submitted-code text in evidence.
- [ ] **Step 5: Run collector proof and commit.** Run `rtk proxy node --test scripts/overlay-startup-samples.test.mjs` and `rtk proxy node scripts/fsrs-scaling-chrome.mjs --backup test-results/fsrs-phase-g/standard-backup.json --dataset standard --problem-url https://leetcode.com/problems/two-sum/ --startup-only --samples 20 --cold-samples 10`. Expect a sanitized JSON report with 20 warm and 10 cold raw sample slots, explicit failure statuses, nearest-rank p95 only when at least five samples succeed, and browser/build/fixture metadata. If LeetCode or CDP cannot load, preserve the exact failure and leave packaged latency acceptance pending; do not substitute unit-test timings. Commit collector and tests with `perf(overlay): capture packaged startup baseline`.

## Task 4: Interpret, validate and hand off

**Files:** Create `docs/superpowers/handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md`; modify `docs/testing.md`, `docs/superpowers/README.md` and the plan status only after actual evidence exists.

- [ ] **Step 1: Analyze the raw samples.** Report warm/cold p50 and nearest-rank p95, sample counts and failures; identify the dominant serial stage, worker snapshot share, and renderer long tasks. State separately what the disposable fixture proves and whether the 30-second real-profile symptom was reproduced. If metadata, upsert or app-shell waits dominate, pass the measured shares to the Phase 2/3 plan. If click capture exceeds 50 ms, reserve its repair for Phase 4 with a focused trace.
- [ ] **Step 2: Add reproducible smoke instructions.** In `docs/testing.md`, list the exact disposable-profile setup, warm/cold definition, Performance trace capture, known/new problem checks and real LeetCode Submit comparison. Require human installed-extension happy-path and edge-case testing plus screenshot/recording proof before PR review or merge; mark that proof pending until supplied.
- [ ] **Step 3: Run full validation and report exact outcomes.** Run focused tests first, then `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk proxy ./node_modules/.bin/prettier --ignore-path /dev/null --check docs/testing.md docs/superpowers/README.md docs/superpowers/plans/2026-10-12-responsive-overlay-phase-1-baseline.md docs/superpowers/handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md`, and `rtk git diff --check`. `rtk npm run db:check` is included by `check`; no schema or DB behavior changes are planned, so `db:generate` is skipped. `zip` is skipped because extension artifact behavior is unchanged. Record exact skipped commands and reasons, including any unavailable packaged or human proof.
- [ ] **Step 4: Prepare a PR-ready handoff.** Use `.github/PULL_REQUEST_TEMPLATE.md` for the summary, risk, release impact and rollback sections. Keep review and merge blocked on required human smoke and visual proof. Commit documentation as `docs(overlay): record startup baseline`.

## Done when

The packaged baseline has raw stage samples, explicit warm/cold definitions and failures, a named dominant stage or an honest unreproduced result, and renderer/Submit trace findings. Instrumentation has fixed names only and leaves request ordering, durable acknowledgement and UI behavior unchanged. Automated checks pass or each failure is stated; human installed-extension proof remains a required gate before PR review or merge.
