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

## Execution Record

Current main (including PR #180) was merged into the existing task branch.
The docs/testing.md conflict was resolved by keeping both smoke sections.

The initial focused run failed in the expected seven cases: the disabled
no-active-track toggle and absent preview controls. Implementation passed all
101 focused Tracks/dashboard route tests. The full check passed 187 files and
1,958 tests. Lint, build, formatting, and diff checks passed. Independent
read-only review reported no actionable findings. Existing JSDOM scrollTo
notices and the non-blocking build chunk-size warning remain.

Commands run with Node 24.20.0/npm 11.19.0 using this wrapper:

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin <npm-or-npx-command>
```

```sh
npm run test -- src/features/tracks/components/tracks-screen.test.tsx
npm run test -- src/features/tracks/components/tracks-screen.test.tsx src/app/dashboard/routes.test.tsx
npm run lint
npm run check
npm run build
npx prettier --write src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/track-card-preview.tsx src/features/tracks/components/tracks-screen.test.tsx
npx prettier --write --ignore-path /dev/null docs/product.md docs/architecture.md docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/track-card-preview.tsx src/features/tracks/components/tracks-screen.test.tsx docs/product.md docs/architecture.md docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
rtk git diff --check
```

Skipped npm run zip because release packaging is unchanged. Skipped
npm run db:generate because this follow-up changes no schema; npm run check
includes db:check against the already merged migration. Human installed-extension
smoke and new preview screenshot/recording proof remain pending, including
actual card hit targets, narrow wrapping, and keyboard focus. No additional
browser automation was performed; the development extension is provided for
the user's requested hands-on testing. See docs/testing.md > Track Card Preview.

Release impact remains an additive feat(tracks) UI change. Roll back by
reverting the collection/import and preview feature commits while retaining
main's existing migration and editor changes.

## Installed-Extension Visual Follow-Up

The user's supplied screenshot shows an open NeetCode 150 card. They requested
that the expanded groups visibly belong to that track and that the redundant
Preview label disappear. Their latest refinement asks for a clear enclosing
outline without an extra caption, and only one open track at a time. This is a
scoped adjustment to the approved card-click interaction.

- [x] Extend preview interaction coverage for no visible Preview text, content
      contained in its owning article, exclusive track expansion, and closing
      the preview when All tracks collapses. Confirm the exclusive-expansion
      test fails before implementation. Preserve keyboard and action coverage.
- [x] In other-tracks-accordion.tsx, enclose the open summary and content within
      a clear continuous rounded outline/background, give the open summary a
      tonal fill, and remove the visible Preview text and extra owning-track
      caption. Lift the open track ID into the collection so opening another
      track closes the current one. Retain the native toggle and chevron.
- [x] Update docs/product.md and the smoke guidance in docs/testing.md. Run focused tests, npm run lint,
      npm run check, npm run build, touched-file Prettier, and git diff --check.
- [x] Publish the scoped change to existing draft PR #183. Add the supplied
      screenshot as human installed-extension evidence of the earlier preview
      state; final framing proof remains pending another human screenshot.
      Continue the dev build into the user's installed WebstormProjects folder.

### Follow-Up Verification Record

The exclusive-expansion test failed before implementation because both track
previews remained in the document. The earlier no-visible-Preview regression
also failed before the label was removed. The final focused run passed 103
tests across two files; `npm run check` passed 1,960 tests across 187 files,
database consistency, typecheck, and lint. Production build passed with the
existing non-blocking chunk-size warning. Independent static review found no
actionable issue; the reviewer's duplicate test attempt was blocked by sandbox
EPERM on `.vite-temp`, so execution evidence comes from the successful main
agent runs.

Commands executed from the feature worktree through `rtk proxy`, using the
project's Node v24.20.0 PATH:

```sh
npm run test -- src/features/tracks/components/tracks-screen.test.tsx -t 'lazily previews'
npm run test -- src/features/tracks/components/tracks-screen.test.tsx -t 'opens only one track preview'
npm run test -- src/features/tracks/components/tracks-screen.test.tsx src/app/dashboard/routes.test.tsx
npm run lint
npm run check
npm run build
npx prettier --write --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/tracks-screen.test.tsx docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --write --ignore-path /dev/null docs/product.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/tracks-screen.test.tsx docs/product.md docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
rtk git diff --check
npm run dev -- --config /private/tmp/cognipace-tracks-installed-dev.config.ts --port 3000
```

The temporary dev configuration keeps feature source in the managed worktree
and writes development output into
`/Users/tobiolutimehin/WebstormProjects/cognipace-v2/dist/chrome-mv3-dev`, the
folder Chrome loads. Localhost source verification confirmed the single-track
state, enclosing outline, and absent extra caption. The original checkout's
source remains clean.

Skipped `npm run zip` because release packaging is unchanged. Skipped
`npm run db:generate` because no schema changed; `npm run check` includes the
database consistency check. Human installed-extension happy-path and edge-case
smoke remains pending for this latest refinement. Browser automation cannot
claim extension URLs under its URL policy; source and automated tests are not
live visual proof. The supplied human screenshot is preserved byte-for-byte at
`docs/superpowers/evidence/2026-10-02-all-tracks/installed-preview-before-framing.png`
and is labeled as the installed preview before this framing/accordion change.
Keep the PR draft until final human smoke and updated visual proof are attached.

## Collection Heading Typography Follow-Up

The user approved matching All tracks to the dashboard's bold sans-serif
headings. Replace only the generic serif family and semibold weight, keeping
the larger collection title, icon, count, and container hierarchy.

- [x] Use the existing `font-sans` token and `font-bold` in
      `src/features/tracks/components/other-tracks-accordion.tsx`, retaining
      `text-2xl`. Update the design spec and docs/testing.md to record this
      approved choice and its visual smoke check.
- [x] Run the existing focused Tracks/route tests, required lint/check/build,
      touched-file Prettier, and diff check. No new tests that assert CSS classes
      are needed for this presentation-only adjustment.
- [x] Update draft PR #183 and verify the running dev server serves the new
      heading in the user's installed extension folder. Final human visual
      proof remains pending.

### Typography Verification Record

Existing focused coverage passed 103 tests across two files. `npm run lint`
passed; `npm run check` passed database consistency, typecheck, lint, and 1,960
tests across 187 files. `npm run build` passed with the existing non-blocking
chunk-size warning. Prettier and diff checks passed. Localhost verification
confirmed `font-sans text-2xl font-bold`, removal of `font-serif`, and the
installed dev dashboard's connection to port 3000. This is source verification;
the final installed-extension visual check is still pending.

Commands executed through `rtk proxy` with the project's Node v24.20.0 PATH:

```sh
npm run test -- src/features/tracks/components/tracks-screen.test.tsx src/app/dashboard/routes.test.tsx
npm run lint
npm run check
npm run build
npx prettier --write --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --write --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
npx prettier --check --ignore-path /dev/null src/features/tracks/components/other-tracks-accordion.tsx docs/testing.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md docs/superpowers/plans/2026-10-02-track-card-preview.md
rtk git diff --check
```

Skipped `npm run zip` because packaging is unchanged. Skipped
`npm run db:generate` because no schema changed; database consistency passed
inside `npm run check`. No new tests were added for this reversible font-class
adjustment. Existing behavior coverage and the human visual smoke checklist
remain the relevant checks. The already running dev server serves the updated
heading; browser automation remains unable to claim extension URLs.
