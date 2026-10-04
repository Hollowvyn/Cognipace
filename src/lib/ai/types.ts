import type { ZodType } from 'zod'

export const aiProviderIds = ['openai', 'anthropic', 'gemini'] as const
export type AiProviderId = (typeof aiProviderIds)[number]

export const aiErrorCodes = [
  'not-configured',
  'auth',
  'permission',
  'bad-request',
  'model-unavailable',
  'rate-limit',
  'network',
  'timeout',
  'cancelled',
  'refused',
  'invalid-output',
  'unknown',
] as const
export type AiErrorCode = (typeof aiErrorCodes)[number]

export type AiProviderConfig = {
  provider: AiProviderId
  model: string
  apiKey: string
  /** Legacy override: only the provider's fixed approved endpoint is accepted. */
  baseUrl?: string
}
export type AiPrompt = { system: string; user: string }
export type AiGenerateJsonRequest<T> = AiProviderConfig & {
  prompt: AiPrompt
  schema: ZodType<T>
  /** Omitted by default so models can use their supported sampling settings. */
  temperature?: number
  /** Default 30,000; bounds preparation, transport, body reading and validation. */
  timeoutMs?: number
  signal?: AbortSignal
  /** Default 2,048; must be a positive integer no greater than 8,192. */
  maxOutputTokens?: number
}
export type AiProviderMetadata = {
  provider: AiProviderId
  model: string
  modelVersion?: string
  /** Whole operation duration, including preparation and validation. */
  durationMs: number
  totalTokens?: number
}
export type AiGenerateJsonResult<T> =
  | { status: 'success'; data: T; providerMetadata: AiProviderMetadata }
  | {
      status: 'error'
      code: AiErrorCode
      message: string
      providerMetadata: Pick<
        AiProviderMetadata,
        'provider' | 'model' | 'durationMs'
      >
    }
