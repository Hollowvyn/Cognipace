# FSRS Phase A: Preserving The Shipped Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register today's shipped snapshot as a supported future-upgrade source and prove its history, progress and settings survive staged upgrade, failure and reopen.

**Architecture:** Extend Platform's existing baseline allowlist and recovery routing, preserving the current staged snapshot lifecycle. Test a synthetic additive suffix through the real singleton without shipping a schema migration. Background composition skips historical taxonomy reconciliation for the already-current through-0009 source while retaining fresh and older upgrade behavior.

**Tech Stack:** TypeScript, SQLite WASM, Vitest, Zod's existing recovery parser, WXT; no new dependency.

**Execution status:** Implemented with required automated checks passing. Human installed-extension proof remains pending before PR review or merge. Exact commands, repaired failures, review evidence and future migration limits are in the [handoff](../handoffs/2026-10-03-fsrs-phase-a-preservation.md). Execution rebased onto `origin/main` at `b2d9291f`; the frozen SQL prefix was unchanged.

---

## Scope and prerequisites

Source: [approved design](../specs/2026-10-03-fsrs-remediation-design.md). Execution map: [all eight findings](./2026-10-03-fsrs-remediation.md). This is slice A, covering the preservation prerequisite from priority 8. Priorities 1–7 and the remaining parts of 8 have their own acceptance boundaries; this phase does not implement them.

The exact current baseline is ten lexically ordered SQL files through **`0009_mushy_beyonder.sql`**, joined with `\n`: fingerprint **`1144ce07`**, 26,882 characters at `dc0fc6f2`. The synthetic `0009_external_progress.sql` used in an older test is not the shipped filename. Preserve `b1c2b4d7` through 0007 and `a35941fc` through 0008.

Do not add 0010, change shipped SQL, change scheduling defaults, replay cards, deduplicate reviews, rewrite due dates or reconcile track credit. Matching current snapshots still skip preparation/publication. The new recovery slot becomes active only when the through-0009 fingerprint is an upgrade source.

Use the repository-pinned Node 24.20.0/npm 11.19.0. Check the existing task branch before execution. Install local dependencies using that toolchain with `rtk npm ci`; repository dependencies are absent at planning time. Do not bypass `devEngines` or rely on another worktree's WASM installation. Load `cognipace-agent-workflow`, `vitest`, the migration skill and `verification-before-completion`; use Context7 when implementation requires current library API details. The code below follows existing local APIs.

## File map

| File                                                                        | Change and responsibility                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Create `src/testing/fixtures/fsrs-remediation-legacy-migrations.ts`         | Pin the current shipped SQL prefix independently of the future migration list.                          |
| Modify `src/platform/db/snapshot-upgrade.ts`                                | Recognize the exact through-0009 source, validate its prefix and select only appended SQL.              |
| Modify `src/platform/db/snapshot-state.ts`                                  | Add a third private recovery slot with the existing same-original retry/collision semantics.            |
| Modify `src/platform/db/instance.ts`                                        | Route that source to the FSRS recovery slot without changing staged publication order.                  |
| Create `src/testing/fixtures/fsrs-preservation.ts`                          | Build a nonempty owned row graph and compare every original column, including catalog relationships.    |
| Create `src/platform/db/fsrs-preservation.integration.test.ts`              | Use a test-only synthetic suffix to prove actual singleton upgrade, failure, flush and reopen behavior. |
| Modify `src/platform/db/snapshot-upgrade.test.ts`, `snapshot-state.test.ts` | Freeze compatibility boundaries and exercise independent recovery records.                              |
| Modify `src/extension/background/app-db.ts`, `app-db.test.ts`               | Avoid rerunning historical catalog conversion for the already-current source.                           |
| Modify `docs/architecture.md`, `docs/testing.md` during execution           | Document the implemented allowlist, private recovery export and human proof requirements.               |

Keep `src/platform/db/open-snapshot.ts`, shipped migrations, schema declarations and backup format unchanged. Existing `openSnapshot()` already preserves/restores/validates/upgrades/prepares/revalidates/publishes in the required order.

## Task 1: Freeze and recognize the through-0009 source

**Files:** create the migration fixture; modify `snapshot-upgrade.ts` and `snapshot-upgrade.test.ts`.

- [x] **Step 1: Create the frozen fixture and failing source-selection tests.**

Create `src/testing/fixtures/fsrs-remediation-legacy-migrations.ts`:

```ts
import migration0009 from '@/platform/db/migrations/0009_mushy_beyonder.sql?raw'
import { frozenV8MigrationEntries } from './tracks-external-progress-legacy-migrations'

export const frozenV9MigrationEntries = [
  ...frozenV8MigrationEntries,
  { path: './migrations/0009_mushy_beyonder.sql', sql: migration0009 },
] as const

// Shipped boundary: never update this to accommodate edits to historical SQL.
export const expectedV9MigrationFingerprint = '1144ce07'
export const frozenV9MigrationSql = frozenV9MigrationEntries
  .map((entry) => entry.sql)
  .join('\n')
```

Add `selectSnapshotBaselineSql` to the existing `snapshot-upgrade` import in `src/platform/db/snapshot-upgrade.test.ts`. Add this fixture import:

```ts
import {
  expectedV9MigrationFingerprint,
  frozenV9MigrationEntries,
  frozenV9MigrationSql,
} from '@/testing/fixtures/fsrs-remediation-legacy-migrations'
```

Append the following describe block. It uses the existing imports `migrationEntries`, `computeFingerprint` and `selectUpgradeSql`:

