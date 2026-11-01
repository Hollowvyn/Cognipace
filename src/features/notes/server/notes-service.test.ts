import { describe, expect, it, vi } from 'vitest'
import { createNotesService } from './notes-service'
import { createNotesTestContext } from '../testing/notes-test-context'

describe('Notes service owner checks', () => {
  it('rejects missing catalog problems before every archive read and membership write', async () => {
    const c = await createNotesTestContext()
    try {
      const service = createNotesService(c.repository, () =>
        Promise.resolve(false),
      )
      const read = vi.spyOn(c.localStore, 'transact')
      const scope = { datasetToken: 'dataset', problemToken: 'problem' }
      for (const work of [
        () => service.acquireScope('two-sum'),
        () => service.getProblemNotes('two-sum'),
        () => service.readAssessment('two-sum', 'assessment'),
        () => service.readSubmissionEntry('two-sum', 'submission'),
        () => service.listSubmissionMetadata('two-sum'),
        () =>
          service.setSavedAiNote({
            commandId: 'command',
            problemSlug: 'two-sum',
            scope,
            assessmentId: 'assessment',
            expectedCollectionRevision: 0,
            saved: true,
          }),
      ])
        await expect(work()).rejects.toThrow('Problem does not exist.')
      expect(read).not.toHaveBeenCalled()
    } finally {
      await c.close()
    }
  })
})
