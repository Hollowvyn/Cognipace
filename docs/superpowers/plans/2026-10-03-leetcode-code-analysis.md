# LeetCode Code Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AI recall-rating recommendations with a trustworthy, session-local submission report containing Approach /5, Efficiency /5, Code Style /5, and a collapsed suggested implementation.

**Architecture:** Keep Vercel AI SDK calls in `src/lib/ai`, configuration and credentials in GenAI, submission capture in LeetCode capture, and grading in the review-assistant feature. The overlay owns one analysis controller independent of review saving. The trusted extension boundary validates messages and cancels operations by actual sender tab/frame.

**Tech Stack:** TypeScript, React 19, Zod 4, Vitest/Testing Library, WXT/Chrome MV3, existing Vercel AI SDK 7 and OpenAI/Anthropic/Google adapters. No dependency or permission additions.

---

## Approval and workspace

The user approved the [written design](../specs/2026-10-03-leetcode-code-analysis-design.md) on 2026-10-03 and requested this plan. As of 2026-10-04, all ten tasks are implemented and have passed independent SPEC and then QUALITY review. Final automated gates and whole-source technical review passed at `bceb969baae7bb167e0899dc65a93c575c903fa6`; live provider, generated-code, and human installed-extension proof remain pending. See the [final handoff](../handoffs/2026-10-03-leetcode-code-analysis.md) for exact results; this is not PR review/merge readiness. Work in `/Users/tobiolutimehin/WebstormProjects/cognipace-v2` on `codex/leetcode-code-analysis`; base `origin/main` was `b2d9291f`, with design commit `87b04aa`. Do not work in the old `dd64` worktree or create a replacement.

Run all commands from the primary workspace and prefix shell commands with `rtk`. Use Node 24.20.0/npm 11.19.0. For npm commands, select the runtime first:

```sh
rtk proxy zsh -c 'source /Users/tobiolutimehin/.nvm/nvm.sh && nvm use 24.20.0 && npm run test -- src/lib/leetcode'
```

The phase plans below show `rtk npm ...` for readability; run them only in a shell where that pinned runtime is active. Check status before execution. Preserve unrelated changes. Primary workspace writes require the execution environment's normal sandbox escalation.

## Ordered phases

These are sequential parts of one feature, with a focused-test checkpoint and commits in each phase. Existing behavior remains usable during the capture phase; phase two adds the new runtime alongside the old endpoint until phase three switches consumers and deletes the obsolete endpoint. Do not ship the interim coexistence or introduce forwarding aliases.

1. [Complete capture and pinned refresh](2026-10-03-leetcode-code-analysis-phase-1-capture.md): full-source provenance, follow-ups, immutable attempt IDs, meaningful readiness, and refreshable incomplete caches. Existing deterministic review flow continues working.
2. [Structured report and trusted runtime](2026-10-03-leetcode-code-analysis-phase-2-report-runtime.md): versioned schema, input limits, rubric, SDK service, controlled envelopes, sender-owned cancellation, and configuration invalidation. The report service is testable independently.
3. [Overlay, retirement, and proof](2026-10-03-leetcode-code-analysis-phase-3-overlay-proof.md): one controller, Option A presentation, Retry/Copy, immediate saves, obsolete code removal, authority documentation, model evaluation, and installed-extension smoke.

No report database, background queue, streaming UI, agent tools, analytics scores, model fallback, or sync changes are needed. The SDK already handles structured output, direct provider calls, whole-operation deadlines, abort signals, disabled retries/telemetry, and length-truncated output. Reuse those functions rather than rebuilding transport.

Current API guidance was checked with Context7 against `/vercel/ai`: [structured output](https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/10-generating-structured-data.mdx) and [abort settings](https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/25-settings.mdx). The installed wrapper is the implementation authority for its existing `generateJson` API. Schema validation does not establish semantic correctness or optimality.

## File responsibilities

| Area                  | Files and responsibility                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Capture model         | `src/lib/leetcode/domain/types.ts`, editor/submission/content readers, capture reducer/context, remote client, watcher: completeness, follow-ups, attempt identity, matching details |
| Capture runtime/cache | `src/features/leetcode-capture/api/*`, `server/leetcode-capture-service.ts`, existing LeetCode message schemas/handlers: pinned refresh with no failed/partial cache trap            |
| Report domain         | New `src/features/leetcode-review-assistant/domain/code-analysis-schema.ts`, `code-analysis-consistency.ts`: bounded schema and encoded consistency checks                           |
| Report service        | New `server/build-code-analysis-prompt.ts`, `code-analysis-service.ts`, `analysis-runtime-service.ts`: rubric, SDK call, trusted config and controlled responses                     |
| Report API            | New `api/code-analysis-contracts.ts`, `code-analysis-api.ts`: strict envelopes and direct runtime functions; public barrels expose only feature contracts/functions                  |
| Cancellation          | New `src/extension/background/leetcode-analysis-operations.ts`: one volatile operation per real tab/frame, bounded lifetime, matching-only cleanup                                   |
| Configuration         | Existing GenAI settings service adds trusted snapshot loading; existing broadcaster aborts analyses on GenAI invalidation                                                            |
| Overlay controller    | New `src/features/overlay-session/hooks/use-leetcode-code-analysis.ts`; page-sync exposes its capture; overlay session wires reset/retry and safe enabled state                      |
| Presentation          | New `components/modes/expanded/overlay-code-analysis.tsx`, existing shell/expanded composition: three independent disclosures and final generated-code disclosure                    |
| Retirement            | Delete old recommendation schema/types/prompt/normalizer/service/API/hook/component/tests; remove rating override and AI-only reducer state                                          |
| Proof                 | Focused tests, six concrete evaluation cases, authority docs and final handoff                                                                                                       |

