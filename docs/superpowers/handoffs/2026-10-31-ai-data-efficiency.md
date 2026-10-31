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

## Phase 2 implementation and evidence

Initial generation now returns only `leetcode-code-feedback-v1` with scored
feedback. A separate explicit implementation operation receives the original
assessed submission and feedback in a strict self-contained envelope. It has
independent in-flight ownership, cancellation, sender authorization and connection
rechecks, without a completed-worker pin cache. UI Generate/Retry is local to
code; feedback remains visible and successful code survives local review saves.

- Initial feedback RED: two missing-shape failures / 18 passes; service then
  passed 20 tests. Pinned-request and keyboard Generate assertions also failed
  before implementation and passed after wiring.
- `rtk proxy npm test -- src/lib/ai src/features/leetcode-review-assistant src/features/overlay-session src/extension/background --run`:
  final 1,104 passed, 12 opted-in provider cases skipped; 49 files passed, three
  skipped. `rtk proxy npx tsc --noEmit` and scoped ESLint/Prettier passed.
- Independent SPEC review approved and ran
  `rtk proxy npm test -- src/features/leetcode-review-assistant/api/code-implementation-contracts.test.ts src/features/leetcode-review-assistant/server/code-implementation-service.test.ts src/features/leetcode-review-assistant/server/implementation-runtime-service.test.ts src/features/overlay-session/hooks/use-leetcode-code-implementation.test.tsx --run`:
  63 passed. An initial transform read raced concurrent formatting; the settled
  rerun passed. QUALITY/final static review approved with no important findings.
- The first aggregate check found the archived `.ts` probe outside tsconfig's
  project service. Renamed it to `.ts.txt` and updated reproduction instructions,
  preserving it as proof rather than executable/linted application source.
  The first format check ran before final formatting and reported those files;
  final aggregate results follow after the settled run.
- Final `rtk proxy npm run check`: passed database check, typecheck, lint and
  tests; 4,021 passed, 13 skipped; 256 files passed, four skipped. Existing jsdom
  scroll notices appeared. `rtk proxy npm run lint`, `rtk proxy npm run build`
  and `rtk proxy npm run format`: passed; existing build chunk warning remains.
- Explicit planning/handoff/proof Prettier and `rtk proxy git diff --check`
  passed after final documentation updates. An initially unformatted copied
  screenshot-check JSON file was corrected before the final format pass.

Phase 1 hint interning was separately published to PR #203 at `cc3f644c`:
3,102 tests passed, 14 opted-in cases skipped, with lint/check/build/format and
independent SPEC/QUALITY approval. The local/runtime hint contracts and fixed
Light/Medium/Heavy ordering remain unchanged.

Offline final initial-feedback measurement used the same authored fixture and
actual adapters with mock responses: all four succeeded. Request bodies dropped
from 8,595–9,249 bytes to 7,297–7,756 bytes (15–16%); one authored response dropped
from 2,115 to 1,395 bytes (about 34%). See `after-measurements.json`. These are
bytes, not measured provider token/cost/latency gains. Asking for full code adds
a separate request; the evaluation measures that operation separately.

### Browser fixture QA

The Browser plugin is absent; the Chrome DevTools connector failed to connect
at `127.0.0.1:9222` (HTTP 404). Used existing cached Playwright with installed
Google Chrome, without browser/dependency installation. The fixture renders the
real report component, production CSS/themes and ShadowRoot, with mocked states.
It proves component interactions, not real transport, provider or extension flow.

- `rtk proxy node /private/tmp/cognipace-feedback-proof/server.mjs`: local Vite
  fixture at `http://127.0.0.1:4179`. Initial middleware order returned 404;
  registering it before Vite fallback corrected it.
- `rtk proxy node /private/tmp/cognipace-feedback-proof/verify.cjs`: passed after
  correcting the fixture locator for the combined AI-generated/Untested label.
  Verified identity/title, meaningful content, no framework overlay, no console
  or page errors, opening disclosure without generation, pending disabled action,
  retained feedback, code-only retry, ready reuse and no page overflow at 320px.
- Agent inspected dark 392px and light 296px card screenshots (416px and 320px
  viewports). Production code scrolling stays inside its code block. Selected
  idle/pending/error/ready screenshots and checks are in the proof folder.

## Remaining proof and skipped validation (current)

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
- `rtk proxy env COGNIPACE_AI_EVAL=1 COGNIPACE_AI_IMPLEMENTATION_EVAL=1 npm test -- src/features/leetcode-review-assistant/server/code-implementation-provider-evaluation.test.ts --run`:
  private test-only credentials absent; full implementation evaluation is
  separately opted in and cannot be inferred from feedback-only tests.
- `rtk proxy node --check /private/tmp/cognipace-ai-evaluation/two-sum.js`,
  `rtk proxy node /private/tmp/cognipace-ai-evaluation/two-sum.js`, and
  `rtk proxy kotlinc /private/tmp/cognipace-ai-evaluation/kotlin-types.kt -d /private/tmp/cognipace-ai-evaluation/kotlin-types.jar`:
  no live provider-generated code artifacts available to compile/run.

Final aggregate lint/check/build/format and human smoke flows are recorded after
integration. Do not treat offline measurements or unit tests as live-provider
quality or installed-extension proof.
