# Notes Phase 2: Submission and AI Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retain every forward detected completed submission and its generated assessment without changing review behavior or making extra provider requests.

**Architecture:** Background-owned capture scopes bind observed attempts to a problem generation. Notes owns identity, metadata and payload persistence; capture supplies trusted original snapshots, and background AI orchestration publishes validated generated artifacts against the same submission. The overlay observes archive state independently of auto-review and automatic AI settings.

**Tech Stack:** TypeScript, Zod 4, existing LeetCode watcher/remote reader, native IDB archive, current feedback-first AI services, Vitest and hook integration tests.

---

Requires [Phase 1](./2026-10-31-notes-phase-1-archive-and-recovery.md). Read the [master plan](./2026-10-31-notes-and-submission-history.md). This phase stays on the feature branch until the complete backup/reset and remote gates pass. Do not fetch historical LeetCode submissions or persist hints, problem HTML, credentials, provider prompts or raw responses.

## File map and stable APIs

| File                                                                                                                                                | Responsibility                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Create `src/features/notes/domain/submission-identity.ts`, `submission-enrichment.ts`                                                               | Pure alias keys and monotonic completeness rules                                            |
| Modify `src/features/notes/domain/notes-records.ts`, `data/notes-repository.ts`, `server/notes-service.ts`                                          | Submission upsert, report/artifact attachment and saved-AI collection CAS                   |
| Create `src/extension/background/submission-archive-service.ts`, `assessment-archive-service.ts`                                                    | Compose capture/AI and Notes through public feature services                                |
| Modify `src/features/leetcode-capture/api/leetcode-capture-contracts.ts`, `server/leetcode-capture-service.ts`                                      | Capture context/lease round-trip while preserving original attempt and submitted code       |
| Create `src/features/overlay-session/hooks/use-leetcode-submission-archive.ts`                                                                      | Forward watcher delivery, scope binding and explicit archive retry                          |
| Modify `src/features/overlay-session/hooks/use-leetcode-overlay-session.ts`, `use-leetcode-code-analysis.ts`, `use-leetcode-code-implementation.ts` | Compose archive observation and expose publication status separately from generation status |
| Modify `src/extension/background/register-handlers.ts`, `runtime-policy.ts`, `leetcode-analysis-operations.ts`, `src/extension/messaging.ts`        | Trusted capture/report wiring and owned cancellation                                        |
| Modify `src/features/leetcode-review-assistant/api/code-analysis-contracts.ts`, `code-implementation-contracts.ts`                                  | Archive source context and separate publication result; keep existing report schemas        |
| Create `src/features/notes/submission-archive.integration.test.ts`                                                                                  | Populated end-to-end archive/Practice noninterference proof                                 |

Use `archiveSubmission({ captureLeaseId, scope, attempt, result })`, `attachAssessment({ operationId, scope, submissionId, report, providerMetadata })`, `attachImplementation({ operationId, scope, assessmentId, report, providerMetadata })` and `setSavedAiNote({ commandId, problemSlug, scope, assessmentId, expectedCollectionRevision, saved })` as the feature-service vocabulary. Internal IDs are never confused with external LeetCode IDs.

## Task 1: Stable submission identity and monotonic enrichment

**Files:** Create `src/features/notes/domain/submission-identity.ts`, `submission-identity.test.ts`, `submission-enrichment.ts`, `submission-enrichment.test.ts`; extend `src/features/notes/testing/notes-fixtures.ts`.

- [ ] **Step 1: Write pure rule tests.** Cover same external ID through `www`/canonical host, distinct attempt IDs with identical code/time/result, provisional attempt later receiving an ID, repeated status delivery, partial → complete code and complete → partial rejection.

```ts
import { expect, it } from 'vitest'
import {
  externalSubmissionKey,
  observedAttemptKey,
} from './submission-identity'

it('normalizes host aliases without collapsing distinct attempts', () => {
  expect(externalSubmissionKey('www.leetcode.com', '123')).toBe(
    externalSubmissionKey('leetcode.com', '123'),
  )
  expect(observedAttemptKey('leetcode.com', 'two-sum', 'attempt-1')).not.toBe(
    observedAttemptKey('leetcode.com', 'two-sum', 'attempt-2'),
  )
})
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/domain/submission-identity.test.ts src/features/notes/domain/submission-enrichment.test.ts`.
- [ ] **Step 3: Implement explicit alias keys and enrichment.** Do not reuse `createSubmissionResultKey`; it hashes result/code fields and is a review-delivery key, not durable attempt identity.

