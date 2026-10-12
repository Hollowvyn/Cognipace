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
upgrades accept only the exact through-0007, through-0008, and through-0009
migration prefixes allowlisted in
[`snapshot-upgrade.ts`](../src/platform/db/snapshot-upgrade.ts),
documented in [Database And Persistence](architecture.md#database-and-persistence).
Automatic downgrade is unsupported. The Library may still offer Retry for
transient startup failures, but retrying does not repair corrupt or unsupported
database data.

To make a local recovery copy:

1. Open `chrome://extensions`, find CogniPace, and select its service worker
   console from the Inspect views.
2. In that console, run the following expression. It reads only the five
   database snapshot/recovery keys and copies their JSON values to the clipboard:

   ```js
   copy(
     JSON.stringify(
       await chrome.storage.local.get([
         'cognipace_db_snapshot_v1',
         'cognipace_db_snapshot_fingerprint_v1',
         'cognipace_db_recovery_topics_v1',
         'cognipace_db_recovery_tracks_v1',
         'cognipace_db_recovery_fsrs_v1',
       ]),
     ),
   )
   ```

3. Paste the copied JSON into a local file and store it privately. Do not use
   `chrome.storage.local.get(null)` or export all extension storage: it can
   include secrets and unrelated private settings. Do not paste the recovery
   JSON, snapshot bytes, or topic values into an issue or other shared report.

The through-0009 upgrade suite in
[`fsrs-preservation.integration.test.ts`](../src/platform/db/fsrs-preservation.integration.test.ts)
compares every original column in a populated source, 75% retention, distinct
daily and streak progress, staged-publication failure, retry, and reopen while
checking both older recovery slots. It runs the real 0010 evidence migration,
verifies six inferred unknown evidence rows and active generation scopes, and
checks exact metadata/token equality on matching reopen. A real staged
preparation failure rejects a malformed log without changing the stored
original or first recovery record.

### Reliable Review Commands (Phase D)

Human installed-extension proof is pending. Use a disposable profile with a
pre-D full backup and attach screenshots or a recording before PR review or
merge. C's historical proof record and user confirmation do not provide D proof.

1. Submit a timed review and confirm Saved only after durable publication. Reload
   and inspect one event, its original time, log, card ID and track credit.
2. Reselect the rating and Update repeatedly; verify one attempt/count, unchanged
   event and solve time/log, incrementing revision and original-profile schedule
   even after changing target retention. Restart then Submit must add a genuine
   new review. Existing assessment rating locks must still hold.
3. Open the same problem in two tabs. Update in one then submit the other's stale
   Update; verify conflict, no extra mutation and preserved selected draft. Use
   deliberate refresh/reselect to recover.
4. Reuse the test-only `cpBackupSmoke` storage fault shim below to reject snapshot
   publication after a review transaction. Verify pending feedback, no Saved or
   next-step success, locked rating/Restart and accessible Retry. Remove the fault
   and retry the same accepted command; reload shows one event/track effect.
5. Lose the review acknowledgement after publication and terminate/restart the
   service worker, keeping the caller's accepted command. Retry returns the
   original acknowledgement without a second review. If restart instead loses
   unflushed state, the same command applies once against the durable baseline.
6. Retain a pending command, perform an actual targeted schedule reset or full
   backup restore from another surface, then retry. Verify stale-generation
   rejection, preserved draft, fresh tokens and untouched replacement history.
7. Export/restore v6 with captured/legacy-derived evidence and historical
   correction receipts; compare opaque IDs, history, event/solve time, logs,
   settings/profiles and track metadata. Imported receipt keys cannot acknowledge
   old local commands. Check ambiguous legacy Update's explanation and new Save.
8. With configured Gist sync and a changed remote backup, force review publication
   failure and request an open check or pull without overwrite consent. Confirm
   the pending local review remains. Clear the fault and Retry; a clean check must
   still see local changes. Also stop the worker after publication while the
   acknowledgement is delayed; after restart automatic sync must preserve the
   published review until the existing explicit sync decision is made.

Automated real-WASM proof is in `practice-durability.integration.test.ts`,
`practice-command.integration.test.ts` and `platform/db/instance.test.ts`.
It covers stored snapshot reopen, lost acknowledgement, failed publication,
unflushed bootstrap retry, historical correction replay, populated C/v6
compatibility, reset/restore rotation and stalled transaction rollback/commit.
Runtime/overlay suites separately cover pending UI, authentication and locks.

### Phase E Daily Scheduling And Study-Day Smoke

Human installed-extension happy-path and edge-case proof is pending. Use a
disposable Chrome profile with a populated pre-E backup and a local timezone
that observes daylight saving time. Reload the built `dist/chrome-mv3` extension
from `chrome://extensions` after each build. Record the local timezone, wall
clock, and representative raw FSRS due instants; attach redacted screenshots or
a recording of Settings, Practice, popup/Overview, Analytics and reminder
results before PR review or merge. Automated tests do not replace this proof.

1. Preserve a history with a future raw due date more than 180 days away,
   suspension, an active track and earned Daily Goal/streak credit. Upgrade and
   reopen without reviewing it. Confirm its raw due date, history, card ID,
   settings, credit and suspension are unchanged. A restore/reopen must preserve
   the same facts.
2. Set FSRS target retention to 75%, save, reload Settings and confirm it stays
   75% while the independent Analytics chart goals remain unchanged. Submit a
   genuine review and inspect its captured long-term profile: 180-day native
   maximum, empty steps and fuzz off. Verify the returned card/log agree, and
   do not interpret 180 as a strict ceiling: a mature-card boundary fixture may
   return Good/Easy at 181–183 days. A low-retrievability future card must stay
   future-scheduled.
3. Reselect and Update the latest older review after changing Settings. Verify
   the original event time, profile, count, identity, log and track credit are
   retained; its original maximum can still produce a due date beyond 180 days.
   Repeating Update must not create another review. Restart then Submit must
   create one genuine new review under the current daily profile. Confirm
   assessment rating locks still work.
4. Around local midnight, review a card whose raw `dueAt` still falls on the
   review's local date. Confirm Practice, Library, popup, Overview and current
   Analytics do not reoffer it that day; it becomes eligible no earlier than
   the next local day. Repeat at spring and autumn daylight saving transitions,
   and after changing the browser's timezone. A same-day Update must use the
   original review time rather than its later correction time. Keep the raw
   `dueAt` unchanged throughout these read checks.
5. Fill the automatic queue with overdue, due-today, New, future low-recall,
   suspended and premium-filtered cards. Confirm only overdue, due-today and
   eligible New cards enter automatic recommendations, in that order and within
   the full Daily Goal count. A future card never becomes the automatic top
   recommendation. Check the popup and Overview separately, including empty
   and fully met-goal states; track progression remains separate.
6. Click **Extra Practice** in popup and Overview. Confirm it requests a future
   reviewed card only after the click, opens the selected problem, and leaves
   automatic items and Daily Goal/track credit unchanged until an actual
   review. Verify loading, no-future-card and read-error states. Suspended and
   filtered premium cards must not be offered.
7. Compare Practice's due-today/overdue values, the automatic queue, current
   Analytics memory signals, Retention Map and Today's Upcoming Review Load
   around local midnight. For cards included by the saved Queue filters,
   eligibility and due counts should agree. Retention Map and Memory Signals
   still show unsuspended reviewed premium cards when the queue's premium
   filter is on; a future low-retrievability card can appear without being due. Check
   Upcoming's Today plus thirteen dates and that historical Overdue Backlog
   remains a separate historical snapshot.
8. Open historical Recall and Memory strength with captured reviews,
   legacy-derived reviews and an event missing scheduling evidence. Observed
   repeat outcomes must remain counted; modeled values use recorded inputs,
   legacy estimates are labeled compatibility, and missing model evidence is
   shown as unavailable with modeled sample counts. Change current retention
   and confirm it does not rewrite those historical estimates. Confirm current
   Retention Map identifies the recorded or compatibility profile used.
9. Enable local due reminders and compare their due count with the automatic
   queue's `dueToday`. Two checks on the same local day must notify at most
   once; crossing local midnight permits the next eligible day's reminder.
   Repeat at both daylight saving transitions, and check popup/Overview and
   Analytics counts again after the service worker restarts.

### Phase F Four-Rating Preview Smoke

Human installed-extension happy-path and edge-case proof remains **pending**.
Use a disposable Chrome profile and the built `dist/chrome-mv3` extension.
Attach redacted screenshots or a recording of the expanded LeetCode Overlay
for these flows before PR review or merge.

1. On an unreviewed problem, open the expanded Solve rating controls. Confirm
   Again, Hard, Good and Easy each show a local next-study date and day count.
   Submit a selected grade and compare the saved due date with the estimate
   when the clock and Settings have not changed. Repeat at 75% retention; a
   mature boundary fixture may show native 181–183-day results despite the
   configured 180-day maximum.
2. On a reviewed problem, change retention and select a different grade for
   Update. Confirm the four estimates use the original review date/profile and
   the matching Update yields the same due date. Repeat Update and verify no
   extra attempt, changed credit or changed log. A past estimate must say
   **Past study date** rather than imply a future wait. Check a supported
   legacy-derived estimate and an unavailable ambiguous legacy context.
3. Check local midnight and both daylight saving transitions. A same-day raw
   FSRS due instant becomes eligible on the next local study day; an Update's
   day count starts at its original review date, not the correction time.
4. While a preview loads or fails, Submit/Update must remain available when
   their existing rules permit them. Confirm locked grades stay disabled,
   selected draft survives a preview refetch and a stale Update conflict, and
   pending Save/Update Retry keeps its accepted command locked. Restart or
   navigate to another LeetCode problem while a read is pending; no old
   estimate may appear on the new problem. A final AI effective grade may
   differ from the selected preview without silently changing the command.
5. Compare card, attempt, profile, receipt, track credit and sync state before
   and after preview-only actions. Reopen the extension and confirm no preview
   read created a review or altered a due date.

### Responsive Overlay Startup Baseline And Smoke

Status: the packaged disposable-profile page-stage baseline is **partial**;
worker/renderer attribution and real Submit comparison are pending. Human
installed-extension happy-path and edge-case smoke with screenshots or a
recording is **pending** before PR review or merge. See the [Phase 1
handoff](superpowers/handoffs/2026-10-12-responsive-overlay-phase-1-baseline.md)
and [sanitized raw report](superpowers/evidence/responsive-overlay/overlay-startup-standard-2026-10-12T06-38-38.694Z.json).

To reproduce the automated page baseline, use the pinned Node/npm versions in
Local Setup, install dependencies, and run from the repository root:

```sh
rtk proxy env COGNIPACE_SCALING=standard npm run test -- src/testing/fsrs-scaling-benchmark.test.ts
rtk npm run build
rtk proxy node scripts/fsrs-scaling-chrome.mjs --backup test-results/fsrs-phase-g/standard-backup.json --dataset standard --problem-url https://leetcode.com/problems/two-sum/ --startup-only --samples 20 --cold-samples 10
```

The driver loads `dist/chrome-mv3` into a unique `/private/tmp` Chrome profile,
restores the synthetic v6 fixture there, verifies the real Two Sum slug, and
removes that profile afterward. Never restore the scaling backup in a personal
profile. It opens 20 fresh tabs in the same browser and worker for warm samples;
each of 10 cold samples restarts the entire browser with the same persisted
disposable profile before opening a fresh tab. Fixture restore and known-slug
setup are untimed. It writes sanitized raw samples and trace metadata under
`docs/superpowers/evidence/responsive-overlay/`. The first warm and cold opens
include trace collection overhead. A partial report makes the command exit 1;
read the JSON statuses rather than interpreting that exit as a complete pass.

For a human Performance trace, use a separate disposable Chrome profile with
the packaged extension loaded, restore the synthetic backup only in that
profile, and open a verified known LeetCode problem. Capture one warm and one
full-browser-restart cold opening with DevTools Performance recording. Inspect
the page's User Timing marks, extension service-worker work, renderer tasks
over 50 ms, and the timer's first usable state. Attribute a task to CogniPace
only when the trace identifies its extension or script context. Record Chrome
version, extension build, fixture counts, profile type, raw durations, failure
statuses, and redacted trace or screenshot paths. Keep submitted code, full
trace payloads, storage snapshots, credentials, and personal history out of
shared evidence.

#### Phase 1 human smoke: observe current behavior

These checks describe the installed extension as it works in Phase 1. Record
what happens and any failure; do not grade it against the progressive startup
behavior planned for Phases 2 and 3.

- [ ] With the installed packaged extension, open a fixture-known problem warm
      and after a full browser restart. For the new-problem cases, use two
      distinct valid LeetCode slugs confirmed absent from the installed
      disposable database (including seeded catalog rows):
      one for the warm open and another, still unseen slug after the full browser
      restart for the cold open. Record mount-to-usable-timer and saved-context timing,
      displayed identity, loading/error state and when the timer becomes
      responsive. Note whether the new problem is upserted and whether its
      saved history is empty after context loads.
- [ ] On known and new problems, start, pause and reset the manual timer as
      soon as it is usable. Enable the saved automatic timing setting and repeat
      warm and cold opens. Record when automatic start occurs relative to
      context arrival and verify the current elapsed-time, pause/reset and
      navigation reset rules. Record the target-time display before and after
      difficulty and settings arrive.
- [ ] Throttle and then fail remote metadata in the disposable profile; repeat
      on known and new problems. Record page identity, timer availability,
      saved context, loading/error treatment and recovery; a failed metadata
      request may prevent current Phase 1 startup from reaching usable context.
      Repeat with a slow or failed local read where reproducible, and record
      whether empty history or review controls appear before valid context.
- [ ] Navigate between known and new problems while metadata or local context
      is pending. Check for an old result replacing the active session, timer
      reset, wrong-slug context and duplicate attempts; record any failure.
- [ ] Once valid saved context loads, save a review and wait for durable Saved
      acknowledgement; reload and verify one attempt and correct timer, rating,
      FSRS and track effects. Update its rating and verify no extra attempt.
      Induce a recoverable Save failure in the disposable profile and use Retry;
      confirm the accepted command stays locked, success is not shown early,
      and Retry preserves one durable attempt. Repeat a valid review while
      preview or next-step data is unavailable.
- [ ] In an authenticated, disposable LeetCode profile, capture a real code
      Submit click and Command/Ctrl+Enter path with the extension enabled.
      Repeat comparable submissions with the extension disabled and compare
      click-to-LeetCode response and renderer work. Verify CogniPace captures
      the matching submission and does not change LeetCode's submission result.
      This comparison was unavailable in the automated unauthenticated run;
      no code was submitted there.
- [ ] On the user's affected installed profile, reproduce or rule out the
      reported approximately 30-second delay with a redacted Performance trace.
      Record extensions and profile conditions relevant to the delay without
      sharing personal data. The disposable fixture did not reproduce it.
- [ ] Attach redacted screenshots or a screen recording of the installed
      extension happy path and edge cases, with exact flows, version, date and
      result, before PR review or merge.

#### Future progressive-startup acceptance (Phases 2 and 3)

These are acceptance checks for later behavior-changing phases, **not Phase 1
PR gates**. Their separate plans must specify implementation and proof. Repeat
warm/cold known and new opens and require manual timer access without waiting
for metadata, upsert or local context; automatic start only after verified
settings, without backdating; and a pending target label while timing inputs
are unknown. With slow/failed metadata, known saved context must remain usable
and a new problem must retain identity and manual timer access. With slow/failed
local context, keep the timer usable and show pending/error review context,
never a false empty history. Check retryable new-problem upsert failure,
slug/epoch supersession, independent preview/next-step failure, and exact
Save/Update/Retry durability. Human installed-extension smoke and visual proof
will be required for those phases when implemented.

### Phase G Local Scaling Smoke

Human installed-extension happy-path and edge-case proof, with redacted
screenshots or a recording, remains **pending**. Use only a disposable Chrome
profile and synthetic history. Never import a scaling fixture into a personal
profile. Build `dist/chrome-mv3`, then run the disposable packaged driver with
`rtk proxy node scripts/fsrs-scaling-chrome.mjs --backup
test-results/fsrs-phase-g/standard-backup.json --dataset standard`. Generate the
backup first with `rtk proxy env COGNIPACE_SCALING=standard npm run test --
src/testing/fsrs-scaling-benchmark.test.ts`; repeat for `stress` and
`single-card` only when the previous workload leaves the last durable state
intact. The driver creates and removes a unique `/private/tmp` profile and
writes sanitized samples under `docs/superpowers/evidence/`. A failed or
unmeasured operation stays pending. Its automated results are separate from
the human proof below.

1. With sync and live AI disabled, restore the synthetic v6 backup through
   Data Management. Verify the fixture problem slugs, full attempt/log history,
   profiles, corrected evidence, suspension, track progress and Settings. Export
   and reopen the same profile; compare counts and representative original
   review times, raw due dates, logs and earned credit.
2. Review an eligible fixture card, wait for Saved, then reload and verify one
   new attempt and durable card/track effects. Update its latest rating twice;
   verify the same event time, one attempt, incrementing revision and original
   scheduling context. Retry the same accepted command after a delayed response
   and verify its original acknowledgement and no duplicate effect.
3. Compare Queue, recent Practice details and Analytics 30/90/All with the
   exported full history, including pre-window reviews, first/repeat cohorts,
   tied timestamps, suspended and premium-filtered cards. On a real LeetCode
   problem page, request Submit and Update previews while a Save is pending in
   another surface. Confirm the shared database gate serializes work, the
   preview stays read-only, and either a current result or a stale-context
   conflict appears without changing the draft.
4. On the hidden dashboard `/dev/smoke` route, opt into **Measure storage and
   read timings**. Record the displayed total, quota/headroom, active snapshot and
   recovery-copy byte counts with Chrome version and loaded build. Keep live
   GenAI unchecked. Check the read-operation samples separately from the
   sequential health checks. If Chrome omits quota or a workload fails, record
   the API result and last durable snapshot; do not infer a supported capacity.
5. Use the disposable-profile failure harness below to reject local snapshot
   publication after a review or restore. Confirm `persistence-pending`, no
   false Saved acknowledgement, unchanged active and recovery bytes, and
   successful same-command Retry while the worker still retains it. Restart
   before publication and verify the last durable snapshot; repeat after a
   successful publication and verify the new state. Record the existing
   sync-metadata best-effort limitation separately.

Attach redacted screen proof for the human flows before PR review or merge.
The predecessor Phase F human preview proof remains a separate pending gate.

### FSRS Evidence And Recoverable Replacement

Run these human happy-path and edge-case flows in a disposable installed
extension profile. Export a pre-C backup before updating. Attach screenshots or
a recording, with private history and recovery contents redacted, before PR
review or merge. Automated tests do not replace this proof.

1. Update to `dist/chrome-mv3` with populated history, opaque card IDs,
   suspension, an active track/session and 75% retention. Compare history, raw due dates,
   Daily Goal/streak progress, track credit and Settings before/after reload.
   Save a genuine new review, correct an unknown event with Update, and reload.
   Verify the same event time and one revision change, with no extra review.
2. Restore a supported old backup, export v6 and restore that v6 file. Compare
   all existing cards/logs/settings and earned progress; active local/problem
   tokens must be fresh after each intentional restore. Verify an untouched
   suspended problem and a valid New card with zero memory/null last review.
3. Import valid v6 evidence with opaque IDs, recorded profiles and historical
   correction receipts. A Good revision-1 acknowledgement must survive a
   current Again revision-2 event. Verify subsequent Save reuses the card ID;
   captured/legacy-derived Update uses original context and preserves identity,
   time and count. Ambiguous unknown history explains why Update is unavailable;
   a genuine new Save establishes captured context. An occupied prospective card
   ID must leave its sibling unchanged.
4. Try malformed logs, profiles, evidence ownership/sequences, generations and
   historical acknowledgements. Validation must reject before replacement;
   existing rows and generation tokens stay unchanged.
5. In a test-only fault harness, fail snapshot publication after commit. Verify
   pending text, no saved toast, disabled fresh file/restore/reset/export actions,
   closed confirmation with retained draft, and an accessible Retry saving.
   Reload Settings while the worker lives; status must not flush. Retry and
   reload the persisted data without an extra restore or review. The runtime
   and repository regressions additionally prove one replacement/rotation.
6. Fail sync bookkeeping after a durable replacement. Text must say data is
   already saved. Retry only metadata: no second Gist fetch, restore, flush,
   rotation or data invalidation. Test failed error/status reads in the same
   outage; the recovery message must remain useful and contain no secrets.
   With Settings already mounted, trigger an automatic Gist pull failure and
   verify Retry saving appears without remount/focus. After retry succeeds,
   both the recovery panel and stale Sync retry-needed message must clear.
7. Verify automatic/unconfirmed dirty Gist pull blocks and explicitly confirmed
   manual overwrite succeeds. A pending replacement must block queued local
   writes, content imports/retries, export and automatic/manual sync.
8. Fail the local pre-commit dirty marker: restore/reset must not commit or
   rotate. Reject malformed input before marking. Rollback after successful
   marking preserves the old database and may conservatively leave dirty status.
   Restart after durable data with failed final bookkeeping; automatic pull must
   still block on the persisted dirty marker.
9. Restart before publication and verify the last durable snapshot reopens.
   Worker-local recovery callbacks are lost on restart; do not claim lifecycle
   replacement deduplication. After publication, replacement data must survive.
10. Fail content-import publication, then intentionally replace local data.
    The old import Retry saving must request a new preview rather than report
    erased content saved. A rejected replacement retains genuine import retry.

Use the following temporary DevTools harness for installed-extension failure
proof, alongside the coordinator/runtime/SQLite regressions. No production
failure switch is added.

#### Disposable-profile failure harness

Build with `npm run build`, load `dist/chrome-mv3` unpacked into a disposable
Chrome profile and open Settings > Data Management once so startup completes.
Export its initial backup. For local restore/reset cases, disable automatic sync
before arming a fault. In `chrome://extensions`, click CogniPace's service-worker
Inspect link and paste this into that worker's Console, not the dashboard's
Console. Keep it open during retry tests: [Chrome documents that inspection
keeps the worker active](https://developer.chrome.com/docs/extensions/get-started/tutorial/service-worker-events).

This replaces only that worker's storage methods until cleanup/restart. It
never reads or prints tokens, backups or raw database bytes. The key names
match `snapshot.ts` and `sync-metadata-store.ts`; ordinary storage calls still
reach Chrome's [Promise-based storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).

```js
;(() => {
  if (globalThis.cpBackupSmoke) throw new Error('Harness already installed')
  const local = chrome.storage.local
  const originalSet = local.set
  const originalGet = local.get
  const snapshotKey = 'cognipace_db_snapshot_v1'
  const syncKey = 'cognipace_sync_metadata_v1'
  const state = {
    failSnapshots: false,
    failSyncFrom: Infinity,
    failSyncReads: false,
    snapshotAttempts: 0,
    savedSnapshots: 0,
    syncAttempts: 0,
    savedSyncWrites: 0,
  }
  const set = async (values) => {
    const snapshot = Object.hasOwn(values, snapshotKey)
    const sync = Object.hasOwn(values, syncKey)
    if (snapshot) state.snapshotAttempts += 1
    if (sync) state.syncAttempts += 1
    if (snapshot && state.failSnapshots)
      throw new Error('Smoke snapshot failure')
    if (sync && state.syncAttempts >= state.failSyncFrom)
      throw new Error('Smoke sync metadata failure')
    const result = await originalSet.call(local, values)
    if (snapshot) state.savedSnapshots += 1
    if (sync) state.savedSyncWrites += 1
    return result
  }
  const get = async (keys) => {
    if (state.failSyncReads && keys === syncKey)
      throw new Error('Smoke sync metadata read failure')
    return originalGet.call(local, keys)
  }
  local.set = set
  local.get = get
  if (local.set !== set || local.get !== get) {
    local.set = originalSet
    local.get = originalGet
    throw new Error('Storage shim unavailable; do not claim fault proof')
  }
  globalThis.cpBackupSmoke = {
    state,
    clearFaults() {
      state.failSnapshots = false
      state.failSyncFrom = Infinity
      state.failSyncReads = false
    },
    cleanup() {
      local.set = originalSet
      local.get = originalGet
      delete globalThis.cpBackupSmoke
    },
  }
})()
```

Run one fault at a time, then clear it and finish Retry saving before starting
the next case. Inspect only `cpBackupSmoke.state` counters. An unhandled
`Smoke snapshot failure` from the existing automatic publication timer is
expected while snapshot writes are blocked; it must contain no study contents.

- **Publication failure:** set `cpBackupSmoke.state.failSnapshots = true`, then
  intentionally restore the exported backup or clear local data. Verify pending
  recovery and disabled replacement/export actions. Reload only the dashboard;
  `savedSnapshots` must stay unchanged. Run `cpBackupSmoke.clearFaults()`, click
  Retry saving and confirm durable data after reload.
- **Pre-commit marker failure:** set
  `cpBackupSmoke.state.failSyncFrom = cpBackupSmoke.state.syncAttempts + 1`, then
  restore/reset. It must report failure before replacing data and show no pending
  replacement. Clear faults; export and compare the original history/due dates.
- **Post-publication local metadata failure:** with automatic sync disabled, set
  `cpBackupSmoke.state.failSyncFrom = cpBackupSmoke.state.syncAttempts + 2`, then
  restore/reset. The first dirty marker succeeds, publication succeeds and the
  second sync write fails. Verify the data-saved/sync-status-pending text. Record
  `savedSnapshots`, clear faults and Retry saving; the count must not increase.
- **Gist metadata failure:** use an already configured disposable test Gist and
  an intentional manual pull. Arm `failSyncFrom` at `syncAttempts + 1` before
  confirming the pull. Verify durable data with metadata pending. Clear faults
  and retry; `savedSnapshots` must not increase and the Network panel must show
  no second Gist request. Use the same case with publication failure, then enable
  `failSyncReads` only after the pending result exists, to check status-read failure
  does not hide Retry saving. Automated tests cover failure on the initial result
  construction as well.
- **Worker restart:** arm publication failure and restore. Use the extension's
  Reload button in `chrome://extensions` without clearing storage; then reopen
  Settings and inspect the new worker. The shim and pending callbacks must be
  gone, and the last durable dataset must reopen. Repeat after the local
  post-publication failure: restored data and the persisted dirty marker must
  survive. With the configured test Gist, an unconfirmed/automatic pull must
  still block until an intentional overwrite is confirmed.
- **Obsolete import acknowledgement:** arm publication failure, import disposable
  content and observe its pending acknowledgement. Clear faults, intentionally
  restore/reset, then use the old content-import Retry saving. It must request a
  fresh preview. Transaction rollback and metadata-only callback counts remain
  covered by automated regressions; do not claim these were induced in Chrome.

After every run, call `cpBackupSmoke.cleanup()` if the harness still exists,
reload the extension and verify a normal export/save. Do not leave the shim in
a regular profile or attach private Console/storage output. Capture the visible
pending, disabled-action, retry and completed states with screenshots/recording.
This recipe is prepared for the human engineer; no installed-Chrome execution
is claimed by the agent.

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
     /legacy(?:Topic|Track|Fsrs)MigrationFingerprint = '([a-f0-9]{8})'/g,
   ), (match) => match[1])
   if (legacy.length !== 3) throw new Error("Could not read all three allowlisted fingerprints")
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
4. Choose Save & make active. Confirm it saves the provider/model/key, updates
   Active provider, makes no provider request, and leaves AI assessment disabled.
   Choose the separate Test connection button and confirm success for an
   accessible model without settings or key writes.
