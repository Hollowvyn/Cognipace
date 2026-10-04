# Overview Daily Time Handoff

Implemented on `codex/overview-daily-time` from fetched `origin/main`
`b2d9291f`. The user approved the design and implementation on October 3, 2026.
Human installed-extension smoke with screenshot or recording proof remains
pending before PR review or merge.

## Result

- The fourth Overview card is **Time Today**, with **Recorded time on today's
  submissions.** as its caption.
- Practice sums retained `elapsedSeconds` for all assessments whose
  `reviewedAt` falls on today's browser-local date. Repeated and failed attempts
  contribute time; missing, invalid, and non-positive values do not.
- Corrections replace the existing saved time without duplication; resetting a
  problem removes its retained effort. Suspension preserves recorded effort.
- Values use `0m`, `<1m`, whole minutes, or hours/minutes such as `1h 25m`.
  Completed Today continues to count unique problems independently.
- Cards use the existing styles and wrap from four desktop columns to two
  intermediate columns and one small-screen column.
- The existing summary read, Zod response, and practice invalidation carry the
  total. No new endpoint, permission, setting, persisted shape, or migration is
  needed. Day rollover follows existing reread/focus behavior; there is no new
  live-midnight polling timer.

## Validation

Node `v24.20.0` and npm `11.19.0` match the pins. `rtk proxy npm ci` passed.
Its existing deprecated-loader and unapproved install-script notices were
nonfatal; no dependency changes or install-script approvals were introduced.

Tests were added before implementation. Practice's initial regression run
failed on 13 missing-total assertions, then passed 21 tests. Overview's
regressions failed on 11 missing-card/total assertions with 31 existing tests
passing. After implementation, the integrated focused command passed 207 tests
in nine files, and the full check passed 2,172 tests in 195 files.

Exact passed commands:

```sh
rtk proxy npm ci
rtk proxy npm run prepare:wxt
rtk proxy npm run test -- src/features/practice/domain/practice-progress.test.ts src/features/practice/server/practice-progress-service.test.ts
rtk proxy npm run test -- src/features/app-shell/domain/dashboard-overview.test.ts src/features/app-shell/components/overview-screen.test.tsx
rtk proxy npm run test -- src/features/practice/domain/practice-progress.test.ts src/features/practice/server/practice-progress-service.test.ts src/features/app-shell/domain/dashboard-overview.test.ts src/features/app-shell/components/overview-screen.test.tsx src/features/app-shell/server/app-shell-service.test.ts
rtk proxy npm run test -- src/features/practice/domain/practice-progress.test.ts src/features/practice/server/practice-progress-service.test.ts src/features/app-shell/domain/dashboard-overview.test.ts src/features/app-shell/components/overview-screen.test.tsx src/features/app-shell/server/app-shell-service.test.ts src/app/dashboard/routes.test.tsx src/app/popup/popup-shell.test.tsx src/features/app-shell/hooks/use-popup-app-shell-controller.test.tsx src/extension/background/register-handlers.test.ts
rtk proxy npx eslint src/features/practice/domain/practice-progress.ts src/features/practice/domain/practice-progress.test.ts src/features/practice/data/practice-repository.ts src/features/practice/server/practice-progress-service.test.ts
rtk proxy npx prettier --check src/features/practice/domain/practice-progress.ts src/features/practice/domain/practice-progress.test.ts src/features/practice/data/practice-repository.ts src/features/practice/server/practice-progress-service.test.ts
rtk proxy npm run lint
rtk proxy npm run check
rtk proxy npm run build
rtk proxy npx prettier --ignore-path /dev/null --check docs/product.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-03-overview-daily-time-design.md docs/superpowers/plans/2026-10-03-overview-daily-time.md docs/superpowers/handoffs/2026-10-03-overview-daily-time.md src/features/app-shell src/features/practice/domain/practice-progress.ts src/features/practice/domain/practice-progress.test.ts src/features/practice/data/practice-repository.ts src/features/practice/server/practice-progress-service.test.ts src/testing/app-shell-fixtures.ts src/app/dashboard/routes.test.tsx src/app/popup/popup-shell.test.tsx src/extension/background/register-handlers.test.ts
rtk proxy git diff --check
```

