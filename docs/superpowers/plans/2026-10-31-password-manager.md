# Password Manager Handoff Plan

**Goal:** Help users save GitHub tokens with Gist IDs and AI keys with
provider/model properties in their existing password manager.

**Decision:** The user requested a separate worktree, the simplest existing
password manager, and autonomous execution without further design approvals.
Chrome explicitly excludes extension pages from password saving/filling, and
Bitwarden skips extension pages too. Use an explicit copy-and-paste handoff:
show a compact disclosure with Website, Username, Password and Notes fields,
copy individual values only on request, and open Google Password Manager.
Users complete Add/Save in their manager. Other managers use the same values.

Sources:

- [Chromium password manager client](https://github.com/chromium/chromium/blob/main/chrome/browser/password_manager/chrome_password_manager_client.cc)
- [Google's manual Add and notes instructions](https://support.google.com/chrome/answer/95606)
- [Bitwarden autofill service](https://github.com/bitwarden/clients/blob/main/apps/browser/src/autofill/services/autofill.service.ts)

## Boundaries

- `src/features/password-manager/components/password-manager-helper.tsx` owns
  the reusable, collapsed handoff UI; `index.ts` exposes it to the connection
  forms. It accepts the current draft key only. It never reads stored keys,
  persists drafts, calls a provider, or claims a manager entry was saved.
- `src/platform/chrome/password-manager.ts` opens a fixed local manager URL.
  No secret or property is placed in a URL, log, cache, or download. No new
  permission, runtime message, database table, or sync behavior is needed.
- GitHub's dialog supplies its token draft and Gist draft. AI Settings supplies
  its selected provider, model, and key draft. Saving locally still clears keys.
- Copy failures and opening failures show controlled, retryable feedback.
  Empty or saved/masked keys cannot be copied; successful clipboard writes are
  acknowledged only after resolution. Switching AI providers remounts the helper.

## Implementation

- [x] Add focused failing component tests for explicit key/metadata copying,
      secret-free rendering and navigation, unavailable/failed clipboard,
      manager opening failure, and disabled controls.
- [x] Implement the helper and browser adapter. Use compact existing tokens,
      native disclosure semantics and explicit `type="button"` controls.
- [x] Add integration tests and wire GitHub token/Gist and all AI providers.
      Check replacement, provider switching, local save clearing, and no
      accidental connection save/test from helper actions.
- [x] Update current product/architecture/design/testing docs with the manual
      manager handoff and limits.
- [x] Run focused tests, `npm run lint`, `npm run check`, `npm run build`, and
      Prettier on touched files. Capture supplemental browser UI proof.

## Human Installed-Extension Proof

Required before PR review/merge: enter disposable GitHub token/Gist and AI
key/provider/model values, copy them into manager Add, save there, retrieve and
paste them back, then verify normal local save/connect behavior. Exercise
empty/saved keys, switching providers, denied clipboard, narrow layout and
worker/extension reload. Attach screenshots or recording with keys masked.
Agent browser/component proof supplements this human check.

## Release And Recovery

This is a dashboard UX addition (`feat` release impact). Existing local secrets,
runtime authorization, Zod contracts, invalidation and sync remain unchanged.
Rollback removes the helper and its call sites; manager entries belong to the
user and are unaffected. No migration or local data reset is involved.
