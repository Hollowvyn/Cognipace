# CogniPace Ponytail codebase audit

Date: 2026-10-02. Baseline: `709957e`, current `origin/main` after fetch.
Branch: `codex/ponytail-codebase-audit`.

Status: historical baseline audit complete. The human approved the
[design](../specs/2026-10-02-ponytail-cleanup-design.md) on 2026-10-02;
implementation and current evidence are tracked in the
[ledger](2026-10-02-ponytail-implementation-ledger.md). Findings below record the
pre-fix state.

Four agents reviewed separate areas: core feature/domain/data code; UI,
dashboard, popup and overlay flows; runtime, persistence and integrations;
and package, scripts, CI, validation and consolidation. The source/scripts/CI
inventory contains 660 files, including 623 JavaScript/TypeScript files and
185 test files. This is a source and automated audit, not a certification that
every browser flow is correct.

## Ponytail complexity audit

Ranked by conservative source-line savings. Counts exclude tests, lockfile
changes and speculative follow-on simplification. Some counts are estimates.
Delete consumers before their supporting code; preserve live shared exports.

- `delete:` Remove the unused legacy Analytics charts and their barrel. The live screen uses historical/current/workload views. Replacement: nothing. About 943 lines. [charts](../../../src/features/analytics/components/charts/recall-quality-chart.tsx#L77).
- `delete:` Remove the unused legacy Analytics response fields and their calculations, types and schemas. Replacement: the existing `data.views` models. About 420 lines. [analytics-service.ts](../../../src/features/analytics/server/analytics-service.ts#L202).
- `delete:` After the legacy chart deletion, remove unused generic tooltip/legend content and private payload helpers. Replacement: the live views' existing tooltip content. About 309 lines. Keep `ChartContainer`, `ChartStyle`, reduced-motion support and `ChartTooltip`. [chart.tsx](../../../src/components/ui/chart.tsx#L239).
- `delete:` Remove the test-only, superseded `TracksRepository.getActiveTrack` and private next-selection helpers. Replacement: the production `tracks-service.getActiveTrack`/`readActiveTrackGuidance`; migrate meaningful tests to that path. About 100 lines. Keep `readFirstGroup`, which also has a live caller. [tracks-repository.ts](../../../src/features/tracks/data/tracks-repository.ts#L44).
- `delete:` Remove disconnected dashboard placeholder page/panel/modal components. Replacement: already routed feature screens. About 100 lines. [dashboard-placeholder-page.tsx](../../../src/app/dashboard/layout/dashboard-placeholder-page.tsx#L27), [placeholder-panel.tsx](../../../src/app/dashboard/layout/placeholder-panel.tsx#L5), [modal-placeholders.tsx](../../../src/app/dashboard/screens/modal-placeholders.tsx#L4).
- `yagni:` Remove unused FSRS schedule projection and its private options/helpers. Replacement: Upcoming Review Load already uses persisted due dates. About 88 lines. Keep review scheduling, retrievability and history replay. [review-scheduler.ts](../../../src/lib/fsrs/scheduler/review-scheduler.ts#L122).
- `delete:` Remove test-only `getRecentRatings` and `RecentRating`. Replacement: the existing complete history read. About 30 lines. [analytics-repository.ts](../../../src/features/analytics/data/analytics-repository.ts#L82).
- `delete:` Remove the unreferenced extension ping hook. Replacement: nothing; keep the runtime method used by other diagnostic flows. 12 lines. [use-extension-ping.ts](../../../src/hooks/use-extension-ping.ts#L5).
- `delete:` Remove unreferenced `clearSnapshot` and its re-export. Replacement: nothing. About 5 lines. [snapshot.ts](../../../src/platform/db/snapshot.ts#L73).
- `delete:` Remove unused `date-fns`. Replacement: existing date/calendar helpers and `Intl`. [package.json](../../../package.json#L49).
- `delete:` Remove unconfigured `eslint-plugin-import-x` and `eslint-plugin-react-refresh`. Replacement: the existing ESLint rules and architecture boundary checks. [package.json](../../../package.json#L73).

The five obsolete chart files are `recall-quality-chart.tsx`,
`memory-strength-chart.tsx`, `consistency-chart.tsx`, `ratings-mix-chart.tsx`
and `weakest-topics-chart.tsx`, plus `charts/index.ts`. Keep live
`line-segments.tsx` and shared formatters. Removing the old Analytics payload
also requires updating architecture documentation that still names the old
chart catalogue as authoritative.

Optional later candidates: repeated modal focus machinery (roughly 200 lines),
native abort-signal composition (roughly 20 lines, after Chrome compatibility
verification), and unnecessary DB initialization in secret-only handlers.
They are excluded from the net estimate. Fix provider timeout behavior before
considering adapter deduplication. Small repository wrappers do not justify a
standalone rewrite just to save a few lines.

net: approximately -2007 source lines, -3 direct deps possible.

## Correctness review

These are separate from Ponytail's complexity audit. P1 means urgent
data-safety/recovery impact; P2 means a reachable functional defect.

| ID  | Priority | Finding and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Minimum repair and coverage                                                                                                                                                                                                                              |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | P1       | Backup selection can restore A while displaying B's filename. `handleFileSelect` awaits file reading and validation without checking whether selection changed. Deferred-file component repro failed: B.json remained visible but restore received A's timestamp. [data-management-screen.tsx:61](../../../src/features/backup/components/data-management-screen.tsx#L61).                                                                                                                                | Guard read, parse, validation, success and error updates by selection generation; reuse the Imports race-handling pattern. Test late read and late validation, including stale errors. Keep filename, summary and restore payload tied to one selection. |
| C2  | P1       | Confirmed Force pull is rejected for dirty local state. The service honors confirmation, but the runtime restore callback unconditionally rejects dirty metadata. Existing service tests omit that callback. [register-handlers.ts:1550](../../../src/extension/background/register-handlers.ts#L1550), [sync-service.ts:392](../../../src/features/sync/server/sync-service.ts#L392).                                                                                                                    | Carry schema-validated manual overwrite authorization into that manual action's queued restore callback. Preserve automatic/open-check rejection, mutation serialization and dirty-mark retry. Add a handler/service integration regression.             |
| C3  | P2       | Accepted automatic review triggers two AI assessments, with different fingerprints/context. One comes from review actions and one from the display hook; server handling does not coalesce them. Component/hook repro observed two requests instead of one. [use-overlay-review-actions.ts:360](../../../src/features/overlay-session/hooks/use-overlay-review-actions.ts#L360), [use-leetcode-overlay-session.ts:160](../../../src/features/overlay-session/hooks/use-leetcode-overlay-session.ts#L160). | Make one existing overlay owner provide the request/result to both saving and display. Preserve manual submission, failure locks, overrides, navigation and restart. Test provider-call count and displayed/saved agreement.                             |
| C4  | P2       | Provider timeout ends when headers arrive, before JSON/error-body consumption. A stalled-body repro with a 10 ms deadline stayed pending after 50 ms and succeeded at 63 ms. All three adapters share the helper. [shared.ts:45](../../../src/features/genai/server/providers/shared.ts#L45).                                                                                                                                                                                                             | Keep cancellation active through body reads and classify body aborts consistently as timeout/cancellation. Test delayed success and error bodies for each provider.                                                                                      |
| C5  | P2       | Network fallback metadata and empty fallback content are cached indefinitely for a slug. Offline-to-online repro still returned fallback on the second call, without another fetch. Watcher completion also prevents details retry. [leetcode-capture-service.ts:50](../../../src/features/leetcode-capture/server/leetcode-capture-service.ts#L50), [leetcode-page-watcher.ts:253](../../../src/lib/leetcode/watcher/leetcode-page-watcher.ts#L253).                                                     | Cache useful remote successes; keep incomplete details retryable while retaining successful caches and navigation guards. Test offline-to-online recovery and empty fallback hydration.                                                                  |
| C6  | P2       | Normalized topic-ID import lookup indexes raw IDs. A valid restored `Custom-ID` topic plus imported `custom-id` creates a new label colliding with the existing normalized ID; `buildTopicLookup` then throws. Repro exercised non-legacy reconciliation as well as planning. [plan-import-problems.ts:82](../../../src/features/imports/domain/plan-import-problems.ts#L82).                                                                                                                             | Normalize ID lookup keys, alias-target lookup and relevant-state fingerprint matching; retain exact stored IDs in output rows. Add planner/service tests covering restored custom IDs and stale preview detection.                                       |
| C7  | P2       | Invalid URL input falls through to raw slug normalization. Non-LeetCode URLs and `/explore/` become slug `https`; reachable through Library create and Track input. Production-parser repro confirmed both. [problem-url.ts:35](../../../src/lib/leetcode/domain/problem-url.ts#L35).                                                                                                                                                                                                                     | Reject URL-shaped input when canonical URL parsing fails; preserve bare slugs and valid LeetCode problem URLs. Test the combined parser and both callers.                                                                                                |
| C8  | P2       | Recent Overdue Backlog counts earlier times today as overdue. Production domain repro reported backlog 1 while practice reported `isOverdue:false` and Upcoming Load reported overdue 0. Existing tests encode the incorrect date semantics. [chart-data.ts:498](../../../src/features/analytics/domain/chart-data.ts#L498).                                                                                                                                                                              | Compare selected-timezone calendar dates, matching documented practice semantics. Update incorrect expectations and test today/yesterday plus timezone boundaries.                                                                                       |
| C9  | P2       | Distinct valid company labels can allocate the same ID. `Meta` and `Meta!` both allocate `meta`; insertion is suppressed, exact-label reread fails. In-memory migrated DB/repository repro throws `Failed to read saved label`. Create/edit/bulk share this helper. [problems-repository.ts:754](../../../src/features/problems/data/problems-repository.ts#L754).                                                                                                                                        | Reuse normalized existing labels and allocate collision-safe new IDs while preserving persisted identities. Test case variants, distinct labels sharing a slug and transactions.                                                                         |
| C10 | P2       | Library confirmation and bulk metadata dialogs claim modal semantics but do not contain/restore focus. Cancel → Delete → Tab escapes to underlying controls in the reproduction. Tracks reset-schedule confirmations also reuse the Problems dialog. [problem-confirmation-dialog.tsx:26](../../../src/features/problems/components/library/problem-confirmation-dialog.tsx#L26).                                                                                                                         | Fix these specific modal flows using native modal behavior or existing proven behavior; test containment, restoration, Escape and pending cancellation.                                                                                                  |
| C11 | P2       | Library row/bulk failures render behind a confirmation that remains open, instead of inside it. Source trace shows error state outside the active dialog; no separate regression was run. [problem-row-actions.tsx:75](../../../src/features/problems/components/problem-row/problem-row-actions.tsx#L75), [problem-bulk-action-bar.tsx:153](../../../src/features/problems/components/library/problem-bulk-action-bar.tsx#L153).                                                                         | Render failures inside the active dialog with retry/cancel controls. Add rejection-path component coverage before changing it.                                                                                                                           |

One additional data-safety risk needs a dedicated failure/restart test:
`hasPendingDirtyMarkRetry` is module memory only. After a dirty-mark storage
failure, a successful DB snapshot flush followed by service-worker restart can
leave persisted sync metadata clean. A later automatic pull could overwrite
that locally changed snapshot. The same-worker retry tests do not establish
restart safety. See `register-handlers.ts:1531`. Do not remove the existing
best-effort guards; reproduce this boundary before designing a durable repair.

## Dependency advisory baseline

`npm audit` reported 9 affected package entries: 2 high, 6 moderate, 1 low.
These are scanner classifications, not nine proven exploitable app paths.

- High: `brace-expansion@5.0.9` through lint tooling and `undici@7.29.0` through jsdom.
- Moderate: `vitest`/`@vitest/mocker@4.1.6`, plus the Drizzle Kit → legacy esbuild loader chain.
- Low: production `dompurify@3.4.13`; the reported advisory concerns `IN_PLACE`/after-sanitize hooks, which current source does not use.

Use a separate, scoped dependency phase. Do not apply `npm audit fix --force`:
the scanner's Drizzle remediation proposes a major downgrade to 0.18.1.
Trace compatible fixes and rerun DB/tooling checks instead. Raw scanner data is
at `/private/tmp/cognipace-ponytail-audit.json`.

## Ponytail debt

Repository-wide comment-marker scan excluded dependencies, Git metadata,
generated output and skill-example directories. There were no actual markers.

No ponytail: debt. Clean ledger. 0 markers, 0 with no trigger.

## Validation evidence

Root commands run:

- `rtk git fetch origin` — succeeded after requesting sandbox access to external worktree Git metadata.
- `rtk proxy npm ci --cache /private/tmp/cognipace-ponytail-npm-cache` — sandbox attempt failed with registry `ENOTFOUND`; retry with network access succeeded. Node 24.20.0/npm 11.19.0 matched the pinned toolchain.
- `rtk proxy npm run check` — passed, including DB check, WXT/typecheck, ESLint and Vitest: **185 files / 1884 tests**.
- `rtk proxy npm run format` — passed.
- `rtk proxy npm run build` — passed; production package total 3.88 MB.
- `rtk proxy npm run store:check` — passed, version 1.4.0 and four required icons.
- `rtk proxy npm run zip` — passed; `dist/cognipace-1.4.0-chrome.zip`, 1.25 MB.
- `rtk proxy npm audit --json --cache /private/tmp/cognipace-ponytail-npm-cache` — exit 1 due to the nine advisory entries above.
- `rtk proxy npm explain brace-expansion undici dompurify @vitest/mocker esbuild` — identified the dependency chains above.
- `rtk proxy node --experimental-transform-types /private/tmp/cognipace-core-audit-repro.mjs` — reproduced C7, C8 and C9 against production code.
- `rtk proxy npx prettier --write --ignore-path /dev/null docs/superpowers/audits/2026-10-02-ponytail-codebase-audit.md docs/superpowers/specs/2026-10-02-ponytail-cleanup-design.md` — formatted both audit/design artifacts.
- `rtk proxy npx prettier --check --ignore-path /dev/null docs/superpowers/audits/2026-10-02-ponytail-codebase-audit.md docs/superpowers/specs/2026-10-02-ponytail-cleanup-design.md` — passed; the explicit ignore override includes planning artifacts normally excluded from the repository-wide formatting check.

Agent focused validation:

```sh
rtk npx vitest run src/lib/leetcode/domain/problem-url.test.ts src/features/analytics/domain/chart-data.test.ts src/features/problems/data/problems-repository.test.ts
rtk npm test -- src/features/sync/server/sync-service.test.ts src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts src/extension/background/import-handlers.test.ts src/features/imports/server/import-service.test.ts src/features/leetcode-capture/server/leetcode-capture-service.test.ts src/features/genai/server/providers/shared.test.ts --run
```

Passed respectively **3 files / 57 tests** and **7 files / 182 tests**.

Temporary regression tests intentionally failed:

```sh
rtk npx vitest run src/features/backup/components/.ponytail-audit-repro.test.tsx src/features/overlay-session/hooks/.ponytail-audit-repro.test.tsx -t ponytail-audit
rtk npx vitest run src/testing/.ponytail-dialog-audit-repro.test.tsx -t ponytail-audit
```

The first reproduced C1 and C3; the second reproduced C10. All temporary source
tests were removed. Copies remain under `/private/tmp` as
`cognipace-components-ponytail-audit-repro.test.tsx`,
`cognipace-hooks-ponytail-audit-repro.test.tsx`, and
`cognipace-testing-ponytail-dialog-audit-repro.test.tsx`. These copies need to be
placed back at their original source locations to resolve relative imports.

Runtime agent also ran isolated `rtk proxy node --input-type=module` heredocs
using temporary esbuild bundles to reproduce C4, C5 and C6. Those bundles were
removed; the scenarios must become maintained regression tests during repair.

Skipped: `npm run db:generate` because no schema changed; `npm run dev` and
human Chrome/Gist/live-provider smoke because this was a source/automated
audit. No visual or realtime manual proof has been collected. Behavioral
implementation must include the relevant human happy-path/edge-case checklist
and screenshot/recording proof before PR review or merge. No production code,
schema, permissions, sync scope or secrets were changed by this audit.
