# FSRS Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all eight FSRS findings while preserving earned progress and delegating scheduling calculations to the supported library.

**Architecture:** Keep the existing FSRS facade and Practice, Assessment, Settings, Queue, Analytics, Backup and Platform owners. Build preservation and reproducible evidence before activating daily scheduling; evaluate local performance and optimizer feasibility separately. Runtime mutations remain serialized, validated and durably acknowledged.

**Tech Stack:** TypeScript, ts-fsrs 5.4.0/FSRS 6, SQLite WASM, Drizzle, Zod, React, TanStack Query, Vitest, WXT/Chrome MV3.

---

## Execution boundary

Source: [approved design](../specs/2026-10-03-fsrs-remediation-design.md). The written specification was approved on October 3, 2026.

This is the dependency and acceptance map for the whole remediation. The eight priority numbers retain their audit meanings; the letters below identify execution slices. Only slice A currently has a detailed executable plan. Author each subsequent slice's code-level plan against its verified predecessor before executing it. Do not represent this map as eight completed implementations or as code-level plans for every slice.

Worktree: `/Users/tobiolutimehin/.codex/worktrees/46c1/cognipace-v2`. Branch: `codex/fsrs-remediation-design`, based on `origin/main` at `dc0fc6f2`. Preserve the newer Analytics and Tracks work already present. At execution start check the branch, migration list and pinned toolchain; if upstream changes affect the frozen baseline or planned interfaces, revise the affected plan before editing code.

## File ownership map

| Owner                          | Existing files and responsibility                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FSRS integration               | `src/lib/fsrs/domain/scheduling-options.ts`, `domain/card-snapshot.ts`, `domain/review-log-snapshot.ts`, `adapter/ts-fsrs-adapter.ts`, `scheduler/review-scheduler.ts`, `index.ts`: library parameters, effective profile/card/log codecs, scheduling and pure previews. Only this boundary imports ts-fsrs.                                                                                   |
| Practice                       | `src/features/practice/data/practice-repository.ts`, `server/practice-review-workflow.ts`, `server/practice-service.ts`, `domain/practice.ts`, `domain/practice-schedule.ts`, `domain/practice-progress.ts`, `api/practice-contracts.ts`, `api/practice-serializers.ts`, `api/practice-api.ts`: durable card identity, ordered history, owned evidence and transactional review/track effects. |
| Platform                       | `src/platform/db/snapshot-upgrade.ts`, `snapshot-state.ts`, `open-snapshot.ts`, `instance.ts`, `snapshot.ts`, `schema/`, `migrations/`: bounded compatibility, appended storage metadata, staged publication and recovery.                                                                                                                                                                     |
| Runtime                        | `src/extension/background/app-db.ts`, `register-handlers.ts`, `runtime-policy.ts`, `src/extension/messaging.ts`, `src/platform/query/query-keys.ts`: composition, sender authorization, Zod parsing, durability outcomes and invalidation.                                                                                                                                                     |
| Backup                         | `src/features/backup/api/backup-contracts.ts`, `data/backup-repository.ts`, `server/backup-service.ts`: frozen legacy readers, complete preflight and compatible replacement.                                                                                                                                                                                                                  |
| Assessment and overlay         | `src/features/assessment/domain/assessment.ts`, `assessment-types.ts`, `src/features/overlay-session/hooks/use-overlay-review-actions.ts`, `use-leetcode-overlay-session.ts`, `domain/overlay-session-state.ts`, `components/modes/expanded/overlay-assessment-rail.tsx`: existing grade policy, accepted-command state, explicit Update and preview interaction.                              |
| Queue and current presentation | `src/features/queue/domain/queue.ts`, `server/queue-service.ts`, `api/queue-api.ts`, `src/features/app-shell/server/app-shell-service.ts`, `api/app-shell-contracts.ts`, `components/overview/overview-panels.tsx`: automatic overdue/due/new composition and explicit Extra Practice.                                                                                                         |
| Analytics                      | `src/features/analytics/data/analytics-repository.ts`, `server/analytics-service.ts`, `domain/review-cohorts.ts`, `historical-presentation.ts`, `current-state-presentation.ts`, `chart-data.ts`: preserved observed cohorts, provenance-aware model evidence and shared current eligibility.                                                                                                  |
| Settings and reminders         | `src/features/settings/domain/settings.ts`, `data/settings-repository.ts`, `components/sections/advanced-review-section.tsx`, `src/extension/background/due-notification.ts`, `scheduler/alarm-scheduler.ts`: saved retention, independent preferences, local-day reminders and a later user-started pilot.                                                                                    |

## Ordered slices

