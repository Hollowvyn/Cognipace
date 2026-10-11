# FSRS Phase E: Daily Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate prospective daily FSRS scheduling and consistent local-day eligibility across Practice, Queue, Analytics, and reminders while preserving historical evidence and progress.

**Architecture:** Practice owns the active profile and derived eligibility. Queue and current Analytics consume that policy; Analytics uses recorded evidence for historical model estimates. Existing durable review commands, raw due dates, and persisted history remain authoritative.

**Tech Stack:** TypeScript, ts-fsrs 5.4.0, React 19, Zod, Drizzle/SQLite WASM, Vitest, WXT Chrome MV3.

---

## Baseline, decision, and boundaries

- Baseline is the clean `codex/fsrs-phase-e-daily-scheduling` branch at `origin/main` commit `a7944466`. PR #205 merged as `c6563ced`; Phase D's captured profile, guarded Update, frozen command, receipt and durable acknowledgement code are present. Main also includes Analytics PR #206. Do not rebase this plan onto the old D worktree head.
- The owner's October 10 decision keeps native `maximum_interval: 180` and accepts the pinned library's ordered outputs up to **183 days**. This is a configured 180-day target, not a strict ceiling. In ts-fsrs 5.4.0 / FSRS 6, each raw interval is capped before LongTermScheduler enforces Again < Hard < Good < Easy. A mature card at 75% returned 40/180/181/182 days and at 90% returned 7/180/181/182. At an extreme target of 0.000001 it returned 180/181/182/183. Preserve those native card/log values and explain the limit in current docs and Settings copy.
- Existing cards with due dates beyond 180 days retain their raw date until a genuine Save. Update reconstructs the original event profile even when its maximum exceeds 180. No bulk reschedule, history replay, reset, second scheduler, new permission, sync expansion, or new persistence schema.
- Phase F owns rating previews. E proves the same facade and profile remain usable by future `repeat()` previews; E does not build preview UI or promise preview/save equality at different event times.
- D's installed-extension smoke and visual proof still appear pending in merged PR #205's body. E must document its own human proof as pending until supplied.

## Ownership and file map

