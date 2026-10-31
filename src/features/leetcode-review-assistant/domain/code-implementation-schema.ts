import { z } from 'zod'
import { normalizeLeetCodeLanguageLabel } from '@/lib/leetcode'
import { suggestedImplementationSchema } from './code-review-schema-fields'
export { suggestedImplementationSchema } from './code-review-schema-fields'

export const CODE_IMPLEMENTATION_VERSION =
  'leetcode-code-implementation-v1' as const
export type SuggestedImplementation = z.infer<
  typeof suggestedImplementationSchema
>
export const codeImplementationSchema = z.discriminatedUnion('status', [
  z.strictObject({
    version: z.literal(CODE_IMPLEMENTATION_VERSION),
    status: z.literal('ready'),
    implementation: suggestedImplementationSchema,
  }),
  z.strictObject({
    version: z.literal(CODE_IMPLEMENTATION_VERSION),
    status: z.literal('unavailable'),
    reason: z.string().trim().min(1).max(800),
  }),
])
export type CodeImplementationReport = z.infer<typeof codeImplementationSchema>
export function isCodeImplementationConsistent(
  report: CodeImplementationReport,
  language: string,
) {
  const executionClaim =
    /\b(?:I|we)\s+(?:have\s+)?(?:tested|executed|compiled|benchmarked)\b|\b(?:this\s+)?(?:code|implementation)\s+(?:(?:has|was|is)\s+)?(?:been\s+)?(?:tested|executed|compiled|benchmarked)\b|\b(?:passes|passed)\s+all\s+(?:tests|test cases)\b/i
  if (report.status === 'unavailable')
    return !executionClaim.test(report.reason)
  const explanation = [
    ...report.implementation.changes,
    ...report.implementation.assumptions,
    ...report.implementation.complexity.assumptions,
    report.implementation.complexity.time,
    report.implementation.complexity.space,
  ].join('\n')
  if (executionClaim.test(explanation)) return false
  const normalized = normalizeLeetCodeLanguageLabel(language)
  return (
    normalized !== null &&
    normalizeLeetCodeLanguageLabel(report.implementation.language) ===
      normalized &&
    report.implementation.code.trim().length > 0
  )
}
