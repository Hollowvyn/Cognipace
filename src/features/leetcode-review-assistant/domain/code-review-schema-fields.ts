import { z } from 'zod'

const nonBlankText = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength)

const text = nonBlankText(800)
const labels = z.array(nonBlankText(80)).min(1).max(8)
const suggestions = z.array(text).max(4)
const scoreFields = {
  score: z.number().int().min(1).max(5).nullable(),
  rationale: text,
  confidence: z.enum(['low', 'medium', 'high']),
}
export const complexitySchema = z.strictObject({
  time: nonBlankText(160),
  space: nonBlankText(160),
  assumptions: suggestions,
})
const comparison = z.enum(['better', 'equivalent', 'worse', 'unknown'])
const quality = z.enum([
  'Excellent',
  'Good',
  'Needs improvement',
  'Unavailable',
])

export const feedbackFields = {
  summary: nonBlankText(280),
  approach: z.strictObject({
    ...scoreFields,
    strategyAssessment: z.enum([
      'appropriate',
      'minor-refinement',
      'material-improvement',
      'incorrect',
      'unavailable',
    ]),
    current: labels,
    suggested: labels,
    keyIdea: text,
    consider: text.nullable(),
  }),
  efficiency: z.strictObject({
    ...scoreFields,
    current: complexitySchema.nullable(),
    suggested: complexitySchema.nullable(),
    timeComparison: comparison,
    spaceComparison: comparison,
    suggestions,
  }),
  codeStyle: z.strictObject({
    ...scoreFields,
    readability: quality,
    structure: quality,
    suggestions,
  }),
}

export const suggestedImplementationSchema = z.strictObject({
  language: nonBlankText(120),
  code: z.string().min(1).max(32_000),
  changes: suggestions,
  complexity: complexitySchema,
  assumptions: suggestions,
})

export const implementationUnavailableReasonSchema = text