## Completion checks

- [x] Phase one focused capture tests and typecheck pass; no partial source is labeled complete.
- [x] Phase two tests pass; one report uses one SDK generation with 8,192-token budget and controlled errors. Request data contains no credential or recall-rating/history input.
- [x] Phase three tests pass; report enrichment/disclosures do not start another paid call, Retry retains its submission ID, and saves do not await or consume AI.
- [x] Automated validation below passes; exact failures/skips are recorded.
- [ ] Six model evaluations are reviewed for semantic agreement, with provider/model/date recorded and generated code checked before any compilation/test-success claim.
- [ ] The human engineer completes installed-extension happy-path and edge-case smoke and attaches screenshots/recordings before PR review or merge.

Required automated commands after the focused phase checks:

```sh
rtk npm run test -- src/features/leetcode-review-assistant src/features/leetcode-capture src/features/overlay-session src/features/app-shell src/features/genai src/lib/leetcode src/lib/ai src/extension/background/runtime-policy.test.ts src/extension/background/register-handlers.test.ts src/extension/background/leetcode-analysis-operations.test.ts src/extension/background/cache-invalidation-broadcaster.test.ts src/testing/architecture-boundaries.test.ts
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk git diff --check
```

`npm run check` includes database checks, typecheck/WXT preparation, lint, and the full test suite. It does not prove model judgment. Explicitly format/check touched plan/spec files with Prettier `--ignore-path /dev/null` because the repository excludes historical planning directories from its ordinary formatting command.

Skip `rtk npm run db:generate`: no schema change. Skip a separate `rtk npm run db:check` only after `check` has run it successfully. Skip `rtk npm run zip` and `rtk npm run store:check` unless packaging/build configuration is changed or a distributable ZIP is requested; `build` remains required. Human smoke and visual proof cannot be marked N/A for this implementation.

## Review and release

Plan self-review mapped every design requirement to execution tasks:

| Requirement                                                              | Implementation/proof                              |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| Full matching code, provenance, known absence, follow-ups                | Phase 1 Tasks 1–3                                 |
| Stable attempt identity, pinned Retry, incomplete-cache recovery         | Phase 1 Tasks 1–3; Phase 3 Task 1                 |
| Independent /5 rubric, unavailable scores, encoded consistency           | Phase 2 Tasks 1–2                                 |
| Language semantics, explicit time/space tradeoffs, honest suggestions    | Phase 2 Task 2; Phase 3 Tasks 2 and 4             |
| Input/output caps, one generation, total deadlines, controlled failures  | Phase 1 Task 3; Phase 2 Tasks 2–3; Phase 3 Task 1 |
| Actual sender ownership, cancellation, config/key changes, stale results | Phase 2 Task 3; Phase 3 Task 1                    |
| Option A rows, keyboard disclosures, explicit Copy, generated-code label | Phase 3 Task 2                                    |
| Immediate saves, preserved ratings/FSRS/progress, obsolete path removal  | Phase 3 Task 3                                    |
| Safe keys, session-only reports, no cache/database/sync writes           | Phase 2 Tasks 2–3; Phase 3 Tasks 1 and 4          |
| Six model cases, code checks, human installed-extension proof            | Phase 3 Task 4 and smoke checklist                |

Self-review also checked names/signatures across phases and scanned for unfinished instructions. Complete TypeScript/TSX/JavaScript blocks received a syntax-only transpilation check; insertion fragments are labeled diffs. This does not typecheck future application code or run the planned tests.

Review ownership, specification coverage, and code quality at each phase checkpoint. Keep fixes within these owners and remove obsolete code when switching consumers. Use Conventional Commits; eventual PR title: `feat(assessment): add submission code analysis`.

The final handoff must distinguish automated wiring proof, live model evaluation, and human installed-extension proof. No new PR is created by writing this plan. If code is ready before required human proof, report the pending proof concretely; do not claim the feature is fully verified or ready to merge. Use the current `.github/PULL_REQUEST_TEMPLATE.md` when a PR is requested and attach it with the Codex artifact tool after creation.

Recovery remains turning AI assessment off. Reviews, deterministic ratings, scheduling, progress, and provider connection testing continue working. There is no report migration to roll back.
