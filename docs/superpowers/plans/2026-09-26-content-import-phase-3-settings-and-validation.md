# Content Import Phase 3: Settings and Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Settings import workflow with template downloads, clear previews/results, and full preservation validation.

**Architecture:** A feature-owned workflow hook manages file and request state; small components render previews and diagnostics. TanStack mutations call the Phase 2 runtime contract. Data Management composes the public import panel beside the existing backup and sync sections.

**Tech Stack:** React, TanStack Query, WXT asset URLs, existing UI primitives, Vitest, React Testing Library.

---

Prerequisites: [Phase 1](./2026-09-26-content-import-phase-1-contract-and-planner.md)
and [Phase 2](./2026-09-26-content-import-phase-2-persistence-and-runtime.md) pass.
Use the [master plan](./2026-09-26-non-destructive-content-import.md) for shared
types, runtime statuses, workspace, and commands.

## File Map

| Create/modify | Files and purpose                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Create        | `src/features/imports/api/imports-api.ts` and `.test.tsx`: runtime mutations and local invalidation                        |
| Create        | `src/features/imports/hooks/use-content-import.ts` and `.test.tsx`: file lifecycle, request races, apply/retry state       |
| Create        | `src/features/imports/components/import-content-panel.tsx` and `.test.tsx`: feature entry component                        |
| Create        | `src/features/imports/components/import-preview.tsx`: counts and planned entities/relationships                            |
| Create        | `src/features/imports/components/import-diagnostics.tsx`: paginated path/reason report                                     |
| Create        | `src/features/imports/components/import-templates.tsx`: packaged schema/template links and format help                     |
| Create        | `src/features/imports/index.ts`: UI public export only                                                                     |
| Modify        | `src/features/backup/components/data-management-screen.tsx` and `.test.tsx`: compose import panel                          |
| Delete        | `src/features/backup/components/selective-import-panel.tsx`: remove superseded placeholder                                 |
| Modify        | `docs/import-format.md`, `docs/product.md`, `docs/architecture.md`, `docs/testing.md`: current behavior and smoke guidance |
| Modify        | `docs/superpowers/README.md`: implementation status links after actual validation                                          |

Use the existing `Surface`, `Button`, and `InlineStatus` components. Keep styling
within `design.md`'s compact spacing/tokens. No new route, modal framework,
component library, or global state store is needed.

## Task 1: Runtime Mutation Hooks

**Files:** Create `imports-api.ts`/`.test.tsx`.

- [ ] Add hook tests using `createQueryTestHarness`, `renderHook`, `act`, and mocked `sendMessage`. Verify the exact three message names/payloads, and assert that preview/stale/unchanged outcomes do not invalidate any queries.

Source: [imports-api.ts](../../../src/features/imports/api/imports-api.ts) · coverage: [imports-api.test.tsx](../../../src/features/imports/api/imports-api.test.tsx).

`readyPreview` is a concrete Phase 1 fixture: status `ready`, a 64-character
hex fingerprint, one new question, one `add` item, all other counts zero, and
no diagnostics. Define it in `imports/testing/import-fixtures.ts` and reuse it
with typed overrides for `unchanged`, `stale`, and persistence tests.

Fixture: [import-fixtures.ts](../../../src/features/imports/testing/import-fixtures.ts).

- [ ] Run `rtk proxy npx vitest run src/features/imports/api/imports-api.test.tsx`; expect missing hook failure.
- [ ] Implement the hooks below. Both background broadcast and initiating-window invalidation follow existing app conventions:

Source: [imports-api.ts](../../../src/features/imports/api/imports-api.ts) · coverage: [imports-api.test.tsx](../../../src/features/imports/api/imports-api.test.tsx).

- [ ] Add cases for `saved` and `persistence-error` invalidating affected local views, retry success invalidation, and `repreview` causing no invalidation. Assert no `settings` mutation/tag.
- [ ] Rerun the hook tests; expect PASS. Commit as `feat(imports): add content import runtime hooks`.

## Task 2: File and Preview State with Race Protection

**Files:** Create the workflow hook/test; extend import fixtures.

