# Reliable Backup Phase 3: Key Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give opted-in users a separate, verified Google Drive copy of their provider keys that can be deliberately restored after reinstall using Google account access alone.

**Architecture:** Keep live keys in the existing background-only secret store and keep them out of data backups. A separate Drive folder holds one current verified key state; a durable local job and startup reconciliation close the gap between local key writes and worker scheduling. Key restoration is previewed by provider name and applied only after confirmation.

**Tech Stack:** TypeScript, Chrome storage and Identity, Google Drive REST v3, Zod, Web Crypto, Vitest, WXT Manifest V3.

---

## Boundary and file map

Implement after [Phase 2](./2026-10-16-reliable-backup-phase-2-drive-data.md) passes its gates. The [approved design](../specs/2026-10-16-reliable-drive-backup-and-key-recovery-design.md) owns the product and disclosure decisions. This phase uses Phase 2's account binding, `drive.file` token, bounded Drive adapter, alarm worker, and separate data-backup status. Google account access is the sole recovery gate; do not add a passphrase or put key values in UI messages, the SQLite file, ordinary backup, logs, or analytics. An account holder or a person with file access can read the cloud copy, so the Settings copy must say so plainly.

| File                                                                                  | Responsibility                                                                                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/platform/secrets/secret-contracts.ts`, `secret-store.ts`, `secret-store.test.ts` | Enumerate the five supported IDs; emit a durable change signal after local writes; apply confirmed restore in trusted context. |
| `src/features/sync/domain/key-backup-envelope.ts` and `.test.ts`                      | Strict key-file schema, key-set digest, monotonic version, provider validation, and redacted preview.                          |
| `src/features/sync/data/key-backup-state.ts` and `.test.ts`                           | Trusted local opt-in, verified fingerprint/version, job, cleanup, and delete intent; persist without secret values.            |
| `src/features/sync/server/key-backup-service.ts` and `.test.ts`                       | Build key set, verify downloaded replacement, select latest verified state, restore, delete cloud copy, and cleanup.           |
| `src/extension/background/key-backup-job.ts` and `.test.ts`                           | Immediate attempt, alarm retry, startup reconciliation, noninteractive auth, and safe pause.                                   |
| `src/platform/google/drive-client.ts` and `.test.ts`                                  | Owner/permission inspection and permanent deletion for app-created key files.                                                  |
| `src/features/sync/api/key-backup-contracts.ts`, `key-backup-api.ts`, and tests       | Dashboard-only opt-in, preview, restore, delete, and status contracts with no secret values.                                   |
| `src/features/sync/components/drive-backup-panel.tsx` and `.test.tsx`                 | Separate key status, recovery preview/confirmation, and disclosure.                                                            |
| `src/extension/background/register-handlers.ts`, `runtime-policy.ts`, and tests       | Trusted key action routing and sender authorization.                                                                           |
| `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `design.md`             | Shipped behavior, trust model, permission/ownership policy, and manual smoke.                                                  |

Use the exact provider IDs `github:gist`, `genai:openai`, `genai:anthropic`, `genai:google`, and `genai:openrouter`; an absent provider is absent from the current key state. The key envelope is an app-created `application/octet-stream` JSON file in a visible owner-only **CogniPace Key Recovery** folder, separate from **CogniPace Backups**. Its app-private properties identify `kind=keys`, `version`, `operationId`, and `sha256`. The envelope holds `formatVersion: 1`, `accountId`, `version`, `createdAt`, and a sorted array of unique provider/value pairs. Treat the entire downloaded body as secret material, including parse errors; errors may name a provider but never echo bytes. A zero-key array is valid and supersedes older nonempty states.

The local state must contain only an opt-in flag, connected opaque account ID, last verified key-set digest/version/file ID/time, pending operation identity, retry state, and cleanup/delete intent. Store it in background-only `chrome.storage.local` with `TRUSTED_CONTEXTS` access. A key-set digest is SHA-256 over sorted provider IDs and their secret values with length delimiters; compare it in trusted context only. Do not return that digest to the UI, since stable secret fingerprints can expose whether a key changed. The cloud file itself is readable to a person with access to that Google account: this design is recovery, not zero-knowledge encryption.

## Task 1: Trusted key inventory and local change signal

**Files:** Modify `src/platform/secrets/secret-contracts.ts`, `src/platform/secrets/secret-store.ts`, `src/platform/secrets/secret-store.test.ts`, `src/features/genai/server/genai-secret-storage.test.ts`, `src/features/sync/server/sync-service.test.ts`.

