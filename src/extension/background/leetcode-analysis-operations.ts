import type { AiProviderId } from '@/lib/ai/types'

type ActiveOperation = {
  requestId: string
  provider?: AiProviderId
  controller: AbortController
  promise: Promise<unknown>
}

const activeAnalyses = new Map<string, ActiveOperation>()
const activeHints = new Map<string, ActiveOperation>()

/** Hints and reports retain independent volatile ownership. */
export function runOwnedHints<T>(
  owner: string,
  requestId: string,
  provider: AiProviderId,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return runOwnedOperation(activeHints, owner, requestId, work, provider)
}

export function cancelOwnedHints(owner: string, requestId: string): boolean {
  return cancelOwnedOperation(activeHints, owner, requestId)
}

export function abortLeetCodeHints(provider?: AiProviderId): void {
  for (const active of activeHints.values()) {
    if (provider === undefined || active.provider === provider)
      active.controller.abort()
  }
}

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
  return runOwnedOperation(activeAnalyses, owner, requestId, work)
}

export function cancelOwnedAnalysis(owner: string, requestId: string): boolean {
  return cancelOwnedOperation(activeAnalyses, owner, requestId)
}

export function abortLeetCodeAnalyses(): void {
  for (const active of activeAnalyses.values()) active.controller.abort()
}

function runOwnedOperation<T>(
  operations: Map<string, ActiveOperation>,
  owner: string,
  requestId: string,
  work: (signal: AbortSignal) => Promise<T>,
  provider?: AiProviderId,
): Promise<T> {
  const active = operations.get(owner)
  if (active?.requestId === requestId) return active.promise as Promise<T>
  active?.controller.abort()
  const controller = new AbortController()
  const promise = Promise.resolve()
    .then(() => work(controller.signal))
    .finally(() => {
      if (operations.get(owner) === operation) operations.delete(owner)
    })
  const operation = {
    requestId,
    ...(provider === undefined ? {} : { provider }),
    controller,
    promise,
  }
  operations.set(owner, operation)
  return promise
}

function cancelOwnedOperation(
  operations: Map<string, ActiveOperation>,
  owner: string,
  requestId: string,
): boolean {
  const active = operations.get(owner)
  if (!active || active.requestId !== requestId) return false
  active.controller.abort()
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function isOwnerId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