```ts
export function normalizeSubmissionHost(host: string) {
  if (host === 'leetcode.com' || host === 'www.leetcode.com')
    return 'leetcode.com'
  throw new Error('Unsupported submission host.')
}
export function externalSubmissionKey(host: string, id: string) {
  if (!/^\d+$/.test(id)) throw new Error('Invalid external submission ID.')
  return JSON.stringify([normalizeSubmissionHost(host), id])
}
export function observedAttemptKey(
  host: string,
  slug: string,
  attemptId: string,
) {
  if (!slug.trim() || !attemptId.trim())
    throw new Error('Missing observed attempt identity.')
  return JSON.stringify([normalizeSubmissionHost(host), slug, attemptId])
}
export function preferCompleteSnapshot<
  T extends { completeness: 'complete' | 'partial' | 'missing' },
>(current: T, incoming: T): T {
  const rank = { missing: 0, partial: 1, complete: 2 }
  return rank[incoming.completeness] > rank[current.completeness]
    ? incoming
    : current
}
```

Preserve original submitted code once complete. A disagreement between two claimed complete snapshots is an explicit identity/content conflict, not silent replacement. Verified enrichment may populate absent diagnostics/language or bind an external alias; it does not erase reflections, reports, saved inclusions or original timestamps. Store no credentials or polling debug arrays.

- [ ] **Step 4: Verify GREEN and commit.** Run both files; expect identity and completeness tests to pass. Commit `feat(notes): define durable submission identity and enrichment`.

## Task 2: Transactional submission upsert and payload retention

**Files:** Modify `src/features/notes/data/notes-repository.ts`, `server/notes-service.ts`, `domain/notes-records.ts`; extend `data/notes-repository.test.ts`; create `src/features/notes/submission-archive.integration.test.ts`.

- [ ] **Step 1: Add integration failures.** Start from Phase 1's real IDB test context. Archive accepted and failed attempts; deliver a terminal result twice; promote a provisional attempt to a verified external ID; reopen the store; compare exact pinned code. Verify two distinct attempts with identical text remain two entries and each retained record increases the shared revision only when content changes.

```ts
const first = await repository.upsertSubmission(capture)
expect(await repository.upsertSubmission(capture)).toMatchObject({
  submissionId: first.submissionId,
})
const promoted = await repository.upsertSubmission({
  ...capture,
  externalSubmissionId: '123',
})
expect(promoted.submissionId).toBe(first.submissionId)
expect(
  (
    await repository.listSubmissionMetadata({
      problemSlug: 'two-sum',
      limit: 50,
    })
  ).items,
).toHaveLength(1)
expect((await repository.readSubmission(first.submissionId)).code).toBe(
  pinnedCode,
)
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/data/notes-repository.test.ts src/features/notes/submission-archive.integration.test.ts`.
- [ ] **Step 3: Upsert aliases and payloads atomically.** Add repository methods `upsertSubmission`, `attachAssessment`, `attachImplementation`, `setSavedAiNote`, `exportArchive` and generation-aware read methods. Before entering the transaction validate source identity and hash immutable payload content. Inside it check scope, find attempt and external aliases, select/create one stable internal ID, write metadata/aliases/payload references and change the head only for a meaningful update.

```ts
const existingId = externalAlias?.submissionId ?? attemptAlias?.submissionId
const submissionId = existingId ?? crypto.randomUUID()
const codePayloadId =
  completeCode === null
    ? (existing?.codePayloadId ?? null)
    : `submitted-code:${codeDigest}`
```

Use a compound external uniqueness index plus transaction retry for alias promotion races. If aliases already point at two records, coalesce only verified same-submission records, redirect the superseded ID and move references atomically. Never discard distinct user reflections: if both are nonempty and disagree, return `identity-conflict`, retain both records and expose explicit resolution rather than silently merging personal writing. Define `notes.resolveSubmissionIdentity` as a dashboard-only command with current scope, both internal IDs, both expected reflection revisions, a stable command ID and explicitly reviewed final Markdown. Its owning repository revalidates the verified external alias, applies the reviewed reflection and redirects/rebinds references in one transaction; it rejects changed revisions and cannot combine different external submissions. Phase 4 supplies its visible review controls. Keep redirect metadata reachable until old references/receipts cannot use it. An incomplete record renders unavailable code honestly; no current-editor substitution is permitted.

