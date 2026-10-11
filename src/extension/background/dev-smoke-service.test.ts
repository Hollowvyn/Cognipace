import { describe, expect, it, vi } from 'vitest'

import {
  computeNotificationDryRun,
  createDevSmokeService,
  readChromeStorageCapacity,
  type DevSmokeDeps,
} from './dev-smoke-service'

describe('createDevSmokeService', () => {
  it('reads capacity only on request and reports numeric storage usage', async () => {
    const deps = createDeps()
    deps.readCapacityStorage = vi.fn().mockResolvedValue({
      totalBytes: 900,
      quotaBytes: 1000,
      headroomBytes: 100,
      activeSnapshotBytes: 500,
      activeFingerprintBytes: 20,
      recoveryTopicsBytes: 100,
      recoveryTracksBytes: 80,
      recoveryFsrsBytes: 60,
    })
    const service = createDevSmokeService(deps)

    expect((await service.run({})).capacity).toBeUndefined()
    expect(deps.readCapacityStorage).not.toHaveBeenCalled()
    expect((await service.run({ includeCapacity: true })).capacity).toEqual({
      status: 'available',
      storage: {
        totalBytes: 900,
        quotaBytes: 1000,
        headroomBytes: 100,
        activeSnapshotBytes: 500,
        activeFingerprintBytes: 20,
        recoveryTopicsBytes: 100,
        recoveryTracksBytes: 80,
        recoveryFsrsBytes: 60,
      },
    })
  })

  it('keeps storage failures free of raw error contents', async () => {
    const deps = createDeps()
    deps.readCapacityStorage = vi
      .fn()
      .mockRejectedValue(new Error('Storage failed with sk-sensitive-secret'))

    const report = await createDevSmokeService(deps).run({
      includeCapacity: true,
    })

    expect(report.capacity).toEqual({ status: 'unavailable' })
    expect(JSON.stringify(report)).not.toContain('sk-sensitive-secret')
  })

  it('does not call live GenAI when capacity and live flags are both set', async () => {
    const deps = createDeps()

    await createDevSmokeService(deps).run({
      includeCapacity: true,
      runLiveGenAi: true,
    })

    expect(deps.runLiveGenAi).not.toHaveBeenCalled()
  })
  it('samples gated Queue and Analytics service reads only when capacity is requested', async () => {
    const deps = createDeps()
    const service = createDevSmokeService(deps)

    expect((await service.run({})).readTimings).toBeUndefined()
    expect(deps.readAnalyticsSummary).toHaveBeenCalledTimes(1)
    expect(deps.readQueueSummary).toHaveBeenCalledTimes(1)

    const report = await service.run({ includeCapacity: true })

    expect(deps.readAnalyticsSummary).toHaveBeenCalledTimes(8)
    expect(deps.readQueueSummary).toHaveBeenCalledTimes(8)
    expect(report.readTimings).toMatchObject({
      status: 'available',
      method: 'sequential-background-service-reads',
      warmups: 1,
    })
    if (report.readTimings?.status !== 'available')
      throw new Error('Read timings were unavailable.')
    for (const operation of [
      report.readTimings.analytics,
      report.readTimings.queue,
    ]) {
      expect(operation.samplesMs).toHaveLength(5)
      expect(
        operation.samplesMs.every(
          (sample) => Number.isFinite(sample) && sample >= 0,
        ),
      ).toBe(true)
      expect(operation.p50Ms).toBeGreaterThanOrEqual(0)
      expect(operation.p95Ms).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps read timing failures free of raw error contents', async () => {
    const deps = createDeps()
    vi.mocked(deps.readAnalyticsSummary)
      .mockResolvedValueOnce({ views: {} })
      .mockRejectedValue(new Error('Sensitive review notes'))

    const report = await createDevSmokeService(deps).run({
      includeCapacity: true,
    })

    expect(report.readTimings).toEqual({ status: 'unavailable' })
    expect(JSON.stringify(report)).not.toContain('Sensitive review notes')
  })
  it('returns ordered pass checks for reachable dependencies', async () => {
    const deps = createDeps()
    vi.mocked(deps.runLiveGenAi).mockResolvedValue({
      status: 'pass',
      detail: 'Provider responded.',
      latencyMs: 42,
    })

    const report = await createDevSmokeService(deps).run({
      runLiveGenAi: true,
    })

    expect(report.generatedAt).toBe('2026-06-07T12:00:00.000Z')
    expect(report.checks.map((check) => check.id)).toEqual([
      'health',
      'analytics',
      'queue',
      'notifications',
      'genai.config',
      'genai.live',
    ])
    expect(report.checks.map((check) => check.status)).toEqual([
      'pass',
      'pass',
      'pass',
      'skip',
      'pass',
      'pass',
    ])
    expect(report.checks.at(-1)).toMatchObject({
      id: 'genai.live',
      latencyMs: 42,
    })
    expect(report.checks.find((check) => check.id === 'queue')).toMatchObject({
      detail:
        'Queue loaded: 1 review due, 2 new available, load 3, recommendation due-today.',
    })
  })

  it('skips live GenAI when not requested without calling the live dependency', async () => {
    const deps = createDeps()

    const report = await createDevSmokeService(deps).run({})

    expect(deps.runLiveGenAi).not.toHaveBeenCalled()
    expect(report.checks.at(-1)).toMatchObject({
      id: 'genai.live',
      status: 'skip',
    })
  })

  it('uses plural review grammar for multiple due reviews', async () => {
    const deps = createDeps()
    vi.mocked(deps.readQueueSummary).mockResolvedValue({
      dueToday: 2,
      newAvailable: 0,
      queueLoad: 2,
      recommendationReason: 'due-today',
    })

    const report = await createDevSmokeService(deps).run({})

    expect(report.checks.find((check) => check.id === 'queue')).toMatchObject({
      detail:
        'Queue loaded: 2 reviews due, 0 new available, load 2, recommendation due-today.',
    })
  })

  it('redacts provider-style secrets in failure details', async () => {
    const deps = createDeps()
    vi.mocked(deps.readQueueSummary).mockRejectedValue(
      new Error('Provider rejected sk-test-secret for this request'),
    )
    vi.mocked(deps.runLiveGenAi).mockRejectedValue(
      new Error('Gemini key AIzaSyVerySecretValue failed'),
    )

    const report = await createDevSmokeService(deps).run({
      runLiveGenAi: true,
    })

    const serialized = JSON.stringify(report)

    expect(serialized).not.toContain('sk-test-secret')
    expect(serialized).not.toContain('AIzaSyVerySecretValue')
    const queueCheck = report.checks.find((check) => check.id === 'queue')
    const liveGenAiCheck = report.checks.find(
      (check) => check.id === 'genai.live',
    )

    expect(queueCheck).toMatchObject({
      status: 'fail',
    })
    expect(queueCheck?.detail).toContain('[redacted-secret]')
    expect(liveGenAiCheck).toMatchObject({
      status: 'fail',
    })
    expect(liveGenAiCheck?.detail).toContain('[redacted-secret]')
  })

  it('fails analytics when current chart views are missing', async () => {
    const deps = createDeps()
    vi.mocked(deps.readAnalyticsSummary).mockResolvedValue(
      {} as Awaited<ReturnType<DevSmokeDeps['readAnalyticsSummary']>>,
    )

    const report = await createDevSmokeService(deps).run({})

    expect(
      report.checks.find((check) => check.id === 'analytics'),
    ).toMatchObject({
      status: 'fail',
      detail: 'Analytics summary is missing current chart views.',
    })
  })

  it('warns when GenAI config is disabled', async () => {
    const deps = createDeps()
    vi.mocked(deps.readGenAiConfig).mockResolvedValue({
      enabled: false,
      provider: 'openai',
      model: 'not-configured',
      hasSecret: false,
    })

    const report = await createDevSmokeService(deps).run({})

    expect(
      report.checks.find((check) => check.id === 'genai.config'),
    ).toMatchObject({
      status: 'warn',
      detail:
        'Provider openai is not configured; model not-configured; secret present: no.',
    })
  })

  it('warns when GenAI config has no stored secret', async () => {
    const deps = createDeps()
    vi.mocked(deps.readGenAiConfig).mockResolvedValue({
      enabled: true,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      hasSecret: false,
    })

    const report = await createDevSmokeService(deps).run({})

    expect(
      report.checks.find((check) => check.id === 'genai.config'),
    ).toMatchObject({
      status: 'warn',
      detail:
        'Provider openai is configured with model gpt-4.1-mini; secret present: no.',
    })
  })
})

describe('readChromeStorageCapacity', () => {
  it('reads byte counts without retrieving stored values', async () => {
    const sizes = new Map<unknown, number>([
      [null, 900],
      ['cognipace_db_snapshot_v1', 500],
      ['cognipace_db_snapshot_fingerprint_v1', 20],
      ['cognipace_db_recovery_topics_v1', 100],
      ['cognipace_db_recovery_tracks_v1', 80],
      ['cognipace_db_recovery_fsrs_v1', 60],
    ])
    const getBytesInUse = vi.fn((key: string | null) =>
      Promise.resolve(sizes.get(key) ?? 0),
    )

    const result = await readChromeStorageCapacity({
      QUOTA_BYTES: 1000,
      getBytesInUse,
    })

    expect(result).toEqual({
      totalBytes: 900,
      quotaBytes: 1000,
      headroomBytes: 100,
      activeSnapshotBytes: 500,
      activeFingerprintBytes: 20,
      recoveryTopicsBytes: 100,
      recoveryTracksBytes: 80,
      recoveryFsrsBytes: 60,
    })
    expect(getBytesInUse).toHaveBeenCalledTimes(6)
  })

  it('reports unknown quota without inventing headroom', async () => {
    const result = await readChromeStorageCapacity({
      getBytesInUse: vi.fn(() => Promise.resolve(0)),
    })

    expect(result.quotaBytes).toBeNull()
    expect(result.headroomBytes).toBeNull()
  })
})

describe('computeNotificationDryRun', () => {
  it('skips when daily reminders are disabled', () => {
    expect(
      computeNotificationDryRun({
        now: new Date('2026-06-07T12:00:00.000Z'),
        reminders: { daily: { enabled: false, time: '09:00' } },
        dueToday: 3,
        lastNotifiedDate: null,
      }),
    ).toEqual({
      status: 'skip',
      detail: 'Daily reminders are disabled.',
    })
  })

  it('skips when there are no due reviews', () => {
    expect(
      computeNotificationDryRun({
        now: new Date('2026-06-07T12:00:00.000Z'),
        reminders: { daily: { enabled: true, time: '09:00' } },
        dueToday: 0,
        lastNotifiedDate: null,
      }),
    ).toEqual({
      status: 'skip',
      detail: 'No due reviews are available for a reminder.',
    })
  })

  it('skips when a reminder was already sent today', () => {
    expect(
      computeNotificationDryRun({
        now: new Date('2026-06-07T12:00:00.000Z'),
        reminders: { daily: { enabled: true, time: '09:00' } },
        dueToday: 2,
        lastNotifiedDate: '2026-06-07',
      }),
    ).toEqual({
      status: 'skip',
      detail: 'A due-review reminder was already sent today.',
    })
  })

  it('uses the browser-local day for the notification dry run', () => {
    vi.stubEnv('TZ', 'America/New_York')
    try {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
        'America/New_York',
      )
      expect(
        computeNotificationDryRun({
          now: new Date('2026-05-30T01:00:00.000Z'),
          reminders: { daily: { enabled: true, time: '09:00' } },
          dueToday: 1,
          lastNotifiedDate: '2026-05-29',
        }),
      ).toMatchObject({ status: 'skip' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('passes when a reminder would be sent without mutating state', () => {
    expect(
      computeNotificationDryRun({
        now: new Date('2026-06-07T12:00:00.000Z'),
        reminders: { daily: { enabled: true, time: '09:00' } },
        dueToday: 4,
        lastNotifiedDate: '2026-06-06',
      }),
    ).toEqual({
      status: 'pass',
      detail: 'Would send a 09:00 reminder for 4 due reviews.',
    })
  })
})

function createDeps(): DevSmokeDeps {
  return {
    now: () => new Date('2026-06-07T12:00:00.000Z'),
    readAnalyticsSummary: vi.fn(() =>
      Promise.resolve({
        views: { retentionMap: {}, upcomingReviewLoad: {} },
      }),
    ),
    readQueueSummary: vi.fn(() =>
      Promise.resolve({
        dueToday: 1,
        newAvailable: 2,
        queueLoad: 3,
        recommendationReason: 'due-today',
      }),
    ),
    readGenAiConfig: vi.fn(() =>
      Promise.resolve({
        enabled: true,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        hasSecret: true,
      }),
    ),
    runNotificationDryRun: vi.fn(() =>
      Promise.resolve({
        status: 'skip' as const,
        detail: 'Dry-run wiring is available; notification was not sent.',
      }),
    ),
    runLiveGenAi: vi.fn(() =>
      Promise.resolve({
        status: 'skip' as const,
        detail: 'Live GenAI was not requested.',
      }),
    ),
    readCapacityStorage: vi.fn(() =>
      Promise.resolve({
        totalBytes: 0,
        quotaBytes: null,
        headroomBytes: null,
        activeSnapshotBytes: 0,
        activeFingerprintBytes: 0,
        recoveryTopicsBytes: 0,
        recoveryTracksBytes: 0,
        recoveryFsrsBytes: 0,
      }),
    ),
  }
}
