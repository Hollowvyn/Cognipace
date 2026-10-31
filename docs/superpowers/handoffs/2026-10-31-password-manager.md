# Password Manager Handoff

Suggested PR title: `feat(settings): add password manager credential handoff`

## Details

GitHub Sync and AI connection now provide a collapsed **Save in your password
manager** helper. Users copy Website, Username, Password and Notes into an
existing manager. Notes preserve the GitHub Gist ID or selected AI
provider/model. A button opens Chrome's local Password Manager; users complete
Add/Save there. The helper uses only the current entered key, never reads stored
keys, and cannot copy the stored-token mask. Existing local saving remains
separate and clears the key draft. All four AI providers are covered.

Chrome explicitly excludes extension pages from password saving/filling, and
ordinary password-manager extension autofill cannot operate here. This is an
explicit copy-and-paste handoff; it does not implement automatic saving,
autofill, a hosted page or a new vault. See the
[plan and source evidence](../plans/2026-10-31-password-manager.md).

The shared feature owns the UI. A small platform adapter opens only the fixed
`chrome://password-manager/passwords` URL without credential data. No dependency,
Chrome permission, runtime method, sender authorization, Zod contract, database,
secret read, query-cache, invalidation, backup or sync behavior changed. Copies
require explicit clicks, and controlled errors do not expose exceptions or keys.
The expanded GitHub dialog scrolls within the viewport and includes its summary
in the existing keyboard focus cycle.

Worktree: `/Users/tobiolutimehin/.codex/worktrees/password-manager/cognipace-v2`
on `codex/password-manager`, based on fetched `origin/main`. Original
`package.json` and `package-lock.json` edits remain untouched in the main checkout.
The changes are prepared for a draft PR; no merge or release was performed.
Human installed-extension smoke remains required before review or merge.

## Issue

No issue: direct user implementation request in this chat. The user selected an
existing password manager, requested a separate worktree and authorized
autonomous execution without additional design approvals.

## Testing

Commands used Node 24.20.0 and npm 11.19.0 through
`rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/usr/bin:/bin:/usr/sbin:/sbin`.

- [x] `npm ci --cache /tmp/cognipace-npm-cache`
- [x] `npm run prepare:wxt`
- [x] `npm test -- src/features/password-manager/components/password-manager-helper.test.tsx src/platform/chrome/password-manager.test.ts src/features/sync/components/github-sync-connection-dialog.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx --run`
      — 33 tests passed across four files.
- [x] `npm run lint`
- [x] `npm run check` — database check, TypeScript, lint and full tests passed:
      258 files passed, four skipped; 4,034 tests passed and 13 opt-in tests
      skipped.
- [x] `npm run build` — production Chrome MV3 build passed. Vite reports its
      large-chunk warning; the full suite emits existing jsdom `scrollTo`
      notices. Neither is hidden as a clean warning-free result.
- [x] `npm exec -- prettier --check src/features/password-manager src/platform/chrome/password-manager.ts src/platform/chrome/password-manager.test.ts src/features/sync/components/github-sync-connection-dialog.tsx src/features/sync/components/github-sync-connection-dialog.test.tsx src/features/settings/components/sections/ai-assessment-section.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx docs/product.md docs/architecture.md docs/testing.md design.md docs/superpowers/plans/2026-10-31-password-manager.md docs/superpowers/handoffs/2026-10-31-password-manager.md`
- [x] `git diff --check`
- [x] Added component and integration tests for individual copies, masking,
      empty/saved keys, all AI providers, provider switches, local-save clearing,
      delayed/failed/unavailable clipboard, manager failure, disabled controls,
      no accidental form submission or connection calls, and fixed navigation.
- [x] `rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/usr/bin:/bin:/usr/sbin:/sbin node /private/tmp/cognipace-password-manager-qa.cjs`
      — real packaged extension in a disposable Chrome for Testing profile at
      1280×1000 and 390×844. Verified native clipboard success, opening the real
      local manager, manually adding/saving a fake key with its Notes, scrolling,
      no horizontal overflow, Tab/Escape/focus restoration, provider switching
      and local-save clearing. No provider requests or page/console errors.
      The test profile and fake manager entry were removed after the run.
- [ ] Human installed-extension happy-path and edge-case smoke remains pending;
      follow [Password Manager Handoff](../../testing.md#password-manager-handoff).
      Agent-run browser proof supplements this requirement and does not mark it
      N/A or establish PR review/merge readiness.

Validation failures encountered and resolved: the new worktree initially lacked
`.wxt/tsconfig.json` before `npm run prepare:wxt`; new tests then failed for the
missing helper and unwired UI as expected. The first full check found a wrong
cast in the tabs API mock, corrected before the passing full check. Browser Add
QA initially used an ambiguous Password locator, then passed with its observed
password-input locator. A sandboxed test launch could not create Vite's temp
directory; validation subsequently ran with the worktree write access.

Skipped or inapplicable validation:

- `npm run zip`: packaging/artifact workflow was not changed; production build
  was validated.
- `npm run db:generate`: no schema or persisted shape changed; `npm run db:check`
  ran as part of the full check.
- `COGNIPACE_AI_EVAL=1 npm test -- src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts src/features/leetcode-review-assistant/server/code-implementation-provider-evaluation.test.ts src/features/leetcode-review-assistant/server/code-hint-provider-evaluation.test.ts`:
  live evaluation is unrelated to this handoff and private provider credentials
  were not supplied or used.
- `COGNIPACE_SCALING=standard npm test -- src/testing/fsrs-scaling-benchmark.test.ts`:
  FSRS scaling is unaffected. These opt-in suites account for the 13 skips.
- Human checks with actual credentials, an installed preferred third-party
  manager, browser reload and denied clipboard remain pending as named in the
  manual checklist. No human proof or live GitHub/provider success is claimed.

## Screenshots

Browser plugin was unavailable; the Chrome DevTools connector also could not
connect to its debugging endpoint. QA used existing Playwright and Chrome for
Testing installations without adding dependencies. Portable automated proof
included for the draft PR:

- [GitHub desktop](../proof/2026-10-31-password-manager/github-desktop.png)
- [AI narrow](../proof/2026-10-31-password-manager/ai-mobile.png)
- [Browser check results](../proof/2026-10-31-password-manager/checks.json)

Additional temporary local artifacts outside the repository:

- [GitHub narrow](/private/tmp/cognipace-password-manager-proof/github-mobile.png)
- [AI desktop](/private/tmp/cognipace-password-manager-proof/ai-desktop.png)
- [Fake entry saved in the local manager](/private/tmp/cognipace-password-manager-proof/google-manager.png)

Screenshots contain fake values and masked key inputs. Human screenshots or a
recording are still required before review/merge.

## Release And Recovery

This is a dashboard feature addition with normal `feat` release impact. No
GitHub secrets, permissions, workflows or check names change. Clipboard copying
and the manual manager step are the affected risks. Rollback removes the helper,
platform adapter and call sites; existing secrets and independently saved
manager entries are unaffected. No local data reset or migration is involved.
