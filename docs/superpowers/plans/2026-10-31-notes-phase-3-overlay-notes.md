# Notes Phase 3: Overlay Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Notes placeholder with flexible personal writing, reliable debounced autosave, saved AI disclosures and submission-history access.

**Architecture:** A feature controller owns draft/save/conflict state above the overlay's visual modes. Small editor, preview and saved-report components render explicit view/commands; runtime-backed queries provide durable documents and metadata. Extract read-only assessment presentation from the current overlay so both live and archived reports share it without sharing generation controls.

**Tech Stack:** React 19, TypeScript, TanStack Query, current Zod runtime APIs, react-markdown, Vitest fake timers, React Testing Library and existing Tailwind tokens.

---

Requires [Phase 1](./2026-10-31-notes-phase-1-archive-and-recovery.md) and [Phase 2](./2026-10-31-notes-phase-2-submission-and-ai-retention.md). Read the [master plan](./2026-10-31-notes-and-submission-history.md). Preserve the current shared header, context strip, tabs, Solve footer, independent AI generation flow and session-only hints.

## File and public UI map

| File                                                                                                                                                                        | Responsibility                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Create `src/features/notes/domain/note-save-scheduler.ts`, `note-editor-state.ts`, `markdown-edit.ts`                                                                       | Pure timing policy, draft/accepted-command transitions and selection edits              |
| Create `src/features/notes/api/notes-api.ts`                                                                                                                                | Typed runtime query/mutation functions; no direct database calls                        |
| Create `src/features/notes/hooks/use-problem-notes-controller.ts`, `use-saved-ai-notes.ts`                                                                                  | Revision-aware drafts, accepted retry identity, collection commands and lazy body reads |
| Create `src/features/notes/components/note-editor.tsx`, `note-markdown-preview.tsx`, `note-save-status.tsx`, `note-conflict-panel.tsx`                                      | Accessible controlled writing/preview and truthful status/recovery                      |
| Create `src/features/notes/components/saved-ai-notes.tsx`, `problem-notes-panel.tsx`, `recent-submissions.tsx`                                                              | Saved disclosures and Notes composition shared by overlay/details                       |
| Create `src/features/leetcode-review-assistant/components/assessment-report-view.tsx`, `saved-assessment-view.tsx`                                                          | Reusable feedback/code display, inert saved reading                                     |
| Modify `src/features/leetcode-review-assistant/index.ts`                                                                                                                    | Public UI/types only; keep server/data out                                              |
| Modify `src/features/overlay-session/hooks/use-leetcode-overlay-session.ts`                                                                                                 | Own Notes workflow above mode switches                                                  |
| Modify `src/features/overlay-session/components/modes/expanded/expanded-overlay.tsx`, `overlay-code-analysis.tsx`                                                           | Replace placeholder and add Save/View in Notes actions                                  |
| Modify `src/features/overlay-session/components/overlay-shell.tsx`, `overlay-shell.test.tsx`, `src/features/overlay-session/index.ts`; create `src/features/notes/index.ts` | Carry controller view/commands through the existing mode adapter and public surfaces    |

`src/app/overlay/overlay-app.tsx` already passes the session through to `OverlayShell`; the explicit controller-to-view adapter is `src/features/overlay-session/components/overlay-shell.tsx`. Update that adapter and its tests. Do not add persistence to a visual mode component or replace the app entrypoint.

## Task 1: Debounce scheduler and accepted-command state rules

**Files:** Create `src/features/notes/domain/note-save-scheduler.ts`, `note-save-scheduler.test.ts`, `note-editor-state.ts`, `note-editor-state.test.ts`.

- [ ] **Step 1: Write deterministic timing and state failures.** Include trailing 600 ms, continuous typing capped at 3,000 ms, blur flush, one save in flight, coalescing the newest document, old acknowledgment/newer draft, same-command retry, conflict and stale scope. Use asynchronous fake timers and restore real timers after each test.

