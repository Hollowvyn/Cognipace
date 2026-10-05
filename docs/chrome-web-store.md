# Chrome Web Store

This document is the maintainer source of truth for the CogniPace Chrome Web
Store listing. The first Store item is **Private** and limited to trusted
testers.

## Listing

**Name:** CogniPace

**Category:** Productivity

**Language:** English

**Short description:** Local-first LeetCode review and study pacing.

**Single-purpose statement:** Help users plan and record deliberate LeetCode
review with local spaced-repetition and study-track guidance.

**Detailed description:**

CogniPace turns LeetCode practice into a deliberate recall loop.

Use the compact popup to see what is due and what to study next. Capture
problem and submission context from supported LeetCode problem pages, record
recall ratings, organize ordered study tracks, and review progress in the
dashboard.

Core study data stays in the local Chrome profile. Backup export and restore
are built in. Users may optionally connect GitHub Gist sync: new Gists created
by CogniPace are private, while an existing connected Gist may be public or
private according to its GitHub visibility. Users may also optionally configure
their own OpenAI, Anthropic, Google Gemini, or OpenRouter API key for AI-assisted
assessment.

CogniPace has no developer-operated analytics, advertising, hosted account, or
hosted application backend.

CogniPace is independently developed and is not affiliated with or endorsed by
LeetCode.

**Support URL:** https://github.com/Hollowvyn/CogniPace/issues

**Privacy URL:** https://github.com/Hollowvyn/CogniPace/blob/main/PRIVACY.md

## Permission Justifications

### storage

Stores the local database snapshot, study settings, review schedules, track
state, sync metadata, and user-supplied GitHub or AI-provider credentials in
the extension's Chrome profile.

### alarms

Schedules enabled due-review reminders and background GitHub Gist sync work.
The extension does not use alarms for tracking or advertising.

### notifications

Shows local due-review reminders when the user enables reminders. It does not
send marketing notifications.

### `https://leetcode.com/*` and `https://www.leetcode.com/*`

Runs the problem-page overlay and reads the active problem and submission
context required by the user-facing capture and review workflow. The extension
does not monitor unrelated sites.

### https://api.github.com/*

Validates a user-provided GitHub token and performs optional Gist backup/sync
actions initiated or enabled by the user. New Gists created by CogniPace are
private; users manage visibility and deletion of connected Gists through
GitHub.

### `https://api.openai.com/*`

Sends a small user-requested connection test with the user's saved OpenAI key,
or completed-submission code analysis when AI assessment is enabled and OpenAI
is selected.

### `https://api.anthropic.com/*`

Sends a small user-requested connection test with the user's saved Anthropic
key, or completed-submission code analysis when AI assessment is enabled and
Anthropic is selected.

### `https://generativelanguage.googleapis.com/*`

Sends a small user-requested connection test with the user's saved Gemini key,
or completed-submission code analysis when AI assessment is enabled and Gemini
is selected.

### `https://openrouter.ai/*`

Sends a small user-requested connection test with the user's saved OpenRouter
key, or completed-submission code analysis when AI assessment is enabled and
OpenRouter is selected. OpenRouter routes code and problem context to a model
provider under OpenRouter and provider data policies and account privacy
settings. No developer key is bundled. `openrouter/free` is an editable
suggestion; the app does not configure paid fallback model IDs. Model-provider
domains behind OpenRouter do not receive additional extension host access.

## Remote Code

**Uses remote code:** No.

CogniPace calls the APIs listed above but does not download or execute remote
JavaScript or WebAssembly. Executable extension code is packaged in the
submitted ZIP.

## Privacy Practices

Declare these handled data categories, including information processed
locally:

- **Personally identifiable information:** the GitHub login returned when an
  optional user-provided token is validated.
- **Authentication information:** optional GitHub tokens and AI-provider API
  keys supplied by the user.
- **Web history:** supported LeetCode problem URLs and slugs that the user
  saves or practices with CogniPace.
- **User activity:** problem-page navigation, submission outcomes, recall
  ratings, practice timing, and review actions needed for the study workflow.
- **Website content:** LeetCode problem statements, metadata, submission
  diagnostics, and solution code used by capture or optional AI assessment.

Certify that the data is used only for the extension's single purpose and its
user-facing backup, sync, and assessment features. Do not select advertising,
data sale, creditworthiness, or unrelated profiling purposes.

