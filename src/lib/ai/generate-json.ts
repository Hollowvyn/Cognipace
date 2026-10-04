import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import {
  APICallError,
  EmptyResponseBodyError,
  InvalidResponseDataError,
  JSONParseError,
  NoContentGeneratedError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  NoSuchModelError,
  Output,
  TypeValidationError,
  generateText,
} from 'ai'

import { AiDeadlineError, withAiDeadline } from './operation'
import type {
  AiErrorCode,
  AiGenerateJsonRequest,
  AiGenerateJsonResult,
  AiProviderId,
} from './types'

// This module owns every SDK call. Provider warnings can contain arbitrary data.
globalThis.AI_SDK_LOG_WARNINGS = false

const endpoints = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
} as const
const messages: Record<AiErrorCode, string> = {
  'not-configured':
    'Save a provider, model, and API key before testing the connection.',
  auth: 'The provider rejected the API key. Replace it and try again.',
  permission:
    'The provider denied access. Check API key restrictions and model permissions.',
  'bad-request':
    'The provider rejected the request. Check the model and provider configuration.',
  'model-unavailable':
    'The model is unavailable for this API key. Choose an accessible model.',
  'rate-limit':
    'The provider quota or rate limit was reached. Check billing or try again later.',
  network:
    'The provider could not be reached. Check the connection and try again.',
  timeout: 'The AI request timed out. Try again.',
  cancelled: 'The AI request was cancelled.',
  refused: 'The provider blocked or refused the request. Try another model.',
  'invalid-output':
    'The provider did not return the required structured output. Try again.',
  unknown: 'The AI request failed. Try again.',
}

class ControlledAiError extends Error {
  constructor(readonly code: AiErrorCode) {
    super(messages[code])
  }
}

export async function generateJson<T>(
  request: AiGenerateJsonRequest<T>,
): Promise<AiGenerateJsonResult<T>> {
  const startedAt = Date.now()
  const metadata = () => ({
    provider: request.provider,
    model: request.model,
    durationMs: Math.max(0, Date.now() - startedAt),
  })
  let preparingSchema = false
  let transportStatus: number | undefined
  try {
    return await withAiDeadline(
      {
        timeoutMs: request.timeoutMs ?? 30_000,
        ...(request.signal ? { signal: request.signal } : {}),
      },
      async (signal) => {
        const endpoint = endpoints[request.provider]
        if (!endpoint) throw new ControlledAiError('bad-request')
        if (!request.apiKey.trim() || !request.model.trim())
          throw new ControlledAiError('not-configured')
        const maxOutputTokens = request.maxOutputTokens ?? 2048
        if (
          !Number.isInteger(maxOutputTokens) ||
          maxOutputTokens < 1 ||
          maxOutputTokens > 8192 ||
          (request.temperature !== undefined &&
            (!Number.isFinite(request.temperature) ||
              request.temperature < 0 ||
              request.temperature > 2))
        ) {
          throw new ControlledAiError('bad-request')
        }
        preparingSchema = true
        const output = Output.object({ schema: request.schema })
        await output.responseFormat
        preparingSchema = false
        signal.throwIfAborted()
        const providerFetch: typeof fetch = async (input, init) => {
          signal.throwIfAborted()
          try {
            const response = await fetch(input, { ...init, redirect: 'error' })
            transportStatus = response.status
            return response
          } catch (error) {
            if (error instanceof TypeError)
              throw new ControlledAiError('network')
            throw error
          }
        }
        const model = createModel(request, providerFetch)
        const result = await generateText({
          model,
          output,
          system: request.prompt.system,
          prompt: request.prompt.user,
          maxOutputTokens,
          maxRetries: 0,
          abortSignal: signal,
          ...(request.temperature === undefined
            ? {}
            : { temperature: request.temperature }),
          telemetry: {
            isEnabled: false,
            recordInputs: false,
            recordOutputs: false,
          },
          ...(request.provider === 'openai'
            ? { providerOptions: { openai: { store: false } } }
            : {}),
        })
        signal.throwIfAborted()
        if (result.finishReason === 'content-filter')
          throw new ControlledAiError('refused')
        if (result.finishReason === 'length')
          throw new ControlledAiError('invalid-output')
        return {
          status: 'success' as const,
          data: result.output,
          providerMetadata: metadata(),
        }
      },
    )
  } catch (error) {
    const code =
      preparingSchema && !(error instanceof AiDeadlineError)
        ? 'invalid-output'
        : normalizeError(error, request.provider, transportStatus)
    return {
      status: 'error',
      code,
      message: messages[code],
      providerMetadata: metadata(),
    }
  }
}

