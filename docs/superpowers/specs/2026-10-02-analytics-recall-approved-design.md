# Approved Observed Recall And FSRS Estimate Design

Follow-up: the user's approved empty-edge trimming now applies to all four
historical charts. The [original adjustment](2026-10-02-analytics-layout-polish-design.md#approved-follow-up-empty-edge-trimming)
covers Recall, Practice Rhythm, and Ratings Mix; the latest
[Memory Strength adjustment](2026-10-02-analytics-layout-polish-design.md#approved-follow-up-memory-strength-empty-edges)
supersedes Memory's full-window exception. The exact frozen artifacts below
remain unchanged design history.

Status: human-approved visual design, archived exactly on 2026-10-02.
The four historical charts are now implemented locally; see the
[implementation handoff](../handoffs/2026-10-02-analytics-historical-charts.md)
for checks and the pending human extension smoke. The original archive record
below remains a design-only checkpoint. The user approved the final refined
Recall preview with: “we have what we need”. This checkpoint follows removal of
the redundant bottom selected-detail row; Ratings Mix is the next design review.

## Frozen Snapshot

- [Exact approved fragment](assets/2026-10-02-analytics-recall/approved-fragment.html)
- [Standalone interactive export](assets/2026-10-02-analytics-recall/approved-standalone.html)
- [Clean approved screenshot](assets/2026-10-02-analytics-recall/approved-preview.jpg)
- [Structured tooltip proof](assets/2026-10-02-analytics-recall/approved-tooltip.jpg)
- [Checksums, fixture values, and selected settings](assets/2026-10-02-analytics-recall/manifest.json)

The fragment and both screenshots are byte-for-byte copies of the approved
preview and its recorded states. Do not format or overwrite these frozen files.
Create a separate snapshot for a future revision. The standalone document was
generated from this exact fragment with the visualization renderer; it embeds
the same approved source inside the export wrapper.

The fixture is illustrative, not recovered review counts from the supplied
screenshots and not a recalculation of the live extension. Its manifest records
eight complete interval definitions, unavailable buckets, recalled and paired
counts, exact observed fractions, FSRS estimates, and signed differences. The
reference report is 10/02/2026 at 2:44 AM in America/New_York.

## Approved Plot And Inspection

Observed Recall uses a solid mint line with circle markers. The FSRS Estimate
uses an opaque short-dashed line with diamond markers; keep its stronger
contrast and distinct shape. Long-dash bridges connect the next measured points
across missing buckets without adding observations. Unknown buckets receive no
ordinary or active markers.

Use the exact colors, stroke widths, marker geometry, spacing, heading,
Chart/Table controls, and compact legend from the frozen source. The approved
example has a 20%–100% domain, ticks every 20 percentage points, and the configured
87% target. Target text sits above the plot rather than crossing the measured
series. Production keeps its existing serialized adaptive percentage domain,
ticks, and configured target; these example values are not fixed production
defaults.

The default inspected interval is 09/18–09/20. A neutral vertical guide and the
active circle/diamond highlight its two measured values. The tooltip starts
hidden. Keep rendering clearance for highlights at the upper boundary: the
example places 100% at least 8px inside the plot, while the active circle's
outer radius is 6.5px. There is no separate connector between the paired marks.

Detailed values appear in one structured tooltip, with no permanent selected
detail row below the chart. The tooltip shows the full interval, grouping,
illustrative sample label, recalled/paired counts, both rates, signed observed
minus estimate difference, configured target, and complete/in-progress context
with the report time. The tooltip proof records the 09/21–09/23 example with
2 recalled of 2 paired reviews, 100% observed recall, 75% estimated recall, and
+25 pp difference. A small sample at 100% does not imply certainty or mastery.

Series buttons toggle each curve, ordinary and active markers, and its tooltip
rate together. The comparison difference appears only when both series are
visible. Shared paired-review sample counts remain cohort context when a series
is hidden. The SVG description reflects both, one, or no visible series. The
table remains the complete exact-value alternative.

Inspect a bucket through the full plot using hover, touch, or focus. Pointer
selection uses the actual event position; Left/Right moves between buckets and
Escape dismisses the tooltip. Selecting an unavailable bucket retains explicit
Unavailable values and introduces no synthetic marker.

## Dates And Existing Product Meaning

Keep daily, three-day, and Monday-aligned weekly summaries for the 14-, 30-, and
90-day ranges. Use calendar midpoint display anchors without changing values
or interval boundaries. Axis dates stay sparse and readable, with MM/DD in the
report's as-of year and /YY outside that year. Cross-year ranges show both
years. Tooltips and table rows retain both complete date endpoints. The final
09/30–10/02 interval is In progress through the report's as-of time.

Observed Recall counts Hard, Good, and Easy as recalled and excludes Again.
Its denominator is eligible paired reviews, not all review attempts or the
Observed Correctness metric. The estimate is FSRS retrievability reconstructed
immediately before those same reviews. Preserve these distinct meanings and
all existing evidence gates, requested ranges, and unknown-history behavior.

The existing production rows already provide `bucketStart`, `bucketEnd`,
`isPartial`, `recalledCount`, `pairedReviews`, `observedRecall`, `fsrsEstimate`,
`difference`, `provenance`, and `evidence`. Read these feature-owned serialized
fields; no new raw-review payload or background calculation is needed. Use
the serialized `difference` in fractional units and multiply by 100 for
percentage-point display. Never subtract rounded labels. For the illustrative
5/6 sample against 90%, the displayed difference is −6.7 pp; for 12/14 against
85%, it is +0.7 pp. The manifest preserves the exact fractions and the frozen
source's precomputed differences.

## Validation Record

Archive and source checks run successfully:

```sh
rtk proxy python3 /private/tmp/archive-analytics-recall-approved.py copy
rtk proxy python3 /Users/tobiolutimehin/.codex/plugins/cache/openai-bundled/visualize/1.0.45/skills/visualize/scripts/render.py /Users/tobiolutimehin/.codex/worktrees/837d/cognipace-v2/docs/superpowers/specs/assets/2026-10-02-analytics-recall/approved-fragment.html /Users/tobiolutimehin/.codex/worktrees/837d/cognipace-v2/docs/superpowers/specs/assets/2026-10-02-analytics-recall/approved-standalone.html
rtk proxy python3 /private/tmp/archive-analytics-recall-approved.py manifest
rtk proxy python3 /private/tmp/archive-analytics-recall-approved.py verify
rtk proxy node --check /private/tmp/analytics-recall-approved-snapshot.js
```

Verification checks SHA-256 and byte counts for all four frozen artifacts,
byte equality of the fragment and screenshot copies against the originals,
the fixture's exact ratios and signed differences, absence of the bottom-row
markup/styles/queries, non-null guards for active markers, dynamic accessibility
description, and opaque series rendering. The archived screenshots record the
clean plot and grouped tooltip states. Before approval, browser checks of this
exact source verified full-plot inspection, single-step keyboard navigation,
unavailable buckets without active markers, the current partial interval,
synchronized series visibility, and Chart/Table switching. Tooltip-only detail
was confirmed with no duplicate bottom row. The 5/6 and 12/14 examples displayed
83.3%/−6.7 pp and 85.7%/+0.7 pp respectively. At a 320px viewport, the 288px
surface had no horizontal overflow; the active 100% circle retained 1.5px of
outer-edge clearance and the tooltip stayed within the plot width. Clean and
tooltip proof were captured at 736px, the temporary viewport override was reset,
and no console errors were reported. These are prototype checks, not live
extension validation. The archive task did not repeat those browser checks.

Markdown checkpoint checks:

```sh
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --write docs/superpowers/specs/2026-10-02-analytics-recall-approved-design.md
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/specs/2026-10-02-analytics-recall-approved-design.md
rtk git diff --check
```

Application checks skipped for this design-only checkpoint:

```sh
rtk npm run test -- src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/charts/line-segments.integration.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/components/ui/chart.test.tsx src/components/ui/chart-table.test.tsx
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
```

No application code changed. The implementation still needs focused component
and missing-evidence coverage, full required automated checks, and human
ready-history and sparse-history realtime extension smoke with screenshot or
recording proof before PR review or merge. Markdown formatting is a separate
checkpoint check; frozen HTML and JPEG files must remain unformatted.

## Recovery And Next Work

Restore the exact approved fragment, interactive export, screenshots, and
fixture metadata from this snapshot. Keep the independently approved
[Memory Strength and Practice Rhythm snapshot](2026-10-02-analytics-memory-practice-approved-design.md)
unchanged. The [main Analytics design](2026-10-02-analytics-layout-polish-design.md)
owns the remaining layout direction. Prepare a phase-sized implementation plan
after the remaining designs are approved. This checkpoint changes no local
data, persistence, scheduling, runtime contract, or Chrome permission.
