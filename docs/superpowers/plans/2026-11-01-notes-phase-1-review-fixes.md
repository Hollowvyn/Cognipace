# Notes Phase 1 review fixes

These five fixes implement the already approved Phase 1 safety semantics. The
user authorized fixing the five independently reproduced review findings before
addressing other comments. Work stays on `codex/notes-implementation`; no new
capture, editor, permissions, transport, dependencies or SQL migrations.

Each task uses a fresh implementer, test-first reproduction, one Conventional
Commit, independent specification review, then separate quality review. Review
fixes amend the current unpublished task commit before the next task begins.

1. **Reject conflicting submission aliases during preflight.** In the shared
   Notes archive validator, reject duplicate external `(host, externalSubmissionId)`
   aliases and observed-attempt aliases, including duplicates within one row.
   Cover preview/confirmation/staging so rejection precedes preview persistence,
   candidate creation or active changes. Preserve payload integrity checks.
2. **Parse BOM-prefixed JSON without changing transferred bytes.** Preserve the
   original UTF-8 chunks and SHA-256. After checksum validation, remove exactly
   one leading U+FEFF from parsing input only. Cover real File/API streaming,
   transfer preview and confirmed restore, bad checksum and embedded BOM.
3. **Order submission pages chronologically.** Add a derived indexed timestamp
   key and matching stable cursor while preserving original timestamp strings
   in records/exports. Cover fractional precision, equivalent instants, ties,
   multiple bounded pages, staging and reopen. Preserve v1 upgrade and fail-closed
   behavior. The approved physical IndexedDB v3 change is index-only: atomically
   backfill the normalized chronology key and recreate `byProblem` for existing
   v2 rows. Pass the actual `oldVersion` and run the historical binary split only
   below v2; preserve the head format version 2, SQL, technical epoch, readiness,
   pending state, opaque recoveries and core/provenance identities. A derived
   field alone cannot fix an already-created v2 raw-timestamp index. Genuine
   records with corrupt indexed fields abort; legitimate attempt aliases skip.
   Normalize omitted seconds and trailing fractional zeroes without truncating
   submillisecond precision; retain original submittedAt in cursors and exports.
   Rederive on import, generation copy and reflection writes. Historical Phase 1
   handoff evidence remains unchanged.
4. **Recover accepted prepublication work after worker restart.** Persist pending
   admission before archive staging, reconstruct the exact accepted descriptor,
   core bytes, source ownership and archive progress through production status and
   generic retry. Never rerun accepted SQL, mint tokens, rebase or silently unblock
   normal mutations. Partial staging resumes; missing/corrupt input fails closed;
   terminal invalid input rejects without poisoning the profile. Exercise registered
   status/retry flows with native transaction-backed IDB and SQLite restart faults.
   Confirm the concrete owning-service composition with root before a broad change.
5. **Promptly reclaim superseded ordinary cores.** Storage owns bounded cleanup
   after durable ordinary commits, preserving active, paired/core-only recovery,
   prepared and pending roots and transaction-abort behavior. Avoid full-body
   scans and foreground monopolization; repeated writes must not indefinitely
   invalidate reclamation. Cover repeated saves, realistic 20-row bulk suspend,
   retained bytes, pinned roots, restart and abort preservation.

Likely ownership: Notes domain validator/repository/archive staging; Backup API
and transfer service; platform IDB schema/snapshot/composite publication; background
replacement coordinator and production registration. Inspect actual call sites
before editing. Supplied scratch probes are evidence, not acceptance tests:
`/private/tmp/cognipace-astra-review/archive-repro.test.ts` and
`/private/tmp/cognipace-astra-correctness-review/repro.test.ts` assert old broken
behavior; add committed regressions asserting the required behavior instead.

After all tasks pass both reviews, obtain an independent integration review, update
current authority/smoke documentation and a separate review-fixes handoff. Run
focused checks followed by the required full matrix once with pinned
Node 24.20.0/npm 11.19.0: `npm run db:check`, `npm run lint`,
`npm run check -- -- --maxWorkers=2`, `npm run build`, `npm run format`,
`npm run zip`, `npm run store:check`. Skip `npm run db:generate` only if SQL is
unchanged. Record exact failures, skips and limitations. Investigate the existing
CI 5-second archive-copy fixture timeouts with bounded deterministic fixtures
retaining multi-batch/abort/resume assertions if necessary; no global timeout or
workflow policy change. Human installed-extension smoke and screenshot/recording
proof remain pending before PR review/merge. Root owns publication; no push or
posted PR comments from this execution.
