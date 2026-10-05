# Optional OpenRouter Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional OpenRouter connection using the user's own API key, an editable `openrouter/free` suggestion, and an explicit **Use free models** action.

**Architecture:** Extend the existing AI provider, trusted GenAI secret, and Settings connection paths. Construct the dedicated OpenRouter adapter only in `src/lib/ai`; preserve strict report validation, requested-model identity, background authorization, deadlines, and local data ownership. Reuse current controllers and runtime services rather than introducing another connection system.

**Tech Stack:** TypeScript, React, WXT/Chrome MV3, AI SDK `7.0.127`, `@openrouter/ai-sdk-provider@3.1.0`, Zod `4.4.3`, Vitest, React Testing Library, existing trusted `chrome.storage.local` secrets and Settings repository; Node `24.20.0`, npm `11.19.0`.

---

## Approval, Scope, And Execution Order

The user approved the [design](../specs/2026-10-04-openrouter-provider-design.md), including only the new host permission `https://openrouter.ai/*`, and requested this implementation plan. Written October 5, 2026, this file is an execution artifact. Implementation and required automated validation are complete; checked steps reflect execution, and the dated record below lists outcomes. Live evaluation and human installed-extension proof remain pending.

Work in the existing clean branch `codex/openrouter-provider`. The design commit is `66212f37`, based on `origin/main` at `d829a705`. Inspect the current worktree before execution and preserve unrelated changes. This is one coherent provider feature; complete all six tasks before treating it as releasable. Task 1 temporarily expands exhaustive provider types before Task 2 supplies their adapter case and Task 3 extends the strict analysis response. Commit these three tasks together after their focused tests and typecheck; later tasks have independent commit checkpoints.

Global defaults stay `{ enabled: false, provider: 'openai', model: '' }`. The OpenRouter suggestion applies on provider selection only; saved custom model IDs load exactly. Keep one active connection, saved keys per provider, no model history, no paid fallback IDs, no automatic retries, no custom transport URL, and no database/schema migration. Existing explicit assessment enablement, review saving, FSRS scheduling, sync, and backup semantics continue through their current owners.

### File Ownership

| Owner               | Files and responsibility                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared AI           | `src/lib/ai/types.ts`, `src/lib/ai/generate-json.ts`, `src/lib/ai/generate-json.test.ts`: IDs/errors, adapter, structured wire format, safe normalization, requested/resolved metadata, operation bounds                                               |
| Trusted keys        | `src/platform/secrets/secret-contracts.ts`, `src/features/genai/domain/genai-secrets-types.ts`, `src/features/genai/server/genai-secret-storage.ts`: fourth local secret ID, strict presence, provider mapping; existing storage/service remains owner |
| Settings            | `src/features/settings/hooks/use-ai-connection-controller.ts`, `src/features/settings/components/sections/ai-assessment-section.tsx`: provider maps, fourth option, draft-only preset, disclosure and key links                                        |
| Analysis contracts  | `src/features/leetcode-review-assistant/api/code-analysis-contracts.ts`, `src/features/overlay-session/hooks/use-leetcode-code-analysis.ts`: shared provider enum, optional bounded metadata, billing Settings action                                  |
| Evaluation          | `src/features/genai/testing/evaluation-provider-config.ts`: shared provider enum; existing evaluation already writes full metadata                                                                                                                     |
| Permission boundary | `wxt.config.ts`, `src/testing/architecture-boundaries.test.ts`: one approved domain, dedicated SDK import confinement                                                                                                                                  |
| Current authority   | `docs/product.md`, `docs/architecture.md`, `design.md`, `docs/testing.md`, `docs/chrome-web-store.md`, `PRIVACY.md`: implemented behavior, routing disclosure, validation and reviewer guidance                                                        |
| Execution proof     | This plan, approved spec, `docs/superpowers/README.md`: actual command outcomes, dates, evidence links, and outstanding human checks                                                                                                                   |

No new production file or general architecture layer is required. The completion table links the implementation owners and summarizes regression coverage.

