import { describe, expect, it, vi } from 'vitest'

import {
  computeNotificationDryRun,
  createDevSmokeService,
  type DevSmokeDeps,
} from './dev-smoke-service'

describe('createDevSmokeService', () => {
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
  }
}
