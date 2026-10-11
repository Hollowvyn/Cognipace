import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpus, platform, release, totalmem } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getAnalyticsSummary } from '@/features/analytics/server/analytics-service'
import {
  getCurrentFsrsCards,
  getReviewHistory,
} from '@/features/analytics/data/analytics-repository'
import {
  exportFullBackup,
  restoreFullBackup,
  validateFullBackup,
} from '@/features/backup/server/backup-service'
import { createPracticeRepository } from '@/features/practice/data/practice-repository'
import { previewPracticeReview } from '@/features/practice/server/practice-service'
import { executePracticeReviewCommand } from '@/features/practice/server/practice-review-workflow'
import { getTodayQueue } from '@/features/queue/server/queue-service'
import { createDb, createSqliteWasmLocator } from '@/platform/db/client'
import {
  bytesToBase64,
  deserializeDb,
  serializeDb,
} from '@/platform/db/snapshot'

import {
  createFsrsScalingFixture,
  type FsrsScalingKind,
} from './fsrs-scaling-fixtures'
import {
  collectTimingSamples,
  summarizeTimingSamples,
  type TimingSample,
} from './fsrs-scaling-samples'

const selectedKind = process.env.COGNIPACE_SCALING as
  | FsrsScalingKind
  | undefined
const kinds: FsrsScalingKind[] = ['standard', 'stress', 'single-card']
if (selectedKind !== undefined && !kinds.includes(selectedKind)) {
  throw new Error('COGNIPACE_SCALING must be standard, stress, or single-card.')
}
const shouldRun = selectedKind !== undefined && kinds.includes(selectedKind)
const seed = 20261010

