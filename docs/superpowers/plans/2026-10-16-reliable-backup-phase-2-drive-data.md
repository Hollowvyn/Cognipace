# Reliable Backup Phase 2: Drive Data Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace automatic Gist sync with verified, versioned Google Drive data backup and explicit, recoverable restore and force actions.

**Architecture:** Reuse the Phase 1 durable local revision ledger and backup serializer. A narrow Drive adapter creates immutable files; the sync feature verifies downloads, selects a single-writer head, and acknowledges only the uploaded local revision. An alarm-backed background job retries independently of service-worker lifetime. Existing Gist data remains an explicit migration source until a Drive version is verified.

**Tech Stack:** TypeScript, WXT Chrome Manifest V3, Chrome Identity and Alarms, Google Drive REST v3, Zod, Vitest, SQLite WASM.

---

## Boundary and file map

Implement after [Phase 1](./2026-10-16-reliable-backup-phase-1-local-durability.md) passes its automated and installed-extension gates. The [approved design](../specs/2026-10-16-reliable-drive-backup-and-key-recovery-design.md) owns the product decisions. This phase produces a usable data-backup product without key recovery. The Google Cloud project, production OAuth consent state, stable production extension ID, and client ID are release dependencies; a test-mode authorization that expires after seven days is not production proof.

| File                                                                                                               | Responsibility                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `wxt.config.ts`                                                                                                    | Optional `identity`, `www.googleapis.com`, and legacy raw-Gist host permissions; public OAuth client ID and `drive.file` scope. |
| `src/extension/background/google-auth.ts` and `.test.ts`                                                           | User-gesture permission/token request, noninteractive worker token refresh, account binding, revocation handling.               |
| `src/platform/google/drive-client.ts` and `.test.ts`                                                               | Drive REST create/list/get/download/delete with bounded responses and Zod metadata parsing.                                     |
| `src/features/sync/domain/drive-backup-envelope.ts` and `.test.ts`                                                 | Version, SHA-256, exact revision, generation, and head-selection rules.                                                         |
| `src/features/sync/server/drive-backup-service.ts` and `.test.ts`                                                  | Upload/readback, retention, restore preflight, force actions, and cutover.                                                      |
| `src/extension/background/drive-backup-job.ts` and `.test.ts`                                                      | Durable schedule, alarm repair, retry/backoff, idempotent restart, and conflict pause.                                          |
| `src/features/sync/api/drive-backup-contracts.ts`, `src/features/sync/api/drive-backup-api.ts`                     | Strict status/action requests and secret-free results.                                                                          |
| `src/features/sync/components/drive-backup-panel.tsx`, `src/features/backup/components/data-management-screen.tsx` | Connection, last verified time, restore preview, version choice, and explicit force confirmations.                              |
| `src/lib/github/api/gist-requests.ts`, `src/features/sync/server/sync-service.ts`                                  | Read truncated legacy Gists through raw URL and verify legacy writes until cutover.                                             |
| `src/extension/background/register-handlers.ts`, `src/app/providers/sync-open-check.tsx`                           | Trusted runtime wiring and removal of automatic Gist pull after verified Drive cutover.                                         |

The immutable data file is an application/octet-stream UTF-8 JSON envelope containing the current v6 data backup. Its app-private Drive properties include `kind=data`, `operationId`, `writerGeneration`, `deviceId`, `localRevision`, `sha256`, and `formatVersion`. A file is _verified_ only after downloading by ID, checking byte length and SHA-256, parsing the envelope, and passing `prepareFullBackupRestore` for its backup. The head is highest generation, then highest revision for that device. Two devices in one generation or different hashes at the same generation/revision are conflicts. Keep the latest three, seven daily, and four weekly verified files, deduplicated, retaining at least two. Never prune before the new file is verified.

## Task 1: OAuth and exact permissions

**Files:** Modify `wxt.config.ts`; create `src/extension/background/google-auth.ts` and `.test.ts`; add build configuration documentation to `docs/architecture.md`.

- [ ] **Step 1: Write failing auth tests.** Assert a connection gesture requests `identity` and `https://www.googleapis.com/*`, then calls `chrome.identity.getAuthToken({ interactive: true })`; a background job calls `getAuthToken({ interactive: false })` and returns `reconnect-required` if Chrome needs interaction. Query Drive `about.get?fields=user(permissionId)` and bind its opaque `permissionId`; a changed ID pauses backup. A token and account identifier never appear in a runtime status response or log.

