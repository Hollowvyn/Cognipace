import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerNotesHandlers } from './notes-handlers'
import { createNotesTestContext } from '@/features/notes/testing/notes-test-context'
import { createNotesRepository } from '@/features/notes/data/notes-repository'
import { createNotesService } from '@/features/notes/server/notes-service'
import { createNotesEditScopes } from './notes-edit-scopes'
import { makeNotesArchive } from '@/features/notes/testing/notes-fixtures'

const handlers = vi.hoisted(
  () =>
    new Map<string, (message: { data: unknown; sender: unknown }) => unknown>(),
)
vi.mock('@/extension/messaging', () => ({
  onMessage: (
    name: string,
    handler: (message: { data: unknown; sender: unknown }) => unknown,
  ) => handlers.set(name, handler),
}))
describe('notes handler authorization before database access', () => {
  beforeEach(() => handlers.clear())
  it('rejects spoofed surfaces, popup, arbitrary slug, unknown fields and missing scopes before access', async () => {
    const getService = vi.fn()
    registerNotesHandlers({
      getService,
      getLeases: vi.fn(),
      run: (work) => work(),
      emit: vi.fn(),
    })
    const content = {
      tab: { id: 7 },
      documentId: 'doc',
      url: 'https://leetcode.com/problems/two-sum/',
    }
    for (const [name, data, sender] of [
      [
        'notes.getProblemNotes',
        { surface: 'dashboard', problemSlug: 'two-sum' },
        content,
      ],
      [
        'notes.openEditor',
        {
          surface: 'popup',
          problemSlug: 'two-sum',
          target: { kind: 'problem' },
        },
        { url: 'chrome-extension://id/popup.html' },
      ],
      [
        'notes.getProblemNotes',
        { surface: 'content-script', problemSlug: 'other' },
        content,
      ],
      [
        'notes.getProblemNotes',
        { surface: 'content-script', problemSlug: 'two-sum', extra: true },
        content,
      ],
      [
        'notes.saveDocument',
        {
          surface: 'content-script',
          editLeaseId: 'lease',
          command: {
            commandId: 'c',
            problemSlug: 'two-sum',
            target: { kind: 'problem' },
            expectedRevision: 0,
            markdown: 'a',
          },
        },
        content,
      ],
    ] as const)
      await expect(
        async () => await handlers.get(name)!({ data, sender }),
      ).rejects.toThrow()
    expect(getService).not.toHaveBeenCalled()
  })
})