function createModel(
  request: AiGenerateJsonRequest<unknown>,
  providerFetch: typeof fetch,
) {
  switch (request.provider) {
    case 'openai':
      return createOpenAI({
        apiKey: request.apiKey,
        baseURL: endpoints.openai,
        fetch: providerFetch,
      }).responses(request.model)
    case 'anthropic':
      return createAnthropic({
        apiKey: request.apiKey,
        baseURL: endpoints.anthropic,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
        fetch: providerFetch,
      }).languageModel(request.model)
    case 'gemini':
      return createGoogleGenerativeAI({
        apiKey: request.apiKey,
        baseURL: endpoints.gemini,
        fetch: providerFetch,
      }).languageModel(request.model)
  }
}

function normalizeError(
  error: unknown,
  provider: AiProviderId,
  transportStatus?: number,
): AiErrorCode {
  if (error instanceof ControlledAiError || error instanceof AiDeadlineError)
    return error.code
  if (NoObjectGeneratedError.isInstance(error))
    return error.finishReason === 'content-filter'
      ? 'refused'
      : 'invalid-output'
  if (NoSuchModelError.isInstance(error)) return 'model-unavailable'
  if (APICallError.isInstance(error)) {
    const tags = providerErrorTags(error.data, provider)
    if (
      tags.includes('API_KEY_INVALID') ||
      tags.includes('invalid_api_key') ||
      tags.includes('authentication_error') ||
      tags.includes('UNAUTHENTICATED')
    )
      return 'auth'
    if (tags.includes('PERMISSION_DENIED') || tags.includes('permission_error'))
      return 'permission'
    if (
      tags.includes('model_not_found') ||
      tags.includes('NOT_FOUND') ||
      tags.includes('not_found_error')
    )
      return 'model-unavailable'
    if (
      tags.includes('RESOURCE_EXHAUSTED') ||
      tags.includes('insufficient_quota')
    )
      return 'rate-limit'
    if (isProviderRefusal(error.cause, provider)) return 'refused'
    const status = transportStatus ?? error.statusCode
    if (status === 401) return 'auth'
    if (status === 403) return 'permission'
    if (status === 404) return 'model-unavailable'
    if (status === 429) return 'rate-limit'
    if (status === 400 || status === 422) return 'bad-request'
    if (
      status === 408 ||
      (status !== undefined && status >= 500) ||
      (status === undefined && error.isRetryable)
    )
      return 'network'
    if (status !== undefined && status >= 200 && status < 300)
      return 'invalid-output'
    return 'unknown'
  }
  if (isProviderRefusal(error, provider)) return 'refused'
  if (
    EmptyResponseBodyError.isInstance(error) ||
    NoContentGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error) ||
    InvalidResponseDataError.isInstance(error) ||
    TypeValidationError.isInstance(error) ||
    JSONParseError.isInstance(error)
  )
    return 'invalid-output'
  // Fetch TypeErrors are wrapped by the SDK as APICallError. A direct TypeError
  // indicates the adapter could not interpret an otherwise parsed envelope.
  if (error instanceof TypeError) return 'invalid-output'
  return 'unknown'
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

/** Read only allowlisted machine tags; never inspect or copy provider messages. */
function providerErrorTags(data: unknown, provider: AiProviderId): string[] {
  const error = asRecord(asRecord(data)?.error)
  const tags: string[] = []
  for (const field of ['code', 'type', 'status']) {
    const value = error?.[field]
    if (typeof value === 'string') tags.push(value)
  }
  if (provider === 'gemini' && Array.isArray(error?.details)) {
    for (const detail of error.details) {
      const info = asRecord(detail)
      if (
        info?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' &&
        info.domain === 'googleapis.com' &&
        info.reason === 'API_KEY_INVALID'
      )
        tags.push('API_KEY_INVALID')
    }
  }
  return tags
}

function isProviderRefusal(error: unknown, provider: AiProviderId): boolean {
  // OpenAI's adapter rejects the native refusal content during envelope validation.
  // Only its known transport validation value is inspected, never arbitrary output.
  if (provider !== 'openai' || !TypeValidationError.isInstance(error))
    return false
  const output = asRecord(error.value)?.output
  return (
    Array.isArray(output) &&
    output.some((item) => {
      const message = asRecord(item)
      return (
        message?.type === 'message' &&
        Array.isArray(message.content) &&
        message.content.some((part) => asRecord(part)?.type === 'refusal')
      )
    })
  )
}
