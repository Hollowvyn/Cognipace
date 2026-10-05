# Optional OpenRouter Provider Design

## Approval And Status

The user approved this design on October 4, 2026, including Chrome host access
to `https://openrouter.ai/*`. The approved product choices are an optional
OpenRouter connection, the user's own OpenRouter API key, an editable model
field with `openrouter/free` suggested when selecting OpenRouter, and a
**Use free models** action that restores that suggestion.

The user approved proceeding from this written specification to implementation
planning. The [implementation plan](../plans/2026-10-05-openrouter-provider.md)
records concrete tasks and validation. Implementation, provider evaluation,
and human installed-extension proof have not been performed.

## Goal

Allow a user to connect CogniPace's existing code analysis to OpenRouter with
their own key and choice of model. Provide a straightforward free starting
point through `openrouter/free` while preserving the existing Settings,
trusted background, structured-report, and local-first boundaries.

## Product Behavior

### Provider And Model Selection

- Add **OpenRouter** as a fourth option beside OpenAI, Anthropic, and Gemini.
- When switching the connection draft to OpenRouter, fill the model field with
  `openrouter/free` and clear the unsaved key input, following the existing
  provider-switch behavior.
- Keep the model field editable, with its current nonblank and 120-character
  limits. Users can enter another OpenRouter text model ID, including a
  specific available free variant or a paid model.
- Reopening Settings restores the saved active provider and exact model ID.
  Loading saved settings must not replace a custom model with the suggestion.
- Show **Use free models** beside the model field only for OpenRouter. It sets
  the draft model to `openrouter/free`, invalidates old test feedback through
  the existing edit action, and requires **Save & test connection** to persist.
  It does not make a network request. Disable it while a Settings operation
  holds the existing operation gate.
- **Discard connection changes** restores the saved connection. Ordinary
  preference saves leave unfinished connection edits alone.
- Keep the current single active connection and separately saved keys per
  provider. Remembering a model for every provider is outside this scope.
- The suggested free model applies when selecting OpenRouter. Existing global
  default and Reset Defaults semantics remain intact, including a blank reset
  model and preservation of saved provider keys.

### Credentials And Connection Testing

- The user creates and supplies their own OpenRouter API key. This key is
  sufficient for models accessed through their OpenRouter account; separate
  upstream provider keys are not required by CogniPace.
- Add **Get an OpenRouter API key**, linking to
  `https://openrouter.ai/settings/keys` in a new tab using the established
  external-link attributes.
- Reuse masked key entry, selected-provider key presence, key replacement,
  **Remove key**, and the existing write serialization and invalidation behavior.
- Add the secret ID `genai:openrouter` to trusted local secret storage. Secret
  values remain background-owned and excluded from app database settings,
  backups, sync payloads, logs, query caches, and returned runtime data.
- Reuse **Save & test connection** for edits and **Test connection** for an
  unchanged saved connection. Failed tests retain saved configuration and
  show a controlled actionable error.
- Connection testing sends the existing small structured request. It establishes
  access and basic schema compatibility; it does not certify the quality of a
  full code-analysis report or all future randomly routed models.
- Connection setup and testing keep the existing independent AI assessment
  enable control. Saving a provider or choosing the free preset does not change
  that control.

### Free Route And Disclosure

Show compact OpenRouter-specific explanatory copy by the model field:

> Free models are chosen automatically; quality and response time may vary.
> Usage limits apply. You can enter a specific free or paid model instead.

Also explain the data destination in the OpenRouter connection UI:

> OpenRouter forwards your submission code and problem context to a model
> provider. OpenRouter and provider data policies apply.

Link the words **data policies** to OpenRouter's provider-logging documentation.
Honor the account's provider privacy settings through OpenRouter's normal
routing behavior. Keep the integration focused on the user's key and model;
there is no new app privacy-settings system in this phase.

Keep `openrouter/free` requests on that free route. CogniPace must not configure
paid fallback model IDs or switch a failed free request to a paid model. A user
who explicitly enters a paid model uses their own OpenRouter account and its
applicable charges. Avoid hardcoding quota amounts or a current free-model
catalog into product copy because those can change.

## Architecture And Data Flow

Follow `entrypoints -> app -> features -> platform/lib/components`:

1. Settings owns the provider, model, and key-entry draft and existing controls.
2. Dashboard-authorized GenAI runtime methods save/test the connection.
3. GenAI loads the selected key from trusted local storage in the background.
4. `src/lib/ai` creates an explicit OpenRouter model object with that key and
   the existing controlled fetch wrapper.
5. The existing analysis feature supplies the same prompt, Zod report schema,
   consistency checks, token budget, and deadline.
6. The trusted background validates and returns the controlled response to the
   overlay. Report arrival does not perform a review write.

