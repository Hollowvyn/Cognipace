import { z } from 'zod'

import { problemSlugSchema } from '@/features/problems/api/problems-contracts'
import { aiErrorCodes } from '@/lib/ai/types'

import { codeAnalysisSchema } from '../domain/code-analysis-schema'

const nonBlankString = (maxLength: number) =>
  z.string().min(1).max(maxLength).regex(/\S/, 'A nonblank value is required.')
const id = nonBlankString(160)
const identityFields = {
  requestId: id,
  attemptId: id,
  submissionId: z.string().regex(/^\d+$/),
  problemSlug: problemSlugSchema,
  configurationRevision: z.number().int().nonnegative(),
}
const diagnostic = z.string().max(2000).nullable()

export const analyzeLeetCodeSubmissionRequestSchema = z
  .strictObject({
    surface: z.literal('content-script'),
    ...identityFields,
    problem: z.strictObject({
      slug: problemSlugSchema,
      title: nonBlankString(300),
      difficulty: z.enum(['Easy', 'Medium', 'Hard', 'Unknown']),
      topics: z.array(z.string().max(120)).max(40),
      statement: nonBlankString(24000),
      examples: z.array(z.string().max(24000)).max(50),
      constraints: z.array(z.string().max(24000)).max(100),
      followUps: z.array(z.string().max(24000)).max(30),
    }),
    submission: z.strictObject({
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
      code: nonBlankString(32000),
      language: nonBlankString(120),
      languageVersion: z.string().max(120).nullable(),
      runtime: z.string().max(120).nullable(),
      memory: z.string().max(120).nullable(),
      passedTestCount: z.number().int().nonnegative().nullable(),
      totalTestCount: z.number().int().nonnegative().nullable(),
      diagnostics: z.strictObject({
        errorMessage: diagnostic,
        compileError: diagnostic,
        runtimeError: diagnostic,
        failingTestcase: diagnostic,
        lastTestcase: diagnostic,
        codeOutput: diagnostic,
        expectedOutput: diagnostic,
        stdOutput: diagnostic,
      }),
      omittedDiagnostics: z.array(z.string().max(40)).max(8),
    }),
  })
  .superRefine((request, ctx) => {
    if (request.problemSlug !== request.problem.slug) {
      ctx.addIssue({
        code: 'custom',
        message: 'Problem identity does not match.',
      })
    }
    if (JSON.stringify(request.problem).length > 24000) {
      ctx.addIssue({
        code: 'custom',
        message: 'Problem context exceeds the analysis limit.',
      })
    }
  })

export type AnalyzeLeetCodeSubmissionRequest = z.infer<
  typeof analyzeLeetCodeSubmissionRequestSchema
>

const metadata = z.strictObject({
  provider: z.enum(['openai', 'anthropic', 'gemini']),
  model: z.string().max(120),
  durationMs: z.number().nonnegative(),
})
export const codeAnalysisErrorCodeSchema = z.enum([
  ...aiErrorCodes,
  'stale-configuration',
])
export type CodeAnalysisErrorCode = z.infer<typeof codeAnalysisErrorCodeSchema>

export const analyzeLeetCodeSubmissionResponseSchema = z.discriminatedUnion(
  'status',
  [
    z.strictObject({
      status: z.literal('ready'),
      ...identityFields,
      report: codeAnalysisSchema,
      providerMetadata: metadata,
    }),
    z.strictObject({
      status: z.literal('unavailable'),
      ...identityFields,
      reason: z.enum([
        'configuration',
        'capture',
        'input-limit',
        'configuration-changed',
      ]),
      message: z.string().max(400),
    }),
    z.strictObject({
      status: z.literal('error'),
      ...identityFields,
      code: codeAnalysisErrorCodeSchema,
      message: z.string().max(400),
    }),
  ],
)
export type AnalyzeLeetCodeSubmissionResponse = z.infer<
  typeof analyzeLeetCodeSubmissionResponseSchema
>

export const cancelLeetCodeAnalysisRequestSchema = z.strictObject({
  surface: z.literal('content-script'),
  requestId: id,
})
export const cancelLeetCodeAnalysisResponseSchema = z.strictObject({
  requestId: id,
  cancelled: z.boolean(),
})
export type CancelLeetCodeAnalysisRequest = z.infer<
  typeof cancelLeetCodeAnalysisRequestSchema
>
export type CancelLeetCodeAnalysisResponse = z.infer<
  typeof cancelLeetCodeAnalysisResponseSchema
>

export function analysisIdentity(request: AnalyzeLeetCodeSubmissionRequest) {
  const {
    requestId,
    attemptId,
    submissionId,
    problemSlug,
    configurationRevision,
  } = request
  return {
    requestId,
    attemptId,
    submissionId,
    problemSlug,
    configurationRevision,
  }
}
