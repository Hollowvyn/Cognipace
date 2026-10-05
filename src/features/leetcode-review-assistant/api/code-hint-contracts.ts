import { z } from 'zod'

import { problemSlugSchema } from '@/features/problems/api/problems-contracts'
import { aiErrorCodes, aiProviderIds } from '@/lib/ai'

import { hintBatchSchema } from '../domain/code-hint-schema'

export { hintBatchSchema, type HintBatch } from '../domain/code-hint-schema'

const text = (max: number) => z.string().min(1).max(max).regex(/\S/)

export const hintProblemSchema = z
  .strictObject({
    host: z.enum(['leetcode.com', 'www.leetcode.com']),
    slug: problemSlugSchema,
    title: text(300),
    statement: text(24000),
    examples: z.array(z.string().max(24000)).max(50),
    constraints: z.array(z.string().max(24000)).max(100),
  })
  .superRefine((problem, ctx) => {
    if (JSON.stringify(problem).length > 24000) {
      ctx.addIssue({
        code: 'custom',
        message: 'Problem input exceeds 24000 characters.',
      })
    }
  })

export type HintProblem = z.infer<typeof hintProblemSchema>

export function makeHintInputFingerprint(problem: HintProblem): string {
  return JSON.stringify({
    host: problem.host,
    slug: problem.slug,
    title: problem.title,
    statement: problem.statement,
    examples: problem.examples,
    constraints: problem.constraints,
  })
}

const identityFields = {
  requestId: text(160),
  problemSlug: problemSlugSchema,
  inputFingerprint: text(24000),
  connectionRevision: z.uuid(),
  connectionProvider: z.enum(aiProviderIds),
}

export const generateLeetCodeHintsRequestSchema = z
  .strictObject({
    surface: z.literal('content-script'),
    ...identityFields,
    problem: hintProblemSchema,
  })
  .superRefine((request, ctx) => {
    if (
      request.problemSlug !== request.problem.slug ||
      request.inputFingerprint !== makeHintInputFingerprint(request.problem)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Hint input identity does not match.',
      })
    }
  })

export type GenerateLeetCodeHintsRequest = z.infer<
  typeof generateLeetCodeHintsRequestSchema
>

export const hintErrorCodeSchema = z.enum([
  ...aiErrorCodes,
  'stale-configuration',
])
export type HintErrorCode = z.infer<typeof hintErrorCodeSchema>

export const generateLeetCodeHintsResponseSchema = z.discriminatedUnion(
  'status',
  [
    z.strictObject({
      status: z.literal('ready'),
      ...identityFields,
      batch: hintBatchSchema,
    }),
    z.strictObject({
      status: z.literal('error'),
      ...identityFields,
      code: hintErrorCodeSchema,
      message: z.string().max(400),
    }),
  ],
)

export type GenerateLeetCodeHintsResponse = z.infer<
  typeof generateLeetCodeHintsResponseSchema
>

export const cancelLeetCodeHintsRequestSchema = z.strictObject({
  surface: z.literal('content-script'),
  requestId: text(160),
})
export const cancelLeetCodeHintsResponseSchema = z.strictObject({
  requestId: text(160),
  cancelled: z.boolean(),
})
export type CancelLeetCodeHintsRequest = z.infer<
  typeof cancelLeetCodeHintsRequestSchema
>
export type CancelLeetCodeHintsResponse = z.infer<
  typeof cancelLeetCodeHintsResponseSchema
>

export function hintIdentity(
  request: Pick<
    GenerateLeetCodeHintsRequest,
    | 'requestId'
    | 'problemSlug'
    | 'inputFingerprint'
    | 'connectionRevision'
    | 'connectionProvider'
  >,
) {
  const {
    requestId,
    problemSlug,
    inputFingerprint,
    connectionRevision,
    connectionProvider,
  } = request
  return {
    requestId,
    problemSlug,
    inputFingerprint,
    connectionRevision,
    connectionProvider,
  }
}
