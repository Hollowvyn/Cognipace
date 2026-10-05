# FSRS Phase B: Complete Scheduling Evidence Implementation Plan

Executed with `superpowers:subagent-driven-development`, test-first implementation and independent specification/quality reviews. The original detailed instructions remain in [planning commit `959c8ecd`](https://github.com/Hollowvyn/Cognipace/blob/959c8ecd/docs/superpowers/plans/2026-10-04-fsrs-phase-b-scheduling-evidence.md); source and tests now own implementation details.

**Goal:** Make the existing FSRS facade produce exact, immutable scheduling evidence and safe single-event correction calculations while retaining the shipped scheduling behavior.

**Architecture:** Keep native scheduling, parameter normalization and rollback inside `src/lib/fsrs/adapter`; expose feature-facing operations through the existing facade. Store immutable evidence as detached values with ISO dates, reconstruct supported profiles exactly, and separate captured corrections from explicitly estimated legacy corrections. Phase C owns persistence and deduplication; D owns transactional Save/Update integration.

**Tech Stack:** TypeScript, installed ts-fsrs 5.4.0/FSRS-6.0, Vitest, existing SQLite WASM integration tests and WXT. No dependency or permission expansion.

---

## Approval, predecessor and scope

Source: [approved design](../specs/2026-10-03-fsrs-remediation-design.md), especially priorities 2 and 4 and the legacy correction policy. The [execution map](./2026-10-03-fsrs-remediation.md) assigns B audit priority 2 and the internal weights foundation from 7. The user approved moving to this plan after completing A.

Phase A merged in [PR #190](https://github.com/Hollowvyn/Cognipace/pull/190) as `92ba67d5` on October 4, 2026. This plan is based on that `origin/main` commit on `codex/fsrs-phase-b-scheduling-evidence`, reusing the clean managed worktree. Historical Phase A proof remains in its handoff; merging does not manufacture additional smoke or screenshots.

Execution status: **all five tasks implemented; independent reviews and automated/build validation passed; human compatibility proof pending**. Execution rebased the planning commit onto `origin/main` at `bbb3b5d8` (structured LeetCode submission analysis, PR #194). The unchanged upstream FSRS module passed the 75-test baseline again. See the [implementation handoff](../handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md) for exact commands, review repairs and pending human proof.

Read `README.md`, `docs/product.md`'s Practice/Queue sections, `docs/architecture.md`'s FSRS and runtime ownership sections, `docs/testing.md`, `CONTRIBUTING.md`, `docs/agent-governance.md` and the planning index before execution. Use the pinned Node 24.20.0/npm 11.19.0; dependencies and generated WXT types are present in this worktree. Fetch and check the working tree before execution; preserve unrelated work and revise this plan if relevant upstream contracts change.

B builds pure library operations. Keep the current `12h`/`23h` learning steps, `23h` relearning step, short-term mode, retention input and disabled fuzz. Existing Save/Update callers remain wired to their current APIs. The daily profile and calendar/queue changes belong to E; previews to F; training to H. Do not change SQL, schema, stored due dates, history, backup format, runtime messages, assessment locks, track credit or sync.

The profile's `source` describes **weight provenance**: `default` means effective upstream default weights for the recorded mode and steps; `custom` means explicitly provided weights after supported normalization. A legacy correction's accepted recipe is known, but its original historical profile remains unknown. C must preserve that distinction instead of assigning fabricated original provenance.

## Library facts that constrain the implementation

Context7 resolved `/open-spaced-repetition/ts-fsrs`; current parameter, scheduler and serialization documentation was fetched separately. Installed declarations, source and runtime probes verified the exact 5.4.0 behavior:

- `FSRSVersion` is `v5.4.0 using FSRS-6.0`. Record library and model versions separately; reject unsupported recorded versions instead of silently changing algorithms.
- `generatorParameters()` fills defaults and migrates supported input weights, but scheduler construction can further clip them. Capture the **final** scheduler parameters. In short-term mode, 17/19-weight inputs generated a zero at index 19, then scheduler construction changed it to `0.01`.
- Explicit generation before construction can also change omitted default weights with multiple relearning steps. Preserve the existing public scheduler construction; resolve new profiles separately into reconstructible effective values, without switching existing callers.
- The effective configuration has seven fields: retention, maximum interval, weights, fuzz, short-term mode and both step arrays. The scheduler exposes them through a Proxy; `structuredClone(scheduler.parameters)` throws. Copy the fields and three arrays explicitly.
- `checkParameters()` rejects unsupported lengths and nonfinite values; parameter generation alone can silently fall back. New configured input supports the library's 17/19/21 migration, while recorded effective profiles require 21 exact weights.
- Native rollback accepts structurally valid earlier logs. Its success does not prove latest identity. A reviewed-card log's `due` stores the prior review instant, and rollback cannot recover that card's original raw due date.
- Same-day reordered application is accepted by native scheduling because elapsed days can still be zero. Sorting those events by review time can break the log chain. Legacy ambiguity must reject before rollback.
- Freezing a `Date` does not disable `setTime()`. Immutable evidence uses ISO strings; decoding returns fresh Dates.

These are API constraints, not a capacity guarantee or permission to implement alternate memory equations. Keep `maximum_interval` as recorded internal configuration; the upstream grade-order behavior does not establish a strict user-facing cap.

## File map and dependency direction

| File                                                                                 | Responsibility                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/lib/fsrs/domain/scheduling-options.ts` and its test                             | Optional internal weights/maximum interval; shipped defaults retained.                                 |
| New `src/lib/fsrs/domain/scheduler-profile.ts` and its test                          | Complete effective value shape, version/source contract and canonical detached representation.         |
| New `src/lib/fsrs/domain/snapshot-validation.ts`                                     | Small shared value/date predicates used by the three codecs.                                           |
| `src/lib/fsrs/domain/card-snapshot.ts` and its test                                  | Centralized existing card validation and ISO-value serialization with fresh Date decoding.             |
| `src/lib/fsrs/domain/review-log-snapshot.ts` and its test                            | Validated, detached log codec retaining native log semantics.                                          |
| `src/lib/fsrs/adapter/ts-fsrs-adapter.ts`                                            | Native parameter capture/exact reconstruction, profile scheduling and inverse-log rollback conversion. |
| `src/lib/fsrs/scheduler/review-scheduler.ts` and its test                            | Public profile wrappers and forwarding new options through projections.                                |
| New `src/lib/fsrs/scheduler/review-correction.ts` and its test                       | Immutable captured context, exact replacement and guarded legacy compatibility.                        |
| `src/lib/fsrs/index.ts` and its test                                                 | Stable public exports; raw adapter conversions remain private.                                         |
| `docs/architecture.md`, execution map, planning index and new implementation handoff | Shipped capabilities, phase status, exact validation and affected human smoke.                         |

Domain value parsing must not import the native adapter. The adapter imports domain types/parsers, and scheduler modules compose those operations; this keeps the existing integration boundary without a circular dependency. Features continue to import only `@/lib/fsrs`. Canonical profile serialization provides C's deduplication basis; B adds no registry, hashing service or persisted IDs.

## Executed tasks

Each implementation task received a fresh specification review followed by a
quality review. The original detailed plan remains in Git history; the links
below identify the maintained code and regression tests.

### 1. Complete effective scheduler profiles

- [x] Extend internal options with validated 17/19/21 input weights and a positive
      safe-integer maximum interval; retain every shipped default.
- [x] Record all seven final effective parameters, library/model versions and
      weight provenance as detached frozen values. Effective imports require exactly
      21 weights, supported versions and exact reconstruction, including signed-zero
      comparisons. Serialization uses canonical field order.
- [x] Preserve existing direct scheduler construction, replay, retrievability and
      projection behavior. Prove nondefault weights reach projections.

Implementation: [scheduling options](../../../src/lib/fsrs/domain/scheduling-options.ts),
[profile shape](../../../src/lib/fsrs/domain/scheduler-profile.ts),
[native adapter](../../../src/lib/fsrs/adapter/ts-fsrs-adapter.ts), and
[public scheduler](../../../src/lib/fsrs/scheduler/review-scheduler.ts).
Tests: [options](../../../src/lib/fsrs/domain/scheduling-options.test.ts) and
[profiles](../../../src/lib/fsrs/domain/scheduler-profile.test.ts).
Commits: `351c7a43`, `7d32c592`.

### 2. Detached card and review-log codecs

- [x] Centralize native-card validation with valid state/date, finite nonnegative
      memory values, safe nonnegative counters and `lapses <= reps`. New zeros and
      null last review remain valid.
- [x] Copy only the card's ten fields to frozen ISO evidence. Decode fresh Dates
      and strip caller metadata. Copy/validate the stored log's ten fields while
      retaining native due/prior-review semantics.
- [x] Keep raw validation/adapter helpers private and the existing feature-facing
      card/log shapes compatible for valid native history.

Implementation/tests: [cards](../../../src/lib/fsrs/domain/card-snapshot.ts),
[card tests](../../../src/lib/fsrs/domain/card-snapshot.test.ts),
[logs](../../../src/lib/fsrs/domain/review-log-snapshot.ts),
[log tests](../../../src/lib/fsrs/domain/review-log-snapshot.test.ts), and
[shared value predicates](../../../src/lib/fsrs/domain/snapshot-validation.ts).
Commit: `74f1cc1a`.

### 3. Captured single-event correction

- [x] Capture the original immutable pre-card, canonical event time and validated
      profile; reject invalid/backdated times while allowing a trustworthy equal-time
      event.
- [x] Replace one rating by scheduling once from those original inputs. Never use
      the saved post-card as the correction's pre-card or compound review counts.
- [x] Compare full native cards/logs for all four grades, custom weights/steps,
      changed active retention, internal long-term/empty-step/fuzz configurations and
      repeated corrections. Mutating input or returned Dates cannot alter evidence.

Implementation: [scheduler](../../../src/lib/fsrs/scheduler/review-scheduler.ts)
and [correction](../../../src/lib/fsrs/scheduler/review-correction.ts).
Tests: [correction oracles](../../../src/lib/fsrs/scheduler/review-correction.test.ts).
Commit: `330d04fa`.

### 4. Guarded legacy correction

- [x] Validate a complete dense supplied history (`length === reps`), every
      grade/time association, first New/later non-New states, strict chronology and
      the previous-review log-due chain. Never sort or replay legacy history.
- [x] Match the latest card's last review, elapsed value and observed Review/Again
      lapse count before rollback.
- [x] Use native rollback, then diagnose the original grade against seven saved
      memory/counter/state invariants. Exclude raw due/scheduled days because original
      retention and prior raw due are unknown. Apply one replacement at the original
      event time under the explicit existing recipe and captured correction retention.
- [x] Return `legacy-derived`, the known correction profile and
      `originalProfile: null`; never fabricate a captured original context.
- [x] Reject earlier logs accepted by native rollback, tied/reordered histories
      (including a sorted reorder), incomplete/sparse or inconsistent evidence
      without mutation. Prove New/Learning/Relearning transitions across all grades.

Implementation: [private native rollback](../../../src/lib/fsrs/adapter/ts-fsrs-adapter.ts)
and [legacy correction](../../../src/lib/fsrs/scheduler/review-correction.ts).
Tests: [native correction oracles and guards](../../../src/lib/fsrs/scheduler/review-correction.test.ts).
Commit: `340d4bb5`; whole-phase review repair `1b450ec`, fixture typing `40cad16`.

### 5. Public boundary and compatibility handoff

- [x] Add only the three runtime operations and two correction types to the public
      facade, retain every previous export and keep native rollback/profile helpers
      private.
- [x] Document profiles and pure corrections in current architecture without
      changing its existing due/queue semantics or claiming new Practice wiring.
- [x] Run the existing-consumer regression selection: 270 tests before the sparse
      guard repair and 272 after final source changes.
- [x] Finish fresh full lint/check, formatting and the extension build; exact
      commands and results are recorded in the handoff.
- [ ] Human happy-path and edge-case installed-extension smoke with visual proof
      before PR review or merge. This remains a human gate even after automated
      implementation is complete.

Implementation/tests: [facade](../../../src/lib/fsrs/index.ts),
[export contract](../../../src/lib/fsrs/index.test.ts), and
[architecture](../../architecture.md#fsrs-scheduling-and-queue-semantics).
Commit: `88626dd5`. Exact test-first commands, counts and subsequent review fixes
are in the [handoff](../handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md).

## Final acceptance and remaining work

The implemented boundary captures complete reconstructible profiles, immutable
card/log/context evidence, native single-event corrections and conservative
legacy estimates. Existing Save/Update remains on its previous consumer path.
Valid native history is preserved; stricter validators reject malformed imported
counters/logs. Complete backup preflight before replacement is C.

C owns additive evidence storage, supported legacy backup readers and restore.
D owns identity/revision guards, receipts, command durability and the overlay
Update integration. E owns prospective daily scheduling and shared calendar
eligibility; F owns native interval previews. G/H retain their separate measured
scaling and evaluated personalization work. No schema, stored schedule rewrite,
queue policy, backup version, runtime command or permission change lands here.

Automated checks do not prove human installed-extension behavior, end-to-end
command durability, daily eligibility, packaged scaling or optimizer readiness.
The [human checklist](../handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md#human-compatibility-smoke)
is prepared; required screenshots or a recording remain outstanding.

## Planning evidence

The original planning pass fetched three scoped Context7 queries and checked the
installed 5.4.0 declarations/source. Read-only probes and the fresh baseline
validated normalization, rollback and immutability premises. An exploratory
`structuredClone` of the parameter Proxy failed with `DataCloneError`; explicit
field copying passed. These premises informed committed native-oracle tests and
are recorded with exact commands in the handoff.

Primary references: [parameter configuration](https://github.com/open-spaced-repetition/ts-fsrs/blob/v5.4.0/packages/fsrs/src/default.ts),
[native scheduler](https://github.com/open-spaced-repetition/ts-fsrs/blob/v5.4.0/packages/fsrs/src/fsrs.ts),
and [algorithm normalization](https://github.com/open-spaced-repetition/ts-fsrs/blob/v5.4.0/packages/fsrs/src/algorithm.ts).