## Completed Implementation

Tasks 1–5 passed separate SPEC and QUALITY reviews. The full execution recipe
remains in Git at `73a43ca`; current source/tests own implementation details.
Current authority docs own product behavior. The validation record below keeps
actual command outcomes, failure recovery, and evidence.

| Task | Completed implementation                                                                                                                                                         | Regression coverage                                                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [Shared contracts](../../../src/lib/ai/types.ts), evaluation, provider maps, and isolated trusted OpenRouter key/presence                                                        | Contract, storage/isolation, cache privacy, Settings persistence, and same-key revision tests                                                                        |
| 2    | [Native adapter](../../../src/lib/ai/generate-json.ts): fixed host/key, strict output, safe machine errors/billing, bounded served-model metadata                                | [Native wire and metadata](../../../src/lib/ai/generate-json.test.ts), cancellation, whole-operation deadlines, late-settlement cleanup, direct-provider regressions |
| 3    | [Analysis metadata](../../../src/features/leetcode-review-assistant/api/code-analysis-contracts.ts), billing recovery, native fixture, one approved host and SDK import boundary | Connection while disabled, full-report schema/budgets, stale key/model/provider/removal/disable rejection, runtime redaction and timer cleanup                       |
| 4    | [Settings UI](../../../src/features/settings/components/sections/ai-assessment-section.tsx): optional provider, editable suggestion, draft-only preset, key and routing links    | Controller, component, and screen integration: custom save/remount, Discard, unfinished preferences, Enter ordering, operation gate                                  |
| 5    | Current product, architecture, design, testing, privacy, and Store docs aligned with implementation                                                                              | Explicit formatting, independent documentation reviews, honest pending live/generated-code/human proof                                                               |

## Task 6: Automated Gates, Live Report Evidence, And Human Extension Proof

**Files:** This plan's implementation evidence record; existing `src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts`; current manual flows in `docs/testing.md`. No new smoke framework or generated test credentials.

- [x] Check all feature source/package formatting after the task-specific writes:

```sh
openrouter_feature_files=(
  package.json package-lock.json
  src/lib/ai/types.ts src/lib/ai/generate-json.ts src/lib/ai/generate-json.test.ts src/lib/ai/operation.test.ts
  src/platform/secrets/secret-contracts.ts src/platform/secrets/secret-store.test.ts
  src/features/genai/domain/genai-types.test.ts src/features/genai/domain/genai-secrets-types.ts src/features/genai/domain/genai-secrets-types.test.ts
  src/features/genai/server/genai-secret-storage.ts src/features/genai/server/genai-secret-storage.test.ts src/features/genai/server/genai-settings-service.test.ts src/features/genai/server/genai-connection-service.test.ts
  src/features/genai/api/genai-settings-contracts.test.ts src/features/genai/api/genai-settings-hooks.test.tsx
  src/features/genai/testing/evaluation-provider-config.ts src/features/genai/testing/evaluation-provider-config.test.ts src/features/genai/testing/genai-fixtures.ts
  src/features/settings/domain/settings.test.ts src/features/settings/data/settings-repository.test.ts
  src/features/settings/hooks/use-ai-connection-controller.ts src/features/settings/hooks/use-ai-connection-controller.test.tsx
  src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/settings/components/settings-screen.test.tsx
  src/extension/background/register-handlers.test.ts
  src/features/leetcode-review-assistant/api/code-analysis-contracts.ts src/features/leetcode-review-assistant/api/code-analysis-contracts.test.ts
  src/features/leetcode-review-assistant/server/code-analysis-service.test.ts src/features/leetcode-review-assistant/server/analysis-runtime-service.test.ts
  src/features/overlay-session/hooks/use-leetcode-code-analysis.ts src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx
  src/testing/architecture-boundaries.test.ts wxt.config.ts
  src/features/settings/components/sections/ai-assessment-section.tsx
)
rtk npx prettier --check "${openrouter_feature_files[@]}"
```

