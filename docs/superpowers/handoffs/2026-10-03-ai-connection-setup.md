# AI connection setup repair handoff

Date: 2026-10-03. Branch: `codex/ai-assessment-repair`.
Implementation baseline: `3e0ce645`. Prepared for a draft pull request following
the user's request; installed-extension and live-provider proof remains pending.
`origin/main` advanced with an unrelated Analytics change during implementation;
no unrelated work was reverted or incorporated into this phase.

PR-ready title: `fix(genai): persist and test AI provider connections`.

## Details

Gemini setup previously split key saving from provider/model persistence. Model
examples were placeholders, secret operations waited for the database, startup
listeners registered after asynchronous storage restriction, and stale reads
could overwrite availability. Implementation also reproduced a separate reset:
the Zod AI PATCH schema applied full-row defaults to omitted fields, so toggling
assessment could restore OpenAI and erase a saved Gemini model.

The repair introduces a separate AI connection form with an editable model,
masked key, selected-provider status, Save & test connection, Test connection,
Remove key, and independent assessment enablement. Other preference saves and
discards preserve AI edits; Reset Defaults clears AI configuration/draft/testing
while keeping provider keys. A synchronous screen gate prevents conflicting
writes. Partial failures preserve remaining edits and state which stage failed.

`src/lib/ai` is the reusable structured-generation layer. It wraps Vercel AI SDK
7.0.127 and exact official adapters: OpenAI 4.0.83, Anthropic 4.0.71, Google
4.0.87. The GenAI feature retains configuration and secret ownership. Connection
testing, assessment, and development smoke call the library directly. Custom
REST adapters, wire-schema conversion, and the forwarding generation facade
were removed. Assessment returns controlled errors instead of building an unused
artificial fallback recommendation. The requested
Approach/Efficiency/Code Style scores out of 5 and suggested code remain a later
phase, recorded in the separate master draft.

Provider calls receive explicit credentials and direct provider model objects,
fixed approved hosts, disabled retries and telemetry, bounded output, blocked
redirects, and a complete-call deadline. Raw SDK errors, provider bodies,
request objects, and credentials are not logged or returned. Returned metadata
contains only provider, model, and duration. The SDK validates structured output
once against the supplied Zod schema.

Dashboard-only `genai.testConnection` validates the saved provider/model, reads
the key in the background, requests only `{ "ok": true }`, and rejects replaced
configuration or credentials. Its 20-second deadline includes database/secret
preparation, network headers/body, and validation. The client ends a lost worker
response after 25 seconds. Connection testing works while assessment is off.

Secret operations await shared retryable trusted-storage readiness and no longer
depend on database startup. Listeners register synchronously. Durable secret
writes broadcast GenAI invalidation before presence readback, including when
readback fails. Secret inputs stay out of MutationCache variables. Public status
contains only validated presence booleans. GenAI invalidation synchronously
increments a volatile revision, cancels initial presence/app-shell reads before
refetch, cancels Settings reads for combined Settings/GenAI events, and clears
obsolete test results across surfaces. Existing backup
restore and successful sync pull also invalidate GenAI because they can replace
AI settings; no sync payload, trigger, or permission was expanded.

## Issue

No issue - this repair was explicitly requested in the current chat and its
scope is recorded in the approved design. The user subsequently requested a
pull request with an editable live-testing checklist. Keep that PR in draft
until the human happy-path and edge-case proof is complete; no merge is requested.

## Testing

### Approved Ponytail cleanup of PR #188

The user approved all eleven cleanup findings. Relative to `f5ebcc41`, production
TypeScript shrank by **194 lines net** (46 added, 240 removed; tests and fixtures
excluded). The forwarding generation layer, unused endpoint option and metadata,
artificial fallback recommendation, aggregate secret schema, duplicate validators,
unused key-save state, mirrored preference-operation state, and duplicate query
cancellation were removed. No additional review suggestions were applied.

Actual SDK wire tests now live in `src/lib/ai/generate-json.test.ts`. The original
async refinement regression failed for all three providers when validation ran
twice and passes with SDK-owned validation. Strict per-provider secrets, runtime
parsing, safe errors, MutationCache credential exclusion, fixed hosts, deadlines,
rating locks, shared write gates, cancellation, and stale-result checks remain.
Independent spec reviews and subsequent code-quality reviews found no remaining
actionable cleanup defect.

