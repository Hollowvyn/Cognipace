# Responsive LeetCode Overlay Startup Design

Date: 2026-10-12

Status: Written design approved; phase-sized implementation planning in progress.

## Problem and evidence

On a LeetCode problem page, the overlay shell can appear while its problem context and timer controls remain unavailable for roughly 30 seconds. FSRS rating estimates may still say “Estimating…”. The user also noticed that LeetCode's code Submit sometimes appears to spend a long time judging, but identified overlay startup as the priority. The screenshots show delayed states; they do not isolate the slow stage or prove that CogniPace delays LeetCode judging.

The current startup sequence in `use-leetcode-page-sync.ts` awaits remote LeetCode metadata, sends a page-problem upsert, and only then enables the overlay app-shell read. The upsert handler calls `runDbMutation`, which publishes a complete SQLite snapshot before acknowledging. The app-shell overlay read includes Practice details, Today Queue and active-track work. The expanded rating preview starts after practice generation arrives. Manual timer controls are disabled until the full overlay context is ready. All of these are candidates for latency measurement; none alone has been measured as the cause of this report.

The Phase G packaged 5,000-review fixture measured durable Save near 254 ms median, preview near 1–2 ms median, and full browser restart near 2.25 seconds median. These fixture results do not explain a 30-second live delay or establish the user's profile size. Existing surface-open GitHub sync already uses delayed background scheduling and must remain outside the startup response path.

## Outcome and boundaries

- Make the overlay and manual timer usable promptly after the content script recognizes a valid problem URL, even if LeetCode metadata or local data is slow.
- Show truthful loading, error and retry states until saved Practice context is known. Do not show “no submissions” or enable review actions from absent data that has not yet loaded.
- Load saved review context from local storage independently of remote LeetCode metadata for an existing problem. Load FSRS preview and next-step guidance after essential context without blocking the timer or a valid review action.
- Preserve the accepted review command, generation checks, FSRS outputs, track effects, sync invalidation and durable success acknowledgement.
- Measure both actual startup latency and page-renderer work; improve the measured bottleneck, not just the loading appearance.

The first implementation does not redesign SQLite persistence, change the stored format, add a permission, expand sync, or add a hosted service. LeetCode code Submit is a secondary diagnostic path. A bounded click-capture repair belongs in a separate phase if a trace attributes a meaningful renderer delay to CogniPace.

## Approaches considered

| Approach                                               | Benefit                                                                                                                                   | Cost and limit                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Shorten the existing serial startup                    | Smallest code and contract change; an unchanged metadata upsert can avoid a full snapshot write                                           | Metadata or another slow prerequisite can still keep the timer unavailable                         |
| Progressive startup with measured cleanup **(chosen)** | Manual timer and honest shell become usable before remote metadata and database publication; known saved context can arrive independently | Requires explicit pending states, session-race handling and a narrower local read contract         |
| Incremental persistence redesign                       | May improve large-history write latency if snapshot publication dominates                                                                 | Migration and recovery risk; does not address remote metadata gating or initial timer availability |

## Architecture and data flow

### Page-side session

`src/entrypoints/leetcode.content.tsx` continues to mount the overlay. `overlay-session` creates a session epoch from the parsed problem URL. The URL slug establishes provisional identity; a bounded DOM snapshot can supply a provisional title or difficulty. The shell labels these as page information while saved context is pending. Manual timer controls follow their current idle/running/paused rules for that valid active URL without waiting for a runtime message. Review Submit, Update and fail actions require the same validated saved context and generation that they require today.

The page watcher emits usable page identity without awaiting its LeetCode metadata request. Remote metadata enrichment runs independently through the existing background-owned capture path. If metadata has not returned within two seconds, the current DOM/slug fallback can supply the existing fallback shape; a later successful response may enrich the current session. A provisional title or difficulty does not imply saved Practice state. Every asynchronous result carries or is checked against the active slug and session epoch. SPA navigation and remount retire stale results and reset the timer under the current session rules.

The content script still performs the small DOM reads and React rendering that require the page renderer. LeetCode network calls, database reads and database writes remain in the extension service worker. Independent network and local read requests may overlap. Operations on the shared SQLite connection remain ordered wherever transaction consistency requires it; “concurrent startup” does not permit overlapping unsafe transactions.

### Local core and secondary data

`app-shell` exposes a narrow, content-script-authorized overlay core read by slug. It returns the existing problem and Practice details if present, plus settings needed for appearance, timing, automation and AI availability. It omits Today Queue and next-step composition. The core read uses a consistent local database snapshot and returns an explicit missing-problem outcome instead of fabricating empty review history. For a known problem, this read begins as soon as the URL slug is known, in parallel with remote metadata. For a new problem, metadata is upserted through the owning Problems feature, then core context is fetched again.

The current overlay app-shell composition supplies next-step guidance through a separate, lower-priority read after core context. FSRS preview remains a Practice-owned read after generation is known; it cannot gate manual timer controls or a valid review action. Existing invalidation and refresh rules update core context, next-step guidance and previews after a real mutation or sync pull.

