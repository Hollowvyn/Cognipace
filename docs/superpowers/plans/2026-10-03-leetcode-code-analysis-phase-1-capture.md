# LeetCode Code Analysis Phase 1 — Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supply complete problem context and full code belonging to a pinned submission, with an explicit unavailable result when capture is incomplete.

**Architecture:** Extend existing LeetCode capture types/readers and remote requests; reuse the existing watcher and runtime methods. Mark DOM code/content conservatively, enrich from matching submission details, and refresh incomplete caches explicitly. Keep this phase independent of grading and persistence.

**Tech Stack:** TypeScript, Zod, Vitest, existing LeetCode GraphQL/check transport and WXT runtime messaging.

---

Read the [approved design](../specs/2026-10-03-leetcode-code-analysis-design.md) and [execution map](2026-10-03-leetcode-code-analysis.md). All paths and commands below refer to the primary workspace.

## Task 1: Capture completeness, follow-ups, and immutable attempt identity

**Files:**

- Modify `src/lib/leetcode/domain/types.ts`, `editor/code-snapshot-reader.ts`, `submission/submission-attempt-reader.ts`, `submission/submission-result-reader.ts`, `submission/submission-result-api-source.ts`, `content/problem-content-reader.ts`, `content/content-fingerprint.ts`, `capture/capture-state.ts`, `watcher/leetcode-page-watcher.ts`, `watcher/submission-result-watch.ts`, `remote/leetcode-remote-client.ts`, `remote/leetcode-fetch-remote-client.ts`, `index.ts`.
- Modify `src/features/leetcode-capture/api/leetcode-capture-contracts.ts`, `api/leetcode-capture-api.ts`, `src/extension/messaging.ts` to serialize the additions through existing LeetCode methods.
- Tests: `src/lib/leetcode/content/problem-content-reader.test.ts`, `submission/submission-attempt-reader.test.ts`, `submission/submission-result-api-source.test.ts`, `submission/submission-result-reader.test.ts`, `capture/capture-state.test.ts`, `watcher/leetcode-page-watcher.test.ts`, `page/page-snapshot-reader.test.ts`, `index.test.ts`; existing capture fixtures and typed overlay fixtures must gain honest completeness/attempt fields.
- Create `src/features/leetcode-capture/api/leetcode-capture-contracts.test.ts` for round-trip validation of these fields; reject missing/invalid provenance and attempt identity.

- [ ] Add a failing follow-up regression to `problem-content-reader.test.ts`:

```ts
it('retains follow-up requirements separately from the statement', async () => {
  const location = {
    slug: 'two-sum',
    url: 'https://leetcode.com/problems/two-sum/',
    host: 'leetcode.com',
  }
  const fetch = vi.fn(async () =>
    Response.json({
      data: {
        question: {
          content:
            '<p>Find two distinct indices.</p><p>Constraints:</p><ul><li>2 &lt;= n &lt;= 10000</li></ul><p>Follow-up:</p><p>Can you achieve expected linear time?</p>',
          hints: [],
        },
      },
    }),
  )
  const result = await readLeetCodeProblemContent(location, { fetch })
  expect(result.ok).toBe(true)
  if (!result.ok) throw result.error
  expect(result.content.completeness).toBe('complete')
  expect(result.content.followUps).toEqual([
    'Can you achieve expected linear time?',
  ])
  expect(result.content.statement).not.toContain('expected linear time')
})
```

Use the test file's existing imports of `vi` and `readLeetCodeProblemContent`. Also test a full GraphQL document with no constraints/follow-ups: empty arrays with `complete` mean verified absence. Empty fallback data must be `missing`, not usable context. Run `rtk npm run test -- src/lib/leetcode/content/problem-content-reader.test.ts`; expect FAIL for missing fields.

- [ ] Add this type and these properties to the existing interfaces, keeping all existing fields:

```ts
export type LeetCodeCaptureCompleteness = 'complete' | 'partial' | 'missing'
export interface LeetCodeCodeSnapshot {
  completeness: LeetCodeCaptureCompleteness
}
export interface LeetCodeProblemContent {
  completeness: LeetCodeCaptureCompleteness
  followUps: string[]
}
export interface LeetCodeSubmissionAttempt {
  attemptId: string
}
// In remote/leetcode-remote-client.ts:
export interface LeetCodeSubmissionResultRemoteRequest {
  attemptId: string
  submissionId?: string | undefined
  refresh?: boolean | undefined
}
export interface LeetCodeProblemRemoteRequest {
  refresh?: boolean | undefined
}
```

