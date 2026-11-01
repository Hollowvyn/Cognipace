import { z } from 'zod'
import {
  notesScopeSchema,
  noteTargetSchema,
  type NotesScope,
  type NoteTarget,
} from '@/features/notes/domain/notes-records'
import type { LocalIdbStore } from '@/platform/db/local-store-types'

const ownerSchema = z.strictObject({
  tabId: z.number().int().nonnegative().nullable(),
  documentId: z.string().min(1),
  host: z.string().min(1),
})
export type NotesEditOwner = z.infer<typeof ownerSchema>
const leaseSchema = z.strictObject({
  owner: ownerSchema,
  problemSlug: z.string(),
  scope: notesScopeSchema,
  target: noteTargetSchema,
})
export function notesEditOwner(
  surface: 'dashboard' | 'content-script',
  sender: unknown,
): NotesEditOwner {
  const s = z
    .object({
      documentId: z.string().min(1),
      url: z.url(),
      tab: z.object({ id: z.number().int().nonnegative() }).optional(),
    })
    .parse(sender)
  const url = new URL(s.url)
  if (
    surface === 'content-script' &&
    (!s.tab ||
      url.protocol !== 'https:' ||
      !['leetcode.com', 'www.leetcode.com'].includes(url.hostname))
  )
    throw new Error('Notes requires an actual HTTPS LeetCode sender.')
  return { tabId: s.tab?.id ?? null, documentId: s.documentId, host: url.host }
}
export function assertNotesEditOwner(
  expected: NotesEditOwner,
  actual: NotesEditOwner,
) {
  if (
    expected.tabId !== actual.tabId ||
    expected.documentId !== actual.documentId ||
    expected.host !== actual.host
  )
    throw new Error('Notes edit owner does not match.')
}
export function createNotesEditScopes(local: LocalIdbStore) {
  return {
    async issue(
      owner: NotesEditOwner,
      problemSlug: string,
      scope: NotesScope,
      target: NoteTarget,
    ) {
      const id = crypto.randomUUID()
      await local.writeTechnicalRecord(
        ['notes-edit-lease', id],
        leaseSchema.parse({ owner, problemSlug, scope, target }),
      )
      return id
    },
    async assert(
      id: string,
      owner: NotesEditOwner,
      command: { problemSlug: string; scope: NotesScope; target?: NoteTarget },
    ) {
      const lease = leaseSchema.parse(
        await local.readRecord(['notes-edit-lease', id]),
      )
      assertNotesEditOwner(lease.owner, owner)
      if (
        lease.problemSlug !== command.problemSlug ||
        lease.scope.datasetToken !== command.scope.datasetToken ||
        lease.scope.problemToken !== command.scope.problemToken ||
        (command.target &&
          JSON.stringify(command.target) !== JSON.stringify(lease.target))
      )
        throw new Error('Notes edit lease does not match the command.')
    },
  }
}
