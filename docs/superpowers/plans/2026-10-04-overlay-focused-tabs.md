# Focused Overlay Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the expanded overlay focused Solve / AI / Notes tabs with the full review footer only on Solve and preserved session behavior.

**Architecture:** Keep selected-tab state above visual-mode components in the existing overlay-session reducer. Keep each expanded tab panel mounted while switching tabs, with a feature-local tab bar using element refs inside the ShadowRoot. Existing AI generation and Practice writes retain their current owners.

**Tech Stack:** React 19, TypeScript, current Tailwind tokens, Vitest and React Testing Library, WXT/Chrome MV3.

---

**Approved design:** [Tabbed overlay and progressive AI hints](../specs/2026-10-04-tabbed-overlay-and-ai-hints-design.md), written-spec approval received in chat on 2026-10-04.
**Execution branch:** `codex/overlay-tabs-design`, based on current main when brainstorming began.
**Phase boundary:** This plan ships tabs and a reserved Notes placeholder. The AI hint action belongs to [Phase 2](./2026-10-04-overlay-ai-hints.md). Do not add hint runtime work or a Notes editor here.

## Execution status — 2026-10-05

All six local implementation tasks passed independent SPEC and QUALITY review.
Automated checks and production-component fixture proof passed; see the
[Phase 1 handoff](../handoffs/2026-10-04-overlay-focused-tabs.md). Phase 2 is now
implemented locally; its [handoff](../handoffs/2026-10-04-overlay-ai-hints.md)
records the final source validation. Required human installed-extension smoke
and screenshot/recording proof remain pending, so neither phase is PR review or
merge ready. The final whole-implementation source review passed without actionable findings.

Checked steps record implemented behavior and equivalent executed validation;
the handoffs contain the exact commands, outcomes, and reviewed corrections.
The original `npm ci` preflight is left unchecked because its historical result
was not captured in the execution ledger. Existing dependencies were verified
with the pinned Node 24.20.0/npm 11.19.0 toolchain and successful full checks;
no reinstall was needed at initial final validation. The later PR preparation locked install passed; that does not supply the missing original preflight result. The human evidence gate remains
unchecked. The Phase 1 instruction to leave Phase 2 pending describes its
historical handoff, before the separately approved Phase 2 execution.

## Preparation and file ownership

Read the current authority docs and use `cognipace-agent-workflow` and `cognipace-bulletproof-react`. Prefix shell commands with `rtk`. Preserve unrelated work and recheck status before execution. Use the existing attached task worktree; creating another checkout is unnecessary.

- `domain/overlay-session-state.ts`: selected tab and completion-time save rules.
- `hooks/use-overlay-review-actions.ts`: public selection command.
- `components/overlay-shell.tsx`: command wiring.
- `components/modes/expanded/overlay-tabs.tsx`: local accessible tab bar.
- `components/modes/expanded/expanded-overlay.tsx`: mounted panels, per-tab scrolling, Solve footer.
- `components/modes/expanded/overlay-code-analysis.tsx`: meaningful disabled display.
- Matching reducer/component/session tests protect lifecycle, accessibility and provider independence.
- Current product/architecture/testing/design docs describe Phase 1 only when implemented.

All paths in the task map below are relative to `src/features/overlay-session` unless written in full. No dependency, permission, database, runtime contract, or provider change is required.

- [x] Confirm a clean/task-owned checkout with `rtk git status --short --branch`.
- [ ] Install the pinned toolchain dependencies with `rtk proxy npm ci` before application checks. This worktree had no `node_modules` during design. Node/npm pins are in `.nvmrc` and `package.json`.
- [x] Keep the existing disclosure/report fixtures and saved-log preservation tests; do not replace them with snapshots.

The six-task map links maintained source/tests; the [handoff](../handoffs/2026-10-04-overlay-focused-tabs.md) owns exact historical command outcomes and proof paths.

## Task 1: model selected tab and save completion rules

**Owner files:** [overlay-session-state.ts](../../../src/features/overlay-session/domain/overlay-session-state.ts), [index.ts](../../../src/features/overlay-session/domain/index.ts), [overlay-session-state.test.ts](../../../src/features/overlay-session/domain/overlay-session-state.test.ts).

Overlay Session owns `OverlayExpandedTab`, default Solve, and `set-expanded-tab`. Preserve selection through modes, failures, rating/context updates and same-problem refresh. Restart, navigation or new problem reset to Solve. Successful save expands; choose Solve only when completion-time mode was collapsed/docked, preserving selected expanded tab otherwise. Keep saved review, timer, rating, next-step and feedback behavior intact.

**Focused command:**

