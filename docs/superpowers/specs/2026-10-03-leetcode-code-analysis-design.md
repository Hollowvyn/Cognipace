# LeetCode Code Analysis — Phase 2 Design

Date: 2026-10-03.

Status: the user selected Option A and agreed the section format and rubric
corrections. This written specification is ready for user review. Implementation
and provider evaluation have not started.

This replaces the phase-two proposal in
[the earlier AI repair draft](2026-10-03-ai-repair-and-code-analysis-design.md).
The provider connection repair and Vercel AI SDK integration shipped in PR #188.
This phase reuses that integration.

## Outcome

After a detected LeetCode submission completes, show a compact AI analysis in
the expanded review overlay: Approach /5, Efficiency /5, and Code Style /5,
with concise details and a collapsed suggested implementation. Each report
belongs to one matching submission. Review saving stays independent of AI.

Reports remain session-local. This phase introduces no report database,
analytics scoring, sync format, backend, account, gateway, Chrome permission,
chat system, agent framework, or additional provider SDK.

## Selected presentation

Use Option A: a compact summary with three labeled scores, three independent
category disclosures, and a final Suggested implementation disclosure. Reuse
CogniPace's Terra Compact tokens and existing overlay controls. The prototype
opened all categories to review their contents; production starts them closed.
Keyboard users can open each disclosure and copy suggested code.

The summary contains one factual, encouraging sentence. Mention a first attempt
only when the captured session proves it. Do not invent solving history,
percentiles, benchmark rankings, or successful execution of generated code.

| Section       | Detail rows                                           |
| ------------- | ----------------------------------------------------- |
| Approach /5   | Current, Suggested, Key idea, Consider                |
| Efficiency /5 | Current complexity, Suggested complexity, Suggestions |
| Code Style /5 | Readability, Structure, Suggestions                   |

Approach's Current and Suggested rows identify algorithms and relevant topics.
Key idea explains the strategy. Consider contains a relevant edge case,
correctness observation, or follow-up thought; omit it when none is useful.

Efficiency shows time and auxiliary space together, with variables and necessary
assumptions. Explain meaningful tradeoffs in Suggestions. Highlight only the
resource that improves; greater space use must not appear as a space improvement.

Code Style uses qualitative Readability and Structure labels: Excellent, Good,
Needs improvement, or Unavailable. Its single numeric score also considers
language idioms and syntax. Suggestions explain meaningful changes; do not
manufacture criticism to populate a row. An excellent submission can simply say
no meaningful change is needed.

There is no standalone Evidence or Edge case notes block. Observed status,
tests, runtime, memory, language, and diagnostics remain analysis inputs; the
existing submission UI can still display those facts.

Suggested implementation starts collapsed. Opening it reveals complete code in
the submitted language, the required callable signature, Copy with feedback,
brief changes, complexity, and relevant assumptions. Label generated code as
AI-generated and untested. Copy is explicit; do not replace the editor, execute
the code, or submit it automatically. If the original strategy is appropriate,
keep it and make only justified changes. Do not claim universal optimality.

## Scoring and consistency

Use integers 1–5 independently for each category: 1 major issues, 2 needs work,
3 good with meaningful improvements, 4 strong with minor improvements, and
5 excellent for the supplied requirements. Do not average them into an overall
grade or translate them into a recall rating.

Approach measures correctness, strategy suitability, the invariant, and relevant
edge cases. Acceptance alone does not justify 5/5. If a materially preferred
replacement strategy is necessary under the supplied constraints, Approach must
not simultaneously receive 5/5. Equivalent alternatives or minor polish can
coexist with 5/5. Brute force is not automatically capped: input bounds and
explicit memory requirements can make it appropriate.

Efficiency evaluates time and auxiliary space separately before assessing their
overall fit. For the illustrative Two Sum case targeting expected linear time
with extra memory allowed, pair enumeration has O(n²) time and O(1) auxiliary
space; a hash map has expected O(n) time and O(n) auxiliary space. The latter
improves expected time and increases memory. The illustrative Approach score is
3/5. A strict constant-space requirement changes which suggestion is suitable.
Preserve expected, worst-case, and amortized qualifiers where relevant. Measured
milliseconds cannot establish asymptotic complexity.

For failed submissions, distinguish wrong answer, compilation error, runtime
error, and timeout. A syntax error is not automatically an incorrect algorithm.
An incorrect early return cannot earn excellent Efficiency for finishing fast.
Unavailable dimensions use a null score with an explanation, not a fabricated
number. Accepted status reflects reported tests rather than a proof of all cases.

Use one versioned structured response (`leetcode-code-analysis-v1`) containing
the summary, category scores and explanations, the category rows, suggested
implementation, and its language and complexity. Include an explicit strategy
assessment (appropriate, minor refinement, material improvement, incorrect,
or unavailable) and separate time/space comparison outcomes (better, equivalent,
worse, or unknown). These values support consistency checks and correct styling.
They are not extra visible report sections.