```ts
describe('shipped FSRS snapshot baseline', () => {
  it('pins all ten shipped files and selects only appended SQL', () => {
    const suffix = 'CREATE TABLE fsrs_upgrade_probe (id TEXT PRIMARY KEY);'
    const entries = [
      ...frozenV9MigrationEntries,
      { path: './migrations/0010_fsrs_upgrade_probe.sql', sql: suffix },
    ]

    expect(frozenV9MigrationEntries).toHaveLength(10)
    expect(frozenV9MigrationEntries.at(-1)?.path).toBe(
      './migrations/0009_mushy_beyonder.sql',
    )
    expect(migrationEntries.slice(0, 10)).toEqual(frozenV9MigrationEntries)
    expect(computeFingerprint(frozenV9MigrationSql)).toBe('1144ce07')
    expect(selectSnapshotBaselineSql(expectedV9MigrationFingerprint)).toBe(
      frozenV9MigrationSql,
    )
    expect(selectUpgradeSql(expectedV9MigrationFingerprint, entries)).toBe(
      suffix,
    )
    expect(
      selectUpgradeSql(
        expectedV9MigrationFingerprint,
        frozenV9MigrationEntries,
      ),
    ).toBe('')
  })

  it('rejects changed, reordered and missing shipped prefixes', () => {
    const changed = frozenV9MigrationEntries.map((entry, index) =>
      index === 9 ? { ...entry, sql: `${entry.sql}\n-- changed` } : entry,
    )
    const reordered = [
      frozenV9MigrationEntries[1],
      frozenV9MigrationEntries[0],
      ...frozenV9MigrationEntries.slice(2),
    ]

    for (const entries of [
      changed,
      reordered,
      frozenV9MigrationEntries.slice(0, 9),
    ]) {
      expect(() =>
        selectUpgradeSql(expectedV9MigrationFingerprint, entries),
      ).toThrow('The supported migration prefix has changed.')
    }
    expect(() => selectSnapshotBaselineSql('deadbeef')).toThrow(
      'This database version requires recovery; its original data was retained.',
    )
  })
})
```

- [x] **Step 2: Run the focused red test.**

Run: `rtk npm run test -- src/platform/db/snapshot-upgrade.test.ts -t 'shipped FSRS snapshot baseline'`.

Expected: the new source is rejected as unsupported. If the failure is dependency/toolchain setup, repair setup first; that is not the intended regression failure.

- [x] **Step 3: Register the immutable baseline.**

In `src/platform/db/snapshot-upgrade.ts`, insert after `legacyTrackMigrationPaths`:

```ts
export const legacyFsrsMigrationPaths = [
  ...legacyTrackMigrationPaths,
  './migrations/0009_mushy_beyonder.sql',
] as const
```

Insert after `legacyTrackMigrationSql`:

```ts
export const legacyFsrsMigrationSql = readBaselineSql(legacyFsrsMigrationPaths)
```

Insert beside the two existing literal fingerprints:

```ts
export const legacyFsrsMigrationFingerprint = '1144ce07'
```

Add this complete third object to `supportedBaselines`, after the existing objects:

```ts
{
  fingerprint: legacyFsrsMigrationFingerprint,
  paths: legacyFsrsMigrationPaths,
  sql: legacyFsrsMigrationSql,
},
```

Reuse existing `getSupportedBaseline()` prefix-path/fingerprint validation. Do not widen it to arbitrary fingerprints or infer source SQL from the current schema.

- [x] **Step 4: Run all source-selection and schema-integrity tests.**

Run: `rtk npm run test -- src/platform/db/snapshot-upgrade.test.ts`.

Expected: new and old baseline tests pass, including corruption and invalid selected-suffix cases.

- [x] **Step 5: Commit the compatibility boundary.**

```sh
rtk git add src/testing/fixtures/fsrs-remediation-legacy-migrations.ts src/platform/db/snapshot-upgrade.ts src/platform/db/snapshot-upgrade.test.ts
rtk git commit -m "fix(db): support the shipped FSRS snapshot baseline"
```

## Task 2: Retain the FSRS original independently

**Files:** modify `snapshot-state.ts` and `snapshot-state.test.ts`.

- [x] **Step 1: Add failing recovery-slot tests.**

Add `FSRS_RECOVERY_KEY` to the `snapshot-state` import in `src/platform/db/snapshot-state.test.ts`. Append:

```ts
describe('FSRS baseline recovery', () => {
  const now = new Date('2026-10-03T16:00:00.000Z')
  const raw = {
    [SNAPSHOT_KEY]: 'exact through-0009 original',
    [FINGERPRINT_KEY]: '1144ce07',
  }

  it('stores a third original without touching either earlier recovery', async () => {
    const earlier = {
      [RECOVERY_KEY]: {
        version: 1,
        raw: { [SNAPSHOT_KEY]: 'v7' },
        savedAt: now.toISOString(),
      },
      [TRACK_RECOVERY_KEY]: {
        version: 1,
        raw: { [SNAPSHOT_KEY]: 'v8' },
        savedAt: now.toISOString(),
      },
    }
    const values: Record<string, unknown> = { ...earlier }
    const storage = {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(
          Object.fromEntries(
            keys
              .filter((key) => Object.hasOwn(values, key))
              .map((key) => [key, values[key]]),
          ),
        ),
      ),
      set: vi.fn((next: Record<string, unknown>) => {
        Object.assign(values, next)
        return Promise.resolve()
      }),
    }

    await preserveRecovery(storage, raw, now, FSRS_RECOVERY_KEY)
    expect(values[RECOVERY_KEY]).toEqual(earlier[RECOVERY_KEY])
    expect(values[TRACK_RECOVERY_KEY]).toEqual(earlier[TRACK_RECOVERY_KEY])
    const original = values[FSRS_RECOVERY_KEY]
    expect(original).toEqual({ version: 1, raw, savedAt: now.toISOString() })

    await preserveRecovery(
      storage,
      raw,
      new Date(now.getTime() + 1000),
      FSRS_RECOVERY_KEY,
    )
    expect(values[FSRS_RECOVERY_KEY]).toEqual(original)
    expect(storage.set).toHaveBeenCalledOnce()
    await expect(
      preserveRecovery(
        storage,
        { ...raw, [SNAPSHOT_KEY]: 'another original' },
        now,
        FSRS_RECOVERY_KEY,
      ),
    ).rejects.toThrow(
      'An earlier database recovery record must be exported before another upgrade.',
    )
    expect(values[FSRS_RECOVERY_KEY]).toEqual(original)
    expect(storage.set).toHaveBeenCalledOnce()
  })

  it.each([undefined, null, { version: 2, raw, savedAt: 'invalid' }])(
    'rejects a present malformed FSRS recovery (%s)',
    async (existing) => {
      const storage = {
        get: vi.fn().mockResolvedValue({ [FSRS_RECOVERY_KEY]: existing }),
        set: vi.fn(),
      }
      await expect(
        preserveRecovery(storage, raw, now, FSRS_RECOVERY_KEY),
      ).rejects.toThrow(
        'An earlier database recovery record must be exported before another upgrade.',
      )
      expect(storage.set).not.toHaveBeenCalled()
    },
  )
})
```