Cleanup focused commands passed:

```sh
rtk npm run test -- src/features/genai/domain src/features/genai/api/genai-settings-contracts.test.ts src/extension/background/register-handlers.test.ts
rtk npm run test -- src/lib/ai src/features/genai/server/genai-connection-service.test.ts
rtk npm run test -- src/features/settings/hooks src/features/genai/api src/platform/query/cache-invalidation.test.ts
rtk npm run test -- src/features/leetcode-review-assistant
rtk npm run test -- src/lib/ai src/features/genai/server/genai-connection-service.test.ts src/features/leetcode-review-assistant src/extension/background/register-handlers.test.ts src/testing/architecture-boundaries.test.ts
rtk npm run test -- src/lib/ai src/features/genai src/features/settings/hooks src/features/leetcode-review-assistant src/features/overlay-session/hooks/use-leetcode-assessment-recommendation.test.tsx src/extension/background/register-handlers.test.ts src/platform/query/cache-invalidation.test.ts src/testing/architecture-boundaries.test.ts
```

Results respectively: **4 files / 78 tests**, **3 / 61**, **6 / 59**, **6 / 57**,
**11 / 201**, and **22 / 301**. These overlapping counts must not be summed.
The full cleanup `rtk npm run check` passed **195 files / 2,144 tests**, including
database integrity, WXT preparation, typecheck, and lint. Deleted tests covered
removed options and unused fallback construction; relevant deadline, privacy,
wire, normalization, and cache-race coverage remains. No paid provider request
or real credential was used.

Initial cleanup `rtk npm run lint` and `rtk npm run check` failed on
`@typescript-eslint/require-await` in the refinement test callback. Returning
`Promise.resolve(true)` preserves its asynchronous validator behavior and fixes
lint; both commands subsequently passed. Existing jsdom `Window.scrollTo`
notices remain non-failing. Human installed-extension/live-provider proof and
the happy-path/edge-case checklist below remain pending.

Required cleanup finish commands passed:

```sh
rtk npm run lint
rtk npm run check
rtk npm run format
rtk npm run build
rtk npm run zip
rtk npm run store:check
rtk proxy npx prettier --check src/lib/ai/generate-json.test.ts
rtk proxy npx prettier --check --ignore-path /dev/null docs/architecture.md docs/superpowers/plans/2026-10-03-ai-integration-cleanup.md docs/superpowers/handoffs/2026-10-03-ai-connection-setup.md
rtk git diff --check
```

The cleanup Chrome archive is `dist/cognipace-2.1.0-chrome.zip` (1.44 MB);
the background bundle remains approximately 1.21 MB. Build and zip emit the
existing large-chunk warning and exit successfully. Skipped commands and human
smoke requirements remain listed below; no new visual or live-provider proof
is claimed by this refactor.

### Setup implementation validation before cleanup

The focused final integration command passed **54 files / 677 tests**:

```sh
rtk npm run test -- src/features/settings src/features/genai src/lib/ai src/platform/query src/platform/secrets src/extension/background-startup.test.ts src/extension/background src/app/providers/cache-invalidation-listener.test.tsx src/features/leetcode-review-assistant src/features/overlay-session/hooks/use-leetcode-assessment-recommendation.test.tsx src/features/backup src/features/sync/api src/features/imports/api src/features/tracks/api src/features/problems/api src/testing/architecture-boundaries.test.ts
```

Additional final owner checks passed:

```sh
rtk npm run test -- src/platform/secrets src/extension/background-startup.test.ts src/features/genai/api src/features/genai/server/genai-settings-service.test.ts src/features/genai/server/genai-connection-service.test.ts src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts src/platform/query/cache-invalidation.test.ts src/app/providers/cache-invalidation-listener.test.tsx src/features/app-shell/server/app-shell-service.test.ts src/features/backup/data/backup-repository.test.ts src/features/genai/domain/genai-secrets-types.test.ts
rtk npm run test -- src/features/settings src/features/genai/api
rtk npm run test -- src/lib/ai src/features/genai/server src/features/genai/domain src/testing/architecture-boundaries.test.ts
rtk npm run test -- src/features/leetcode-review-assistant src/features/overlay-session/hooks/use-leetcode-assessment-recommendation.test.tsx
```