- [ ] Add hook tests before implementation. Use deferred promises to prove a response for file A cannot replace the preview for newly selected file B. Add cancellation during file reading and preview. Cancellation during apply/retry is disabled because writes may already be committed.

Coverage: [use-content-import.test.tsx](../../../src/features/imports/hooks/use-content-import.test.tsx).

Define `secondPreview` as the ready fixture with a different fingerprint and
question identity. Import the actual Phase 1 type. Use mocks compatible with the
typed `sendMessage` signature, following existing API tests.

- [ ] Run `rtk proxy npx vitest run src/features/imports/hooks/use-content-import.test.tsx`; expect missing controller failure.
- [ ] Implement `useContentImport()` with the following state/API. Keep raw file text in component state, never query keys, logs, storage, or URLs:

Source: [use-content-import.ts](../../../src/features/imports/hooks/use-content-import.ts) · coverage: [use-content-import.test.tsx](../../../src/features/imports/hooks/use-content-import.test.tsx).

Use `useRef` for a monotonically increasing selection generation and a separate
synchronous apply/retry lock. Increment the generation on file selection,
clear, and unmount. Check it after every `await` before updating state. The
event lock protects against two clicks in the same render; `isPending` alone
is insufficient. Reject select/clear while that lock is held.

The concrete select-file flow is:

Source: [use-content-import.ts](../../../src/features/imports/hooks/use-content-import.ts) · coverage: [use-content-import.test.tsx](../../../src/features/imports/hooks/use-content-import.test.tsx).

`readImportFileText` is a local helper in the hook file: use `file.text()` when
available and the existing backup screen's `FileReader` fallback otherwise.
It returns a string or rejects; it never parses JSON in the UI. Reset the file
input value after selection so choosing the same file again triggers change.

`apply` requires `preview.status === 'ready'`, a non-null fingerprint/text, and
no current write lock. Set the lock synchronously, transition to `applying`,
call the mutation, and always release the lock in `finally`. Map results:

| Outcome                           | State and behavior                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `saved`                           | `saved`; retain preview/counts/diagnostics, clear raw file text                            |
| `persistence-error`               | Keep file text/counts, show retry-persistence action; never show the import button         |
| `stale`                           | Replace preview, return to `preview`, explain local content changed, require another click |
| `unchanged`                       | Return to `preview`; report no changes needed; no import action                            |
| `blocked`                         | Show returned preview diagnostics; no import action                                        |
| Runtime rejection/connection loss | `error`; retain file/text, instruct fresh preview; never automatically replay apply        |

`retryPersistence` only runs from `persistence-error` with the same write lock.
`saved` transitions to `saved` and clears raw text. `persistence-error` retains
the retry UI. `repreview` calls `previewAgain` using retained file text, since a
worker restart can change which rows survived. Retry exceptions remain a
persistence warning with the retry action; they do not turn into a false
database rollback message.

`previewAgain` requires retained text, increments selection generation, and
uses the same preview handling as file selection. Do not allow it to bypass
the pending-persistence retry state except on a `repreview` response. `clear`
resets state/mutations when no write is in flight. On unmount, invalidate
responses without pretending to cancel background work.

- [ ] Add and pass all tests in this matrix:

| Test                       | Evidence                                   |
| -------------------------- | ------------------------------------------ |
| Too-large file             | No `text()`/runtime call; clear error      |
| File read failure          | No preview/apply call                      |
| Valid file                 | Exact raw text sent; no write until apply  |
| Clear or replacement       | Old response ignored                       |
| Double apply click         | One apply message                          |
| Stale response             | New fingerprint used only after next click |
| Saved response             | No old import action; raw text cleared     |
| Snapshot failure           | Retry method called, never a second apply  |
| Retry after worker restart | Fresh preview; next apply remains explicit |
| Apply delivery failure     | No automatic retry; preview-again recovery |

- [ ] Rerun the hook and API tests; expect PASS. Commit as `feat(imports): manage preview and import lifecycle safely`.

## Task 3: Compose the Settings Import Panel

**Files:** Create all four components and panel test, feature index; modify
Data Management and its test; delete the placeholder.

