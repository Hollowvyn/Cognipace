import {
  notesArchiveSchema,
  type NotesArchive,
  type NotesPayload,
} from './notes-records'

export function emptyNotesArchive(): NotesArchive {
  return {
    formatVersion: 1,
    notes: [],
    submissions: [],
    assessments: [],
    savedAiNotes: [],
    payloads: [],
  }
}

/** Code uses verbatim UTF-8; reports use UTF-8 JSON.stringify(body). */
export async function assertArchiveReferences(
  archive: NotesArchive,
  problemSlugs: Iterable<string>,
): Promise<void> {
  // Parse even typed inputs: restores and prepared snapshots remain trust boundaries.
  const parsed = notesArchiveSchema.parse(archive)
  const problems = new Set(problemSlugs)
  const submissions = uniqueMap(
    parsed.submissions,
    (row) => row.id,
    'submission',
  )
  const assessments = uniqueMap(
    parsed.assessments,
    (row) => row.id,
    'assessment',
  )
  const payloads = uniqueMap(parsed.payloads, (row) => row.id, 'payload')
  const notes = uniqueMap(
    parsed.notes,
    (row) => row.problemSlug,
    'problem note',
  )
  uniqueMap(
    parsed.savedAiNotes,
    (row) => JSON.stringify([row.problemSlug, row.assessmentId]),
    'saved AI inclusion',
  )

  const externalAliases = new Set<string>()
  const attemptAliases = new Set<string>()
  for (const submission of parsed.submissions) {
    if (submission.externalSubmissionId !== null) {
      const alias = JSON.stringify([
        submission.host,
        submission.externalSubmissionId,
      ])
      if (externalAliases.has(alias))
        throw new Error('Duplicate archive external submission alias.')
      externalAliases.add(alias)
    }
    for (const alias of submission.observedAttemptIds) {
      if (attemptAliases.has(alias))
        throw new Error('Duplicate archive observed attempt alias.')
      attemptAliases.add(alias)
    }
  }

  const requireProblem = (problemSlug: string) => {
    if (!problems.has(problemSlug))
      throw new Error('Archive references an absent problem.')
  }
  const requirePayload = (payloadId: string, kind: NotesPayload['kind']) => {
    if (payloads.get(payloadId)?.kind !== kind)
      throw new Error('Archive payload is absent or has the wrong kind.')
  }
  for (const note of parsed.notes) requireProblem(note.problemSlug)
  for (const submission of parsed.submissions) {
    requireProblem(submission.problemSlug)
    if (submission.codePayloadId !== null)
      requirePayload(submission.codePayloadId, 'submitted-code')
  }
  for (const assessment of parsed.assessments) {
    requireProblem(assessment.problemSlug)
    if (
      submissions.get(assessment.submissionId)?.problemSlug !==
      assessment.problemSlug
    )
      throw new Error('Assessment submission ownership does not match.')
    requirePayload(assessment.feedbackPayloadId, 'feedback-v1')
    if (assessment.implementationPayloadId !== null)
      requirePayload(assessment.implementationPayloadId, 'implementation-v1')
  }
  for (const inclusion of parsed.savedAiNotes) {
    requireProblem(inclusion.problemSlug)
    if (!notes.has(inclusion.problemSlug))
      throw new Error('Saved AI collection revision is absent.')
    if (
      assessments.get(inclusion.assessmentId)?.problemSlug !==
      inclusion.problemSlug
    )
      throw new Error('Saved AI assessment ownership does not match.')
  }
  // Hash the original serialized body so validation cannot hide changes through
  // report-schema normalization (for example, trimming a report string).
  for (const payload of archive.payloads) {
    const bytes = new TextEncoder().encode(
      payload.kind === 'submitted-code'
        ? payload.body
        : JSON.stringify(payload.body),
    )
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    if (bytes.byteLength !== payload.byteLength || sha256 !== payload.sha256)
      throw new Error('Archive payload integrity does not match.')
  }
}

function uniqueMap<T>(
  rows: T[],
  key: (row: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>()
  for (const row of rows) {
    const identity = key(row)
    if (result.has(identity)) throw new Error(`Duplicate archive ${label}.`)
    result.set(identity, row)
  }
  return result
}
