# Restore Combined New Problem Success

Approved scope: the user explicitly requested restoring the previously approved
all-difficulty chart alongside every new chart on 2026-10-04. This is an additive
restoration of the established design, with no new product choices pending.

## Behavior

Restore New Problem Success beside Recall vs FSRS Estimate, before the full-width
Problem Solving section. Preserve all difficulty outcome, time, comparison and
mix plots and all other Analytics panels. Retain the original
`new-problem-success` anchor; use `problem-solving` for the expanded section.

Show Hard + Good + Easy and Good + Easy simultaneously for first-recorded
problems across Easy, Medium, Hard and Unknown. Use the canonical
`problemSolving.cohorts.newProblems` counts; pool numerators and denominators,
never average difficulty percentages. This chart remains independent of the
new section's local population, view, difficulty and measure controls.

Restore both compact goal editors using the existing Settings mutation. Equal
goals share one neutral line; distinct goals have the corresponding series
colors. Use the earlier mint circles and blue diamonds, independent series
visibility, and dashed bridges across missing evidence. Hidden series do not
change dates, scale or targets.

Trim only leading/trailing buckets with no valid first outcomes; include Unknown
and measured zero, retaining internal missing buckets. Fit the scale to both
pooled rates and both saved targets, rather than the known-difficulty scale.
Reuse the existing historical plot, calendar/date helpers, keyboard/touch
inspection and exact Chart/Table view. Show counts, rates, exclusions, dates,
partial/report context and targets; clarify first recorded is not first ever
or proven unassisted solving.

## Ownership And Validation

A feature-local component pools existing supplied counts for presentation. No
backend aggregation, runtime contract, endpoint, persistence or FSRS change.
Update product, architecture, design and smoke docs to describe additive panels.

Focused tests must cover unequal denominators and Unknown, zero/gaps/trimming,
empty target controls, independent legends, shared/distinct goals, and dashboard
coexistence. Run the full check, build and formatting. Capture production
component light/dark desktop and narrow-screen proof and test controls. Human
installed-extension happy-path and edge-case smoke remains required separately.
