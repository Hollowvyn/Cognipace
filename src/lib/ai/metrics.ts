import { z } from 'zod'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const duration = z.number().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const aiGenerationMetricsSchema = z.strictObject({
  attemptCount: count.optional(),
  requestBodyBytes: count.optional(),
  outputJsonBytes: count.optional(),
  preparationMs: duration.optional(),
  generationMs: duration.optional(),
  validationMs: duration.optional(),
  inputTokens: count.optional(),
  outputTokens: count.optional(),
  totalTokens: count.optional(),
  cacheReadTokens: count.optional(),
  reasoningTokens: count.optional(),
})
export type AiGenerationMetrics = z.infer<typeof aiGenerationMetricsSchema>

/** Pick known finite numbers only; never copy raw SDK usage or other metadata. */
export function projectAiMetrics(value: unknown): AiGenerationMetrics {
  if (value === null || typeof value !== 'object') return {}
  const input = value as Record<string, unknown>
  const projected: AiGenerationMetrics = {}
  for (const key of Object.keys(
    aiGenerationMetricsSchema.shape,
  ) as (keyof AiGenerationMetrics)[]) {
    const parsed = aiGenerationMetricsSchema.shape[key].safeParse(input[key])
    if (parsed.success && parsed.data !== undefined)
      projected[key] = parsed.data
  }
  return projected
}

/** Successful SDK call usage only; failed retry billing is unavailable. */
export function projectAiUsage(value: unknown): AiGenerationMetrics {
  if (value === null || typeof value !== 'object') return {}
  const usage = value as Record<string, unknown>
  const input = usage.inputTokenDetails as Record<string, unknown> | undefined
  const output = usage.outputTokenDetails as Record<string, unknown> | undefined
  return projectAiMetrics({
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cacheReadTokens: input?.cacheReadTokens,
    reasoningTokens: output?.reasoningTokens,
  })
}