- [x] **Step 2: Run the focused red test.**

Run: `rtk npm run test -- src/platform/db/snapshot-state.test.ts -t 'FSRS baseline recovery'`.

Expected: missing recovery-key export/type support fails the new cases.

- [x] **Step 3: Add the key and extend the existing recovery argument.**

Insert after `TRACK_RECOVERY_KEY` in `src/platform/db/snapshot-state.ts`:

```ts
export const FSRS_RECOVERY_KEY = 'cognipace_db_recovery_fsrs_v1'

type SnapshotRecoveryKey =
  | typeof RECOVERY_KEY
  | typeof TRACK_RECOVERY_KEY
  | typeof FSRS_RECOVERY_KEY
```

Replace only the fourth parameter declaration of `preserveRecovery()` with:

```ts
recoveryKey: SnapshotRecoveryKey = RECOVERY_KEY,
```

Keep the existing strict parser, same-original comparison, original timestamp and collision error. No replacement/removal of earlier recovery slots is permitted.

- [x] **Step 4: Verify all classification and recovery behavior.**

Run: `rtk npm run test -- src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts`.

Expected: all tests pass; partial fields, read/write failure and old recovery behavior remain covered.

- [x] **Step 5: Commit the independent recovery slot.**

```sh
rtk git add src/platform/db/snapshot-state.ts src/platform/db/snapshot-state.test.ts
rtk git commit -m "fix(db): retain an independent FSRS recovery original"
```

## Task 3: Prove populated singleton upgrade and reopen

**Files:** create `fsrs-preservation.ts` and `fsrs-preservation.integration.test.ts`; modify `instance.ts`.

- [x] **Step 1: Create the populated fixture.**

Create `src/testing/fixtures/fsrs-preservation.ts` with the full code below. Rows are preservation evidence, not an assertion that unknown legacy histories reproduce these cards under a particular profile.

```ts
import {
  createDb,
  createSqliteWasmLocator,
  type DbHandle,
} from '@/platform/db/client'
import { serializeDb } from '@/platform/db/snapshot'
import { frozenV9MigrationSql } from './fsrs-remediation-legacy-migrations'

export const preservationNow = new Date('2026-10-03T16:00:00.000Z')
const priorDay = Date.parse('2026-10-02T16:00:00.000Z')
const currentDay = preservationNow.getTime()
const twoDaysAgo = Date.parse('2026-10-01T16:00:00.000Z')

export const preservationTables = [
  'problems',
  'topics',
  'topic_aliases',
  'topic_relations',
  'companies',
  'problem_topics',
  'problem_companies',
  'problem_practice',
  'fsrs_cards',
  'review_attempts',
  'tracks',
  'track_groups',
  'track_group_problems',
  'track_problem_progress',
  'track_session',
  'settings_kv',
] as const

export function readPreservationRows(handle: DbHandle) {
  return Object.fromEntries(
    preservationTables.map((table) => [
      table,
      handle.rawDb.exec({
        sql: `SELECT * FROM "${table}" ORDER BY rowid`,
        returnValue: 'resultRows',
      }),
    ]),
  )
}

export function readProgressAttempts(handle: DbHandle) {
  const rows = handle.rawDb.exec({
    sql: 'SELECT problem_slug, reviewed_at FROM review_attempts ORDER BY reviewed_at, id',
    returnValue: 'resultRows',
  }) as Array<[string, number]>
  return rows.map(([problemSlug, reviewedAt]) => ({
    problemSlug,
    reviewedAt: new Date(reviewedAt),
  }))
}

function insert(
  handle: DbHandle,
  table: string,
  values: Record<string, string | number | null>,
) {
  const columns = Object.keys(values)
  handle.rawDb.exec({
    sql: `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    bind: Object.values(values),
  })
}