| Slice                                    | Audit priorities                                | Outcome and execution prerequisite                                                                                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Protect the shipped snapshot baseline | Preservation portion of 8; prerequisite for 1–3 | [Detailed plan](./2026-10-03-fsrs-phase-a-preserving-baseline.md): freeze through-0009, retain a separate recovery copy and prove populated data equality after staged upgrade/reopen. No new schema or cadence change.                   |
| B. Complete scheduling evidence          | 2; internal weights support from 7              | Effective immutable profile/card/log codecs and single-event correction operations under the existing legacy defaults. Library-normalized effective parameters are round-trippable; imported evidence is validated exactly. Depends on A. |
| C. Preserve evidence storage and restore | 2–3 and preservation portion of 8               | Additive schema, inferred legacy sequences, unknown legacy provenance, durable card identities, generation storage and backup compatibility land together. Depends on A/B.                                                                |
| D. Reliable commands and guarded Update  | 1–3                                             | Frozen accepted commands, transaction receipts, durable acknowledgement and exact attempt/revision correction work end to end through runtime and overlay. Depends on C.                                                                  |
| E. Daily scheduling and rating meaning   | 4–5, current reminder consistency from 8        | Prospective long-term profile, shared calendar eligibility, overdue/due/new automatic queue, explicit Extra Practice, preserved assessment policy and accurate Analytics evidence. Depends on D.                                          |
| F. Interval previews                     | 6                                               | Pure `repeat()` previews for both Submit and Update, using the correct authoritative contexts. Depends on D/E.                                                                                                                            |
| G. Measure and improve local growth      | Performance portion of 8                        | Packaged, end-to-end measurements and justified optimizations with reference-output parity. Record baseline measurements during foundation; optimization follows E/F.                                                                     |
| H. Evaluate personalization              | Remaining optimizer portion of 7                | A user-started local official-binding pilot, packaged-runtime proof, chronological evaluation and guarded prospective activation. Depends on trustworthy D evidence and measured G budgets.                                               |

### B: scheduling evidence acceptance

Extend the existing facade rather than adding a parallel scheduler. Resolve complete parameters with `generatorParameters()`, then clone the supported scheduler's effective parameters after normalization. Include weights, retention, maximum interval, fuzz/mode/steps, library/model version and source in deduplicated immutable evidence. Validate exact reconstruction; a different clipped model is not the imported profile.

New correction operations schedule once from captured pre-card, original event time and recorded profile. Supported native rollback is a legacy compatibility tool; success alone does not identify the last applied transition. Test structurally valid earlier logs and ambiguous tied/reordered histories, which must reject without mutation.

Focused owners/tests: `src/lib/fsrs/domain/scheduling-options.test.ts`, `scheduler/review-scheduler.test.ts`, and new codec tests colocated with their facade modules. Keep current 12h/23h short-term defaults until E; first complete evidence must not silently activate daily behavior.

### C: storage and restore acceptance

Append SQL and migration metadata, leaving every shipped file unchanged. Add per-card application order, event revision, profile/pre-card/assessment evidence, bounded receipts and persisted Practice generations behind Practice ownership. Deterministic legacy order is inferred evidence, not a claim to recover real arrival order. Keep the separate problem-wide first-assessment cohort tie policy.

Freeze the current shipped card/attempt/Practice schemas used by backup versions 1–5 before extending the current format. They currently share mutable schemas; adding required fields to that shared shape would invalidate old backups. Version the new export and normalize supported old payloads to explicit unknown/empty evidence without replaying their cards.

Preflight the complete payload before clearing: ownership/references, duplicates, state/count/date invariants including valid New zeros/null last review, log grade/time association, exact profiles, sequence/revision identity and historical receipt context. Earlier receipts remain valid after a later correction changes an attempt's current rating. Reuse loaded opaque card IDs throughout subsequent Save/Update; the canonical ID format applies only to new cards.

Reset and restore rotate the applicable fresh local generation atomically; an imported active generation never becomes the live token. Historical imported receipts are inert evidence. New Practice preparation must still run for the through-0009 source; A's taxonomy guard skips only that historical conversion, so extend the callback without bypassing evidence/generation initialization. Distinguish preflight failure, rollback, committed replacement awaiting persistence and durable replacement with a separate sync-metadata failure. A persistence retry never clears/imports again.

Tests: `src/features/backup/api/backup-contracts.test.ts`, `data/backup-repository.test.ts`, `server/backup-service.test.ts`, `src/platform/db/instance.test.ts`, the new A integration test, `src/features/practice/practice-core.integration.test.ts`, and the existing configured Gist/envelope tests. Repeat populated preservation proof with the actual appended schema, not only A's synthetic suffix. Preserve the existing envelope, dirty-local guard, overwrite confirmation and permissions.

### D: review integrity acceptance

Place receipt deduplication around the whole transaction in `src/features/practice/server/practice-review-workflow.ts`. The transaction owns card/attempt/evidence/aggregate changes, track effects and the receipt. A duplicate branch bypasses both FSRS and track effects even if Settings or the active track changed. Within the active generation, receipt lookup precedes mutable chronology/latest/revision guards; different payload under one command ID conflicts.

