import type { DevSmokeReport } from '@/features/dev-smoke'
import { toPracticeDateKey } from '@/features/practice'

export type SmokeStatus = DevSmokeReport['checks'][number]['status']

export interface DevSmokeDeps {
  now: () => Date
  readAnalyticsSummary: () => Promise<{ views: unknown }>
  readQueueSummary: () => Promise<{
    dueToday: number
    newAvailable: number
    queueLoad: number
    recommendationReason: string | null
  }>
  readGenAiConfig: () => Promise<{
    enabled: boolean
    provider: string
    model: string
    hasSecret: boolean
  }>
  runNotificationDryRun: () => Promise<{ status: SmokeStatus; detail: string }>
  runLiveGenAi: () => Promise<{
    status: SmokeStatus
    detail: string
    latencyMs?: number
  }>
}

export type NotificationDryRunInput = {
  now: Date
  reminders: {
    daily: {
      enabled: boolean
      time: string
    }
  }
  dueToday: number
  lastNotifiedDate: string | null
}

type SmokeCheck = DevSmokeReport['checks'][number]

export function createDevSmokeService(deps: DevSmokeDeps) {
  return {
    async run(input: { runLiveGenAi?: boolean }): Promise<DevSmokeReport> {
      const generatedAt = deps.now().toISOString()
      const checks: SmokeCheck[] = [
        createCheck({
          id: 'health',
          label: 'Background health',
          status: 'pass',
          detail: 'Background dev smoke service is reachable.',
        }),
        await runAnalyticsCheck(deps),
        await runQueueCheck(deps),
        await runNotificationCheck(deps),
        await runGenAiConfigCheck(deps),
        input.runLiveGenAi
          ? await runLiveGenAiCheck(deps)
          : createCheck({
              id: 'genai.live',
              label: 'Live GenAI',
              status: 'skip',
              detail: 'Live GenAI was not requested.',
            }),
      ]

      return { generatedAt, checks }
    },
  }
}

export function computeNotificationDryRun(input: NotificationDryRunInput): {
  status: SmokeStatus
  detail: string
} {
  if (!input.reminders.daily.enabled) {
    return {
      status: 'skip',
      detail: 'Daily reminders are disabled.',
    }
  }

  if (input.dueToday === 0) {
    return {
      status: 'skip',
      detail: 'No due reviews are available for a reminder.',
    }
  }

  if (input.lastNotifiedDate === toPracticeDateKey(input.now)) {
    return {
      status: 'skip',
      detail: 'A due-review reminder was already sent today.',
    }
  }

  return {
    status: 'pass',
    detail: `Would send a ${input.reminders.daily.time} reminder for ${input.dueToday} due review${input.dueToday === 1 ? '' : 's'}.`,
  }
}

async function runAnalyticsCheck(deps: DevSmokeDeps): Promise<SmokeCheck> {
  try {
    const summary = await deps.readAnalyticsSummary()
    if (summary.views === undefined) {
      return createCheck({
        id: 'analytics',
        label: 'Analytics summary',
        status: 'fail',
        detail: 'Analytics summary is missing current chart views.',
      })
    }

    return createCheck({
      id: 'analytics',
      label: 'Analytics summary',
      status: 'pass',
      detail: 'Analytics summary loaded with current chart views.',
    })
  } catch (error) {
    return createFailureCheck('analytics', 'Analytics summary', error)
  }
}

async function runQueueCheck(deps: DevSmokeDeps): Promise<SmokeCheck> {
  try {
    const queue = await deps.readQueueSummary()
    return createCheck({
      id: 'queue',
      label: 'Today queue',
      status: 'pass',
      detail: `Queue loaded: ${queue.dueToday} review${queue.dueToday === 1 ? '' : 's'} due, ${queue.newAvailable} new available, load ${queue.queueLoad}, recommendation ${queue.recommendationReason ?? 'none'}.`,
    })
  } catch (error) {
    return createFailureCheck('queue', 'Today queue', error)
  }
}

async function runNotificationCheck(deps: DevSmokeDeps): Promise<SmokeCheck> {
  try {
    const dryRun = await deps.runNotificationDryRun()
    return createCheck({
      id: 'notifications',
      label: 'Notifications',
      status: dryRun.status,
      detail: dryRun.detail,
    })
  } catch (error) {
    return createFailureCheck('notifications', 'Notifications', error)
  }
}

async function runGenAiConfigCheck(deps: DevSmokeDeps): Promise<SmokeCheck> {
  try {
    const config = await deps.readGenAiConfig()
    return createCheck({
      id: 'genai.config',
      label: 'GenAI config',
      status: config.enabled && config.hasSecret ? 'pass' : 'warn',
      detail: config.enabled
        ? `Provider ${config.provider} is configured with model ${config.model}; secret present: ${config.hasSecret ? 'yes' : 'no'}.`
        : `Provider ${config.provider} is not configured; model ${config.model}; secret present: no.`,
    })
  } catch (error) {
    return createFailureCheck('genai.config', 'GenAI config', error)
  }
}

async function runLiveGenAiCheck(deps: DevSmokeDeps): Promise<SmokeCheck> {
  try {
    const result = await deps.runLiveGenAi()
    return createCheck({
      id: 'genai.live',
      label: 'Live GenAI',
      status: result.status,
      detail: result.detail,
      ...(result.latencyMs !== undefined
        ? { latencyMs: result.latencyMs }
        : {}),
    })
  } catch (error) {
    return createFailureCheck('genai.live', 'Live GenAI', error)
  }
}

function createFailureCheck(
  id: string,
  label: string,
  error: unknown,
): SmokeCheck {
  return createCheck({
    id,
    label,
    status: 'fail',
    detail: redactSecrets(readErrorMessage(error)),
  })
}

function createCheck(check: SmokeCheck): SmokeCheck {
  return {
    ...check,
    detail: redactSecrets(check.detail),
  }
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function redactSecrets(value: string) {
  return value
    .replace(/\bsk-ant-[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .replace(/\bAIza[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
}
