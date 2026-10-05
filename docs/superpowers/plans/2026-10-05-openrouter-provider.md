# Optional OpenRouter Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional OpenRouter connection using the user's own API key, an editable `openrouter/free` suggestion, and an explicit **Use free models** action.

**Architecture:** Extend the existing AI provider, trusted GenAI secret, and Settings connection paths. Construct the dedicated OpenRouter adapter only in `src/lib/ai`; preserve strict report validation, requested-model identity, background authorization, deadlines, and local data ownership. Reuse current controllers and runtime services rather than introducing another connection system.

**Tech Stack:** TypeScript, React, WXT/Chrome MV3, AI SDK `7.0.127`, `@openrouter/ai-sdk-provider@3.1.0`, Zod `4.4.3`, Vitest, React Testing Library, existing trusted `chrome.storage.local` secrets and Settings repository; Node `24.20.0`, npm `11.19.0`.

---

## Approval, Scope, And Execution Order

The user approved the [design](../specs/2026-10-04-openrouter-provider-design.md), including only the new host permission `https://openrouter.ai/*`, and requested this implementation plan. Written October 5, 2026, this file is an execution artifact: unchecked steps and commands below describe future work, not work already performed.

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

No new production file or general architecture layer is required. Task-specific file lists below identify every additional test file and fixture edit.

## Task 1: Shared Provider, Metadata, Evaluation, And Trusted Key Contracts

**Files:**

- Modify `src/lib/ai/types.ts`.
- Modify `src/features/genai/testing/evaluation-provider-config.ts`.
- Modify `src/features/settings/hooks/use-ai-connection-controller.ts` provider maps only.
- Test `src/features/genai/domain/genai-types.test.ts`.
- Test `src/features/genai/testing/evaluation-provider-config.test.ts`.
- Trusted-key and presence test files are listed in the subsection below.

- [ ] Confirm baseline/toolchain and install existing locked dependencies before adding the provider package:

```sh
rtk git status --short --branch
rtk proxy node --version
rtk npm --version
rtk npm ci
```

Expected: task branch, no unrelated edits, Node `v24.20.0`, npm `11.19.0`, successful locked install. `npm ci` is needed because this managed worktree has no `node_modules`. Keep live-evaluation variables unset during automated checks.

- [ ] Change the provider-order assertion to four providers, error length to 13, and add `'billing'` to the exact expected error set in `src/features/genai/domain/genai-types.test.ts`:

```ts
expect(genAiProviderIds).toEqual([
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
])
expect(genAiErrorCodes).toHaveLength(13)
```

The complete replacement error-set assertion is:

```ts
expect(new Set(genAiErrorCodes)).toEqual(
  new Set([
    'not-configured',
    'auth',
    'permission',
    'bad-request',
    'model-unavailable',
    'billing',
    'refused',
    'cancelled',
    'rate-limit',
    'network',
    'timeout',
    'invalid-output',
    'unknown',
  ]),
)
```

In `src/features/genai/testing/evaluation-provider-config.test.ts`, extend its accepted-provider parameter list:

```ts
it.each(['openai', 'anthropic', 'gemini', 'openrouter'])(
  'accepts an opted-in %s configuration and trims private values',
  (provider) => {
    expect(
      readEvaluationProviderConfig({
        ...configured,
        COGNIPACE_AI_EVAL_PROVIDER: provider,
      }),
    ).toEqual({ provider, model: 'private-model', apiKey: 'private-key' })
  },
)
```

- [ ] Run focused RED before changing the shared implementation:

```sh
rtk npm run test -- src/features/genai/domain/genai-types.test.ts src/features/genai/testing/evaluation-provider-config.test.ts
```

Expected: provider order/error count and OpenRouter evaluation parsing fail. Evaluation remains mocked configuration parsing; this does not send inference requests.

- [ ] Extend the shared definitions in `src/lib/ai/types.ts`:

```ts
export const aiProviderIds = [
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
] as const
export const aiErrorCodes = [
  'not-configured',
  'auth',
  'permission',
  'bad-request',
  'model-unavailable',
  'billing',
  'rate-limit',
  'network',
  'timeout',
  'cancelled',
  'refused',
  'invalid-output',
  'unknown',
] as const
export type AiProviderMetadata = {
  provider: AiProviderId
  model: string
  /** Served model, when a successful routed response supplies a bounded ID. */
  resolvedModel?: string
  /** Whole operation duration, including preparation and validation. */
  durationMs: number
}
```

Keep existing derived types and error metadata `Pick<AiProviderMetadata, 'provider' | 'model' | 'durationMs'>`. Failed calls do not invent resolved metadata.

- [ ] Replace the evaluation import and provider field with the shared list in `src/features/genai/testing/evaluation-provider-config.ts`:

```ts
import { aiProviderIds, type AiProviderConfig } from '@/lib/ai/types'

const evaluationConfigSchema = z.object({
  provider: z.enum(aiProviderIds),
  model: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
})
```

Preserve opt-in-first environment reading, private error text, and the existing 30-second live analysis path.

- [ ] Extend the exhaustive Settings maps now, so shared provider expansion does not leave them incomplete. In `src/features/settings/hooks/use-ai-connection-controller.ts` replace only these maps:

```ts
export const aiProviderLabels: Record<GenAiProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
}
export const aiProviderModelDefaults: Record<GenAiProviderId, string> = {
  openai: 'gpt-5.4-mini',
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-3.5-flash-lite',
  openrouter: 'openrouter/free',
}
```

Existing `setProvider`, `setModel`, `loaded`, `reset`, and write/gate transitions already implement the approved lifecycle; Task 4 verifies them for OpenRouter.

- [ ] Run shared-contract GREEN:

```sh
rtk npm run test -- src/features/genai/domain/genai-types.test.ts src/features/genai/testing/evaluation-provider-config.test.ts
```

Expected: PASS. Continue trusted-key work before Task 2; do not commit the expanded provider union before its adapter case exists.

### Trusted Key Contracts And Lifecycle

**Files to modify:**

- `src/platform/secrets/secret-contracts.ts`
- `src/platform/secrets/secret-store.test.ts`
- `src/features/genai/domain/genai-secrets-types.ts`
- `src/features/genai/domain/genai-secrets-types.test.ts`
- `src/features/genai/server/genai-secret-storage.ts`
- `src/features/genai/server/genai-secret-storage.test.ts`
- `src/features/genai/server/genai-settings-service.test.ts`
- `src/features/genai/api/genai-settings-contracts.test.ts`
- `src/features/genai/api/genai-settings-hooks.test.tsx`
- `src/features/settings/domain/settings.test.ts`
- `src/features/settings/data/settings-repository.test.ts`
- `src/extension/background/register-handlers.test.ts`

This task depends on the shared `AiProviderId` including `openrouter`.

- [ ] Add this platform secret-store lifecycle regression in
      `src/platform/secrets/secret-store.test.ts`:

```ts
it('keeps the OpenRouter secret independent and exposes presence without its value', async () => {
  await saveSecret('genai:openai', 'openai-private-key')
  await saveSecret('genai:openrouter', 'openrouter-private-key')
  await expect(readSecret('genai:openrouter')).resolves.toBe(
    'openrouter-private-key',
  )
  const status = await getSecretStatus('genai:openrouter')
  expect(status).toMatchObject({
    provider: 'genai:openrouter',
    configured: true,
  })
  expect(JSON.stringify(status)).not.toContain('openrouter-private-key')
  await deleteSecret('genai:openrouter')
  await expect(readSecret('genai:openrouter')).resolves.toBeNull()
  await expect(readSecret('genai:openai')).resolves.toBe('openai-private-key')
})
```

- [ ] Replace the presence test at the bottom of
      `src/features/genai/domain/genai-secrets-types.test.ts` with:

```ts
it('requires exactly four provider-presence booleans without secret fields', () => {
  const presence = {
    openai: true,
    anthropic: false,
    gemini: false,
    openrouter: true,
  }
  expect(aiProviderSecretPresenceSchema.parse(presence)).toEqual(presence)
  expect(makeEmptyAiProviderSecretPresence()).toEqual({
    openai: false,
    anthropic: false,
    gemini: false,
    openrouter: false,
  })
  for (const invalid of [
    { openai: true, anthropic: false, gemini: false },
    { ...presence, openrouter: 'true' },
    { ...presence, apiKey: 'fake-private-key' },
    { ...presence, other: false },
  ]) {
    expect(aiProviderSecretPresenceSchema.safeParse(invalid).success).toBe(
      false,
    )
  }
})
```

The earlier `makeEmptyAiProviderSecretPresence` expectation also needs
`openrouter: false`.

- [ ] Add the trusted mapping regression in
      `src/features/genai/server/genai-secret-storage.test.ts`:

```ts
it('maps OpenRouter save, load, and removal to its own trusted secret ID', async () => {
  await saveAiProviderSecretToTrustedStorage('openrouter', {
    apiKey: ' local-key ',
  })
  expect(secretStoreMocks.saveSecret).toHaveBeenCalledWith(
    'genai:openrouter',
    JSON.stringify({ apiKey: 'local-key' }),
  )
  secretStoreMocks.readSecret.mockResolvedValue(
    JSON.stringify({ apiKey: 'local-key' }),
  )
  await expect(
    loadAiProviderSecretFromTrustedStorage('openrouter'),
  ).resolves.toEqual({ apiKey: 'local-key' })
  expect(secretStoreMocks.readSecret).toHaveBeenCalledWith('genai:openrouter')
  await clearAiProviderSecretFromTrustedStorage('openrouter')
  expect(secretStoreMocks.deleteSecret).toHaveBeenCalledWith('genai:openrouter')
})

it('includes the fourth provider in presence without reading secret values', async () => {
  secretStoreMocks.getSecretStatus.mockImplementation((provider: string) =>
    Promise.resolve({
      provider,
      configured: provider === 'genai:openrouter',
      updatedAt: null,
      fingerprint: null,
    }),
  )
  expect(await getAiProviderSecretPresenceFromTrustedStorage()).toEqual({
    openai: false,
    anthropic: false,
    gemini: false,
    openrouter: true,
  })
  expect(secretStoreMocks.getSecretStatus).toHaveBeenCalledWith(
    'genai:openrouter',
  )
  expect(secretStoreMocks.readSecret).not.toHaveBeenCalled()
})
```

- [ ] Add the saved-key and active-configuration regression in
      `src/features/genai/server/genai-settings-service.test.ts`:

```ts
it('uses an OpenRouter key only for its saved active connection and preserves other keys on removal', async () => {
  const { db } = await createTestDb({ seed: false })
  await setAiProviderSecret('openai', { apiKey: 'other-provider-key' })
  await setAiProviderSecret('openrouter', { apiKey: 'private-openrouter-key' })
  await updateSettings(db, {
    aiAssessment: {
      enabled: false,
      provider: 'openrouter',
      model: 'vendor/custom-model:free',
    },
  })
  expect(await loadActiveProviderConfig(db)).toBeNull()
  await updateSettings(db, { aiAssessment: { enabled: true } })
  expect(await loadActiveProviderConfig(db)).toEqual({
    provider: 'openrouter',
    model: 'vendor/custom-model:free',
    apiKey: 'private-openrouter-key',
  })
  const rows = await db.select().from(settingsKv)
  expect(JSON.stringify(rows)).not.toContain('private-openrouter-key')
  const presence = await clearAiProviderSecret('openrouter')
  expect(presence).toEqual({
    openai: true,
    anthropic: false,
    gemini: false,
    openrouter: false,
  })
  expect(await loadActiveProviderConfig(db)).toBeNull()
})

it.each(['replacement-key', 'same-key'] as const)(
  'changes the OpenRouter trusted configuration identity on a %s save',
  async (kind) => {
    const { db } = await createTestDb({ seed: false })
    await updateSettings(db, {
      aiAssessment: {
        enabled: true,
        provider: 'openrouter',
        model: 'openrouter/free',
      },
    })
    await setAiProviderSecret('openrouter', {
      apiKey: 'private-openrouter-key',
    })
    const saved = await loadActiveProviderConfigSnapshot(db)
    expect(saved).not.toBeNull()
    await setAiProviderSecret('openrouter', {
      apiKey:
        kind === 'same-key'
          ? 'private-openrouter-key'
          : 'replacement-openrouter-key',
    })
    expect((await loadActiveProviderConfigSnapshot(db))?.identity).not.toBe(
      saved?.identity,
    )
  },
)
```