describe('Notes runtime with owning service and durable IDB', () => {
  const content = {
    tab: { id: 7 },
    documentId: 'document-a',
    url: 'https://leetcode.com/problems/two-sum/',
  }
  const dashboard = {
    documentId: 'dashboard-a',
    url: 'chrome-extension://extension-id/dashboard.html',
  }
  async function setup() {
    handlers.clear()
    const c = await createNotesTestContext()
    const service = createNotesService(c.repository, (slug) =>
      Promise.resolve(['two-sum', 'add-two-numbers'].includes(slug)),
    )
    const getService = vi.fn(() => Promise.resolve(service))
    const emit = vi.fn(() => Promise.resolve(undefined))
    const register = () =>
      registerNotesHandlers({
        getService,
        getLeases: () => createNotesEditScopes(c.localStore),
        run: (work) => work(),
        emit,
      })
    register()
    const call = async (
      name: string,
      data: unknown,
      sender: unknown = content,
    ) => await handlers.get(name)!({ data, sender })
    const open = async (
      surface = 'content-script',
      sender: unknown = content,
    ) =>
      (await call(
        'notes.openEditor',
        { surface, problemSlug: 'two-sum', target: { kind: 'problem' } },
        sender,
      )) as {
        scope: { datasetToken: string; problemToken: string }
        editLeaseId: string
      }
    return { ...c, service, getService, emit, register, call, open }
  }
  it('allows a dashboard document without tab identity and rejects URL-only leases', async () => {
    const c = await setup()
    try {
      const lease = await c.open('dashboard', dashboard)
      expect(lease.editLeaseId).toBeTruthy()
      await expect(
        c.open('dashboard', { url: dashboard.url }),
      ).rejects.toThrow()
      await expect(
        c.call(
          'notes.saveDocument',
          {
            surface: 'dashboard',
            editLeaseId: lease.editLeaseId,
            command: {
              commandId: 'dashboard-save',
              problemSlug: 'two-sum',
              scope: lease.scope,
              target: { kind: 'problem' },
              expectedRevision: 0,
              markdown: 'Dashboard',
            },
          },
          dashboard,
        ),
      ).resolves.toMatchObject({ status: 'saved' })
    } finally {
      await c.close()
    }
  })
  it('permits final A flush after SPA to B, forbids B and wrong tab/document/host before owner service', async () => {
    const c = await setup()
    try {
      const lease = await c.open()
      const spa = {
        ...content,
        url: 'https://leetcode.com/problems/add-two-numbers/',
      }
      const command = {
        commandId: 'save-a',
        problemSlug: 'two-sum',
        scope: lease.scope,
        target: { kind: 'problem' },
        expectedRevision: 0,
        markdown: 'Final A',
      }
      c.getService.mockClear()
      for (const sender of [
        { ...spa, tab: { id: 8 } },
        { ...spa, documentId: 'other' },
        { ...spa, url: 'https://www.leetcode.com/problems/add-two-numbers/' },
      ])
        await expect(
          c.call(
            'notes.saveDocument',
            {
              surface: 'content-script',
              editLeaseId: lease.editLeaseId,
              command,
            },
            sender,
          ),
        ).rejects.toThrow('Notes edit owner does not match.')
      await expect(
        c.call(
          'notes.saveDocument',
          {
            surface: 'content-script',
            editLeaseId: lease.editLeaseId,
            command: { ...command, problemSlug: 'add-two-numbers' },
          },
          spa,
        ),
      ).rejects.toThrow('lease does not match')
      expect(c.getService).not.toHaveBeenCalled()
      await expect(
        c.call(
          'notes.saveDocument',
          {
            surface: 'content-script',
            editLeaseId: lease.editLeaseId,
            command,
          },
          spa,
        ),
      ).resolves.toMatchObject({
        status: 'saved',
        document: { markdown: 'Final A' },
      })
      await expect(
        c.call(
          'notes.getProblemNotes',
          { surface: 'content-script', problemSlug: 'two-sum' },
          spa,
        ),
      ).rejects.toThrow('must match')
    } finally {
      await c.close()
    }
  })
  it('rejects nonexistent reflections and token rebinding; old scope returns stale after reset', async () => {
    const c = await setup()
    try {
      await expect(
        c.call('notes.openEditor', {
          surface: 'content-script',
          problemSlug: 'two-sum',
          target: { kind: 'reflection', submissionId: 'missing' },
        }),
      ).rejects.toThrow('Submission does not belong')
      const lease = await c.open()
      const head = (await c.localStore.readHead())!
      await c.localStore.writeTechnicalRecord('active', {
        ...head,
        datasetToken: 'reset',
      })
      const scope = await c.repository.acquireScope('two-sum')
      const command = {
        commandId: 'reset-save',
        problemSlug: 'two-sum',
        scope,
        target: { kind: 'problem' },
        expectedRevision: 0,
        markdown: 'Old draft',
      }
      c.getService.mockClear()
      await expect(
        c.call('notes.saveDocument', {
          surface: 'content-script',
          editLeaseId: lease.editLeaseId,
          command,
        }),
      ).rejects.toThrow('lease does not match')
      expect(c.getService).not.toHaveBeenCalled()
      await expect(
        c.call('notes.saveDocument', {
          surface: 'content-script',
          editLeaseId: lease.editLeaseId,
          command: { ...command, scope: lease.scope },
        }),
      ).resolves.toEqual({ status: 'stale-scope' })
    } finally {
      await c.close()
    }
  })
  it('keeps invalidation failure durable across restart and never reexecutes the domain write', async () => {
    const c = await setup()
    try {
      const lease = await c.open()
      c.emit.mockRejectedValue(new Error('offline'))
      const request = {
        surface: 'content-script',
        editLeaseId: lease.editLeaseId,
        command: {
          commandId: 'save',
          problemSlug: 'two-sum',
          scope: lease.scope,
          target: { kind: 'problem' },
          expectedRevision: 0,
          markdown: 'Durable',
        },
      }
      const first = await c.call('notes.saveDocument', request)
      expect(await c.repository.listPendingInvalidations()).toEqual([
        expect.objectContaining({
          problemSlug: 'two-sum',
          tags: ['notes', 'sync'],
        }),
      ])
      expect(c.emit).toHaveBeenCalledWith('two-sum', 'content-script', [
        'notes',
        'sync',
      ])
      const head = await c.localStore.readHead()
      c.register()
      expect(await c.call('notes.saveDocument', request)).toEqual(first)
      expect(await c.localStore.readHead()).toEqual(head)
      c.emit.mockResolvedValue(undefined)
      await c.call('notes.getProblemNotes', {
        surface: 'content-script',
        problemSlug: 'two-sum',
      })
      expect(await c.repository.listPendingInvalidations()).toEqual([])
      expect(await c.localStore.readHead()).toEqual(head)
    } finally {
      await c.close()
    }
  })
  it('invalidates submission reads immediately after reflection saves', async () => {
    const c = await setup()
    try {
      const archive = await makeNotesArchive()
      const head = (await c.localStore.readHead())!
      await c.localStore.transact(
        ['submissions', 'payloads'],
        'readwrite',
        (stores, done) => {
          const payload = archive.payloads[0]!
          stores.payloads.put(payload, payload.id)
          const row = archive.submissions[0]!
          stores.submissions.put(
            { ...row, archiveGeneration: head.archiveGeneration },
            [head.archiveGeneration, row.id],
          )
          done(undefined)
        },
      )
      const target = { kind: 'reflection', submissionId: 'submission-1' }
      const lease = (await c.call('notes.openEditor', {
        surface: 'content-script',
        problemSlug: 'two-sum',
        target,
      })) as {
        editLeaseId: string
        scope: { datasetToken: string; problemToken: string }
      }
      expect(
        await c.call('notes.saveDocument', {
          surface: 'content-script',
          editLeaseId: lease.editLeaseId,
          command: {
            commandId: 'reflection',
            problemSlug: 'two-sum',
            scope: lease.scope,
            target,
            expectedRevision: 0,
            markdown: 'Reflect',
          },
        }),
      ).toMatchObject({ status: 'saved', document: { revision: 1 } })
      expect(c.emit).toHaveBeenCalledWith('two-sum', 'content-script', [
        'notes',
        'submissions',
        'sync',
      ])
      expect(await c.repository.listPendingInvalidations()).toEqual([])
    } finally {
      await c.close()
    }
  })
  it('recovers persisted reflection invalidation on an authorized read in a fresh worker without replaying the save', async () => {
    const c = await setup()
    try {
      const archive = await makeNotesArchive()
      const initial = (await c.localStore.readHead())!
      await c.localStore.transact(
        ['submissions', 'payloads'],
        'readwrite',
        (stores, done) => {
          const payload = archive.payloads[0]!
          stores.payloads.put(payload, payload.id)
          const row = archive.submissions[0]!
          stores.submissions.put(
            { ...row, archiveGeneration: initial.archiveGeneration },
            [initial.archiveGeneration, row.id],
          )
          done(undefined)
        },
      )
      const target = { kind: 'reflection', submissionId: 'submission-1' }
      const lease = (await c.call('notes.openEditor', {
        surface: 'content-script',
        problemSlug: 'two-sum',
        target,
      })) as {
        editLeaseId: string
        scope: { datasetToken: string; problemToken: string }
      }
      c.emit.mockRejectedValue(new Error('offline'))
      await c.call('notes.saveDocument', {
        surface: 'content-script',
        editLeaseId: lease.editLeaseId,
        command: {
          commandId: 'reflection',
          problemSlug: 'two-sum',
          scope: lease.scope,
          target,
          expectedRevision: 0,
          markdown: 'Durable reflection',
        },
      })
      expect(await c.repository.listPendingInvalidations()).toEqual([
        expect.objectContaining({
          problemSlug: 'two-sum',
          tags: ['notes', 'submissions', 'sync'],
        }),
      ])
      const head = await c.localStore.readHead()
      const repository = createNotesRepository(c.localStore)
      const save = vi.spyOn(repository, 'saveDocument')
      const service = createNotesService(repository, () =>
        Promise.resolve(true),
      )
      const emit = vi.fn(() => Promise.resolve())
      handlers.clear()
      registerNotesHandlers({
        getService: () => Promise.resolve(service),
        getLeases: () => createNotesEditScopes(c.localStore),
        run: (work) => work(),
        emit,
      })
      expect(
        await c.call('notes.getSubmission', {
          surface: 'content-script',
          problemSlug: 'two-sum',
          submissionId: 'submission-1',
        }),
      ).toMatchObject({
        submission: {
          reflection: { revision: 1, markdown: 'Durable reflection' },
        },
      })
      expect(emit).toHaveBeenCalledWith('two-sum', 'content-script', [
        'notes',
        'submissions',
        'sync',
      ])
      expect(save).not.toHaveBeenCalled()
      expect(await c.repository.listPendingInvalidations()).toEqual([])
      expect(await c.localStore.readHead()).toEqual(head)
    } finally {
      await c.close()
    }
  })
  it('returns only selected archive bodies, metadata pages and scoped cursors', async () => {
    const c = await setup()
    try {
      const archive = await makeNotesArchive()
      const head = (await c.localStore.readHead())!
      await c.localStore.transact(
        ['submissions', 'analysisReports', 'payloads'],
        'readwrite',
        (s, done) => {
          for (let i = 1; i <= 4; i++)
            s.submissions.put(
              {
                ...archive.submissions[0],
                id: 'submission-' + i,
                externalSubmissionId: 'external-' + i,
                archiveGeneration: head.archiveGeneration,
              },
              [head.archiveGeneration, 'submission-' + i],
            )
          for (const row of archive.assessments)
            s.analysisReports.put(
              { ...row, archiveGeneration: head.archiveGeneration },
              [head.archiveGeneration, row.id],
            )
          for (const row of archive.payloads) s.payloads.put(row, row.id)
          done(undefined)
        },
      )
      const request = { surface: 'content-script', problemSlug: 'two-sum' }
      const page = (await c.call('notes.listSubmissions', {
        ...request,
        limit: 3,
      })) as { items: unknown[]; nextCursor: unknown }
      expect(page.items).toHaveLength(3)
      expect(page.items[0]).not.toHaveProperty('reflection')
      expect(page.items[0]).not.toHaveProperty('code')
      expect(page.nextCursor).toMatchObject({ problemSlug: 'two-sum' })
      expect(
        await c.call('notes.listSubmissions', {
          ...request,
          limit: 3,
          cursor: page.nextCursor,
        }),
      ).toMatchObject({ items: [{ id: 'submission-1' }], nextCursor: null })
      expect(
        await c.call('notes.getSubmission', {
          ...request,
          submissionId: 'submission-1',
        }),
      ).toMatchObject({ code: 'function twoSum() {}' })
      const assessment = await c.call('notes.getAssessment', {
        ...request,
        assessmentId: 'assessment-1',
      })
      expect(assessment).toHaveProperty('feedback')
      expect(assessment).not.toHaveProperty('code')
      expect(await c.call('notes.getProblemNotes', request)).not.toHaveProperty(
        'feedback',
      )
      const lease = await c.open()
      expect(
        await c.call('notes.setSavedAiNote', {
          surface: 'content-script',
          editLeaseId: lease.editLeaseId,
          command: {
            commandId: 'include',
            problemSlug: 'two-sum',
            scope: lease.scope,
            assessmentId: 'assessment-1',
            expectedCollectionRevision: 0,
            saved: true,
          },
        }),
      ).toMatchObject({ status: 'saved', collectionRevision: 1 })
      const newHead = (await c.localStore.readHead())!
      await c.localStore.writeTechnicalRecord('active', {
        ...newHead,
        datasetToken: 'reset',
      })
      await expect(
        c.call('notes.listSubmissions', {
          ...request,
          limit: 3,
          cursor: page.nextCursor,
        }),
      ).rejects.toThrow('cursor is stale')
    } finally {
      await c.close()
    }
  })
})
