import type {
  LeetCodeSubmissionAttempt,
  LeetCodeSubmissionClick,
} from '../domain/types'
import { readLeetCodeCodeSnapshot } from '../editor/code-snapshot-reader'

export function readLeetCodeSubmissionAttempt(options: {
  attemptId: string
  click: LeetCodeSubmissionClick
  editorRoot: ParentNode
}): LeetCodeSubmissionAttempt {
  const submittedCodeSnapshot = readLeetCodeCodeSnapshot(
    options.editorRoot,
    () => options.click.clickedAt,
  )

  return {
    attemptId: options.attemptId,
    location: options.click.location,
    clickedAt: options.click.clickedAt,
    submitButtonText: options.click.buttonText,
    submittedCodeSnapshot,
  }
}