Payload IDs include kind and digest. Reuse requires exact byte equality as well as a matching digest; a collision cannot overwrite existing content. A missing/oversized capture retains result metadata and an explicit completeness reason, not a truncated body labeled complete. History queries return metadata only, in stable reverse timestamp/ID cursor order, limit 50; `readSubmission` loads its selected bodies. Add a recent limit of 3 for details/overlay summaries.

- [ ] **Step 4: Verify GREEN and commit.** Run the RED files and task-1 domain tests. Expect restart-safe identity, no duplicate promotion and metadata-only listing. Commit `feat(notes): retain submission metadata and pinned code`.

## Task 3: Forward capture independent of AI and auto-review

**Files:** Create `src/extension/background/submission-archive-service.ts`, `submission-archive-service.test.ts`, `src/features/overlay-session/hooks/use-leetcode-submission-archive.ts`, `use-leetcode-submission-archive.test.tsx`; modify capture contracts/service, overlay session hook, messaging/policy/registration.

- [ ] **Step 1: Write controller and ownership tests.** Matrix AI enabled/disabled × autoDetectSolved enabled/disabled; archive every completed detected accepted/failed submission in all four combinations. A run/test event, nonterminal poll or other-problem result is ignored. A second submission after the overlay's review was saved still archives. Reset during polling rejects the old result.

```ts
expect(archiveSubmissionViaRuntime).toHaveBeenCalledTimes(2)
expect(saveReviewResult).not.toHaveBeenCalled()
expect(analyzeCode).not.toHaveBeenCalled()
expect(
  archiveSubmissionViaRuntime.mock.calls.map(
    ([request]) => request.attempt.attemptId,
  ),
).toEqual(['attempt-1', 'attempt-2'])
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/overlay-session/hooks/use-leetcode-submission-archive.test.tsx src/extension/background/submission-archive-service.test.ts`.
- [ ] **Step 3: Bind scope when an attempt starts.** Add `notes.beginSubmissionCapture` and `notes.archiveSubmission` with strict schemas. A begin request matches the actual sender page, records the current problem scope and binds owner/attempt ID. The existing watcher supplies `submission-started`/attempt identity; acquire scope there, before async polling, not when the terminal event finally arrives. Include this lease in the background reader context and in the DOM fallback delivery. A lost begin reply retries by the same owner/attempt ID.

```ts
type ObservedSubmissionDelivery = {
  attemptId: string
  captureLeaseId: string
  problemSlug: string
  terminal: boolean
}
export function shouldArchiveDelivery(
  value: ObservedSubmissionDelivery,
  activeProblemSlug: string,
) {
  return (
    value.terminal &&
    value.problemSlug === activeProblemSlug &&
    value.attemptId.length > 0
  )
}
```

Obtain the problem scope from the existing owned page context before a submit event; send it as `expectedScope` in the begin request. The begin handler rejects a mismatched scope instead of minting a fresh scope for a delayed pre-reset event. Reset invalidation drops old pending begins; only a genuinely new attempt after refreshed context may use the new scope.

Compose `useLeetCodeSubmissionArchive` above visual modes beside the existing review automation, without its `autoDetectSolved`, `submittedSession` or AI availability guards. The background remote-result handler archives a completed matching result before acknowledging its archive status; the hook also delivers DOM fallback/enrichment idempotently. Run archive persistence in the short shared mutation queue, never around network polling. Bind complete code to the attempt/result's original snapshot, not to a later editor read.

Expose `archiveStatus` (`idle`, `saving`, `saved`, `unsaved`, `identity-conflict`) and `retryArchive` independently of timer/review/analysis status. Preserve pending source data for explicit retry in the available session. A full-page close before accepted capture is not reported as archived. Worker restart reconstructs accepted capture leases; stale/reset leases cannot be reacquired by delivering the old terminal event. A new real attempt gets a new lease.

- [ ] **Step 4: Verify GREEN and commit.** Run RED files plus `rtk npm test -- src/features/leetcode-capture src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/extension/background/register-handlers.test.ts`; expect current review automation behavior unchanged. Commit `feat(notes): archive completed submissions independently of reviews`.

## Task 4: Retain feedback with separate archive retry

**Files:** Create `src/extension/background/assessment-archive-service.ts`, `assessment-archive-service.test.ts`; modify AI analysis contracts, `register-handlers.ts`, `leetcode-analysis-operations.ts`, overlay analysis hook and their tests. Modify Notes repository attachment methods from task 2.

