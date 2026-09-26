# Content Import Phase 1: Contract and Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the public version-1 format, downloadable examples, and a deterministic read-only import planner.

**Architecture:** Strict authoring schemas describe well-formed files; granular parsing salvages valid content and records diagnostics. A normalized document feeds a pure planner over owner-provided catalog projections. The planner emits only missing rows and relationships.

**Tech Stack:** TypeScript, Zod 4, Vitest, Node's built-in file APIs for schema generation.

---

Read the [master plan](./2026-09-26-non-destructive-content-import.md) and
[approved design](../specs/2026-09-26-non-destructive-content-import-design.md).
This phase does not register runtime methods or change Settings UI.

## File Map

| Files to create                                                                                                                               | Responsibility                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/features/imports/api/content-file-contracts.ts`                                                                                          | Strict authoring schemas and version/resource constants           |
| `src/features/imports/api/content-file-contracts.test.ts`                                                                                     | Schema/example alignment                                          |
| `src/features/imports/domain/import-types.ts`                                                                                                 | Normalized input, diagnostics, plans, preview types               |
| `src/features/problems/domain/problem-import.ts`                                                                                              | Problems-owner read/change projection types                       |
| `src/features/tracks/domain/track-import.ts`                                                                                                  | Tracks-owner read/change projection types                         |
| `src/features/imports/domain/import-identity.ts` and `.test.ts`                                                                               | Strict slug/URL identity and normalized labels                    |
| `src/features/imports/domain/import-normalization.ts` and `.test.ts`                                                                          | Envelope, resource checks, folding, and orchestration             |
| `src/features/imports/domain/import-entry-normalization.ts`                                                                                   | Field-level problem/group/track parsing with paths                |
| `src/features/imports/domain/import-plan.ts` and `.test.ts`                                                                                   | Composition, previews, and relevant-state projection              |
| `src/features/imports/domain/plan-import-problems.ts`                                                                                         | Question and taxonomy additions                                   |
| `src/features/imports/domain/plan-import-tracks.ts`                                                                                           | Stable group identities and ordered appends                       |
| `src/features/imports/testing/import-fixtures.ts`                                                                                             | Small typed documents and empty projections                       |
| `scripts/generate-import-schema.mjs`                                                                                                          | Deterministic schema output                                       |
| `public/import/cognipace-content-v1.schema.json`                                                                                              | Generated editor schema                                           |
| `public/import/examples/minimal-problems.json`, `detailed-problems.json`, `companies.json`, `topics.json`, `track-only.json`, `combined.json` | Six downloadable templates                                        |
| `docs/import-format.md`                                                                                                                       | Human contract; mark UI availability as forthcoming until Phase 3 |

Do not add a generic handler registry. The two entity planners have explicit
inputs/outputs. Keep helper files near their owner, and do not split simple
functions into one-file-per-function modules.

## Task 1: Define Shared Types and Strict Authoring Contracts

**Files:** Create `content-file-contracts.ts`, its test, `import-types.ts`, and
the two owner-domain projection files listed above.

- [ ] Add the following authoring test to `content-file-contracts.test.ts`.

```ts
import { describe, expect, it } from 'vitest'
import { contentFileSchema } from './content-file-contracts'

describe('content file authoring contract', () => {
  it('allows sparse questions and optional null metadata', () => {
    expect(
      contentFileSchema.safeParse({
        format: 'cognipace-content',
        version: 1,
        problems: [
          'two-sum',
          {
            url: 'https://leetcode.com/problems/valid-anagram/',
            difficulty: null,
          },
        ],
        companies: null,
      }).success,
    ).toBe(true)
  })

  it('catches misspelled fields and objects without identity', () => {
    for (const problem of [
      { title: 'Two Sum' },
      { slug: 'two-sum', difficulity: 'easy' },
    ]) {
      expect(
        contentFileSchema.safeParse({
          format: 'cognipace-content',
          version: 1,
          problems: [problem],
        }).success,
      ).toBe(false)
    }
  })
})
```

- [ ] Run `rtk proxy npx vitest run src/features/imports/api/content-file-contracts.test.ts`; expect failure because the contract module is absent.
- [ ] Define the authoring schemas without transforms or custom refinements, so JSON Schema conversion remains deterministic. Semantic identity agreement remains a parser responsibility.

```ts
import { z } from 'zod'

