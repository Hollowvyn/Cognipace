# Analytics Compact Card Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build feature-local fixed card geometry, exact bounded paging, and measured chart sizing for the approved Analytics page.

**Architecture:** Evolve the existing Analytics panel with an explicit compact mode while old consumers remain compatible until assembly. Keep domain calculations outside the shell. Card adapters own controls and exact fields; the shell supplies measured remaining body dimensions and persistent header/footer tracks. Avoid a generic chart or state framework.

**Tech Stack:** Existing React, Terra Compact tokens, CSS container queries, native ResizeObserver, Testing Library and Vitest. No dependency or runtime-contract changes.

---

Status: Tasks 1–2 implemented and independently reviewed. Continue directly to the compact card adapters. Root owns commits and independent reviews. Approved reference: `docs/superpowers/specs/assets/2026-10-05-analytics-range-summary-approved.html`.

## Task 1: Fixed Panel Geometry And Feature Paging

**Files:**

- Modify: `src/features/analytics/components/analytics-chart-panel.tsx`
- Modify: `src/features/analytics/components/analytics-chart-panel.test.tsx`
- Create: `src/features/analytics/components/analytics-card-controls.tsx`
- Create: `src/features/analytics/components/analytics-card-controls.test.tsx`
- Create: `src/features/analytics/components/analytics-exact-table.tsx`
- Create: `src/features/analytics/components/analytics-exact-table.test.tsx`
- Modify: `src/styles/analytics.css`

- [x] **Step 1: Add failing shell and paging tests.**

Compact panel receives mode (`overview`, `details`, `goals`, `selection`), header action, optional hero, body and footer. Test stable shell identity and semantic heading/description across mode changes, measured body callback after ResizeObserver notifications, and unavailable/skeleton content within the same tracks. Preserve old panel semantics while old consumers remain.

Expose a feature-local exact table with row-label, field definitions, field groups and controlled pagination. Test every original field accessible through groups, every row accessible through pages, page clamping when counts/width change, complete long titles, no horizontal/vertical scrolling wrapper, keyboard access, empty values as em dash, and measured zero rendered as zero. Four rows wide/three narrow are maxima; card adapters may lower them for long content.

```ts
interface AnalyticsCardGeometry {
  width: number
  bodyHeight: number
  tablePageSize: number
  problemPageSize: number
}
interface AnalyticsExactField<Row> {
  key: string
  label: string
  value(row: Row): React.ReactNode
}
```

- [x] **Step 2: Run RED and implement the shell.**

Run `rtk npm run test -- src/features/analytics/components/analytics-chart-panel.test.tsx src/features/analytics/components/analytics-card-controls.test.tsx src/features/analytics/components/analytics-exact-table.test.tsx`. Expected: new exports/compact assertions fail before implementation.

Compact CSS tracks follow the final prototype:

```css
.cp-analytics-card {
  height: 464px;
  display: grid;
  grid-template-rows: 52px 62px minmax(0, 1fr) 44px;
  gap: 10px;
  padding: 20px;
  min-width: 0;
}
.cp-analytics-card[data-mode='details'],
.cp-analytics-card[data-mode='goals'],
.cp-analytics-card[data-mode='selection'] {
  grid-template-rows: 52px minmax(0, 1fr) 44px;
}
.cp-analytics-card-body {
  min-height: 0;
  min-width: 0;
  height: 100%;
}
```

Apply stacked `512px` geometry with `72px / 64px / flex / 64px` tracks when the page cannot provide two 360px cards plus its gap. Use a page container and container query, not the existing dashboard `lg` breakpoint. Keep font sizes/readable full content. Do not use overflow hiding, ellipsis, scaling text or internal scrolling to make content appear to fit. A single short description replaces simultaneous question and long explanation in compact mode; method paragraphs move into bounded sections.

Observe the always-mounted body element. Return real remaining width/height to child render callbacks, with deterministic initial dimensions for tests/SSR. Disconnect observers on unmount. Width observation remains active while plots are hidden. Keep the header Details/Overview button and footer actions in reserved tracks. Use semantic tabs/pressed buttons with independent accessible names; restore focus after closing a goal/selection surface.

- [x] **Step 3: Implement controlled exact field groups and pagination.**

Each field group shows only the columns that fit alongside the full row label. All source fields must appear in at least one group; do not discard evidence to reduce columns. Pager lives in the shell footer, not inside table body. Use `Math.max(0, Math.min(page, Math.ceil(rows.length / pageSize) - 1))` for the rendered page and an explicit reset/clamp when inputs change. Empty arrays use a compact unavailable state. Native Previous/Next buttons expose count and disabled state.

- [x] **Step 4: Run GREEN, format, review, and commit.**

Run the three new/focused suites, then `rtk npm run typecheck`. Expected: all pass with legacy screen still rendering. Fresh specification then quality review. Root commits `feat: add fixed analytics card geometry and paging`.