- [ ] **Step 1: Add provider-once/publication tests.** Delay provider success until after a review save. Assert feedback attaches to the correct internal submission, no extra review occurs and the provider is called once. Abort archive publication, retain the ready feedback with an unsaved state, retry publication, and assert no additional provider invocation. Cancel/reset/change configuration before completion and reject stale attachment.

```ts
expect(result.status).toBe('ready')
expect(result.archive.status).toBe('unsaved')
await retryAssessmentPublication(result.archive.retry)
expect(provider).toHaveBeenCalledTimes(1)
expect(reviewWriter).not.toHaveBeenCalled()
expect(
  await repository.readAssessment(result.archive.assessmentId),
).toMatchObject({ submissionId: originalInternalId })
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/extension/background/assessment-archive-service.test.ts src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx src/features/leetcode-review-assistant/api/code-analysis-contracts.test.ts`.
- [ ] **Step 3: Compose retention after existing generation checks.** Add validated archive context to an analysis request: issued capture lease, original scope, internal submission ID. Before calling the provider ensure/bind that submitted source; after generation keep existing owned-operation, abort and configuration checks, then publish feedback using the original scope. Store the report schema version and existing safe provider metadata. Do not store the full analysis request/problem prompt.

```ts
type ArchivePublication =
  | { status: 'saved'; assessmentId: string }
  | {
      status: 'unsaved'
      assessmentId: string
      retry: { operationId: string; receiptToken: string }
    }
  | { status: 'stale-scope'; assessmentId: string }
```

Keep provider errors in existing generation states; a ready report plus failed storage remains ready with `archive: unsaved`. Before generation, persist a compact operation receipt binding owner, scope, source identity and a random receipt token. On publication failure the available client retains the validated report and retry descriptor; `notes.retryAssessmentPublication` resubmits those artifacts against that issued receipt. The handler validates owner, token, schema, operation identity and scope; it never calls an AI service. If the report is no longer available after a full client reload, explain that it was not saved; do not claim durable retention or automatically regenerate. Durable successful reports replay from their receipt after worker restart.

Attachment of the same operation is idempotent. Explicit AI Retry has a new operation ID and can produce another assessment for the same submission; do not overwrite a previously saved assessment. A report's arrival changes only Notes/archive revision and invalidation tags, never Practice or FSRS.

- [ ] **Step 4: Verify GREEN and commit.** Run the RED files plus `rtk npm test -- src/extension/background/leetcode-analysis-operations.test.ts src/features/leetcode-review-assistant/server/analysis-runtime-service.test.ts`; preserve all existing deadline/provider-recovery cases. Commit `feat(notes): retain feedback without coupling archive retries to AI`.

## Task 5: Optional implementation attachment and saved AI collection CAS

**Files:** Modify Notes repository/service/contracts/tests, AI implementation contracts, background assessment archive service, `src/features/overlay-session/hooks/use-leetcode-code-implementation.ts` and tests; extend messaging/policy registration.

- [ ] **Step 1: Add attachment and inclusion failures.** Generated code attaches to its original assessment; it remains literal, AI-generated and Untested. Opening a report never generates code. Repeat Save to notes twice, remove the inclusion, then replay the earlier add. The report remains in history and the inclusion remains removed. Wrong-problem assessment IDs and stale collection revisions fail.

```ts
const first = await repository.setSavedAiNote(addCommand)
if (first.status !== 'saved')
  throw new Error('Expected the first inclusion to save.')
expect(await repository.setSavedAiNote(addCommand)).toMatchObject({
  status: 'saved',
})
await repository.setSavedAiNote({
  ...addCommand,
  commandId: 'remove-1',
  expectedCollectionRevision: first.collectionRevision,
  saved: false,
})
await repository.setSavedAiNote(addCommand)
expect(await repository.listSavedAiNotes('two-sum')).toEqual([])
expect(await repository.readAssessment(assessmentId)).not.toBeNull()
expect(provider).not.toHaveBeenCalled()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/data/notes-repository.test.ts src/features/overlay-session/hooks/use-leetcode-code-implementation.test.tsx src/extension/background/assessment-archive-service.test.ts`.
- [ ] **Step 3: Reuse artifact publication and ordered collection commands.** Add implementation archive state alongside generation state, with the same retry-without-provider rule as task 4. Confirm assessment identity, submitted source and report feedback before attachment. A generated-code failure leaves feedback intact; a successful generated artifact enriches already-saved inclusions by reference. Never require a key to read retained reports.