```ts
import { afterEach, expect, it, vi } from 'vitest'
import { createNoteSaveScheduler } from './note-save-scheduler'

afterEach(() => vi.useRealTimers())
it('debounces trailing edits and flushes continuous typing at max wait', async () => {
  vi.useFakeTimers()
  const save = vi.fn()
  const scheduler = createNoteSaveScheduler(save)
  scheduler.schedule()
  await vi.advanceTimersByTimeAsync(599)
  expect(save).not.toHaveBeenCalled()
  scheduler.schedule()
  await vi.advanceTimersByTimeAsync(600)
  expect(save).toHaveBeenCalledTimes(1)
  for (let index = 0; index < 6; index++) {
    scheduler.schedule()
    await vi.advanceTimersByTimeAsync(500)
  }
  expect(save).toHaveBeenCalledTimes(2)
  scheduler.cancel()
})
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/domain/note-save-scheduler.test.ts src/features/notes/domain/note-editor-state.test.ts`.
- [ ] **Step 3: Implement timing separately from durable command state.** The scheduler requests a flush; it does not decide whether a write is accepted or Saved.

```ts
export function createNoteSaveScheduler(requestFlush: () => void) {
  let trailing: ReturnType<typeof setTimeout> | undefined
  let maximum: ReturnType<typeof setTimeout> | undefined
  function cancel() {
    clearTimeout(trailing)
    clearTimeout(maximum)
    trailing = undefined
    maximum = undefined
  }
  function flush() {
    cancel()
    requestFlush()
  }
  return {
    schedule() {
      clearTimeout(trailing)
      trailing = setTimeout(flush, 600)
      maximum ??= setTimeout(flush, 3000)
    },
    flush,
    cancel,
  }
}
```

Define `NoteEditorState` with `document`, current `draft`, monotonically increasing `draftSequence`, nullable `accepted` (`command`, `draftSequence`), nullable error/conflict, and `flushRequested`. An accepted command copies immutable scope/problem/target/revision/text and a new command ID. While it is in flight, edits replace the pending draft, never its command. A successful response updates the known revision; it marks Saved only when the acknowledged sequence still matches the current draft. If a flush became due while busy, accept one command for the newest pending draft after success. Retry resends the exact accepted command. A conflict/stale scope stops automatic writes until explicit resolution or refresh.

Export pure transitions `editNoteDraft`, `acceptNoteSave`, `acknowledgeNoteSave`, `failNoteSave`, `receiveRemoteNote`, `resetNoteScope` and `resolveNoteConflict`. Each returns a new state; `acceptNoteSave` returns `{ state, command: SaveNoteCommand | null }`. `resolveNoteConflict('replace')` uses the newest reviewed server revision and a new command ID; `load-saved` discards only after explicit user action; `copy-draft` never writes. A confirmed full reset/replacement invalidation calls `resetNoteScope`, clears old accepted commands and available recovery drafts, and renders the current empty/restored document. It cannot offer automatic reapplication of pre-reset writing. Add reducer assertions that a late Saved result cannot replace a new draft or revive a reset scope.

- [ ] **Step 4: Verify GREEN and commit.** Run both tests; expect all timer and state cases to pass. Commit `feat(notes): model debounced revision-safe autosave`.

## Task 2: Runtime controller, navigation flush and conflict recovery

**Files:** Create `src/features/notes/api/notes-api.ts`, `notes-api.test.tsx`, `hooks/use-problem-notes-controller.ts`, `use-problem-notes-controller.test.tsx`; modify the existing overlay session hook and its tests.

- [ ] **Step 1: Add hook tests with deferred runtime responses.** Type A, start saving, type B, acknowledge A and ensure B remains dirty; then B saves at A's resulting revision. Retry after an aborted transaction/lost reply. Refresh a clean editor from another surface; preserve a dirty draft and show conflict when a different surface writes. Change problem identity before debounce and assert the final request still targets A. Repeat collapse/dock/tab/review-save without remounting the controller.

```ts
expect(firstCommand.problemSlug).toBe('two-sum')
expect(firstCommand.markdown).toBe('Draft A')
expect(secondCommand.expectedRevision).toBe(firstSaved.document.revision)
expect(secondCommand.markdown).toBe('Draft B')
expect(retriedCommand).toEqual(failedAcceptedCommand)
expect(result.current.view.saveStatus).not.toBe('saved')
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/api/notes-api.test.tsx src/features/notes/hooks/use-problem-notes-controller.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx`.
- [ ] **Step 3: Bind one controller per editor session.** `useProblemNotesController({ surface, problemSlug, target })` opens the editor lease and returns `{ view, commands }`. `view` contains `document`, `draft`, `mode`, `saveStatus`, `conflict`, `error` and `scope`; commands are `change`, `flush`, `retry`, `setMode`, `loadSaved`, `copyDraft`, `replaceSaved`. Treat storage/transport failure as unsaved, revision mismatch as conflict and reset scope as a deliberate reset state. Never feed an exception message containing note text into telemetry.

