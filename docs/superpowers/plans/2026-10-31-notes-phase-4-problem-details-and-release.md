# Notes Phase 4: Problem Details and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the same notes/history accessible from a full problem-details page and prove the complete experience safe to release at realistic archive sizes.

**Architecture:** Add a full-page Library route at the app layer, composing existing problem/practice reads with shared Notes feature UI. Page history uses cursor metadata and lazy payload reads; validated extension destinations connect compact entry points. Complete local/remote compatibility, restart/reset races, performance and human installed-extension proof determine release readiness.

**Tech Stack:** React 19, TanStack Router/Query, TypeScript, current Notes/backup runtime APIs, native IDB, Vitest/Testing Library, packaged Chrome extension and approved backup transports.

---

Requires [Phase 1](./2026-10-31-notes-phase-1-archive-and-recovery.md), [Phase 2](./2026-10-31-notes-phase-2-submission-and-ai-retention.md), and [Phase 3](./2026-10-31-notes-phase-3-overlay-notes.md). The [master plan](./2026-10-31-notes-and-submission-history.md) owns the release/remote dependency boundary. No additional top-level Notes section, account system, historical import or cloud destination is in scope.

## File map

| File                                                                                                                                                                                                                                                                                           | Responsibility                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Create `src/app/dashboard/screens/problem-details-page.tsx`                                                                                                                                                                                                                                    | Route parameters, existing catalog/practice reads and app composition                      |
| Modify `src/app/dashboard/navigation/route-manifest.ts`, `routes.tsx`, `src/app/dashboard/routes.test.tsx`                                                                                                                                                                                     | Full page and Library selection; preserve metadata-edit modal routes                       |
| Create `src/features/notes/components/problem-details-screen.tsx`, `submission-history.tsx`, `submission-detail.tsx` and tests                                                                                                                                                                 | Notes-first layout, timeline, selected code/reflection/assessment                          |
| Create `src/features/notes/hooks/use-submission-history.ts` and tests                                                                                                                                                                                                                          | Stable cursor pages, lazy details and generation-aware cache reset                         |
| Modify `src/platform/chrome/extension-pages.ts`, its tests, `src/extension/messaging.ts`, `background/runtime-policy.ts`, `register-handlers.ts`                                                                                                                                               | Validated problem destination and extension URL construction                               |
| Modify `src/app/dashboard/screens/library-page.tsx`, `tracks-page.tsx`, `src/features/problems/components/library/problem-library-screen.tsx`, `problem-library-table.tsx`, `problem-library-columns.tsx`, `problem-row-actions.tsx`, `src/features/tracks/components/track-problem-table.tsx` | App-supplied View details action propagated to existing problem rows                       |
| Modify `src/features/overlay-session/components/overlay-shell.tsx`, its controller/actions, `src/app/popup/components/recommendation-card.tsx`, `src/features/app-shell/hooks/use-popup-app-shell-controller.ts`                                                                               | Compact problem-details/history access without editing in popup                            |
| Modify `src/app/dashboard/screens/overview-page.tsx`, `src/features/app-shell/components/overview-screen.tsx`, `src/features/app-shell/components/overview/overview-panels.tsx`, `src/features/app-shell/components/overview-screen.test.tsx`                                                  | App-supplied details action on existing recommendation, active-track and Today Queue items |
| Modify `src/features/backup/components/backup-restore-panel.tsx`, `reset-local-data-panel.tsx`, `data-management-screen.tsx` and tests                                                                                                                                                         | Complete archive counts/removal preview, transfer progress, storage usage                  |
| Create `src/testing/notes-scaling-fixtures.ts`, `notes-scaling-fixtures.test.ts`, `notes-scaling.test.ts`                                                                                                                                                                                      | Deterministic public synthetic archives and measurements                                   |
| Create `src/features/notes/notes-lifecycle.integration.test.ts`, `src/features/sync/notes-backup-compatibility.integration.test.ts`                                                                                                                                                            | Complete lifecycle and transport compatibility gates                                       |

## Task 1: Full problem-details route and notes-first composition

