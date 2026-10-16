# Reliable Drive Backup and Key Recovery Design

Date: 2026-10-16

Status: Approved conversational design; written spec awaiting user review

## Purpose and current evidence

CogniPace is primarily used on one computer. Its cloud feature should protect that computer's local work and make a deliberate restore possible after a reinstall or move. Ordinary use should not require the user to reason about clean versus dirty local state.

The current GitHub Gist path does not meet that bar. Gist API responses can omit inline content above 1 MB; CogniPace currently treats a truncated file as unavailable. A push accepts the Gist update response without downloading and validating the stored payload. Automatic pull only proceeds when local data is clean. Local SQLite runs in memory and writes a base64 snapshot to `chrome.storage.local` after a debounce. Chrome's default 10 MB limit is close to the 9.7 MB encoded snapshot measured for the repository's 5,000-review scaling fixture. Some replacement continuation state also lives only in a service worker instance. These are distinct failure points; a successful remote request alone cannot prove a recoverable backup.

The agreed direction is local-first, one active computer, Drive-backed recovery, and a separate Google-account-protected copy of provider keys. It replaces automatic bidirectional Gist sync after a verified Drive cutover. The user approved Google sign-in, an explicit restore preview, Google account access as the sole key-recovery gate, and the specific Chrome and Google permissions below.

## Approaches considered

1. **Harden Gist:** retain the existing connection and repair raw-file reads, force operations, and readback. This minimizes migration work but keeps a single mutable Gist as the backup and leaves large-payload and conditional-write limitations.
2. **Use a private GitHub repository:** gain Git history and stronger versioning. This adds Git repository setup, token scope, commit/conflict handling, and a less natural recovery flow for ordinary users.
3. **Use app-created Google Drive files (chosen):** keep a user-owned, visible recovery location, immutable data versions, narrow `drive.file` access, and Google account recovery. It requires OAuth publishing and relies on the user's shared Drive quota, currently 15 GB for a free personal account. Standard Drive API use currently has no additional charge, but Google has announced potential quota charges later in 2026; the product must not promise that provider pricing will remain free.

Drive's hidden `appDataFolder` is not the recovery store: Google documents that its contents can be deleted when the user uninstalls the app from My Drive. A visible app-created folder is easier to inspect and recover.

## Ownership and local storage

- `src/platform/db` owns SQLite snapshot persistence. The working SQLite database can remain in memory, but a mutation is reported as saved only after its committed snapshot, schema fingerprint, monotonically increasing local revision, and data-backup-needed marker commit together in IndexedDB. The normal 250 ms deferred snapshot cannot be the durability acknowledgment. If IndexedDB persistence fails, the UI reports a local-save failure and further mutations stop until retry or rollback to the last durable snapshot. Performance at the scaling fixtures is a release gate; the implementation plan must choose and benchmark an appropriate snapshot/write strategy before changing all mutation paths.
- On upgrade, validate and copy the old `chrome.storage.local` snapshot into IndexedDB, read it back, and activate it before removing the old copy. An interrupted migration must be restartable and must never silently initialize an empty database over a valid old snapshot. SQLite schema and existing backup-format compatibility checks still apply.
- `src/platform/secrets` continues to own background-only local secrets in restricted `chrome.storage.local`. Ordinary data exports, SQLite snapshots, logs, query caches, and UI status payloads contain no secret values. Reconcile the current secret-set fingerprint with the last verified key-backup fingerprint on worker startup so a crash between a key write and queue scheduling cannot lose the backup request.
- `src/features/backup` owns data serialization, validation, and replacement rules. `src/features/sync` owns backup policy, versions, active-writer generation, status, and explicit force actions. A Drive adapter under `src/platform` or `src/lib` owns HTTP calls; `src/extension/background` owns Chrome identity, alarms, trusted message handlers, and job execution. UI surfaces compose these services without direct database or token access. Runtime requests and remote backup envelopes are parsed with Zod.

`unlimitedStorage` protects IndexedDB from extension quota limits and eviction, subject to available disk space. Disk-full and browser-storage errors still need a truthful local-save failure.

## Drive layout and identity

Data versions are immutable, app-created blob files in a visible **CogniPace Backups** folder in the user's My Drive. Each envelope records format version, backup schema version, active-writer generation, opaque device ID, exact local revision, creation time, uncompressed length, and SHA-256 digest. A bounded upload may compress the existing data-backup payload; restore verifies size, digest, schema, and full import compatibility after download. App-private Drive file properties identify CogniPace files so folder renames do not break discovery. CogniPace only marks a revision backed up after downloading the created file by ID and verifying its bytes and parsed contents. A failed or ambiguous request leaves that revision pending.

