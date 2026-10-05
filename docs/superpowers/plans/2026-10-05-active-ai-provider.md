# Active AI Provider Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task.

**Goal:** Separate testing from saving/activation and make the saved active
provider obvious when several provider keys exist.

**Architecture:** Keep the current Settings controller, form, operation gate,
scoped settings mutations, and trusted provider secrets. The existing background
test endpoint continues testing the saved active connection.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest/Testing Library, WXT.

## 1. Controller and behavioral tests

Files: `src/features/settings/hooks/use-ai-connection-controller.ts` and its
existing `.test.tsx` file.

- [ ] Add regression assertions that saving calls secret/settings mutations but
  never `genai.testConnection`; testing calls only `genai.testConnection`.
- [ ] Add two-key activation, unchanged disabled save, failure, pending-operation,
  and active-summary assertions. Run the hook test to observe missing behavior.
- [ ] Split the existing `submit` operation into persistence-only `submit` and
  `actions.testConnection`, retaining the existing lease and epoch/revision guards.
  Derive the active summary from saved settings and reuse a saved key on activation.
- [ ] Restore the active provider's saved model in `setProvider`; use existing
  suggestions for other providers. Run the hook suite to green.

## 2. UI and integration

Files: `src/features/settings/components/sections/ai-assessment-section.tsx`, its
`.test.tsx`, and `src/features/settings/components/settings-screen.test.tsx`.

- [ ] Show an Active provider row and missing-key/empty/loading states.
- [ ] Keep `type="submit"` for Save & make active / Make active. Add a separate
  `type="button"` Test connection calling `actions.testConnection`.
- [ ] Disable unchanged saving and testing of unsaved connection edits. Explain
  that activation precedes testing. Preserve Discard, free preset, masked keys,
  setup links, and independent assessment enablement.
- [ ] Update integration assertions for Enter saving once without testing; click
  Test connection separately. Verify multiple keys and persisted active summary.
- [ ] Run focused hook, section, and SettingsScreen test files.

## 3. Docs, validation, and proof

Files: `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `design.md`,
and `docs/superpowers/README.md`.

- [ ] Replace current Save & test guidance with the approved separate actions;
  add multiple-key activation and independent-test manual smoke.
- [ ] Run `rtk npm run check`, `rtk npm run build`,
  `rtk proxy npx prettier --check <touched files>`, and `rtk git diff --check`.
- [ ] Capture desktop/mobile component proof and record exact results, skipped
  commands, and pending human loaded-extension smoke in this plan.
- [ ] Review the scoped diff and commit using a Conventional Commit title.

## Validation record

Implementation and validation are pending. Human smoke/proof is required before
review or merge; automated fixture proof does not replace it.
