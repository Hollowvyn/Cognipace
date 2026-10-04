# AI Connection Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make provider/model/key setup persist reliably and verify the saved
connection with one small structured request, independently of assessment enablement.

**Architecture:** Settings owns the connection draft and scoped Settings writes;
GenAI owns secret APIs and the fixed connection test; the trusted background owns
sender authorization. Keep the existing storage formats and generation interface.
Use separate ownership for general preferences and AI fields, with a screen-local
operation gate and cross-surface configuration revision. A standalone `src/lib/ai`
module wraps Vercel AI SDK and its three official direct-provider adapters.

**Tech Stack:** React 19, TanStack Query 5, Zod 4, WXT/MV3, Chrome trusted local
storage, Vercel AI SDK with official provider adapters, Vitest/Testing Library.

---

Implementation and automated review/validation complete. Human installed-extension
and live-provider smoke remains pending before PR review or merge. See the final
handoff for exact proof and limitations.

Design approved by the user's request to proceed on 2026-10-03. Source:
`docs/superpowers/specs/2026-10-03-ai-connection-setup-design.md`.
Task branch was fast-forwarded to `3e0ce645`; preserve subsequent unrelated work.
The user explicitly selected Vercel AI SDK on 2026-10-03. Task 3 replaces the
existing adapters behind `generateJson`; tasks 1–2 keep that stable interface.

## Task 1: trusted storage, configuration test, and cache coherence

**Files:**

- Modify `src/platform/secrets/secret-store.ts`, `index.ts`, and its test.
- Modify `src/entrypoints/background.ts`; add
  `src/extension/background-startup.test.ts`. WXT treats tests inside entrypoints
  as extension entrypoints, so startup coverage lives with runtime tests.
- Modify `src/features/genai/api/genai-settings-contracts.ts`,
  `genai-settings-hooks.ts`, their tests, and public barrels.
- Modify `src/features/genai/domain/genai-secrets-types.ts` and its test.
- Modify `src/features/genai/server/genai-settings-service.ts` and its test.
- Create `src/features/genai/server/genai-connection-service.ts` and its test.
- Modify `src/extension/messaging.ts`, `background/runtime-policy.ts`,
  `background/register-handlers.ts`, and their tests.
- Modify `src/platform/query/query-keys.ts`, `cache-invalidation.ts`, and its test.
- Update signature callers in app-shell/backup/dev-smoke tests if necessary.

- [x] Add regressions for no database dependency during presence/save/remove;
      listener registration before storage initialization completes; failed storage
      restriction followed by successful retry; stale presence completion after save;
      dashboard-only connection authorization and strict payload parsing.
- [x] Add the request/response contracts and test them, following this shape:

```ts
const testAiConnectionRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  provider: z.enum(genAiProviderIds),
  model: z.string().trim().min(1).max(120),
})

const connectionIdentity = {
  provider: z.enum(genAiProviderIds),
  model: z.string().min(1).max(120),
  durationMs: z.number().finite().min(0),
}

const testAiConnectionResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('success'), ...connectionIdentity }),
  z.strictObject({
    status: z.literal('error'),
    ...connectionIdentity,
    code: z.enum([...genAiErrorCodes, 'stale-configuration']),
    message: z.string().min(1).max(500),
  }),
])
```

- [x] Register `genai.testConnection` in protocol names/policy/handlers. Its
      service accepts the request and a lazy database loader; the 20-second deadline
      starts before invoking the loader. Compare persisted provider/model, ignore
      enabled, load the secret in background, and generate only the fixed prompt
      `Return {"ok":true}.` with `z.strictObject({ok:z.literal(true)})`. Recheck
      internal credential/configuration identity after generation. Never return it.
- [x] Use a retryable readiness promise inside secret-store operations. Clear a
      rejected attempt. Register handlers synchronously; eager restriction may start
      afterward without delaying registration. Storage failures produce controlled
      messages and never proceed to secret access before restriction succeeds.
- [x] Remove unused database arguments from secret services. After a durable
      secret write, broadcast `genai-updated` with `genai` invalidation. AI Settings
      changes also emit `genai`; unrelated preferences retain existing tags.
- [x] Add `genai` tag mapping to GenAI/app-shell families and a volatile numeric
      configuration-revision key. Increment revision synchronously during GenAI
      invalidation; expose `{revision, readRevision}` from a public GenAI hook using
      the existing query infrastructure. Do not add a second `cache.invalidate` listener.
- [x] Cancel in-flight presence reads before cache updates and parse presence
      responses. Keep raw secret input out of QueryClient's mutation cache: the key
      save hook owns a small local pending/error state and direct async action; cache
      only the returned booleans. Add a regression inspecting mutation-cache variables.