```ts
expect(chrome.permissions.request).toHaveBeenCalledWith({
  permissions: ['identity'],
  origins: ['https://www.googleapis.com/*'],
})
expect(chrome.identity.getAuthToken).toHaveBeenCalledWith({
  interactive: false,
})
expect(JSON.stringify(status)).not.toContain('ya29.')
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/extension/background/google-auth.test.ts --run`; expected missing module/export failure.
- [ ] **Step 3: Add manifest and auth adapter.** Declare `identity` under `optional_permissions`, Google and `gist.githubusercontent.com` under `optional_host_permissions`, and `oauth2.scopes` as only `https://www.googleapis.com/auth/drive.file`. Read the public build-time client ID from `COGNIPACE_GOOGLE_OAUTH_CLIENT_ID`; reject a production build without it. Keep interactive token requests inside the dashboard's connect action and background refresh noninteractive. Use `about.get`'s `user.permissionId` as the opaque connected account ID; store it and app-created folder IDs locally.

```ts
optional_permissions: ['identity'],
optional_host_permissions: [
  'https://www.googleapis.com/*',
  'https://gist.githubusercontent.com/*',
],
oauth2: {
  client_id: googleClientId,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
},
```

Resolve `googleClientId` once in `wxt.config.ts` before `defineConfig`: `const googleClientId = process.env.COGNIPACE_GOOGLE_OAUTH_CLIENT_ID`; throw a configuration error when it is absent in a Drive-enabled build. Supply distinct development and production values in their build environments; the OAuth client is public configuration, not a secret.

- [ ] **Step 4: Verify GREEN and commit.** Run the focused auth test and `npm run build`; expected both pass with the development OAuth client configured. Commit `feat(sync): add optional Google Drive authentication`.

## Task 2: Drive transport and verified data envelope

**Files:** Create `src/platform/google/drive-client.ts` and `.test.ts`, `src/features/sync/domain/drive-backup-envelope.ts` and `.test.ts`.

- [ ] **Step 1: Write failing transport and envelope tests.** Fake `fetch` for multipart `files.create`, `files.list` with page tokens and app-private properties, `files.get` metadata, `files.get?alt=media` bytes, and `files.delete`. Reject non-Google URLs, oversized downloads, malformed JSON/metadata, incomplete listing, wrong digest, and a corrupt backup. Test head selection, duplicate operation IDs, and same-generation writers as a conflict. Use fake data values and never place a real OAuth token in fixtures.

```ts
const bytes = new TextEncoder().encode(JSON.stringify(envelope))
const digest = await sha256Hex(bytes)
expect(
  await verifyDataFile(bytes, { sha256: digest, size: bytes.length }),
).toEqual(envelope)
await expect(
  verifyDataFile(bytes, { sha256: '0'.repeat(64), size: bytes.length }),
).rejects.toThrow('checksum')
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/platform/google/drive-client.test.ts src/features/sync/domain/drive-backup-envelope.test.ts --run`; expected missing export failures.
- [ ] **Step 3: Implement transport and parser.** Use the existing HTTP error-redaction conventions, Drive v3 file endpoints, explicit `fields` selection, `drive.file` auth, `appProperties` queries, pagination, and a bounded body reader. Implement `sha256Hex` with `crypto.subtle.digest`, Zod envelope parsing, and `prepareFullBackupRestore` before a downloaded file can be offered for restore. A response from `files.create` is an upload receipt, not verification.

```ts
const hash = await crypto.subtle.digest('SHA-256', bytes)
const sha256 = Array.from(new Uint8Array(hash), (byte) =>
  byte.toString(16).padStart(2, '0'),
).join('')
if (downloaded.byteLength !== expectedSize || sha256 !== expectedSha256) {
  throw new Error('Drive backup checksum mismatch.')
}
```

- [ ] **Step 4: Verify GREEN and commit.** Run the two focused files; expected all transport, parser, and conflict cases pass. Commit `feat(sync): add verified Drive data transport`.

## Task 3: Data backup service and restart-safe worker

**Files:** Create `src/features/sync/server/drive-backup-service.ts` and `.test.ts`, `src/extension/background/drive-backup-job.ts` and `.test.ts`; modify `src/platform/db/snapshot-idb.ts`, `src/extension/background/register-handlers.ts`, `src/extension/background/scheduler/alarm-scheduler.ts` only where its existing extension point requires it.

- [ ] **Step 1: Write failing policy tests.** A durable revision schedules an upload 30 seconds after quiet and no later than five minutes after the first pending change. Kill the worker between an IDB snapshot commit and alarm creation; startup must reconstruct the job from `revision > lastVerifiedRevision`. An upload creates one immutable file and downloads it by ID before calling `acknowledgeVerifiedRevision(uploadedRevision)`. If a newer local revision appears in flight, it remains pending. A lost upload response is resolved by finding the same operation ID and verifying that file before retrying. Restart from persisted `nextAttemptAt` and operation ID without an in-memory timer. Test offline, 429 backoff, quota, wrong account, and second-device generation conflict.

