type ActiveAnalysis = {
  requestId: string
  controller: AbortController
  promise: Promise<unknown>
}

const activeAnalyses = new Map<string, ActiveAnalysis>()

export function analysisOwner(sender: unknown): string {
  const tab = isRecord(sender) && isRecord(sender.tab) ? sender.tab : null
  const tabId = tab?.id
  const frameId = isRecord(sender) ? sender.frameId : undefined
  if (!isOwnerId(tabId) || !isOwnerId(frameId))
    throw new Error('Analysis requires a valid sender tab and frame.')
  return `${tabId}:${frameId}`
}

/** Callers supply the deadline-bounded background service as work. */
export function runOwnedAnalysis<T>(
  owner: string,
  requestId: string,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const active = activeAnalyses.get(owner)
  if (active?.requestId === requestId) return active.promise as Promise<T>
  active?.controller.abort()

  const controller = new AbortController()
  const promise = Promise.resolve()
    .then(() => work(controller.signal))
    .finally(() => {
      if (activeAnalyses.get(owner) === operation) activeAnalyses.delete(owner)
    })
  const operation = { requestId, controller, promise }
  activeAnalyses.set(owner, operation)
  return promise
}

export function cancelOwnedAnalysis(owner: string, requestId: string): boolean {
  const active = activeAnalyses.get(owner)
  if (!active || active.requestId !== requestId) return false
  active.controller.abort()
  return true
}

export function abortLeetCodeAnalyses(): void {
  for (const active of activeAnalyses.values()) active.controller.abort()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function isOwnerId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