```ts
const accepted = acceptNoteSave(stateRef.current, crypto.randomUUID())
stateRef.current = accepted.state
if (accepted.command) {
  const command = accepted.command
  void saveDocumentViaRuntime({ surface, editLeaseId, command })
    .then((result) => dispatch({ type: 'acknowledged', command, result }))
    .catch(() => dispatch({ type: 'save-failed', command }))
}
```

The reducer routes results by their accepted command/session ID; callbacks do not read the next problem's scope from a mutable ref. On controlled problem navigation, flush and retire the old session while its request settles; retain unresolved drafts/commands in the controller registry until Saved or explicit discard. Do not discard a pending A operation when mounting B. Use the issued same-document lease for A's final SPA flush, as Phase 1 permits. Blur, preview switch and controlled navigation request flush. Page termination before acceptance shows no promise of a durable save.

Mount the controller in `useLeetCodeOverlaySession`, above `ExpandedOverlay`; an overlay visual-mode change must not dispose it. Reflections reuse the same hook with `{ kind: 'reflection', submissionId }` and a separately keyed controller. Query invalidation updates clean documents; dirty documents enter conflict without overwriting the local text. Reset invalidation clears cached leases and stops old retries.

- [ ] **Step 4: Verify GREEN and commit.** Run the RED files plus `rtk npm test -- src/platform/query/cache-invalidation.test.ts`; expect no duplicate writes from StrictMode setup/cleanup and no cross-problem text. Commit `feat(notes): connect autosave and conflict-safe editor sessions`.

## Task 3: Safe Markdown preview and formatting edits

**Files:** Create `src/features/notes/components/note-markdown-preview.tsx`, `note-markdown-preview.test.tsx`, `domain/markdown-edit.ts`, `markdown-edit.test.ts`; modify only this worktree's `package.json` and `package-lock.json` for react-markdown.

- [ ] **Step 1: Add rendering/security and selection tests.** Render headings/lists/links/inline code/fenced code; reject raw HTML, JavaScript/data links and embedded image requests. Show code literally. Test selected text replacement, empty selection, caret restoration and optional heading insertion without changing existing paragraphs.

```tsx
render(
  <NoteMarkdownPreview
    markdown={
      '## Approach\n\n`<script>`\n\n[bad](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n\n![remote](https://example.com/pixel)'
    }
  />,
)
expect(screen.getByRole('heading', { name: 'Approach' })).toBeVisible()
expect(screen.queryByRole('img')).not.toBeInTheDocument()
expect(document.querySelector('script')).toBeNull()
expect(document.querySelector('a[href^="javascript:"]')).toBeNull()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/components/note-markdown-preview.test.tsx src/features/notes/domain/markdown-edit.test.ts`; expected missing components/helpers. Add the dependency in this worktree with `rtk npm install react-markdown` using the pinned toolchain, inspect the resolved version/lockfile and record it; do not copy the original checkout's package edits.
- [ ] **Step 3: Implement an inert preview and selection utility.** Use react-markdown's standard renderer with no raw-HTML/plugin path. Images are outside scope and render as alt text only; no remote requests are needed to read a note.

```tsx
import Markdown from 'react-markdown'

function safeNoteUrl(value: string) {
  try {
    const url = new URL(value)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}
export function NoteMarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="min-w-0 break-words text-sm">
      <Markdown
        skipHtml
        urlTransform={safeNoteUrl}
        allowedElements={[
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'p',
          'strong',
          'em',
          'ul',
          'ol',
          'li',
          'blockquote',
          'a',
          'pre',
          'code',
          'hr',
          'br',
          'img',
        ]}
        components={{
          img: ({ alt }) => <span>{alt ?? ''}</span>,
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          pre: ({ children }) => (
            <pre className="max-w-full overflow-x-auto whitespace-pre">
              {children}
            </pre>
          ),
        }}
      >
        {markdown}
      </Markdown>
    </div>
  )
}
```