The cloud head is derived from verified files, not a mutable file that can be left half-written: the highest writer generation wins, then the highest revision for that writer. Two device IDs in the same generation, or different content hashes for the same generation and revision, are a conflict that pauses automatic upload. A completed upload is checked against this rule before its local acknowledgment. Each operation has a deterministic identity based on generation, device, revision, and digest so a restarted worker can find and verify a file created before it received a response.

The normal retention target is the latest three verified data versions, one verified version per day for the preceding seven days, and one per week for the preceding four weeks, deduplicated by file ID. Prune only after a newer version is verified, never remove the last two recoverable versions, and surface quota or cleanup failures. Retention is a backup policy, not a promise against the user deleting Drive files or losing their Google account.

Key recovery uses a separate owner-only **CogniPace Key Recovery** folder, never a child of the data-backup folder. It stores the current values for `github:gist`, `genai:openai`, `genai:anthropic`, `genai:google`, and `genai:openrouter` when present. After opt-in, an add, replacement, or deletion queues a separate key-backup job. Each key state has a monotonically increasing version and digest in its app-private file properties so a reinstall can discover the latest verified state without a local pointer. The job creates a replacement file, downloads and validates it, records that version as current, then permanently deletes prior app-created key files. An empty key set is a valid new state. If old-file cleanup fails, show **key cleanup pending** and retry; restores use only the newest verified key state. CogniPace does not maintain historical key versions. It checks that the key folder/file is not shared and pauses key backup if ownership or permissions are unsafe. A separate explicit delete-cloud-key-copy action is available; disconnecting Google clearly states whether cloud copies remain.

This is **key backup and recovery**, not a zero-knowledge password manager. No extra passphrase is required, as requested. Google encrypts Drive data in transit and at rest, but a person who controls the Google account or gains access to the Drive file may read the keys. Local `chrome.storage.local` is not encrypted by Chrome, so local OS account security also matters. CogniPace cannot promise erasure from Google's internal retention systems or from copies the user has shared.

Chrome Identity provides OAuth access tokens; CogniPace does not store a Google password or its own refresh token. An opaque account identity binds the local backup configuration to the intended Drive account. A different signed-in account pauses work and asks for an explicit switch. Development and production extension IDs need their own stable OAuth clients and release configuration so a fresh installation of the production extension can see the same app-created files.

## Ordinary backup and worker policy

Normal operation is **one-way local-to-Drive backup**. There is no automatic pull or merge on popup, dashboard, overlay, or LeetCode open. An existing local database is never replaced simply because Drive has another version. On an empty installation, finding an existing backup opens a preview of version, date, size, and safe data counts; the user confirms restore. When both local and cloud data exist, show a comparison and require a directional choice.

Data and key recovery are presented separately. A key preview shows provider names and presence, never values. The user explicitly confirms key restore and whether any existing local key will be replaced. The trusted background validates downloaded key records, writes the secret store, and returns only presence/status to the UI.

After each durable data change, a pending job is committed locally. Schedule an upload after 30 seconds without a new change, with a five-minute maximum while edits continue. Coalesce intermediate revisions, but a worker may acknowledge only the exact revision it uploaded and verified; newer revisions remain pending. Key changes request an immediate separate attempt. Backup status distinguishes local save, pending data backup, last verified data backup, pending key backup, last verified key backup, reconnect required, conflict, quota failure, and cleanup pending. The last verified time and revision are visible. Offline or sleeping time may extend the cloud lag; the UI must not imply a fixed recovery-point guarantee.

The Manifest V3 service worker runs bounded jobs on mutation events, startup, UI-triggered checks, and `chrome.alarms`. It stores job state, next attempt time, and idempotency identity durably; in-memory timers and locks are only optimizations. On restart, an incomplete upload is resolved by looking up its deterministic operation identity and verifying any file already created before retrying. Transient network and rate-limit failures use jittered exponential backoff from roughly one minute to one hour. Authentication prompts occur only after a user gesture in the UI; background jobs request tokens noninteractively. Revoked access, account mismatch, invalid payload, and quota failure become action-needed states rather than endless silent retries. Notifications are reserved for sustained actionable failure and do not repeat on every alarm.

Each verified data file has an active-writer generation and device identity. Restoring on another computer explicitly claims a newer generation. Automatic uploads pause while that claim is pending. An older installation that observes the newer generation stops automatic uploads and offers an explicit takeover. This is a single-writer safety policy, not simultaneous-edit conflict resolution. If two computers work offline concurrently, neither can guarantee an atomic cross-device outcome; reconnection exposes a conflict and preserves both local data and existing remote versions until the user chooses.

## Explicit force actions