The extension does not transmit data to a CogniPace-operated server. Optional
transfers go directly to GitHub or the AI provider selected by the user, as
described in `PRIVACY.md`. New CogniPace-created Gists are private; existing
connected Gists may be public or private under GitHub visibility. Users must
manage Gist visibility and deletion through GitHub.

## Reviewer Instructions

1. Install the submitted private item with the reviewer account.
2. Open the extension popup. The starter catalog loads locally without an
   account, GitHub token, or AI-provider key.
3. Use the popup CogniPace heading or Settings control to open the dashboard.
4. In the dashboard, verify Overview, Library, Tracks, Analytics, and Settings
   load from local extension data.
5. Open https://leetcode.com/problems/two-sum/ while signed into any LeetCode
   account that can access the problem. Verify the CogniPace overlay appears
   and can start a local practice session.
6. GitHub Gist sync is optional. Testing it requires a reviewer-supplied GitHub
   token with Gist access; no developer account is required. Visibility and
   deletion of connected Gists are handled on GitHub.
7. AI assessment is optional. Testing it requires a reviewer-supplied API key
   for OpenAI, Anthropic, Google Gemini, or OpenRouter; no developer key is bundled.
8. The hidden `/dev/smoke` dashboard route is for development validation and
   is not required for the primary user flow.

For OpenRouter, use a privately supplied test account/key in Settings. Selecting
OpenRouter suggests `openrouter/free`; a custom model remains editable. Save and
test while assessment is off, reopen the exact saved model, then use the
explicit free preset and save/test again. Only enable assessment when ready
to send submission code and problem context. Free routing can vary in quality,
latency, and capacity. Do not include test keys in submitted evidence.

## Private Distribution

1. In the Chrome Web Store developer dashboard, create the item and upload the
   exact `cognipace-{version}-chrome-mv3.zip` asset from the GitHub Release.
2. Complete Listing and Privacy fields using this document and `PRIVACY.md`.
3. Set Distribution visibility to **Private**.
4. Add the approved trusted-tester Google accounts or Google Group.
5. Leave distribution regions at the maintainer-approved defaults unless a
   specific restriction is required.
6. Submit the item for review.
7. Do not switch the item to Unlisted or Public without a separately approved
   release decision.

## First Installation and Backup Boundary

An unpacked development copy normally has a different extension ID and
separate local storage.

1. Export a backup from the unpacked copy if its local data matters.
2. Disable the unpacked copy so two content scripts do not render on the same
   LeetCode page.
3. Install the private Store item using an approved tester account.
4. Restore the backup into the Store copy when desired.
5. Re-enter the GitHub token and AI-provider keys because backups exclude
   credentials.

## Manual Update

1. Merge normal release-triggering work and review the Release Please pull
   request.
2. Merge the Release Please pull request.
3. Confirm the GitHub Release contains the exact
   `cognipace-{version}-chrome-mv3.zip` asset.
4. Upload that exact asset as the Store item's new package.
5. Submit the new version for review and publish it after approval.
6. Do not rebuild or substitute a local ZIP.

## Failure and Rollback

- If repository validation, ZIP creation, or GitHub asset upload fails, do not
  submit that version.
- If Store review rejects the version, fix the cause through a normal pull
  request and release a higher version. Do not mutate the tagged asset.
- If a release requests new permissions, stop publication until the permission
  change and Store disclosures receive explicit human approval.
- If a tester cannot install the private item, verify the signed-in Google
  account and trusted-tester or Google Group membership before changing code.
- The Store cannot roll an item back to a lower version. Recover by releasing a
  higher patch version that restores the last known-good behavior.

## Deferred WXT API v2 Automation

After the first private publication and a later manual update succeed, design a
separate automation phase around WXT's built-in Chrome Web Store support:

1. Keep the existing Store item and visibility.
2. Use Chrome Web Store API v2 with a publisher-linked service account.
3. Store `CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`,
   `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, and
   `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` in GitHub Actions secrets.
4. Validate authentication with `wxt submit --dry-run`.
5. Submit the already validated release ZIP with `wxt submit --chrome-zip`
   followed by the exact downloaded GitHub Release asset path.
6. Use `DEFAULT_PUBLISH` only when updates should publish automatically after
   review approval; use `STAGED_PUBLISH` when a maintainer must release an
   approved version manually.
7. Do not commit `.env.submit` or create a custom Store API client unless an
   evidenced WXT limitation requires one.
