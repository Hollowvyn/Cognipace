# Problem Solving UI Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to execute the checked tasks in order.

**Execution:** Implemented in three independently reviewed phases, consolidated into the final feature commit. Automated and production-component checks passed; human installed-extension smoke remains pending. The [UI validation record](./2026-10-04-analytics-problem-solving-ui.md#validation-record) owns the final evidence.

**Goal:** Replace the separate New Problem Success rendering with the approved combined difficulty outcomes, recorded-time, and difficulty-mix section.

**Architecture:** One feature component owns shared local controls. Use HistoricalChart, LineSegments, HistoricalTable, ChartTable, and the Settings-owned target editor. Read the Phase 2 `views.problemSolving` shape; no client recalculation of raw populations and no new chart framework.

**Tech Stack:** React, TypeScript, existing Recharts primitives and feature CSS variables, Testing Library/Vitest.

## Approved Input And Files

Follow `../specs/2026-10-04-analytics-problem-solving-design.md` and the preceding model plan. This phase has approval through the user's combined-preview and placement decisions.

Modify `src/features/analytics/components/new-problem-success-view.tsx` and its existing test to implement the replacement section. A small adjacent `problem-solving-charts.tsx` file may contain the two chart implementations; a `problem-solving-model.ts` may contain pure presentation transformations shared by tests and views. Avoid a generic abstraction layer. Modify `analytics-screen.tsx` and its existing test for placement. Root owns the triangle marker addition in `charts/line-segments.tsx` and its integration test.

## Task 1: Section State And Placement

- [x] Add failing component coverage for shared difficulty toggles, stable chosen measure after toggling, new/follow-up target selection, time units/subset, empty selection, and Trend/Compare table changes. Use the domain builder with compact event factories.
- [x] Run `rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx vitest run src/features/analytics/components/new-problem-success-view.test.tsx src/features/analytics/components/analytics-screen.test.tsx`. Observe failure before rendering changes.
- [x] Replace the old view with shared state:

```ts
const [cohort, setCohort] = useState<'newProblems' | 'followupPractice'>(
  'newProblems',
)
const [mode, setMode] = useState<'trend' | 'compare'>('trend')
const [measure, setMeasure] = useState<'successRate' | 'goodEasyRate'>(
  'successRate',
)
const [visible, setVisible] = useState({ easy: true, medium: true, hard: true })
const [units, setUnits] = useState<'targetPercent' | 'minutes'>('targetPercent')
const [timing, setTiming] = useState<'all' | 'successful'>('all')
const [mixMeasure, setMixMeasure] = useState<'assessments' | 'time'>(
  'assessments',
)
```

- [x] Render a compact scoped summary from chosen cohort totals. Label assessment days, assessments, distinct problems, Good+Easy/valid and invalid exclusions. Expose raw new/follow-up semantics and current-difficulty/time caveats in calculation details.
- [x] Expand the existing `new-problem-success` position to full width with paired plot cards that stack on narrow screens and full-width Mix below. Keep Recall separate and retain its component, calculation, and target editor. Remove the superseded standalone old rendering.
- [x] Render only the chosen measure's existing goal editor. New Success/GoodEasy use first-attempt settings; Follow-up uses Recall/ReviewSuccess settings as raw-rating aspirations, with cohort clarification.

## Task 2: Trend, Compare, Mix, And Inspection

- [x] Trim paired Trend rows only once, using any Easy/Medium/Hard raw recorded activity. Keep internal gaps; Unknown remains in Mix. Hiding lines, changing measure, or time subset cannot change dates or scales.
- [x] Flatten each row's visible difficulty rate or transformed median seconds into HistoricalChart numeric series. Easy mint circles, Medium blue diamonds, Hard amber triangles. Use linear measured connections and long-dash bridges. Reuse shared dates, interval inspection, native keyboard/touch access, sparse date formatting, and fitted supplied scales with eight-pixel marker clearance.
- [x] Add Time Q1–Q3 whiskers only when one difficulty is visible and four timed observations exist. Percent uses `seconds / (targetMinutes * 60) * 100`; minutes uses `seconds / 60`. Show 100% or current minute-target references. Never display null as zero.
- [x] Compare renders full-period known-difficulty outcome columns (zero baseline) and median/range time marks. Show exact selected outcome rate, prior rate, both valid n, and pp change; label Sparse when either n<10. Time text/tables follow units and timing subset. Fixed category identity includes groups with unavailable data.
- [x] Mix is a 0–100% stack from all raw assessment counts or positive recorded-time sums across all four categories. Empty periods remain unavailable. Add contrasting in-segment percentage labels where they fit; Unknown uses neutral color. Supply exact raw category counts and time sums in inspection/table.
- [x] All plots use Chart/Table. Trend tables show interval, difficulty, raw/valid/invalid counts, selected numerator/rate/goal or timed/eligible/median/quartiles, and report context. Hidden difficulties leave plots and their inspection. No selected difficulty shows Select a difficulty.
- [x] Repeat focused tests and format touched files. The root independently reviews both spec compliance and code quality.

## Task 3: Production Proof And Documentation

- [x] Root makes a temporary fixture-driven Vite harness importing the production section and domain builder; do not commit an extra app or bulk fixture. Capture desktop dark/light and narrow screenshots, keyboard/hover inspection, all-hidden, isolated whiskers, sparse/no-time/Unknown cases, controls and saved-target update behavior.
- [x] Update the matching Analytics sections of `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, and `design.md` to describe implemented behavior and human smoke steps. Keep planning status honest.
- [x] Run pinned `npm run lint`, `npm run check`, `npm run build`, `npm run db:check`, Prettier on touched files, and `rtk proxy git diff --check`. Record exact commands/failures/skips.
- [x] Review the complete diff for correctness and unnecessary abstractions. Verify added test/fixture lines do not exceed production lines.
- [x] Commit with `feat(analytics): show difficulty outcomes and recorded time` after passing automated checks. Report remaining human installed-extension smoke requirement with happy-path and edge-case checklist; do not claim agent fixture proof replaces it.

## Validation Record

Completed on 2026-10-04 on `codex/analytics-problem-solving`. The initial full
check stopped on unsupported role-query options, inferred numeric chart keys,
and a readonly-versus-transport scale mismatch. All were corrected; the final
implementation check passed **196 files / 2,204 tests**, typecheck, ESLint, and database checks.
The production build passed with a chunk-size warning.

Observed test-first failures: input metadata/later cohort selection (6 failures),
missing domain view (3), contract stripping (8), saved timing targets (1), and
old rendering with the new view (4). Triangle singleton and Compare tick-center
regressions each failed before their respective fixes. Model RED command strings
were not retained; the four-file final GREEN run is recorded below.

Exact final commands (all passed):

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm test -- src/features/analytics/data/analytics-repository.test.ts src/features/analytics/domain/review-cohorts.test.ts
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx vitest run src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/server/analytics-service.test.ts src/features/analytics/api/analytics-api.test.tsx
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx vitest run src/features/analytics/components/new-problem-success-view.test.tsx src/features/analytics/components/analytics-screen.test.tsx
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx vitest run src/features/analytics/components/charts/line-segments.integration.test.tsx
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run db:check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run lint
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run build
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx prettier --check src/features/analytics src/testing/analytics-fixtures.ts src/styles/analytics.css
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx prettier --check design.md docs/architecture.md docs/product.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-04-analytics-problem-solving-design.md docs/superpowers/plans/2026-10-04-analytics-problem-solving-{inputs,model,ui}.md
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx prettier --check --ignore-path /dev/null docs/superpowers/specs/2026-10-04-analytics-problem-solving-design.md docs/superpowers/plans/2026-10-04-analytics-problem-solving-{inputs,model,ui}.md
rtk proxy git diff --check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH node /private/tmp/cognipace-solving-proof/interactions.cjs
```

Production-component browser proof uses a temporary Vite harness importing the
actual section and domain builder; no preview app or bulk fixture was committed.
Regular Playwright ran because the Browser plugin/skill was unavailable. Nine
groups passed with no console errors: controls/shared visibility and stable
windows, isolated quartiles, keyboard inspection/report context, all-hidden,
Compare/units/prior evidence, raw cohort goals and immediate reference saves,
Mix exact values, dark/light 1280/390/320 without overflow, and empty/untimed/
Unknown-only cases. Final screenshots also confirmed aligned Compare labels and
a fitting mobile time heading.

Durable screenshots: `/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0fb5d-b2c6-74e0-adff-a0ea6cef7dce/problem-solving-production-{dark,light}-{1280,390,320}.png`,
`problem-solving-production-compare.png`, and
`problem-solving-production-isolated.png` in the same directory. The live
component preview is `http://127.0.0.1:5178/?theme=dark` while its server runs.

Independent specification and simplicity reviews passed after correcting the
first-only readiness footer, timing tooltip exclusion wording, and inert chart
configuration. Added lines versus `origin/main`: **2,256 production / 682 tests
and fixtures (0.30:1)**; 459 production and 279 test/fixture lines removed.

No required automated command was skipped. Human rebuilt-installed-extension
happy-path and edge-case smoke remains pending before PR review or merge; use
the Difficulty And Recorded Time checklist in `docs/testing.md` and attach
screenshot/recording proof. Agent fixture proof does not replace that requirement.
This feature extends a read-only summary/dashboard using existing saved settings;
no migrations, new dependencies, timer writes, or permissions changed.

## PR Preparation

Rebased cleanly onto `origin/main` at `92ba67d5` (the merged FSRS snapshot
preservation fix). The pre-install post-rebase check passed 197 files / 2,218
tests and `npm run format` passed. The pinned `npm ci` clean install succeeded; final
`npm run check` passed 197 files / 2,218 tests and `npm run format` passed.
The final build result is recorded in the PR body. The unchanged lockfile
install reported 8 vulnerabilities (1 low, 6 moderate, 1 high); dependency
remediation is outside this Analytics PR. No Analytics source
changes were needed for the new base.

Three unchanged production-component screenshots were copied into
`docs/superpowers/handoffs/assets/2026-10-04-analytics-problem-solving/` for
GitHub-visible proof: desktop dark Trend, Compare, and 320px light. These are
illustrative fixtures and do not claim human installed-extension smoke.

## Approved Review Cleanup

The user approved the eight ponytail-review findings on PR #195. Apply them in
two focused passes without changing the approved product behavior:

1. Remove the superseded first-attempt presentation model and runtime schemas;
   use Problem Solving targets and derive first-attempt readiness from its
   per-difficulty valid counts. Migrate unique boundary, weighted-denominator,
   correction and chronology regressions; consolidate obsolete fixtures and
   cache expectations. Run the focused domain, contract, service and API tests.
2. Share target metadata and local chart props, and use Recharts Symbols for
   Compare markers. Run component and target-editor tests, production-component
   browser checks, `npm run check`, `npm run build`, `npm run format`, and
   `git diff --check`. Record actual line savings and update the existing PR.

Done when both passes preserve the chart interactions and runtime invariants,
required automated checks pass, and validation evidence records the remaining
human installed-extension smoke requirement.

### Cleanup Validation

All eight findings were applied. Source shrank by **435 lines net**: 248
production and 187 test/fixture lines. Against the PR merge base `92ba67d5`,
added tests/fixtures are **767 lines / 2,179 production lines (0.35:1)**.
The legacy presentation model is gone; its readiness contract remains, derived
from the canonical cohort. Boundary rates, invalid outer buckets, weighted
denominators, corrected/deleted/restored first records, saved goals and unchanged
cache evidence remain covered.

The seven-file baseline passed 168 tests. Post-cleanup domain/contract/service/API
tests passed 117 tests, and component/screen/target-editor tests passed 40.
The first full check found a widened goal-metric type; returning the shared
metadata selection as a const object fixed it. Final `npm run check` passed
**197 files / 2,207 tests**, database checks, typecheck and lint. Build and format
passed; the build retains its existing chunk-size warning.

Exact validation commands (pinned Node/npm, all final runs passed):

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx vitest run src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/server/analytics-service.test.ts src/features/analytics/api/analytics-api.test.tsx src/features/analytics/components/new-problem-success-view.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/analytics-target-editor.test.tsx
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx vitest run src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/server/analytics-service.test.ts src/features/analytics/api/analytics-api.test.tsx
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx vitest run src/features/analytics/components/new-problem-success-view.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/analytics-target-editor.test.tsx
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run build
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run format
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx prettier --check --ignore-path /dev/null docs/architecture.md docs/superpowers/plans/2026-10-04-analytics-problem-solving-ui.md
rtk proxy git diff --check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH node /private/tmp/cognipace-solving-proof/interactions.cjs
```

Browser plugin not available; regular Playwright checked the production-component
harness at `http://127.0.0.1:5178/?theme=dark`. The sandbox initially prevented
Chrome from launching; the same script passed with approved sandbox escalation.
All nine existing interaction groups passed with zero console errors, meaningful
content, correct page identity and no framework overlay. Dark/light 1280/390/320
layouts have no document overflow. Visual inspection confirmed the Compare
markers and whiskers; its committed screenshot was refreshed.

No required automated validation was skipped. `npm ci` was not repeated because
dependencies are unchanged since the successful clean install; `npm run zip`
and `npm run db:generate` remain skipped because packaging and schema are
unchanged. Human installed-extension happy-path and edge-case smoke with visual
proof remains pending; PR #195 stays draft.

### Main Integration Validation

Merged `origin/main` at `bbb3b5d8`. The only conflict was the planning index;
both Analytics and LeetCode analysis spec/plan entries are retained.

Commands rerun successfully:

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run build
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run format
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx prettier --check --ignore-path /dev/null docs/superpowers/README.md docs/superpowers/plans/2026-10-04-analytics-problem-solving-ui.md
rtk proxy git diff --cached --check
```

Full check passed database checks, typecheck, lint and **206 test files / 2,607
tests**. One provider evaluation file / six tests remain skipped by the suite.
Build retains the existing chunk-size warning. The browser interaction command
above was not repeated because the conflict resolution changes only the planning
index. Human installed-extension smoke and visual proof remain pending; the PR
stays draft. Packaging and database generation remain skipped for the reasons
recorded above.