The progressive startup phase retains the current Problems upsert, `updatedAt`, invalidation and durable publication behavior. Skipping an unchanged upsert is a possible later optimization only if measurement shows that publication dominates the remaining latency. Before choosing it, audit whether page-open `updatedAt` or its invalidation affects Queue, Library, sync or other consumers; skipping either would change behavior unless those effects are preserved. The Problems repository remains the owner of any eventual comparison and write decision. UI code never writes SQLite directly.

### Timer and review invariants

Early manual timer availability changes when a user can start timing; timer counting, pause, reset, lock and session reset rules stay the same. Automatic timer start remains dependent on the verified saved `autoDetectSolved` setting and starts when that setting arrives, as it does today. It does not backdate elapsed time. The target-time display may wait for verified difficulty and timing settings; an unknown target must be labeled as pending rather than `00:00` as if it were known.

Review saves and corrections keep their frozen command identity and exact review time. A valid acknowledgement appears only after the existing durable snapshot publication succeeds. A failed preview or next-step read does not disable a valid review. Pending persistence and Retry continue to use the current accepted command and never report success early.

## Errors, races and recovery

- Remote metadata slow or failed: known saved context remains usable; new problems retain timer access and show review-context loading or a retryable error. A late metadata response updates only the active session.
- Local core read slow or failed: page identity and manual timer remain usable; saved-history and review controls remain pending or error, never falsely empty. Retry targets the current slug and epoch.
- New-problem upsert failed: preserve the page shell and timer, show a retryable review-context error, and do not accept a review against a missing generation.
- Next-step or preview failed: show their existing unavailable/error treatment without blocking the core overlay.
- Navigation, reset, concurrent sync or two-tab review: keep current generation and receipt conflict checks. Discard obsolete async results and refetch after invalidation.

No error path clears or replaces persisted data. Rollback is the previous extension build; the design adds no migration or backup-format change.

## Measurement and acceptance

Record sanitized stage durations for navigation to content-script mount, mount to usable timer, DOM identity, local core read, remote metadata, problem upsert, snapshot publication, next-step and FSRS preview. Worker and renderer clocks are measured separately; do not subtract timestamps across contexts. Record stage names and durations only, never problem text, submitted code, credentials or full runtime payloads. Compare 20 warm opens and 10 cold opens of known problems on the packaged 5,000-review fixture, plus new-problem and real-profile diagnostic runs. Use nearest-rank p95 and retain raw samples. A real installed-extension trace is needed for the reported 30-second case.

- Across the 20 warm opens, the manual timer is interactive within 250 ms of content-script mount at p95, with no awaited network or database response on that path.
- On the packaged 5,000-review fixture, known-problem saved context arrives within 1 second of content-script mount for warm opens and 4 seconds for cold opens at p95. Record the exact browser, build and profile used.
- Attribute any CogniPace renderer long task over 50 ms during startup or LeetCode Submit to a named operation. Improve a confirmed click-capture bottleneck in its own phase, preserving submission matching.
- If the known-context target still fails, use the measured dominant stage to decide between a focused local optimization and a later persistence design. Do not claim fixture capacity or latency as a guarantee for every installed profile.

Automated tests must cover known/new problems, slow/failing remote metadata, slow/failing local reads, premature-empty-state prevention, auto/manual timer semantics, SPA supersession, invalidation, preview independence and exact saved-review/FSRS parity. If a later phase changes upsert behavior, add unchanged-versus-changed metadata, `updatedAt`, Queue and sync-effect tests. The phase plan must run focused tests first, then the governance-required `npm run lint`, `npm run check` and `npm run build`; database-behavior work also requires `npm run db:check`. `npm run db:generate` is needed only if a schema change is separately approved.

A human engineer must run installed-extension happy-path and edge-case smoke from `docs/testing.md` before PR review or merge, including warm/cold known and new problem opens, manual and automatic timing, slow/failing metadata, navigation, review Save/Update/Retry and LeetCode code Submit. Attach a screenshot or recording showing the ready and delayed states. Automated fixture screenshots and timings do not replace that proof.

## Phase boundaries

1. Add low-overhead timing and a reproducible warm/cold startup baseline, including the page-side click-handler sample. This phase identifies the 30-second stage if reproduced and records any unresolved live-profile gap without changing saved behavior.
2. Implement early page identity and manual timer availability, with safe session supersession and remote metadata independent of the local read.
3. Add a narrow local core read and deferred secondary data, preserving exact review, upsert and invalidation behavior.
4. Repair any remaining measured bottleneck against the acceptance targets. A no-op upsert needs the consumer audit and focused proof above. A larger storage redesign requires its own reviewed design if snapshot publication is proven dominant; submission click-capture changes require a focused trace and plan.

Each phase gets a separate implementation plan and validation record. Current product, architecture, testing and governance documents are updated only when shipped behavior changes.
