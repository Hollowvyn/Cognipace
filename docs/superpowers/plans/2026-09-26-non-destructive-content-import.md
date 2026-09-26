# Non-Destructive Content Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship repeatable, additive JSON imports of questions, ordered tracks, companies, and topic labels with a preview and reliable persistence outcomes.

**Architecture:** A focused imports feature normalizes files and builds pure addition plans. Existing problems and tracks owners expose read projections and insert-only operations. Dashboard-only runtime handlers serialize preview/apply work and use the current snapshot and optional sync lifecycle.

**Tech Stack:** TypeScript, React, Zod 4, Drizzle/SQLite WASM, WXT runtime messaging, TanStack Query, Vitest, React Testing Library.

---

## Authority and Workspace

Approved design: [Non-Destructive Content Import Design](../specs/2026-09-26-non-destructive-content-import-design.md).

Planning base: `f391f41` on `codex/non-destructive-imports`, based on `origin/main`
at `472a053`. Worktree:
`/Users/tobiolutimehin/WebstormProjects/cognipace-v2/.worktrees/non-destructive-imports`.
Run commands from that directory. Relative paths below are relative to this
worktree, never the original dirty checkout. Do not fetch/reset onto a different
base in the middle of execution without inspecting intervening changes.

Follow `docs/agent-governance.md`, `docs/architecture.md`, `docs/product.md`,
`docs/testing.md`, and `design.md`. The design's merge rules are authoritative
for this approved new capability. Update current authority docs only when the
corresponding implementation exists.

## Execution Order

| Phase | Plan                                                                                                       | Independently verifiable outcome                                                |
| ----- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1     | [Format and merge planning](./2026-09-26-content-import-phase-1-contract-and-planner.md)                   | Public schema/templates and a pure parser/planner with tests; no runtime writes |
| 2     | [Persistence and runtime](./2026-09-26-content-import-phase-2-persistence-and-runtime.md)                  | Trusted preview/apply/retry operations with real SQLite and runtime tests       |
| 3     | [Settings workflow and release validation](./2026-09-26-content-import-phase-3-settings-and-validation.md) | Complete user workflow, docs, automated validation, and human smoke handoff     |

Execute in order. Each phase depends on the prior phase's contracts and passing
checks. These are three delivery boundaries of one feature, not three competing
import implementations. Do not expose the Settings action until Phase 2 is
complete. A partial phase is not the finished product.

Each numbered task uses a red/green cycle. Add the named behavior test, run the
exact focused command and confirm the intended failure, make the scoped change,
rerun that command, inspect the diff, then make its Conventional Commit. Code
blocks specify the concrete interfaces and critical behavior; add tests for all
listed cases before treating a task as complete. Keep commits limited to the
task's explicit files.

## Shared Decisions Across All Phases

- Runtime sends `fileText`, not a parsed object or client-created operations.
  This preserves byte-limit enforcement and treats the background as authority.
- Raw file limit is 5 MiB UTF-8; total array-entry limit is 50,000. Never truncate.
- Public authoring schemas are strict. The tolerant parser reports mistakes and
  retains valid data; it does not parse the entire file through one strict schema.
- Normalize/fold explicit problem records before applying defaults. Plan accepted
  tracks/groups before synthesizing their implicit problem records.
- Existing scalars are immutable to this importer, including null/unknown values.
  Associations are additive; preserved values must still appear in preview.
- Import does not touch practice, progress, settings, sessions, or migrations.
- A repeated import must issue zero mutation statements and have no snapshot,
  dirty-mark, or invalidation side effects.
- A database transaction failure and a snapshot failure are different outcomes.
  The latter requires retrying persistence, not replaying the database writes.
- Fingerprint only canonical relevant state, normalized input, and plan. Exclude
  time-dependent proposed timestamps. A practice review alone does not stale it.
- Use the existing mutation queue. Do not create an independent import queue.

## Runtime Vocabulary

All three plans use these names consistently:

| Method                     | Request                                                           | Response                         |
| -------------------------- | ----------------------------------------------------------------- | -------------------------------- |
| `imports.preview`          | `{ surface: 'dashboard', fileText: string }`                      | `ImportPreview`                  |
| `imports.apply`            | `{ surface: 'dashboard', fileText: string, fingerprint: string }` | `ApplyImportResponse`            |
| `imports.retryPersistence` | `{ surface: 'dashboard' }`                                        | `RetryImportPersistenceResponse` |

Preview status is `ready`, `unchanged`, `empty`, or `blocked`. Apply status is
`saved`, `persistence-error`, `stale`, `unchanged`, or `blocked`. Database service
status `committed` is internal and is never shown as durable success to the UI.
Retry status is `saved`, `persistence-error`, or `repreview`.

The retry response concerns the current local snapshot. It never reapplies an
import. After a worker restart, return `repreview` instead of inventing a saved
result for an unrecognized pending operation.

## Toolchain and Commands

