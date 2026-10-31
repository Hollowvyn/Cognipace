import { z } from 'zod'
import { feedbackFields } from './code-review-schema-fields'

export const CODE_FEEDBACK_VERSION = 'leetcode-code-feedback-v1' as const

/** The scored assessment deliberately has no generated implementation fields. */
export const codeFeedbackSchema = z.strictObject({
  version: z.literal(CODE_FEEDBACK_VERSION),
  ...feedbackFields,
})
export type CodeFeedbackReport = z.infer<typeof codeFeedbackSchema>
