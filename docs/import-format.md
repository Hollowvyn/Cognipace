# CogniPace Content Format, Version 1

This document defines the versioned JSON format for reusable questions
(`problems` in the file), tracks, companies, and topic labels. These rules are
the public v1 contract; the Settings import workflow is forthcoming and is not
shipped yet. This file format is separate from CogniPace's full-backup format.

The checked-in [JSON Schema](../public/import/cognipace-content-v1.schema.json)
is intended for editors and authoring tools. Ready-to-copy files are in
[`public/import/examples`](../public/import/examples/):
[minimal problems](../public/import/examples/minimal-problems.json),
[detailed problems](../public/import/examples/detailed-problems.json),
[companies](../public/import/examples/companies.json),
[topics](../public/import/examples/topics.json),
[track only](../public/import/examples/track-only.json), and
[combined content](../public/import/examples/combined.json).

## File envelope

Every file is a UTF-8 JSON object with this envelope:

```json
{
  "format": "cognipace-content",
  "version": 1,
  "problems": ["two-sum"],
  "tracks": [],
  "companies": null,
  "topics": []
}
```

| Field       | Required | Type                                              | Meaning                                                                                                               |
| ----------- | -------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `$schema`   | No       | String                                            | Optional editor hint pointing to a JSON Schema. It does not select runtime behavior, and CogniPace does not fetch it. |
| `format`    | Yes      | Exact string `cognipace-content`                  | Identifies this as a content file.                                                                                    |
| `version`   | Yes      | Integer `1`                                       | Selects the immutable v1 interpretation.                                                                              |
| `problems`  | No       | Array of problem references or objects, or `null` | Questions to add and optional metadata/label assignments.                                                             |
| `tracks`    | No       | Array of track objects, or `null`                 | Tracks with ordered groups and question references.                                                                   |
| `companies` | No       | Array of label strings or `null`                  | Company labels to register independently.                                                                             |
| `topics`    | No       | Array of label strings or `null`                  | Topic labels to register independently.                                                                               |

Unknown top-level fields are reported as warnings by the importer. An editor
may reject them under the strict authoring schema. Future incompatible meanings
or new sections require a new format version; an older importer rejects an
unsupported version rather than guessing. Content versioning is independent of
database and backup versions.

## Problems

`problems` accepts a slug string, a LeetCode problem URL, or an object with
metadata. A bare string supplies identity only. Group references use the same
string form; put shared metadata in the top-level `problems` section.

| Problem object field | Required               | Type                                           | Meaning                                                          |
| -------------------- | ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `slug`               | One of `slug` or `url` | Slug string or `null`                          | Stable LeetCode problem identity.                                |
| `url`                | One of `slug` or `url` | LeetCode problem URL or `null`                 | Alternate way to provide the problem identity.                   |
| `title`              | No                     | String or `null`                               | Display title. Blank values are treated as absent.               |
| `difficulty`         | No                     | `easy`, `medium`, `hard`, `unknown`, or `null` | Difficulty value.                                                |
| `isPremium`          | No                     | Boolean or `null`                              | Premium flag; strings and numbers are not converted to booleans. |
| `topics`             | No                     | Array of label strings/null entries, or `null` | Topic labels to assign directly to the problem.                  |
| `companies`          | No                     | Array of label strings/null entries, or `null` | Company labels to assign directly to the problem.                |

Objects must have a non-null `slug` or `url`; identity is never inferred from a
title. If both are supplied, the runtime importer requires them to resolve to
the same slug. URLs are accepted only for problem identity, not for track or
group slugs.

## Tracks and groups

Each track contains one or more groups. Group order and reference order in the
file are significant for additions.

| Track field   | Required | Type                   | Meaning                                                     |
| ------------- | -------- | ---------------------- | ----------------------------------------------------------- |
| `slug`        | Yes      | Slug string            | Stable track identity.                                      |
| `title`       | No       | String or `null`       | Display title; blank values are absent.                     |
| `description` | No       | String or `null`       | Track description; blank values are absent.                 |
| `groups`      | Yes      | Array of group objects | Ordered groups; the authoring schema requires at least one. |

| Group field | Required | Type                                 | Meaning                                                                     |
| ----------- | -------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `slug`      | Yes      | Slug string                          | Stable group identity within its track.                                     |
| `title`     | No       | String or `null`                     | Display title; blank values are absent.                                     |
| `problems`  | No       | Array of slug/URL strings, or `null` | Ordered question references. Missing, `null`, or empty means no references. |

An explicitly empty group is valid. If every supplied reference in a group is
invalid, the importer skips that group instead of creating an accidental empty
group. A track with no accepted groups is skipped. A skipped track or group
does not create questions or memberships implicitly.

## Identity and normalization

- Slugs for problems, tracks, and groups are trimmed and lowercased at runtime,
  then must match `[a-z0-9]+(?:-[a-z0-9]+)*`. Slugs are at most 200 characters.
  Punctuation is not removed and titles are not converted to identities.
- A problem URL must use HTTPS on `leetcode.com` or `www.leetcode.com`, without
  credentials or a non-default port, and have `/problems/<slug>/` as its path
  prefix. Query strings, fragments, and further problem-page path segments do
  not change its identity. The extracted slug must itself be valid.
