# Analytics Compact Card Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build feature-local fixed card geometry, exact bounded paging, and measured chart sizing for the approved Analytics page.

**Architecture:** Evolve the existing Analytics panel with an explicit compact mode while old consumers remain compatible until assembly. Keep domain calculations outside the shell. Card adapters own controls and exact fields; the shell supplies measured remaining body dimensions and persistent header/footer tracks. Avoid a generic chart or state framework.

**Tech Stack:** Existing React, Terra Compact tokens, CSS container queries, native ResizeObserver, Testing Library and Vitest. No dependency or runtime-contract changes.

---

Status: written for execution after the date/runtime and presentation phases. Root owns commits and independent reviews. Approved reference: `docs/superpowers/specs/assets/2026-10-05-analytics-range-summary-approved.html`.

## Task 1: Fixed Panel Geometry And Feature Paging

**Files:**

- Modify: `src/features/analytics/components/analytics-chart-panel.tsx`
- Modify: `src/features/analytics/components/analytics-chart-panel.test.tsx`
- Create: `src/features/analytics/components/analytics-card-controls.tsx`
- Create: `src/features/analytics/components/analytics-card-controls.test.tsx`
- Create: `src/features/analytics/components/analytics-exact-table.tsx`
- Create: `src/features/analytics/components/analytics-exact-table.test.tsx`
- Modify: `src/styles/analytics.css`

- [ ] **Step 1: Add failing shell and paging tests.**

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

- [ ] **Step 2: Run RED and implement the shell.**

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

- [ ] **Step 3: Implement controlled exact field groups and pagination.**

Each field group shows only the columns that fit alongside the full row label. All source fields must appear in at least one group; do not discard evidence to reduce columns. Pager lives in the shell footer, not inside table body. Use `Math.max(0, Math.min(page, Math.ceil(rows.length / pageSize) - 1))` for the rendered page and an explicit reset/clamp when inputs change. Empty arrays use a compact unavailable state. Native Previous/Next buttons expose count and disabled state.

- [ ] **Step 4: Run GREEN, format, review, and commit.**

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

- [ ] **Step 1: Add failing fitted-plot and held-marker tests.**

Keep the original chart inspector's pointer/touch/native keyboard parity and exact raw-row tooltips. Add an explicit compact chart option that uses supplied remaining body height, removes the competing minimum/aspect ratio, and optionally moves repeated grouping text into the card footer without changing data positions. Both axes and boundary markers must remain inside usable plot space at 320px and desktop widths.

The cumulative SVG renderer consumes reviewed pure geometry and existing public chart scale hooks. Test updated-only marks, long-dashed horizontal holds, short-dashed FSRS active curve, neutral unavailable leading rows, bounded natural active curves, selected-marker visibility, and Performance area fill only over supported cumulative history. Held rows inspect raw zero new evidence plus carried cumulative value and last update; they are never advertised as newly measured.

The existing model ends each interval at next local midnight. Add an explicit cumulative-only presentation cutoff so the final partial interval's numeric end and midpoint respect report as-of. Thread it through both the chart and axis model calls, adapt fractional-cutoff ticks, and preserve the original date keys, `isPartial`, values and inspection rows. Derive the report-zone calendar coordinate through the existing local-day helpers, including DST; raw outcome/time/Memory/Practice/Mix positioning keeps its default behavior. Test early-day, shortened, same-day and DST edges without inventing future marks or a new event timestamp.

- [ ] **Step 2: Run RED, implement the fitted renderer and goal option.**

Run focused historical/cumulative/target editor tests. Expected: new behavior fails before implementation. Draw paths using existing `useXAxisScale` / `useYAxisScale` / `usePlotArea`; preserve original rows in `HistoricalChart` for inspection. Do not replace generic `LineSegments` for raw/time/memory charts. No chart-library docs lookup is required unless actual API syntax is uncertain; then use Context7 as the repository requires.

Allow the existing target editor to render its already validated form in a dedicated Goals surface, with a parent-controlled open/close callback or equivalent lean option. Existing legacy trigger behavior remains compatible. Keep one selected form visible at a time and mount its controller while hidden: navigating Overview/Details must preserve drafts and failed save errors. Enter/Save, Escape/Cancel, focus return, counterpart validation, one-key patch, pending guard, and error association stay unchanged. Persistent errors remain beside fields; optional floating confirmation never replaces them.

- [ ] **Step 3: Run GREEN, review, and commit.**

Run focused chart/model/target/editor suites and typecheck. Expected: all pass. Fresh specification review then quality review. Root commits `feat: fit analytics plots and goal editors to fixed cards`.

## Validation And Continuation

- [ ] Format touched files and run focused tests before required full `rtk npm run lint`, `rtk npm run check`, `rtk npm run build` at page integration.
- [ ] Record exact commands and remaining human extension proof. A fixed shell without migrated cards is not the finished Analytics page.
- [ ] Continue directly to card adapters and assembly already authorized by the user.
