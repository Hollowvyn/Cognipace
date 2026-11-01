import { describe, expect, it } from 'vitest'
import {
  assertNotesEditOwner,
  notesEditOwner,
  createNotesEditScopes,
} from './notes-edit-scopes'
import { createNotesTestContext } from '@/features/notes/testing/notes-test-context'

const sender = {
  tab: { id: 7 },
  documentId: 'document-a',
  url: 'https://leetcode.com/problems/two-sum/',
}
describe('notes edit leases', () => {
  it('binds exact tab, document and host and refuses unreliable identities', () => {
    const owner = notesEditOwner('content-script', sender)
    for (const patch of [
      { tabId: 8 },
      { documentId: 'other' },
      { host: 'www.leetcode.com' },
    ])
      expect(() => assertNotesEditOwner(owner, { ...owner, ...patch })).toThrow(
        'Notes edit owner does not match.',
      )
    expect(() =>
      notesEditOwner('content-script', { ...sender, documentId: undefined }),
    ).toThrow()
  })
  it('persists A ownership across worker restart and same-document SPA navigation', async () => {
    const c = await createNotesTestContext()
    try {
      const scopes = createNotesEditScopes(c.localStore)
      const scope = await c.repository.acquireScope('two-sum')
      const owner = notesEditOwner('content-script', sender)
      const editLeaseId = await scopes.issue(owner, 'two-sum', scope, {
        kind: 'problem',
      })
      const restarted = createNotesEditScopes(c.localStore)
      await expect(
        restarted.assert(
          editLeaseId,
          notesEditOwner('content-script', {
            ...sender,
            url: 'https://leetcode.com/problems/add-two-numbers/',
          }),
          { problemSlug: 'two-sum', scope, target: { kind: 'problem' } },
        ),
      ).resolves.toBeUndefined()
      await expect(
        restarted.assert(editLeaseId, owner, {
          problemSlug: 'add-two-numbers',
          scope,
          target: { kind: 'problem' },
        }),
      ).rejects.toThrow()
    } finally {
      await c.close()
    }
  })
})
