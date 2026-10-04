# FSRS remediation and daily coding review design

Date: October 3, 2026.

Status: the three design sections and consolidated written specification are approved. The user approved the written specification on October 3, 2026 ("This is cool beans"). Phase A preservation is implemented and automated checks pass; human installed-extension proof remains pending before PR review or merge. Phases B–H remain unimplemented. See the [Phase A handoff](../handoffs/2026-10-03-fsrs-phase-a-preservation.md) for exact evidence and limits.

Baseline: `codex/fsrs-remediation-design`, based on `origin/main` at `dc0fc6f2`. The original audit examined `7cccd2d7`; the newer Analytics and Tracks work is preserved. The lockfile currently resolves ts-fsrs 5.4.0, using FSRS 6.

Phase A execution rebased the planning commits onto `origin/main` at `b2d9291f`, preserving the newer AI provider connection changes. The frozen through-0009 SQL fingerprint stayed `1144ce07`.

## Purpose and authority

Make saved reviews reliable and reproducible, align coding practice with daily sessions, retain the library's scheduling calculations, and prepare for measured local growth and evaluated personalization.

This is one master design covering eight audit priorities. Phase-sized plans must follow it. Current behavior remains governed by `docs/product.md`, architecture by `docs/architecture.md`, validation by `docs/agent-governance.md` and `docs/testing.md`, and interaction by `design.md`. Those authority documents are updated alongside implemented behavior rather than describing this specification as already shipped.

| Priority                          | Remedy                                                                                             | Required outcome                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Reliable saves and corrections | Stable commands, transactional receipts, exact attempt/revision guards and durable acknowledgement | Retries apply once; stale Update cannot edit another review.                     |
| 2. Reproducible scheduling        | Immutable effective profiles, version/source evidence and captured pre-review cards                | A correction replaces its original event without silently migrating its history. |
| 3. Consistent chronology          | Per-card application sequence and deterministic, labeled legacy ordering                           | Writes, latest selection, replay and optimizer export agree.                     |
| 4. Daily scheduling and queue     | Upstream long-term scheduler, local-day eligibility and explicit due/new/extra policy              | Automatic practice does not reoffer a card on its review day.                    |
| 5. Rating meaning                 | Preserve assessment rules and record their known source/reason/policy                              | Predictions are explainable estimates from product ratings.                      |
| 6. Interval previews              | Pure library-backed previews for Submit and Update                                                 | Identical inputs produce the same preview and saved schedule.                    |
| 7. Personalization                | Validated versioned weights and an evaluated local optimizer pilot                                 | Defaults remain usable; candidates require runtime and prediction evidence.      |
| 8. Preservation and local scaling | Strict restore validation, supported preserving upgrades and measured performance work             | Existing history/progress survive; growth claims have measured support.          |

## Accepted product boundaries

- Days are the smallest automatic scheduling unit. Exact internal timestamps remain available.
- Target retention remains the main user-facing FSRS setting. Preserve the supported 70–97% range, 90% fresh-install default, and every user's existing saved value.
- Preserve assessment locks, timing rules, AI recommendation policy, automatic submission, solve-time handling and the Easy gate. Existing locked assessments remain product decisions.
- Preserve rating reselect followed by explicit Update. Reselecting changes the draft; Update corrects the identified saved event.
- Automatic recommendations prioritize overdue, then due today, then new problems. Future reviewed problems belong to explicit Extra Practice.
- Preserve Daily Goal: progress counts distinct practiced problems per local day; the rolling recommendation list is capped at the full configured goal. An unsuccessful Again attempt still counts as practice.
- A finite shrinking daily session, completion checkpoint, due-only review deck and Review more/Load more are a separate follow-up. They are not included here.
- Fuzz remains disabled in this profile, preserving current behavior. Whole-day scheduling does not require that choice; a later workload-spreading evaluation can revisit it when needed.
- Keep local MV3 ownership and the existing permissions. Account/backend services, expanded sync, raw expert scheduler settings, automatic background training, bulk rescheduling and a new history-preserving reset workflow are outside this scope.

## Existing history and progress preservation

Preservation is a release acceptance requirement, not an assertion that an unimplemented migration has no risk.

During upgrade, retain all existing values for:

- Review IDs, problem/card links, ratings, mode, review timestamps, correctness, solve times, structured logs, notes and existing creation/update timestamps.
- Card IDs, raw due timestamps, stability, difficulty, state, learning steps, elapsed/scheduled days, repetitions, lapses and last-review time.
- Practice aggregates, attempt/solved counts, best/last solve time, logs and explicit suspension.
- Track memberships/order, owned completion records, linked review IDs, external-progress preferences and the active track/session.
- Existing settings, including retention, Daily Goal, assessment/timing preferences, reminder preferences and independent Analytics goals.

Only new evidence fields are added. Legacy profile/pre-card/assessment provenance remains unknown where it cannot be established. Add deterministic legacy sequence metadata without rewriting original review times, ratings or logs. Do not deduplicate historical attempts, replay current cards, reschedule the collection, or reconcile track credit during migration.

Preserve opaque imported card IDs. Practice reuses a loaded card's durable ID for updates, attempts, sequences and receipts; the canonical ID format is for newly created cards. No bulk ID rewrite is required.

Daily completion and streaks continue using distinct problem slugs grouped by the original local review date. Track completion remains independent of FSRS card state. An explicit later rating correction may reconcile its own linked track credit through the existing workflow; the upgrade itself does not change credit.

The two primary changes to existing schedule presentation are automatic eligibility/recommendation composition and intervals calculated by future genuine reviews. Existing Learning/Relearning cards keep their saved memory and due timestamps until that next review. Some due indicators change because eligibility receives the next-study-day floor, while raw due values remain intact. Added previews, evidence labels, conflict handling and any later pilot interface are described separately below.

Observed historical Analytics retains its current first-assessment, repeat-rating, effort and outcome cohort definitions. Changing wrapper defaults must not replay old events as though the new daily profile had always existed. Use recorded card/log evidence and explicit legacy compatibility reconstruction; label unsupported predictions as legacy estimates or insufficient evidence. Unknown old retention or weights must not be invented. Model-derived estimates can gain more accurate provenance without discarding the raw history or changing earned progress.

Settings migration defaults newly added fields independently. It must not trigger a whole-settings fallback that resets a valid saved retention or unrelated preferences.

## Ownership and architecture

Keep `entrypoints -> app -> features -> platform/lib/components`.

