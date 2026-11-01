import { z } from 'zod'
import { problemSlugSchema } from '@/features/problems/api/problems-contracts'
import {
  localHeadSchema,
  type LocalIdbStore,
  type LocalHead,
} from '@/platform/db/local-store-types'
import { nextDataHead } from '@/platform/db/snapshot-idb'
import {
  assessmentRecordSchema,
  notesPayloadSchema,
  savedAiNoteRecordSchema,
  savedAiCommandSchema,
  type SavedAiCommand,
  type SavedAiResult,
  noteTargetSchema,
  notesScopeSchema,
  problemNoteRecordSchema,
  saveNoteCommandSchema,
  submissionRecordSchema,
  type NoteDocument,
  type NoteTarget,
  type NotesScope,
  type SaveNoteCommand,
  type SaveNoteResult,
  type SubmissionRecord,
} from '../domain/notes-records'

const receiptSchema = z.strictObject({
  status: z.literal('saved'),
  commandDigest: z.string().regex(/^[a-f0-9]{64}$/),
  target: noteTargetSchema,
  documentRevision: z.number().int().nonnegative(),
  documentUpdatedAt: z.iso.datetime().nullable(),
  globalRevision: z.number().int().positive(),
})
export type NoteCommandReceipt = z.infer<typeof receiptSchema>
const pendingInvalidationSchema = z.strictObject({
  problemSlug: problemSlugSchema,
  tags: z.union([
    z.tuple([z.literal('notes'), z.literal('sync')]),
    z.tuple([z.literal('notes'), z.literal('submissions'), z.literal('sync')]),
  ]),
})
export type NotesInvalidation = z.infer<typeof pendingInvalidationSchema>

export type SubmissionMetadata = Omit<
  SubmissionRecord,
  'reflection' | 'diagnostics' | 'observedAttemptIds' | 'codePayloadId'
>
export interface SubmissionCursor {
  submittedAt: string
  id: string
}
const emptyDocument = (): NoteDocument => ({
  formatVersion: 1,
  revision: 0,
  markdown: '',
  updatedAt: null,
})
const receiptKey = (c: SaveNoteCommand): IDBValidKey => [
  'notes-command',
  c.scope.datasetToken,
  c.scope.problemToken,
  c.commandId,
]
function sameScope(a: NotesScope, b: NotesScope) {
  return a.datasetToken === b.datasetToken && a.problemToken === b.problemToken
}
function onRead(
  request: IDBRequest,
  fail: (error: unknown) => void,
  consume: (value: unknown) => void,
) {
  request.onsuccess = () => {
    try {
      consume(request.result)
    } catch (error) {
      fail(error)
    }
  }
}
function requireHead(value: unknown): LocalHead {
  return localHeadSchema.parse(value)
}
function submission(value: unknown): SubmissionRecord | null {
  if (value === undefined) return null
  // Storage index fields are infrastructure, outside the archive schema.
  return submissionRecordSchema.strip().parse(value)
}
async function digest(command: SaveNoteCommand | SavedAiCommand) {
  const bytes = new TextEncoder().encode(JSON.stringify(command))
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}

