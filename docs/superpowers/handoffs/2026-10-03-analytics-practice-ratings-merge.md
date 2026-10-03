# Merged Practice Rhythm Handoff

The approved mixed chart is implemented on `codex/analytics-layout-polish` for
[draft PR #184](https://github.com/Hollowvyn/Cognipace/pull/184). Human
installed-extension happy-path and edge-case smoke with screenshot or recording
proof remains pending before PR review or merge.

The user approved the quieter mixed-graph preview and then authorized production
implementation. The [approved design](../specs/2026-10-03-analytics-practice-ratings-merge-design.md)
and [phase-sized plan](../plans/2026-10-03-analytics-practice-ratings-merge.md)
record the scope. Earlier exact chart archives and saved-goal implementations
remain preserved in their existing handoffs.

## Result and boundaries

- One full-width Practice Rhythm card replaces separate Practice Rhythm and
  Ratings Mix cards. Recall precedes it; Memory Strength and unchanged Topic
  Performance share the next responsive row. Later panels retain their treatment.
- Exact supplied shares stack bottom to top as Easy, Good, Hard, Again. Good +
  Easy's upper boundary expresses Review Success. The left axis stays 0–100%;
  a thin neutral completed-review line uses the independently supplied right
  count scale. The existing compact saved Review Success editor stays above it.
- A pure feature presentation model joins unchanged serialized views by ID and
  exact interval bounds. Positive completed counts, positive valid ratings in
  either source, or finite supplied success including 0% support an edge. Only
  unsupported outer intervals are trimmed. Internal gaps remain in Chart,
  keyboard/pointer inspection, and the seven-row Table.
- Known zero counts remain observations. Missing counts and composition stay
  unavailable. A full-height gray hatch distinguishes unavailable composition
  from a populated category with zero share. Missing composition does not claim
  zero ratings when the practice cohort has valid ratings.
- Contrasting 12px percentage labels appear only when measured text fits and
  avoids the target/count line. Precise counts and shares, supplied success,
  numerator/denominator, both evidence states, full dates, partial status,
  timezone, and report time remain in inspection and Table.
- A native Reviews switch hides the count line, markers, right axis, and tooltip
  count together; Table values, dates, rows, and target remain intact. Accessible
  descriptions follow the visible series. Selected-period Hard + Again totals
  and evidence-gated prior comparison remain. The visible explanation identifies
  association only and the independent meaning of count-line/target crossings.
- Differing readiness warnings have visible metric captions. The merged Table
  alone keeps headers and cells on one line inside its existing horizontal
  scroller; the shared Table primitive is unchanged.
- Goal edits keep the stack fixed and preserve the supplied count scale. Existing
  Settings persistence, pair validation, cache updates, backup/configured Gist
  behavior, scheduling, FSRS target retention, and Retention Map remain unchanged
  by this phase. No runtime contract, schema, migration, permission, or sync
  expansion was added.

## Automated validation

Observed RED preceded implementation of the interval join, merged renderer, and
screen integration. Screen integration initially failed four obsolete/regression
expectations while fourteen tests passed. Review regressions also failed before
fixes for a hidden count-line role description and an absent composition
counterpart incorrectly described as zero valid ratings.

Commands run successfully before the final readiness-caption fix:

```sh
rtk npm run test -- src/features/analytics/components/practice-ratings-model.test.ts src/features/analytics/components/practice-ratings-view.test.tsx src/features/analytics/components/memory-practice-views.test.tsx src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/analytics-screen.test.tsx
rtk npm run test -- src/features/analytics/components/practice-ratings-view.test.tsx src/features/analytics/components/practice-ratings-model.test.ts src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/analytics-target-editor.test.tsx
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
```

The first focused command passed 90 tests in seven files before the last added
composition regression; the second passed all 53 tests in four files. Full
`check` passed database validation, WXT preparation/TypeScript, lint, and 2,094
tests in 194 files. Build and format passed. Existing jsdom `scrollTo` notices
and production chunk-size warnings were nonfatal.

The final readiness-caption regression observed RED (one failed, eighteen
passed), then GREEN (all nineteen screen tests). Its focused commands passed:

```sh
rtk npm run test -- src/features/analytics/components/analytics-screen.test.tsx
rtk npx eslint src/features/analytics/components/analytics-screen.tsx src/features/analytics/components/analytics-screen.test.tsx
rtk npx prettier --write src/features/analytics/components/analytics-screen.tsx src/features/analytics/components/analytics-screen.test.tsx
rtk proxy npx prettier --write src/features/analytics/components/practice-ratings-view.tsx
```

Final focused validation repeated the four-file command above after both final
source fixes: 54 tests passed. Independent specification and code-quality
reviews approved the model, renderer, screen, readiness captions, and scoped
Table fix. No unresolved findings remain.

Final `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, and
`rtk npm run format` all passed after the final source changes. Full `check`
passed 2,095 tests in 194 files, plus database check, WXT/TypeScript, and lint.
The touched-document and diff checks also passed:

The first touched-Markdown check after marking plan tasks complete failed on the
plan's multiline inline predicate formatting. The predicate was clarified in
plain prose, reformatted, and the final explicit check passed.

```sh
rtk proxy npx prettier --ignore-path /dev/null --write design.md docs/product.md docs/architecture.md docs/testing.md docs/superpowers/README.md docs/superpowers/plans/2026-10-03-analytics-practice-ratings-merge.md docs/superpowers/handoffs/2026-10-03-analytics-practice-ratings-merge.md
rtk proxy npx prettier --ignore-path /dev/null --check design.md docs/product.md docs/architecture.md docs/testing.md docs/superpowers/README.md docs/superpowers/plans/2026-10-03-analytics-practice-ratings-merge.md docs/superpowers/handoffs/2026-10-03-analytics-practice-ratings-merge.md
rtk proxy git diff --check
```

## Browser proof

The actual production `PracticeRatingsView`, `AnalyticsChartPanel`,
`AnalyticsTargetEditor`, and production styles ran in an isolated local Vite
fixture. Data are illustrative. Target saves in this fixture update local React
state; this proves rendering/editor integration, not Settings persistence or
installed-extension smoke. The fixture displays this distinction above the card.

Verified desktop 1280px and narrow 320px, light/dark themes, readable label
omission at narrow widths, and document width of 320px at a 320px viewport.
Keyboard Home/Left/Right/End/Escape inspected exact retained periods, a known
zero-count/no-ratings gap, missing count/composition counterparts, a singleton,
partial intervals, and a December-to-January range. An interval spanning years
showed `12/31/25–01/02/26` with full dates/report context. Reviews toggled by
keyboard with matching accessible copy. The Table retained seven rows on page 1
and the final partial row on page 2. Empty Chart/Table kept the target control;
Enter saved a 100% target without changing either data scale.

Inspected screenshots:

- [Desktop dark](assets/2026-10-03-analytics-practice-ratings-merge/merged-desktop-dark.jpg)
  and [desktop light](assets/2026-10-03-analytics-practice-ratings-merge/merged-desktop-light.jpg).
- [320px dark](assets/2026-10-03-analytics-practice-ratings-merge/merged-320-dark.jpg)
  and [320px light](assets/2026-10-03-analytics-practice-ratings-merge/merged-320-light.jpg).
- [100% target at 320px](assets/2026-10-03-analytics-practice-ratings-merge/target-100-320-dark.jpg).
- [Keyboard gap inspection](assets/2026-10-03-analytics-practice-ratings-merge/gap-keyboard-desktop-dark.jpg),
  [count-only interval](assets/2026-10-03-analytics-practice-ratings-merge/count-only-desktop-dark.jpg),
  and [cross-year inspection](assets/2026-10-03-analytics-practice-ratings-merge/cross-year-inspection-desktop-dark.jpg).
- [Reviews hidden](assets/2026-10-03-analytics-practice-ratings-merge/reviews-hidden-desktop-dark.jpg),
  [Table](assets/2026-10-03-analytics-practice-ratings-merge/table-desktop-dark.jpg),
  [320px Table](assets/2026-10-03-analytics-practice-ratings-merge/table-320-dark.jpg),
  and [empty editor](assets/2026-10-03-analytics-practice-ratings-merge/empty-editor-desktop-dark.jpg).

After the scoped Table fix, all seven displayed rows measured 37px high at both
desktop and 320px. The Table's inner container scrolls horizontally and the
document remains exactly 320px wide on the narrow viewport. The temporary
browser tab/server were closed and the viewport override reset. Hidden Chart/
Table transitions emitted nonfatal Recharts zero-size notices; the isolated
fixture config also emitted a nonfatal Vite native-config compatibility warning.

Superseded temporary fixture source is retained at its saved commit as
[production-fixture.tsx.txt](https://github.com/Hollowvyn/Cognipace/blob/04e9d20c66decaf8b73d10d8cad48eddbcb51c6a/docs/superpowers/handoffs/assets/2026-10-03-analytics-practice-ratings-merge/production-fixture.tsx.txt), [production-fixture.css.txt](https://github.com/Hollowvyn/Cognipace/blob/04e9d20c66decaf8b73d10d8cad48eddbcb51c6a/docs/superpowers/handoffs/assets/2026-10-03-analytics-practice-ratings-merge/production-fixture.css.txt),
[production-fixture-vite.config.ts.txt](https://github.com/Hollowvyn/Cognipace/blob/04e9d20c66decaf8b73d10d8cad48eddbcb51c6a/docs/superpowers/handoffs/assets/2026-10-03-analytics-practice-ratings-merge/production-fixture-vite.config.ts.txt), and [production-fixture-index.html.txt](https://github.com/Hollowvyn/Cognipace/blob/04e9d20c66decaf8b73d10d8cad48eddbcb51c6a/docs/superpowers/handoffs/assets/2026-10-03-analytics-practice-ratings-merge/production-fixture-index.html.txt).
Restore their original extensions into an isolated temporary directory, adjust
the absolute workspace imports/source paths, and use the repo's installed Vite
runtime. The source never writes installed-extension data.
Restore those sources with that revision, whose targets and components match
the captures. Current code uses the four-goal model; the approved design
archive and every screenshot remain on this branch.

## Skipped validation and human smoke

- `rtk npm run db:generate`: skipped; this phase changes no database schema or
  migration. `rtk npm run db:check` ran inside `check` and was not repeated alone.
- `rtk npm run zip`: skipped; packaging/store release was not requested and the
  production build passed.
- Human installed-extension smoke: pending, not N/A. Use the historical Analytics
  and chart-target checklist in [docs/testing.md](../../testing.md), including
  14/30/90 ranges, sparse/empty/missing-counterpart periods, both readiness
  warnings, Chart/Table pagination, target persistence/reload, invalid/failing/
  pending saves, keyboard/touch, light/dark/narrow/wide layouts, Settings Save/
  Reset, backup restore/configured Gist flows, and unchanged FSRS outputs.
  Attach happy-path and edge-case screenshots or a recording with the tested
  build before review or merge.

The overall PR has minor-release impact for the saved preference feature.
This merged presentation phase needs no migration rollback: reverting its
implementation restores the separate historical cards. Earlier saved-goal
downgrade guidance remains in the chart-target handoff. No release or merge was
performed.