`check` includes database checks, WXT type generation, TypeScript, ESLint, and
the full Vitest suite. The route tests emitted existing jsdom `scrollTo` notices,
and the build emitted its chunk-size warning. Both commands exited zero.
Separate specification-compliance and code-quality reviews found no actionable
issues.

Early setup and fixture failures were resolved:

- The first Overview and service test runs found missing `.wxt/tsconfig.json`.
  `npm run prepare:wxt` generated it before the meaningful failing tests.
- An initial `npx prettier --write` call started before dependency installation
  and failed with registry DNS unavailable. Later local Prettier runs succeeded.
- The first fixture server was denied localhost binding by the sandbox; its
  approved localhost-only retry succeeded.
- Bundled Playwright's expected Chromium executable was absent. The proof used
  installed Chrome with an isolated temporary profile instead.
- The first fixture render loaded extension-only APIs through an unrelated
  barrel. A fixture-only exact alias to the production difficulty badge removed
  those APIs. A missing fixture favicon was also fixed before final proof.
- An intermediate Practice test asserted `.attempts` instead of the existing
  `.reviewHistory`; the test was corrected and rerun.

## Visual Evidence

The Browser plugin was unavailable; bundled Playwright used installed Chrome
against `http://127.0.0.1:4178/`. The actual OverviewMetrics component and domain
view builder were rendered with production dashboard styles and illustrative
saved totals. This verifies presentation, not installed-extension persistence.

| Check                   | Result                                                      |
| ----------------------- | ----------------------------------------------------------- |
| Page identity/content   | Correct fixture title and all four cards                    |
| Framework overlay       | Absent                                                      |
| Console errors/warnings | None in the final run                                       |
| Desktop/tablet/narrow   | 1280px: four columns; 768px: two; 375px: one                |
| Overflow                | Document width equals viewport width at every tested size   |
| Time state changes      | `0m`, `<1m`, `1m`, `1h`, `1h 25m` verified after navigation |

Saved local artifacts:

- [Desktop dark](/Users/tobiolutimehin/.codex/visualizations/2026/10/04/01a104c4-0b26-70b0-9334-33048b0cc7b3/overview-daily-time/desktop-dark.png)
- [Tablet dark](/Users/tobiolutimehin/.codex/visualizations/2026/10/04/01a104c4-0b26-70b0-9334-33048b0cc7b3/overview-daily-time/tablet-dark.png)
- [Narrow dark](/Users/tobiolutimehin/.codex/visualizations/2026/10/04/01a104c4-0b26-70b0-9334-33048b0cc7b3/overview-daily-time/narrow-dark.png)
- [Narrow light](/Users/tobiolutimehin/.codex/visualizations/2026/10/04/01a104c4-0b26-70b0-9334-33048b0cc7b3/overview-daily-time/narrow-light.png)
- [Layout and console results](/Users/tobiolutimehin/.codex/visualizations/2026/10/04/01a104c4-0b26-70b0-9334-33048b0cc7b3/overview-daily-time/validation.json)

The temporary harness and verifier are at
`/private/tmp/cognipace-overview-daily-time-proof`; no fixture files were added
to committed source. Proof command:
`rtk proxy node /private/tmp/cognipace-overview-daily-time-proof/verify.mjs`.
The preview server was stopped after proof.

## Skipped Validation And Remaining Risk

- `rtk proxy npm run db:generate`: skipped because no schema or migration changed.
- Standalone `rtk proxy npm run db:check`: not repeated because it passed within
  `rtk proxy npm run check`.
- `rtk proxy npm run zip`: skipped because packaging and store release were not
  requested and artifact behavior did not change.
- Human installed-extension smoke: pending, not N/A. Run
  [Overview Daily Time](../../testing.md#overview-daily-time), including timed,
  untimed, repeated/failed, corrected/reset assessments, local date rollover,
  responsive layout, and screenshot/recording proof before PR review or merge.

## Release And Recovery

Suggested Conventional Commit/PR title:
`feat(overview): show daily recorded practice time`.
This is a feature release signal. Reverting the change restores the three-card
Overview without changing stored reviews, backups, or existing configured sync.
No PR, merge, or release was performed. The user request and supplied screenshot
serve as the documented issue-tracking exception for this focused addition.
