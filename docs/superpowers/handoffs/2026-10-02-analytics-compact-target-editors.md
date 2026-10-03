# Compact Analytics Target Editors Handoff

Status: implemented on `codex/analytics-layout-polish` for draft
[PR #184](https://github.com/Hollowvyn/Cognipace/pull/184). This applies the user's
single-target refinement to the [approved design](../specs/2026-10-02-analytics-chart-targets-design.md).
The spec amendment and phase-sized plan were committed before code. Human
installed-extension happy-path and edge-case smoke remains pending before
review or merge.

## Result

Each chart's existing target caption opens one percentage input for its own
goal. Recall explains Hard + Good + Easy and its current Review Success limit;
Practice explains Good + Easy and its current Recall limit. The input, percent
suffix, Cancel, and Save share a row, with the short hint below. Collapsed
captions remain unchanged. Defaults, metric names, percentage scales, and the
approved Success >= Recall aspiration remain unchanged.

Saving sends only the edited property. The existing Settings transaction merges
against the latest persisted counterpart and validates the final pair. The
Analytics mutation accepts this partial input, retains request cancellation,
and applies the successful full Settings pair to cached chart goals/scales.
Fresh counterpart props update hints and validation without replacing an open
draft. Enter/Save, Escape/Cancel, focus return, failed drafts, and pending/duplicate
protection remain intact. No storage, runtime contract, chart data, scale,
Chrome permission, or sync changes were required.

Independent read-only specification and quality reviews passed with no
actionable findings. Product, architecture, design, and the human smoke
checklist now describe the single-field behavior. Prior chart designs and
paired-editor proof were preserved.

## Automated Verification

Focused component RED before the UI change:

```sh
rtk npm run test -- src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/components/analytics-screen.test.tsx
```

Observed **11 failed / 24 passed**, covering the previous two-input presentation,
whole-pair payload, and missing current counterpart hints. After implementation:

```sh
rtk npm run test -- src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/api/analytics-api.test.tsx src/features/settings/data/settings-repository.test.ts
```

Passed **4 files / 52 tests**. Cases include each metric's own-field saves at
0%/100%, numeric/order rejection, counterpart refresh with a retained draft,
successful-response captions, focus, pending/failure, and empty/Table integration.

The delegated API/repository regression command passed **17 tests** before and
after the hook's input type was widened: runtime already forwarded patches.
The meaningful type RED was TS2345 at the new partial-input call; type GREEN
passed after changing only the hook input to `Partial<AnalyticsTargets>`.
Repository cases preserve newer persisted counterparts for both edited fields.

```sh
rtk npm run test -- src/features/analytics/api/analytics-api.test.tsx src/features/settings/data/settings-repository.test.ts
rtk proxy npx tsc --noEmit -p tsconfig.json --pretty false
rtk proxy npx prettier --write src/features/analytics/api/analytics-api.test.tsx src/features/settings/data/settings-repository.test.ts
rtk proxy npx prettier --check src/features/analytics/api/analytics-api.ts src/features/analytics/api/analytics-api.test.tsx src/features/settings/data/settings-repository.test.ts
rtk proxy npx eslint src/features/analytics/api/analytics-api.ts src/features/analytics/api/analytics-api.test.tsx src/features/settings/data/settings-repository.test.ts
rtk proxy git diff --check -- src/features/analytics/api/analytics-api.ts src/features/analytics/api/analytics-api.test.tsx src/features/settings/data/settings-repository.test.ts
rtk proxy npx prettier --write src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/components/analytics-screen.test.tsx
rtk proxy npx prettier --write src/features/analytics/components/analytics-target-editor.tsx
```

Final source validation:

```sh
rtk npm run check
rtk npm run lint
rtk npm run build
rtk npm run format
rtk proxy npx prettier --ignore-path /dev/null --write design.md docs/product.md docs/architecture.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-02-analytics-chart-targets-design.md docs/superpowers/plans/2026-10-02-analytics-compact-target-editors.md docs/superpowers/handoffs/2026-10-02-analytics-compact-target-editors.md
rtk proxy npx prettier --ignore-path /dev/null --check design.md docs/product.md docs/architecture.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-02-analytics-chart-targets-design.md docs/superpowers/plans/2026-10-02-analytics-compact-target-editors.md docs/superpowers/handoffs/2026-10-02-analytics-compact-target-editors.md
rtk proxy git diff --check
```

Full check passed **192 files / 2,076 tests**, including migration consistency,
WXT preparation, TypeScript, lint, and tests. Independent lint and production
build passed. Repository and touched-Markdown formatting and diff checks passed.
Existing jsdom `scrollTo` notices and build chunk-size warnings were nonfatal.

## Production-Component Fixture Proof

Actual production editors, historical chart components, shared target/scale
helper, and styles rendered illustrative data in an isolated temporary Vite
fixture. Its partial Save callback merges only fixture state; this is not
installed-extension or persistence smoke. Repository/API automation above
covers persistence and cache behavior.

Both desktop editors measured **288px wide / 83.875px tall**, with one input.
The 320px Recall editor measured **270px wide / 101.75px tall**, growing to
141.75px only for its invalid-pair error. Narrow document scroll width remained
320px. Independently saved Recall 80% and Success 85%, with focus returning to
the respective caption. Invalid Recall 95% / Success 85% and Success 79% /
Recall 80% blocked Save. Escape discarded drafts and restored focus. Controls
remained reachable in empty Table view. Closed Memory and Practice chart-frame
tops matched at 470.898px in the desktop observation. Temporary browser tab,
viewport override, and local server were cleaned up.

All ordinary viewport screenshots below were visually inspected. One early
invalid screenshot captured a transient paint; it was recaptured and inspected
after the state settled. Hidden-chart zero-size notices during empty/Table
transitions were nonfatal.

- [Recall compact editor, desktop dark](assets/2026-10-02-analytics-compact-target-editors/recall-compact-desktop-dark.jpg)
- [Practice compact editor, desktop dark](assets/2026-10-02-analytics-compact-target-editors/practice-compact-desktop-dark.jpg)
- [Aligned saved pair, desktop dark](assets/2026-10-02-analytics-compact-target-editors/saved-pair-desktop-dark.jpg)
- [Recall compact editor, 320px light](assets/2026-10-02-analytics-compact-target-editors/recall-compact-320-light.jpg)
- [Invalid Recall, 320px light](assets/2026-10-02-analytics-compact-target-editors/invalid-recall-320-light.jpg)
- [Practice empty Table compact editor, 320px dark](assets/2026-10-02-analytics-compact-target-editors/practice-empty-table-compact-320-dark.jpg)
- [Invalid Success, 320px dark](assets/2026-10-02-analytics-compact-target-editors/invalid-success-320-dark.jpg)

## Pending Validation And Delivery

Skipped `rtk npm run db:generate`: no relational schema or migration changed.
Skipped `rtk npm run zip`: packaging/store release was not requested and the
production build passed. `rtk npm run db:check` ran inside `check`, so it was
not repeated separately. Human installed-extension realtime happy-path and
edge-case smoke, including previously required configured Gist checks, remains
pending, not N/A. Attach screenshots/recording with the tested build and exact
passed cases from [the updated checklist](../../testing.md#analytics-chart-targets)
before review or merge. Raise Success before raising Recall beyond it; lower
Recall before lowering Success below it. Verify retained drafts and latest
counterpart preservation with an external tab change.

The draft PR remains unmerged. This presentation refinement adds no release
impact beyond the earlier saved-goals feature. Revert the compact-editor commit
to restore the prior paired editor without changing saved preferences.