```ts
export function wrapMarkdownSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
) {
  const selected = value.slice(start, end)
  return {
    value: value.slice(0, start) + before + selected + after + value.slice(end),
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  }
}
```

Heading/list/link/inline-code/fence buttons use this utility with explicit Markdown delimiters. Optional Approach/Mistakes/Complexity prompts insert `## Heading\n\n` at the current selection; they are ordinary removable text, not persisted structured fields. Use a textarea ref to restore focus/selection after controlled updates. Keep plain source available if preview rendering fails.

- [ ] **Step 4: Verify GREEN and commit.** Run both tests and `rtk npm run build`; inspect bundle changes and current dependency review output when a PR exists. Commit `feat(notes): add safe Markdown preview and basic formatting`.

## Task 4: Accessible editor, save feedback and deliberate conflict controls

**Files:** Create `src/features/notes/components/note-editor.tsx`, `note-editor.test.tsx`, `note-save-status.tsx`, `note-conflict-panel.tsx`, `note-conflict-panel.test.tsx`.

- [ ] **Step 1: Write visible behavior tests.** Editor accessible name is Problem notes or Submission reflection. Test Write/Preview switching, optional prompts, Saved only after durable completion, Saving, unsaved Retry, reset state, copy-draft feedback and the explicit conflict choices. Empty notes are writable before any submission.

```tsx
await user.type(
  screen.getByRole('textbox', { name: 'Problem notes' }),
  'Use a map.',
)
expect(screen.queryByText('Saved')).not.toBeInTheDocument()
expect(screen.getByRole('status')).toHaveTextContent('Unsaved')
await user.click(screen.getByRole('button', { name: 'Copy my draft' }))
expect(replaceSaved).not.toHaveBeenCalled()
await user.click(screen.getByRole('button', { name: 'Review saved version' }))
expect(screen.getByRole('region', { name: 'Saved version' })).toBeVisible()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/components/note-editor.test.tsx src/features/notes/components/note-conflict-panel.test.tsx`.
- [ ] **Step 3: Render explicit view and commands.** `NoteEditor` accepts `label`, `view` and `commands` from task 2; it owns only textarea focus/selection and disclosure state. Use a polite live region for save transitions, an alert for a failed save and concise actions. Display Saving while the current draft is in flight, Unsaved while pending/failed, and Saved only for the current acknowledged draft.

```tsx
<label htmlFor={editorId}>{label}</label>
<textarea id={editorId} value={view.draft}
  onChange={(event) => commands.change(event.currentTarget.value)}
  onBlur={() => commands.flush()} aria-describedby={statusId} />
<p id={statusId} role="status" aria-live="polite">{saveStatusText}</p>
```

On conflict show local and saved text in labeled regions, Copy my draft, Load saved version and Replace saved version. Replace requires reviewing the saved text and rechecks its latest revision; if another writer changed it again, remain in conflict. Load saved version clearly discards the local draft only on that action. Copy success/failure is visible; clipboard failure leaves the draft selectable. No merge or last-response-wins shortcut. A reset scope explains that this problem was reset and offers Start fresh; old draft cannot auto-recreate it.

Keep toolbar buttons reachable with visible focus and explicit labels, a full-width textarea, wrapping controls and no horizontal page overflow at 320 px. Preview code alone may scroll horizontally. Buttons are `type="button"`; no accidental submit/review shortcut is introduced.

- [ ] **Step 4: Verify GREEN and commit.** Run both tests and task-2 hook tests. Commit `feat(notes): build accessible writing and save recovery controls`.

## Task 5: Reusable assessment display and saved AI disclosures

**Files:** Create `src/features/leetcode-review-assistant/components/assessment-report-view.tsx`, `saved-assessment-view.tsx` and tests; modify its root index and `src/features/overlay-session/components/modes/expanded/overlay-code-analysis.tsx`; create `src/features/notes/components/saved-ai-notes.tsx`, `saved-ai-notes.test.tsx`, `hooks/use-saved-ai-notes.ts` and tests.