The overlay freezes command ID, event time and final effective rating after any AI resolution. Retry reuses that payload. Runtime returns a bounded original operation acknowledgement separately from a fresh current read. A later review may make those results differ. Capture the original saved attempt/revision in overlay state; never infer acknowledged identity from whichever attempt is latest on refetch.

Ordinary reviews assign a per-card sequence and reject backdating; equal timestamps use sequence. Update validates owner/latest/expected revision inside the transaction, uses the original context, increments revision and reconciles only the identified event's linked track credit. Preserve the draft on conflict and preserve explicit reselect followed by Update.

Saved is shown only after snapshot persistence. A committed transaction with failed flush produces persistence-pending; retry flushes the committed result and applies no second review. Preserve the last durable snapshot through failure and real restart. Do not copy a memory-only pending flag from another feature as a durable command protocol.

Tests: Practice contracts/API/core integration, overlay reducer/session hooks, background handlers, snapshot integration and Tracks repository. Required cases include lost acknowledgement, changed settings/track on retry, payload mismatch, two-tab Update, correction receipt retry after a later revision, ties/backdating, custom card IDs and restore/reset generation rejection.

### E: daily experience acceptance

Activate `enable_short_term: false`, `learning_steps: []`, `relearning_steps: []`, fuzz off and the saved user retention prospectively. Intervals come from the library. Existing raw due/card/log data stays intact until a genuine review; Update remains bound to its original profile.

Practice owns the shared date policy: automatic eligibility is the later of the raw due's local calendar date and the next local calendar date after the actual review. Use calendar arithmetic and the actual event time, never correction `updatedAt`. Add a derived eligibility date to read contracts while retaining raw `dueAt`. Apply this policy to current due labels, Queue, current Analytics signals/forecast and local-day reminder deduplication.

Automatic Queue is overdue, due today, then new, capped at the full configured Daily Goal. Future reviewed cards require explicit Extra Practice intent; adding a label while automatic reinforcement still runs is insufficient. Preserve suspension/premium filtering and distinct practiced-problem daily/streak progress, including Again. Valid legacy mastered cards can be normalized for presentation without altering track credit.

Address Analytics before activating the profile: existing historical replay uses current defaults/retention. Use recorded evidence and labeled legacy compatibility/insufficient evidence instead. Preserve observed first/repeat/effort/outcome cohorts. `getUpcomingCards()` currently returns only raw due dates; supply the state/last-review/active evidence needed for eligibility. Pass the captured report `now` to progress reads; keep historical reporting timezone separate from browser-local study dates. A low-retention future card may appear on the Retention Map while remaining correctly not due.

Assessment owns existing grade outputs. Carry its known source/reason/policy into the evidence path; preserve locks, timing, AI, automatic submission, untimed flow and Easy gate. Defaults for new Settings fields must not reset saved 75% retention, reminders or independent Analytics goals. Retention stays the main user control; model prediction is not a guaranteed coding solve rate.

Tests: existing FSRS/Practice schedule, Queue, Analytics repository/service/cohort/presentation, app-shell, Assessment and reminder suites. Add spring/autumn DST/local-midnight cases, legacy Learning/Relearning transitions, all four outputs at 90% and 75%, cross-surface equality, future low-retention visibility, full rolling cap and same-day Update behavior. Vitest currently pins `TZ: 'UTC'`; use explicit timezone setup/probes when authoring the date tests rather than assuming shell `TZ` alone overrides test configuration.

### F: preview acceptance

Practice exposes a validated read-only preview backed by facade `repeat()`. Submit previews current pre-state/active profile/preview time; authoritative Save uses final effective rating and actual accepted event time. Update previews original pre-card/time/profile and exact attempt/revision. A resulting past due date is displayed honestly; legacy compatibility is labeled.

Add a focused preview hook within Overlay if async race handling needs its own owner. Existing rating controls show concise next-study-date/day-count estimates and accessible text. Refresh after invalidation, ignore superseded responses and preserve draft selection on refetch/conflict. Selection and preview perform no write. Ordinary time passage and AI selection add no confirmation modal or reservation.

Test fixed-input preview/commit parity for all four ratings and both operations, locked choices, final AI rating, original-profile correction, stale responses and conflicts. Use Practice/runtime/overlay tests and packaged human proof.

### G: scaling acceptance

Measure 250 problems/5,000 reviews, 2,500/50,000 stress, and 10,000 events on one card. Record cold/warm p50/p95, hardware/browser/build, peak heap, DB/export/base64 sizes, recovery copies and total storage headroom. Time authoritative Save through durable acknowledgement, Queue/recent reads, Analytics, backup validation, restore and reopen; a `next()` microbenchmark does not establish capacity.

