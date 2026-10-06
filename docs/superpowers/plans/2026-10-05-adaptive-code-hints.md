# Adaptive code hints implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for scoped
> implementation and independent spec/quality reviews. Execute continuously under
> the user's design approval; no further execution-choice approval is needed.

**Goal:** Generate up to three snapshot-bound hints that adapt to learner progress.

**Architecture:** A read-only MAIN-world bridge reads complete editor models.
The review assistant validates a bounded single-turn input/output and adaptive
strength. The overlay owns session history and requests a new snapshot per click.

**Tech Stack:** WXT Chrome MV3, TypeScript, React, Zod, Vitest, existing AI transport.

## Task 1: Complete editor capture

Files: create `src/lib/leetcode/editor/complete-code-snapshot.ts`,
`src/lib/leetcode/editor/editor-snapshot-bridge.ts`, their focused tests, and
`src/entrypoints/leetcode-editor.content.ts`. Keep existing partial submission
capture untouched. Export the capture API from `src/lib/leetcode/index.ts`.

- [x] Add failing tests for reading full Monaco models beyond rendered lines,
      selecting an attached editor, ambiguity, empty text, bounds and missing data.
- [x] Implement typed minimal read-only editor/model interfaces and a complete
      snapshot `{ code, language, capturedAt }`, with a 32,000-character bound.
      Do not select an arbitrary first model or use virtualized DOM text.
- [x] Add strict request/response page envelopes with request UUID and host/slug.
      Register a static `world: 'MAIN'` script; it has no extension APIs or secrets.
      Request capture explicitly via the isolated-world API and clean up on all
      exits. Ignore wrong origin/source/request/location and reject navigation.
- [x] Test bridge correlation, invalid payloads, timeout, abort and cleanup.
- [x] Run `rtk proxy npm test -- src/lib/leetcode/editor --run` and
      `rtk proxy npm run typecheck`; review spec compliance then code quality.

## Task 2: Single-turn adaptive service and contracts

Files: `src/features/leetcode-review-assistant/domain/code-hint-schema.ts`,
`api/code-hint-contracts.ts`, `server/code-hint-service.ts`,
`server/hint-runtime-service.ts`, `index.ts`, their tests and evaluation fixtures,
plus affected runtime/API tests under `src/extension`.

- [x] Add failing strict-contract tests for current snapshot and at most two
      previous `{ snapshot, hint }` turns. Responses contain one
      `{ text, strength, progress }` hint. Strength is light/medium/heavy;
      progress is initial/improved/stuck. Text is trimmed, nonblank, at most 600.
- [x] Enforce first-light and adaptive transitions. Normalize CRLF only when
      comparing snapshots; unchanged code/language forces stuck and escalation.
      Changed snapshots allow improved/light or stuck/escalation. Reject a fourth
      turn, malformed history, duplicate hints and incoherent provider results.
- [x] Prompt with complete problem/current snapshot/history. Ask for semantic
      progress against earlier guidance; preserve valid strategies; target the
      smallest remaining gap; no fabricated defects or complete implementation.
      Keep one generation attempt per request and existing deadlines/key checks.
- [x] Update evaluation cases to multi-turn snapshots with unchanged, real
      progress, cosmetic edits, regression and near-complete work. Normal checks
      must skip before reading private evaluation configuration.
- [x] Run `rtk proxy npm test -- src/features/leetcode-review-assistant src/extension/background --run`.
      Review spec compliance then quality; retain pending provider quality status.

## Task 3: Snapshot-bound overlay turns

Files: `src/features/overlay-session/hooks/use-leetcode-code-hints.ts`, its tests,
`components/modes/expanded/overlay-hint-block.tsx`, associated component/controller
tests and fixture states.

- [x] Add failing tests for separate fresh captures per click, light/medium/heavy
      without edits, real progress/light, three successful-turn cap and Retry
      preserving history without consuming a slot.
- [x] Replace batch/reveal state with bounded history retained in pending/error
      states. Capture complete editor text at every explicit activation/Retry and
      send current snapshot plus prior turns. Keep existing scope/revision guards,
      single-flight coalescing, independent cancellation and reset behavior.
- [x] Show `Hints · N of 3`, per-turn strength, snapshot-context explanation,
      Get next hint, retained earlier text while pending/error, and final limit.
      Ordinary edits and folds/reopens must not reset or generate.
- [x] Test navigation/restart/key changes during subsequent requests, missing
      capture, edited-during-generation snapshots, failure retries and immediate
      review saves independent of hints.
- [x] Run `rtk proxy npm test -- src/features/overlay-session --run` and review
      spec compliance then quality.

## Task 4: Documentation, verification and handoff

Files: `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `design.md`,
`docs/superpowers/README.md` and
`docs/superpowers/handoffs/2026-10-05-adaptive-code-hints.md`.

- [x] Replace the old problem-only batch/reveal statements with actual behavior.
      Document snapshot bounds, adaptive policy, MAIN-world bridge, retained
      history, new provider disclosure and pending human/provider evaluation.
- [x] Run `rtk proxy npm run lint`, `rtk proxy npm run check`,
      `rtk proxy npm run build`, and `rtk proxy npx prettier --check` on touched
      files. Inspect generated manifest: unchanged permissions/hosts and scoped
      MAIN-world content script. Record exact commands/results/skips.
- [x] Capture production-component proof where supported and prepare exact
      human installed-extension smoke for full scrollable code, progress/stuck,
      near-complete work, edited pending code, errors and navigation. Human proof
      and opted-in live quality stay pending until performed.
- [x] Independently review final spec coverage then code quality, fix findings,
      record release/rollback and validation limits, and leave reviewable changes.
