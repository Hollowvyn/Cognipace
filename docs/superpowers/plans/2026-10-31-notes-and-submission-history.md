# Notes and Submission History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver permanent per-problem notes, complete forward submission history, retained AI assessments, and reliable reset and recovery across local and configured remote backups.

**Architecture:** Extend the merged binary IndexedDB foundation with record-level archive stores in the same physical database. Feature repositories own archive writes; the background coordinates core/archive publication, while the existing Notes tab and a Library problem-details page share feature UI and runtime APIs. Keep capture independent of review scheduling and AI generation.

**Tech Stack:** WXT MV3, TypeScript, React 19, TanStack Query/Router, Zod 4, native IndexedDB, SQLite WASM/Drizzle, Vitest, fake-indexeddb, React Testing Library; react-markdown for inert reading preview.

---

## Approval, baseline and execution boundary

The user approved moving from the [written design](../specs/2026-10-31-notes-and-submission-history-design.md) into full implementation planning on 2026-10-31. This plan records future work; no application implementation or execution results are claimed.

The application baseline is `a004b007`, including merged IndexedDB PR #212. Before writing these plans, the clean `codex/notes-design` branch was rebased onto `origin/main` at `5fee022d`, which adds workflow documentation without changing application code. The design commit became `791635fd`. The original checkout's package edits must remain untouched; all future package changes belong to this worktree and must be intentional feature dependencies.

Collaborative mode remains selected. Existing design approval stands. Use the current governance for execution and review; this document does not select autonomous mode, create chats, authorize publication, or waive human installed-extension proof.

## Read and execute in this order

| Order | Plan                                                                                           | Independently testable outcome                                                                            | Activation                           |
| ----- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1     | [Archive, backup and recovery](./2026-10-31-notes-phase-1-archive-and-recovery.md)             | Preserving IDB upgrade, durable archive repositories, coordinated resets, v7 backup and bounded transfers | Infrastructure only                  |
| 2     | [Submission and AI retention](./2026-10-31-notes-phase-2-submission-and-ai-retention.md)       | Trusted capture, identity/enrichment, retained feedback and optional generated code                       | Feature branch only                  |
| 3     | [Overlay Notes](./2026-10-31-notes-phase-3-overlay-notes.md)                                   | Existing Notes tab with flexible writing, reliable autosave and saved AI disclosures                      | Feature branch only                  |
| 4     | [Problem details and release proof](./2026-10-31-notes-phase-4-problem-details-and-release.md) | Shared details/history page, entry points, complete recovery and performance proof                        | Release only after every gate passes |

The plans are sequential because their public contracts depend on earlier phases. Do not parallelize edits to `register-handlers.ts`, `messaging.ts`, the IDB schema, backup contracts or the shared overlay controller. Within a chosen execution method, disjoint presentation tests may run independently after their contracts exist.

## Non-negotiable behavior

- One evolving personal note per problem; optional reflection per archived submission.
- Capture every completed detected submission after activation, including failures and AI-disabled submissions. Runs are excluded; no historical fetch/backfill.
- Archive capture and report arrival create no reviews, ratings, timing changes, FSRS transitions or track progress.
- Retain successfully generated feedback automatically. Retain suggested implementation only when explicitly generated. Hints remain session-only.
- Save to notes references a complete retained assessment. Saved AI sections begin collapsed; removing the inclusion retains the report in history.
- Autosave uses 600 ms trailing debounce and 3,000 ms maximum wait, one accepted command in flight, revision conflicts and stable retry identity.
- No TTL or storage-budget eviction of learning records. Only unreferenced technical data is collected.
- Reset problem clears learning data across both stores, including legacy log fields. Keep catalog metadata and track placements. Overlay Restart and track-progress reset retain their separate meanings.
- Full local and configured remote backups include notes, history, code, reflections, reports and saved AI inclusions. Restore publishes one matching pair; credentials remain separate.

## Shared contract vocabulary

