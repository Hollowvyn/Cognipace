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
startup and retains the original available values for recovery. Automatic
upgrades accept only the exact v7/v8 migration prefixes allowlisted in
[`snapshot-upgrade.ts`](../src/platform/db/snapshot-upgrade.ts),
documented in [Database And Persistence](architecture.md#database-and-persistence).
Automatic downgrade is unsupported. The Library may still offer Retry for
transient startup failures, but retrying does not repair corrupt or unsupported
database data.

To make a local recovery copy:

1. Open `chrome://extensions`, find CogniPace, and select its service worker
   console from the Inspect views.
2. In that console, run the following expression. It reads only the four
   database recovery keys and copies their JSON values to the clipboard:

   ```js
   copy(
     JSON.stringify(
       await chrome.storage.local.get([
         'cognipace_db_snapshot_v1',
         'cognipace_db_snapshot_fingerprint_v1',
         'cognipace_db_recovery_topics_v1',
         'cognipace_db_recovery_tracks_v1',
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
   const upgrade = fs.readFileSync(
     "src/platform/db/snapshot-upgrade.ts",
     "utf8",
   )
   const legacy = Array.from(upgrade.matchAll(
     /legacy(?:Topic|Track)MigrationFingerprint = '([a-f0-9]{8})'/g,
   ), (match) => match[1])
   if (legacy.length !== 2) throw new Error("Could not read both allowlisted fingerprints")
   let candidate = 0
   const sentinel = () => candidate.toString(16).padStart(8, "0")
   while ([current, ...legacy].includes(sentinel())) candidate += 1
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

### Streak Day Rollover

1. In a disposable profile with a positive daily goal and consecutive goal-met
   days ending yesterday, reopen/refetch the popup, Overview, and Analytics.
   Confirm today's zero progress preserves yesterday's streak.
2. Save fewer unique problems than today's goal, including a repeated review.
   Confirm the streak is preserved. Meet the goal and confirm it increases by
   one across the affected surfaces. Capture screenshot or recording proof.
3. Edge path: leave a local day below its goal. After the next local midnight,
   reopen/refetch the affected surfaces and confirm the streak is zero. Meeting
   the new day's goal starts a streak of one. Check both an empty missed day
   and a partially completed missed day; capture proof.

Human installed-extension happy-path and edge-case smoke with screenshot or
recording proof is required before PR review or merge.

### Overview Daily Time

1. Rebuild and reload the extension, then open Overview. Confirm the metric row
   shows Reviews Due, Completed Today, Streak, and Time Today in that order.
2. Happy path: save a timed assessment today from the LeetCode overlay, then
   return to Overview. Confirm Time Today includes its saved elapsed time.
   Save another timed assessment for the same problem, including a failed
   attempt. Confirm both durations count while Completed Today counts that
   problem once. Capture a screenshot or recording.
3. Edge path: save an untimed assessment. Confirm it adds no time. With no timed
   assessments today, confirm `0m`; with a positive total below a minute,
   confirm `<1m`. Confirm minute/hour examples such as `35m` and `1h 25m`.
4. Correct a timed assessment's rating and use Update. Confirm its time is
   counted once. If its saved duration changes, confirm the total reflects the
   replacement. Reset that problem's practice and confirm only its retained
   effort is removed from the total.
5. Check local date rollover by reopening/refetching Overview after midnight.
   Confirm yesterday's assessments are excluded and an overnight timed session
   counts on its saved assessment date. Capture edge-case proof.
6. Check wide and narrow windows in both themes. Confirm four cards fit in the
   desktop row, wrap to two on intermediate widths, and stack on small screens
   without clipped values or horizontal overflow.

Human installed-extension happy-path and edge-case smoke with screenshot or
recording proof remains required before PR review or merge. Component fixture
screenshots and automated tests do not replace this real-time proof.

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
9. In Tracks, browse a different group from the next question's group. Reopen
   the popup and confirm the active-track group badge still belongs to its
   `Up next` question. Capture a screenshot or recording of this comparison.

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

### AI Connection And Assessment Settings

1. Open the dashboard.
2. Navigate to Settings.
3. Select Gemini in the AI connection section. Confirm a default model appears,
   then enter a custom model id and your own provider key.
4. Choose Save & test connection. Confirm it saves the provider/model/key,
   reports success for an accessible model, and leaves AI assessment disabled.
5. Leave Settings and reopen it. Confirm Gemini and the exact custom model
   remain selected, the key input is empty, and the saved-key status is present.
6. Choose Test connection without re-entering the key. Enable AI assessment and
   exercise the existing LeetCode recommendation with a submitted solution.
7. Change an unrelated preference and save it while AI edits are unfinished.
   Confirm those edits remain available and are not persisted by Save Settings.
8. Repeat connection testing with OpenAI and Anthropic if you have their keys;
   confirm each provider uses its own saved key and editable model.

Edge cases to run in the installed extension:

- Use an invalid key and an unavailable model. Confirm the saved connection
  remains visible and the failure offers an actionable message, without raw
  provider errors or key values.
- Go offline during a test and interrupt or restart the background worker.
  Confirm the UI exits its pending state within the bounded timeout and allows
  retry. Reload the extension and test its saved connection again.
- Replace or remove the selected provider key in another Settings window during
  a test. Confirm the original window does not show a valid result for the old
  key, even when both old and new keys have a presence value of true.
- Enter a key and press Enter. Confirm the AI action runs once and does not
  submit unrelated preferences. While saving/testing, confirm conflicting
  saves, provider/model edits, and Reset Defaults cannot run.
- Remove the selected key, then turn AI assessment off. Confirm turning it off
  succeeds without credentials. Reset Defaults and confirm assessment is off,
  the model is blank, and the remaining saved provider keys are preserved.
- Export a backup and inspect status/query/mutation data with test credentials.
  Confirm keys are absent from exports, sync payloads, logs, public runtime
  results, and TanStack Query caches, including mutation variables.

Attach human-run happy-path and edge-case screenshots or a recording before PR
review or merge. Automated provider-wire tests and component fixtures do not
prove live credential access or installed service-worker behavior.

Expected: provider keys stay in trusted local extension secret storage. Save &
test uses the same reusable provider integration as assessment; settings and
credentials persist independently of provider availability, and stale results
cannot validate a replacement key or model.

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
   Confirm it declares schema version 5 and typed relations have source,
   target, and kind fields. Import that file into another disposable profile
   and verify assignments, aliases, and both relation kinds round-trip.

Capture screenshots or a recording of the visible edit, capture-merge, and
backup-round-trip flows when collecting manual smoke evidence. Use dummy data;
redact topic values, settings, fingerprints, and all snapshot or recovery bytes
from shared proof. Such screenshots do not prove the v7 migration or collision
recovery behavior; the Vitest command above covers those internal paths. Record
the populated-database upgrade and recovery evidence from Phase 1 separately,
and the current backup export/import evidence separately. Do not treat
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
10. Browse a group other than the next question's group. Confirm its rows and
    pagination remain usable while popup guidance and Overview's Current chapter
    and Next up badge show the next question's group. Navigate away and return:
    Tracks starts on that group, with the selected tab revealed in the strip.
    Also leave Tracks, advance Next from another surface, and return within
    30 seconds; confirm fresh guidance selects the new Next group.
11. Edge cases: refetch while browsing another group and confirm it stays
    selected; remove the browsed group and confirm fallback to Next's group,
    then advance Next and confirm that valid fallback tab stays selected;
    switch tracks and back and confirm selection resets. Complete or suspend
    the last eligible question in a group and confirm question and chapter
    advance together. With every question completed or suspended, confirm no
    current-chapter badge is shown and the first group remains browsable. Also
    check an empty track and Free Practice mode. Attach screenshot or recording
    proof for the happy path and edge cases before review or merge.

Expected: active track state, group state, problem order, and track progress are
local and update the dashboard without changing global practice history unless a
review is saved. `Next` follows incomplete, non-suspended memberships in explicit
group and problem order without being reordered by due state. In Study Plan mode,
`hard`, `good`, and `easy` complete track problems; `again` neither completes an
incomplete problem nor clears an earlier completion. Free Practice does not write
active-track progress.

#### All Tracks Collection And Import

Human realtime happy-path and edge-case smoke with screenshots or a recording
is required before review or merge:

1. Open Tracks with multiple tracks. Confirm All tracks starts expanded, its
   count includes the active track, and the active row has a strong outline,
   tinted background, and filled Active badge. Confirm the collection heading
   uses the dashboard's bold sans-serif family while retaining its larger size.
   Check each row's title,
   description, completed/total count, and progress bar. Select an inactive
   track with Set active and confirm both the collection and workspace update.
2. Collapse and reopen the collection with its heading and the separate
   chevron button beside New Track and Import tracks. Confirm both controls'
   expansion states stay in sync. Then use
   New Track and Import tracks. Confirm the actions do not collapse the
   collection. Check the narrow layout, long titles, zero progress, and a
   completed track. With no active track, confirm the collection starts expanded
   and can still collapse/reopen using the heading, chevron, Enter, and Space;
   with no tracks, confirm both create and import are available.
3. Open Import tracks, download the template, author a disposable track, and
   choose that file. Inspect its groups and additions in the preview before
   applying. Confirm the new track appears in All tracks, the count updates,
   and the previously active track stays active. With no active track, confirm
   importing does not activate one. Cancel a preview using Close, Escape, and
   the backdrop, and confirm no content was added.
4. Try malformed JSON and a file with invalid rows. Confirm diagnostics remain
   readable and valid additions can be previewed. Reimport identical content
   and confirm no duplicate additions. Change relevant local content after a
   preview and confirm a stale preview requires another explicit apply.
   Use the keyboard to retry a failed preview and dismiss a preview; confirm
   focus stays in the modal and dismissal returns focus to the file chooser.
5. With a controlled pending apply or browser-storage save failure in a
   disposable profile, confirm Close, Escape, and backdrop cannot dismiss the
   dialog until the write/save completes. Retry a failed save and confirm it
   saves the committed changes without duplicating the import. Confirm Settings
   > Data Management retains the full content importer and template set.
   > Check Tab and Escape during pending apply/retry and after each result; the
   > status keeps focus during writes, a save failure focuses Retry saving, and a
   > saved import focuses the result without exposing background navigation.

#### Track Card Preview

Human installed-extension happy-path and edge-case smoke with screenshot or
recording proof is required before PR review or merge:

1. Click a track card's title, description, progress, and spare summary space.
   Confirm its inline preview toggles; Enter and Space on the focused card
   do the same and keep focus. Opening an inactive track must not activate it,
   change the active group, or change progress. Collapse/reopen All tracks with
   and without an active track; the count and create/import actions remain,
   and the preview stays closed when the collection reopens. Open another
   track and confirm the previous track closes, with focus on the new toggle.
2. Inspect a populated preview. Confirm the card summary and expanded groups
   share one clear rounded outline and background, with groups constrained
   inside their owning track. An expanded inactive track has a neutral outline
   of uniform thickness; the active track keeps its green outline, thicker
   leading accent, tinted background, and Active badge whether open or closed.
   Tab between card toggles and confirm the neutral focus ring is visible at
   desktop and narrow widths in light and dark themes. Each track summary has
   no expansion chevron, visible Preview label, or extra owning-track caption;
   clicking the summary still toggles its preview. Confirm ordered group headers and question
   order match Edit Track, the first group starts open, each group can collapse,
   and complete titles, difficulty, and topic labels wrap at narrow widths.
   A long curriculum scrolls inside the compact preview. Inspect empty groups
   and a track with unavailable question metadata; stored slugs remain visible.
3. Use Set active, Clear Active, Edit, Reset Progress, and Delete from the card.
   They must retain their existing behavior without toggling the preview. Cancel
   reset/delete and verify the preview and focus remain usable. Edit and save a
   group's questions, then reopen the preview and verify fresh content.
4. With controlled slow or failed preview reads, close while loading, check
   the error and Retry preview, then retry. Focus returns to the card toggle
   before the temporary retry button disappears. Opening a preview performs
   only the existing read and never a track mutation.

#### Vertical Track Editor And External Progress

Human realtime happy-path and edge-case smoke with screenshots or a recording
is required before PR review or merge. Use a disposable profile for reset,
restore, and correction cases.

1. Open New Track and edit a populated track at desktop and narrow widths.
   Confirm every group and question title wraps, the selected group's Library
   picker is immediately above its questions, and the footer stays reachable.
   Click the open group header to collapse it, leaving all groups closed; click,
   Enter, or Space reopens it. Confirm header focus remains after collapse and
   opening another group closes the previous one. Rename and New Group open
   their title field, and saving with all groups closed retains every question.
   Check light/dark appearance and 200% text scaling: shaded headers and larger
   topic titles should stay distinct from the flat, divided question rows. Full
   titles, metadata, and every action must fit without clipping; Library results
   and Change menus must remain visible above surrounding content.
   Rename, add/reorder groups and questions, remove an empty group, and confirm
   non-empty and final groups cannot be removed. Save an invalid empty group
   title, collapse all groups, then Save and confirm that group expands with its
   title field visible.
2. Open Change by mouse and keyboard. Check full destination titles, Arrow keys,
   Home/End, Enter/Space selection, Escape without closing the modal, outside
   click and Tab dismissal. Move a question and confirm it appends to the
   destination, disappears from the source, and focus remains useful. Check a
   menu near the modal footer with enough groups to scroll, including at 320px.
3. Successfully solve a question before creating a track. Create two tracks
   sharing it, enabling Allow external progress in only one. Confirm the editor
   preview, completion count, expanded External progress rating/date, Next, and
   popup guidance agree; the default-off track remains incomplete. Save/reopen
   both settings and test turning the option off and back on.
4. In Free Practice, save a future `hard`, `good`, or `easy` for another member of
   an inactive opted-in track. Confirm credit without changing the default-off
   track. Save a later separate `again` and confirm earlier success still counts.
   In a separate correction case, update the latest successful review to `again`,
   then back to a successful rating; check removal/restoration, including fallback
   to another historical success.
5. Complete a question in Study Plan mode, switch mode or active track, and
   correct the linked review. Confirm the original owned completion updates and
   expanded details say Completed in this track. Reset the original track, then
   correct its old review and confirm deleted owned progress is not resurrected.
6. Suspend an incomplete question and confirm Next skips it while total count
   remains. Move/reorder/remove memberships and confirm totals and Next still
   use explicit whole-track order. Due review scheduling must remain unchanged.
7. Reset an opted-in track. Confirm the dialog explains that external progress
   turns off, the count becomes zero, and practice history remains. Re-enable to
   restore historical credit. Reset global practice for a question and confirm
   its evidence disappears from every opted-in track.
8. Export a v5 backup with an enabled track; restore into a disposable profile
   and confirm the flag and raw history survive. Restore v1-v4 fixtures and
   confirm flags default false. Re-import content v1 and confirm an existing
   enabled flag stays enabled while new imported tracks default off. Run the
   existing authorized sync smoke with v5 data if testing configured sync.

Bounded database upgrade proof is automated using frozen populated v7 and v8
fixtures. Run `npm run test -- src/platform/db/instance.test.ts
src/platform/db/snapshot-upgrade.test.ts src/testing/db-foundation.test.ts`.
For actual extension upgrade smoke, prepare those disposable historical profiles
and capture their data before/after loading the new build. Check recovery retry,
unsupported fingerprints, and retained originals on failed upgrades. Confirm the
v8 Track upgrade preserves its original in the Track recovery slot alongside an
existing v7 Topics recovery copy. A different original already in the same slot
blocks overwrite; never discard it to bypass this condition. Agent component
screenshots do not replace human extension/runtime or upgrade proof.

#### Track Table Pagination

Human realtime happy-path and edge-case smoke with screenshots or a recording
is required before review or merge:

1. Select a group with more than 15 problems. Confirm exactly 15 problems on the
   first page, “Rows per page: 15”, a correct range count, and disabled Previous.
   Page forward and back; confirm the last partial page, disabled Next, and
   original membership order numbers. Expand a problem on each page and check
   its details, edit/practice actions, and LeetCode link.
2. From a later page, switch groups and tracks. Confirm each starts on page one
   with collapsed details. Verify groups with 1, 8, or exactly 15 problems show
   the page size and correct range with no Previous/Next controls. Empty groups
   retain their empty state without pagination.
3. In a disposable 16-problem group, remove the only problem on page two.
   Confirm the table returns to the valid first page with 15 problems and
   “1-15 of 15” with no Previous/Next controls. Refresh practice state within a
   larger group and confirm the current page remains selected. Track progress
   and Next still reflect the full track rather than just the visible page.
4. In Library, verify its 20/30/50 page-size choices and selected-row bulk actions
   still work with the shared footer. Previous/Next controls appear only for
   multiple pages; single-page results retain the page-size selector and range.

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

Run this flow against the locally built extension, with separate disposable
ready-history and sparse-history datasets. Ready history must contain enough
eligible samples to show all four historical cards and supported Memory
Strength quartiles. Sparse history must include empty beginning and ending
buckets, internal missing buckets, measured 0% rates, one measured point, no
valid ratings in a period, count-only intervals, known zero counts, and mixed
practice/rating readiness. Include a
current partial bucket and a cross-year report date when preparing the test
data. If a cross-year report date cannot be exercised in the local extension at
test time, record that exact smoke case as pending; fixture proof covers only
the fixture case.

The merged Practice Rhythm flow, including happy-path and edge-case realtime
smoke, remains required and pending before PR review or merge. The human engineer
must use the installed rebuilt extension and attach screenshots or a recording;
production-component fixture images are separate proof. Record any interval-union
or cross-year edge that cannot be exercised in the installed extension as an
exact pending case.

1. Run `npm run build`, load `dist/chrome-mv3` in Chrome, and click CogniPace's
   reload button in `chrome://extensions` after the build. Reopen the dashboard
   and navigate to Analytics so the smoke uses the rebuilt local extension and
   its runtime, rather than a fixture page or an already-open stale dashboard.
2. In both datasets, choose 14, 30, and 90 days. Confirm daily, three-day, and
   weekly grouping respectively, and verify the selected range remains selected
   until explicitly changed. Available charts remain visible under a readiness
   warning; a suggested shorter ready range changes selection only when its
   link is activated.
3. Check the report's selected timezone and as-of context, sparse calendar-date
   ticks, and full bucket intervals in inspection. Marks use each supplied
   interval's midpoint, including shortened edge intervals. Tick labels use
   MM/DD in the report's as-of year and /YY for another year; a cross-year
   tooltip interval shows both years. The current partial interval is marked
   in progress, with no future observations.
   All four historical charts must remove only unsupported beginning and ending
   buckets from Chart, Table, and inspection while retaining all internal gaps.
   Recall's window starts/ends with either known rate; Memory's starts/ends with
   a finite median, including zero or sub-day values; Practice's starts/ends
   with positive completed reviews, positive valid-rating counts in either
   source view, or a finite supplied success rate including 0%. Confirm the selected range,
   period totals, readiness, serialized scales, and report time remain
   unchanged.
4. In each chart, move the pointer across the plot and tap near its left,
   middle, and right buckets. The nearest retained original bucket must be
   inspected, including an internal empty bucket. Confirm no permanent bottom
   detail row is added and the tooltip remains hidden before interaction.
5. Tab to each chart's native inspection button. Check visible focus,
   Left/Right arrows, Home/End, Enter/Space, and Escape. Keyboard inspection
   exposes the same exact bucket values as pointer/tap inspection; Escape and
   blur hide the tooltip. A quiet selected guide must not create a measured
   marker or value for unknown evidence.
6. Inspect the first and last measured values and extremes near axis bounds.
   Circle/diamond markers and low whiskers must remain visible with sufficient
   clearance. Missing-evidence bridges connect measured neighbors only; an
   unknown bucket keeps its unavailable value. A single point remains visible
   with “Not enough data for a trend yet.”
7. In Recall vs FSRS Estimate, confirm repeat-only copy, a solid observed line with
   circle markers, an opaque short-dashed estimate with diamonds, visibly longer
   missing-evidence bridges, and the saved Target Recall button above the data.
   With at least two retained intervals, verify the first marker sits 12px from
   the plot's left axis at both wide and narrow widths. The domain starts at
   that interval's actual midpoint and still ends at the last interval's end;
   ticks must represent true dates within this domain. For example, a first
   09/09–09/11 interval starts the domain at 09/10, while its tooltip and Table
   still show 09/09–09/11. Inspect a first point at 0% or 100% and confirm its
   ordinary and active circle/diamond remain fully visible. A singleton keeps
   its original interval domain and centered marker. Memory Strength and Practice
   Rhythm retain their interval-boundary X domains and padding.
   Compare tooltip and Table recalled/paired counts, rate values, signed
   observed-minus-estimate difference, evidence, and reconstruction provenance.
   The difference must reflect the supplied value rather than subtraction of
   rounded displayed rates.
8. Toggle each Recall series with pointer and keyboard, then hide both. The
   curve, markers, and tooltip rate hide together; the signed difference appears
   only with both series visible. Shared sample counts and the target remain,
   and the accessible description matches the visible series. The retained
   window, X domain, first-point clearance, and dates must remain fixed while
   toggling, even when an edge
   bucket has only one known rate. A measured 0% edge remains supported.
9. In Memory Strength, inspect a bucket with at least four eligible reviews and
   one with fewer than four. Only the supported bucket gets discrete Q1–Q3
   whiskers; known medians remain available in both. Confirm the Median/Middle
   50% key, reconstructed stability in days, eligible count, median change, and
   unavailable quartiles agree between tooltip and Table. A finite median must
   retain an edge bucket even without quartiles or four eligible reviews.
10. Check Memory Strength with sub-day, equal/single, and widely spread values.
    Its fitted duration domain must contain every finite median/Q1/Q3 extremum,
    leave an actual minimum two-day window, and keep low ranges and markers
    readable. No connected shaded range may imply quartiles across an
    unsupported bucket. Empty edge buckets must be absent, while internal
    unavailable buckets remain inspectable. A single finite median retains its
    original interval and single-point guidance; wholly unavailable medians
    show the explicit empty state.
11. Confirm one full-width Practice Rhythm card combines exact supplied shares
    in bottom-to-top Easy, Good, Hard, Again order with a thin, straight neutral
    completed-review line and measured markers. The left axis is fixed at
    0–100% and labeled Rating share (%); the supplied independent right axis is
    labeled Reviews. The Good + Easy upper boundary expresses Review Success,
    with no separate success curve. The saved Target Review Success reference
    uses the left percentage axis; its compact editor remains above the plot in
    empty, sparse, Chart, and Table states. Test goals at 0% and 100% and confirm
    they do not change rating geometry, count scale, rows, or dates. Completed
    reviews must remain independently supplied rather than derived from valid
    ratings. The visible copy explains association rather than causation, and
    that a count-line crossing with the target has no percentage meaning.
12. Inspect the merged interval union, including count-only and rating-only
    intervals where supplied. Rows must match by ID plus exact start/end dates,
    preserving an absent counterpart as unavailable rather than borrowing a
    neighboring row or substituting zero. Chart, inspection, and Table trim only
    unsupported outer intervals; positive completed-review or valid-rating
    counts and finite supplied success including 0% retain an edge. Known zero
    counts remain measured observations in the retained window, while missing
    counts have no measured marker. Every internal gap remains inspectable.
    Unavailable composition uses full-height neutral gray diagonal hatching; a
    populated bucket's zero category stays zero-height. Only Easy, Good, Hard,
    and Again are rating categories.
13. Compare the shared tooltip and Table with exact stacked geometry. Both must
    retain completed reviews, each rating count and precise share, Good + Easy
    numerator/valid-rating denominator, supplied success, target, each metric's
    evidence, full interval, timezone/as-of, and complete/in-progress context.
    Centered whole-percent labels stay at 12px only when they fit without count
    line or target collisions; rounded totals of 99% or 101% must not alter
    shares. Toggle Reviews with pointer and keyboard: the count line, markers,
    right axis, and tooltip count hide/show together, and accessible copy follows
    that state. Dates, retained rows, target, Table counts, and category geometry
    remain fixed. Confirm distinct practice/rating readiness warnings, the
    selected-period Hard + Again summary, evidence-gated prior-period comparison,
    and wholly unsupported-period empty state remain truthful.
14. Switch each of the four historical panels between Chart and Table. When more than
    seven rows exist, confirm seven rows per page, Previous/Next boundary
    states, and page reset after a range change. Inspect full interval,
    complete/in-progress state, grouping, report time, and evidence context
    across both views. Confirm Chart and Table use the same retained activity
    window, and wholly unsupported periods show their explicit empty state.
    Practice's Table retains all supplied counts/shares and unavailable states
    when Reviews is hidden in Chart; its target control remains reachable.
    Change range while a tooltip is visible to check that selection resets or
    clamps to the new rows without stale values.
15. Repeat ready and sparse paths at wide and 320px dashboard widths in both
    light and dark themes. Check axis/key contrast, sparse ticks, control
    reachability, tap coordinates, keyboard focus, table scrolling, and
    the First Outcomes/Recall responsive pair, full-width Practice, and
    Memory/Topic stacking. There must
    be no horizontal document overflow. Include neighboring panels with different
    readiness messages; plots and controls must retain usable alignment without
    overlap or clipped labels.
16. Reload the built extension again and reopen Analytics. Confirm the local
    data and expected values remain available, and repeat a range change and
    keyboard inspection through the extension runtime.
17. Confirm Recent Overdue Backlog still has a watch zone at five problems:
    values at or below five use healthy green, values above five use attention
    yellow, and its tooltip reports threshold status. Unknown/reconstructable
    history must not be made up. Confirm straight connections, dots for zero and
    isolated known dates, null gaps, unclipped boundary dots, and matching
    pointer/tap/keyboard inspection with arrows, Home/End and Escape.
18. Confirm Upcoming Review Load still shows its fixed next 14 calendar days,
    including when the selected historical range is unready. Check separate Due
    and Overdue counts inside sufficiently large segments, tiny outside labels,
    overdue-only Today, neighboring label collisions, and zero schedules. Inspect
    and Table must retain exact counts, dates and report context.
19. In Retention Map, use more than 30 eligible reviewed questions, including
    exact overlaps, boundary recall values, sub-day durability and long titles.
    Confirm every eligible question remains in Chart/Table and the full status
    counts agree. All/Below target keeps the same fitted landscape; include an
    empty Below target result. Hover/tap and the native keyboard inspector must
    agree, nearby-memory choices must include every overlapping question, and
    Home/End/arrows must reach the final question. Pin details below the chart,
    check all supplied values/dates and canonical LeetCode links, then close,
    Escape or click outside; focus must return appropriately.
    Drag forward and reversed boxes, a nested box and a box reaching each plot
    edge. Release must magnify the chosen region, keep all selected points
    visible, update true axes and retain fixed mark sizes. Check tiny/thin drags,
    release outside the plot, pointer cancellation, blur and resize; none may
    pin accidentally or leave a marquee. Escape during a box cancels it and
    preserves pinned details. Wheel zoom stays under the cursor, Shift-drag
    pans, and touch pinch/pan works with explicit plus/minus/reset alternatives.
    Double-click/reset must restore the full fitted domains, preserving a pin
    even for slower double-clicks. Keyboard selection after zoom reveals an
    offscreen question. Test both themes at 320px and desktop, all Chart/Table
    pages, and refreshed data removing a selected question. Compare FSRS cards,
    due dates and Settings before/after to confirm presentation-only changes.
20. In Memory Signals by Problem, confirm exactly five rows per page when more
    than five exist, Previous/Next and the live row range update correctly, and
    visible problem links open canonical LeetCode problems in new tabs. Confirm
    compact inline reasons, long-title wrapping and severity order. Refresh data
    while on a later page to check reset/clamping and top-25 versus total copy.
21. For Topic Performance, include more than five qualifying topics, low-evidence
    topics, long names, and rates at 0%, just below the goal, and 100%. Confirm
    rising columns, stable ordering, the shared Review Success goal, unrounded
    goal status, and all rows/full names in Table. Changing the goal from either
    Topic or Practice Rhythm updates both while preserving outcomes. At 320px,
    keyboard selection must reveal the active topic inside the bounded scroller;
    neither the chart nor its editor may create document overflow.

Expected: Analytics loads through the extension runtime without the failed-load
state, reflects only local practice data, and tells a truthful chart story
without filling missing evidence.

#### First Attempt Outcomes and Repeat Recall

The implementation has automated and production-component fixture validation.
These cases require human realtime smoke in the rebuilt installed extension
with disposable data and screenshot or recording proof before PR review or
merge. Record any case that cannot be induced as pending.

- [ ] **First-record selection:** record Again, then Good on one problem; its
      first-outcome result stays Again. Include Hard and Good first records on
      two other problems: first success is 2/3 and Good + Easy is 1/3. Include
      duplicate cards/modes, shuffled history, and tied times to check the
      earliest raw `(reviewedAt, id)` selection across a problem. An invalid
      earliest rating excludes that problem and never promotes its later Good.
      An initial before the selected period prevents a recent repeat from being
      counted as new. Valid ratings with null/conflicting correctness or missing
      FSRS logs remain eligible.
- [ ] **Repeat pairing:** with initial-only history, New Problem Success is
      available and Recall is empty. Add a recent repeat after a pre-range
      initial; both Recall curves, Table counts, and readiness must use the same
      repeat pair and its prior replayed memory state. A genuine zero repeat
      estimate stays measured. Many first records cannot make repeat Recall
      ready. Memory, Practice, and Topic populations retain their meanings.
- [ ] **First graph evidence:** compare mint Hard + Good + Easy circles and
      thinner solid blue Good + Easy diamonds against the same valid-first
      denominator. All Again is measured zero; no valid first records is
      unavailable. Check weighted period totals and full-period invalid-first
      exclusions, including invalid-only outer buckets trimmed from display.
      Chart/Table/inspection keep internal gaps, exact rating counts, both rates
      and goals, evidence, full intervals, partial status, timezone/as-of, and
      retained-history calculation details. There is no mock difficulty row.
- [ ] **Independent goals:** both new goals default to 90% even in older
      two-goal settings. Save either above or below the other, including 29%,
      0%, and 100%, without changing the old pair or measured data. Equal values
      draw one neutral shared line; both editors and tooltip values remain.
      Test invalid fractional/out-of-range drafts, Enter/Escape/focus return,
      pending/failure/retry, reload, other-tab saves, Settings Save/Reset Defaults,
      and strict full-backup restore. Reset restores all four goals to 90%.
      Configured disposable Gist sync uses the existing settings path; record
      it pending if not exercised.
- [ ] **Presentation and proof:** test unequal/equal references, series switches,
      sparse zero, singleton, first-only/repeat-only/empty data, seven-row Table,
      cross-year labels, pointer/tap and keyboard inspection at 14/30/90 days.
      Series visibility preserves dates and the fitted scale containing both
      goals. Both new/Recall plots use first-midpoint/12px clearance for multiple
      intervals and the original interval domain for one. Check the paired
      layout and stacked 320px layout in light/dark themes without overflow or
      clipped controls. Attach screenshots or recording of happy and edge paths.

#### Analytics Chart Targets

The chart-target implementation has automated and component-fixture proof.
These unchecked cases are required human installed-extension smoke before PR
review or merge, using
the rebuilt extension and disposable data from the flow above. Record the
tested build and exact passed or pending cases; fixture images are separate
proof.

- [ ] **Independent defaults:** open Analytics with older settings missing the
      goal fields and an FSRS target retention other than 90%. Both chart goals
      must be 90%. Record FSRS retention, representative card due dates, Recall
      and Review Success rates/counts, and Retention Map values before editing
      goals so the later comparisons use the same practice data.
- [ ] **Save and cancel:** open Target Recall, confirm its input receives focus,
      and verify exactly one input with the Hard + Good + Easy hint and current
      Success limit. Save Recall 80%; Success remains 90%. Open Target Review
      Success, verify its single focused input and Good + Easy / Recall-limit
      hint, then save 85%; Recall remains 80%. Both references use the saved
      result. Change each draft, then Cancel or Escape; the prior pair remains
      and focus returns to the trigger. Reopen and submit with Enter. Repeat
      with pointer, keyboard, and touch where available.
- [ ] **Invalid drafts:** test an empty input, a fractional percentage, -1,
      101, and Recall 95% with Success 90%. Saving must be blocked without
      changing either goal or silently adjusting the other goal. The invalid
      pair says “Review Success target must be at least your Recall target.”
      Equality, 0%, and 100% are valid when the pair satisfies the rule. Raise
      Success before raising Recall beyond it; lower Recall before lowering
      Success below it. With a draft open, change the counterpart from another
      tab; the input draft stays while its hint and validation refresh. Save
      must preserve the latest other goal, or reject an invalid merged pair.
- [ ] **Pending and failure:** use a controlled delayed and rejected
      `settings.updateSettings` mutation in a disposable local test build and
      record how it was induced. Confirm Saving and duplicate-submit prevention.
      A rejected save must keep the prior captions/references and the open
      draft with a useful error; retry succeeds and Cancel still discards it.
      If either condition cannot be induced, record that exact case as pending.
- [ ] **Boundary references:** save 0%/0%, 0%/100%, and 100%/100%. Inspect both
      named dashed references and accessible descriptions at 0% and 100%; each
      percentage scale must contain its goal with usable boundary clearance.
      Practice's goal uses the fixed left rating-share axis and leaves rating
      geometry and its supplied right review-count scale unchanged. Measured rates, counts, rows, dates,
      internal gaps, and trimming must match the pre-edit data.
- [ ] **Range and presentation:** retain a non-default pair while changing
      14/30/90-day ranges, including switching to an uncached range while a save
      is pending, toggling Recall series and Practice's Reviews, switching Chart/Table, and
      opening empty or sparse datasets. The controls remain reachable and the
      saved pair remains fixed. Repeat closed, open, invalid, and boundary-goal
      states at wide/narrow widths in light/dark themes; check focus, wrapping,
      tap targets, axes, keys, and tooltip visibility without clipping.
- [ ] **Reload and Settings:** save a non-default pair, reload the built
      extension in `chrome://extensions`, and reopen Analytics. Captions,
      references, and reopened drafts must use the saved values. Save an
      unrelated preference in Settings and confirm the pair remains. Use
      Reset Defaults and confirm both goals return to 90% with the other
      preferences. Repeat after another tab edits the goals while Settings has
      an unrelated dirty draft, and immediately after Settings Save while its
      refresh is pending; no separate Settings section is added.
- [ ] **Backup and configured sync:** export a full backup with a non-default
      pair, restore it into a disposable profile, and confirm both saved goals.
      Restore an older backup without these fields and confirm 90%/90% while
      unrelated settings retain their stored values. When testing an already
      configured Gist with disposable profiles, push/pull the pair through the
      existing settings payload and verify it survives. Use the existing backup
      and Gist confirmation flows; record unexercised sync as pending.
- [ ] **FSRS isolation and proof:** compare the recorded retention setting,
      card due dates, FSRS estimates, Retention Map, readiness, rates, and
      practice outcomes after changing only chart goals. They must be
      unchanged. Attach screenshots or a recording of the saved happy path,
      invalid and failed-save edge paths, wide/narrow light/dark editors, and
      0%/100% reference clearance before PR review or merge.

The human engineer must record the tested build, datasets, ranges, widths,
themes, and exact passed or pending cases, then attach screenshot or
screen-recording proof of the ready-history happy path and sparse/unready edge
path before PR review or merge. This is required by
`docs/agent-governance.md`. Automated checks and agent-rendered fixture
screenshots do not replace human real-time extension smoke or establish that
this checklist has passed.

### LeetCode Overlay

1. Open a LeetCode problem page in Chrome.
2. Confirm the CogniPace overlay appears after page context is read.
3. Start, pause, and reset the timer.
4. Expand the overlay. Confirm Structured Log, Interview Pattern, Time
   Complexity, Space Complexity, Languages, and Notes controls are absent.
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
13. Happy path: submit a timed review, change its rating, and use Update. Confirm
    only one attempt remains and next-review/track guidance refreshes.
14. Edge path: load a problem with existing saved structured-log values, submit
    an untimed review, then update its rating. Export a backup and verify those
    saved values remain. Restore an older backup with notes and repeat.
15. Confirm collapse/dock/restore and SPA navigation work before and after
    submission, including a failed attempt with locked rating.

Expected: the overlay remains recoverable, does not dominate the LeetCode page,
the Help action is keyboard accessible and opens the title/slug search without
replacing LeetCode, and saved review results update CogniPace state.

For this behavior-changing overlay update, a human engineer must run the title
happy path, slug-fallback edge path, and structured-log removal/preservation
flows above and attach screenshot or screen-recording proof before PR review or
merge. Automated checks do not replace that proof.

#### LeetCode Submission Capture

1. With code focused in the LeetCode editor, submit an accepted solution using
   Command+Enter on macOS or Ctrl+Enter on Windows/Linux. Confirm the overlay
   captures the attempt and updates when judging finishes, just as it does
   when clicking LeetCode's Submit button.
2. Submit a wrong-answer or runtime-error solution with the same shortcut.
   Confirm the overlay receives the failed result and its matching code.
3. Type ordinary Enter and use LeetCode's Run shortcut. Confirm neither starts
   a submission capture. Hold the submit shortcut and confirm key repeats do
   not restart capture or polling.
4. Navigate to another problem during judging. Confirm the previous result
   does not replace the new problem's context, and the shortcut works there.

Human-run happy-path and edge-case smoke with screenshot or screen-recording
proof is required before PR review or merge. This shortcut fix has automated
watcher coverage; real-browser proof remains pending.

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

- Overview is implemented as a guided-practice home; use the daily-time flow
  above to validate its recorded effort metric.

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