**Force push** uses the currently durable local snapshot. It verifies the connected account and remote generation, creates an immutable file in a newer generation, downloads and validates it, and then marks that exact revision as the cloud head. A failed force push leaves the previous verified backup available and the local database unchanged. A delayed automatic job from an older generation cannot become the head. The UI distinguishes a completed verified push from a pending or failed one.

**Force pull** can proceed even when local data is dirty. It downloads the selected verified Drive version, validates its digest and import compatibility, commits a local recovery copy of the current database, stages the replacement, and promotes it through the IndexedDB persistence boundary before reporting local success. A failure before promotion leaves the old local database active. After promotion, runtime caches and affected views are invalidated and the previous local copy remains selectable for recovery. Restoring a historical version or taking over from another computer publishes the restored state in a newer writer generation so an older cloud head cannot later win. If that cloud write fails, the UI reports **local restore complete, cloud takeover pending**; it does not report full cloud success. The UI names the source, target, and data that will be replaced before confirmation.

These actions are near-atomic at their individual local and remote commit points. No browser-only design can make a local IndexedDB transaction and a Google Drive request one distributed atomic transaction. Versioning, staging, readback, and explicit partial-success states make interruptions recoverable without a false success message.

## Migration and release sequence

1. Build and verify the local persistence barrier, durable job model, force-action state machine, and legacy snapshot migration. Existing Gist data remains available while these foundations are checked.
2. Add Google connection and Drive data backup/restore. A connected installation switches its automatic destination only after its first Drive copy is downloaded and verified. Keep the old Gist readable for explicit recovery; stop automatic Gist writes and pulls after cutover. Before cutover, legacy Gist force actions use the same staged local replacement and remote readback rules. If Gist inline content is truncated, use its raw URL with the separately requested host permission, size limits, and full validation. If GitHub cannot safely store or return the payload, report failure and guide the user to Drive instead of claiming success. If raw recovery is unavailable, offer guided manual Gist export/import without silently accepting a partial file.
3. Add opt-in key backup, separate status, key restore preview, rotation/deletion cleanup, and account-switch protections. Keys never enter the ordinary data backup.

The phases are implementation and verification slices, not permission to release a partially functioning replacement. Existing Gist controls must name their legacy target until cutover. Product, architecture, testing, and settings copy must be updated with shipped behavior. A rollback keeps local and Gist recovery data and avoids deleting the prior verified Drive data version.

The extension declares `identity` and `https://www.googleapis.com/*` as optional permissions requested when connecting Google, and `https://gist.githubusercontent.com/*` as an optional host requested only for large legacy recovery. It adds `unlimitedStorage` for local database durability. Google OAuth requests only `https://www.googleapis.com/auth/drive.file`; no broad Drive or email scope is needed. The user explicitly approved these permissions. Production requires a stable extension ID, a configured Google Cloud OAuth consent screen/client, and published production access. Google's testing OAuth mode has short-lived authorizations, so it is not an acceptable steady-state backup configuration.

## Failure validation and release gates

Focused automated tests cover migration restart, local persistence failure, exact-revision acknowledgment, upload success with a lost response, readback mismatch, worker termination and alarm recovery, backoff, expired authorization, quota errors, wrong account, active-writer takeover, Gist truncation, force push failure, dirty force pull, restore rollback, key rotation and deletion, old-key-file cleanup, secret redaction, Zod rejection, and cache invalidation. Use the repository's 5,000-review fixture and larger scaling fixture to measure snapshot write latency, size, upload behavior, and restore memory usage. Tests use fake keys and a fake Drive transport.

Implementation validation follows `docs/agent-governance.md`: focused tests first, then `npm run db:check` for persistence behavior, `npm run lint`, `npm run check`, `npm run build`, and `npm run zip` if artifact packaging changes. Human engineers must run happy-path and edge-case flows in the installed extension, including offline edit and retry, reinstall preview, force actions with dirty data, large backup, wrong Google account, key recovery/deletion, and worker restart. Screenshots or recordings of visible status and restore flows are required before PR review or merge. Commands skipped or failed must be named with reasons. The release must prove the production OAuth client and published consent state, Drive quota behavior, and a recoverable last verified version before retiring Gist automatic sync.

## Source references

- [GitHub Gist API and truncated file content](https://docs.github.com/en/rest/gists/gists?apiVersion=latest)
- [Google Drive scopes and `drive.file`](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Drive application data folder lifecycle](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Google Drive API limits and pricing](https://developers.google.com/workspace/drive/api/guides/limits)
- [Google account shared storage quota](https://support.google.com/drive/answer/9312312?hl=en)
- [Google Drive permanent file deletion](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/delete)
- [Google Drive encryption](https://support.google.com/drive/answer/10375054?hl=en)
- [Chrome extension storage and eviction](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
- [Chrome extension storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [Google OAuth publishing status](https://support.google.com/cloud/answer/15549945?hl=en)
