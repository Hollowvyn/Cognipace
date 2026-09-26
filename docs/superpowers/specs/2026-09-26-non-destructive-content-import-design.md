# Non-Destructive Content Import Design

## Status and Intent

Product format, merge policy, preview flow, architecture, and validation scope
were approved in the design conversation on 2026-09-26. This written specification
is awaiting the user's review before implementation planning.

Enable repeated imports of coding-study content without replacing the user's
Library, curriculum edits, practice history, or track progress. A curriculum such
as NeetCode 250 must be representable in one documented JSON file. Authors and
external conversion scripts target a public content contract, not database rows
or the full-backup format.

The feature is local-first and belongs in Settings > Data Management. The first
version supports problems, tracks with ordered groups, companies, and simple
topic labels. Companies remain problem metadata; importing a company does not
create a track.

## Current Implementation Constraints

- `features/backup/components/selective-import-panel.tsx` is a placeholder.
- Full-backup restore clears tables before restoring data. It must not be used
  as the implementation of content import.
- Problems have stable LeetCode slug identities. Practice and scheduling live
  in separate tables.
- Tracks have stable slugs; groups have stable IDs and explicit positions.
  Existing group creation uses `<trackId>:<group-slug>`, with suffixes where
  necessary. A problem can belong to only one group within a track.
- Topic resolution supports existing IDs, normalized labels, and stored aliases.
- Existing problem create/edit and track edit operations can overwrite metadata,
  replace relationships, or move memberships. Import needs additive operations
  behind the same feature ownership boundaries.
- Runtime mutations are serialized and followed by snapshot persistence, cache
  invalidation, and the existing optional sync lifecycle.
- Changing migration SQL can reset local snapshots in the current persistence
  implementation. This design requires no schema or migration change.

## Approved Product Rules

1. Add missing entities and relationships. Preserve existing scalar values,
   curriculum order, memberships, and user state.
2. A question can be supplied as a LeetCode slug or URL, with optional metadata.
3. Optional `null` and omitted values mean no supplied data, never deletion.
4. Import valid entries and explain skipped entries. An unusable file envelope
   blocks the file.
5. Preview changes before writing. Recheck the preview against current local
   data before applying.
6. Apply all accepted database changes in one transaction.
7. Importing identical content again makes no database changes.
8. Keep simple topic-label imports in version 1. Defer topic hierarchy and alias
   authoring.

## Public Format

The discriminator is `"format": "cognipace-content"`; `version` is the integer
`1`. Both are required. Four optional arrays follow:

| Field       | Entries                             | Purpose                                        |
| ----------- | ----------------------------------- | ---------------------------------------------- |
| `problems`  | Slug/URL strings or problem objects | Create questions and add labels                |
| `tracks`    | Track objects                       | Create curricula and append groups/memberships |
| `companies` | Label strings                       | Register company labels independently          |
| `topics`    | Label strings                       | Register topic labels independently            |

Missing or `null` optional sections are empty. Empty arrays are valid and clear
nothing. At least one section must contain an accepted entry for the file to
have useful content; an empty file produces a no-content result with no commit
action. Existing-only content instead produces an already-imported result.

An optional `$schema` string can identify the published schema for editors. It
does not determine runtime behavior and the extension never fetches it.

### Minimal Problem File

```json
{
  "format": "cognipace-content",
  "version": 1,
  "problems": ["two-sum", "https://leetcode.com/problems/valid-anagram/"]
}
```

### Combined File

```json
{
  "format": "cognipace-content",
  "version": 1,
  "problems": [
    {
      "slug": "two-sum",
      "title": "Two Sum",
      "difficulty": "easy",
      "topics": ["Array", "Hash Table"],
      "companies": ["Example Company"],
      "isPremium": null
    },
    {
      "url": "https://leetcode.com/problems/valid-anagram/",
      "title": "Valid Anagram",
      "difficulty": null
    }
  ],
  "tracks": [
    {
      "slug": "neetcode-250",
      "title": "NeetCode 250",
      "description": null,
      "groups": [
        {
          "slug": "arrays-and-hashing",
          "title": "Arrays & Hashing",
          "problems": ["two-sum", "valid-anagram", "contains-duplicate"]
        }
      ]
    }
  ],
  "companies": ["Example Company"],
  "topics": ["Array", "Hash Table"]
}
```

The abbreviated curriculum above illustrates structure, not the complete
NeetCode dataset. Providing or scraping third-party datasets is outside this
implementation.

### Single-Purpose Files

Company-only and topic-only files need only their corresponding section:

```json
{
  "format": "cognipace-content",
  "version": 1,
  "companies": ["Example Company"]
}
```

```json
{
  "format": "cognipace-content",
  "version": 1,
  "topics": ["Dynamic Programming", "Memoization", "Sliding Window"]
}
```

These register labels without assigning questions. Question objects express
company/topic assignments. Referenced labels are created when missing, so
declaring the same label at the top level is optional.

A track-only file omits the other three sections. Every valid reference in an
accepted group reuses an existing question or creates a minimal one. A
top-level problem object is necessary only to supply additional metadata.

## Validation and Normalization

### Identity

- Raw problem, track, and group slugs are trimmed and lowercased, then must match
  `[a-z0-9]+(?:-[a-z0-9]+)*`. Do not silently remove punctuation or turn arbitrary
  prose into identity. Slugs are limited to 200 characters.
- Question URLs must be HTTPS URLs on `leetcode.com` or `www.leetcode.com`,
  without credentials or a non-default port, with `/problems/<valid-slug>/` as
  their problem path prefix. Query strings, fragments, and subsequent problem
  page tabs do not affect identity. Validate the extracted slug before using it.
- Only question identity accepts URLs. Track/group slugs are plain stable keys.
- Problem objects require at least one non-null `slug` or `url`. A supplied
  non-null identity must be valid; two supplied identities must agree. Otherwise
  skip that object. Identity cannot be reconstructed from its title.
- URL-shaped input that fails URL validation is invalid. Never retry it as a
  raw slug. This is stricter than the existing general-purpose LeetCode parser.
- Identity validation is offline. A syntactically valid slug is not a claim
  that the question exists on LeetCode; import performs no metadata requests.

### Problem Objects

Allowed fields are `slug`, `url`, `title`, `difficulty`, `isPremium`, `topics`,
and `companies`.

- Titles are trimmed; a blank title is absent.
- Difficulty accepts `easy`, `medium`, `hard`, and `unknown`, ignoring case and
  surrounding whitespace. Other non-null values produce a field warning and
  are omitted, rather than silently being accepted as a valid difficulty.
- `isPremium` accepts a boolean or `null`; strings and numbers are not coerced.
- Label fields accept arrays of strings or `null`. Trim labels and collapse
  internal whitespace. Ignore null array elements; warn and skip other invalid
  or blank label elements. A label must have a non-empty normalized lookup key.
- Invalid optional metadata is omitted with a path-specific warning. A valid
  question identity can still be accepted. Invalid identity skips the object.
- New questions default to a readable title derived from their slug,
  `difficulty: "unknown"`, and the existing `isPremium: false` storage default.
  The premium default is a compatibility fallback, not externally verified
  metadata. No practice, review, scheduling, or completion facts are invented.
- Existing questions retain every stored scalar, including fallback titles,
  unknown difficulty, and premium status. Later imports may add associations,
  but do not enrich or overwrite those scalars. Users can edit metadata through
  existing Library/capture workflows.

### Tracks and Groups

- Track objects allow `slug`, `title`, `description`, and `groups`.
- Group objects allow `slug`, `title`, and `problems`.
- Track and group `slug` is required. Missing/null titles use readable slug
  fallbacks for newly created records. New track descriptions default to null.
- Trim titles and descriptions; blank values are absent. Non-string, non-null
  optional scalar values are ignored with field warnings, as with question
  metadata. Top-level company/topic labels use the same label validation and
  normalization rules as labels on questions.
- A track's `groups` must be an array with at least one accepted group. Missing,
  null, wrong-type, or entirely invalid groups skip the track as a container.
- A group's `problems` is an optional array of question slug/URL strings. Missing,
  null, or empty means an empty group. A wrong-type value skips the group;
  invalid individual references skip only those references.
- Detailed question objects belong in top-level `problems`, not in groups.
  This keeps a question's shared metadata in one place.
- Explicit empty groups are valid. If every supplied reference in a group is
  rejected, skip that group and report it instead of creating an accidental
  empty group. A track left with no accepted groups is skipped.
- A skipped track/group contributes no implicit questions or relationships.
  Independently valid top-level problems remain eligible to import.

### File-Level and Field-Level Errors

- Reject unreadable/invalid JSON, a non-object root, the wrong discriminator,
  unsupported version, or a file exceeding the 5 MiB UTF-8 limit.
- Limit the file to 50,000 array entries in total, counting entries in every
  nested array, including references and labels. Reject the whole file when
  this limit is exceeded. Enforce both limits before preview and at the trusted
  runtime boundary. These are resource ceilings, not truncation thresholds.