Expected: exit 0. Fix listed-file formatting before full gates; rerun focused tests if a functional edit is needed.

- [x] Run required gates in this order after focused task checks have passed:

```sh
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run zip
rtk npm run store:check
rtk git diff --check
```

Expected: exit 0 for each command. `check` includes normal database consistency, generated WXT preparation/typecheck, lint, and unit tests. Opt-in live cases skip with the evaluation switch unset; record those skips explicitly. Build/zip must succeed with the native adapter bundled locally, no remotely loaded executable code, and the exact four approved AI hosts. Store validation uses the production manifest. There is no schema migration to generate.

- [ ] With a human's privately configured test-only environment already present, run the existing six-case live evaluation once for OpenRouter. Set no credentials in shell arguments or committed files. The private environment must contain `COGNIPACE_AI_EVAL=1`, provider `openrouter`, model `openrouter/free`, and the user's evaluation key. Run:

```sh
rtk npm run test -- src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts --maxWorkers=1
```

Expected when service/account/model supports the report: six current full reports in `/private/tmp/cognipace-ai-evaluation/<fixture.id>.json`, preserving requested and available resolved model. If a route is unavailable or limited, record exact controlled failure and date; do not switch to a paid model or call old artifacts current. Ordinary implementation work can finish with this explicitly pending when private credentials are unavailable; the feature's full proof remains pending.

- [ ] Inspect each current evaluation artifact against the six existing human criteria in `docs/testing.md#code-analysis-provider-evaluation`. Record date, requested and resolved model, validity, observed duration, useful approach/efficiency/style feedback, and whether generated suggestions satisfy the authored cases. Schema success alone does not prove quality, compilation, or optimality. Execute authored generated-JavaScript cases and type-check generated Kotlin snippets using the existing documented method only after reading the generated code. Keep credentials and raw provider failures out of reports.

- [ ] A human engineer loads the built unpacked Chrome extension and performs the following exact sequence, with screenshots or recording of happy path and edge cases attached before PR review or merge. Add this smoke section to `docs/testing.md`:

```md
#### OpenRouter connection and analysis smoke

1. Select OpenRouter with AI assessment off. Confirm editable `openrouter/free`,
   masked empty key input, free-routing/usage copy, and key/data-policy links.
   Enter your own key, Save & test, and confirm assessment remains off.
2. Enter an accessible custom text-model ID and Save & test. Reopen Settings:
   confirm the exact custom model, selected OpenRouter, saved-key presence,
   empty masked input, and untested status. Test the saved connection.
3. Click Use free models. Confirm draft `openrouter/free`, cleared verification,
   and no automatic network request or save. Discard and confirm the saved
   custom model returns. Choose the preset again and explicitly Save & test.
4. Leave unfinished connection model/key edits while saving an unrelated
   preference. Confirm only the preference persisted and draft edits survived.
   During preference save, key save, and connection test, confirm the preset and
   conflicting controls are disabled. Verify keyboard/Enter submission order.
5. Enable assessment, refresh a supported LeetCode problem page, and complete an
   authored submission. Confirm a full Approach/Efficiency/Code Style report;
   record requested/served model when available and response time. Confirm report
   arrival does not save a review. Save the manual review independently.
6. Try invalid key and invalid model. Confirm safe actionable errors. Exercise
   unavailable free capacity or quota when available; distinguish 402 balance/key
   limit guidance from 429 quota guidance. Account privacy/capability restrictions
   may make a model unavailable; do not loosen privacy settings automatically.
   Confirm no automatic retries or app-configured paid fallback requests.
7. Remove the OpenRouter key. Confirm unavailable analysis and that other saved
   provider keys remain. Assessment can be disabled after removal. Reset Defaults
   keeps saved keys, disables assessment, and restores the blank default model.
8. Interrupt an in-flight test/analysis, navigate, change model/provider, replace
   the key (including identical bytes), and remove the key. Confirm late replies
   cannot restore stale connected/report state and timers clean up. Run the
   existing fresh-identity Retry, reload, refresh-capture, cancellation, and
   stale-worker flows from the code-analysis smoke instructions.
9. Verify popup/dashboard/overlay configuration availability updates across
   surfaces and direct-provider connection behavior still works. Inspect a backup
   and runtime status for presence only, with no OpenRouter key or raw provider
   response. Attach screenshots/recording with date, build, and observed outcomes.
```

