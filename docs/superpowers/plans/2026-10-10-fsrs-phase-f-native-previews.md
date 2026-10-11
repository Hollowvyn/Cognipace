# FSRS Phase F: Native Four-Rating Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show estimated next study dates and day counts for Again, Hard, Good and Easy in the existing Overlay rating controls, for both genuine Submit and correction Update.

**Architecture:** `src/lib/fsrs` alone calls `ts-fsrs` `repeat()`. Practice builds a read-only preview from either the current card and active daily profile or the exact original correction context. A Zod-validated runtime read carries the results to a focused Overlay hook. The background serializes the read with database mutations on the shared SQLite connection, without treating it as a command or changing a draft or accepted command.

**Tech Stack:** ts-fsrs 5.4.0 / FSRS 6, Drizzle read queries, WXT runtime messaging, Zod, React 19, TanStack Query/invalidation, Vitest and Testing Library.

**Approved design:** [FSRS remediation design](../specs/2026-10-03-fsrs-remediation-design.md) and [master roadmap, Phase F](./2026-10-03-fsrs-remediation.md). This plan uses the verified `origin/main` merge commit `21b190ff` from Phase E. No new product decision is required: estimates use the existing study-day rule; an Update estimate reproduces the original event even when its date is now past. Human installed-extension smoke and visual proof remain pending from the predecessor handoff and are required for Phase F review.

**Execution:** Code, independent SPEC/Ponytail reviews and automated validation
are complete. The [Phase F handoff](../handoffs/2026-10-10-fsrs-phase-f-native-previews.md)
records the exact checks and repairs. Installed-extension smoke and visual proof
remain pending, so the review gate is open.

## Decisions and file ownership

- `src/lib/fsrs/adapter/ts-fsrs-adapter.ts`, `scheduler/review-scheduler.ts`, `index.ts`: return all four native `repeat()` outcomes, each with its card/log, from one validated card/time/profile. Keep `next()` on Save/Update.
- `src/features/practice/data/practice-repository.ts`, `server/practice-service.ts`: perform a read-only Submit or Update preview inside one consistent read transaction. Reuse `createActiveDailyProfile`, initial-card construction, and `getCorrectionContext`; extract the exact latest attempt/revision guard shared with Update. Check requested generation without inserting rows. Load Settings only for genuine Submit retention and the validated legacy-derived fallback; never substitute today's profile for captured historical evidence. Preserve `legacy-derived` provenance after repeated corrections.
- `src/features/practice/api/practice-contracts.ts`, `practice-api.ts`, `index.ts`; `src/extension/messaging.ts`, `background/runtime-policy.ts`, `background/register-handlers.ts`: define strict Zod request/response and one authorized read method. Represent `ready`, `unavailable` with a reason, and `conflict` with a reason; transport errors remain errors. No receipt, flush, dirty sync marker, invalidation broadcast or mutation reservation on preview.
- `src/features/overlay-session/hooks/use-overlay-review-preview.ts`, `use-leetcode-overlay-session.ts`, `src/platform/query/query-keys.ts`, `cache-invalidation.ts`: fetch once per relevant context and session mode, ignore superseded results by request identity, SPA sync token and a separate Restart epoch, and expose loading/ready/unavailable/error. Give previews their own Practice query key; Practice and Settings invalidation must refetch it even though app-shell context does not carry retention. Use the latest acknowledged Practice context held by review actions immediately after Save/Update, even if rendered app-shell data or next-step refresh lags. The hook never writes `selectedRating` or changes accepted commands.
- `components/overlay-shell.tsx`, `modes/expanded/expanded-overlay.tsx`, `overlay-assessment-rail.tsx`: show a short date/day estimate for each rating inside its existing button, with full accessible text. Keep locked grades disabled and explain their existing lock. Show honest loading, unavailable, failed and past-date states. A preview failure never disables an otherwise valid Save/Update.
- Authority docs, roadmap/index and Phase F handoff: describe only shipped behavior and exact proof. No schema or migration is planned.

The UI day count is the number of local calendar days from the event being simulated to `eligibleOn`: Submit uses captured preview time, Update uses the original review time. The explicit local study date remains visible. For a past Update result, copy says “Past study date” (and can say “N days after original review”); it never says “in N days.” Raw `dueAt` and native `scheduledDays` remain separate in the response. This keeps the day count meaningful across midnight and DST without doing 24-hour arithmetic.