5. Leave Settings and reopen it. Confirm Gemini and the exact custom model
   remain selected, the key input is empty, and the saved-key status is present.
6. Choose Test connection without re-entering the key. Enable AI assessment and
   exercise automatic LeetCode code analysis with a completed submission.
   Follow the installed-extension analysis checklist below.
7. Change an unrelated preference and save it while AI edits are unfinished.
   Confirm those edits remain available and are not persisted by Save Settings.
8. Repeat connection testing with OpenAI and Anthropic if you have their keys;
   confirm each provider uses its own saved key and editable model.
9. With two provider keys saved, select the inactive provider. Confirm Active
   provider still names the saved connection and Test connection is disabled.
   Choose Make active and confirm the summary updates without replacing either
   key or testing. Test connection separately. Reopen Settings and confirm the
   active provider/model persist and unchanged Save & make active is disabled.

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
- Enter a key and press Enter. Confirm saving/activation runs once without
  testing or submitting unrelated preferences. Click Test connection and confirm
  one request with no settings/key writes. While saving/testing, confirm
  conflicting saves, provider/model edits, and Reset Defaults cannot run.
- Remove the selected key, then turn AI assessment off. Confirm turning it off
  succeeds without credentials. Reset Defaults and confirm assessment is off,
  the model is blank, and the remaining saved provider keys are preserved.