- [ ] **Step 1: Write failing inventory/change tests.** Save, replace, and delete each supported secret through existing GenAI and Gist flows. Assert `readBackupKeySet()` returns only valid current values in trusted context and a `onSecretSetChanged()` callback fires only after `chrome.storage.local` accepts the write. A failed local write must not enqueue backup. Existing `getSecretStatus()` and runtime status still omit values. Assert old stored GenAI JSON and plain legacy values are accepted by their existing reader and backed up as their stored strings.

```ts
await saveSecret('genai:openai', 'sk-test-only')
expect(await readBackupKeySet()).toEqual({ 'genai:openai': 'sk-test-only' })
await deleteSecret('genai:openai')
expect(await readBackupKeySet()).toEqual({})
expect(JSON.stringify(await getSecretStatus('genai:openai'))).not.toContain(
  'sk-test-only',
)
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/platform/secrets/secret-store.test.ts src/features/genai/server/genai-secret-storage.test.ts src/features/sync/server/sync-service.test.ts --run`; expected the new inventory/change assertions fail.
- [ ] **Step 3: Add the trusted inventory and post-write callback.** Export a frozen `backupSecretProviderIds` tuple and `readBackupKeySet()` from `src/platform/secrets`; read each ID through `readSecret`, including `github:gist`. Add a background-only callback registration with unsubscribe. Invoke callbacks after a successful `saveSecret` or `deleteSecret`; callback failure must not turn a successful local secret write into a false failure. The worker in Task 3 always recomputes the set on startup, so callback delivery is an optimization rather than the only durability path.

```ts
export const backupSecretProviderIds = [
  'github:gist',
  'genai:openai',
  'genai:anthropic',
  'genai:google',
  'genai:openrouter',
] as const
```

- [ ] **Step 4: Verify GREEN and commit.** Run the three focused files; expected old secret behavior and new inventory/change behavior pass. Commit `feat(secrets): expose trusted backup key inventory`.

## Task 2: Strict key envelope and secret-free state

**Files:** Create `src/features/sync/domain/key-backup-envelope.ts` and `.test.ts`, `src/features/sync/data/key-backup-state.ts` and `.test.ts`.

- [ ] **Step 1: Write failing schema/state tests.** Accept all five provider IDs and an empty set; reject unknown IDs, missing/blank values, duplicate providers, unsupported format, invalid time, wrong account, oversized body, and mismatched digest. Confirm the preview returns only provider IDs/count and version/time. The persisted state must contain no values or JSON of an envelope. A failed state write keeps the prior verified version and leaves a pending job; reconnect to a different account pauses it.

```ts
const envelope = keyBackupEnvelopeSchema.parse({
  formatVersion: 1,
  accountId: 'opaque-account-a',
  version: 3,
  createdAt: '2026-10-16T00:00:00.000Z',
  keys: [{ provider: 'genai:openai', value: 'sk-test-only' }],
})
expect(toKeyBackupPreview(envelope)).toEqual({
  version: 3,
  createdAt: envelope.createdAt,
  providers: ['genai:openai'],
})
expect(JSON.stringify(toKeyBackupPreview(envelope))).not.toContain(
  'sk-test-only',
)
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/features/sync/domain/key-backup-envelope.test.ts src/features/sync/data/key-backup-state.test.ts --run`; expected missing-module failures.
- [ ] **Step 3: Implement parsers, digest, and state transitions.** Use Zod strict objects; cap the downloaded body before decoding; normalize provider ordering for a deterministic key-set digest. Persist `enabled`, `accountId`, `lastVerifiedDigest`, `lastVerifiedVersion`, `lastVerifiedFileId`, `lastVerifiedAt`, `pendingOperationId`, `nextAttemptAt`, `attempt`, `cleanupFileIds`, and `deleteRequested`. Keep a monotonic local version, and derive the next version from the maximum locally verified and remotely verified version so reinstall never reuses a prior version. Never log an envelope or serialization error body.

```ts
const keyEntrySchema = z.strictObject({
  provider: z.enum(backupSecretProviderIds),
  value: z.string().trim().min(1),
})

export const keyBackupEnvelopeSchema = z.strictObject({
  formatVersion: z.literal(1),
  accountId: z.string().min(1),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  keys: z
    .array(keyEntrySchema)
    .max(backupSecretProviderIds.length)
    .superRefine((entries, context) => {
      const ids = entries.map((entry) => entry.provider)
      if (
        new Set(ids).size !== ids.length ||
        ids.join(',') !== [...ids].sort().join(',')
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Invalid key order or duplicate provider.',
        })
      }
    }),
})
```

