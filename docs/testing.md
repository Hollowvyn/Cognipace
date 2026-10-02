# Testing

## Purpose

This guide is for friends and contributors testing CogniPace locally. It covers
loading the extension, trying the main workflows, clearing local data,
reporting useful bugs, and choosing validation commands.

## Local Setup

Install dependencies:

```sh
nvm install
nvm use
npm install --global npm@11.19.0
npm ci
```

These versions match CI and release packaging.

Start WXT for local development:

```sh
npm run dev
```

Keep this process running while testing. WXT writes the development extension
to `dist/chrome-mv3-dev`.

Build a Chrome MV3 extension:

```sh
npm run build
```

This writes the production-style extension to `dist/chrome-mv3`.

## Load The Extension In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. If existing local development data matters, export a backup first, then
   disable or remove the old unpacked CogniPace installation.
4. Choose Load unpacked.
5. Select the matching directory:
   - `dist/chrome-mv3-dev` while `npm run dev` is running.
   - `dist/chrome-mv3` after `npm run build`.
6. After rebuilding, click the reload button for CogniPace in
   `chrome://extensions`.

The development build appears as `CogniPace Dev` with an amber-card sibling of
the production Recall Stack icon, so it is easy to distinguish from the
production extension. Its manifest description ends with `(Dev Version)`;
production keeps the Store description unchanged. The generated
`dist/chrome-mv3-dev/manifest.json` ends with `(Dev Version)`, while
`dist/chrome-mv3/manifest.json` does not.

The extension requests the Chrome `notifications` permission for local
due-review reminders. It does not add notification-related host permissions.
Due reminder smoke should use local queue `dueToday` semantics, not a separate
notification-specific count.

## Local Database Recovery