- Export a backup and inspect status/query/mutation data with test credentials.
  Confirm keys are absent from exports, sync payloads, logs, public runtime
  results, and TanStack Query caches, including mutation variables.

Attach human-run happy-path and edge-case screenshots or a recording before PR
review or merge. Automated provider-wire tests and component fixtures do not
prove live credential access or installed service-worker behavior.

Expected: provider keys stay in trusted local extension secret storage. Test
connection uses the same reusable provider integration as assessment. Saving or
activating makes no provider request; settings and credentials persist
independently of provider availability, and stale results
cannot validate a replacement key or model.

#### OpenRouter connection and analysis smoke

1. Select OpenRouter with AI assessment off. Confirm editable `openrouter/free`,
   masked empty key input, free-routing/usage copy, and key/data-policy links.
   Enter your own key, Save & make active, then Test connection, and confirm
   assessment remains off.
2. Enter an accessible custom text-model ID and Save & make active. Reopen
   Settings: confirm the exact custom model, selected OpenRouter, saved-key presence,
   empty masked input, and untested status. Test the saved connection.
3. Click Use free models. Confirm draft `openrouter/free`, cleared verification,
   and no automatic network request or save. Discard and confirm the saved
   custom model returns. Choose the preset again, explicitly Save & make active,
   then Test connection.
