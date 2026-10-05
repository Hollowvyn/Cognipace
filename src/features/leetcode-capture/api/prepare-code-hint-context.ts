import {
  hintProblemSchema,
  type HintProblem,
} from '@/features/leetcode-review-assistant'
import { withAiDeadline } from '@/lib/ai/operation'
import type { LeetCodeCaptureState, LeetCodeRemoteClient } from '@/lib/leetcode'

export type PreparedHintContext =
  | {
      status: 'ready'
      problem: HintProblem
      capture: LeetCodeCaptureState
    }
  | {
      status: 'unavailable'
      message: string
    }

export function selectLeetCodeHintProblem(
  capture: LeetCodeCaptureState,
): HintProblem | null {
  const { location, metadata, problemContent: content } = capture
  if (
    !location ||
    !metadata ||
    !content ||
    content.completeness !== 'complete' ||
    metadata.source === 'fallback' ||
    metadata.location.host !== location.host ||
    metadata.location.slug !== location.slug ||
    content.location.host !== location.host ||
    content.location.slug !== location.slug
  ) {
    return null
  }

  const parsed = hintProblemSchema.safeParse({
    host: location.host,
    slug: location.slug,
    title: metadata.title,
    statement: content.statement,
    examples: content.examples.map((example) => example.rawText),
    constraints: content.constraints,
  })
  return parsed.success ? parsed.data : null
}

/** Prepares complete problem-only input without generating or persisting hints. */
export async function prepareLeetCodeHintContext(
  capture: LeetCodeCaptureState,
  remote: LeetCodeRemoteClient,
  signal: AbortSignal,
  refresh = false,
): Promise<PreparedHintContext> {
  signal.throwIfAborted()
  const existing = selectLeetCodeHintProblem(capture)
  if (existing && !refresh) {
    return {
      status: 'ready',
      problem: existing,
      capture,
    }
  }

  const location = capture.location
  if (!location) {
    return {
      status: 'unavailable',
      message: 'Open a LeetCode problem before requesting hints.',
    }
  }

  return withAiDeadline(
    { timeoutMs: 15_000, signal },
    async (operationSignal) => {
      const [metadata, content] = await Promise.all([
        remote.readProblemMetadata({ location, refresh: true }),
        remote.readProblemContent({ location, refresh: true }),
      ])
      operationSignal.throwIfAborted()
      const next: LeetCodeCaptureState = {
        ...capture,
        metadata: metadata.ok ? metadata.metadata : capture.metadata,
        problemContent: content.ok ? content.content : null,
      }
      const problem = selectLeetCodeHintProblem(next)
      if (!problem) {
        return {
          status: 'unavailable',
          message:
            'Complete matching problem context is unavailable or exceeds hint limits. Retry after the problem loads.',
        }
      }
      return {
        status: 'ready',
        problem,
        capture: next,
      }
    },
  )
}