- [x] Add a public test mutation with a 25-second client deadline, controlled
      worker-loss error, strict response parsing, no automatic retries, and no raw
      provider errors. Return the safe result shape above.
- [x] Run the focused command and resolve failures:

```sh
rtk npm run test -- src/platform/secrets src/extension/background-startup.test.ts src/features/genai/api src/features/genai/server/genai-settings-service.test.ts src/features/genai/server/genai-connection-service.test.ts src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts src/platform/query/cache-invalidation.test.ts src/app/providers/cache-invalidation-listener.test.tsx
```

Expected: all focused tests pass, including an actual provider-shaped Gemini
response through the connection service without mocking `generateJson` itself.

## Task 2: one connection form with independent persistence

**Files:**

- Create `src/features/settings/hooks/use-ai-connection-controller.ts` and test.
- Create `src/features/settings/hooks/use-settings-operation-gate.ts` and test.
- Modify `src/features/settings/hooks/use-settings-draft.ts` and test.
- Modify `src/features/settings/api/settings-api.ts` and relevant tests.
- Fix the AI patch schema in `src/features/settings/domain/settings.ts` and its
  tests: partial updates must not inject full-row defaults for absent fields.
- Modify `src/features/settings/components/settings-screen.tsx` and test.
- Modify `src/features/settings/components/sections/ai-assessment-section.tsx`
  and test; retain the path while changing its heading to AI connection.

- [x] Add full-screen regressions for Gemini/model/key Save & test, remount
      persistence, Enter submitting the AI form, provider-switch key clearing,
      partial persistence errors, key removal, and assessment disabled during test.
- [x] Add a small synchronous operation gate. Both controllers acquire it before
      awaiting anything; release their own lease in `finally`. Its public shape is:

```ts
type SettingsOperation = 'preferences' | 'reset' | 'ai'
type SettingsOperationGate = {
  activeOperation: SettingsOperation | null
  acquire: (kind: SettingsOperation) => (() => void) | null
  isBusy: () => boolean
}
```

- [x] General Save/Discard and dirty detection exclude AI fields. Keep the full
      domain patch helper unchanged; wrap it in the preferences hook:

```ts
function createPreferencesPatch(saved: UserSettings, draft: UserSettings) {
  const patch = createUserSettingsPatch(saved, draft)
  if (!patch) return null
  delete patch.aiAssessment
  return Object.keys(patch).length === 0 ? null : patch
}
```

- [x] Reset Defaults keeps its current AI defaults and stored keys. Coordinate it
      with AI actions through the gate; after success clear AI draft/test feedback.
      General fields are disabled during their own Save/Reset. AI fields are disabled
      during AI operations or general persistence; unrelated preference edits can
      remain local during an AI test without being committed by that test.
- [x] The connection controller owns provider/model/key, baseline, operation
      step, safe feedback, assessment enabled, and test epoch. On provider change
      clear the unsaved key, replace the model with a real provider default, and clear
      feedback. Load saved custom models verbatim; initial/reset blank stays blank.
- [x] Save & test captures the draft, saves an entered key, persists only changed
      provider/model, clears the key after its save, then tests. Start the test epoch
      after the operation's own persistence invalidation. Show precise partial-failure
      status and preserve remaining drafts for retry.
- [x] Use public GenAI revision to discard stale tests after external replacement
      or removal, including unchanged presence. Local edits, discard, reset and
      unmount also invalidate test completion. No successful test state survives reload.
- [x] The assessment switch writes only `{aiAssessment:{enabled}}`, requires
      saved configuration to turn on, and can turn off with missing credentials.
      Coordinate it with all other operations through the gate.
- [x] Use sibling forms and existing SettingsRow/Section/control/status tokens.
      Show active provider's loading/missing/saved/verified/error state, a masked key,
      an actual editable model, current step, clear recovery, and a Google AI Studio
      link. Primary action is Save & test connection or Test connection.
- [x] Update Settings mutation caching by canceling prior Settings reads, applying
      the authoritative returned Settings, and invalidating the correct families.
- [x] Run the focused command and resolve failures:

```sh
rtk npm run test -- src/features/settings src/features/genai/api
```

Expected: all Settings/API tests pass, including general preferences staying dirty
after AI save, reset coordination, duplicate actions, and late external test results.

## Task 3: standalone SDK generation and safe provider results

**Files:**