- [ ] **Step 1: Protect current presentation and saved reading.** Move existing `AnalysisReport`/feedback/code display tests with the extraction. Saved AI starts closed, shows source date/result/language and Saved, renders the complete assessment when opened, and never shows Generate suggested code or calls a provider. Removing an inclusion retains the history report. A saved report remains readable after AI disable/key deletion.

```tsx
expect(
  screen.getByText('AI notes · Saved').closest('details'),
).not.toHaveAttribute('open')
await user.click(screen.getByText('AI notes · Saved'))
expect(screen.getByText('Approach')).toBeVisible()
expect(screen.getByText('AI-generated')).toBeVisible()
expect(screen.getByText('Untested')).toBeVisible()
expect(
  screen.queryByRole('button', { name: 'Generate suggested code' }),
).not.toBeInTheDocument()
expect(generateImplementation).not.toHaveBeenCalled()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/leetcode-review-assistant/components src/features/notes/components/saved-ai-notes.test.tsx src/features/notes/hooks/use-saved-ai-notes.test.tsx`.
- [ ] **Step 3: Extract presentation without moving generation ownership.** `AssessmentReportView` receives feedback and an implementation view (`absent`, `pending`, `error`, `ready`) plus an optional action slot. Copy the current scored sections, independent disclosures, assumptions, complexity treatment and literal code behavior into this owning feature. The live overlay wrapper supplies Generate/Retry controls; `SavedAssessmentView` supplies only retained artifacts and explanatory absent-state text. Neither display component imports the overlay's hook-state types.

```tsx
<details
  key={item.assessmentId}
  onToggle={(event) => {
    if (event.currentTarget.open) commands.loadAssessment(item.assessmentId)
  }}
>
  <summary>
    AI notes · Saved{' '}
    <span>
      {item.sourceDate} · {item.result} · {item.language}
    </span>
  </summary>
  {body.status === 'ready' ? (
    <SavedAssessmentView
      feedback={body.feedback}
      implementation={body.implementation}
    />
  ) : (
    <p role="status">
      {body.status === 'error'
        ? 'Could not load saved AI notes. Retry.'
        : 'Loading saved AI notes…'}
    </p>
  )}
  <button type="button" onClick={() => commands.remove(item.assessmentId)}>
    Remove from notes
  </button>
</details>
```

Keep disclosures keyed by assessment ID through ordinary refetches; a replacement/new report starts closed. `useSavedAiNotes` creates one accepted collection command with expected collection revision; retries preserve its identity and refetch membership, using Phase 2's no-resurrection semantics. Metadata order is newest saved first. Show load/persistence errors and retry actions locally. A saved inclusion references the report; do not copy feedback into the editable Markdown.

- [ ] **Step 4: Verify GREEN and commit.** Run the RED files plus `rtk npm test -- src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx src/testing/architecture-boundaries.test.ts`. Commit `refactor(ai): share inert assessment reading with saved notes`.

## Task 6: Existing Notes tab and one-action Save to notes

**Files:** Create `src/features/notes/components/problem-notes-panel.tsx`, `problem-notes-panel.test.tsx`, `recent-submissions.tsx`; modify overlay controller/view mappings, `expanded-overlay.tsx`, `overlay-code-analysis.tsx`, their tests and feature public indexes.

- [ ] **Step 1: Write integration tests against the existing shell.** Preserve Solve/AI/Notes keyboard behavior and hidden-panel focus exclusion. Replace only the Notes placeholder. Save to notes retains current tab, adds the full report once, shows Saved to notes/View in Notes, and performs no provider call. View in Notes selects Notes. Collapse/dock/restore, review save and metadata refresh retain text/disclosure state. History access works with AI off.

```tsx
await user.click(screen.getByRole('button', { name: 'Save to notes' }))
expect(screen.getByRole('tab', { name: /AI/ })).toHaveAttribute(
  'aria-selected',
  'true',
)
expect(screen.getByText('Saved to notes')).toBeVisible()
await user.click(screen.getByRole('button', { name: 'View in Notes' }))
expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute(
  'aria-selected',
  'true',
)
expect(screen.getByRole('textbox', { name: 'Problem notes' })).toBeVisible()
expect(
  screen.queryByRole('button', { name: 'Submit review' }),
).not.toBeInTheDocument()
```