The wire request is a strict discriminated union, `{ mode: 'submit', surface, problemSlug, generation, previewedAt }` or `{ mode: 'update', surface, problemSlug, generation, targetAttemptId, expectedRevision, reviewedAt }`. The ready response echoes an identity made from those fields and carries `evidence: 'active' | 'captured' | 'legacy-derived'` plus a fixed four-rating record of `{ dueAt, eligibleOn, studyDays, scheduledDays }`. `studyDays` is the integer difference between the local event and eligible date keys; it is presentation timing, not an FSRS interval. Unavailable and conflict variants echo the same identity and a Zod-enumerated reason. The UI checks response identity before displaying it.

## Task 1: Native four-rating facade

**Files:** `src/lib/fsrs/adapter/ts-fsrs-adapter.ts`, `src/lib/fsrs/scheduler/review-scheduler.ts`, `src/lib/fsrs/index.ts`, `src/lib/fsrs/scheduler/review-scheduler.test.ts`.

- [ ] Add a failing table-driven test for each `reviewRatings` entry: given the same pre-card, event time and exact profile, `previewReviewWithProfile(...)[rating]` and `scheduleReviewWithProfile(...)` have identical serialized card/log. Include New, Learning, Relearning and mature Review; daily 90%/75%, native 180 boundary through 183, and an older larger-maximum profile.
- [ ] Implement `previewReviewWithProfile(card, at, profile)` through `fsrs(nativeProfileParameters(profile.parameters)).repeat(toTsFsrsCard(card), at)` after the same canonical profile/time/card checks used by `scheduleReviewWithProfile`. Convert each native card/log through the existing codecs; do not calculate or clamp intervals.
- [ ] Export the pure facade and rerun `rtk npm run test -- src/lib/fsrs/scheduler/review-scheduler.test.ts`.

## Task 2: Practice read-only context and calendar result

**Files:** `src/features/practice/data/practice-repository.ts`, `server/practice-service.ts`, a focused `server/practice-preview.ts` if it keeps repository concerns smaller, `domain/practice-schedule.ts`, `src/features/practice/practice-command.integration.test.ts`, `src/features/practice/practice-core.integration.test.ts`.

- [ ] Add failing integration tests that compare Submit preview to accepted Save under frozen card/profile/time and Update preview to accepted correction under original pre-card/profile/event time. Include a missing-card genuine Submit and assert it inserts no card/profile. Assert exact target/revision/generation checks, unchanged DB snapshot after reads, no receipt/track credit/profile insertion, preserved 75% Settings, first and repeated supported legacy-derived label, rejected ambiguous legacy, past-date Update result, local midnight and both DST transitions.
- [ ] Factor the existing correction target/revision check into a shared read-only validator. Resolve generation, current card, latest attempt, max sequence, revision, original review time, evidence kind and correction context in one consistent read transaction. Read the current card and Settings for Submit; construct a New card exactly as Save does when absent. For Update, use the same `getCorrectionContext` as the authoritative correction, with current saved retention supplied only for verified legacy reconstruction. Return a typed unavailable reason for unsupported context and typed conflicts for stale target/revision/generation; never return a ready preview from mixed pre/post mutation rows. Reuse Practice's study-day calculation with the simulated event time, and calculate calendar day count from those dates.
- [ ] Confirm preview never calls write helpers, snapshot flush or sync metadata. Rerun the two Practice integration suites.

## Task 3: Validated authorized runtime read

**Files:** `src/features/practice/api/practice-contracts.ts`, `practice-api.ts`, `index.ts`, `src/extension/messaging.ts`, `background/runtime-policy.ts`, `background/register-handlers.ts`, matching contract/policy/handler tests.

