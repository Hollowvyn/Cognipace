import { onMessage } from '@/extension/messaging'
import {
  importApplyRequestSchema,
  importApplyResponseSchema,
  importPreviewRequestSchema,
  importPreviewResponseSchema,
  importRetryPersistenceRequestSchema,
  importRetryPersistenceResponseSchema,
} from '@/features/imports/api/import-runtime-contracts'
import {
  applyContentImport,
  previewContentImport,
} from '@/features/imports/server/import-service'
import type { Db } from '@/platform/db'

import { assertCanSenderCallExtensionMethod } from './runtime-policy'

export type ImportHandlerDependencies = {
  runInMutationQueue<T>(work: () => Promise<T>): Promise<T>
  getDb(): Promise<Db>
  flush(): Promise<void>
  markDirty(): Promise<void>
  invalidate(): Promise<unknown>
  scheduleSync(): Promise<void>
}

export function registerImportHandlers(deps: ImportHandlerDependencies) {
  let pendingPersistence = false

  onMessage('imports.preview', ({ data, sender }) => {
    const request = importPreviewRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'imports.preview',
      request.surface,
      sender,
    )

    return deps.runInMutationQueue(async () => {
      const db = await deps.getDb()
      return importPreviewResponseSchema.parse(
        await previewContentImport(db, request.fileText),
      )
    })
  })

  onMessage('imports.apply', ({ data, sender }) => {
    const request = importApplyRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod('imports.apply', request.surface, sender)

    return deps.runInMutationQueue(async () => {
      const db = await deps.getDb()
      const result = await applyContentImport(
        db,
        request.fileText,
        request.fingerprint,
      )
      const preview = importPreviewResponseSchema.parse(result.preview)

      if (result.status !== 'committed') {
        return importApplyResponseSchema.parse({
          status: result.status,
          preview,
        })
      }

      pendingPersistence = true
      await ignoreFailure(() => deps.markDirty())

      try {
        await deps.flush()
      } catch {
        await ignoreFailure(() => deps.invalidate())
        return importApplyResponseSchema.parse({
          status: 'persistence-error',
          preview,
        })
      }

      pendingPersistence = false
      await invalidateAndScheduleSync(deps)

      return importApplyResponseSchema.parse({ status: 'saved', preview })
    })
  })

  onMessage('imports.retryPersistence', ({ data, sender }) => {
    const request = importRetryPersistenceRequestSchema.parse(data)
    assertCanSenderCallExtensionMethod(
      'imports.retryPersistence',
      request.surface,
      sender,
    )

    return deps.runInMutationQueue(async () => {
      if (!pendingPersistence) {
        return importRetryPersistenceResponseSchema.parse({
          status: 'repreview',
        })
      }

      try {
        await deps.flush()
      } catch {
        return importRetryPersistenceResponseSchema.parse({
          status: 'persistence-error',
        })
      }

      pendingPersistence = false
      await invalidateAndScheduleSync(deps)

      return importRetryPersistenceResponseSchema.parse({ status: 'saved' })
    })
  })
}

async function invalidateAndScheduleSync(deps: ImportHandlerDependencies) {
  await ignoreFailure(() => deps.invalidate())
  await ignoreFailure(() => deps.scheduleSync())
}

async function ignoreFailure(work: () => Promise<unknown>) {
  try {
    await work()
  } catch {
    // The database commit is already durable or remains pending persistence.
  }
}
