import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./proxy')>()

  return {
    ...actual,
    setOnMutationHook: vi.fn(actual.setOnMutationHook),
  }
})

// This platform integration test uses feature repositories to seed valid owned-row graphs.
// eslint-disable-next-line no-restricted-imports
import { saveReviewResult } from '@/features/practice/server/practice-service'
// eslint-disable-next-line no-restricted-imports
import { createSettingsRepository } from '@/features/settings/data/settings-repository'
import { getBackgroundDb } from '@/extension/background/app-db'
// eslint-disable-next-line no-restricted-imports
import { createProblemsRepository } from '@/features/problems/data/problems-repository'
// eslint-disable-next-line no-restricted-imports
import { buildTopicGraph } from '@/features/problems/domain/topic-graph'
import { createDb, createSqliteWasmLocator } from './client'
import { getAppDb, flushDbSnapshot, resetAppDbForTesting } from './instance'
import { migrationSql } from './migration-sql'
import {
  legacyTopicMigrationFingerprint,
  legacyTopicMigrationSql,
} from './snapshot-upgrade'
import { RECOVERY_KEY } from './snapshot-state'
import {
  bytesToBase64,
  base64ToBytes,
  deserializeDb,
  FINGERPRINT_KEY,
  SNAPSHOT_KEY,
  SNAPSHOT_DIRTY_KEY,
  computeFingerprint,
  serializeDb,
} from './snapshot'
import { setOnMutationHook } from './proxy'

const now = new Date('2026-09-26T12:00:00.000Z')
const openedHandles: Awaited<ReturnType<typeof getAppDb>>[] = []

class FakeStorage {
  readonly values: Record<string, unknown> = {}
  rejectActiveSnapshotWrite = false
  beforeSet?: (values: Record<string, unknown>) => Promise<void>

  get = vi.fn((keys: string[]) =>
    Promise.resolve(
      Object.fromEntries(
        keys
          .filter((key) => key in this.values)
          .map((key) => [key, this.values[key]]),
      ),
    ),
  )

  set = vi.fn(async (values: Record<string, unknown>) => {
    if (
      this.rejectActiveSnapshotWrite &&
      SNAPSHOT_KEY in values &&
      FINGERPRINT_KEY in values
    ) {
      throw new Error('storage unavailable')
    }
    await this.beforeSet?.(values)
    Object.assign(this.values, values)
  })

  remove = vi.fn((keys: string[]) => {
    for (const key of keys) delete this.values[key]
    return Promise.resolve()
  })
}

beforeEach(() => {
  resetAppDbForTesting()
})