export async function makeFsrsPreservationSnapshot() {
  const handle = await createDb({
    migrationSql: frozenV9MigrationSql,
    locateWasm: createSqliteWasmLocator(),
  })
  try {
    for (const slug of ['day-a', 'day-b', 'fresh-zero', 'suspended']) {
      insert(handle, 'problems', {
        slug,
        title: slug,
        difficulty: 'medium',
        is_premium: 0,
        created_at: 11,
        updated_at: 12,
      })
    }
    insert(handle, 'topics', {
      id: 'custom-parent',
      label: 'Custom parent',
      created_at: 11,
      updated_at: 12,
    })
    insert(handle, 'topics', {
      id: 'custom-child',
      label: 'Custom child',
      created_at: 13,
      updated_at: 14,
    })
    insert(handle, 'topic_aliases', {
      alias_key: 'custom-alias',
      label: 'Custom alias',
      topic_id: 'custom-child',
      created_at: 15,
      updated_at: 16,
    })
    insert(handle, 'topic_relations', {
      source_topic_id: 'custom-child',
      target_topic_id: 'custom-parent',
      kind: 'broader',
      created_at: 17,
      updated_at: 18,
    })
    insert(handle, 'companies', {
      id: 'custom-company',
      label: 'Custom company',
    })
    insert(handle, 'problem_topics', {
      problem_slug: 'day-a',
      topic_id: 'custom-child',
    })
    insert(handle, 'problem_companies', {
      problem_slug: 'day-a',
      company_id: 'custom-company',
    })

    const cards = [
      {
        id: 'card-custom',
        slug: 'day-a',
        state: 'learning',
        reps: 3,
        lapses: 1,
        last: currentDay,
        due: currentDay + 3600000,
        stability: 2.3,
        difficulty: 5,
        days: 0,
        steps: 1,
      },
      {
        id: 'card-1',
        slug: 'day-b',
        state: 'review',
        reps: 2,
        lapses: 1,
        last: currentDay,
        due: currentDay + 5 * 86400000,
        stability: 7,
        difficulty: 4,
        days: 5,
        steps: 0,
      },
      {
        id: 'fresh-opaque',
        slug: 'fresh-zero',
        state: 'new',
        reps: 0,
        lapses: 0,
        last: null,
        due: priorDay,
        stability: 0,
        difficulty: 0,
        days: 0,
        steps: 0,
      },
      {
        id: 'suspended-opaque',
        slug: 'suspended',
        state: 'relearning',
        reps: 1,
        lapses: 1,
        last: twoDaysAgo,
        due: priorDay,
        stability: 1.2,
        difficulty: 8,
        days: 0,
        steps: 1,
      },
    ]
    for (const card of cards) {
      insert(handle, 'fsrs_cards', {
        id: card.id,
        problem_slug: card.slug,
        card_kind: 'default',
        due_at: card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.reps ? 1 : 0,
        scheduled_days: card.days,
        learning_steps: card.steps,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        last_review_at: card.last,
        created_at: 11,
        updated_at: 12,
      })
      insert(handle, 'problem_practice', {
        problem_slug: card.slug,
        status:
          card.slug === 'suspended'
            ? 'suspended'
            : card.slug === 'day-b'
              ? 'mastered'
              : card.state,
        first_seen_at: twoDaysAgo,
        last_seen_at: card.last,
        last_reviewed_at: card.last,
        last_rating:
          card.slug === 'fresh-zero'
            ? null
            : card.slug === 'suspended'
              ? 'hard'
              : 'good',
        last_elapsed_seconds: card.reps ? 1200 : null,
        best_elapsed_seconds: card.reps ? 600 : null,
        interview_pattern: 'two pointers',
        time_complexity: 'O(n)',
        space_complexity: 'O(1)',
        languages: 'TypeScript',
        notes: `Retain ${card.slug}`,
        solved_count: card.slug === 'day-a' ? 2 : card.reps ? 1 : 0,
        attempt_count: card.reps,
        is_suspended: card.slug === 'suspended' ? 1 : 0,
        created_at: 11,
        updated_at: 12,
      })
    }

    const attempts = [
      {
        id: 'attempt-a-1',
        slug: 'day-a',
        card: 'card-custom',
        rating: 'good',
        at: priorDay,
        updated: currentDay + 10000,
      },
      {
        id: 'attempt-b-1',
        slug: 'day-b',
        card: 'card-1',
        rating: 'again',
        at: priorDay,
        updated: priorDay,
      },
      {
        id: 'attempt-a-2',
        slug: 'day-a',
        card: 'card-custom',
        rating: 'again',
        at: currentDay,
        updated: currentDay,
      },
      {
        id: 'attempt-a-3',
        slug: 'day-a',
        card: 'card-custom',
        rating: 'good',
        at: currentDay,
        updated: currentDay + 20000,
      },
      {
        id: 'attempt-b-2',
        slug: 'day-b',
        card: 'card-1',
        rating: 'good',
        at: currentDay,
        updated: currentDay,
      },
      {
        id: 'attempt-s-1',
        slug: 'suspended',
        card: 'suspended-opaque',
        rating: 'hard',
        at: twoDaysAgo,
        updated: twoDaysAgo,
      },
    ]
    for (const [index, attempt] of attempts.entries()) {
      const log = JSON.stringify({
        rating: attempt.rating,
        state: 'review',
        dueAt: new Date(attempt.at).toISOString(),
        stability: 2.3,
        difficulty: 5,
        elapsedDays: 1,
        lastElapsedDays: 1,
        scheduledDays: 1,
        learningSteps: 0,
        reviewedAt: new Date(attempt.at).toISOString(),
      })
      insert(handle, 'review_attempts', {
        id: attempt.id,
        problem_slug: attempt.slug,
        card_id: attempt.card,
        rating: attempt.rating,
        review_mode: index % 2 ? 'manual' : 'leetcode',
        reviewed_at: attempt.at,
        elapsed_seconds: index === 0 ? 600 : 1200,
        is_correct: attempt.rating === 'again' ? 0 : 1,
        interview_pattern: 'two pointers',
        time_complexity: 'O(n)',
        space_complexity: 'O(1)',
        languages: 'TypeScript',
        notes: `Review ${attempt.id}`,
        fsrs_review_log: log,
        created_at: attempt.at,
        updated_at: attempt.updated,
      })
    }
    insert(handle, 'tracks', {
      id: 'owned-track',
      slug: 'owned-track',
      title: 'Owned',
      due_at: currentDay + 86400000,
      allow_external_progress: 1,
      created_at: 11,
      updated_at: 12,
    })
    insert(handle, 'track_groups', {
      id: 'owned-group',
      track_id: 'owned-track',
      title: 'Chapter',
      position: 3,
      created_at: 11,
      updated_at: 12,
    })
    for (const [index, slug] of ['day-a', 'day-b'].entries()) {
      insert(handle, 'track_group_problems', {
        track_group_id: 'owned-group',
        track_id: 'owned-track',
        problem_slug: slug,
        position: index + 7,
      })
      insert(handle, 'track_problem_progress', {
        track_id: 'owned-track',
        problem_slug: slug,
        review_attempt_id: slug === 'day-a' ? 'attempt-a-3' : null,
        completed_at: slug === 'day-a' ? currentDay : priorDay,
        completed_rating: slug === 'day-a' ? 'good' : 'hard',
        created_at: 11,
        updated_at: 12,
      })
    }
    insert(handle, 'track_session', {
      id: 'active',
      active_track_id: 'owned-track',
      active_group_id: 'owned-group',
      started_at: priorDay,
      updated_at: currentDay,
    })
    const settings = {
      schemaVersion: 1,
      analytics: {
        targetRecall: 0.8,
        targetReviewSuccess: 0.85,
        targetFirstAttemptSuccess: 0.7,
        targetFirstAttemptGoodEasy: 0.65,
      },
      appearance: { themeMode: 'dark' },
      practice: {
        dailyGoal: 2,
        mode: 'studyPlan',
        problemFilters: { skipPremium: true },
      },
      review: { targetRetention: 0.75, order: 'dueFirst' },
      assessment: {
        requireSolveTime: true,
        strictTiming: true,
        timeTargetsMinutes: { easy: 20, medium: 35, hard: 50 },
      },
      aiAssessment: { enabled: false, provider: 'openai', model: '' },
      overlay: { autoDetectSolved: false },
      reminders: { daily: { enabled: true, time: '18:30' } },
    }
    insert(handle, 'settings_kv', {
      key: 'user-settings',
      value: JSON.stringify(settings),
      updated_at: 12,
    })
    insert(handle, 'settings_kv', {
      key: 'unrelated-preference',
      value: '{"retain":true}',
      updated_at: 19,
    })
    const rows = readPreservationRows(handle)
    const attemptsForProgress = readProgressAttempts(handle)
    return { bytes: serializeDb(handle), rows, attemptsForProgress, settings }
  } finally {
    handle.rawDb.close()
  }
}
```

- [x] **Step 2: Create the failing real startup test.**

Create `src/platform/db/fsrs-preservation.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Test-only target: never create this migration in the production migration directory.
vi.mock('./migration-sql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./migration-sql')>()
  const suffix = 'CREATE TABLE fsrs_upgrade_probe (id TEXT PRIMARY KEY);'
  return {
    migrationEntries: [
      ...actual.migrationEntries,
      { path: './migrations/0010_fsrs_upgrade_probe.sql', sql: suffix },
    ],
    migrationSql: `${actual.migrationSql}\n${suffix}`,
  }
})