**Files:** Create `src/app/dashboard/screens/problem-details-page.tsx`, `src/features/notes/components/problem-details-screen.tsx`, `problem-details-screen.test.tsx`; modify route manifest/tree and `src/app/dashboard/routes.test.tsx`.

- [ ] **Step 1: Write route and composition failures.** Navigate directly to `/library/problems/two-sum`, including reload and browser Back. Assert Library is selected, the full page replaces the Library table, and Notes leads before secondary practice facts/history. Existing `/library/problems/new`, `/$problemSlug/edit` and Tracks edit modal still resolve correctly. Unknown slug shows a recoverable not-found state without creating a catalog problem.

```tsx
await router.navigate({
  to: '/library/problems/$problemSlug',
  params: { problemSlug: 'two-sum' },
})
expect(
  await screen.findByRole('heading', { name: 'Two Sum', level: 1 }),
).toBeVisible()
expect(screen.getByRole('textbox', { name: 'Problem notes' })).toBeVisible()
expect(
  screen.queryByRole('dialog', { name: 'Edit Problem' }),
).not.toBeInTheDocument()
expect(screen.queryByRole('table', { name: /Library/ })).not.toBeInTheDocument()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/app/dashboard/routes.test.tsx src/features/notes/components/problem-details-screen.test.tsx`.
- [ ] **Step 3: Register a root-child full-page route.** The existing `LibraryPage` always renders its table and puts modal children in an Outlet. Use a sibling root route with the full Library path so details does not render inside that modal/table layout. Give it static section `library`, presentation `page`, title `Problem details`; add `dashboardPaths.problemDetails`. Keep the existing modal children unchanged.

```tsx
const problemDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/problems/$problemSlug',
  component: ProblemDetailsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === 'history' ? ('history' as const) : ('notes' as const),
    submissionId:
      typeof search.submissionId === 'string' &&
      search.submissionId.length <= 160
        ? search.submissionId
        : undefined,
  }),
  staticData: {
    presentation: 'page',
    section: 'library',
    title: 'Problem details',
  },
})
```

Add this route to `rootRoute.addChildren`. In the app page, use `useProblemForEdit` for existing catalog data and `usePracticeDetails` for secondary facts through their public APIs. Own loading/error/not-found here; no direct persistence. Compose `ProblemDetailsScreen` from shared `ProblemNotesPanel`, three recent submissions and the full-history section; keep Edit metadata, Open on LeetCode and Reset problem explicit. Feature UI receives catalog/header facts and action slots from the app, rather than importing app navigation or other features' private components.

Notes is the default view; `view=history&submissionId=...` deep-links a selected internal archive record. Validate the selected record belongs to the route problem. Different query selection does not remount the personal-note controller or discard its pending draft.

- [ ] **Step 4: Verify GREEN and commit.** Run both RED files and `rtk npm test -- src/testing/architecture-boundaries.test.ts`; expect route priority, direct links and public imports to pass. Commit `feat(notes): add a notes-first problem details page`.

## Task 2: Complete timeline, selected submission and reflection

**Files:** Create `src/features/notes/hooks/use-submission-history.ts`, `use-submission-history.test.tsx`, `components/submission-history.tsx`, `submission-history.test.tsx`, `submission-detail.tsx`, `submission-detail.test.tsx`; extend Notes runtime/API/repository tests as required by the existing Phase 1/2 methods.

- [ ] **Step 1: Add paging and selected-body failures.** Seed 125 entries with timestamp ties; load pages 50/50/25 with no duplicates/gaps. Assert list reads load no code/report payloads, selecting one loads only its bodies, and reset invalidation cancels old cursors/results. Missing/partial code and archived-report errors remain honest. Reflection autosaves independently of the main note.