Do not intentionally spend money or exhaust an account to fabricate a 402/429 case. Automated native fixtures cover those codes; label unavailable real-service cases unrun. Human installed-extension proof remains required, never N/A for this behavior change. Reuse the existing generated-code and submission smoke inputs rather than inventing a report-quality benchmark.

- [x] Review the complete diff against the approved spec and run required code review before any PR. Keep review saving, schedules, local data, permissions, and import ownership intact. Record exact passed/failed/skipped commands and evidence paths. Do not create a PR, merge, publish, alter release version, or mark full feature acceptance complete until the requested action and its required human proof are present.

## Acceptance And Recovery

The implementation is reviewable when four-provider contracts, native strict wire, trusted key lifecycle, Settings free/custom behavior, safe errors, routed metadata, host/import assertions, and required automated gates pass. Full feature acceptance additionally requires current live full-report evidence and human installed-extension happy/edge proof. Pending credentials or human proof must remain visibly pending; neither mock tests nor a tiny connection success substitutes for them.

Recovery uses existing assessment disablement or another saved provider. If reverting is required, use a normal source/permission revert and preserve unrelated stored data and provider keys. No automatic data or secret deletion is part of recovery.

## Spec Coverage Self-Review

| Approved requirement                                                                                | Execution coverage                                                                                   |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Optional fourth provider, own key, same global defaults                                             | Task 1 IDs/maps/settings and Task 4 UI/controller tests                                              |
| Suggested free route, custom persistence, preset/no network, discard, busy gate, independent enable | Task 4 controller/section/screen tests and Task 6 human steps 1–4/7                                  |
| Trusted `genai:openrouter`, strict presence, key isolation, caches/DB/backup redaction              | Task 1 lifecycle/contracts/cache/persistence tests, Task 3 runtime redaction, Task 6 human steps 7/9 |
| Dedicated SDK, fixed host, strict schema/required parameters, no fallback/retry                     | Task 2 native request assertions/adapter and Task 3 host/import checks                               |
| Whole deadlines, cancellation, output budgets, local report consistency                             | Task 2 bounded native/operation tests and Task 3 connection/report/background tests                  |
| Requested/resolved identity, bounded optional metadata, evaluations preserved                       | Tasks 1–3 definitions/native/strict response/stale tests and Task 6 current artifacts                |
| HTTP/embedded errors, known machine tags, billing versus quota, no raw text diagnosis               | Task 2 native error/redaction cases and Task 3 billing recovery/contracts                            |
| Exact permission approval and routing/privacy/Store explanation                                     | Tasks 3/5, with unchanged sender authorization and account privacy behavior                          |
| Current docs, focused/full gates, live quality, human proof, recovery                               | Tasks 5/6 and acceptance/recovery section                                                            |

Self-review checks the entire approved spec, code identifiers/imports, and command/file existence. It does not claim snippets have run as application code during this docs-only planning turn.

## Plan-Writing Validation Record

Only this plan, the spec status, and their planning-index entries change in the plan-writing commit. Source implementation, dependencies, provider evaluation, and human extension proof remain unperformed.

Published dependency research on October 4, 2026:

```sh
rtk npm view @openrouter/ai-sdk-provider version peerDependencies engines --json
```

The approved read-only registry query returned published version `3.1.0`, peers `ai: ^7.0.0` and `zod: ^3.25.76 || ^4.1.8`, and Node `>=22`. An earlier sandboxed subagent registry lookup failed with `ENOTFOUND`; the approved root query resolved it. Current provider syntax/error envelope details were checked with Context7 and official adapter source. No key or inference call was used.