- [ ] Add OpenRouter runtime contract proof, importing
      `clearAiProviderSecretRequestSchema` alongside the existing contract
      imports in `src/features/genai/api/genai-settings-contracts.test.ts`:

```ts
it('accepts the fourth provider in strict secret and connection contracts', () => {
  expect(
    setAiProviderSecretRequestSchema.parse({
      surface: 'dashboard',
      provider: 'openrouter',
      secret: { apiKey: 'local-key' },
    }).provider,
  ).toBe('openrouter')
  expect(
    clearAiProviderSecretRequestSchema.parse({
      surface: 'dashboard',
      provider: 'openrouter',
    }).provider,
  ).toBe('openrouter')
  expect(
    testAiConnectionRequestSchema.parse({
      surface: 'dashboard',
      provider: 'openrouter',
      model: ' openrouter/free ',
    }),
  ).toEqual({
    surface: 'dashboard',
    provider: 'openrouter',
    model: 'openrouter/free',
  })
  expect(
    testAiConnectionResponseSchema.parse({
      status: 'success',
      provider: 'openrouter',
      model: 'openrouter/free',
      durationMs: 12,
    }).provider,
  ).toBe('openrouter')
})
```

- [ ] Add cache/privacy transport proof in
      `src/features/genai/api/genai-settings-hooks.test.tsx`:

```ts
it('saves and removes the OpenRouter key with strict presence and no secret in caches', async () => {
  const savedPresence = {
    openai: false,
    anthropic: false,
    gemini: false,
    openrouter: true,
  }
  vi.mocked(sendMessage).mockResolvedValue(savedPresence)
  const { result } = renderHook(
    () => ({
      save: useSetAiProviderSecretMutation(),
      remove: useClearAiProviderSecretMutation(),
    }),
    { wrapper },
  )
  await act(async () => {
    await result.current.save.mutateAsync({
      provider: 'openrouter',
      key: 'private-openrouter-key',
    })
  })
  expect(sendMessage).toHaveBeenCalledWith('genai.setAiProviderSecret', {
    surface: 'dashboard',
    provider: 'openrouter',
    secret: { apiKey: 'private-openrouter-key' },
  })
  expect(queryClient.getQueryData(['genai', 'secret-presence'])).toEqual(
    savedPresence,
  )
  expect(
    JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain('private-openrouter-key')
  expect(
    JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.variables),
    ),
  ).not.toContain('private-openrouter-key')
  const removedPresence = { ...savedPresence, openrouter: false }
  vi.mocked(sendMessage).mockResolvedValue(removedPresence)
  await act(async () => {
    await result.current.remove.mutateAsync({ provider: 'openrouter' })
  })
  expect(sendMessage).toHaveBeenCalledWith('genai.clearAiProviderSecret', {
    surface: 'dashboard',
    provider: 'openrouter',
  })
  expect(queryClient.getQueryData(['genai', 'secret-presence'])).toEqual(
    removedPresence,
  )
})
```

- [ ] Add settings domain and repository persistence proof. In
      `src/features/settings/domain/settings.test.ts`:

```ts
it('round-trips a saved custom OpenRouter model and toggles only enabled', () => {
  const saved = {
    ...defaultUserSettings,
    aiAssessment: {
      enabled: false,
      provider: 'openrouter' as const,
      model: 'vendor/custom-model:free',
    },
  }
  expect(userSettingsSchema.parse(saved)).toEqual(saved)
  expect(parseStoredUserSettings(saved)).toEqual(saved)
  const patch = userSettingsPatchSchema.parse({
    aiAssessment: { enabled: true },
  })
  expect(mergeUserSettings(saved, patch).aiAssessment).toEqual({
    ...saved.aiAssessment,
    enabled: true,
  })
})
```

In `src/features/settings/data/settings-repository.test.ts`:

```ts
it('persists an OpenRouter connection exactly without changing unrelated defaults', async () => {
  const handle = await createTestDb({ seed: false })
  const repository = createSettingsRepository(handle.db)
  const aiAssessment = {
    enabled: false,
    provider: 'openrouter' as const,
    model: 'vendor/custom-model:free',
  }
  await repository.updateSettings({ aiAssessment })
  await repository.updateSettings({ practice: { dailyGoal: 9 } })
  const reopened = await createSettingsRepository(handle.db).getSettings()
  expect(reopened.aiAssessment).toEqual(aiAssessment)
  expect(reopened.practice.dailyGoal).toBe(9)
  expect(reopened.schemaVersion).toBe(defaultUserSettings.schemaVersion)
  const rows = await handle.db.select().from(settingsKv)
  expect(rows).toHaveLength(1)
  expect(JSON.parse(rows[0]!.value).aiAssessment).toEqual(aiAssessment)
})
```

- [ ] Update every existing presence object listed in the fixture table below
      with an explicit fourth boolean before the focused run. The unchanged
      direct-provider tests should retain their original true/false values.

- [ ] Run focused RED:

```sh
rtk npm run test -- src/platform/secrets/secret-store.test.ts src/features/genai/domain/genai-secrets-types.test.ts src/features/genai/server/genai-secret-storage.test.ts src/features/genai/server/genai-settings-service.test.ts src/features/genai/api/genai-settings-contracts.test.ts src/features/genai/api/genai-settings-hooks.test.tsx src/features/settings/domain/settings.test.ts src/features/settings/data/settings-repository.test.ts src/extension/background/register-handlers.test.ts
```

Expected before implementation: OpenRouter lifecycle/strict contract tests fail
because the platform ID, mapping, and presence schema exclude it. Existing
direct-provider tests remain meaningful after the explicit fixture migration.

- [ ] Append `'genai:openrouter'` to `secretProviderIdSchema` in
      `src/platform/secrets/secret-contracts.ts`:

```ts
export const secretProviderIdSchema = z.enum([
  'github:gist',
  'genai:openai',
  'genai:anthropic',
  'genai:google',
  'genai:openrouter',
])
```

- [ ] Extend the presence schema in
      `src/features/genai/domain/genai-secrets-types.ts`:

```ts
export const aiProviderSecretPresenceSchema = z.strictObject({
  openai: z.boolean(),
  anthropic: z.boolean(),
  gemini: z.boolean(),
  openrouter: z.boolean(),
})
```

Keep `makeEmptyAiProviderSecretPresence` derived from `genAiProviderIds`.

- [ ] Extend the trusted mapping in
      `src/features/genai/server/genai-secret-storage.ts`:

```ts
const secretProviderByGenAiProvider = {
  openai: 'genai:openai',
  anthropic: 'genai:anthropic',
  gemini: 'genai:google',
  openrouter: 'genai:openrouter',
} as const satisfies Record<GenAiProviderId, SecretProviderId>
```

- [ ] Run trusted-key GREEN:

```sh
rtk npm run test -- src/platform/secrets/secret-store.test.ts src/features/genai/domain/genai-secrets-types.test.ts src/features/genai/server/genai-secret-storage.test.ts src/features/genai/server/genai-settings-service.test.ts src/features/genai/api/genai-settings-contracts.test.ts src/features/genai/api/genai-settings-hooks.test.tsx src/features/settings/domain/settings.test.ts src/features/settings/data/settings-repository.test.ts src/extension/background/register-handlers.test.ts
```

Expected: PASS. Keep per-provider storage, serialization, after-persist invalidation, credentials-only snapshots, cache redaction, and background authorization.

### Strict Presence Fixture Inventory

Exactly these existing test files contain three-provider presence literals:

| File                                                                       | Current locations to update with `openrouter: false`                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/extension/background/register-handlers.test.ts`                       | 485, 497, 503, 1194, 1224                                             |
| `src/features/genai/domain/genai-secrets-types.test.ts`                    | 30, 40, 45, 47, 54 (including invalid and expected objects)           |
| `src/features/genai/api/genai-settings-hooks.test.tsx`                     | 44, 55, 69, 94, 122, 144, 170, 206, 222, 225, 246, 279, 353           |
| `src/features/genai/server/genai-secret-storage.test.ts`                   | 101                                                                   |
| `src/features/genai/server/genai-settings-service.test.ts`                 | 32, 41, 61                                                            |
| `src/features/settings/hooks/use-ai-connection-controller.test.tsx`        | 34; helper's hardcoded set/clear behavior is replaced below           |
| `src/features/settings/components/settings-screen.test.tsx`                | 393, 478, 535                                                         |
| `src/features/settings/components/sections/ai-assessment-section.test.tsx` | 28, 221; helper's hardcoded set/clear/test behavior is replaced below |

For example, every valid or intentional-extra-field fixture of the old shape
must become:

```ts
{ openai: true, anthropic: false, gemini: false, openrouter: false }
```

Do not add a broad fixture abstraction just for this provider. Preserve the
current isolated helpers and use schema parsing where they dispatch requests.

## Task 2: Native OpenRouter Structured Transport And Controlled Errors

**Files:**

- Modify `package.json` and `package-lock.json`.

- Modify: `src/lib/ai/generate-json.ts`
- Modify/test: `src/lib/ai/generate-json.test.ts`
- Modify/test: `src/lib/ai/operation.test.ts`
- No production edit: `src/lib/ai/operation.ts`

- [ ] Install the exact published provider version after Task 1's locked install. Preserve current AI SDK/Zod versions:

```sh
rtk npm install --save-exact @openrouter/ai-sdk-provider@3.1.0
rtk npm ls ai zod @openrouter/ai-sdk-provider
```

Expected: provider `3.1.0`, existing compatible AI SDK `7.0.127` and Zod `4.4.3`, no invalid peer dependency or unrelated version upgrade. This package's peer ranges were verified against the published registry during planning.

- [ ] **Step 1: Extend native fixtures and shared regression suites**

Add the value import alongside the existing type import in
`src/lib/ai/generate-json.test.ts`:

```ts
import { aiProviderIds } from './types'
```

Replace `models` with:

```ts
const models = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-5-20250929',
  gemini: 'gemini-3.5-flash-lite',
  openrouter: 'openrouter/free',
}
```

Add this case to the existing `successBody` switch:

```ts
    case 'openrouter':
      return {
        id: 'gen_test',
        model: 'test/resolved-text-model:free',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }
```

Add this branch immediately after `message` is defined in `errorBody`:

```ts
if (provider === 'openrouter')
  return {
    error: {
      code: status,
      message,
      metadata: { error_type: tag, raw: message },
    },
  }
