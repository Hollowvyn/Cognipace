# All Tracks Collection And Import Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this
> approved plan in the isolated worktree. Track progress with the checkboxes.

**Goal:** Make the complete track collection prominent and support template-first
track import directly from Tracks.

**Architecture:** Tracks owns collection rows; Imports reuses its existing
preview/apply hook and presents a track-specific entry state. The dashboard
composes an import route modal with guarded dismissal. Persistence and runtime
contracts remain owned by the existing importer.

**Tech Stack:** React 19, TypeScript, TanStack Router, existing Tailwind tokens,
Vitest and React Testing Library.

## Task 1: Collection Presentation

- [x] Update src/features/tracks/components/tracks-screen.test.tsx to expect an
      expanded collection, explicit activation, accessible progress, and optional
      import actions in populated and empty states. Retain collapse/reopen tests.
- [x] Run npm run test -- src/features/tracks/components/tracks-screen.test.tsx
      and confirm the new expectations fail before implementation.
- [x] Update other-tracks-accordion.tsx: initialize expansion to true, use a
      library icon and count pill in a tonal header, make its toggle a semantic
      button, and use labeled article rows with an Active badge and progress bars.
      Replace the inactive activation icon with Button size="sm" variant="outline"
      and aria-label={`Set ${row.track.title} active`}.
- [x] Pass an optional importTrackAction through TracksScreen and its empty
      state; render it beside newTrackAction in the collection actions.
- [x] Rerun focused Tracks tests and retain all mutation/confirmation behavior.

## Task 2: Template-First Import And Route

- [x] Add route tests in src/app/dashboard/routes.test.tsx for the import icon,
      packaged track template, file preview/apply, cancellation, and blocked Close,
      Escape, and backdrop during apply and persistence failure. Add variant tests
      to src/features/imports/components/import-content-panel.test.tsx.
- [x] Run npm run test -- src/features/imports/components/import-content-panel.test.tsx
      src/app/dashboard/routes.test.tsx and confirm the new expectations fail.
- [x] Extend ImportContentPanel with variant="tracks", hiding its duplicate
      header and using Surface variant="flat" inside the modal. Use unique file
      input IDs and track-oriented labels. Notify its parent whether dismissal is
      allowed using onDismissAvailabilityChange(isAllowed), where isAllowed is
      !isWriting && !isPersistencePending. Preserve the shared workflow hook.
- [x] Extend ImportTemplates with variant="tracks": a Download track template
      button links to browser.runtime.getURL('/import/examples/track-only.json')
      with download="track-only.json" and short authoring instructions. Keep the
      existing Settings template list for the default variant.
- [x] Add dashboardPaths.trackImport = '/tracks/import', matching metadata,
      an ImportTracksModalPage in track-modal-pages.tsx, and a child route in
      routes.tsx. Compose ImportContentPanel variant="tracks" in RouteModal.
- [x] Add optional dismissDisabled to RouteModal. Guard closeModal, Escape,
      and backdrop; display a disabled Close button when locked and the existing
      Close link when unlocked. Pass the import panel's availability to that prop.
- [x] Add the Import tracks IconButton with Upload beside New Track in
      tracks-page.tsx. Verify the modal returns to Tracks without changing activation.
- [x] Rerun focused Tracks/import/route tests.

## Task 3: Documentation And Verification

- [x] Update docs/product.md, docs/architecture.md, docs/import-format.md,
      and docs/testing.md with the collection and direct import flow.
- [x] Run npx prettier --write on touched source and Markdown files; run
      npx prettier --check on the same files.
- [x] Run npm run lint, npm run check, and npm run build. Report exact failures
      or skipped commands with reasons.
- [x] Inspect actual React collection and import form at desktop and narrow
      widths; verify import opens without toggling the collection and capture proof.
- [x] Review the final diff against the approved spec. Record a human smoke
      checklist for import/reimport, invalid files, stale preview, save retry,
      reload persistence, unchanged activation, and Settings importer regression.
- [x] Commit the scoped change with a Conventional Commit title and provide a
      PR-ready handoff. Human extension smoke remains pending until supplied.

## Execution Record

Implemented the approved Collection rows direction and template-first import
route. No issue was created: this is a direct user-approved product request.
No database shape, runtime contract, extension permission, or sync policy changed.

Focused regression tests verified default expansion, activation, management
confirmations, template/file selection, preview cancellation, collection refresh,
unchanged activation, and pending apply/save retry. Independent technical review
found focus loss when temporary import actions disappeared. Reproduced it in
the browser and with failing route tests, then fixed it locally in the import
panel; all 113 focused tests pass and the final targeted review has no remaining
findings.