```ts
expect(pages.flatMap((page) => page.items).map((item) => item.id)).toHaveLength(
  125,
)
expect(
  new Set(pages.flatMap((page) => page.items).map((item) => item.id)).size,
).toBe(125)
expect(readPayload).not.toHaveBeenCalled()
await selectSubmission(firstId)
expect(
  readPayload.mock.calls.every(([id]) => selectedPayloadIds.includes(id)),
).toBe(true)
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/hooks/use-submission-history.test.tsx src/features/notes/components/submission-history.test.tsx src/features/notes/components/submission-detail.test.tsx`.
- [ ] **Step 3: Implement cursor metadata and lazy detail.** Use `useInfiniteQuery` with key containing problem slug and active dataset/problem scope; `getNextPageParam` returns the runtime's cursor. The cursor encodes generation, problem, final timestamp and internal ID; reject a cursor for another problem/generation. Use IDB `openCursor` on the compound history index in reverse order with an exclusive upper bound. Do not fetch every record and sort/slice in JavaScript.

```ts
type HistoryCursor = {
  archiveGeneration: string
  problemSlug: string
  submittedAt: string
  id: string
}
function sameCursorScope(
  cursor: HistoryCursor,
  generation: string,
  problemSlug: string,
) {
  return (
    cursor.archiveGeneration === generation &&
    cursor.problemSlug === problemSlug
  )
}
```

Timeline rows show date, exact result, language and capture completeness; newest first. Load more has a visible busy/error/retry state and preserves selection. Selected detail renders pinned submitted code as inert text, bounded diagnostics/omissions, the reflection editor with the task-2 Phase 3 controller, and all assessments for that submission. No hidden execute/submit/Generate actions are added to retained reports. Include Copy code success/failure.

For Phase 2's rare identity-conflict, show both source records/reflections without deleting either, allow copying the drafts, and require explicit selection/review before consolidating aliases and choosing the final reflection. Bind resolution to current revisions/scope; a conflict cannot be resolved by silently dropping user text. Return to Notes retains the main draft. Empty history invites a future submission and does not fetch old LeetCode records.

- [ ] **Step 4: Verify GREEN and commit.** Run RED files plus `rtk npm test -- src/features/notes/data/notes-repository.test.ts src/features/notes/hooks/use-problem-notes-controller.test.tsx`; expect stable paging, selected-only payload I/O and separate reflection autosave. Commit `feat(notes): browse complete submission history and reflections`.

## Task 3: Entry points, Data Management and full confirmation copy

**Files:** Modify the platform destination helper/runtime wiring, Library/Tracks row action propagation, overlay mapping, popup recommendation/controller, Data Management panels and their tests from the file map; create `src/platform/chrome/extension-pages.test.ts` for the destination allowlist and legacy helpers.

- [ ] **Step 1: Add navigation and preview failures.** View details in Library, Tracks, overlay Notes and popup recommendation opens the same destination. Existing Open on LeetCode and Edit keep their behavior. The popup action is a compact secondary icon/menu action with an accessible label, not an editor or new primary panel. Reject arbitrary destination URLs/slugs that escape the allowed route. Backup preview lists all archive counts and clearly warns that a legacy replacement removes current archive data.

```ts
expect(
  getDashboardUrl({ kind: 'problem', problemSlug: 'two-sum', view: 'history' }),
).toContain('#/library/problems/two-sum?view=history')
expect(() =>
  dashboardRouteSchema.parse({
    kind: 'problem',
    problemSlug: '../../settings',
    view: 'notes',
  }),
).toThrow()
expect(getDashboardUrl('settings')).toContain('#/settings')
expect(getDashboardUrl('tracks')).toContain('#/tracks')
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/platform/chrome/extension-pages.test.ts src/app/dashboard/routes.test.tsx src/features/problems/components/library/problem-library-screen.test.tsx src/features/tracks/components/track-problem-table.test.tsx src/app/popup/popup-shell.test.tsx src/features/backup/components/data-management-screen.test.tsx`.
- [ ] **Step 3: Extend a typed destination, not a URL escape hatch.** Keep existing string destinations and add a strict problem variant in `src/platform/chrome/extension-pages.ts`. Platform cannot import feature/app modules, so its slug validator is a local URL-segment allowlist. Background additionally checks catalog existence through the owning service.

```ts
export const dashboardRouteSchema = z.union([
  z.enum(['settings', 'tracks']),
  z.strictObject({
    kind: z.literal('problem'),
    problemSlug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(300),
    view: z.enum(['notes', 'history']).default('notes'),
  }),
])
```

