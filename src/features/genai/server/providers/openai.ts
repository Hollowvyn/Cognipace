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

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_TEMPERATURE = 0.2

export async function requestJson<T>(
  request: GenAiGenerateJsonRequest<T>,
): Promise<GenAiGenerateJsonResult<T>> {
  const startedAt = Date.now()
  const baseUrl = request.baseUrl ?? DEFAULT_BASE_URL
  const url = `${baseUrl.replace(/\/+$/, '')}/responses`

  const body = {
    model: request.model,
    instructions: request.prompt.system,
    input: request.prompt.user,
    temperature: request.temperature ?? DEFAULT_TEMPERATURE,
    text: {
      format: {
        type: 'json_schema',
        name: 'response',
        strict: true,
        schema: zodToProviderJsonSchema(request.schema, 'openai'),
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
          Authorization: `Bearer ${request.apiKey}`,
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
      provider: 'openai',
      model: request.model,
      status: response.status,
      responseBody,
    })

    return {
      status: 'error',
      code: httpError,
      message: redactErrorMessage({
        provider: 'openai',
        cause: 'http',
        status: response.status,
      }),
      providerMetadata: {
        provider: 'openai',
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
  const output = envelope.output
  if (!Array.isArray(output)) {
    return null
  }
  for (const item of output) {
    if (!isObject(item) || item.type !== 'message') {
      continue
    }
    const content = item.content
    if (!Array.isArray(content)) {
      continue
    }
    for (const part of content) {
      if (
        isObject(part) &&
        part.type === 'output_text' &&
        typeof part.text === 'string'
      ) {
        return part.text
      }
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
    provider: 'openai',
    model: request.model,
    durationMs: Date.now() - startedAt,
  }
  if (isObject(envelope)) {
    if (typeof envelope.model === 'string') {
      meta.modelVersion = envelope.model
    }
    const usage = envelope.usage
    if (isObject(usage) && typeof usage.total_tokens === 'number') {
      meta.totalTokens = usage.total_tokens
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
      provider: 'openai',
      cause: 'invalid-output',
    }),
    providerMetadata: {
      provider: 'openai',
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
      message: redactErrorMessage({ provider: 'openai', cause: 'timeout' }),
      providerMetadata: {
        provider: 'openai',
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
    message: redactErrorMessage({ provider: 'openai', cause: 'network' }),
    providerMetadata: {
      provider: 'openai',
      model: request.model,
      durationMs: Date.now() - startedAt,
    },
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
