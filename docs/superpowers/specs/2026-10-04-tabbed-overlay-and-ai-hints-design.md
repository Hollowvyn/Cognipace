# Tabbed overlay and progressive AI hints

Approved in chat on 2026-10-04. This master design covers two implementation
phases: focused overlay tabs first, then on-demand AI hints. Saved Notes is
deferred. The written specification still requires user review before
implementation planning.

## Problem and outcome

The expanded overlay currently puts submission dates, timer, assessment,
AI feedback, and Help in one narrow scrolling body. Its fixed review footer
also contains feedback and Up next, so the reading area shrinks after a solve.
Adding Notes to that body would increase the crowding.

Give Solve, AI, and Notes distinct content areas within the existing compact
overlay. Keep the full review footer on Solve. AI feedback gets the remaining
height without that footer. Add short progressive AI hints to Solve's Help area
in a separate phase.

The approved direction is focused tabs, rather than a shared timer/status row.
The alternative shared row would keep timing visible while reading AI, at the
cost of reading space. A temporary Notes textarea was also considered; the user
chose to reserve Notes and design durable notes later.

## Scope and phases

### Phase 1: focused tabs

- Three text tabs in this order: Solve, AI, Notes.
- Shared problem header, difficulty, collapse/settings/dock actions, current
  compact practice context, and tab bar.
- Solve owns submission dates, timer, assessment, untimed warning, Help, review
  actions, review feedback, and Up next.
- AI owns the existing completed-submission analysis presentation and its
  loading, unavailable, error, disabled, and idle states.
- Notes is selectable and displays a short placeholder: "A dedicated space for
  your problem notes, coming in a later phase." It has no editable field.
- Preserve the existing overlay dimensions, anchors, themes, and collapsed and
  docked presentations.
- Existing YouTube Help remains functional; the hint action arrives in Phase 2.

### Phase 2: progressive hints

- Add an AI hint action beside YouTube in Solve's Help area.
- Generate a bounded batch of up to three increasingly specific pointers on an
  explicit request; reveal one at a time.
- Keep hints and reveal state in the current problem session.
- Reuse saved AI connections and trusted background transport.
- Validate and authorize new hint messages and isolate their cancellation from
  completed-submission analysis.

### Deferred

Saved Notes, durable hints, hint-usage analytics, current-editor inspection,
code-aware debugging, chat, automatic note creation, and automatic rating
adjustment are outside these phases. There are no database/schema changes,
new Chrome permissions, additional provider hosts, or backup/sync format changes.

## Layout and interaction

The expanded overlay remains a bounded vertical flex layout. The shared header,
practice context, and tab row remain visible. Each tab owns a vertical scroll
area; only Solve includes the fixed review footer. The footer remains the
existing review actions, feedback, and Up next composition.

AI displays the existing summary, three /5 category scores, independent native
disclosures, and suggested implementation. All existing report labels,
complexity comparisons, inert code rendering, Copy feedback, and Settings/Retry
behavior remain. A disabled AI tab displays a concise explanation and Settings
action rather than an empty panel.

Help initially displays its small actions without an empty hint card. A hint
request opens a compact collapsible block below those actions. The block shows
the revealed hints in order and a Reveal next hint action while more exist.
Its heading uses the actual available count, such as "Hints · 1 of 3". After
the last reveal, it shows "All 3 hints revealed" using the actual count. The
Help action then reopens or folds the existing block without revealing or
generating another hint. Previous hints stay readable. Each pointer targets
one or two short sentences, with no complete implementation or code block.

The preview's report and hint text are examples, not provider-quality evidence.
The approved sketches are held in the local visual-companion session under
`.superpowers/brainstorm/52531-1791168308/content`; that ignored directory is
supporting local reference, not an implementation dependency.

## Session rules