Use these names across all four plans. Domain schemas live in `src/features/notes/domain/notes-records.ts`; runtime schemas live in `src/features/notes/api/notes-contracts.ts`. Platform types never import feature code.

```ts
export type NotesScope = {
  datasetToken: string
  problemToken: string
}
export type NoteTarget =
  | { kind: 'problem' }
  | { kind: 'reflection'; submissionId: string }
export type SaveNoteCommand = {
  commandId: string
  problemSlug: string
  scope: NotesScope
  target: NoteTarget
  expectedRevision: number
  markdown: string
}
export type NoteDocument = {
  formatVersion: 1
  revision: number
  markdown: string
  updatedAt: string | null
}
export type SaveNoteResult =
  | { status: 'saved'; commandId: string; document: NoteDocument }
  | { status: 'conflict'; document: NoteDocument }
  | { status: 'stale-scope' }
```

An absent document reads as revision zero with empty Markdown and `updatedAt: null`. Opening a page must not create a learning record. `submissionId` in Notes APIs means the stable **internal archive ID**; external LeetCode IDs use the explicit name `externalSubmissionId`.

An editor scope contains a dataset token and problem token, not the active archive generation. A single-problem reset changes that problem token; a complete restore or Clear local data changes the dataset token. A staged archive-generation switch can therefore preserve valid scopes for unrelated problems.

## Storage implementation decisions

Use IndexedDB schema version 2 in `cognipace-local-v1`. Keep `records`; add `coreSnapshots`, `problemNotes`, `submissions`, `analysisReports`, `savedAiNotes`, `payloads`, and `problemScopes`. The `records` namespace also holds compact command receipts, replacement continuations and bounded backup-transfer spools.

The active head contains `formatVersion`, `coreSnapshotId`, `archiveGeneration`, `datasetToken`, `revision`, `lastVerifiedRevision`, `savedAt` and optional `replacementId`. It does not contain SQLite bytes. Archive-only changes update this head in their own transaction; they never call `serializeDb`, `flushDbSnapshot`, or `runDbMutation`'s SQLite path.

Archive metadata keys begin with `archiveGeneration`. Payloads are immutable and shared by reference. For reset/delete/restore, stage a fresh metadata generation in bounded cursor batches, reusing payload IDs for unchanged data. Hold the existing mutation/replacement barrier through preparation and publication. Publish the candidate core pointer, archive generation, reset scopes, global revision and continuation atomically. Preserve the previous head/generation as the one prior replacement recovery root. Copy-on-write generations make its archive state real rather than a pointer into mutated active records.

Do not add a generic repository framework, RPC library, global React store, backend, cloud account system, or new required Chrome permission. Extend existing feature services and runtime registration points. Keep `entrypoints -> app -> features -> platform/lib/components` and root feature barrels free of server/data exports.

## Backup project dependency

The existing [Drive Phase 2 plan](./2026-10-16-reliable-backup-phase-2-drive-data.md) owns Google authentication, optional permissions, transport, versioned retention and Gist cutover. Its references to a current **v6** payload must become **v7** when integrated with Notes; its exact-revision acknowledgment must read the new lightweight head.

Notes Phase 1 supplies the v7 contract, consistent revision export, replacement importer and bounded runtime transfers. Notes Phase 4 supplies cross-project acceptance tests. It does not duplicate OAuth or invent a second backup destination.

On this baseline, Gist rejects truncated content and does not verify a complete upload by downloading it. That is an unmet release dependency, not a passing backup path. Before Notes activation, either the existing backup project must deliver its approved large-payload/readback and verified Drive cutover, or the currently enabled Gist destination must pass the **same complete v7 round-trip suite** through its approved transport work. No automatic fallback to SQLite-only backups is allowed. No new raw-Gist host permission is authorized by this Notes plan.

Data export must not send a 10,000-entry archive in one runtime message. Use dashboard-owned transfer sessions with at most 256 KiB UTF-8 per chunk, order/digest checks, a durable spool and explicit close/cancel. Treat whole-document JSON parsing memory as a measured release risk; bounded IPC is not a claim of constant-memory restore parsing.