// Platform integration tests consume feature reads solely to verify preserved behavior.
// eslint-disable-next-line no-restricted-imports
import { buildPracticeProgressSummary } from '@/features/practice/domain/practice-progress'
// eslint-disable-next-line no-restricted-imports
import { createSettingsRepository } from '@/features/settings/data/settings-repository'
import type { DbHandle } from './client'
import { getAppDb, resetAppDbForTesting, flushDbSnapshot } from './instance'
import { migrationSql } from './migration-sql'
import {
  FSRS_RECOVERY_KEY,
  RECOVERY_KEY,
  TRACK_RECOVERY_KEY,
} from './snapshot-state'
import {
  bytesToBase64,
  computeFingerprint,
  FINGERPRINT_KEY,
  SNAPSHOT_KEY,
} from './snapshot'
import { expectedV9MigrationFingerprint } from '@/testing/fixtures/fsrs-remediation-legacy-migrations'
import {
  makeFsrsPreservationSnapshot,
  preservationNow,
  preservationTables,
  readPreservationRows,
  readProgressAttempts,
} from '@/testing/fixtures/fsrs-preservation'

const handles: DbHandle[] = []

class PreservationStorage {
  readonly values: Record<string, unknown> = {}
  failure: 'recovery' | 'publication' | null = null
  get = vi.fn((keys: string[]) =>
    Promise.resolve(
      Object.fromEntries(
        keys
          .filter((key) => Object.hasOwn(this.values, key))
          .map((key) => [key, this.values[key]]),
      ),
    ),
  )
  set = vi.fn((values: Record<string, unknown>) => {
    if (this.failure === 'recovery' && Object.hasOwn(values, FSRS_RECOVERY_KEY))
      return Promise.reject(new Error('recovery storage unavailable'))
    if (this.failure === 'publication' && Object.hasOwn(values, SNAPSHOT_KEY))
      return Promise.reject(new Error('snapshot storage unavailable'))
    Object.assign(this.values, values)
    return Promise.resolve()
  })
}

async function installPopulatedStorage() {
  const fixture = await makeFsrsPreservationSnapshot()
  const storage = new PreservationStorage()
  storage.values[SNAPSHOT_KEY] = bytesToBase64(fixture.bytes)
  storage.values[FINGERPRINT_KEY] = expectedV9MigrationFingerprint
  const earlier = {
    [RECOVERY_KEY]: {
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: 'earlier v7 original',
        [FINGERPRINT_KEY]: 'b1c2b4d7',
      },
      savedAt: '2026-10-01T16:00:00.000Z',
    },
    [TRACK_RECOVERY_KEY]: {
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: 'earlier v8 original',
        [FINGERPRINT_KEY]: 'a35941fc',
      },
      savedAt: '2026-10-02T16:00:00.000Z',
    },
  }
  Object.assign(storage.values, earlier)
  vi.stubGlobal('chrome', { storage: { local: storage } })
  return { fixture, storage, earlier }
}

beforeEach(() => resetAppDbForTesting())
afterEach(() => {
  resetAppDbForTesting()
  while (handles.length) handles.pop()?.rawDb.close()
  vi.unstubAllGlobals()
})

