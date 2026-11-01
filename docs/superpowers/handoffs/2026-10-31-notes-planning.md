# Notes and submission history: planning handoff

Date: 2026-10-31. Branch: `codex/notes-design`.

The user requested the full implementation plan after receiving the committed design. The [roadmap](../plans/2026-10-31-notes-and-submission-history.md) links four phase-sized execution plans containing 31 tasks. Application implementation has not started; their tests, benchmarks and human smoke are future acceptance work.

The clean branch was rebased onto `origin/main` at `5fee022d`; the application baseline remains `a004b007` with IndexedDB PR #212. The index conflict preserved both the new workflow design and the Notes design. The prior design commit is now `791635fd`; no published branch was rewritten.

The original checkout's `package.json` and `package-lock.json` match the SHA-256 values captured before worktree creation. No dependencies were installed or package files changed in this planning work.

## Plan review

The author checked all approved design sections against the roadmap's coverage map and the four task lists. The review clarified compact command receipts, adopted DB handles after restore, delayed capture-begin/reset races, current saved-AI membership after replay, immutable matching recovery roots and consistent bounded backup transfers. Full Reset problem returns practice to new/unsuspended and clears all per-problem learning records while retaining catalog metadata and track placements.

The roadmap carries exact public vocabulary and release dependencies. Remote backup transport remains owned by the approved backup project; Notes cannot activate with an enabled destination that silently omits or cannot verify the archive. Human installed-extension evidence remains mandatory for implementation PR review/merge. This planning self-review is not an independent implementation review.

## Validation

The final document checks are run from this worktree:

```sh
rtk proxy /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/.bin/prettier --write --ignore-path /dev/null docs/superpowers/plans/2026-10-31-notes*.md docs/superpowers/specs/2026-10-31-notes-and-submission-history-design.md docs/superpowers/handoffs/2026-10-31-notes-planning.md docs/superpowers/README.md
rtk proxy /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/.bin/prettier --check --ignore-path /dev/null docs/superpowers/plans/2026-10-31-notes*.md docs/superpowers/specs/2026-10-31-notes-and-submission-history-design.md docs/superpowers/handoffs/2026-10-31-notes-planning.md docs/superpowers/README.md
rtk proxy python3 /Users/tobiolutimehin/.codex/visualizations/2026/10/31/01a193c4-b5ee-79c3-b170-55cf50226e3c/notes-plan-review.py
rtk git diff --check
rtk git diff --cached --check
```

The one-off Python audit checks required plan headers, local links, code fences, task/step numbering, unresolved markers, 31 execution tasks and the original package-file hashes. It does not execute the TypeScript snippets or establish application correctness.

Two initial document checks needed correction: Prettier without the ignore override skipped the historical-planning directory, so it was rerun with `--ignore-path /dev/null`; the first case-insensitive marker scan rejected the legitimate phrase describing the existing Notes placeholder, so the unresolved-marker scan was narrowed and rerun. Final formatting, structural/link and whitespace checks pass before this handoff is committed.

Skipped commands:

| Command                   | Reason                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `rtk npm test`            | Documentation-only planning; no application implementation or tests changed.                                                  |
| `rtk npm run lint`        | No TypeScript/application code changed.                                                                                       |
| `rtk npm run check`       | No application behavior or persisted implementation changed.                                                                  |
| `rtk npm run build`       | No application/dependency/build changes.                                                                                      |
| `rtk npm run db:check`    | No database implementation or Drizzle artifacts changed.                                                                      |
| `rtk npm run db:generate` | No Drizzle schema changes; the proposed IDB upgrade is not implemented.                                                       |
| `rtk npm run zip`         | No package or artifact behavior changed.                                                                                      |
| `rtk npm run format`      | Targeted Prettier checks cover every touched Markdown file; a repository-wide check is unnecessary for this docs-only change. |

Manual smoke and screenshots are not applicable to the planning commit itself. The phase plans explicitly require them for behavior-changing implementation, including happy paths, failures, reset/restore, worker restart, concurrent editing, narrow layouts and configured remote round-trip.

## Next action

Execute Phase 1 using the chosen execution workflow. Keep the existing clean worktree and preserve the original package edits. The full plan is recorded; no new brainstorming round or repeat design approval is required. Implementation and release readiness remain distinct from this completed planning task.