- URL-shaped values that fail URL validation are rejected as URLs; they are not
  retried as bare slugs. Identity validation is offline and does not verify that
  a slug exists on LeetCode or fetch problem metadata.
- Titles and descriptions are trimmed. Blank values are absent. Difficulty
  values are trimmed and case-insensitive at runtime; accepted values are
  `easy`, `medium`, `hard`, and `unknown`.
- Labels are trimmed and internal whitespace is collapsed. Empty/blank labels
  are ignored. Label lookup uses a normalized key while existing display names
  are preserved.

The editor schema describes canonical spelling and does not prove that two
identity fields agree. For example, a problem object can pass schema validation
with a valid but mismatched `slug` and `url`; runtime validation must compare
their resolved identities. The runtime also accepts trimmed/lowercased slugs
and case-insensitive difficulty values, which are useful authoring
normalizations but are not canonical schema spellings. Schema success is not a
substitute for runtime validation.

## Nulls, empty values, and additive behavior

Missing and `null` optional sections mean no supplied data. A `null` metadata
field means “leave this value alone,” never “clear it.” Null label elements are
ignored. Empty arrays add nothing and clear nothing. An empty file has no
content to commit; a file whose valid content is already present has no changes
to apply.

Imports are additive and non-destructive:

- Existing question, company, topic, track, and group values keep their stored
  scalar fields and display names. Reimport never enriches or overwrites them.
- Existing question-topic and question-company associations are preserved;
  valid new associations are added as a union. Empty/null associations do not
  remove links.
- Existing track order, group order, question placements, and user edits stay
  as they are. New groups append after the current groups; new references
  append within their destination group. If a question already belongs to a
  group in that track, its local placement wins and an incoming move is
  reported instead of applied.
- A question may belong to groups in different tracks. Import does not change
  practice history, reviews, scheduling, completion/progress, due dates,
  settings, or track activation.
- A new problem receives a readable title based on its slug, `unknown`
  difficulty, and the existing storage default for its premium flag when those
  values were not supplied. This fallback is not externally verified metadata.

Companies are problem metadata and independent labels. Importing a company
does not create a track or associate it with questions unless the question
object supplies that company. Top-level `companies` and `topics` can register
labels without assigning them to a question; labels named in a problem object
can be created as needed, so repeating them at the top level is optional.
Topic hierarchy and alias authoring are outside v1.

## Duplicate precedence

Repeated content is folded before comparing it with local data:

- Repeated problem identities become one problem. For each scalar field, the
  first valid, non-null explicit value in file order wins. Conflicting later
  values produce a warning. Valid topics and companies are unioned. Minimal
  references do not mask metadata supplied by a later detailed object; missing
  values are filled only after explicit entries are folded.
- A reference in a track supplies identity only; it cannot override the
  top-level problem metadata.
- Repeated track and group slugs fold into one entry. The first supplied scalar
  value wins, while distinct groups and references retain first-appearance
  order. Conflicts are reported.
- A repeated question within one track takes its first accepted file
  placement, unless an existing local placement takes precedence.
- Repeated labels and identities do not create duplicate additions. Ambiguous
  matches among existing companies are reported and skipped rather than
  arbitrarily selected or merged.

## Partial imports and failures

The planned importer reports stable diagnostic codes, input paths, and
plain-language messages. A file-level error prevents previewing any content:
unreadable or invalid JSON, a non-object root, an incorrect `format`, an
unsupported version, or a resource limit exceeded. Identity failures skip the
affected problem/track/group entry. Invalid optional metadata is omitted with a
warning while an otherwise valid problem can still be accepted. Invalid label
elements and invalid individual group references are skipped; independent
valid sections and entries remain eligible.

A wrong-type optional top-level section is skipped with an error while other
valid sections remain eligible. Unknown fields at recognized object levels
produce warnings. If no recognized usable content remains, there is no import
action. Warnings do not discard otherwise valid entries. The authoring schema
is intentionally strict and can reject a whole file that the runtime importer
will partially salvage; a successful partial import does not mean the original
file conforms to the schema. Supplied strings are displayed as text: content
files cannot carry HTML, executable content, commands, settings, secrets, or
practice state.

Resource ceilings apply before preview and again at the trusted import
boundary:

| Limit         | Maximum                                                         |
| ------------- | --------------------------------------------------------------- |
| File size     | 5 MiB of UTF-8 bytes                                            |
| Array entries | 50,000 total entries across all arrays, including nested arrays |
| Slug length   | 200 characters                                                  |

These limits reject an over-limit file; they do not truncate it. A syntactically
valid slug is not a promise that the corresponding problem exists. No
third-party dataset is bundled or scraped by the format.

## Examples and compatibility

Use one of the linked templates above as a starting point. The combined form
can describe metadata once and then refer to those questions from ordered
track groups. An abbreviated NeetCode-style track can use a `neetcode-250` track
slug and its ordered group slugs; external dataset content must be authored or
converted separately.

Version 1 semantics are immutable. Do not redefine a v1 field or add a v1
section with new meaning. An incompatible change requires a new version with
explicit compatibility handling. Full-backup restore remains a separate
workflow and format: a backup is not accepted as a content file, and content
import does not restore or replace a user's library, curriculum edits, or
practice data.

The Settings > Data Management preview/apply workflow and template picker are
not shipped yet. They are planned to use this contract and show additions and
diagnostics before any writes.