Planning formatting uses the existing primary checkout's Prettier 3.8.3 because this worktree has no `node_modules` yet. Exact plan-writing verification commands:

```sh
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --write --ignore-path /dev/null docs/superpowers/plans/2026-10-05-openrouter-provider.md docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/README.md
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --check --ignore-path /dev/null docs/superpowers/plans/2026-10-05-openrouter-provider.md docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/README.md
rtk git diff --check
rtk git diff --cached --check
```

All four listed plan-writing commands passed with exit 0. Root self-review covered every approved spec section, checked the referenced repository files and type/method names, found no missing paths or placeholders, and confirmed all implementation steps remain unchecked. Future unchecked commands elsewhere in this plan are execution instructions, not passed checks.

Skipped during docs-only planning: all focused application tests; `rtk npm ci`; `rtk npm install --save-exact @openrouter/ai-sdk-provider@3.1.0`; `rtk npm run typecheck`; `rtk npm run lint`; `rtk npm run check`; `rtk npm run build`; `rtk npm run zip`; `rtk npm run store:check`; live six-case evaluation; generated-suggestion execution; and human installed-extension smoke. They require the implementation or private/human environment and remain future work. No database migration command is needed for the approved design.

## Implementation Validation Record — October 5, 2026

The user authorized implementation. Tasks 1–5 are implemented and passed separate
SPEC and QUALITY reviews; final integration review of `73a43ca..49bfad0` and the
six authority-doc edits found no actionable issue. Task 6 automated gates and
component proof passed. Full feature acceptance remains pending the three
unchecked live/generated-code/human proof steps above.

Implementation commits:

- `2b7fbad`: optional provider contracts, isolated trusted key, native adapter,
  bounded metadata/errors, runtime tests, and exactly one approved host.
- `ff8f591`: OpenRouter Settings, draft-only free preset, disclosures, and
  controller/component/integration regressions.
- `49bfad0`: typed native request assertions and persisted-settings assertions
  required by full lint; no production behavior change.

### Dependencies, RED/GREEN, And Recovery

`rtk npm ci` passed. The first focused run could not start without generated
`.wxt/tsconfig.json`; `rtk npm exec -- wxt prepare` passed and resolved that
prerequisite. `rtk npm install --save-exact @openrouter/ai-sdk-provider@3.1.0`
first failed with registry DNS access in the default sandbox, then passed with
approved network access. Only that pinned package was added; no AI SDK or Zod
upgrade was made. `rtk npm ls ai zod @openrouter/ai-sdk-provider` passed with
provider 3.1.0, AI SDK 7.0.127, and Zod 4.4.3.

| Task             | Expected RED and recovery                                                                                                                                | Final focused GREEN                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1                | 30 expected failures; one intermediate mock-reset scope failure was fixed by keeping new cases inside the existing scoped setup                          | 14 suites, 259 tests                    |
| 2                | 65 expected missing-transport failures; three additional whitespace-alias cases failed before the trim-only comparison fix                               | 2 suites, 130 tests                     |
| 3                | Three expected metadata/billing/host failures                                                                                                            | 6 suites, 169 tests                     |
| 4                | Four expected missing-control failures; controller coverage passed with existing production lifecycle                                                    | 3 suites, 47 tests                      |
| Integration lint | First `rtk npm run lint` found three new test typing errors; direct URL equality, string-body narrowing, and an unknown parsed settings value fixed them | Focused 2 suites, 29 tests; lint passed |

Exact focused validation commands run (repeat reviewer runs used the same
bounded suites):

