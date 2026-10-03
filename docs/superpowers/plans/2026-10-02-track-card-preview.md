# Track Card Preview Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this
> user-requested follow-up in the existing isolated PR worktree.

**Goal:** Allow All tracks to collapse in every populated state and inspect a
track's groups/questions/topics without activating or editing it.

**Architecture:** Tracks owns the inline preview and reuses its existing
useTrackForEdit read query, mounted only after a card opens. The dashboard does
not gain new routes or domain rules. Merge current main first to match the
user-referenced PR #180; preserve both sets of smoke instructions.

**Tech Stack:** Existing React, TypeScript, Tailwind tokens, Vitest, and Testing
Library.

## Task 1: Collection Toggle

- [x] In src/features/tracks/components/tracks-screen.test.tsx, replace the
      forced-open assertions with heading/chevron collapse and keyboard reopening
      when no track is active. Keep default expansion and addition reopening.
- [x] Run npm run test -- src/features/tracks/components/tracks-screen.test.tsx
      and confirm the changed expectations fail.
- [x] In other-tracks-accordion.tsx, derive isOpen from user expansion only and
      enable toggles whenever tracks.length > 0.

```tsx
expect(toggle).toHaveAttribute('aria-expanded', 'true')
await user.click(toggle)
expect(screen.queryByText('Grind 75')).not.toBeInTheDocument()
await user.keyboard('{Enter}')
expect(screen.getByText('Grind 75')).toBeVisible()
```

## Task 2: Read-Only Card Preview

- [x] Add collection tests proving lazy reads, ordered groups/questions/topics,
      keyboard toggles, preserved action behavior, loading/error/retry, and empty
      groups. Mock extension transport only; render actual feature components.
- [x] Run the focused test file and confirm new preview tests fail.
- [x] OtherTrackRow gets a native Preview button covering the summary, with
      aria-expanded and aria-controls. Render its summary and action controls as
      siblings above the button; actions remain independent controls.
- [x] Create src/features/tracks/components/track-card-preview.tsx using
      useTrackForEdit({ surface: 'dashboard', trackId }). Mount only when open.
      Map problemRows by slug, iterate sorted groups and each group's explicit
      problemSlugs, and render native details/summary sections. First group starts
      open; flat ordered rows wrap titles and topic labels. Use a bounded scroll
      area, loading status, error/Retry, and empty group/track messages.

```tsx
expect(sendMessage).not.toHaveBeenCalledWith(
  'tracks.getTrackForEdit',
  expect.anything(),
)
await user.click(screen.getByRole('button', { name: 'Preview Grind 75' }))
expect(sendMessage).toHaveBeenCalledWith('tracks.getTrackForEdit', {
  surface: 'dashboard',
  trackId: 'grind-75',
})
expect(screen.getByRole('region', { name: 'Grind 75 preview' })).toBeVisible()
expect(sendMessage).not.toHaveBeenCalledWith(
  'tracks.setActiveTrack',
  expect.anything(),
)
```

## Task 3: Verification And PR Update

- [x] Update docs/product.md, docs/architecture.md, and docs/testing.md with
      collapse behavior, read-only preview, and human happy-path/edge-case smoke.
- [x] Run focused Tracks and dashboard route tests, then npm run lint,
      npm run check, npm run build, Prettier check on touched files, and
      git diff --check. Record exact commands/results and skips below.
- [x] Review the diff for keyboard access, no accidental action bubbling, no
      writes on preview, full titles, empty/error cases, and existing boundaries.
- [x] Prepare Conventional Commit delivery on the existing branch, the draft
      PR #183 update, and the development build for user testing. Human
      live-extension screenshot/recording smoke remains required before
      review/merge.

## Completed Refinements

The user approved an enclosing card outline, exclusive track expansion, and
removal of visible Preview labels and track-row chevrons. The collection heading
and its separate chevron remain expansion controls. Typography uses the existing
bold sans-serif family. Active tracks keep green markers; expanded inactive
tracks and keyboard focus use neutral outlines. The current design is in
[the approved spec](../specs/2026-10-02-all-tracks-library-design.md).

An intermediate phase incorrectly removed the collection chevron. That phase
is superseded: the user's request applied only to track-row chevrons. The final
correction restored the collection button and retained its heading control.

## Consolidated Verification Record

Current main, including PR #180, was merged into the task branch. The
`docs/testing.md` conflict was resolved by retaining both smoke sections.

The initial seven focused regressions failed before implementation. Exclusive
expansion and removal of visible Preview text also failed before their fixes.
The incorrect collection-button removal initially left one stale route
assertion; its correction was tested again while the required Hide all tracks
button was absent, then passed after restoration.

Before review cleanup, the final focused run passed 103 Tracks/route tests;
`npm run check` passed database consistency, typecheck, lint, and 1,960 tests
across 187 files. Build, formatting, and diff checks passed. Existing JSDOM
scrollTo notices and the non-blocking build chunk-size warning remain.
Independent static review found no actionable issue; its duplicate test run
was blocked by sandbox EPERM on `.vite-temp`. Successful execution proof came
from the main agent's runs.

### Exact Command Ledger