describe('FSRS Phase G supporting local benchmark', () => {
  it.skipIf(!shouldRun)(
    'records repeatable full-path supporting samples without loading Chrome data',
    async () => {
      if (!selectedKind) throw new Error('Select a scaling dataset.')
      const fixture = await createFsrsScalingFixture(selectedKind, seed)
      const dependencyVersions = Object.fromEntries<string>(
        await Promise.all(
          [
            '@sqlite.org/sqlite-wasm',
            'ts-fsrs',
            'drizzle-orm',
            '@webext-core/messaging',
            'wxt',
          ].map(async (name): Promise<readonly [string, string]> => {
            const manifest: unknown = JSON.parse(
              await readFile(
                join('node_modules', name, 'package.json'),
                'utf8',
              ),
            )
            if (
              typeof manifest !== 'object' ||
              manifest === null ||
              !('version' in manifest) ||
              typeof manifest.version !== 'string'
            )
              throw new Error(`Missing installed version for ${name}.`)
            return [name, manifest.version]
          }),
        ),
      )
      const outputDir = join('test-results', 'fsrs-phase-g')
      await mkdir(outputDir, { recursive: true })
      await writeFile(
        join(outputDir, `${selectedKind}-backup.json`),
        JSON.stringify(fixture.backup),
      )

      const target = fixture.backup.data.problems[0]?.slug
      if (!target) throw new Error('Scaling fixture has no target card.')
      const db = fixture.handle.db
      const details =
        await createPracticeRepository(db).getPracticeDetails(target)
      if (!details.generation || !details.latestReview)
        throw new Error('Scaling fixture target lacks command context.')

      const samples = selectedKind === 'stress' ? 10 : 20
      const at = new Date('2026-10-10T12:00:00.000Z')
      const referenceDigests = {
        queue: digest(await getTodayQueue(db, at)),
        details: digest(
          await createPracticeRepository(db).getPracticeDetails(target, {
            now: at,
          }),
        ),
        analytics30: digest(
          await getAnalyticsSummary(db, {
            range: 30,
            now: at,
            timeZone: 'UTC',
          }),
        ),
        analytics90: digest(
          await getAnalyticsSummary(db, {
            range: 90,
            now: at,
            timeZone: 'UTC',
          }),
        ),
        analyticsAll: digest(
          await getAnalyticsSummary(db, {
            range: 'all',
            now: at,
            timeZone: 'UTC',
          }),
        ),
        analyticsHistory: digest(await getReviewHistory(db)),
        analyticsCurrentCards: digest(await getCurrentFsrsCards(db)),
        backup: digest(fixture.backup),
        sqliteSnapshot: createHash('sha256')
          .update(fixture.snapshot)
          .digest('hex'),
      }
      const report = {
        source: 'node-vitest-supporting-evidence',
        commit: execFileSync('rtk', ['proxy', 'git', 'rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        dataset: selectedKind,
        seed,
        counts: fixture.counts,
        environment: {
          platform: platform(),
          release: release(),
          cpu: cpus()[0]?.model ?? 'unavailable',
          logicalCpus: cpus().length,
          totalMemoryBytes: totalmem(),
          node: process.version,
          dependencyVersions,
          chrome: null,
          extensionBuild: null,
        },
        method: {
          readWarmups: 3,
          warmSamples: samples,
          mutationSamples: samples,
          mutationReset: 'fresh deserialized fixture outside each timer',
          coldReopen:
            'Fresh in-process SQLite WASM handle deserializing the same fixture snapshot; no Chrome worker restart',
          percentile: 'nearest-rank',
          note: 'In-memory SQLite and synthetic storage; not installed Chrome capacity.',
          peakHeapBytes: null,
          peakHeapMethod: 'Not sampled in shared Vitest process',
        },
        sizes: {
          sqliteBytes: fixture.snapshot.byteLength,
          base64Characters: bytesToBase64(fixture.snapshot).length,
          backupUtf8Bytes: Buffer.byteLength(JSON.stringify(fixture.backup)),
        },
        referenceDigests,
        operations: {
          queue: await collectTimingSamples(
            () => getTodayQueue(db, at),
            samples,
            3,
          ),
          details: await collectTimingSamples(
            () =>
              createPracticeRepository(db).getPracticeDetails(target, {
                now: at,
              }),
            samples,
            3,
          ),
          analytics30: await collectTimingSamples(
            () =>
              getAnalyticsSummary(db, { range: 30, now: at, timeZone: 'UTC' }),
            samples,
            3,
          ),
          analytics90: await collectTimingSamples(
            () =>
              getAnalyticsSummary(db, { range: 90, now: at, timeZone: 'UTC' }),
            samples,
            3,
          ),
          analyticsAll: await collectTimingSamples(
            () =>
              getAnalyticsSummary(db, {
                range: 'all',
                now: at,
                timeZone: 'UTC',
              }),
            samples,
            3,
          ),
          analyticsHistoryQuery: await collectTimingSamples(
            () => getReviewHistory(db),
            samples,
            3,
          ),
          analyticsCurrentCardsQuery: await collectTimingSamples(
            () => getCurrentFsrsCards(db),
            samples,
            3,
          ),
          submitPreview: await collectTimingSamples(
            () =>
              previewPracticeReview(db, {
                mode: 'submit',
                problemSlug: target,
                generation: details.generation!,
                previewedAt: at.toISOString(),
              }),
            samples,
            3,
          ),
          updatePreview: await collectTimingSamples(
            () =>
              previewPracticeReview(db, {
                mode: 'update',
                problemSlug: target,
                generation: details.generation!,
                targetAttemptId: details.latestReview!.reviewAttemptId,
                expectedRevision: details.latestReview!.revision,
                reviewedAt: details.latestReview!.reviewedAt.toISOString(),
              }),
            samples,
            3,
          ),
          backupExport: await collectTimingSamples(
            () => exportFullBackup(db, { exportedAt: at }),
            samples,
            3,
          ),
          backupValidation: await collectTimingSamples(
            () => validateFullBackup(fixture.backup),
            samples,
            3,
          ),
          sqliteExport: await collectTimingSamples(
            () => serializeDb(fixture.handle),
            samples,
            3,
          ),
          base64Encoding: await collectTimingSamples(
            () => bytesToBase64(fixture.snapshot),
            samples,
            3,
          ),
          saveAndSyntheticPublication: await collectWithFixtureReset(
            fixture.snapshot,
            samples,
            async (copy) => {
              const current = await createPracticeRepository(
                copy.db,
              ).getPracticeDetails(target)
              if (!current.generation || !current.latestReview)
                throw new Error('Missing copied command context.')
              const reviewedAt = new Date(
                current.latestReview.reviewedAt.getTime() + 86_400_000,
              )
              const command = {
                operation: 'save' as const,
                commandId: 'phase-g-sample-save',
                problemSlug: target,
                generation: current.generation,
                rating: 'good' as const,
                reviewedAt: reviewedAt.toISOString(),
                reviewMode: 'manual' as const,
              }
              const result = await executePracticeReviewCommand(
                copy.db,
                command,
              )
              if (result.status !== 'saved')
                throw new Error(`Save returned ${result.status}.`)
              const bytes = serializeDb(copy)
              const encoded = bytesToBase64(bytes)
              if (!encoded) throw new Error('Empty encoded snapshot.')
            },
          ),
          updateAndSyntheticPublication: await collectWithFixtureReset(
            fixture.snapshot,
            samples,
            async (copy) => {
              const current = await createPracticeRepository(
                copy.db,
              ).getPracticeDetails(target)
              if (!current.generation || !current.latestReview)
                throw new Error('Missing copied Update context.')
              const result = await executePracticeReviewCommand(copy.db, {
                operation: 'update',
                commandId: 'phase-g-sample-update',
                problemSlug: target,
                generation: current.generation,
                targetAttemptId: current.latestReview.reviewAttemptId,
                expectedRevision: current.latestReview.revision,
                rating:
                  current.latestAttempt?.rating === 'again' ? 'good' : 'again',
                reviewedAt: current.latestReview.reviewedAt.toISOString(),
              })
              if (result.status !== 'saved')
                throw new Error(`Update returned ${result.status}.`)
              const encoded = bytesToBase64(serializeDb(copy))
              if (!encoded) throw new Error('Empty encoded snapshot.')
            },
          ),
          sameCommandRetry: await collectWithFixtureResetAndSetup(
            fixture.snapshot,
            samples,
            async (copy) => {
              const current = await createPracticeRepository(
                copy.db,
              ).getPracticeDetails(target)
              if (!current.generation || !current.latestReview)
                throw new Error('Missing copied Retry context.')
              const command = {
                operation: 'save' as const,
                commandId: 'phase-g-sample-retry',
                problemSlug: target,
                generation: current.generation,
                rating: 'good' as const,
                reviewedAt: new Date(
                  current.latestReview.reviewedAt.getTime() + 86_400_000,
                ).toISOString(),
                reviewMode: 'manual' as const,
              }
              const accepted = await executePracticeReviewCommand(
                copy.db,
                command,
              )
              if (accepted.status !== 'saved')
                throw new Error(`Setup Save returned ${accepted.status}.`)
              return command
            },
            async (copy, command) => {
              const retry = await executePracticeReviewCommand(copy.db, command)
              if (retry.status !== 'saved')
                throw new Error(`Retry returned ${retry.status}.`)
            },
          ),
          restore: await collectWithFreshDb(samples, async (copy) => {
            await restoreFullBackup(copy.db, fixture.backup)
          }),
          reopen: await collectColdReopen(fixture.snapshot, 5),
        },
      }

      await writeFile(
        join(outputDir, `${selectedKind}-local.json`),
        `${JSON.stringify(report, null, 2)}\n`,
      )
      for (const [operation, result] of Object.entries(report.operations)) {
        expect(
          result.failures,
          `${operation} failed; inspect raw samples`,
        ).toBe(0)
      }
      fixture.handle.rawDb.close()
    },
    1_800_000,
  )
})

async function createCopy(snapshot: Uint8Array) {
  const handle = await createDb({ locateWasm: createSqliteWasmLocator() })
  deserializeDb(handle, snapshot)
  return handle
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function collectWithFixtureReset(
  snapshot: Uint8Array,
  count: number,
  run: (handle: Awaited<ReturnType<typeof createCopy>>) => Promise<void>,
) {
  const samples: TimingSample[] = []
  for (let index = 0; index < count; index += 1) {
    const copy = await createCopy(snapshot)
    const started = performance.now()
    try {
      await run(copy)
      samples.push({ elapsedMs: performance.now() - started, error: null })
    } catch (error) {
      samples.push({
        elapsedMs: null,
        error: error instanceof Error ? error.name : 'UnknownError',
      })
    } finally {
      copy.rawDb.close()
    }
  }
  return summarizeTimingSamples(samples)
}

async function collectWithFixtureResetAndSetup<T>(
  snapshot: Uint8Array,
  count: number,
  prepare: (handle: Awaited<ReturnType<typeof createCopy>>) => Promise<T>,
  run: (
    handle: Awaited<ReturnType<typeof createCopy>>,
    prepared: T,
  ) => Promise<void>,
) {
  const samples: TimingSample[] = []
  for (let index = 0; index < count; index += 1) {
    const copy = await createCopy(snapshot)
    try {
      const prepared = await prepare(copy)
      const started = performance.now()
      try {
        await run(copy, prepared)
        samples.push({ elapsedMs: performance.now() - started, error: null })
      } catch (error) {
        samples.push({
          elapsedMs: null,
          error: error instanceof Error ? error.name : 'UnknownError',
        })
      }
    } finally {
      copy.rawDb.close()
    }
  }
  return summarizeTimingSamples(samples)
}

async function collectWithFreshDb(
  count: number,
  run: (handle: Awaited<ReturnType<typeof createCopy>>) => Promise<void>,
) {
  const samples: TimingSample[] = []
  for (let index = 0; index < count; index += 1) {
    const copy = await createDb({
      migrationSql: (await import('@/platform/db/migration-sql')).migrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    const started = performance.now()
    try {
      await run(copy)
      samples.push({ elapsedMs: performance.now() - started, error: null })
    } catch (error) {
      samples.push({
        elapsedMs: null,
        error: error instanceof Error ? error.name : 'UnknownError',
      })
    } finally {
      copy.rawDb.close()
    }
  }
  return summarizeTimingSamples(samples)
}

async function collectColdReopen(snapshot: Uint8Array, count: number) {
  const samples: TimingSample[] = []
  for (let index = 0; index < count; index += 1) {
    const started = performance.now()
    try {
      const copy = await createCopy(snapshot)
      copy.rawDb.close()
      samples.push({ elapsedMs: performance.now() - started, error: null })
    } catch (error) {
      samples.push({
        elapsedMs: null,
        error: error instanceof Error ? error.name : 'UnknownError',
      })
    }
  }
  return summarizeTimingSamples(samples)
}
