import type { NotesInvalidation } from '@/features/notes/data/notes-repository'
import { onMessage } from '@/extension/messaging'
import {
  notesRuntimeSchemas,
  type NotesMethod,
} from '@/features/notes/api/notes-contracts'
import type { createNotesService } from '@/features/notes/server/notes-service'
import {
  assertCanSenderCallExtensionMethod,
  assertNotesProblemSender,
} from './runtime-policy'
import { notesEditOwner, type createNotesEditScopes } from './notes-edit-scopes'

type Service = ReturnType<typeof createNotesService>
export interface NotesHandlerDependencies {
  getService(): Promise<Service>
  getLeases(): ReturnType<typeof createNotesEditScopes>
  runRead<T>(work: () => Promise<T>): Promise<T>
  runMutation<T>(work: () => Promise<T>): Promise<T>
  // Trusted runtime admission check, evaluated inside this queue callback.
  // Never derived from request fields or a global mutation-depth flag.
  canMutate(): boolean
  now?: () => number
  emit(
    problemSlug: string,
    source: 'dashboard' | 'content-script',
    tags: NotesInvalidation['tags'],
  ): Promise<unknown>
}
export function registerNotesHandlers(deps: NotesHandlerDependencies) {
  const outboxRetryDelayMs = 1000
  const deliveryAttempts = new Map<
    string,
    { emitted: boolean; retryAt: number }
  >()

  function authorize(
    method: NotesMethod,
    surface: 'dashboard' | 'content-script',
    sender: unknown,
    slug?: string,
  ) {
    assertCanSenderCallExtensionMethod(method, surface, sender)
    if (surface === 'content-script' && slug !== undefined)
      assertNotesProblemSender(sender, slug)
  }
  async function drain(
    service: Service,
    source: 'dashboard' | 'content-script',
  ) {
    // Reads may perform these technical writes only after the trusted runtime
    // independently proves full mutation admission in this same queue callback.
    if (!deps.canMutate()) return
    try {
      const pendingRows = await service.listPendingInvalidations()
      const keys = new Set(pendingRows.map((row) => JSON.stringify(row.key)))
      for (const key of deliveryAttempts.keys())
        if (!keys.has(key)) deliveryAttempts.delete(key)
      for (const pending of pendingRows) {
        const key = JSON.stringify(pending.key)
        const now = deps.now?.() ?? performance.now()
        const attempt = deliveryAttempts.get(key) ?? {
          emitted: false,
          retryAt: 0,
        }
        if (now < attempt.retryAt) continue
        // Set cooldown before delivery: partial success can already schedule a
        // refetch even if another recipient makes emit reject.
        attempt.retryAt = now + outboxRetryDelayMs
        deliveryAttempts.set(key, attempt)
        try {
          if (!attempt.emitted) {
            await deps.emit(pending.problemSlug, source, pending.tags)
            attempt.emitted = true
          }
          // A delivered event is never emitted again just because its durable
          // acknowledgement aborted. Later operations retry only that ack.
          await service.acknowledgeInvalidation(pending.key)
          deliveryAttempts.delete(key)
        } catch {
          // The durable outbox remains. Retry after cooldown on a later
          // authorized operation, or retry safely in a fresh worker.
        }
      }
    } catch {
      // Failed outbox reads retain all durable work for a later operation.
    }
  }
  onMessage('notes.openEditor', ({ data, sender }) => {
    const schema = notesRuntimeSchemas['notes.openEditor']
    const request = schema.request.parse(data)
    authorize('notes.openEditor', request.surface, sender, request.problemSlug)
    const owner = notesEditOwner(request.surface, sender)
    return deps.runMutation(async () => {
      const service = await deps.getService()
      await drain(service, request.surface)
      const document = await service.readDocument(
        request.problemSlug,
        request.target,
      )
      const scope = await service.acquireScope(request.problemSlug)
      const editLeaseId = await deps
        .getLeases()
        .issue(owner, request.problemSlug, scope, request.target)
      return schema.result.parse({ scope, editLeaseId, document })
    })
  })
  onMessage('notes.saveDocument', ({ data, sender }) => {
    const schema = notesRuntimeSchemas['notes.saveDocument']
    const request = schema.request.parse(data)
    authorize('notes.saveDocument', request.surface, sender)
    const owner = notesEditOwner(request.surface, sender)
    return deps.runMutation(async () => {
      await deps.getLeases().assert(request.editLeaseId, owner, request.command)
      const service = await deps.getService()
      const result = schema.result.parse(
        await service.saveDocument(request.command),
      )
      await drain(service, request.surface)
      return result
    })
  })
  onMessage('notes.setSavedAiNote', ({ data, sender }) => {
    const schema = notesRuntimeSchemas['notes.setSavedAiNote']
    const request = schema.request.parse(data)
    authorize('notes.setSavedAiNote', request.surface, sender)
    const owner = notesEditOwner(request.surface, sender)
    return deps.runMutation(async () => {
      await deps.getLeases().assert(request.editLeaseId, owner, {
        ...request.command,
        target: { kind: 'problem' },
      })
      const service = await deps.getService()
      const result = schema.result.parse(
        await service.setSavedAiNote(request.command),
      )
      await drain(service, request.surface)
      return result
    })
  })
  onMessage('notes.getProblemNotes', ({ data, sender }) => {
    const schema = notesRuntimeSchemas['notes.getProblemNotes']
    const request = schema.request.parse(data)
    authorize(
      'notes.getProblemNotes',
      request.surface,
      sender,
      request.problemSlug,
    )
    return deps.runRead(async () => {
      const service = await deps.getService()
      await drain(service, request.surface)
      return schema.result.parse(
        await service.getProblemNotes(request.problemSlug, {
          readOnly: !deps.canMutate(),
        }),
      )
    })
  })
  onMessage('notes.listSubmissions', ({ data, sender }) => {
    const schema = notesRuntimeSchemas['notes.listSubmissions']
    const request = schema.request.parse(data)
    authorize(
      'notes.listSubmissions',
      request.surface,
      sender,
      request.problemSlug,
    )
    if (
      request.cursor?.problemSlug !== undefined &&
      request.cursor.problemSlug !== request.problemSlug
    )
      throw new Error('Submission cursor does not match the problem.')
    return deps.runRead(async () => {
      const service = await deps.getService()
      await drain(service, request.surface)
      const scope = deps.canMutate()
        ? await service.acquireScope(request.problemSlug)
        : await service.readScope(request.problemSlug)
      if (!scope)
        throw new Error('Notes scope is unavailable until saving finishes.')
      if (
        request.cursor &&
        (request.cursor.scope.datasetToken !== scope.datasetToken ||
          request.cursor.scope.problemToken !== scope.problemToken)
      )
        throw new Error('Submission cursor is stale.')
      const page = await service.listSubmissionMetadata(
        request.problemSlug,
        request.limit,
        request.cursor
          ? { submittedAt: request.cursor.submittedAt, id: request.cursor.id }
          : undefined,
      )
      return schema.result.parse({
        ...page,
        nextCursor: page.nextCursor
          ? { ...page.nextCursor, problemSlug: request.problemSlug, scope }
          : null,
      })
    })
  })
  onMessage('notes.getSubmission', ({ data, sender }) => {
    const schema = notesRuntimeSchemas['notes.getSubmission']
    const request = schema.request.parse(data)
    authorize(
      'notes.getSubmission',
      request.surface,
      sender,
      request.problemSlug,
    )
    return deps.runRead(async () => {
      const service = await deps.getService()
      await drain(service, request.surface)
      return schema.result.parse(
        await service.readSubmissionEntry(
          request.problemSlug,
          request.submissionId,
        ),
      )
    })
  })
  onMessage('notes.getAssessment', ({ data, sender }) => {
    const schema = notesRuntimeSchemas['notes.getAssessment']
    const request = schema.request.parse(data)
    authorize(
      'notes.getAssessment',
      request.surface,
      sender,
      request.problemSlug,
    )
    return deps.runRead(async () => {
      const service = await deps.getService()
      await drain(service, request.surface)
      return schema.result.parse(
        await service.readAssessment(request.problemSlug, request.assessmentId),
      )
    })
  })
}