`getDashboardUrl` uses `encodeURIComponent` and URLSearchParams for this variant. Preserve current `app.openDashboard` sender policy for content scripts; popup may use the existing trusted extension-page helper/controller path without gaining note mutation APIs. Add an app-supplied `renderViewProblemAction` alongside the existing edit-action render prop; propagate it through Library table/columns/actions and Track table. Pass the same action from OverviewPage through OverviewScreen to recommendation, active-track and Today Queue problem items in `overview-panels.tsx`. Add route tests and `overview-screen.test.tsx` assertions that each link preserves Open on LeetCode and targets that item's slug. Keep top-level navigation unchanged.

Complete overlay Notes' Open problem details and View full history actions. Data Management uses Phase 1's transfer sessions, reports note/submission/assessment/inclusion counts and payload bytes, and distinguishes local Saved from verified remote backup. For legacy restore show current-data removal categories, then bind confirmation to input digest/current revision. Reset/Delete/Clear copy names every learning-data category and bulk count, with recoverable retry status.

- [ ] **Step 4: Verify GREEN and commit.** Run RED files plus `rtk npm test -- src/features/app-shell/hooks/use-popup-app-shell-controller.test.tsx src/features/overlay-session/components/overlay-shell.test.tsx src/extension/background/runtime-policy.test.ts`; expect no popup editing or arbitrary URL navigation. Commit `feat(notes): connect problem details across extension surfaces`.

## Task 4: Realistic archive fixtures and measured performance

**Files:** Create `src/testing/notes-scaling-fixtures.ts`, `notes-scaling-fixtures.test.ts`, `notes-scaling.test.ts`; extend the existing dev-smoke service/page only with a development-only scoped Notes fixture/measurement action if browser measurement requires it.

- [ ] **Step 1: Write fixture and I/O budget failures.** Generate 1,000/10,000 submissions with unique code bodies so payload interning does not falsely shrink the stress data. Include mixed accepted/failed results, reflections, feedback and saved inclusions. Run ordinary 2 KB notes and both representative existing public capture fixtures and a 20 KB-per-entry stress scenario. Assert list reads do not hydrate bodies and note saves do not serialize/rewrite SQLite.

```ts
expect(sqliteSerializeCalls).toBe(0)
expect(corePayloadWriteCalls).toBe(0)
expect(historyRead.payloadReads).toBe(0)
expect(historyRead.metadataRows).toBeLessThanOrEqual(51)
expect(fixture.submissions).toHaveLength(expectedCount)
expect(
  new Set(
    fixture.payloads
      .filter((item) => item.kind === 'submitted-code')
      .map((item) => item.sha256),
  ).size,
).toBe(expectedCount)
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/testing/notes-scaling-fixtures.test.ts src/testing/notes-scaling.test.ts`; initially missing fixtures/instrumentation fail. Keep expensive cases environment-selected; do not slow the normal suite with an unconditional 200 MB fixture.
- [ ] **Step 3: Implement deterministic measurements.** Export `createNotesScalingFixture({ count, payloadBytesPerEntry })`. Use synthetic public code, fixed dates and per-entry unique identifiers; no real notes/provider output. Record note request/commit/readback/visible-Saved timestamps, history first-page time, export/restore time, JSON/SQLite/archive bytes, available heap/process metrics and browser usage/quota. Distinguish test-runner metrics from packaged Chrome proof.

```ts
export function percentile(samples: readonly number[], fraction: number) {
  if (!samples.length) throw new Error('No measurement samples.')
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(fraction * sorted.length) - 1),
    )
  ]
}
```

Record p50/p95 across at least 30 warm note saves and 10 history/export/restore operations where practical; expensive stress operations may use 3 runs, explicitly labeled rather than presented as stable p95 evidence. For an awake worker, ordinary 2 KB notes must display Saved within one second of the final keystroke including the 600 ms debounce. Report cold start, maintenance blocking, quota/unavailable memory APIs and failures separately. Never infer installed-extension responsiveness from fake-indexeddb timing.