Add matching Zod fields to snapshot/content/request schemas, with numeric submission IDs represented as strings (`z.string().regex(/^\d+$/)`). Do not default unmarked input to complete. Add `attemptId` to `readLeetCodeSubmissionAttempt` options and return it; the page watcher mints `crypto.randomUUID()` once per submit event and passes it. Tests pass a fixed token. Pass it through the submission watcher and remote adapters; retain the existing watcher token checks that suppress old polling callbacks.

- [ ] Implement follow-up parsing and include it in both content parsing paths:

```ts
function readFollowUpsFromText(text: string): string[] {
  const followUp = text.match(
    /\bFollow[\s-]*up\s*:\s*([\s\S]*?)(?=\bHint\s*\d*\s*:|$)/i,
  )?.[1]
  const normalized = followUp ? stripLeetCodeNoise(followUp) : ''
  return normalized ? [normalized] : []
}
```

In `readContentPartsFromRoot` and `readContentPartsFromText`, add `followUps: readFollowUpsFromText(text)` using each function's existing normalized text. Add Follow-up/Follow up to the example and statement stop patterns so those requirements do not become example output/explanation. Extend `createProblemContent`'s input and returned object with the new fields. GraphQL with a nonempty statement is complete; DOM is partial; empty fallback is missing. Preserve the existing `ok` transport shape and let readiness inspect completeness.

In `content-fingerprint.ts`, add `followUps` and `completeness` to its `Pick` and hashed object:

```diff
+ followUps: content.followUps.map(normalizeFingerprintText),
+ completeness: content.completeness,
```

This is necessary for partial DOM → complete GraphQL transitions with identical text to emit an update. Add a regression asserting different fingerprints when only completeness or follow-ups differ.

- [ ] Mark visible Monaco lines, Monaco textarea values, and result DOM code blocks partial; a missing code value is missing. None proves a complete submitted solution. For matching GraphQL details use:

```diff
+ completeness: detailsPayload?.code
+   ? 'complete'
+   : options.submittedCodeSnapshot.completeness,
```

Before returning `SubmissionDetailsPayload`, validate the `id` already requested by the query:

```ts
if (readSubmissionId(details.id) !== options.submissionId) return null
```

Preserve code exactly rather than stripping leading/trailing source whitespace. Replace the existing trimmed-code field with:

```diff
- code: readTrimmedString(details.code),
+ code: typeof details.code === 'string' && details.code.trim() ? details.code : null,
```

Keep the submitted code's source/completeness on fallback. Never upgrade a fragment merely because a terminal status exists. In `createLeetCodeReviewContext`, prefer a complete result snapshot over an attempt fragment:

```diff
+ submittedCode:
+   state.submissionResult?.resultCodeSnapshot.completeness === 'complete'
+     ? state.submissionResult.resultCodeSnapshot
+     : state.submissionAttempt?.submittedCodeSnapshot ??
+       state.submissionResult?.resultCodeSnapshot ?? null,
```

- [ ] Run the capture tests and `rtk npm run typecheck`. Update typed fixtures explicitly: GraphQL full code/content = complete, visible DOM = partial, empty = missing, submit token = fixed test string. Do not blanket-label fixtures complete to silence errors. Run `rtk git diff --check`, then commit the mapped capture files/tests with `feat(leetcode-capture): track complete submission context`.

## Task 2: Pinned reads and caches that can recover

**Files:**

- Modify `src/lib/leetcode/submission/submission-result-api-source.ts`, `remote/leetcode-fetch-remote-client.ts`, `watcher/submission-result-watch.ts`.
- Modify `src/features/leetcode-capture/server/leetcode-capture-service.ts`, `api/leetcode-capture-api.ts`, `api/leetcode-capture-contracts.ts`, `src/extension/messaging.ts`; existing handlers already forward parsed requests.
- Test `src/lib/leetcode/submission/submission-result-api-source.test.ts`, `src/features/leetcode-capture/server/leetcode-capture-service.test.ts`, `src/extension/background/register-handlers.test.ts`.

- [ ] Add a pinned-reader test using the existing API fixture fetcher:

```ts
it('reads pinned details without discovering the latest submission', async () => {
  const fetch = createLeetCodeSubmissionApiFixtureFetcher(
    leetcodeAcceptedSubmissionApiFixture,
  )
  const result = await readLeetCodeSubmissionResultFromApi({
    location: {
      slug: 'two-sum',
      url: 'https://leetcode.com/problems/two-sum/',
      host: 'leetcode.com',
    },
    click: {
      location: {
        slug: 'two-sum',
        url: 'https://leetcode.com/problems/two-sum/',
        host: 'leetcode.com',
      },
      clickedAt: 5000,
      buttonText: 'Submit',
    },
    submissionId: '1234567890',
    submittedCodeSnapshot: {
      code: 'fragment',
      language: 'Python3',
      source: 'monaco',
      completeness: 'partial',
      capturedAt: 5000,
    },
    fetch,
  })
  expect(result?.submissionId).toBe('1234567890')
  expect(result?.resultCodeSnapshot.completeness).toBe('complete')
  expect(
    fetch.mock.calls.some(([input]) =>
      String(input).includes('/api/submissions/'),
    ),
  ).toBe(false)
})
```

Import those existing fixture helpers from `../testing/submission-result-fixtures`. Also test mismatched details ID, incomplete details followed by complete details, and two eligible initial submissions. Run the two focused reader/cache test files; expect FAIL before pinned support/cache changes.

- [ ] Add `submissionId?: string | undefined` to the API reader options and replace discovery with:

```ts
const submissionListEntry: SubmissionListEntry | null = options.submissionId
  ? {
      id: options.submissionId,
      timestamp: null,
      statusText: null,
      runtime: null,
      memory: null,
      language: null,
    }
  : await findSubmissionListEntryForClick({
      location: options.location,
      click: options.click,
      fetch: fetchLeetCode,
    })
```

Forward that optional ID from the fetch remote client with conditional spread. When the watcher discovers an ID through its debug/result response, retain it for later checks. Initial discovery must reject ambiguous candidates and pre-click entries rather than use the latest submission:

```ts
const clickedAtSeconds = Math.floor(options.click.clickedAt / 1000)
const candidates = submissions.filter(
  (submission) =>
    submission.timestamp !== null &&
    submission.timestamp >= clickedAtSeconds &&
    submission.timestamp <= clickedAtSeconds + 5 &&
    submission.statusText !== 'Internal Error',
)
return candidates.length === 1 ? (candidates[0] ?? null) : null
```

Timestamp matching is still a best-effort association, with same-second and clock-skew limitations. Do not claim network-confirmed identity. Refuse ambiguous discovery and verify the actual ID in details; human smoke must cover rapid consecutive submissions. The pinned path never falls back to discovery. Adjust the existing accepted fixture's pre-click timestamp to the matching second in tests of initial discovery.

- [ ] Change content-cache reads/writes to accept only complete, meaningful content and respect refresh:

```ts
const cached = contentCache.get(request.location.slug)
if (
  !request.refresh &&
  cached?.ok &&
  cached.content.completeness === 'complete' &&
  cached.content.statement.trim()
)
  return cached
const result = serializeLeetCodeProblemContentResult(
  await leetCodeRemoteClient.readProblemContent(request),
)
if (
  result.ok &&
  result.content.completeness === 'complete' &&
  result.content.statement.trim()
)
  contentCache.set(request.location.slug, result)
else contentCache.delete(request.location.slug)
return result
```

Replace the attempt-cache key with `JSON.stringify([request.location.host, request.location.slug, request.attemptId])`; ID-cache keys include host and ID. Use this predicate for cache reuse/storage:

```ts
function hasCompleteSubmission(
  response: LeetCodeSubmissionResultRemoteResponse,
) {
  return Boolean(
    response.result?.submissionId &&
    response.result.resultCodeSnapshot.completeness === 'complete' &&
    response.result.resultCodeSnapshot.code?.trim() &&
    response.result.resultCodeSnapshot.language?.trim(),
  )
}
```

Read the pinned ID cache first when requested; an attempt-cache hit is usable only if it matches any requested ID. Refresh bypasses both maps. Store only complete results and replace earlier data with the refreshed response; do not let a stale ID-cache hit overwrite fresh details. Preserve terminal failure statuses and all diagnostic fields.