Zod validates field shapes, ranges, string/array limits, and runtime envelopes.
After SDK validation, reject contradictions between encoded score, availability,
and strategy-assessment fields, such as Approach 5/5 with material-improvement
strategy assessment. Do not try to prove arbitrary complexity expressions by
comparing their strings or infer constraint compliance from prose. Prompt rules
and curated evaluations
cover judgments that cannot be checked mechanically. Schema validation does not
prove correctness, optimality, compilation, or semantic equivalence.

## Language-specific style

Evaluate the submitted language and the available language version. Suggestions
must preserve types, overflow behavior, nullability, required signatures, and
the problem's contract. Do not reward shorter code that introduces avoidable
allocations or makes the control flow harder to follow.

For Kotlin, local type inference can remove a redundant annotation:

```kotlin
val size: Int = nums.size
// Optional simplification retaining Int:
val size = nums.size

var total: Long = 0
// Preserve Long, rather than inferring Int from an unqualified zero:
var total = 0L
```

Keep required parameter types, intentional declared types, useful nullability,
public API contracts, and annotations supplying generic inference such as
`val values: MutableList<Long> = mutableListOf()`. Explicit local annotations
are valid Kotlin, not automatic defects. Consider val/var use, null safety,
collection idioms, naming, structure, and temporary allocations only where the
actual code supports the advice.