export const contentFormat = 'cognipace-content' as const
export const contentVersion = 1 as const
export const maxImportBytes = 5 * 1024 * 1024
export const maxImportArrayEntries = 50_000
export const importSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const importUrlSchema = z
  .string()
  .regex(
    /^https:\/\/(?:www\.)?leetcode\.com(?::443)?\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*(?:[/?#].*)?$/,
  )
export const problemReferenceSchema = z.union([
  importSlugSchema,
  importUrlSchema,
])
const labels = z.array(z.string().min(1).nullable()).nullish()
const fields = {
  slug: importSlugSchema.nullish(),
  url: importUrlSchema.nullish(),
  title: z.string().nullish(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'unknown']).nullish(),
  isPremium: z.boolean().nullish(),
  topics: labels,
  companies: labels,
}
export const problemObjectSchema = z.union([
  z.strictObject({ ...fields, slug: importSlugSchema }),
  z.strictObject({ ...fields, url: importUrlSchema }),
])
export const groupObjectSchema = z.strictObject({
  slug: importSlugSchema,
  title: z.string().nullish(),
  problems: z.array(problemReferenceSchema).nullish(),
})
export const trackObjectSchema = z.strictObject({
  slug: importSlugSchema,
  title: z.string().nullish(),
  description: z.string().nullish(),
  groups: z.array(groupObjectSchema).min(1),
})
export const contentFileSchema = z.strictObject({
  $schema: z.string().optional(),
  format: z.literal(contentFormat),
  version: z.literal(contentVersion),
  problems: z
    .array(z.union([problemReferenceSchema, problemObjectSchema]))
    .nullish(),
  tracks: z.array(trackObjectSchema).nullish(),
  companies: labels,
  topics: labels,
})
```

The published schema describes canonical spelling. Runtime additionally accepts
trimmed/lowercased slugs and difficulty values, with identical meaning. Document
these normalization conveniences; never use schema success as a substitute for
runtime URL parsing or identity agreement.

- [ ] Define owner-domain types using existing schema row types. These are internal projections, not public file formats.

```ts
// src/features/problems/domain/problem-import.ts
import type { ProblemRow } from '@/platform/db/schema/problems'
export type ImportedProblem = Omit<ProblemRow, 'createdAt' | 'updatedAt'>
export type ImportedLabel = { id: string; label: string }
export type ImportedTopicLink = { problemSlug: string; topicId: string }
export type ImportedCompanyLink = { problemSlug: string; companyId: string }
export interface ProblemImportState {
  problems: ImportedProblem[]
  topics: ImportedLabel[]
  companies: ImportedLabel[]
  aliases: { aliasKey: string; topicId: string }[]
  problemTopics: ImportedTopicLink[]
  problemCompanies: ImportedCompanyLink[]
}
export type ProblemImportChanges = Omit<ProblemImportState, 'aliases'>
```

```ts
// src/features/tracks/domain/track-import.ts
import type { TrackRow } from '@/platform/db/schema/tracks'
import type { TrackGroupRow } from '@/platform/db/schema/track-groups'
export type ImportedTrack = Omit<TrackRow, 'createdAt' | 'updatedAt'>
export type ImportedGroup = Omit<TrackGroupRow, 'createdAt' | 'updatedAt'>
export type ImportedMembership = {
  trackId: string
  trackGroupId: string
  problemSlug: string
  position: number
}
export interface TrackImportState {
  tracks: ImportedTrack[]
  groups: ImportedGroup[]
  memberships: ImportedMembership[]
}
export type TrackImportChanges = TrackImportState
```

- [ ] Define the shared normalized/plan interfaces below. Use nullable fields rather than assigning `undefined` under `exactOptionalPropertyTypes`.

```ts
// src/features/imports/domain/import-types.ts
import type {
  ProblemImportChanges,
  ProblemImportState,
} from '@/features/problems/domain/problem-import'
import type {
  TrackImportChanges,
  TrackImportState,
} from '@/features/tracks/domain/track-import'

export type ImportDiagnostic = {
  severity: 'warning' | 'error'
  code: string
  path: string
  message: string
}
export type LabelDraft = { label: string; path: string }
export type ProblemDraft = {
  slug: string
  path: string
  title: string | null
  difficulty: 'easy' | 'medium' | 'hard' | 'unknown' | null
  isPremium: boolean | null
  topics: LabelDraft[]
  companies: LabelDraft[]
}
export type GroupDraft = {
  slug: string
  path: string
  title: string | null
  problems: { slug: string; path: string }[]
}
export type TrackDraft = {
  slug: string
  path: string
  title: string | null
  description: string | null
  groups: GroupDraft[]
}
export type NormalizedImport = {
  problems: ProblemDraft[]
  tracks: TrackDraft[]
  topics: LabelDraft[]
  companies: LabelDraft[]
}
export type NormalizationResult =
  | { status: 'blocked'; diagnostics: ImportDiagnostic[] }
  | {
      status: 'valid'
      document: NormalizedImport
      diagnostics: ImportDiagnostic[]
    }
export type ImportState = {
  catalog: ProblemImportState
  curriculum: TrackImportState
}
export type ImportChanges = {
  catalog: ProblemImportChanges
  curriculum: TrackImportChanges
}
export type ImportCounts = {
  problems: number
  topics: number
  companies: number
  problemTopics: number
  problemCompanies: number
  tracks: number
  groups: number
  memberships: number
}
export type ImportItem = {
  kind: keyof ImportCounts
  identity: string
  label: string
  action: 'add' | 'retain'
  path: string
}
export type ImportPreview = {
  status: 'ready' | 'unchanged' | 'empty' | 'blocked'
  fingerprint: string | null
  additions: ImportCounts
  items: ImportItem[]
  diagnostics: ImportDiagnostic[]
}
export type ImportPlan = {
  changes: ImportChanges
  preview: ImportPreview
  fingerprintInput: string
}
```

- [ ] Rerun the focused contract test; expect PASS. Run `rtk proxy npm run typecheck` after WXT preparation succeeds.
- [ ] Commit only these files as `feat(imports): define content format and import domain contracts`.

## Task 2: Publish Schema and Six Templates

**Files:** Create the generator, generated schema, all six examples, and
`docs/import-format.md`; extend `content-file-contracts.test.ts`.

- [ ] Add a drift test with imports from `node:fs`, `node:path`, and Zod's `z`: read all six named templates, parse JSON, and require `contentFileSchema.safeParse(value).success`. Assert the checked-in schema equals `z.toJSONSchema(contentFileSchema, { target: 'draft-2020-12' })`. Missing files make the initial test fail.
- [ ] Run `rtk proxy npx vitest run src/features/imports/api/content-file-contracts.test.ts`; expect missing-template/schema failures.
- [ ] Add the complete generator:

```js
// scripts/generate-import-schema.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { contentFileSchema } from '../src/features/imports/api/content-file-contracts.ts'

const directory = new URL('../public/import/', import.meta.url)
mkdirSync(directory, { recursive: true })
writeFileSync(
  new URL('cognipace-content-v1.schema.json', directory),
  JSON.stringify(
    z.toJSONSchema(contentFileSchema, { target: 'draft-2020-12' }),
    null,
    2,
  ) + '\n',
)
```

- [ ] Create the six template payloads exactly as follows, each wrapped in `{ "format": "cognipace-content", "version": 1, ...payload }`. The spread notation here describes composing the JSON document; do not write spread syntax into a JSON file.

```json
{
  "minimal-problems.json": {
    "problems": ["two-sum", "https://leetcode.com/problems/valid-anagram/"]
  },
  "detailed-problems.json": {
    "problems": [
      {
        "slug": "two-sum",
        "title": "Two Sum",
        "difficulty": "easy",
        "isPremium": null,
        "topics": ["Array", "Hash Table"],
        "companies": []
      }
    ]
  },
  "companies.json": { "companies": ["Example Company"] },
  "topics.json": {
    "topics": ["Dynamic Programming", "Memoization", "Sliding Window"]
  },
  "track-only.json": {
    "tracks": [
      {
        "slug": "interview-essentials",
        "title": "Interview Essentials",
        "groups": [
          {
            "slug": "arrays",
            "title": "Arrays",
            "problems": ["two-sum", "contains-duplicate"]
          },
          {
            "slug": "strings",
            "title": "Strings",
            "problems": ["valid-anagram"]
          }
        ]
      }
    ]
  },
  "combined.json": {
    "problems": [
      {
        "slug": "two-sum",
        "title": "Two Sum",
        "difficulty": "easy",
        "companies": ["Example Company"],
        "topics": ["Array"]
      }
    ],
    "companies": ["Example Company"],
    "topics": ["Array"],
    "tracks": [
      {
        "slug": "interview-essentials",
        "title": "Interview Essentials",
        "groups": [
          {
            "slug": "arrays",
            "title": "Arrays",
            "problems": ["two-sum", "contains-duplicate"]
          }
        ]
      }
    ]
  }
}
```

- [ ] Run `rtk proxy node scripts/generate-import-schema.mjs`, then `rtk proxy npx prettier --write public/import scripts/generate-import-schema.mjs docs/import-format.md` after writing the format reference.
- [ ] Write the reference with the exact field tables, identity rules, examples, null/empty semantics, local-value preservation, duplicate precedence, limits, partial-import behavior, immutable version policy, and distinction from full backup in the approved design. Explicitly say editor schemas use canonical spelling and do not prove cross-field identity agreement. Label the Settings workflow as not yet shipped until Phase 3.
- [ ] Rerun the contract test; expect six conforming templates and structural schema equality. No network/schema fetch is allowed.
- [ ] Commit as `feat(imports): publish versioned schema and content templates`.

Schema conversion was checked against current [Zod documentation](https://github.com/colinhacks/zod/blob/main/packages/docs/content/json-schema.mdx) through Context7 while planning. Keep refinements/transforms outside the exported authoring schema.

## Task 3: Strict Identity and Bounded File Parsing

**Files:** Create `import-identity.ts` and its test; create
`import-normalization.ts` and its test; add fixtures.

- [ ] Add table-driven identity tests before implementation:

```ts
import { describe, expect, it } from 'vitest'
import { readProblemIdentity } from './import-identity'

describe('import identities', () => {
  it.each([
    [' TWO-SUM ', 'two-sum'],
    [
      'https://leetcode.com/problems/two-sum/description/?x=1#answer',
      'two-sum',
    ],
    ['https://example.com/problems/two-sum/', null],
    ['https://leetcode.com.evil.test/problems/two-sum/', null],
    ['https://user@leetcode.com/problems/two-sum/', null],
    ['https://leetcode.com:8080/problems/two-sum/', null],
    ['http://leetcode.com/problems/two-sum/', null],
    ['Two Sum', null],
    ['', null],
  ])('normalizes %s to %s', (input, expected) => {
    expect(readProblemIdentity(input)).toBe(expected)
  })
})
```

- [ ] Run `rtk proxy npx vitest run src/features/imports/domain/import-identity.test.ts`; expect missing export failure.
- [ ] Implement identity without falling back from rejected URLs to slugs:

```ts
export function readImportSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const slug = value.trim().toLowerCase()
  return slug.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ? slug
    : null
}