Results respectively: **13 files / 201 tests**, **11 / 138**, **8 / 110**, and
**7 / 87**. Counts overlap and must not be summed. Tests exercise actual SDK
adapters with native provider-shaped Responses; they do not mock successful
`generateJson` calls. No real credential or paid provider request was used.

Final `rtk npm run check` passed **195 files / 2,165 tests** after the last
review fix. Required commands passed:

```sh
rtk npm run lint
rtk npm run check
rtk npm run format
rtk npm run build
rtk npm run zip
rtk npm run store:check
```

The production archive is `dist/cognipace-2.1.0-chrome.zip`. Build/zip emit a
large-chunk warning; they exit successfully. The test suite emits existing
jsdom `Window.scrollTo` notices and passes.

All six commands above were rerun successfully during draft PR preparation.
The full check again passed **195 files / 2,165 tests**. The focused SDK
verification also passed **3 files / 65 tests**:

```sh
rtk npm run test -- src/features/genai/server/genai-service.test.ts src/features/genai/server/genai-connection-service.test.ts src/lib/ai/operation.test.ts
```

Earlier `rtk npm run check` runs passed **195 files / 2,162 tests** and then
**195 files / 2,164 tests**, including database check, WXT preparation,
TypeScript, and lint. Production build passed. The last Settings cancellation
regression passed after failing with one stale read before the fix. Final focused
cache/Settings/GenAI/listener validation passed **13 files / 149 tests**:

```sh
rtk npm run test -- src/platform/query src/features/genai/api src/features/settings src/app/providers/cache-invalidation-listener.test.tsx
```

Source formatting passed with:

```sh
rtk proxy npx prettier --check docs/product.md docs/architecture.md docs/testing.md design.md package.json src/lib/ai src/features/genai src/features/settings src/platform/secrets src/platform/query src/extension/background-startup.test.ts src/extension/background/register-handlers.ts src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.ts src/extension/background/runtime-policy.test.ts src/extension/messaging.ts src/features/app-shell/server/app-shell-service.test.ts src/features/backup/api/backup-api.ts src/features/backup/data/backup-repository.test.ts src/features/sync/api/sync-api.ts src/features/imports/api/imports-api.ts src/features/tracks/api/tracks-api.ts src/features/problems/api/problems-api.ts src/app/providers/cache-invalidation-listener.tsx src/features/leetcode-review-assistant/api src/features/leetcode-review-assistant/server/recommendation-normalizer.ts src/features/leetcode-review-assistant/server/recommendation-normalizer.test.ts src/features/leetcode-review-assistant/server/runtime-handler-service.ts src/testing/architecture-boundaries.test.ts
rtk proxy npx prettier --check src/platform/query/cache-invalidation.ts src/platform/query/cache-invalidation.test.ts
```

Planning files are normally ignored by Prettier; final Markdown validation uses
`--ignore-path /dev/null`. Exact final checks are recorded with the finish proof
below.

```sh
rtk proxy npx prettier --check src/entrypoints/background.ts
rtk proxy npx prettier --check --ignore-path /dev/null docs/product.md docs/architecture.md docs/testing.md design.md docs/superpowers/specs/2026-10-03-ai-connection-setup-design.md docs/superpowers/specs/2026-10-03-ai-repair-and-code-analysis-design.md docs/superpowers/plans/2026-10-03-ai-connection-setup.md docs/superpowers/handoffs/2026-10-03-ai-setup-audit.md docs/superpowers/handoffs/2026-10-03-ai-connection-setup.md
rtk proxy git diff --check
```

Independent spec and subsequent code-quality review found two related
cross-window initial-query races. Native QueryObserver regressions reproduced
both; cancellation before refetch fixed them. The reviewer confirmed both fixes
and reported no remaining actionable finding. Human installed/live proof is
still pending.

### Failed checks and corrections

- Expected red regressions reproduced reset/default injection, asynchronous
  startup, storage retry, stale reads, mutation-cache credential retention,
  partial durability failure, response-body stalls, SDK output errors, and
  cross-window initial-query reuse. Corresponding final tests pass.
- `rtk npm run typecheck` initially rejected a test in `src/entrypoints` as a
  duplicate background entrypoint. Startup coverage moved to
  `src/extension/background-startup.test.ts`; WXT config was not changed.
