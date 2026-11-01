import type { AlarmScheduler } from './alarm-scheduler'
export const notesMaintenanceAlarm = 'notes-maintenance'
export function registerNotesMaintenance(
  scheduler: AlarmScheduler,
  runBatch: () => Promise<{ hasMore: boolean } | null>,
) {
  const request = () =>
    scheduler.schedule(notesMaintenanceAlarm, {
      delayInMinutes: 1,
      periodInMinutes: 1440,
    })
  scheduler.register({
    name: notesMaintenanceAlarm,
    startup: { delayInMinutes: 1, periodInMinutes: 1440 },
    run: async () => {
      try {
        const result = await runBatch()
        if (result === null || result.hasMore) await request()
      } catch {
        // Maintenance cannot fail a durable user mutation or erase recovery roots.
        // Retry later using a new atomic manifest. No body/secret logging.
        await request().catch(() => undefined)
      }
    },
  })
  return { request: () => request().catch(() => undefined) }
}
