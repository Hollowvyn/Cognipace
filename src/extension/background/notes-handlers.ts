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
  run<T>(work: () => Promise<T>): Promise<T>
  emit(
    problemSlug: string,
    source: 'dashboard' | 'content-script',
    tags: NotesInvalidation['tags'],
  ): Promise<unknown>
}
export function registerNotesHandlers(deps: NotesHandlerDependencies) {
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
    // A failed delivery retains the compact durable outbox. Never reexecute a
    // committed command merely to retry a cache or sync notification.
    try {
      for (const pending of await service.listPendingInvalidations()) {
        await deps.emit(pending.problemSlug, source, pending.tags)
        await service.acknowledgeInvalidation(pending.key)
      }
    } catch {
      /* Retry on the next authorized Notes operation. */
    }
  }
  onMessage('notes.openEditor', ({ data, sender }) => {
    const schema = notesRuntimeSchemas['notes.openEditor']
    const request = schema.request.parse(data)
    authorize('notes.openEditor', request.surface, sender, request.problemSlug)
    const owner = notesEditOwner(request.surface, sender)
    return deps.run(async () => {
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
    return deps.run(async () => {
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
    return deps.run(async () => {
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
    return deps.run(async () => {
      const service = await deps.getService()
      await drain(service, request.surface)
      return schema.result.parse(
        await service.getProblemNotes(request.problemSlug),
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
    return deps.run(async () => {
      const service = await deps.getService()
      await drain(service, request.surface)
      const scope = await service.acquireScope(request.problemSlug)
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
    return deps.run(async () => {
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
    return deps.run(async () => {
      const service = await deps.getService()
      await drain(service, request.surface)
      return schema.result.parse(
        await service.readAssessment(request.problemSlug, request.assessmentId),
      )
    })
  })
}
