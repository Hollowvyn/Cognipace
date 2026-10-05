# Overlay AI Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicitly requested, session-only progressive hints to the focused overlay's Solve Help area, using the saved AI connection independently of automatic assessment.

**Architecture:** Overlay Session owns the transient controller and revealed pointers; LeetCode Capture owns complete problem input; the LeetCode Review Assistant owns strict hint contracts, prompt and generation. GenAI loads trusted connection snapshots and exposes only public connection metadata; the extension boundary authorizes each sender and keeps hint and report operations independent. No hint operation writes Practice, SQLite, sync, backup or Analytics data.

**Tech Stack:** React, TypeScript, Zod, Vitest/Testing Library, WXT runtime messaging, existing `src/lib/ai` structured provider transport.

---

This executes Phase 2 of [the approved master design](../specs/2026-10-04-tabbed-overlay-and-ai-hints-design.md). Execute after Phase 1 focused tabs is implemented and validated. The prerequisite exposes `OverlayExpandedTab`, `overlay.expandedTab`, and `actions.selectExpandedTab`; this plan does not change those interfaces. Notes stays reserved. The written specification was approved by the user before this plan was authored.

Read current `docs/agent-governance.md`, `docs/architecture.md`, `docs/product.md`, `docs/testing.md`, `design.md` and the Phase 1 handoff before execution. Use `cognipace-agent-workflow`, `cognipace-bulletproof-react` and the execution skill named above. Run `rtk git status --short --branch` before editing; preserve unrelated work. Commands below are execution instructions, not validation already performed for this document.

## Execution status — 2026-10-05

All ten local implementation/documentation tasks passed independent SPEC and
QUALITY review. Initial historical source implementation ends at
`c69c00709d0aef78eadb606896b0a0cccd8d17df`; authority docs were committed as
`67b56b0e2978e5897b3f34740ba54b4581a30627`. The
[dedicated handoff](../handoffs/2026-10-04-overlay-ai-hints.md) records exact
commands, reviewed corrections, and eight production-component fixture captures.
Initial historical final lint, check (2,904 passing tests; nine opted-in live cases skipped), Chrome
MV3 build, and formatting of all 56 changed source files passed. Task 10's
formatting instruction was satisfied by scoped writes during implementation and
a final scoped check, avoiding an unnecessary whole-repository write.

Checkboxes describe implemented requirements/equivalent validation, not literal
execution of every illustrative shell spelling or code sample. The handoff is
the actual execution ledger. Tasks 9.5–9.6 and 10.7 remain pending: private live
evaluation configuration is absent, and the human engineer has not supplied
installed-extension happy-path/edge-case smoke and screenshot/recording proof.
Task 10.8 passed the final whole-implementation source review without actionable
findings (12 independently run suites, 369 tests). Task 10.9's evidence
record has been written and reviewed, but its final phase-completion condition
remains unchecked until the human/live gates are satisfied. This phase is
implemented locally, not PR review or merge ready. Notes remains reserved.

## File ownership and interfaces

| Owner            | Files                                                                                         | Responsibility                                                            |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Review Assistant | `domain/code-hint-schema.ts`, `api/code-hint-contracts.ts`, `api/code-hint-api.ts`            | Bounded pointers, problem-only envelope, plain runtime functions          |
| Review Assistant | `server/code-hint-service.ts`, `server/hint-runtime-service.ts`                               | Prompt, one structured generation, trusted snapshot/deadline checks       |
| LeetCode Capture | `api/prepare-code-hint-context.ts`, existing capture service                                  | Complete matching problem snapshot and explicit refresh                   |
| GenAI            | `api/hint-connection-contracts.ts`, `api/hint-connection-hooks.ts`, existing settings service | Availability and opaque connection revision without assessment enablement |
| Extension        | Existing messaging, policy, handlers, analysis-operation registry, broadcaster                | Sender binding, separate operation scope, invalidation and cancellation   |
| Overlay Session  | `hooks/use-leetcode-code-hints.ts`, existing session/page-sync/shell files                    | State above visual modes; explicit generation and progressive reveal      |
| Overlay Session  | Existing Help component and new `overlay-hint-block.tsx`                                      | Solve-only actions, collapsible inert pointers, Retry/Settings            |
| Evaluation/docs  | New hint fixtures/evaluation test and current authority docs                                  | Provider-quality evidence, human smoke, honest completion status          |

