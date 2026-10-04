# AI repair and post-submission code analysis

Status: deferred master draft. Implementation has not started.

The user's subsequent correction makes Gemini setup and persistence the first
priority. The active design for the first phase is
[`2026-10-03-ai-connection-setup-design.md`](2026-10-03-ai-connection-setup-design.md).
The extraction, long-generation transport, and assessment ideas below remain
tentative future work; they are not included in the current approval request.

Date: 2026-10-03

Task branch: `codex/ai-assessment-repair`, based on fetched `origin/main`
at `7cccd2d7b63d8d01e226227ca9e62247e3c165e1`.

## Outcome

Restore dependable BYOK AI calls, extract a reusable provider integration,
and replace the current rating-oriented AI presentation with post-submission
code analysis inspired by the supplied LeetCode screenshots.

The report has Approach, Efficiency, and Code Style / Syntax scores out of 5,
concise explanations, actionable suggestions where needed, and a final improved
solution in the submitted language. FSRS recall ratings continue to describe
the user's recall and practice effort; code-quality scores do not silently
change ratings, correctness, review dates, or track completion.

Assessment is the first consumer of the reusable integration. Future help or
analytics features can supply their own prompts and output schemas through the
same integration. This work does not implement those future product features.

## Investigation and evidence

The user's exact failing provider/model and visible error are still unknown.
The following findings distinguish reproduced behavior, source defects, and
provider-dependent incompatibilities.

| Finding                                                                           | Evidence                                                                                                                                                | Consequence                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Reproduced: timeout covers headers, not the body                                  | `src/features/genai/server/providers/shared.ts:46`; native Node reproduction below                                                                      | A response body can hang beyond the configured deadline.                                                                          |
| Verified in source: two AI paths for one accepted submission                      | `use-overlay-review-actions.ts:305` and `use-leetcode-assessment-recommendation.ts:210` in `src/features/overlay-session/hooks`                         | Duplicate requests, inconsistent results, and save latency.                                                                       |
| Verified in source: captured content is omitted                                   | `use-leetcode-page-sync.ts:223`; assessment request builders at `use-overlay-review-actions.ts:479` and `use-leetcode-assessment-recommendation.ts:291` | The model lacks statement, examples, and constraints; one request also has empty topics.                                          |
| Verified in source: code analysis is outside the current output contract          | `src/features/leetcode-review-assistant/server/build-assessment-prompt.ts:31` and `domain/recommendation-schema.ts`                                     | The prompt explicitly asks for an FSRS rating rather than a quality score; category scores and suggested code cannot be returned. |
| Verified in source: ratings can be replaced despite user intent or low confidence | `use-overlay-review-actions.ts:449`; `use-leetcode-assessment-recommendation.ts:248-284`                                                                | Manual and automatic flows disagree about applying recommendations.                                                               |
| Verified in source: failed requests remain handled                                | `use-leetcode-assessment-recommendation.ts:182,224`                                                                                                     | No retry for the same submission after a transient failure.                                                                       |
| Verified in source: credential draft survives provider changes                    | `src/features/settings/components/sections/ai-assessment-section.tsx:56,117`                                                                            | A key typed for one provider can be saved and sent to another.                                                                    |
| Verified in source: missing configuration can disable the on-state switch         | Same settings component, `:61,97`                                                                                                                       | The user cannot turn assessment off after clearing the key or model.                                                              |
| Documented incompatibility: Anthropic gets unsupported raw schema constraints     | `src/features/genai/server/json-schema.ts:14`; current schema uses string length bounds                                                                 | Claude requires provider transformation of unsupported constraints before native structured output.                               |
| Model-dependent incompatibility: OpenAI always receives temperature               | `src/features/genai/server/providers/openai.ts:31`                                                                                                      | Reasoning configurations that reject this parameter fail before generating output.                                                |
| Verified generic-library defects in Gemini conversion                             | `json-schema.ts:65-100` deletes `$ref`/`const` and does not transform union branches                                                                    | Future schemas lose meaning; this is not proof that the current specific Gemini assessment schema fails.                          |
| Verified in source: response contract is unused and metadata differs              | `runtime-contracts.ts:176`; `src/extension/background/register-handlers.ts:1253`; `api/recommendation-api.ts:8`                                         | Normal usage/version metadata would fail the declared strict schema if validation were added unchanged.                           |
| Verified in source: code capture can be incomplete                                | `src/lib/leetcode/watcher/submission-result-watch.ts:213`; `editor/code-snapshot-reader.ts:24`; prompt code cap is 4,000 characters                     | DOM fallback can lose the submission snapshot; visible Monaco lines are not proof of full code.                                   |