Use deterministic fixtures under `src/testing` and the existing `src/extension/background/dev-smoke-service.ts` path for packaged measurements. Optimize only measured bottlenecks within the existing Practice/Analytics/Platform owners. Bounded reads, shared ordered context and append-time aggregates are candidates; correction/reset repair must match the full reference calculation. Keep complete pre-window history and approved first/repeat cohort semantics. Current permissions and quota remain the boundary; do not invent a capacity guarantee or add `unlimitedStorage`.

### H: personalization acceptance

The existing scheduler already adapts each card's stability/difficulty. Trained weights are a separate evaluated capability. Use the actual supported official-binding release/API through the FSRS boundary; confirm current docs and packaged assets at execution time.

A user-started dashboard worker receives validated canonical history and a fingerprint, using explicit day-gap conversion and the supported daily training mode. Work runs outside the mutation queue with progress/cancellation. Prove packaged MV3 worker/WASM startup, isolation requirements, responsiveness, memory/time budgets and cancel/close/recovery; current WASM CSP alone is insufficient evidence.

Compare the candidate chronologically against defaults/incumbent on held-out history. Readiness follows usable evidence, not an invented universal review-count threshold. Activation is a short guarded mutation tied to expected history/profile versions; activation/reversion is prospective. Failure, cancellation, stale output or insufficient evidence leaves the incumbent usable. If local feasibility fails, document the result; no backend/permission workaround is approved.

## Capability traceability

| Library capability                             | Execution use                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `next()`                                       | Keep the authoritative single-review save/correction path in B/D/E.                                                                        |
| `get_retrievability()`                         | Retain numeric model estimates for display/ranking; distinguish them from calendar eligibility in E.                                       |
| `repeat()`                                     | Pure four-rating previews in F.                                                                                                            |
| `rollback()`                                   | Guarded legacy compatibility in B/D; captured pre-card is preferred for new evidence.                                                      |
| `generatorParameters()` / effective parameters | Complete reproducible profiles in B/C.                                                                                                     |
| `w`                                            | Validated internal profile support in B/C; evaluated training in H.                                                                        |
| `maximum_interval`                             | Record in B/C; no exposed strict-cap promise or expert editor.                                                                             |
| `reschedule()` / `forget()`                    | Separate administrative/product semantics; bulk reconstruction and a history-preserving reset action are outside the approved remediation. |

## Completion and validation

- [ ] Execute A from its detailed plan and retain exact passing/failed command evidence.
- [ ] Produce B's complete code-level plan against A's verified baseline, then execute B.
- [ ] Produce and execute C with the real appended migration and frozen supported backup readers.
- [ ] Produce and execute D end to end, including durability, conflict and restart evidence.
- [ ] Produce and execute E with historical compatibility and every current due consumer ready before profile activation.
- [ ] Produce and execute F with both preview contexts and packaged interaction proof.
- [ ] Produce and execute G with measured budgets and output-equality evidence.
- [ ] Produce and execute H with packaged feasibility/evaluation evidence before exposing activation.

Each slice's detailed plan uses `docs/agent-governance.md#validation-selection`, focused tests before required full checks, exact run/skipped commands, and current authority-doc updates when behavior ships. Schema changes require `rtk npm run db:generate` and `rtk npm run db:check`; runtime/surface changes require `rtk npm run lint`, `rtk npm run check` and `rtk npm run build`. Packaging changes also require `rtk npm run zip` and applicable artifact checks. Human installed-extension happy/edge smoke with screenshot/recording proof is required before behavior-changing PR review/merge.

This planning pass changes Markdown only. App tests/builds, migrations, performance measurements, optimizer feasibility and human smoke are unrun. The first executable slice is A; the other acceptance sections are future execution boundaries, not claims of completed code-level planning.

Planning checks use the temporary official Prettier runtime because local dependencies are absent and historical planning files are normally ignored:

```sh
rtk proxy node /private/tmp/cognipace-audit-prettier/package/bin/prettier.cjs --ignore-path /dev/null --write docs/superpowers/specs/2026-10-03-fsrs-remediation-design.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-03-fsrs-phase-a-preserving-baseline.md docs/superpowers/README.md
rtk proxy node /private/tmp/cognipace-audit-prettier/package/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/specs/2026-10-03-fsrs-remediation-design.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-03-fsrs-phase-a-preserving-baseline.md docs/superpowers/README.md
rtk git diff --check
rtk git diff --cached --check
```

Skipped in this planning pass: `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk npm run db:check`, and the focused test commands in A because application code is unchanged and dependencies are absent. `rtk npm run db:generate` is skipped because no schema changes are implemented; `rtk npm run zip` is skipped because artifact behavior is unchanged. Human smoke and performance/optimizer measurements remain unrun implementation work.