- [ ] Write the user workflow test before UI code. Render `ImportContentPanel` with `createQueryTestHarness` and mocked runtime responses:

Coverage: [import-content-panel.test.tsx](../../../src/features/imports/components/import-content-panel.test.tsx).

- [ ] Run `rtk proxy npx vitest run src/features/imports/components/import-content-panel.test.tsx`; expect missing component failure.
- [ ] Build `ImportContentPanel` around the hook's API and this exact content order:

Source: [import-content-panel.tsx](../../../src/features/imports/components/import-content-panel.tsx) · coverage: [import-content-panel.test.tsx](../../../src/features/imports/components/import-content-panel.test.tsx).

Derive `workflow = useContentImport()`, `state = workflow.state`,
`isWriting = ['applying', 'retrying'].includes(state.step)`, and
`canApply = state.step === 'preview' && state.preview?.status === 'ready'`.
`canPreviewAgain` is true only in `error` with retained text. Sum all eight
addition counts for `Import N addition(s)`. The sum includes new relationships,
so label it additions rather than questions. Render items with context-specific
names (for example, memberships as track question links).

Use one current status region in the panel. `statusTone` is `danger` for fatal
errors, `warning` for stale/persistence warnings, `success` for saved, otherwise
`neutral`, matching the existing `Tone` union in `components/ui/types.ts`.
Copy:

| State              | Message                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Reading/previewing | `Reading file…` / `Checking content…`                                                                    |
| Ready              | `Review the additions below before importing.`                                                           |
| Unchanged          | `Everything in this file is already present. No changes are needed.`                                     |
| Empty              | `No usable content was found. Check the format and reported entries.`                                    |
| Blocked            | `This file cannot be imported. Review the errors below.`                                                 |
| Applying           | `Importing content…`                                                                                     |
| Stale              | `Local content changed. Review the updated preview before importing.`                                    |
| Saved              | `Content imported and saved.`                                                                            |
| Persistence error  | `Content was added, but saving it to browser storage failed. Retry saving before closing the extension.` |
| Retrying           | `Retrying save…`                                                                                         |
| Delivery error     | `The import result could not be confirmed. Preview the file again before retrying.`                      |

Retain the stale explanation in `state.message` and give it precedence over the
generic ready message. Existing content, progress, and protection rules should
be described in user terms; do not show fingerprints or transaction details.

- [ ] Implement `ImportPreviewView({ preview }: { preview: ImportPreview })` as summary counts followed by expandable item/diagnostic lists. `ImportDiagnostics({ diagnostics })` pages at 25 rows using local page state; reset page when diagnostics change. Show path, reason, severity and `Showing X–Y of Z`, with accessible Previous/Next buttons. Empty lists show no pager. Use the same paging policy for large item lists. Every record must remain reachable.
- [ ] Implement packaged download links using `browser.runtime.getURL` from `wxt/browser` for the seven Phase 1 assets. Enumerate the six exact example filenames and schema path as literal constants so WXT can type/check them. Use anchors with `download` and meaningful labels; do not add a Chrome downloads permission or fetch remote schemas.
- [ ] Put format help in an inline `<details>` within `ImportTemplates`: stable identity, optional sections, null means ignore, accepted labels/refs, additive policy, and version 1 limits. Link to the downloadable schema and templates. Keep the full human reference in `docs/import-format.md`; do not link an extension page to a local developer filesystem path.
- [ ] Export only `ImportContentPanel` from `features/imports/index.ts`. In Data Management, replace `SelectiveImportPanel` with that public export at the same location, and update the header description to `Back up, restore, import, or clear local study data.` Delete the unused placeholder file.
- [ ] Extend panel tests for skipped-item diagnostics, null examples, pagination, HTML-looking text rendering as text, stale preview, persistence retry, all-existing files, accessible loading states, and disabled duplicate-write controls.
- [ ] Update the existing Data Management ordering test to expect the `Import content` region after sync and before reset. Run all existing backup tests to prove restore/export/reset remain intact.
- [ ] Run:

