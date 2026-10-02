# Ponytail Phase 5 UI and Dependency Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development; preserve focused regression proof and current UI patterns.

**Goal:** Make the affected Library/Tracks dialogs keyboard-safe and show retryable errors inside them, then remediate advisories with compatible scoped dependency updates.

**Architecture:** Repair the two audited Problems dialogs and their existing consumers. Reuse proven local modal/focus behavior or native modal semantics with current documentation; do not migrate every dialog. Root owns package/lockfile mutations, with a dependency investigator providing verified advice.

Approved design: [cleanup](../specs/2026-10-02-ponytail-cleanup-design.md).

## Task 1: Specific modal focus and error paths

**Files:** `src/features/problems/components/library/problem-confirmation-dialog.tsx`, `problem-bulk-metadata-dialog.tsx`, `problem-bulk-action-bar.tsx`; `src/features/problems/components/problem-row/problem-row-actions.tsx`; associated maintained suites and `src/features/tracks/components` confirmation consumers/tests; existing generic focus helper only if reusable. Independent review reproduced focus loss when a selected topic/company pill unmounts; include the one-line input-focus repair in `src/features/problems/components/form/problem-label-input.tsx` and two maintained Library regressions.

- [x] Reproduce Tab/Shift+Tab escaping confirmation and bulk metadata dialogs. Add maintained tests for initial focus, wrapping, Escape, pending cancellation and restoring the opener on close. Include Tracks reset confirmation and selection changes.
- [x] Reproduce row/bulk rejection rendering behind the still-open dialog. Add maintained rejection-path tests before changing error placement.
- [x] Apply existing proven modal focus behavior to these flows, using a small shared helper only if it reduces real duplication without creating a general modal framework. Preserve styling, reduced motion, pending locks and cancellation. If using native `showModal`, fetch current platform docs and handle supported test environment explicitly; do not claim jsdom proves browser top-layer behavior.
- [x] Pass the relevant mutation error into the active dialog and render its alert with retry/cancel available after rejection. Clear stale error at the existing action lifecycle boundaries. Cover successful retry and cancellation, including bulk metadata.
- [x] Run `rtk npm test -- src/features/problems/components src/features/tracks/components --run`; format and lint owned files. Root independently reviews.

## Task 2: Scoped compatible dependency remediation

**Files:** `package.json`, `package-lock.json`; no source/tooling migration unless specifically justified by current advisory.

- [x] Fetch a fresh `rtk proxy npm audit --json --cache /private/tmp/cognipace-ponytail-npm-cache`; inspect exact advisory ranges/URLs and dependency chains with `npm explain`. Read primary advisory/package documentation (Context7 where applicable). Record runtime versus dev-only exposure and exact fixed versions.
- [x] Select narrow compatible patches for DOMPurify, Vitest/@vitest/mocker, brace-expansion and undici. Avoid `npm audit fix --force`, major downgrades or unrelated dependency updates.
- [x] Investigate the Drizzle Kit legacy esbuild-loader chain separately. Preserve Drizzle/database compatibility; document any advisory whose compatible fix is unavailable instead of forcing a downgrade.
- [x] Root applies only reviewed package/lockfile changes. Run `rtk npm run db:check`, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk npm run store:check`, `rtk npm run zip`, `rtk npm run format` and fresh audit after updates. Record exact final counts, package versions and remaining advisories if any.

## Task 3: Final independent audit and handoff

- [x] Recheck every original C1-C11 finding and restart risk against final code and regression evidence. Inspect diff for new root-cause defects, scope creep, stale docs or unnecessary layers.
- [x] Re-run Ponytail caller/debt scan excluding generated/dependency/skill-example directories; count actual production cuts and removed direct deps.
- [x] Update phase checkboxes, audit status, implementation ledger, current architecture/testing docs and PR-ready handoff with exact validation commands and skipped commands/reasons.
- [x] Commit reviewed phase/final documentation using Conventional Commit titles. Leave changes reviewable on the task branch. Do not push, publish, merge or create user-owned chats without authorization.

Human proof remains pending for keyboard dialog flows, failed mutation retry/cancel, Tracks reset and all changed behavior listed in prior phases. The human engineer must complete happy-path/edge-case realtime smoke with redacted screenshots/recording before PR review or merge. Skip `rtk npm run db:generate`: no schema changes. No live Gist/provider calls are claimed.
