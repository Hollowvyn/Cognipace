import type { GenAiError, GenAiProviderId } from '../../domain'

const PROVIDER_FAILURE_LOG_PREFIX = '[CogniPace GenAI provider failure]'
const MAX_LOGGED_RESPONSE_BODY_CHARS = 2_000

export class GenAiTimeoutError extends Error {
  readonly tag = 'GenAiTimeoutError' as const

  constructor(message = 'GenAI request timed out') {
    super(message)
    this.name = 'GenAiTimeoutError'
  }
}

export type FetchWithTimeoutOptions = {
  timeoutMs: number
  externalSignal?: AbortSignal
}

export async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  options: FetchWithTimeoutOptions,
  consumeResponse: (response: Response) => Promise<T>,
): Promise<T> {
  if (options.externalSignal?.aborted) throw options.externalSignal.reason
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort(options.externalSignal?.reason)
  let rejectAbort!: (reason: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject
  })
  const onAbort = () => rejectAbort(controller.signal.reason)
  controller.signal.addEventListener('abort', onAbort, { once: true })
  options.externalSignal?.addEventListener('abort', onExternalAbort, {
    once: true,
  })
  const timeoutId = setTimeout(() => {
    controller.abort(new GenAiTimeoutError())
  }, options.timeoutMs)

  try {
    return await Promise.race([
      aborted,
      fetch(url, { ...init, signal: controller.signal }).then(consumeResponse),
    ])
  } finally {
    clearTimeout(timeoutId)
    controller.signal.removeEventListener('abort', onAbort)
    options.externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

export function mapHttpStatusToGenAiError(status: number): GenAiError | null {
  if (status >= 200 && status < 300) {
    return null
  }
  if (status === 401 || status === 403) {
    return 'auth'
  }
  if (status === 429) {
    return 'rate-limit'
  }
  if (status >= 500 && status < 600) {
    return 'network'
  }
  return 'unknown'
}

export type RedactErrorMessageInput = {
  provider: GenAiProviderId
  cause: 'http' | 'timeout' | 'network' | 'invalid-output' | 'unknown'
  status?: number
  /** Short, controlled, secret-free string from the caller; appended verbatim. */
  detail?: string
}

export function redactErrorMessage(input: RedactErrorMessageInput): string {
  switch (input.cause) {
    case 'http':
      return `${input.provider} request failed: HTTP ${input.status ?? 'unknown'}`
    case 'timeout':
      return `${input.provider} request timed out`
    case 'network':
      return `${input.provider} network request failed`
    case 'invalid-output':
      return `${input.provider} returned output that failed schema validation`
    case 'unknown':
      return input.detail
        ? `${input.provider} request failed: ${input.detail}`
        : `${input.provider} request failed`
  }
}

export async function readRedactedProviderResponseBody(
  response: Response,
  secrets: readonly string[] = [],
): Promise<string | null> {
  let body: string
  try {
    body = await response.clone().text()
  } catch {
    return null
  }

  const trimmedBody = body.trim()
  if (trimmedBody === '') {
    return null
  }

  const redactedBody = redactKnownSecrets(trimmedBody, secrets)
  return redactedBody.length > MAX_LOGGED_RESPONSE_BODY_CHARS
    ? `${redactedBody.slice(0, MAX_LOGGED_RESPONSE_BODY_CHARS)}...`
    : redactedBody
}

export function logProviderHttpFailure(input: {
  provider: GenAiProviderId
  model: string
  status: number
  responseBody: string | null
}): void {
  console.error(PROVIDER_FAILURE_LOG_PREFIX, {
    provider: input.provider,
    model: input.model,
    status: input.status,
    responseBody: input.responseBody,
  })
}

function redactKnownSecrets(value: string, secrets: readonly string[]): string {
  let redacted = value

  for (const secret of secrets) {
    const normalizedSecret = secret.trim()
    if (normalizedSecret.length < 4) {
      continue
    }
    redacted = redacted.split(normalizedSecret).join('[redacted-secret]')
  }

  return redacted
}
