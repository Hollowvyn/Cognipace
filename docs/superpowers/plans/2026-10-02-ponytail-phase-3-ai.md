# Ponytail Phase 3 AI Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development and test-driven-development. Check steps only after evidence.

**Goal:** One watcher recommendation supplies the displayed and automatically saved rating, and every provider operation ends within its configured deadline, including body consumption.

**Architecture:** Keep recommendation ownership in the existing overlay recommendation hook. Share its current submission promise/result with automatic save; no background cache, new layer, dependency, permissions or protocol. Keep provider deadline ownership in the shared provider helper and use existing redacted error mapping.

Approved design: [cleanup](../specs/2026-10-02-ponytail-cleanup-design.md).

## Task 1: One automatic submission recommendation

**Files:** `src/features/overlay-session/hooks/use-leetcode-assessment-recommendation.ts`, `use-overlay-review-actions.ts`, `use-leetcode-overlay-session.ts`, their tests, `submission-result-key.ts` if needed, plus `use-leetcode-submission-automation.ts` and its test for the confirmed distinct-result cancellation/retry race, and `domain/overlay-session-state.ts`/test for silent supersession cancellation.

- [x] Add an integrated overlay-session regression with AI configured and auto-detected accepted submission. Delay the recommendation, verify exactly one runtime recommendation call, resolve it and verify displayed and persisted rating use the same result.
- [x] Observe the duplicate-call regression fail with `rtk npm test -- src/features/overlay-session/hooks --run`.
- [x] Expose an imperative request/result operation from the existing recommendation owner; use the existing watcher submission key and captured pre-save context for both effect and automatic save. Publish display state from that same operation. Compose this owner before review actions in the overlay-session hook and pass a narrow callback to automatic submission handling.
- [x] Retain the existing manual quick-submit/manual rating assessment path as needed. Do not allow AI to bypass user-touched ratings, failure or strict timing locks. Respect `shouldUpdateRating` consistently in both display and save.
- [x] Cover pending response plus navigation, restart, late result, repeated same submission, distinct submission, unavailable/provider rejection and user rating selection while pending. Preserve deterministic fallback and stale save guards. Delete duplicate request construction only after callers are traced.
- [x] Run focused overlay recommendation, review-action and composed-session tests, then formatting and ESLint on owned files. Root independently reviews.

## Task 2: Provider deadline includes response body

**Files:** `src/features/genai/server/providers/shared.ts`, `shared.test.ts`, `openai.ts`, `anthropic.ts`, `gemini.ts` and their tests.

- [x] Add each adapter's streaming-body regression: fetch resolves headers before timeout but JSON stream stalls; expect redacted `timeout`, no success or invalid-output. Also stall a non-2xx error body and assert bounded completion and secret-safe logs/errors.
- [x] Observe red with `rtk npm test -- src/features/genai/server/providers --run`.
- [x] Extend the existing shared timeout helper to encompass fetch plus the caller's response consumption using one deadline. Ensure timeout rejects even if a body/error reader catches abort; preserve external cancellation semantics and existing provider error categories. Clear timers/listeners on every exit. Keep HTTP handling and schema validation in adapters.
- [x] Fetch current Fetch/AbortSignal documentation through Context7 if changing library/platform API use. Do not replace signal composition with an unsupported browser API just to cut lines.
- [x] Cover early success, slow headers, stalled success/error body, caller cancellation, already aborted signal and cleanup. Use fake timers/streams without live provider calls or keys.
- [x] Run focused provider suites, format and lint owned files. Root independently reviews.

## Task 3: Checkpoint

- [x] Review spec compliance, caller lifetimes, rating locks, pending request sharing, cancellation and secret redaction.
- [x] Run `rtk npm run lint`, `rtk npm run check`, `rtk npm run build` after focused suites.
- [x] Update current architecture/testing docs and implementation ledger with exact proof, pending human smoke and commands skipped. Format touched Markdown.
- [x] Root commits reviewed files with Conventional Commit titles.

Human proof remains pending: configured watcher accepted result makes one provider request and displays/saves the same recommendation; manual quick-submit; failed/strict locked result; user override; restart/navigation while waiting; stalled provider response gives a visible timeout. Use disposable data and redacted screenshot/recording before PR review/merge. Skip `rtk npm run db:generate` because schema is unchanged; no live provider calls are claimed.
