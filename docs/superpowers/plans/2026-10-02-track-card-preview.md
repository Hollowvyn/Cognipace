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
