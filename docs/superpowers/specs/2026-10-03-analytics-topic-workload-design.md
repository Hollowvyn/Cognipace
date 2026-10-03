# Analytics Topic and Workload Design

The user approved these visual decisions on October 3, 2026: all qualifying
Topic Performance topics as rising columns; compact inline Memory Signals;
Daily line for Recent Overdue Backlog; separate counts inside Due and Overdue
segments for Upcoming Review Load. This document records that design for the
next implementation phase. Production code has not changed yet.

Work in `codex/analytics-topic-workload`, based on merged PR #184 at
`7cccd2d7b63d8d01e226227ca9e62247e3c165e1`. Preserve the earlier historical
charts and their approved snapshots.

## Topic Performance

- Show every qualifying topic, ordered from lowest to highest Review Success.
  Preserve the existing tie order: more valid ratings, then normalized name.
- Draw vertical columns on a fixed 0–100% axis. Show whole-percent labels with
  room above 100% bars and an explicit mark/label for 0%. Keep supplied rates
  for geometry and exact numerator/denominator in inspection and Table.
- Use the saved **Target Review Success** from Practice Rhythm, with a dashed
  horizontal reference and the existing compact goal editor. Editing it uses
  the same Settings-owned preference and refresh behavior; it never changes
  topic outcomes, eligibility, or FSRS scheduling.
- Compare each unrounded rate with the target. Inspection and Table show one
  decimal plus exact Good + Easy and valid-rating counts, with an explicit
  below/meeting-target status so rounded labels cannot determine eligibility
  or misclassify a near-target topic.
- Distinguish topics below the goal from those meeting it. Say **below target**,
  not that a topic caused the overall result. Reviews can belong to multiple
  direct topics; their counts cannot be added to calculate an overall rate.
- Preserve qualification: at least 10 valid ratings and 3 distinct reviewed
  problems in the selected period. Review Success remains Good + Easy divided
  by all valid ratings, including first attempts and repeat reviews. Current
  direct topic assignments apply to retained history; no ancestor rollups.
- Remove the domain's weakest-five slice and the runtime schema's five-row
  limit. Retain the low-evidence summary's existing bounded list. Keep omitted
  qualifying count zero while its compatibility field remains in the contract.
- Use a minimum 96px topic slot when necessary, with a bounded horizontal plot
  scroller and wrapped topic names. Preserve one continuous ascending order and
  baseline. Keep the target caption outside the scroller and reveal the active
  keyboard column. Show an overflow hint only when scrolling is necessary.
- Pointer, tap, and keyboard inspection expose the full topic name, exact
  numerator/denominator, distinct problem count, period, goal and evidence.
  Table includes every qualifying topic with full names; insufficient evidence
  remains a distinct state rather than a zero-success result.

## Memory Signals by Problem

- Replace the sparse three-column table with a compact list, capped at 36rem
  on desktop and filling available width on narrow screens. Keep its existing
  position after the Retention Map; remove the artificial minimum body height.
- Each row contains rank and the canonical linked problem title, followed by
  wrapping inline reasons underneath. Use quiet separators and readable reason
  colors with explicit text. Keep five rows per page and page announcements.
- Preserve severity order, rank, all supplied reasons, and the distinction
  between the returned top 25 and the total qualifying population.
- Use labels such as **Estimated recall 70% · below FSRS target**, **Overdue · 2d**, and
  **Low durability · 3d**. Change the domain label producer if wording changes;
  do not parse numbers out of display strings in the component.
- These signals use the FSRS retention target, not the personal Recall goal.
  Durability is total target-crossing duration, not time until a problem is due.
  Do not infer unflagged numeric values or introduce new sorting controls.

## Recent Overdue Backlog

- Replace steps with a straight line joining known daily observations, with
  small dots for every finite count, including zero and a single isolated day.
  The selected dot is larger and shares its date with inspection.
- Preserve original local dates, the supplied count scale and the five-problem
  watch reference. Counts at or below five are within the watch zone; larger
  counts are above it. Use exact threshold splits for connector color, without
  adding an observed marker at the interpolated crossing.
- Unknown dates break the line and remain **Not measured** in inspection and
  Table. No smoothing, reconstructed intermediate observations, or null-to-zero
  substitution. Daily values are snapshots at each day's end; today stops at
  the report's as-of time.