Public session additions are `hints: OverlayHintState` and actions `toggleHints`, `revealNextHint`, `retryHints`. The hook returns `reset` only for internal restart/reset orchestration. Runtime methods are `genai.getHintConnection`, `genai.generateLeetCodeHints`, and `genai.cancelLeetCodeHints`.

Connection metadata is `{ available, provider, revision }`: `provider` is existing public configuration, `revision` is a random UUID, and trusted key-bearing identity never leaves background memory. Cached connection metadata is allowed; generated pointers and operations are not put in Query or Mutation caches.

The task map links maintained source/tests instead of copying modules. Commands below are focused execution instructions; the handoff owns historical evidence. Local selected-input identity invalidates retained batches; runtime correlation uses `requestId`.

## Task 1: strict pointer and problem-only contracts

**Owner files:** [code-hint-schema.ts](../../../src/features/leetcode-review-assistant/domain/code-hint-schema.ts), [code-hint-contracts.ts](../../../src/features/leetcode-review-assistant/api/code-hint-contracts.ts), [code-hint-contracts.test.ts](../../../src/features/leetcode-review-assistant/api/code-hint-contracts.test.ts), [index.ts](../../../src/features/leetcode-review-assistant/index.ts).

Review Assistant owns strict parsing: one to three distinct trimmed nonblank pointers, at most 200 characters each; reject extras/oversize without repair. The request contains `surface`, `requestId`, connection revision/provider, and the bounded matching problem. Responses correlate by `requestId`; duplicated slug/fingerprint fields are absent. Local input identity covers only selected problem fields, outside the wire contract. Problem JSON stays bounded at 24,000 characters, 50 examples, and 100 constraints; no code, diagnostics, auth, official hints, or follow-ups.

**Focused command:**

```sh
rtk npm test -- src/features/leetcode-review-assistant/api/code-hint-contracts.test.ts --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 2: prepare complete matching problem input before submission

**Owner files:** [prepare-code-hint-context.ts](../../../src/features/leetcode-capture/api/prepare-code-hint-context.ts), [prepare-code-hint-context.test.ts](../../../src/features/leetcode-capture/api/prepare-code-hint-context.test.ts), [leetcode-capture-service.ts](../../../src/features/leetcode-capture/server/leetcode-capture-service.ts), [leetcode-capture-service.cache.test.ts](../../../src/features/leetcode-capture/server/leetcode-capture-service.cache.test.ts), [index.ts](../../../src/features/leetcode-capture/index.ts).

LeetCode Capture prepares host/slug, canonical title, complete statement, example raw text, and constraints without requiring submission. Complete matching capture avoids network reads. Partial capture refreshes matching metadata/content, not editor or submission input; publish refreshed capture only while its operation remains current. Honor explicit metadata refresh even with a cached entry; preserve ordinary cache behavior. Reject incomplete/mismatched/oversized essentials without truncation.

**Focused command:**

```sh
rtk npm test -- src/features/leetcode-capture/api/prepare-code-hint-context.test.ts src/features/leetcode-capture/server/leetcode-capture-service.cache.test.ts --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 3: connection-only availability and opaque revision

**Owner files:** [hint-connection-contracts.ts](../../../src/features/genai/api/hint-connection-contracts.ts), [hint-connection-hooks.ts](../../../src/features/genai/api/hint-connection-hooks.ts), [genai-settings-service.ts](../../../src/features/genai/server/genai-settings-service.ts), [genai-settings-service.test.ts](../../../src/features/genai/server/genai-settings-service.test.ts), [index.ts](../../../src/features/genai/index.ts), [query-keys.ts](../../../src/platform/query/query-keys.ts), [cache-invalidation.ts](../../../src/platform/query/cache-invalidation.ts).

