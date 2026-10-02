import type {
  GenAiGenerateJsonRequest,
  GenAiGenerateJsonResult,
  GenAiProviderMetadata,
} from '../../domain'
import { zodToProviderJsonSchema } from '../json-schema'
import {
  GenAiTimeoutError,
  fetchWithTimeout,
  logProviderHttpFailure,
  mapHttpStatusToGenAiError,
  redactErrorMessage,
  readRedactedProviderResponseBody,
} from './shared'

const DEFAULT_BASE_URL = 'https://api.anthropic.com'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_MAX_TOKENS = 4096
const ANTHROPIC_VERSION = '2023-06-01'

export async function requestJson<T>(
  request: GenAiGenerateJsonRequest<T>,
): Promise<GenAiGenerateJsonResult<T>> {
  const startedAt = Date.now()
  const baseUrl = request.baseUrl ?? DEFAULT_BASE_URL
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`

  const body = {
    model: request.model,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: request.prompt.system,
    messages: [{ role: 'user', content: request.prompt.user }],
    temperature: request.temperature ?? DEFAULT_TEMPERATURE,
    output_config: {
      format: {
        type: 'json_schema',
        schema: zodToProviderJsonSchema(request.schema, 'anthropic'),
      },
    },
  }

  try {
    return await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': request.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      },
      {
        timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ...(request.signal !== undefined
          ? { externalSignal: request.signal }
          : {}),
      },
      (response) => handleResponse(response, request, startedAt),
    )
  } catch (error) {
    return handleFetchException(error, request, startedAt)
  }
}

async function handleResponse<T>(
  response: Response,
  request: GenAiGenerateJsonRequest<T>,
  startedAt: number,
): Promise<GenAiGenerateJsonResult<T>> {
  const httpError = mapHttpStatusToGenAiError(response.status)
  if (httpError) {
    const responseBody = await readRedactedProviderResponseBody(response, [
      request.apiKey,
    ])
    logProviderHttpFailure({
      provider: 'anthropic',
      model: request.model,
      status: response.status,
      responseBody,
    })

    return {
      status: 'error',
      code: httpError,
      message: redactErrorMessage({
        provider: 'anthropic',
        cause: 'http',
        status: response.status,
      }),
      providerMetadata: {
        provider: 'anthropic',
        model: request.model,
        durationMs: Date.now() - startedAt,
      },
    }
  }

  let envelope: unknown
  try {
    envelope = await response.json()
  } catch {
    return invalidOutput(request, startedAt)
  }

  const text = extractText(envelope)
  if (text === null) {
    return invalidOutput(request, startedAt)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return invalidOutput(request, startedAt)
  }

  const validated = request.schema.safeParse(parsed)
  if (!validated.success) {
    return invalidOutput(request, startedAt)
  }

  return {
    status: 'success',
    data: validated.data,
    providerMetadata: buildSuccessMetadata(envelope, request, startedAt),
  }
}

function extractText(envelope: unknown): string | null {
  if (!isObject(envelope)) {
    return null
  }
  const content = envelope.content
  if (!Array.isArray(content)) {
    return null
  }
  for (const part of content) {
    if (
      isObject(part) &&
      part.type === 'text' &&
      typeof part.text === 'string'
    ) {
      return part.text
    }
  }
  return null
}

function buildSuccessMetadata<T>(
  envelope: unknown,
  request: GenAiGenerateJsonRequest<T>,
  startedAt: number,
): GenAiProviderMetadata {
  const meta: GenAiProviderMetadata = {
    provider: 'anthropic',
    model: request.model,
    durationMs: Date.now() - startedAt,
  }
  if (isObject(envelope)) {
    if (typeof envelope.model === 'string') {
      meta.modelVersion = envelope.model
    }
    const usage = envelope.usage
    if (isObject(usage)) {
      const hasInTokens = typeof usage.input_tokens === 'number'
      const hasOutTokens = typeof usage.output_tokens === 'number'
      if (hasInTokens || hasOutTokens) {
        const inTokens = hasInTokens ? (usage.input_tokens as number) : 0
        const outTokens = hasOutTokens ? (usage.output_tokens as number) : 0
        meta.totalTokens = inTokens + outTokens
      }
    }
  }
  return meta
}

function invalidOutput<T>(
  request: GenAiGenerateJsonRequest<T>,
  startedAt: number,
): GenAiGenerateJsonResult<T> {
  return {
    status: 'error',
    code: 'invalid-output',
    message: redactErrorMessage({
      provider: 'anthropic',
      cause: 'invalid-output',
    }),
    providerMetadata: {
      provider: 'anthropic',
      model: request.model,
      durationMs: Date.now() - startedAt,
    },
  }
}

function handleFetchException<T>(
  error: unknown,
  request: GenAiGenerateJsonRequest<T>,
  startedAt: number,
): GenAiGenerateJsonResult<T> {
  if (request.signal?.aborted && error === request.signal.reason) throw error
  if (error instanceof GenAiTimeoutError) {
    return {
      status: 'error',
      code: 'timeout',
      message: redactErrorMessage({ provider: 'anthropic', cause: 'timeout' }),
      providerMetadata: {
        provider: 'anthropic',
        model: request.model,
        durationMs: Date.now() - startedAt,
      },
    }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    throw error
  }
  return {
    status: 'error',
    code: 'network',
    message: redactErrorMessage({ provider: 'anthropic', cause: 'network' }),
    providerMetadata: {
      provider: 'anthropic',
      model: request.model,
      durationMs: Date.now() - startedAt,
    },
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