- [ ] Add a cache regression that returns partial then complete remote results, asserts the second read reaches transport and includes full code, then asserts a third ordinary read is cached. Repeat with `refresh: true` and a newer unrelated submission in the list; inspect the transport request for the original pinned ID. Add a failed content-read → complete-read regression. Run `rtk npm run test -- src/lib/leetcode src/features/leetcode-capture src/extension/background/register-handlers.test.ts`, then `rtk npm run typecheck` and commit with `fix(leetcode-capture): refresh incomplete pinned submissions`.

## Task 3: One bounded preparation function for the overlay

**Files:**

- Create `src/features/leetcode-capture/api/prepare-code-analysis-context.ts` and `.test.ts`.
- Create `src/features/leetcode-capture/testing/code-analysis-capture-fixtures.ts`, shared only by tests.
- Export the preparation function/result type from `src/features/leetcode-capture/index.ts`.

- [ ] Create the complete capture fixture, typed with the existing capture interface:

```ts
import {
  createEmptyLeetCodeCaptureState,
  type LeetCodeCaptureState,
} from '@/lib/leetcode'
export function makeCompleteCapture(): LeetCodeCaptureState {
  const location = {
    slug: 'two-sum',
    url: 'https://leetcode.com/problems/two-sum/',
    host: 'leetcode.com',
  }
  const submittedCode = {
    code: 'function twoSum(nums, target) { for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === target) return [i, j]; return []; }',
    language: 'JavaScript',
    source: 'api' as const,
    completeness: 'complete' as const,
    capturedAt: 5000,
  }
  return {
    ...createEmptyLeetCodeCaptureState(location),
    metadata: {
      location,
      title: 'Two Sum',
      frontendId: '1',
      difficulty: 'Easy',
      isPremium: false,
      topics: [{ name: 'Array', slug: 'array' }],
      source: 'graphql',
      confidence: 'high',
      capturedAt: 5000,
    },
    problemContent: {
      location,
      statement:
        'Return two distinct zero-based indices whose values add up to target. Exactly one pair exists.',
      examples: [],
      constraints: ['2 <= nums.length <= 10000'],
      followUps: ['Target expected linear time; extra memory is allowed.'],
      hints: [],
      source: 'graphql',
      completeness: 'complete',
      confidence: 'high',
      capturedAt: 5000,
      contentFingerprint: 'fixture-content',
    },
    submissionAttempt: {
      location,
      clickedAt: 5000,
      submitButtonText: 'Submit',
      attemptId: 'attempt-1',
      submittedCodeSnapshot: {
        ...submittedCode,
        source: 'monaco',
        completeness: 'partial',
      },
    },
    submissionResult: {
      location,
      submissionId: '1234567890',
      source: 'api',
      status: 'accepted',
      statusText: 'Accepted',
      checkedAt: 5001,
      runtime: '34 ms',
      memory: null,
      passedTestCount: 50,
      totalTestCount: 50,
      failingTestcase: null,
      errorMessage: null,
      compileError: null,
      runtimeError: null,
      lastTestcase: null,
      codeOutput: null,
      expectedOutput: null,
      stdOutput: null,
      resultCodeSnapshot: submittedCode,
    },
  }
}
```

- [ ] Write the bounded-wait regression in the preparation test file, importing the helper above and `LeetCodeRemoteClient`:

```ts
it('finishes an incomplete capture wait within fifteen seconds', async () => {
  vi.useFakeTimers()
  try {
    const capture = makeCompleteCapture()
    capture.submissionResult = {
      ...capture.submissionResult!,
      resultCodeSnapshot: capture.submissionAttempt!.submittedCodeSnapshot,
    }
    const remote: LeetCodeRemoteClient = {
      readProblemMetadata: vi.fn(async () => ({
        ok: true as const,
        metadata: capture.metadata!,
      })),
      readProblemContent: vi.fn(async () => ({
        ok: true as const,
        content: capture.problemContent!,
      })),
      readSubmissionResult: vi.fn(
        () =>
          new Promise<
            Awaited<ReturnType<LeetCodeRemoteClient['readSubmissionResult']>>
          >(() => {}),
      ),
    }
    const pending = prepareLeetCodeAnalysisContext(
      capture,
      remote,
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(15000)
    expect(await pending).toMatchObject({ status: 'unavailable' })
    expect(remote.readSubmissionResult).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: '1234567890', refresh: true }),
    )
  } finally {
    vi.useRealTimers()
  }
})
```