- [ ] **Step 4: Verify GREEN and commit.** Run the two focused files; expected schema, redaction, monotonic version, and storage cases pass. Commit `feat(sync): define private key backup state and envelope`.

## Task 3: Verified upload, cleanup, and worker reconciliation

**Files:** Create `src/features/sync/server/key-backup-service.ts` and `.test.ts`, `src/extension/background/key-backup-job.ts` and `.test.ts`; modify `src/platform/google/drive-client.ts`, `src/extension/background/register-handlers.ts`, and focused tests.

- [ ] **Step 1: Write failing worker tests.** After opt-in, saving/replacing/deleting a key requests an immediate independent key job. Kill the worker after a local secret write but before scheduling: startup recomputes the key-set digest and queues a job if it differs from the last verified digest. An hourly repair alarm finds the same mismatch even if a callback was missed and no restart occurs. Kill the worker after Drive creates a file but before receipt: retry finds the deterministic operation ID and verifies the existing file. Download-by-ID readback checks length, SHA-256, schema, exact key set, account, and version before recording success. A newer local key change stays pending. Cleanup permanently deletes all older app-created key files; a failed delete reports `key-cleanup-pending` and retries without selecting an old file for restore.

```ts
await job.reconcileOnStartup()
expect(await state.read()).toMatchObject({
  pendingOperationId: expect.any(String),
})
await job.runDueJob()
expect(drive.downloadFile).toHaveBeenCalledWith(createdFileId)
expect(await state.read()).toMatchObject({ lastVerifiedVersion: 3 })
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/features/sync/server/key-backup-service.test.ts src/extension/background/key-backup-job.test.ts src/platform/google/drive-client.test.ts --run`; expected new upload/reconciliation assertions fail.
- [ ] **Step 3: Implement the separate job and owner checks.** Before creating or reading key files, check the bound account and list permissions for the key folder and candidate file; accept only the account owner and no `anyone`, `domain`, `group`, or other-user grants. Treat incomplete permission listing as unsafe. Use only noninteractive tokens in worker jobs. Create a new immutable file with a deterministic operation ID, then download and verify it before recording the verified pointer. On restart and an hourly repair alarm, compare the current secret-set digest with the last verified digest and find an existing operation ID before creating another file. Delete previous app-created key files permanently after the pointer advances, persist cleanup IDs, and retry failures with the Phase 2 alarm/backoff policy. Key work must not alter data-backup revision/status.

```ts
const existing = await drive.findKeyFileByOperationId(operationId)
const fileId = existing?.id ?? (await drive.createKeyFile(bytes, properties)).id
const downloaded = await drive.downloadFile(fileId)
await verifyKeyFile(downloaded, { accountId, version, digest, bytes })
await state.recordVerified({
  fileId,
  version,
  digest,
  verifiedAt: now.toISOString(),
})
await deleteOldKeyFilesExcept(fileId)
```

- [ ] **Step 4: Verify GREEN and commit.** Run the three focused files plus `src/extension/background/register-handlers.test.ts`; expected reconciliation, permission, lost-response, deletion, and independent-status cases pass. Commit `feat(sync): verify and reconcile separate key backups`.

## Task 4: Explicit preview, restore, deletion, and account switch

**Files:** Create `src/features/sync/api/key-backup-contracts.ts`, `src/features/sync/api/key-backup-api.ts`, and tests; modify `src/features/sync/server/key-backup-service.ts`, `src/platform/secrets/secret-store.ts`, `src/extension/background/register-handlers.ts`, `src/extension/background/runtime-policy.ts`, and focused tests.

- [ ] **Step 1: Write failing action tests.** A fresh install lists the latest verified key state by provider name only and waits for confirmation. An existing local key is listed as to-be-replaced; confirmation writes the selected cloud key set through trusted storage and removes local keys omitted by that state. A wrong account, shared file, invalid body, or failed local write must not report restore success. Simulate a mid-restore storage failure and check rollback to the previous local key set or a truthful recovery-required state; never return key bytes to a runtime caller. `delete-cloud-key-copy` permanently deletes app-created key files after confirmation, survives a worker restart, and reports partial deletion as pending. Disconnect says whether a cloud copy remains; switching accounts requires an explicit action and does not silently upload local keys to the new account.

