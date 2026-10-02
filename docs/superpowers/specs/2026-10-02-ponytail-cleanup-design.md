# Proposed CogniPace cleanup design

Date: 2026-10-02. **Approved by the human engineer in this chat on 2026-10-02.**
Evidence: [four-agent codebase audit](../audits/2026-10-02-ponytail-codebase-audit.md).
Baseline: `709957e`; branch `codex/ponytail-codebase-audit`.

## Intended outcome

Restore documented behavior, remove proven unused implementations, and leave
one production owner for each calculation and workflow. Preserve local data,
runtime Zod validation, sender authorization, feature ownership, cache
invalidation, snapshot recovery and existing product scope. Add no dependencies
for cleanup. Keep the existing schema and Chrome permissions.

The first milestone is reliable backup selection and confirmed sync recovery.
The remaining phases improve catalog/capture/date correctness, remove duplicate
AI work, prune obsolete code, and repair specific keyboard/error flows.
Passing tests alone will not establish completion: affected realtime human
smoke and visual proof remain required before review or merge.

## Approaches considered

1. **Correctness first, then deletion, in bounded phases — recommended.** Each defect gets a regression at its owning boundary; disjoint agents can work concurrently within a phase. Proven dead paths are removed after current behavior is protected. This addresses data safety while keeping each result reviewable.
2. **Delete unused code first.** Quickly removes roughly 2000 source lines, but leaves backup/sync defects reachable while cleanup is under way.
3. **Broad architecture rewrite.** Would require substantially more behavioral and migration proof; current ownership is already suitable for targeted repairs. The audit does not justify it.

## Approved phase sequence

These are approved scope and acceptance criteria. Produce phase-sized plans
using the repository's writing-plans workflow, with exact tasks and maintained
regression code.
Finish and validate each phase before advancing.

### Phase 1 — Backup selection and sync recovery

Scope:

- `src/features/backup/components/data-management-screen.tsx` and its component tests.
- `src/features/sync/server/sync-service.ts` only if authorization must be threaded through its dependency contract.
- `src/extension/background/register-handlers.ts` and handler/service integration tests.

Use a selection generation to ignore obsolete backup read/validation results
and errors. The displayed filename, parsed payload and validation summary must
always describe the same latest selection. Reuse the Imports pattern without
creating a generic upload framework.

Propagate `confirmLocalOverwrite === true` only from an authorized, parsed,
manual `sync.pullLatest` request into that action's restore callback. Keep the
whole action in the current mutation queue. Automatic pulls still reject dirty
data, and concurrent writes cannot bypass the queue. Do not globally weaken
the runtime dirty guard.

Also add a focused dirty-mark-failure/worker-restart reproduction. If the risk
is confirmed, stop the sync phase from being called complete and propose the
smallest durable dirty-state repair at the existing storage/snapshot boundary.
Its exact persistence design needs that evidence first.

Done when: late backup reads and validation cannot change the selected restore
payload; confirmed manual dirty pull works through the real runtime guard;
unconfirmed and automatic dirty pulls remain blocked; queued writes remain
serialized. Any reproduced restart durability failure is repaired and tested
under an approved persistence design.

Focused commands:

```sh
npm test -- src/features/backup/components/data-management-screen.test.tsx src/features/sync/server/sync-service.test.ts src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts --run
npm run lint
npm run check
npm run build
```

Human proof: disposable-profile backup selection/restoration including a
delayed read; cancel and confirm dirty force pull; verify automatic pull still
protects local changes. Attach redacted screenshots or a recording.

### Phase 2 — Identity, calendar and capture correctness

Scope:

- `src/lib/leetcode/domain/problem-url.ts` and parser/form/track tests.
- `src/features/problems/data/problems-repository.ts` and repository tests.
- `src/features/imports/domain/plan-import-problems.ts` and planner/service tests.
- `src/features/analytics/domain/chart-data.ts` and backlog tests.
- `src/features/leetcode-capture/server/leetcode-capture-service.ts`, `src/lib/leetcode/watcher/leetcode-page-watcher.ts` and their tests.

Reject failed URL inputs instead of fabricating a slug. Allocate company IDs
without colliding with existing distinct labels. Normalize topic lookup keys
without rewriting persisted identities; include the same matches in preview
fingerprints. Classify overdue backlog with the selected timezone's calendar.
Cache complete remote capture results while allowing recovery from fallback.

Done when: invalid URLs cannot create a bogus problem; distinct company labels
save transactionally; normalized restored topic IDs resolve without collisions
or stale-preview holes; today's due cards are not overdue; offline-to-online
capture recovers without extension restart. Existing progress and metadata
remain intact.

Focused commands:

```sh
npm test -- src/lib/leetcode/domain/problem-url.test.ts src/features/problems/components/form/problem-form.test.tsx src/features/problems/data/problems-repository.test.ts src/features/tracks/data/tracks-repository.test.ts src/features/imports/domain src/features/imports/server/import-service.test.ts src/features/analytics/domain/chart-data.test.ts src/features/leetcode-capture/server/leetcode-capture-service.test.ts src/lib/leetcode/watcher --run
npm run db:check
npm run lint
npm run check
npm run build
```

