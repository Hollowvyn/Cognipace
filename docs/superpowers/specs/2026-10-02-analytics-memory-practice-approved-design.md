# Approved Memory Strength And Practice Rhythm Designs

Follow-up: the user's later empty-edge trimming request supersedes the original
full-window treatment for Recall, Practice Rhythm, and Ratings Mix. Memory
Strength keeps its original window. See the
[approved adjustment](2026-10-02-analytics-layout-polish-design.md#approved-follow-up-empty-edge-trimming).
The exact frozen artifacts below remain unchanged design history.

Status: human-approved visual design, archived exactly on 2026-10-02.
The four historical charts are now implemented locally; see the
[implementation handoff](../handoffs/2026-10-02-analytics-historical-charts.md)
for checks and the pending human extension smoke. The original archive record
below remains a design-only checkpoint.

The user approved the displayed pair with: “Let's use fitted scale” and asked
to save the exact designs. This is the durable checkpoint for that decision.

## Frozen Snapshot

- [Exact editable preview](assets/2026-10-02-analytics-memory-practice/approved-fragment.html)
- [Standalone interactive copy](assets/2026-10-02-analytics-memory-practice/approved-standalone.html)
- [Exact approved screenshot](assets/2026-10-02-analytics-memory-practice/approved-preview.jpg)
- [Checksums, fixture values, and selected settings](assets/2026-10-02-analytics-memory-practice/manifest.json)

The fragment and screenshot are byte-for-byte copies of the version shown to
the user. Do not format or overwrite these frozen files. A future revision
should have its own snapshot. The standalone copy was generated from this
fragment with the visualization renderer. It preserves the initial **Fitted
scale** selection and the **Current scale** comparison.

The preview uses illustrative values and quartiles; it is not a recalculation
of the live extension's data. The manifest records all eight intervals,
medians, quartiles, review counts, success percentages, and rating counts.
The reference report is 10/02/2026 at 2:44 AM in America/New_York.

## Memory Strength

Use a linear fitted scale, discrete vertical Q1–Q3 whiskers with short caps,
and a stronger mint median line with filled markers drawn above the whiskers.
Keep the median and Middle 50% key visible. Show a range only with at least
four eligible review estimates; smaller samples show the median alone.
Missing buckets keep dashed bridges without invented observations.

For the archived 0.5–44-day supported extent, the approved example uses a
0–50-day domain with ticks every 10 days. The old 0–80-day scale remains in the
comparison variant solely to document the improvement.

The production scale must adapt to its input, rather than always using 50
days. In the existing duration helper, use approximately 10% observed-span
padding on each side, clamp the lower bound to zero without transferring
negative padding upward, retain the two-day minimum window and empty-data
fallback, and target approximately five nice tick intervals. Include every
supported median and quartile. Other charts' scale policies remain unchanged.

Use 10px of rendering clearance below and 6px above the scale range in this
approved treatment. Ticks, grid, median points, stems, and caps share the same
mapping. Keep days linear with explicit units. The example's lowest median
has 13.88px of clearance from the plot edge.

## Practice Rhythm

Keep one mixed plot. Muted bars show completed review volume; a crisp mint
line and measured markers show Review Success at the same bucket positions.
Label the left axis Reviews and the right axis Success (%); the legend also
names each axis. Reserve a 50px right gutter for the percentage labels.

The archived example shows count ticks 0, 5, 10, 15, 20 and success ticks 0%,
25%, 50%, 75%, 100%. Production uses the existing separate serialized count
and percentage scales, including the adaptive success domain. Do not force
every production success axis to span 0–100%.

Review Success is Good + Easy divided by valid ratings. Keep the association
note visible. Line/bar crossings are not direct comparisons because their
units differ. Zero-volume buckets stay zero; unavailable success stays absent.
Keep next-valid dashed bridges and the full-period shared tooltip with both
values and the Good + Easy numerator/valid-rating denominator.

## Shared Layout And Inspection

Use the exact product colors, line widths, marker sizes, spacing, panel
headers, and Chart/Table controls in the frozen source. Both desktop plot
tops and bottoms align; narrow layouts stack the pair. The default plots are
290px tall. The screenshot records the approved appearance at 1280×720.

Keep existing aggregation: daily, three-day, and Monday-aligned weekly
summaries for the 14-, 30-, and 90-day ranges. Place bucket statistics at
calendar midpoints. Sparse axis labels show MM/DD; append /YY outside the
report's as-of year, and both years on cross-year ranges. Tooltips and tables
show the entire interval, including both month/day endpoints.

Inspection supports hover, tap, focus, Left/Right bucket navigation, and
Escape dismissal. Unknown values remain explicitly unavailable. The current
interval exposes its In progress state and report time. Native Chart/Table
controls retain exact ranges and values.

## Validation Record

Archive commands run successfully:

```sh
rtk proxy python3 /private/tmp/archive-analytics-approved.py copy
rtk proxy python3 /Users/tobiolutimehin/.codex/plugins/cache/openai-bundled/visualize/1.0.45/skills/visualize/scripts/render.py /Users/tobiolutimehin/.codex/worktrees/837d/cognipace-v2/docs/superpowers/specs/assets/2026-10-02-analytics-memory-practice/approved-fragment.html /Users/tobiolutimehin/.codex/worktrees/837d/cognipace-v2/docs/superpowers/specs/assets/2026-10-02-analytics-memory-practice/approved-standalone.html
rtk proxy python3 /private/tmp/archive-analytics-approved.py manifest
rtk proxy python3 /private/tmp/archive-analytics-approved.py verify
rtk proxy node --check /private/tmp/analytics-approved-snapshot.js
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --write docs/superpowers/specs/2026-10-02-analytics-memory-practice-approved-design.md docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/specs/2026-10-02-analytics-memory-practice-approved-design.md docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md
```

The verification script checks SHA-256 and byte counts for all three archived
artifacts and byte equality of source and screenshot against the originals.
The Markdown formatter explicitly overrides the repository's ignored spec
directory; the frozen HTML and screenshot are never formatted.

Prior browser verification of this exact source confirmed fitted/current
scale switching, five eligible whiskers, median-only rendering for the
two-review sample, grouped counts, unavailable success in zero-volume
buckets, complete table ranges, the ongoing interval, and keyboard controls.
At a 360px viewport both cards stack without horizontal overflow and date
labels retain at least 8px separation. No console errors were reported.

Application checks skipped for this design-only checkpoint:

```sh
rtk npm run test -- src/features/analytics/domain/analytics-scales.test.ts src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/components/historical-views.test.tsx
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
```

No application code changed. Preview checks do not establish live extension
behavior. Implemented scale and UI changes require the full validation in
the main design, plus human happy-path and edge-case realtime smoke with
screenshot or recording proof before PR review or merge.

## Recovery And Next Work

Restore the exact source, screenshot, and values from this Git snapshot.
Follow the [main Analytics design](2026-10-02-analytics-layout-polish-design.md)
for the remaining decisions and implementation outline. Create a phase-sized
implementation plan after the remaining design is approved. This checkpoint
changes no persisted data, scheduling, runtime payload, or Chrome permission.