### Current documentation

Context7 was used to resolve and query OpenAI, Anthropic, and Gemini docs.
Official references were then read directly where retrieval left ambiguity.

- [OpenAI model parameter compatibility](https://developers.openai.com/api/docs/guides/latest-model): sampling parameters depend on the model and reasoning configuration.
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): strict schemas need required properties and closed objects.
- [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs): native `output_config.format`, schema transformation, refusals, and truncation.
- [Gemini generateContent reference](https://ai.google.dev/api/generate-content): distinguish its OpenAPI `responseSchema` from JSON Schema output configuration. The current `Schema` reference includes string length bounds and `anyOf`; do not diagnose those keywords alone as a Gemini failure.
- [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) and [bounded operation lifetime](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers#keep-sw-alive): request/header delays and worker idleness need separate handling.

No live provider request was made. Static documentation comparisons do not
identify which defect caused the user's installed-extension failure.

## Approaches considered

| Approach                                                                             | Tradeoff                                                                                                                                                                                |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recommended: extract the existing provider integration to `src/lib/ai` and repair it | Reuses installed Zod and HTTP infrastructure, keeps product ownership clear, and permits provider-shaped integration tests. Requires targeted moves and updates to architecture guards. |
| Keep everything inside `features/genai` and repair its public API                    | Smaller move, but generic provider code and capability configuration remain combined in a product feature.                                                                              |
| Introduce a new multi-provider AI SDK                                                | Can delegate provider dialect work, but adds dependency, bundle, and MV3 compatibility work before the actual assessment wiring is repaired.                                            |

Use the first approach. Keep the public operation small: typed structured
generation with a prompt, schema, configuration, deadline, output budget, and
optional cancellation signal. Add no agent framework, tool engine, chat history
system, or provider plugin registry for hypothetical future uses.

## Ownership

- `src/lib/ai`: provider-neutral request/result types, provider adapters,
  schema conversion, response extraction, normalized failures, and operation
  lifecycle. Depends only on Zod and existing platform HTTP facilities, with
  injectable transport. Imports no app or feature modules.
- `features/genai`: trusted provider configuration and secret orchestration,
  configuration status, and Settings-facing APIs. Secret values remain in
  trusted local storage and background code.
- `features/leetcode-review-assistant`: code-analysis schema, rubric, prompt,
  report normalization, and purpose-specific background service.
- `features/assessment` and `features/practice`: existing deterministic
  recall assessment and practice persistence.
- `features/overlay-session`: one assessment controller, capture readiness,
  retry, stale-result handling, and report presentation.
- `src/extension`: request/response validation, sender authorization, handler
  registration, and trusted cancellation ownership.

Retain the existing `settings.aiAssessment` storage shape for compatibility.
Its provider/model are reusable configuration; its enabled flag gates automatic
assessment only. Separate configuration loading from that capability gate.
Future consumers need their own explicit feature availability rules.

The existing architecture test restricts the `apiKey` literal to GenAI. Update
that restriction narrowly to allow the extracted `src/lib/ai` integration and
keep all other UI/features barred from secret handling. Preserve the approved
provider hosts and current permissions.

## Provider repair

1. Make each provider's wire schema explicitly compatible with its documented
   dialect. Preserve semantics when adapting enums, nullable fields, and nested
   objects. Reject unsupported generic schemas safely rather than deleting
   referenced meaning. Validate generated data against the original Zod schema.
2. Omit optional sampling parameters by default. Send them only under explicit
   supported configuration. Keep the user's configured provider/model selection;
   do not silently switch providers or models.
3. Enforce one operation deadline over request, response body, and parsing,
   including error bodies. Dispose timers and abort listeners on every path.
   The assessment caller uses a 25-second header deadline, a 60-second total
   deadline, and an 8,192-token output budget.
4. Distinguish configuration/unsupported request, auth, rate limit, transport,
   timeout, cancellation, refusal/blocked content, output truncation, and invalid
   structured data. Use controlled public messages. Do not log raw provider
   bodies, prompts, code, or credentials.
5. Share a safe provider-metadata schema, including optional model version and
   token usage. Validate runtime responses as well as requests.
6. In Settings, clear the credential draft on provider change and always allow
   turning assessment off. Add a dashboard-authorized saved-configuration test
   that validates a tiny real structured response without returning the key.
   An explicit Test connection action may call the configured provider.

Use the existing trusted secret store and fixed host policy. Runtime callers
cannot supply arbitrary hosts, credentials, or arbitrary prompts/schemas.

### Chrome MV3 operation lifetime

Chrome can terminate the service worker when a fetch response takes over
30 seconds to arrive or the worker is inactive for 30 seconds. A larger JavaScript
timeout alone does not make a longer generation reliable.

Use native provider streaming internally: OpenAI/Anthropic `stream: true`, and
Gemini's `streamGenerateContent?alt=sse`. Receive headers within the 25-second
header deadline, then assemble the final JSON under the 60-second total deadline.
Only the final validated report crosses runtime messaging. No partial scores or
partial code are shown. Provider reducers handle completion, refusal, safety
blocks, output limits, and errors; premature EOF is an error even if accumulated
text happens to parse. Ignore reasoning/thought blocks when assembling output.

During this bounded operation only, the trusted background orchestration uses
Chrome's documented trivial extension-API keepalive pattern every 20 seconds.
Always stop it on success, error, timeout, or cancellation. Keep this browser
concern outside `src/lib/ai`. Unexpected worker termination yields a recoverable
client error, not an indefinitely pending state; the UI enforces a 65-second
response deadline and offers explicit Retry. The in-memory request registry
is disposable and does not promise exactly-once billing across a worker crash.

Test split SSE frames/UTF-8 chunks, delayed headers, stalled bodies, absent
terminal events, caller cancellation, and cleanup. Human smoke must include
a generation longer than 30 seconds with service-worker DevTools closed.

## One assessment per submission

Practice save and code analysis are independent operations. Saving uses the
deterministic/current explicit rating immediately and never waits for AI.
Remove the provider call from `use-overlay-review-actions`.

The one report controller builds an immutable input from the matching problem
content and terminal submission. Analyze accepted and failed captured code;
failed diagnostics help explain mistakes. Manual logging without submitted code
saves normally and shows analysis unavailable without calling the provider.

Input includes problem slug/title/difficulty/topics, statement, examples,
constraints, follow-up requirements, submitted code and language,
source/completeness, result status,
actual runtime/memory/test counts, and available failure diagnostics. Prefer full
submission API code. Keep the submit-time snapshot on DOM fallback. Never replace
submitted code with the currently edited code. Treat rendered-only Monaco
capture as unverified completeness until a complete source is available.

Add follow-up extraction to the existing content reader and its capture/runtime
contract and fingerprint. The current reader splits the statement and
constraints before `Follow-up`; forwarding those fields alone loses explicit
complexity targets. Preserve follow-up requirements without including hints or
editorial solutions in the grading input.

Wait for matching content capture rather than sending an empty statement.
Bound readiness waiting at 10 seconds, then expose a retryable missing-context
state. A later content update can satisfy readiness before any request has been
sent. After a request starts, freeze its input.

Readiness requires the same active problem, a non-empty statement, and a complete
captured description that establishes whether constraints/follow-ups are present
or absent. Track unavailable capture separately from a section genuinely absent
in the source. An empty `ok: true` fallback object is not ready. Examples may
legitimately be empty. Missing essential context remains insufficient evidence.

Retry first reacquires full code for the same immutable submission ID through
the existing submission-details API and refreshes matching problem content.
DOM fallback currently ends polling; do not assume API code will arrive later.
If no trustworthy submission ID or complete matching submit-time snapshot is
available, stay insufficient and explain that a fresh submission is needed.
Never use a retry to grade the current editor in place of submitted code.

Use a request key combining problem identity, submission ID or stable result
identity, submitted code/language, content fingerprint, provider/model, and
prompt version. Do not use timer ticks as identity. The background coalesces
concurrent identical requests from the same trusted tab. Retry is explicit and
allowed after failure; failures do not become permanently handled.

On restart, navigation, new submission, or disabling assessment, discard stale
responses. A purpose-specific cancellation message aborts only the originating
sender/tab's operation using its request ID; it never cancels other tabs' work.
The local React AbortController alone does not cancel a runtime provider call.

Expose the captured submission-started identity to the report controller. Clear
and cancel the old report as soon as a fresh submit begins, including judging.
Record consumed terminal-result identities for the local session: restart must
not let retained old capture state trigger analysis again when content/settings
refresh. Wait for a fresh submission, or an explicit Retry of a failed report.

Report lifecycle: idle, waiting for context, analyzing, ready, insufficient
evidence, unavailable, error. Collapse/dock preserves the current report;
restart/navigation resets it. No AI response writes practice state or overrides
an explicit rating.

## Analysis contract and rubric

Use one versioned Zod contract for generation, domain data, and runtime output.
Application-owned submission identity, provider metadata, and prompt version
are attached by the service, not invented by the model.

| Category            | Required details                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approach            | Integer score 1–5, current approach, suggested approach, short explanation with code evidence, and actionable suggestions. Consider correctness, invariants, and edge cases.              |
| Efficiency          | Integer score 1–5, current and suggested time/space complexity, variables and assumptions, tradeoffs, and suggestions. Score against the problem's constraints and feasible alternatives. |
| Code Style / Syntax | Integer score 1–5, concise readability/structure/language-idiom assessment, concrete syntax or robustness observations, and suggestions.                                                  |

Shared score anchors: 1 = major issues, 2 = needs work, 3 = good, 4 = strong,
5 = excellent. Each category also has low/medium/high confidence. Unknown
complexity remains unknown. An unavailable category has a null score with a
specific explanation; missing evidence never becomes a zero or a made-up grade.
Empty suggestions are valid when no meaningful improvement is needed.

Use these category-specific anchors in the prompt and fixture review:

| Score | Approach                                                                        | Efficiency                                                                          | Code Style / Syntax                                                        |
| ----- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1     | Fundamental strategy or invariant fails the task.                               | Algorithm or resource use cannot meet supplied limits.                              | Syntax/structure severely obstructs understanding or execution.            |
| 2     | Major correctness or edge-case gaps require substantial changes.                | Significant avoidable work/storage, with a clear better feasible approach.          | Repeated unclear structure, unsafe language usage, or confusing naming.    |
| 3     | Sound core strategy with a meaningful robustness or modeling improvement.       | Meets constraints, but has a meaningful asymptotic or resource tradeoff to improve. | Readable working code with several concrete idiom/structure improvements.  |
| 4     | Correct, well-matched strategy with only a small relevant improvement.          | Near-optimal for the constraints, with a small justified efficiency improvement.    | Clear, idiomatic structure with only a small meaningful refinement.        |
| 5     | Correct, appropriate strategy and well-founded handling of relevant edge cases. | Optimal or justified equivalent tradeoff for the stated task and constraints.       | Clear, robust, idiomatic code requiring no meaningful style/syntax change. |

For example, a correct lower-bound binary search that satisfies an explicit
logarithmic follow-up can earn Efficiency 5/5 regardless of a measured 0 ms.
Quadratic Two Sum can receive lower Efficiency when constraints make a linear
hash-map approach meaningfully better, while still receiving strong Style.
Descriptive names and clean formatting cannot raise an incorrect Approach score;
an accepted solution does not automatically earn three perfect scores.

The final `suggestedSolution` has submitted language, code, short explanation,
key improvements, stated time/space complexity, and assumptions/tradeoffs.
Preserve LeetCode's callable signature and supported language syntax. When the
submitted solution is already appropriate, retain its approach and make only
justified improvements. Prefer a clear optimal approach for the given
constraints; describe tradeoffs instead of claiming one universal best solution.

Use a single bounded generation call for the three categories and solution.
Initially allow 32,000 characters of submitted code, 24,000 characters of
problem context, and 2,000 characters per failure diagnostic; cap generated code
at 32,000 characters and structured output at 8,192 tokens. Reject
oversized essential input as insufficient evidence before the provider call;
do not silently truncate code or constraints and grade the fragment.

For missing/unverified code or essential problem context, withhold quality scores
and suggested solution and explain what is missing. Suggested code is labeled
as AI-generated and untested. Copying is explicit; this feature does not execute
or automatically submit it. Render model text/code as text rather than HTML.

Prompt instructions require concise evidence-backed explanations, separate
measured execution results from inferred complexity, and treat embedded problem
text, comments, and diagnostics as data. Do not invent runtime percentiles,
benchmarks, test execution, or prior solving behavior.

## Presentation

Replace the expanded overlay's AI recommendation section with an AI analysis
section using CogniPace's current tokens. The summary shows three labeled scores
such as `Approach 4/5`, `Efficiency 3/5`, and `Code Style 5/5`.

Expandable category details show the current/suggested approach, time/space
complexity, code evidence, and suggestions. A final Suggested solution section
offers a scrollable code block, Copy, and the explanation of changes. Keep the
overlay compact initially, with existing review controls available while AI
loads. Provide keyboard-accessible disclosure controls and copy feedback.

Show useful connection/configuration errors and explicit Retry where recovery is
possible. Unavailable or insufficient-evidence states never render fake scores.
Retain actual LeetCode runtime/memory values if shown, with their units. The
screenshots' percentile distributions are outside current captured evidence and
are not included in this design.

Reports remain session-local in this first repair. No report table, migration,
backup format, sync expansion, or analytics scoring is introduced. Persistent
assessment history is a separate future design if requested.

## Phase boundaries

Phase-sized implementation plans will be written after this design is approved.

### Phase 1: restore and isolate AI

Extract the provider integration; repair wire schemas, operation deadlines,
stream assembly, bounded worker lifetime, response/error handling, and Settings
configuration bugs. Align runtime metadata
and validate responses. Separate provider configuration from the assessment
enabled gate. Verify provider-shaped envelopes through real service/runtime
contracts, not just mocked service returns.

Done when the extracted module has no feature dependencies; all three provider
adapters accept supported schemas; deadline/cancellation tests cover stalled
bodies; configuration test reports useful results; and existing assessment calls
can consume validated output without leaking credentials.

### Phase 2: replace rating advice with code analysis

Connect captured content and matching complete code, remove duplicate/save-time
AI calls, implement one retryable analysis controller and trusted cancellation,
add the versioned rubric/solution schema and prompt, and render the new report.
Update product, architecture, testing, and visual authority docs for the shipped
behavior.

Done when one terminal submission produces one consistent report; review saving
is immediate; explicit/locked ratings are preserved; stale results cannot cross
problems/submissions; missing evidence stays honest; and the three scores plus
language-matching suggested solution are visible and copyable.

## Validation and proof

Current investigation commands:

- `rtk git fetch origin`: passed after obtaining sandbox access to Git's shared
  worktree metadata. Initial sandbox attempt failed with `Operation not permitted`.
- `rtk npm ci`: passed using Node 24.20.0 / npm 11.19.0.
- `rtk npm run prepare:wxt`: passed.
- `rtk npm run test -- src/features/genai src/features/assessment/domain src/features/leetcode-review-assistant src/features/overlay-session/hooks/use-leetcode-assessment-recommendation.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/lib/leetcode/submission src/lib/leetcode/watcher src/lib/leetcode/editor`: passed, 32 files / 345 tests. Initial audit attempts lacked Vitest; the first installed run lacked generated `.wxt/tsconfig.json`. Both setup failures were resolved before the passing run.

Initial subagent validation attempts, before dependencies were installed:

- `rtk npm run test -- src/features/genai/server/providers src/features/genai/server/json-schema.test.ts src/features/genai/server/genai-service.test.ts src/features/genai/server/genai-settings-service.test.ts`: failed before execution, `vitest: command not found`.
- `rtk npm test -- src/features/assessment/domain src/features/leetcode-review-assistant src/features/overlay-session/hooks/use-leetcode-assessment-recommendation.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/lib/leetcode/submission --run`: failed before execution, `vitest: command not found`.

Draft formatting:

- `rtk npx prettier --write --ignore-path /dev/null docs/superpowers/specs/2026-10-03-ai-repair-and-code-analysis-design.md`.
- `rtk npx prettier --check --ignore-path /dev/null docs/superpowers/specs/2026-10-03-ai-repair-and-code-analysis-design.md`.

These explicit checks bypass the normal ignore entry for historical spec files.

Native timeout reproduction, run without editing product code:

```sh
rtk proxy node --input-type=module -e 'import { fetchWithTimeout } from "./src/features/genai/server/providers/shared.ts"; globalThis.fetch = async () => new Response(new ReadableStream({ start() {} })); const response = await fetchWithTimeout("https://example.test", {}, { timeoutMs: 20 }); const outcome = await Promise.race([response.json().then(() => "body completed", () => "body rejected"), new Promise(resolve => setTimeout(() => resolve("body still pending after 100 ms despite 20 ms timeout"), 100))]); console.log(outcome);'
```

Output: `body still pending after 100 ms despite 20 ms timeout`.

Implementation validation must include focused transport/schema/runtime tests,
one report call per submission, content/code identity, missing/oversized input,
failed submissions, retry after configuration changes, stale navigation, manual
rating preservation, and accessible report/copy behavior. Run required
`rtk npm run lint`, `rtk npm run check`, and `rtk npm run build` per phase, plus
Prettier on touched code/docs. No new database schema is planned.

Human installed-extension smoke remains required before PR review/merge:
configured provider connection; accepted code with full context; failed code
with diagnostics; long/scrolled code; provider auth/rate-limit/timeout recovery;
navigation during generation; manual rating while loading; immediate save during
provider failure; restart/collapse/dock; copy suggested code; disabled or missing
configuration; screenshot or recording proof. Each provider claimed as working
needs its own live check with an available BYOK account.

Commands intentionally not run for this draft: `rtk npm run lint`,
`rtk npm run check`, `rtk npm run build`, `rtk npm run db:generate`, and
`rtk npm run db:check`. No product or schema code has changed. Live provider calls
and human browser smoke are unperformed; the user's exact live failure remains
unverified. Formatting results for this draft are recorded in the handoff.

## Release and recovery

Phase 1 is a bug fix; Phase 2 is a feature. Use Conventional Commit titles and
the repository PR template, with exact automated checks and pending/completed
human proof. Preserve local secrets, saved settings, review history, and track
progress. With reports kept session-local, rollback requires no report-data
migration; turning assessment off remains the immediate recovery control.