export function createNotesRepository(
  local: LocalIdbStore,
  now: () => Date = () => new Date(),
) {
  const outboxKey = (
    scope: NotesScope,
    kind: 'document' | 'saved-ai',
    commandId: string,
  ): IDBValidKey => [
    'notes-outbox',
    scope.datasetToken,
    scope.problemToken,
    kind,
    commandId,
  ]
  const repository = {
    async listPendingInvalidations(): Promise<
      Array<NotesInvalidation & { key: IDBValidKey }>
    > {
      return local.transact(['records'], 'readonly', (s, done, fail) => {
        onRead(s.records.get('active'), fail, (value) => {
          const head = requireHead(value)
          const request = s.records.openCursor(
            IDBKeyRange.bound(
              ['notes-outbox', head.datasetToken],
              ['notes-outbox', head.datasetToken, []],
            ),
          )
          const rows: Array<NotesInvalidation & { key: IDBValidKey }> = []
          onRead(request, fail, (value) => {
            const cursor = value as IDBCursorWithValue | null
            if (!cursor) {
              done(rows)
              return
            }
            const row = pendingInvalidationSchema.parse(cursor.value)
            rows.push({ key: cursor.key, ...row })
            cursor.continue()
          })
        })
      })
    },
    acknowledgeInvalidation(key: IDBValidKey): Promise<void> {
      return local.transact(['records'], 'readwrite', (s, done) => {
        s.records.delete(key)
        done(undefined)
      })
    },
    async getProblemNotes(problemSlug: string) {
      const scope = await repository.acquireScope(problemSlug)
      return local.transact<
        {
          document: NoteDocument
          scope: NotesScope
          collectionRevision: number
          savedAiNotes: Array<z.infer<typeof savedAiNoteRecordSchema>>
        },
        'records' | 'problemNotes' | 'savedAiNotes'
      >(
        ['records', 'problemNotes', 'savedAiNotes'],
        'readonly',
        (s, done, fail) => {
          onRead(s.records.get('active'), fail, (value) => {
            const h = requireHead(value)
            onRead(
              s.problemNotes.get([h.archiveGeneration, problemSlug]),
              fail,
              (value) => {
                const note =
                  value === undefined
                    ? null
                    : problemNoteRecordSchema.parse(value)
                const prefix = [h.archiveGeneration, problemSlug]
                onRead(
                  s.savedAiNotes
                    .index('byProblem')
                    .getAll(IDBKeyRange.bound(prefix, [...prefix, []])),
                  fail,
                  (value) => {
                    done({
                      document: note?.document ?? emptyDocument(),
                      scope,
                      collectionRevision: note?.savedAiCollectionRevision ?? 0,
                      savedAiNotes: z
                        .array(savedAiNoteRecordSchema.strip())
                        .parse(value),
                    })
                  },
                )
              },
            )
          })
        },
      )
    },
    readAssessment(problemSlug: string, assessmentId: string) {
      problemSlugSchema.parse(problemSlug)
      assessmentRecordSchema.shape.id.parse(assessmentId)
      return local.transact<
        import('../api/notes-contracts').NotesResult<'notes.getAssessment'>,
        'records' | 'analysisReports' | 'payloads'
      >(
        ['records', 'analysisReports', 'payloads'],
        'readonly',
        (s, done, fail) => {
          onRead(s.records.get('active'), fail, (value) => {
            const h = requireHead(value)
            onRead(
              s.analysisReports.get([h.archiveGeneration, assessmentId]),
              fail,
              (value) => {
                if (value === undefined) {
                  done(null)
                  return
                }
                const assessment = assessmentRecordSchema.strip().parse(value)
                if (assessment.problemSlug !== problemSlug) {
                  done(null)
                  return
                }
                onRead(
                  s.payloads.get(assessment.feedbackPayloadId),
                  fail,
                  (value) => {
                    const feedback = notesPayloadSchema.parse(value)
                    if (feedback.kind !== 'feedback-v1')
                      throw new Error('Invalid feedback payload.')
                    if (!assessment.implementationPayloadId) {
                      done({
                        assessment,
                        feedback: feedback.body,
                        implementation: null,
                      })
                      return
                    }
                    onRead(
                      s.payloads.get(assessment.implementationPayloadId),
                      fail,
                      (value) => {
                        const implementation = notesPayloadSchema.parse(value)
                        if (implementation.kind !== 'implementation-v1')
                          throw new Error('Invalid implementation payload.')
                        done({
                          assessment,
                          feedback: feedback.body,
                          implementation: implementation.body,
                        })
                      },
                    )
                  },
                )
              },
            )
          })
        },
      )
    },
    readSubmissionEntry(problemSlug: string, submissionId: string) {
      problemSlugSchema.parse(problemSlug)
      submissionRecordSchema.shape.id.parse(submissionId)
      return local.transact<
        import('../api/notes-contracts').NotesResult<'notes.getSubmission'>,
        'records' | 'submissions' | 'payloads'
      >(['records', 'submissions', 'payloads'], 'readonly', (s, done, fail) => {
        onRead(s.records.get('active'), fail, (value) => {
          const h = requireHead(value)
          onRead(
            s.submissions.get([h.archiveGeneration, submissionId]),
            fail,
            (value) => {
              const row = submission(value)
              if (!row || row.problemSlug !== problemSlug) {
                done(null)
                return
              }
              if (!row.codePayloadId) {
                done({ submission: row, code: null })
                return
              }
              onRead(s.payloads.get(row.codePayloadId), fail, (value) => {
                const payload = notesPayloadSchema.parse(value)
                if (payload.kind !== 'submitted-code')
                  throw new Error('Invalid submitted code payload.')
                done({ submission: row, code: payload.body })
              })
            },
          )
        })
      })
    },
    async setSavedAiNote(input: SavedAiCommand): Promise<SavedAiResult> {
      const command = savedAiCommandSchema.parse(input)
      const commandDigest = await digest(command)
      const key: IDBValidKey = [
        'notes-ai-command',
        command.scope.datasetToken,
        command.scope.problemToken,
        command.commandId,
      ]
      return local.transact<
        SavedAiResult,
        | 'records'
        | 'problemScopes'
        | 'problemNotes'
        | 'analysisReports'
        | 'savedAiNotes'
      >(
        [
          'records',
          'problemScopes',
          'problemNotes',
          'analysisReports',
          'savedAiNotes',
        ],
        'readwrite',
        (s, done, fail) => {
          onRead(s.records.get('active'), fail, (value) => {
            const h = requireHead(value)
            const noteKey = [h.archiveGeneration, command.problemSlug]
            onRead(s.problemScopes.get(noteKey), fail, (value) => {
              if (
                value === undefined ||
                h.datasetToken !== command.scope.datasetToken ||
                !sameScope(notesScopeSchema.parse(value), command.scope)
              ) {
                done({ status: 'stale-scope' })
                return
              }
              onRead(s.problemNotes.get(noteKey), fail, (value) => {
                const note =
                  value === undefined
                    ? null
                    : problemNoteRecordSchema.parse(value)
                const collectionRevision = note?.savedAiCollectionRevision ?? 0
                const memberKey = [
                  h.archiveGeneration,
                  command.problemSlug,
                  command.assessmentId,
                ]
                onRead(s.savedAiNotes.get(memberKey), fail, (member) => {
                  onRead(s.records.get(key), fail, (value) => {
                    if (value !== undefined) {
                      const receipt = z
                        .strictObject({
                          commandDigest: z.string(),
                          appliedRevision: z.number().int().nonnegative(),
                        })
                        .parse(value)
                      if (receipt.commandDigest !== commandDigest)
                        throw new Error(
                          'Command identity reused with different content.',
                        )
                      done({
                        status: 'saved',
                        commandId: command.commandId,
                        appliedRevision: receipt.appliedRevision,
                        collectionRevision,
                        saved: member !== undefined,
                      })
                      return
                    }
                    if (
                      command.expectedCollectionRevision !== collectionRevision
                    ) {
                      done({ status: 'conflict', collectionRevision })
                      return
                    }
                    onRead(
                      s.analysisReports.get([
                        h.archiveGeneration,
                        command.assessmentId,
                      ]),
                      fail,
                      (value) => {
                        if (
                          value === undefined ||
                          assessmentRecordSchema.strip().parse(value)
                            .problemSlug !== command.problemSlug
                        )
                          throw new Error(
                            'Assessment does not belong to this problem.',
                          )
                        const changed = (member !== undefined) !== command.saved
                        if (
                          changed &&
                          collectionRevision >= Number.MAX_SAFE_INTEGER
                        )
                          throw new Error('Collection revision limit reached.')
                        const appliedRevision =
                          collectionRevision + (changed ? 1 : 0)
                        if (changed) {
                          const time = now()
                          if (command.saved)
                            s.savedAiNotes.put(
                              {
                                problemSlug: command.problemSlug,
                                assessmentId: command.assessmentId,
                                savedAt: time.toISOString(),
                                archiveGeneration: h.archiveGeneration,
                              },
                              memberKey,
                            )
                          else s.savedAiNotes.delete(memberKey)
                          s.problemNotes.put(
                            {
                              problemSlug: command.problemSlug,
                              document: note?.document ?? emptyDocument(),
                              savedAiCollectionRevision: appliedRevision,
                            },
                            noteKey,
                          )
                          s.records.put(nextDataHead(h, time), 'active')
                          s.records.put(
                            {
                              problemSlug: command.problemSlug,
                              tags: ['notes', 'sync'],
                            },
                            outboxKey(
                              command.scope,
                              'saved-ai',
                              command.commandId,
                            ),
                          )
                        }
                        s.records.add({ commandDigest, appliedRevision }, key)
                        done({
                          status: 'saved',
                          commandId: command.commandId,
                          appliedRevision,
                          collectionRevision: appliedRevision,
                          saved: command.saved,
                        })
                      },
                    )
                  })
                })
              })
            })
          })
        },
      )
    },
    acquireScope(problemSlug: string): Promise<NotesScope> {
      problemSlugSchema.parse(problemSlug)
      return local.transact(
        ['records', 'problemScopes'],
        'readwrite',
        (s, done, fail) => {
          onRead(s.records.get('active'), fail, (value) => {
            const head = requireHead(value)
            const key = [head.archiveGeneration, problemSlug]
            onRead(s.problemScopes.get(key), fail, (value) => {
              const previous =
                value === undefined ? null : notesScopeSchema.parse(value)
              const scope =
                previous?.datasetToken === head.datasetToken
                  ? previous
                  : {
                      datasetToken: head.datasetToken,
                      problemToken: crypto.randomUUID(),
                    }
              if (scope !== previous) s.problemScopes.put(scope, key)
              done(scope)
            })
          })
        },
      )
    },
    readDocument(
      problemSlug: string,
      target: NoteTarget,
    ): Promise<NoteDocument> {
      problemSlugSchema.parse(problemSlug)
      target = noteTargetSchema.parse(target)
      return local.transact(
        ['records', 'problemNotes', 'submissions'],
        'readonly',
        (s, done, fail) => {
          onRead(s.records.get('active'), fail, (value) => {
            const head = requireHead(value)
            const request =
              target.kind === 'problem'
                ? s.problemNotes.get([head.archiveGeneration, problemSlug])
                : s.submissions.get([
                    head.archiveGeneration,
                    target.submissionId,
                  ])
            onRead(request, fail, (value) => {
              if (target.kind === 'problem')
                done(
                  value === undefined
                    ? emptyDocument()
                    : problemNoteRecordSchema.parse(value).document,
                )
              else {
                const row = submission(value)
                if (!row || row.problemSlug !== problemSlug)
                  throw new Error('Submission does not belong to this problem.')
                done(row.reflection)
              }
            })
          })
        },
      )
    },
    readCommandReceipt(
      input: SaveNoteCommand,
    ): Promise<NoteCommandReceipt | null> {
      const command = saveNoteCommandSchema.parse(input)
      return local.transact(['records'], 'readonly', (s, done, fail) => {
        onRead(s.records.get(receiptKey(command)), fail, (value) =>
          done(value === undefined ? null : receiptSchema.parse(value)),
        )
      })
    },
    async saveDocument(input: SaveNoteCommand): Promise<SaveNoteResult> {
      const command = saveNoteCommandSchema.parse(input)
      // Crypto must finish before opening a live IndexedDB transaction.
      const commandDigest = await digest(command)
      const result = await local.transact<
        SaveNoteResult,
        'records' | 'problemScopes' | 'problemNotes' | 'submissions'
      >(
        ['records', 'problemScopes', 'problemNotes', 'submissions'],
        'readwrite',
        (s, done, fail) => {
          onRead(s.records.get('active'), fail, (value) => {
            const head = requireHead(value)
            onRead(
              s.problemScopes.get([
                head.archiveGeneration,
                command.problemSlug,
              ]),
              fail,
              (value) => {
                if (
                  value === undefined ||
                  head.datasetToken !== command.scope.datasetToken ||
                  !sameScope(notesScopeSchema.parse(value), command.scope)
                ) {
                  done({ status: 'stale-scope' })
                  return
                }
                onRead(s.records.get(receiptKey(command)), fail, (value) => {
                  if (value !== undefined) {
                    const receipt = receiptSchema.parse(value)
                    if (receipt.commandDigest !== commandDigest)
                      throw new Error(
                        'Command identity reused with different content.',
                      )
                    done({
                      status: 'saved',
                      commandId: command.commandId,
                      document: {
                        formatVersion: 1,
                        revision: receipt.documentRevision,
                        markdown: command.markdown,
                        updatedAt: receipt.documentUpdatedAt,
                      },
                    })
                    return
                  }
                  const target = command.target
                  const key = [
                    head.archiveGeneration,
                    target.kind === 'problem'
                      ? command.problemSlug
                      : target.submissionId,
                  ]
                  const store =
                    target.kind === 'problem' ? s.problemNotes : s.submissions
                  onRead(store.get(key), fail, (value) => {
                    const note =
                      target.kind === 'problem' && value !== undefined
                        ? problemNoteRecordSchema.parse(value)
                        : null
                    const row =
                      target.kind === 'reflection' ? submission(value) : null
                    if (
                      target.kind === 'reflection' &&
                      (!row || row.problemSlug !== command.problemSlug)
                    )
                      throw new Error(
                        'Submission does not belong to this problem.',
                      )
                    const current =
                      note?.document ?? row?.reflection ?? emptyDocument()
                    if (current.revision !== command.expectedRevision) {
                      done({ status: 'conflict', document: current })
                      return
                    }
                    const changed = current.markdown !== command.markdown
                    if (changed && current.revision >= Number.MAX_SAFE_INTEGER)
                      throw new Error('Document revision limit reached.')
                    const timestamp = now()
                    const document: NoteDocument = changed
                      ? {
                          formatVersion: 1,
                          revision: current.revision + 1,
                          markdown: command.markdown,
                          updatedAt: timestamp.toISOString(),
                        }
                      : current
                    const next = changed ? nextDataHead(head, timestamp) : head
                    if (changed) {
                      if (target.kind === 'problem')
                        s.problemNotes.put(
                          {
                            problemSlug: command.problemSlug,
                            document,
                            savedAiCollectionRevision:
                              note?.savedAiCollectionRevision ?? 0,
                          },
                          key,
                        )
                      else
                        s.submissions.put(
                          {
                            ...row!,
                            reflection: document,
                            archiveGeneration: head.archiveGeneration,
                          },
                          key,
                        )
                      s.records.put(next, 'active')
                      s.records.put(
                        {
                          problemSlug: command.problemSlug,
                          tags:
                            target.kind === 'reflection'
                              ? ['notes', 'submissions', 'sync']
                              : ['notes', 'sync'],
                        },
                        outboxKey(command.scope, 'document', command.commandId),
                      )
                    }
                    const receipt: NoteCommandReceipt = {
                      status: 'saved',
                      commandDigest,
                      target,
                      documentRevision: document.revision,
                      documentUpdatedAt: document.updatedAt,
                      globalRevision: next.revision,
                    }
                    s.records.add(receipt, receiptKey(command))
                    // finish schedules the result; the adapter resolves only oncomplete.
                    done({
                      status: 'saved',
                      commandId: command.commandId,
                      document,
                    })
                  })
                })
              },
            )
          })
        },
      )
      if (result.status === 'saved') {
        const receipt = await repository.readCommandReceipt(command)
        if (!receipt || receipt.commandDigest !== commandDigest)
          throw new Error(
            'Committed note receipt could not be verified. Retry saving.',
          )
      }
      return result
    },
    readSubmission(
      problemSlug: string,
      submissionId: string,
    ): Promise<SubmissionRecord | null> {
      problemSlugSchema.parse(problemSlug)
      noteTargetSchema.parse({ kind: 'reflection', submissionId })
      return local.transact(
        ['records', 'submissions'],
        'readonly',
        (s, done, fail) => {
          onRead(s.records.get('active'), fail, (value) => {
            const head = requireHead(value)
            onRead(
              s.submissions.get([head.archiveGeneration, submissionId]),
              fail,
              (value) => {
                const row = submission(value)
                done(row?.problemSlug === problemSlug ? row : null)
              },
            )
          })
        },
      )
    },
    listSubmissionMetadata(
      problemSlug: string,
      limit = 3,
      cursor?: SubmissionCursor,
    ): Promise<{
      items: SubmissionMetadata[]
      nextCursor: SubmissionCursor | null
    }> {
      problemSlugSchema.parse(problemSlug)
      z.number().int().min(1).max(50).parse(limit)
      if (cursor)
        z.strictObject({
          submittedAt: z.iso.datetime(),
          id: z.string().min(1),
        }).parse(cursor)
      return local.transact(
        ['records', 'submissions'],
        'readonly',
        (s, done, fail) => {
          onRead(s.records.get('active'), fail, (value) => {
            const head = requireHead(value)
            const lower = [head.archiveGeneration, problemSlug]
            const upper = cursor
              ? [...lower, cursor.submittedAt, cursor.id]
              : [...lower, []]
            const range = IDBKeyRange.bound(lower, upper, false, !!cursor)
            const request = s.submissions
              .index('byProblem')
              .openCursor(range, 'prev')
            const items: SubmissionMetadata[] = []
            onRead(request, fail, (value) => {
              const current = value as IDBCursorWithValue | null
              if (!current || items.length === limit) {
                const last = items.at(-1)
                done({
                  items,
                  nextCursor:
                    current && last
                      ? { submittedAt: last.submittedAt, id: last.id }
                      : null,
                })
                return
              }
              const row = submission(current.value)!
              const metadata = submissionRecordSchema
                .omit({
                  reflection: true,
                  diagnostics: true,
                  observedAttemptIds: true,
                  codePayloadId: true,
                })
                .strip()
                .parse(row)
              items.push(metadata)
              current.continue()
            })
          })
        },
      )
    },
  }
  return repository
}
export type NotesRepository = ReturnType<typeof createNotesRepository>