- A wrong-type optional top-level section is skipped with an error; independent
  valid sections remain eligible.
- Unknown fields are ignored with warnings at every recognized object level.
  A typo such as `difficulity` must be visible. If no recognized usable content
  remains, there is no commit action.
- No coercion from numeric IDs, display titles, arbitrary website links, or
  stringified booleans. Errors include a stable code, input path, plain-language
  explanation, and the affected entity when identifiable.
- Render supplied strings as text. The file cannot provide HTML, executable
  content, settings, secrets, practice state, or commands.

## Identity and Additive Merge Rules

### Problems and Labels

Match questions by canonical LeetCode slug. Use insert-if-missing operations,
never existing upsert operations that update on conflict.

Resolve topics using the existing topic lookup rules and known aliases. The
read-only planner must model that resolution without invoking a resolver that
inserts missing topics. Apply uses the owning topic service/repository to create
missing labels and insert missing direct assignments. Do not add parent topic
assignments or create alias/relation rows.

Match companies by normalized label/identity, preserving stored display labels.
New company IDs follow the existing normalized taxonomy ID convention. If
multiple existing company rows would match an incoming normalized label, skip
that label and its associations with an ambiguity diagnostic; never choose an
arbitrary row or merge existing rows. Other labels on the same question remain
eligible.

Association arrays are unions with existing direct associations. Empty arrays
and null values never delete joins. Existing rows and timestamps remain
unchanged; additions create only new rows.

### Tracks and Groups

Match tracks by stored slug. For a new track, use its slug as its ID, matching
the existing convention. If that ID is occupied by a different track, skip and
report the identity conflict rather than rewriting either record.

For an incoming group, the expected stable ID is
`<resolved-track-id>:<group-slug>`. An existing record at that ID is reusable only
if it belongs to the resolved track. Match identity before display title, so
local title edits do not break repeat imports.

Do not fuzzy-match group titles. If no ID match exists but a normalized incoming
group title or slug matches the display title of an existing group in that
track, skip the group with an identity-conflict diagnostic. This conservatively
handles older/custom IDs and prevents silently duplicating a likely existing
group. The diagnostic explains that display names do not establish stable
identity. Otherwise create the group at the expected ID. Imported group slugs
are never rewritten when users edit display titles.

New groups append after the largest existing group position. New memberships
append after the largest existing position in their destination group. Preserve
the relative file order of all additions. Never renumber existing rows to make
space.

If a question already belongs to any group in the track, keep that membership.
If the incoming group differs, report the preserved placement. Reuse the
question freely across different tracks.

No imports update `track_session`, `track_problem_progress`, track due dates,
practice rows, FSRS cards, review attempts, or settings. New tracks have no due
date and are not activated. New memberships begin incomplete through existing
read-model semantics; importing does not manufacture completion rows.

### Duplicate Entries Within One File

Normalize and aggregate the file before comparing it with the database:

- Fold repeated problem identities into one logical question. Take the first
  valid, non-null explicit value for each scalar field in top-level file order.
  Report conflicting later values; union valid labels. Apply fallback metadata
  only after folding all explicit entries, so an early bare slug does not mask
  a later detailed object.
- Track references supply identity only and cannot override explicit metadata.
- Fold repeated track slugs and repeated group slugs within a track. First
  supplied scalar values win with conflict diagnostics; append distinct groups
  and references in first-appearance order.
- A repeated question within a track goes to its first accepted file placement
  unless a local placement already exists, in which case local placement wins.
- Repeated labels resolve once. Exact repetitions do not count as new entities
  or changes. Conflicts and moved-placement requests remain visible warnings.

Counts describe distinct planned changes, not raw input row totals.

## Preview, Apply, and Persistence

### User Flow

Settings > Data Management replaces the placeholder with Import content. Show
a short description of the additive policy, a JSON file picker, template
downloads, and a format-reference link. Full-backup restore remains separately
labeled and continues using its existing workflow.

After selection, show filename, counts of new entities and relationships,
existing entities retained, ignored values, and skipped entries. Group details
by type and make every diagnostic accessible; large reports may be paginated,
but must not silently truncate. Import has an explicit action showing the
number of additions. Users can cancel or select another file without writes.

Warnings do not block importing valid content. Fatal errors do. An all-existing
file displays that no changes are needed and does not expose a mutating action.
Loading and error feedback belong to this flow; prevent duplicate submissions.
After successful persistence, show actual counts and retain the diagnostics
until the user dismisses them or chooses another file.

### Freshness and Authority

Preview is a deterministic read-only plan over normalized input and relevant
current catalog state. It must not create labels or placeholder questions.