Commands run from the attached worktree using Node 24.20.0/npm 11.19.0. npm/npx
commands use this toolchain wrapper:

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin <command>
```

```sh
npm ci --prefer-offline
npm run prepare:wxt
npm run test -- src/features/tracks/components/tracks-screen.test.tsx src/features/imports/components/import-content-panel.test.tsx src/app/dashboard/routes.test.tsx
npm run test -- src/app/dashboard/routes.test.tsx -t 'keyboard focus|guards modal dismissal|cancels a track file preview'
npm run test -- src/app/dashboard/routes.test.tsx -t 'keyboard focus|guards modal dismissal'
npm run test -- src/app/dashboard/routes.test.tsx -t 'retrying a failed preview'
npx eslint src/app/dashboard/routes.test.tsx src/features/tracks/components/tracks-screen.test.tsx
npm run lint
npm run check
npm run build
```

Initial dependency setup selected the host's Node 26 and was rejected by the
pinned devEngines contract; corrected by the explicit Node 24 wrapper. Initial
lint/check attempts found unused test variables and an incorrectly typed act
callback, all corrected. The new focus tests intentionally failed before their
fixes and passed afterward. Final npm run lint and npm run check passed; check ran 186 test files with
1,895 passing tests. npm run build passed and included the packaged track
template. Build emits the non-blocking >500 kB chunk warning; route tests emit
the existing JSDOM scrollTo warning. git diff --check passed.

Agent visual checks used the real React dashboard with a temporary extension
messaging adapter and real import normalization/planning, served at
http://127.0.0.1:59341/#/tracks. Desktop 1280x900 and narrow 390x844 inspections
showed the collection hierarchy, wrapped controls, and template-first dialog.
The clean browser session had no warnings, errors, blank screen, or framework
overlay. Activation, collapse/reopen, template download, JSON preview, keyboard
apply, result focus, Tab containment, and Escape return were exercised. The
adapter did not validate actual browser-storage persistence. A final narrow
file-upload attempt was denied by the user, and further browser QA was stopped
at their request. No workaround was attempted. Screenshot evidence is local:

- /private/tmp/cognipace-all-tracks-desktop.png
- /private/tmp/cognipace-all-tracks-mobile.png
- /private/tmp/cognipace-track-import-desktop.png
- /private/tmp/cognipace-track-import-mobile.png

Skipped commands:

- npm run zip: packaging/release artifact behavior was not changed; npm run build
  is the required surface build gate.
- npm run db:generate: no schema changes. npm run check includes npm run db:check.

Pending human realtime extension smoke (required before PR review or merge):

- [ ] Collection selection, collapse/reopen, and create/import in populated and
      empty Tracks, with screenshot or recording proof.
- [ ] Import the template, confirm refreshed collection and unchanged activation,
      then reload to confirm browser-storage persistence.
- [ ] Reimport, malformed JSON/partial-invalid entries, stale preview, cancellation,
      controlled save failure/retry, and keyboard focus during and after each state.
- [ ] Settings full content importer regression.

Use docs/testing.md > Tracks > All Tracks Collection And Import for exact steps.
Agent inspection does not replace this human gate. Release impact is an additive
Tracks UI feature; use a feat(tracks) title. Roll back by reverting the scoped
commit; persisted content remains compatible with the existing import contract.

Formatting commands (explicitly include the normally ignored plan/spec):

```sh
npx prettier --write --ignore-path /dev/null src/app/dashboard/layout/route-modal.tsx src/app/dashboard/navigation/route-manifest.ts src/app/dashboard/navigation/routes.tsx src/app/dashboard/routes.test.tsx src/app/dashboard/screens/track-modal-pages.tsx src/app/dashboard/screens/tracks-page.tsx src/features/imports/components/import-content-panel.test.tsx src/features/imports/components/import-content-panel.tsx src/features/imports/components/import-templates.tsx src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/tracks-screen.test.tsx src/features/tracks/components/tracks-screen.tsx docs/product.md docs/architecture.md docs/import-format.md docs/testing.md docs/superpowers/plans/2026-10-02-all-tracks-library.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md
npx prettier --check --ignore-path /dev/null src/app/dashboard/layout/route-modal.tsx src/app/dashboard/navigation/route-manifest.ts src/app/dashboard/navigation/routes.tsx src/app/dashboard/routes.test.tsx src/app/dashboard/screens/track-modal-pages.tsx src/app/dashboard/screens/tracks-page.tsx src/features/imports/components/import-content-panel.test.tsx src/features/imports/components/import-content-panel.tsx src/features/imports/components/import-templates.tsx src/features/tracks/components/other-tracks-accordion.tsx src/features/tracks/components/tracks-screen.test.tsx src/features/tracks/components/tracks-screen.tsx docs/product.md docs/architecture.md docs/import-format.md docs/testing.md docs/superpowers/plans/2026-10-02-all-tracks-library.md docs/superpowers/specs/2026-10-02-all-tracks-library-design.md
git diff --check
```