- [ ] **Step 2: Verify RED.** Run `rtk npm test -- src/features/notes/components/problem-notes-panel.test.tsx src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx src/features/overlay-session/components/modes/expanded/overlay-tabs.test.tsx`.
- [ ] **Step 3: Compose through feature UI and explicit commands.** Add Notes controller, saved-AI view and archive status to the session's explicit view/command mapping. Keep controllers above mode components. Replace the placeholder content with the shared panel; retain its existing scroll container and the tab shell. Main editor comes first, prompts are optional toolbar actions, saved AI follows, then a compact recent-submission disclosure and details/history action.

```tsx
<ProblemNotesPanel
  editor={view.notes.editor}
  savedAi={view.notes.savedAi}
  recentSubmissions={view.notes.recentSubmissions}
  commands={commands.notes}
/>
```

Define the panel props in its module as the task-2 controller result plus metadata/actions from task 5 and Phase 2. Its recent-submission list shows date/result/language/completeness and the three most recent items. Before the full details route exists, use the feature-branch history reader or keep Open problem details disabled with a clear availability state; do not ship a dead action. Phase 4 completes routing before activation.

In the live AI panel, offer Save to notes only for a retained assessment; if its archive publication is unsaved, offer Retry saving assessment first, without generation. Successful inclusion shows Saved to notes plus View in Notes. Repeat click is idempotent; saving alone never switches tabs, opens a preview or asks which report sections to include. All complete report sections and any generated implementation remain linked to that saved assessment.

- [ ] **Step 4: Verify GREEN and commit.** Run the RED files plus `rtk npm test -- src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx src/app/popup/popup-shell.test.tsx`; expect unaffected compact surfaces/review flows. Commit `feat(notes): enable the existing overlay Notes workflow`.

## Task 7: UI validation, narrow layouts and phase handoff

**Files:** Modify `design.md`, `docs/product.md`, `docs/architecture.md`, `docs/testing.md`; create `docs/superpowers/handoffs/2026-10-31-notes-phase-3.md` during execution.

- [ ] **Step 1: Run focused and full checks.** Run `rtk npm test -- src/features/notes src/features/overlay-session src/features/leetcode-review-assistant/components src/testing/architecture-boundaries.test.ts`, then `rtk npm run db:check`, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk npm run format`, `rtk npm run zip`. Record `rtk npm run db:generate` skipped if no SQL schema change. Dependency additions require the package/build checks; do not use the original checkout's dirty package files as a shortcut.
- [ ] **Step 2: Prepare browser/component proof.** Capture populated/empty/unsaved/conflict/reset Notes states and full saved reports at 392 px and 320 px, plus a short viewport. Verify tab order, Left/Right/Home/End, details Enter/Space, visible focus, scroll retention and code-only horizontal scrolling. Use production components and the existing fixture path, not a replacement sketch.
- [ ] **Step 3: Obtain human installed-extension smoke.** Type quickly, stop and observe Saved after durable completion; type continuously past three seconds; switch problems before debounce; collapse/dock; save a review while typing; edit the same note in another tab/dashboard harness; fail storage then retry; reset with an accepted save/AI operation pending; read saved reports with the AI key removed. Attach screenshots/recording and verify no text lands on the wrong problem or reappears after reset. Manual proof remains required even if fixture/browser automation passes.
- [ ] **Step 4: Update current docs and commit.** Replace the reserved-placeholder/session-only-report statements only as implemented. Document optional prompts, Markdown preview, exact debounce/conflict behavior, saved AI source labels and phase-4 route dependency. Record precise commands/skips, bundle impact, human proof and remote-readiness status. Commit `docs(notes): document overlay writing and saved AI behavior`.

## Done when

- [ ] Notes uses the existing shell and preserves Solve/AI/hint/timer policies.
- [ ] Autosave meets 600/3000 ms timing, serializes accepted commands and truthfully handles failure, newer drafts, conflicts and navigation.
- [ ] Main note and per-submission reflections use the same durable controller rules without sharing their text/revisions.
- [ ] Markdown is flexible, preview is inert, images/raw HTML cannot create external requests or executable content.
- [ ] Saved AI is complete, collapsed, source-labeled, readable without a provider and removable without deleting history.
- [ ] Save to notes is one action with stable membership/retry and no extra provider calls.
- [ ] Production-component and human proof status is recorded; complete details/backup gates still control release.