- Add `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, and `@ai-sdk/google` to
  `package.json`/lockfile with exact installed compatible versions.
- Create `src/lib/ai/{index,types,generate-json,operation}.ts` and focused tests.
- Modify `src/features/genai/domain/genai-types.ts` and its test to reuse library
  types without pulling provider SDK code into UI modules.
- Replace `src/features/genai/server/genai-service.ts` with delegation to the
  library. Remove unused custom `server/providers` and `json-schema` modules and
  migrate their useful tests to native SDK wire/transport regressions.
- Update `src/testing/architecture-boundaries.test.ts` to permit credential
  construction in `src/lib/ai` and confine provider SDK imports to that module.
- Align the existing recommendation runtime metadata/error schema if needed.
- Preserve existing recommendation fallback messages for the expanded safe SDK
  error codes and parse recommendation responses at both runtime boundaries.

- [x] Add native Response/ReadableStream deadline regressions for stalled headers,
      stalled success/error bodies, aborted callers, cleanup, schema-conversion
      exceptions, refusal/safety blocks, truncated output, and invalid JSON/schema.
- [x] Instantiate official adapters with explicit credentials and fixed URLs:
      `createOpenAI`, `createAnthropic`, and `createGoogleGenerativeAI`. Pass their
      model objects to `generateText`, never Gateway string identifiers. Use
      `Output.object({schema})`, `maxRetries:0`, a bounded output budget, no default
      temperature, and disabled telemetry. Extract only safe model/duration/token
      metadata and validated output. Expose no SDK request/response objects.
- [x] Keep a deadline alive until the entire provider result has completed. The
      operation helper composes caller cancellation, races completion against abort,
      and removes listeners/timers in `finally`. Pass its signal to fetch, and consume
      error and success bodies inside that operation. An abort returns promptly even
      when a test double ignores its signal.
- [x] Normalize only controlled error codes/messages. Distinguish auth,
      permission, bad request, unavailable model, rate limit, network, timeout,
      refusal, invalid output, and unknown when evidence allows. No raw body logging
      or error-message forwarding. Validate the original output schema after decoding.
- [x] Delegate provider-specific wire conversion/parsing to the SDK; preserve
      final original-schema validation and controlled schema-construction failures.
      Verify literals, bounded/nullable/union fields, output truncation/refusal and
      thought blocks through actual SDK responses. If the installed SDK needs a
      documented compatibility setting, set it explicitly inside this module.
- [x] Run the focused command and resolve failures:

```sh
rtk npm run test -- src/lib/ai src/features/genai/server src/features/genai/domain src/features/leetcode-review-assistant/api/runtime-contracts.test.ts src/testing/architecture-boundaries.test.ts
```

Expected: real transport/schema regressions and existing consumers pass. Every
provider claimed live-working still requires its own saved-key live smoke proof.

## Task 4: integration, authority docs, and review

**Files:** `docs/product.md`, `docs/architecture.md`, `docs/testing.md`,
`design.md`, this plan, and a final handoff under `docs/superpowers/handoffs`.
Shared invalidation's completion promise also requires explicit `void`/`await`
at existing API/listener call sites. Backup restore and successful existing sync
pull invalidation include GenAI because they can replace AI settings; this adds
no sync behavior.

- [x] Review task 1–3 against the approved design and then code quality. Resolve
      all actionable findings. Enforce fixed approved provider hosts, safe runtime
      payloads, sender checks, no secret query-cache/log/backup/sync exposure, and
      feature dependency direction.
- [x] Update authority docs with the shipped workflow, storage/reset semantics,
      test availability independent of assessment, bounded deadlines and recovery.
- [x] Add the exact happy-path/edge-case manual smoke checklist and visual proof
      requirements: real Gemini Save & test/reload, invalid key/model/quota/timeout,
      storage failure/retry, worker wake with DevTools closed, other-tab key changes,
      partial save and general preferences/reset coordination, keyboard/mobile layout.
- [x] Run required full validation after focused tests:

```sh
rtk npm run lint
rtk npm run check
rtk npm run build
```

- [x] Run Prettier on touched source and Markdown, explicitly overriding ignore
      for planning files. Record exact commands, results and any skips in the handoff.
      `check` includes database checks; no schema generation/migration is expected.
- [x] Leave an honest PR-ready summary. Installed-extension URL automation is
      blocked by browser policy; do not circumvent it. Human installed-extension
      smoke/screenshots are required before PR review/merge, and remain pending until
      supplied. Do not claim a live provider is working from mocks alone.

## Scope review

The plan covers persistent provider/model/key, switch/model/input/reset races,
active status and partial errors, trusted startup and storage, stale presence and
cross-surface test completion, fixed live test with full deadline, schema/response
handling, sender authorization, exact automated checks, and required human proof.
No new account, hosted service, sync behavior, Chrome permission, database schema,
or assessment-report feature is introduced in this phase.