Human proof: Library create/edit/bulk labels, valid/invalid Track input,
restored custom-topic import, today's versus yesterday's Analytics backlog,
and capture recovery. Use disposable data and attach redacted proof.

### Phase 3 — One AI assessment and a complete deadline

Scope:

- `src/features/overlay-session/hooks/use-leetcode-assessment-recommendation.ts`.
- `src/features/overlay-session/hooks/use-overlay-review-actions.ts`.
- `src/features/overlay-session/hooks/use-leetcode-overlay-session.ts` and related tests.
- `src/features/genai/server/providers/shared.ts`, three provider adapters and their tests.

Use the existing overlay recommendation owner to share one request/promise and
result between accepted-review saving and display. Build one fingerprint and
context for that submission. Preserve rule-only failure locks, manual submit,
user rating override, navigation and restart cancellation. A new background
cache is unnecessary for this duplicated local workflow.

Keep provider cancellation effective through success and error body reads.
Timeouts must return the existing controlled timeout result; user cancellation
must retain its intended semantics. Validate native abort APIs against the
supported Chrome target before replacing signal composition.

Done when: one accepted automatic submission makes one provider request;
display and saved recommendation agree; late results cannot affect a new
problem/session; stalled headers or bodies respect the deadline for all three
providers; secret redaction remains covered.

Focused commands:

```sh
npm test -- src/features/overlay-session/hooks src/features/leetcode-review-assistant/server src/features/genai/server/providers --run
npm run lint
npm run check
npm run build
```

Human proof: accepted auto-detect with AI, manual review, failure lock, rating
override, navigation/restart during pending work and provider failure. A live
provider call is optional and must use the existing opt-in flow; deterministic
provider-call counts come from tests.

### Phase 4 — Delete obsolete production paths

Scope: the ranked deletion list in the audit, its public barrels, tests and
matching architecture documentation. Remove the unused Analytics payload only
after removing its dead chart consumers. Keep live evidence/readiness/date
helpers, `LineSegments`, formatting, persisted due dates and production Tracks
guidance. Migrate meaningful old tests to production paths; do not discard
coverage of live behavior. Remove the three unused direct dependencies and
update the lockfile through npm.

Done when: caller searches show no broken imports; current Analytics/runtime
contracts and chart stories pass; only one production track-guidance path
remains; FSRS scheduling still delegates to `ts-fsrs`; all three dependencies
are absent from direct package declarations. Record actual line/dependency
savings after implementation.

Focused commands:

```sh
npm test -- src/features/analytics src/features/tracks src/lib/fsrs src/components/ui/chart.test.tsx src/testing/architecture-boundaries.test.ts src/testing/db-foundation.test.ts --run
npm run lint
npm run check
npm run format
npm run build
npm run store:check
npm run zip
```

Human proof: ready and sparse Analytics, track Next/progress, popup guidance and
overlay saved-review refresh. Runtime response removal requires smoke even
when the intended visible behavior is unchanged.

### Phase 5 — Specific modal repairs and dependency remediation

Treat these as two independent plans: Library modal behavior, and dependency
updates. For dialogs, start with the Problems confirmation and bulk metadata
flows and their row/bulk callers. Contain and restore focus, retain pending
guards, and show rejection messages inside the active dialog. A repo-wide
modal framework is outside this proposal.

For dependencies, inspect compatible fixes for the audited advisories and
update narrow groups. Fetch current official documentation where API/config or
version behavior matters. Do not use a forced audit fix or downgrade Drizzle
blindly. Document any remaining advisory's affected path and practical limit.

Done when: keyboard focus remains inside open modals and returns on dismissal;
failure messages and retry/cancel actions are accessible; compatible advisory
fixes pass existing DB, test, build and package checks. A dependency remaining
unfixed must have an explicit, evidence-based decision.

Commands selected by each plan:

```sh
npm test -- src/features/problems/components src/features/tracks/components/tracks-screen.test.tsx --run
npm run db:check
npm run lint
npm run check
npm run format
npm run build
npm run store:check
npm run zip
npm audit
```

Human proof: keyboard and failure paths for Library row/bulk operations and
Tracks reset schedule; production-package happy/edge smoke for dependency
changes affecting build/runtime behavior.

## Execution and handoff

Keep Ponytail full active throughout. Assign disjoint source ownership to
subagents; root reviews integrations and executes shared full validation.
Avoid concurrent edits to runtime handler registration or shared contracts.
Use conventional, phase-specific commit/PR titles. Do not merge or publish as
part of this proposal.

Every phase handoff must list exact commands run and skipped, reasons, actual
failures, human smoke/proof status, release impact and rollback. No schema
migration is currently proposed; `db:generate` is skipped unless that scope
changes and receives explicit design approval. Behavioral fixes are patch
release candidates; deletion-only work uses maintenance titles.

Completion means the approved findings have maintained regression coverage,
required automated checks pass, and required human proof is attached. The
read-only audit and a green baseline do not meet that definition.