```sh
rtk proxy npm test -- src/features/overlay-session/domain/overlay-session-state.test.ts --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 2: expose selection and protect completion-time behavior

**Owner files:** [use-overlay-review-actions.ts](../../../src/features/overlay-session/hooks/use-overlay-review-actions.ts), [overlay-shell.tsx](../../../src/features/overlay-session/components/overlay-shell.tsx), [overlay-shell.test.tsx](../../../src/features/overlay-session/components/overlay-shell.test.tsx), [use-leetcode-overlay-session.test.tsx](../../../src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx), [expanded-overlay.tsx](../../../src/features/overlay-session/components/modes/expanded/expanded-overlay.tsx), [expanded-overlay.test.tsx](../../../src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx).

Expose `actions.selectExpandedTab` and wire the shell/expanded command fixtures. Tab and mode changes must not call AI or review persistence or alter the active timer. Session tests exercise save completion while mode changes during an in-flight write, save failure and historical snapshot preservation. Keep existing generation and Practice owners.

**Focused command:**

```sh
rtk proxy npm test -- src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/features/overlay-session/components/overlay-shell.test.tsx --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 3: add the ShadowRoot-safe tab bar

**Owner files:** [overlay-tabs.tsx](../../../src/features/overlay-session/components/modes/expanded/overlay-tabs.tsx), [overlay-tabs.test.tsx](../../../src/features/overlay-session/components/modes/expanded/overlay-tabs.test.tsx).

Feature-local Solve/AI/Notes tab bar uses refs for focus inside the actual ShadowRoot. Protect roving tab stop, ArrowLeft/ArrowRight wrapping, Home/End, tab/panel ID pairing and selection. Passive cues remain generic; do not create unread tracking or automatic tab/focus changes.

**Focused command:**

```sh
rtk proxy npm test -- src/features/overlay-session/components/modes/expanded/overlay-tabs.test.tsx --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 4: partition expanded surface without losing panel state

**Owner files:** [expanded-overlay.tsx](../../../src/features/overlay-session/components/modes/expanded/expanded-overlay.tsx), [expanded-overlay.test.tsx](../../../src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx).

Keep each panel mounted while switching tabs; retain native report disclosure and each panel's scroll position. Hidden panels are inaccessible and inert, including keyboard controls. Solve contains timer/assessment/submission dates/Help/review feedback/next guidance and the full review footer; AI contains existing completed-submission report/recovery; Notes has only a reserved placeholder, no editable fields. Tests select AI explicitly for report/recovery and protect existing Solve flows. Actual scroll/layout and hidden controls still require browser smoke; no width/anchor change belongs to this phase.

**Focused command:**

```sh
rtk proxy npm test -- src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 5: meaningful disabled AI state and report independence

**Owner files:** [overlay-code-analysis.tsx](../../../src/features/overlay-session/components/modes/expanded/overlay-code-analysis.tsx), [overlay-code-analysis.test.tsx](../../../src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx), [use-leetcode-overlay-session.test.tsx](../../../src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx).

Render a disabled assessment explanation and Settings action; idle explains completed-submission analysis. Preserve existing report replacement, copy, Retry, cancellation and saved-review behavior across tabs. Danger feedback may mean Settings/context failure, so Error must not claim every danger is a failed save. Do not introduce auto-generation or focus/tab changes.

**Focused command:**

```sh
rtk proxy npm test -- src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx --run
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

## Task 6: current docs, required checks and human proof

**Owner files:** [product.md](../../../docs/product.md), [architecture.md](../../../docs/architecture.md), [testing.md](../../../docs/testing.md), [design.md](../../../design.md), [2026-10-04-overlay-focused-tabs.md](../../../docs/superpowers/handoffs/2026-10-04-overlay-focused-tabs.md), [README.md](../../../docs/superpowers/README.md).

Document focused tabs only after implementation; current authority owns behavior, historical plans own execution history. Record exact commands/results/failures/corrections and all screenshot paths in the handoff. Inspect shadow-root panels, keyboard/scroll, Save completion in all modes, existing report disclosures and disabled/recovery states. Preserve historical log fields and Notes reservation. No runtime contract, database, permissions or provider change is part of Phase 1; Phase 2 hints has separate approval/plan/evidence.

**Focused command:**

```sh
rtk proxy npm test -- src/features/overlay-session/domain/overlay-session-state.test.ts src/features/overlay-session/components/modes/expanded/overlay-tabs.test.tsx src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx src/features/overlay-session/components/overlay-shell.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx --run
rtk proxy npm run lint
rtk proxy npm run check
rtk proxy npm run build
```

- [x] Implemented and independently reviewed; exact historical outcomes are in the handoff.

- [ ] Human engineer completes installed-extension happy-path/edge-case smoke and screenshot/recording proof in [focused overlay testing](../../testing.md). JSDOM and fixture captures do not prove physical layout or realtime persistence.
- [ ] Mark review/merge readiness only after that evidence; both phases currently remain draft/pending.

Scoped Prettier write/check passed for the five Markdown files touched by this approved simplification; historical results remain in the handoffs. The later Phase 2 wire simplification does not alter the Phase 1 session/tab interface.
