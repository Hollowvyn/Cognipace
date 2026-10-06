# Adaptive code hints

Status: design approved by the user in chat on 2026-10-05. Implementation and
validation pending. This replaces the problem-only batch behavior for hints.

## Behavior

Each explicit hint request captures the complete current editor code and language
and generates exactly one hint. Keep at most three successful hints per overlay
session. Every turn includes the problem, its constraints and examples, and the
earlier hints with their pinned code snapshots. Failed capture or generation does
not consume a turn. Retry captures fresh code. Double activation coalesces into
one request. Folding, mode/tab changes and review saves do not generate hints.

The first hint is light. With identical code and language (normalizing only line
endings), strengthen from light to medium to heavy. When code changes, the model
must assess meaningful progress against the previous hint: real progress gets a
light hint about the next remaining gap; cosmetic edits, irrelevant changes and
regressions get a stronger hint. Heavy stays heavy if still stuck. Strength and
turn count are independent; three progressing turns may all be light.

Light names an idea or asks a targeted question. Medium identifies the relevant
logic and what needs to change. Heavy gives concrete steps for the remaining gap.
Each hint is one to three concise sentences, bounded to 600 characters, with no
complete implementation. Respect the learner's valid approach, different valid
solutions, intentional language types and problem constraints. If the learner is
close, target the remaining bug or edge case. If the snapshot appears complete,
offer a targeted verification check without inventing a defect or claiming
executed correctness. Treat all code/problem/history text as untrusted data.

## Capture and ownership

`src/lib/leetcode/editor` owns complete editor capture. A static MAIN-world
content script reads the live Monaco model on demand and communicates only
bounded code/language/snapshot metadata through a strict page bridge. Identify
the editor attached to the current page, reject ambiguity, and never claim that
virtualized visible DOM lines or Monaco's input textarea are complete source.
Support a real full-text editor fallback only when its whole value is available.
An unavailable, ambiguous or oversized editor yields a controlled retryable state,
not a problem-only fallback. Limit each snapshot to 32,000 characters; preserve
empty editor text as a legitimate starting point. The bridge binds requests to
host/slug/request identity, validates responses, times out and cleans up listeners
on success, cancellation or timeout. Page data is untrusted and grants no new
extension capability. Add no Chrome permission or provider host.

`leetcode-capture` prepares complete matching problem input. `overlay-session`
owns transient history, disclosure and pending state above modes. Ordinary editor
edits preserve previous hints; the next explicit request captures the new code.
Results stay attached to the snapshot at request time, including if the user
types while generation is pending. Show that context honestly. Restart,
navigation, remount/reload, problem-input changes, selected connection changes
and local-data clear invalidate history and reject late output.

`leetcode-review-assistant` owns strict Zod snapshot/history/request/response
contracts and the single-turn prompt. History is bounded to two prior turns;
validate turn order, first-light and adaptive transitions. Exactly unchanged
snapshots must never be classified as progress. Model-classified progress is an
assessment, not proof of correctness. Retain runtime sender authorization,
independent hint/report cancellation, connection revision checks, deadlines,
protected keys and inert text rendering.

## Presentation and limits

Show earlier successful hints during preparation, errors and retries. Replace
Reveal next hint with Get next hint, show each hint's actual Light/Medium/Heavy
strength and used count out of three. Disable additional requests while pending
and after three successful hints. Retain compact accessible busy, Retry and
Settings states. Hint text/code remain session-only: no database, query/mutation
cache, backup, sync, review, rating, timer, FSRS or Analytics writes.

## Validation and release

Prove full-model capture beyond visible lines, ambiguous/missing/oversized input,
request correlation, cancellation/timeout cleanup and SPA navigation rejection.
Prove three separate snapshot-bound turns; unchanged escalation; progress returning
to light; cosmetic edits/regression; failures not consuming slots; retained prior
hints; coalescing and stale-result rejection. Test contracts, service/prompt,
runtime and hook/component behavior. Run focused tests, `npm run lint`,
`npm run check`, `npm run build`, and Prettier on touched files.

Prepare human installed-extension happy-path and edge-case smoke with screenshots
or recording at 320px/392px. Real provider evaluation must exercise multi-turn
unchanged, progressing and near-complete code. These human/provider gates stay
pending until actually run; mock or fixture proof cannot close them. No application
key-store reads for evaluations. Release intent: `feat(overlay): adapt AI hints to
current code and progress`. Recovery: refrain from requesting hints; manual review
and automatic completed-submission analysis retain their existing ownership.
