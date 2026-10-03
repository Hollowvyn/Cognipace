# Analytics Chart Targets

Status: approved by the user on 2026-10-02; implemented with automated and
component-fixture proof. Human installed-extension smoke remains pending before
PR review or merge. See the [implementation handoff](../handoffs/2026-10-02-analytics-chart-targets.md).

## Purpose

Replace the first historical chart's scheduling-derived retention reference
with an independent personal Target Recall, and add a personal Target Review
Success to Practice Rhythm. Edit and save these small preferences directly
inside the charts.

## Metric Meaning

- Recall counts Hard + Good + Easy among the first chart's eligible paired
  reviews. Its denominator and FSRS comparison population remain unchanged.
- Review Success counts Good + Easy divided by all valid ratings in Practice
  Rhythm. Its numerator and denominator remain unchanged.
- For the same review population, measured Review Success cannot exceed
  measured Recall. The first and third charts can use different eligible
  populations, so their displayed observations must not be constrained against
  each other.
- Preserve the user's requested goal rule: Target Review Success must be
  greater than or equal to Target Recall. This is an intentionally stricter
  aspiration, not a constraint on measured results.
- FSRS target retention remains the scheduling and Retention Map setting. The
  new personal chart goals do not affect cards, due dates, reconstruction,
  retention classification, readiness, or practice outcomes.

## Small Editor

The upper-right area above each relevant plot has a native button: **Target
Recall 90%** in the first chart and **Target Review Success 90%** in Practice
Rhythm. Use the existing target color and a subtle dashed-line key. Replace
Recall's generic target caption with the explicit editable caption; avoid a
duplicate caption or permanent bottom detail row.

User-directed refinement on 2026-10-02 replaces the original two-field panel
with a smaller single-target editor in each chart. Clicking the button opens
one percentage input for that chart, Save, and Cancel. Focus that input. Recall
shows Hard + Good + Easy and its maximum allowed by the saved Review Success
goal; Practice shows Good + Easy and its minimum allowed by the saved Recall
goal. The editor is collapsed by default and remains available with sparse or
empty chart data. Native inputs support keyboard and touch. Enter submits;
Escape cancels and returns focus to the trigger.

Use whole percentages from 0 through 100 in one-point steps. Both independent
goals default to 90%; do not copy the user's live FSRS retention value into
them. Explain each rating combination in the editor. If Success is below
Recall, show **Review Success target must be at least your Recall target**
and prevent saving. Do not silently alter the other goal.

Saving sends only the edited goal as a partial analytics patch. Settings merges
it with the latest persisted counterpart and validates/writes the pair
atomically. A refreshed counterpart updates the editor's hint and validation
without replacing the active draft. Show a saving state and prevent duplicate
submissions. Update chart goals from the successful saved result; a failed
save retains the prior pair and leaves the draft open with a useful error.
Cancel changes neither persisted values nor reference lines. Reopening or
reloading uses the saved pair. Range changes do not reset targets.

## Lines And Scales

Recall's dashed reference uses the saved Target Recall and an explicit name in
its tooltip and accessible description. Its FSRS estimate series remains the
same model estimate. Practice gets a matching dashed Target Review Success
reference using the right percentage axis, never the review-count axis.
Include the respective goal in each percentage-scale fit so it stays visible,
including at 0% or 100%. Editing a goal may change that percentage scale but
must not change the count scale, rows, dates, gaps, values, or trim rules.

## Saved Preferences And Ownership

Recommended approach: add a defaulted `analytics` goal pair to the existing
Settings feature, represented internally as fractions. Reuse its validated
patch, deep merge, repository, runtime mutation, and query invalidation path.
Analytics reads the pair into its existing serialized chart views. No new
table, migration, Chrome permission, or settings page section is needed.

These are normal saved preferences: existing backup export/restore and optional
configured Gist sync carry them with the other settings. Approving this design
explicitly includes those two goal fields in the existing settings payload;
it does not add a new sync mechanism. Missing fields in existing settings and
older backups default safely. A malformed analytics subsection falls back only
to analytics defaults rather than resetting unrelated settings. Settings Save
preserves the pair; Reset Defaults resets it with the other preferences.

A device-only store would exclude the goals from backup/sync but introduce a
separate persistence path. Keeping only session state would be smaller but
would lose targets on reload. The existing Settings path best matches the
requested saved preference and established ownership.

## Verification And Delivery

Before implementation, save an approved spec and phase-sized plan. Continue
the existing Analytics draft PR after approval. Update current authority docs
to distinguish read-only analytics calculations from editable chart goals.

Use focused tests for defaults and compatibility, pair validation and atomic
updates, failed saves, Settings preservation/reset, reload behavior, backup
round-trip, runtime validation/invalidation, target-aware scales, references
on the correct axes, and unchanged scheduling/Retention Map outputs. Capture
the actual components in wide/narrow light/dark states, including the editor,
invalid pair, and saved goals at scale boundaries.

Run focused tests before `rtk npm run lint`, `rtk npm run check`,
`rtk npm run build`, `rtk npm run format`, explicit touched-Markdown Prettier,
and diff whitespace checks. Record exact runs and skips in the handoff.
No database schema generation is required unless the approved implementation
changes schema. Packaging remains out of scope. Human installed-extension
happy-path and edge-case smoke with proof remains required before review or
merge; keep the PR draft while that is pending.

## Design Review Record

At proposal time, read-only review found no substantive contradictions or
ownership/compatibility issues. That docs-only checkpoint changed no application
source or persisted data.

Passed for this proposed design:

```sh
rtk proxy npx prettier --ignore-path /dev/null --write docs/superpowers/specs/2026-10-02-analytics-chart-targets-design.md
rtk proxy npx prettier --ignore-path /dev/null --check docs/superpowers/specs/2026-10-02-analytics-chart-targets-design.md
rtk proxy git diff --check
```

Skipped `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, and
`rtk npm run format` for this docs-only proposal; explicit formatting checks
cover this historically excluded Markdown path. Skipped `rtk npm run db:check`,
`rtk npm run db:generate`, and `rtk npm run zip` because no database, schema, or
packaging changes were implemented at that checkpoint. The subsequent
implementation validation is recorded in the handoff; human extension smoke
proof remains pending.

Compact-editor refinement implementation is tracked in the [follow-up plan](../plans/2026-10-02-analytics-compact-target-editors.md). The original paired-editor proof remains archived in its handoff and Git history.