export function readProblemIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const input = value.trim()
  const slug = readImportSlug(input)
  if (slug) return slug
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null
    if (url.hostname !== 'leetcode.com' && url.hostname !== 'www.leetcode.com')
      return null
    const segments = url.pathname.split('/')
    if (segments[1] !== 'problems') return null
    return readImportSlug(segments[2])
  } catch {
    return null
  }
}
```

For object `url`, require an actual URL: a raw slug in that property must be
rejected, even though a bare string reference may be a slug. For object `slug`,
call only `readImportSlug`. Both supplied non-null identities must agree.
Reject raw backslashes in URL strings before `new URL`, since URL parsing may
otherwise repair a malformed address. Add this test with the implementation.

- [ ] Add envelope/resource tests through `normalizeImportFile(fileText: string): NormalizationResult`: invalid JSON, array root, backup discriminator, version 2, wrong-type optional section, UTF-8 multibyte input exceeding 5 MiB, and 50,001 nested array entries. The fatal outcome must have no document and zero future changes.
- [ ] Implement byte checking before `JSON.parse`; use an iterative stack to count array entries and traverse objects, stopping immediately over 50,000. This also avoids recursion overflow on adversarial nesting:

```ts
export function exceedsArrayEntryLimit(root: unknown, limit: number): boolean {
  const pending: unknown[] = [root]
  let count = 0
  while (pending.length > 0) {
    const value = pending.pop()
    if (Array.isArray(value)) {
      count += value.length
      if (count > limit) return true
      for (const child of value) pending.push(child)
    } else if (value !== null && typeof value === 'object') {
      for (const child of Object.values(value)) pending.push(child)
    }
  }
  return false
}
```

The normalizer checks plain JSON shape, header, then resources, then recognized
sections. Unknown keys yield `unknown-field`; wrong-type optional sections yield
`invalid-section`. Fatal codes are `invalid-json`, `invalid-envelope`,
`unsupported-version`, `file-too-large`, and `too-many-entries`. Diagnostics use
`$` for the root and paths such as `problems[2].difficulty` for fields.

- [ ] Rerun `rtk proxy npx vitest run src/features/imports/domain/import-identity.test.ts src/features/imports/domain/import-normalization.test.ts`; expect PASS.
- [ ] Commit as `feat(imports): validate identities and bound content files`.

## Task 4: Normalize Entries and Fold Duplicates

**Files:** Create `import-entry-normalization.ts`; extend normalization and
fixtures. All exports return the Task 1 types.

- [ ] Add this normalization regression and assert exact diagnostic paths in separate parameterized cases:

```ts
import { expect, it } from 'vitest'
import { normalizeImportFile } from './import-normalization'