GenAI exposes only `{ available, provider, revision }`; revision is a UUID. Trusted key-bearing identity stays in background memory. Manual availability is independent of automatic-assessment enablement. Selected provider/model/key changes (including same-key storage replacement) rotate revision; enable-only changes and unrelated keys do not. Issued/committed read ordering and reset epoch prevent older reads replacing newer metadata or repopulating reset state; fresh reads must not wait for suspended older reads. Public metadata may be cached; pointers/operations may not.

**Focused command:**

```sh
rtk npm test -- src/features/genai/server/genai-settings-service.test.ts src/platform/query/cache-invalidation.test.ts --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 4: one bounded generation and trusted background deadline

**Owner files:** [code-hint-service.ts](../../../src/features/leetcode-review-assistant/server/code-hint-service.ts), [code-hint-service.test.ts](../../../src/features/leetcode-review-assistant/server/code-hint-service.test.ts), [hint-runtime-service.ts](../../../src/features/leetcode-review-assistant/server/hint-runtime-service.ts), [hint-runtime-service.test.ts](../../../src/features/leetcode-review-assistant/server/hint-runtime-service.test.ts).

Review Assistant makes one structured provider attempt with a 1,024-token budget and problem-only prompt. Reject invalid output without trimming or a repair call. Background deadline bounds startup/database/configuration/key loading, generation, and final trusted connection check at 30 seconds. Snapshot identity/revision must still match before publication; controlled errors never expose raw provider failures or credential identity. Cancellation and timeout discard late results.

**Focused command:**

```sh
rtk npm test -- src/features/leetcode-review-assistant/server/code-hint-service.test.ts src/features/leetcode-review-assistant/server/hint-runtime-service.test.ts --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 5: independent hint ownership and sender authorization

**Owner files:** [leetcode-analysis-operations.ts](../../../src/extension/background/leetcode-analysis-operations.ts), [leetcode-analysis-operations.test.ts](../../../src/extension/background/leetcode-analysis-operations.test.ts), [runtime-policy.ts](../../../src/extension/background/runtime-policy.ts), [runtime-policy.test.ts](../../../src/extension/background/runtime-policy.test.ts).

Extension owns separate hint and report operation registries keyed by tab/frame/request. Cancellation is owner-scoped and may work after same-host SPA navigation; provider-scoped cancellation affects only matching hints. Strict generation policy binds actual supported HTTPS sender host/slug to `request.problem`. Wrong surface, host, slug, tab/frame, or cancellation owner must fail before provider work. Reports and hints cannot cancel each other. The original intermediate protocol inventory mismatch was intentional until Task 6; preserve it as history, not a current failure.

**Focused command:**

