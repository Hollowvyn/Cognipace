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

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_TEMPERATURE = 0.2

export async function requestJson<T>(
  request: GenAiGenerateJsonRequest<T>,
): Promise<GenAiGenerateJsonResult<T>> {
  const startedAt = Date.now()
  const baseUrl = request.baseUrl ?? DEFAULT_BASE_URL
  const url = `${baseUrl.replace(/\/+$/, '')}/v1beta/models/${request.model}:generateContent`

  const body = {
    systemInstruction: { parts: [{ text: request.prompt.system }] },
    contents: [{ role: 'user', parts: [{ text: request.prompt.user }] }],
    generationConfig: {
      temperature: request.temperature ?? DEFAULT_TEMPERATURE,
      responseMimeType: 'application/json',
      responseSchema: zodToProviderJsonSchema(request.schema, 'gemini'),
    },
  }

  try {
    return await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': request.apiKey,
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
      provider: 'gemini',
      model: request.model,
      status: response.status,
      responseBody,
    })

    return {
      status: 'error',
      code: httpError,
      message: redactErrorMessage({
        provider: 'gemini',
        cause: 'http',
        status: response.status,
      }),
      providerMetadata: {
        provider: 'gemini',
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
  const candidates = envelope.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null
  }
  const first: unknown = candidates[0]
  if (!isObject(first)) {
    return null
  }
  const content = first.content
  if (!isObject(content)) {
    return null
  }
  const parts = content.parts
  if (!Array.isArray(parts) || parts.length === 0) {
    return null
  }
  const part: unknown = parts[0]
  if (isObject(part) && typeof part.text === 'string') {
    return part.text
  }
  return null
}

function buildSuccessMetadata<T>(
  envelope: unknown,
  request: GenAiGenerateJsonRequest<T>,
  startedAt: number,
): GenAiProviderMetadata {
  const meta: GenAiProviderMetadata = {
    provider: 'gemini',
    model: request.model,
    durationMs: Date.now() - startedAt,
  }
  if (isObject(envelope)) {
    if (typeof envelope.modelVersion === 'string') {
      meta.modelVersion = envelope.modelVersion
    }
    const usage = envelope.usageMetadata
    if (isObject(usage) && typeof usage.totalTokenCount === 'number') {
      meta.totalTokens = usage.totalTokenCount
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
      provider: 'gemini',
      cause: 'invalid-output',
    }),
    providerMetadata: {
      provider: 'gemini',
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
      message: redactErrorMessage({ provider: 'gemini', cause: 'timeout' }),
      providerMetadata: {
        provider: 'gemini',
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
    message: redactErrorMessage({ provider: 'gemini', cause: 'network' }),
    providerMetadata: {
      provider: 'gemini',
      model: request.model,
      durationMs: Date.now() - startedAt,
    },
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
