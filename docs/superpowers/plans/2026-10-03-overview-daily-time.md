# Overview Daily Time Implementation Plan

Implement the [approved design](../specs/2026-10-03-overview-daily-time-design.md)
through the existing Practice summary and app-shell payload.

## Practice Total

Files: `src/features/practice/domain/practice-progress.ts` and adjacent tests,
`data/practice-repository.ts`, `server/practice-progress-service.test.ts`, and
`practice-core.integration.test.ts` under the same feature.

- [x] Aggregate saved seconds for today's local date independently of unique completions.
- [x] Cover repeats, failures, untimed/invalid values, date boundaries, and disabled goals.
- [x] Extend existing correction/reset/suspension integration scenarios with time assertions.

## Overview

Files under `src/features/app-shell`: `api/app-shell-contracts.ts`,
`domain/dashboard-overview.ts` and adjacent tests,
`components/overview/overview-panels.tsx`, `components/overview-screen.test.tsx`,
`server/app-shell-service.test.ts`, plus existing fixtures/fallbacks.

- [x] Carry a non-negative integer total in the shared Zod contract.
- [x] Add the fourth card with zero, sub-minute, minute, and hour formatting.
- [x] Use the existing card style with four/two/one responsive columns.
- [x] Test the serialized total and rendered card.

## Validation And Handoff

- [x] Update `docs/product.md`, `docs/testing.md`, and the Superpowers index.
- [x] Run focused tests, `rtk proxy npm run lint`, `rtk proxy npm run check`,
      `rtk proxy npm run build`, touched-file Prettier, and `rtk proxy git diff --check`.
- [x] Inspect production-component screenshots across sizes and themes.
- [x] Record exact commands, skipped checks, and release/rollback guidance in the
      [handoff](../handoffs/2026-10-03-overview-daily-time.md).
- [ ] Human installed-extension happy-path and edge-case smoke with visual proof
      before PR review or merge; keep PR #191 draft until attached.

Implementation is complete when the saved total reaches the fourth card,
automated checks pass, and the handoff identifies pending human proof.
