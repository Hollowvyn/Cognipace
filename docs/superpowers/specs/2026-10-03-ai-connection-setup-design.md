# Reliable AI connection setup

Status: setup design approved by the user on 2026-10-03. Implementation is
authorized; the phase plan records execution and validation.

Date: 2026-10-03. Branch: `codex/ai-assessment-repair`, based on fetched
`origin/main` at `7cccd2d7b63d8d01e226227ca9e62247e3c165e1`.

During this audit, `origin/main` advanced to `3e0ce645` with a track fix and
release changes. The evidence below is from the audited `7cccd2d7` checkout.
Refresh the task branch and relevant authority docs before implementation.

## Outcome and scope

First make Gemini setup dependable: select the provider, edit the model, save
the key and configuration, reopen Settings, and prove a real request works.
The user reports that the provider sometimes remains OpenAI, model text clears,
and the key is not saved or used. The screenshot shows Anthropic selected,
a Gemini saved-key badge, and assessment disabled.

This phase repairs connection setup and the shared generation path needed to
test it. Reusable AI extraction and the requested Approach, Efficiency, and
Code Style / Syntax scores out of 5 follow in separately planned phases after
setup works. The deferred master draft records that later direction.

The user subsequently selected Vercel AI SDK. The reusable provider integration
therefore moves into this phase: `src/lib/ai` uses official direct OpenAI,
Anthropic, and Google adapters with explicit local BYOK credentials and fixed
approved endpoints. `features/genai` retains configuration and secrets and
delegates its existing generation interface to the library. No AI Gateway or
Vercel account is introduced. Code analysis remains a later phase.

## Findings and limits

| Verified finding                                                                                                                      | Consequence                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Save key persists only the credential; provider/model require Save Settings (`ai-assessment-section.tsx:64`, `use-settings-draft.ts`) | Saving a Gemini key and leaving can restore the old OpenAI provider and blank model. |
| Model examples are placeholders (`ai-assessment-section.tsx:142,145`)                                                                 | Visible text can represent no selected model.                                        |
| Provider changes retain model and unsaved key (`ai-assessment-section.tsx:56,113`; `use-settings-draft.ts:335`)                       | A key/model intended for one provider can be assigned to another.                    |
| Pending Settings saves leave fields editable, then replace the draft (`use-settings-draft.ts:183,315`)                                | Edits made during a save can disappear.                                              |
| Secret handlers unnecessarily open the database (`register-handlers.ts:1224,1235,1248`)                                               | Database startup failure can block a Chrome-storage-only operation.                  |
| Background listeners register after awaiting storage initialization (`background.ts:15–16`)                                           | MV3 wake events can be missed under Chrome's documented startup rules.               |
| Secret mutations lack cross-surface invalidation and stale-read cancellation (`genai-settings-hooks.ts:39,59`)                        | Presence/availability can remain stale or overwrite fresh results.                   |
| Save/Remove can overlap; completion clears current key input                                                                          | Mutations can race and discard newer input.                                          |
| The current timeout ends after headers (`providers/shared.ts:46`)                                                                     | Body consumption can stall indefinitely; reproduced below.                           |

Normal settings query refresh already protects dirty drafts; ordinary typing
does not have a proven reset path. Existing tests validate Gemini's storage
mapping and mocked persistence, but do not establish the exact installed failure.
Add full Settings interaction regressions before attributing all symptoms to
one cause. A saved-key badge proves storage presence, not authentication.

In-memory reproductions using the actual reducer and installed QueryClient
confirmed save completion discarding later Gemini/model edits and an old presence
query overwriting successful key-save status. These establish reproducible
conditions, not proof of the user's exact live trigger. Exact commands and
outputs are in the [setup audit evidence](../handoffs/2026-10-03-ai-setup-audit.md).

Context7 was used for current provider and Chrome docs. Official references:

- [Gemini keys](https://ai.google.dev/gemini-api/docs/api-key): use provider authentication headers; key restrictions can also cause access failures.
- [Gemini models](https://ai.google.dev/api/models): model availability and supported generation methods can be queried.
- [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting): distinguish malformed requests, access/billing/region failures, quota limits, and service failures.
- [Chrome service-worker migration](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers): register listeners synchronously and await initialization within an operation.
- [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle): keep the tiny connection test within worker limits.

No live provider request was made. Browser automation rejected the installed
`chrome-extension:` Settings URL because its URL policy permits only HTTP/HTTPS.
No workaround or credential inspection was attempted.

## Proposed experience

Use a focused **AI connection** section with its own draft and persistence.
It saves only AI configuration; other preference changes keep Save Settings.

The connection section and assessment switch exclusively own `aiAssessment`.
General Save/Discard excludes those fields. Reset Defaults retains its existing
meaning: reset provider/model/enabled, preserve stored keys, clear connection
draft/status, and refresh availability. Block reset while an AI operation runs
and block AI actions while reset runs, including the assessment-enable switch.

Present provider, an actual editable model value, the selected provider's masked
key status/input, and **Save & test connection**. For unchanged saved configuration,
the action becomes **Test connection**. Offer explicit Remove key and Discard
connection changes. Link Gemini setup to Google AI Studio.

On provider change, clear the unsaved key and feedback and replace the previous
provider's model with a clearly identified real default verified against current
docs during implementation. Users can always edit the model ID. Defaults are
input values, not placeholders. Preserve a saved custom model when loading it.

Show loading, no saved key, saved but untested, testing, connected for this model,
or a recoverable error. A failed presence query must not look like a missing key.
Other saved-provider badges are secondary; they do not imply active readiness.
Change provider/model/key and invalidate previous connection success. After
reload, show saved configuration as untested and offer Test connection.

Any cross-surface key/configuration invalidation also clears success and
invalidates the in-flight test generation, even when key presence stays true
and provider/model stay the same. Ignore a late result for the previous key;
keep credential revision checks internal rather than exposing key fingerprints.

Put **Use AI for assessments** after the connection controls, with independent
persistence and status. Connectivity can be tested while assessment is off.
Enabling requires saved provider/model/key and explains missing requirements;
disabling always works. Enabling does not trigger an implicit network test.
Disable the switch temporarily during a conflicting connection/reset operation;
missing credentials alone never prevent disabling it.

## Persistence and concurrency

Capture the operation's provider/model/key draft. Sequentially validate input,
save an entered key for that provider, persist only the provider/model Settings
patch, then test the saved connection. Reuse an existing key without re-entry.
Keep the existing `settings.aiAssessment` and secret storage formats.

The two stores are not transactional. If only the key saves, say **Key saved;
connection settings could not be saved**, retain the draft, and offer retry.
If persistence succeeds and testing fails, say **Connection saved; test failed**
with useful recovery. Never claim connected on partial failure. Preserve
existing credentials and other preferences; connection setup does not silently
enable assessment.

Serialize saves, removals, and tests and freeze this section's affected controls
while its operation runs. Show its current step. Prevent independent Settings
save/reset completion from discarding later edits by disabling affected form
controls during mutation or rebasing edits. Query updates preserve a dirty
connection draft; successful saves update its baseline.
Coordinate assessment-switch mutations with connection actions and Reset
Defaults. General preference saves exclude AI fields even when their draft
baseline predates a connection save. Cross-surface changes invalidate an operation
before its result is accepted.

Register runtime listeners synchronously. Await a shared trusted-storage
readiness promise inside authorized operations before accessing secrets. Fail
closed with controlled retryable feedback if initialization fails. Remove the
unused database dependency from secret presence/save/remove handlers; normal
Settings writes retain their owning service and flush behavior.
Allow a failed initialization attempt to be retried; do not retain a permanently
rejected readiness promise that makes the displayed Retry ineffective.

After secret writes, broadcast narrowly scoped GenAI/availability invalidation
to affected open dashboards/overlays without marking database snapshots or sync
dirty. Cancel stale presence reads before applying mutation results. Validate
runtime requests and responses with Zod. Keys stay in trusted local storage and
background provider code; user feedback/logs contain no keys or raw provider bodies.

## Real connection verification

Add a dashboard-authorized test message for a selected saved provider/model.
Reject stale configuration identity, load the saved secret in background code,
and use the actual shared generation service to request fixed tiny structured
output such as `{ "ok": true }`. Assessment enablement is not a prerequisite.
Callers cannot supply arbitrary hosts, prompts, schemas, or credentials to this
endpoint. Return validated safe provider/model, duration, and success/error.

Differentiate credentials, permissions/restrictions, model availability,
quota/rate limit, network, timeout, blocked/refused output, and invalid structured
output when provider evidence supports it. Unknown failures remain unknown;
not every Gemini HTTP 400 means an invalid key. Use controlled messages.

Bound the complete test at 20 seconds, including headers, success/error bodies,
parsing, and schema validation. Use a slightly longer client response deadline,
abort/cleanup on expiry, and offer retry. Schema preparation exceptions also
become controlled results. Long-generation streaming/keepalive belongs to the
later integration phase.

Use AI SDK `generateText` with `Output.object` and the original Zod schema,
explicit provider model objects, disabled automatic retries, controlled errors,
and a complete-call abort/deadline. Omit unsupported sampling options. Test
provider-shaped responses through the actual SDK/service/runtime contracts.
Delete unused custom wire-schema/provider parsing code once consumers migrate.
The standalone module imports no feature/app code and retains final validation
against the original output schema. SDK errors may contain raw data, so never
forward or log them directly.

## Acceptance and phase planning

After approval, write a phase-sized plan for Settings component/controller/API,
the draft/save race, GenAI storage/hooks/services/provider transport, runtime
contracts/policy/handlers, background startup, cache invalidation, and authority
docs. Preserve `entrypoints -> app -> features -> platform/lib/components`.

Done when:

- Gemini selection, custom model typing, key save, reload, and a real tiny test
  succeed with no silent resets.
- Switching provider clears unsaved credentials and incompatible model drafts.
- Slow/stale reads, duplicate actions, pending saves, and other open surfaces
  do not lose edits or report obsolete presence/availability.
- Secret-only operations survive database initialization failure; the first
  request wakes a sleeping worker with DevTools closed.
- Tests work with assessment off; auth/model/quota/network/timeout/invalid-output
  failures all finish with recovery and accurate saved/unsaved status.
- Partial persistence failures identify which step succeeded.
- Disabling works after removing a key; secret changes refresh open overlays.
- Keyboard operation and desktop/mobile feedback have visual proof.
- No credential reaches UI output, logs, backup, sync, or content scripts.

## Validation and proof

Preparation passed: `rtk git fetch origin`, `rtk npm ci`, and
`rtk npm run prepare:wxt`. Fetch needed sandbox access to shared Git metadata.
Initial test attempts lacked Vitest/generated WXT config; both were resolved.

Passed audit commands:

- `rtk npm run test -- src/features/genai src/features/assessment/domain src/features/leetcode-review-assistant src/features/overlay-session/hooks/use-leetcode-assessment-recommendation.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/lib/leetcode/submission src/lib/leetcode/watcher src/lib/leetcode/editor`: 32 files / 345 tests.
- `rtk npm run test -- src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/settings/hooks/use-settings-draft.test.tsx src/features/genai/api src/features/genai/server/genai-secret-storage.test.ts src/features/genai/server/genai-settings-service.test.ts src/platform/secrets/secret-store.test.ts`: 7 files / 57 tests.
- `rtk npm run test -- src/features/genai/api/genai-settings-hooks.test.tsx src/features/genai/server/genai-secret-storage.test.ts src/features/genai/server/genai-settings-service.test.ts src/platform/secrets/secret-store.test.ts src/extension/background/register-handlers.test.ts`: 5 files / 91 tests (subagent).
- `rtk npm run test -- src/features/settings/hooks/use-settings-draft.test.tsx src/features/settings/data/settings-repository.test.ts src/features/settings/components/settings-screen.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/platform/query/cache-invalidation.test.ts`: 5 files / 51 tests (subagent).
- `rtk npm test -- src/features/settings/hooks/use-settings-draft.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/genai/api/genai-settings-hooks.test.tsx`: 3 files / 32 tests (subagent).

Native timeout reproduction without product edits:

```sh
rtk proxy node --input-type=module -e 'import { fetchWithTimeout } from "./src/features/genai/server/providers/shared.ts"; globalThis.fetch = async () => new Response(new ReadableStream({ start() {} })); const response = await fetchWithTimeout("https://example.test", {}, { timeoutMs: 20 }); const outcome = await Promise.race([response.json().then(() => "body completed", () => "body rejected"), new Promise(resolve => setTimeout(() => resolve("body still pending after 100 ms despite 20 ms timeout"), 100))]); console.log(outcome);'
```

Output: `body still pending after 100 ms despite 20 ms timeout`.

Draft formatting passed:

- `rtk npx prettier --write --ignore-path /dev/null docs/superpowers/specs/2026-10-03-ai-connection-setup-design.md docs/superpowers/specs/2026-10-03-ai-repair-and-code-analysis-design.md`
- `rtk npx prettier --check --ignore-path /dev/null docs/superpowers/specs/2026-10-03-ai-connection-setup-design.md docs/superpowers/specs/2026-10-03-ai-repair-and-code-analysis-design.md`

Planning files are normally ignored; the explicit override checks them. The
audit evidence document records its own exact formatting commands.

Skipped for this docs-only draft: `rtk npm run lint`, `rtk npm run check`,
`rtk npm run build`, `rtk npm run db:generate`, and `rtk npm run db:check`.
No product/schema code changed. Live provider testing, installed-extension smoke,
and human screenshot/recording proof remain unperformed.

Implementation requires focused Settings/controller, GenAI storage/API,
transport/schema, startup, runtime-policy/contract/handler, and invalidation
regressions, followed by `rtk npm run lint`, `rtk npm run check`, and
`rtk npm run build`, plus Prettier. No database migration is planned; run database
checks if the implementation changes database behavior beyond existing mutations.

The human engineer must run installed-extension happy-path and edge-case smoke,
including saved Gemini key/model, reload, live verification, and worker wake,
and attach screenshots/recording before PR review/merge. Each other provider
requires its own live proof before it can be claimed working.

## Release and recovery

This is a bug-fix phase with a Conventional Commit title and the repository PR
template, exact validation, and completed/pending human proof. Preserve existing
keys, Settings, practice history, and track progress. Storage remains compatible;
rollback needs no data migration. Disabling assessment remains available.
