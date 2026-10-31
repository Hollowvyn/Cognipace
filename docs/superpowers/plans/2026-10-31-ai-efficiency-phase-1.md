# AI data-flow efficiency phase 1 implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development, TDD,
> independent spec review followed by quality review. User approval is recorded
> in the master design; execute continuously within this scope.

**Goal:** Measure model work safely and remove redundant provider input without
changing the feedback UI yet.

**Architecture:** `src/lib/ai` owns optional numeric generation measurements;
the assessment feature owns its compact provider projection and evaluation
artifacts. Runtime metadata accepts only a bounded optional metrics object.
No telemetry service, data persistence, new host or raw provider logging.

**Tech stack:** TypeScript, AI SDK 7, Zod, Vitest, WXT.

## Task 1: Numeric measurements and compact assessment input

Files: `src/lib/ai/types.ts`, `generate-json.ts` and tests; an adjacent small
metrics schema/helper and tests if needed; assessment runtime metadata contract;
`server/code-analysis-service.ts`, `server/build-code-analysis-prompt.ts` and
tests; `testing/code-analysis-evaluation-results.ts` and tests/harness.

- [ ] Write RED tests for an explicit optional `collectMetrics` generation
      flag. Calls without it retain their existing exact result metadata.
- [ ] Add allowlisted optional numeric metrics: attempt count, aggregate
      serialized outgoing request-body bytes, validated output JSON bytes,
      preparation/generation/validation durations, and available SDK token usage.
      Bound finite nonnegative values; unknown token counts stay absent. Read AI SDK
      7 `result.usage`, `inputTokenDetails.cacheReadTokens` and
      `outputTokenDetails.reasoningTokens`. Usage from the successful SDK call is
      not a claim about unavailable failed-attempt billing. Do not copy `usage.raw`.
- [ ] Count outgoing string-body UTF-8 bytes in the existing fetch wrapper.
      Do not clone response bodies or add fetch calls merely to measure size. Count
      validated output JSON bytes separately from provider envelope size.
- [ ] Include opt-in error measurements when known, without keys, prompts,
      code, errors, URLs, response bodies or arbitrary provider metadata. Use an
      explicit strict optional metrics schema at the runtime metadata boundary.
- [ ] Enable collection for assessments and retain metrics in the evaluation
      allowlist/summary. Preserve success/failure categories and missing-value
      semantics; never fabricate token counts from bytes or absent usage.
- [ ] Compact only the provider-facing assessment projection: omit null
      optional submission metadata and diagnostics, and empty omitted-diagnostics
      lists. Preserve the complete problem, exact source/language/status, populated
      diagnostics, zero counts and all meaningful constraints/examples. The local
      strict runtime request remains unchanged. State in the prompt that absent
      optional fields are unavailable, not evidence for inferred values.
- [ ] GREEN command:

  ```sh
  rtk proxy npm test -- src/lib/ai src/features/leetcode-review-assistant --run
  ```

- [ ] Self-review, independent spec review, then quality review. Commit only
      reviewed code and exact validation evidence.

## Task 2: Exact snapshot interning on hint PR #203

After the assessment branch is committed, switch to `codex/adaptive-code-hints`.
Do not carry unrelated changes across branches. Update the existing hint service
and provider fixtures/tests, retaining full local history and runtime contracts.

- [ ] RED test: hint three with identical code/language in all three snapshots
      sends that source once; distinct snapshots remain complete and recoverable.
- [ ] Project provider input to a unique snapshot table and ordered turns with
      snapshot references. Normalize only CRLF as already permitted; ignore capture
      timestamps for equality. Keep prior hints, current snapshot identity and all
      problem constraints. Do not send an opaque hash instead of necessary source.
- [ ] Give the model explicit reference-table instructions. Preserve successful
      Light → Medium → Heavy order, progress rules and the three-hint cap.
- [ ] Run focused hint tests, lint, check, build and formatting per governance;
      record commands and pending live/human proof, commit and update PR #203.
- [ ] Return to the broader efficiency branch for feedback-first Phase 2.

## Validation and publication

Run focused tests first and aggregate `rtk proxy npm run lint`,
`rtk proxy npm run check`, `rtk proxy npm run build`, `rtk proxy npm run format`,
explicit planning/proof Prettier and `rtk proxy git diff --check` after integration.
Keep human installed-extension smoke and real-provider timing/quality comparisons
pending without private test-only credentials. Update current authority docs and
the dated handoff honestly. Phase 2 uses a separate plan before implementation.