## Coverage map

| Design requirement                                                   | Owning tasks                              |
| -------------------------------------------------------------------- | ----------------------------------------- |
| Existing Notes tab, shared editor, prompts and safe preview          | Phase 3 tasks 1–6                         |
| Notes-first details page; three recent entries and complete history  | Phase 4 tasks 1–2                         |
| 600/3000 ms autosave, retry, revision conflicts and navigation flush | Phase 1 tasks 3–5; Phase 3 tasks 1–2      |
| Failed/accepted capture, stable identity and complete pinned code    | Phase 2 tasks 1–3                         |
| Feedback-first AI, optional implementation, saved dropdowns          | Phase 2 tasks 4–5; Phase 3 tasks 5–6      |
| Durable migration and no SQLite rewrite on note saves                | Phase 1 tasks 1–4                         |
| No TTL; root-aware technical cleanup and usage                       | Phase 1 task 11; Phase 4 task 3           |
| Full/bulk reset, delete, fresh scopes and matching recovery          | Phase 1 tasks 6–7; Phase 4 task 5         |
| Full v7 backup; legacy preview and automatic-pull protection         | Phase 1 tasks 8–10; Phase 4 tasks 3 and 5 |
| Large archive, runtime transfer and remote verification              | Phase 1 task 9; Phase 4 tasks 4–5         |
| Current docs, privacy, human proof and release gate                  | Every phase's final task; Phase 4 task 6  |

## Execution and review checkpoints

- [ ] Read current authority docs and load the selected execution skill before application edits. Keep the existing worktree unless the user requests another one.
- [ ] Run each task's RED command, implement the specified boundary, then run its GREEN command. Red must identify the missing behavior, not a broken fixture or environment.
- [ ] Make the task-sized Conventional Commit after its focused checks pass. File paths in each task are the stage allowlist; never stage unrelated changes with `git add .`.
- [ ] At each phase boundary, check spec compliance and implementation quality using the selected workflow's required reviews. Fix findings before declaring the phase complete.
- [ ] Record exact validation commands/results, skipped commands/reasons, recovery implications and human proof status in the phase handoff. Do not equate automated success with PR-review/merge readiness.
- [ ] Keep capture/editing off releasable main until full backup/reset and supported remote gates pass. Infrastructure-only merges may not activate records or imply completed Notes support.

## Common validation and acceptance

Every phase supplies focused paths and expected behavior. After those pass, run the applicable strict command set from `docs/agent-governance.md`:

```sh
rtk npm run db:check
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
```

Run `rtk npm run zip` for dependency/packaging changes and final installed-extension proof. Run `rtk npm run db:generate` only if an implementation changes Drizzle schema; an IndexedDB-only version upgrade does not generate SQL. Install dependencies only in this worktree using the repository-pinned Node/npm and its lockfile.

All implementation phases require human installed-extension happy-path and edge-case smoke with screenshots or recording before PR review/merge. Phase plans name exact flows. Documentation changes in this planning commit require only Prettier and whitespace checks; none of the future application checks or benchmarks is claimed to have run.

## Reference documentation checked for this plan

Library syntax was checked through Context7 on 2026-10-31. These primary references support the implementation snippets:

- [Vitest 4.1.6 timer APIs](https://github.com/vitest-dev/vitest/blob/v4.1.6/docs/api/vi.md): asynchronous fake-timer advancement and cleanup.
- [Zod APIs](https://github.com/colinhacks/zod/blob/main/packages/docs/content/api.mdx): strict objects and discriminated unions.
- [react-markdown](https://github.com/remarkjs/react-markdown): inert React rendering, `skipHtml`, `allowedElements`, and `urlTransform`; do not add raw-HTML plugins.
- [IndexedDB transactions](https://www.w3.org/TR/IndexedDB/#transactions): transaction completion, abort and durability boundaries. Keep unrelated asynchronous preparation outside a live IDB transaction.

Recheck documentation when execution changes the installed library version or API usage. Context7 queries must not contain personal note/code content or credentials.