- [ ] Add request/response contract tests: strict `surface`, slug, mode, captured preview time for Submit, generation and exact attempt/revision for Update; four finite native results with ISO `dueAt`, local `eligibleOn`, day count, provenance, and an echoed response identity matching the requested context. Authorize only `content-script` for this Overlay-only read and prove the surface claim cannot bypass sender policy. Test malformed native fields, invalid payload and unauthorized sender rejection.
- [ ] Register `practice.previewReview` as a read-only handler using `getAppDb()` and the Practice service. Parse both directions with Zod. Serialize its transaction through `runGatedMutationQueue` because the background shares one SQLite connection with Save/Update; this is a database access gate and performs no command mutation. Keep `runPracticeReviewCommand` and `runDbMutation` out of this path; no invalidation or write-side effects.
- [ ] Run focused contract, runtime-policy and handler suites.

## Task 4: Overlay async lifecycle and accessible estimates

**Files:** `src/features/overlay-session/hooks/use-overlay-review-preview.ts` (new), `use-leetcode-overlay-session.ts`, `src/platform/query/query-keys.ts`, `cache-invalidation.ts`, `components/overlay-shell.tsx`, `components/modes/expanded/expanded-overlay.tsx`, `components/modes/expanded/overlay-assessment-rail.tsx`, focused hook/component tests.

- [ ] Write failing hook tests for Submit/Update mode, Restart, SPA navigation, invalidation, out-of-order responses, error, and conflict. Cover acknowledgement updating `latestContextRef` before rendered app-shell data refreshes and next-step fetch failure; the new preview must use the acknowledged card. A stale Update conflict must clear its old ready estimate while retaining the draft. Ensure refetch never overwrites the selected draft and that pending accepted Save/Update and same-command Retry retain existing locks. Test a final AI effective rating differing from the selected draft; preview must remain an estimate and not alter command construction.
- [ ] Implement a focused preview hook with an echoed response identity and query-key supersession using context, mode and a separate Restart/page epoch. Fetch on Practice/Settings invalidation through a dedicated query key; capture preview time when dispatching a Submit read, without freezing actual submission time. Take Update identity from `submittedSession`, not newly refetched Practice. Use the acknowledged Practice generation after Save/Update, even before shell refetch finishes. Explicitly clear/refresh preview on a command conflict, and suppress in-flight preview publication while an accepted command is pending. Invalidate/ignore old requests on Restart and navigation. Preserve the current selection in the reducer.
- [ ] Add concise date/day text to each existing rating button and an accessible expanded description. Keep disabled grades disabled. Represent loading, unavailable, failed and past-date Update states accurately, with “Past study date” rather than a future-looking day count; add a component regression. Keep action buttons independent of preview status.
- [ ] Run `rtk npm run test -- src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx src/features/overlay-session/components/overlay-shell.test.tsx` plus any new focused hook suite.

## Task 5: Acceptance, documentation and PR handoff

**Files:** `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `docs/superpowers/plans/2026-10-03-fsrs-remediation.md`, `docs/superpowers/README.md`, `docs/superpowers/handoffs/2026-10-10-fsrs-phase-f-native-previews.md` (new), PR template body.

- [ ] Run a fixed-input end-to-end parity matrix across all four ratings, both operations and relevant states/retentions; prove the read has no DB write. Record exact commands and failures repaired.
- [ ] Update authority docs only after implementation. Document estimate timing, original-profile Update, native 181–183-day results, past dates, legacy labels, unavailable/failure states, locks and draft behavior. Add human installed-extension happy/edge smoke instructions and screenshot/recording requirement.
- [ ] Request independent SPEC/plan and Ponytail QUALITY review, resolve actionable findings, then rerun affected checks.
- [ ] Run `rtk npm run db:check`, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk npm run format`, an explicit touched-Markdown `rtk proxy npx prettier --ignore-path /dev/null --check ...`, and `rtk git diff --check`. Record `rtk npm run db:generate` as skipped if no schema change and `rtk npm run zip` as skipped if no artifact change.
- [ ] Prepare a Conventional Commit titled draft PR using `.github/PULL_REQUEST_TEMPLATE.md`. Record human installed-extension smoke and visual proof as **pending** until supplied. Attach the PR to this task. Do not mark it ready for review or merge before proof.

## Review checklist

The independent SPEC reviewer should verify exact input provenance, same-context Update eligibility, day-count semantics, all accepted constraints and the test matrix. The Ponytail QUALITY reviewer should check read purity, reuse of existing validators, request staleness, disabled-control behavior, response size and unintended changes to Save/Update. Fix findings before executing or closing the plan. Phase G capacity and Phase H personalization remain separate.
