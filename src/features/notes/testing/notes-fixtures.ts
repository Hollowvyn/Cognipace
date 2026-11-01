import type { CodeFeedbackReport } from '@/features/leetcode-review-assistant/domain/code-feedback-schema'
import type { CodeImplementationReport } from '@/features/leetcode-review-assistant/domain/code-implementation-schema'
import type {
  NotesArchive,
  NotesPayload,
  NoteDocument,
} from '../domain/notes-records'

export const NOTES_FIXTURE_DATE = '2026-10-31T12:00:00.000Z'

export function makeNoteDocument(
  overrides: Partial<NoteDocument> = {},
): NoteDocument {
  return {
    formatVersion: 1,
    revision: 0,
    markdown: '',
    updatedAt: null,
    ...overrides,
  }
}

export function makeNotesFeedback(): CodeFeedbackReport {
  return {
    version: 'leetcode-code-feedback-v1',
    summary: 'Use a map to find complements.',
    approach: {
      score: 3,
      rationale: 'Pair enumeration is correct.',
      confidence: 'high',
      strategyAssessment: 'material-improvement',
      current: ['Pair enumeration'],
      suggested: ['Hash map'],
      keyIdea: 'Look up the complement.',
      consider: null,
    },
    efficiency: {
      score: 3,
      rationale: 'A map improves expected time.',
      confidence: 'high',
      current: { time: 'O(n²)', space: 'O(1)', assumptions: [] },
      suggested: { time: 'O(n)', space: 'O(n)', assumptions: [] },
      timeComparison: 'better',
      spaceComparison: 'worse',
      suggestions: [],
    },
    codeStyle: {
      score: 4,
      rationale: 'The code is clear.',
      confidence: 'high',
      readability: 'Good',
      structure: 'Good',
      suggestions: [],
    },
  }
}

export function makeNotesImplementation(): CodeImplementationReport {
  return {
    version: 'leetcode-code-implementation-v1',
    status: 'ready',
    implementation: {
      language: 'JavaScript',
      code: 'function twoSum(nums, target) { return []; }',
      changes: [],
      complexity: { time: 'O(n)', space: 'O(n)', assumptions: [] },
      assumptions: [],
    },
  }
}

export async function makeNotesPayload(
  kind: NotesPayload['kind'],
  body: NotesPayload['body'],
  id = 'payload-1',
): Promise<NotesPayload> {
  const bytes = new TextEncoder().encode(
    typeof body === 'string' ? body : JSON.stringify(body),
  )
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return {
    id,
    kind,
    body,
    byteLength: bytes.byteLength,
    sha256,
  } as NotesPayload
}

export async function makeNotesArchive(): Promise<NotesArchive> {
  return {
    formatVersion: 1,
    notes: [
      {
        problemSlug: 'two-sum',
        document: makeNoteDocument(),
        savedAiCollectionRevision: 1,
      },
    ],
    submissions: [
      {
        id: 'submission-1',
        problemSlug: 'two-sum',
        observedAttemptIds: ['attempt-1'],
        externalSubmissionId: '123',
        host: 'leetcode.com',
        submittedAt: NOTES_FIXTURE_DATE,
        status: 'accepted',
        statusText: 'Accepted',
        language: 'JavaScript',
        completeness: 'complete',
        codePayloadId: 'code-1',
        diagnostics: {
          errorMessage: null,
          compileError: null,
          runtimeError: null,
          failingTestcase: null,
          lastTestcase: null,
          codeOutput: null,
          expectedOutput: null,
          stdOutput: null,
        },
        omittedDiagnostics: [],
        reflection: makeNoteDocument(),
      },
    ],
    assessments: [
      {
        id: 'assessment-1',
        problemSlug: 'two-sum',
        submissionId: 'submission-1',
        requestId: 'request-1',
        generatedAt: NOTES_FIXTURE_DATE,
        feedbackSchemaVersion: 1,
        feedbackPayloadId: 'feedback-1',
        providerMetadata: {
          provider: 'openai',
          model: 'test-model',
          durationMs: 10,
        },
        implementationPayloadId: 'implementation-1',
      },
    ],
    savedAiNotes: [
      {
        problemSlug: 'two-sum',
        assessmentId: 'assessment-1',
        savedAt: NOTES_FIXTURE_DATE,
      },
    ],
    payloads: [
      await makeNotesPayload(
        'submitted-code',
        'function twoSum() {}',
        'code-1',
      ),
      await makeNotesPayload('feedback-v1', makeNotesFeedback(), 'feedback-1'),
      await makeNotesPayload(
        'implementation-v1',
        makeNotesImplementation(),
        'implementation-1',
      ),
    ],
  }
}