The repository pins Node `24.20.0` and npm `11.19.0`. During planning the shell's
`node` reported the pinned version, but `npx` launched under Node 26 and failed
the package's dev-engine check. System Git/Python also encountered the pending
Xcode license. Do not accept a license on the user's behalf.

- [ ] Before execution, inspect `rtk proxy node --version` and `rtk proxy npm --version`.
- [ ] Select the existing pinned Node/npm installation, then run `rtk proxy npm ci` in this worktree. Do not change the lockfile to repair local PATH issues.
- [ ] If the toolchain still cannot launch the pinned commands, record the exact failure. Continue independent work; do not claim tests pass.

All shell commands use the project's `rtk` prefix. For Git in this environment,
use the working binary:

```sh
rtk proxy /Library/Developer/CommandLineTools/usr/bin/git status --short --branch
```

Before each phase, inspect the worktree for unrelated changes. The approved
worktree is already isolated; do not create another one.

## Coverage Map

| Approved requirement                                                    | Implementing tasks                |
| ----------------------------------------------------------------------- | --------------------------------- |
| Versioned schema and six templates                                      | Phase 1 tasks 1–2                 |
| Null handling, strict identity, resource ceilings, granular diagnostics | Phase 1 tasks 1, 3–4              |
| Duplicate folding and explicit metadata precedence                      | Phase 1 task 4                    |
| Local-value preservation, labels, stable identities, appending          | Phase 1 task 5; Phase 2 tasks 1–2 |
| No-op imports and read-only previews                                    | Phase 1 task 5; Phase 2 tasks 2–3 |
| Stale preview protection and server-derived operations                  | Phase 2 tasks 2–3                 |
| Atomic SQLite writes and snapshot recovery                              | Phase 2 tasks 1–3                 |
| Sender authorization and existing cache/sync lifecycle                  | Phase 2 task 3                    |
| Settings UX and template downloads                                      | Phase 3 tasks 1–3                 |
| Preservation regression, documentation, manual/visual proof             | Phase 2 task 2; Phase 3 task 4    |

## Release Gate

- [ ] All phase tasks and focused tests pass.
- [ ] Required full commands pass: `rtk proxy npm run db:check`, `rtk proxy npm run lint`, `rtk proxy npm run check`, `rtk proxy npm run build`.
- [ ] Format touched files; run explicit Prettier checks on new planning Markdown with `--ignore-path /dev/null` because this repository ignores historical plan/spec directories by default.
- [ ] Human engineer completes the Phase 3 happy-path and edge-case checklist and attaches screenshots or recording before implementation PR review/merge.
- [ ] PR uses `.github/PULL_REQUEST_TEMPLATE.md`, `feat(imports): ...`, linked issue or documented exception, exact validation/skips, release impact, and recovery notes.

`npm run db:generate` is excluded because no schema changes are approved.
`npm run zip` is not required unless implementation changes packaging behavior.
No new permissions, network enrichment, remote import, or sync policy changes
are part of these plans.

This planning commit changes Markdown only. Implementation tests and human
smoke proof have not been executed by writing this plan.

## Planning Validation Record

On 2026-09-26, the author reviewed spec coverage, field/type consistency, task
dependencies, and the named repository integration points. All local Markdown
links resolve. A read-only Node/TypeScript syntax check parsed 34 code snippets
and five JSON examples across the six touched Markdown documents. Parsing these
examples does not establish that future implementation code type-checks or
passes its behavioral tests.

Commands run successfully from the worktree:

```sh
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --write --ignore-path /dev/null docs/superpowers/plans/2026-09-26-*.md docs/superpowers/specs/2026-09-26-non-destructive-content-import-design.md docs/superpowers/README.md
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --check --ignore-path /dev/null docs/superpowers/plans/2026-09-26-*.md docs/superpowers/specs/2026-09-26-non-destructive-content-import-design.md docs/superpowers/README.md
rtk proxy /Library/Developer/CommandLineTools/usr/bin/git diff --check
rtk proxy node --input-type=module -
```

The final command received an inline read-only script that resolves Markdown
links, parses JSON fences with `JSON.parse`, and checks TypeScript/TSX/JavaScript
fences with `typescript.createSourceFile` parse diagnostics. No application
code was executed.

Skipped `rtk proxy npm ci`, `rtk proxy npm run db:check`,
`rtk proxy npm run lint`, `rtk proxy npm run check`,
`rtk proxy npm run build`, and the phase-specific `rtk proxy npx vitest run`
commands: this task creates implementation plans, not application changes, and
the planned test files do not exist yet. `rtk proxy npm run db:generate` is
excluded because no database schema changes are planned. Human smoke proof
remains part of implementation completion.

While planning, `origin/main` advanced to `6aea565` with repository identity and
documentation changes. The inspected implementation files remain unchanged.
The worktree deliberately retains its recorded base; inspect the upstream
identity/doc changes before integrating the eventual implementation branch.