Use `@openrouter/ai-sdk-provider`, maintained by OpenRouter and documented by
Vercel. The reviewed current release line supports `ai@^7.0.0` and Zod 4,
matching the repository's `ai@7.0.127` and `zod@4.4.3`. Pin a published compatible
version during implementation and update the lockfile with the repository's
Node 24.20.0 / npm 11.19.0 toolchain.

All provider construction and SDK calls stay in `src/lib/ai`. Pass the key
explicitly rather than relying on environment variables or the SDK's global
provider. Keep the endpoint fixed to `https://openrouter.ai/api/v1`; the user
edits a model ID, not a transport URL.

Retain strict structured output through `generateText` and `Output.object`.
The adapter must forward the report JSON schema using the provider's supported
structured-output mechanism. Request routing must require the parameters needed
for that output; incompatible or unavailable endpoints produce controlled
failure rather than silently weakening the report contract.
For the dedicated adapter, set `structuredOutputs: { strict: true }` and
`provider: { require_parameters: true }`. Retain local Zod parsing and report
consistency validation regardless of upstream enforcement.

Preserve the existing controlled fetch wrapper, redirect rejection, telemetry
settings, output limits, cancellation, and whole-operation deadlines. Keep SDK
retries disabled and one CogniPace request per analysis operation. OpenRouter
may perform its own internal provider routing within that request; the design
does not promise exactly one upstream inference attempt inside OpenRouter.

The existing limits remain: 20-second background connection test, 25-second
connection client deadline, 30-second background analysis, 50-second overall
analysis client operation, and up to 8,192 output tokens for code analysis.

## Contracts And Metadata

- Extend the shared provider IDs with `openrouter` and derive feature provider
  schemas from that shared list rather than keeping separate three-provider
  enums.
- Extend the strict secret-presence shape and trusted secret mapping with the
  OpenRouter key. Update fixtures and public domain contracts accordingly.
- Update the code-analysis response provider schema: it currently has its own
  explicit three-provider enum and would otherwise reject OpenRouter reports.
- Allow OpenRouter in the opt-in live evaluation configuration.
- Preserve metadata `model` as the requested model identity. Configuration and
  stale-response checks must continue to compare the requested provider/model.
- Add optional `resolvedModel` to generation metadata and the strict analysis
  response metadata schema. Obtain it from the SDK's successful response model
  identity, `result.response.modelId`, when it identifies the served model.
  Accept only a nonblank model ID of at most 120 characters; omit missing,
  invalid, or route-only identities.
  Do not invent an underlying model or truncate an identifier into another ID.
- Preserve the resolved model in existing evaluation artifacts. No report
  database, analytics score, export, sync payload, or new metadata display is
  introduced by this change.

## Controlled Errors

Preserve existing controlled authentication, permission, model-unavailable,
rate-limit, network, timeout, cancellation, refusal, and invalid-output errors.
Only status codes and known allowlisted machine tags may influence error
classification; raw SDK errors, provider bodies, and provider messages remain
redacted at the runtime boundary.

OpenRouter errors may arrive as non-2xx HTTP responses or as error bodies with
HTTP 200. The dedicated adapter exposes the former under `data.error` and the
latter as flattened `data`. Support both shapes. For OpenRouter, normalize known
embedded numeric error codes and the allowlisted `metadata.error_type` before
treating HTTP 200 as invalid output. Never inspect `message` or `metadata.raw`
for classification or return them to callers. Leave the direct providers'
existing classification behavior intact and cover it with regression tests.

Add a controlled `billing` AI error for an OpenRouter 402, including an embedded
402 in an HTTP-200 error envelope. Its message directs the user to check their
OpenRouter balance or key spending limit, or retry after pending paid requests
finish. Include it in the shared runtime error schemas and overlay errors that
offer a Settings action. It must remain distinct from 429 request quotas.

For an OpenRouter unavailable-endpoint response, the controlled guidance should
explain that the selected model may be unavailable or excluded by account
privacy settings. Do not claim that privacy caused a particular failure unless
a verified machine tag establishes that cause. Keep failure feedback actionable
without relaxing privacy settings or changing models automatically.

Explicit Retry remains the existing user action with a fresh request identity.
Free-route capacity, output failure, or billing errors do not trigger an
automatic paid request or a new automatic retry loop.

## Permissions And Enforced Boundaries

The user explicitly approved `https://openrouter.ai/*` for the manifest's
host-permission list. Add that domain only; upstream model-provider domains are
accessed through OpenRouter and do not require extra extension host permissions.

Update the architecture approved-host assertion and the SDK-import confinement
test so it also recognizes `@openrouter/ai-sdk-provider`. Keep provider package
imports confined to `src/lib/ai`, runtime sender authorization unchanged, and
strict Zod parsing at the trusted boundary.