describe('populated FSRS baseline preservation', () => {
  it('preserves every original column and earned progress through upgrade and reopen', async () => {
    const { fixture, storage, earlier } = await installPopulatedStorage()
    for (const table of preservationTables)
      expect(fixture.rows[table]).not.toHaveLength(0)
    expect(fixture.rows.review_attempts).toHaveLength(6)
    expect(fixture.rows.fsrs_cards).toHaveLength(4)
    const originalEncoded = storage.values[SNAPSHOT_KEY]
    const progress = buildPracticeProgressSummary(fixture.attemptsForProgress, {
      dailyGoal: 2,
      now: preservationNow,
    })
    expect(progress).toMatchObject({
      completedToday: 2,
      currentStreak: 2,
      goalMetToday: true,
    })

    const upgraded = await getAppDb({
      beforePublish: async (handle, context) => {
        expect(context).toEqual({
          kind: 'upgrade',
          fromFingerprint: expectedV9MigrationFingerprint,
        })
        expect(readPreservationRows(handle)).toEqual(fixture.rows)
        expect(storage.values[SNAPSHOT_KEY]).toBe(originalEncoded)
        expect(storage.values[FINGERPRINT_KEY]).toBe(
          expectedV9MigrationFingerprint,
        )
        expect(storage.values[FSRS_RECOVERY_KEY]).toMatchObject({
          raw: {
            [SNAPSHOT_KEY]: originalEncoded,
            [FINGERPRINT_KEY]: expectedV9MigrationFingerprint,
          },
        })
        expect(await createSettingsRepository(handle.db).getSettings()).toEqual(
          fixture.settings,
        )
      },
    })
    handles.push(upgraded)
    expect(readPreservationRows(upgraded)).toEqual(fixture.rows)
    expect(
      upgraded.rawDb.exec({
        sql: 'SELECT * FROM fsrs_upgrade_probe',
        returnValue: 'resultRows',
      }),
    ).toEqual([])
    expect(storage.values[FINGERPRINT_KEY]).toBe(
      computeFingerprint(migrationSql),
    )
    expect(storage.values[RECOVERY_KEY]).toEqual(earlier[RECOVERY_KEY])
    expect(storage.values[TRACK_RECOVERY_KEY]).toEqual(
      earlier[TRACK_RECOVERY_KEY],
    )
    const retainedRecovery = storage.values[FSRS_RECOVERY_KEY]
    await flushDbSnapshot()

    resetAppDbForTesting()
    const prepare = vi.fn().mockResolvedValue(undefined)
    const reopened = await getAppDb({ beforePublish: prepare })
    handles.push(reopened)
    expect(prepare).not.toHaveBeenCalled()
    expect(readPreservationRows(reopened)).toEqual(fixture.rows)
    expect(await createSettingsRepository(reopened.db).getSettings()).toEqual(
      fixture.settings,
    )
    expect(
      buildPracticeProgressSummary(readProgressAttempts(reopened), {
        dailyGoal: 2,
        now: preservationNow,
      }),
    ).toEqual(progress)
    expect(storage.values[FSRS_RECOVERY_KEY]).toEqual(retainedRecovery)
  })

  it.each([
    'recovery',
    'preparation',
    'target schema',
    'publication',
    'collision',
  ] as const)(
    'retains active bytes and earlier originals when %s fails',
    async (failure) => {
      const { fixture, storage, earlier } = await installPopulatedStorage()
      const originalEncoded = storage.values[SNAPSHOT_KEY]
      if (failure === 'recovery' || failure === 'publication')
        storage.failure = failure
      if (failure === 'collision')
        storage.values[FSRS_RECOVERY_KEY] = {
          version: 1,
          raw: {
            [SNAPSHOT_KEY]: 'different original',
            [FINGERPRINT_KEY]: expectedV9MigrationFingerprint,
          },
          savedAt: '2026-10-01T16:00:00.000Z',
        }
      const preexistingRecovery = storage.values[FSRS_RECOVERY_KEY]
      const errors = {
        recovery: 'recovery storage unavailable',
        preparation: 'preparation rejected',
        'target schema':
          'The stored database schema does not match its supported version.',
        publication: 'snapshot storage unavailable',
        collision:
          'An earlier database recovery record must be exported before another upgrade.',
      }
      await expect(
        getAppDb({
          beforePublish: (handle) => {
            if (failure === 'preparation')
              throw new Error('preparation rejected')
            if (failure === 'target schema')
              handle.rawDb.exec('CREATE TABLE unexpected (id TEXT);')
            return Promise.resolve()
          },
        }),
      ).rejects.toThrow(errors[failure])
      expect(storage.values[SNAPSHOT_KEY]).toBe(originalEncoded)
      expect(storage.values[FINGERPRINT_KEY]).toBe(
        expectedV9MigrationFingerprint,
      )
      expect(storage.values[RECOVERY_KEY]).toEqual(earlier[RECOVERY_KEY])
      expect(storage.values[TRACK_RECOVERY_KEY]).toEqual(
        earlier[TRACK_RECOVERY_KEY],
      )
      if (failure === 'collision' || failure === 'recovery') {
        expect(storage.values[FSRS_RECOVERY_KEY]).toEqual(preexistingRecovery)
      } else {
        expect(storage.values[FSRS_RECOVERY_KEY]).toMatchObject({
          raw: {
            [SNAPSHOT_KEY]: originalEncoded,
            [FINGERPRINT_KEY]: expectedV9MigrationFingerprint,
          },
        })
      }

      if (failure !== 'collision') {
        const firstRecovery = storage.values[FSRS_RECOVERY_KEY]
        storage.failure = null
        resetAppDbForTesting()
        const retried = await getAppDb()
        handles.push(retried)
        expect(readPreservationRows(retried)).toEqual(fixture.rows)
        if (failure !== 'recovery')
          expect(storage.values[FSRS_RECOVERY_KEY]).toEqual(firstRecovery)
      }
    },
  )
})
```

This synthetic target is scoped to this test module. Existing `snapshot-upgrade.test.ts`, `open-snapshot.test.ts` and `instance.test.ts` still prove unknown fingerprints, source schema/integrity failure, matching-current opens and older upgrades. The later real schema phase must reuse this fixture against its actual migration and project original columns explicitly when adding columns.

- [x] **Step 3: Run the focused red test.**

Run: `rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts`.

Expected: source selection now succeeds, but the independent FSRS recovery expectation fails because `instance.ts` still routes this source to the Topics slot. That slot is occupied by a different original, so startup rejects rather than overwriting it.

- [x] **Step 4: Route the exact source to its recovery slot.**

Add `legacyFsrsMigrationFingerprint` to the existing `snapshot-upgrade` import and `FSRS_RECOVERY_KEY` to the existing `snapshot-state` import in `src/platform/db/instance.ts`. Replace the complete `preserve` callback in `openAppDb()` with:

```ts
preserve: (raw) =>
  preserveRecovery(
    storage,
    raw,
    new Date(),
    raw[FINGERPRINT_KEY] === legacyFsrsMigrationFingerprint
      ? FSRS_RECOVERY_KEY
      : raw[FINGERPRINT_KEY] === legacyTrackMigrationFingerprint
        ? TRACK_RECOVERY_KEY
        : undefined,
  ),