```sh
rtk npm test -- src/extension/background/leetcode-analysis-operations.test.ts src/extension/background/runtime-policy.test.ts --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 6: protocol, handlers, and precise connection invalidation

**Owner files:** [messaging.ts](../../../src/extension/messaging.ts), [register-handlers.ts](../../../src/extension/background/register-handlers.ts), [register-handlers.test.ts](../../../src/extension/background/register-handlers.test.ts), [cache-invalidation-broadcaster.ts](../../../src/extension/background/cache-invalidation-broadcaster.ts), [cache-invalidation-broadcaster.test.ts](../../../src/extension/background/cache-invalidation-broadcaster.test.ts), [code-hint-api.ts](../../../src/features/leetcode-review-assistant/api/code-hint-api.ts), [code-hint-api.test.ts](../../../src/features/leetcode-review-assistant/api/code-hint-api.test.ts), [cache-invalidation-listener.tsx](../../../src/app/providers/cache-invalidation-listener.tsx), [cache-invalidation-listener.test.tsx](../../../src/app/providers/cache-invalidation-listener.test.tsx), [cache-invalidation.ts](../../../src/platform/query/cache-invalidation.ts), [cache-invalidation.test.ts](../../../src/platform/query/cache-invalidation.test.ts).

Register `genai.getHintConnection`, `genai.generateLeetCodeHints`, and `genai.cancelLeetCodeHints` with strict parsing and plain runtime functions. Existing protocol inventories and actual registered-handler tests must match. Selected connection changes cancel applicable hints; automatic-assessment disable retains hints. Full local-data replacement rotates the trusted registry and clears only public hint metadata using the existing replacement signature before refetch, so failed/hung rereads cannot preserve ready hints. Reuse the app listener and local cache option; do not add wire fields, another listener, pointer caches, or persistence. Tasks 5–6 ship together.

**Focused command:**

```sh
rtk npm test -- src/features/leetcode-review-assistant/api/code-hint-api.test.ts src/extension/background/leetcode-analysis-operations.test.ts src/extension/background/runtime-policy.test.ts src/extension/background/cache-invalidation-broadcaster.test.ts src/extension/background/register-handlers.test.ts src/features/genai/server/genai-settings-service.test.ts src/platform/query/cache-invalidation.test.ts src/app/providers/cache-invalidation-listener.test.tsx --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 7: session-owned explicit hint controller

**Owner files:** [use-leetcode-code-hints.ts](../../../src/features/overlay-session/hooks/use-leetcode-code-hints.ts), [use-leetcode-code-hints.test.tsx](../../../src/features/overlay-session/hooks/use-leetcode-code-hints.test.tsx), [use-leetcode-page-sync.ts](../../../src/features/overlay-session/hooks/use-leetcode-page-sync.ts).

Overlay Session owns transient state and cancellation above visual modes. Start only on explicit click; synchronous guard deduplicates rapid clicks. First pointer appears after success; further reveals use the retained batch locally. Fold/reopen, tabs/modes, saves/ratings and excluded capture enrichment preserve count/disclosure without new calls. Restart, navigation/remount, selected-input or saved-connection changes clear the batch. Use local selected-input identity, current operation/requestId, and trusted connection revision to discard stale results. Guard preparation publish, let current capture supersede stale partial input, and refresh unavailable/stale metadata on explicit Retry without auto-generation. Client deadline is 50 seconds (preparation 15); connection metadata client deadline is 25 seconds. Billing/auth/configuration recovery exposes Settings where useful.

**Focused command:**

```sh
rtk npm test -- src/features/overlay-session/hooks/use-leetcode-code-hints.test.tsx --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 8: Solve Help presentation and session integration

**Owner files:** [use-leetcode-overlay-session.ts](../../../src/features/overlay-session/hooks/use-leetcode-overlay-session.ts), [use-leetcode-overlay-session.test.tsx](../../../src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx), [overlay-shell.tsx](../../../src/features/overlay-session/components/overlay-shell.tsx), [overlay-shell.test.tsx](../../../src/features/overlay-session/components/overlay-shell.test.tsx), [expanded-overlay.tsx](../../../src/features/overlay-session/components/modes/expanded/expanded-overlay.tsx), [expanded-overlay.test.tsx](../../../src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx), [overlay-help-section.tsx](../../../src/features/overlay-session/components/modes/expanded/overlay-help-section.tsx), [overlay-help-section.test.tsx](../../../src/features/overlay-session/components/modes/expanded/overlay-help-section.test.tsx), [overlay-hint-block.tsx](../../../src/features/overlay-session/components/modes/expanded/overlay-hint-block.tsx).

Session exposes `hints` and `toggleHints`, `revealNextHint`, `retryHints`; `reset` stays internal to restart/reset orchestration. Compose hint metadata/controller with page-sync callbacks using current owners. Help appears only on Solve with YouTube and manual AI action; Notes stays reserved. Render progressive inert text, collapsible disclosure, busy/controlled error states and explicit Retry/Settings. Do not add automatic generation, ready-batch Regenerate, editor watchers, official-hint input, or writes to Practice/logs/rating/time/FSRS/Analytics/SQLite/backup/sync. Session/integration tests protect save success/failure, assessment independence, mode/tab retention and lifecycle invalidation; browser proof must cover actual ShadowRoot/scroll/short-height behavior.

**Focused command:**

```sh
rtk npm test -- src/features/overlay-session/ --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 9: opt-in live provider quality evaluation