4. Leave unfinished connection model/key edits while saving an unrelated
   preference. Confirm only the preference persisted and draft edits survived.
   During preference save, key save, and connection test, confirm the preset and
   conflicting controls are disabled. Verify keyboard/Enter submission order.
5. Enable assessment, refresh a supported LeetCode problem page, and complete an
   authored submission. Confirm a full Approach/Efficiency/Code Style report;
   record requested/served model when available and response time. Confirm report
   arrival does not save a review. Save the manual review independently.
6. Try invalid key and invalid model. Confirm safe actionable errors. Exercise
   unavailable free capacity or quota when available; distinguish 402 balance/key
   limit guidance from 429 quota guidance. Account privacy/capability restrictions
   may make a model unavailable; do not loosen privacy settings automatically.
   Confirm no automatic retries or app-configured paid fallback requests.
7. Remove the OpenRouter key. Confirm unavailable analysis and that other saved
   provider keys remain. Assessment can be disabled after removal. Reset Defaults
   keeps saved keys, disables assessment, and restores the blank default model.
8. Interrupt an in-flight test/analysis, navigate, change model/provider, replace
   the key (including identical bytes), and remove the key. Confirm late replies
   cannot restore stale connected/report state and timers clean up. Run the
   existing fresh-identity Retry, reload, refresh-capture, cancellation, and
   stale-worker flows from the code-analysis smoke instructions.
9. Verify popup/dashboard/overlay configuration availability updates across
   surfaces and direct-provider connection behavior still works. Inspect a backup
   and runtime status for presence only, with no OpenRouter key or raw provider
   response. Attach screenshots/recording with date, build, and observed outcomes.

Human installed-extension OpenRouter happy-path and edge-case proof is pending;
attach dated screenshots or recording before PR review or merge. Component
fixtures and native wire tests supplement this proof.

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
   Confirm it declares schema version 6 and typed relations have source,
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
8. Export a v6 backup with an enabled track; restore into a disposable profile
   and confirm the flag and raw history survive. Restore v1-v4 fixtures and
   confirm flags default false. Re-import content v1 and confirm an existing
   enabled flag stays enabled while new imported tracks default off. Run the
   existing authorized sync smoke with v6 data if testing configured sync.

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
eligible samples to show the historical views and supported Memory
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
2. In both datasets, choose 30, 90, and All time; confirm 30 is the default
   and legacy `range=14` resolves to 30. Young twelve-date history remains
   selected as 30 and displays its available dates; old sparse history keeps
   real inactivity. All time uses explicit calendar grouping with at most sixty
   intervals and conserves every eligible record in totals. Finite comparisons
   retain complete nominal prior bounds and matched local wall-clock cutoff;
   All time has no comparison. Recall starts at its first eligible selected
   pair through the same as-of; long paired history remains long and regrouping
   cannot improve global selected-history readiness. Backlog stays Last 30 days/
   daily and Upcoming stays Next 14 days under every selection. Available charts
   remain visible with neutral guidance; a shorter-ready link changes selection
   only when activated.