it('folds explicit metadata before assigning defaults', () => {
  const result = normalizeImportFile(
    JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      problems: [
        'two-sum',
        {
          slug: 'two-sum',
          title: 'Two Sum',
          difficulty: ' EASY ',
          topics: [null, ' Array '],
        },
      ],
    }),
  )
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') throw new Error('Expected a valid document')
  expect(result.document.problems).toHaveLength(1)
  expect(result.document.problems[0]).toMatchObject({
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    isPremium: null,
    topics: [{ label: 'Array', path: 'problems[1].topics[1]' }],
  })
})
```

- [ ] Run `rtk proxy npx vitest run src/features/imports/domain/import-normalization.test.ts`; verify this behavior fails before adding folding.
- [ ] Add concrete parser functions with these contracts; each receives the diagnostics accumulator and records paths at the point the invalid value is discovered:

```ts
export type EntryNormalizer = {
  problem(
    value: unknown,
    path: string,
    diagnostics: ImportDiagnostic[],
  ): ProblemDraft | null
  track(
    value: unknown,
    path: string,
    diagnostics: ImportDiagnostic[],
  ): TrackDraft | null
  group(
    value: unknown,
    path: string,
    diagnostics: ImportDiagnostic[],
  ): GroupDraft | null
  labels(
    value: unknown,
    path: string,
    diagnostics: ImportDiagnostic[],
  ): LabelDraft[]
}
```

Implement these as named exports `normalizeProblemEntry`, `normalizeTrackEntry`,
`normalizeGroupEntry`, and `normalizeLabelEntries`, importing the Task 1 types.
For each object, enumerate allowed keys first. Validate identity next. Parse
optional scalars independently; a bad optional value cannot reject siblings.
For label arrays, skip null silently and reject empty normalized lookup keys.
For tracks, parse valid groups; reject a track with none. For groups, distinguish
explicit empty/missing/null references from a supplied non-empty list whose
every reference is invalid. The latter skips the group.

Duplicate scalar precedence uses the complete helper below after normalization;
it never treats `false` or `unknown` as absent:

```ts
function takeFirst<T>(
  current: T | null,
  incoming: T | null,
  path: string,
  diagnostics: ImportDiagnostic[],
): T | null {
  if (current === null) return incoming
  if (incoming !== null && incoming !== current) {
    diagnostics.push({
      severity: 'warning',
      code: 'conflicting-value',
      path,
      message: 'An earlier value for this identity is retained.',
    })
  }
  return current
}
```

Fold problems in insertion-ordered maps keyed by slug. Union labels by the
existing `normalizeTopicLookupKey` convention, retaining the first label/path.
Fold tracks by slug and their groups by scoped slug using insertion-ordered
maps. Fold repeated references by slug; preserve the first accepted group
placement and emit `placement-preserved` for later different groups. Do not
synthesize implicit questions here: local group collisions are only known in
the planner.

- [ ] Cover every row in this table with input and expected normalized output/diagnostics in the same test file:

| Case                                | Expected                                       |
| ----------------------------------- | ---------------------------------------------- |
| `slug: null`, valid `url`           | Accepted identity                              |
| Bad supplied slug with valid URL    | Entire question skipped                        |
| Disagreeing slug/URL                | `identity-conflict` on question                |
| `difficulty: 'extreme'`, valid slug | Question accepted; difficulty null and warning |
| `isPremium: 'false'`                | Omit field with warning; never coerce          |
| Null/empty optional labels          | Empty additions; no deletion intent            |
| Invalid one label/reference         | Preserve valid siblings and paths              |
| Bad group identity                  | No child implicit questions                    |
| Empty explicit group                | Retain group                                   |
| All references invalid              | Skip group; possibly enclosing track           |
| Duplicate track/group slugs         | Fold contents, preserve first explicit scalar  |
| Duplicate bare/detailed question    | First explicit non-null scalar wins            |
| Unknown root/nested keys            | `unknown-field`, retained valid known fields   |

- [ ] Rerun the normalization tests; expect PASS. Commit as `feat(imports): normalize partial content and fold duplicates`.

## Task 5: Plan Catalog and Curriculum Additions

**Files:** Create both entity planners and `import-plan.ts`/`.test.ts`; extend
fixtures with `emptyImportState()` returning all Task 1 arrays empty.

- [ ] Write tests for the concrete pure interface:

```ts
import { expect, it } from 'vitest'
import { normalizeImportFile } from './import-normalization'
import { buildImportPlan } from './import-plan'
import { emptyImportState } from '../testing/import-fixtures'

