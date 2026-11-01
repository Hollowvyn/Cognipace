// This queue is the worker's single mutation owner. Callers may run provider
// HTTP outside it, then enter again only to publish validated results.
type MutationQueueDependencies = {
  ready: () => Promise<unknown>
  assertIdle: () => void
  flush: () => Promise<void>
  waitForPendingCoreSave: () => Promise<void>
}

let dependencies: MutationQueueDependencies
let dbMutationQueue: Promise<void> = Promise.resolve()
let dbMutationDepth = 0
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
  const queued = dbMutationQueue.then(async () => {
    dbMutationDepth += 1
    try {
      return await work()
    } finally {
      dbMutationDepth -= 1
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
    await resumePendingLocalSave()
    try {
      await dependencies.waitForPendingCoreSave()
    } catch (error) {
      setPendingLocalSave(() => Promise.resolve())
      throw new Error(localSaveError, { cause: error })
    }
    if (recoveredGenericRetry?.key !== retryKey) recoveredGenericRetry = null
    return work()
  })
}

// Mixed core/archive reads and exports must observe the same durability gates
// as writes. Do not use a second read queue or bypass a pending replacement.
export function runConsistentRead<T>(read: () => Promise<T>) {
  return runGatedMutationQueue(read)
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