Run `rtk npm run test -- src/features/leetcode-capture/api/prepare-code-analysis-context.test.ts`; expect FAIL before the preparation function exists. Add a complete-input case asserting zero transport calls and an explicit refresh case asserting both reads with the pinned ID.

- [ ] Implement this preparation contract. It returns capture data, not a grading request:

```ts
import {
  createLeetCodeReviewContext,
  type LeetCodeCaptureState,
  type LeetCodeRemoteClient,
  type LeetCodeReviewContext,
} from '@/lib/leetcode'

export type PreparedCodeAnalysisContext =
  | {
      status: 'ready'
      context: LeetCodeReviewContext
      submissionId: string
      attemptId: string
    }
  | { status: 'unavailable'; message: string }

function ready(capture: LeetCodeCaptureState): PreparedCodeAnalysisContext {
  const attempt = capture.submissionAttempt
  const result = capture.submissionResult
  const context = createLeetCodeReviewContext(capture)
  if (
    !attempt ||
    !context ||
    !result?.submissionId ||
    attempt.location.slug !== result.location.slug ||
    context.problem.location.slug !== result.location.slug ||
    attempt.location.host !== result.location.host ||
    context.content.location.slug !== result.location.slug ||
    context.content.completeness !== 'complete' ||
    !context.content.statement.trim() ||
    context.submittedCode?.completeness !== 'complete' ||
    !context.submittedCode.code?.trim() ||
    !context.submittedCode.language?.trim()
  ) {
    return {
      status: 'unavailable',
      message:
        'Full submitted code and problem context are not available yet. Retry this submission.',
    }
  }
  return {
    status: 'ready',
    context,
    submissionId: result.submissionId,
    attemptId: attempt.attemptId,
  }
}

export async function prepareLeetCodeAnalysisContext(
  capture: LeetCodeCaptureState,
  remote: LeetCodeRemoteClient,
  signal: AbortSignal,
  refresh = false,
): Promise<PreparedCodeAnalysisContext> {
  signal.throwIfAborted()
  const initial = ready(capture)
  if (initial.status === 'ready' && !refresh) return initial
  const attempt = capture.submissionAttempt
  if (!attempt || !capture.metadata) return initial
  const controller = new AbortController()
  const cancel = () => controller.abort(signal.reason)
  signal.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(
    () =>
      controller.abort(
        new DOMException('Capture preparation timed out', 'TimeoutError'),
      ),
    15_000,
  )
  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    const read = async (): Promise<PreparedCodeAnalysisContext> => {
      const [content, submission] = await Promise.all([
        remote.readProblemContent({
          location: attempt.location,
          refresh: true,
        }),
        remote.readSubmissionResult({
          location: attempt.location,
          attemptId: attempt.attemptId,
          click: {
            location: attempt.location,
            clickedAt: attempt.clickedAt,
            buttonText: attempt.submitButtonText,
          },
          submittedCodeSnapshot: attempt.submittedCodeSnapshot,
          refresh: true,
          ...(capture.submissionResult?.submissionId
            ? { submissionId: capture.submissionResult.submissionId }
            : {}),
        }),
      ])
      controller.signal.throwIfAborted()
      if (
        capture.submissionResult?.submissionId &&
        submission.result?.submissionId !==
          capture.submissionResult.submissionId
      )
        return {
          status: 'unavailable',
          message:
            'The matching submission could not be refreshed. Retry this submission.',
        }
      return ready({
        ...capture,
        problemContent: content.ok ? content.content : null,
        submissionResult: submission.result,
      })
    }
    return await Promise.race([read(), aborted])
  } catch {
    signal.throwIfAborted()
    return {
      status: 'unavailable',
      message: 'Submission capture could not finish. Retry this submission.',
    }
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', cancel)
    if (onAbort) controller.signal.removeEventListener('abort', onAbort)
  }
}
```

`refresh` is one refresh batch, not a polling/retry loop. The 15-second bound limits caller waiting; existing LeetCode transport deadlines still bound requests already sent. No provider call occurs here. The controller in phase three retains the returned ID for Retry and discards old preparation completions.

- [ ] Run `rtk npm run test -- src/features/leetcode-capture src/lib/leetcode`, `rtk npm run typecheck`, focused Prettier, and `rtk git diff --check`. Commit with `feat(leetcode-capture): prepare bounded analysis context`. Record the phase checkpoint in the final implementation handoff; continue to phase two only after these checks pass.