3. Check the report timezone/as-of, actual displayed dates, sparse calendar
   ticks, and full intervals in inspection. Marks use actual midpoints,
   including clipped edges and partial as-of intervals; future observations
   remain excluded. Dates use MM/DD in the as-of year and /YY otherwise;
   cross-year tooltip intervals show both years.
   Performance retains the global available-history domain with leading
   unavailable rows and trailing cumulative holds. Recall uses its labelled
   paired frame, preserving raw interval and cumulative counts independently.
   Raw outcomes/time, Memory, and Practice trim only unsupported outer rows and
   keep internal gaps. Memory support is a finite median including zero/subday;
   Practice support is positive completed reviews, positive valid counts in
   either source, or finite success including zero. Raw outcome/time windows
   use their local cohort's known-difficulty raw activity, including invalid
   ratings/unavailable time. Selection, totals, readiness, serialized fits, and
   report time remain unchanged by presentation.
4. In each chart, move the pointer across the plot and tap near its left,
   middle, and right buckets. The nearest retained original bucket must be
   inspected, including an internal empty bucket. Confirm no permanent bottom
   detail row is added and the tooltip remains hidden before interaction.
5. Tab to each chart's native inspector. Check visible focus, Left/Right,
   Home/End, Enter/Space, Escape and blur. Pointer/tap/keyboard expose the same
   original row; a quiet guide cannot create an unknown observation.
   In Performance Breakdown, verify Ratings / Difficulty / Mix / Intervals and
   Pooled outcomes / Difficulty outcomes / Goals / Method. Original simultaneous
   pooled Hard + Good + Easy and Good + Easy curves include Unknown; unequal
   difficulty sample sizes reconcile using summed counts. Raw rate controls,
   goals, exclusions, timing/assessment Mix and every field remain reachable.
   Toggle raw curves/difficulties: visible inspection changes, fits/dates stay.
   Saving a raw goal updates its references while the weighted /100 score remains
   unchanged. Performance's cohort/control changes never alter Time's cohort.
6. Inspect first/last updates and extremes near axis bounds. Circle/diamond
   markers and low whiskers must remain visible with clearance. Raw outcome/
   time, Memory and Practice bridges connect measured neighbors without a
   fabricated unknown value. Cumulative Performance/Recall instead show flat
   no-new-evidence holds through as-of, retaining actual last update and
   cumulative n. New evidence moves only within its supported interval toward
   its actual midpoint; curves remain bounded. A single real update plus holds
   still says Not enough data for a trend yet.
7. In Recall, confirm repeat-only copy, solid observed circles, short-dashed
   FSRS diamonds, longer horizontal held dashes, and the saved Target Recall.
   Valid Again pairs remain failed outcomes in the denominator; Hard/Good/Easy
   alone count as recalled. Check initial-only empty history, pre-range replay,
   and genuine zero estimates. Its cumulative observed and FSRS values use the
   exact same pairs and their latest values equal selected-period totals.
   Inspect raw interval counts/rates separately from cumulative counts/rates,
   full-precision signed difference, provenance, evidence and last update.
   Verify the labelled first-pair-to-as-of frame/grouping; short paired history
   and genuinely old paired history retain their own actual dates without
   changing global readiness. With multiple intervals the first true midpoint
   has 12px left clearance and the domain ends at as-of. A singleton retains
   its original interval domain/centered marker; full interval details remain.
   Memory and Practice keep interval-boundary domains/padding.
8. Toggle each Recall series with pointer/keyboard, then hide both. Curve,
   marks and inspection rate hide together, and signed difference appears only
   with both visible. Shared interval/cumulative samples and saved target remain;
   accessible copy follows visibility. Domains, dates, paired frame and fit
   including both cumulative series plus the 0%/100% goal do not shift. Measured
   zero remains supported, and holds show zero new pairs with unchanged
   cumulative n and last updated interval.
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
11. Confirm the fixed Practice card combines exact supplied shares
    in bottom-to-top Easy, Good, Hard, Again order with a thin, straight neutral
    completed-review line and measured markers. The left axis is fixed at
    0–100% and labeled Rating share (%); the supplied independent right axis is
    labeled Reviews. The Good + Easy upper boundary expresses Review Success,
    with no separate success curve. The saved Target Review Success reference
    uses the left percentage axis; its compact goal stays reachable in fitting
    Goals, empty, sparse, Chart, and exact-value states. Test goals at 0% and 100% and confirm
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
    remain fixed. Confirm distinct practice/rating readiness guidance, the
    selected-period Hard + Again summary and evidence-gated comparison in
    Details, plus the wholly unsupported-period empty state, remain truthful.
14. Visit Chart and every fitting exact-value section/field group, including
    final pages. Preserve all original rows/fields, interval/partial/grouping/
    timezone/as-of/evidence context, measured zero and unavailable states.
    Native Previous/Next boundaries and live ranges match the current page.
    Range/report/width changes reset or clamp pages even while Details is hidden;
    equivalent rerenders keep the page. Overview restores local filters, series,
    selection and trigger focus. Practice retains every count/share when Reviews
    is hidden; all goals remain reachable. Change range during inspection and
    confirm selection resets/clamps without stale values.
15. Repeat ready/sparse paths at wide desktop, actual content widths 736px
    and 735px, and 320px in both themes and at 200% zoom. Verify four equal
    148px headlines reflow four/two/one and the exact ten-card reading order:
    Performance / Time vs target, Practice / Topic performance, Recall / Memory
    strength, Retention map / Memory signals, Overdue backlog / Upcoming reviews.
    The 736px boundary gives two 360px cards plus 16px gap at 464px height;
    735px stacks at 512px. Every Overview/Details/goals/selection/Table/loading/
    empty/sparse/error state retains that height. Fonts must be loaded before
    measuring. Check long names, all-hidden series, control/tap/focus reachability,
    plot growth and every final field page without clipping, smaller text,
    internal vertical scrolling or horizontal document overflow.
16. Reload the built extension again and reopen Analytics. Confirm the local
    data and expected values remain available, and repeat a range change and
    keyboard inspection through the extension runtime.
17. In Last 30 days/daily Overdue backlog, test 4/5/6, both crossing
    directions, flat five, singleton zero, and unknown days. Lines and markers
    are green strictly below five and amber at/above five; split exact crossings
    without another observation. Unknown days break runs. Straight connectors,
    zero/isolated dots, unclipped boundaries and exact threshold/day/count
    context agree for pointer/tap/native keyboard arrows/Home/End/Escape.
    Reconcile known/unknown days, known-only peak, and below-five plus
    at-or-above-five totals to known days. An unknown last day keeps the current
    headline unavailable without carrying an earlier observation.
    Reconstructed history must not be invented.
18. Confirm Upcoming Review Load still shows its fixed next 14 calendar days,
    including when the selected historical range is unready. Check separate Due
    and Overdue counts inside sufficiently large segments, tiny outside labels,
    overdue-only Today, neighboring label collisions, and zero schedules. Inspect
    and Table must retain exact counts, dates and current as-of/timezone/fallback
    context. Today plus thirteen local dates is a schedule snapshot without
    future review/rescheduling simulation. Due earlier today remains Due; only
    Today includes overdue cards from prior local dates. A historical selection
    change alone preserves pages when current report context is equivalent.
19. In Retention Map, use more than 30 eligible reviewed questions, including
    exact overlaps, boundary recall values, sub-day durability and long titles.
    Include 31 eligible questions and, where available, 150; record the exact
    larger-cohort smoke case as pending if it cannot be exercised locally.
    Confirm every eligible question remains in Chart/Table and the full status
    counts agree. All/Below target keeps the same fitted landscape; include an
    empty Below target result. Hover/tap and the native keyboard inspector must
    agree, nearby-memory choices must include every overlapping question, and
    Home/End/arrows must reach the final question. Pin details in the fixed
    card's fitting selection surface, check all eleven supplied problem fields,
    dates/rank and canonical LeetCode links; Problems retains the supplied Region
    in addition to the eleven original table fields. Then close,
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
20. In Memory signals, visit every fitting linked page and final row.
    Previous/Next and live range update correctly; canonical links open LeetCode
    problems in new tabs. Keep every typed reason/flag, severity order and long
    titles without clipping. Changed current as-of/timezone/fallback or returned
    row identities while a later page is hidden must reset; width changes reflow/
    clamp pages. Historical selection alone preserves an equivalent current
    report's page. Scope must retain current report context without presenting
    the historical selection as its population. Reconcile returned-top-25 versus qualifying-total
    counts; no flagged problems is a measured empty result.