afterEach(() => {
  resetAppDbForTesting()
  while (openedHandles.length > 0) openedHandles.pop()?.rawDb.close()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function openTestDb() {
  const handle = await getAppDb()
  openedHandles.push(handle)
  return handle
}

function installStorage() {
  const storage = new FakeStorage()
  vi.stubGlobal('chrome', { storage: { local: storage } })
  return storage
}

function readRows(db: Awaited<ReturnType<typeof getAppDb>>, table: string) {
  return db.rawDb.exec({
    sql: `SELECT * FROM "${table}" ORDER BY rowid`,
    returnValue: 'resultRows',
  })
}

function readOwnedRows(db: Awaited<ReturnType<typeof getAppDb>>) {
  return Object.fromEntries(
    [
      'problems',
      'companies',
      'problem_companies',
      'problem_topics',
      'problem_practice',
      'fsrs_cards',
      'review_attempts',
      'tracks',
      'track_groups',
      'track_group_problems',
      'track_session',
      'settings_kv',
      'track_problem_progress',
    ].map((table) => [
      table,
      readRows(db, table).sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
    ]),
  )
}

describe('app database startup', () => {
  it('keeps initial publication and no-op flushes clean without clearing stored dirtiness', async () => {
    const storage = installStorage()
    await openTestDb()
    expect(storage.values[SNAPSHOT_DIRTY_KEY]).toBeUndefined()
    await flushDbSnapshot()
    expect(storage.values[SNAPSHOT_DIRTY_KEY]).toBeUndefined()
    storage.values[SNAPSHOT_DIRTY_KEY] = true
    await flushDbSnapshot()
    expect(storage.values[SNAPSHOT_DIRTY_KEY]).toBe(true)
  })

  it('publishes mutation dirtiness atomically and leaves a clean acknowledgement intact on no-op flush', async () => {
    const storage = installStorage()
    const handle = await openTestDb()
    await createSettingsRepository(handle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    await flushDbSnapshot()
    const publication = storage.set.mock.calls.at(-1)?.[0]
    expect(Object.keys(publication ?? {}).sort()).toEqual(
      [SNAPSHOT_KEY, FINGERPRINT_KEY, SNAPSHOT_DIRTY_KEY].sort(),
    )
    expect(publication?.[SNAPSHOT_DIRTY_KEY]).toBe(true)
    storage.values[SNAPSHOT_DIRTY_KEY] = false
    await flushDbSnapshot()
    expect(storage.values[SNAPSHOT_DIRTY_KEY]).toBe(false)
    expect(storage.set.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      SNAPSHOT_DIRTY_KEY,
    )
    resetAppDbForTesting()
    await openTestDb()
    await flushDbSnapshot()
    expect(storage.values[SNAPSHOT_DIRTY_KEY]).toBe(false)
  })

  it('marks debounced mutation snapshots dirty without waiting for a metadata write', async () => {
    const storage = installStorage()
    const handle = await openTestDb()
    vi.useFakeTimers()
    await createSettingsRepository(handle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    await vi.advanceTimersByTimeAsync(250)
    expect(storage.values[SNAPSHOT_DIRTY_KEY]).toBe(true)
    resetAppDbForTesting()
    const reopened = await openTestDb()
    await expect(
      createSettingsRepository(reopened.db).getSettings(),
    ).resolves.toMatchObject({ appearance: { themeMode: 'dark' } })
  })

  it('retains mutations that arrive while an earlier snapshot write awaits storage', async () => {
    const storage = installStorage()
    const handle = await openTestDb()
    vi.useFakeTimers()
    const settings = createSettingsRepository(handle.db)
    await settings.updateSettings({ appearance: { themeMode: 'dark' } }, now)
    let release!: () => void
    let started!: () => void
    const start = new Promise<void>((resolve) => {
      started = resolve
    })
    storage.beforeSet = () =>
      new Promise<void>((resolve) => {
        release = resolve
        started()
      })
    const firstFlush = flushDbSnapshot()
    await start
    await settings.updateSettings(
      { appearance: { themeMode: 'light' } },
      new Date(now.getTime() + 1_000),
    )
    release()
    await firstFlush
    delete storage.beforeSet
    storage.values[SNAPSHOT_DIRTY_KEY] = false
    await flushDbSnapshot()
    expect(storage.values[SNAPSHOT_DIRTY_KEY]).toBe(true)
    resetAppDbForTesting()
    const reopened = await openTestDb()
    await expect(
      createSettingsRepository(reopened.db).getSettings(),
    ).resolves.toMatchObject({ appearance: { themeMode: 'light' } })
  })

  it('round-trips seeded problem, review, FSRS, track, and settings data', async () => {
    installStorage()
    const handle = await openTestDb()
    await saveReviewResult(handle.db, {
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: now,
      isCorrect: true,
      targetRetention: 0.9,
    })
    await createSettingsRepository(handle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    await flushDbSnapshot()
    const expected = readOwnedRows(handle)
    expect(expected.problems).not.toHaveLength(0)
    expect(expected.review_attempts).not.toHaveLength(0)
    expect(expected.fsrs_cards).not.toHaveLength(0)
    expect(expected.tracks).not.toHaveLength(0)
    expect(expected.settings_kv).not.toHaveLength(0)

    resetAppDbForTesting()
    const reopened = await openTestDb()

    expect(readOwnedRows(reopened)).toEqual(expected)
  })

  it('returns one in-flight open promise to concurrent callers', async () => {
    installStorage()
    const first = getAppDb()
    const second = getAppDb()

    expect(second).toBe(first)
    const handle = await first
    openedHandles.push(handle)
  })

  it('boots and validates a fresh database without Chrome storage', async () => {
    vi.stubGlobal('chrome', undefined)

    const handle = await openTestDb()
    expect(
      handle.rawDb.exec({
        sql: 'PRAGMA integrity_check',
        returnValue: 'resultRows',
      }),
    ).toEqual([['ok']])
    expect(
      handle.rawDb.exec({
        sql: 'SELECT COUNT(*) FROM problems',
        returnValue: 'resultRows',
      }),
    ).toEqual([[101]])
    await expect(flushDbSnapshot()).resolves.toBeUndefined()
  })

  it('keeps the database unavailable until preparation and active publication resolve', async () => {
    const fakeStorage = installStorage()
    let releasePreparation!: () => void
    let enteredPreparation!: () => void
    const preparationEntered = new Promise<void>((resolve) => {
      enteredPreparation = resolve
    })
    const preparationGate = new Promise<void>((resolve) => {
      releasePreparation = resolve
    })
    let releasePublication!: () => void
    let enteredPublication!: () => void
    const publicationEntered = new Promise<void>((resolve) => {
      enteredPublication = resolve
    })
    const publicationGate = new Promise<void>((resolve) => {
      releasePublication = resolve
    })
    const originalSet = fakeStorage.set
    fakeStorage.set = vi.fn(async (values) => {
      if (SNAPSHOT_KEY in values && FINGERPRINT_KEY in values) {
        enteredPublication()
        await publicationGate
      }
      await originalSet(values)
    })

    let resolved = false
    const opening = getAppDb({
      beforePublish: async () => {
        enteredPreparation()
        await preparationGate
      },
    }).then((handle) => {
      openedHandles.push(handle)
      resolved = true
      return handle
    })

    await preparationEntered
    expect(resolved).toBe(false)
    releasePreparation()
    await publicationEntered
    expect(resolved).toBe(false)
    releasePublication()
    await expect(opening).resolves.toBeDefined()
  })

  it('clears a failed fresh open so callers can retry without a stale hook', async () => {
    const fakeStorage = installStorage()
    fakeStorage.values['unrelated-local-setting'] = 'keep me'
    fakeStorage.rejectActiveSnapshotWrite = true
    const opening = getAppDb()

    await expect(opening).rejects.toThrow('storage unavailable')
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBeUndefined()
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBeUndefined()
    expect(fakeStorage.values['unrelated-local-setting']).toBe('keep me')

    fakeStorage.rejectActiveSnapshotWrite = false
    const retried = openTestDb()
    await expect(retried).resolves.toBeDefined()
    expect(fakeStorage.values[SNAPSHOT_KEY]).toEqual(expect.any(String))
    expect(fakeStorage.values[FINGERPRINT_KEY]).toEqual(
      computeFingerprint(migrationSql),
    )
  })

  it('does not publish or install mutation hooks when beforePublish rejects, then retries cleanly', async () => {
    const fakeStorage = installStorage()
    const setMutationHook = vi.mocked(setOnMutationHook)
    setMutationHook.mockClear()
    const reconciliationFailure = new Error('reconciliation failed')

    await expect(
      getAppDb({
        beforePublish: () => Promise.reject(reconciliationFailure),
      }),
    ).rejects.toBe(reconciliationFailure)

    expect(fakeStorage.values[SNAPSHOT_KEY]).toBeUndefined()
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBeUndefined()
    expect(setMutationHook).not.toHaveBeenCalled()

    const retried = await openTestDb()
    expect(fakeStorage.values[SNAPSHOT_KEY]).toEqual(expect.any(String))
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(
      computeFingerprint(migrationSql),
    )
    expect(setMutationHook).toHaveBeenCalledTimes(1)
    expect(setMutationHook).toHaveBeenLastCalledWith(expect.any(Function))
    expect(retried).toBeDefined()
  })

  it('retains a populated legacy snapshot and recovery pair when reconciliation publication fails', async () => {
    const fakeStorage = installStorage()
    const legacyHandle = await createDb({
      migrationSql: legacyTopicMigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    legacyHandle.rawDb.exec(`
      INSERT INTO topics (id, label, created_at, updated_at)
      VALUES
        ('depth-first-search', 'Depth-First Search', 11, 12),
        ('graph-theory', 'Graph Theory', 13, 14);
      INSERT INTO topic_relations (parent_topic_id, child_topic_id, created_at, updated_at)
      VALUES ('graph-theory', 'depth-first-search', 15, 16);
    `)
    const originalSnapshot = bytesToBase64(serializeDb(legacyHandle))
    legacyHandle.rawDb.close()
    fakeStorage.values[SNAPSHOT_KEY] = originalSnapshot
    fakeStorage.values[FINGERPRINT_KEY] = legacyTopicMigrationFingerprint
    fakeStorage.rejectActiveSnapshotWrite = true

    await expect(getBackgroundDb()).rejects.toThrow('storage unavailable')

    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(originalSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(
      legacyTopicMigrationFingerprint,
    )
    expect(fakeStorage.values[RECOVERY_KEY]).toMatchObject({
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: originalSnapshot,
        [FINGERPRINT_KEY]: legacyTopicMigrationFingerprint,
      },
    })

    fakeStorage.rejectActiveSnapshotWrite = false
    const retry = await getBackgroundDb()
    openedHandles.push(retry)
    expect(
      retry.rawDb.exec({
        sql: `SELECT kind FROM topic_relations WHERE source_topic_id = 'depth-first-search' AND target_topic_id = 'graph-theory'`,
        returnValue: 'resultRows',
      }),
    ).toEqual([['applies-to']])
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(
      computeFingerprint(migrationSql),
    )
    expect(fakeStorage.values[RECOVERY_KEY]).toMatchObject({
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: originalSnapshot,
        [FINGERPRINT_KEY]: legacyTopicMigrationFingerprint,
      },
    })
  })

  it('preserves populated v7 data while the background callback reconciles before 0008 publication', async () => {
    const fakeStorage = installStorage()
    const legacyHandle = await createDb({
      migrationSql: legacyTopicMigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    legacyHandle.rawDb.exec(`
      INSERT INTO problems (slug, title, difficulty, is_premium, created_at, updated_at)
      VALUES ('legacy-two-sum', 'Two Sum', 'easy', 1, 101, 102);
      INSERT INTO companies (id, label)
      VALUES ('legacy-company', 'Legacy Company');
      INSERT INTO problem_companies (problem_slug, company_id)
      VALUES ('legacy-two-sum', 'legacy-company');
      INSERT INTO problem_practice (
        problem_slug, status, first_seen_at, last_seen_at, last_reviewed_at,
        last_rating, last_elapsed_seconds, best_elapsed_seconds, interview_pattern,
        time_complexity, space_complexity, languages, notes, solved_count,
        attempt_count, is_suspended, created_at, updated_at
      ) VALUES (
        'legacy-two-sum', 'scheduled', 101, 201, 201, 'good', 42, 40,
        'two-pointers', 'O(n)', 'O(1)', '["TypeScript"]', 'keep this note',
        2, 3, 0, 101, 202
      );
      INSERT INTO fsrs_cards (
        id, problem_slug, card_kind, due_at, stability, difficulty, elapsed_days,
        scheduled_days, learning_steps, reps, lapses, state, last_review_at,
        created_at, updated_at
      ) VALUES (
        'legacy-card', 'legacy-two-sum', 'default', 987654321, 4.5, 5.5, 3,
        7, 0, 2, 1, 'review', 201, 101, 202
      );
      INSERT INTO review_attempts (
        id, problem_slug, card_id, rating, review_mode, reviewed_at, elapsed_seconds,
        is_correct, interview_pattern, time_complexity, space_complexity, languages,
        notes, fsrs_review_log, created_at, updated_at
      ) VALUES (
        'legacy-review', 'legacy-two-sum', 'legacy-card', 'good', 'free-practice',
        201, 42, 1, 'two-pointers', 'O(n)', 'O(1)', '["TypeScript"]',
        'review note', '{"rating":"good"}', 201, 202
      );
      INSERT INTO tracks (id, slug, title, description, due_at, created_at, updated_at)
      VALUES ('legacy-track', 'legacy-track', 'Legacy Track', 'preserve order', 456789, 101, 202);
      INSERT INTO track_groups (id, track_id, title, position, created_at, updated_at)
      VALUES ('legacy-group', 'legacy-track', 'Ordered group', 4, 101, 202);
      INSERT INTO track_group_problems (track_group_id, track_id, problem_slug, position)
      VALUES ('legacy-group', 'legacy-track', 'legacy-two-sum', 7);
      INSERT INTO track_problem_progress (
        track_id, problem_slug, review_attempt_id, completed_at, completed_rating,
        created_at, updated_at
      ) VALUES ('legacy-track', 'legacy-two-sum', 'legacy-review', 201, 'good', 101, 202);
      INSERT INTO track_session (id, active_track_id, active_group_id, started_at, updated_at)
      VALUES ('active-session', 'legacy-track', 'legacy-group', 101, 202);
      INSERT INTO settings_kv (key, value, updated_at)
      VALUES ('topic-upgrade-test', '{"kept":true}', 303);

      INSERT INTO topics (id, label, created_at, updated_at)
      VALUES
        ('depth-first-search', 'Depth-First Search', 11, 12),
        ('breadth-first-search', 'Breadth-First Search', 13, 14),
        ('graph-theory', 'Graph Theory', 15, 16),
        ('tree', 'Tree', 17, 18),
        ('custom-pattern', 'Custom Pattern', 19, 20);
      INSERT INTO problem_topics (problem_slug, topic_id)
      VALUES
        ('legacy-two-sum', 'depth-first-search'),
        ('legacy-two-sum', 'breadth-first-search'),
        ('legacy-two-sum', 'custom-pattern');
      INSERT INTO topic_aliases (alias_key, label, topic_id, created_at, updated_at)
      VALUES ('MY   Pattern Alias ', 'My   Pattern Alias ', 'custom-pattern', 21, 22);
      INSERT INTO topic_relations (parent_topic_id, child_topic_id, created_at, updated_at)
      VALUES
        ('tree', 'depth-first-search', 23, 24),
        ('tree', 'breadth-first-search', 25, 26);
    `)

    const expectedOwnedRows = readOwnedRows(legacyHandle)
    const originalSnapshot = bytesToBase64(serializeDb(legacyHandle))
    legacyHandle.rawDb.close()
    fakeStorage.values[SNAPSHOT_KEY] = originalSnapshot
    fakeStorage.values[FINGERPRINT_KEY] = legacyTopicMigrationFingerprint

    let publishSawReconciledDatabase = false
    const originalSet = fakeStorage.set
    fakeStorage.set = vi.fn(async (values: Record<string, unknown>) => {
      if (SNAPSHOT_KEY in values && FINGERPRINT_KEY in values) {
        const published = await createDb({
          locateWasm: createSqliteWasmLocator(),
        })
        try {
          deserializeDb(published, base64ToBytes(String(values[SNAPSHOT_KEY])))
          const aliases = published.rawDb.exec({
            sql: "SELECT alias_key FROM topic_aliases WHERE topic_id = 'custom-pattern'",
            returnValue: 'resultRows',
          })
          const relations = published.rawDb.exec({
            sql: 'SELECT source_topic_id, target_topic_id, kind FROM topic_relations',
            returnValue: 'resultRows',
          })
          publishSawReconciledDatabase =
            aliases.some(([aliasKey]) => aliasKey === 'my pattern alias') &&
            relations.some(
              ([source, target, kind]) =>
                source === 'depth-first-search' &&
                target === 'tree' &&
                kind === 'applies-to',
            )
        } finally {
          published.rawDb.close()
        }
      }
      return originalSet(values)
    })

    const upgraded = await getBackgroundDb()
    openedHandles.push(upgraded)

    expect(publishSawReconciledDatabase).toBe(true)
    expect(readOwnedRows(upgraded)).toEqual(expectedOwnedRows)
    expect(fakeStorage.values[RECOVERY_KEY]).toMatchObject({
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: originalSnapshot,
        [FINGERPRINT_KEY]: legacyTopicMigrationFingerprint,
      },
    })

    const upgradedRows = upgraded.rawDb.exec({
      sql: 'SELECT source_topic_id, target_topic_id, kind FROM topic_relations',
      returnValue: 'resultRows',
    })
    const currentTopicIds = upgraded.rawDb.exec({
      sql: 'SELECT id FROM topics',
      returnValue: 'resultRows',
    }) as Array<[string]>
    const typedRelations = upgradedRows as Array<
      [string, string, 'broader' | 'applies-to']
    >
    const topicGraph = buildTopicGraph(
      currentTopicIds.map(([id]) => ({ id })),
      typedRelations.map(([sourceTopicId, targetTopicId, kind]) => ({
        sourceTopicId,
        targetTopicId,
        kind,
      })),
    )
    expect(topicGraph.effectiveTopicIds(['breadth-first-search'])).toEqual([
      'breadth-first-search',
    ])

    const savedWithAlias = await createProblemsRepository(
      upgraded.db,
    ).createProblem(
      {
        slugOrUrl: 'alias-resolution-after-upgrade',
        title: 'Alias Resolution After Upgrade',
        difficulty: 'medium',
        isPremium: false,
        topicLabels: [' my pattern alias '],
        companyLabels: [],
      },
      now,
    )
    expect(savedWithAlias.topics).toEqual([
      expect.objectContaining({
        id: 'custom-pattern',
        label: 'Custom Pattern',
      }),
    ])
  })

  it('retains the v7 snapshot and existing recovery copy when alias reconciliation rejects a collision', async () => {
    const fakeStorage = installStorage()
    const legacyHandle = await createDb({
      migrationSql: legacyTopicMigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    legacyHandle.rawDb.exec(`
      INSERT INTO topics (id, label, created_at, updated_at)
      VALUES ('tree', 'Tree', 1, 2), ('graph-theory', 'Graph Theory', 3, 4);
      INSERT INTO topic_aliases (alias_key, label, topic_id, created_at, updated_at)
      VALUES
        ('first-key', 'Shared Alias', 'tree', 5, 6),
        ('second-key', ' shared   alias ', 'graph-theory', 7, 8);
    `)
    const originalSnapshot = bytesToBase64(serializeDb(legacyHandle))
    legacyHandle.rawDb.close()
    const oldRecoveryRecord = {
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: originalSnapshot,
        [FINGERPRINT_KEY]: legacyTopicMigrationFingerprint,
      },
      savedAt: '2026-09-26T10:00:00.000Z',
    }
    fakeStorage.values[SNAPSHOT_KEY] = originalSnapshot
    fakeStorage.values[FINGERPRINT_KEY] = legacyTopicMigrationFingerprint
    fakeStorage.values[RECOVERY_KEY] = oldRecoveryRecord

    await expect(getBackgroundDb()).rejects.toThrow(/conflicting alias/i)

    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(originalSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(
      legacyTopicMigrationFingerprint,
    )
    expect(fakeStorage.values[RECOVERY_KEY]).toEqual(oldRecoveryRecord)
  })

  it('discards an open made stale by reset without replacing the new handle or snapshot', async () => {
    const fakeStorage = installStorage()
    let releaseOldPreparation!: () => void
    let enterOldPreparation!: () => void
    const oldPreparationEntered = new Promise<void>((resolve) => {
      enterOldPreparation = resolve
    })
    const oldPreparationGate = new Promise<void>((resolve) => {
      releaseOldPreparation = resolve
    })
    let staleHandle: Awaited<ReturnType<typeof getAppDb>> | undefined
    const staleOpen = getAppDb({
      beforePublish: async (handle) => {
        staleHandle = handle
        enterOldPreparation()
        await oldPreparationGate
      },
    })

    await oldPreparationEntered
    resetAppDbForTesting()
    const currentHandle = await openTestDb()
    await createSettingsRepository(currentHandle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    await flushDbSnapshot()
    const currentSnapshot = fakeStorage.values[SNAPSHOT_KEY]
    const currentFingerprint = fakeStorage.values[FINGERPRINT_KEY]

    releaseOldPreparation()
    await expect(staleOpen).rejects.toThrow('reset')
    expect(staleHandle).toBeDefined()
    expect(() => staleHandle?.rawDb.exec('SELECT 1')).toThrow()
    expect(await getAppDb()).toBe(currentHandle)
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(currentSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(currentFingerprint)

    resetAppDbForTesting()
    const reloaded = await openTestDb()
    await expect(
      createSettingsRepository(reloaded.db).getSettings(),
    ).resolves.toMatchObject({
      appearance: { themeMode: 'dark' },
    })
  })

  it('serializes startup snapshot writes across reset so stale publication cannot win', async () => {
    const fakeStorage = installStorage()
    let releaseFirstPairWrite!: () => void
    let enterFirstPairWrite!: () => void
    const firstPairWriteEntered = new Promise<void>((resolve) => {
      enterFirstPairWrite = resolve
    })
    const firstPairWriteGate = new Promise<void>((resolve) => {
      releaseFirstPairWrite = resolve
    })
    let enterLaterPairWrite!: () => void
    const laterPairWriteStarted = new Promise<void>((resolve) => {
      enterLaterPairWrite = resolve
    })
    const writeEvents: string[] = []
    const originalSet = fakeStorage.set
    let pairWriteCount = 0
    fakeStorage.set = vi.fn(async (values) => {
      let pairWriteNumber: number | undefined
      if (SNAPSHOT_KEY in values && FINGERPRINT_KEY in values) {
        pairWriteCount += 1
        pairWriteNumber = pairWriteCount
        if (pairWriteNumber === 1) {
          writeEvents.push('old-write-start')
          enterFirstPairWrite()
          await firstPairWriteGate
        } else {
          writeEvents.push('new-write-start')
          enterLaterPairWrite()
        }
      }
      await originalSet(values)
      if (pairWriteNumber !== undefined) {
        writeEvents.push(
          pairWriteNumber === 1 ? 'old-write-end' : 'new-write-end',
        )
      }
    })

    const staleOpen = getAppDb()
    await firstPairWriteEntered
    resetAppDbForTesting()

    let newPreparationFinished!: () => void
    const newPreparation = new Promise<void>((resolve) => {
      newPreparationFinished = resolve
    })
    const currentOpen = getAppDb({
      beforePublish: async (handle) => {
        await createSettingsRepository(handle.db).updateSettings(
          { appearance: { themeMode: 'dark' } },
          now,
        )
        newPreparationFinished()
      },
    })
    await newPreparation
    releaseFirstPairWrite()
    const [staleResult, currentResult] = await Promise.allSettled([
      staleOpen,
      currentOpen,
    ])
    await laterPairWriteStarted
    expect(writeEvents).toEqual([
      'old-write-start',
      'old-write-end',
      'new-write-start',
      'new-write-end',
    ])
    expect(staleResult.status).toBe('rejected')
    expect(currentResult.status).toBe('fulfilled')
    if (currentResult.status !== 'fulfilled') return
    openedHandles.push(currentResult.value)

    const currentSnapshot = fakeStorage.values[SNAPSHOT_KEY]
    const currentFingerprint = fakeStorage.values[FINGERPRINT_KEY]
    expect(currentFingerprint).toBe(computeFingerprint(migrationSql))

    resetAppDbForTesting()
    const reloaded = await openTestDb()
    await expect(
      createSettingsRepository(reloaded.db).getSettings(),
    ).resolves.toMatchObject({
      appearance: { themeMode: 'dark' },
    })
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(currentSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(currentFingerprint)
  })

  it('retains a recovery copy after restarting from partial snapshot state', async () => {
    const fakeStorage = installStorage()
    fakeStorage.values[SNAPSHOT_KEY] = 'partial-snapshot'

    await expect(getAppDb()).rejects.toThrow('Database recovery required')
    const recoveryCopy = fakeStorage.values[RECOVERY_KEY]
    expect(recoveryCopy).toMatchObject({
      version: 1,
      raw: { [SNAPSHOT_KEY]: 'partial-snapshot' },
    })

    resetAppDbForTesting()
    await expect(getAppDb()).rejects.toThrow('Database recovery required')
    expect(fakeStorage.values[RECOVERY_KEY]).toEqual(recoveryCopy)
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe('partial-snapshot')
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBeUndefined()
  })

  it('preserves a valid stored snapshot when a mutation flush write fails', async () => {
    const fakeStorage = installStorage()
    const firstHandle = await openTestDb()
    const settings = createSettingsRepository(firstHandle.db)
    await settings.updateSettings({ appearance: { themeMode: 'dark' } }, now)
    await flushDbSnapshot()
    const originalSnapshot = fakeStorage.values[SNAPSHOT_KEY]
    const originalFingerprint = fakeStorage.values[FINGERPRINT_KEY]
    fakeStorage.values[SNAPSHOT_DIRTY_KEY] = false

    fakeStorage.rejectActiveSnapshotWrite = true
    await settings.updateSettings(
      { appearance: { themeMode: 'light' } },
      new Date(now.getTime() + 1_000),
    )
    await expect(flushDbSnapshot()).rejects.toThrow('storage unavailable')
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(originalSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(originalFingerprint)
    expect(fakeStorage.values[SNAPSHOT_DIRTY_KEY]).toBe(false)

    fakeStorage.rejectActiveSnapshotWrite = false
    await flushDbSnapshot()
    const retriedSnapshot = fakeStorage.values[SNAPSHOT_KEY]
    expect(fakeStorage.values[SNAPSHOT_DIRTY_KEY]).toBe(true)
    expect(retriedSnapshot).not.toBe(originalSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(originalFingerprint)

    resetAppDbForTesting()
    const reopened = await openTestDb()
    await expect(
      createSettingsRepository(reopened.db).getSettings(),
    ).resolves.toMatchObject({
      appearance: { themeMode: 'light' },
    })
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(retriedSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(originalFingerprint)
  })
})