```

For each of the following five existing suites, replace only the provider list
`['openai', 'anthropic', 'gemini'] as const` with `aiProviderIds`:

- `uses %s native structured wire with explicit credentials and bounded output`
- `keeps original literals, nullable fields and constraints for %s`
- `rejects invalid JSON and output schema for %s`
- `does not retry or log %s provider failures`
- `rejects malformed native %s envelopes and fetch failures safely`

Keep the existing direct-provider-only native safety and truncation suites
unchanged; add OpenRouter-specific cases below because their native formats
differ.

In the first suite, insert this branch between Anthropic and the final Gemini
branch. Add `expect(init?.redirect).toBe('error')` next to the existing signal
assertion for every provider.

```ts
      } else if (provider === 'openrouter') {
        expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
        expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`)
        expect(body).toMatchObject({
          model: 'openrouter/free',
          max_tokens: 2048,
          response_format: {
            type: 'json_schema',
            json_schema: {
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['ok'],
                properties: { ok: { const: true, type: 'boolean' } },
              },
            },
          },
          provider: { require_parameters: true },
        })
        expect(body).not.toHaveProperty('models')
        expect(body).not.toHaveProperty('route')
        expect(body).not.toHaveProperty('plugins')
        expect(result).toMatchObject({
          providerMetadata: {
            model: 'openrouter/free',
            resolvedModel: 'test/resolved-text-model:free',
          },
        })
```

- [ ] **Step 2: Add Meaningful OpenRouter Tests**

Add these tests within the existing `generateJson actual SDK wire` describe.
They keep the real `generateText` and adapter code; only `globalThis.fetch` is
mocked. A native `{ error }` at HTTP 200 becomes flattened SDK `data`, while
non-2xx error responses exercise wrapped SDK `data.error`.

```ts
it('keeps an explicit custom OpenRouter model and the full analysis token budget', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(jsonResponse(successBody('openrouter')))
  const result = await generateJson(
    request('openrouter', {
      model: 'test/custom-model',
      maxOutputTokens: 8192,
    }),
  )
  expect(result).toMatchObject({
    status: 'success',
    providerMetadata: {
      model: 'test/custom-model',
      resolvedModel: 'test/resolved-text-model:free',
    },
  })
  const body: unknown = JSON.parse(
    requestBodyText(fetchMock.mock.calls[0]![1]?.body),
  )
  expect(body).toMatchObject({
    model: 'test/custom-model',
    max_tokens: 8192,
    provider: { require_parameters: true },
  })
  expect(body).not.toHaveProperty('models')
  expect(fetchMock).toHaveBeenCalledOnce()
})
```

- [ ] Add successful metadata omission/boundary tests:

```ts
it.each([
  undefined,
  '',
  '   ',
  'openrouter/free',
  'openrouter/auto',
  'x'.repeat(121),
])('omits unusable OpenRouter served-model identity %j', async (model) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    jsonResponse({ ...successBody('openrouter'), model }),
  )
  const result = await generateJson(request('openrouter'))
  expect(result).toMatchObject({
    status: 'success',
    providerMetadata: { provider: 'openrouter', model: 'openrouter/free' },
  })
  if (result.status === 'success')
    expect(result.providerMetadata).not.toHaveProperty('resolvedModel')
})

it('omits a served-model identity equal to the exact custom requested model', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    jsonResponse({ ...successBody('openrouter'), model: 'test/custom-model' }),
  )
  const result = await generateJson(
    request('openrouter', { model: 'test/custom-model' }),
  )
  expect(result).toMatchObject({
    status: 'success',
    providerMetadata: { model: 'test/custom-model' },
  })
  if (result.status === 'success')
    expect(result.providerMetadata).not.toHaveProperty('resolvedModel')
})

it('preserves a valid 120-character resolved ID without truncation', async () => {
  const model = `test/${'x'.repeat(115)}`
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    jsonResponse({ ...successBody('openrouter'), model }),
  )
  expect(await generateJson(request('openrouter'))).toMatchObject({
    status: 'success',
    providerMetadata: { model: 'openrouter/free', resolvedModel: model },
  })
})

it.each([null, 10])(
  'rejects malformed native served-model field %j without weakening the adapter schema',
  async (model) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ ...successBody('openrouter'), model }),
    )
    const result = await generateJson(request('openrouter'))
    expect(result).toMatchObject({ status: 'error', code: 'invalid-output' })
    expectSafe(result)
  },
)

it.each(['openai', 'anthropic', 'gemini'] as const)(
  'keeps %s metadata unchanged by OpenRouter model resolution',
  async (provider) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(successBody(provider)),
    )
    const result = await generateJson(request(provider))
    expect(result.status).toBe('success')
    if (result.status === 'success')
      expect(result.providerMetadata).not.toHaveProperty('resolvedModel')
  },
)
```

- [ ] Add HTTP and embedded-code normalization/redaction tests:

```ts
it.each([
  [400, 'bad-request'],
  [401, 'auth'],
  [402, 'billing'],
  [403, 'permission'],
  [404, 'model-unavailable'],
  [408, 'network'],
  [422, 'bad-request'],
  [429, 'rate-limit'],
  [500, 'network'],
  [502, 'network'],
  [503, 'network'],
  [504, 'network'],
] as const)(
  'normalizes OpenRouter HTTP and embedded numeric %s to %s',
  async (code, expected) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    for (const transportStatus of [code, 200]) {
      fetchMock.mockClear()
      fetchMock.mockResolvedValue(
        jsonResponse(errorBody('openrouter', code), transportStatus),
      )
      const result = await generateJson(request('openrouter'))
      expect(result).toMatchObject({ status: 'error', code: expected })
      expectSafe(result)
      expect(fetchMock).toHaveBeenCalledOnce()
      if (result.status === 'error') {
        expect(result.providerMetadata).not.toHaveProperty('resolvedModel')
        if (expected === 'billing') {
          expect(result.message).toContain('OpenRouter balance')
          expect(result.message).toContain('key spending limit')
          expect(result.message).toContain('pending paid requests')
        }
        if (expected === 'model-unavailable') {
          expect(result.message).toContain('capabilities')
          expect(result.message).toContain('privacy')
        }
      }
    }
  },
)
```

- [ ] Add allowlisted machine-tag normalization tests:

```ts
it.each([
  ['authentication', 'auth'],
  ['permission_denied', 'permission'],
  ['payment_required', 'billing'],
  ['not_found', 'model-unavailable'],
  ['rate_limit_exceeded', 'rate-limit'],
  ['provider_overloaded', 'network'],
  ['provider_unavailable', 'network'],
  ['context_length_exceeded', 'bad-request'],
  ['max_tokens_exceeded', 'invalid-output'],
  ['token_limit_exceeded', 'bad-request'],
  ['string_too_long', 'bad-request'],
  ['invalid_request', 'bad-request'],
  ['invalid_prompt', 'bad-request'],
  ['precondition_failed', 'bad-request'],
  ['payload_too_large', 'bad-request'],
  ['unprocessable', 'bad-request'],
  ['content_policy_violation', 'refused'],
  ['refusal', 'refused'],
  ['server', 'network'],
  ['timeout', 'timeout'],
] as const)(
  'normalizes allowlisted OpenRouter metadata.error_type %s to %s',
  async (tag, code) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    for (const transportStatus of [400, 200]) {
      fetchMock.mockClear()
      fetchMock.mockResolvedValue(
        jsonResponse(errorBody('openrouter', 400, tag), transportStatus),
      )
      const result = await generateJson(request('openrouter'))
      expect(result).toMatchObject({ status: 'error', code })
      expectSafe(result)
      expect(fetchMock).toHaveBeenCalledOnce()
    }
  },
)
```

- [ ] Add unsafe-code, status-precedence, and direct-provider regression tests:

```ts
it.each([undefined, '402', 402.5, 200, 499, 999, { code: 402 }])(
  'ignores unknown or unsafe embedded OpenRouter code %j',
  async (code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        error: {
          code,
          type: 'authentication_error',
          message: `private provider diagnostic ${API_KEY} billing auth no endpoints`,
          metadata: {
            error_type: 'unrecognized_tag',
            raw: { code: 402, error_type: 'payment_required', key: API_KEY },
          },
        },
      }),
    )
    const result = await generateJson(request('openrouter'))
    expect(result).toMatchObject({ status: 'error', code: 'invalid-output' })
    expectSafe(result)
  },
)

it.each([402, 499])(
  'does not let embedded code %s override failing HTTP status',
  async (code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(errorBody('openrouter', code), 401),
    )
    expect(await generateJson(request('openrouter'))).toMatchObject({
      status: 'error',
      code: 'auth',
    })
  },
)

it('keeps unknown OpenRouter 503 as network without inferring a privacy cause', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    jsonResponse(
      {
        error: {
          code: 503,
          message: `private provider diagnostic ${API_KEY} no endpoints match privacy`,
        },
      },
      503,
    ),
  )
  const result = await generateJson(request('openrouter'))
  expect(result).toMatchObject({ status: 'error', code: 'network' })
  expectSafe(result)
  if (result.status === 'error') expect(result.message).not.toContain('privacy')
})

it.each(['openai', 'anthropic', 'gemini'] as const)(
  'ignores OpenRouter billing tags for direct provider %s',
  async (provider) => {
    const body = errorBody(provider, 402)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          ...body,
          error: {
            ...body.error,
            metadata: { error_type: 'payment_required', raw: API_KEY },
          },
        },
        402,
      ),
    )
    const result = await generateJson(request(provider))
    expect(result).toMatchObject({ status: 'error', code: 'unknown' })
    expectSafe(result)
  },
)
```

- [ ] Add native refusal and truncation tests:

```ts
it.each([
  ['content_filter', 'refused'],
  ['length', 'invalid-output'],
] as const)(
  'rejects native OpenRouter %s even when the response JSON is valid',
  async (finishReason, code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        ...successBody('openrouter'),
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '{"ok":true}' },
            finish_reason: finishReason,
          },
        ],
      }),
    )
    const result = await generateJson(request('openrouter'))
    expect(result).toMatchObject({ status: 'error', code })
    expectSafe(result)
  },
)
```

The object-valued `code` test deliberately fails the adapter's native envelope
schema, which still yields controlled `invalid-output`; it does not imply that
the adapter supplies arbitrary objects to the normalizer. Missing `model` is
allowed by the adapter and might be filled from the requested ID by AI SDK;
the equality guard still omits it. Numeric/null native `model` fields fail the
adapter schema before metadata handling and must remain controlled invalid
output, rather than weakening the native schema.

- [ ] **Step 3: Add Deadline And Cancellation Coverage Through OpenRouter**

In `generate-json.test.ts`, replace the existing stalled phase test with the
following complete test, extending its existing Gemini regression cases:

```ts
it.each([
  ['gemini', 'headers'],
  ['gemini', 'success body'],
  ['gemini', 'error body'],
  ['openrouter', 'headers'],
  ['openrouter', 'success body'],
  ['openrouter', 'error body'],
] as const)(
  'bounds stalled %s %s even when the transport ignores abort',
  async (provider, phase) => {
    vi.useFakeTimers()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      phase === 'headers'
        ? new Promise(() => {})
        : Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('{'))
                },
              }),
              {
                status: phase === 'error body' ? 400 : 200,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          ),
    )
    const pending = generateJson(request(provider, { timeoutMs: 40 }))
    await vi.advanceTimersByTimeAsync(41)
    const result = await pending
    expect(result).toMatchObject({ status: 'error', code: 'timeout' })
    expectSafe(result)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  },
)
```

Replace the current cancellation test with:

```ts
it.each(['gemini', 'openrouter'] as const)(
  'cancels %s promptly and prevents an already cancelled request from fetching',
  async (provider) => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise(() => {}))
    const pending = generateJson(
      request(provider, { signal: controller.signal }),
    )
    await vi.advanceTimersByTimeAsync(1)
    controller.abort(new Error(`private provider diagnostic ${API_KEY}`))
    const result = await pending
    expect(result).toMatchObject({ status: 'error', code: 'cancelled' })
    expectSafe(result)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    fetchMock.mockClear()
    expect(
      await generateJson(request(provider, { signal: controller.signal })),
    ).toMatchObject({ status: 'error', code: 'cancelled' })
    expect(fetchMock).not.toHaveBeenCalled()
  },
)
```

Replace the asynchronous schema validation deadline test with:

```ts
it.each(['gemini', 'openrouter'] as const)(
  'keeps the %s deadline active during asynchronous schema validation',
  async (provider) => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(successBody(provider)),
    )
    const stalledSchema = schema.refine(
      async () => new Promise<boolean>(() => {}),
    )
    const pending = generateJson({
      ...request(provider),
      schema: stalledSchema,
      timeoutMs: 40,
    })
    await vi.advanceTimersByTimeAsync(41)
    expect(await pending).toMatchObject({ status: 'error', code: 'timeout' })
    expect(vi.getTimerCount()).toBe(0)
  },
)
```

Add to the existing `withAiDeadline` describe in `operation.test.ts`:

```ts
it.each([
  ['timeout', 'resolve'],
  ['timeout', 'reject'],
  ['cancelled', 'resolve'],
  ['cancelled', 'reject'],
] as const)(
  'keeps %s settled and cleaned up when ignored-abort work later %s',
  async (code, lateOutcome) => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    let resolveWork: (value: number) => void = () => {}
    let rejectWork: (reason: Error) => void = () => {}
    const work = new Promise<number>((resolve, reject) => {
      resolveWork = resolve
      rejectWork = reject
    })
    const pending = withAiDeadline(
      { timeoutMs: 40, signal: controller.signal },
      () => work,
    )
    const assertion = expect(pending).rejects.toMatchObject({ code })
    await Promise.resolve()
    if (code === 'timeout') await vi.advanceTimersByTimeAsync(41)
    else controller.abort(new Error('private key from caller'))
    await assertion
    expect(remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    if (lateOutcome === 'resolve') resolveWork(42)
    else rejectWork(new Error('private provider diagnostic'))
    await Promise.resolve()
    await expect(pending).rejects.toMatchObject({ code })
    expect(remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  },
)
```

- [ ] **Step 4: Run The Failing Focused Tests**

With Task 1 complete and `@openrouter/ai-sdk-provider@3.1.0` installed at the start of this task, run:

```sh
rtk npm run test -- src/lib/ai/generate-json.test.ts src/lib/ai/operation.test.ts
```

Expected: OpenRouter cases fail because it has no endpoint/model construction
and the new error/metadata behavior is absent. Existing direct-provider
regressions and generic deadline tests should pass. Do not accept a failed
import, syntax, or TypeScript error as the meaningful failing test.

- [ ] **Step 5: Implement The Minimal Transport Changes**

Add in `generate-json.ts`:

```ts
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
```

Add to `endpoints`:

```ts
  openrouter: 'https://openrouter.ai/api/v1',
```

Add the new controlled error message to `messages`:

```ts
  billing:
    'Check your OpenRouter balance or key spending limit, or retry after pending paid requests finish.',
```

Add after `messages`:

```ts
const openRouterModelUnavailableMessage =
  'The selected OpenRouter model may be unavailable or excluded by required capabilities or account privacy/routing settings. Check the model and your OpenRouter settings.'
```

After the existing finish-reason checks, replace the success return with:

```ts
const resolvedModel =
  request.provider === 'openrouter'
    ? validResolvedModel(result.response.modelId, request.model)
    : undefined
return {
  status: 'success' as const,
  data: result.output,
  providerMetadata: {
    ...metadata(),
    ...(resolvedModel === undefined ? {} : { resolvedModel }),
  },
}
```

Replace the error return's `message: messages[code]` with:

```ts
      message:
        request.provider === 'openrouter' && code === 'model-unavailable'
          ? openRouterModelUnavailableMessage
          : messages[code],
```

Add this case to `createModel`; the other cases stay byte-for-byte unchanged:

```ts
    case 'openrouter':
      return createOpenRouter({
        apiKey: request.apiKey,
        baseURL: endpoints.openrouter,
        fetch: providerFetch,
        compatibility: 'strict',
      }).chat(request.model, {
        structuredOutputs: { strict: true },
        provider: { require_parameters: true },
      })
```

Add this function before `normalizeError`:

```ts
function validResolvedModel(
  value: unknown,
  requestedModel: string,
): string | undefined {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 120 ||
    value === requestedModel ||
    value === 'openrouter/free' ||
    value === 'openrouter/auto'
  )
    return undefined
  return value
}
```

Replace only the `APICallError` branch inside `normalizeError` with this
complete branch. The remaining `normalizeError` and direct-provider helpers
stay unchanged.

```ts
if (APICallError.isInstance(error)) {
  const status = transportStatus ?? error.statusCode
  if (provider === 'openrouter') {
    const code = normalizeOpenRouterError(error.data, status)
    if (code !== undefined) return code
    if (status === 402) return 'billing'
  }
  const tags =
    provider === 'openrouter' ? [] : providerErrorTags(error.data, provider)
  if (
    tags.includes('API_KEY_INVALID') ||
    tags.includes('invalid_api_key') ||
    tags.includes('authentication_error') ||
    tags.includes('UNAUTHENTICATED')
  )
    return 'auth'
  if (tags.includes('PERMISSION_DENIED') || tags.includes('permission_error'))
    return 'permission'
  if (
    tags.includes('model_not_found') ||
    tags.includes('NOT_FOUND') ||
    tags.includes('not_found_error')
  )
    return 'model-unavailable'
  if (
    tags.includes('RESOURCE_EXHAUSTED') ||
    tags.includes('insufficient_quota')
  )
    return 'rate-limit'
  if (isProviderRefusal(error.cause, provider)) return 'refused'
  if (status === 401) return 'auth'
  if (status === 403) return 'permission'
  if (status === 404) return 'model-unavailable'
  if (status === 429) return 'rate-limit'
  if (status === 400 || status === 422) return 'bad-request'
  if (
    status === 408 ||
    (status !== undefined && status >= 500) ||
    (status === undefined && error.isRetryable)
  )
    return 'network'
  if (status !== undefined && status >= 200 && status < 300)
    return 'invalid-output'
  return 'unknown'
}
```

Add these helpers after `asRecord`:

```ts
const openRouterMachineErrorCodes = new Map<string, AiErrorCode>([
  ['authentication', 'auth'],
  ['permission_denied', 'permission'],
  ['payment_required', 'billing'],
  ['not_found', 'model-unavailable'],
  ['rate_limit_exceeded', 'rate-limit'],
  ['provider_overloaded', 'network'],
  ['provider_unavailable', 'network'],
  ['context_length_exceeded', 'bad-request'],
  ['max_tokens_exceeded', 'invalid-output'],
  ['token_limit_exceeded', 'bad-request'],
  ['string_too_long', 'bad-request'],
  ['invalid_request', 'bad-request'],
  ['invalid_prompt', 'bad-request'],
  ['precondition_failed', 'bad-request'],
  ['payload_too_large', 'bad-request'],
  ['unprocessable', 'bad-request'],
  ['content_policy_violation', 'refused'],
  ['refusal', 'refused'],
  ['server', 'network'],
  ['timeout', 'timeout'],
])

const openRouterEmbeddedStatusCodes = new Map<number, AiErrorCode>([
  [400, 'bad-request'],
  [401, 'auth'],
  [402, 'billing'],
  [403, 'permission'],
  [404, 'model-unavailable'],
  [408, 'network'],
  [422, 'bad-request'],
  [429, 'rate-limit'],
  [500, 'network'],
  [502, 'network'],
  [503, 'network'],
  [504, 'network'],
])

/** Read only numeric machine codes and allowlisted metadata; never raw text. */
function normalizeOpenRouterError(
  data: unknown,
  transportStatus: number | undefined,
): AiErrorCode | undefined {
  const record = asRecord(data)
  const error = asRecord(record?.error) ?? record
  const tag = asRecord(error?.metadata)?.error_type
  if (typeof tag === 'string') {
    const code = openRouterMachineErrorCodes.get(tag)
    if (code !== undefined) return code
  }
  if (
    transportStatus === undefined ||
    transportStatus < 200 ||
    transportStatus >= 300
  )
    return undefined
  const embeddedStatus = error?.code
  return typeof embeddedStatus === 'number' && Number.isInteger(embeddedStatus)
    ? openRouterEmbeddedStatusCodes.get(embeddedStatus)
    : undefined
}
```

This retains one `generateText` call, `maxRetries: 0`, explicit abort signal,
whole-operation deadline, redirect rejection, telemetry suppression, schema
validation and the existing token limit. It does not add `models`, automatic
Retry, paid fallback IDs, plugins, routing privacy overrides, or a URL setting.
OpenRouter's own routing within the one HTTP request remains account-owned.

- [ ] **Step 6: Run Focused Tests And Formatting**

```sh
rtk npm run test -- src/lib/ai/generate-json.test.ts src/lib/ai/operation.test.ts
rtk npx prettier --write src/lib/ai/generate-json.ts src/lib/ai/generate-json.test.ts src/lib/ai/operation.test.ts
rtk npx prettier --check src/lib/ai/generate-json.ts src/lib/ai/generate-json.test.ts src/lib/ai/operation.test.ts
rtk git diff --check
```

Expected: native-wire, malformed-output, direct-provider regression, error
redaction, cancellation, stalled-body and deadline tests pass; formatting and
diff checks pass. The full feature task must also run the approved `lint`,
`check`, `build`, `zip`, and `store:check` commands. Do not represent mocked
native-wire checks as live report-quality evidence or human installed-extension
proof.

Continue Task 3 before committing the provider core; the analysis response contract must also accept the expanded provider union.

## Task 3: Analysis Runtime, Stale Identity, Billing Recovery, And Host Boundary

**Files:**

- Modify `src/features/leetcode-review-assistant/api/code-analysis-contracts.ts`.
- Modify `src/features/overlay-session/hooks/use-leetcode-code-analysis.ts`.
- Modify `src/features/genai/testing/genai-fixtures.ts`.
- Modify `wxt.config.ts`.
- Modify/test `src/testing/architecture-boundaries.test.ts`.
- Test `src/features/leetcode-review-assistant/api/code-analysis-contracts.test.ts`.
- Test `src/features/leetcode-review-assistant/server/code-analysis-service.test.ts`.
- Test `src/features/leetcode-review-assistant/server/analysis-runtime-service.test.ts`.
- Test `src/features/genai/server/genai-connection-service.test.ts`.
- Test `src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx`.

- [ ] Add response-contract regressions to `src/features/leetcode-review-assistant/api/code-analysis-contracts.test.ts`, using its existing fixture imports:

```ts
it('preserves requested and resolved OpenRouter model identities in a strict ready response', () => {
  const response = {
    status: 'ready',
    ...analysisIdentity(makeAnalysisRequest()),
    report: makeValidAnalysis(),
    providerMetadata: {
      provider: 'openrouter',
      model: 'openrouter/free',
      resolvedModel: 'test/served-model:free',
      durationMs: 10,
    },
  }
  expect(responseSchema.parse(response)).toEqual(response)
  for (const resolvedModel of ['', ' \n\t ', 'x'.repeat(121), null, 10]) {
    expect(
      responseSchema.safeParse({
        ...response,
        providerMetadata: { ...response.providerMetadata, resolvedModel },
      }).success,
    ).toBe(false)
  }
  expect(
    responseSchema.safeParse({
      ...response,
      providerMetadata: { ...response.providerMetadata, apiKey: 'private-key' },
    }).success,
  ).toBe(false)
  expect(
    responseSchema.safeParse({
      ...response,
      providerMetadata: {
        ...response.providerMetadata,
        provider: 'unknown-provider',
      },
    }).success,
  ).toBe(false)
  const { resolvedModel, ...withoutResolution } = response.providerMetadata
  expect(resolvedModel).toBe('test/served-model:free')
  expect(
    responseSchema.parse({ ...response, providerMetadata: withoutResolution }),
  ).toMatchObject({
    providerMetadata: { provider: 'openrouter', model: 'openrouter/free' },
  })
})

it('accepts a controlled billing failure without adding provider bodies', () => {
  const response = {
    status: 'error',
    ...analysisIdentity(makeAnalysisRequest()),
    code: 'billing',
    message: 'Check your OpenRouter balance or key spending limit.',
  }
  expect(responseSchema.parse(response)).toEqual(response)
  expect(
    responseSchema.safeParse({ ...response, raw: 'private upstream body' })
      .success,
  ).toBe(false)
})
```

- [ ] Extend the existing overlay `it.each` Settings-recovery list with billing. Keep its current test callback that verifies `showSettings: true` and `canRetry: true`:

```ts
it.each([
  'auth',
  'permission',
  'bad-request',
  'model-unavailable',
  'billing',
  'not-configured',
  'stale-configuration',
] as const)('offers Settings for %s', async (code) => {
  analyze.mockImplementation((request) =>
    Promise.resolve({
      status: 'error',
      ...analysisIdentity(request),
      code,
      message: 'Controlled message.',
    }),
  )
  const { result } = mount()
  await waitFor(() =>
    expect(result.current.state).toMatchObject({
      status: 'error',
      code,
      showSettings: true,
      canRetry: true,
    }),
  )
})
```

- [ ] Add OpenRouter to the architecture test's exact approved list before changing the manifest. Expand only its SDK-package recognition regex:

```ts
const approvedAiProviderHostPermissions = [
  'https://api.openai.com/*',
  'https://api.anthropic.com/*',
  'https://generativelanguage.googleapis.com/*',
  'https://openrouter.ai/*',
]
```

```ts
;/(?:from\s+|import\s*\()\s*['"](?:ai|@ai-sdk\/[^'"]+|@openrouter\/ai-sdk-provider)['"]/.test(
  readFileSync(file, 'utf8'),
)
```

Preserve the existing shared-library ownership assertion and exact non-AI hosts.

- [ ] Run focused RED:

```sh
rtk npm run test -- src/features/leetcode-review-assistant/api/code-analysis-contracts.test.ts src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx src/testing/architecture-boundaries.test.ts
```

Expected: OpenRouter metadata, billing Settings action, and approved-host equality fail against the old schema, recovery set, and manifest. Existing sender authorization and direct-provider tests retain coverage.

- [ ] Use the shared provider list and bounded optional metadata in `src/features/leetcode-review-assistant/api/code-analysis-contracts.ts`:

```ts
import { aiErrorCodes, aiProviderIds } from '@/lib/ai/types'

const metadata = z.strictObject({
  provider: z.enum(aiProviderIds),
  model: z.string().max(120),
  resolvedModel: nonBlankString(120).optional(),
  durationMs: z.number().nonnegative(),
})
```

`codeAnalysisErrorCodeSchema` already derives from `aiErrorCodes`. Keep all identity, strict request, output-report, and size-limit schemas intact. Requested `model` continues to own stale-configuration comparisons; `resolvedModel` never replaces it.

- [ ] Add billing to the hook's existing recovery set:

```ts
const settingsErrors: ReadonlySet<CodeAnalysisErrorCode> = new Set([
  'auth',
  'permission',
  'bad-request',
  'model-unavailable',
  'billing',
  'not-configured',
  'stale-configuration',
])
```

- [ ] Extend the manifest with exactly the approved host:

```ts
host_permissions: [
  'https://leetcode.com/*',
  'https://www.leetcode.com/*',
  'https://api.github.com/*',
  'https://api.openai.com/*',
  'https://api.anthropic.com/*',
  'https://generativelanguage.googleapis.com/*',
  'https://openrouter.ai/*',
],
```

Keep `permissions`, CSP, runtime sender policy, and upstream model-provider domains unchanged.

- [ ] Add a reusable native test-only response to `src/features/genai/testing/genai-fixtures.ts`:

```ts
export function makeOpenRouterSuccessResponse<T>(
  payload: T,
  model = 'test/served-model:free',
): Response {
  return jsonResponse(
    {
      id: 'gen_test_1',
      object: 'chat.completion',
      created: 1,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: JSON.stringify(payload) },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    },
    200,
  )
}
```

- [ ] Add this import and native connection regression to `src/features/genai/server/genai-connection-service.test.ts`. Its existing teardown and real DB/storage harness remain:

```ts
import { makeOpenRouterSuccessResponse } from '../testing/genai-fixtures'

it('tests a saved free OpenRouter connection with its key while assessment is disabled', async () => {
  const { db } = await createTestDb({ seed: false })
  await updateSettings(db, {
    aiAssessment: {
      enabled: false,
      provider: 'openrouter',
      model: 'openrouter/free',
    },
  })
  await setAiProviderSecret('openrouter', { apiKey: 'fake-private-key' })
  const fetchMock = vi.fn<typeof fetch>(() =>
    Promise.resolve(makeOpenRouterSuccessResponse({ ok: true })),
  )
  vi.stubGlobal('fetch', fetchMock)
  const result = await testAiConnection(
    {
      surface: 'dashboard',
      provider: 'openrouter',
      model: 'openrouter/free',
    },
    () => Promise.resolve(db),
  )
  expect(result).toMatchObject({
    status: 'success',
    provider: 'openrouter',
    model: 'openrouter/free',
  })
  expect(fetchMock).toHaveBeenCalledOnce()
  const [url, init] = fetchMock.mock.calls[0]!
  expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions')
  expect(new Headers(init?.headers).get('authorization')).toBe(
    'Bearer fake-private-key',
  )
  expect(JSON.parse(String(init?.body))).toMatchObject({
    model: 'openrouter/free',
    max_tokens: 512,
  })
  expect(JSON.stringify(result)).not.toContain('fake-private-key')
  expect(result).not.toHaveProperty('resolvedModel')
})

it.each(['key', 'same-key', 'model', 'provider', 'removed-key'] as const)(
  'rejects a completed OpenRouter test after its saved %s changes',
  async (kind) => {
    const { db } = await createTestDb({ seed: false })
    await updateSettings(db, {
      aiAssessment: {
        enabled: false,
        provider: 'openrouter',
        model: 'openrouter/free',
      },
    })
    await setAiProviderSecret('openrouter', { apiKey: 'fake-private-key' })
    let finish: (response: Response) => void = () => {}
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const pending = testAiConnection(
      {
        surface: 'dashboard',
        provider: 'openrouter',
        model: 'openrouter/free',
      },
      () => Promise.resolve(db),
    )
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    if (kind === 'model')
      await updateSettings(db, { aiAssessment: { model: 'test/custom-model' } })
    else if (kind === 'provider')
      await updateSettings(db, { aiAssessment: { provider: 'openai' } })
    else if (kind === 'removed-key') await clearAiProviderSecret('openrouter')
    else
      await setAiProviderSecret('openrouter', {
        apiKey: kind === 'same-key' ? 'fake-private-key' : 'replacement-key',
      })
    finish(makeOpenRouterSuccessResponse({ ok: true }))
    expect(await pending).toMatchObject({
      status: 'error',
      code: 'stale-configuration',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  },
)
```

- [ ] Add full-report metadata forwarding proof to `src/features/leetcode-review-assistant/server/code-analysis-service.test.ts`:

```ts
it('keeps a consistent OpenRouter report with requested and served model metadata', async () => {
  const report = makeValidAnalysis()
  const openRouterConfig: AiProviderConfig = {
    provider: 'openrouter',
    model: 'openrouter/free',
    apiKey: 'fixture-secret',
  }
  const providerMetadata = {
    provider: 'openrouter' as const,
    model: 'openrouter/free',
    resolvedModel: 'test/served-model:free',
    durationMs: 10,
  }
  vi.mocked(generateJson).mockResolvedValue({
    status: 'success',
    data: report,
    providerMetadata,
  })
  expect(
    await analyzeCode(
      makeAnalysisRequest(),
      openRouterConfig,
      new AbortController().signal,
      30000,
    ),
  ).toEqual({
    status: 'success',
    data: report,
    providerMetadata,
  })
  expect(generateJson).toHaveBeenCalledOnce()
  expect(vi.mocked(generateJson).mock.calls[0]?.[0]).toMatchObject({
    ...openRouterConfig,
    schema: codeAnalysisSchema,
    timeoutMs: 30000,
    maxOutputTokens: 8192,
  })
})
```

The existing `it.each(aiErrorCodes)` now also proves billing is forwarded by this service and the background runtime without exposing provider bodies.

- [ ] Add successful/stale routed-model background proof to `src/features/leetcode-review-assistant/server/analysis-runtime-service.test.ts`:

```ts
it.each([
  'stable',
  'key',
  'same-key',
  'model',
  'provider',
  'removed-key',
  'disabled',
] as const)(
  'preserves requested OpenRouter identity and handles %s saved state after generation',
  async (kind) => {
    const routedConfig = {
      ...config,
      provider: 'openrouter' as const,
      model: 'openrouter/free',
    }
    const routedSnapshot = {
      config: routedConfig,
      identity: 'trusted-openrouter-snapshot',
    }
    const providerMetadata = {
      provider: 'openrouter' as const,
      model: 'openrouter/free',
      resolvedModel: 'test/served-model:free',
      durationMs: 7,
    }
    const current =
      kind === 'removed-key' || kind === 'disabled'
        ? null
        : {
            config:
              kind === 'model'
                ? { ...routedConfig, model: 'test/custom-model' }
                : kind === 'provider'
                  ? { ...routedConfig, provider: 'openai' as const }
                  : kind === 'key'
                    ? { ...routedConfig, apiKey: 'replacement-key' }
                    : routedConfig,
            identity:
              kind === 'stable' ? routedSnapshot.identity : `changed-${kind}`,
          }
    loadConfig
      .mockResolvedValueOnce(routedSnapshot)
      .mockResolvedValueOnce(current)
    analyzeMock.mockResolvedValue({
      status: 'success',
      data: makeValidAnalysis(),
      providerMetadata,
    })
    const result = await runAnalysis()
    expectSafe(result)
    expect(JSON.stringify(result)).not.toContain(routedSnapshot.identity)
    expect(analyzeMock).toHaveBeenCalledOnce()
    expect(loadConfig).toHaveBeenCalledTimes(2)
    if (kind === 'stable')
      expect(result).toEqual({
        status: 'ready',
        ...analysisIdentity(request),
        report: makeValidAnalysis(),
        providerMetadata,
      })
    else
      expect(result).toMatchObject({
        status: 'error',
        code: 'stale-configuration',
      })
    expect(vi.getTimerCount()).toBe(0)
  },
)
```

These tests use the requested `openrouter/free` in the configuration, even when generation serves another model. Existing generic background tests already cover configuration/startup/transport/recheck deadlines, cancellation, missing configuration, and strict identity redaction; run them unchanged.

- [ ] Run integrated GREEN and typecheck after Tasks 1–3:

```sh
rtk npm run test -- src/features/leetcode-review-assistant/api/code-analysis-contracts.test.ts src/features/leetcode-review-assistant/server/code-analysis-service.test.ts src/features/leetcode-review-assistant/server/analysis-runtime-service.test.ts src/features/genai/server/genai-connection-service.test.ts src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx src/testing/architecture-boundaries.test.ts
rtk npm run typecheck
```

Expected: all targeted tests and WXT/TypeScript pass. No production connection, analysis-service, runtime-policy, database, or report-storage edit should be needed. If typecheck reveals another exhaustive provider or strict presence site, extend that existing owner and include its focused test; do not bypass types.

- [ ] Format and check every core source/package file before the core commit:

```sh
openrouter_core_files=(
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
)
rtk npx prettier --write "${openrouter_core_files[@]}"
rtk npx prettier --check "${openrouter_core_files[@]}"
```

Expected: formatter/check exit 0.

- [ ] Commit the coherent provider core after formatting all touched core files and confirming the staged diff contains only task files:

```sh
rtk git add package.json package-lock.json src/lib/ai/types.ts src/lib/ai/generate-json.ts src/lib/ai/generate-json.test.ts src/lib/ai/operation.test.ts src/platform/secrets/secret-contracts.ts src/platform/secrets/secret-store.test.ts src/features/genai/domain/genai-types.test.ts src/features/genai/domain/genai-secrets-types.ts src/features/genai/domain/genai-secrets-types.test.ts src/features/genai/server/genai-secret-storage.ts src/features/genai/server/genai-secret-storage.test.ts src/features/genai/server/genai-settings-service.test.ts src/features/genai/server/genai-connection-service.test.ts src/features/genai/api/genai-settings-contracts.test.ts src/features/genai/api/genai-settings-hooks.test.tsx src/features/genai/testing/evaluation-provider-config.ts src/features/genai/testing/evaluation-provider-config.test.ts src/features/genai/testing/genai-fixtures.ts src/features/settings/domain/settings.test.ts src/features/settings/data/settings-repository.test.ts src/features/settings/hooks/use-ai-connection-controller.ts src/features/settings/hooks/use-ai-connection-controller.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/settings/components/settings-screen.test.tsx src/extension/background/register-handlers.test.ts src/features/leetcode-review-assistant/api/code-analysis-contracts.ts src/features/leetcode-review-assistant/api/code-analysis-contracts.test.ts src/features/leetcode-review-assistant/server/code-analysis-service.test.ts src/features/leetcode-review-assistant/server/analysis-runtime-service.test.ts src/features/overlay-session/hooks/use-leetcode-code-analysis.ts src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx src/testing/architecture-boundaries.test.ts wxt.config.ts
rtk git diff --cached --check
rtk git commit -m "feat(genai): add optional OpenRouter provider core"
```

The three Settings test files staged here contain only Task 1's necessary fourth-presence fixture edits. Task 4's new controller/UI tests and JSX belong in the later Settings commit.

## Task 4: OpenRouter Settings And Preset Interaction

### Controller Regression Proof

**Files:**

- Modify `src/features/settings/hooks/use-ai-connection-controller.ts`.
- Test `src/features/settings/hooks/use-ai-connection-controller.test.tsx`.

- [ ] Add these test imports:

```ts
import type { AiProviderSecretPresence } from '@/features/genai'
import {
  clearAiProviderSecretRequestSchema,
  setAiProviderSecretRequestSchema,
  testAiConnectionRequestSchema,
} from '@/features/genai/api'
```

- [ ] Add a second `createFixture` argument:

```ts
  presenceOverrides: Partial<AiProviderSecretPresence> = {},
```

Replace its presence initializer and three GenAI branches with these exact
blocks (retain the Settings branches and returned hook harness):

```ts
let presence: AiProviderSecretPresence = {
  openai: true,
  anthropic: false,
  gemini: false,
  openrouter: false,
  ...presenceOverrides,
}

if (method === 'genai.setAiProviderSecret') {
  const request = setAiProviderSecretRequestSchema.parse(payload)
  presence = { ...presence, [request.provider]: true }
  return Promise.resolve(presence)
}
if (method === 'genai.clearAiProviderSecret') {
  const request = clearAiProviderSecretRequestSchema.parse(payload)
  presence = { ...presence, [request.provider]: false }
  return Promise.resolve(presence)
}
if (method === 'genai.testConnection') {
  const request = testAiConnectionRequestSchema.parse(payload)
  return Promise.resolve({
    ...testSuccess,
    provider: request.provider,
    model: request.model,
  })
}
```

- [ ] Add these controller tests:

```ts
it('selects the OpenRouter suggestion without enabling assessment and discards back to the saved connection', async () => {
  const fixture = createFixture()
  await ready(fixture)
  act(() => fixture.result.current.ai.actions.setKeyInput('unsaved-key'))
  act(() => fixture.result.current.ai.actions.setProvider('openrouter'))
  expect(fixture.result.current.ai.provider).toBe('openrouter')
  expect(fixture.result.current.ai.model).toBe('openrouter/free')
  expect(fixture.result.current.ai.keyInput).toBe('')
  expect(fixture.result.current.ai.enabled).toBe(false)
  expect(fixture.result.current.ai.hasKey).toBe(false)
  expect(sendMessage).not.toHaveBeenCalledWith(
    'settings.updateSettings',
    expect.anything(),
  )
  expect(sendMessage).not.toHaveBeenCalledWith(
    'genai.testConnection',
    expect.anything(),
  )
  act(() => fixture.result.current.ai.actions.discard())
  expect(fixture.result.current.ai.provider).toBe('openai')
  expect(fixture.result.current.ai.model).toBe('saved-model')
})

it('restores an exact custom OpenRouter model and treats the free preset as an unsaved edit that clears feedback', async () => {
  const fixture = createFixture(
    {
      ...defaultUserSettings,
      aiAssessment: {
        enabled: false,
        provider: 'openrouter',
        model: 'vendor/custom-model:free',
      },
    },
    { openrouter: true },
  )
  await ready(fixture)
  expect(fixture.result.current.ai.model).toBe('vendor/custom-model:free')
  await act(async () => fixture.result.current.ai.actions.submit())
  expect(fixture.result.current.ai.connectionStatus).toBe('Connected')
  vi.mocked(sendMessage).mockClear()
  act(() => fixture.result.current.ai.actions.setModel('openrouter/free'))
  expect(fixture.result.current.ai.model).toBe('openrouter/free')
  expect(fixture.result.current.ai.hasChanges).toBe(true)
  expect(fixture.result.current.ai.feedback).toBeNull()
  expect(fixture.result.current.ai.connectionStatus).toBe(
    'Saved key · not tested',
  )
  expect(fixture.result.current.ai.enabled).toBe(false)
  expect(fixture.getStored().aiAssessment.model).toBe(
    'vendor/custom-model:free',
  )
  expect(sendMessage).not.toHaveBeenCalled()
  act(() => fixture.result.current.ai.actions.discard())
  expect(fixture.result.current.ai.model).toBe('vendor/custom-model:free')
})

it('saves a free OpenRouter connection without changing assessment enablement', async () => {
  const fixture = createFixture()
  await ready(fixture)
  act(() => fixture.result.current.ai.actions.setProvider('openrouter'))
  act(() =>
    fixture.result.current.ai.actions.setKeyInput('private-openrouter-key'),
  )
  await act(async () => fixture.result.current.ai.actions.submit())
  expect(sendMessage).toHaveBeenCalledWith('genai.setAiProviderSecret', {
    surface: 'dashboard',
    provider: 'openrouter',
    secret: { apiKey: 'private-openrouter-key' },
  })
  expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
    surface: 'dashboard',
    patch: {
      aiAssessment: { provider: 'openrouter', model: 'openrouter/free' },
    },
  })
  expect(sendMessage).toHaveBeenCalledWith('genai.testConnection', {
    surface: 'dashboard',
    provider: 'openrouter',
    model: 'openrouter/free',
  })
  expect(fixture.getStored().aiAssessment).toEqual({
    enabled: false,
    provider: 'openrouter',
    model: 'openrouter/free',
  })
  expect(fixture.result.current.ai.keyInput).toBe('')
  expect(fixture.result.current.ai.connectionStatus).toBe('Connected')
})

it('preserves an unfinished OpenRouter model and key while unrelated preferences save', async () => {
  const fixture = createFixture(
    {
      ...defaultUserSettings,
      aiAssessment: {
        enabled: false,
        provider: 'openrouter',
        model: 'vendor/saved-model',
      },
    },
    { openrouter: true },
  )
  await ready(fixture)
  act(() => {
    fixture.result.current.ai.actions.setModel('vendor/draft-model')
    fixture.result.current.ai.actions.setKeyInput('unsaved-openrouter-key')
    fixture.result.current.preferences.actions.setNumberInput('dailyGoal', '9')
  })
  await act(async () => fixture.result.current.preferences.actions.save())
  expect(fixture.getStored().practice.dailyGoal).toBe(9)
  expect(fixture.getStored().aiAssessment).toEqual({
    enabled: false,
    provider: 'openrouter',
    model: 'vendor/saved-model',
  })
  expect(fixture.result.current.ai.model).toBe('vendor/draft-model')
  expect(fixture.result.current.ai.keyInput).toBe('unsaved-openrouter-key')
  expect(fixture.result.current.ai.hasChanges).toBe(true)
  expect(sendMessage).not.toHaveBeenCalledWith(
    'genai.setAiProviderSecret',
    expect.anything(),
  )
  expect(sendMessage).not.toHaveBeenCalledWith(
    'genai.testConnection',
    expect.anything(),
  )
})

it.each(['preferences', 'reset', 'ai'] as const)(
  'keeps the preset edit behind the existing %s operation gate',
  async (operation) => {
    const fixture = createFixture(
      {
        ...defaultUserSettings,
        aiAssessment: {
          enabled: false,
          provider: 'openrouter',
          model: 'vendor/saved-model',
        },
      },
      { openrouter: true },
    )
    await ready(fixture)
    const lease: { release: (() => void) | null } = { release: null }
    act(() => {
      lease.release = fixture.result.current.gate.acquire(operation)
      fixture.result.current.ai.actions.setModel('openrouter/free')
    })
    expect(fixture.result.current.ai.model).toBe('vendor/saved-model')
    expect(fixture.result.current.ai.hasChanges).toBe(false)
    act(() => lease.release?.())
    act(() => fixture.result.current.ai.actions.setModel('openrouter/free'))
    expect(fixture.result.current.ai.model).toBe('openrouter/free')
  },
)
```

- [ ] Run controller regression proof after Task 1's provider-map extension:

```sh
rtk npm run test -- src/features/settings/hooks/use-ai-connection-controller.test.tsx
```

Expected: PASS. The existing transitions already own restoration, preset edits, gate checks, discard, independent enablement, and preference separation; do not invent a failing-test claim when those behaviors pass unchanged. Only the provider maps required production changes in Task 1.

### Connection UI And Screen Integration

**Files:**

- Modify `src/features/settings/components/sections/ai-assessment-section.tsx`.
- Test `src/features/settings/components/sections/ai-assessment-section.test.tsx`.
- Test `src/features/settings/components/settings-screen.test.tsx`.

- [ ] Update the section test helper imports with:

```ts
import type { AiProviderSecretPresence } from '@/features/genai'
import {
  clearAiProviderSecretRequestSchema,
  setAiProviderSecretRequestSchema,
  testAiConnectionRequestSchema,
} from '@/features/genai/api'
```

Add a third helper argument after `presenceState`:

```ts
  presenceOverrides: Partial<AiProviderSecretPresence> = {},
```

Replace the initializer:

```ts
let presence: AiProviderSecretPresence = {
  openai: false,
  anthropic: false,
  gemini: false,
  openrouter: false,
  ...presenceOverrides,
}
```

Replace the three GenAI branches:

```ts
if (method === 'genai.setAiProviderSecret') {
  const request = setAiProviderSecretRequestSchema.parse(payload)
  presence = { ...presence, [request.provider]: true }
  return Promise.resolve(presence)
}
if (method === 'genai.clearAiProviderSecret') {
  const request = clearAiProviderSecretRequestSchema.parse(payload)
  presence = { ...presence, [request.provider]: false }
  return Promise.resolve(presence)
}
if (method === 'genai.testConnection') {
  const request = testAiConnectionRequestSchema.parse(payload)
  return Promise.resolve({
    status: 'success',
    provider: request.provider,
    model: request.model,
    durationMs: 1,
  })
}
```

Update its pending key-save fixture to
`{ openai: true, anthropic: false, gemini: false, openrouter: false }`.
Extend the existing all-providers test with:

```ts
expect(screen.getByRole('radio', { name: 'OpenRouter' })).toBeVisible()
```

- [ ] Add these component regressions before implementing the JSX blocks:

```ts
it('suggests the free OpenRouter route, clears an unsaved key, and shows bounded model and routing guidance', async () => {
  renderSection({ model: 'custom-model' })
  await screen.findByText('No saved key')
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('OpenAI API key'), 'unsaved-key')
  await user.click(screen.getByRole('radio', { name: 'OpenRouter' }))
  const model = screen.getByLabelText('Model')
  expect(model).toHaveValue('openrouter/free')
  expect(model).toHaveAttribute('maxLength', '120')
  expect(model).toBeEnabled()
  expect(screen.getByLabelText('OpenRouter API key')).toHaveAttribute(
    'type',
    'password',
  )
  expect(screen.getByLabelText('OpenRouter API key')).toHaveValue('')
  expect(
    screen.getByText(
      'Free models are chosen automatically; quality and response time may vary. Usage limits apply. You can enter a specific free or paid model instead.',
    ),
  ).toBeVisible()
  const keyLink = screen.getByRole('link', {
    name: 'Get an OpenRouter API key',
  })
  expect(keyLink).toHaveAttribute('href', 'https://openrouter.ai/settings/keys')
  expect(keyLink).toHaveAttribute('target', '_blank')
  expect(keyLink).toHaveAttribute('rel', 'noreferrer')
  const policyLink = screen.getByRole('link', { name: 'data policies' })
  expect(policyLink).toHaveAttribute(
    'href',
    'https://openrouter.ai/docs/guides/privacy/provider-logging',
  )
  expect(policyLink).toHaveAttribute('target', '_blank')
  expect(policyLink).toHaveAttribute('rel', 'noreferrer')
  expect(policyLink.parentElement).toHaveTextContent(
    'OpenRouter forwards your submission code and problem context to a model provider. OpenRouter and provider data policies apply.',
  )
  expect(sendMessage).not.toHaveBeenCalledWith(
    'genai.testConnection',
    expect.anything(),
  )
  expect(
    screen.getByRole('switch', { name: 'AI assessment' }),
  ).not.toBeChecked()
  await user.click(screen.getByRole('radio', { name: 'Gemini' }))
  expect(screen.queryByRole('button', { name: 'Use free models' })).toBeNull()
  expect(
    screen.queryByRole('link', { name: 'Get an OpenRouter API key' }),
  ).toBeNull()
  expect(screen.queryByRole('link', { name: 'data policies' })).toBeNull()
})

it('restores a custom OpenRouter connection and changes only its draft when Use free models is clicked', async () => {
  renderSection(
    { provider: 'openrouter', model: 'vendor/custom-model:free' },
    'ready',
    { openrouter: true },
  )
  await screen.findByText('Saved key · not tested')
  const user = userEvent.setup()
  expect(screen.getByLabelText('Model')).toHaveValue('vendor/custom-model:free')
  expect(screen.getByLabelText('OpenRouter API key')).toHaveValue('')
  await user.click(screen.getByRole('button', { name: 'Test connection' }))
  await screen.findByText('Connected to OpenRouter · vendor/custom-model:free.')
  vi.mocked(sendMessage).mockClear()
  await user.click(screen.getByRole('button', { name: 'Use free models' }))
  expect(screen.getByLabelText('Model')).toHaveValue('openrouter/free')
  expect(
    screen.queryByText('Connected to OpenRouter · vendor/custom-model:free.'),
  ).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Save & test connection' }),
  ).toBeEnabled()
  expect(
    screen.getByRole('switch', { name: 'AI assessment' }),
  ).not.toBeChecked()
  expect(sendMessage).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole('button', { name: 'Discard connection changes' }),
  )
  expect(screen.getByLabelText('Model')).toHaveValue('vendor/custom-model:free')
  expect(sendMessage).not.toHaveBeenCalled()
})

it('disables the free preset during key persistence and leaves the captured custom model intact', async () => {
  renderSection({ provider: 'openrouter', model: 'vendor/custom-model' })
  await screen.findByText('No saved key')
  const user = userEvent.setup()
  await user.type(
    screen.getByLabelText('OpenRouter API key'),
    'private-openrouter-key',
  )
  let finish: (() => void) | undefined
  vi.mocked(sendMessage).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            openai: false,
            anthropic: false,
            gemini: false,
            openrouter: true,
          })
      }),
  )
  fireEvent.submit(screen.getByRole('form', { name: 'AI connection' }))
  await screen.findByRole('button', { name: 'Saving key…' })
  expect(screen.getByRole('button', { name: 'Use free models' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Use free models' }))
  expect(screen.getByLabelText('Model')).toHaveValue('vendor/custom-model')
  finish?.()
  await screen.findByText('Connected to OpenRouter · vendor/custom-model.')
  expect(screen.getByRole('button', { name: 'Use free models' })).toBeEnabled()
})
```

- [ ] Run RED:

```sh
rtk npm run test -- src/features/settings/components/sections/ai-assessment-section.test.tsx
```

Expected before UI changes: OpenRouter radio/preset/link queries fail.

- [ ] Add `{ label: 'OpenRouter', value: 'openrouter' }` to `providerOptions`.

- [ ] Replace only the model row's inner `grid gap-1.5` contents with:

```tsx
<div className="grid gap-1.5">
  <div className="flex min-w-0 flex-wrap items-center gap-2">
    <input
      className={`${inputClassName} flex-1 basis-48`}
      id="ai-model"
      maxLength={120}
      onChange={(event) => actions.setModel(event.currentTarget.value)}
      placeholder={aiProviderModelDefaults[provider]}
      spellCheck={false}
      type="text"
      value={model}
    />
    {provider === 'openrouter' ? (
      <Button
        disabled={controller.isBusy}
        onClick={() => actions.setModel('openrouter/free')}
        size="sm"
        type="button"
        variant="outline"
      >
        Use free models
      </Button>
    ) : null}
  </div>
  {model.trim() === '' ? (
    <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
      Enter a model to save and test the connection. The suggestion is not
      saved.
    </p>
  ) : null}
  {provider === 'openrouter' ? (
    <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
      Free models are chosen automatically; quality and response time may vary.
      Usage limits apply. You can enter a specific free or paid model instead.
    </p>
  ) : null}
</div>
```

- [ ] Below the existing Gemini key link, add:

```tsx
{
  provider === 'openrouter' ? (
    <>
      <a
        className="w-fit text-[length:var(--cp-copy-font-size)] text-primary underline underline-offset-4"
        href="https://openrouter.ai/settings/keys"
        rel="noreferrer"
        target="_blank"
      >
        Get an OpenRouter API key
      </a>
      <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
        OpenRouter forwards your submission code and problem context to a model
        provider. OpenRouter and provider{' '}
        <a
          className="text-primary underline underline-offset-4"
          href="https://openrouter.ai/docs/guides/privacy/provider-logging"
          rel="noreferrer"
          target="_blank"
        >
          data policies
        </a>{' '}
        apply.
      </p>
    </>
  ) : null
}
```

Keep the password input, local-storage hint, connection actions, and independent
assessment switch intact. The links follow the existing `target="_blank"` and
`rel="noreferrer"` pattern.

- [ ] Run section GREEN after the option and JSX changes:

```sh
rtk npm run test -- src/features/settings/components/sections/ai-assessment-section.test.tsx
```

Expected: PASS.

- [ ] Preserve the existing Gemini integration scenario in
      `settings-screen.test.tsx` and run it for OpenRouter too. Replace the
      existing scenario's `it(...)` declaration with:

```ts
it.each([
  { provider: 'gemini', label: 'Gemini', suggestion: 'gemini-3.5-flash-lite', model: 'my-gemini-model' },
  { provider: 'openrouter', label: 'OpenRouter', suggestion: 'openrouter/free', model: 'vendor/custom-openrouter-model:free' },
] as const)('saves and tests $label independently of dirty preferences and persists on remount', async ({ provider, label, suggestion, model }) => {
```

Inside that exact scenario, use the four-provider initializer:

```ts
let presence = {
  openai: false,
  anthropic: false,
  gemini: false,
  openrouter: false,
}
```

Change its successful save branch to:

```ts
presence = { ...presence, [provider]: true }
```

Use the parameterized provider and model in the mock test response:

```ts
return Promise.resolve({ status: 'success', provider, model, durationMs: 42 })
```

Replace the scenario's provider/model assertions and messages with these exact
statements in the same order, retaining its dirty-Daily-goal setup and
`calls === ['key', 'settings', 'test']` proof:

```ts
await user.click(screen.getByRole('radio', { name: label }))
expect(screen.getByLabelText('Model')).toHaveValue(suggestion)
await user.clear(screen.getByLabelText('Model'))
await user.type(screen.getByLabelText('Model'), model)
await user.type(screen.getByLabelText(`${label} API key`), 'local-test-key')
await user.keyboard('{Enter}')
await screen.findByText(`Connected to ${label} · ${model}.`)
expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
  surface: 'dashboard',
  patch: { aiAssessment: { provider, model } },
})
expect(sendMessage).toHaveBeenCalledWith('genai.testConnection', {
  surface: 'dashboard',
  provider,
  model,
})
expect(screen.getByLabelText(`${label} API key`)).toHaveValue('')
```

After the existing `view.unmount(); render(...)`:

```ts
await waitFor(() => expect(screen.getByLabelText('Model')).toHaveValue(model))
expect(screen.getByRole('radio', { name: label })).toBeChecked()
expect(screen.getByText('Saved key · not tested')).toBeVisible()
expect(screen.queryByText(`Connected to ${label} · ${model}.`)).toBeNull()
```

- [ ] Extend the existing general-Save gate test to cover OpenRouter without
      removing direct-provider coverage: replace its declaration with
      `it.each(['openai', 'openrouter'] as const)`, pass `provider` into its
      saved AI configuration, set presence with
      `{ openai: provider === 'openai', anthropic: false, gemini: false, openrouter: provider === 'openrouter' }`,
      and add this assertion during the pending save:

```ts
if (provider === 'openrouter') {
  expect(screen.getByRole('button', { name: 'Use free models' })).toBeDisabled()
}
```

Use this complete parameterized declaration:

```ts
it.each(['openai', 'openrouter'] as const)('freezes preference and %s AI fields during general Save and rejects overlapping AI submission', async (provider) => {
```

- [ ] Run focused integrated GREEN:

```sh
rtk npm run test -- src/features/settings/hooks/use-ai-connection-controller.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/settings/components/settings-screen.test.tsx
```

Expected: PASS for OpenRouter free/custom setup, direct providers, independent
assessment enablement, exact model restoration, preset/no-network behavior,
discard, preference separation, and synchronous/UI operation gates.

- [ ] Format/check the changed Settings implementation and three tests, then commit the UI slice:

```sh
rtk npx prettier --write src/features/settings/hooks/use-ai-connection-controller.test.tsx src/features/settings/components/sections/ai-assessment-section.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/settings/components/settings-screen.test.tsx
rtk npx prettier --check src/features/settings/hooks/use-ai-connection-controller.test.tsx src/features/settings/components/sections/ai-assessment-section.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/settings/components/settings-screen.test.tsx
rtk git add src/features/settings/hooks/use-ai-connection-controller.test.tsx src/features/settings/components/sections/ai-assessment-section.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/settings/components/settings-screen.test.tsx
rtk git diff --cached --check
rtk git commit -m "feat(settings): add OpenRouter free-model connection controls"
```

Expected: formatting and staged checks pass; only the listed Settings files are staged. Continue documentation and full validation before feature acceptance.

## Task 5: Current Product, Architecture, UI, Privacy, And Store Documentation

**Files:** `docs/product.md`, `docs/architecture.md`, `design.md`, `docs/testing.md`, `docs/chrome-web-store.md`, `PRIVACY.md`, approved spec, this plan, and `docs/superpowers/README.md`.

- [ ] Replace the AI-connection paragraph under Settings in `docs/product.md` with:

```md
Settings exposes an AI connection for OpenAI, Anthropic, Google Gemini, or
OpenRouter using the user's own selected-provider API key. Choosing a provider
fills an editable suggested model; OpenRouter suggests `openrouter/free`.
Saved custom model IDs survive reopening Settings exactly. OpenRouter's
**Use free models** action changes only the connection draft to `openrouter/free`,
clears old verification, and requires **Save & test connection** to persist.
**Discard connection changes** restores the saved provider and model.

**Save & test connection** saves the selected provider, model, and any newly
entered key, then makes a small structured request to the selected provider.
**Test connection** checks an unchanged saved connection. Testing works while
assessment is disabled and does not enable it. A failed test keeps the saved
connection and shows controlled authentication, permission, model access,
billing, quota, network, timeout, refusal, or output guidance. Saving other
preferences leaves unfinished AI connection edits alone.

OpenRouter's free route chooses a free model automatically; quality, latency,
availability, and usage limits can vary. Users can explicitly enter another free
or paid model ID. CogniPace never configures paid fallback model IDs or switches
a failed free request to a paid model. Connection testing checks basic access
and structured output, not full report quality or every future routed model.
OpenRouter forwards submission code and problem context to a model provider;
OpenRouter and provider data policies apply, including account privacy routing
settings.
```

Retain the following existing independent-enable, Reset Defaults, trusted storage, and invalidation paragraphs. Global defaults and saved-key preservation remain documented as before.

- [ ] In `docs/architecture.md` under External APIs And Secrets, replace the AI integration bullet with:

```md
- `src/lib/ai`: reusable structured generation through Vercel AI SDK, official
  OpenAI/Anthropic/Google adapters, and OpenRouter's dedicated
  `@openrouter/ai-sdk-provider`. The library accepts explicit credentials,
  model, prompt, and Zod schema; GenAI owns configuration and trusted key
  loading. SDK/provider imports are confined to this library. OpenRouter uses
  the fixed `https://openrouter.ai/api/v1` endpoint, strict structured outputs,
  and `provider.require_parameters: true`; there is no editable transport URL.
```

Replace the provider-ID/host paragraph and list with:

```md
GenAI provider keys use `src/platform/secrets` with IDs `genai:openai`,
`genai:anthropic`, `genai:google`, and `genai:openrouter`. UI/runtime status
exposes exactly four key-presence booleans. Raw keys stay out of the app
database, backups, sync envelopes, logs, query caches, mutation variables, and
returned runtime data. Approved AI host permissions are exactly:

- `https://api.openai.com/*`
- `https://api.anthropic.com/*`
- `https://generativelanguage.googleapis.com/*`
- `https://openrouter.ai/*`
```

Replace the following provider-call paragraph with:

```md
Provider calls run in trusted background code after configuration and key
checks. Explicit model objects use controlled fetch with redirects rejected,
SDK retries disabled, bounded output, and telemetry disabled. Strict SDK/Zod
and report-consistency validation remain required. OpenRouter requests specify
only the selected model, without paid fallback IDs or privacy overrides;
OpenRouter can perform internal routing within CogniPace's single request.

Metadata keeps requested `model` as configuration identity and optionally adds
bounded `resolvedModel` for a successful OpenRouter response that identifies a
served model. Missing, blank, oversized, equal-to-request, or router-alias values
are omitted. Runtime identity checks continue using requested provider/model
and trusted key revision. Reports remain session-only; evaluation artifacts
preserve metadata without expanding app persistence or sync.

Controlled errors use actual HTTP status and allowlisted machine metadata.
OpenRouter's HTTP-200 errors can contain embedded numeric error codes and the
adapter may expose wrapped or flattened data. Billing (402) is distinct from
request quotas (429). Unknown 503 stays a network failure; model-unavailable
guidance can mention required capabilities and privacy/routing settings without
claiming a diagnosed cause. Raw SDK messages, bodies, and metadata.raw never
cross the runtime boundary. The complete deadline includes preparation,
headers, body reading, and validation.
```

Keep the existing 20/25-second connection deadlines, 30/50-second analysis deadlines, 8,192-token analysis limit, sender policy, cache revisions, and background listener lifecycle accurate.

- [ ] Under AI Connection Settings Rules in `design.md`, replace the selecting-provider and mask/key bullets with:

```md
- Selecting a provider fills an editable suggested model value; OpenRouter
  suggests `openrouter/free`. Saved custom models stay visible exactly; a
  blank reset model stays blank. Show **Use free models** only for OpenRouter,
  beside the model field, as a draft-only action. It clears test feedback,
  requires explicit saving/testing, and is disabled behind the shared operation
  gate. Discard restores the saved model.
- Mask entered keys and show availability only for the selected provider. Clear
  the input after saving and when switching providers. Keep Remove key, the
  Gemini Google AI Studio link, and an OpenRouter key-creation link. OpenRouter
  shows compact free-routing/usage guidance and code/context-forwarding copy
  with a provider-data-policy link. External links use the established new-tab
  attributes. Keep the existing compact row/input/status/panel tokens.
```

- [ ] In `docs/chrome-web-store.md`, update both provider catalogs in the detailed description and reviewer instructions to “OpenAI, Anthropic, Google Gemini, or OpenRouter”. Replace the three existing AI host explanations and add the fourth with:

```md
### `https://api.openai.com/*`

Sends a small user-requested connection test with the user's saved OpenAI key,
or completed-submission code analysis when AI assessment is enabled and OpenAI
is selected.

### `https://api.anthropic.com/*`

Sends a small user-requested connection test with the user's saved Anthropic
key, or completed-submission code analysis when AI assessment is enabled and
Anthropic is selected.

### `https://generativelanguage.googleapis.com/*`

Sends a small user-requested connection test with the user's saved Gemini key,
or completed-submission code analysis when AI assessment is enabled and Gemini
is selected.

### `https://openrouter.ai/*`

Sends a small user-requested connection test with the user's saved OpenRouter
key, or completed-submission code analysis when AI assessment is enabled and
OpenRouter is selected. OpenRouter routes code and problem context to a model
provider under OpenRouter and provider data policies and account privacy
settings. No developer key is bundled. `openrouter/free` is an editable
suggestion; the app does not configure paid fallback model IDs. Model-provider
domains behind OpenRouter do not receive additional extension host access.
```

Add this paragraph to reviewer instructions:

```md
For OpenRouter, use a privately supplied test account/key in Settings. Selecting
OpenRouter suggests `openrouter/free`; a custom model remains editable. Save and
test while assessment is off, reopen the exact saved model, then use the
explicit free preset and save/test again. Only enable assessment when ready
to send submission code and problem context. Free routing can vary in quality,
latency, and capacity. Do not include test keys in submitted evidence.
```

Keep Store publication and release/version changes separate from this implementation task.

- [ ] Replace only Optional AI Assessment Data in `PRIVACY.md` with the following accurate request/forwarding description, and set the policy's effective date to the actual implementation date before release:

```md
### Optional AI assessment data

CogniPace stores the user's selected-provider API key in trusted local extension
storage. The user can choose OpenAI, Anthropic, Google Gemini, or OpenRouter.
Saving and testing a connection sends a small structured verification request
even while AI assessment is disabled. Connection testing does not send a
submission's solution code or enable assessment.

When the user enables AI assessment, completed-submission analysis sends the
problem slug, title, difficulty, topics, statement, examples, constraints,
follow-ups, submission status, language/version, runtime, memory result, test
counts, solution code, and bounded failure diagnostics to the selected service.
OpenRouter forwards code and problem context to a model provider. OpenRouter
and the serving provider's terms, data policies, and account privacy settings
govern that processing. The app does not override OpenRouter account privacy
routing settings. See [OpenRouter provider data policies](https://openrouter.ai/docs/guides/privacy/provider-logging).

Provider retention varies by provider policy and settings. CogniPace does not
persist raw provider payloads or analysis reports in the app database, backups,
or sync. Reports remain in the active analysis session. Analysis does not save
a review automatically; the local workflow stores only review information the
user separately chooses to save. API keys are excluded from backups, sync,
logs, query caches, and returned runtime data.
```

In Storage, Transfer, And Sharing replace its AI bullet with:

```md
- AI-service requests perform user-requested connection tests or enabled code
  analysis using the user's selected provider and API key. OpenRouter forwards
  analysis input to the serving model provider under the applicable policies.
```

The implementation-date action is an operational release date, not an invented future publication date. Keep every unrelated local-data/Gist policy paragraph intact.

- [ ] Add the OpenRouter human smoke section from Task 6 to `docs/testing.md` beside AI Connection And Assessment Settings. Replace the evaluation allowed-provider line with:

```md
`COGNIPACE_AI_EVAL_PROVIDER` (openai, anthropic, gemini, or openrouter),
```

Keep the authored six evaluation inputs, rubric checks, private environment rules, generated-code validation, installed-extension flows, and honest pending-proof requirements. Add:

```md
For OpenRouter, privately select `openrouter/free` or an explicit accessible text
model. Record the requested model and optional resolved model for each current
artifact: free routing can select different serving models across requests.
Inspect full rubric usefulness and suggested-code validity, not only connection
success or schema validity. Mocked wire tests are separate evidence. Capacity,
account privacy settings, billing, or schema-support failures remain controlled
and do not trigger app-configured paid fallback requests.
```

- [ ] After implementation and actual validation, update this plan's checkboxes and evidence record, the spec's status, and the two planning-index entries with the observed automated/live/human status. Do not mark live or installed-extension proof passed without current dated evidence.

- [ ] Format/check touched Markdown explicitly, including ignored planning artifacts:

```sh
rtk npx prettier --write --ignore-path /dev/null docs/product.md docs/architecture.md design.md docs/testing.md docs/chrome-web-store.md PRIVACY.md docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/plans/2026-10-05-openrouter-provider.md docs/superpowers/README.md
rtk npx prettier --check --ignore-path /dev/null docs/product.md docs/architecture.md design.md docs/testing.md docs/chrome-web-store.md PRIVACY.md docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/plans/2026-10-05-openrouter-provider.md docs/superpowers/README.md
rtk git diff --check
```

Expected: format and whitespace checks pass; descriptions match implemented paths and observed validation. Commit only those files:

```sh
rtk git add docs/product.md docs/architecture.md design.md docs/testing.md docs/chrome-web-store.md PRIVACY.md docs/superpowers/specs/2026-10-04-openrouter-provider-design.md docs/superpowers/plans/2026-10-05-openrouter-provider.md docs/superpowers/README.md
rtk git diff --cached --check
rtk git commit -m "docs(genai): document optional OpenRouter routing and validation"
```

## Task 6: Automated Gates, Live Report Evidence, And Human Extension Proof

**Files:** This plan's implementation evidence record; existing `src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts`; current manual flows in `docs/testing.md`. No new smoke framework or generated test credentials.

- [ ] Check all feature source/package formatting after the task-specific writes:

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

- [ ] Run required gates in this order after focused task checks have passed:

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

- [ ] Review the complete diff against the approved spec and run required code review before any PR. Keep review saving, schedules, local data, permissions, and import ownership intact. Record exact passed/failed/skipped commands and evidence paths. Do not create a PR, merge, publish, alter release version, or mark full feature acceptance complete until the requested action and its required human proof are present.

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