These examples were checked using Context7 and official
[Kotlin type-inference documentation](https://kotlinlang.org/docs/basic-syntax.html#variables),
[numeric type documentation](https://kotlinlang.org/docs/numbers.html), and
[coding conventions](https://kotlinlang.org/docs/coding-conventions.html).

## Complete input and attempt identity

Pass the matching full submitted code, language, problem statement, examples,
constraints, follow-up requirements, topics, and terminal diagnostics. Capture
provenance must distinguish a verified complete source, a visible editor fragment,
a missing source, and verified absence of optional problem sections.

Prefer submission-details code for a pinned submission ID. Do not repair an old
submission using the current editor text, or prefer a partial attempt snapshot
over complete matching details. An immutable attempt token identifies a local
submit event; attach its matching LeetCode submission ID once discovered and
retain that ID on Retry. Separate request IDs identify generation attempts.

Preserve follow-ups: the current content parser stops there, losing requirements
that can determine the preferred approach. An `ok: true` fallback with empty
content is not sufficient context. Known absence of constraints/follow-ups must
be distinguishable from a failed read. Core code, language, and task context
must be complete before sending a scored analysis request.

Prepare context through one bounded capture refresh, capped at 15 seconds.
Retry refreshes missing problem content and full submission details for the
pinned attempt/ID, bypassing failed or incomplete cache entries. It must not
switch to the latest submission. Retain failure kind and diagnostic text.

Initial input limits: 32,000 characters of code, 24,000 characters of combined
problem context, and 2,000 characters per diagnostic field. Reject oversized
essential inputs before generation; do not silently truncate and grade a
fragment. Optional oversized diagnostics may be omitted with an explicit note
to the model. Missing essentials produce an unavailable state with a precise
reason, without scores or replacement code.

## Request flow and recovery

With AI assessment enabled, automatically request one report when a matching
terminal submission and sufficient context are ready. Show an idle instruction
under the AI assessment heading before a submission, then a loading state.
Keep review controls usable throughout. Failed submissions receive analysis
when their code and context are sufficient.

Use one provider generation for the entire report and suggested implementation.
Opening the suggested code makes no additional provider call. Reuse the existing
whole-operation deadline (30 seconds), disabled automatic retries, direct
provider adapters, controlled errors, and disabled telemetry. Set the analysis
output budget to 8,192 tokens and the generated-code cap to 32,000 characters.
Truncated or invalid output is an error, not a partially trusted report.
The UI's total preparation/message deadline is 50 seconds, so interrupted
service-worker messaging cannot leave the panel loading indefinitely.

New submission, navigation, session restart/clear, disabled AI, changed provider
configuration, or Retry invalidates the earlier report immediately and collapses
its disclosures. A response applies only when its attempt identity, request ID,
problem identity, and configuration revision still match. Collapse/docking alone
does not start a second generation.

Add content-script-authorized `genai.analyzeLeetCodeSubmission` and
`genai.cancelLeetCodeAnalysis` runtime methods. Generation and cancellation use
the actual Chrome sender's tab/frame identity, never a claimed owner in the
payload. Keep one active analysis per tab/frame. Superseding work aborts its
background AbortController and passes the signal to the SDK library. Only that
owner can cancel its request; cleanup removes only the matching active operation.
Maps remain volatile and each operation is deadline-bounded. Local stale-result
guards remain necessary even after a cancellation message.

Configuration, authentication, quota, network, timeout, refusal, inconsistent
output, and missing-context states have controlled actionable messages. Show
Settings access for configuration errors and explicit Retry for recoverable
errors or missing capture. Retry reloads current trusted configuration and
creates a new request ID; no automatic retry loop or paid fallback-model call.

## Ownership and removal

| Owner                                          | Responsibility                                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/ai`                                   | Existing provider-neutral SDK generation, validation, controlled errors, deadline, and cancellation signal. No rubric or UI ownership. |
| `features/genai`                               | Existing provider configuration, enabled gate, trusted key loading, and connection status.                                             |
| `lib/leetcode` and `features/leetcode-capture` | Full matching submission details, meaningful problem content including follow-ups, provenance, and refreshable capture caches.         |
| `features/leetcode-review-assistant`           | Versioned analysis contract, rubric/prompt, semantic consistency checks, and background service.                                       |
| `features/overlay-session`                     | One retryable analysis controller, identity/readiness/stale handling, and Option A presentation.                                       |
| `src/extension`                                | Authorized runtime methods, validated request/response envelopes, and background operation cancellation ownership.                     |

Replace the old recommendation contract and service/prompt with analysis
contracts and functions. Remove the `genai.recommendLeetCodeAssessment` method,
its consumers, recommendation normalization, `recommendedRating`,
`shouldUpdateRating`, recall timing/history input, and unused public exports.
Do not retain forwarding aliases for the retired feature.

Remove the separate save-time AI request/override in
`use-overlay-review-actions.ts` and the AI rating-preselection reducer action.
Retain deterministic assessment, existing locks, manual rating choices, FSRS
scheduling, correctness, and track progress. This explicitly retires optional
AI recall-rating overrides. Saving never awaits AI and analysis never changes
the selected or persisted review rating.

Update product, architecture, testing, and visual authority docs when behavior
ships. Preserve the existing settings storage shape and provider connection UI;
revise the assessment toggle's description to describe automatic code analysis.
Provider keys stay in trusted background storage and out of analysis payloads,
reports, logs, exports, sync, TanStack Query cached data, and MutationCache
records. The existing authorized credential-save runtime transport and trusted
provider authentication still carry the key when required. Render model
text/code as text.
These read-only reports do not cause database writes or sync invalidation.

## Validation required for implementation

Use the runtime/GenAI and visible-overlay validation categories in
`docs/agent-governance.md`. Run focused capture, schema, service, runtime-policy,
handler, controller, and component tests before `rtk npm run lint`,
`rtk npm run check`, and `rtk npm run build`; run Prettier on touched files.

Protect one generation per submission, full code and follow-up capture, pinned
retry after incomplete caches, missing/oversized input, failed submission kinds,
sender-scoped cancellation, configuration changes, stale navigation, interrupted
worker messaging, immediate saving, preserved ratings, keyboard disclosures,
and Copy feedback. Mocked transport tests prove wiring rather than model quality.

Provider evaluation fixtures must include:

1. Brute-force Two Sum with a linear-time goal and extra memory allowed: explain
   the lower Approach score and time-space tradeoff.
2. Small bounded input requiring unchanged input and O(1) auxiliary space:
   recognize that a hash map violates the memory requirement.
3. Sorted Two Sum II using a hash map: consider two pointers and preserve the
   sorted assumption and required index convention.
4. Insert-before-lookup hash map returning the same index twice: identify the
   correctness defect and avoid praising its incorrect early exit.
5. Kotlin redundant initialized Int locals: appropriate inference advice while
   retaining required parameter types.
6. Kotlin Long accumulator and an empty generic collection: retain intended
   numeric and generic types.

For every evaluation, inspect agreement among the summary, scores, strategy,
time/space comparisons, and suggested implementation. Exercise executable
language checks before making compilation or test-success claims. Keep model
judgments qualified; no universal correctness guarantee is promised.

Before PR review or merge, the human engineer must run installed-extension
happy-path and edge-case smoke with screenshot or recording proof: accepted
and failed submissions; long/scrolled code; follow-up goals; memory tradeoffs;
Kotlin idioms; missing capture and Retry; provider errors; navigation during
generation; immediate review saving; restart/collapse/docking; disabled AI;
configuration changes; and copying the generated implementation. Live provider
claims require the relevant BYOK provider to be checked.

## Completion and recovery

Done when a matching submission produces one consistent report, the selected
Option A rows and scores are accessible, suggested code matches the language
and signature, Retry targets the same submission, incomplete inputs remain
honest, stale results cannot cross attempts, and saving/scheduling remain
independent. Human smoke and model evaluation are required proof, not inferred
from schema tests or prototype screenshots.

Rollback requires no report migration. Turning AI assessment off stops automatic
analysis while local review and provider connection testing remain available.
The implementation will use a Conventional Commit feature title and the current
PR template with exact checks and proof. Work remains in the primary workspace
on `codex/leetcode-code-analysis`; no new worktree is needed.

## Validation of this specification

This change is documentation only. The handoff records exact formatting
commands, source-review scope, and skipped implementation validation. The
prototype is illustrative and is not installed-extension smoke or a provider
evaluation result. No live provider call or Kotlin compilation was run.
