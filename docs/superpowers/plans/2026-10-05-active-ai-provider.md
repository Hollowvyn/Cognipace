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

- [x] Add regression assertions that saving calls secret/settings mutations but
      never `genai.testConnection`; testing calls only `genai.testConnection`.
- [x] Add two-key activation, unchanged disabled save, failure, pending-operation,
      and active-summary assertions. Run the hook test to observe missing behavior.
- [x] Split the existing `submit` operation into persistence-only `submit` and
      `actions.testConnection`, retaining the existing lease and epoch/revision guards.
      Derive the active summary from saved settings and reuse a saved key on activation.
- [x] Restore the active provider's saved model in `setProvider`; use existing
      suggestions for other providers. Run the hook suite to green.

## 2. UI and integration

Files: `src/features/settings/components/sections/ai-assessment-section.tsx`, its
`.test.tsx`, and `src/features/settings/components/settings-screen.test.tsx`.

- [x] Show an Active provider row and missing-key/empty/loading states.
- [x] Keep `type="submit"` for Save & make active / Make active. Add a separate
      `type="button"` Test connection calling `actions.testConnection`.
- [x] Disable unchanged saving and testing of unsaved connection edits. Explain
      that activation precedes testing. Preserve Discard, free preset, masked keys,
      setup links, and independent assessment enablement.
- [x] Update integration assertions for Enter saving once without testing; click
      Test connection separately. Verify multiple keys and persisted active summary.
- [x] Run focused hook, section, and SettingsScreen test files.

## 3. Docs, validation, and proof

Files: `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `design.md`,
and `docs/superpowers/README.md`.

- [x] Replace current Save & test guidance with the approved separate actions;
      add multiple-key activation and independent-test manual smoke.
- [x] Run `rtk npm run check`, `rtk npm run build`,
      `rtk proxy npx prettier --check <touched files>`, and `rtk git diff --check`.
- [x] Capture desktop/mobile component proof and record exact results, skipped
      commands, and pending human loaded-extension smoke in this plan.
- [x] Review the scoped diff and commit using a Conventional Commit title.

## Validation record

Completed on 2026-10-05 on `codex/active-ai-provider`. Existing regression
assertions were run before implementation and failed on the missing summary and
save-without-test behavior. Updated focused suites then passed: 50 tests across
the controller, section, and SettingsScreen integration.

Exact commands run:

```sh
rtk proxy env DEBUG_PRINT_LIMIT=0 npm run test -- src/features/settings/hooks/use-ai-connection-controller.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/settings/components/settings-screen.test.tsx
rtk npm run check
rtk npm run build
rtk proxy node /private/tmp/cognipace-active-ai-provider-ui/server.mjs
rtk proxy node /private/tmp/cognipace-active-ai-provider-ui/verify.mjs
rtk proxy npx prettier --check src/features/settings/hooks/use-ai-connection-controller.ts src/features/settings/hooks/use-ai-connection-controller.test.tsx src/features/settings/components/sections/ai-assessment-section.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/settings/components/settings-screen.test.tsx docs/product.md docs/architecture.md docs/testing.md design.md docs/superpowers/README.md
rtk proxy npx prettier --ignore-path /dev/null --check docs/superpowers/specs/2026-10-05-active-ai-provider-design.md docs/superpowers/plans/2026-10-05-active-ai-provider.md
rtk git diff --check
```

Full check: database checks, TypeScript, lint, and 2,820 tests passed; six opt-in
live evaluation tests skipped. Build passed with the existing large-chunk
warning. The first isolated preview-server attempt needed a sandbox escalation
to bind localhost; the subsequent server and browser verification passed.
Browser proof used the production component, actual styles, and mocked runtime:
activation emitted only a settings write, testing emitted only a test request,
active identity survived reload and editor changes, keys stayed masked,
assessment stayed off, removal showed a missing active key, and desktop/mobile
had no browser errors or horizontal overflow at 375px.

Screenshots are saved under
`/Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a109f8-51cf-75e3-a0bd-cee3d604fe3a/`:

- `active-ai-provider-desktop.png`: active OpenRouter, independent test and disabled unchanged save.
- `active-ai-provider-switch.png`: OpenRouter stays active while browsing saved OpenAI; Make active is available.
- `active-ai-provider-mobile.png`: separate actions and saved active summary at 375px.

Skipped command:

```sh
rtk proxy env COGNIPACE_AI_EVAL=1 npm run test -- src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts
```

Reason: no private evaluation provider/model/key configured for this opt-in
live-inference suite. No required automated command was skipped.

Human installed-extension happy-path and edge-case testing remains pending:
run the AI Connection And Assessment Settings and OpenRouter smoke flows in
`docs/testing.md`, especially two saved keys, separate activation/test requests,
Enter, reopen, failed credentials/models, worker interruption, external key
replacement, and key removal/reset. Attach dated screenshots or a recording
before PR review or merge. Mocked component proof does not replace this.

Release impact: a feature change to Settings connection actions. No persisted
schema, runtime message, secret storage, permission, or sync boundary changed.
Rollback: revert this feature commit; existing provider/model/key data remains
compatible with the previous Settings implementation.
