export class AiDeadlineError extends Error {
  constructor(readonly code: 'timeout' | 'cancelled') {
    super(
      code === 'timeout'
        ? 'AI request timed out.'
        : 'AI request was cancelled.',
    )
    this.name = 'AiDeadlineError'
  }
}

/** Bounds the whole operation, even when an underlying transport ignores abort. */
export async function withAiDeadline<T>(
  options: { timeoutMs: number; signal?: AbortSignal },
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  let rejectAbort: (error: AiDeadlineError) => void = () => {}
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject
  })
  const abort = (code: 'timeout' | 'cancelled') => {
    if (controller.signal.aborted) return
    const error = new AiDeadlineError(code)
    controller.abort(error)
    rejectAbort(error)
  }
  const onExternalAbort = () => abort('cancelled')
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })
  const timeoutId = setTimeout(
    () => abort('timeout'),
    Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : 0,
  )

  try {
    if (options.signal?.aborted) abort('cancelled')
    else if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
      abort('timeout')
    const work = Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return operation(controller.signal)
    })
    return await Promise.race([work, aborted])
  } finally {
    clearTimeout(timeoutId)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}