it('retains stored metadata and plans only missing label joins', () => {
  const state = emptyImportState()
  state.catalog.problems.push({
    slug: 'two-sum',
    title: 'My title',
    difficulty: 'hard',
    isPremium: true,
  })
  const input = normalizeImportFile(
    JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      problems: [
        {
          slug: 'two-sum',
          title: 'Incoming title',
          difficulty: 'easy',
          topics: ['Array'],
        },
      ],
    }),
  )
  const plan = buildImportPlan(input, state)
  expect(plan.changes.catalog.problems).toEqual([])
  expect(plan.changes.catalog.topics).toEqual([{ id: 'array', label: 'Array' }])
  expect(plan.changes.catalog.problemTopics).toEqual([
    { problemSlug: 'two-sum', topicId: 'array' },
  ])
  expect(state.catalog.problems[0]?.title).toBe('My title')
  expect(plan.preview.additions.problems).toBe(0)
})
```

- [ ] Run `rtk proxy npx vitest run src/features/imports/domain/import-plan.test.ts`; expect missing planner failure.
- [ ] Implement explicit planner functions with the following inputs/outputs, using owner-domain row shapes from Task 1:

```ts
// plan-import-tracks.ts
export type PlannedTracks = {
  changes: TrackImportChanges
  references: { slug: string; path: string }[]
  items: ImportItem[]
  diagnostics: ImportDiagnostic[]
  relevantState: TrackImportState
}
// planImportTracks(tracks: TrackDraft[], state: TrackImportState): PlannedTracks

