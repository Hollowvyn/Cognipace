# AI data-flow efficiency audit and proposed next phase

Status: measured offline audit; optimization design proposed for user review.
The all-model retry correction is separately authorized and does not establish
an efficiency improvement. The request covers sending, receiving and avoiding
unnecessary AI work across assessments and hints.

## Current flow

Capture prepares a complete problem and pinned submission. The overlay sends
strict structured data to the background, which checks the saved connection and
loads its key. The provider adapter sends rubric, JSON schema and selected
problem/submission fields. One model generation produces all scores, explanations
and complete suggested code. Local validation and a connection recheck precede
one complete runtime response. The UI then renders the report.

The current assessment branch is based on main's problem-only hint batch. The
separate hint PR #203 replaces that with one snapshot-aware request per turn.
This audit reviewed both branches without mixing their product behavior.

Useful existing controls: parallel fallback content/submission reads, reuse of
already complete capture, a background content/submission cache, one active
operation per tab/frame, coalescing identical in-flight request IDs, cancellation
and stale-result guards. Only selected structured context is sent to the model;
raw page HTML, application state and runtime identity envelopes are not forwarded.

## Measurements

The probe uses real prompt/schema/SDK serialization and mocked fetch responses
with authored fixtures and fake credentials. All four mock envelopes returned
success. No provider was called. These are UTF-8 byte measurements, not token,
cost or latency measurements and not production traffic statistics.

| Item                                                                          |                 Measured bytes | Implication                                                                                                          |
| ----------------------------------------------------------------------------- | -----------------------------: | -------------------------------------------------------------------------------------------------------------------- |
| Full assessment request body, small Two Sum fixture                           |                    8,595–9,249 | Wire payload is small; bandwidth alone is not a demonstrated bottleneck.                                             |
| Required structured output schema in those requests                           |                    4,210–4,845 | Much of a small request describes the report contract.                                                               |
| Assessment system instructions                                                |                          3,131 | Instructions are a substantial fixed part of each generation.                                                        |
| Six assessment fixture user messages                                          |                    1,345–1,590 | Actual authored input is smaller than fixed instructions/schema here.                                                |
| Omitting null optional metadata/diagnostics                                   | 218–280 saved per user message | Safe projection is worth considering, but only a small part of total wire size.                                      |
| Authored complete report vs core fields without implementation                |                 2,115 vs 1,395 | Suggested implementation fields account for about 34% of this fixture's serialized response.                         |
| Hint three with unchanged 32,000-byte source in current + two prior snapshots |                         96,725 | The pending hint design repeats identical code three times.                                                          |
| Equivalent synthetic hint input with one exact snapshot and turn references   |                         32,635 | Exact snapshot interning reduces this unchanged-code example by about 66%, without summarizing or truncating source. |

Evidence and reproducible probe:

- `../proof/2026-10-31-ai-efficiency/measurements.json`
- `../proof/2026-10-31-ai-efficiency/measure-payloads.ts.txt`

From the repository root, copy the probe to
`src/testing/ai-payload-audit.probe.test.ts`, run
`rtk proxy npm test -- src/testing/ai-payload-audit.probe.test.ts --run`, then
remove that temporary copy. It writes numeric-only measurements to
`/private/tmp/cognipace-ai-efficiency-audit-2026-10-31.json`.
The first exploratory run used an unsupported fake model identifier and its
mock-envelope success assertion failed; the final run used the same explicit
fixture model identifiers as the existing wire tests, and all four succeeded.

## Findings

1. **We generate hidden work before showing useful feedback.** The complete
   replacement code is generated even though its disclosure starts closed.
   Assessments wait for the complete non-streaming JSON object before displaying
   any scores. Streaming alone would change perceived wait, not reduce generated
   work; independently valid results are needed for safe progressive rendering.
2. **We lack measurements of model work.** SDK token usage is discarded. The
   current metadata has total provider-operation duration, but no request/response
   byte counts, prompt/output/reasoning/cache token counts, attempt count,
   first-result timing or separate capture/generation/validation timings.
   The overlay also drops the available provider metadata when publishing ready
   state. We cannot currently attribute user-perceived delay reliably.
3. **Repeated context can be reduced deterministically.** Hint history in PR
   #203 includes complete snapshots. Identical snapshots can be sent once with
   references. Distinct snapshots must remain complete; a hash alone is not
   usable context for a stateless provider. This is not semantic summarization.
4. **Duplicate suppression is narrow.** Current coalescing is in-flight and
   keyed by request ID within a tab/frame. Repeating identical logical input
   with a fresh ID still runs the model. A session-only exact-result cache could
   reuse successful reports for identical input/rubric/provider/key revision,
   with explicit regeneration available. Cancellation ownership and invalidation
   need to remain correct; a cross-user or persistent cache is unnecessary.
5. **Retry and timeout tuning address availability.** They do not reduce prompt
   or completion work. More retries can increase token consumption and elapsed
   time. Keep the bound and report attempts separately when measuring efficiency.

Zod checks at trust boundaries are intentional. The audit does not establish
that validation or runtime JSON transfer is a material CPU bottleneck. Removing
validation, using unreadable abbreviated keys or blindly compressing source is
not justified by these measurements.

## Recommended optimization sequence

**Phase 1 — measure and remove exact redundancy, retaining current UX.** Add
allowlisted numeric metrics to the test/evaluation path: payload bytes, SDK
usage when available, attempts and stage durations. Missing usage stays unknown.
Compare the same fixtures by provider/model before and after each change.
Project only populated optional provider input fields and intern identical hint
snapshots in the provider prompt while retaining full local history and request
contracts. Preserve original code, examples, constraints and meaningful diagnostics.

**Phase 2 — return useful feedback earlier.** Recommended product change:
generate scores and explanation as the first independently validated report;
generate the full suggested implementation on explicit request and retain it in
the same session. Opening existing code should not regenerate it. The second
request uses the original pinned submission and the approved report, not the
user's subsequently edited code. Both operations keep independent cancellation,
shared connection identity and stale-output protection. This trades a second
request for users who ask for code against avoiding code generation for users
who do not. Measure total calls, tokens, time to first useful feedback and full
code latency. Do not promise an improvement before live evaluation.

An alternative is retaining one full report and progressively displaying
validated completed sections. This keeps eager code generation and is more
complex to validate safely; it primarily targets perceived wait. Splitting into
separate score agents would add calls and coordination without demonstrated need.

**Phase 3 — reuse identical successful work.** Add a bounded, volatile exact
input cache if measured repeated requests justify it. Key by model/provider,
credential revision, rubric/schema version and complete normalized input; never
by problem slug alone. Invalidate on reset/configuration change and provide an
explicit regeneration action. Keep caches out of persistence, backup and sync.

## Approval boundary and acceptance

Phase 1 requires a short implementation plan before production edits. Phase 2
also requires approval for the on-demand suggested-code interaction and updated
runtime/report contracts. The current complete-code behavior remains unchanged
until that approval. No agent orchestration framework, hosted service, new host
permission or persistent telemetry is proposed.

Measure quality alongside bytes/tokens and timing: rubric consistency, useful
remaining-gap hints, preserved language/signatures, malformed-output rate and
cancellation behavior. Require real-provider comparisons and human realtime
happy-path/edge-case screenshots or recordings before review or merge. Offline
fixtures establish repeatability and payload differences, not model quality or
production performance.
