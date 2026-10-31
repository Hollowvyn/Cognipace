# Free-model assessment reliability — proposed design

## Approved correction — 2026-10-31

The user requested retry support for all models. This supersedes the free-only
scope below. Assessments now enable one bounded transient retry for every
supported provider/model, including paid/custom models. Rename the library
opt-in to `retryTransientErrors`; retain the shared deadline, same-model request,
Retry-After, cancellation, error exclusions and strict output validation. Hints
and connection testing remain single-attempt calls. Add cross-provider and paid
OpenRouter recovery coverage and update current docs and PR #213. This changes
reliability policy; it does not establish a measured efficiency improvement.

Status: approved by the user in chat on 2026-10-30. Implement on the separate
`codex/free-model-assessments` branch from `origin/main`. The existing hint PR
keeps fresh snapshots and the separately approved light → medium → heavy
sequence.

## Problem and evidence

The user reports frequent failures with the default free OpenRouter model,
including submission assessments, and suspects timing. No exact failing
response or live-provider trace is available, so the failure cause is unconfirmed.

The current code establishes these facts:

- `server/analysis-runtime-service.ts` bounds database startup, connection/key
  loading, generation and the final connection check at 30 seconds total.
- `server/code-analysis-service.ts` requests a complete scored report and
  suggested implementation with an 8,192-token output ceiling.
- `server/build-code-analysis-prompt.ts` requires substantial reasoning and
  code generation without an explicit concise-response target.
- `src/lib/ai/generate-json.ts` requires strict structured output and compatible
  routing, disables SDK retries and rejects truncated or inconsistent output.
- `server/code-analysis-provider-evaluation.test.ts` asserts success before
  writing its artifact. Failed cases therefore leave no controlled failure
  artifact with duration and category for comparison.

OpenRouter documents random selection among capable free models, higher peak
latency and variable availability. Strict output support varies by provider
endpoint. These facts explain risks, not the cause of this user's failure.

Sources checked on 2026-10-30:

- [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router)
- [Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [Errors and Retry-After](https://openrouter.ai/docs/api_reference/errors-and-debugging)

## Options

1. **Recommended: concise reports, bounded recovery and measurement.** Keep
   the current report contract and assess the same dimensions. Improve the
   response instructions, time budget and free-provider failure handling;
   record evaluation outcomes before asserting success.
2. **Timeout only.** Cheapest change, but it cannot address verbose responses,
   transient failures or missing failure evidence.
3. **Split assessment into several model calls.** Could reduce each response's
   size, but increases latency, free request consumption and consistency work.
   Defer until measurements show it is necessary.

## Proposed behavior

- Give submission assessments a 60-second whole-operation deadline and an
  80-second client deadline, including preparation and the final connection
  check. Hints and connection testing retain their current budgets.
- Keep all existing scores, rows, consistency checks and complete suggested
  implementation. Ask for one-sentence rationales, compact complexity
  assumptions and at most two high-value suggestions per list. Keep the
  8,192-token ceiling: lowering it blindly risks truncation, especially for
  reasoning models.
- Permit at most one retry for OpenRouter free selections (`openrouter/free`
  or an explicit `:free` variant) after a controlled transient upstream
  failure. Use the same selected model and the same whole-operation deadline.
  Honor Retry-After when provided; if the delay cannot fit, return the
  controlled error. Retrying must remain abortable.
- Do not automatically retry quota/rate-limit, authentication, billing,
  refusal, invalid configuration or malformed/inconsistent report failures.
  These need a different recovery action or measurement first.
- Preserve strict schema validation and provider capability requirements.
  Do not silently accept prose as a report or introduce paid model fallbacks.
- Write opt-in evaluation outcomes before assertions, using requested model,
  available resolved model, duration, success/error category and fixture ID.
  Include reports only for successful synthetic fixtures. Never copy keys,
  provider bodies or raw SDK messages into artifacts or logs.

## Ownership and implementation plan

1. In the existing evaluation harness, add controlled failure artifacts and
   outcome summaries. Add focused tests for both success and failure records.
2. Update assessment prompt instructions and runtime/client deadlines within
   `leetcode-review-assistant` and `overlay-session`. Add regression coverage
   for delayed success, full timeout, cancellation and stale connection or
   submission output.
3. Add an explicit opt-in transient retry policy to `src/lib/ai`, enabled only
   by assessments for free OpenRouter selections. Keep ordinary calls at one
   attempt. Test Retry-After, attempt cap, shared deadline, cancellation and
   non-retryable errors with mocked transport and fake timers.
4. Align current product, architecture and testing documentation. Run focused
   tests, then `npm run lint`, `npm run check`, `npm run build` and
   `npm run format`. Keep this follow-up separate from the approved hint-order
   correction so each change is reviewable.

The implementation adds no persistence, sync, host access or secret-loading
path. Existing background sender authorization, request ownership and Zod
runtime boundaries remain required. All SDK calls stay in `src/lib/ai`.

## Acceptance and remaining proof

Mocked tests must establish the bounded recovery behavior and reject stale
results. The opt-in evaluation suite must distinguish timeout, quota,
availability and output failures and allow before/after comparisons on the
same fixtures. A success-rate improvement cannot be claimed without live data.

Human installed-extension smoke must cover a normal assessment, a slow
response, exhausted quota, an upstream failure, navigation/cancellation and a
connection change while pending, with screenshot or recording proof before
review or merge. Private test-only provider configuration is needed for live
evaluation; application key storage is not an evaluation credential source.
