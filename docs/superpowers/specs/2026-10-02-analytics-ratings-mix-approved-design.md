# Approved Ratings Mix Design

Follow-up: the user's approved empty-edge trimming now applies to all four
historical charts. The [original adjustment](2026-10-02-analytics-layout-polish-design.md#approved-follow-up-empty-edge-trimming)
covers Recall, Practice Rhythm, and Ratings Mix; the latest
[Memory Strength adjustment](2026-10-02-analytics-layout-polish-design.md#approved-follow-up-memory-strength-empty-edges)
supersedes Memory's full-window exception. The exact frozen artifacts below
remain unchanged design history.

Status: implemented locally with the four historical charts on 2026-10-02.
Automated checks and component proof passed; human installed-extension smoke
remains pending before PR review or merge. The user requested full-height gray striped bars for empty periods
and contrasting percentage labels inside populated bars, then authorized
implementation before the remaining panels.

## Frozen Snapshot

- [Exact approved fragment](assets/2026-10-02-analytics-ratings-mix/approved-fragment.html)
- [Wide preview](assets/2026-10-02-analytics-ratings-mix/approved-preview.jpg)
- [Card preview](assets/2026-10-02-analytics-ratings-mix/approved-card-preview.jpg)
- [Checksums](assets/2026-10-02-analytics-ratings-mix/manifest.json)

These are byte-for-byte copies of the approved source and screenshots. Do not
format or overwrite them. The source contains its illustrative ten intervals,
counts, exact shares, summary, and comparison values; it contains no live
extension data.

## Approved Treatment

Retain every supplied bucket, including leading empty periods. A bucket with
zero valid ratings gets a neutral full-height diagonal hatch and explicit
unavailable composition in inspection and table mode. Gray is a missing-data
key, not a fifth rating. A zero category inside a populated period stays zero
height.

Again, Hard, Good, and Easy segments retain their exact share geometry. Center
rounded whole percentages in segments at readable 12px size with contrasting
text. Measure available width and height and omit labels that cannot fit.
Inspection and table mode retain exact counts and more precise shares; rounded
labels can total 99% or 101%. Do not shrink type or distort proportions to fit.

The illustrative 39-rating sample has 18 Hard + Again reviews. Keep production
summary and prior-period comparison gates. A wholly empty selected period keeps
its existing empty state. The x-axis uses sparse calendar dates; inspection
retains full endpoints, grouping, report time, evidence, and partial-period
context. The exact-value table retains seven-row pagination.

Implementation and validation are tracked in the
[phase plan](../plans/2026-10-02-analytics-historical-charts.md) and
[implementation handoff](../handoffs/2026-10-02-analytics-historical-charts.md).

## Archive Validation

The copy operation verified byte equality of all three artifacts against their
thread-local originals and recorded SHA-256 and byte counts. Frozen artifacts
are kept outside formatter discovery. Production component tests and rendering
proof are recorded separately in the implementation handoff; this archive is a
design recovery checkpoint.
