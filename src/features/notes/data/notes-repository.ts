import { z } from 'zod'
import { problemSlugSchema } from '@/features/problems/api/problems-contracts'
import {
  localHeadSchema,
  type LocalIdbStore,
  type LocalHead,
} from '@/platform/db/local-store-types'
import { nextDataHead } from '@/platform/db/snapshot-idb'
import {
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
async function digest(command: SaveNoteCommand) {
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
  const repository = {
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