## Task 2: Fitted Historical Plots And Persistent Goal Surface

**Files:**

- Modify: `src/features/analytics/components/charts/historical-chart.tsx`
- Modify: `src/features/analytics/components/charts/historical-chart-model.ts` and `.test.ts` only for an opt-in cumulative as-of cutoff.
- Modify: `src/features/analytics/components/charts/historical-chart.test.tsx` or its existing focused model/render test owner.
- Create: `src/features/analytics/components/charts/cumulative-trend.tsx`
- Create: `src/features/analytics/components/charts/cumulative-trend.test.tsx`
- Modify: `src/features/analytics/components/analytics-target-editor.tsx`
- Modify: `src/features/analytics/components/analytics-target-editor.test.tsx`

- [x] **Step 1: Add failing fitted-plot and held-marker tests.**

Keep the original chart inspector's pointer/touch/native keyboard parity and exact raw-row tooltips. Add an explicit compact chart option that uses supplied remaining body height, removes the competing minimum/aspect ratio, and optionally moves repeated grouping text into the card footer without changing data positions. Both axes and boundary markers must remain inside usable plot space at 320px and desktop widths.

The cumulative SVG renderer consumes reviewed pure geometry and existing public chart scale hooks. Test updated-only marks, long-dashed horizontal holds, short-dashed FSRS active curve, neutral unavailable leading rows, bounded natural active curves, selected-marker visibility, and Performance area fill only over supported cumulative history. Held rows inspect raw zero new evidence plus carried cumulative value and last update; they are never advertised as newly measured.

The existing model ends each interval at next local midnight. Add an explicit cumulative-only presentation cutoff so the final partial interval's numeric end and midpoint respect report as-of. Thread it through both the chart and axis model calls, adapt fractional-cutoff ticks, and preserve the original date keys, `isPartial`, values and inspection rows. Derive the report-zone calendar coordinate through the existing local-day helpers, including DST; raw outcome/time/Memory/Practice/Mix positioning keeps its default behavior. Test early-day, shortened, same-day and DST edges without inventing future marks or a new event timestamp.

- [x] **Step 2: Run RED, implement the fitted renderer and goal option.**

Run focused historical/cumulative/target editor tests. Expected: new behavior fails before implementation. Draw paths using existing `useXAxisScale` / `useYAxisScale` / `usePlotArea`; preserve original rows in `HistoricalChart` for inspection. Do not replace generic `LineSegments` for raw/time/memory charts. No chart-library docs lookup is required unless actual API syntax is uncertain; then use Context7 as the repository requires.

Allow the existing target editor to render its already validated form in a dedicated Goals surface, with a parent-controlled open/close callback or equivalent lean option. Existing legacy trigger behavior remains compatible. Keep one selected form visible at a time and mount its controller while hidden: navigating Overview/Details must preserve drafts and failed save errors. Enter/Save, Escape/Cancel, focus return, counterpart validation, one-key patch, pending guard, and error association stay unchanged. Persistent errors remain beside fields; optional floating confirmation never replaces them.

- [x] **Step 3: Run GREEN, review, and commit.**

Run focused chart/model/target/editor suites and typecheck. Expected: all pass. Fresh specification review then quality review. Root commits `feat: fit analytics plots and goal editors to fixed cards`.

## Validation And Continuation

- [ ] Format touched files and run focused tests before required full `rtk npm run lint`, `rtk npm run check`, `rtk npm run build` at page integration.
- [ ] Record exact commands and remaining human extension proof. A fixed shell without migrated cards is not the finished Analytics page.
- [x] Continue directly to card adapters and assembly already authorized by the user.

## Task 1 Execution Record

The compact panel retains the legacy API and adds `compact`, `mode`, `headerAction`, `hero`, and geometry-rendered body/footer content. The body remains mounted and observed in every mode. Feature controls expose native pressed buttons, a footer pager, and focus return after the mode-change commit. Exact tables use wrapping field navigation rather than a clipped select label; all supplied fields remain reachable. Paging resets on row identity/order, width, size, or an explicit `resetKey`; equivalent newly derived row arrays retain their page. Adapters must lower the geometry's maximum page size for long content and supply the same size to the table and footer pager.

