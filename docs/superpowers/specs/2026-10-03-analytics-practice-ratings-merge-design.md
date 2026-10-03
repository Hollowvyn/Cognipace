# Merged Practice Rhythm Design

Approved in the conversation on October 3, 2026: the user selected the volume
overlay preview, confirmed the Review Success target, and requested
implementation. The approved chart combines Practice Rhythm and Ratings Mix in
one mixed plot. Earlier exact chart snapshots remain preserved.

## Presentation

- Keep the title **Practice Rhythm**. Stack exact supplied rating shares from
  bottom to top: Easy, Good, Hard, Again. The upper edge of Good + Easy is Review
  Success; do not add a duplicate success curve.
- Use a fixed 0–100% left axis labeled **Rating share (%)** and the supplied
  independent count scale on the right labeled **Reviews**. Draw completed
  reviews as a straight, quiet neutral line with small measured markers. Known
  zero counts are real observations; unavailable counts are not zeros.
- Retain the saved **Target Review Success** reference on the percentage axis
  and the existing one-field Settings-owned editor above the plot. Goals at 0%
  and 100% remain visible. Goal edits never alter shares, counts, dates, or FSRS.
- Soften Hard/Again within this chart, keep Easy/Good distinct, and retain
  contrasting 12px whole-percent labels only where they fit without colliding
  with the count line or target. Exact geometry and precise inspection values
  remain unchanged. Internal unavailable composition uses full-height gray
  diagonal hatching; a zero category stays zero-height.
- One small native Reviews legend switch hides the count line, markers, axis,
  and tooltip count together. It must not change rows, dates, target, or table
  values. Accessible chart copy follows the visible state.
- Preserve the association-only explanation. The two scales permit comparison
  of timing; a count-line crossing with the target has no percentage meaning.

## Data and interactions

Use the existing serialized `views.practiceRhythm` and `views.ratingsMix`, never
the legacy correctness series. Join by ID plus exact start/end interval, not
array position. Keep original rows intact. Preserve rows supplied by either
view; an absent counterpart remains unavailable. Sort by interval, then trim
only unsupported outer rows. A positive completed count, valid rating count,
or finite supplied success (including zero) supports an edge. Keep all internal
gaps, selected-period totals, comparison, readiness, and report metadata.

Chart, nearest-bucket inspection, and the seven-row Table share that slice.
Inspection includes completed reviews, each rating count and precise share,
Good + Easy numerator/denominator, supplied success, target, each metric's
evidence, full interval, report timezone/as-of, and partial status. Table keeps
these values even when Reviews is visually hidden. Pointer, tap, keyboard,
Home/End, Enter/Space, Escape, and sparse cross-year dates use the existing
historical chart primitives. Retain the selected-period challenging-rating
summary and evidence-gated prior-period comparison below the shared view.

## Composition and ownership

Replace the two dashboard cards with one full-width Practice Rhythm card to
keep four stacked categories and two axes legible. Keep Recall first, followed
by the merged chart; Memory Strength and the unchanged Topic Performance view
share the next responsive row. Later current-state/workload views retain their
existing treatment. Show rating readiness alongside count readiness when their
warnings differ; neither warning suppresses supported observations.

Implement a feature-local merged view and a pure presentation join helper.
Reuse `HistoricalChart`, `HistoricalTargetLine`, `HistoricalTable`, `ChartTable`,
and `AnalyticsTargetEditor`. No serialized API, schema, persistence, runtime,
permissions, sync, or scheduling changes are necessary.

## Validation and delivery

Meaningful tests cover interval joining and missing counterparts, exact stack
geometry, count independence and zeros, outer trimming/internal gaps, target
extremes, visibility parity, keyboard inspection, Table pagination, and one-card
screen composition. Run focused tests, `rtk npm run lint`, `rtk npm run check`,
`rtk npm run build`, formatting, and diff checks. Capture actual production
components at desktop and 320px widths in light/dark themes with illustrative
data. Update draft PR #184. Required human installed-extension happy-path and
edge-case smoke with screenshot/recording remains pending before review/merge.
