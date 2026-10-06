# FSRS Phase D: Reliable Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task, with specification then quality review before each task commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply each accepted review command once, acknowledge it only after snapshot persistence, and correct precisely the saved event from its recorded scheduling inputs.

**Architecture:** Extend the existing Practice workflow transaction to own deduplication, scheduling evidence, track effects and a compact receipt. Keep native scheduling/correction inside the FSRS facade, publication and sender authorization in the background queue, and accepted command identity in the overlay session. Reuse C's tables and backup v6 without another migration or a command bus.

**Tech Stack:** TypeScript, pinned ts-fsrs 5.4.0, SQLite WASM/Drizzle, Zod, React, Vitest, WXT/Chrome MV3.

---

## Approved scope and verified baseline

The [October 3 approved master design](../specs/2026-10-03-fsrs-remediation-design.md#review-commands-and-durability-priorities-13) and [master acceptance map](./2026-10-03-fsrs-remediation.md#d-review-integrity-acceptance) authorize this slice. The user confirmed Phase C and instructed proceeding on October 6. C merged as `9230a709` in PR #198. Worktree `/Users/tobiolutimehin/.codex/worktrees/46c1/cognipace-v2` is reused on fresh branch `codex/fsrs-phase-d-reliable-reviews`, based on that latest main. Baseline focused tests passed 219 tests in six suites.

Scope: priorities 1–3, including command integrity, canonical application order, captured profiles/pre-cards, guarded single-event correction and durable acknowledgement. Keep the existing assessment rating locks, explicit reselect then Update, legacy short-term 12h/23h steps, retention policy, queue and Daily Goal. Day scheduling, 180-day cap, previews, optimizer and scaling changes remain E–H. Do not modify shipped migrations, legacy backup codecs, Chrome permissions, secret formats or sync capabilities.

Current Context7 documentation confirms `next(card, originalTime, rating)` for applying one transition and `rollback(card, log)` for recovery. B's pinned adapter and correction tests are authoritative for rollback limitations: successful rollback alone does not prove log identity or recover every original due instant.

## Contract and transaction decisions

Accepted commands carry `commandId`, `problemSlug`, canonical ISO `reviewedAt`, `rating`, persisted generation pair, original accepted timing/correctness/log fields and optional existing v1 assessment evidence. Update also carries `targetAttemptId` and `expectedRevision`. Save mode remains manual/leetcode. A command ID is generated once after the effective assessment rating is resolved; transport and persistence retry reuse the entire detached payload.

```ts
interface PracticeCommandIdentity {
  commandId: string
  generation: PracticeGenerationContext
  reviewedAt: string
}
// Save request: identity + existing Save fields, with reviewedAt required.
// Update request: identity + targetAttemptId + expectedRevision + existing fields.
interface PracticeReviewCommandResult {
  status: 'saved' | 'persistence-pending'
  acknowledgement: PracticeReceiptAcknowledgement
  current: SerializedPracticeDetails
}
```

`acknowledgement` is C's bounded original scheduling/operation identity; it is stored in the receipt. `current` is a separate fresh read and is never copied into a receipt. Overlay result snapshots use acknowledgement identity/rating plus their frozen accepted elapsed/correctness fields, never whichever attempt happens to be latest. Existing receipt acknowledgement v1 remains unchanged.

PracticeDetails gains readonly `generation` and `latestReview` (`reviewAttemptId`, `applicationSequence`, `revision`, `reviewedAt`) fields. An unprepared internal fixture may have `generation: null`; real background startup initializes C scopes before exposing details. Runtime mutation requires a non-null generation. A details read never writes or rotates tokens.

**First review scope:** a never-practiced problem has no problem token. The command carries the current local token and `problemGenerationToken: null`. Validate the local token, look up this command's receipt, and return it if identical. Only a receipt miss checks that the expected problem token matches the live token (including absence). The transaction creates the problem scope and stores the receipt under the accepted pair. Retry of that original bootstrap command remains valid because its receipt is consulted first. Targeted reset deletes that problem's receipts and rotates its token; full replacement rotates the local token. Neither lifecycle transition permits an old command to create another event.

**Deduplication:** compute SHA-256 using `crypto.subtle.digest` over a fixed-order representation of all accepted mutable fields, including operation/target/revision/generation. Preserve omitted-versus-null patch meaning. Exclude current Settings, active track, caller surface and server-generated timestamps. Local generation guard and receipt lookup precede latest/revision/chronology guards and scheduler/track calls. An existing key with a different fingerprint conflicts without writes. Historical imported generation keys remain inert after C replacement.

**Scheduling:** Save allocates sequence as max retained sequence + 1, rejects a time before the last applied event or card last review, accepts equal timestamps, creates the complete effective legacy profile using saved retention, deduplicates its canonical JSON, and schedules through `scheduleReviewWithProfile`. Persist captured pre-card/profile/native log and any validated accepted assessment evidence atomically with attempt/card/aggregate/track/receipt. No full-history replay on Save or Update.

**Correction:** validate target owner, last application sequence, expected revision and original reviewedAt inside the same transaction. Captured/legacy-derived events use `correctReviewFromEvidence` with their stored context. Unknown legacy events use `correctLegacyReview` only when complete retained chronological/log/card evidence uniquely verifies the final transition; tied/reordered/missing/inconsistent evidence rejects without changing the draft or history. Return recovered pre-card context from that already-verified facade operation and persist it as legacy-derived. Increment revision, retain attempt ID/sequence/event time, preserve timing/log fields unless explicitly edited, and reconcile only that attempt's existing linked track progress.

**Durability:** review runtime uses the existing gated mutation queue, executes the workflow, calls `flushDbSnapshot`, and broadcasts/invokes existing dirty/sync bookkeeping only after a successful flush. Flush failure returns `persistence-pending` with the original acknowledgement and a current read, never a Saved message. Retry resends the same command, finds the persisted/in-memory receipt, skips all mutation effects and retries flush. No worker-local pending flag serves as the command identity. If restart loses an unflushed transaction, the last durable snapshot remains intact and the same command can apply once against that snapshot; if the receipt was published before acknowledgement loss, restart finds it and never reapplies.

## File map

| Owner                        | Files                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FSRS verified legacy context | `src/lib/fsrs/scheduler/review-correction.ts`, colocated test                                                                                                                  |
| Command domain/contracts     | new `src/features/practice/domain/practice-command.ts`, existing domain/index, practice.ts, practice-contracts.ts, practice-serializers.ts and public index                    |
| Evidence/receipt writes      | `src/features/practice/data/practice-repository.ts`, `practice-storage-repository.ts`, new command repository test or existing core integration test                           |
| Whole transaction            | `src/features/practice/server/practice-review-workflow.ts`, public practice-service.ts, new workflow tests                                                                     |
| Runtime publication          | `src/extension/background/register-handlers.ts`, messaging.ts, runtime handler tests                                                                                           |
| Overlay accepted state       | `src/features/overlay-session/domain/overlay-session-state.ts`, hooks/use-overlay-review-actions.ts, use-leetcode-overlay-session.ts, existing footer/rail and colocated tests |
| Authority/handoff            | docs/product.md, docs/architecture.md, docs/testing.md, master plan, planning index, new Phase D handoff                                                                       |

## Task 1: Capture scheduling context and correct one identified event

- [ ] Write failing regressions in FSRS correction/core Practice tests for captured Save metadata, same-time sequence, backdated rejection, original-profile correction after Settings changes, custom imported card IDs, stale target/revision, tied unknown legacy rejection and verified legacy-derived context.

```ts
const saved = await repository.saveReviewResult({
  problemSlug: 'two-sum',
  rating: 'good',
  reviewedAt: eventAt,
  targetRetention: 0.75,
})
const before = await readPracticeStorageData(db)
expect(before.reviewEvidence.at(-1)?.schedulingEvidenceKind).toBe('captured')
const corrected = await repository.overrideLastReviewResult({
  problemSlug: 'two-sum',
  rating: 'hard',
  targetAttemptId: saved.reviewAttemptId,
  expectedRevision: 0,
  targetRetention: 0.95,
})
expect(corrected.reviewAttemptId).toBe(saved.reviewAttemptId)
expect(corrected.reviewedAt).toEqual(eventAt)
expect(
  (await readPracticeStorageData(db)).reviewEvidence.at(-1)?.revision,
).toBe(1)
```

- [ ] Run `rtk npm run test -- src/lib/fsrs/scheduler/review-correction.test.ts src/features/practice/practice-core.integration.test.ts`; confirm meaningful failures before edits.
- [ ] Extend `correctLegacyReview` to return the verified context (`preCard` serialized by existing codec, original ISO event time, effective compatibility profile). Keep native rollback and every current verification guard.
- [ ] Change Save to persist canonical complete profile, serialized pre-card and captured evidence instead of unknown. Use immutable profile JSON uniqueness, opaque IDs and safe counters from C. Reject backdating before writes, allow ties in sequence order. Optional assessment evidence uses C's schema and must match the effective rating.
- [ ] Replace repository Update replay with exact target/revision guard, captured context scheduling or verified legacy correction. Preserve other events and linked metadata. Use the retained application sequence for details/history/latest ordering, without changing Analytics' separately owned first-assessment cohort tie policy.

```ts
const event = evidenceById.get(input.targetAttemptId)
if (
  !event ||
  latest.id !== input.targetAttemptId ||
  event.revision !== input.expectedRevision
)
  throw new Error(
    'This review changed. Refresh before updating; your draft is preserved.',
  )
const replacement =
  event.schedulingEvidenceKind === 'unknown'
    ? correctLegacyReview(
        currentCard,
        legacyHistory,
        input.rating,
        input.targetRetention,
      )
    : correctReviewFromEvidence(recordedContext, input.rating)
// Persist replacement card/log, existing attempt identity/time/sequence, revision + 1.
```

- [ ] Add readonly generation/latest-review context to details; derive `canOverrideLatestReview` from the same safe correction context validation used by writes.
- [ ] Adapt existing direct repository/core/Tracks tests to explicit Update identity and new captured evidence behavior; preserve assertions about counts, time/log and track semantics.
- [ ] Rerun focused tests and C storage/backup validation tests. Obtain SPEC then QUALITY review, repair findings, commit `feat(fsrs): capture review inputs and guard single-event corrections`.

## Task 2: Deduplicate the whole Practice and track transaction

- [ ] Define accepted command domain types, generation/target guards and fixed-order payload hashing using the existing Practice ownership. Add strict runtime request schemas with required command metadata and required original event time; expose new result schema and public types.

```ts
const fingerprint = Array.from(
  new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(canonicalFields)),
    ),
  ),
  (byte) => byte.toString(16).padStart(2, '0'),
).join('')
```

- [ ] Write failing workflow integration tests: identical retry after changed retention/active track/newer review; same ID different payload; two concurrent corrections; old correction receipt after later revision; bootstrap scope retry; targeted/full reset and restore generation rejection; rollback removes every write including track and receipt.

```ts
const first = await executePracticeReviewCommand(db, command, settings)
await switchActiveTrackAndRetention()
const repeated = await executePracticeReviewCommand(db, command, newerSettings)
expect(repeated.acknowledgement).toEqual(first.acknowledgement)
expect(await countAttemptsAndReceipts()).toEqual({ attempts: 1, receipts: 1 })
await expect(
  executePracticeReviewCommand(db, { ...command, rating: 'easy' }, settings),
).rejects.toThrow(/command/i)
```

- [ ] Add the workflow transaction around generation/receipt lookup and existing repository/track writes. Store C's command summary and bounded original acknowledgement in `practiceCommandReceipts`; do not store current details/history. Duplicate returns original acknowledgement plus a fresh current read outside the receipt. Keep the existing public service boundary and reset workflow.
- [ ] Receipt insert and every side effect share the outer transaction; preserve the existing nested track transaction support. Lookup precedes mutable event guards and all scheduling/track work. Retention/profile and active track are used only on a receipt miss.
- [ ] Run workflow, core Practice, Tracks, C backup/storage and architecture tests. Obtain SPEC then QUALITY review, fix findings, commit `feat(practice): apply accepted review commands exactly once`.

## Task 3: Publish command acknowledgements through the background queue

- [ ] Write failing handler/API tests requiring authenticated strict command payloads, original acknowledgement separately from current state, flush failure returning pending, duplicate retry performing no second effects and invalidation only after successful flush.
- [ ] Change ProtocolMap save/update return types to `PracticeReviewCommandResult`, retain methods/sender permissions, and route both methods through a small review-specific composition in the existing gated mutation queue. Fetch Settings for a first apply, execute the whole workflow, flush, then perform existing invalidation/dirty/sync bookkeeping. Do not turn flush failure into a generic mutation rejection that encourages a new command.

```ts
return runGatedMutationQueue(async () => {
  const { db } = await getAppDb()
  const committed = await executePracticeReviewCommand(
    db,
    command,
    await getSettings(db),
  )
  try {
    await flushDbSnapshot()
  } catch {
    return serializeCommandResult('persistence-pending', committed)
  }
  await broadcastPracticeInvalidation({
    problemSlug: command.problemSlug,
    source,
  })
  await markSyncLocalDataChangedBestEffort()
  await scheduleAutoPushAfterMutationBestEffort()
  return serializeCommandResult('saved', committed)
})
```

- [ ] Ensure every runtime response is Zod parsed, no command fields are forged on the server for old clients, and no invalidation claims pending state is durable. Existing backup pending admission continues to block these writes.
- [ ] Run `rtk npm run test -- src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts src/features/practice/api/practice-contracts.test.ts src/features/practice/api/practice-api.test.tsx` and typecheck. Obtain SPEC then QUALITY review and commit `feat(runtime): acknowledge reviews after durable snapshot save`.

## Task 4: Freeze accepted commands in the overlay and expose safe retry

- [ ] Add accepted Save/Update payload state and an explicit pending/error retry state to the existing overlay reducer. Freeze command ID/event time/effective rating after assessment resolution, capture generation and original attempt/revision, and synchronously guard double-click/watcher overlap before awaiting transport.
- [ ] Keep accepted payload through network error or persistence pending. Retrying calls the same existing method with the exact same command. Disable rating/session restart changes while an accepted result is unresolved; show accessible retry and plain pending feedback, without Saved or next-step success feedback. After durable acknowledgement, clear pending command and retain acknowledged identity for Update.
- [ ] Update submitted snapshots to include original attempt ID/revision/event time and generation. Do not replace that target on unrelated current-context refetch; fresh current data may show a later event and the resulting Update should conflict. Keep the draft and explicit reselect flow on stale correction. A rejected conflict can end the unresolved attempt without erasing the selected draft, enabling a deliberate refresh/new session.

```ts
const accepted = {
  ...request,
  commandId: crypto.randomUUID(),
  reviewedAt: new Date().toISOString(),
  generation: currentContext.practice.generation,
}
// Store accepted before the first await; retry reuses it unchanged.
const result = await saveReviewResultViaRuntime(accepted)
if (result.status === 'persistence-pending') {
  dispatch({ type: 'review-persistence-pending' })
  return false
}
// Snapshot uses result.acknowledgement identity/rating and accepted timing fields.
```

- [ ] Preserve assessment rating locks and AI hint/session behavior. Automatic code analysis remains independent of rating policy. Build v1 accepted assessment evidence from existing decision source/intent/reason/lock values; do not add new policy outcomes.
- [ ] Write reducer/hook/component regressions for lost acknowledgement retry, pending flush retry, double-click protection, changed Settings between attempts, exact two-tab target, pending refetch protection, stale Update preserving selected draft, and navigation/reset generation rejection. Adapt existing session fixtures to new runtime result shapes.
- [ ] Run overlay reducer/session/action/assessment rail tests and typecheck. Obtain SPEC then QUALITY review; commit `feat(overlay): retry frozen reviews and retain exact update targets`.

## Task 5: Verify restart, compatibility and whole-phase behavior

- [ ] Add real SQLite serialized-reopen tests showing a published receipt dedupes after lost acknowledgement, unflushed state cannot replace the durable snapshot on publication failure, same accepted retry applies once if restart lost unflushed state, and old commands reject after actual backup/target reset generation rotation. Exercise populated C fixtures and v6 export/import of D captured/legacy-derived evidence and current/historical correction receipts.
- [ ] Update current product/architecture/testing authority and the master plan/index. Add a Phase D handoff with exact failures repaired, run/skipped commands, preservation and rollback limits, and a human installed-extension checklist for Submit/Update, two-tab conflict, pending retry and worker restart. Preserve C's proof record; the user's confirmation is not an invented screenshot.
- [ ] Run the affected focused integrations first, then `rtk npm run db:check`, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk npm run format`, explicit touched-Markdown Prettier check and `rtk git diff --check`.
- [ ] Final independent SPEC then QUALITY review and requested simplicity principles: no command bus, generic outbox, full-history receipts or replay correction. Repair important findings before claiming completion or creating the phase PR.
- [ ] Commit `docs(fsrs): document durable reviews and correction validation`, push phase branch, create and attach a draft PR under the established phase workflow. Human smoke remains pending until the engineer confirms it; C's one-PR post-merge exception is not presumed to authorize a new exception for D.

Skipped unless the implementation changes their scope: `rtk npm run db:generate` (no new schema), `rtk npm run zip` (archive behavior unchanged), live AI provider evaluations (no provider behavior changes or credentials), performance/optimizer experiments (G/H). Record actual skipped commands and remaining human proof in the handoff and PR.

## Self-review and completion rule

This plan maps every D requirement to a task, preserves C schema/backup compatibility, defines initial scope retry semantics, retains original acknowledgements after later corrections and keeps the daily-policy transition out of D. No production edit precedes this plan. Complete each task's red/green evidence and sequential reviews. Mark implementation complete only after required checks and final review; human testing is a separate reported status.