```ts
await worker.runDueJob()
expect(await store.readActive()).toMatchObject({
  revision: 8,
  lastVerifiedRevision: 7,
})
expect(drive.downloadFile).toHaveBeenCalledWith(createdFileId)
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/features/sync/server/drive-backup-service.test.ts src/extension/background/drive-backup-job.test.ts --run`; expected new tests fail.
- [ ] **Step 3: Implement a durable job record.** Add a `data-backup-job` record beside the Phase 1 active snapshot with `pendingSince`, `nextAttemptAt`, `attempt`, `operationId`, `writerGeneration`, and `deviceId`. Extend the Phase 1 snapshot transaction to update the pending job with the new revision; also reconstruct it on startup whenever `revision > lastVerifiedRevision`, covering upgrades and interrupted scheduling. Schedule a one-shot Chrome alarm and recreate it on startup. Serialize jobs with the existing background mutation queue; worker death leaves the job record. Recheck account and latest remote generation before upload. On retry, query by operation ID first. Mark success only after readback and exact-revision acknowledgment. Back off with jitter from one minute to one hour; auth, quota, corrupt payload, and conflict become visible action-needed states. Prune retention after verification.

```ts
const uploadedRevision = snapshot.revision
const existing = await drive.findByOperationId(operationId)
const fileId = existing?.id ?? (await drive.createFile(payload, properties)).id
const downloaded = await drive.downloadFile(fileId)
await verifyDataFile(downloaded, { sha256: digest, size: payload.byteLength })
await store.acknowledgeVerifiedRevision(uploadedRevision)
```

- [ ] **Step 4: Verify GREEN and commit.** Run the focused files plus `src/extension/background/sync-auto-sync.test.ts`; expected retries and existing Gist scheduling tests pass. Commit `feat(sync): back up exact local revisions to Drive`.

## Task 4: Restore preview and force actions

**Files:** Modify `src/features/sync/server/drive-backup-service.ts`, `src/features/backup/server/backup-service.ts` only if its preflight needs reuse, `src/extension/background/backup-replacement.ts`, `src/features/sync/api/drive-backup-contracts.ts`, `src/features/sync/api/drive-backup-api.ts`, `src/features/sync/components/drive-backup-panel.tsx`, `src/features/backup/components/data-management-screen.tsx`; add focused tests beside each changed module.

- [ ] **Step 1: Write failing action tests.** A fresh install lists safe counts/date/version and waits for explicit confirmation. Existing local data is never pulled automatically. Force push publishes a higher writer generation and reports success only after readback; upload failure leaves the old verified head. Dirty force pull validates first, writes a local recovery copy, promotes the selected backup, and invalidates affected caches. Failed promotion keeps old local data. A historical-version restore creates a new generation; failed takeover reports `local-restore-complete-cloud-takeover-pending` and pauses automatic upload.

```ts
const preview = await service.previewRestore(fileId)
expect(JSON.stringify(preview)).not.toContain('apiKey')
await expect(
  service.forcePull({ fileId, confirmLocalOverwrite: true }),
).resolves.toMatchObject({
  localStatus: 'durable',
  cloudStatus: 'takeover-pending',
})
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/features/sync/server/drive-backup-service.test.ts src/features/sync/api/drive-backup-contracts.test.ts src/extension/background/register-handlers.test.ts src/features/sync/components/drive-backup-panel.test.tsx src/features/backup/components/data-management-screen.test.tsx --run`; expected newly added force/preview assertions fail.
- [ ] **Step 3: Implement trusted actions.** Zod-parse dashboard-only requests, authorize sender in `runtime-policy`, call `prepareFullBackupRestore` before replacement, use Phase 1 `commitReplacement` and recovery copy, and broadcast the existing data-management invalidation tags after durability. A force pull bypasses the clean-local guard only after explicit confirmation. Render source/target and impact before confirmation, plus separate local/cloud completion states. Force push reads the last durable local snapshot and publishes a higher generation without mutating the prior Drive head.

```ts
export const forcePullDriveRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  fileId: z.string().min(1),
  confirmLocalOverwrite: z.literal(true),
})
```

- [ ] **Step 4: Verify GREEN and commit.** Run `npm test -- src/features/sync/server/drive-backup-service.test.ts src/features/sync/api/drive-backup-contracts.test.ts src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts src/features/sync/components/drive-backup-panel.test.tsx src/features/backup/components/data-management-screen.test.tsx --run`; expected dirty force pull, failure, and takeover cases pass. Commit `feat(sync): add explicit verified Drive restore and force actions`.