21. In Topic performance, include more than five qualifying topics,
    overlapping direct assignments, Unknown, long names, and low-evidence topics.
    Qualifying requires at least ten valid ratings across three distinct
    valid-reviewed problems. All /100 rows/full names remain reachable in
    bounded pages with unrounded score-ascending/count-descending/name ordering.
    The sixteen cells reconcile valid n, Good/Easy numerator and original raw
    Review Success. The alphabetical first five returned low-evidence topics
    and exact additional count stay separate; omitted qualifying topics is zero. Weighted
    scores have no percentage goal; raw rate/unrounded goal status/editor remain
    in Ratings. Editing that goal from Topic or Practice updates its raw
    references without changing scores. Verify every page and native access at
    320px without document overflow.
    Expected: Analytics loads through the extension runtime without the failed-load
    state, reflects only local practice data, and tells a truthful chart story
    without filling missing evidence.

#### Compact Analytics headlines, continuity and query states

For this redesign, the user's latest validation scope prioritizes full-size
desktop and avoids expanding exhaustive narrow-screen/accessibility matrices.
Preserve the existing behavior and completed evidence; focus remaining signoff
on desktop data, query/action states, and required automated gates. The broader
responsive checklist below remains reference coverage, rather than extra
agent verification required for this iteration.

All cases remain unchecked until the human runs them in the rebuilt installed
extension. Record the induced method for loading/failure/race cases; anything
uninduced remains pending. Production-component fixture proof stays separate.

- [ ] **Selected headlines:** include first/repeat assessments, true with Again,
      false with Easy, null with Good, invalid ratings, duplicates, repeated
      successes, local midnight/overnight dates, future/invalid dates, and
      all-known-failure/empty/all-unknown histories. Reconcile distinct assessment
      dates, unique correct questions, true/(true+false), exact positive successful
      seconds and timed/total successful coverage in 30/90/All. Include missing/
      zero/negative/nonfinite durations and a positive 35-second duration; it
      must not appear as measured zero. No finite headline uses all-time totals.
- [ ] **Weighted reconciliation:** verify 0/50/80/100 points and 1/2/3/Unknown 1
      influence, all Good 80, Again zero, invalid-only unavailable, and unequal
      samples. Actual valid n stays distinct from weighted units. Hero/trend/
      breakdown agree after first/follow-up switches; weighted delta uses
      unrounded score points while raw deltas use percentage points. Check
      n=9/n=10 prior gates, nominal windows, matched cutoff and no All delta.
- [ ] **Cumulative pairs and holds:** reconcile final Performance and Recall
      values to whole-period totals; raw interval counts never accompany a
      cumulative rate as its denominator. Include leading unavailable, internal/
      trailing inactivity, genuine zero estimates, equal updates and one-update
      history. Again pairs remain failures, initial replay never emits, and
      pre-range replay supplies the same pairs. Holds have zero new evidence,
      unchanged cumulative n/last update, long horizontal dashes through as-of,
      no extra markers/readiness and no movement in unsupported intervals.
- [ ] **State and geometry:** induce initial pending/error and Retry, incompatible
      range/timezone changes, same-key Updating and failed refresh. Four headlines/
      ten cards retain fixed shells. Old-range values clear immediately; failed
      refresh preserves the exact old snapshot/as-of with persistent failure and
      Retry. Check one polite announcement, neutral evidence/coverage slots,
      full distinct Practice/rating reasons in Details, no shortened-history
      warning, and genuine zero/no flags versus unavailable evidence.
- [ ] **Details and persistent goals:** visit all original field groups, method/
      evidence pages and final rows at desktop/320px/200% zoom in both themes.
      Long labels, all-hidden series, Table/Goals/Selection and pending/error
      states fit without clipping, smaller text or internal vertical scrolling.
      Returning restores local filters/series/selection/focus; hidden-table
      report/width/range changes reflow/clamp. Goal drafts/errors survive
      Overview/Details, counterpart changes and pending completions, using one
      atomic edited-key save; retain all four raw goals and backup/configured
      sync behavior.
- [ ] **Independent scope and retained actions:** Time below/at/above target,
      uncapped overtime, Unknown coverage/no target, all/successful subsets,
      one-observation median/four-observation quartiles and legacy units/Trend/
      Compare remain available independently of Performance. Topics retain
      all qualifying and returned low-evidence rows, the exact additional count,
      and sixteen cells; Signals keeps all
      returned flags versus qualifying total. Backlog's strict five boundary
      and Last 30 days, Upcoming's exact Next 14 dates, and every Retention
      gesture/overlap/eleven-field/link/focus action survive fixed composition.

#### Performance, Time vs target and cumulative Recall

Human happy-path and edge-case smoke is pending. Run these unchecked cases in
Chrome's rebuilt installed extension with disposable retained history and attach
screenshots or recording proof before PR review or merge. Agent automated and
production-component checks are separate evidence; record any uninduced case as
pending rather than passed.

- [ ] **Opening state and placement:** Performance defaults to First attempts
      and Time has an independent New problems/all-timed cohort. Performance
      Breakdown retains Ratings/Difficulty/Mix/Intervals plus Pooled outcomes,
      Difficulty outcomes, Goals and Method; Time Details retains Trend/Compare/
      Intervals/Settings/Method. Advanced defaults remain Trend, all known
      difficulties, Hard + Good + Easy, current-target percentage and assessment
      share. Summary details preserve assessment days, recorded assessments/
      distinct problems, Good + Easy/valid and invalid exclusions.
- [ ] **Raw cohorts and Recall:** record Again then Good on one problem; New
      problems retains Again and Follow-up practice includes Good. Include an
      invalid first followed by valid Good, different cards/modes, shuffled
      history, tied timestamps/lexical IDs, a pre-period first, and a post-as-of
      record. Earliest selection happens before other filters; invalid firsts
      never promote later records and future records are excluded. With
      initial-only history, New outcomes can be available while Recall is empty.
      A recent valid repeat after a pre-range initial supplies Recall's same
      observed/FSRS pair and prior replayed state; genuine zero estimates remain
      measured. Raw later-record outcomes are independent of that paired cohort.
- [ ] **Outcome denominators and prior evidence:** within a difficulty use Again,
      Hard, and Good: success is 2/3 and Good + Easy is 1/3 over the same valid n.
      Check all-Again zero versus invalid-only unavailable, summed period
      numerators/denominators, and exact current/prior counts against the immediately preceding
      equivalent local-calendar period. Either difficulty n below ten says
      Sparse comparison, including n=9; n=10 on both sides permits a directional
      change. Unknown stays separate in Mix and leaves the three outcome/time
      series. Numeric FSRS difficulty is never Easy/Medium/Hard.
- [ ] **Recorded timing:** include positive saved seconds on Again and an invalid
      rating; both enter all-timed observations and Mix time, but successful
      timing includes only valid Hard/Good/Easy. Null, zero, negative, and
      nonfinite durations remain unavailable; verify timed/eligible counts.
      Check one to three timed records retain medians without quartiles and four
      enable quartiles. Isolate one difficulty for Trend whiskers; Compare
      retains full-period median/quartile values. Toggle minutes/percent and
      verify current saved difficulty allowances, 100% reference, and overtime
      above 100%. Pause excludes time, running idle may count, and Strict Timing
      can record Again for an accepted overtime solution. Caveats must not call
      these values cumulative solving time or historical policy compliance.
- [ ] **Independent controls and Mix:** verify mint Easy circles, blue Medium
      diamonds and amber Hard triangles in raw outcome/time details. Performance
      and Time cohort/difficulty switches do not cross-filter each other. Hide/reveal each
      difficulty without resetting the selected outcome or changing domains or
      dates. Hidden series leave inspection; all-hidden shows Select a
      difficulty while Mix still counts the full cohort. Switch raw populations,
      Trend/Compare, timing subset/units, and Mix assessment/time share. Check
      Unknown and invalid-rating records reconcile to raw counts/positive-time
      sums; unavailable time is not zero and one problem may supply several
      Follow-up assessments.
- [ ] **Saved references:** only the chosen outcome's goal/editor is shown. New
      Success/Good + Easy use independent first-attempt goals; Follow-up uses
      Recall/Review Success aspirations with its different population explained.
      Exercise 0%, 29%, 100%, equal goals, invalid drafts, Enter/Escape and focus
      return, failure/retry, other-tab refresh, reload, Settings Save/Reset and
      existing backup/configured sync paths. The existing Recall/Review Success
      pair constraint still applies; first-attempt goals remain independent.
      Changes preserve measured values, timing distributions, FSRS settings/due
      dates, and Recall pairing. Current time allowances update their references
      without changing recorded seconds or claiming historical compliance.
- [ ] **Exact tables and access:** compare Trend/Compare Table values with selected
      measure, units/subset, raw/valid/excluded counts, prior n, timing coverage,
      medians/quartiles, complete intervals and timezone/as-of. Check every fitting
      page/field group, links, visible focus, Left/Right/Home/End, Escape, hover and
      touch pinning. Inspection reports only visible series and measured values;
      no hidden or unavailable interval gets a fabricated observation.
