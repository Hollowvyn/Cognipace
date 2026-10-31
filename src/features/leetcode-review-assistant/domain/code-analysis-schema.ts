import { z } from 'zod'
import {
  feedbackFields,
  suggestedImplementationSchema,
  implementationUnavailableReasonSchema,
} from './code-review-schema-fields'

export const CODE_ANALYSIS_VERSION = 'leetcode-code-analysis-v1' as const
/** Legacy authored full-report fixtures; live assessment uses the feedback contract. */
export const codeAnalysisSchema = z.strictObject({
  version: z.literal(CODE_ANALYSIS_VERSION),
  ...feedbackFields,
  suggestedImplementation: suggestedImplementationSchema.nullable(),
  suggestedImplementationUnavailableReason:
    implementationUnavailableReasonSchema.nullable(),
})
export type CodeAnalysisReport = z.infer<typeof codeAnalysisSchema>