// plan-import-problems.ts
export type PlannedProblems = {
  changes: ProblemImportChanges
  items: ImportItem[]
  diagnostics: ImportDiagnostic[]
  relevantState: ProblemImportState
}
// planImportProblems(document: NormalizedImport, references: PlannedTracks['references'], state: ProblemImportState): PlannedProblems

// import-plan.ts
// buildImportPlan(input: NormalizationResult, state: ImportState): ImportPlan
```

Implement curriculum planning first: look up a track by slug; check new-track ID
collisions; check expected group ID/owner and fallback-title ambiguity; plan new
groups after maximum existing position. Only then expose accepted references
to the problem planner. Use a map keyed by `(trackId, problemSlug)` for existing
and newly planned memberships. Preserve local placement; append missing
memberships after each group's maximum position. Do not create empty tracks
whose groups were all rejected by local identity conflicts.

Problem planning then combines explicit records and accepted references. Reuse
stored metadata wholesale for existing questions. New rows get final explicit
metadata or slug/default fallbacks. Resolve topics in existing precedence order:
ID, normalized label, stored alias, then new label. Use deterministic key order
when resolving multiple equivalent topic matches, matching the existing
resolver's effective selection; if distinct topic candidates are ambiguous,
report and skip that label instead of making preview depend on row order.
Company matches with multiple distinct IDs always report ambiguity. Union joins
using composite keys. Existing and planned labels participate in the same
lookup so repeated references create only one label.

Build preview items for distinct additions and retained entities/relationships.
Use `kind: 'memberships'` with a stable composite identity for track links.
Retained scalar differences produce `existing-value-preserved`; unchanged
identities need not create warnings. Counts are lengths of the eight change
arrays. `ready` means sum > 0; `unchanged` means accepted logical entries but no
additions; `empty` means no accepted logical entries; fatal normalization is
`blocked` with empty changes. Items/diagnostics remain deterministic.

Fingerprint input is a canonical JSON string containing normalized input,
normalization diagnostics, the relevant-state projections, and final changes
and diagnostics. Include relevant aliases and all groups/memberships of each
referenced track, because they affect collisions and positions. Include only
questions/labels whose identities are considered. New matching records must
appear in that projection after a concurrent change. Exclude timestamps and
practice data. Sort unordered DB arrays by full stable identity; do not sort
curriculum/source arrays whose order has semantic meaning. `preview.fingerprint`
is null until Phase 2 hashes `fingerprintInput`.

- [ ] Add behavior tests with these exact checks:

| Scenario                                             | Assertion                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| New 250-reference curriculum                         | 250 unique problems/memberships, file order, no practice operations |
| Apply planned rows to an in-memory state and rebuild | All eight change arrays empty                                       |
| Existing unknown metadata + detailed import          | Zero scalar updates                                                 |
| Existing track/group with changed title              | Stable ID reused; title retained                                    |
| New group/reference among existing ones              | Append after existing maximum; no renumber                          |
| Same question in another local group                 | No new membership, placement warning                                |
| Group identity collision                             | No implicit child problems; valid top-level problems survive        |
| Existing topic alias                                 | Canonical topic ID in join; no new alias/topic                      |
| Company normalized label ambiguity                   | No company/link creation for that label                             |
| Reversed DB return order                             | Same `fingerprintInput` and plan                                    |
| Changed relevant title/order/alias                   | Different `fingerprintInput`                                        |
| Invalid/empty/null sections                          | Correct status; no writes possible                                  |

- [ ] Rerun `rtk proxy npx vitest run src/features/imports`; expect all Phase 1 tests pass.
- [ ] Run `rtk proxy npm run lint` and `rtk proxy npm run check`; fix only phase-introduced failures.
- [ ] Commit as `feat(imports): plan additive catalog and curriculum changes`.

## Phase Completion

- [ ] No database/runtime/UI mutations were introduced.
- [ ] All six templates validate against the authoring contract and produce expected plans.
- [ ] Every normalization/merge rule in the design has an assertion in the named test files.
- [ ] Public format docs explicitly describe preservation of existing fallback metadata.
- [ ] Record exact commands/results/skips. Continue to Phase 2 only after reviewing the Phase 1 diff.