Use the existing mutation/capture/backup services in the harness. The browser fixture action is development-only, requires a disposable profile and explicit target fixture selection, and cannot appear in production navigation. Verify transfer chunks stay bounded. Whole JSON parsing memory is measured, not concealed by chunked IPC; if the supported stress archive cannot round-trip safely, the release gate stays closed and the backup implementation must be corrected before activation.

- [ ] **Step 4: Verify GREEN and commit.** Run `rtk npm test -- src/testing/notes-scaling-fixtures.test.ts`, `rtk proxy env COGNIPACE_NOTES_SCALING=standard npm test -- src/testing/notes-scaling.test.ts`, then repeat with `COGNIPACE_NOTES_SCALING=stress`. Attach machine/browser/build details and raw safe measurements. Commit `test(notes): measure large archive save and recovery behavior`.

## Task 5: Complete lifecycle and verified remote compatibility

**Files:** Create `src/features/notes/notes-lifecycle.integration.test.ts`, `src/features/sync/notes-backup-compatibility.integration.test.ts`; extend Phase 1 replacement/transfer and existing sync tests. Integrate the already-approved backup project through its existing files rather than duplicate transport code.

- [ ] **Step 1: Write a complete acceptance suite.** Cover note → failed submissions → accepted submission → generated feedback → optional generated implementation → saved inclusion → reflection → v7 backup → full reset → restore. Compare meaningful records and original FSRS schedules, then run lost replies, duplicate deliveries, two editors, SPA navigation, worker stops around publication, older backup removal and delayed AI/saved-add retries.

```ts
expect(restored.notesArchive).toEqual(exported.notesArchive)
expect(restored.practice).toEqual(exported.practice)
expect(restored.savedAiNotes[0].assessmentId).toBe(
  exported.savedAiNotes[0].assessmentId,
)
expect(providerCallsAfterRestore).toBe(providerCallsBeforeRestore)
expect(staleWriteResult.status).toBe('stale-scope')
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/notes-lifecycle.integration.test.ts src/features/sync/notes-backup-compatibility.integration.test.ts`. A transport with upload-only or truncated readback must fail its compatibility test, not be skipped and called supported.
- [ ] **Step 3: Bind the common complete-backup contract to every supported destination.** The test adapter must call the real owning backup serializer/parser and the destination service's upload/download/restore path, with fake network responses for faults. Verify exact byte length/SHA-256, v7 parse/preflight, all archive references and exact exported revision before acknowledgment. Include a new local note while upload is pending, truncated remote content, mismatched digest, lost upload response, worker restart and a legacy remote archive-less payload.

```ts
export async function assertVerifiedPayload(
  bytes: Uint8Array<ArrayBuffer>,
  expected: { size: number; sha256: string },
) {
  if (bytes.byteLength !== expected.size)
    throw new Error('Backup byte length mismatch.')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const actual = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  if (actual !== expected.sha256) throw new Error('Backup checksum mismatch.')
}
```

This assertion complements, not replaces, full parsing and domain preflight. For Drive, integrate the existing backup Phase 2 plan's v7 envelope/job/cutover and optional-permission ownership. For a still-enabled Gist destination, its approved large-file/readback work must pass the same suite or Notes remains unreleased. Do not label a destination complete/verified after HTTP success, quietly drop archive fields or use an unsupported payload limit as permission to delete history. Record the actual dependency commit and installed transport proof in the release handoff.

- [ ] **Step 4: Verify GREEN and commit.** Run both RED files plus `rtk npm test -- src/features/backup src/features/sync src/platform/db/composite-publication.test.ts src/extension/background/backup-replacement.test.ts`; expect complete references, fresh scopes and exact-revision acknowledgment. Commit `test(notes): prove full lifecycle and remote backup compatibility` only with honest test outcomes; an unmet external transport gate remains explicitly open.

## Task 6: Authority docs, human smoke and release acceptance

