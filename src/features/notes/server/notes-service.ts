import { problemSlugSchema } from '@/features/problems/api/problems-contracts'
import {
  saveNoteCommandSchema,
  type SaveNoteCommand,
  type NoteTarget,
} from '../domain/notes-records'
import type { NotesRepository } from '../data/notes-repository'

// The app/runtime composes the owning problems reader; notes never reads SQL.
export function createNotesService(
  repository: NotesRepository,
  problemExists: (problemSlug: string) => Promise<boolean>,
) {
  async function requireProblem(problemSlug: string) {
    problemSlugSchema.parse(problemSlug)
    if (!(await problemExists(problemSlug)))
      throw new Error('Problem does not exist.')
  }
  return {
    async acquireScope(problemSlug: string) {
      await requireProblem(problemSlug)
      return repository.acquireScope(problemSlug)
    },
    async readDocument(problemSlug: string, target: NoteTarget) {
      await requireProblem(problemSlug)
      return repository.readDocument(problemSlug, target)
    },
    async saveDocument(input: SaveNoteCommand) {
      const command = saveNoteCommandSchema.parse(input)
      await requireProblem(command.problemSlug)
      return repository.saveDocument(command)
    },
    async readCommandReceipt(command: SaveNoteCommand) {
      await requireProblem(command.problemSlug)
      return repository.readCommandReceipt(command)
    },
    async listSubmissionMetadata(
      problemSlug: string,
      ...args: Parameters<NotesRepository['listSubmissionMetadata']> extends [
        string,
        ...infer Rest,
      ]
        ? Rest
        : never
    ) {
      await requireProblem(problemSlug)
      return repository.listSubmissionMetadata(problemSlug, ...args)
    },
    async readSubmission(problemSlug: string, submissionId: string) {
      await requireProblem(problemSlug)
      return repository.readSubmission(problemSlug, submissionId)
    },
  }
}
