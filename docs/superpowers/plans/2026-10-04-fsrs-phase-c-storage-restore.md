# FSRS Phase C Storage and Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve complete scheduling evidence and opaque identities across database upgrades, backup, reset and configured Gist restore without changing existing schedules or earned progress.

**Architecture:** Add four Practice-owned side tables beside the shipped tables. Backup freezes its supported legacy readers and validates the complete replacement before opening a destructive transaction. A small background replacement coordinator retains an already committed result while publication or sync metadata is pending, behind the existing mutation queue.

**Tech Stack:** TypeScript, ts-fsrs 5.4.0 / FSRS 6 facade, Drizzle SQLite WASM, Zod, Vitest, React, WXT Chrome MV3.

---

## Baseline and approved boundary

The [approved design](../specs/2026-10-03-fsrs-remediation-design.md) and [master acceptance map](./2026-10-03-fsrs-remediation.md) own scope. Phase B merged in [PR #196](https://github.com/Hollowvyn/Cognipace/pull/196). The reviewed core baseline is `36d5ef708cd2c68602da4e884aca610d062b6569`; execution starts from latest main `d829a70592bfc17c0f52c14bdfd9784980dc5adb` after the unrelated Analytics restoration in PR #197 on `codex/fsrs-phase-c-storage-restore`, in the existing isolated worktree `/Users/tobiolutimehin/.codex/worktrees/46c1/cognipace-v2`. The user requested review followed by implementation on October 4, 2026.

At baseline, storage ends at migration `0009` and backup exports v5. Never edit shipped SQL or historical Drizzle snapshots. Preserve all existing columns in the 16 protected tables, including FSRS due dates/logs, settings, track credit, suspension and assessment timestamps. No history replay runs during upgrade or restore.

C persists the shapes D needs. Live Save and Update remain explicitly `unknown` scheduling evidence during this transition. Save records a known application sequence; Update retains sequence and increments revision. Existing `createdAt,id` history readers/latest selection remain until D's guarded command path changes them together. Inferred legacy scheduling order uses `reviewedAt,id` and does not redefine Analytics first-assessment ties.

Imported captured or legacy-derived evidence must survive intact. C rejects Update when any event consumed by the full-history replay has captured or legacy-derived evidence, before any write, because that replay cannot preserve the original contexts. D replaces this temporary guard with the Phase B single-event correction helper. Ordinary Save can establish a subsequent unknown event without rewriting the earlier evidence; Update of that unknown event remains protected if its replay would consume earlier known evidence.

Phase D owns Practice command deduplication, accepted-payload freezing, expected revisions, backdating rejection, captured live scheduling and durable review acknowledgement. Phase E owns empty learning/relearning steps, day scheduling, automatic queue policy and the approved 180-day interval cap. C activates none of those behaviors.

## Settled contracts

- `fsrsSchedulerProfiles`: immutable canonical complete profile JSON, deduplicated by JSON, with an opaque ID and creation date.
- `practiceReviewEvidence`: one row per attempt; durable card ID; positive per-card application sequence; nonnegative revision; `legacy-inferred` or `applied` sequence provenance; `unknown`, `captured` or `legacy-derived` scheduling provenance; nullable profile, pre-card and assessment JSON.
- `practiceGenerations`: `local` scope and `problem:${slug}` scopes. Targeted reset rotates only its problem token. Full reset/restore rotates the local token and applicable problem tokens atomically. Imported active tokens never become live.
- `practiceCommandReceipts`: composite `(generationKey,commandId)` identity, fingerprint, operation/ownership/sequence/revision, accepted time and a compact self-contained historical acknowledgement. Historical generation keys have no foreign key to active generation rows. C preserves and validates receipts but creates no review receipts and adds no pruning.

Generation JSON is a canonical pair `[localToken,problemToken|null]`. Empty generation arrays are an explicit unknown state accepted when normalizing legacy backups; UUIDs are created only within database preparation/replacement, never in pure parsing. A current export contains initialized active scopes.

Receipt acknowledgements refer to their own historical accepted rating and result. A receipt acknowledging Good at revision 1 remains valid after the event becomes Again at revision 2. Validate ownership, sequence, result consistency and `acknowledgedRevision <= currentRevision`; do not compare historical rating, card, due date or profile with today's corrected values. Fixed-size receipts never contain full PracticeDetails, notes or growing review histories.

All Backup replacement paths use one prepared, detached, fully validated payload. Validation failures and rolled-back transactions leave data and generations unchanged. A committed replacement with failed snapshot flush reports persistence pending; explicit Retry saving flushes the committed state without clearing, importing or rotating again. Durable replacement followed by sync metadata failure retries metadata only. While replacement is pending, later writes, exports and remote applications are rejected with an actionable message.

Pending replacement state lives for the current background worker. A worker restart before publication reopens the last durable snapshot; it cannot report the discarded in-memory replacement as saved. A restart after durability may lose the UI acknowledgement; C does not promise lifecycle operation deduplication across restart. An intentional later restore of the same file remains a new replacement. This boundary does not substitute for D's persisted review command protocol.

## Review and execution

- [x] Independent plan review: storage invariants, backup compatibility, replacement durability and scope.
- [x] Resolve all material plan findings before implementation. Three targeted re-reviews passed.
- [x] Execute the tasks below with specification review followed by code-quality review per task.
- [x] Record exact passing and failed commands, repaired review findings, skipped checks and human smoke requirements in `docs/superpowers/handoffs/2026-10-04-fsrs-phase-c-storage-restore.md`.

Execution status: all four tasks implemented and independently reviewed. Complete check passed 2,900 tests with six unrelated opt-in provider tests skipped; Chrome build passed. The [handoff](../handoffs/2026-10-04-fsrs-phase-c-storage-restore.md) records repaired review/check failures and remaining human installed-extension smoke/visual proof. No PR review or merge readiness is claimed until that proof is attached.

## Execution ownership and dependencies

| Task  | Owner                        | Deliverable                                                                              | Depends on         |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------ |
| 1A–1D | Practice/DB implementer      | Four sidecars, strict domain evidence, preparation, unknown writer bridge and opaque IDs | merged B           |
| 2A–2C | Backup implementer           | Frozen legacy contracts, v6 full preflight, export and atomic replacement                | reviewed Task 1    |
| 3A–3C | Runtime implementer          | Specific replacement state/retry, existing Gist integration and recovery UI              | reviewed Task 2    |
| 4     | Integration/validation owner | Actual populated upgrade, authority docs, full checks and build                          | reviewed Tasks 1–3 |

Each task receives a specification review followed by a separate code-quality review. Implementers do not edit another active owner's files or commit another owner's changes. Natural substeps use focused test-first checks; one complete C build is the release unit. No intermediate migration/backup/runtime subset is shipped.

## Verified baseline

- `src/platform/db/migration-sql.ts` discovers and sorts SQL via `import.meta.glob`; appending 0010 is bundled automatically. Root generates migration SQL and metadata. Shipped 0000–0009 SQL and historical snapshots stay unchanged.
- `snapshot-upgrade.ts` already allowlists exact v7/v8/v9 prefixes and fingerprints `b1c2b4d7`, `a35941fc`, `1144ce07`.
- `open-snapshot.ts` prepares fresh/upgraded candidates before target validation/publication. Matching current snapshots skip preparation/publication. Keep that behavior.
- `extension/background/app-db.ts` currently returns early for v9; narrow this to skip taxonomy alone and always invoke Practice preparation for fresh/upgraded candidates.
- Practice Save loads a card by problem/kind but regenerates its ID. Update/details regenerate ID too. `readReviewAttempts` orders by `createdAt,id`; leave this order and latest selection unchanged in C.
- Update currently replays the whole history with today's retention. Guard any nonunknown event in the complete history consumed by replay before scheduling or writing; do not silently substitute its recorded profile.
- `queue/server/queue-service.ts` synthesizes IDs and omits card ID from selection. `problems/data/problems-repository.ts` selects the complete card but synthesizes ID in `readLibraryRows`. Correct both.
- Analytics `compareReviewEvents` owns a separate `reviewedAt,id.localeCompare` first-assessment policy. Do not replace it with scheduling sequence.

## Shared exact contracts

All dates below are canonical ISO strings in public/backup contracts and integer milliseconds in SQL. All IDs/tokens are nonempty opaque strings. Generation tokens are minted with `crypto.randomUUID()` only inside database initialization/replacement; pure normalization never creates tokens.

Create `src/features/practice/domain/practice-storage.ts`, export through `domain/index.ts` and `features/practice/index.ts`:

```ts
export const practiceSequenceSources = ['legacy-inferred', 'applied'] as const
export const practiceSchedulingEvidenceKinds = [
  'unknown',
  'captured',
  'legacy-derived',
] as const
export const practiceReceiptOperations = ['save', 'update'] as const

export interface PracticeGenerationContext {
  localGenerationToken: string
  problemGenerationToken: string | null
}

export interface PracticeSchedulerProfileRecord {
  id: string
  profileJson: string
  createdAt: string
}

export interface PracticeReviewEvidenceRecord {
  reviewAttemptId: string
  cardId: string
  applicationSequence: number
  revision: number
  sequenceSource: 'legacy-inferred' | 'applied'
  schedulingEvidenceKind: 'unknown' | 'captured' | 'legacy-derived'
  schedulerProfileId: string | null
  preCardJson: string | null
  assessmentEvidenceJson: string | null
}

export interface PracticeGenerationRecord {
  scopeId: string // exactly local or problem:${problemSlug}
  problemSlug: string | null
  generationToken: string
  createdAt: string
}

export interface PracticeReceiptCommandSummary {
  schemaVersion: 1
  rating: ReviewRating
  reviewedAt: string
  targetAttemptId: string | null
  expectedRevision: number | null
}

export interface PracticeReceiptAcknowledgement {
  schemaVersion: 1
  operation: 'save' | 'update'
  problemSlug: string
  cardId: string
  reviewAttemptId: string
  applicationSequence: number
  revision: number
  rating: ReviewRating
  reviewedAt: string
  dueAt: string
  status: PracticeStatus
  card: FsrsSerializedCardSnapshot
  fsrsReviewLog: FsrsReviewLogSnapshot | null
  schedulingEvidenceKind: 'unknown' | 'captured' | 'legacy-derived'
  schedulerProfileId: string | null
}

export interface PracticeCommandReceiptRecord {
  generationKey: string
  commandId: string
  payloadFingerprint: string // 64 lowercase hex SHA-256 characters; D computes it
  operation: 'save' | 'update'
  problemSlug: string
  cardId: string
  reviewAttemptId: string
  applicationSequence: number
  revision: number // acknowledged revision, not today's event revision
  acceptedAt: string
  commandSummaryJson: string
  resultJson: string
}

export interface PracticeStorageData {
  schedulerProfiles: PracticeSchedulerProfileRecord[]
  reviewEvidence: PracticeReviewEvidenceRecord[]
  generations: PracticeGenerationRecord[]
  commandReceipts: PracticeCommandReceiptRecord[]
}

export interface PracticeStorageReferences {
  problemSlugs: readonly string[]
  practiceProblemSlugs: readonly string[]
  cards: readonly {
    id: string
    problemSlug: string
    card: FsrsCardSnapshot
  }[]
  attempts: readonly {
    id: string
    cardId: string
    problemSlug: string
    rating: ReviewRating
    reviewedAt: string
    fsrsReviewLog: string | null
  }[]
}
```

`generationKey` is exactly `JSON.stringify([localGenerationToken, problemGenerationToken])`. Decode with strict two-element tuple validation and demand canonical reserialization equality. Historical keys do not reference active generation rows; they survive restore as inert evidence.

The receipt is bounded by fixed fields and fixed card/log shapes. Store no notes, full accepted log patch, PracticeDetails, review-history arrays or growing aggregate snapshots. C does not prune receipts: removing a receipt while its generation stays active can permit a future duplicate application. D computes the full accepted-command fingerprint, including solve/log patches, but the compact summary retains only fields needed to validate historical association.

Assessment JSON is nullable, and C live writes use null. Support a strict versioned object for current-format imports without inventing or executing a grading policy:

```ts
export const practiceAssessmentEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.enum(['manual', 'assessment', 'ai']),
  policyVersion: z.string().min(1).nullable(),
  submissionIntent: z.enum(assessmentSubmissionIntents).nullable(),
  reasonCode: z.enum(assessmentReasonCodes).nullable(),
  lockReason: z.enum(assessmentLockReasons).nullable(),
  finalRating: z.enum(reviewRatings),
})
```

Import the three existing Assessment enum exports from `@/features/assessment/domain`, and ratings/types/codecs from `@/lib/fsrs`. Existing Assessment types already define these reason/intent/lock values, but have no policy-version export. Preserve a provided nonempty version string or null; do not claim that today's rules have a newly invented version. Do not persist AI reports, keys or code.

## Task 1A: Four additive side tables

**Depends on:** the approved baseline and settled contracts above. One owner generates the migration; backup v6 activates after all Practice storage substeps pass review.

**Create:**

- `src/platform/db/schema/fsrs-scheduler-profiles.ts`
- `src/platform/db/schema/practice-review-evidence.ts`
- `src/platform/db/schema/practice-generations.ts`
- `src/platform/db/schema/practice-command-receipts.ts`

**Modify:** `src/platform/db/schema/index.ts`. **Tests:** new `src/features/practice/data/practice-storage-repository.test.ts`.

- [x] Add failing tests that insert two evidence rows with one card/sequence, duplicate canonical profiles and duplicate generation/command keys; each must reject at SQLite constraints. Assert deleting a review/card cascades its evidence/receipts without deleting unrelated profiles or generations.
- [x] Run `rtk npm run test -- src/features/practice/data/practice-storage-repository.test.ts`; expect missing table/export failure.
- [x] Define the schema using the following table bodies and exports. Keep every original table file unchanged.

```ts
// fsrs-scheduler-profiles.ts
export const fsrsSchedulerProfiles = sqliteTable(
  'fsrs_scheduler_profiles',
  {
    id: text('id').primaryKey(),
    profileJson: text('profile_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    unique('fsrs_scheduler_profiles_json_unique').on(table.profileJson),
  ],
)

// practice-review-evidence.ts
export const practiceReviewEvidence = sqliteTable(
  'practice_review_evidence',
  {
    reviewAttemptId: text('review_attempt_id')
      .primaryKey()
      .references(() => reviewAttempts.id, { onDelete: 'cascade' }),
    cardId: text('card_id')
      .notNull()
      .references(() => fsrsCards.id, { onDelete: 'cascade' }),
    applicationSequence: integer('application_sequence').notNull(),
    revision: integer('revision').notNull().default(0),
    sequenceSource: text('sequence_source').notNull(),
    schedulingEvidenceKind: text('scheduling_evidence_kind').notNull(),
    schedulerProfileId: text('scheduler_profile_id').references(
      () => fsrsSchedulerProfiles.id,
    ),
    preCardJson: text('pre_card_json'),
    assessmentEvidenceJson: text('assessment_evidence_json'),
  },
  (table) => [
    unique('practice_review_evidence_card_sequence_unique').on(
      table.cardId,
      table.applicationSequence,
    ),
  ],
)

// practice-generations.ts
export const practiceGenerations = sqliteTable(
  'practice_generations',
  {
    scopeId: text('scope_id').primaryKey(),
    problemSlug: text('problem_slug').references(() => problems.slug, {
      onDelete: 'cascade',
    }),
    generationToken: text('generation_token').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    unique('practice_generations_problem_unique').on(table.problemSlug),
  ],
)

// practice-command-receipts.ts
export const practiceCommandReceipts = sqliteTable(
  'practice_command_receipts',
  {
    generationKey: text('generation_key').notNull(),
    commandId: text('command_id').notNull(),
    payloadFingerprint: text('payload_fingerprint').notNull(),
    operation: text('operation').notNull(),
    problemSlug: text('problem_slug')
      .notNull()
      .references(() => problems.slug, { onDelete: 'cascade' }),
    cardId: text('card_id')
      .notNull()
      .references(() => fsrsCards.id, { onDelete: 'cascade' }),
    reviewAttemptId: text('review_attempt_id')
      .notNull()
      .references(() => reviewAttempts.id, { onDelete: 'cascade' }),
    applicationSequence: integer('application_sequence').notNull(),
    revision: integer('revision').notNull(),
    acceptedAt: integer('accepted_at').notNull(),
    commandSummaryJson: text('command_summary_json').notNull(),
    resultJson: text('result_json').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.generationKey, table.commandId] }),
    index('practice_command_receipts_problem_idx').on(table.problemSlug),
  ],
)
```

Each file imports only its used symbols from `drizzle-orm/sqlite-core` and referenced schema modules. Export `$inferSelect`/`$inferInsert` types under `FsrsSchedulerProfileRow`, `InsertFsrsSchedulerProfileRow`, `PracticeReviewEvidenceRow`, `InsertPracticeReviewEvidenceRow`, `PracticeGenerationRow`, `InsertPracticeGenerationRow`, `PracticeCommandReceiptRow`, `InsertPracticeCommandReceiptRow`.

- [x] Root generates `rtk npm run db:generate -- --name=fsrs_evidence`; confirm exactly one appended migration and one new Drizzle snapshot plus journal append. No historical SQL/snapshot edits.
- [x] Run `rtk npm run db:check` and focused tests; expect PASS.

## Task 1B: Pure schemas, legacy normalization and complete Practice preflight

**Depends on:** settled contracts; independent of 1A migration generation.

**Create:** `src/features/practice/domain/practice-storage.ts`, `src/features/practice/domain/practice-storage.test.ts`. **Modify:** `src/features/practice/domain/index.ts`, `src/features/practice/index.ts`.

- [x] Add tests for exact profile round-trip, unsupported/clipped profiles, malformed present card/log JSON, valid New zero/null card, duplicate sequences, mismatched attempt/card ownership, incomplete evidence coverage, malformed generations, historical receipts and assessment source/reason shape.
- [x] Run `rtk npm run test -- src/features/practice/domain/practice-storage.test.ts`; expect missing exports failure.
- [x] Export these exact functions/schemas; callers never reach into data ownership:

```ts
export function createPracticeGenerationKey(
  context: PracticeGenerationContext,
): string
export function parsePracticeGenerationKey(
  value: string,
): PracticeGenerationContext
export function normalizeLegacyPracticeStorage(
  attempts: PracticeStorageReferences['attempts'],
): PracticeStorageData
export function validatePracticeStorageData(
  storage: PracticeStorageData,
  references: PracticeStorageReferences,
  options?: { requireActiveGenerations?: boolean },
): void
export const practiceSchedulerProfileRecordSchema: z.ZodType<PracticeSchedulerProfileRecord>
export const practiceReviewEvidenceRecordSchema: z.ZodType<PracticeReviewEvidenceRecord>
export const practiceGenerationRecordSchema: z.ZodType<PracticeGenerationRecord>
export const practiceReceiptCommandSummarySchema: z.ZodType<PracticeReceiptCommandSummary>
export const practiceReceiptAcknowledgementSchema: z.ZodType<PracticeReceiptAcknowledgement>
export const practiceCommandReceiptRecordSchema: z.ZodType<PracticeCommandReceiptRecord>
export const practiceStorageDataSchema: z.ZodType<PracticeStorageData>
```

Use `z.strictObject` at every JSON object boundary; safe integers (`z.number().int().safe()`) with positive sequence and nonnegative revision; canonical ISO strings whose `new Date(value).toISOString()` equals the input; fingerprint `/^[0-9a-f]{64}$/`. B already exports `parseSerializedFsrsSchedulerProfile`, `serializeFsrsSchedulerProfile`, `parseSerializedFsrsCardSnapshot`, `serializeFsrsCardSnapshot`, `parseFsrsCardSnapshot`, and review-log codecs. Wrap those parsers in Zod refinements, not new model validators. Profile JSON must equal canonical serialization after exact reconstruction; pre-card JSON must equal canonical card serialization. Preserve original `fsrsReviewLog` text in legacy rows even if its field order is not canonical.

Unknown context requires `schedulerProfileId === null && preCardJson === null`. Captured and legacy-derived context require both; legacy-derived refers to a recorded compatibility recipe and recovered pre-card, not a claim of known original profile. C does not create either kind. Present assessment JSON must parse the strict v1 schema and its final rating must agree with its owning current attempt; null remains explicit unknown assessment evidence.

Legacy inference is a shared pure owner for backup normalization and preparation:

```ts
export function normalizeLegacyPracticeStorage(
  attempts: PracticeStorageReferences['attempts'],
): PracticeStorageData {
  const byCard = new Map<string, (typeof attempts)[number][]>()
  for (const attempt of attempts) {
    const group = byCard.get(attempt.cardId) ?? []
    group.push(attempt)
    byCard.set(attempt.cardId, group)
  }
  const reviewEvidence: PracticeReviewEvidenceRecord[] = []
  for (const [cardId, group] of byCard) {
    group.sort(
      (a, b) =>
        Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    group.forEach((attempt, index) =>
      reviewEvidence.push({
        reviewAttemptId: attempt.id,
        cardId,
        applicationSequence: index + 1,
        revision: 0,
        sequenceSource: 'legacy-inferred',
        schedulingEvidenceKind: 'unknown',
        schedulerProfileId: null,
        preCardJson: null,
        assessmentEvidenceJson: null,
      }),
    )
  }
  return {
    schedulerProfiles: [],
    reviewEvidence,
    generations: [],
    commandReceipts: [],
  }
}
```

Use this deterministic code-unit ID tie comparator only for legacy scheduling metadata. Keep current Practice `createdAt,id` readers and Analytics cohort comparator unchanged. Never infer revision from `updatedAt`; previous correction count is unknown.

Trusted context requires its own matching native log, not only separately valid JSON. Create `assertFsrsReviewLogMatchesPreCard` in `src/lib/fsrs/domain/review-log-snapshot.ts` and export through `src/lib/fsrs/index.ts`; call it for every captured/legacy-derived evidence row after parsing its profile/pre-card/log. Test in `src/lib/fsrs/domain/review-log-snapshot.test.ts` using native facade results for each state, short-term/long-term profiles and delayed New review. Reject a structurally valid pre-card copied from another event before any replacement. The helper belongs to the FSRS boundary because it encodes the pinned native log semantics:

```ts
export function assertFsrsReviewLogMatchesPreCard(
  value: FsrsReviewLogSnapshot,
  preCard: FsrsCardSnapshot,
  profile: FsrsSchedulerProfile,
): void {
  const log = parseFsrsReviewLogSnapshot(value)
  assertValidFsrsCardSnapshot(preCard)
  const expectedScheduledDays =
    preCard.state === 'new' && !profile.parameters.enableShortTerm
      ? 0
      : preCard.scheduledDays
  if (
    log.state !== preCard.state ||
    log.stability !== preCard.stability ||
    log.difficulty !== preCard.difficulty ||
    log.lastElapsedDays !== preCard.elapsedDays ||
    log.learningSteps !== preCard.learningSteps ||
    log.scheduledDays !== expectedScheduledDays ||
    log.dueAt !== (preCard.lastReviewAt ?? preCard.dueAt).toISOString()
  ) {
    throw new Error('FSRS review log does not match its recorded pre-card.')
  }
}
```

The caller validates the exact supported immutable profile before invoking this helper. Missing logs reject trusted context but remain valid for unknown legacy evidence. This compares independently recorded pre-state; it does not replay history, reconstruct unknown profiles or reschedule cards.

`validatePracticeStorageData` first parses detached storage and builds duplicate-checking maps of profile IDs/canonical JSON, attempt IDs, card IDs and evidence IDs/sequences. Require exactly one evidence row for each retained attempt and no extras. Each evidence `cardId` equals its attempt's durable owner; card and attempt problem slugs agree. Validate all current card snapshots with B's card codec. A null log is allowed unknown evidence; a present log must decode and its rating/time match its current attempt. Validate profile references and pre-card dates; a pre-card's nonnull last review cannot exceed the owning event time. Do not require card reps to equal retained history length, infer raw-card provenance or replay schedules.

Generation arrays may be empty for imported/preflight input, including v6 (`requireActiveGenerations: false`, the default). A nonempty array must have exactly one `local` row with null problem slug, all other scope IDs exactly `problem:${problemSlug}`, unique scope/problem identities and existing problem owners. With `requireActiveGenerations: true`, require a problem scope for every slug appearing in practice rows/cards/attempts as well as the local row. Matching current exports use this stricter mode.

Receipt validation must use its historical evidence:

```ts
const summary = practiceReceiptCommandSummarySchema.parse(
  JSON.parse(row.commandSummaryJson),
)
const result = practiceReceiptAcknowledgementSchema.parse(
  JSON.parse(row.resultJson),
)
parsePracticeGenerationKey(row.generationKey)
if (
  row.operation !== result.operation ||
  row.problemSlug !== result.problemSlug ||
  row.cardId !== result.cardId ||
  row.reviewAttemptId !== result.reviewAttemptId ||
  row.applicationSequence !== result.applicationSequence ||
  row.revision !== result.revision ||
  summary.rating !== result.rating ||
  summary.reviewedAt !== result.reviewedAt
)
  throw new Error('Invalid Practice receipt acknowledgement.')
if (
  row.revision > currentEvidence.revision ||
  row.applicationSequence !== currentEvidence.applicationSequence ||
  result.reviewedAt !== owningAttempt.reviewedAt
)
  throw new Error('Invalid Practice receipt event association.')
if (
  row.operation === 'save' &&
  (summary.targetAttemptId !== null ||
    summary.expectedRevision !== null ||
    row.revision !== 0)
)
  throw new Error('Invalid Practice Save receipt.')
if (
  row.operation === 'update' &&
  (summary.targetAttemptId !== row.reviewAttemptId ||
    summary.expectedRevision === null ||
    row.revision !== summary.expectedRevision + 1)
)
  throw new Error('Invalid Practice Update receipt.')
```

Also require existing same-problem card/attempt targets, result profile reference according to the result's own historical evidence kind, internal result card/log validity, `result.dueAt === result.card.dueAt`, `result.card.lastReviewAt === result.reviewedAt`, `result.card.reps >= 1`, `result.card.state !== 'new'`, and own log rating/time association. Unknown historical result requires null profile; captured/legacy-derived result requires a resolved exact profile. Validate status against the acknowledgement's own rating/card, allowing its own explicitly suspended status; never use today's status. Never compare historical accepted rating/due/card/profile against today's corrected event or card. Never require the receipt generation key to equal imported active generations; historical generations are legitimate and inert after replacement.

Legacy/unknown preflight deliberately does not require `card.reps === retainedAttempts.length`, current-card last review to equal the maximum application-sequence event, or monotonic event times. C still selects Update by `createdAt,id`, so its target can have an earlier inferred application sequence. Validate every present log against its own event time/grade; D later introduces ordinary backdating guards.

Meaningful historical receipt test:

```ts
it('preserves a Good revision-1 receipt after the event became Again at revision 2', () => {
  const fixture = makeStorageFixture()
  fixture.references.attempts[0]!.rating = 'again'
  fixture.storage.reviewEvidence[0]!.revision = 2
  fixture.storage.commandReceipts[0]!.revision = 1
  expect(() =>
    validatePracticeStorageData(fixture.storage, fixture.references),
  ).not.toThrow()
})
```

The fixture must generate its own result card/log with B's facade for Good before changing the current attempt to Again and replacing the current log accordingly. Reusing one current result as historical evidence would make this test ineffective.

- [x] Run the focused domain suite; expect PASS for legitimate legacy/captured/historical fixtures and failure before mutation for malformed input.

## Task 1C: Practice storage repository, preparation and public server APIs

**Depends on:** 1A and 1B.

**Create:** `src/features/practice/data/practice-storage-repository.ts`, `src/features/practice/data/practice-storage-repository.test.ts`, `src/features/practice/server/practice-storage-service.ts`. **Modify:** Practice public index, `src/platform/db/instance.ts`, `src/platform/db/instance.test.ts`, Background app DB bridge and its test.

- [x] Add failing repository tests: canonical profile dedup, immutable profile catalog, complete legacy preparation without old writes, unchanged generation on repeated prepare, targeted generation rotation and sibling preservation, replacement fresh tokens, rollback restoration and historical imported receipts preserved.
- [x] Run `rtk npm run test -- src/features/practice/data/practice-storage-repository.test.ts src/extension/background/app-db.test.ts`; expect missing exports/mock failure.
- [x] Expose only these public server functions to Backup/Background:

```ts
export function readPracticeStorageData(db: Db): Promise<PracticeStorageData>
export function preparePracticeStorage(db: Db, now?: Date): Promise<void>
export function validatePracticeStorage(db: Db): Promise<void>
export function replacePracticeStorageDataInTransaction(
  tx: Db,
  storage: PracticeStorageData,
  now?: Date,
): Promise<void>
export function clearPracticeStorageDataInTransaction(tx: Db): Promise<void>
export function rotateProblemPracticeGenerationInTransaction(
  tx: Db,
  problemSlug: string,
  now?: Date,
): Promise<void>
```

These delegate to the data repository. Public pure schemas/types/normalization/preflight stay in Practice domain; export through `@/features/practice`. Backup imports public server functions or domain exports and passes its validated payload; never `features/practice/data/*`.

Repository internal methods needed by Practice writes:

```ts
export function createPracticeStorageRepository(
  db: Db,
): PracticeStorageRepository
export interface PracticeStorageRepository {
  readStorageData(): Promise<PracticeStorageData>
  readReferences(): Promise<PracticeStorageReferences>
  prepareInTransaction(tx: Db, now: Date): Promise<void>
  readReviewEvidence(
    tx: Db,
    reviewAttemptId: string,
  ): Promise<PracticeReviewEvidenceRecord | null>
  ensureProblemGenerationInTransaction(
    tx: Db,
    problemSlug: string,
    now: Date,
  ): Promise<PracticeGenerationContext>
  appendUnknownReviewEvidenceInTransaction(
    tx: Db,
    input: { reviewAttemptId: string; cardId: string },
  ): Promise<void>
  incrementUnknownReviewRevisionInTransaction(
    tx: Db,
    reviewAttemptId: string,
  ): Promise<void>
  replaceInTransaction(
    tx: Db,
    storage: PracticeStorageData,
    now: Date,
  ): Promise<void>
  clearInTransaction(tx: Db): Promise<void>
  rotateProblemGenerationInTransaction(
    tx: Db,
    problemSlug: string,
    now: Date,
  ): Promise<PracticeGenerationContext>
}
```

C does not expose receipt creation/deduplication to runtime. Its bulk storage read/import schema is D's foundation; do not add per-command lookup or profile-creation APIs before production callers exist.

Canonical profile imports use B's exact codec and SQLite's unique `profileJson` constraint. The C bulk importer inserts validated immutable records and exposes no profile update API. Record IDs stay opaque; equivalent imported profile content must not acquire a second conflicting catalog identity during preflight. D adds get-or-create behavior only when live captured scheduling needs a production caller.

Preparation inside one transaction: read owning references; validate card/present-log shape and ownership; infer all metadata only when the sidecar is empty for a given legacy card; reject partially covered cards instead of renumbering existing sequences; insert missing inferred evidence; ensure one local token; ensure per-problem scopes for the union of practice/cards/attempts; validate the final complete Practice storage with active-generations required. Never call FSRS scheduling, rebuild aggregates, rewrite existing logs or seed settings. Repeated preparation changes no token, row or timestamp.

Replace inside the already open Backup transaction: validate normalized data before any clear in the owning Backup preflight; insert profiles first, evidence second, receipts after targets exist; discard imported active generation rows; mint a fresh local row and fresh problem scopes for every applicable slug. Historical receipts retain their original generation keys/JSON. Global reset clears all four side tables and prepares fresh local state after catalog seed. If insertion/seed/final registry validation fails, the surrounding transaction rolls back generations and all original data.

Targeted reset: delete receipts for its problem, delete that problem's evidence (or let attempt/card cascades do so), rotate only `problem:${slug}` and preserve the existing local token and every sibling problem token. Profiles remain immutable even when temporarily unreferenced; C adds no garbage-collection policy.

Background preparation implementation:

```ts
beforePublish: async (handle, context) => {
  const skipHistoricalTaxonomy =
    context.kind === 'upgrade' &&
    context.fromFingerprint === legacyFsrsMigrationFingerprint
  if (!skipHistoricalTaxonomy) {
    await reconcileTopicTaxonomy(handle.db, {
      legacy: context.kind === 'upgrade',
      now: new Date(),
      catalogue: {
        topics: seedTopics,
        aliases: seedTopicAliases,
        relations: seedTopicRelations,
      },
    })
  }
  await preparePracticeStorage(handle.db)
},
validateCurrentData: (handle) => validatePracticeStorage(handle.db),
```

Matching-current snapshots still skip prepare/publication and must already have valid initialized storage. Add `validateCurrentData?: (handle: DbHandle) => Promise<void>` to `AppDbOptions` in `src/platform/db/instance.ts`; invoke it after schema/integrity checks only when `candidateFingerprint === fingerprint`. The existing `openSnapshot.validate` call already covers matching opens and prepared fresh/upgraded candidates. Background supplies `validatePracticeStorage(handle.db)`, a public Practice server function that reads owned references/storage and delegates `validatePracticeStorageData(..., { requireActiveGenerations: true })`. It performs no repair, scheduling, token rotation or writes. Feature imports remain outside Platform. Add matching-current incomplete evidence and missing local/problem scope rejection tests comparing original bytes/tokens; add fresh/upgrade callback ordering and validation-failure nonpublication tests. Fresh test database helpers can accept an optional generic `prepare(handle)` callback; they must not import a feature into Platform. Practice/Backup integration tests call the public preparation service explicitly, or use a shared `src/testing` helper that composes them. Low-level schema tests can remain unprepared.

- [x] Extend `app-db.test.ts`: through-0009 calls Practice prep exactly once while taxonomy is skipped; fresh/v7/v8 call both; preparation rejection stops publication.
- [x] Run focused repository/bridge tests; expect PASS.

## Task 1D: Transitional current writes and opaque identities

**Depends on:** 1C; runs before any production export of v6.

**Modify:** `src/features/practice/data/practice-repository.ts`, `src/features/practice/server/practice-review-workflow.ts`, `src/features/queue/server/queue-service.ts`, `src/features/problems/data/problems-repository.ts`. **Tests:** existing `src/features/practice/practice-core.integration.test.ts`, `src/features/problems/data/problems-repository.test.ts` and `src/features/queue/queue-track-independence.integration.test.ts` for stored-ID reads. Extend these existing integrations; do not add a separate Queue server suite solely for this change.

- [x] Add failing tests using the populated fixture's `card-custom` identity: details/history returns stored ID; genuine Save updates that same row and keeps prior attempt references; unknown Update keeps same ID, sequence and event time, increments only its revision; reset rotates only target scope. Add imported captured and legacy-derived history cases that reject without any card/attempt/evidence/aggregate/track write. Include captured custom-profile event followed by C's unknown Save, then Update of the unknown latest event; this must also reject.
- [x] Run `rtk npm run test -- src/features/practice/practice-core.integration.test.ts src/features/queue/queue-track-independence.integration.test.ts src/features/problems/data/problems-repository.test.ts`; expect opaque-ID/metadata/guard failures.
- [x] Add an identity-preserving private loader and retain existing public `getCard` snapshot return:

```ts
private async getCardRecord(problemSlug: string, cardKind: FsrsCardKind, db: PracticeReadDb) {
  const rows = await db.select().from(fsrsCards).where(and(
    eq(fsrsCards.problemSlug, problemSlug), eq(fsrsCards.cardKind, cardKind),
  )).limit(1)
  const row = rows[0]
  return row ? { id: row.id, card: mapFsrsCardRow(row) } : null
}
```

Save resolves `record` first, then `cardId = record?.id ?? createFsrsCardId(problemSlug, cardKind)` and `currentCard = record?.card ?? createInitialFsrsCard(reviewedAt)`. Existing `scheduleReview` and current retention/defaults stay unchanged. Ensure the local/problem scopes inside its transaction; after inserting the attempt insert unknown evidence with `max(existing applicationSequence for durable card) + 1`, revision 0, sequenceSource applied, null profile/pre-card/assessment. Do not renumber inferred records or reject backdating in C.

Update first resolves stored card identity and existing `createdAt,id` attempts. Load the evidence for every event the existing full replay would consume. Before scheduling or writing:

```ts
const historyEvidence = await Promise.all(
  attempts.map((attempt) => storage.readReviewEvidence(writeDb, attempt.id)),
)
if (historyEvidence.some((evidence) => !evidence)) {
  throw new Error('Practice storage requires preparation before Update.')
}
if (
  historyEvidence.some(
    (evidence) => evidence?.schedulingEvidenceKind !== 'unknown',
  )
) {
  throw new Error(
    'This history has recorded scheduling evidence. Update requires the guarded correction workflow.',
  )
}
```

The public core writer and workflow both enter the existing transaction; this guard must run before track reconciliation and every database mutation. Leave the current full replay path intact only when every consumed event has unknown evidence. After successful selected-attempt update, set only that metadata row's `revision = previous + 1`; retain `applicationSequence`, `sequenceSource`, unknown kind and all null context fields. Increment the `createdAt,id` target's revision even if it has an earlier inferred sequence; do not substitute the highest sequence event. A failed replay/card/track mutation rolls back revision too. Do not clear earlier imported evidence or reinterpret it during replay. Where practical, derive existing `canOverrideLatestReview: false` for protected replay histories so the read contract explains the same capability; the explicit transactional error remains mandatory.

Details resolves stored card before selecting history. Return canonical prospective ID only if no durable card exists. Keep `readReviewAttempts.orderBy(asc(createdAt), asc(id))` unchanged; scheduling sequence is persisted now and activated coherently with D's identity/chronology guards.

For reordered unknown histories, the `createdAt,id` Update target can differ from the last chronological replay event. Preserve the existing selected target and final replayed card, but attach the replay log produced for that target's own event using the same stable chronological order. Clear the selected event's optional assessment evidence when correcting it because C records no new assessment policy. Add regression proof that the corrected storage still passes current validation; do not attach another event's log or retain its former final-rating evidence.

Queue: add `id: fsrsCards.id` to `queueCandidateSelection.card` and `id: string | null` to `QueueCardRow`; `mapQueueCandidate` uses `row.card?.id ?? canonicalProspectiveId`. Problems `readLibraryRows` already selects whole card: use `row.card?.id ?? canonicalProspectiveId` in `deriveNormalizedPracticeState`. Neither change alters eligibility, ranking, due labels or defaults.

An imported opaque ID can equal another problem's canonical prospective ID. New Save uses the canonical ID only when it is free; otherwise allocate a fresh UUID. Card upsert resolves conflicts through the unique owning `(problemSlug,cardKind)` pair, so an unrelated primary-key collision rejects instead of overwriting another problem. Add a two-problem collision regression that validates both histories and preserves the existing sibling's data.

Targeted `resetPracticeScheduleInTransaction` deletes its receipts before deleting its reviews/cards, then invokes `rotateProblemPracticeGenerationInTransaction` within that same transaction before returning details. Global reset/restore is the public Backup/Practice replacement path from 1C. Preserve untouched sibling tokens and data, suspension and existing keepLog behavior. Do not retain orphan historical receipts after an intentional target reset.

- [x] `setPracticeSuspended` can create a Practice row for an untouched problem. Put that insertion/update and `ensureProblemGenerationInTransaction(tx, slug, now)` in one transaction; the no-op unsuspend of a never-started problem may remain read-only. This keeps current export's required active problem scopes complete. Add untouched suspend → export → restore/reopen proof, keeping local/sibling tokens intact.
- [x] Before appending a sequence or incrementing a revision, reject an unsafe `next` value with `Number.isSafeInteger(next)`. Add imported `Number.MAX_SAFE_INTEGER` sequence/revision Save/Update cases and assert full rollback.
- [x] Run the focused suites; expect PASS. Repeat opaque Save/Update after export→restore, not only direct DB insertion.

## Concrete Data And Service Interfaces

Backup v6 keeps every existing base row unchanged and adds these arrays under `data.practice`:

```ts
type BackupPracticeEvidence = {
  schedulerProfiles: Array<{
    id: string
    profileJson: string
    createdAt: string
  }>
  reviewEvidence: Array<{
    reviewAttemptId: string
    cardId: string
    applicationSequence: number
    revision: number
    sequenceSource: 'legacy-inferred' | 'applied'
    schedulingEvidenceKind: 'unknown' | 'captured' | 'legacy-derived'
    schedulerProfileId: string | null
    preCardJson: string | null
    assessmentEvidenceJson: string | null
  }>
  generations: Array<{
    scopeId: 'local' | `problem:${string}`
    problemSlug: string | null
    generationToken: string
    createdAt: string
  }>
  commandReceipts: Array<{
    generationKey: string
    commandId: string
    payloadFingerprint: string
    operation: 'save' | 'update'
    problemSlug: string
    cardId: string
    reviewAttemptId: string
    applicationSequence: number
    revision: number
    acceptedAt: string
    commandSummaryJson: string
    resultJson: string
  }>
}
```

`generationKey` is canonical `JSON.stringify([localGenerationToken, problemGenerationTokenOrNull])`. Historical tokens have no active-generation foreign key. `generations: []` is explicit unknown lifecycle evidence and is valid in normalized legacy **and** v6 files; successful replacement always creates a fresh active local scope. Reuse the root storage task's exact public `PracticeStorageData`, `PracticeStorageReferences`, `validatePracticeStorageData`, `normalizeLegacyPracticeStorage`, and strict record/command-summary/acknowledgement schemas from `@/features/practice/domain`.

Keep synchronous validation for existing callers. Share one synchronous, detached full preflight for validation and restoration:

```ts
type PreparedBackupRestore = Readonly<{
  data: BackupData
  summary: BackupSummary
}>

function prepareFullBackupRestore(input: unknown): PreparedBackupRestore
function validateFullBackup(input: unknown): BackupSummary
async function clearAndRestoreBackupData(
  db: Db,
  prepared: PreparedBackupRestore,
  now?: Date,
): Promise<void>
```

`prepareFullBackupRestore` parses and normalizes supported versions, reconciles taxonomy, parses the reconciled current data again, and validates all catalog/track/Practice invariants. Its data is detached from caller-owned objects. `validateFullBackup` returns its summary without writing. No payload hash or UUID is generated in preflight: explicit status/retry endpoints retain the pending result and prevent another destructive operation until settlement.

The repository rechecks the prepared data's complete invariants **before** entering its destructive transaction. This closes direct-call bypasses in addition to the service and runtime paths. Reset has no imported payload; it uses the existing transactional fresh-install seed path plus Practice generation initialization.

## Task 2A: Freeze Legacy Readers And Add Deterministic v6 Normalization

**Files:**

- Modify: `src/features/backup/api/backup-contracts.ts`
- Create: `src/features/backup/api/backup-legacy-contracts.ts`
- Create: `src/features/backup/domain/backup-normalization.ts`
- Modify: `src/features/backup/index.ts`
- Modify: `src/features/sync/domain/sync-envelope.test.ts`
- Update only empty/current `BackupFile` fixture shapes in Sync service, Backup hooks/UI and background handler tests when v6 requires its four arrays. Task 3 owns all response and recovery behavior changes in those files.
- Test: `src/features/backup/api/backup-contracts.test.ts`
- Consume: the root plan's public Practice metadata schemas and deterministic legacy-evidence helper; do not import private `practice/data` implementation files.

- [x] Add frozen fixtures for each version 1–5, independent of `backupSchemaVersion` and current v6 builders. Include opaque card IDs, a valid New card with zero memory/counters and null last review, tied/corrected attempts, null legacy logs, suspension, existing track progress and 75% retention settings.
- [x] Add red tests asserting all old schemas still accept their shipped required fields and reject v6 metadata fields supplied to their strict old Practice object. Add a genuine terminal-v5 fixture: changing only its numeric version from a current fixture is insufficient.
- [x] Run `rtk npm run test -- src/features/backup/api/backup-contracts.test.ts src/features/sync/domain/sync-envelope.test.ts`; the new v6 assertions must fail before implementation while legacy fixtures expose accidental shape sharing.
- [x] Freeze the old card/attempt/Practice definitions and explicit v1–v5 data/file schemas in `backup-legacy-contracts.ts`. Preserve shipped v1 progress, v2 topic timestamps, v3 taxonomy, v4 external-progress defaults and strictness. The intentionally version-tolerant settings JSON validator continues validating current Settings values without changing the stored settings string.
- [x] Add an explicit v1→v5 normalization chain and `normalizeBackupV5ToV6`. Never terminate a legacy step in the mutable current `backupFileSchema`. Set `backupSchemaVersion = 6`; retain `minimumSupportedBackupSchemaVersion = 1` and current friendly unsupported-version messages.
- [x] The final legacy normalization adds exactly one inferred evidence row per attempt using per-card `reviewedAt,id` order. Set revision zero, unknown scheduling provenance, null profile/pre-card/assessment fields, and empty profile/generation/receipt arrays. Preserve every old field, including original JSON log and settings strings. Do not infer the original retention/profile from today's settings.
- [x] Define v6 strict metadata row schemas from the public Practice schemas. Keep `generations: []` valid. Require all four metadata arrays in genuine v6 exports; missing arrays are not silently treated as legacy.
- [x] Verify normalization is deterministic, does not mutate caller objects, and leaves original base rows byte-equivalent where existing approved taxonomy/version conversions permit. Test v6 fields do not loosen the strict old readers.
- [x] Repeat the focused command; expect all suites to pass. Retain sync envelope version 1 in assertions and check v6 is carried only as its nested backup.

## Task 2B: Complete Preflight Before Every Restore Delete

**Files:**

- Create: `src/features/backup/domain/backup-preflight.ts`
- Modify: `src/features/backup/server/backup-service.ts`
- Modify: `src/features/backup/data/backup-repository.ts`
- Test: `src/features/backup/server/backup-service.test.ts`
- Test: `src/features/backup/data/backup-repository.test.ts`
- Consume: public Practice domain evidence/receipt parsers and Phase B `src/lib/fsrs` card/log/profile codecs.

- [x] Add table-driven invalid payload tests: negative/nonfinite memory, unsafe counters, non-New missing last review, malformed present log, log rating/time mismatch, unsupported or clipped profile, duplicate profile IDs/canonical profile JSON, missing profile, missing/duplicate attempt evidence, cross-card evidence ownership, duplicate sequences, unsafe revision, malformed assessment evidence, invalid generation scope/problem pair, malformed generationKey, duplicate receipt key, dangling receipt target, and forged historical acknowledgement context.
- [x] Each invalid restore case spies on the destructive entry point or compares all existing rows and generations before/after rejection. It must reject before `clearAllTables` or any delete, not merely prove eventual rollback. Run `rtk npm run test -- src/features/backup/server/backup-service.test.ts src/features/backup/data/backup-repository.test.ts`; the new invariant cases must fail initially.
- [x] Move existing catalog/track/reference/duplicate validation into the shared full preflight; retain all current ownership and active-session checks. Reconcile the topic registry before returning prepared data and validate the reconciled result again.
- [x] Validate cards by constructing the live snapshot with `Date` values and calling the Phase B card codec; valid New zero/null cards succeed. Do not require card reps to equal retained history length. Do not compare saved memory/due against a replayed inferred legacy history.
- [x] Parse every non-null log through `parseSerializedFsrsReviewLogSnapshot` and require `log.rating === attempt.rating` and equal `reviewedAt` instants. A malformed present string rejects; a null log remains explicit unknown. Do not compare the log's pre-state due instant with the current card's due instant.
- [x] Parse every immutable profile with `parseSerializedFsrsSchedulerProfile`, then use `serializeFsrsSchedulerProfile` for canonical-content collision checks. Unsupported library/model/schema versions, invalid weights and values changed by native normalization reject. Do not implement a second parameter normalizer.
- [x] Build the exact `PracticeStorageReferences` from problems, practice rows, live card snapshots and attempts, then delegate side-table validation to `validatePracticeStorageData`. Require one evidence row per attempt, durable card ownership, unique positive safe per-card sequence, nonnegative safe revision, valid source/kind, and resolved profile references. Unknown requires null profile/pre-card. Captured/legacy-derived require a valid pre-card and profile. Assessment provenance is independent: null remains unknown, while present v1 evidence must parse and match its owning current attempt's final rating. Preserve explicit legacy-derived scheduling provenance.
- [x] Preserve backdated, reordered and tied legacy/unknown histories. Do not require nondecreasing review times, a sequential context chain around unknown predecessors, current-card last review equal to the highest sequence event, or reps equal to retained attempt count. C's temporary Update guard rejects any nonunknown scheduling evidence in the entire history consumed by existing full replay before any write; D later activates guarded correction and chronology.
- [x] Validate generations by scope identity and referenced problem: local has `problemSlug: null`; `problem:<slug>` matches its non-null problem. Reject duplicate scopes. Empty arrays remain valid input; do not create tokens during preflight.
- [x] Validate receipts against their **own** strict historical command summary and acknowledgement. Require row/result identities and operation/sequence/revision agreement; supported result status consistent with its own rating/card; valid historical result card/log; own scheduling kind/profile relation; referenced profile existence; acknowledgement revision no greater than the current event revision; update target/expected revision coherent with its acknowledgement. Never compare historical rating, due, memory, profile, or result status with the attempt/card's current corrected values. Historical generation tokens need not equal active tokens.
- [x] Add the positive correction fixture: receipt Good/revision 1 survives current attempt Again/revision 2 with a different saved card. Corrupt only that receipt's own acknowledgement rating/time/target and prove rejection. Include an earlier save receipt followed by a newer event.
- [x] Keep `restoreFullBackup`, `restoreValidatedBackupData`, and direct `clearAndRestoreBackupData` routed through the same preflight. The latter accepts prepared input and performs its invariant recheck before the transaction; no typed `BackupFile` shortcut is trusted merely because Sync parsed the envelope earlier.
- [x] Repeat focused tests; expect all invalid cases to preserve existing rows and all positive historical/legacy cases to pass without scheduling.

## Task 2C: Export Evidence And Rotate Fresh Generations In Replacement Transactions

**Files:**

- Modify: `src/features/backup/data/backup-repository.ts`
- Modify: `src/features/backup/server/backup-service.ts`
- Test: `src/features/backup/data/backup-repository.test.ts`
- Test: `src/features/backup/server/backup-service.test.ts`
- Consume: the root storage task's public Practice server replacement insertion/rotation APIs and exact schema exports.

- [x] Extend populated round-trip tests with profiles, unknown/captured/legacy-derived evidence, local/problem scopes, and historical correction receipts. Assert all old base rows are unchanged, profile parameter values round-trip exactly, and settings JSON is unchanged. Export still excludes secrets and sync tokens.
- [x] Add red tests that invalid input and transaction failure leave generations unchanged; a committed restore replaces imported local and applicable problem tokens with fresh values; and restoring the same earlier backup in a later settled operation creates different fresh tokens.
- [x] Call public `readPracticeStorageData(db)` from `readBackupData` for the four side-table arrays and convert base-row timestamps to ISO as before. Validate current exports with `validatePracticeStorageData(storage, references, { requireActiveGenerations: true })`; normalized/imported empty generations remain allowed under its default mode. Keep exported profile/log/card evidence JSON intact. Do not create receipt history copies or full PracticeDetails responses.
- [x] Call public `clearPracticeStorageDataInTransaction(tx)` before deleting attempts/cards; it clears receipt/evidence children, profiles and active-generation rows in that same transaction. Preserve existing catalog/track clear/insert order.
- [x] Insert base rows unchanged, then call public `replacePracticeStorageDataInTransaction(tx, storage, now)` to insert profiles/evidence/receipts and create fresh local/problem scopes for every applicable Practice slug. Historical receipt generationKey values are preserved. Discard every imported active scope token; an empty generation list still creates the fresh local scope. Do not install the backup's former active tokens.
- [x] Extend fresh reset by calling `replacePracticeStorageDataInTransaction(tx, { schedulerProfiles: [], reviewEvidence: [], generations: [], commandReceipts: [] }, now)` after its clear/seed steps, initializing a fresh local token within the existing transaction without a nested preparation transaction. The root Practice targeted-reset task deletes receipts for the reset problem as target cleanup in that same transaction, then calls `rotateProblemPracticeGenerationInTransaction(tx, slug, now)` to rotate only its problem scope; this is not receipt retention pruning.
- [x] Do not introduce receipt pruning in C. Each receipt is fixed-size, but deleting otherwise valid receipts would change D's future deduplication guarantee. No full-history response is stored in each row.
- [x] Run `rtk npm run test -- src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts src/features/practice/practice-core.integration.test.ts`; expect export/import/generation tests and opaque-ID Practice reads/writes to pass.

## Task 3A: Narrow Pending Replacement Coordinator And Authenticated Recovery

**Files:**

- Create: `src/features/backup/server/backup-replacement-work.ts` (public callback type only; response schemas remain in `api/backup-contracts.ts`).
- Create: `src/extension/background/backup-replacement.ts`
- Create: `src/extension/background/backup-replacement.test.ts`
- Modify: `src/extension/background/register-handlers.ts`
- Modify: `src/extension/background/import-handlers.test.ts`
- Modify: `src/extension/background/import-handlers.ts` only to clear an obsolete pending import acknowledgement after committed replacement.
- Modify: `src/extension/background/runtime-policy.ts`
- Modify: `src/extension/background/runtime-policy.test.ts`
- Modify: `src/extension/messaging.ts`
- Modify: `src/features/backup/api/backup-contracts.ts`
- Modify: `src/features/backup/server/backup-service.ts` only to expose prepared local restore through the owning service; repository still revalidates before deleting.
- Test: `src/extension/background/register-handlers.test.ts`

Use these response boundaries; the names and discriminants are part of the reviewed plan:

```ts
type BackupReplacementKind = 'restore' | 'reset' | 'gist-pull'
type BackupReplacementPending = {
  kind: BackupReplacementKind
  summary: BackupSummary | null
}
type BackupReplacementState =
  | { status: 'idle' }
  | ({ status: 'persistence-pending' } & BackupReplacementPending)
  | ({ status: 'durable-sync-metadata-pending' } & BackupReplacementPending)
type BackupReplacementResult =
  | { status: 'no-pending' }
  | ({ status: 'persistence-pending' } & BackupReplacementPending)
  | ({
      status: 'durable'
      syncMetadataPending: boolean
    } & BackupReplacementPending)

type BackupReplacementWork = {
  kind: BackupReplacementKind
  commit: () => Promise<BackupSummary | null>
  flush: () => Promise<unknown>
  onDurable: () => Promise<unknown>
  finishSyncMetadata: () => Promise<unknown>
}

type BackupReplacementCoordinator = {
  getState(): BackupReplacementState
  assertIdle(): void
  run(work: BackupReplacementWork): Promise<BackupReplacementResult>
  retry(): Promise<BackupReplacementResult>
}
```

- [x] Write isolated coordinator tests with deferred commit/flush/metadata callbacks. Assert transaction rejection leaves idle; commit+flush rejection retains persistence-pending; retry calls flush again without calling commit; no durable invalidation before successful flush; metadata rejection retains durable-sync-metadata-pending; metadata retry does not flush or invalidate again; settlement releases state; a later intentional identical restore invokes commit again.
- [x] Run `rtk npm run test -- src/extension/background/backup-replacement.test.ts`; expect the missing module/API to fail.
- [x] Implement one coordinator instance owned by background composition. Before commit, assert idle. After successful commit retain only fixed-size kind/summary and the flush/durable/metadata continuation callbacks; drop the commit closure and detached full backup from persistent pending state. Store no generic queue/outbox record and retain no historical successful deduplication entry.
- [x] A flush failure returns the persistence-pending union instead of a generic failure. A successful flush transitions to durable, triggers broad invalidation once, then attempts strict sync metadata completion. An invalidation transport failure is best-effort after proven durability and must never cause another replacement. Metadata failure returns durable with `syncMetadataPending: true`; only the metadata continuation is retried.
- [x] For local restore/reset, metadata completion strictly awaits `markSyncLocalDataChanged()` after durable publication. Its rejection retains durable metadata-pending state and the pending gate; do not use the error-swallowing best-effort dirty helper here. After dirty marking succeeds, automatic push scheduling remains best-effort. Keep ordinary local mutations' existing best-effort metadata policy unchanged. While a replacement remains pending, the coordinator gate prevents remote application even if the dirty mark is unavailable.
- [x] Also protect local replacement across worker restart: after idle admission and full preflight, strictly save the existing sync dirty marker **before** committing restore/reset. The independent 250 ms DB publication timer can publish a commit even before explicit flush, so marking only afterward can leave durable local data falsely clean after the volatile gate disappears. Marker failure prevents commit and token rotation. Rollback preserves original rows/generations and may leave a conservative dirty flag; never clear that safety marker. Keep the planned post-durability completion and pending gate. Gist-origin replacement needs no local pre-marker. Add invalid-input-before-mark, failed-marker-before-commit, rollback-after-marker and restart-after-durable-completion-failure/automatic-dirty-pull-blocked regressions. A public `restorePreparedFullBackup(db, prepared)` service operation can consume the detached preflight result without preparing it again; `restoreFullBackup` delegates to it, and the repository's before-transaction recheck remains mandatory.
- [x] Register `backup.getPendingReplacement` and `backup.retryPendingReplacement` with strict dashboard requests, response parsing, method registry entries and actual sender authorization. Get-status is read-only and cannot flush. Retry receives no user-supplied payload or operation callbacks.
- [x] Change restore/reset runtime responses to the result union. Execute their prepared replacement via the coordinator inside the existing mutation queue. Preflight failure/transaction rollback still reject normally and leave no pending state.
- [x] Gate ordinary queued work with `assertIdle` before any write, import operation, export, or sync action. Also inject a gated queued `writeMetadata` callback into `syncAutoSync` at background composition: its automatic bookkeeping writes occur after queued sync completes and must not race the frozen replacement patch. Do not gate/requeue service-wide metadata completion. `scheduleAutoPushAfterMutation` only reads metadata and schedules an alarm, so the current inside-queue call does not reenter this writer; prove settlement with a deferred regression. Permit only the authenticated status/retry handlers to bypass that pending gate. Existing imports receive the gated queue wrapper, so their apply/retry paths cannot accidentally publish pending replacement state. Put export inside that queue gate; validation of a selected backup remains read-only and safe.
- [x] An accepted full replacement supersedes any earlier pending content import. Return a narrow `clearPendingPersistence()` function from `registerImportHandlers`, closing only over its existing boolean. Call it inside the mutation queue after a successful restore/reset/Gist transaction commit; leave the flag unchanged on rollback. Otherwise the import's old Retry saving action flushes unrelated replacement data and falsely reports erased content saved. Backup-pending admission already blocks import retry until replacement settles; afterward obsolete import retry must return `repreview`, without flushing or reporting saved. Retain current additive-import and ordinary-write behavior. Test failed import publication → accepted replacement → old import retry returns repreview; transaction rejection retains genuine import retry. Add no generic persistence registry, extra confirmation, or inaccessible replacement blocker after Settings reload.
- [x] Use this specific pending error: `Local data replacement still needs saving. Open Settings > Data Management and choose Retry saving.` Do not silently settle an earlier restore and then accidentally execute a repeated destructive request as a new operation.
- [x] Test unauthorized surface/sender rejection before coordinator access, status without flush, concurrent queued actions, blocked writes/imports/export/sync, and recovery endpoint settlement. Include a new coordinator/worker instance test demonstrating that unflushed in-memory state is not promised to survive restart; existing platform snapshot tests prove the last durable original remains readable.
- [x] Run `rtk npm run test -- src/extension/background/backup-replacement.test.ts src/extension/background/register-handlers.test.ts src/extension/background/import-handlers.test.ts src/extension/background/runtime-policy.test.ts`; expect all pass.

## Task 3B: Configured Gist Pull Uses The Same Coordinator And Confirmed Guard

**Files:**

- Modify: `src/features/sync/server/sync-service.ts`
- Modify: `src/features/sync/server/sync-service.test.ts`
- Modify: `src/extension/background/register-handlers.ts`
- Modify: `src/extension/background/register-handlers.test.ts`
- Test: `src/features/sync/domain/sync-envelope.test.ts`

Keep `SyncServiceDependencies`' existing export/restore/flush/broadcast/metadata mocks. Add one required injected replacement runner to the dependency type, and extend the existing restore guard with explicit confirmed-overwrite context. Existing tests add the runner to their shared dependency factory; every production creator supplies the singleton background runner:

```ts
type RemoteRestoreContext = { confirmLocalOverwrite?: boolean }
type RemoteReplacementRunner = (
  work: BackupReplacementWork,
) => Promise<BackupReplacementResult>

// Existing dependency receives the context as a second argument.
runRemoteRestore?: <T>(
  work: () => Promise<T>,
  context?: RemoteRestoreContext,
) => Promise<T>
runReplacement: RemoteReplacementRunner
```

The serialized result/state types and Zod schemas belong in Backup `api/backup-contracts.ts`; the exact `BackupReplacementWork` callback type belongs in `server/backup-replacement-work.ts`. Sync imports these public Backup types, never an implementation from `extension/background`. The runtime module implements the coordinator; Sync only consumes its injected callable type. The shared service-test dependency factory adds a test runner that invokes the supplied commit/flush/durable/metadata callbacks and returns the durable union; focused resilience tests inject the actual coordinator via a justified test-only runtime import. Do not create a production fallback or second replacement algorithm in Sync.

- [x] Add service tests for v6 inside envelope v1; old versions normalize before restore; invalid complete Practice metadata rejects before destructive work; flush failure reports committed persistence pending; and metadata failure reports the already durable restore. Assert retrying the shared coordinator never invokes `restoreBackup` twice.
- [x] Add a runtime integration test with dirty metadata and `confirmLocalOverwrite: true`. The present runtime guard rejects even a confirmed manual force pull; the new test must fail before the wiring repair. Keep automatic/unconfirmed dirty-pull rejection as a separate test.
- [x] Parse and completely prepare the remote backup before replacement. Capture the Gist ID/version, exported dataUpdatedAt, enabled state and fixed metadata patch once. Pass a work object with commit=`restoreBackup`, flush=`flushDbSnapshot`, onDurable=`broadcastInvalidation`, and finishSyncMetadata=`writeMetadata(capturedPatch)` to the injected runner inside `runRemoteRestore`.
- [x] Propagate manual `confirmLocalOverwrite: true` into the restore context. The runtime queued guard allows dirty replacement only for that explicit authenticated manual intent. Automatic open-check/connect paths pass false/absent and continue rejecting dirty local state observed at application time. Keep remote overwrite confirmations and automatic safe-push behavior intact.
- [x] Preserve the current `SyncActionResult` envelope and enums. Pending publication maps to a retryable error explaining: `Gist data was applied in memory but still needs saving. Open Settings > Data Management and choose Retry saving.` Durable metadata failure reports: `Gist data is saved locally, but sync status still needs saving. Open Settings > Data Management and choose Retry saving.` Error recording must not overwrite the captured continuation or re-run replacement; if writing the error summary also fails, return a redacted result without converting durable data into a generic restore failure.
- [x] Fold automatic open-pull retry-count/time bookkeeping into the same frozen pull patch rather than writing it after `pullRemote`. Capture each scalar timestamp once. Continuations close over only this patch and existing dependencies, never the full Gist/envelope/backup. Likewise, local callbacks capture `surface` separately from the request object; pending state must not retain the full selected backup indirectly through a closure.
- [x] Pending or durable-metadata-error results remain actionable even when both error recording and subsequent status reads fail. Capture redacted metadata/token-status before application and use it as a narrow last-known status fallback for these replacement outcomes. Add fail-read-after-commit coverage; retain existing generic error behavior outside this replacement case.
- [x] A metadata-only retry uses the captured patch; it does not fetch the Gist again, flush again, restore again, or emit duplicate data invalidation. Other writes/sync remain gated until the patch settles, preventing stale metadata from describing a later local dataset.
- [x] Run `rtk npm run test -- src/features/sync/server/sync-service.test.ts src/features/sync/domain/sync-envelope.test.ts src/extension/background/register-handlers.test.ts`; expect unchanged envelope/dirty/confirmation behavior plus passing pending-recovery assertions.

## Task 3C: Minimal Data Management Recovery UI

**Files:**

- Modify: `src/features/backup/api/backup-api.ts`
- Modify: `src/features/backup/api/backup-api.test.tsx`
- Modify: `src/features/backup/components/data-management-screen.tsx`
- Modify: `src/features/backup/components/data-management-screen.test.tsx`
- Modify: `src/features/backup/components/backup-restore-panel.tsx`
- Modify: `src/features/backup/components/reset-local-data-panel.tsx`
- Modify: `src/features/backup/index.ts`
- Modify: `src/platform/query/query-keys.ts`
- Modify: `src/platform/query/cache-invalidation.ts`
- Modify: `src/platform/query/cache-invalidation.test.ts`
- Modify: `src/features/sync/api/sync-api.ts`
- Modify: `src/features/sync/api/sync-api.test.tsx`

- [x] Add `queryKeys.backup` with `all: ['backup']` and `pendingReplacement: () => ['backup', 'pending-replacement']`. Add a dashboard `usePendingBackupReplacement` query and `useRetryPendingBackupReplacement` mutation. Get-status must remain a read-only runtime call.
- [x] Update restore/reset hooks so broad data invalidation occurs only for `status: 'durable'`, including durable metadata-pending results. Refetch the narrow pending and Sync status queries on restore/reset/retry settlement. Sync's existing `useSyncAction.onSettled` also invalidates the pending platform query key so a Gist failure on the same Settings screen reveals recovery immediately; the existing `sync` invalidation tag targets pending replacement too, covering automatic pulls that bypass the action hook. Prove both directions with active query regressions. No deep Backup feature import or repeated data-publication callback is needed.
- [x] Add red UI tests: pending restore stays visible without a success toast; Settings reload reads pending status without flushing; Retry saving invokes only the retry endpoint; successful retry closes/reset-clears the relevant action state; Gist pending state shows the same recovery action; metadata-pending text says data is already saved; no-pending clears stale UI state; and file/restore/reset/export actions remain disabled while pending.
- [x] Use existing `InlineStatus`, `Button`, and confirmation-dialog styling. Persistence text: `Your data was restored, but it still needs saving. Keep this extension open and choose Retry saving.` Use `cleared` for the reset kind. Metadata text: `Your data is saved. Sync status still needs saving.` Label the shared recovery button `Retry saving`. Avoid a new confirmation for retry because it does not replace data.
- [x] Keep actual request-inflight state distinct from coordinator pending state. Close the completed destructive-request confirmation dialog after a pending response while retaining the selected file/draft and showing the accessible recovery button outside it; do not feed coordinator pending into the dialog busy prop that disables Cancel/Escape. Both pending states disable fresh file/restore/reset/export actions. A durable metadata-pending response permits broad data invalidation but retains the recovery panel and admission gate.
- [x] Preserve selected backup/draft context while publication is pending. Only a durable settlement resets the import card and shows the existing restored/cleared success message. The shared recovery panel can represent Gist or reset kinds even when the original dialog was closed or Settings reloaded.
- [x] Run `rtk npm run test -- src/features/backup/api/backup-api.test.tsx src/features/backup/components/data-management-screen.test.tsx src/features/sync/api/sync-api.test.tsx`; expect all pass. Human happy-path and edge-case installed-extension screenshots/recording remain required before review/merge.

## Task 4: Prove the real upgrade and publish the compatibility boundary

**Files:**

- Modify: `src/platform/db/fsrs-preservation.integration.test.ts` and `src/extension/background/app-db.test.ts`.
- Modify: `src/platform/db/snapshot-upgrade.test.ts`, `src/platform/db/open-snapshot.test.ts`, `src/platform/db/instance.test.ts` only where the appended schema changes current fingerprints/expected tables.
- Modify: `docs/architecture.md`, `docs/product.md`, `docs/testing.md`, `CONTRIBUTING.md`, `docs/superpowers/README.md`, `docs/superpowers/plans/2026-10-03-fsrs-remediation.md`.
- Create: `docs/superpowers/handoffs/2026-10-04-fsrs-phase-c-storage-restore.md`.

- [x] Remove the `migration-sql` synthetic `fsrs_upgrade_probe` mock. Assert the production `0010` migration and four actual side tables, and call `preparePracticeStorage` in the custom staged callback. Extend the populated through-0009 fixture proof with this assertion:

```ts
expect(readPreservationRows(upgraded)).toEqual(fixture.rows)
const evidence = upgraded.rawDb.exec({
  sql: 'SELECT review_attempt_id, card_id, application_sequence, revision, sequence_source, scheduling_evidence_kind FROM practice_review_evidence ORDER BY card_id, application_sequence',
  returnValue: 'resultRows',
})
expect(evidence).toHaveLength(6)
for (const row of evidence) {
  expect(row[3]).toBe(0)
  expect(row[4]).toBe('legacy-inferred')
  expect(row[5]).toBe('unknown')
}
const generations = upgraded.rawDb.exec({
  sql: 'SELECT scope_id, generation_token FROM practice_generations ORDER BY scope_id',
  returnValue: 'resultRows',
})
expect(generations.some((row) => row[0] === 'local')).toBe(true)
await flushDbSnapshot()
resetAppDbForTesting()
const reopened = await getBackgroundDb()
expect(readPreservationRows(reopened)).toEqual(fixture.rows)
expect(
  reopened.rawDb.exec({
    sql: 'SELECT scope_id, generation_token FROM practice_generations ORDER BY scope_id',
    returnValue: 'resultRows',
  }),
).toEqual(generations)
```

- [x] Run `rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/instance.test.ts src/extension/background/app-db.test.ts`. Expected first failure: the synthetic-table assertion or new evidence preparation is absent. After production wiring and corrected assertions, expected PASS. Retain all recovery/preparation/publication/schema/collision failure cases and compare original snapshot bytes and earlier recovery records. Add production preparation failure followed by retry and reopen: no original row or recovery overwrite is allowed.

- [x] Update current authority docs with the shipped v6 contract, unknown legacy provenance, imported opaque-ID reuse, fresh reset/restore scopes, temporary protected-evidence Update limitation and Retry saving behavior. Replace CONTRIBUTING's stale claim that fingerprint changes clear local data with the bounded supported-prefix/recovery process. Describe pending worker-restart limits truthfully. Do not label D commands, E cadence/cap, or F previews shipped.

- [x] Add this human checklist to `docs/testing.md` and the handoff. In a disposable installed-extension profile, export a pre-C backup and compare history, due dates, 75% retention, suspension, daily/streak progress and track credit after updating to the new build. Save a new review, correct an unknown event, and reload the extension. Restore the old backup, then export v6 and restore it. Import a valid v6 backup with opaque IDs and historical corrected receipts; verify reads, subsequent Save and protected-evidence Update rejection. Reject malformed logs/profiles/references before replacement. Induce a snapshot publication failure, verify pending messaging, reload the Settings page, retry publication and check one generation rotation. Induce sync metadata failure after a durable pull and retry only metadata. Verify automatic dirty pull blocks and explicitly confirmed manual overwrite succeeds. Restart the worker before publication and verify the last durable snapshot reopens. Attach happy-path and edge-case screenshots or recording with private contents redacted before PR review/merge.

- [x] Run final checks once after independent specification and quality reviews resolve every material issue. The initial full check caught one public-type import violation; focused proof and re-review passed, then the complete check passed on repeat:

```sh
rtk npm run db:check
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy node node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/plans/2026-10-04-fsrs-phase-c-storage-restore.md docs/superpowers/handoffs/2026-10-04-fsrs-phase-c-storage-restore.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/README.md
rtk git diff --check
```

Expected: PASS. `check` includes database check, WXT type preparation, TypeScript, lint and all Vitest tests. Run `rtk npm run db:generate -- --name=fsrs_evidence` exactly once in Task 1, then confirm all historical SQL/snapshots through 0009 are unchanged. Skip `rtk npm run zip` with the explicit reason that extension archive/manifest behavior is unchanged; `build` still produces the loadable `dist/chrome-mv3` artifact. Live provider tests remain opt-in and unrelated to C. Human smoke/visual proof remains required and must not be marked N/A or simulated by automated checks.

- [x] Record each exact command, expected test-first failure, repaired implementation/review failure and final result. Update plan checkboxes only for work actually completed. Commit the validation/authority-doc slice with `docs(fsrs): document evidence storage and restore validation`. Present the build path and the human checklist, with any remaining limitation; do not claim human proof was executed by the agent.

## Task commits

After each reviewed owner task, stage only that task's exact file ownership and commit. Check `rtk git diff --cached --check` first. The expected Conventional Commit titles are:

```sh
rtk git commit -m "feat(practice): preserve scheduling evidence and card identities"
rtk git commit -m "feat(backup): validate and preserve FSRS evidence in version 6"
rtk git commit -m "fix(backup): retry committed replacement persistence safely"
rtk git commit -m "test(fsrs): prove evidence migration preserves shipped progress"
```

The final validation/docs commit includes authority and handoff updates from Task 4. Git metadata lives outside the writable worktree; request the normal sandbox escalation for task-authorized staging/commit operations when needed. No unrelated changes are included.