These are the distinct commands actually run across the completed phases.
Repeated invocations are listed once. npm/npx commands used Node 24.20.0/npm
11.19.0 through the explicit PATH wrapper below; the final correction's focused
suite, lint/check/build, five-file formatting check, and diff check passed.

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin <npm-or-npx-command>
npm run test -- src/features/tracks/components/tracks-screen.test.tsx
npm run test -- src/features/tracks/components/tracks-screen.test.tsx src/app/dashboard/routes.test.tsx
npm run lint
npm run check
npm run build
npx prettier --write src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/track-card-preview.tsx src/features/tracks/components/tracks-screen.test.tsx
npx prettier --write --ignore-path /dev/null docs/product.md docs/architecture.md docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/track-card-preview.tsx src/features/tracks/components/tracks-screen.test.tsx docs/product.md docs/architecture.md docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
rtk git diff --check
npm run test -- src/features/tracks/components/tracks-screen.test.tsx -t 'lazily previews'
npm run test -- src/features/tracks/components/tracks-screen.test.tsx -t 'opens only one track preview'
npx prettier --write --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/tracks-screen.test.tsx docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --write --ignore-path /dev/null docs/product.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/tracks-screen.test.tsx docs/product.md docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npm run dev -- --config /private/tmp/cognipace-tracks-installed-dev.config.ts --port 3000
npx prettier --write --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --write --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npm run test -- src/features/tracks/components/tracks-screen.test.tsx -t 'toggles all tracks when the collection heading is clicked'
npx prettier --write --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/tracks-screen.test.tsx src/app/dashboard/routes.test.tsx docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/tracks-screen.test.tsx src/app/dashboard/routes.test.tsx docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/tracks-screen.test.tsx docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
```

### Installed Development Build And Evidence

The temporary configuration at
`/private/tmp/cognipace-tracks-installed-dev.config.ts` keeps source in the
managed PR worktree and writes output into
`/Users/tobiolutimehin/WebstormProjects/cognipace-v2/dist/chrome-mv3-dev`, the
folder Chrome loads. The original checkout's source remains clean. Localhost
source checks confirmed the current collection chevron, absent row chevrons,
single-track expansion, enclosing outlines, and corrected typography/styles.
They are source checks, not live installed-extension visual proof.

The user's supplied installed-extension screenshots are preserved byte-for-byte:

- [Before enclosing-outline/single-open refinement](../evidence/2026-10-02-all-tracks/installed-preview-before-framing.png).
- [Before active/expanded style distinction](../evidence/2026-10-02-all-tracks/installed-preview-before-state-distinction.png).

Both images precede the final style and chevron corrections. Human happy-path
and edge-case installed-extension smoke and final screenshots/recording remain
pending. Browser automation cannot claim extension URLs under its policy.
Keep PR #183 draft; follow `docs/testing.md > Track Card Preview` and
`All Tracks Collection And Import` for the complete manual flows.

### Skips And Recovery

Skipped `npm run zip` because release packaging is unchanged. Skipped
`npm run db:generate` because no schema changed; `npm run check` includes
`db:check` against merged main. No CSS-class-only tests were added for the
presentation refinements; existing behavior tests and human visual smoke apply.

Release impact remains an additive `feat(tracks)` UI change. Roll back by
reverting the scoped feature commits while retaining main's migration/editor
changes. Review cleanup preserves behavior and persistence compatibility.

## Review Cleanup

The user approved implementing the seven Ponytail review reductions.

- [x] Share the active/no-active collection rendering without changing behavior.
- [x] Merge overlapping collapse coverage and share repeated preview/file mocks.
- [x] Reuse preview defaults while retaining one addition and empty preview items.
- [x] Replace superseded instructions and repetitive logs with one honest record.
- [x] Run focused Tracks/import/route tests, lint/check/build, touched-file
      Prettier, and diff checks; update draft PR #183 with actual results.

Final installed-extension smoke and screenshots remain required before merge.

### Cleanup Verification

All seven reviewed reductions were applied. The overlap in heading-toggle
coverage was merged into the broader collection test, preserving the chevron
state assertions and separate no-active-track keyboard coverage. One test case
was consolidated; no behavior or smoke scenario was removed.

Focused regression coverage passed 119 tests across three files. `npm run lint`
and `npm run check` passed; the full suite passed 1,959 tests across 187 files.
`npm run build` passed with the existing non-blocking chunk warning. Touched-file
formatting and diff checks passed. Exact cleanup commands:

```sh
npm run test -- src/features/tracks/components/tracks-screen.test.tsx src/features/imports/components/import-content-panel.test.tsx src/app/dashboard/routes.test.tsx
npm run lint
npm run check
npm run build
npx prettier --write --ignore-path /dev/null src/features/tracks/components/tracks-screen.tsx src/features/tracks/components/tracks-screen.test.tsx src/app/dashboard/routes.test.tsx docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/tracks-screen.tsx src/features/tracks/components/tracks-screen.test.tsx src/app/dashboard/routes.test.tsx docs/superpowers/plans/2026-10-02-track-card-preview.md
rtk git diff --check
```

The same Node/PATH wrapper and skipped zip/schema-generation reasons above
apply. Final human installed-extension smoke and visual proof remain pending.