When both snapshot keys are absent, startup creates and seeds a fresh database.
A partial pair, malformed value, or unknown or unsupported fingerprint fails
startup and retains the original available values for recovery. The only
legacy fingerprint accepted for an automatic upgrade is the exact migration
prefix in [`snapshot-upgrade.ts`](../src/platform/db/snapshot-upgrade.ts),
documented in [Database And Persistence](architecture.md#database-and-persistence).
Automatic downgrade is unsupported. The Library may still offer Retry for
transient startup failures, but retrying does not repair corrupt or unsupported
database data.

To make a local recovery copy:

1. Open `chrome://extensions`, find CogniPace, and select its service worker
   console from the Inspect views.
2. In that console, run the following expression. It reads only the three
   database recovery keys and copies their JSON values to the clipboard:

   ```js
   copy(
     JSON.stringify(
       await chrome.storage.local.get([
         'cognipace_db_snapshot_v1',
         'cognipace_db_snapshot_fingerprint_v1',
         'cognipace_db_recovery_topics_v1',
       ]),
     ),
   )
   ```

3. Paste the copied JSON into a local file and store it privately. Do not use
   `chrome.storage.local.get(null)` or export all extension storage: it can
   include secrets and unrelated private settings. Do not paste the recovery
   JSON, snapshot bytes, or topic values into an issue or other shared report.

Startup diagnostics should report a safe, actionable error without logging raw
snapshot bytes, topics, tokens, or settings. When the original snapshot pair is
restored from a recovery copy, reload the extension and verify that the original
local database opens before attempting another upgrade.

### Database Upgrade Recovery Smoke

Run this flow in an isolated Chrome profile with disposable test data. Keep any
recovery export private and restore the original values before ending the test.
Start from a fresh test profile without an existing recovery record.
Never include raw snapshot bytes, fingerprints, topics, or recovery JSON in
screenshots, recordings, issues, or other shared reports; redact proof so it
shows only the relevant UI state and safe error text.

1. Add or identify a representative problem and topic in the local Library,
   reload the extension, and verify the data persists.
2. In the service-worker console, save exactly the snapshot, fingerprint, and
   recovery keys to a private local file using the export expression above. Do
   not use `chrome.storage.local.get(null)`.
3. In the repository terminal, calculate an eight-hex fingerprint that is
   guaranteed to differ from both the current and allowlisted legacy values:

   ```sh
   node <<'NODE'
   const fs = require("node:fs")
   const path = require("node:path")
   const directory = "src/platform/db/migrations"
   const files = fs.readdirSync(directory)
     .filter((file) => file.endsWith(".sql"))
     .sort()
   const sql = files
     .map((file) => fs.readFileSync(path.join(directory, file), "utf8"))
     .join("\n")
   let hash = 5381
   for (let index = 0; index < sql.length; index += 1) {
     hash = ((hash << 5) + hash) ^ sql.charCodeAt(index)
   }
   const current = (hash >>> 0).toString(16).padStart(8, "0")
   const fixture = fs.readFileSync(
     "src/testing/fixtures/topics-legacy-migrations.ts",
     "utf8",
   )
   const legacy = fixture.match(
     /expectedLegacyMigrationFingerprint = .([a-f0-9]{8})./,
   )?.[1]
   if (!legacy) throw new Error("Could not read the allowlisted fingerprint")
   let candidate = 0
   const sentinel = () => candidate.toString(16).padStart(8, "0")
   while ([current, legacy].includes(sentinel())) candidate += 1
   console.log(sentinel())
   NODE
   ```

   Copy the printed eight-character value. In the service-worker console, set
   only the fingerprint key to that value, then reload the extension:

   ```js
   await chrome.storage.local.set({
     cognipace_db_snapshot_fingerprint_v1: 'PASTE_PRINTED_VALUE_HERE',
   })
   ```

4. Verify startup fails without reseeding or changing stored data beyond the
   deliberate fingerprint substitution and recovery record: the snapshot bytes
   still match the private original copy, the fingerprint is the sentinel, and
   the recovery record contains the original snapshot bytes and the sentinel
   fingerprint. Compare these locally without printing the raw values. Export only
   `cognipace_db_recovery_topics_v1` to a private local file with
   `copy(JSON.stringify(await chrome.storage.local.get(['cognipace_db_recovery_topics_v1'])))`.
   Confirm the recovery copy is safely stored before removing the recovery key.
5. Restore the original snapshot and fingerprint from the private copy with
   this command, substituting the two saved values from the local file:

   ```js
   await chrome.storage.local.set({
     cognipace_db_snapshot_v1: 'PASTE_SAVED_SNAPSHOT_VALUE_HERE',
     cognipace_db_snapshot_fingerprint_v1: 'PASTE_SAVED_FINGERPRINT_HERE',
   })
   ```

   Remove the recovery key only after its export is safely stored:

   ```js
   await chrome.storage.local.remove(['cognipace_db_recovery_topics_v1'])
   ```

6. Test an incomplete pair by removing only the fingerprint key with
   `await chrome.storage.local.remove(['cognipace_db_snapshot_fingerprint_v1'])`,
   then reload. Verify startup fails without reseeding or deleting the
   remaining snapshot key. Export the partial recovery record to a private
   local file with
   `copy(JSON.stringify(await chrome.storage.local.get(['cognipace_db_recovery_topics_v1'])))`.
   After confirming the export is safely stored, remove the recovery key with
   `await chrome.storage.local.remove(['cognipace_db_recovery_topics_v1'])`.
7. Restore the complete original snapshot and fingerprint pair from the private
   saved copy, reload, and confirm startup succeeds and the representative
   problem and topic remain. Capture and attach redacted screenshot or recording
   proof of the valid-data reload and both failure cases before PR review or
   merge; manual smoke is required for behavior-changing database work.

## Smoke Flows

### Open The Dashboard

Use one of these entry points:

- Open the dashboard from the CogniPace popup or extension UI when that action is
  available.
- Or open `chrome://extensions`, find CogniPace, open Details, copy the
  extension ID, and open `chrome-extension://<extension-id>/dashboard.html`.

### Popup

1. Click the CogniPace extension icon.
2. Confirm the popup shows the brand header, metric tiles, a recommendation
   area, and study-mode or track guidance.
3. Use the shuffle action when available.
4. Open Settings from the popup.
5. Open Tracks from the track card when available.
6. With an overdue recommendation, confirm the card shows one `Overdue` badge
   and does not also show `Due` or `Due today`.
7. With a due-today recommendation, confirm the card shows one `Due today`
   badge.
8. When the metric includes overdue and due-today cards, confirm its label is
   `Reviews Due`.

Expected: the popup stays compact, does not jump around during feedback, and
keeps recommendation guidance separate from track guidance. Review timing
labels are mutually exclusive, and combined counts are not labeled Due Today.

### Dashboard Settings

1. Open the dashboard.
2. Navigate to Settings.
3. Change a setting.
4. Confirm the save bar appears.
5. Save the change.
6. Reload the dashboard and confirm the setting persisted.

Expected: settings changes save through the extension runtime and persist
locally.

### Settings Data Management

1. Open the dashboard.
2. Navigate to Settings.
3. Use Export backup.
4. Confirm a JSON file downloads and a success toast appears.
5. Use Choose backup file under Import full backup and select that exported
   file.
6. Confirm the selected filename, validation toast, and validation summary
   appear.
7. Confirm Restore full backup is not shown until validation succeeds, then
   cancel before restore unless intentionally testing destructive restore.
8. Open Clear local data.
9. Cancel once, then reopen if intentionally testing clear/reset behavior.

Expected: backup validation happens before restore, restore and clear require
confirmation, restore success resets the import card, and clear offers backup
first inside the confirmation dialog. After that backup export succeeds, the
dialog button changes to a success state labeled Backup exported.

### Settings Content Import

Use an isolated Chrome profile with disposable data. These real-extension
happy-path and edge-case flows, plus screenshot or screen-recording proof, are
pending for this branch and must be completed before merge. The
[content format reference](import-format.md) defines the file contract.

1. **250-question curriculum and ordering:** prepare a valid content file with
   250 ordered question references across ordered tracks and groups. Preview
   the counts, page through planned items to inspect the beginning, middle, end,
   and group boundaries, then import. Open Tracks, verify group and question
   order against the file, reload, and confirm the curriculum remains saved.
2. **Identical reimport:** preview and apply that same file again. Confirm the
   preview reports that everything is already present and offers no import
   action. Verify review history and track progress remain unchanged.
3. **Expanded file after local edits:** import a smaller file, then edit a
   stored question title, reorder a group or question, and record review and
   track progress. Expand the file with new groups/references and conflicting
   values for existing content. Confirm the preview reports preserved values;
   after import, local titles, order, placements, reviews, and progress remain,
   while new groups and references append. Reload and confirm the result.
4. **Independent sections:** import a companies-only file, a topics-only file,
   and a track-only file. Confirm company/topic labels are registered without
   question associations unless the file supplies them, stored topic aliases
   resolve to their canonical topic, track references are added in file order,
   and the active track is unchanged.
5. **Invalid rows and nulls:** preview a mixed file with valid entries, invalid
   identities or references, invalid optional fields, null entries, null label
   elements, and null optional sections/metadata. Confirm diagnostics show the
   input path and reason, valid independent rows remain eligible, and null or
   empty data leaves stored values and associations unchanged.
6. **Stale preview:** preview a file, then change matching local content before
   applying it. Confirm apply returns an updated preview and performs no writes
   from the stale plan. Review the new preview and click Import again to apply.
7. **Transaction failure:** in a test-only failure-injection harness, fail the
   database transaction after writes have begun. Confirm the transaction rolls
   back and no partial catalog or curriculum additions appear. Do not add a
   failure toggle to the shipped product or corrupt normal profile data.
8. **Snapshot failure and retry:** in a test-only harness, fail snapshot flush
   after a successful database commit. Confirm the UI says content was added
   but not saved, while file selection and dismissal stay disabled. Retry
   saving and verify it persists the committed state without duplicating
   database entries.
9. **Backup regression:** export a full backup, select and validate it, then
   cancel restore and cancel clear-local-data. Confirm content import did not
   alter backup validation or silently restore/reset data. Perform an intentional
   restore only in a disposable profile.

Record these human flows and attach redacted screenshots or a recording to the
implementation PR before merge. Automated validation and this checklist do not
count as completed browser proof.

### AI Assessment Settings

1. Open the dashboard.
2. Navigate to Settings.
3. Find AI assessment.
4. Select a provider and enter a model id.
5. Save and remove a test API key.
6. Confirm the UI shows key presence without revealing the key value.

Expected: provider keys are stored locally in trusted extension secret storage.
Configured AI assessment can call the approved BYOK provider from trusted
background code without revealing the key value. Backup exports, sync payloads,
logs, and status payloads must not include raw provider keys.

### Dashboard Dev Smoke

1. Open the dashboard.
2. Navigate directly to `chrome-extension://<extension-id>/dashboard.html#/dev/smoke`
   or open the hash-equivalent `/dev/smoke` route after loading the extension
   dashboard.
3. Confirm the hidden route renders even though it is absent from primary
   dashboard navigation.
4. Confirm the default smoke report includes background health, Analytics
   summary with memory profile, today's queue aliases, notification dry run,
   GenAI config, and skipped live GenAI checks.
5. Leave Run live GenAI provider smoke unchecked for normal smoke testing.
6. To intentionally test a live provider, first configure AI assessment with a
   provider, model, and local BYOK secret, then check Run live GenAI provider
   smoke.
7. Confirm the live check reports pass, warn, fail, or skip without showing raw
   provider keys or unredacted secret-bearing errors.

Expected: dev smoke is a local extension development tool only. The live GenAI
checkbox is opt-in because it may call the configured provider; it relies on
stored BYOK secret presence and must not expose secret values.

### GitHub Gist Sync

1. Open Settings > Data Management.
2. In GitHub Sync, open Connect GitHub Sync.
3. Use Create a token for CogniPace and confirm GitHub opens in a new tab with the
   token name `cognipace_gh_sync_YYYY-MM-DD` for the current local date, no
   expiration, and Gists write access prefilled with no private repositories
   selected and no repository permissions requested.
4. Generate and copy the token in a test account, return to the still-open
   CogniPace dialog, enter the token, confirm it is masked, use Test token, then
   Save token.
5. Create a new private Gist or connect an existing Gist ID from the same
   dialog. Existing connected Gists may be public or private under GitHub
   visibility settings.
6. Close the dialog and confirm Settings shows Connected and Auto-sync on.
7. Use Push local from Settings.
8. Export a backup and confirm the token value is absent from the JSON.
9. Load CogniPace in a second Chrome profile or browser install.
10. Save the same token, connect the Gist ID, and use Pull latest.
11. Confirm the latest remote data is restored locally in the second install.
12. Confirm the dashboard header shows compact Pull latest from Gist and Push
    local to Gist shortcuts after sync is configured.
13. Pause auto-sync from Settings and confirm the connection remains connected
    while Settings and the dashboard header still allow manual Pull latest and
    Push local.
14. Resume auto-sync.
15. Open Manage connection, confirm the saved token appears masked, and use Test
    token without retyping the token.
16. Change local data in one install and confirm sync status shows it needs
    push.
17. Wait for the auto-push alarm or trigger it in development, then open or
    reload the second clean install.
18. Confirm the second clean install pulls the latest Gist data without a manual
    pull.
19. Use Push local from Settings or the dashboard header when an explicit manual
    upload is needed.
20. Use Pull latest in the other install when an explicit manual download is
    needed.
21. Create a conflict by changing both installs before syncing.
22. Confirm Pull latest opens a force-pull dialog when local data has unpushed
    changes, then cancel once before intentionally confirming.
23. Confirm force pull replaces the local data with the connected Gist data only
    after confirmation.
24. Confirm Push local opens a force-push dialog when remote data changed, then
    cancel once before intentionally confirming.
25. Confirm force push replaces the Gist with local data only after
    confirmation.
26. In a disposable-profile test harness, fail the sync metadata dirty write
    while permitting the snapshot write. Save a visible local setting, restart
    the worker, and confirm the setting survives and automatic open-check skips
    pulling over it. Repeat with the debounce snapshot firing while the metadata
    write is pending. Do not edit or expose real snapshot bytes or token values.
27. Restore normal storage, push the local change, restart again, and confirm
    clean open-check can pull a later remote change. Repeat failed acknowledgement
    and verify dirty protection remains; cancel and confirm manual force pull as
    the explicit recovery path.

Expected: sync is pseudo-real-time, with automatic safe push and clean open-check
pulls plus manual directional pull and push actions for explicit recovery. Local
writes are not blocked by GitHub failures, destructive local and remote
overwrites require confirmation dialogs, and tokens stay in trusted local
extension storage rather than backups, sync files, status payloads, or unmasked
UI text.

### Library

1. Open the dashboard.
2. Navigate to Library.
3. Inspect problem rows.
4. Create or edit a problem.
5. Open problem details or practice actions when available.
6. Confirm a prior-local-date review shows `Overdue`, a current-local-date
   review shows `Due today`, a future review shows `Scheduled`, and an
   unstarted problem shows `New`.
7. Confirm the combined overdue-plus-due-today count is labeled `Reviews Due`.
8. Create a problem with a bare slug and a canonical LeetCode problem URL.
   Reject a foreign-host problem URL, LeetCode Explore URL and malformed URL;
   repeat in Track input and confirm no `https` problem is inserted.
9. Create/edit/bulk-set `Meta` and `Meta!` company labels, then a case/whitespace
   variation. Reload and verify distinct labels retain distinct associations,
   while an unambiguous normalized variation reuses the existing company ID.
   Restore two case-distinct legacy labels and verify editing an exact label
   preserves its association; an ambiguous variation must show an error.
10. With a restored mixed-case custom topic ID, import its lowercase ID and
    verify reuse rather than duplication. Change its label between preview and
    apply, and confirm stale preview returns without writes.

Expected: Library reflects persisted problem metadata and remains usable after
reloading the extension. Track problem rows use the same review-status labels.

#### Library Topic Filters

Use an isolated profile with disposable problems and the curated topic options.
Verify these acceptance cases in the real Library UI:

- Search `DFS` in the Topics picker and select Depth-First Search. The picker
  shows one canonical option for the match; the selected value is Depth-First
  Search, and typing alone does not change the problem rows. An alias is a way
  to find a canonical topic, not another selectable identity.
- Select Tree with Include subtopics on (the default). A problem directly
  tagged Binary Search Tree matches Tree. Turn Include subtopics off and
  confirm that problem no longer matches. A DFS-tagged problem does not match
  Tree just because DFS has an `applies-to` relation to Tree.
- For a problem tagged DFS and Binary Tree, select Tree and DFS and choose Match
  all with subtopics enabled: it matches. A problem tagged only Binary Tree
  does not match that same All selection. With Match any, a DFS and Graph Theory
  problem matches the Tree-or-DFS selection because of its direct DFS tag.
- Select both Tree and Binary Tree with Match all and subtopics on; a Binary
  Search Tree assignment satisfies both selected IDs. This is a repeated path
  to the same problem, so it appears once and contributes once to visible and
  due counts.
- In the disposable profile, select a canonical topic that none of its
  problems use. The normal no-results state appears. Clear the selection to
  restore all topics. With no selected topics, both Any and All impose no topic
  constraint; picker search text alone also leaves rows unchanged.
- Type a picker query, select a topic, switch to Match all, and turn off Include
  subtopics. Clear Filters resets the query and selected IDs, restores Match
  any and Include subtopics, clears every other facet and global search, and
  restores the unfiltered rows. Confirm global Search problems retains its
  existing problem-text behavior and does not gain alias search semantics.
- Combine Tree with a difficulty, status, Hide premium, or Hide suspended
  filter. Confirm the result satisfies both the topic and other facet
  constraints, and that the filtered and Reviews Due counts reflect the rows
  actually shown.
- Expand Library filters, then use Tab to reach the Topics button, open it, and
  search/select by keyboard. Escape closes the picker and returns focus to its
  trigger. Tab continues through native controls without trapping focus; an
  outside pointer closes the picker while focus follows the clicked control.
- Select multiple rows, apply a topic filter that hides one of them, and verify
  the bulk-action count and any selected-row or create-track action use only
  the visible filtered selection. Clear the filter and confirm the still-selected
  row returns to the selection; filtering does not discard its selection state.

Also check that the picker remains visible and usable at narrow and desktop
widths, including the no-results state, and that its longest canonical topic
label fits. This visual check supplements the automated screen and picker tests.

### Topic Taxonomy And Backup Compatibility

Use an isolated Chrome profile with disposable test data. The runtime has 81
canonical topics; `Heap` resolves as an alias of `Heap (Priority Queue)`.
The human Library smoke above covers filtering behavior, not database upgrade
or backup compatibility. Earlier-phase migration evidence comes from the
automated database tests and the separate manual backup flow below. The
repository does not provide a prepared browser profile containing a v7
database snapshot, so the v7 upgrade and rejected-collision paths below are
automated database tests, not browser smoke steps. Run both with:

```sh
npm run test -- --run src/platform/db/instance.test.ts -t "preserves populated v7 data|retains the v7 snapshot"
```

These in-memory tests create their own legacy database. The successful-upgrade
case checks reviews, FSRS due dates, problem and company metadata, track order
and progress, settings, alias re-keying and resolution, BFS membership, and
reconciliation before publication. The collision case checks rejection while
preserving the stored snapshot and recovery record. Do not report these tests as
human-visible browser evidence.

For manual checks, use an isolated profile with disposable data and the
existing Library, capture, and backup flows:

1. Edit a disposable problem and set topics to `Tree` and `DFS`. Save and
   reopen it; confirm those are the selected direct topics. Edit the topic list
   again with one omitted and confirm manual save replaces the direct list.
2. Capture LeetCode topic metadata for that problem and confirm the capture
   merges new labels while retaining the existing manual topics.
3. Enter a non-ASCII label such as `动态规划` and a slash-containing label such
   as `Tree / Graph` in a disposable problem. Save, reload, and edit again;
   confirm Unicode and slash text survive lookup and persistence.
4. Export a backup and inspect only the disposable fixture's taxonomy rows.
   Confirm it declares schema version 4 and typed relations have source,
   target, and kind fields. Import that file into another disposable profile
   and verify assignments, aliases, and both relation kinds round-trip.

Capture screenshots or a recording of the visible edit, capture-merge, and
backup-round-trip flows when collecting manual smoke evidence. Use dummy data;
redact topic values, settings, fingerprints, and all snapshot or recovery bytes
from shared proof. Such screenshots do not prove the v7 migration or collision
recovery behavior; the Vitest command above covers those internal paths. Record
the populated-database upgrade and recovery evidence from Phase 1 separately,
and the backup v4 export/import evidence from Phase 2 separately. Do not treat
the Library filtering recording as proof of either migration or backup
compatibility.

### Tracks

1. Open the dashboard.
2. Navigate to Tracks.
3. Inspect the active track workspace.
4. Create or edit a track.
5. Set a track active.
6. Change the active group when more than one group exists.
7. In Study Plan mode, open the active track's current incomplete Next problem
   in the LeetCode overlay and exercise each case independently:

   | Action                                               | Expected track progress                      |
   | ---------------------------------------------------- | -------------------------------------------- |
   | Save `hard`                                          | Completed count increments and Next changes. |
   | Save `again` for an incomplete problem               | The problem remains incomplete.              |
   | Save `again` after completing the problem            | Its completion remains unchanged.            |
   | Update one review `good` → `hard` → `again` → `good` | Completion stays, clears, then returns.      |

8. With an earlier incomplete problem and a due incomplete problem in a later
   group, confirm Due Reviews includes the later problem while `Next` remains the
   earlier ordered problem.
9. Reset track progress only when intentionally testing reset behavior; confirm
   the completed count returns to zero.

Expected: active track state, group state, problem order, and track progress are
local and update the dashboard without changing global practice history unless a
review is saved. `Next` follows incomplete, non-suspended memberships in explicit
group and problem order without being reordered by due state. In Study Plan mode,
`hard`, `good`, and `easy` complete track problems; `again` neither completes an
incomplete problem nor clears an earlier completion. Free Practice does not write
active-track progress.

#### Remove From Track

Human happy-path and edge-case smoke with screenshots or a recording is pending
and required before review or merge:

1. Expand a middle problem in the active track. Verify **Remove from track** sits
   beside Edit, click it, and check that the row disappears and order, progress,
   and Next refresh. Reload to confirm persistence.
2. Check Library and another track containing that problem: the problem and its
   global practice/review history remain, and the other membership is unchanged.
3. Remove a completed problem and then the last problem in a disposable group.
   Confirm progress updates and the group remains with “No problems in this
   group.” Re-add through Edit Track and check that it is incomplete while its
   global practice history remains.
4. In a test harness, delay or reject saving. Verify removal and practice buttons
   disable while pending, errors display inline, and retry is available.

### Dashboard Analytics

1. Open the dashboard.
2. Navigate to Analytics.
3. Test 14, 30, and 90 days from the range control. Confirm their historical
   bucket labels are respectively daily, three-day, and weekly; the selected
   range stays selected unless you explicitly choose another one.
4. With enough eligible local history, confirm the historical chart story
   renders. If older leading buckets have no evidence, confirm the effective-
   window copy explains the usable part of the selected range rather than
   drawing a fabricated value from the range start.
5. For a range or metric that is not ready, confirm the compact warning
   identifies the evidence shortfall, reports its progress in buckets/
   assessments where applicable, and offers a shorter ready range only as an
   explicit link. The page must not silently switch ranges, and any available
   chart points must remain visible.
6. Check a line chart with missing-evidence gaps. It should use a dashed bridge
   from one measured point to the next valid point; absent buckets remain
   unknown and have no fabricated marker or tooltip value. A one-point chart
   remains visible with “Not enough data for a trend yet.”
7. In Practice Rhythm, confirm every bucket after the first supported practice
   bucket remains in the chart. A week with no reviews has zero review volume,
   while its correctness line remains unknown unless correctness evidence
   exists.
8. Confirm Recall Quality, Practice Rhythm, Ratings Mix, Where to Focus, and
   Memory Strength communicate their defined data meanings. Practice Rhythm is
   review volume plus observed correctness; it must not claim causation.
9. Confirm Recent Overdue Backlog has a watch zone at five problems: values at
   or below five render in the healthy green treatment, values above five use
   the attention yellow treatment, and its tooltip reports the bucket's
   threshold status. Unknown/reconstructable history must not be made up. A card due earlier today
   must count as due today in Upcoming Load and zero in today's overdue backlog;
   a prior selected-timezone calendar date must count as overdue. Repeat at a
   timezone boundary.
10. Confirm Upcoming Review Load always shows its fixed next 14 calendar days,
    including when the selected historical range is unready.
11. In Retention Health, hover and keyboard-focus a point to inspect the
    preview, pin its details, tab through the dialog controls, press Escape,
    and dismiss it by clicking outside. Confirm its LeetCode action opens the
    matching canonical problem in a new tab.
12. In Fragile Knowledge, confirm exactly five rows appear per page when there
    are more than five rows, Previous/Next and the live row range update
    correctly, and every visible problem link opens its canonical LeetCode
    problem in a new tab.
13. Exercise sparse and unknown history: verify readiness context rather than
    invented trends, while Recall Quality, Practice Rhythm, Memory Strength,
    Recent Overdue Backlog, Retention Health, Fragile Knowledge, and Upcoming
    Review Load remain usable. Repeat the happy path and sparse path at a narrow dashboard
    width; charts, range controls, dialogs, table scrolling, and keyboard focus
    must remain usable.

Expected: Analytics loads through the extension runtime without the failed-load
state, reflects only local practice data, and tells a truthful chart story
without filling missing evidence.

For this dashboard behavior change, the human engineer must attach screenshot
or screen-recording proof of both the ready-history happy path and the sparse or
unready edge path before PR review or merge. This is required by
`docs/agent-governance.md`; automated checks do not replace real-time extension
smoke testing.

### LeetCode Overlay

1. Open a LeetCode problem page in Chrome.
2. Confirm the CogniPace overlay appears after page context is read.
3. Start, pause, and reset the timer.
4. Expand the overlay.
5. Focus the Help shelf’s YouTube action, confirm its tooltip, activate it, and
   confirm a new tab opens with the current problem title.
6. From `chrome://extensions`, reload the CogniPace extension to clear its
   in-memory metadata cache.
7. Open this deliberately invalid, never-before-used LeetCode problem URL in a
   new tab: `https://leetcode.com/problems/cognipace-slug-fallback-smoke-9f2c7/`.
8. Confirm the overlay has no canonical title or problem context yet, while the
   parsed URL slug is visible and the Help action is enabled. Activate Help and
   verify the new tab’s search term is exactly
   `cognipace-slug-fallback-smoke-9f2c7`.
9. Close the test tab and remove any temporary DevTools blocking rule if used.
10. Select a rating or use fail.
11. Submit or update a review.
12. Dock and restore the overlay.

Expected: the overlay remains recoverable, does not dominate the LeetCode page,
the Help action is keyboard accessible and opens the title/slug search without
replacing LeetCode, and saved review results update CogniPace state.

For this behavior-changing overlay update, a human engineer must run the title
happy path and slug-fallback edge path and attach screenshot or screen-recording
proof before PR review or merge. Automated checks do not replace that proof.

### Cross-Surface Refresh

1. Save a review from the overlay.
2. Open the popup.
3. Open the dashboard.

Expected: due counts, recommendation state, practice details, and track progress
refresh across surfaces.

## Private Chrome Web Store Release

### Pre-Merge Production Package

1. Run `npm run check`, `npm run build`,
   `npm run store:check`, and `npm run zip`.
2. Load `dist/chrome-mv3` unpacked in a clean Chrome profile.
3. Happy path: verify the popup loads, the dashboard opens, the starter catalog
   is available, and the overlay appears on a supported LeetCode problem page.
4. Edge path: keep GitHub Gist sync and AI assessment unconfigured and verify
   the local core workflow remains usable without either optional integration.
5. Verify due-reminder and optional integration flows that are relevant to the
   release using the existing smoke sections in this document.
6. Attach screenshot or screen-recording proof for the happy path and edge path
   before PR review or merge.

### First Store Installation

1. Export a backup from the unpacked CogniPace copy if its local data matters.
2. Disable the unpacked copy before installing the Store copy.
3. Install the private item while signed into an approved trusted-tester Google
   account.
4. Verify the popup, dashboard, and LeetCode overlay happy path.
5. Edge path: verify the Store copy starts with separate local storage rather
   than silently reading the unpacked copy's database.
6. Restore the exported backup when desired and verify representative problems,
   practice records, review state, and tracks.
7. Verify GitHub and AI-provider secrets were not restored, then re-enter them
   only if those optional integrations are being tested.

### Natural Store Update

1. Record the installed Store version from `chrome://extensions`.
2. Upload and publish a legitimate higher release through the same private
   Store item.
3. Leave the Store copy installed and do not load the new release unpacked.
4. After Chrome performs its normal extension update checks, verify the higher
   version appears in `chrome://extensions` without reinstalling CogniPace.
5. Happy path: verify existing local study data remains available after the
   update.
6. Edge path: verify credentials remain local and existing schema migrations do
   not clear or duplicate study data.
7. Record the before/after versions and attach screenshot or screen-recording
   proof.

## Current Incomplete Surfaces

- Overview is a reserved dashboard route for a future guided-practice home.

Do not report these as broken unless they stop rendering or navigation fails.

## Clear Local Data

Use this when testing from a clean CogniPace local state. Local test data is
disposable during development.

Use Settings > Data Management > Clear local data for an in-app fresh-install
clear/reset. Removing and reloading the extension remains useful when testing
extension installation behavior.

Schema and migration changes may reset local extension data during development.

## Troubleshooting

### Extension Does Not Load

- For development, keep `npm run dev` running and confirm
  `dist/chrome-mv3-dev` exists.
- For a production-style artifact, run `npm run build` and confirm
  `dist/chrome-mv3` exists.
- Confirm Chrome loaded the directory matching the active workflow, then click
  reload in `chrome://extensions`.
- If two CogniPace copies appear, disable or remove the old installation.
- Inspect the extension service worker console from `chrome://extensions`.

### Popup Or Dashboard Shows Stale Data

- Reload the extension.
- Reload the dashboard tab.
- Check the service worker console for runtime or database errors.

### Overlay Does Not Appear On LeetCode

- Confirm the tab is a LeetCode problem page.
- Reload the LeetCode tab after reloading the extension.
- Check the page console and extension service worker console.

### Database Or Migration Errors

- Run `npm run db:check`.
- Reset local extension data.
- Rebuild and reload the extension.

## Useful Bug Reports

Include:

- surface: popup, dashboard, overlay, or background
- exact steps
- expected behavior
- actual behavior
- screenshots or screen recording when visual behavior matters
- browser console errors
- extension service worker errors
- whether local data was reset before the test

## Validation Commands

Docs-only formatting:

```sh
npx prettier --check README.md docs/product.md docs/architecture.md docs/testing.md docs/superpowers/README.md
```

Focused tests:

```sh
npm run test -- <path-to-test-file>
```

GitHub Gist sync focused checks:

```sh
npm test -- src/features/sync/server/sync-service.test.ts src/features/sync/api/sync-api.test.tsx src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts src/features/sync/hooks/use-github-sync-controller.test.tsx src/features/sync/components/github-sync-panel.test.tsx src/features/sync/components/github-sync-connection-dialog.test.tsx src/features/sync/components/dashboard-sync-actions.test.tsx --run
```

Topic graph focused checks:

```sh
npm test -- src/testing/db-foundation.test.ts --run
npm test -- src/features/problems/data/problems-repository.test.ts --run
npm test -- src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts --run
```

Run the overlay capture check when validating captured LeetCode page topic
merges:

```sh
npm test -- src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx --run
```

Final topic graph validation:

```sh
npm test -- src/testing/db-foundation.test.ts src/features/problems/data/problems-repository.test.ts src/features/problems/api/problems-contracts.test.ts src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts --run
npm run db:check
npm run check
```

Full verification:

```sh
npm run check
npm run format
```

### Ponytail Regression Smoke

Use disposable data and existing opt-in provider/sync flows. The human engineer
must attach redacted happy-path and edge-case screenshots/recording before PR
review or merge for the cleanup branch.

- Data Management: replace a slow-reading/validating backup with another file;
  confirm filename, summary and restored payload all belong to the latest file.
  Repeat with a late rejection and confirm the current valid file stays ready.
- LeetCode capture: start offline, verify the overlay becomes ready from available
  page data, reconnect and refresh/hydrate. Confirm remote metadata/content
  replaces fallback and successful reads remain deduplicated. Navigate while
  reading and verify no stale content or error enters the new problem.
- AI: enable configured assessment and auto-detection, submit Accepted, and verify
  one watcher recommendation request and agreement between displayed/saved
  rating. Select a rating while the provider is pending, navigate or restart,
  and verify the choice remains or stale save is cancelled. Repeat manual quick
  submit, failed/strict timing locks, unavailable provider and stalled response
  body; timeout must remain visible and secrets redacted.