- [ ] **Gaps, boundaries and proof:** at 30/90/All time test empty, Unknown-only,
      no-time, first-only/follow-up-only, sparse zero, singleton, internal gaps,
      partial edges and cross-year intervals. Raw outcome/time Trend retains each
      local cohort's activity window despite difficulty/measure/timing switches;
      long-dash bridges create no values. Verify appropriate empty states and
      marker/whisker clearance. Check wide and 320px layouts in light/dark themes,
      including all-hidden, saved-goal editors, tables and tooltip placement,
      without overflow or clipping. Attach happy-path and edge-case proof and
      list each unexercised condition as pending.

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
- [ ] **Save and cancel:** open Target Recall from Overview/Details Goals,
      confirm its input receives focus,
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
      Both counterpart buttons remain reachable in the same Recall Goals surface;
      change the counterpart explicitly rather than silently adjusting it.
      Equality, 0%, and 100% are valid when the pair satisfies the rule. Raise
      Success before raising Recall beyond it; lower Recall before lowering
      Success below it. With a draft open, change the counterpart from another
      tab; the input draft stays while its hint and validation refresh. Save
      must preserve the latest other goal, or reject an invalid merged pair.
- [ ] **Pending and failure:** use a controlled delayed and rejected
      `settings.updateSettings` mutation in a disposable local test build and
      record how it was induced. Confirm Saving and duplicate-submit prevention.
      A rejected save must keep prior captions/references and the open draft
      with an associated persistent field error. Move Overview/Details and back;
      the same draft/error survives. Retry succeeds and Cancel still discards it.
      Complete an earlier pending save after selecting another goal; it must
      not close that active draft or steal focus.
      If either condition cannot be induced, record that exact case as pending.
- [ ] **Boundary references:** save 0%/0%, 0%/100%, and 100%/100%. Inspect both
      named dashed references and accessible descriptions at 0% and 100%; each
      percentage scale must contain its goal with usable boundary clearance.
      Practice's goal uses the fixed left rating-share axis and leaves rating
      geometry and its supplied right review-count scale unchanged. Measured rates, counts, rows, dates,
      internal gaps, and trimming must match the pre-edit data.
- [ ] **Range and presentation:** retain a non-default pair while changing
      30/90/All time ranges, including switching to an uncached range while a save
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
   Complexity, Space Complexity, Languages, and Notes editing controls are absent.
   The reserved Notes tab contains only a placeholder.
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

#### Focused overlay tabs

Status: **HUMAN INSTALLED-EXTENSION SMOKE PENDING** until the human engineer
attaches proof. Automated and production-component fixture evidence is recorded
in [the Phase 1 handoff](superpowers/handoffs/2026-10-04-overlay-focused-tabs.md);
it does not complete these installed-extension checks.

- [ ] Open a problem and expand into Solve. Verify submission dates, timer,
      assessment, Help, and review controls, then save and check feedback and
      next-step guidance.
- [ ] Select AI and Notes. Confirm the full review footer is absent, every AI
      state has useful text and Settings/Retry where appropriate, and Notes has
      a placeholder with no editor or save action.
- [ ] Open AI disclosures, scroll, switch through Solve and Notes, and return to
      AI. Verify open disclosures, Copy feedback, and panel scroll positions
      remain. Replace the report and confirm its disclosures start closed.
- [ ] In the actual content-script ShadowRoot, use Left/Right, Home/End, and Tab.
      Verify wrapping, visible focus, paired panels, one tab-list stop, and no
      hidden Solve/AI controls in the focus sequence.
- [ ] Change tabs during a delayed save. Confirm completion preserves the tab
      selected at completion while expanded. Complete saves while collapsed and
      docked and confirm they open Solve.
- [ ] Collapse and dock from AI and Notes, then restore. Verify the selected tab
      and report remain. Navigate to a new problem and use Restart; both select
      Solve.
- [ ] Exercise accepted and failed autosaves, quick and manual untimed reviews,
      rating updates, strict overtime, AI off/unavailable/pending/error, and
      next-step errors. Verify rating locks, elapsed time, a single attempt,
      historical-log fields, and review guidance remain correct. Also run the
      existing historical-log preservation and real-submission analysis checks
      in this document.
- [ ] At 392px and 320px widths and a short viewport, inspect long literal code.
      Verify vertical scrolling belongs to the selected panel, Solve's footer
      remains reachable, and horizontal overflow belongs only to the code block.
- [ ] Attach human-run happy-path and edge-case screenshots or a screen recording
      before PR review or merge. Record the installed extension version and
      exact tested flows with the proof.

#### Required human installed-extension manual hints smoke

Status: **HUMAN INSTALLED-EXTENSION SMOKE PENDING** and **LIVE PROVIDER
QUALITY EVALUATION PENDING**. The human engineer must run the following
happy-path and edge-case realtime flows and attach screenshots or a recording
before PR review or merge. [The hints handoff](superpowers/handoffs/2026-10-04-overlay-ai-hints.md)
records automated checks and production-component fixture screenshots. Neither
fixture screenshots nor mock/unit tests complete these human or live gates.

- [ ] Save a provider/model/key connection, turn automatic AI assessment OFF,
      and open a problem before submitting. Activate Solve's Help AI action and
      verify the first pointer appears after the busy state. Rapid repeated
      activation must produce one provider call. Reveal subsequent pointers
      locally with previous pointers retained, actual counts, and a final state
      for the actual one-to-three-pointer batch. Fold/reopen without regeneration.
- [ ] During preparation/generation, start/pause the timer, choose a rating,
      save an accepted and a failed review, and update the rating. Confirm
      immediate persistence and the expected review count, rating/correctness,
      elapsed/solve time, FSRS scheduling, and preserved existing log values,
      comparing with the same workflow without hints. Hint arrival must leave
      these saved values unchanged and cause no extra write. Export a backup and inspect sync payloads:
      neither contains hint text.
- [ ] Retain ready and partially revealed batches through Solve/AI/Notes,
      collapse/expand, dock then restore to collapsed then explicitly expand,
      accepted and failed saves, rating updates, and ordinary metadata refetch.
      Toggle automatic assessment on and off; hints remain. Exercise Phase 1
      tab scroll retention and independent AI report disclosures too.
- [ ] Run a hint and an automatic report simultaneously. Cancel either owner
      without cancelling the other. Restart the overlay session and confirm
      both reset and late output stays absent.
- [ ] Change/remove the selected saved key, provider, or model while hints are
      pending and ready. Reject old results, clear ready hints, and use the new
      connection only after a new explicit request. Change an unselected
      provider's key and verify the current batch remains.
- [ ] Exercise missing, partial, oversized, or mismatched problem capture;
      slow capture/configuration/key reads; authentication, unavailable-model,
      transport, and timeout failures. Verify controlled redacted messages,
      useful Settings/Retry, and explicit Retry with a fresh request. A missing
      connection must offer Settings without generating automatically.
- [ ] Rapidly navigate between problems, leave LeetCode, restart, reload,
      remount, and clear local data while pending and ready. Old or late output
      must not appear. Repeat reset/restore with failed or hung public metadata
      reads; stale ready hints must clear before the reread succeeds.
- [ ] Use keyboard and pointer controls at 320px and 392px widths, both themes,
      and a short viewport in the installed content-script ShadowRoot. Inspect
      the compact Help row, absent idle card, readable inert wrapping pointers,
      visible focus, busy state, Retry, Settings, and reachable Solve controls.
- [ ] Record the installed extension version and exact flows. Attach ready
      first-pointer, progressive, final, busy, error, retained-after-save, and
      restart/navigation screenshots or a recording. These are human-run proof,
      separate from production-component fixture captures.

#### Manual hints provider evaluation

The three authored inputs in
`src/features/leetcode-review-assistant/testing/code-hint-evaluation-fixtures.ts`
exercise the problem-only `generateCodeHints` service. Normal checks leave
`COGNIPACE_AI_EVAL` unset or `0` and skip all three live cases before reading
private provider/model/key configuration. The 2026-10-05 check was presence-only:
opt-in was false and private configuration fields were absent. No application
stored key was read and no live request was made.

Status: **LIVE PROVIDER QUALITY EVALUATION PENDING**. With private test-only
provider/model/key environment configuration already prepared by the human,
use the pinned Node 24.20.0 and npm 11.19.0 toolchain and run:

```sh
rtk proxy env COGNIPACE_AI_EVAL=1 npm test -- src/features/leetcode-review-assistant/server/code-hint-provider-evaluation.test.ts --run
```

Do not paste keys into commands, reports, logs, screenshots, or Git, and do not
read the app's trusted key store for this evaluation. Record provider, model,
date, latency, and each fixture's progressive strength, usefulness, short
length, lack of duplicates, and spoiler restraint. Inspect every real batch;
schema/mock success proves structural bounds only. Human installed-extension
smoke and live provider quality remain separate pending gates, neither N/A.
Successful opted-in cases write only batch, provider metadata, criterion, and
checked date under `/private/tmp/cognipace-hint-evaluation`; verify fresh dates
before citing artifacts. Each real service call has a 30-second deadline and a
35-second test timeout with a single 1,024-token generation attempt.
Keep the existing six-case automatic-analysis evaluation and generated-code
checks below unchanged.

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

#### Code analysis provider evaluation

The six authored evaluation inputs in
`src/features/leetcode-review-assistant/testing/code-analysis-evaluation-fixtures.ts`
cover correct brute-force Two Sum with an expected linear-time goal, small
constant-space Two Sum, sorted one-based Two Sum with a map space violation,
insert-before-lookup wrong answer, Kotlin initialized Int inference, and Kotlin
Long prefix sums with an empty generic collection. Neutral problem titles,
constraints, examples, and current code go to the model. Fixture ids and human
criteria stay outside the prompt. Fixture tests strictly parse the requests,
check constraint differences and metadata isolation, and execute only authored
JavaScript baseline inputs; that does not test generated suggestions.

Normal checks leave `COGNIPACE_AI_EVAL` unset or set it to `0`. All six live
cases skip before reading evaluation configuration. Only a human who intends
a provider request should privately prepare `COGNIPACE_AI_EVAL=1`,
`COGNIPACE_AI_EVAL_PROVIDER` (openai, anthropic, gemini, or openrouter),
`COGNIPACE_AI_EVAL_MODEL`, and `COGNIPACE_AI_EVAL_KEY` in the process environment.
Never paste a key into commands, reports, logs, screenshots, or Git. These
test-only variables do not read or change the app's trusted provider keys.
Missing or invalid opted-in configuration throws one fixed redacted message.

With that private environment already ready, use the pinned Node 24.20.0 and
npm 11.19.0 toolchain:

```sh
rtk proxy zsh -c 'source /Users/tobiolutimehin/.nvm/nvm.sh && nvm use 24.20.0 && rtk npm run test -- src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts --maxWorkers=1'
```

For OpenRouter, privately select `openrouter/free` or an explicit accessible text
model. Record the requested model and optional resolved model for each current
artifact: free routing can select different serving models across requests.
Inspect full rubric usefulness and suggested-code validity, not only connection
success or schema validity. Mocked wire tests are separate evidence. Capacity,
account privacy settings, billing, or schema-support failures remain controlled
and do not trigger app-configured paid fallback requests.

Each case calls the actual `analyzeCode` service with a 30-second deadline and
35-second test timeout, using the existing single 8,192-token SDK path. A
successful case writes only report, providerMetadata, criterion, and checkedAt
to `/private/tmp/cognipace-ai-evaluation/<fixture.id>.json`. It never writes raw
requests, configuration, provider bodies, environments, or keys. Verify the
current checkedAt, provider, and model before citing an artifact; an older file
does not prove the latest run passed. Passing schema and consistency validation
does not establish human rubric quality, compilation, test success, or
optimality. Inspect each report and record provider/model/date and results:

- Brute force with the linear goal: a material hash-map replacement needs
  Approach below 5 without forcing a particular score; expected linear time is
  better and linear auxiliary space is worse independently.
- Small constant-space case: the correct brute force is appropriate for at most
  190 pairs. Do not automatically cap Approach, describe a hash map as O(1),
  modify the input, or hide a copying/sorting memory violation.
- Sorted one-based case: a material two-pointer replacement needs Approach
  below 5 and primarily improves auxiliary space to O(1), retaining O(n) time,
  nondecreasing order, unchanged input, and ordered one-based indices. Do not
  claim a false asymptotic time-order improvement.
- Wrong answer: catch the same-index defect for [3,2,4], target 6; check the
  complement before insertion and return distinct indices 1 and 2 in either
  order. Do not praise the incorrect early exit.
- Kotlin insertion: explicit initialized Int types are valid; inference is
  optional. Preserve the required IntArray/Int parameters, Int return type,
  lower-bound invariant, and found/absent/before/after positions.
- Kotlin prefix sum: preserve the same-length inclusive LongArray output and
  signature. Inferred zero must be 0L; retain generic typing on the annotation
  or initializer if keeping the empty collection. A direct LongArray is valid,
  with O(n) time and O(1) auxiliary space excluding required O(n) output, versus
  the current intermediate list's O(n) auxiliary space.

Inspect agreement among summary, scores, strategy, comparisons, and suggested
code for every case. After changes, rerun failed cases only, plus cases with an
unresolved concern, using the test-name filter. Keep generated-code checks
pending until actual provider outputs have been inspected. Then save the
JavaScript suggestion and a small assertion runner at the path below. The
runner must verify distinct valid indices and unchanged input for [2,7,11,15]
with 9, [3,2,4] with 6, [3,3] with 6, and [-5,2,8] with 3. The sorted suggestion
must retain ordered one-based indices. Run:

```sh
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node --check /private/tmp/cognipace-ai-evaluation/two-sum.js
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node /private/tmp/cognipace-ai-evaluation/two-sum.js
rtk proxy kotlinc /private/tmp/cognipace-ai-evaluation/kotlin-types.kt -d /private/tmp/cognipace-ai-evaluation/kotlin-types.jar
```

The Kotlin check should include both generated functions with their exact
signatures, and assertions for insertion boundaries, inclusive prefix sums,
and [2147483647,1] producing [2147483647L,2147483648L]. Do not infer compilation
from visual inspection or schema success. Kotlin tooling was unavailable on
the current PATH when checked on 2026-10-04; it was not installed. No live
provider or generated-code proof has been run for this implementation.

#### Required human installed-extension analysis smoke

Status: prepared, pending. A human engineer must run these happy-path and
edge-case realtime flows in the installed extension and attach screenshots or
a recording before PR review or merge. Browser fixtures and mock provider
reports supplement this proof and cannot replace it.

1. With a confirmed Gemini connection, enable AI assessment, refresh the
   LeetCode page, and verify idle before submission. Submit accepted code and
   useful wrong-answer, runtime-error, compile-error, timeout, memory-limit,
   output-limit, and unknown results when full matching context is available.
   Verify one report per attempt and honest unavailable dimensions.
2. Submit long/scrolled code and a problem with follow-ups. Verify complete
   input, three /5 scores, all selected rows, independent time-better /
   space-worse styling, and Kotlin Int, Long, generic types, and signatures.
3. Make capture incomplete, then Retry after a newer submission exists.
   Confirm Retry targets the original submission. Exercise rapid consecutive
   submissions and ambiguous discovery; stale code/results must not attach to
   another attempt.
4. Exercise timeout, authentication, quota, network, and invalid-output errors.
   Verify useful Settings/Retry actions. Change provider, key, or model during
   preparation and generation; old results must not appear and Retry must use
   the saved connection.
5. Navigate during generation, restart, disable AI, and clear/reset. Confirm
   stale work cannot reappear, the retained handled attempt stays idle until
   explicit Retry, and new attempts can run. Collapse/dock/restore and open
   details without extra provider requests; a replacement report starts closed.
6. While AI is pending, save manual, quick, untimed, failed, and strict-overtime
   reviews, accepted and failed deterministic autosaves, and a rating update.
   Confirm immediate persistence, correct locks, rating/correctness/time,
   FSRS/track progress, and one attempt only. Report arrival must make no extra
   review write or rating change. Repeat with AI unavailable and disabled.
7. Use Enter and Space on each independent native disclosure. Verify literal
   model text stays inert, Copy success and failure feedback work, and 392px
   and 320px layouts retain all labels and content with horizontal scrolling
   confined to code.
8. Record extension version, provider/model/date, happy and edge results, and
   screenshot/recording paths. Recovery is to turn AI assessment off; review
   saving and connection testing continue, with no migration or new permission.

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

Supported schema upgrades preserve local data. An intentional fresh-install
reset is a separate action; unsupported or corrupt snapshots require recovery.

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
- Preserve the original and follow [Local Database Recovery](#local-database-recovery).
- Use reset only when deliberately discarding disposable local test data.
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