Update the Chrome Web Store permission explanation and privacy/reviewer guidance
to name OpenRouter, its routing role, and user-supplied keys. Publication and
merge are separate release actions; this design approval authorizes the named
host permission for implementation.

## Validation And Proof

The implementation plan must name exact files and focused commands for:

- Provider IDs, secret IDs, presence payloads, saved-key lifecycle, and settings
  persistence through existing schemas.
- Suggested `openrouter/free`, custom saved-model restoration, explicit free
  preset, discard, busy gating, and independent assessment enablement.
- Native OpenRouter chat-completion wire format, explicit bearer key, strict
  schema forwarding, requested/resolved model separation, invalid outputs, and
  preservation of deadline/cancellation/redaction behavior.
- HTTP 401/403/404/402/429 handling, unavailable endpoints, bounded metadata,
  wrapped and flattened HTTP-200 error envelopes, and the absence of paid
  fallback configuration.
- Connection and full analysis runtime contracts, stale configuration/key
  rejection, and shared SDK ownership/host checks.

After focused tests, the required implementation commands are:

```sh
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run zip
rtk npm run store:check
```

Run Prettier on touched source and Markdown files. Planning files are ignored by
the repository's usual Prettier configuration, so explicitly include them with
`--ignore-path /dev/null` for their formatting checks. No database schema change
or generated migration is needed; `npm run check` still includes the normal
database consistency check.

Live evaluation is opt-in and uses privately configured test-only OpenRouter
credentials. Inspect representative full code-analysis reports and record date,
requested model, resolved model when available, schema validity, useful rubric
feedback, and observed latency. A tiny connection test and mock responses are
not substitutes for this evidence. Never print or commit credentials or raw
secret-bearing provider errors.

The human engineer must run installed-extension happy-path and edge-case smoke
and attach screenshots or a recording before PR review or merge. Include free
setup and analysis, custom-model persistence, switching back with **Use free
models**, invalid key/model, unavailable or limited free service, key removal,
interrupted requests, and stale connection/report invalidation. Record any
unrun command or unavailable live case explicitly with its reason.

## Completion And Recovery

This feature is complete when all four providers are supported by the Settings,
secret, runtime, analysis, and evaluation contracts; OpenRouter free/custom
connection flows work; automated checks pass; current product, architecture,
design, testing, and Store documentation describe the shipped behavior; and
the required live and human proof is attached.

Recovery uses the existing AI assessment disable control or selection of another
saved provider. Existing review saving, FSRS scheduling, track progress, and
local data remain independent of analysis results. If the implementation must
be reverted, remove its provider integration and permission with a normal
revert; do not delete unrelated saved user data or keys.

## Current Sources

- [Vercel's OpenRouter provider documentation](https://ai-sdk.dev/providers/community-providers/openrouter)
- [OpenRouter provider release compatibility](https://github.com/OpenRouterTeam/ai-sdk-provider#setup-for-ai-sdk-v7)
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [OpenRouter error handling](https://openrouter.ai/docs/api_reference/errors-and-debugging)
- [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router)
- [OpenRouter request limits](https://openrouter.ai/docs/api_reference/limits)
- [OpenRouter provider data policies](https://openrouter.ai/docs/guides/privacy/provider-logging)
- [Current architecture](../../architecture.md#external-apis-and-secrets)
- [Current Settings design](../../../design.md#cognipace-ai-connection-settings-rules)
- [Current AI testing requirements](../../testing.md#ai-connection-and-assessment-settings)
- [Validation authority](../../agent-governance.md#validation-selection)

## Design-Writing Validation Record

Only this specification and its planning-index entry changed. Self-review
confirmed the approved UX, permission, ownership, failure handling, and proof
requirements are covered, with no placeholders or conflicting model identities.

The initial formatting commands below failed because this worktree has no
`node_modules`; neither command could load the formatter:

```sh
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node node_modules/prettier/bin/prettier.cjs --write --ignore-path /dev/null docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/README.md
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node node_modules/prettier/bin/prettier.cjs --check --ignore-path /dev/null docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/README.md
```

The existing primary checkout provides Prettier 3.8.3, matching this repository.
The following commands succeeded using that formatter and Node 24.20.0:

```sh
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --version
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --write --ignore-path /dev/null docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/README.md
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --check --ignore-path /dev/null docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/README.md
rtk git diff --check
```

Skipped for this docs-only planning change: `rtk npm run lint`,
`rtk npm run check`, `rtk npm run build`, `rtk npm run zip`, and
`rtk npm run store:check`. Implementation focused tests, live provider evaluation,
and human installed-extension smoke were not run because the provider has not
been implemented. These remain required implementation/review proof rather than
passing or N/A claims.
