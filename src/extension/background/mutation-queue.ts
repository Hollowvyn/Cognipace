// This queue is the worker's single mutation owner. Callers may run provider
// HTTP outside it, then enter again only to publish validated results.
type MutationQueueDependencies = {
  ready: () => Promise<unknown>
  assertIdle: () => void
  assertReadable?: () => void
  flush: () => Promise<void>
  waitForPendingCoreSave: () => Promise<void>
}

let dependencies: MutationQueueDependencies
let dbMutationQueue: Promise<void> = Promise.resolve()
let dbMutationDepth = 0
let queuedWork = 0
let hasPendingLocalSave = false
let pendingLocalSaveContinuation: (() => Promise<void>) | null = null
let recoveredGenericRetry: { key: string; result: unknown } | null = null
export const localSaveError =
  'Local data still needs saving. Retry saving before editing.'

export function configureMutationQueue(input: MutationQueueDependencies) {
  dependencies = input
}

export function isInMutationQueue() {
  return dbMutationDepth > 0
}

export function isLocalSavePending() {
  return hasPendingLocalSave
}

export function setPendingLocalSave(onDurable: () => Promise<void>) {
  hasPendingLocalSave = true
  pendingLocalSaveContinuation = onDurable
}

export function clearRecoveredMutationRetry() {
  recoveredGenericRetry = null
}

export function setRecoveredMutationRetry(key: string, result: unknown) {
  recoveredGenericRetry = { key, result }
}

export function takeRecoveredMutationRetry<T>(
  key: string,
): { result: T } | null {
  if (recoveredGenericRetry?.key !== key) return null
  const result = recoveredGenericRetry.result as T
  recoveredGenericRetry = null
  return { result }
}

export function runInMutationQueue<T>(work: () => Promise<T>) {
  queuedWork += 1
  const queued = dbMutationQueue.then(async () => {
    dbMutationDepth += 1
    try {
      return await work()
    } finally {
      dbMutationDepth -= 1
      queuedWork -= 1
    }
  })
  dbMutationQueue = queued.then(
    () => undefined,
    () => undefined,
  )
  return queued
}

export function runGatedMutationQueue<T>(
  work: () => Promise<T>,
  retryKey?: string,
) {
  return runInMutationQueue(async () => {
    await dependencies.ready()
    dependencies.assertIdle()
    await admitPriorCoreSave()
    if (recoveredGenericRetry?.key !== retryKey) recoveredGenericRetry = null
    return work()
  })
}

// Mixed core/archive reads stay on the same queue and still join pending core
// publication. Once the current pair is durable and adopted, bookkeeping may
// remain pending without breaking notification-triggered read-only refetches.
// Exports intentionally use runGatedMutationQueue and retain the full write gate.
export function runConsistentRead<T>(read: () => Promise<T>) {
  return runInMutationQueue(async () => {
    await dependencies.ready()
    const assertReadable =
      dependencies.assertReadable ?? dependencies.assertIdle
    assertReadable()
    await admitPriorCoreSave()
    return read()
  })
}

async function admitPriorCoreSave() {
  await resumePendingLocalSave()
  try {
    await dependencies.waitForPendingCoreSave()
  } catch (error) {
    setPendingLocalSave(() => Promise.resolve())
    throw new Error(localSaveError, { cause: error })
  }
}

export async function resumePendingLocalSave() {
  if (!hasPendingLocalSave) return
  try {
    await dependencies.flush()
  } catch (error) {
    throw new Error(localSaveError, { cause: error })
  }
  hasPendingLocalSave = false
  const continuation = pendingLocalSaveContinuation
  pendingLocalSaveContinuation = null
  await continuation?.()
}

// Trusted worker-only admission: no caller flags and no mutation-depth proxy.
// Submit at most one bounded batch, yielding to foreground work between passes.
export function runIdleMaintenanceBatch<T>(
  work: () => Promise<T>,
): Promise<T | null> {
  if (queuedWork !== 0 || hasPendingLocalSave) return Promise.resolve(null)
  return runInMutationQueue(async () => {
    await dependencies.ready()
    if (hasPendingLocalSave) return null
    try {
      dependencies.assertIdle()
      await dependencies.waitForPendingCoreSave()
    } catch {
      return null
    }
    return work()
  })
}