```sh
rtk npm run test -- src/features/genai/domain/genai-types.test.ts src/features/genai/testing/evaluation-provider-config.test.ts src/platform/secrets/secret-store.test.ts src/features/genai/domain/genai-secrets-types.test.ts src/features/genai/server/genai-secret-storage.test.ts src/features/genai/server/genai-settings-service.test.ts src/features/genai/api/genai-settings-contracts.test.ts src/features/genai/api/genai-settings-hooks.test.tsx src/features/settings/domain/settings.test.ts src/features/settings/data/settings-repository.test.ts src/extension/background/register-handlers.test.ts src/features/settings/hooks/use-ai-connection-controller.test.tsx src/features/settings/components/settings-screen.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx
rtk proxy npx vitest run src/features/genai/domain/genai-secrets-types.test.ts src/features/genai/server/genai-secret-storage.test.ts src/features/genai/server/genai-settings-service.test.ts src/features/genai/api/genai-settings-hooks.test.tsx src/features/settings/data/settings-repository.test.ts src/platform/secrets/secret-store.test.ts
rtk npm run test -- src/lib/ai/generate-json.test.ts src/lib/ai/operation.test.ts
rtk npm run test -- src/features/leetcode-review-assistant/api/code-analysis-contracts.test.ts src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx src/testing/architecture-boundaries.test.ts
rtk npm run test -- src/features/leetcode-review-assistant/api/code-analysis-contracts.test.ts src/features/leetcode-review-assistant/server/code-analysis-service.test.ts src/features/leetcode-review-assistant/server/analysis-runtime-service.test.ts src/features/genai/server/genai-connection-service.test.ts src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx src/testing/architecture-boundaries.test.ts
rtk npm run test -- src/features/settings/hooks/use-ai-connection-controller.test.tsx
rtk npm run test -- src/features/settings/components/sections/ai-assessment-section.test.tsx
rtk npm run test -- src/features/settings/hooks/use-ai-connection-controller.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/settings/components/settings-screen.test.tsx
rtk npm run test -- src/features/genai/server/genai-connection-service.test.ts src/features/settings/data/settings-repository.test.ts
rtk npm run typecheck
```

### Final Automated Gates

All of these commands passed:

```sh
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run zip
rtk npm run store:check
rtk git diff --check
```

`check` passed database consistency, WXT preparation, TypeScript, ESLint, and
209 test files / 2,820 tests. One live-evaluation file / six tests skipped with
the opt-in switch unset. Existing jsdom `scrollTo` diagnostics appeared without
test failures; the actual component browser run had no console warnings/errors.
Build and zip passed with the usual large-chunk advisory, producing
`dist/chrome-mv3` and `dist/cognipace-2.1.0-chrome.zip`. Store validation passed.
The generated manifest contains the exact existing hosts plus
`https://openrouter.ai/*`, with unchanged storage/alarms/notifications permissions
and CSP. No version bump, PR, merge, publication, or database migration was made.

All touched source/package files passed the Task 6 explicit Prettier list.
Task-specific files were formatted and checked; all touched Markdown passed:

```sh
rtk npx prettier --write --ignore-path /dev/null docs/product.md docs/architecture.md design.md docs/testing.md docs/chrome-web-store.md PRIVACY.md docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/plans/2026-10-05-openrouter-provider.md docs/superpowers/README.md
rtk npx prettier --check --ignore-path /dev/null docs/product.md docs/architecture.md design.md docs/testing.md docs/chrome-web-store.md PRIVACY.md docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/plans/2026-10-05-openrouter-provider.md docs/superpowers/README.md
```

### Production Component Browser Proof

Browser plugin not available; the frontend-testing-debugging skill's fallback
used bundled Playwright and existing Google Chrome with fresh headless pages.
No browser dependency was installed. At `http://127.0.0.1:4370/`, the actual
`AiAssessmentSection`, connection controller, shared gate, query client, and
production CSS ran against a temporary mocked runtime with a fake key.

Passed page identity, meaningful render, no framework overlay, healthy console,
masked/cleared key, custom Save & test with assessment off, exact custom-model
remount, preset without RPC or persistence, cleared feedback, Discard restore,
provider-specific links/controls, and mobile horizontal-overflow checks.
Desktop 1280×1000 and mobile 375×850 evidence was inspected. The temporary
fixture initially omitted Tailwind source scanning and dashboard surface tokens;
both were corrected outside the repo. A resized-page capture artifact was
resolved with a fresh mobile page and settled transitions. Final evidence:

- [Desktop Settings screenshot](/Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a109f8-51cf-75e3-a0bd-cee3d604fe3a/openrouter-settings-desktop.png)
- [Mobile Settings screenshot](/Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a109f8-51cf-75e3-a0bd-cee3d604fe3a/openrouter-settings-mobile.png)

Commands:

```sh
rtk proxy node /private/tmp/cognipace-openrouter-ui/server.mjs
rtk proxy node /private/tmp/cognipace-openrouter-ui/inspect.mjs
rtk proxy node /private/tmp/cognipace-openrouter-ui/verify.mjs
```

The first server launch was denied permission to listen in the default sandbox;
the approved launch passed. An initial fixture-only favicon 404 was fixed.
Final browser proof is mocked component evidence, not live OpenRouter or an
installed-extension result. Native SDK tests separately cover real adapter wire
behavior through mocked fetch.

### Skipped And Still Required

Skipped this exact opt-in command because privately supplied test-only
credentials were not available:

```sh
rtk npm run test -- src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts --maxWorkers=1
```

No live inference calls or current full-report artifacts were generated.
Requested/served-model usefulness review and authored JavaScript/Kotlin
generated-suggestion execution remain pending those artifacts. No old artifact
is claimed as current. Human installed-extension happy-path and edge-case smoke
and screenshot/recording proof in `docs/testing.md` remain pending before PR
review or merge. Do not claim model quality, live capacity, or full feature
acceptance from mock wire or a tiny connection test.

`rtk npm run db:generate` was not run because no database schema changed;
`rtk npm run check` ran the required database consistency check. The branch and
managed worktree are preserved for the remaining proof and user-directed
integration.

## Ponytail Simplification Validation — October 5, 2026

Applied all seven review findings: compressed completed recipes into the table,
reused empty-presence and configured-database fixtures, consolidated report
success and key-save cases, moved direct-provider metadata assertions into the
native-wire matrix, and removed the duplicate empty-presence assertion.
Literal expectations, both timeout inputs, served-model metadata, control/preset
assertions, and the three pending proof steps remain intact.

Focused validation passed: six files / 183 tests.

```sh
rtk npm run test -- src/lib/ai/generate-json.test.ts src/features/genai/api/genai-settings-hooks.test.tsx src/features/genai/domain/genai-secrets-types.test.ts src/features/genai/server/genai-connection-service.test.ts src/features/leetcode-review-assistant/server/code-analysis-service.test.ts src/features/settings/components/sections/ai-assessment-section.test.tsx
rtk npx prettier --write --ignore-path /dev/null src/lib/ai/generate-json.test.ts src/features/genai/api/genai-settings-hooks.test.tsx src/features/genai/domain/genai-secrets-types.test.ts src/features/genai/server/genai-connection-service.test.ts src/features/leetcode-review-assistant/server/code-analysis-service.test.ts src/features/settings/components/sections/ai-assessment-section.test.tsx docs/superpowers/plans/2026-10-05-openrouter-provider.md
rtk npx prettier --check --ignore-path /dev/null src/lib/ai/generate-json.test.ts src/features/genai/api/genai-settings-hooks.test.tsx src/features/genai/domain/genai-secrets-types.test.ts src/features/genai/server/genai-connection-service.test.ts src/features/leetcode-review-assistant/server/code-analysis-service.test.ts src/features/settings/components/sections/ai-assessment-section.test.tsx docs/superpowers/plans/2026-10-05-openrouter-provider.md
```

All six commands under Final Automated Gates were rerun and passed. Current
`check`: 209 files / 2,816 tests passed, one file / six opt-in tests skipped.
The four fewer executions were consolidated into existing cases rather than
dropping their assertions. The same jsdom and bundle-size advisories appeared.
Self-review confirmed only six test files and this plan changed. Live evaluation,
generated-code checks, and human installed-extension proof remain pending for
the reasons and exact skipped command recorded above; no new browser run was
needed for this test/documentation cleanup.
