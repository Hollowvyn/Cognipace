import { toPracticeDateKey } from '@/features/practice'
import type { UserSettings } from '@/features/settings/domain'
import { browser } from 'wxt/browser'
import type { AlarmScheduler } from './scheduler/alarm-scheduler'

export const dueCheckAlarmName = 'due:daily-check'

export type DueNotificationDeps = {
  now: () => Date
  readSettings: () => Promise<Pick<UserSettings, 'reminders'>>
  readQueueSummary: () => Promise<{ dueToday: number }>
  readState: () => Promise<{
    lastNotifiedDate: string | null
    isLegacyUtcDate?: boolean
  }>
  writeState: (date: string) => Promise<void>
  notify: (title: string, message: string) => Promise<void>
  checkAlarmScheduled: (name: string) => Promise<boolean>
  scheduler: Pick<AlarmScheduler, 'clear' | 'register' | 'schedule'>
}

export function normalizeNotificationTime(time: string, now: Date): number {
  const parts = time.split(':').map(Number)
  const hours = parts[0]!
  const minutes = parts[1]!
  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)
  if (target > now) {
    return Math.ceil((target.getTime() - now.getTime()) / 60_000)
  }
  target.setDate(target.getDate() + 1)
  return Math.ceil((target.getTime() - now.getTime()) / 60_000)
}

function hasTimePassed(time: string, now: Date): boolean {
  const parts = time.split(':').map(Number)
  const hours = parts[0]!
  const minutes = parts[1]!
  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)
  return target <= now
}

const notificationStateKey = 'cognipace:notification:lastNotifiedDate'
const localNotificationStateKey = 'cognipace:notification:lastNotifiedLocalDate'

export async function readDueNotificationState(): Promise<{
  lastNotifiedDate: string | null
  isLegacyUtcDate: boolean
}> {
  const result = await browser.storage.local.get([
    localNotificationStateKey,
    notificationStateKey,
  ])
  const localValue = result[localNotificationStateKey]
  if (typeof localValue === 'string') {
    return { lastNotifiedDate: localValue, isLegacyUtcDate: false }
  }
  const legacyValue = result[notificationStateKey]
  return {
    lastNotifiedDate: typeof legacyValue === 'string' ? legacyValue : null,
    isLegacyUtcDate: typeof legacyValue === 'string',
  }
}

export async function writeDueNotificationState(date: string): Promise<void> {
  await browser.storage.local.set({ [localNotificationStateKey]: date })
}

export function createDueNotification(deps: DueNotificationDeps) {
  let jobsRegistered = false

  async function runDailyCheck(): Promise<void> {
    const settings = await deps.readSettings()
    if (!settings.reminders.daily.enabled) {
      return
    }

    const now = deps.now()
    const today = toPracticeDateKey(now)
    const state = await deps.readState()
    const { dueToday } = await deps.readQueueSummary()
    const [hours, minutes] = settings.reminders.daily.time
      .split(':')
      .map(Number)
    const scheduledToday = new Date(now)
    scheduledToday.setHours(hours ?? 0, minutes ?? 0, 0, 0)
    const legacyDateMayBeToday =
      state.isLegacyUtcDate &&
      (state.lastNotifiedDate === scheduledToday.toISOString().slice(0, 10) ||
        state.lastNotifiedDate === now.toISOString().slice(0, 10))

    if (legacyDateMayBeToday) {
      await deps.writeState(today)
    } else if (
      (state.isLegacyUtcDate || state.lastNotifiedDate !== today) &&
      dueToday > 0
    ) {
      await deps.notify(
        'Reviews due',
        `You have ${dueToday} review${dueToday === 1 ? '' : 's'} due.`,
      )
      await deps.writeState(today)
    }

    await deps.scheduler.schedule(dueCheckAlarmName, {
      delayInMinutes: normalizeNotificationTime(
        settings.reminders.daily.time,
        now,
      ),
    })
  }

  async function handleStartup(): Promise<void> {
    const settings = await deps.readSettings()
    if (!settings.reminders.daily.enabled) {
      return
    }

    const alreadyScheduled = await deps.checkAlarmScheduled(dueCheckAlarmName)
    if (alreadyScheduled) {
      return
    }

    const { time } = settings.reminders.daily
    if (hasTimePassed(time, deps.now())) {
      await runDailyCheck()
    } else {
      await deps.scheduler.schedule(dueCheckAlarmName, {
        delayInMinutes: normalizeNotificationTime(time, deps.now()),
      })
    }
  }

  async function onSettingsChanged(
    prev: Pick<UserSettings, 'reminders'>,
    next: Pick<UserSettings, 'reminders'>,
  ): Promise<void> {
    const prevDaily = prev.reminders.daily
    const nextDaily = next.reminders.daily

    if (
      prevDaily.enabled === nextDaily.enabled &&
      prevDaily.time === nextDaily.time
    ) {
      return
    }

    if (!nextDaily.enabled) {
      await deps.scheduler.clear(dueCheckAlarmName)
      return
    }

    if (!prevDaily.enabled) {
      await handleStartup()
      return
    }

    // Enabled, time changed
    await deps.scheduler.clear(dueCheckAlarmName)
    await deps.scheduler.schedule(dueCheckAlarmName, {
      delayInMinutes: normalizeNotificationTime(nextDaily.time, deps.now()),
    })
  }

  function registerJobs(): void {
    if (jobsRegistered) return
    deps.scheduler.register({ name: dueCheckAlarmName, run: runDailyCheck })
    jobsRegistered = true
  }

  return { handleStartup, onSettingsChanged, registerJobs, runDailyCheck }
}