The background preview returns a fingerprint of the normalized input, the
relevant local identities/values/order/associations, and the calculated plan.
No persisted import journal or new database table is needed. Unrelated practice
reviews do not stale the preview because import neither reads nor changes
practice facts.

Canonicalize collections before fingerprinting. Exclude generated preview times
and proposed creation timestamps; otherwise an unchanged file would stale
itself between preview and apply. The actual apply time supplies creation
timestamps after the freshness check.

Apply sends the file content and preview fingerprint, not caller-selected SQL
operations. The trusted handler revalidates the file and rebuilds the plan inside
the existing serialized mutation queue. A mismatch returns a refreshed preview
without writes and requires another click to import. This includes changes to
diagnostics and existing matching values, not only the addition count. A hash
is a freshness check, never authorization; the server derives every operation.

The implementation may reuse the same normalized input in the UI, but must not
trust client-side validation. A worker restart must not lose correctness:
reconstruct the preview from the file and current database state.

### Commit and Durability

Execute the accepted plan in one SQLite transaction through owning feature
services/repositories. A database error rolls back all accepted changes.
Invalid input entries were already excluded during planning and are not
transaction failures.

For a plan with no additions, return without touching rows, timestamps, snapshot
storage, sync dirty state, or mutation invalidation. Stale previews also bypass
all mutation side effects. The current generic mutation wrapper always runs
post-write effects, so this path needs a narrow changed/no-change result or
equivalent conditional integration.

For changed content, use the existing local-mutation lifecycle: mark sync dirty,
flush the snapshot, invalidate affected catalog/track/queue/shell reads, and
schedule the already-configured optional safe sync behavior. Do not change sync
permissions, payload format, force behavior, or settings.

SQLite commit and Chrome snapshot persistence are separate durability steps.
Do not claim that a snapshot failure rolled back an already-committed database
transaction. In that case, report that changes are applied but durability is
unconfirmed, refresh affected local views, and offer a retry of the snapshot
flush without reapplying additions. The retry runs through the same queue and
uses the existing snapshot machinery; it does not introduce a persistent import
job system. Only show final durable success after snapshot persistence succeeds.
If the worker restarts or the response is lost, require a fresh preview;
idempotent merge makes retrying the file safe.

Automatic sync failure remains separate from successful local persistence,
consistent with current product behavior. There is no new remote import or
network enrichment operation.

## Architecture and Ownership

Use a focused `src/features/imports` feature for content contracts, normalization,
planning, diagnostics, orchestration, API hooks, and the import UI. Keep the
backup feature responsible for existing Data Management composition and backup
behavior. Compose the import component through the feature's public surface.

Suggested responsibilities:

| Boundary                              | Responsibility                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `imports/api`                         | Versioned input and runtime request/response contracts; preview/apply hooks                      |
| `imports/domain`                      | Pure normalization, typed normalized document, deterministic plan and diagnostics                |
| `imports/server`                      | Orchestrate read-only preview and transactional apply through feature services                   |
| `imports/components`                  | File selection, templates, preview, diagnostics, and result states                               |
| `problems/server` and `problems/data` | Import read models and additive problem/company/topic operations                                 |
| `tracks/server` and `tracks/data`     | Import read models and additive track/group/membership operations                                |
| `extension`                           | Dashboard-only sender authorization, Zod boundary validation, mutation serialization and effects |

Cross-feature access goes through approved contracts/domain/service surfaces,
never another feature's repository or a runtime-exporting root barrel. Import
orchestration passes a shared transaction to the owning services so the accepted
set commits together. UI code does not access the database.

Keep the normalized document and diagnostics shared across entity handlers;
each entity's matching and additions remain explicit. Do not introduce a generic
plugin registry, arbitrary merge-policy framework, custom RPC layer, or separate
background job system. A future format version can add a new section using the
same parse/plan/apply pipeline.

## Published Contract and Templates

Implementation ships:

- `docs/import-format.md`: human-readable contract with identity, null, merge,
  duplicate, failure, limit, and compatibility rules.
- `public/import/cognipace-content-v1.schema.json`: machine-readable schema for
  editor/tool validation, downloadable from the extension. Use relative schema
  references in examples where useful; no hosted service is required.
- `public/import/examples/`: minimal problems, detailed problems, companies,
  topics, track-only, and combined examples exposed as template downloads.

The public schema catches authoring mistakes such as unknown fields and invalid
metadata. Runtime deliberately salvages valid content while reporting those
same issues. Document this distinction: successful partial import does not mean
the original file fully conforms to the schema. Share contract definitions where
practical and test schema/templates/runtime behavior for drift.