## Task 5: Gist migration and per-installation cutover

**Files:** Modify `src/lib/github/api/gist-requests.ts`, `src/features/sync/server/sync-service.ts`, `src/features/sync/server/drive-backup-service.ts`, `src/app/providers/sync-open-check.tsx`, `src/features/sync/components/github-sync-panel.tsx`, `src/features/sync/components/drive-backup-panel.tsx`, and focused tests.

- [ ] **Step 1: Write failing migration tests.** A truncated Gist follows its `raw_url` after the optional host grant, enforces a size limit, and parses a full valid sync envelope. A failed raw download does not become an empty backup. Legacy Gist push re-fetches content and compares its exact backup bytes before recording success. Connecting Drive while local data exists keeps Gist automatic behavior until the first Drive data version is verified; after cutover there is no automatic Gist push or surface-open pull. An empty local install with a Drive backup prompts restore rather than uploading empty data.

```ts
expect(gist.contentTruncated).toBe(true)
expect(await client.readFullGistContent(gist)).toBe(fullEnvelopeJson)
expect(await cutoverStore.read()).toMatchObject({
  destination: 'drive',
  firstVerifiedFileId,
})
```

- [ ] **Step 2: Verify RED.** Run `npm test -- src/lib/github/api/github-client.test.ts src/features/sync/server/sync-service.test.ts src/app/providers/sync-open-check.test.tsx --run`; expected new raw/cutover cases fail.
- [ ] **Step 3: Implement legacy recovery and cutover.** Request `gist.githubusercontent.com` host only for a large legacy recovery from a dashboard gesture. Fetch the supplied GitHub raw URL only after host/path validation; bound bytes and validate the complete Gist envelope. Re-fetch after legacy push and compare content before `recordPush`; report a clear failure if GitHub cannot return it. Persist `destination='drive'` only after the first verified Drive file. Preserve Gist connection metadata for explicit recovery and label legacy controls clearly.

```ts
if (gist.contentTruncated && gist.rawUrl !== null) {
  const raw = new URL(gist.rawUrl)
  if (
    raw.protocol !== 'https:' ||
    raw.hostname !== 'gist.githubusercontent.com'
  ) {
    throw new Error('Unsupported Gist raw URL.')
  }
  return readBoundedGistContent(raw.toString())
}
```

- [ ] **Step 4: Verify GREEN and commit.** Run `npm test -- src/lib/github/api/github-client.test.ts src/features/sync/server/sync-service.test.ts src/app/providers/sync-open-check.test.tsx src/features/sync/components/github-sync-panel.test.tsx src/extension/background/register-handlers.test.ts --run`; expected migration and target labels pass. Commit `feat(sync): migrate verified Gist backups to Drive`.

## Task 6: Validation, release configuration, and docs

**Files:** Modify `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `design.md` only for visible settings behavior, and release configuration guidance.

- [ ] **Step 1: Run focused tests and scaling fixtures.** Include interrupted upload, wrong checksum, restart, delayed acknowledgment, 5,000-review and larger backup sizes, dirty force pull, old-device takeover, raw Gist >1 MB, and Drive quota/auth failures. Keep secret values out of mocks, logs, and status snapshots.
- [ ] **Step 2: Run required gates with Node 24.20.0.** Run `npm run db:check`, `npm run lint`, `npm run check`, `npm run build`, and `npm run zip`; focused tests precede the full check. Record exact failures and skipped commands. Review sender authorization, Zod parsing, redaction, cache invalidation, and release/rollback effects.
- [ ] **Step 3: Prove release setup and human flows.** Confirm stable production extension ID, published Google OAuth consent, and a production client ID. Human engineers test installed-extension connect, save/offline/retry, reinstall preview, force push/pull with dirty data, historical restore, wrong account, second-computer takeover, and Gist migration. Attach screenshots or recordings of status and restore states before PR review or merge.
- [ ] **Step 4: Update authority docs and commit.** Document shipped one-way backup policy, 30-second quiet/five-minute maximum schedule, version retention, last verified time, permission and account model, failure messages, and exact manual smoke steps. Commit `docs(sync): document verified Drive data recovery` and prepare a PR-ready summary with commands and remaining proof.

## Completion criteria

Phase 2 is complete when a durable local revision becomes a verified Drive file, only that exact revision is acknowledged, worker restart and lost responses cannot silently lose or duplicate the backup, a fresh install previews rather than overwrites, force actions give truthful local/cloud outcomes, and each installation switches from Gist only after a first verified Drive version. Phase 3 adds key recovery separately.