| Event                                                       | Required behavior                                                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First load or different problem                             | Start on Solve; clear old report/hint state through the owning controllers.                                                                                 |
| Tab switch                                                  | Preserve timer, rating, report, hints, reveal count, hint disclosure, per-tab scroll, and opened AI details. Do not request AI or write a review.           |
| Collapse or dock, then reopen                               | Preserve selected tab, report data, hint batch/reveal/disclosure state, timer, and rating. Existing dock restore still returns to collapsed before expand.  |
| Save completes while already expanded                       | Preserve the tab selected at completion, including a tab change made during saving.                                                                         |
| Save completes while collapsed or docked                    | Preserve the current automatic expansion behavior and open Solve.                                                                                           |
| Save/update and ordinary shell refetch                      | Preserve hint state and tab selection. Saving stays immediate while any AI operation is pending.                                                            |
| Restart                                                     | Start on Solve, clear hints and report through their controllers, and preserve the current local-session restart semantics. Make no automatic hint request. |
| Page reload, content-script remount, or leaving the problem | Session-only hints are lost. Pending old work cannot publish into the new session.                                                                          |
| Selected problem inputs change                              | Invalidate the old batch and pending request; require another explicit hint request.                                                                        |
| Provider, model, or key changes/removal                     | Cancel stale hint work and clear the old batch; use the saved connection only after another explicit request.                                               |
| Automatic assessment enablement changes only                | Preserve manual-hint eligibility and hint state when the saved connection and selected problem inputs are unchanged.                                        |
| Clear local data                                            | Clear transient reports/hints and reject late results.                                                                                                      |
| Hint request after a saved accepted or failed review        | Remains available under the same connection/input rules. Do not create or correct a review.                                                                 |

Tab-switch disclosure and scroll preservation applies while the expanded
presentation is mounted. Preserving native AI disclosure/Copy presentation
state across collapse/dock unmounts is not an added requirement. Report data
and selected tab still survive those mode changes. A replacement report
starts with its details closed, as it does today.

Timer execution is independent of the active tab. Hints do not pause/reset it.
Hint use is not recorded in practice history and does not change deterministic
rating, locks, correctness, elapsed time, FSRS scheduling, or track progress.

## Status cues and accessibility

Use small derived cues on the relevant tabs: AI can show generation/Ready/error;
Solve can show saving or a save failure. These are current-status indicators,
not unread counters. Report arrival and save failure do not switch tabs or move
keyboard focus. The full actionable review error remains in Solve.

Use a labelled tablist, associated tabs/panels, explicit selected state, visible
focus, and a roving tab stop. Left/Right and Home/End select and focus the
corresponding tab. Tab proceeds to controls in the selected panel. Inactive
panels are hidden and cannot expose focusable controls. Use element refs for
focus because the overlay is inside a ShadowRoot.

Keep the AI panel and its scroll container mounted during tab switches to
preserve native details and Copy state. Keep each panel's scroll state across
hidden/show transitions. A report replacement retains the existing
request-identity reset boundary.

All content and labels must remain usable at 392px and 320px widths. Vertical
scrolling stays in the selected panel. Horizontal scrolling is confined to
suggested-code content. Hint text is rendered as inert text, and concise
loading/error feedback is accessible without intrusive announcements.

## Hint inputs and generation

The first version gives conceptual help from the current problem, not the
learner's code. Preparation takes a snapshot of matching problem host/slug,
canonical title, statement, examples, and constraints. Require complete,
nonblank statement content for the current problem. Empty examples or
constraints may be valid. Current capture already reads problem content before
a submission; no editor watcher or submission identity is needed.

Do not include submitted/current code, submission diagnostics, LeetCode auth,
official LeetCode hints, follow-ups, or provider credentials in the hint payload.
Bind the batch to a fingerprint of the fields actually used, so changes to
excluded capture fields do not invalidate it.

Use a strict problem-only envelope with request ID, problem identity, selected
input fingerprint, and connection revision. Bound the serialized problem
payload to 24,000 characters, examples to 50, and constraints to 100. Reject
missing, mismatched, incomplete, or oversized essentials without truncation.

