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

export function markOverlayStartup(stage: OverlayStartupMark): void {
  performance.mark(`cognipace.overlay.${stage}`)
}

export function timeOverlayStartupSync<T>(
  stage: OverlayStartupMeasure,
  work: () => T,
): T {
  const start = performance.now()
  try {
    return work()
  } finally {
    performance.measure(`cognipace.overlay.${stage}`, {
      start,
      end: performance.now(),
    })
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
    performance.measure(`cognipace.overlay.${stage}`, {
      start,
      end: performance.now(),
    })
  }
}
