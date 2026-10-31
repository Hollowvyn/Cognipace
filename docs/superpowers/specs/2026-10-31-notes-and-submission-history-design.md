# Notes and submission history — design

Date: 2026-10-31

Status: consolidated draft for written review. The product direction, retention,
full problem reset, dedicated archive, and remote-backup inclusion were approved
in the brainstorming chat. This document does not authorize implementation
before its written review and a phase-sized implementation plan.

## Baseline and authority

The design branch was created from fetched `origin/main` at `a004b007`,
including storage merge `99f3ddfb` from
[PR #212](https://github.com/Hollowvyn/Cognipace/pull/212).

That merged work already supplies binary IndexedDB SQLite snapshots, validated
legacy migration, revision tracking, durable save acknowledgments, recovery
copies, replacement continuations, pending-write gates, and the approved
`unlimitedStorage` permission. Notes extends this foundation; it does not build
another snapshot backend or require another storage permission.

Current product, architecture, testing, design, contribution, and governance
documents remain authoritative. This is a planning artifact until implementation
updates those documents to describe shipped behavior.

The latest AI baseline is feedback first, with suggested implementation
generated separately on explicit request. Hints are code-aware and session-only.
Saved Notes must use those current boundaries, not the earlier combined-report
or problem-only-hint implementations.

## Product outcome

Every LeetCode problem has one evolving personal note and its own submission
history. A learner can write in the existing overlay Notes tab while solving,
then revisit the same material on a dedicated dashboard problem-details page.

For example, Wrong answer → Wrong answer → Accepted produces three archive
entries. Each can preserve its submitted code, result, language, available
diagnostics, personal reflection, and generated assessment. Archiving those
submissions does not itself create FSRS reviews. Existing Solve actions and
Practice remain responsible for ratings, review timing, scheduling, and track
effects.

The learner maintains one current explanation rather than receiving a new
editable main note for every submission. Complete AI assessments can also be
added to Notes as saved, collapsed AI sections.

## Approved scope

- Ownership is per problem. There is no new project, workspace, or generic
  notebook entity.
- One flexible personal note with optional prompts for approach, mistakes,
  complexity, and other reminders.
- Personal notes can be written before any submission.
- Local autosave with deliberate debouncing, truthful save feedback, and
  conflict protection.
- Forward capture of every completed submission detected by CogniPace,
  accepted or failed, independently of AI enablement.
- Automatic retention of successfully generated assessments and any suggested
  implementation actually generated for them.
- One-action Save to notes adds a complete assessment as a saved AI dropdown;
  there is no section-picker or intermediate insertion preview.
- A notes-first problem-details page, with recent submissions and full history.
- Relevant entry points from overlay Notes, Library, Tracks, and existing
  problem cards, including compact popup/queue actions where appropriate.
- Meaningful learning data is kept until explicit reset or deletion.
- Full Reset problem clears all learning data for that problem.
- Downloadable and configured remote full backups include the complete archive.

Historical LeetCode import, standalone topic notes, note-edit version history,
attachments, persisted hints, AI chat, code execution, and automatic AI rewriting
of the personal note are outside this release. New cloud destinations, Google
connection flows, and key recovery remain owned by the existing backup project.

## Overlay and dashboard experience

### Existing overlay

Keep the existing shared problem header, context strip, and Solve / AI / Notes
tabs. Solve retains its timer, ratings, Help, review actions, feedback, and
next-step guidance. AI retains its current assessment and explicit suggested-code
flow.

Notes replaces its reserved placeholder with:

1. The personal problem note and save status.
2. Optional prompt actions that insert editable headings.
3. Saved AI sections beneath the personal editor.
4. Access to submission history and Open problem details.

Each saved AI section starts collapsed. Its summary identifies it as AI notes,
shows Saved, and identifies the source submission by date and result, with
language where available. Expanding it renders the full saved feedback and any
generated implementation associated with that assessment. Existing AI-generated
and Untested labels remain visible around generated code.

Save to notes adds a reference to the stored assessment. Repeating the action
for the same assessment is idempotent. The AI tab provides Saved to notes feedback
and a View in Notes action. Saving does not force a tab change or provider call.

Removing a saved AI section removes its inclusion in Notes; its original report
remains in submission history. Clearing the personal editor clears that text,
not submission history or saved AI sections.

AI-section additions/removals use idempotent commands and expected collection
state, so a delayed add cannot undo a later removal.

Ordinary tab changes, collapse/dock/restore, and review saves retain the active
note workflow. A new problem loads that problem's note. Notes does not add the
Solve footer to AI or Notes, and does not change the timer or review policy.

### Problem-details page

Add a full page under the Library section, at the validated problem-slug route
`/library/problems/$problemSlug`. It is separate from the existing
metadata-edit modal.

The page leads with the same editable personal note, saved AI sections, and
the three most recent submissions. A Submission history view exposes the complete timeline
and the selected submission's code, result, reflection, and assessment.
History is newest first with a stable timestamp/ID tie-breaker, using cursor
pages of 50 metadata entries; payload bodies load when opened. Saved AI sections
are newest-saved first, with their source submission's date shown separately.
Existing practice facts and problem metadata remain available as secondary
details, using their owning read APIs.

View details actions open this shared page from relevant CogniPace surfaces.
Keep Open on LeetCode explicit and preserve existing external problem-opening
actions. Do not introduce a top-level Notes navigation section for this scope.
Route creation belongs in the app layer; runtime dashboard opening accepts a
validated problem destination rather than an arbitrary URL.

### Note format

Store a versioned Markdown document for the personal note. Provide basic
formatting actions and a formatted reading/preview mode for headings, lists,
links, inline code, and fenced code blocks. Optional prompts are editable
content, not required database fields. Users may remove or reorganize them.

Rendering must disable executable/raw HTML, restrict link protocols, and treat
imported and AI-derived text as untrusted. Generated code is displayed literally
and is never run or submitted. No editor library is selected by this design.

## Autosave and concurrent editing

Use a trailing 600 ms debounce with a 3,000 ms maximum wait while typing
continues. The maximum wait bounds when a save is requested; an active storage
operation may still take time to finish. Flush pending edits on editor blur and
controlled problem navigation.

Keep one accepted save in flight per note and coalesce subsequent edits to the
newest pending document. Every accepted save has a stable command identity,
expected note revision, problem identity, and reset-generation context. A
transport retry resends the same accepted command rather than inventing another
write.

Save a changed note and its shared data revision in one IndexedDB transaction.
Request strict durability for retained user records. Mark Saved only after
transaction completion and the required verification; an acknowledgment of an
older draft must not mark a newer draft saved or replace its text.

The source problem remains bound to the edit operation. A final flush during
SPA navigation must not attach text to the next problem. Background-issued
edit scope must permit an already owned final flush for its original problem
while retaining sender ownership and generation checks. A full page termination
before any save is accepted cannot be advertised as a completed save.

If another surface updates a clean note, refresh it. If it updates a dirty note,
preserve the local draft and expose a deliberate conflict resolution path:
load the saved version, copy the draft, or explicitly replace the current
version after reviewing it. Recheck the revision for any replacement. Do not
silently merge or use last-response-wins behavior.

A save failure retains the available draft and accepted command for retry and
shows an actionable unsaved state. Recovery checkpoints are technical data and
can be removed only after their matching content is durably saved or explicitly
discarded. Full Reset problem invalidates old drafts and commands; they cannot
automatically recreate the cleared note.

## Submission and assessment records

Capture forward from feature activation. Runs/tests are not submissions. Do not
fetch historical submissions merely because the learner opens a problem.

Use a stable internal archive ID and unique external identity for a known
LeetCode host/submission ID. A capture with no external submission ID retains
its trusted observed attempt identity; later verified enrichment binds that
identity to the external ID without creating another history entry. Do not
deduplicate distinct attempts by identical code, nearby timestamps, or result.

Repeated terminal events update the same entry. Preserve complete pinned code
when available; never substitute the current editor or a newer submission.
Missing or partial capture is represented honestly. Enrichment may add verified
complete data, but cannot downgrade a complete snapshot to a fragment. Keep
diagnostics bounded and indicate unavailable/omitted fields rather than silently
truncating code presented as complete.

A submission's optional personal reflection is independent of the main note.
Reflection edits use the same autosave, revision, retry and conflict rules,
applied to that reflection rather than the main document.
History reads do not create reviews, alter correctness or timing, advance tracks,
or schedule FSRS.

Generated feedback is stored with its schema version, assessed submission,
operation identity, generation time, and safe provider/model metadata. A report
that finishes after a review save attaches to that same submission without
another review write. Optional generated implementation is a separate artifact
linked to the original assessment; saving, opening, restoring, or backing up a
report never requests code generation.

The saved AI section references that assessment and its available generated
artifacts. Feedback remains intact if implementation generation fails. Existing
stale-result, configuration, sender-ownership, and cancellation checks still
apply. A persistence failure must not be disguised as an AI-generation failure
or reported as successfully saved. Retrying archive publication does not itself
make another provider request.

Turning AI off, removing its key, or changing the active provider does not delete
previously retained reports. Saved assessments remain readable without a current
provider connection.

Hints, raw provider responses, prompts, page HTML, credentials, and unbounded
polling/capture payloads are not archive records.

## Storage foundation

Use dedicated archive object stores in the same physical IndexedDB database as
the merged snapshot ledger, `cognipace-local-v1`. All access is background-owned
through validated feature services. Content scripts must never use LeetCode's
IndexedDB for CogniPace data.

Extend the database schema with these logical stores:

| Store             | Purpose                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `records`         | Existing ledger/recovery namespace; lightweight active head, global data revision, acknowledgment and continuation metadata |
| `coreSnapshots`   | Binary SQLite snapshot payloads referenced by the active head and retained recovery records                                 |
| `problemNotes`    | Versioned note documents, note revisions and timestamps                                                                     |
| `submissions`     | Indexed problem/date/result/language metadata and payload references                                                        |
| `analysisReports` | Assessment identity, schema/provider metadata, feedback and implementation references                                       |
| `savedAiNotes`    | Unique problem/assessment inclusions and their order                                                                        |
| `payloads`        | Immutable submitted code and validated AI artifact bodies                                                                   |
| `problemScopes`   | Per-problem reset generations and write guards                                                                              |

Archive records are scoped to an active archive generation so a large restore
can stage a replacement without modifying the active dataset. Index history by
problem and stable time/ID order. Page metadata reads and fetch large bodies
only when needed. Store each artifact once and use references for saved AI
sections.

The current active snapshot record embeds both SQLite bytes and revision
metadata. Split the binary payload from the lightweight head. An archive-only
transaction updates its records and the global data revision/backup-needed
state without serializing or rewriting the core SQLite snapshot. Existing
snapshot interfaces can compose the payload and metadata when a core open or
core write needs them.

Every durable archive change participates in the same global backup revision.
An older backup acknowledgment cannot clear newer note or submission changes.
Local success and remote-backup success remain separate states.

Upgrade existing IndexedDB data transactionally, preserving active binary bytes,
revisions, recovery roots and pending continuations. A failed or unsupported
upgrade preserves the original and reports recovery-required state; it never
seeds an empty database over existing data. Old clients must reject unsupported
storage/backup formats rather than open a partial archive.

## Retention and maintenance

There is no automatic TTL, age expiry, or storage-budget eviction for meaningful
learning records. This includes personal notes, all retained submissions and
code, reflections, assessments, and saved AI inclusions.

Automatic cleanup is limited to technical data proven no longer needed:

- Finished capture/operation caches.
- Superseded draft checkpoints after their content is acknowledged or discarded.
- Duplicate deliveries of the same operation.
- Unreferenced payloads after explicit deletion or completed replacement.
- Superseded staging data that is not active and is not a valid recovery root.

Never collect active records, unresolved commands, reset fences, or data needed
by a retained recovery copy. Maintain a bounded prior replacement recovery
consistent with the existing foundation, rather than retaining unlimited full
copies as technical state.

Storage usage and export controls belong in Data Management. Existing explicit
Reset problem, Delete problem, bulk reset, and Clear local data actions provide
cleanup of learning records; do not add an automatic-retention selector in this
release.
Disk-full or IndexedDB failure is visible and preserves existing durable data;
it does not trigger silent deletion of learning material. The retention promise
is no automatic product expiry, with backups for recovery, not a guarantee
against loss of the device or extension profile.

## Shared transactions and recovery

For a composite operation, prepare a detached SQLite candidate using the owning
repositories and stage any replacement archive data before publication. Do not
expose a modified live core alongside the old archive. Candidate writes must not
trigger the live handle's snapshot scheduler.

Publish the prepared core snapshot pointer, corresponding archive changes or
active-generation switch, global revision, reset scopes and recovery
continuation in one IndexedDB read/write transaction. Switch the live SQLite
handle to the published candidate after commit. The durable head remains the
authority if Chrome stops between commit and the in-memory switch.

The durable operation identity determines whether an interrupted command was
committed. Retry either finishes publication/verification or settles its
continuation; it does not repeat destructive domain operations or rotate scopes
again. Preserve the last valid published pair and the required recovery roots.
Normal writes and mixed core/archive reads must not pass an unresolved
replacement barrier. Authenticated recovery/status reads remain available.

A destructive reset or deletion must preserve the matching prior archive state
for any retained recovery copy, through a staged generation or immutable
record versions. A pointer to an archive generation modified in place is not a
valid prior-state recovery root. Explicitly recovering an older pair issues
fresh write scopes rather than reactivating stale commands.

Successful publication invalidates the correct note, submission, problem,
practice, track, analytics and shell queries. Failure of later notification or
remote bookkeeping cannot turn a committed reset into another reset on retry.

## Reset and deletion semantics

Rename all user-facing per-problem Reset Schedule actions, including bulk
problem-reset entry points, to Reset problem. Confirm the categories and number
of affected problems before applying it.

Reset problem clears that problem's:

- FSRS state, practice review history, legacy learning-log fields, and completion
  evidence using the existing owning services.
- Personal note and available recovery drafts.
- Submission metadata, submitted code and reflections.
- Stored assessments, generated implementations, and saved AI sections.

Keep the catalog problem, metadata and track placements. A new post-reset solve
or note may start fresh. Reset rotates the problem's write generation; pending
autosaves, captures, AI work and retries from the previous generation are
rejected across all surfaces.

Restart in the overlay remains a session action, not Reset problem. Resetting a
track's curriculum progress remains that existing action; it does not silently
perform full problem resets.

Delete problem removes the catalog entry and its dependent core/archive data
through the same coordinated boundary. Clear local data resets the entire
active dataset. Both confirmations name the new learning data affected.

Reset/deletion removes active application data. Separately downloaded backups
and prior remote backup versions are not silently edited or erased. Only an
explicit confirmed restore can intentionally bring an older saved state back;
late operations and ordinary reads must not resurrect it.

## Full backup, restore and remote inclusion

Extend the full backup to schema version 7, with an archive format version and
counts for notes, submissions, reports, saved AI sections and payload bytes.
Include all user-visible archive content and preserve stable record/source IDs,
timestamps and reference relationships. Credentials remain excluded from
ordinary data backups.

Export reads one consistent durable core/archive pair under the mutation and
replacement barrier. The backup revision represents both stores. Validate
references, payload types/versions, note format, ownership and the full SQLite
import invariants before applying a restore.

Restore stages a fresh archive generation and detached core candidate. A final
transaction publishes the complete pair with recovery and fresh write scopes.
Restore never reruns assessments, replays captured submissions as reviews, or
recalculates saved schedules. Existing saved AI sections point to the restored
assessments and render without provider access.

Versions 1–6 remain readable through frozen readers and normalization. They
contain no new archive. Because a full restore is replacement, its preview
explicitly warns when applying an older backup will remove current notes and
submission history. Do not silently preserve an unmatched archive or invent
missing historical code/reports.

An automatic legacy pull must not normalize an absent archive into empty data
and clear the current archive. Pause that replacement for explicit review. A
manual full restore of an older backup remains available after its removal
preview; do not silently merge the two datasets.

The user explicitly approved including the full archive in configured remote
data backups. Extend the shared backup contract and exact-revision acknowledgment
rather than introduce a Notes-specific cloud destination or account flow.
Existing Gist and the approved future Drive backup project retain transport
ownership.

Remote compatibility is a release gate: a supported destination must round-trip
the complete new-format payload, including larger archives, before it is
reported as a completed/verified backup. A truncated, unsupported or incomplete
payload remains a pending/error state with recoverable local data. It must not
be marked successful because only the SQLite portion or an HTTP upload
succeeded. Coordinate large-payload/readback support with the existing backup
project; do not ship a Notes release that silently omits its archive from an
enabled backup path. Key recovery remains a separate feature and dataset.

## Ownership

- `src/platform/db` owns the shared IndexedDB connection/schema, binary core
  storage, transaction/publication primitives and recovery coordination.
- A `src/features/notes` capability owns personal notes, the submission archive,
  saved AI inclusions, domain validation, repositories, services and feature UI.
- `leetcode-capture` and existing LeetCode readers own trusted matching capture.
- `leetcode-review-assistant` retains report schemas, generation and a reusable
  read-only assessment presentation. Compose its public presentation in the
  overlay and saved-history views; avoid deep imports from overlay internals.
- `practice`, `tracks` and `problems` retain their existing write ownership.
- `backup` owns the complete versioned data contract and restore validation;
  `sync` retains destination policy and exact remote acknowledgments.
- `src/extension` validates/authorizes runtime methods and composes cross-feature
  operations through owning services. UI never accesses either database directly.
- `src/app` composes routes, surfaces and navigation.

Preserve `entrypoints -> app -> features -> platform/lib/components`. Add note
and archive query/invalidation tags only where their consumers need them.

Do not log note bodies, submitted code, assessment content, or credentials.
Operational measurements use sizes, timings and controlled identifiers. Update
`PRIVACY.md` with the implemented local retention, configured remote-backup
inclusion, and reset/deletion semantics.

## Failure and verification requirements

| Scenario                                       | Required proof                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Note transaction abort or disk failure         | No Saved acknowledgment; prior durable note intact; draft/retry remains available                |
| Lost response after commit                     | Same accepted command returns its acknowledgment without another mutation                        |
| Two editors change one note                    | Revision conflict preserves the local draft and prevents silent overwrite                        |
| Navigation before debounce completes           | Final flush retains the original problem identity; no text lands on the next problem             |
| Reset while note/capture/AI work is pending    | Old generation cannot recreate any cleared material                                              |
| Repeated terminal events                       | One history entry per actual submission; no archive-created FSRS reviews                         |
| AI finishes after review save                  | Correct source attachment, no extra review write and no rating change                            |
| Repeated Save to notes                         | One inclusion for that assessment; no provider request                                           |
| Worker stops around reset/restore commit       | On restart, old or new consistent pair, or explicit recovery state; never mixed normal operation |
| Old backup acknowledgment races a new note     | Newer local revision remains pending for backup                                                  |
| Existing IndexedDB upgrade fails               | Original core/recovery data preserved; no empty reinitialization                                 |
| Older full backup replaces a populated archive | Clear preview, complete replacement, fresh generations and no stale replay                       |
| Large remote backup                            | Full archive round-trip and readback verification; truncated content cannot produce success      |

Performance proof must show that ordinary note saves neither call SQLite
serialization nor rewrite its binary payload. History listing must fetch
metadata without loading every code/report body. Measure typing responsiveness,
save latency, initial history reads, backup memory and restore behavior using
1,000- and 10,000-submission archives, with both the public fixture and a larger
20 KB-per-entry scenario. Report p50/p95 and test environment. The target for an
ordinary 2 KB note on an awake worker is Saved within one second of the final
keystroke, including the 600 ms debounce. Cold start, deliberate maintenance
blocking and storage failure are measured and labelled separately.

Also prove that selecting a retained local recovery copy restores the matching
archive and core together, and that a delayed saved-AI addition cannot undo a
later explicit removal.

## Delivery slices

Use one master design and separate phase-sized implementation plans:

1. **Archive persistence and complete recovery:** IndexedDB upgrade, lightweight
   shared revision, archive transactions, full backup contract, reset/delete and
   replacement recovery. Include existing-profile preservation and fault tests.
2. **Capture and assessment retention:** submission identity/enrichment,
   idempotent forward capture, feedback/implementation attachment, generation
   fencing and no FSRS side effects.
3. **Overlay Notes:** flexible editor, optional prompts, debounced/conflict-safe
   autosave, saved AI dropdowns, history access and current AI integration.
4. **Problem-details page and complete release proof:** notes-first page,
   full history, relevant entry points, accessibility, large-archive benchmarks,
   complete remote-backup compatibility and installed-extension smoke.

These are implementation/review slices, not permission to release a partially
recoverable Notes feature. Keep product activation on the feature branch until
the complete release gates pass; an earlier independent merge may contain only
infrastructure that does not enable capture/editing. Do not enable user-visible
capture or editing before its data participates in the complete backup/reset
boundary, including supported configured remote backups.

Follow `docs/agent-governance.md` for exact validation selection. Implementation
needs focused contract, repository, transaction, migration, reset/restore,
controller and UI tests; `npm run db:check`, `npm run lint`, `npm run check`, and
`npm run build`; and `npm run zip` when packaging behavior is touched. An
IndexedDB-only upgrade does not generate Drizzle SQL: run `npm run db:generate`
only if a phase actually changes the Drizzle schema, and record the reason
otherwise.

A human engineer must run happy-path and edge-case installed-extension flows
with screenshots or a recording before PR review/merge. Include real storage
commit/restart, rapid navigation, failed retry, concurrent editing, accepted and
failed submissions, saved AI without a connection, full Reset problem,
downloadable and configured remote full restore, and narrow/short layouts.
Fixtures and automated tests supplement this proof; they do not replace it.

Update product, architecture, testing and visual-direction documents only as
the corresponding behavior is implemented. Record exact checks, skips and
remaining risks for each phase. Feature implementation uses Conventional Commit
titles; the design document itself is a docs change.

## References

- [Merged durable-local-storage PR #212](https://github.com/Hollowvyn/Cognipace/pull/212).
- Existing `docs/superpowers/specs/2026-10-16-reliable-drive-backup-and-key-recovery-design.md`
  and its phase plans, verified against current runtime behavior.
- [LeetCode Notes](https://leetcodenotes.com/): in-context writing and later study
  browsing are product inspiration.
- [nicolasgioanni/LeetNotes](https://github.com/nicolasgioanni/LeetNotes): a
  separate project offering structured durable study-record inspiration.
- [IndexedDB transactions](https://www.w3.org/TR/IndexedDB/#transactions).
- [Chrome extension storage](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies).