The output is a strict batch of one to three trimmed, nonblank pointer strings,
each at most 200 characters. Reject duplicate pointers, extra fields,
additional pointers, and oversized output with a controlled error. Do not
silently truncate output or repair it with another provider call. The prompt
asks for increasingly specific nudges that preserve the learner's work,
without a complete solution. Structural validation alone does not prove
pedagogical quality or prevent every spoiler; provider evaluation must assess
those properties.

The first click starts one generation, receives the batch, and reveals its
first pointer. Guard the operation synchronously so rapid clicks share the
same in-flight request. Further Reveal next hint clicks only advance within
that batch. Reaching the last hint, reopening the block, changing tabs, or
saving cannot regenerate. A failed request offers explicit Retry with a new
request identity; there is no automatic retry or Regenerate action for a ready
batch.

Use the existing AI operation conventions: up to 15 seconds for preparation,
30 seconds for background work including configuration/key loading, and
50 seconds for the complete client operation. Skip preparation network I/O
when current complete matching capture suffices. Each generation has one
provider attempt and a 1,024-token output budget.

## Connection, runtime, and error handling

Manual hints use the selected saved provider/model/key independently of the
automatic-assessment switch. Keep that switch's existing meaning: automatic
completed-submission analysis. Add a connection-only trusted loader and public
availability/connection revision semantics where needed; preserve the automatic
analysis loader's enablement requirement.

Connection revision must distinguish provider/model/key changes from an
automatic-enable-only update. Background work loads the trusted connection
snapshot and checks its identity before publishing. Raw trusted identity may
contain credential material and must never leave background memory. Broad
GenAI invalidation should refresh manual availability without clearing a batch
whose connection and selected inputs are unchanged.

New generation and cancellation contracts use strict Zod request/response
parsing at the extension boundary. Restrict generation to the actual owning
HTTPS LeetCode problem-page sender and bind its host/slug to the request.
Cancellation is owner-scoped and remains possible for that tab/frame after SPA
navigation, using the existing authorization pattern.

Give hints and submission reports separate operation scopes. They must not
cancel one another when both run in a tab/frame. Connection changes and clear
data deliberately cancel both. Navigation, restart, request replacement,
unmount, and deadline expiry cancel or invalidate the appropriate hint work.
Late or mismatched results are ignored by both controller and background
identity checks.

Use compact states: idle, preparing, generating, ready, unavailable, and
controlled error. Missing connection offers Settings; missing/partial problem
context offers useful Retry when capture can be refreshed. Timeout, auth,
quota/network, configuration change, and invalid output show short actionable
messages. Pending hints disable duplicate generation, while timer, review
actions, tab switching, and YouTube remain usable.

Provider keys stay in trusted GenAI storage and approved transport. Do not
place keys or LeetCode auth in hint text, prompts, UI state, query caches, logs,
exports, or sync. Render model output as literal text.

## Ownership and component boundaries

Preserve `entrypoints -> app -> features -> platform/lib/components`.

- `overlay-session` owns selected-tab state, hint controller, transient batch,
  reveal/disclosure state, and Help/tab presentation. State that must survive
  visual-mode unmounts lives above those mode components.
- `ExpandedOverlay` composes tab panels and the Solve-only footer. Use focused
  feature components and existing primitives; no new global store or generic
  tab framework is required.
- `leetcode-capture` and existing LeetCode readers own matching problem content
  and refresh behavior.
- `leetcode-review-assistant` owns separate hint schemas, prompt, consistency
  rules, and generation service alongside its current report capability.
- `genai` owns connection availability, configuration, trusted credentials, and
  connection identity.
- `src/extension` owns message registration, sender authorization, and
  operation ownership/cancellation.
- `src/lib/ai` supplies existing structured provider transport and deadline
  helpers.
- Practice remains the owner of saved reviews. Both new phases preserve the
  overlay's omission of structured-log patches and all historical log fields.

Hints and reports remain outside TanStack Query caches, database persistence,
backup, exports, sync payloads, and analytics. No report or hint completion
causes a review write or practice invalidation.

Relevant existing entry points include:

- `src/features/overlay-session/domain/overlay-session-state.ts`
- `src/features/overlay-session/hooks/use-leetcode-overlay-session.ts`
- `src/features/overlay-session/hooks/use-overlay-review-actions.ts`
- `src/features/overlay-session/hooks/use-leetcode-code-analysis.ts`
- `src/features/overlay-session/components/overlay-shell.tsx`
- `src/features/overlay-session/components/modes/expanded/expanded-overlay.tsx`
- `src/features/overlay-session/components/modes/expanded/overlay-help-section.tsx`
- `src/features/overlay-session/components/modes/expanded/overlay-code-analysis.tsx`
- `src/features/genai/server/genai-settings-service.ts`
- `src/features/leetcode-review-assistant/api`, `domain`, and `server`
- `src/extension/background/runtime-policy.ts`
- `src/extension/background/register-handlers.ts`
- `src/extension/background/leetcode-analysis-operations.ts`

## Validation and completion criteria

Follow the current matrix in `docs/agent-governance.md`. Each phase needs a
phase-sized implementation plan with exact files, commands, and done-when
criteria before code changes.

Phase 1 focused coverage includes tab keyboard/panel semantics, per-tab state
and scroll, selection across modes, save completion mode rules, disabled/error
AI states, no extra provider requests from tabs/modes, timer independence,
review updates/locks, and preservation of historical notes.

Phase 2 focused coverage includes strict contracts, input completeness/bounds,
prompt/output rules, rapid-click and batch-reveal behavior, connection-only
eligibility, automatic-toggle independence, deadlines, retry, stale results,
sender binding, operation isolation, cancellation, secret redaction, and no
review/persistence effects. Use representative provider evaluation to assess
hint progression, usefulness, and spoiler restraint; name provider/model/date
and retain redacted evidence. Mocked schema tests are not provider-quality
proof.

Required full commands for both implementation phases:

```sh
npm run lint
npm run check
npm run build
```

Plans must name exact focused test commands. Phase 2's new paths will be fixed
in its plan. Update current product, architecture, testing, and visual guidance
as each phase actually lands; this future design does not rewrite shipped
behavior in those authority documents now.

A human engineer must run happy-path and edge-case smoke in the installed
extension with screenshots or recording before PR review or merge:

- Phase 1: timed/manual/quick/untimed/failed and accepted autosave flows; rating
  correction without duplicate attempts; tab switching while saving or
  generating; collapse/dock/reopen; SPA navigation; independent AI disclosures;
  keyboard focus inside the ShadowRoot; 392px/320px widths, short viewports,
  long reports, and literal-code overflow.
- Phase 2: one batch with one-at-a-time reveals and the final hint boundary;
  rapid clicks; hints retained after save/refetch/tab/mode changes; restart,
  page reload and different-problem clearing; hints with automatic analysis
  off; simultaneous hint/report requests; changed/removed provider key/model;
  partial/oversized problem context; auth/network/quota/timeout/invalid-output
  errors and explicit Retry; stale responses during navigation; unchanged
  rating, timing, review count, FSRS, track guidance, and backup history.

Tabs are complete when the approved separation and state rules pass their
automated checks and human proof. Hints are complete when their bounds,
progressive UX, session lifetime, independent runtime behavior, provider
quality, and human proof are verified. Notes remains deferred.

This design commit needs only Markdown formatting validation. Application
tests/build and human feature smoke are deferred because no application
behavior has been implemented. Handoffs must name exact commands run and
skipped with reasons; do not claim PR review or merge readiness without the
required human proof.

## Release and recovery

Each phase can ship independently after its validation. Tab rearrangement and
explicit hints are feature work and use Conventional Commit titles. This
document commit uses a `docs` title.

Rollback restores the previous overlay composition for Phase 1 or removes the
manual hint action/contracts for Phase 2. Historical review/log data requires
no migration or recovery. Disabling automatic assessment does not disable
manual hints; removing the hint action or its saved connection is the recovery
for an issue specific to hints.