```sh
rtk proxy npx vitest run src/features/imports src/features/backup/components/data-management-screen.test.tsx src/features/backup/api/backup-api.test.tsx src/testing/architecture-boundaries.test.ts
```

Expect PASS. Commit as `feat(imports): add Settings content import workflow`.

## Task 4: Documentation, Full Validation, and Human Proof

**Files:** Modify `docs/import-format.md`, `docs/product.md`,
`docs/architecture.md`, `docs/testing.md`, and `docs/superpowers/README.md`.

- [ ] Update Product's Data Management behavior and remove selective imports from Future Candidates. Describe preservation/partial import and the four supported sections; retain topic hierarchy/alias authoring as deferred.
- [ ] Update Architecture with imports ownership, three runtime methods, existing schema compatibility, owner-specific additive repositories, queue/freshness checks, and snapshot-retry distinction. Do not duplicate the complete format reference.
- [ ] Update Testing with the manual checklist below. Link `docs/import-format.md` from current docs. Remove its not-yet-shipped wording only after the runtime and UI tasks exist.
- [ ] Generate the schema again, inspect for unexpected drift, and run the focused suite once after the last code change:

```sh
rtk proxy node scripts/generate-import-schema.mjs
rtk proxy npx vitest run src/features/imports src/features/problems/data/problem-import-repository.test.ts src/features/tracks/data/track-import-repository.test.ts src/features/backup src/extension/background/import-handlers.test.ts src/extension/background/runtime-policy.test.ts src/extension/background/register-handlers.test.ts src/testing/architecture-boundaries.test.ts
rtk proxy npm run db:check
rtk proxy npm run lint
rtk proxy npm run check
rtk proxy npm run build
rtk proxy npm run format
```

Also run `rtk proxy npx vitest run src/platform/db/instance.test.ts` for the
snapshot integration coverage introduced in Phase 2. Do not repeat the entire
suite without a subsequent change or unresolved failure.

- [ ] Verify built assets exist in `dist/chrome-mv3/import/` and that template/schema downloads open as JSON. Confirm the manifest adds no permissions and the public schema is packaged without backend hosting.
- [ ] Human engineer performs and records these real-extension flows:

| Flow                                    | Required evidence                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| 250-question curriculum                 | Preview counts, group/order inspection, saved result, reload persistence                      |
| Identical reimport                      | No changes needed, unchanged completion/review state                                          |
| Expanded file after local edits/reviews | Local title/order/placement/progress retained; additions appended                             |
| Company/topic/track-only files          | Correct labels/references, existing aliases reused, no activation                             |
| Mixed invalid entries and null metadata | Visible path/reason report; valid subset matches preview                                      |
| Relevant edit between preview/apply     | Fresh preview, explicit second click, no early writes                                         |
| Controlled transaction failure          | No partial additions                                                                          |
| Controlled snapshot failure and retry   | Added-but-unsaved warning, successful retry, no duplicate database apply                      |
| Backup regression                       | Export, validate, cancel restore/reset; intentional restore only on a disposable test profile |

Use test-only mocks/harnesses for failure injection; do not ship a normal-product
failure toggle or corrupt the user's database. Attach screenshots or a recording
to the implementation PR. Pending human proof is a remaining review/merge gate,
not a reason to describe the feature as fully verified.

- [ ] Confirm only approved files changed and no migrations/schema/permissions were expanded. Record exact commands run, failures, skips, and remaining risks in the repository PR template. If unrelated baseline failures occur, identify them with exact commands and output rather than fixing unrelated code.
- [ ] Commit docs and final scoped fixes as `docs(imports): document content format and verification flows` or a specific `fix(imports): ...` when behavior changes.

## Done When

- [ ] Users can author/download the declared version-1 format and import each section independently or together.
- [ ] Preview is read-only; apply preserves local data, reports skipped entries, and never silently overwrites.
- [ ] Identical reimports are no-ops through the UI, runtime, database, and sync lifecycle.
- [ ] Freshness, rollback, snapshot retry, and file-selection races have automated coverage.
- [ ] Required automated checks pass; human proof is attached before PR review/merge.
- [ ] The handoff links the format reference and accurately states any remaining validation limitation.
