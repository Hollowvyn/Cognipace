# First Attempt Outcomes and Repeat Recall Handoff

The approved split is implemented on `codex/analytics-layout-polish` for
[draft PR #184](https://github.com/Hollowvyn/Cognipace/pull/184). Required human
installed-extension happy-path and edge-case smoke with screenshot or recording
proof remains pending before PR review or merge.

The [approved design](../specs/2026-10-03-analytics-first-attempts-and-repeat-recall-design.md)
and [phase-sized plan](../plans/2026-10-03-analytics-first-attempts-and-repeat-recall.md)
record the user-approved direction. The selected preview remains preserved
verbatim in the spec assets. Interdependent Settings, runtime, and UI changes
are committed together after integrated validation.

## Result

- New Problem Success shows Hard + Good + Easy and Good + Easy outcomes from
  the same valid-first denominator, using mint circles and a thinner solid blue
  diamond curve. It selects the earliest retained raw event per problem across
  cards/modes before rating or range filters. An earliest Again stays failure;
  an invalid earliest rating is excluded and never replaced by a later success.
  Nullable or conflicting correctness and missing FSRS logs do not exclude a
  supported rating. This is retained recorded history, not proof of unaided
  solving or first-ever exposure.
- Count-weighted period totals retain invalid-first exclusions, including
  unsupported outer buckets trimmed from display. Strict runtime schemas check
  integer counts, rating sums, numerators, rates, evidence, and totals against
  all serialized rows. First-outcome readiness counts valid selected first
  records independently of Recall.
- Recall vs FSRS Estimate emits only repeat pairs after full valid-rating
  per-card replay. Initial and pre-range reviews still establish memory state;
  replay index zero is excluded from comparison. Both curves, compatible legacy
  payloads, and Recall readiness use the same pairs. Genuine zero estimates stay
  valid; correctness does not gate the rating-derived comparison. Other metric
  populations remain unchanged.
- Target First-attempt Success and Target Good + Easy independently default to
  90% and accept whole percentages from 0 through 100. Each saves only its own
  Settings key. Equal goals draw one neutral reference, retaining both editors
  and inspection values. The old Review Success >= Recall goal rule remains
  limited to the old pair. Missing older fields default individually; malformed
  local new fields recover individually; strict backup imports reject malformed
  supplied values. Reset Defaults restores all four goals.
- Successful saves refresh references and the fitted first-outcome scale across
  cached ranges while preserving measured rows, totals, readiness, and other
  goals. No database migration, runtime method, Chrome permission, or new sync
  mechanism is added. New preferences use existing backups and configured Gist
  settings transport.
- First outcomes and repeat Recall share a responsive `lg` row and stack below
  it. The existing Practice Rhythm and later panels keep their treatment. Both
  plots retain calendar midpoints, sparse dates, 12px first-point clearance,
  singleton bounds, outer-edge trim/internal gaps, measured zero, stable scale
  and dates under switches, exact inspection, and seven-row Tables.
- First inspection groups recorded/valid/excluded counts and four rating counts
  into two concise rows, retaining both ratios, separate goals, evidence, and
  report context. Table retains individual count columns. No mock difficulty
  row or permanent duplicate bottom detail row is added.

## Automated validation and reviews

Node `24.20.0` and npm `11.19.0` match the repo pins; `rtk npm ci` passed before
integrated validation. Existing deprecated-loader and allowScripts notices were
nonfatal; no install-script approval or dependency change was introduced.

Observed RED preceded domain/API, Settings, editor/catalog/screen, and compact
tooltip implementation. Domain regressions initially had 7 failures/45 passes;
contract/service regressions had 15 failures/65 passes, including previously
accepted malformed first-outcome rows. Settings had 17 failures/120 passes
before implementation. Two new cache regressions failed because first targets
remained stale before the target helper was extended. Transitional shared
fixtures were updated before the final focused runs.

Passed focused commands:

```sh
rtk npm run test -- src/features/analytics/domain src/features/analytics/api src/features/analytics/server src/features/analytics/data
rtk npm test -- src/features/settings/domain/settings.test.ts src/features/settings/data/settings-repository.test.ts src/features/settings/hooks/use-settings-draft.test.tsx src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts --run
rtk npm run test -- src/features/analytics/api/analytics-api.test.tsx
rtk npm run test -- src/features/analytics/components/new-problem-success-view.test.tsx src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/charts/chart-definitions.test.ts src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/charts/line-segments.integration.test.tsx
rtk npm run test -- src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts src/platform/query/cache-invalidation.test.ts
rtk npm run typecheck
rtk npm run test -- src/features/analytics/components/historical-views.test.tsx
```

These passed 242 tests in 16 domain/API/server/data files, 137 in five
Settings/backup files, nine Analytics API tests, 110 in eight UI files, 97 in
three runtime/invalidation files, and six historical-view tests respectively.
Separate specification and code-quality reviews of Settings, domain/API, and
UI all finished clear. The UI quality reviewer inspected compact desktop and
320px tooltip screenshots in addition to source; no findings remain.

Initial `rtk npm run lint` and `rtk npm run check` failed because the temporary
ignored visual fixture's TSX was scanned by ESLint outside the TypeScript
project. After proof, the fixture source was archived as text and removed; the
subsequent full lint passed. The next `check` passed database/TypeScript/lint
but found one historical-view test expecting old chart/inspection names. Both
labels were updated to the approved title; its six-test focused suite passed.
Final `rtk npm run check` passed all 2,179 tests in 196 files, database check,
WXT/TypeScript, and lint. Independent `rtk npm run lint`, production
`rtk npm run build`, and `rtk npm run format` passed. Existing jsdom `scrollTo`
notices and build chunk-size warnings were nonfatal. The final touched-Markdown
and diff checks passed. Exact scoped lint/format commands are preserved in the
[validation ledger](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/scoped-validation-commands.txt).

Passed final commands:

```sh
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy npx prettier --ignore-path /dev/null --write design.md docs/product.md docs/architecture.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-03-analytics-first-attempts-and-repeat-recall-design.md docs/superpowers/plans/2026-10-03-analytics-first-attempts-and-repeat-recall.md docs/superpowers/handoffs/2026-10-03-analytics-first-attempts-and-repeat-recall.md
rtk proxy npx prettier --ignore-path /dev/null --check design.md docs/product.md docs/architecture.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-03-analytics-first-attempts-and-repeat-recall-design.md docs/superpowers/plans/2026-10-03-analytics-first-attempts-and-repeat-recall.md docs/superpowers/handoffs/2026-10-03-analytics-first-attempts-and-repeat-recall.md
rtk proxy git diff --check
```

## Production-component proof

The actual NewProblemSuccessView, ObservedRecallVsFsrsView, target editor,
chart panel, domain cohort/view builders, and production styles were rendered
in an isolated localhost Vite fixture with illustrative review history. The
fixture visibly identifies local React-state saves. This proves rendering and
editor integration; it does not prove installed-extension persistence.

Verified paired desktop 1280px and stacked 320px layouts in light/dark themes,
unequal and equal references, independent 0%/100% goals, sparse measured-zero
inspection, singleton guidance, first-only/repeat-only/empty populations,
cross-year date/report context, keyboard Home/Escape, Enter save, failed draft
retention, and seven-row Table pagination with internal unavailable rows and
partial final interval. The 320px document stayed exactly 320px wide in Chart
and Table. The compact narrow tooltip measured 262px wide and 250px high with
all contents visible; the desktop tooltip fits without legend overlap.

Preserved proof:

- [Desktop unequal goals, dark](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/desktop-dark.png),
  [equal goals, dark](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/equal-targets-dark.png),
  and [desktop light](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/desktop-light.png).
- [Compact tooltip](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/desktop-tooltip.png),
  [320px dark](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/narrow-dark.png),
  and [320px light](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/narrow-light.png).
- [Narrow editor](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/narrow-editor.png),
  [zero/extreme references](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/narrow-sparse-zero.png),
  [Table](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/narrow-table.png),
  and [singleton](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/narrow-singleton.png).
- [Empty](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/narrow-empty.png),
  [failed save](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/narrow-failed-save.png),
  and [cross-year inspection](assets/2026-10-03-analytics-first-attempts-and-repeat-recall/narrow-cross-year.png).

The temporary browser tab/server were closed and viewport override reset.
Hidden Chart/Table transition emitted one nonfatal Recharts zero-size warning;
no console errors were recorded. Earlier screenshots taken during hot reload
were replaced with stable final captures. The duplicate one-off illustration harness is retained at its saved commit as
[index.html.txt](https://github.com/Hollowvyn/Cognipace/blob/04e9d20c66decaf8b73d10d8cad48eddbcb51c6a/docs/superpowers/handoffs/assets/2026-10-03-analytics-first-attempts-and-repeat-recall/index.html.txt), [proof.tsx.txt](https://github.com/Hollowvyn/Cognipace/blob/04e9d20c66decaf8b73d10d8cad48eddbcb51c6a/docs/superpowers/handoffs/assets/2026-10-03-analytics-first-attempts-and-repeat-recall/proof.tsx.txt), [proof.css.txt](https://github.com/Hollowvyn/Cognipace/blob/04e9d20c66decaf8b73d10d8cad48eddbcb51c6a/docs/superpowers/handoffs/assets/2026-10-03-analytics-first-attempts-and-repeat-recall/proof.css.txt), [server.mjs.txt](https://github.com/Hollowvyn/Cognipace/blob/04e9d20c66decaf8b73d10d8cad48eddbcb51c6a/docs/superpowers/handoffs/assets/2026-10-03-analytics-first-attempts-and-repeat-recall/server.mjs.txt).
Restore these sources with that revision under `.superpowers/analytics-first-proof`
to reproduce the captures. The exact approved design archive and every screenshot
remain on this branch. Close/remove the temporary fixture before lint, whose
project scan does not honor Git's ignore rules.

## Skips, human smoke, and release impact

- `rtk npm run db:generate`: skipped because no SQL schema or migration changed.
- Standalone `rtk npm run db:check`: not repeated because it runs within `check`.
- `rtk npm run zip`: skipped because packaging/store release was not requested.
- Human installed-extension smoke: pending, not N/A. The human engineer must
  run [First Attempt Outcomes and Repeat Recall, Dashboard Analytics, and Chart
  Targets](../../testing.md) against the rebuilt installed extension and attach
  happy-path and edge-case screenshots or a recording before review or merge.
  Include first Again then Good, invalid/pre-range raw anchors, nullable
  correctness, first-only/repeat-only cohorts, pre-range initial/recent repeat,
  14/30/90 ranges, independent/equal/extreme goals, save/reload/cancel/failure,
  old preferences, Settings Save/Reset, strict backup restore, configured
  disposable Gist sync, keyboard/tap/Table, narrow/light/dark layouts, and
  unchanged scheduling/Retention Map. Unexercised Gist and realtime failure
  cases remain exact pending cases; automated/fixture evidence is separate.

Minor release impact: the new Analytics cohort view and saved preferences are
features. No migration rollback is needed. Reverting this phase restores the
previous chart/population behavior; older strict Settings readers may reject
the new four-key Analytics subsection, so intentional downgrade should
normalize that subsection and retain a full backup. No release or merge was
performed; the existing PR stays draft.
