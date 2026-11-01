import { describe, expect, it, vi } from 'vitest'
import { IDBObjectStore } from 'fake-indexeddb'
import { createNotesTestContext } from '../testing/notes-test-context'
import { makeNotesArchive } from '../testing/notes-fixtures'
import { createNotesService } from '../server/notes-service'
import type { SaveNoteCommand } from '../domain/notes-records'

describe('notes durable commands', () => {
  async function setup() {
    const context = await createNotesTestContext()
    const scope = await context.repository.acquireScope('two-sum')
    const command: SaveNoteCommand = {
      commandId: 'save-1',
      problemSlug: 'two-sum',
      scope,
      target: { kind: 'problem' },
      expectedRevision: 0,
      markdown: 'Use a map.',
    }
    return { ...context, command }
  }
  it('replays exactly without advancing the head and conflicts on a new stale command', async () => {
    const c = await setup()
    try {
      const first = await c.repository.saveDocument(c.command)
      const head = await c.localStore.readHead()
      expect(first.status).toBe('saved')
      expect(await c.repository.saveDocument(c.command)).toEqual(first)
      expect(await c.localStore.readHead()).toEqual(head)
      expect(
        await c.repository.saveDocument({ ...c.command, commandId: 'save-2' }),
      ).toMatchObject({ status: 'conflict' })
    } finally {
      await c.close()
    }
  })
  it('reads empty without creating a learning record, and receipts empty no-op commands', async () => {
    const c = await setup()
    try {
      const head = await c.localStore.readHead()
      expect(
        await c.repository.readDocument('two-sum', { kind: 'problem' }),
      ).toEqual({
        formatVersion: 1,
        revision: 0,
        markdown: '',
        updatedAt: null,
      })
      expect(
        await c.repository.saveDocument({ ...c.command, markdown: '' }),
      ).toMatchObject({ status: 'saved', document: { revision: 0 } })
      expect(await c.localStore.readHead()).toEqual(head)
      expect(
        await c.localStore.transact(['problemNotes'], 'readonly', (s, done) => {
          const r = s.problemNotes.count()
          r.onsuccess = () => done(r.result)
        }),
      ).toBe(0)
      expect(await c.repository.readCommandReceipt(c.command)).toMatchObject({
        status: 'saved',
        documentRevision: 0,
      })
    } finally {
      await c.close()
    }
  })
  it('rejects command identity reuse with changed content', async () => {
    const c = await setup()
    try {
      await c.repository.saveDocument(c.command)
      await expect(
        c.repository.saveDocument({ ...c.command, markdown: 'changed' }),
      ).rejects.toThrow('Command identity reused with different content.')
    } finally {
      await c.close()
    }
  })
  it('replays original acknowledgement after a later edit and lost response', async () => {
    const c = await setup()
    try {
      const first = await c.repository.saveDocument(c.command)
      await c.repository.saveDocument({
        ...c.command,
        commandId: 'save-2',
        expectedRevision: 1,
        markdown: 'Later',
      })
      expect(await c.repository.saveDocument(c.command)).toEqual(first)
    } finally {
      await c.close()
    }
  })
  it('checks dataset and problem scope before replay', async () => {
    const c = await setup()
    try {
      await c.repository.saveDocument(c.command)
      const head = (await c.localStore.readHead())!
      await c.localStore.writeTechnicalRecord('active', {
        ...head,
        datasetToken: 'rotated',
      })
      expect(await c.repository.saveDocument(c.command)).toEqual({
        status: 'stale-scope',
      })
      const scope = await c.repository.acquireScope('two-sum')
      await c.localStore.transact(['problemScopes'], 'readwrite', (s, done) => {
        s.problemScopes.put({ ...scope, problemToken: 'rotated-problem' }, [
          head.archiveGeneration,
          'two-sum',
        ])
        done(undefined)
      })
      expect(await c.repository.saveDocument({ ...c.command, scope })).toEqual({
        status: 'stale-scope',
      })
    } finally {
      await c.close()
    }
  })
  it('aborts before completion without exposing saved or altering data', async () => {
    const c = await setup()
    try {
      const head = await c.localStore.readHead()
      const original = c.localStore.transact.bind(c.localStore)
      const spy = vi
        .spyOn(c.localStore, 'transact')
        .mockImplementation((names, mode, operate) =>
          original(names, mode, (stores, done, fail) =>
            operate(
              stores,
              (value) => {
                done(value)
                if (mode === 'readwrite') fail(new Error('injected abort'))
              },
              fail,
            ),
          ),
        )
      await expect(c.repository.saveDocument(c.command)).rejects.toThrow(
        'injected abort',
      )
      spy.mockRestore()
      expect(await c.localStore.readHead()).toEqual(head)
      expect(await c.repository.readCommandReceipt(c.command)).toBeNull()
      expect(
        (await c.repository.readDocument('two-sum', { kind: 'problem' }))
          .revision,
      ).toBe(0)
    } finally {
      await c.close()
    }
  })
  it('requires reflection ownership and never loads payloads for metadata', async () => {
    const c = await setup()
    try {
      const archive = await makeNotesArchive()
      const head = (await c.localStore.readHead())!
      await c.localStore.transact(['submissions'], 'readwrite', (s, done) => {
        for (const row of archive.submissions)
          s.submissions.put(
            { ...row, archiveGeneration: head.archiveGeneration },
            [head.archiveGeneration, row.id],
          )
        done(undefined)
      })
      const target = {
        kind: 'reflection' as const,
        submissionId: 'submission-1',
      }
      expect(
        await c.repository.saveDocument({ ...c.command, target }),
      ).toMatchObject({ status: 'saved' })
      const otherScope = await c.repository.acquireScope('other-problem')
      await expect(
        c.repository.saveDocument({
          ...c.command,
          problemSlug: 'other-problem',
          scope: otherScope,
          target,
        }),
      ).rejects.toThrow('Submission does not belong to this problem.')
      const page = await c.repository.listSubmissionMetadata('two-sum')
      expect(page.items).toHaveLength(1)
      expect(page.items[0]).not.toHaveProperty('reflection')
      expect(
        await c.repository.readSubmission('two-sum', 'submission-1'),
      ).toMatchObject({ id: 'submission-1' })
      expect(
        await c.repository.readSubmission('other-problem', 'submission-1'),
      ).toBeNull()
    } finally {
      await c.close()
    }
  })
  it('service validates problem existence through its injected owner', async () => {
    const c = await setup()
    try {
      const service = createNotesService(c.repository, () =>
        Promise.resolve(false),
      )
      await expect(service.saveDocument(c.command)).rejects.toThrow(
        'Problem does not exist.',
      )
    } finally {
      await c.close()
    }
  })
  it('recovers a lost completed response and verifies by receipt after intervening edits', async () => {
    const c = await setup()
    try {
      const readReceipt = c.repository.readCommandReceipt.bind(c.repository)
      let read = vi
        .spyOn(c.repository, 'readCommandReceipt')
        .mockRejectedValueOnce(new Error('lost response'))
      await expect(c.repository.saveDocument(c.command)).rejects.toThrow(
        'lost response',
      )
      read.mockRestore()
      expect(await readReceipt(c.command)).toMatchObject({
        documentRevision: 1,
      })
      const first = await c.repository.saveDocument(c.command)
      read = vi
        .spyOn(c.repository, 'readCommandReceipt')
        .mockImplementationOnce(async (command) => {
          await c.repository.saveDocument({
            ...c.command,
            commandId: 'intervening',
            expectedRevision: 1,
            markdown: 'new body',
          })
          return readReceipt(command)
        })
      expect(await c.repository.saveDocument(c.command)).toEqual(first)
      read.mockRestore()
      expect(
        (await c.repository.readDocument('two-sum', { kind: 'problem' }))
          .markdown,
      ).toBe('new body')
    } finally {
      await c.close()
    }
  })
  it('advances the head once and leaves core snapshots untouched, including a same-content command', async () => {
    const c = await setup()
    try {
      const head = (await c.localStore.readHead())!
      const put = vi.spyOn(IDBObjectStore.prototype, 'put')
      const add = vi.spyOn(IDBObjectStore.prototype, 'add')
      await c.repository.saveDocument(c.command)
      await c.repository.saveDocument({
        ...c.command,
        commandId: 'same',
        expectedRevision: 1,
      })
      expect((await c.localStore.readHead())!.revision).toBe(head.revision + 1)
      expect(
        (put.mock.contexts as IDBObjectStore[]).map((store) => store.name),
      ).not.toContain('coreSnapshots')
      expect(
        (add.mock.contexts as IDBObjectStore[]).map((store) => store.name),
      ).not.toContain('coreSnapshots')
      expect(
        (put.mock.contexts as IDBObjectStore[]).filter(
          (store) => store.name === 'problemNotes',
        ),
      ).toHaveLength(1)
      put.mockRestore()
      add.mockRestore()
    } finally {
      await c.close()
    }
  })
  it('pages metadata newest first with stable timestamp and ID ties and validates limits', async () => {
    const c = await setup()
    try {
      const row = (await makeNotesArchive()).submissions[0]
      const head = (await c.localStore.readHead())!
      await c.localStore.transact(
        ['submissions'],
        'readwrite',
        (stores, done) => {
          for (const id of ['a', 'b', 'c', 'd'])
            stores.submissions.put(
              {
                ...row,
                id,
                externalSubmissionId: null,
                archiveGeneration: head.archiveGeneration,
              },
              [head.archiveGeneration, id],
            )
          done(undefined)
        },
      )
      const first = await c.repository.listSubmissionMetadata('two-sum')
      expect(first.items.map((row) => row.id)).toEqual(['d', 'c', 'b'])
      const second = await c.repository.listSubmissionMetadata(
        'two-sum',
        3,
        first.nextCursor!,
      )
      expect(second.items.map((row) => row.id)).toEqual(['a'])
      expect(second.nextCursor).toBeNull()
      expect(() => c.repository.listSubmissionMetadata('two-sum', 51)).toThrow()
    } finally {
      await c.close()
    }
  })
})
