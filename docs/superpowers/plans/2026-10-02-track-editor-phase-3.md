# External Track Progress Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let opted-in tracks continuously count past and future successful local
reviews, while preserving independent default-off tracks.

**Architecture:** Resolve effective completion from the owned ledger plus
eligible global review evidence in Tracks. Batch evidence reads and share the
predicate across membership rows, totals, and Next. Practice keeps review/FSRS
ownership and reconciles only existing linked rows on correction.

**Tech Stack:** TypeScript, Drizzle, Zod, React, Vitest.

## Task 1: Domain And Runtime Contract

**Files:**

- Modify: `src/features/tracks/domain/track.ts`
- Modify: `src/features/tracks/api/tracks-contracts.ts`
- Modify: `src/features/tracks/api/tracks-serializers.ts`
- Modify: `src/testing/track-fixtures.ts`
- Test: `src/features/tracks/api/tracks-contracts.test.ts`

- [x] Add failing request/edit-response tests for boolean validation, default
      false, eligible slugs, and external completion provenance.
- [x] Add the persisted track flag, mutation input, external-only provenance on
      completed read rows, and eligibility list. Old callers/fixtures without
      provenance represent owned completion.

```ts
allowExternalProgress: z.boolean().default(false),
externalProgressProblemSlugs: z.array(problemSlugSchema).default(() => []),
source: z.enum(['track', 'external']).optional(),
```

- [x] Serialize the flag and eligibility slugs; serialize provenance only for
      completed rows. Update shared fixtures with false and an empty eligibility
      list. Keep raw backup ledger shape separate from read provenance.
- [x] Run contract tests and announce the exact field names to the editor owner.

## Task 2: One Effective Completion Read Path

**Files:**

- Modify: `src/features/tracks/data/tracks-repository.ts`
- Create if useful: `src/features/tracks/data/track-progress-read-model.ts`
- Test: `src/features/tracks/data/tracks-repository.test.ts`
- Modify: `src/features/tracks/server/tracks-service.ts`
- Test: `src/features/tracks/server/tracks-service.test.ts`
- Test: `src/features/queue/queue-track-independence.integration.test.ts`

- [x] Add failing tests for opted-in/off tracks sharing a question, success
      before creation, future Free Practice success, later Again, multiple
      successes, corrections, provenance priority, group movement, removal,
      suspension, inactive tracks, and ordered Next.
- [x] Read membership/owned state for requested track IDs in one ordered query.
      Read qualifying reviews for their opted-in problem slugs in one batch,
      ordered by reviewedAt then attempt ID descending. Resolve completion:

```ts
if (owned.status === 'completed') return owned
if (!allowExternalProgress || !externalAttempt) return owned
return {
  status: 'completed',
  source: 'external',
  completedAt: new Date(externalAttempt.reviewedAt),
  completedRating: externalAttempt.rating,
  reviewAttemptId: externalAttempt.id,
}
```

- [x] Count and choose Next from those effective memberships. Keep Next in
      explicit group/problem order and exclude suspended problems. Align both
      public service guidance and the repository fallback. Never write synthetic
      track ledger rows for external credit or inspect lastRating/solvedCount.
- [x] Persist create/update flags. Add eligibility slugs to `getTrackForEdit`
      using the same successful-review evidence query for available Library rows.
- [x] Run repository/service/queue tests and inspect query cardinality to avoid
      per-question or per-track review reads.

## Task 3: Corrections And Reset

**Files:**

- Modify: `src/features/practice/server/practice-review-workflow.ts`
- Modify: `src/features/tracks/data/tracks-repository.ts`
- Test: `src/features/practice/practice-core.integration.test.ts`
- Test: `src/features/tracks/data/tracks-repository.test.ts`
- Review/Test: `src/extension/background/register-handlers.test.ts`

- [x] Add failing tests for an owned completion corrected after switching to Free
      Practice or another active track, and for old corrections after reset.
- [x] Reconcile only existing ledger rows linked by reviewAttemptId regardless of
      current mode. New owned-review writes remain Study Plan-only. Existing
      repository reconciliation already matches attempt ID; remove only the
      workflow's mode-dependent override gate.
- [x] Reset owned ledger and disable external progress in one transaction:

```ts
await tx.delete(trackProblemProgress).where(eq(trackProblemProgress.trackId, trackId))
await tx.update(tracks).set({ allowExternalProgress: false, updatedAt: now.getTime() })
  .where(eq(tracks.id, trackId))
```

- [x] Verify global reset still removes reviews/owned progress without changing
      unrelated tracks; existing practice invalidation refreshes Tracks and
      app-shell. Run focused integration/handler tests.

## Task 4: Completion Details, Editor Option, And Documentation

**Files:**

- Modify: `src/features/tracks/components/track-actions.tsx`
- Modify: `src/features/tracks/components/track-problem-table.tsx`
- Test: related Tracks component tests
- Editor owner: phase 1 Task 3 hook/form files
- Modify: `docs/product.md`, `docs/architecture.md`, `docs/testing.md`

- [x] Add failing component tests for provenance and reset confirmation.
- [x] Show a Tracks-owned completion line before generic expanded problem
      details. Read `completion.source === 'external'` to label External progress;
      otherwise use Completed in this track, with rating/date.
- [x] Add external-enabled reset confirmation explaining that the setting is
      turned off while history stays. Complete phase 1 Task 3's editor option.
- [x] Update current authority docs to describe opt-in semantics, backup v5,
      current supported snapshot upgrades, and precise human smoke flows.

## Task 5: Review, Verification, And Handoff

- [x] Review spec compliance, then code quality, with independent agents. Resolve
      findings and rerun only affected tests before full checks.
- [x] Run the required combined matrix:

```sh
rtk npm run db:check
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
```

- [x] Browser-inspect actual built editor interactions and responsive title/menu
      behavior. Preserve screenshots; distinguish agent inspection from human
      realtime smoke proof. The human must run happy/edge paths before PR review
      or merge; prepare the checklist and never mark this N/A.
- [x] Record exact focused/full commands run, failures/skips and reasons, final
      risk, data/backup compatibility, and rollback notes in a handoff file.
      Keep Conventional Commit summaries. Do not merge or publish without an
      explicit request.

## Done When

The complete approved behavior is implemented; automated checks pass, browser
inspection is recorded, and the human smoke checklist and remaining proof
requirement are explicitly handed off.
