# Analytics Chart Targets Handoff

Status: implemented on `codex/analytics-layout-polish` for draft
[PR #184](https://github.com/Hollowvyn/Cognipace/pull/184). User approved the
[design](../specs/2026-10-02-analytics-chart-targets-design.md) and normal
Settings/backup/configured-sync ownership before implementation. Human
installed-extension smoke remains pending before PR review or merge.

## Result

The first chart uses **Target Recall** (Hard + Good + Easy); Practice Rhythm
uses **Target Review Success** (Good + Easy). Both independently default to
90%, irrespective of FSRS target retention. Either chart opens the same compact
inline editor with whole percentage inputs, Save, Cancel, and rating hints.
The approved aspiration rule is `targetReviewSuccess >= targetRecall`; it
does not constrain observed rates or change their eligible populations.

Settings owns the validated pair in its existing JSON record. Updates are
atomic, unrelated Settings Save preserves the pair, and Reset Defaults always
writes both defaults, including when another tab changed them or a post-save
refresh is pending. Older settings/backup fields default safely; local reads
repair malformed analytics only. Existing strict backup validation continues
to reject malformed payloads. Valid goals use the existing full-backup and
optional configured Gist paths approved by the user.

Successful saves cancel pending Analytics requests, apply the returned pair
and fitted percentage scales to every cached summary, then refetch active
summaries. This prevents an uncached range's older in-flight response from
restoring stale targets. Failed saves leave cache and captions unchanged and
retain the draft. Enter submits, Escape/Cancel discard, duplicate submits are
blocked, and successful close restores focus after the trigger is enabled.
Controls remain reachable in sparse/empty data and Chart/Table.

Named dashed references fit 0% and 100%. Practice uses its right percentage
axis and preserves the review-count scale. FSRS retention, scheduling, card
state, Retention Map, measured rows/counts, readiness, dates, trimmed edges,
internal gaps, Memory Strength, and Ratings Mix remain unchanged. Settings'
provider-ID import uses the existing pure GenAI domain entry, avoiding an
eager extension-messaging dependency in domain consumers.

## Review And Verification

Spec review caught successful-save focus and stale Reset Defaults behavior.
Quality review reproduced the pending initial-range response race. Regression
tests cover all three; follow-up review found no remaining actionable issues.

Full validation after the final source changes:

```sh
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy git diff --check
rtk proxy npx prettier --ignore-path /dev/null --write design.md docs/product.md docs/architecture.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-02-analytics-chart-targets-design.md docs/superpowers/plans/2026-10-02-analytics-chart-targets.md docs/superpowers/handoffs/2026-10-02-analytics-chart-targets.md
rtk proxy npx prettier --ignore-path /dev/null --check design.md docs/product.md docs/architecture.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-02-analytics-chart-targets-design.md docs/superpowers/plans/2026-10-02-analytics-chart-targets.md docs/superpowers/handoffs/2026-10-02-analytics-chart-targets.md
```

Final full check passed **192 files / 2,070 tests**. Lint, production build,
repository formatting, explicit touched-Markdown formatting, and diff checks
passed. `check` includes database
migration consistency, WXT preparation, TypeScript, lint, and the full test
suite. Existing jsdom `scrollTo` notices and build chunk-size warnings are
nonfatal. The fixture also emitted nonfatal zero-size Recharts notices
when charts became hidden during empty/Table transitions.

Focused test commands and observed outcomes:

```sh
rtk npm test -- src/features/settings/domain/settings.test.ts src/features/settings/data/settings-repository.test.ts src/features/settings/hooks/use-settings-draft.test.tsx src/features/backup/data/backup-repository.test.ts --run
rtk npm test -- src/features/settings/domain/settings.test.ts src/features/settings/data/settings-repository.test.ts src/features/settings/hooks/use-settings-draft.test.tsx src/features/settings/api/settings-api.test.tsx src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts --run
rtk npm test -- src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/domain/summary.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/api/analytics-api.test.tsx src/features/analytics/server/analytics-service.test.ts --run
rtk npm test -- src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/domain/summary.test.ts src/features/analytics/domain/analytics-scales.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/api/analytics-api.test.tsx src/features/analytics/server/analytics-service.test.ts --run
rtk npm run test -- src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/memory-practice-views.test.tsx src/features/analytics/components/analytics-target-editor.test.tsx
rtk npm run test -- src/features/analytics/components/analytics-target-editor.test.tsx
rtk npm run test -- src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/memory-practice-views.test.tsx
rtk npm run test -- src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/memory-practice-views.test.tsx src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/analytics-screen.test.tsx
rtk npm run test -- src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/settings/domain/settings.test.ts src/features/analytics/api/analytics-contracts.test.ts
rtk npm test -- src/features/analytics/api/analytics-api.test.tsx --run
rtk npm test -- src/features/settings/hooks/use-settings-draft.test.tsx --run
rtk npm test -- src/features/settings/hooks/use-settings-draft.test.tsx src/features/backup/data/backup-repository.test.ts --run
rtk npm run test -- src/features/analytics/components/memory-practice-views.test.tsx src/features/analytics/components/analytics-screen.test.tsx
```

- Settings RED: 28 failed / 45 passed; GREEN: 73 passed. Expanded suite: 137
  passed before the reset follow-up.
- Analytics model RED: 14 failed / 90 passed after resetting leaked mock
  queues; GREEN: 104 passed, expanded scales: 116 passed. Cache-race RED:
  1 failed / 5 passed; GREEN: 6 passed, expanded final suite: 117 passed.
- Initial chart RED: 3 failed / 28 passed and the not-yet-created editor test
  module failed to load. Editor temporarily failed 12 tests while its shared
  schema was not yet implemented. The next integration run exposed an eager
  Settings/Analytics import cycle and four stale chart assertions. Pure domain
  imports, lazy shared-pair validation, and updated fixtures resolved these.
- Successful-save focus RED: 1 failed / 64 passed. Final component suite:
  69 passed across 5 files. Pure-domain import regression checks: 113 passed
  across 4 files.
- Reset external-refresh RED: 1 failed / 18 passed. A query-first repair then
  failed the pending post-Save refresh case: 1 failed / 19 passed. Explicitly
  writing both default goals resolved both; final hook/backup suite: 27 passed. Layout follow-up: 32 passed across 2 files.
- First integrated `check` passed database/typecheck, then stopped at one
  unsafe JSON member assertion in the backup test. The assertion was corrected.
  A subsequent checkpoint passed 192 files / 2,069 tests; the final reset
  follow-up required another full check. Final check after reset and wide-pair alignment passed
  192 files / 2,070 tests.

## Production-Component Fixture Proof

Actual chart/editor components, shared goal/scale helper, and production styles
rendered illustrative data in a temporary local fixture. Its Save callback only
updates fixture state; repository persistence and reload behavior are verified
by automated tests, not claimed as installed-extension smoke. The temporary
fixture's first startup lacked its dependency symlink; after correcting that,
rendering exposed the pure-domain import issue described above. Source updates
reloaded illustrative state during capture, so affected screenshots were
recaptured after the source stabilized.

Ordinary viewport screenshots are saved below; existing frozen designs and
earlier proof files were preserved. Verified 1280px stacking, 1440px paired, and 320px narrow
layouts, light/dark themes, open/closed/invalid/saved states, focus after Save
and Escape, empty/table reachability, and references at percentage boundaries.
The 320px editor had document scroll width equal to viewport width. The new
Practice target row initially offset its plot from Memory Strength; a scoped
2rem allowance on Memory in the wide pair restores the same chart-frame top
(308.398px in the fixture) without adding space to stacked/narrow layouts.
Temporary browser tabs, viewport overrides, and the local server were cleaned
up after capture.

- [Aligned pair, 1440px light](assets/2026-10-02-analytics-chart-targets/paired-1440-light.jpg)
- [Aligned pair, 1440px dark](assets/2026-10-02-analytics-chart-targets/paired-1440-dark.jpg)
- [Desktop closed targets, dark](assets/2026-10-02-analytics-chart-targets/targets-desktop-dark.jpg)
- [Recall editor, desktop dark](assets/2026-10-02-analytics-chart-targets/recall-editor-desktop-dark.jpg)
- [Saved Recall 80%, desktop dark](assets/2026-10-02-analytics-chart-targets/recall-saved-desktop-dark.jpg)
- [Recall 0%, desktop dark](assets/2026-10-02-analytics-chart-targets/recall-zero-desktop-dark.jpg)
- [Practice 100%, desktop dark](assets/2026-10-02-analytics-chart-targets/practice-hundred-desktop-dark.jpg)
- [Practice editor, desktop dark](assets/2026-10-02-analytics-chart-targets/practice-editor-desktop-dark.jpg)
- [Recall editor, 320px light](assets/2026-10-02-analytics-chart-targets/recall-editor-320-light.jpg)
- [Invalid pair, 320px light](assets/2026-10-02-analytics-chart-targets/invalid-pair-320-light.jpg)
- [Empty charts, 320px dark](assets/2026-10-02-analytics-chart-targets/empty-320-dark.jpg)
- [Empty Table editor, 320px dark](assets/2026-10-02-analytics-chart-targets/empty-table-editor-320-dark.jpg)

## Pending Human Validation And Scope

Skipped `rtk npm run db:generate`: no relational schema or migration changed.
Skipped `rtk npm run zip`: no packaging/store release requested; production
build was validated. `rtk npm run db:check` ran inside `check`, rather than as a
separate command. Human installed-extension happy-path and edge-case realtime
smoke, including actual configured Gist push/pull, is pending, not N/A. Attach
screenshots or a recording with the tested build and exact passed cases from
[the chart-target checklist](../../testing.md#analytics-chart-targets) before
review or merge. Preserve the prior historical-chart smoke requirements too.

Release impact: minor, adding saved preferences and an editor without Chrome
permission or database changes. No merge or release was performed. Reverting
source needs no migration; an older binary's strict settings parser may reject
the added subsection, so normalize only that subsection when intentionally
downgrading, preserving a backup of the full settings first.