**Owner files:** [code-hint-evaluation-fixtures.ts](../../../src/features/leetcode-review-assistant/testing/code-hint-evaluation-fixtures.ts), [code-hint-provider-evaluation.test.ts](../../../src/features/leetcode-review-assistant/server/code-hint-provider-evaluation.test.ts).

Evaluation owns three public problem fixtures and redacted JSON artifacts under `/private/tmp/cognipace-hint-evaluation`. Ordinary tests make no provider calls and skip opt-in cases. Private environment configuration must not read application-stored keys or print values/raw provider bodies. Record provider/model/date/latency and inspect each real batch for progression, usefulness, length, duplicate avoidance, and spoiler restraint. A short full solution or vague nonprogressive batch fails quality despite structural validity. If quality fails, adjust only bounded prompt and rerun mocked transport plus live evaluation; never add repair generation.

**Focused command:**

```sh
rtk proxy env COGNIPACE_AI_EVAL=1 npm test -- src/features/leetcode-review-assistant/server/code-hint-provider-evaluation.test.ts --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

- [ ] Configure privately and run live evaluation; configuration remains absent.
- [ ] Review all three actual artifacts against the approved quality criteria.

## Task 10: authority docs, complete checks and human proof

**Owner files:** [product.md](../../../docs/product.md), [architecture.md](../../../docs/architecture.md), [testing.md](../../../docs/testing.md), [design.md](../../../design.md), [2026-10-04-overlay-ai-hints.md](../../../docs/superpowers/handoffs/2026-10-04-overlay-ai-hints.md), [README.md](../../../docs/superpowers/README.md).

Update authority docs after implemented behavior, keeping the approved scope and ownership accurate. The dedicated handoff records branch/source revisions, every exact executed/skipped command and stage outcome, RED/corrections/reviews, fixture paths, remaining gates, release impact and recovery. Source checks and independent review do not complete human/live evidence. No schema/migration change means no `db:generate`; preserve its exact skip reason. Recovery removes the manual Help action or saved connection without DB rollback. Conventional commits and feature PR title follow governance; keep the PR draft until evidence gates close.

**Focused command:**

```sh
rtk npm run lint
rtk npm run check
rtk npm run build
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

Format/check exact touched files with `--ignore-path /dev/null`; avoid a whole-repository formatter write. Historical Task 10 formatting used scoped writes and the exact 56-file check recorded in the handoff. Recheck whitespace with `rtk git diff --check`.

- [ ] Human installed-extension happy-path and edge-case smoke, with screenshot/recording proof: [required hints flow](../../testing.md#required-human-installed-extension-manual-hints-smoke), focused tabs and automatic analysis. Fixture captures do not satisfy this gate.
- [ ] Live quality evaluation and per-fixture findings recorded with actual provider/model/date.
- [ ] Mark phase complete/review-ready only when both gates have evidence; the evidence record already exists, but completion is pending.

## Approved simplification — 2026-10-05

The eight approved cuts remove duplicated wire identity and copied implementation/ledger prose while retaining local input identity, sender binding and request correlation. Code SPEC review passed all four code cuts; QUALITY review had no actionable findings after 113 tests. Implementer focused verification passed 397 tests across 14 files; the full check passed 216 files / 3,028 tests, with two files / nine live cases skipped. These are code-cut results supplied by the execution owner; exact commands are recorded in the handoff. Root lint and Chrome MV3 build passed (4.82 MB; existing large-chunk warning). Scoped documentation Prettier write/check passed for the five touched Markdown files. Human installed-extension smoke and live-provider quality remain pending; PR stays draft.