RED failed on missing exports/compact assertions, then on the wrapping field navigation and equivalent-row regressions. GREEN passed 40 tests across the three focused suites and the existing screen suite. Pinned typecheck, touched ESLint, Prettier, and whitespace checks passed. Independent specification and quality reviews passed; quality validation included architecture boundaries with 56 tests passed.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/analytics-chart-panel.test.tsx src/features/analytics/components/analytics-card-controls.test.tsx src/features/analytics/components/analytics-exact-table.test.tsx src/features/analytics/components/analytics-screen.test.tsx
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/analytics-chart-panel.test.tsx src/features/analytics/components/analytics-card-controls.test.tsx src/features/analytics/components/analytics-exact-table.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/testing/architecture-boundaries.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run typecheck
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx eslint src/features/analytics/components/analytics-chart-panel.tsx src/features/analytics/components/analytics-chart-panel.test.tsx src/features/analytics/components/analytics-card-controls.tsx src/features/analytics/components/analytics-card-controls.test.tsx src/features/analytics/components/analytics-exact-table.tsx src/features/analytics/components/analytics-exact-table.test.tsx
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --check src/features/analytics/components/analytics-chart-panel.tsx src/features/analytics/components/analytics-chart-panel.test.tsx src/features/analytics/components/analytics-card-controls.tsx src/features/analytics/components/analytics-card-controls.test.tsx src/features/analytics/components/analytics-exact-table.tsx src/features/analytics/components/analytics-exact-table.test.tsx src/styles/analytics.css
rtk git diff --check
```

Root's outside-repository Vite preview imports the actual panel, controls, exact table, production styles, and dashboard typography. CUA verified 464px Overview/Details shells at a 1,232px page and the exact 736px two-column boundary; a 735px page stacks into 512px cards. With complete production utility CSS and borders, a 320px viewport gives a 296px card and 254px body width. Full labels, three bounded rows, reachable field groups, distinct zero/unavailable values, and a separate footer pager fit without horizontal overflow. Measured bodies are 234px/306px high for desktop Overview/Details and 240px/314px high stacked. Goals retains the same 512px height and Close restores header-action focus. This foundation proof does not claim all-card or installed-extension validation.

Full `npm run lint`, `npm run check`, and `npm run build` are deferred to page integration as planned; their preceding presentation-phase checkpoint already passed. Full production card proof and human installed-extension happy-path/edge-case smoke remain pending. `npm run db:generate` and `npm run zip` are not applicable to this shell phase because it changes neither persistence nor packaging.

## Task 2 Execution Record

`HistoricalChart` now accepts `compact={{ height, showGroupingLabel }}` and `cumulativeAsOf`. Both model calls receive the explicit cutoff. `historicalAsOfCoordinate` uses report-zone local day boundaries, including DST and milliseconds; midnight singleton display scales extend into the past without changing the zero-width original interval. `CumulativeTrend` renders the reviewed pure geometry with public chart scales, update-only circles/diamonds, bounded active curves, long dashed horizontal holds, selected measured markers, and optional supported-history area fill. Generic raw line rendering is unchanged.

`AnalyticsTargetEditor` adds `surface="goals"`, controlled `open`/`onOpenChange`, and `returnFocusRef`. Future adapters must keep every metric controller keyed and mounted. Hiding preserves draft/error; explicit Save, Cancel, and Escape finish the edit. Existing validation, one-key patches, pending duplicate guard, and legacy trigger behavior remain.

RED produced eight missing-feature failures while 27 legacy tests passed, then three renderer failures. Final GREEN passed 60 tests across five suites. Pinned typecheck, eight-file ESLint, Prettier, and whitespace checks passed. Independent specification review passed; independent quality review passed 76 tests including architecture boundaries. The agent service rejected fresh reviewer dispatch with `agent thread limit reached`; root reused existing independent reviewers with complete bounded review briefs. Neither reviewer authored the implementation.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/charts/cumulative-trend.test.tsx src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/domain/cumulative-trend-geometry.test.ts
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm run test -- src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/charts/cumulative-trend.test.tsx src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/domain/cumulative-trend-geometry.test.ts src/testing/architecture-boundaries.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run typecheck
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx eslint src/features/analytics/components/charts/historical-chart.tsx src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/charts/historical-chart-model.ts src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/charts/cumulative-trend.tsx src/features/analytics/components/charts/cumulative-trend.test.tsx src/features/analytics/components/analytics-target-editor.tsx src/features/analytics/components/analytics-target-editor.test.tsx
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --check src/features/analytics/components/charts/historical-chart.tsx src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/charts/historical-chart-model.ts src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/charts/cumulative-trend.tsx src/features/analytics/components/charts/cumulative-trend.test.tsx src/features/analytics/components/analytics-target-editor.tsx src/features/analytics/components/analytics-target-editor.test.tsx
rtk git diff --check
```

CUA verified actual chart/renderer/target components with complete production CSS. At 320px a supplied 152px compact plot produces a 152px host, nested responsive container, and SVG; the nested computed minimum is 0px. There are no nonfinite paths. End keyboard inspection reaches an inactive interval and reports zero new ratings plus its carried score. A failed goal value of 85 and its associated error survive Overview/Goals navigation; allowing retry and submitting with Enter succeeds, restores header-action focus, and retains the 512px shell. The 215px form fits its 314px remaining body without horizontal overflow.

Full gates remain deferred to final integration; all ten adapters, complete responsive browser proof, and human installed-extension smoke are still required. This executed foundation alone does not complete the Analytics redesign.
