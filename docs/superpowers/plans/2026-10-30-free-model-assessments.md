# Free-model assessment reliability implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for this
> focused phase, with spec review followed by quality review. Execute continuously
> under the user's approval; no additional execution-choice approval is needed.

**Goal:** Make free OpenRouter assessments more tolerant of slow or temporarily
unavailable providers and make failed evaluations measurable.

**Architecture:** Keep all SDK calls and transport recovery in `src/lib/ai`.
The assessment feature explicitly opts into recovery; the overlay owns its
client deadline. Reuse strict report/runtime contracts and session ownership.

**Tech stack:** TypeScript, AI SDK 7, OpenRouter provider, Zod, Vitest and WXT.

## Task 1: Bounded assessment reliability

The deadline, retry opt-in and evaluation harness form one focused behavior
change. Use one implementation worker, then independent spec and quality review.

**Files and responsibilities:**

- `src/lib/ai/types.ts`: explicit `retryTransientFreeModel?: boolean` opt-in.
- `src/lib/ai/generate-json.ts`: at most one abortable recovery attempt inside
  the existing whole deadline, with unchanged strict output and SDK retries off.
- A small adjacent retry helper if required for delay parsing; no generic
  framework or public runtime metadata changes.
- `src/lib/ai/generate-json.test.ts`: mocked transport/fake timer recovery tests.
- `src/features/leetcode-review-assistant/server/code-analysis-service.ts` and
  its tests: enable the opt-in for free OpenRouter selections only.
- `src/features/leetcode-review-assistant/server/build-code-analysis-prompt.ts`
  and its tests: concise report instruction preserving every rubric and row.
- `src/features/leetcode-review-assistant/server/analysis-runtime-service.ts`
  and its tests: 60-second whole-operation deadline.
- `src/features/overlay-session/hooks/use-leetcode-code-analysis.ts` and its
  tests: 80-second client deadline and preserved request ownership/cancellation.
- `src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts`:
  record controlled outcomes before success assertions, use 60-second generation
  and a 65-second test timeout.
- `src/features/leetcode-review-assistant/testing/code-analysis-evaluation-results.ts`
  and its tests: test-only safe artifact projection and summary counts/timings.

- [x] Write failing tests and run them before production changes:

  ```ts
  // A transient 503 followed by a valid response succeeds on the second fetch.
  const result = await generateJson({
    ...request('openrouter'),
    retryTransientFreeModel: true,
    timeoutMs: 60000,
  })
  expect(result.status).toBe('success')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  ```

  Cover 502/503/504 transport errors, recognized embedded provider-unavailable
  machine errors, attempt cap, seconds/HTTP-date Retry-After, long Retry-After
  that cannot fit, cancellation during backoff, shared timeout and timer cleanup.
  Cover no retry for paid/custom models, other providers, missing opt-in,
  429/auth/billing/refusal/configuration/malformed output and consistency errors.
  Do not infer retries from arbitrary provider messages.

- [x] Implement the smallest retry policy. Keep `maxRetries: 0` and route the
      retry through the same SDK generation/validation path:

  ```ts
  const recoveryEnabled =
    request.retryTransientFreeModel === true &&
    request.provider === 'openrouter' &&
    (request.model === 'openrouter/free' || request.model.endsWith(':free'))
  ```

  Retry exactly once after a recognized transient upstream failure with a
  default 1,000ms abortable delay. Retry-After overrides that delay; a delay at
  or beyond the remaining operation budget returns the original controlled
  error immediately. Reset per-attempt transport state so old status cannot
  misclassify a later response. Never retry after cancellation, timeout or an
  output/refusal/validation failure. Successful metadata duration spans both
  attempts. No body, SDK error, prompt or key logging.

- [x] Add concise assessment instructions and update whole/client deadlines:

  ```ts
  const analysisTimeoutMs = 60_000
  // use-leetcode-code-analysis.ts
  { timeoutMs: 80_000, signal: operation.controller.signal }
  ```

  Ask for one-sentence rationales, compact complexity assumptions and at most
  two high-value suggestions per list. Keep schema, 8,192-token ceiling,
  complete suggested code, rubric and honesty checks unchanged. Tests must
  demonstrate success after 30 seconds, timeout at the new cap, cancellation
  and stale-connection rejection, without changing hints or connection testing.

- [x] Record evaluation outcomes using an explicit projection, never a spread
      of provider errors:

  ```ts
  // Both outcomes include fixture ID, checkedAt and allowlisted metadata.
  // Success adds the validated report; failure adds only controlled error code.
  // Summary: total/success/failure counts, counts by error code, durations.
  ```

  Write each case artifact and the run summary before asserting success. Scope
  summaries to the current run, including a safe outcome for failed cases.
  Validate projection tests with injected raw error fields and a fixture secret;
  none may appear in serialized artifacts. Ordinary tests must not read keys or
  call real providers. Keep the existing opt-in environment harness.

- [x] Run focused tests to GREEN:

  ```sh
  rtk proxy npm test -- src/lib/ai src/features/leetcode-review-assistant src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx --run
  ```

- [x] Self-review, then independent spec review and quality review; address
      findings before committing production changes.

## Task 2: Documentation, aggregate validation and draft PR

Controller owns docs, aggregate validation and publication after Task 1 review.

- [x] Update `docs/product.md`, `docs/architecture.md`, `docs/testing.md` and
      `docs/superpowers/README.md` to describe bounded assessment recovery and safe
      evaluation artifacts. Keep user-facing copy free of transport details.
- [x] Run `rtk proxy npm run lint`, `rtk proxy npm run check`,
      `rtk proxy npm run build`, `rtk proxy npm run format`, explicit Prettier on
      otherwise ignored planning files and `rtk proxy git diff --check`.
- [x] Record exact commands/results and skipped commands/reasons in
      `docs/superpowers/handoffs/2026-10-30-free-model-assessments.md`.
- [x] Keep real-provider evaluation pending unless private test-only credentials
      are available. Do not use application secret storage. Require human realtime
      happy-path, slow-response, provider-error, quota, navigation and connection
      smoke with screenshot/recording proof before PR review/merge.
- [x] Commit Conventional Commit changes, push the verified repository branch
      and open a separate draft PR using the current template. Include release
      impact, rollback, unchanged permissions/persistence and remaining proof gates.

Implementation and automated review/validation completed on 2026-10-30.
Live-provider evaluation and human realtime smoke/proof remain pending;
publication uses a draft PR, with no merge or release authorized.
