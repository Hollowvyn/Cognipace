# Ponytail Phase 2 Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Repair catalog identity, URL input, calendar overdue classification and transient capture recovery without changing persisted schema or product scope.

**Architecture:** Fix each shared owner once, then cover its real callers. Keep exact persisted identities while normalizing lookup keys. Reuse Analytics calendar helpers and retain existing capture success caches/navigation guards.

**Tech Stack:** TypeScript, Zod, Drizzle/SQLite, existing LeetCode readers, Vitest/Testing Library.

Approved design: [cleanup](../specs/2026-10-02-ponytail-cleanup-design.md).
Independent Phase 2 owners may start after Phase 1's backup/manual-pull focused
review, while the disjoint snapshot durability repair finishes. Each phase keeps
its own review boundary; run shared full checks only at stable checkpoints.
Human proof remains a pre-review/merge gate and is tracked separately.

## Task 1: Reject failed URL input

**Files:** `src/lib/leetcode/domain/problem-url.ts`, its `.test.ts`, affected
Library form tests and `src/features/tracks/data/tracks-repository.test.ts`.

- [x] Add combined-parser rejection tests, including foreign problem URL, LeetCode non-problem URL and malformed URL-shaped text. Preserve accepted bare slug, normalized `Problems/two-sum/` input and valid canonical URLs.

```ts
it.each([
  'https://example.com/problems/two-sum/',
  'https://leetcode.com/explore/',
  'https://',
])('rejects invalid URL input %s', (input) => {
  expect(parseLeetCodeProblemInput(input)).toBeNull()
})
```

- [x] Run `rtk npm test -- src/lib/leetcode/domain/problem-url.test.ts --run` and observe the fabricated `https` slug failure.
- [x] In `parseLeetCodeProblemInput`, return `null` for URL-shaped input after canonical parsing fails, before `normalizeLeetCodeSlug`. Use existing `readAbsoluteUrl` and a minimal URL-shape guard; do not change generic slug normalization used for IDs/titles.
- [x] Add a caller regression demonstrating rejection through Library validation and Track input; run parser/form/track suites.

## Task 2: Collision-safe company labels

**Files:** `src/features/problems/data/problems-repository.ts` and `.test.ts`.
Reference existing label normalization and topic collision-safe allocation in
`src/features/problems/domain/topic-taxonomy.ts`.

- [x] Add repository regressions: existing `Meta` plus new `Meta!`; existing company plus case/whitespace variation; two new distinct labels sharing an ID slug in one transaction. Verify associations, stored identities and rollback behavior.
- [x] Run `rtk npm test -- src/features/problems/data/problems-repository.test.ts --run` and observe the saved-label reread failure.
- [x] Read existing company rows once, reuse a normalized matching display label, and allocate a free ID for new labels. Preserve the existing slug ID when free; use a collision-safe suffix/UUID when occupied (also for punctuation-only empty slug). Track newly allocated IDs within the batch. Keep writes in the owning transaction.
- [x] Do not import the Imports feature into Problems. Do not alter canonical topics or rename stored company IDs. Remove unreachable generic taxonomy branches only if caller tracing proves them unused and focused coverage protects the replacement.
- [x] Verify create/edit/bulk all still route through the repaired shared helper and rerun the repository suite.

## Task 3: Normalized restored topic IDs and fingerprints

**Files:** `src/features/imports/domain/plan-import-problems.ts`, planner tests
under `src/features/imports/domain`, and
`src/features/imports/server/import-service.test.ts`.

- [x] Add a planner case with stored `{id:'Custom-ID', label:'Different Label'}` and imported `topics:['custom-id']`; expect reuse of `Custom-ID`, no inserted topic and valid combined lookup. Cover an alias targeting the exact mixed-case ID.
- [x] Add stale-preview coverage when a normalized-ID-matched stored topic changes between preview/apply. Keep exact existing IDs in planned output.
- [x] Run `rtk npm test -- src/features/imports/domain src/features/imports/server/import-service.test.ts --run` and confirm red.
- [x] Index topic IDs with `normalizeTopicLookupKey(topic.id)`. Normalize alias-target lookup before `topicsById.get`, and normalize stored IDs in `relevantProblemState` matching. Apply the same key rule consistently where an equivalent company ID lookup has the same mismatch, with its own regression.
- [x] Verify existing ambiguity diagnostics, alias semantics, additive imports and fingerprints still pass.

## Task 4: Calendar-based overdue backlog

**Files:** `src/features/analytics/domain/chart-data.ts`, `.test.ts` and any
affected live workload/service expectations. Reuse `getAnalyticsDateKey` for
explicit timezones and existing local date-key helper otherwise.

- [x] Add a real FSRS log/card regression with due today at 13:00 and observation at 14:00; expect backlog 0. Also cover yesterday and UTC instants whose selected-timezone dates differ.
- [x] Run `rtk npm test -- src/features/analytics/domain/chart-data.test.ts --run` and observe same-day backlog disagreement.
- [x] Replace the timestamp-only overdue condition with a calendar-key comparison at the selected observation date. Keep interval applicability checks unchanged. Compute the observation key once per observation rather than per card.
- [x] Update existing tests that deliberately count the due calendar day as overdue. Verify historical unknown/evidence handling and Upcoming Load agreement with the live backlog.

## Task 5: Recover incomplete capture

**Files:** `src/lib/leetcode/metadata/graphql-metadata-source.ts` and maintained metadata reader tests, `src/features/leetcode-capture/server/leetcode-capture-service.ts`,
its `.test.ts`, `src/lib/leetcode/watcher/leetcode-page-watcher.ts` and `.test.ts`.

- [x] Add offline-first then valid-remote metadata/content tests. A second call must refetch and a third useful result must use the success cache. Cover unsuccessful results and `ok:true` fallback/empty content.
- [x] Add watcher hydration/retry coverage after incomplete metadata/content and stale navigation. Reuse existing interval/manual refresh hooks; do not create a new retry scheduler.
- [x] Run `rtk npm test -- src/features/leetcode-capture/server/leetcode-capture-service.test.ts src/lib/leetcode/watcher/leetcode-page-watcher.test.ts --run` and confirm red.
- [x] Require an actual remote title and recognized difficulty before the metadata reader claims GraphQL/high success; incomplete GraphQL data must use existing failure/fallback and stay retryable. Preserve optional frontend ID, premium and empty topic contracts. Cache only useful successful remote results. Mark details completed only after useful metadata/content succeeds; preserve early page-ready behavior, deduplication, in-flight sharing and navigation guards.
- [x] Verify repeated useful successes do not refetch and fallback recovery does not create a hot retry loop.

## Task 6: Review/checkpoint

- [x] Root reviews specification compliance and code quality, including every modified helper's callers.
- [x] Run all touched focused suites, then `rtk npm run db:check`, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`.
- [x] Format touched code/docs and record exact run/skipped commands plus actual results in the implementation ledger.
- [x] Root stages and commits only reviewed phase files using Conventional Commit titles.

Human proof pending: Library and Track URL validation; create/edit/bulk company
labels; custom restored-topic import and stale preview; today/yesterday backlog
at a timezone boundary; offline-to-online page capture recovery. Use disposable
data and attach screenshots/recording before review/merge. Skip
`rtk npm run db:generate`: no schema changes.
