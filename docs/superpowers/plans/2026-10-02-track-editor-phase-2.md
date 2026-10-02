# Track Setting Persistence And Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Persist the optional external-progress setting without losing shipped
local data, backups, or import behavior.

**Architecture:** Append a migration and retain exact shipped v7/v8 upgrade
baselines. Tracks owns the setting; full backup v5 preserves it and older
versions normalize to false. Preserve sync orchestration and content-import v1.

**Tech Stack:** SQLite WASM, Drizzle, Zod, Vitest.

## Task 1: Schema And Shipped-Snapshot Upgrade

**Files:**

- Modify: `src/platform/db/schema/tracks.ts`
- Generate: `src/platform/db/migrations/0009_*.sql` and migration metadata
- Modify: `src/platform/db/snapshot-upgrade.ts`
- Modify: `src/platform/db/instance.ts`
- Test: `src/platform/db/snapshot-upgrade.test.ts`
- Test: `src/platform/db/instance.test.ts`
- Test: `src/testing/db-foundation.test.ts`

- [ ] Freeze the currently shipped 0000–0008 SQL prefix before generation and add
      failing upgrade/default tests. Populate reviews, track progress, settings,
      and membership order to detect data loss.
- [ ] Run focused upgrade tests and verify the v8 upgrade is rejected before the
      change.
- [ ] Add the flag and generate an appended migration using the repository's
      canonical workflow. Expected generated SQL:

```sql
ALTER TABLE `tracks` ADD `allow_external_progress` integer DEFAULT false NOT NULL;
```

```ts
allowExternalProgress: integer('allow_external_progress', { mode: 'boolean' })
  .notNull()
  .default(false),
```

- [ ] Run `rtk npm run db:generate`. Review only the appended SQL/metadata; do not
      alter shipped migration SQL. Ensure runtime migration bundling includes it.
- [ ] Recognize exact supported v7 and v8 fingerprints; validate the full
      pre-upgrade schema for each baseline, apply only its missing suffix, run
      preparation/integrity checks, and publish the staged snapshot last.
      Preserve existing recovery records and rejection behavior.
- [ ] Run `rtk npm run db:check` and upgrade/foundation tests. Confirm current
      populated data stays intact and new/existing flags default false.

## Task 2: Full Backup Version 5

**Files:**

- Modify: `src/features/backup/api/backup-contracts.ts`
- Modify: `src/features/backup/data/backup-repository.ts` when explicit mapping is needed
- Test: `src/features/backup/api/backup-contracts.test.ts`
- Test: `src/features/backup/data/backup-repository.test.ts`
- Test: `src/features/backup/server/backup-service.test.ts`
- Test: `src/features/sync/server/sync-service.test.ts`

- [ ] Add failing v5 round-trip tests with an enabled track and v1–v4
      normalization tests without the new field.
- [ ] Freeze old strict track-row schemas for legacy versions and require the
      boolean in v5. Do not accept arbitrary future versions.

```ts
const backupTrackRowSchema = legacyBackupTrackRowSchema.extend({
  allowExternalProgress: z.boolean(),
})
```

- [ ] Normalize each legacy track to `{ ...track, allowExternalProgress: false }`.
      Keep review evidence/track ledger/session validation unchanged. Export and
      restore the flag alongside the stored track row.
- [ ] Run backup and sync service tests. Keep the sync envelope version and all
      dirty-local/overwrite checks unchanged; older clients reject backup v5.

## Task 3: Content Import Preservation

**Files:**

- Modify: `src/features/tracks/data/track-import-repository.ts`
- Modify: `src/features/tracks/domain/track-import.ts` if its stored row needs the flag
- Modify: `src/features/imports/domain/plan-import-tracks.ts`
- Test: `src/features/tracks/data/track-import-repository.test.ts`
- Test: matching existing import planner/service tests

- [ ] Add failing tests that new imported tracks default false and re-importing
      an existing enabled track preserves its value.
- [ ] Include the flag in stored-track reads and initialize new planned tracks
      with false. Preserve scalar values for existing tracks. Do not expand the
      public content import format or let import files toggle this setting.
- [ ] Run focused import tests and format changed maintained files.

## Done When

The appended migration is generated and checked, supported populated upgrades
preserve data, backups v1–v5 are parsed/restored correctly, v5 exports the flag,
and additive imports preserve existing settings. No new sync feature or Chrome
permission is introduced.