- Keep measured dots inside the plot at edges and baseline. Draw them separately
  from connector runs so a singleton is visible even if no line shape renders.
- Preserve known-day, current, peak and watch-day summaries. The final date
  determines current backlog even if its value is unknown.
- Synchronize pointer, tap and keyboard selection with one active marker and
  inspector. Support arrows, Home/End, Enter/Space and Escape. Announce keyboard
  selections without a permanent duplicate value paragraph. Inspection includes
  the exact count, known/unknown status, watch status, date and report context.
- Backlog's current count may differ from Upcoming's overdue count: backlog
  evaluates due timestamps, while Upcoming uses prior local calendar dates.

## Upcoming Review Load

- Keep the fixed 14-date schedule and existing stacked geometry: overdue only
  on Today, with due above it. Green Due and pink hatched Overdue retain their
  category identities and legend.
- Center each positive segment's own exact integer when its rendered width and
  height fit the text with at least 4px total clearance. Use contrasting text
  and a same-fill backing/stroke so hatching does not obscure a count.
- Put counts above a bar when they cannot fit. Mixed fallbacks identify each
  component, for example **Due 2 · Overdue 1**. Overdue-only fallbacks explicitly
  say **Overdue 1**. A due-only count can sit directly above its green bar.
- Measure outside labels against plot edges and each other. Stagger or wrap
  compound labels with a short association line when needed; retain readable
  text at narrow widths. Never inflate a small segment or repeat a count as a
  separate total label. Zero-height segments receive no label.
- Preserve all zero-date slots, exact counts, the supplied scale and the existing
  all-zero empty state. A due-zero/overdue-positive Today still receives a label.
- Reuse synchronized workload inspection for pointer, tap and keyboard. Inspect
  and Table always expose exact Due, Overdue and Total, including zeros. This
  remains a fixed schedule snapshot, not simulated future rescheduling.

## Ownership and scope

Keep changes inside Analytics. Reuse `ChartTable`, the existing target editor,
canonical problem links and feature styling. Topic columns are categorical;
keep them separate from the calendar-specific `HistoricalChart` abstraction.
A small feature-local workload inspection helper is justified only if both
workload charts use it. Prefer existing primitives over a new chart framework.

Primary files: `components/historical-views.tsx`, `components/current-state-views.tsx`,
`components/workload-views.tsx`, `components/analytics-screen.tsx`,
`domain/historical-presentation.ts`, `domain/current-state-presentation.ts`, and
`api/analytics-contracts.ts`, all under `src/features/analytics/`. Update relevant
product, architecture, testing and design authority sections with actual behavior.

The only serialized shape change is allowing all qualifying topic rows.
Domain-generated reason wording also changes serialized display strings. No new goal
field, database shape, permissions, sync behavior, scheduling rule, or runtime
message is needed. Keep contract validation at the existing Zod boundary.

## Validation and implementation order

Implement Topic Performance, then Memory Signals, then both workload views.
Each step gets focused behavioral checks before the complete dashboard checks.
Keep test/fixture added lines at or below production added lines, as the user
requested. Edit existing tests and reuse compact fixtures instead of duplicating
chart implementations or building a permanent preview harness.

Meaningful coverage includes more than five qualifying topics, stable ranking,
qualification and goal reuse; preserved signal ranks/reasons and pagination;
backlog null gaps, zero/singleton markers, threshold boundaries and synchronized
inspection; and segment labels for mixed, tiny, zero, overdue-only and neighboring
bars. Visual proof must cover desktop and 320px in both themes, long topic names,
many topics, and dense workload labels.

For implementation run focused tests, `rtk npm run lint`, `rtk npm run check`,
`rtk npm run build`, formatting and diff checks. Before PR review or merge the
human engineer must smoke-test the rebuilt installed extension's happy path
and edge cases, including goal edits, range changes, keyboard/tap inspection,
pagination, sparse/unknown history and zero schedules, and attach screenshots
or a recording. Preview checks do not replace that installed-extension proof.

For this design-only step run Prettier on this document. App lint, check, build,
and installed-extension smoke are deferred because production code is unchanged.