| Owner                | Responsibility                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/fsrs`       | Sole ts-fsrs import boundary; card/log/profile codecs, scheduling, previews, retrievability and validated compatibility operations |
| Practice             | Authoritative review transactions, identities, sequences/revisions, receipts, scheduling evidence and derived practice aggregates  |
| Assessment           | Existing grading rules and known assessment context                                                                                |
| Settings             | User preferences and active profile selection metadata                                                                             |
| Queue                | Due/new/Extra Practice recommendation composition                                                                                  |
| Analytics            | Reporting, current model signals and shared ordered reconstruction context                                                         |
| Backup               | Complete-payload preflight and replacement through its existing owner                                                              |
| Platform             | Snapshot lifecycle, staged upgrades, durable publication and recovery                                                              |
| Extension background | Sender authorization, Zod-validated runtime commands, serialization and post-persistence invalidation                              |
| Overlay/dashboard    | Draft interaction, previews, saved results and optional worker progress                                                            |

Extend these owners with small persisted evidence records. A generic command bus, outbox or independent model-management subsystem is unnecessary.

## Review commands and durability: priorities 1–3

### Stable accepted commands

Generate a stable command ID for a new save or Update and freeze its accepted payload, including event time and final effective rating. Keep it through acknowledgement or persistence retry. Editing a draft after a settled operation creates a new command; retries do not regenerate IDs or timestamps.

Practice looks up the compact receipt before checking mutable latest-event/chronology guards or invoking FSRS. An identical accepted payload returns the recorded operation result. Reusing an ID with a different payload conflicts. Retain a payload fingerprint, operation/target identity and bounded result evidence; never store a growing full-history response in each receipt.

Reset/restore must invalidate commands from the replaced practice generation so an old pending save cannot resurrect cleared history. Use a persisted Practice generation guard for those lifecycle transitions and rotate the applicable local token atomically with replacement. Restoring a backup always issues a fresh local token; it never reinstates the backup's former active token. Deduplication within the active generation still precedes mutable review guards. Imported historical receipts retain their original evidence; they do not turn prior-generation commands into new writes.

Commit the attempt/card/evidence/aggregate/track effects and receipt atomically. Return Saved only after the resulting database snapshot is durable. If commit succeeds but flush fails, return persistence pending and retry publication of committed state; do not schedule again. Preserve the last durable snapshot and avoid an invalidation that claims a pending operation is durable.

A repeated acknowledgement identifies the original attempt/result, even if subsequent reviews exist. Fetch current state separately so an old receipt is not presented as the latest card.

### Exact correction identity

Update carries the original saved attempt ID and expected revision. Practice validates ownership, latest status and revision within the transaction. A newer review or concurrent correction conflicts and preserves the draft. Update never chooses whichever attempt happens to be latest without matching the submitted target.

For new-format evidence, schedule the replacement from the captured pre-review card at the original event time under its recorded effective profile. Preserve attempt ID, sequence, review time, solve time unless explicitly edited, and existing completion-count semantics. Increment correction revision; reconcile only that event's linked credit. Capture the corrected result and profile provenance without rewriting other events.

The library's 5.4.0 rollback can reconstruct relevant memory fields from a matching log, but does not restore every original due instant. Captured pre-card evidence is the preferred path for new events.

For a latest legacy event, allow a compatibility correction only when saved-card evidence and legacy ordering uniquely agree that its valid matching log belongs to the actual last applied transition. A successful native rollback alone does not verify that identity. Ambiguous tied/reordered histories reject compatibility correction without changing data. For verified cases, use the supported rollback operation, existing legacy scheduler recipe with the user's saved retention captured at command acceptance, original event time and recovered pre-review memory. Label this result and its preview as legacy-derived; it does not establish the unknown original profile. Preserve the existing event and avoid full-history rewriting. Missing/inconsistent legacy evidence rejects the correction with an explanation and intact draft/history; a subsequent genuine review establishes trustworthy new context. This limitation must be documented in the phase handoff and tested.

### Canonical chronology

Assign a monotonic application sequence per durable card. Routine new events have nondecreasing event times; equal times use sequence. Reject an ordinary backdated review rather than replaying later history implicitly. Latest selection, correction, reconstruction and optimizer export use the same scheduling order.

Legacy order uses a deterministic documented fallback from original event time and stable existing ID, labeled as inferred rather than original arrival order. Preserve separately approved problem-wide first-assessment cohort tie semantics; a scheduling sequence does not silently redefine that metric.

## Effective profiles and daily scheduling: priorities 2 and 4

Resolve complete parameters through the library's supported parameter generator/normalization, then clone the effective scheduler parameters. Store immutable deduplicated profiles with effective weights, target retention, maximum interval, fuzz, scheduler mode, step arrays, package/algorithm version and origin. Attempts reference the profile and captured pre-card. Imported effective profiles must validate exactly; silently clipping them into different values would destroy reproducibility.

The new daily profile uses:

- `enable_short_term: false` to select the built-in long-term scheduler.
- Empty learning and relearning arrays to express absence of a fixed step ladder.
- The user's configured target retention and library-supported default weights initially.
- `enable_fuzz: false` and the recorded effective maximum interval.

The library owns memory transitions and intervals. Empty arrays do not disable memory updates or lapse handling. Disabling short-term mode also changes the memory-update strategy and rating-interval ordering; this is a deliberately tested configuration choice, not merely rounding hours upward.

With 5.4.0 defaults and a new card, verified first-review intervals are:

| Rating | At 90% target | At 75% target |
| ------ | ------------- | ------------- |
| Again  | 1 day         | 1 day         |
| Hard   | 2 days        | 7 days        |
| Good   | 3 days        | 13 days       |
| Easy   | 8 days        | 46 days       |

These are computed examples, not an application ladder. At 90%, initial stabilities round with a minimum one day to `1, 1, 2, 8`; the long-term scheduler's increasing-grade ordering yields `1, 2, 3, 8`. Later history, weights and retention can change outputs. Retention is a model target rather than a guaranteed coding success rate; daily rounding/minimums can prevent an exact target probability.

Apply profile changes prospectively to genuine reviews. Changing retention, activating weights or opening the upgraded application must not alter existing cards. Keep corrections bound to original recorded context, with the explicit legacy policy above.

### Local study-day eligibility

Persist the raw library due timestamp/log/scheduled days unchanged. Automatic eligibility is the later local calendar date of:

1. The raw due timestamp.
2. The next local date after the last actual review.

Use calendar arithmetic for the floor, not a 24-hour addition. Use actual review time, not correction `updatedAt`. Once eligible, a card is due for that entire local date, consistent with existing daily presentation.

Use this policy in Practice, Queue, current Analytics due indicators/forecast and reminders. Reminder deduplication uses the same local date identity. Historical metrics retain their separate definitions.

Spring DST can move a raw one-day due into a later local date; retain that later date. Autumn DST can place it on the same local date; the next-date floor prevents a same-day automatic repeat. Test both, midnight, legacy intraday cards and timezone changes under the existing browser-local policy. No new cutoff/timezone setting is required.

## Queue, assessment and previews: priorities 4–6

Compose overdue, due today and new problems in that order, with deterministic ordering within each partition. Future cards are available through explicit Extra Practice. Explicit suspension remains authoritative; valid legacy mastered state is normalized from its card for active review presentation rather than permanently excluded. Preserve stored history/progress while repairing that presentation discrepancy.

Keep the current rolling goal cap and distinct-problem progress. Do not silently add a finite-session completion model or introduce never-practiced problems into an eventual pure-review deck; that product choice belongs to the separate follow-up.

Record known assessment source/reason/policy context for future events. Preserve all accepted locks and grading decisions. Old missing context remains unknown. Explain model signals as estimates derived from these product ratings, which can include an accepted but over-time solution graded Again.

Add a pure facade preview backed by `repeat()`, served through the existing Practice read/runtime path. Show concise next study dates/day counts beside the existing rating controls with accessible text and unchanged locks.

- Submit preview uses the current card, active profile and preview time. Save uses authoritative current state, actual event time and final effective rating, including the existing AI policy, and returns the actual result.
- Update preview uses the original pre-card/time/profile to simulate a replacement. A past resulting due date is shown honestly. Legacy compatibility estimates carry their evidence label.
- Refresh after relevant state/settings invalidation and ignore superseded responses. Keep the chosen draft rating.
- Identical card/time/rating/effective-profile inputs produce matching preview and save results. An earlier preview is an estimate, not a reservation of changing state/time.
- Ordinary time passage or AI selection does not introduce another confirmation dialog. Stale Update uses the existing conflict/refetch flow with its draft preserved.

## Personalization: priority 7

Support validated versioned weights internally while retaining defaults. Ordinary scheduling already adapts each card; fitting a user's coefficients is additional work.

Evaluate the official binding in a separately planned user-started local pilot. A dashboard worker receives a validated canonical history snapshot and fingerprint. Training uses the supported FSRS generation, daily mode and explicit day-gap conversion, outside the authoritative mutation queue. Provide progress and cancellation; closing/cancelling leaves the active model intact.

Require packaged MV3 compatibility, bundled worker/WASM assets, actual release isolation/runtime requirements, bounded measured memory/time, responsiveness and safe lifecycle failure behavior. Existing WASM CSP alone is not proof of compatibility.

Compare candidate predictions against defaults/incumbent on chronological held-out history. Retain rating-policy provenance and evaluation evidence. Usable repeat histories and coverage determine readiness; there is no promised universal raw-attempt threshold. An unsuccessful or inconclusive evaluation keeps the active/default model.

Activation is a short guarded Practice/profile mutation tied to expected history/profile versions. Stale jobs do not silently replace the model. Activation and reversion are prospective. If the official runtime cannot fit the authorized local architecture, record that feasibility result and retain versioned defaults rather than expanding permissions or adding a service.

## Preserving upgrades and backups: priority 8

Append migrations without modifying shipped SQL. Before adding a migration, register today's exact through-0009 fingerprint/prefix as a frozen supported source baseline. Retain the existing older baselines and recovery copies, and provide a separate recovery slot for this baseline.

Use the existing staged open-snapshot flow: retain original bytes, restore candidate, validate source, upgrade additively, prepare the candidate, validate new schema/data and publish last. Failed/unsupported/partial upgrades preserve original storage and report recovery; they never silently seed a fresh database.

Backup preflight validates complete normalized data before clearing/replacement:

- Existing catalog/track/problem references and duplicate identities.
- Card/pre-card states, finite nonnegative memory values, nonnegative integer counters/steps and valid dates; non-New cards require last-review evidence. Valid New zeros/null dates remain supported.
- Parsed review logs associated with their attempt's rating/time and durable card ownership.
- Exact supported immutable profile values/version metadata and resolved references.
- Sequences/revisions, unique per-card application identity and consistent latest references, while retaining explicit legacy uncertainty.
- Receipts and target ownership. An earlier completed correction receipt stays valid after later revisions; its historical payload need not equal the event's current rating.

Old supported backups normalize missing new evidence to unknown/empty fields and deterministic legacy order, keeping due/memory/counters unchanged. Preserve opaque card IDs and all dependent references. Current valid records are not replayed during restore.

Include the new persisted evidence in the next backup format. Preserve existing Gist envelope, authorization, dirty-local guards and overwrite confirmations. Older clients can explicitly reject the newer format; this is a compatibility boundary, not expanded sync.

Distinguish invalid payload rejection, transaction rollback, committed-but-persistence-pending, and durable data with a later sync-metadata failure. A pending committed restore retries persistence, not destructive replacement. Backup and Platform do not schedule reviews.

## Measured local scaling: priority 8

Benchmark the entire durable save, not only `next()`. Current flush exports the full SQLite database and base64 encodes it; active/recovery storage and transient representations all matter. Measure before changing architecture.

Use deterministic representative data: 250 problems/5,000 reviews, 2,500 problems/50,000 reviews and 10,000 reviews on one card. Include realistic log lengths, gaps, ties, corrections, profiles and exclusions. Grow storage gradually; these sizes are test workloads, not promised capacities.

Record hardware/browser/build, cold/warm p50/p95, peak heap, SQLite/export/encoded sizes, total storage including recovery, and DB/replay/encoding/storage timings. Cover full durable acknowledgement, Queue, recent details, Analytics, backup validation and restore/reopen.

Optimize confirmed bottlenecks within existing owners: bounded recent-detail reads, one shared immutable ordered Analytics context, and incremental append aggregates where justified. Correction/reset repairs affected counts/minima/best times. Compare all results with the full reference calculation. Preserve complete history needed for memory reconstruction and cohort definitions. Profile/receipt storage must not repeatedly copy full histories.

Set performance budgets from a recorded baseline; no capacity/latency claim is established by this design. Any storage failure preserves the last durable state and stable pending command identity.

## Execution groups and validation

All eight priorities remain in scope. The execution grouping is foundation (1–3 and preserving upgrade/restore work from 8), daily experience (4–6), measured performance (8), then personalization pilot (7). The foundation can be divided into smaller dependent plans where identity/durability and profile/correction changes need separate review boundaries. Record baseline performance during foundation work.

Each plan names exact files, new meaningful regressions and done-when criteria. Use current governance commands rather than inventing a second validation policy. Update authority docs when behavior ships.

### Preservation acceptance proof

For today's through-0009 baseline, compare every pre-existing column before/after upgrade and after reopen, allowing only the new metadata. For older supported baselines, compare the protected FSRS/Practice/Tracks/settings values while respecting intervening catalog schema transformations and their already-approved semantic mappings. Extend existing populated snapshot/backup fixtures with old/current baselines, arbitrary supported card IDs, corrected events, tied times, suspension, track links, active session, external progress and retention at 75%.

Require unchanged original review rows, card due/memory/counters, aggregates, settings, daily/streak counts and track credit. Retain exact original recovery bytes. Test malformed data, unsupported baselines, quota/publication failure, restore retries and configured Gist round trips. An explicit later Update has its separately asserted intentional effects.

Prospective focused preservation command:

```sh
rtk npm run test -- src/platform/db/instance.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts src/features/backup/server/backup-service.test.ts src/features/backup/api/backup-contracts.test.ts src/features/practice/practice-core.integration.test.ts src/features/practice/domain/practice-progress.test.ts src/features/analytics/domain/review-cohorts.test.ts src/features/tracks/data/tracks-repository.test.ts
```

### Other meaningful regressions

Foundation: lost acknowledgement, duplicate/mismatched command IDs, persistence retry, stale two-tab Update, revision replay, same-time sequence, backdated rejection, original-profile correction and custom restored card identity. Reject an earlier structurally valid legacy log and ambiguous tied/reordered last-transition candidates. Validate actual snapshot restart and fresh reset/restore generation guards, including restoring an earlier backup with old receipt tokens.

Daily experience: all four long-term outcomes, legacy state transitions, spring/autumn DST and local midnight, shared cross-surface due labels/reminders, due/new/extra ordering, preserved locks/AI behavior, ignored stale previews and fixed-input preview/commit parity for both operations.

Performance: baseline and optimized output equality for append/correction/reset, complete pre-window replay, first/repeat cohorts, skewed histories, storage headroom and full durable acknowledgement.

Personalization: profile round trip, candidate/default comparison, chronological holdout, history-version guard, packaged worker startup, cancellation/closure, runtime failure and default fallback. Actual optimizer behavior is prospective and unproved.

Prospective focused daily commands:

```sh
rtk npm run test -- src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/domain/scheduling-options.test.ts src/features/practice/domain/practice-schedule.test.ts src/features/queue/domain/queue.test.ts src/features/assessment/domain/assessment.test.ts src/features/assessment/domain/rules/hard-locks.test.ts src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/features/settings/data/settings-repository.test.ts
rtk proxy env TZ=America/New_York npm run test -- src/extension/background/due-notification.test.ts
rtk proxy env TZ=Asia/Tokyo npm run test -- src/extension/background/due-notification.test.ts
```

Per touched-risk governance, run focused tests first, then:

```sh
rtk npm run db:generate
rtk npm run db:check
rtk npm run lint
rtk npm run check
rtk npm run build
```

`db:generate` applies when schema changes. `db:check` applies to database behavior/schema changes. Run `rtk npm run zip` and relevant artifact checks when packaging changes, including the optimizer pilot. Phase plans add the exact new test paths and any package-version compatibility probes.

Human installed-extension happy-path and edge-case smoke, with screenshots or recordings, is required before each behavior-changing PR review/merge. Cover upgrade/reopen, history/track/progress comparison, retry/two tabs, cadence/locks/previews, legacy/invalid restore, retention changes, reminders, large-history responsiveness and optimizer lifecycle where applicable. This proof is not N/A and agents do not claim to replace it.

## Research performed and current validation limits

Context7 resolved `/open-spaced-repetition/ts-fsrs` and retrieved current configuration, scheduling, profile and official-binding documentation. Exact published 5.4.0 behavior was inspected because some retrieved examples misdescribe formatting flags or cite optimizer APIs absent from the previously inspected binding release. Implementation must verify the chosen supported package rather than copy those examples blindly.

Read-only scenario assertions ran successfully using the published 5.4.0 archive:

```sh
rtk proxy env TZ=America/New_York node /private/tmp/cognipace-fsrs-day-scenarios.mjs
```

This verifies selected first/repeat/failed-review outputs and the 75% comparison. It is not an application migration, browser performance measurement or installed-extension smoke test.

For the original docs-only design pass, formatting checked the touched Markdown with the temporary official Prettier runtime:

```sh
rtk proxy node /private/tmp/cognipace-audit-prettier/package/bin/prettier.cjs --ignore-path /dev/null --write docs/superpowers/specs/2026-10-03-fsrs-remediation-design.md docs/superpowers/README.md
rtk proxy node /private/tmp/cognipace-audit-prettier/package/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/specs/2026-10-03-fsrs-remediation-design.md docs/superpowers/README.md
rtk git diff --check
```

The explicit ignore-path override checks this newly authored specification despite the repository's historical planning-artifact formatting exclusion.

Not run in the original design pass: `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk npm run db:check` and the prospective focused commands, because application code was unchanged and repository dependencies were absent. Phase A has since run its required automated checks successfully. `rtk npm run db:generate` remains skipped because no schema is implemented. `rtk npm run zip` remains skipped because no packaging behavior changes. Human smoke and browser optimizer/scaling measurements remain required implementation work, not completed proof.

## Library capabilities and source references

Keep `next()` and numeric `get_retrievability()` as existing strengths. Add `repeat()` previews and complete effective profile serialization. Use captured inputs for reliable new corrections and validated native rollback for legacy compatibility. Record `maximum_interval`; 5.4.0 grade ordering can exceed a configured cap, so this design does not promise an exposed strict cap. Bulk `reschedule()` and history-preserving `forget()` require separate administrative-event/product semantics and are not necessary to repair these findings.

- [ts-fsrs configuration](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/_autodocs/04-configuration.md)
- [Tagged 5.4.0 scheduler source](https://github.com/open-spaced-repetition/ts-fsrs/blob/v5.4.0/packages/fsrs/src/fsrs.ts)
- [Official binding browser integration](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/binding/README.md)
- [Anki desired retention](https://docs.ankiweb.net/deck-options.html#desired-retention)
- [Anki learning/relearning steps](https://docs.ankiweb.net/deck-options.html#learning-and-relearning-steps)

Anki's configurable flashcard workflow is useful context, not the product authority for daily coding sessions.
