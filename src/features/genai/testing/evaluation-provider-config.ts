import { z } from 'zod'

import type { AiProviderConfig } from '@/lib/ai/types'

const evaluationConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'gemini']),
  model: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
})

/** Test-only private environment configuration; never reads app secret storage. */
export function readEvaluationProviderConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AiProviderConfig | null {
  if (environment.COGNIPACE_AI_EVAL !== '1') return null

  const parsed = evaluationConfigSchema.safeParse({
    provider: environment.COGNIPACE_AI_EVAL_PROVIDER,
    model: environment.COGNIPACE_AI_EVAL_MODEL,
    apiKey: environment.COGNIPACE_AI_EVAL_KEY,
  })
  if (!parsed.success)
    throw new Error(
      'Configure COGNIPACE_AI_EVAL_PROVIDER, COGNIPACE_AI_EVAL_MODEL and COGNIPACE_AI_EVAL_KEY privately before evaluation.',
    )
  return parsed.data
}