```ts
function canApplyCollectionCommand(
  currentRevision: number,
  expectedRevision: number,
) {
  return currentRevision === expectedRevision
}
```

In one transaction, check problem scope, command receipt, assessment ownership and expected collection revision; then add/remove the unique inclusion, increment collection/global revisions and store the receipt. A duplicate old add returns its prior acknowledgment/current inclusion state without applying a new add. Re-adding after removal requires a **new** command ID and current collection revision. UI refetches current membership after replay, so a historical receipt cannot display a removed inclusion as newly added.

Saved inclusion ordering is newest `savedAt` first with stable assessment-ID tie-breaker. Each inclusion retains the source submission timestamp separately. Loading saved bodies is lazy; list metadata does not hydrate all feedback/code.

- [ ] **Step 4: Verify GREEN and commit.** Run the RED files plus `rtk npm test -- src/features/leetcode-review-assistant/api/code-implementation-contracts.test.ts src/features/leetcode-review-assistant/server/implementation-runtime-service.test.ts`. Commit `feat(notes): retain generated code and revisioned saved AI sections`.

## Task 6: Noninterference, reset races and phase proof

**Files:** Extend `src/features/notes/submission-archive.integration.test.ts`, background handler/policy tests, `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `PRIVACY.md`; create `docs/superpowers/handoffs/2026-10-31-notes-phase-2.md` during execution.

- [ ] **Step 1: Prove ownership and retention end to end.** Snapshot Practice tables/schedules, then capture failed → failed → accepted, generate feedback/code, save/remove an inclusion, turn AI off/remove the key, and reopen. Compare Practice byte-for-byte and archive by logical records. Only an explicit existing review action may alter review state. Test pending capture/AI and lost-response retries across full/bulk problem reset and dataset restore.

```ts
expect(await readPracticeRows(db)).toEqual(practiceBeforeArchiveWork)
expect(
  (
    await repository.listSubmissionMetadata({
      problemSlug: 'two-sum',
      limit: 50,
    })
  ).items,
).toHaveLength(3)
expect(await repository.readAssessment(assessmentId)).not.toBeNull()
expect(providerRequestCountAfterRestore).toBe(providerRequestCountBeforeRestore)
```

Define `readPracticeRows` in the integration file using the existing Practice backup serializer, not raw writes or another feature repository. Include source-mismatch and conflicting-alias recovery states.

- [ ] **Step 2: Run focused and required checks.** Run `rtk npm test -- src/features/notes src/features/leetcode-capture src/features/leetcode-review-assistant src/features/overlay-session/hooks src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts src/testing/architecture-boundaries.test.ts`, then `rtk npm run db:check`, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk npm run format`. Record `rtk npm run db:generate` skipped when no Drizzle change. Package if needed for installed proof.
- [ ] **Step 3: Obtain human smoke proof.** In the packaged extension, submit accepted/failed attempts with AI and auto-review independently on/off, submit again after a review is saved, retry a failed archive publication without another provider call, navigate/reset while pending, restart the worker, remove the AI key and read retained reports, export/restore and verify exact code. Attach screenshots/recording and provider-call evidence without private code or credentials. Pending human proof is a review/merge gate, not N/A.
- [ ] **Step 4: Record and commit the phase handoff.** Update authority docs only for implemented behavior and state whether activation remains feature-branch-only. Record exact checks/skips, supported capture gaps, scope/retry APIs and remote-backup readiness. Commit `docs(notes): record submission archive and AI retention proof`.

## Done when

- [ ] Every forward detected completed attempt archives independently of AI and review settings.
- [ ] Identity/enrichment survives duplicate delivery, provisional promotion and worker restart without collapsing distinct attempts or losing personal writing.
- [ ] Pinned code is complete or visibly unavailable; current editor text never replaces it.
- [ ] Feedback/generated code retain schema/source identity; archive retry never requests generation.
- [ ] Saved inclusions are idempotent, ordered and protected against delayed resurrection.
- [ ] Capture/report/history work has no Practice/FSRS/track side effects.
- [ ] Reset/replacement fences reject old work; local/remote backup contract covers every new meaningful record.
- [ ] Focused/full results and human proof status are recorded; no premature release activation.