Version 1's interpretation stays stable. New entity sections or incompatible
semantics require a new version with explicit compatibility handling. Older
importers reject unknown versions; they do not guess or silently import an
incomplete future document. The content version is independent of backup and
database versions. Full-backup files are not accepted as content files.

Update current product, architecture, and testing docs when implementation lands.
This spec alone does not claim the feature is implemented.

## Validation and Acceptance

### Automated Coverage

- Contract and normalization: every template, null/omitted optional fields,
  blank/invalid identities, malformed or unrelated URLs, disagreeing slug/URL,
  unsupported versions, wrong-type sections, unknown fields, limits, and
  field-specific diagnostic paths.
- Pure planning: duplicate folding, explicit metadata precedence over minimal
  references, existing scalar preservation, company normalization ambiguity,
  stored topic aliases, stable group IDs, collision reporting, ordered appends,
  and existing cross-group placement.
- Repository/service integration with the actual SQLite test database: mixed
  valid/invalid input, standalone label files, track-only placeholder creation,
  populated practice/progress preservation, atomic rollback, and repeat imports
  causing no writes or timestamp changes.
- Runtime: sender authorization, reparsing at the trusted boundary, concurrent
  queued mutations, stale-plan rejection, no-op side-effect suppression,
  snapshot failure/retry, and correct cache/sync integration.
- UI: file selection/replacement/cancel, preview totals, actionable diagnostics,
  all-invalid/all-existing files, partial success, stale preview, duplicate-click
  prevention, persistence failure, and accessible state announcements.
- Regression: existing problem/track edit behavior, backup restore, and sync
  contracts remain correct. No schema or migration changes.

### Human Smoke and Visual Proof

Before implementation PR review or merge, a human engineer runs and records:

1. Import a valid 250-question, multi-group curriculum; inspect order, metadata,
   and newly created questions. Reload and verify persistence.
2. Import it again; verify no additions and preserved progress.
3. Edit a title, reorder groups/questions, complete/suspend questions, and record
   reviews. Import an expanded file; verify all prior edits and practice facts
   remain while new content appends.
4. Import company-only, topic-only, and track-only files. Verify existing labels
   and known topic aliases are reused and no track is automatically activated.
5. Import mixed valid/invalid entries and null metadata. Inspect every skipped
   item and confirm the valid subset matches the preview.
6. Change relevant catalog state between preview and apply. Confirm a refreshed
   preview appears with no import writes until the next explicit action.
7. Exercise a controlled transaction failure and snapshot failure/retry through
   a test harness. Verify the UI distinguishes rollback from unconfirmed
   durability and does not claim a false success.

Attach screenshots or a screen recording of happy-path and edge-case flows.
Automated tests do not replace this proof.

### Required Implementation Commands

Run focused tests first, then the strictest applicable governance set:

```sh
npx vitest run src/features/imports
npm run db:check
npm run lint
npm run check
npm run build
```

The phase plan must additionally name the exact touched problem, track,
runtime, and UI test paths. Format all touched files; explicitly format/check
new spec Markdown despite the repository's historical planning-doc ignore.
`npm run db:generate` is not applicable because this design changes no schema.

This design-only change requires Markdown formatting and diff review. Runtime,
database, build, and human smoke commands are reserved for implementation and
must not be represented as already run.

## Delivery Boundaries

Use this as the master design. After written-spec approval, writing-plans should
produce phase-sized plans with exact files, tests, and completion criteria:

1. Define the public contract, templates, normalizer, diagnostics, and pure merge
   planning rules.
2. Add owning-feature read/additive-write operations and trusted preview/apply
   integration, including atomicity, freshness, and persistence outcomes.
3. Deliver the Settings workflow, current-authority documentation, complete
   integration validation, and human smoke checklist/proof.

## Exclusions and Release Notes

Excluded: destructive replacement modes; metadata overwrite/enrichment on repeat
import; deleting, moving, or reordering existing content; importing practice or
completion data; arbitrary question providers; CSV/YAML adapters; third-party
scraping; company-to-track conversion; topic hierarchy/alias authoring;
auto-activation; remote imports; accounts; new permissions; new sync behavior;
schema migrations; and an undo system.

Shipping the feature is a `feat(imports)` release change. The design document is
a `docs(imports)` change. Imported data uses existing table and backup shapes,
so disabling/reverting the import UI does not require removing imported content.
Automatic rollback of user-approved imports is not promised; the user retains
existing manual editing and backup recovery tools.