```

Keep existing restore/validate/upgrade/prepare/publish ordering, error cleanup, active-handle activation and serialized snapshot writes unchanged.

- [x] **Step 5: Verify the populated lifecycle and existing regressions.**

```sh
rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/instance.test.ts
```

Expected: all pass; failed publication retains the old active pair, retry succeeds with the original recovery timestamp, and populated reopen retains every pre-existing value. No production migration is added.

- [x] **Step 6: Commit the preservation proof and routing.**

```sh
rtk git add src/testing/fixtures/fsrs-preservation.ts src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/instance.ts
rtk git commit -m "fix(db): preserve populated FSRS state across staged upgrades"
```

## Task 4: Preserve the background preparation boundary

**Files:** modify `src/extension/background/app-db.ts`, `app-db.test.ts` and the new integration test.

- [x] **Step 1: Add a failing bridge test.**

In `src/extension/background/app-db.test.ts`, import `legacyFsrsMigrationFingerprint` from `@/platform/db/snapshot-upgrade`. Append this test inside the existing describe block, reusing `handle` and `appDbMocks`:

```ts
it('does not rerun historical taxonomy conversion for the through-0009 source', async () => {
  appDbMocks.getAppDb.mockImplementation(async ({ beforePublish }) => {
    await beforePublish(handle, {
      kind: 'upgrade',
      fromFingerprint: legacyFsrsMigrationFingerprint,
    })
    return handle
  })
  await expect(getBackgroundDb()).resolves.toBe(handle)
  expect(appDbMocks.reconcileTopicTaxonomy).not.toHaveBeenCalled()
})
```

- [x] **Step 2: Run the red bridge test.**

Run: `rtk npm run test -- src/extension/background/app-db.test.ts`.

Expected: the new test fails because all upgrades currently run taxonomy reconciliation; existing fresh/older/failure tests pass.

- [x] **Step 3: Guard only the already-current baseline.**

In `src/extension/background/app-db.ts`, add:

```ts
import { legacyFsrsMigrationFingerprint } from '@/platform/db/snapshot-upgrade'
```

Insert at the start of `beforePublish`, before `reconcileTopicTaxonomy()`:

```ts
if (
  context.kind === 'upgrade' &&
  context.fromFingerprint === legacyFsrsMigrationFingerprint
) {
  return
}
```

Keep the existing fresh/older catalog mapping and failure propagation. Do not broadly skip preparation for every upgrade.

- [x] **Step 4: Add the real background preservation case.**

Add `getBackgroundDb` imported from `@/extension/background/app-db` to `src/platform/db/fsrs-preservation.integration.test.ts`; this is the existing Platform integration-test convention also used by `instance.test.ts`. Append inside its describe block:

```ts
it('keeps all original rows through the production background bridge', async () => {
  const { fixture } = await installPopulatedStorage()
  const handle = await getBackgroundDb()
  handles.push(handle)
  expect(readPreservationRows(handle)).toEqual(fixture.rows)
  expect(await createSettingsRepository(handle.db).getSettings()).toEqual(
    fixture.settings,
  )
})
```

- [x] **Step 5: Run the bridge and populated tests.**

Run: `rtk npm run test -- src/extension/background/app-db.test.ts src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/instance.test.ts`.

Expected: all pass, including fresh taxonomy setup, older supported conversion and the exact no-reconciliation source.

- [x] **Step 6: Commit the composition guard.**

```sh
rtk git add src/extension/background/app-db.ts src/extension/background/app-db.test.ts src/platform/db/fsrs-preservation.integration.test.ts
rtk git commit -m "fix(db): preserve current catalog rows during FSRS upgrades"
```

## Task 5: Document compatibility and finish verification

**Files:** modify `docs/architecture.md` and `docs/testing.md`; record validation and human smoke evidence in the implementation handoff.

- [x] **Step 1: Update the current architecture documentation.**

In `docs/architecture.md`'s Database And Persistence section, change the exact baseline sentence to:

```markdown
Only the exact through-0007, through-0008 and through-0009 migration sequences
allowlisted in `src/platform/db/snapshot-upgrade.ts` are eligible for automatic
upgrade; the app validates the matching schema and runs only the migrations
after that supported prefix.
```

Replace the recovery-slot paragraph with:

```markdown
Before a supported upgrade replaces the active snapshot, the app retains the
original snapshot and fingerprint in the baseline's recovery slot:
`cognipace_db_recovery_topics_v1` for through-0007,
`cognipace_db_recovery_tracks_v1` for through-0008, and
`cognipace_db_recovery_fsrs_v1` for through-0009. Earlier copies survive later
upgrades. An existing recovery record must not be overwritten by a different
original; retrying the same original retains its first timestamp. Matching
current snapshots skip preparation and publication. The already-current
through-0009 source skips historical taxonomy reconciliation during a future
upgrade; fresh and older supported sources retain their existing mapping.
```

Retain the adjacent private-export, failure and no-silent-reseed guidance. In the later Problem Topic Graph compatibility paragraph, replace the allowlisted-prefix sentence with:

```markdown
Automatic database upgrade is a separate, deliberately narrow compatibility
path: only the exact shipped 0000–0007, 0000–0008 and 0000–0009 migration SQL
prefixes allowlisted in `src/platform/db/snapshot-upgrade.ts` may upgrade
automatically to the current schema. For fresh and older supported sources,
the Problems reconciliation callback runs on the staged database after
incremental SQL and before snapshot publication. A through-0009 source retains
its existing catalog rows without repeating that historical conversion.
```

Keep the existing backup-v5, external-progress and older recovery behavior paragraphs accurate. Add after the Migration 0009 paragraph:

```markdown
The through-0009 fingerprint `1144ce07` is registered before adding FSRS
metadata migrations. This compatibility registration adds no migration and
changes no current FSRS card, review, due date, track credit or user preference.
Populated singleton tests use a test-only appended table to prove staging,
independent recovery and reopen; the actual later schema migration requires
its own preservation proof.
```

- [x] **Step 2: Update recovery testing and prepare human proof.**

In `docs/testing.md`'s Local Database Recovery section, replace the allowlist sentence with:

```markdown
Automatic upgrades accept only the exact through-0007, through-0008 and
through-0009 migration prefixes allowlisted in
[`snapshot-upgrade.ts`](../src/platform/db/snapshot-upgrade.ts), documented in
[Database And Persistence](architecture.md#database-and-persistence).
```

Change "four database recovery keys" to "five database snapshot/recovery keys" and add `'cognipace_db_recovery_fsrs_v1',` after the Track recovery key in the existing scoped export expression. Do not export all storage. After that recovery section's introduction, add:

```markdown
The through-0009 preservation suite is
`src/platform/db/fsrs-preservation.integration.test.ts`. It compares every
original column on a populated source, verifies 75% retention and distinct
daily/streak progress, and checks staged publication failure/retry/reopen with
both earlier recovery slots present. Its appended table is test-only; it does
not establish proof for a later real FSRS metadata migration.

Before review or merge, a human must load this phase's built extension into a
disposable profile containing current history, opaque card IDs, suspension,
track completion, an active session and non-default settings. Compare history,
due dates, Daily Goal/streaks, track credit and Settings before/after reload;
capture screenshots or a recording without private recovery contents. Confirm
ordinary review saving still persists across extension reload. Older supported
upgrade/recovery smoke remains required when those paths are affected. Record
unsupported/corrupt-data failure proof without discarding original bytes. The
future real metadata migration additionally requires human through-0009
upgrade/failure/retry proof; this phase ships no new schema to trigger it.
```

- [x] **Step 3: Format touched files and run the focused suite.**

```sh
rtk npx prettier --write src/testing/fixtures/fsrs-remediation-legacy-migrations.ts src/testing/fixtures/fsrs-preservation.ts src/platform/db/snapshot-upgrade.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.ts src/platform/db/snapshot-state.test.ts src/platform/db/instance.ts src/platform/db/fsrs-preservation.integration.test.ts src/extension/background/app-db.ts src/extension/background/app-db.test.ts docs/architecture.md docs/testing.md
rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/instance.test.ts src/extension/background/app-db.test.ts
```

Expected: formatting completes and every listed suite passes. Repair concrete failures before the full checks. If a code/API adjustment is necessary, update this plan's affected snippet/signature rather than retaining a misleading example.

- [x] **Step 4: Run the governance-required checks.**

```sh
rtk npm run db:check
rtk npm run lint
rtk npm run check
rtk npm run build
rtk git diff --check
```

Expected: all exit successfully. `db:generate` is skipped because no schema changes; `zip` is skipped because packaging/artifact behavior is unchanged. A test failure must not be reported as a passing check. Full checks can expose unrelated failures; record exact failures and resolve only within authorized scope.

- [x] **Step 5: Commit documentation and prepare the review handoff.**

```sh
rtk git add docs/architecture.md docs/testing.md
rtk git commit -m "docs(db): record FSRS baseline preservation and recovery proof"
```

Report the exact focused/full commands run, any skipped command with reason, synthetic-versus-real migration limits, no reset/no scheduling change, private recovery quota cost, and human happy/edge smoke proof or its outstanding status. Use the existing PR template. Do not declare merge readiness while human proof is missing.

## Done when

- The ten-file source is pinned to `1144ce07`; changed/reordered/missing prefixes and unknown sources reject.
- A third recovery record never overwrites the earlier records or a different original of its own.
- The populated fixture is nonempty in every protected table; all original columns, six attempts, four cards, raw due/memory/counters, suspension, completion/session/settings and derived daily/streak progress survive synthetic upgrade and reopen.
- Preservation/preparation/target-validation/publication failures retain the active pair; supported retries preserve the first recovery record and succeed.
- Background preparation retains through-0009 catalog values; fresh/older behavior stays covered.
- Focused and required checks pass; human installed-extension proof is attached before review/merge, or the handoff explicitly remains pending it.
- No new migration, card replay, daily-profile activation, backup-version change or permission change is included.

## Planning validation status

The original planning pass ran Markdown formatting and whitespace checks only. Implementation is now executed and required automated checks pass; the handoff records both earlier failures and final results. Test helper factoring preserves the planned signatures and coverage. Specification review added the active-fingerprint assertion beside the pre-publication snapshot assertion, and full lint removed the unnecessary tuple non-null assertions above. The implementation types three `expect.any(String)` results as `unknown` without changing the recovery assertions. `rtk npm run db:generate` remains intentionally inapplicable to this phase; the actual metadata-storage slice must generate/check its appended migration and rerun preservation proof. Human installed-extension proof is still pending before PR review or merge.