- Intermediate lint/type failures during parallel implementation were fixed.
- `rtk proxy npm audit --omit=dev --json` initially reported an Undici high
  advisory after the SDK promoted the existing dev dependency to production.
  `rtk proxy npm update undici` moved its compatible lockfile version from
  7.29.0 to 7.30.0 and removed that finding.
- The final production audit still exits 1 for the pre-existing low-severity
  DOMPurify 3.4.13 advisory
  [GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p).
  DOMPurify was unchanged. No unrelated audit-fix upgrades were performed.

## Screenshots and UI QA

Agent fixture: `http://127.0.0.1:4187/`, using the production AI section,
controller, operation gate, Settings API, and GenAI API hooks. Only the runtime
transport was substituted with fake settings/presence/provider responses. The
fixture explicitly labels its fake runtime and makes no provider request.

The Codex in-app browser exposed its supported Playwright APIs. No external
browser, raw CDP, or extension-URL workaround was used. Desktop layout was
observed at 1280 × 720 and the naturally resized window at 662 × 988; no explicit
viewport override was set. A phone-sized viewport remains untested.

| Check               | Result                                                                                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page identity       | Correct fixture URL and title                                                                                                                                                                                                                       |
| Meaningful content  | Production AI section and controls rendered                                                                                                                                                                                                         |
| Framework overlay   | None                                                                                                                                                                                                                                                |
| Console             | No application errors; temporary fixture hot-reload duplicate-root warnings were resolved by disabling fixture hot reload                                                                                                                           |
| Screenshot evidence | Saved connection and actionable unavailable-model failure captured                                                                                                                                                                                  |
| Interaction         | Gemini/custom model/key → Enter → saved/testing/connected; reload kept Gemini/custom model with empty key input and untested status; assessment toggle kept configuration; error kept saved configuration; key removal still allowed assessment off |

Screenshots (agent fixture, **not installed/live provider proof**):

- [Saved connection fixture](assets/2026-10-03-ai-connection-setup/connected-fixture.png)
- [Unavailable-model fixture](assets/2026-10-03-ai-connection-setup/error-fixture.png)

## Required human smoke and skipped validation

Use the exact **AI Connection And Assessment Settings** flow in
`docs/testing.md`. Human installed-extension happy-path and edge-case proof is
still pending and is required before PR review or merge:

- Gemini key/custom model Save & test, navigate away/reopen/reload, repeat saved
  connection test with assessment off, then enable and exercise the existing
  LeetCode recommendation.
- Invalid key/model, restricted access/quota, offline/timeout, interrupted worker,
  storage failure/retry, and first request waking a sleeping worker with DevTools
  closed.
- Other-window key replacement/removal during a test, unchanged presence after
  replacement, partial key/settings failure, general preference edits/save/reset,
  Enter submission, key removal followed by assessment off, and phone layout.
- Inspect exports/sync/status/logs/query and mutation data for credential absence
  using disposable test credentials. Each other provider needs its own live smoke
  before it can be claimed working.

Skipped commands/flows:

- `rtk npm run db:generate`: no database schema or migration changed; database
  integrity is checked by `rtk npm run check`.
- `rtk npm run dev` and installed-extension browser smoke: the available browser
  policy rejects `chrome-extension:` URLs and permits HTTP/HTTPS only. That
  restriction was not circumvented. A dev server does not establish worker/live
  behavior.
- Live provider requests: no human-owned credentials were supplied for agent
  testing. Credentials were not searched for or read from browser storage.
- `rtk npm run build -- -b firefox` and Firefox smoke: current target and
  validation matrix are Chrome MV3.

## Release and recovery

This is a patch-level repair plus the approved SDK replacement. No Chrome
permission, host, account, gateway, backend, database schema, backup format, or
sync behavior was added. Existing provider keys and settings formats remain
compatible; rolling back code requires no data migration. Assessment can be
disabled independently, including after key removal.

The initial SDK production background bundle is approximately 1.21 MB; build
reports its usual large-chunk warning. A static bundle check found SDK provider
header markers only in `background.js`, with the existing manifest permissions
and approved hosts. Installed service-worker behavior and real model access are
the remaining material validation limits.