```ts
const preview = await service.previewKeyRestore()
expect(preview.providers).toEqual(['genai:openai'])
expect(JSON.stringify(preview)).not.toContain('sk-test-only')
await expect(
  service.restoreKeys({
    version: preview.version,
    confirmReplaceLocalKeys: true,
  }),
).resolves.toMatchObject({ restoredProviders: ['genai:openai'] })
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/features/sync/server/key-backup-service.test.ts src/features/sync/api/key-backup-contracts.test.ts src/extension/background/runtime-policy.test.ts --run`; expected new preview/action assertions fail.
- [ ] **Step 3: Implement guarded actions.** Zod-parse dashboard-only requests and authorize sender in `runtime-policy`. Resolve latest key state by highest verified version, with same-version/different-digest as a conflict. Recheck ownership/permissions and download/verify immediately before restore. Capture the prior trusted local set; apply a batch `chrome.storage.local.set`/`remove`, read back every provider, and on failure restore the prior set or surface a persistent `key-restore-recovery-required` state. Complete only after readback. Keep cloud delete intent until all app-created key files are confirmed absent. Opt-in, disconnect, and account switch screens show the cloud-copy consequences before confirmation.

```ts
export const restoreKeysRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  version: z.number().int().positive(),
  confirmReplaceLocalKeys: z.literal(true),
})
```

- [ ] **Step 4: Verify GREEN and commit.** Run `npm test -- src/features/sync/server/key-backup-service.test.ts src/features/sync/api/key-backup-contracts.test.ts src/extension/background/runtime-policy.test.ts src/extension/background/register-handlers.test.ts src/platform/secrets/secret-store.test.ts --run`; expected restore/readback, wrong-account, deletion, and rollback cases pass. Commit `feat(sync): add explicit private key recovery actions`.

## Task 5: UI, redaction, docs, and release proof

**Files:** Modify `src/features/sync/components/drive-backup-panel.tsx`, `src/features/sync/components/drive-backup-panel.test.tsx`, `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `design.md`.

- [ ] **Step 1: Add failing component and redaction tests.** Show separate data and key backup timestamps/states; show provider names and local replacement impact in key restore preview, with no value, fingerprint, or raw error. Cover opt-in, immediate pending, verified, cleanup pending, shared-folder pause, wrong account, delete cloud copy, disconnect copy remains, and empty key-set recovery. Render the disclosure that Google account/file access can expose keys and that there is no extra passphrase.

```tsx
expect(screen.getByText('Key cleanup pending')).toBeVisible()
expect(screen.getByText('genai:openai')).toBeVisible()
expect(screen.queryByText('sk-test-only')).not.toBeInTheDocument()
```

- [ ] **Step 2: Verify RED, then implement the UI.** Run `npm test -- src/features/sync/components/drive-backup-panel.test.tsx --run`; expected new states fail. Use the existing Settings component patterns and typed `key-backup-api` results. Do not pass envelope objects to React. Render no key values in DOM, attributes, toast, or error text.
- [ ] **Step 3: Verify GREEN.** Run the component test plus `src/features/sync/api/sync-api.test.tsx`; expected old Gist status and new independent key status render correctly. Commit `feat(sync): show separate key recovery status and preview`.
- [ ] **Step 4: Run automated gates.** Run all focused Phase 3 tests, then `npm run db:check`, `npm run lint`, `npm run check`, `npm run build`, and `npm run zip` with Node 24.20.0. Record exact commands, failures, and skips. Inspect built extension permissions and production OAuth configuration. Use only fake keys in tests and evidence.
- [ ] **Step 5: Run human installed-extension flows and update authority docs.** Human engineers test opt-in, add/replace/delete each key, offline/restart retry, wrong account, unsafe sharing, fresh-install preview and restore, local replacement, empty state, permanent cloud deletion, and disconnect copy status. Attach screenshots or recordings with fake keys before PR review or merge. Document actual shipped behavior, Google-account recovery and disclosure, cleanup limits, and manual steps. Commit `docs(sync): document key recovery trust and smoke flows`; prepare a PR-ready summary with release/rollback effects and remaining proof.

## Completion criteria

Phase 3 is complete when an opted-in local key change is eventually discovered after any worker restart, a verified key copy is independently recoverable with explicit confirmation, prior app-created key files are permanently deleted or visibly pending cleanup, shared/wrong-account states pause safely, status and UI never expose values, and automated plus required human gates pass. The full design is release-ready only after Phases 1–3 and their production OAuth, retention, and recovery proofs pass.
