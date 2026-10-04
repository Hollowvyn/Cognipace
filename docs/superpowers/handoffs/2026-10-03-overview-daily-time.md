# Overview Daily Time Handoff

[PR #191](https://github.com/Hollowvyn/Cognipace/pull/191), branch
`codex/overview-daily-time`, base `b2d9291f`. User approved October 3, 2026.
The fourth card implements the [approved counting rules](../specs/2026-10-03-overview-daily-time-design.md).
PR stays draft pending human installed-extension smoke with visual proof.

## Validation

Node 24.20.0/npm 11.19.0. Focused validation passed 83 tests in six files;
full check passed 2,169 tests in 195 files after consolidating duplicate scenarios.
Correction, reset, and suspension time assertions now reuse existing integration tests.
Exact commands for the final simplification:

```sh
rtk proxy npm run test -- src/features/practice/domain/practice-progress.test.ts src/features/practice/server/practice-progress-service.test.ts src/features/practice/practice-core.integration.test.ts src/features/app-shell/domain/dashboard-overview.test.ts src/features/app-shell/components/overview-screen.test.tsx src/features/app-shell/server/app-shell-service.test.ts
rtk proxy npm run check
rtk proxy npx prettier --write src/features/practice/server/practice-progress-service.test.ts src/features/practice/practice-core.integration.test.ts
rtk proxy npx prettier --ignore-path /dev/null --write docs/superpowers/specs/2026-10-03-overview-daily-time-design.md docs/superpowers/plans/2026-10-03-overview-daily-time.md docs/superpowers/handoffs/2026-10-03-overview-daily-time.md
rtk proxy git diff --check
```

`check` includes database checks, WXT generation, TypeScript, lint, and full tests.
Original feature validation also passed `rtk proxy npm ci`,
`rtk proxy npm run lint`, and `rtk proxy npm run build`.
Existing jsdom `scrollTo` notices and build chunk warnings were nonfatal.
Resolved earlier failures: missing WXT config, registry DNS before install,
fixture sandbox binding/missing Chromium, extension-only fixture imports/favicon,
and a test using `.attempts` instead of `.reviewHistory`. Final checks passed.

## Visual Evidence

Production Overview component/domain with dashboard styles and illustrative
saved totals, rendered in installed Chrome via a temporary Playwright fixture.
1280/768/375px verified four/two/one columns, no horizontal overflow, no final
console errors or framework overlay, and `0m`/`<1m`/`1m`/`1h`/`1h 25m` states.

- [Desktop dark](assets/2026-10-03-overview-daily-time/desktop-dark.png)
- [Tablet dark](assets/2026-10-03-overview-daily-time/tablet-dark.png)
- [Narrow dark](assets/2026-10-03-overview-daily-time/narrow-dark.png)
- [Narrow light](assets/2026-10-03-overview-daily-time/narrow-light.png)

Proof command: `rtk proxy node /private/tmp/cognipace-overview-daily-time-proof/verify.mjs`.
The temporary preview server is stopped. Fixture proof covers presentation;
[human happy-path and edge-case smoke](../../testing.md#overview-daily-time)
with screenshot/recording remains required before review or merge.

## Skipped Validation And Release

- `rtk proxy npm run db:generate`: no schema/migration changes.
- Standalone `rtk proxy npm run db:check` and `rtk proxy npm run lint`: included in `check`.
- Repeated `rtk proxy npm run build`: already passed; simplification changes only tests/docs.
- `rtk proxy npm run zip`: packaging/store release not requested.

Feature/minor release signal. Revert restores three cards without changing saved
reviews, backups, or sync. No merge/release performed. The approved user request
and supplied screenshot document the focused addition's issue-tracking exception.
