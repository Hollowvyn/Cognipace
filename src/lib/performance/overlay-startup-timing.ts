export type OverlayStartupMark =
  | 'content-mount'
  | 'url-ready'
  | 'page-ready'
  | 'context-ready'
  | 'timer-ready'

export type OverlayStartupMeasure =
  | 'page.snapshot'
  | 'page.metadata'
  | 'page.upsert'
  | 'page.app-shell'
  | 'page.preview'
  | 'page.submit-event'
  | 'page.submit-capture'
  | 'worker.metadata'
  | 'worker.app-shell'
  | 'worker.overlay-practice'
  | 'worker.overlay-queue'
  | 'worker.overlay-track'
  | 'worker.upsert'
  | 'worker.snapshot-publish'

const MAX_ENTRIES_PER_STAGE = 64
const markCounts = new Map<string, number>()
const measureCounts = new Map<string, number>()

export function markOverlayStartup(stage: OverlayStartupMark): void {
  const name = `cognipace.overlay.${stage}`
  try {
    const count = markCounts.get(name) ?? 0
    if (count >= MAX_ENTRIES_PER_STAGE) {
      performance.clearMarks(name)
      markCounts.set(name, 0)
    }
    performance.mark(name)
    markCounts.set(name, (markCounts.get(name) ?? 0) + 1)
  } catch {
    // Timing must not affect the operation being observed.
  }
}

export function recordOverlayStartupMeasure(
  stage: OverlayStartupMeasure,
  start: number,
  end: number,
): void {
  const name = `cognipace.overlay.${stage}`
  try {
    const count = measureCounts.get(name) ?? 0
    if (count >= MAX_ENTRIES_PER_STAGE) {
      performance.clearMeasures(name)
      measureCounts.set(name, 0)
    }
    performance.measure(name, { start, end })
    measureCounts.set(name, (measureCounts.get(name) ?? 0) + 1)
  } catch {
    // Timing must not affect the operation being observed.
  }
}

export function timeOverlayStartupSync<T>(
  stage: OverlayStartupMeasure,
  work: () => T,
): T {
  const start = performance.now()
  try {
    return work()
  } finally {
    recordOverlayStartupMeasure(stage, start, performance.now())
  }
}

export async function timeOverlayStartup<T>(
  stage: OverlayStartupMeasure,
  work: () => Promise<T> | T,
): Promise<T> {
  const start = performance.now()
  try {
    return await work()
  } finally {
    recordOverlayStartupMeasure(stage, start, performance.now())
  }
}
