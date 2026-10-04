import { z } from 'zod'

export const leetcodeProblemLocationSchema = z.object({
  slug: z.string(),
  url: z.string(),
  host: z.string(),
})

export const leetcodeRemoteAuthSchema = z.object({
  csrfToken: z.string().nullable(),
})

export const leetcodeProblemRemoteRequestSchema = z.object({
  location: leetcodeProblemLocationSchema,
  auth: leetcodeRemoteAuthSchema.optional(),
  refresh: z.boolean().optional(),
})

const leetcodeTopicSchema = z.object({
  name: z.string(),
  slug: z.string().nullable(),
})

export const leetcodeProblemMetadataSchema = z.object({
  location: leetcodeProblemLocationSchema,
  title: z.string(),
  frontendId: z.string().nullable(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard', 'Unknown']),
  isPremium: z.boolean().nullable(),
  topics: z.array(leetcodeTopicSchema),
  source: z.enum(['graphql', 'dom', 'fallback']),
  confidence: z.enum(['high', 'medium', 'low']),
  capturedAt: z.number(),
})

const leetcodeCaptureCompletenessSchema = z.enum([
  'complete',
  'partial',
  'missing',
])
const leetcodeSubmissionIdSchema = z.string().regex(/^\d+$/)

const leetcodeExampleSchema = z.object({
  label: z.string(),
  input: z.string().nullable(),
  output: z.string().nullable(),
  explanation: z.string().nullable(),
  rawText: z.string(),
})

export const leetcodeProblemContentSchema = z.object({
  location: leetcodeProblemLocationSchema,
  statement: z.string(),
  examples: z.array(leetcodeExampleSchema),
  constraints: z.array(z.string()),
  followUps: z.array(z.string()),
  completeness: leetcodeCaptureCompletenessSchema,
  hints: z.array(z.string()),
  source: z.enum(['graphql', 'dom', 'fallback']),
  confidence: z.enum(['high', 'medium', 'low']),
  capturedAt: z.number(),
  contentFingerprint: z.string(),
})

const serializedLeetCodeErrorResultSchema = z.object({
  ok: z.literal(false),
  errorMessage: z.string(),
})

export const serializedLeetCodeMetadataResultSchema = z.discriminatedUnion(
  'ok',
  [
    z.object({
      ok: z.literal(true),
      metadata: leetcodeProblemMetadataSchema,
    }),
    serializedLeetCodeErrorResultSchema,
  ],
)

export type SerializedLeetCodeMetadataResult = z.infer<
  typeof serializedLeetCodeMetadataResultSchema
>

export const serializedLeetCodeProblemContentResultSchema =
  z.discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      content: leetcodeProblemContentSchema,
    }),
    serializedLeetCodeErrorResultSchema,
  ])

export type SerializedLeetCodeProblemContentResult = z.infer<
  typeof serializedLeetCodeProblemContentResultSchema
>

export const leetcodeCodeSnapshotSchema = z.object({
  code: z.string().nullable(),
  language: z.string().nullable(),
  source: z.enum(['api', 'monaco', 'textarea', 'code-block', 'none']),
  completeness: leetcodeCaptureCompletenessSchema,
  capturedAt: z.number(),
})

export const leetcodeSubmissionClickSchema = z.object({
  location: leetcodeProblemLocationSchema,
  clickedAt: z.number(),
  buttonText: z.string(),
})

export const leetcodeSubmissionResultRemoteRequestSchema = z.object({
  attemptId: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0),
  submissionId: leetcodeSubmissionIdSchema.optional(),
  location: leetcodeProblemLocationSchema,
  click: leetcodeSubmissionClickSchema,
  submittedCodeSnapshot: leetcodeCodeSnapshotSchema,
  auth: leetcodeRemoteAuthSchema.optional(),
  refresh: z.boolean().optional(),
})

const leetcodeSubmissionPollingDebugSchema = z.object({
  phase: z.enum([
    'finding-submission',
    'submission-found',
    'submission-not-found',
    'checking-result',
    'api-result-found',
    'graphql-details-found',
    'graphql-details-missing',
    'dom-fallback-used',
    'timed-out',
  ]),
  submissionId: leetcodeSubmissionIdSchema.nullable(),
  checkState: z.string().nullable(),
  statusText: z.string().nullable(),
  checkedAt: z.number(),
})

export const leetcodeSubmissionResultSchema = z.object({
  location: leetcodeProblemLocationSchema,
  submissionId: leetcodeSubmissionIdSchema.nullable(),
  source: z.enum(['api', 'dom']),
  status: z.enum([
    'accepted',
    'wrong-answer',
    'runtime-error',
    'compile-error',
    'time-limit-exceeded',
    'memory-limit-exceeded',
    'output-limit-exceeded',
    'unknown',
  ]),
  statusText: z.string(),
  checkedAt: z.number(),
  runtime: z.string().nullable(),
  memory: z.string().nullable(),
  passedTestCount: z.number().nullable(),
  totalTestCount: z.number().nullable(),
  failingTestcase: z.string().nullable(),
  errorMessage: z.string().nullable(),
  compileError: z.string().nullable(),
  runtimeError: z.string().nullable(),
  lastTestcase: z.string().nullable(),
  codeOutput: z.string().nullable(),
  expectedOutput: z.string().nullable(),
  stdOutput: z.string().nullable(),
  resultCodeSnapshot: leetcodeCodeSnapshotSchema,
})

export const leetcodeSubmissionResultRemoteResponseSchema = z.object({
  result: leetcodeSubmissionResultSchema.nullable(),
  debugEvents: z.array(leetcodeSubmissionPollingDebugSchema),
})

export type SerializedLeetCodeSubmissionResultRemoteResponse = z.infer<
  typeof leetcodeSubmissionResultRemoteResponseSchema
>
