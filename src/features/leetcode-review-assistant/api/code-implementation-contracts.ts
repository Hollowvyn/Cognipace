import { z } from 'zod'
import { hintProblemSchema } from './code-hint-contracts'
import {
  analyzeLeetCodeSubmissionRequestSchema,
  analysisIdentity,
  analysisProviderMetadataSchema,
  codeAnalysisErrorCodeSchema,
  cancelLeetCodeAnalysisRequestSchema,
  cancelLeetCodeAnalysisResponseSchema,
} from './code-analysis-contracts'
import { codeFeedbackSchema } from '../domain/code-feedback-schema'
import { isCodeFeedbackConsistent } from '../domain/code-analysis-consistency'
import { codeImplementationSchema } from '../domain/code-implementation-schema'

const id = z.string().min(1).max(160).regex(/\S/)
/** Self-contained: survives service-worker restarts without a completed-result cache. */
export const generateLeetCodeImplementationRequestSchema = z
  .strictObject({
    surface: z.literal('content-script'),
    requestId: id,
    assessmentRequestId: id,
    host: hintProblemSchema.shape.host,
    assessment: analyzeLeetCodeSubmissionRequestSchema,
    feedback: codeFeedbackSchema,
  })
  .superRefine((request, ctx) => {
    if (
      request.assessmentRequestId !== request.assessment.requestId ||
      request.requestId === request.assessmentRequestId
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Implementation must reference its original assessment with a fresh request ID.',
      })
    if (!isCodeFeedbackConsistent(request.feedback))
      ctx.addIssue({
        code: 'custom',
        message: 'Assessment feedback is inconsistent.',
      })
  })
export type GenerateLeetCodeImplementationRequest = z.infer<
  typeof generateLeetCodeImplementationRequestSchema
>
export function implementationIdentity(
  request: GenerateLeetCodeImplementationRequest,
) {
  return {
    ...analysisIdentity(request.assessment),
    requestId: request.requestId,
    assessmentRequestId: request.assessmentRequestId,
  }
}
const identity = {
  requestId: id,
  assessmentRequestId: id,
  attemptId: id,
  submissionId: z.string().regex(/^\d+$/),
  problemSlug: analyzeLeetCodeSubmissionRequestSchema.shape.problemSlug,
  configurationRevision: z.number().int().nonnegative(),
}
export const generateLeetCodeImplementationResponseSchema =
  z.discriminatedUnion('status', [
    z.strictObject({
      status: z.literal('ready'),
      ...identity,
      report: codeImplementationSchema,
      providerMetadata: analysisProviderMetadataSchema,
    }),
    z.strictObject({
      status: z.literal('unavailable'),
      ...identity,
      message: z.string().max(400),
    }),
    z.strictObject({
      status: z.literal('error'),
      ...identity,
      code: codeAnalysisErrorCodeSchema,
      message: z.string().max(400),
    }),
  ])
export type GenerateLeetCodeImplementationResponse = z.infer<
  typeof generateLeetCodeImplementationResponseSchema
>
export const cancelLeetCodeImplementationRequestSchema =
  cancelLeetCodeAnalysisRequestSchema
export const cancelLeetCodeImplementationResponseSchema =
  cancelLeetCodeAnalysisResponseSchema