**Files:** Modify `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `design.md`, `PRIVACY.md`, `docs/superpowers/README.md`; create `docs/superpowers/handoffs/2026-10-31-notes-release.md` during execution.

- [ ] **Step 1: Run the complete automated gate.** Run `rtk npm run db:check`, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk npm run format`, `rtk npm run zip`. Run the focused lifecycle/compatibility and standard/stress measurement commands from tasks 4–5 after any affecting fixes. Do not repeat expensive checks without a new change/failure to investigate. Run `rtk npm run db:generate` only for actual Drizzle schema changes; otherwise list it as skipped with that reason.
- [ ] **Step 2: Have a human engineer run the installed-extension matrix below.** Record Chrome/OS, commit, ZIP SHA-256, fixture size, exact steps and screenshots/recording. Use a disposable profile and a private backup before destructive flows. Agent browser/fixture proof is supplemental; do not claim it as human smoke.

| Flow            | Happy path                                             | Edge case/proof                                                                                            |
| --------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Notes writing   | Write in existing tab, preview, Saved, reopen          | Rapid typing >3 seconds, blur/navigation before debounce, empty note, failed storage and exact retry       |
| Surfaces        | Overlay ↔ details shows same note/history              | Two editors conflict, one resets while other is dirty; no silent overwrite or resurrection                 |
| Overlay         | Solve/AI/Notes, collapse/dock/restore, review save     | Keyboard tabs/disclosures, short viewport, 392/320 px, code wraps/scrolls without page overflow            |
| Capture         | Failed → failed → accepted, all code retained          | AI off, auto-review off, post-review second submission, partial capture, repeated terminal delivery        |
| AI              | Feedback saved, explicit code generated, Save to notes | No calls on open/save/restore, persistence retry without generation, remove key then read saved content    |
| Reset/delete    | One problem, bulk, Delete, Clear local data            | Pending capture/autosave/AI, worker restart before/after commit, unrelated problem preserved               |
| Local recovery  | Full v7 download/restore and retained prior pair       | Interrupted transfer/restore, wrong digest, v6 removal preview, fresh generations reject stale retry       |
| Remote recovery | Complete configured-destination round-trip             | Truncated/readback failure, newer local edit during upload, offline/restart and approved transport cutover |
| Retention/scale | Old notes/history remain; 1k/10k fixture reads         | Safe technical cleanup, disk-full/quota failure, measured note latency and backup/restore memory           |

- [ ] **Step 3: Update current authority and privacy.** Remove contradictory placeholder/session-only-report statements where the feature actually ships. Document the full reset meaning, permanent retention, backup scope, legacy replacement preview, no historical import, missing capture states and safe recovery/downgrade procedure. Keep personal code/note/report contents and credentials out of logs, screenshots, issue bodies and measurements. State configured remote inclusion without implying every local save is already remotely verified.
- [ ] **Step 4: Write release and review handoff.** Summarize behavior, ownership, exact validation/skips, performance limits, human proof links, supported transport/backup versions and remaining risks using the current PR template. Conventional title: `feat(notes): add permanent problem notes and submission history`. A deployment/merge is a separate user action; this task prepares the reviewable change.
- [ ] **Step 5: Check rollback.** Before release, preserve a v7 export and original profile backup. Old clients reject newer storage/backup versions; do not downgrade and seed over them. A defect rollback disables new capture/editing while retaining v2 data for a compatible fix/restore. Do not promise an old SQLite-only build can read the new archive. Commit `docs(notes): document full experience and release proof` after recording actual evidence/status.

## Release gate

- [ ] All four phase implementations and required reviews/checks pass.
- [ ] Main Notes tab and details/history page share the same durable data and conflict rules.
- [ ] No learning-data TTL; no reset resurrection; no archive-created Practice effects.
- [ ] Full v7 local and every supported configured remote path restore exact notes/history/code/reflections/AI; no partial success or silent omission.
- [ ] 1k/10k public/stress measurements meet the warm-note latency target and reveal actual memory/transport limits.
- [ ] Required human installed-extension happy-path/edge-case proof is attached before PR review/merge.
- [ ] Privacy, recovery, backward-reader and activation state are accurate. Any open remote/human/data-integrity gate keeps release unready.