| Unit                  | Exact files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Responsibility                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Native profile        | `src/features/practice/data/practice-repository.ts`, `src/lib/fsrs/domain/scheduling-options.ts`, `src/lib/fsrs/scheduler/review-scheduler.ts`                                                                                                                                                                                                                                                                                                                                                                                 | Active Save policy and exact profile reconstruction; leave legacy profile defaults intact for old evidence.        |
| Study day             | `src/features/practice/domain/practice-schedule.ts`, `practice.ts`, `src/features/practice/api/practice-contracts.ts`, `practice-serializers.ts`                                                                                                                                                                                                                                                                                                                                                                               | Derive local calendar eligibility separately from raw `dueAt`; return the same result to all read consumers.       |
| Queue and shell       | `src/features/queue/domain/queue.ts`, `server/queue-service.ts`, `api/queue-api.ts`, `src/platform/query/query-keys.ts`, `src/extension/messaging.ts`, `src/extension/background/register-handlers.ts`, `src/features/app-shell/server/app-shell-service.ts`, `api/app-shell-contracts.ts`, `components/overview/overview-panels.tsx`, `components/overview-screen.tsx`, `src/features/app-shell/hooks/use-popup-app-shell-controller.ts`, `src/app/popup/popup-shell.tsx`, `src/app/popup/components/recommendation-card.tsx` | Full goal cap for automatic overdue/due/new queue; explicit Extra Practice request and action for future cards.    |
| Analytics evidence    | `src/features/analytics/data/analytics-repository.ts`, `domain/review-cohorts.ts`, `historical-presentation.ts`, `chart-data.ts`, `server/analytics-service.ts`, `api/analytics-contracts.ts`                                                                                                                                                                                                                                                                                                                                  | Recorded profile/pre-card historical model, labeled compatibility/gaps, current eligibility and truthful forecast. |
| Reminder and Settings | `src/extension/background/due-notification.ts`, `src/features/settings/components/sections/advanced-review-section.tsx`                                                                                                                                                                                                                                                                                                                                                                                                        | Browser-local date deduplication and accurate model/cap copy; preserve all saved settings.                         |
| Authority and handoff | `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `docs/superpowers/plans/2026-10-03-fsrs-remediation.md`, `docs/superpowers/README.md`, new Phase E handoff                                                                                                                                                                                                                                                                                                                                                       | Describe shipped policy, proof status, limits and rollback.                                                        |

The existing `practice_review_evidence` and `fsrs_scheduler_profiles` tables hold all required historical provenance. Verify this in Task 4 before deciding on schema work; a migration is not planned.

## Task 1: Native daily profile and cap proof without activation

**Files:** `src/lib/fsrs/domain/scheduling-options.test.ts`; `src/lib/fsrs/scheduler/review-scheduler.test.ts`; `src/lib/fsrs/domain/scheduler-profile.test.ts`.

- [x] Add a facade characterization test for a candidate daily profile with `targetRetention: 0.75`, `maximumInterval: 180`, `enableShortTerm: false`, `learningSteps: []`, `relearningSteps: []`, and `enableFuzz: false`. Test 90% separately. Round-trip the canonical profile through the existing serializer/parser and assert observable native scheduling outputs; the facade does not expose the private snake_case native parameter object.
- [x] Run `rtk npm run test -- src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/domain/scheduler-profile.test.ts` and record the characterization result.
- [x] Exercise the existing facade with explicit options, without changing Practice Save:

  ```ts
  const profile = createFsrsSchedulerProfile({
    targetRetention: 0.75,
    maximumInterval: 180,
    enableShortTerm: false,
    learningSteps: [],
    relearningSteps: [],
    enableFuzz: false,
  })
  ```

  Keep generic defaults and Save unchanged until Tasks 4 and 5 repair Analytics.

- [x] Table-test all four native ratings on New, Learning, Relearning and mature Review cards at saved 0.75 and 0.90, plus supported Settings endpoints 0.70 and 0.97. Probe the library validation extremes `0.000001` and `1` at 179, 180, 181 and 365 elapsed days. Assert observed native outputs and upper bound 183, not an invented 180 clamp. Assert `card.dueAt`, `card.scheduledDays` and the returned FSRS log remain library-consistent.
- [x] Run focused FSRS tests and commit the boundary proof as `test(fsrs): prove daily profile and native cap ordering`. This task must not activate the profile.

## Task 2: One Practice local-day eligibility rule

**Files:** `src/features/practice/domain/practice-schedule.ts`, `practice.ts`, `practice-schedule.test.ts`, `practice.test.ts`; `src/features/practice/api/practice-contracts.ts`, `practice-serializers.ts`, `practice-contracts.test.ts`; affected serialized fixtures.

- [x] Add a failing pure test for `eligibleOn = max(localDay(rawDueAt), nextLocalDay(actualLastReviewAt))`. Return a `YYYY-MM-DD` local-day key or equivalent explicit derived value while leaving `dueAt` unchanged. `isDue`, `isOverdue` and `overdueDays` must compare this derived key with today's local key. Suspended/unstarted cards remain not due. A same-day Update must use `reviewedAt`/`lastReviewAt`, not `updatedAt`.
- [x] Run `rtk npm run test -- src/features/practice/domain/practice-schedule.test.ts src/features/practice/domain/practice.test.ts` and confirm the added tests fail against raw-due classification.
- [x] Implement the helper within Practice using calendar date components/ordinal arithmetic. Do not add 86,400,000 milliseconds to the review instant. Thread actual last review time through `derivePracticeSummary` and `deriveNormalizedPracticeState`; expose `eligibleOn` in the normalized and summary Zod read contracts and serializers, preserving raw `dueAt`/`nextReviewAt`.
- [x] Run focused tests under controlled non-UTC timezone processes because `vitest.config.ts` pins `TZ=UTC`. Explicitly prove local midnight, spring DST (raw one-day due can fall on a later local date), autumn DST (next-day floor), timezone change and a corrected review whose `updatedAt` changes but actual event time does not. Use a separate Node child with `TZ=America/New_York` or a test-runner configuration that demonstrably overrides Vitest's pin; record the exact effective `Intl.DateTimeFormat().resolvedOptions().timeZone` in the test evidence.
- [x] Run Practice contract, details, repository and Queue candidate tests; commit as `feat(practice): derive shared calendar eligibility`.

## Task 3: Automatic queue and explicit Extra Practice

**Files:** `src/features/queue/domain/queue.ts`, `queue.test.ts`, `server/queue-service.ts`, `api/queue-api.ts`, `queue-api.test.ts`; `src/platform/query/query-keys.ts`; `src/extension/messaging.ts`, `background/register-handlers.ts`, `register-handlers.test.ts`, `runtime-policy.test.ts`; `src/features/app-shell/server/app-shell-service.ts`, `api/app-shell-contracts.ts`, `components/overview/overview-panels.tsx`, `components/overview-screen.tsx`, `components/overview-screen.test.tsx`, `hooks/use-popup-app-shell-controller.ts`, `hooks/use-popup-app-shell-controller.test.tsx`; `src/app/popup/popup-shell.tsx`, `popup-shell.test.tsx`, `components/recommendation-card.tsx`.

- [x] Change the queue tests first: automatic items contain only overdue, due today and new, with due ordered by eligible date then raw due/tie identity; `items.length <= full dailyGoal`. A future reviewed card never occupies `items` or `topRecommendation`, even if retrievability is low. Preserve suspension, premium filtering and distinct daily credit including Again. A valid legacy `mastered` card with a review card is eligible for presentation without mutating persisted track credit.
- [x] Run `rtk npm run test -- src/features/queue/domain/queue.test.ts src/features/queue/queue-track-independence.integration.test.ts` and confirm the new automatic-order tests are red.
- [x] Add an explicit, Zod-validated queue request intent, e.g. `intent: 'automatic' | 'extra-practice'` with automatic default. The extra-practice branch returns future reviewed, non-suspended, filter-compliant candidates ordered by retrievability and deterministic ties, only in response to the explicit request. Keep automatic `dueCount` and `dueToday` counts unaffected. Make the TanStack query key include intent at the actual `src/platform/query/query-keys.ts` owner. Do not add a mutation queue or persistence field.
- [x] Add a visible **Extra Practice** action in the existing popup/Overview recommendation area. Its click sends `queue.getTodayQueue` with explicit `extra-practice` intent, then presents the first eligible future card with the existing open-problem action. The automatic Today Queue and top recommendation never include that card. Handle loading, empty result and read error in the same surface; never show a future card as an automatic recommendation while the request is pending. Update `src/app/popup/popup-shell.tsx`, its recommendation card/controller, and `src/features/app-shell/components/overview-screen.tsx`/overview panel tests rather than only adding a server field. Do not add a shrinking session or Complete/Review more flow. Remove automatic reinforcement copy/counts from shell summaries where misleading; keep any separately labeled available count only if derived accurately.
- [x] Verify both runtime authorization and response Zod parsing for the new read intent; test popup/Overview action, no future card in automatic recommendation, full rolling goal cap, filters and track independence. Run the affected focused suites and commit as `feat(queue): require explicit extra practice intent`.

## Task 4: Analytics provenance before profile activation

**Files:** `src/features/analytics/data/analytics-repository.ts`, `analytics-repository.test.ts`; new `src/features/analytics/domain/historical-scheduling-evidence.ts` and test; `domain/review-cohorts.ts`, `review-cohorts.test.ts`, `historical-presentation.ts`, `historical-presentation.test.ts`, `chart-data.ts`, `chart-data.test.ts`; `server/analytics-service.ts`, `analytics-service.test.ts`; `api/analytics-contracts.ts`, `analytics-contracts.test.ts`; affected presentation components and tests.

- [x] Add RED fixtures with two captured reviews whose recorded 75%/legacy-short-term profiles differ from current 90%/daily Settings. Join `practice_review_evidence` and `fsrs_scheduler_profiles` to each historical attempt in the Analytics repository. Retain observed first/repeat assessment cohort ordering by `reviewedAt, id`; use `applicationSequence` for per-card scheduling reconstruction, including tied timestamps and corrections. Preserve all observed cohort membership and raw outcomes even when scheduling evidence is missing.
- [x] Resolve a captured event only from its recorded pre-card, event time, rating and exact serialized profile via existing FSRS parsers/facade. Distinguish `captured`, `legacy-derived` compatibility and `unknown`/insufficient evidence in typed domain results. Do not silently fall back to current Settings or default weights when recorded context is absent or invalid. Separate observed repeat eligibility and recalled counts from the nullable/provenance-tagged model estimate; missing model evidence must not erase observed outcomes. Use a shared resolved-evidence projection in repeat-recall pairs, stability observations and historical overdue intervals. Stop a known interval at an evidence gap, then resume from a later captured pre-card/event when known context returns.
- [x] Surface provenance in the affected Analytics read contract and accessible chart/table copy. Captured points are historical model estimates from recorded inputs; legacy-derived points say compatibility estimate; unknown model points show unavailable/insufficient evidence while their observed repeat outcomes remain. Keep current Retention Map rows visible, including low-retrievability future cards that are correctly not due.
- [x] For current Retention Map retrievability and target-duration computations, use the last recorded card profile when captured. Keep current saved retention as the visible target/reference. If the latest card lacks exact evidence, label a legacy compatibility estimate or insufficient evidence instead of presenting a current-default model as original history. Test a saved/imported custom-profile card after Settings retention changes and a future low-retrievability card that remains not due.
- [x] Pass the report's captured `now` into `getPracticeProgressSummary`. Prove report reads are internally consistent around midnight. Run repository, cohort, historical, chart and service suites, plus existing #206 Analytics component tests. Commit as `fix(analytics): use recorded scheduling evidence`.

## Task 5: Current Analytics, forecast and reminder equality

**Files:** `src/features/analytics/data/analytics-repository.ts`, `domain/current-state-presentation.ts`, `domain/workload-presentation.ts`, `server/analytics-service.ts`, `api/analytics-api.ts`, `api/analytics-contracts.ts` and tests; `src/extension/background/due-notification.ts`, `due-notification.test.ts`; affected app-shell tests.

- [x] Enrich `getUpcomingCards()` with card state, actual `lastReviewAt`, suspension/status and raw due, or reuse `getCurrentFsrsCards()` without a duplicate query. Do not prefilter solely by raw due if the eligible date may fall outside the 14-day window. Derive candidate eligibility through Practice and filter/bucket the fixed Today-plus-thirteen study dates on `eligibleOn`.
- [x] Use the browser-resolved timezone already sent by `analytics-api.ts` as the live study timezone in the validated request. Keep the historical report timezone as a separate domain concept and retain its fallback/selection rules; add a second request field only if a real caller can independently choose it. Compare live current due indicators and Today forecast against Practice's derived eligibility. Historical Recent Overdue Backlog retains its reporting-timezone/timestamp definition and is tested separately; it is not forced to equal the live queue. A future report-zone selection must not alter the current study queue/reminder date.
- [x] Replace reminder deduplication's `now.toISOString().slice(0, 10)` with Practice's local-day key; retain its existing local `setHours`/`setDate` alarm arithmetic. Verify two runs on the same local day send once, across local midnight and both DST transitions, and the queue's `dueToday` matches current Analytics due.
- [x] Run focused Analytics, reminder, Queue and app-shell tests, including raw future-low-retention-not-due, raw due before forecast end but eligible after end, and cross-surface equality. Commit as `fix(analytics): align current due projections with study days`.

## Task 6: Activate Save after Analytics repair, then complete acceptance

**Files:** `src/features/practice/data/practice-repository.ts`, `src/features/practice/practice-command.integration.test.ts`, `src/features/practice/practice-core.integration.test.ts`; `src/features/settings/components/sections/advanced-review-section.tsx` and tests; current authority docs in the ownership map; `docs/superpowers/handoffs/2026-10-10-fsrs-phase-e-daily-scheduling.md`; `docs/superpowers/README.md`; master roadmap.

- [x] Add a RED integration assertion that genuine Save at saved 75% captures the Task 1 daily profile; Update of an existing old-profile event still uses its original profile and review time. Run `rtk npm run test -- src/features/practice/practice-command.integration.test.ts src/features/practice/practice-core.integration.test.ts` and confirm the targeted new assertion fails.
- [x] Add a named active-profile factory in Practice and call it only on genuine Save:

  ```ts
  function createActiveDailyProfile(targetRetention: number) {
    return createFsrsSchedulerProfile({
      targetRetention,
      maximumInterval: 180,
      enableShortTerm: false,
      learningSteps: [],
      relearningSteps: [],
      enableFuzz: false,
    })
  }
  ```

  Do not change generic FSRS defaults or `getCorrectionContext`. Test new Save at 90% and 75%, repeated Update without a new review, old max/long due retained on Update, existing >180 due unchanged before genuine Save, and unchanged history/earned credit/suspension.

- [x] Keep saved 75% retention, reminders, daily goal, and independent Analytics goals unchanged through Save/Update and Settings reload. Copy must call retention an FSRS model target, not guaranteed coding success or interview readiness, and explain the configured 180-day maximum can yield native 181–183-day ordered ratings. Add no advanced Anki panel.
- [x] Add a cross-surface integration fixture around a local-day boundary: one overdue, one due today, one just reviewed with raw due today but next-day eligibility, one New, one future low-retention card, one suspended/premium card. Assert Practice, automatic Queue, popup/Overview, Library status (`src/features/problems/data/problems-repository.test.ts`), current Analytics, forecast and reminder agree; assert explicit Extra Practice can select a future card without changing automatic items. Cover legacy Learning/Relearning and same-day Update.
- [x] Update current product/architecture/testing docs and the master roadmap only after implementation matches them. State that existing >180 due dates remain until genuine review; Update can remain >180 on its original profile; configured 180 can produce 183; future low-retention points may be on Retention Map but not due. Describe the exact installed-extension happy and edge smoke steps, including Settings 75%, Save/Update/Restart, DST/local-day, automatic/Extra queue, Analytics, reminder, preserved history and assessment locks.
- [x] Add a PR-ready handoff with exact successful and failed commands, skipped commands/reasons, remaining human smoke and screenshot/recording proof, release impact and rollback. Request independent SPEC and Ponytail QUALITY review; resolve actionable findings and rerun affected checks.

## Required validation and PR gate

Run focused tests after each task, then run the strictest matrix set for feature, popup/dashboard/runtime and database behavior. Run these exact final commands from the Phase E worktree and record results in the handoff:

```sh
rtk npm run db:check
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy npx prettier --ignore-path /dev/null --check docs/product.md docs/architecture.md docs/testing.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-10-fsrs-phase-e-daily-scheduling.md docs/superpowers/README.md docs/superpowers/handoffs/2026-10-10-fsrs-phase-e-daily-scheduling.md
rtk git diff --check
```

`rtk npm run db:generate` is required only if a schema change becomes necessary; if none, list it as skipped with that reason. `rtk npm run zip` is required only if artifact behavior changes; otherwise list it as skipped with that reason. Live AI provider evaluation and G/H optimizer/performance experiments are outside E and must be named as skipped where relevant. Vitest's effective timezone must be proven in the non-UTC child/probe rather than inferred from shell `TZ`.

Create a Conventional Commit titled draft Phase E PR against current `main` with the repository template, link this plan and handoff, and mark human installed-extension happy-path, edge-case smoke and screenshot/recording proof **pending** until the engineer supplies it. Do not mark the PR ready for review or merge before that proof. Attach the PR to this task.

## Self-review

The tasks cover the selected native 180 configuration, complete profile capture, legacy preservation, local-day eligibility, automatic/explicit queue separation, historical evidence, current Analytics/forecast, reminders, Settings semantics, assessment locks, docs, validation and handoff. Task 1 proves the candidate profile without activating it; genuine Save switches only in Task 6 after Analytics repairs. No Phase F preview UI or Phase G/H optimization is included.
