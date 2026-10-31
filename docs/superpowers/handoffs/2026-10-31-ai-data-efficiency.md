# AI data-flow efficiency handoff — 2026-10-31

Branch: `codex/ai-data-efficiency`, based on the all-model recovery correction
in PR #213 at `3e0e42e6`. The user explicitly approved metrics/context cleanup
and feedback first with full suggested code generated only on request. Hint
snapshot interning belongs to the separate PR #203 branch.

## Audit and baseline

Offline measurements at `3e0e42e6` use actual SDK wire serialization and authored
fixtures with mocked fetch responses and fake credentials. No provider called.
The successful final probe measured 8.6–9.2 KB request bodies, about 34% of one
authored response in implementation fields, and a synthetic unchanged-code third
hint shrinking from 96.7 KB to 32.6 KB with exact snapshot interning. These are
byte measurements, not token, latency, billing or production traffic claims.

The first probe's fake model identifier caused a mock-envelope assertion failure;
the corrected explicit fixture model identifiers succeeded for all four adapters.
Probe source and numeric evidence are preserved in
`docs/superpowers/proof/2026-10-31-ai-efficiency`. Reproduce the baseline from its
recorded commit, because later phases change prompts and response contracts.

## Phase 1 Task 1 validation

- RED: `rtk proxy npm test -- src/lib/ai/generate-json.test.ts src/features/leetcode-review-assistant/server/build-code-analysis-prompt.test.ts --run`:
  six expected missing-metrics/compaction failures before implementation.
- RED: `rtk proxy npm test -- src/features/leetcode-review-assistant/testing/code-analysis-evaluation-results.test.ts --run`:
  one expected missing-projection failure before implementation.
- GREEN: `rtk proxy npm test -- src/lib/ai src/features/leetcode-review-assistant --run`:
  456 passed, nine opted-in provider cases skipped. Independent SPEC review
  repeated this command and passed with no findings.
- `rtk proxy npx eslint src/lib/ai src/features/leetcode-review-assistant`,
  `rtk proxy npx tsc --noEmit`,
  `rtk proxy npx prettier --check src/lib/ai src/features/leetcode-review-assistant`
  and `rtk proxy git diff --check`: passed. Two initial inferred optional/compact
  record typing diagnostics were corrected before the final typecheck.
- Independent QUALITY review approved with no important findings and ran six
  targeted files / 235 tests successfully. Full aggregate checks remain due at
  integration; no phase-level live/provider or human gate is marked complete.

Generation metrics are explicit opt-in. Preparation covers schema readiness;
generation sums SDK calls excluding validation and retry backoff; validation
wraps the SDK's actual complete-output parse. Token usage describes the
successful SDK call only, not unknown failed-attempt billing. Byte counts mean
outgoing request bodies and validated output JSON, not provider response
envelopes. No response clone or extra network call is introduced. Metrics and
evaluation artifacts allowlist numeric values and preserve unknown values.

## Remaining proof and skipped validation

This handoff is updated as the approved phases complete. Human installed-extension
realtime happy-path and edge-case smoke with screenshots or recordings is
required before review/merge. Live-provider quality and before/after performance
remain unverified without private test-only configuration. No application secret
storage may be read to obtain evaluation credentials.

- `rtk proxy env COGNIPACE_AI_EVAL=1 npm test -- src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts --run`:
  pending private test-only credentials, absent in this session.
- `rtk proxy npm run db:generate`: schema and persisted shape unchanged.
- `rtk proxy npm run zip` and `rtk proxy npm run store:check`: no packaging or
  release workflow change/store submission requested.

Final aggregate lint/check/build/format and human smoke flows are recorded after
integration. Do not treat offline measurements or unit tests as live-provider
quality or installed-extension proof.
