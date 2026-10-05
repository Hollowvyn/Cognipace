# Focused Overlay Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the expanded overlay focused Solve / AI / Notes tabs with the full review footer only on Solve and preserved session behavior.

**Architecture:** Keep selected-tab state above visual-mode components in the existing overlay-session reducer. Keep each expanded tab panel mounted while switching tabs, with a feature-local tab bar using element refs inside the ShadowRoot. Existing AI generation and Practice writes retain their current owners.

**Tech Stack:** React 19, TypeScript, current Tailwind tokens, Vitest and React Testing Library, WXT/Chrome MV3.

---

**Approved design:** [Tabbed overlay and progressive AI hints](../specs/2026-10-04-tabbed-overlay-and-ai-hints-design.md), written-spec approval received in chat on 2026-10-04.
**Execution branch:** `codex/overlay-tabs-design`, based on current main when brainstorming began.
**Phase boundary:** This plan ships tabs and a reserved Notes placeholder. The AI hint action belongs to [Phase 2](./2026-10-04-overlay-ai-hints.md). Do not add hint runtime work or a Notes editor here.

## Execution status — 2026-10-05

All six local implementation tasks passed independent SPEC and QUALITY review.
Automated checks and production-component fixture proof passed; see the
[Phase 1 handoff](../handoffs/2026-10-04-overlay-focused-tabs.md). Phase 2 is now
implemented locally; its [handoff](../handoffs/2026-10-04-overlay-ai-hints.md)
records the final source validation. Required human installed-extension smoke
and screenshot/recording proof remain pending, so neither phase is PR review or
merge ready. The final whole-implementation source review passed without actionable findings.

Checked steps record implemented behavior and equivalent executed validation;
the handoffs contain the exact commands, outcomes, and reviewed corrections.
The original `npm ci` preflight is left unchecked because its historical result
was not captured in the execution ledger. Existing dependencies were verified
with the pinned Node 24.20.0/npm 11.19.0 toolchain and successful full checks;
no reinstall was needed at final validation. The human evidence gate remains
unchecked. The Phase 1 instruction to leave Phase 2 pending describes its
historical handoff, before the separately approved Phase 2 execution.

## Preparation and file ownership

Read the current authority docs and use `cognipace-agent-workflow` and `cognipace-bulletproof-react`. Prefix shell commands with `rtk`. Preserve unrelated work and recheck status before execution. Use the existing attached task worktree; creating another checkout is unnecessary.

- `domain/overlay-session-state.ts`: selected tab and completion-time save rules.
- `hooks/use-overlay-review-actions.ts`: public selection command.
- `components/overlay-shell.tsx`: command wiring.
- `components/modes/expanded/overlay-tabs.tsx`: local accessible tab bar.
- `components/modes/expanded/expanded-overlay.tsx`: mounted panels, per-tab scrolling, Solve footer.
- `components/modes/expanded/overlay-code-analysis.tsx`: meaningful disabled display.
- Matching reducer/component/session tests protect lifecycle, accessibility and provider independence.
- Current product/architecture/testing/design docs describe Phase 1 only when implemented.

All paths in the task map below are relative to `src/features/overlay-session` unless written in full. No dependency, permission, database, runtime contract, or provider change is required.

- [x] Confirm a clean/task-owned checkout with `rtk git status --short --branch`.
- [ ] Install the pinned toolchain dependencies with `rtk proxy npm ci` before application checks. This worktree had no `node_modules` during design. Node/npm pins are in `.nvmrc` and `package.json`.
- [x] Keep the existing disclosure/report fixtures and saved-log preservation tests; do not replace them with snapshots.

## Task 1: Model selected tab and save completion rules

**Files:**

- Modify: `src/features/overlay-session/domain/overlay-session-state.ts`
- Modify: `src/features/overlay-session/domain/index.ts`
- Test: `src/features/overlay-session/domain/overlay-session-state.test.ts`

- [x] Add these tests inside the existing reducer describe block. Existing `createSubmittedSession` supplies its unchanged snapshot fixture.

```ts
it('preserves tab selection through modes and context refresh', () => {
  let state = overlaySessionReducer(
    {
      ...initialOverlaySessionState,
      activeProblemSlug: 'two-sum',
    },
    { type: 'set-expanded-tab', tab: 'ai' },
  )
  for (const visualMode of [
    'expanded',
    'collapsed',
    'docked',
    'collapsed',
    'expanded',
  ] as const) {
    state = overlaySessionReducer(state, {
      type: 'set-visual-mode',
      visualMode,
    })
    expect(state.expandedTab).toBe('ai')
  }
  state = overlaySessionReducer(state, {
    type: 'problem-context-refreshed',
    problemSlug: 'two-sum',
    selectedRating: 'good',
    submittedSession: null,
  })
  expect(state.expandedTab).toBe('ai')
})

it.each(['collapsed', 'docked', 'expanded'] as const)(
  'uses the completion-time visual mode %s for successful save selection',
  (visualMode) => {
    const saving = {
      ...initialOverlaySessionState,
      visualMode,
      expandedTab: 'notes' as const,
      reviewStatus: 'saving' as const,
    }
    const state = overlaySessionReducer(saving, {
      type: 'submit-succeeded',
      snapshot: createSubmittedSession(),
      nextStep: null,
      feedback: null,
    })
    expect(state.visualMode).toBe('expanded')
    expect(state.expandedTab).toBe(
      visualMode === 'expanded' ? 'notes' : 'solve',
    )
  },
)

it('resets tab on restart, new problem and navigation', () => {
  const state = { ...initialOverlaySessionState, expandedTab: 'ai' as const }
  expect(
    overlaySessionReducer(state, {
      type: 'restart-local-session',
      selectedRating: 'good',
    }).expandedTab,
  ).toBe('solve')
  expect(
    overlaySessionReducer(state, {
      type: 'problem-loaded',
      problemSlug: 'two-sum',
      selectedRating: 'good',
    }).expandedTab,
  ).toBe('solve')
  expect(
    overlaySessionReducer(state, { type: 'page-changed' }).expandedTab,
  ).toBe('solve')
})
```

- [x] Run `rtk proxy npm test -- src/features/overlay-session/domain/overlay-session-state.test.ts --run`. Expect failure because selected-tab state/action is absent.
- [x] Add the following declarations and reducer cases at the indicated existing locations. Existing page-changed/problem-loaded returns already use the initial state.

```ts
// Export beside OverlayVisualMode.
export type OverlayExpandedTab = 'solve' | 'ai' | 'notes'

// Add to OverlaySessionState.
expandedTab: OverlayExpandedTab

// Add to OverlaySessionAction union.
| { type: 'set-expanded-tab'; tab: OverlayExpandedTab }

// Add to initialOverlaySessionState.
expandedTab: 'solve',

// Add reducer case beside set-visual-mode.
case 'set-expanded-tab':
  return { ...state, expandedTab: action.tab }

// Add to the submit-succeeded return. Read state at completion.
expandedTab: state.visualMode === 'expanded' ? state.expandedTab : 'solve',

// Add to the restart-local-session return.
expandedTab: 'solve',

// Add to the existing domain/index.ts export list from overlay-session-state.
type OverlayExpandedTab,
```

- [x] Leave rating, next-step, feedback, timer and saved-review fields intact. Existing spreads preserve selection for update/failure/context refresh.
- [x] Rerun the same focused command; expect all reducer tests to pass.
- [x] Stage and commit only these task files.

```sh
rtk git add src/features/overlay-session/domain/overlay-session-state.ts src/features/overlay-session/domain/index.ts src/features/overlay-session/domain/overlay-session-state.test.ts
rtk git commit -m "feat(overlay): retain selected tab across session transitions"
```

## Task 2: Expose selection and protect completion-time behavior

**Files:**

- Modify: `src/features/overlay-session/hooks/use-overlay-review-actions.ts`
- Modify: `src/features/overlay-session/components/overlay-shell.tsx`
- Modify: `src/features/overlay-session/components/modes/expanded/expanded-overlay.tsx` (command type only in this task)
- Modify/Test: `src/features/overlay-session/components/overlay-shell.test.tsx`
- Modify: `src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx` (command fixture)
- Test: `src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx`

- [x] Add the following session tests inside its existing describe block. All shown mocks and helpers exist in that file.

```ts
it('preserves selected tab across mode changes without AI or review calls', async () => {
  const startTime = Date.now()
  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime)
  const { result } = await renderReadySession()
  act(() => result.current.actions.startTimer())
  act(() => result.current.actions.selectExpandedTab('ai'))
  for (const action of [
    'expand',
    'collapse',
    'dock',
    'restore',
    'expand',
  ] as const) {
    act(() => result.current.actions[action]())
    expect(result.current.overlay.expandedTab).toBe('ai')
    expect(result.current.timer.status).toBe('running')
  }
  for (const tab of ['notes', 'solve', 'ai'] as const) {
    act(() => result.current.actions.selectExpandedTab(tab))
    expect(result.current.timer.status).toBe('running')
  }
  nowSpy.mockReturnValue(startTime + 17000)
  act(() => result.current.actions.pauseTimer())
  expect(result.current.timer.elapsedSeconds).toBe(17)
  expect(analyze).not.toHaveBeenCalled()
  expect(saveReview).not.toHaveBeenCalled()
  expect(overrideReview).not.toHaveBeenCalled()
  act(() => result.current.actions.restartLocalSession())
  expect(result.current.overlay.expandedTab).toBe('solve')
})
```

```ts
it('preserves the tab selected while a review is saving', async () => {
  const pending = createDeferred<SerializedPracticeDetails>()
  saveReview.mockReturnValueOnce(pending.promise)
  const { result } = await renderReadySession()
  act(() => {
    result.current.actions.expand()
    result.current.actions.selectExpandedTab('ai')
  })
  let saving!: Promise<void>
  act(() => {
    saving = result.current.actions.submitReview()
  })
  await waitFor(() =>
    expect(result.current.overlay.reviewStatus).toBe('saving'),
  )
  act(() => result.current.actions.selectExpandedTab('notes'))
  await act(async () => {
    pending.resolve(createSavedPracticeDetails())
    await saving
  })
  expect(result.current.overlay.expandedTab).toBe('notes')
  expect(result.current.overlay.reviewStatus).toBe('submitted-clean')
  expect(saveReview).toHaveBeenCalledOnce()
})
```

- [x] Run `rtk proxy npm test -- src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx --run`. Expect failure at the missing selection command.
- [x] Import `type OverlayExpandedTab` from `../domain` in review actions and add the complete selection interface/function/return member.

```ts
// OverlayReviewActions:
selectExpandedTab: (tab: OverlayExpandedTab) => void

// Inside useOverlayReviewActions, beside selectRating:
function selectExpandedTab(tab: OverlayExpandedTab) {
  dispatch({ type: 'set-expanded-tab', tab })
}

// In its returned actions object:
selectExpandedTab,
```

- [x] Wire the expanded command and update typed test fixtures. Add `type OverlayExpandedTab` to the expanded module's domain import.

```ts
// ExpandedOverlayCommands:
onSelectExpandedTab: (tab: OverlayExpandedTab) => void

// OverlayShell commands passed to ExpandedOverlay:
onSelectExpandedTab: actions.selectExpandedTab,

// overlay-shell.test.tsx createSession().actions:
selectExpandedTab: vi.fn(),

// expanded-overlay.test.tsx createProps().commands:
onSelectExpandedTab: vi.fn(),
```

- [x] Extend the shell test's mocked ExpandedOverlay command type and markup with the following additions, then add its wiring assertion.

```text
// Add this property inside the mocked ExpandedOverlay commands type:
onSelectExpandedTab: (tab: 'solve' | 'ai' | 'notes') => void
```

```tsx
// Add inside the mock's existing <div>:
<button onClick={() => commands.onSelectExpandedTab('ai')}>
  Select AI tab
</button>
```

```tsx
// Add inside the shell describe block:
it('wires expanded-tab selection to the session action', async () => {
  const user = userEvent.setup()
  const session = createSession({
    overlay: { ...initialOverlaySessionState, visualMode: 'expanded' },
  })
  render(<OverlayShell {...session} />)
  await user.click(screen.getByRole('button', { name: 'Select AI tab' }))
  expect(session.actions.selectExpandedTab).toHaveBeenCalledWith('ai')
})
```

- [x] Run `rtk proxy npm test -- src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/features/overlay-session/components/overlay-shell.test.tsx --run`; expect pass with no new AI/review requests.
- [x] Stage and commit only these task files.

```sh
rtk git add src/features/overlay-session/hooks/use-overlay-review-actions.ts src/features/overlay-session/components/overlay-shell.tsx src/features/overlay-session/components/modes/expanded/expanded-overlay.tsx src/features/overlay-session/components/overlay-shell.test.tsx src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx
rtk git commit -m "feat(overlay): wire focused tab selection to session actions"
```

## Task 3: Add the ShadowRoot-safe tab bar

**Files:**

- Create: `src/features/overlay-session/components/modes/expanded/overlay-tabs.tsx`
- Create/Test: `src/features/overlay-session/components/modes/expanded/overlay-tabs.test.tsx`

- [x] Create the test file with this complete source.

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { OverlayExpandedTab } from '../../../domain'
import { OverlayTabs } from './overlay-tabs'

function Harness() {
  const [tab, setTab] = useState<OverlayExpandedTab>('solve')
  return (
    <OverlayTabs
      activeTab={tab}
      idPrefix="test-overlay"
      onSelectTab={setTab}
      aiStatus={null}
      solveStatus={null}
    />
  )
}

describe('OverlayTabs', () => {
  it('selects with keyboard, wraps, and leaves one tab stop', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const solve = screen.getByRole('tab', { name: 'Solve' })
    solve.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'AI' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'AI' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(solve).toHaveAttribute('tabindex', '-1')
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(solve).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(solve).toHaveFocus()
    expect(solve).toHaveAttribute('aria-controls', 'test-overlay-solve-panel')
  })

  it('focuses inside a ShadowRoot using element references', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const container = document.createElement('div')
    shadow.append(container)
    try {
      render(<Harness />, { container })
      const query = within(container)
      const solve = query.getByRole('tab', { name: 'Solve' })
      solve.focus()
      fireEvent.keyDown(solve, { key: 'ArrowRight' })
      const ai = query.getByRole('tab', { name: 'AI' })
      expect(shadow.activeElement).toBe(ai)
      expect(ai).toHaveAttribute('aria-selected', 'true')
      fireEvent.keyDown(ai, { key: 'End' })
      expect(shadow.activeElement).toBe(
        query.getByRole('tab', { name: 'Notes' }),
      )
      fireEvent.keyDown(query.getByRole('tab', { name: 'Notes' }), {
        key: 'Home',
      })
      expect(shadow.activeElement).toBe(solve)
    } finally {
      host.remove()
    }
  })
})
```

- [x] Run `rtk proxy npm test -- src/features/overlay-session/components/modes/expanded/overlay-tabs.test.tsx --run`; expect missing-module failure.
- [x] Create the component with this complete source. Use refs, not document-wide ID lookup, for keyboard focus.

```tsx
import { useRef, type KeyboardEvent } from 'react'

import type { OverlayExpandedTab } from '../../../domain'
import { cn } from '@/utils/cn'

type OverlayTabsProps = {
  activeTab: OverlayExpandedTab
  idPrefix: string
  onSelectTab: (tab: OverlayExpandedTab) => void
  aiStatus: string | null
  solveStatus: string | null
}
const tabs = [
  { id: 'solve', label: 'Solve' },
  { id: 'ai', label: 'AI' },
  { id: 'notes', label: 'Notes' },
] as const

export function OverlayTabs({
  activeTab,
  idPrefix,
  onSelectTab,
  aiStatus,
  solveStatus,
}: OverlayTabsProps) {
  const refs = useRef<Record<OverlayExpandedTab, HTMLButtonElement | null>>({
    solve: null,
    ai: null,
    notes: null,
  })
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length
        break
      case 'ArrowLeft':
        next = (index + tabs.length - 1) % tabs.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = tabs.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    const tab = tabs[next]!
    onSelectTab(tab.id)
    refs.current[tab.id]?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label="Overlay sections"
      className="grid shrink-0 grid-cols-3 border-b border-border"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === activeTab
        const status =
          tab.id === 'solve' ? solveStatus : tab.id === 'ai' ? aiStatus : null
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            ref={(node) => {
              refs.current[tab.id] = node
            }}
            id={idPrefix + '-' + tab.id + '-tab'}
            aria-controls={idPrefix + '-' + tab.id + '-panel'}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(event) => moveFocus(event, index)}
            className={cn(
              'min-w-0 border-b-2 px-2 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              selected
                ? 'border-primary bg-primary/5 font-semibold text-primary'
                : 'border-transparent text-muted-foreground hover:bg-muted',
            )}
          >
            <span>{tab.label}</span>
            {status ? (
              <span className="ml-1 text-[0.62rem]">{status}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
```

- [x] Rerun the same focused command; expect arrow wrapping, Home/End, roving tab stop, ID pairing and real ShadowRoot focus assertions to pass.
- [x] Stage and commit only these task files.

```sh
rtk git add src/features/overlay-session/components/modes/expanded/overlay-tabs.tsx src/features/overlay-session/components/modes/expanded/overlay-tabs.test.tsx
rtk git commit -m "feat(overlay): add accessible focused tab navigation"
```

## Task 4: Partition the expanded surface without losing panel state

**Files:**

- Modify: `src/features/overlay-session/components/modes/expanded/expanded-overlay.tsx`
- Test: `src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx`

- [x] Add `fireEvent` and `within` to the existing Testing Library import and add these tests. They use the existing `createProps`, `makeValidAnalysis`, and initial state. Render directly because `renderExpanded` currently returns void.

```tsx
it('keeps the full footer only on Solve and makes Notes a placeholder', () => {
  const props = createProps()
  const view = render(<ExpandedOverlay {...props} />)
  expect(screen.getByRole('button', { name: 'Submit' })).toBeVisible()
  view.rerender(
    <ExpandedOverlay
      {...props}
      view={{
        ...props.view,
        overlay: { ...props.view.overlay, expandedTab: 'ai' },
      }}
    />,
  )
  expect(
    screen.queryByRole('button', { name: 'Submit' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'AI assessment' })).toBeVisible()
  view.rerender(
    <ExpandedOverlay
      {...props}
      view={{
        ...props.view,
        overlay: { ...props.view.overlay, expandedTab: 'notes' },
      }}
    />,
  )
  expect(
    screen.getByText(
      'A dedicated space for your problem notes, coming in a later phase.',
    ),
  ).toBeVisible()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Submit' }),
  ).not.toBeInTheDocument()
})

it('retains the report disclosure and restores AI scroll across tabs', async () => {
  const user = userEvent.setup()
  const props = createProps({
    view: {
      aiAnalysis: {
        status: 'ready',
        requestId: 'request-1',
        report: makeValidAnalysis(),
      },
      overlay: {
        ...initialOverlaySessionState,
        visualMode: 'expanded',
        expandedTab: 'ai',
      },
    },
  })
  const view = render(<ExpandedOverlay {...props} />)
  const summary = screen.getByText('Approach', { selector: 'summary' })
  await user.click(summary)
  const details = summary.closest('details')!
  const scroll = screen.getByRole('tabpanel', { name: /^AI/ })
    .firstElementChild as HTMLDivElement
  scroll.scrollTop = 137
  fireEvent.scroll(scroll)
  view.rerender(
    <ExpandedOverlay
      {...props}
      view={{
        ...props.view,
        overlay: { ...props.view.overlay, expandedTab: 'solve' },
      }}
    />,
  )
  scroll.scrollTop = 0
  view.rerender(<ExpandedOverlay {...props} />)
  expect(
    screen.getByText('Approach', { selector: 'summary' }).closest('details'),
  ).toBe(details)
  expect(details).toHaveAttribute('open')
  expect(scroll.scrollTop).toBe(137)
})

it('moves Tab into the active AI panel while skipping hidden Solve controls', async () => {
  const user = userEvent.setup()
  const props = createProps({
    view: {
      aiAnalysis: {
        status: 'unavailable',
        message: 'Connect AI in Settings.',
        canRetry: false,
        showSettings: true,
      },
      overlay: {
        ...initialOverlaySessionState,
        visualMode: 'expanded',
        expandedTab: 'ai',
      },
    },
  })
  render(<ExpandedOverlay {...props} />)
  screen.getByRole('tab', { name: 'AI' }).focus()
  await user.tab()
  expect(
    within(screen.getByRole('region', { name: 'AI assessment' })).getByRole(
      'button',
      { name: 'Settings' },
    ),
  ).toHaveFocus()
})
```

- [x] Run `rtk proxy npm test -- src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx --run`. Expect missing tabs/panels and footer-visibility failures.
- [x] Replace expanded-overlay.tsx with this complete composition. Existing child components remain the behavior owners.

```tsx
import { AlertCircle, Info } from 'lucide-react'
import { useId, useLayoutEffect, useRef, type UIEvent } from 'react'

import { InlineStatus } from '@/components/ui/inline-status'
import { SurfaceRoot } from '@/components/ui/surface'
import type { OverlayAppShellData } from '@/features/app-shell'
import type { ThemeMode } from '@/features/settings'
import type { ReviewRating } from '@/lib/fsrs'

import type { CodeAnalysisState } from '../../../hooks/use-leetcode-code-analysis'

import {
  hasSubmittedSessionChanges,
  type OverlayExpandedTab,
  type OverlaySessionState,
} from '../../../domain'
import type { OverlayTimerStatus } from '../../../hooks/use-overlay-timer'
import { OverlayActions } from './overlay-actions'
import { OverlayCodeAnalysis } from './overlay-code-analysis'
import { OverlayAssessmentRail } from './overlay-assessment-rail'
import {
  OverlayContextStrip,
  OverlaySubmissionSummary,
} from './overlay-context-strip'
import { OverlayHeader } from './overlay-header'
import { OverlayHelpSection } from './overlay-help-section'
import { OverlayNextCard } from './overlay-next-card'
import { OverlayTimerCard } from './overlay-timer-card'
import { OverlayTabs } from './overlay-tabs'

type ExpandedOverlayViewModel = {
  aiAnalysis: CodeAnalysisState
  context: OverlayAppShellData['overlay'] | null
  elapsedSeconds: number
  helpSearchQuery: string | null
  isOverTarget: boolean
  overlay: OverlaySessionState
  problemTitle: string
  syncFeedback: string | null
  syncStatus: string
  targetSeconds: number
  timerStatus: OverlayTimerStatus
}

type ExpandedOverlayCommands = {
  onCollapse: () => void
  onDock: () => void
  onFail: () => void
  onPauseTimer: () => void
  onResetTimer: () => void
  onRestart: () => void
  onRetryAiAnalysis: () => void
  onSelectRating: (rating: ReviewRating) => void
  onSelectExpandedTab: (tab: OverlayExpandedTab) => void
  onSettings: () => void
  onStartTimer: () => void
  onSubmit: () => void
  onUpdate: () => void
}

type ExpandedOverlayProps = {
  commands: ExpandedOverlayCommands
  themeMode: ThemeMode
  view: ExpandedOverlayViewModel
}

export function ExpandedOverlay({
  commands,
  themeMode,
  view,
}: ExpandedOverlayProps) {
  const {
    aiAnalysis,
    context,
    elapsedSeconds,
    helpSearchQuery,
    isOverTarget,
    overlay,
    problemTitle,
    syncFeedback,
    syncStatus,
    targetSeconds,
    timerStatus,
  } = view
  const {
    onCollapse,
    onDock,
    onFail,
    onPauseTimer,
    onResetTimer,
    onRestart,
    onRetryAiAnalysis,
    onSelectRating,
    onSelectExpandedTab,
    onSettings,
    onStartTimer,
    onSubmit,
    onUpdate,
  } = commands
  const tabId = useId()
  const scrollRefs = useRef<Record<OverlayExpandedTab, HTMLDivElement | null>>({
    solve: null,
    ai: null,
    notes: null,
  })
  const scrollPositions = useRef<Record<OverlayExpandedTab, number>>({
    solve: 0,
    ai: 0,
    notes: 0,
  })
  useLayoutEffect(() => {
    const node = scrollRefs.current[overlay.expandedTab]
    if (node) node.scrollTop = scrollPositions.current[overlay.expandedTab]
  }, [overlay.expandedTab])
  function rememberScroll(
    tab: OverlayExpandedTab,
    event: UIEvent<HTMLDivElement>,
  ) {
    if (overlay.expandedTab === tab) {
      scrollPositions.current[tab] = event.currentTarget.scrollTop
    }
  }
  const aiStatus =
    aiAnalysis.status === 'ready'
      ? 'Ready'
      : aiAnalysis.status === 'pending'
        ? 'Working'
        : aiAnalysis.status === 'error'
          ? 'Error'
          : aiAnalysis.status === 'unavailable'
            ? 'Unavailable'
            : null
  const solveStatus =
    overlay.reviewStatus === 'saving' || overlay.reviewStatus === 'updating'
      ? 'Saving'
      : overlay.feedback?.tone === 'danger' || syncStatus === 'error'
        ? 'Error'
        : null
  const submitted = Boolean(overlay.submittedSession)
  const isMutating =
    overlay.reviewStatus === 'saving' || overlay.reviewStatus === 'updating'
  const showUntimedWarning =
    !submitted &&
    context?.timing.requireSolveTime === true &&
    elapsedSeconds === 0 &&
    timerStatus !== 'running'

  return (
    <SurfaceRoot
      asChild
      data-cp-overlay-mode="expanded"
      surface="overlay"
      theme={themeMode}
    >
      <aside aria-label="CogniPace review overlay">
        <OverlayHeader
          onCollapse={onCollapse}
          onDock={onDock}
          onSettings={onSettings}
          problem={context?.problem ?? null}
          title={problemTitle}
        />
        <OverlayContextStrip context={context} isSubmitted={submitted} />

        <OverlayTabs
          activeTab={overlay.expandedTab}
          idPrefix={tabId}
          onSelectTab={onSelectExpandedTab}
          aiStatus={aiStatus}
          solveStatus={solveStatus}
        />
        <section
          id={tabId + '-solve-panel'}
          role="tabpanel"
          aria-labelledby={tabId + '-solve-tab'}
          hidden={overlay.expandedTab !== 'solve'}
          style={{
            display: overlay.expandedTab === 'solve' ? undefined : 'none',
          }}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            ref={(node) => {
              scrollRefs.current.solve = node
            }}
            onScroll={(event) => rememberScroll('solve', event)}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3"
          >
            <div className="grid min-w-0 gap-4">
              {syncStatus === 'error' && syncFeedback ? (
                <InlineStatus tone="danger">
                  <AlertCircle aria-hidden="true" />
                  <span>{syncFeedback}</span>
                </InlineStatus>
              ) : null}

              <OverlaySubmissionSummary context={context} />

              <OverlayTimerCard
                elapsedSeconds={elapsedSeconds}
                isOverTarget={isOverTarget}
                onPause={onPauseTimer}
                onReset={onResetTimer}
                onStart={onStartTimer}
                targetSeconds={targetSeconds}
                timerStatus={timerStatus}
              />

              <OverlayAssessmentRail
                isDisabled={isMutating}
                lockReason={overlay.ratingLockReason}
                onSelectRating={onSelectRating}
                selectedRating={overlay.selectedRating}
              />

              {showUntimedWarning ? (
                <InlineStatus tone="neutral">
                  <Info aria-hidden="true" />
                  <span>
                    No timer used; this review will save without solve time.
                  </span>
                </InlineStatus>
              ) : null}

              <OverlayHelpSection searchQuery={helpSearchQuery} />
            </div>
          </div>

          <div className="grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-border bg-card p-3">
            <OverlayActions
              feedback={overlay.feedback}
              hasSubmittedChanges={hasSubmittedSessionChanges(overlay)}
              isSubmitted={submitted}
              onFail={onFail}
              onRestart={onRestart}
              onSubmit={onSubmit}
              onUpdate={onUpdate}
              reviewStatus={overlay.reviewStatus}
            />
            <OverlayNextCard nextStep={overlay.nextStep} />
          </div>
        </section>

        <section
          id={tabId + '-ai-panel'}
          role="tabpanel"
          aria-labelledby={tabId + '-ai-tab'}
          hidden={overlay.expandedTab !== 'ai'}
          style={{ display: overlay.expandedTab === 'ai' ? undefined : 'none' }}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            ref={(node) => {
              scrollRefs.current.ai = node
            }}
            onScroll={(event) => rememberScroll('ai', event)}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3"
          >
            <OverlayCodeAnalysis
              onRetry={onRetryAiAnalysis}
              onSettings={onSettings}
              state={aiAnalysis}
            />
          </div>
        </section>

        <section
          id={tabId + '-notes-panel'}
          role="tabpanel"
          aria-labelledby={tabId + '-notes-tab'}
          hidden={overlay.expandedTab !== 'notes'}
          style={{
            display: overlay.expandedTab === 'notes' ? undefined : 'none',
          }}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            ref={(node) => {
              scrollRefs.current.notes = node
            }}
            onScroll={(event) => rememberScroll('notes', event)}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3"
          >
            <div className="grid min-h-full content-center gap-2 p-6 text-center">
              <h2 className="text-base font-semibold">Notes</h2>
              <p className="m-0 text-sm text-muted-foreground">
                A dedicated space for your problem notes, coming in a later
                phase.
              </p>
            </div>
          </div>
        </section>
      </aside>
    </SurfaceRoot>
  )
}
```

- [x] Update the two existing AI report/recovery tests to select AI in their overlay fixture; the default is now Solve. Make their complete overlay overrides:

```ts
// Scored report test:
overlay: {
  ...createFailedSubmittedOverlay(),
  reviewStatus: 'saving',
  expandedTab: 'ai',
},

// Recovery actions test:
overlay: {
  ...initialOverlaySessionState,
  visualMode: 'expanded',
  expandedTab: 'ai',
},
```

- [x] Change the failed-attempt test's Notes assertion to the following line. In the structured-log absence test, replace its field loop with the following complete loop and assertion. The reserved tab remains present; editable fields remain absent.

```ts
// Failed-attempt test:
expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument()

// Structured-log absence test:
for (const label of [
  'Interview Pattern',
  'Time Complexity',
  'Space Complexity',
  'Languages',
]) {
  expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
}
expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument()
```

- [x] Rerun the same focused command. Expect pass for existing Solve flows and new panel/disclosure/scroll/hidden-control keyboard behavior.
- [x] Confirm browser smoke will verify actual scroll restoration and hidden controls; JSDOM cannot prove physical layout. No width/anchor CSS change is part of this task.
- [x] Stage and commit only these task files.

```sh
rtk git add src/features/overlay-session/components/modes/expanded/expanded-overlay.tsx src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx
rtk git commit -m "feat(overlay): separate Solve footer from AI and Notes panels"
```

## Task 5: Meaningful disabled AI state and report independence

**Files:**

- Modify: `src/features/overlay-session/components/modes/expanded/overlay-code-analysis.tsx`
- Test: `src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx`
- Test: `src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx`

- [x] Replace the existing "hides disabled analysis" test with this complete test.

```tsx
it('explains disabled assessment and links to Settings', async () => {
  const user = userEvent.setup()
  const { onSettings, rerender } = mount({ status: 'disabled' })
  expect(screen.getByRole('region', { name: 'AI assessment' })).toBeVisible()
  expect(screen.getByText('Automatic AI assessment is off.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Settings' }))
  expect(onSettings).toHaveBeenCalledOnce()
  rerender({ status: 'idle' })
  expect(
    screen.getByText('Submit on LeetCode to get an AI assessment.'),
  ).toBeVisible()
})
```

- [x] Run `rtk proxy npm test -- src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx --run`; expect the new disabled region assertion to fail.
- [x] Remove the exact early return `if (state.status === 'disabled') return null`. Insert this complete branch after the existing AI assessment heading; use the module's existing `text`, `button`, `focus`, and `cn` constants.

```tsx
{
  state.status === 'disabled' ? (
    <div className="grid min-w-0 gap-2">
      <p className={cn(text, 'text-muted-foreground')}>
        Automatic AI assessment is off.
      </p>
      <div>
        <button
          className={cn(button, focus)}
          onClick={onSettings}
          type="button"
        >
          Settings
        </button>
      </div>
    </div>
  ) : null
}
```

- [x] In the existing session test "runs one scored report for a full matching attempt without preselecting a rating", add this loop after its existing mode loop.

```ts
for (const tab of ['ai', 'notes', 'solve', 'ai'] as const) {
  act(() => result.current.actions.selectExpandedTab(tab))
  await flushEffects()
  expect(result.current.aiAnalysis.status).toBe('ready')
}
expect(analyze).toHaveBeenCalledOnce()
expect(result.current.overlay.selectedRating).toBe('easy')
```

- [x] Run `rtk proxy npm test -- src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx --run`; expect all existing report replacement/copy/cancellation and review preservation tests to remain green.
- [x] Keep passive cues generic: danger feedback can also mean Settings/context failure, so "Error" must not claim every danger is a failed save. Do not add unread state or automatic focus/tab changes.
- [x] Stage and commit only these task files.

```sh
rtk git add src/features/overlay-session/components/modes/expanded/overlay-code-analysis.tsx src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx
rtk git commit -m "feat(overlay): explain inactive AI feedback without changing generation"
```

## Task 6: Current docs, required checks and human proof

**Files:**

- Modify: `docs/product.md`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `design.md`
- Create: `docs/superpowers/handoffs/2026-10-04-overlay-focused-tabs.md`
- Modify: `docs/superpowers/README.md` (phase status and handoff links)

- [x] In product.md's LeetCode Overlay behavior list, replace the focused-review bullet with this current Phase 1 description after implementation:

```md
- focused Solve / AI / Notes tabs in expanded mode
- timer, assessment, submission dates, Help, review actions, feedback, and next
  guidance in Solve; the full review footer appears only on Solve
- existing completed-submission analysis in AI, with loading/error/disabled
  explanations and Settings/Retry where useful
- a reserved Notes placeholder without editing or persistence
```

- [x] Add this paragraph to architecture.md's Change Overlay Behavior recipe:

```md
Expanded-tab selection belongs to overlay-session state above the visual modes.
ExpandedOverlay composes mounted tab panels and a Solve-only footer. Tab switches
preserve native report disclosures and per-panel scroll; hidden panels remain
inaccessible. Save completion preserves the current expanded tab, while saves
from collapsed or docked mode open Solve. New problems and Restart select Solve.
AI generation stays in the session controller and tab navigation makes no
provider or practice writes.
```

- [x] Add the following Phase 1 direction to design.md's LeetCode analysis rules:

```md
- Use focused Solve / AI / Notes tabs below the shared overlay header/context.
  Keep the full review footer only in Solve and give AI its full reading area.
- Use text tabs with explicit selection, visible focus, Left/Right and Home/End
  navigation, paired panels, and passive current-status cues. Preserve tab
  scroll and open native AI details while switching tabs.
- Show Notes as a short future-phase placeholder. Do not add an editable field
  or imply that the placeholder saves notes.
```

- [x] Extend docs/testing.md's overlay flow with this exact manual checklist, retaining existing historical-log preservation and real submission/AI tests:

```md
#### Focused overlay tabs

Status: human installed-extension smoke pending until evidence is attached.

1. Open a problem and expand. Confirm Solve is selected and contains timer,
   assessment, submission dates, Help, review controls, and Up next after save.
2. Switch to AI and Notes. Confirm the full footer is absent, AI states remain
   useful, and Notes has only the reserved placeholder.
3. Open AI disclosures, scroll the report, switch away/back, and confirm detail
   and scroll preservation. Replace the report and confirm disclosures close.
4. Exercise Left/Right, Home/End, and Tab in the real ShadowRoot. Confirm
   hidden panels' controls do not receive focus.
5. Change tabs during a delayed save. Confirm the completion-time tab survives.
   Save from collapsed and docked states and confirm expanded Solve opens.
6. Collapse/dock/restore/reexpand from AI and Notes; confirm selected tab and
   report data survive. Navigate to another problem and Restart; confirm Solve.
7. Run accepted/failed autosaves, quick/manual/untimed reviews, rating updates,
   strict overtime, AI off/unavailable/pending/error, and next-step errors.
   Confirm unchanged locks, elapsed time, single-attempt updates and preserved
   historical log fields.
8. Verify 392px/320px widths, a short viewport and long literal code. Vertical
   scroll belongs to the selected panel; code alone may scroll horizontally.
9. Attach happy-path and edge-case screenshots/recording with extension version
   and tested flows before PR review or merge.
```

- [x] Run the full focused Phase 1 set:

```sh
rtk proxy npm test -- src/features/overlay-session/domain/overlay-session-state.test.ts src/features/overlay-session/components/modes/expanded/overlay-tabs.test.tsx src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx src/features/overlay-session/components/overlay-shell.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx --run
rtk proxy npm run lint
rtk proxy npm run check
rtk proxy npm run build
rtk proxy npx prettier --check --ignore-path /dev/null docs/product.md docs/architecture.md docs/testing.md design.md docs/superpowers/handoffs/2026-10-04-overlay-focused-tabs.md docs/superpowers/README.md
rtk git diff --check
```

Expected: focused and full checks pass and Chrome MV3 build succeeds. Inspect the
production components in a browser fixture if useful, then record required human
installed-extension smoke separately. Fixture proof does not replace human proof.

- [x] Write the handoff with actual source status, exact commands/results,
      exact skipped commands and reasons, pending human proof, risk/recovery, and
      feature release impact. Mark Phase 2 as pending. Use these sections:

```md
# Focused overlay tabs handoff

## Behavior and source

Describe the implemented tab state, Solve-only footer, mounted panels,
ShadowRoot-safe keyboard controls, and disabled AI display.

## Automated validation

List the exact commands actually run and their outcomes. Name any skipped
command and its reason. Describe unresolved failures without claiming pass.

## Browser and human evidence

Name each actual screenshot/recording path and tested flow. Human happy-path
and edge-case installed-extension smoke remains pending until completed.

## Risk and recovery

The main risks are hidden-panel focus, scroll retention and asynchronous save
selection. Rollback restores the former expanded composition without a migration.
Phase 2 hints and saved Notes remain outside this implementation.
```

- [x] Update README's phase/handoff links to reflect only verified status.
- [x] Stage and commit only these task docs.

```sh
rtk git add docs/product.md docs/architecture.md docs/testing.md design.md docs/superpowers/handoffs/2026-10-04-overlay-focused-tabs.md docs/superpowers/README.md
rtk git commit -m "docs(overlay): document focused tabs and validation evidence"
```

- [ ] Do not mark this phase review/merge ready until the human evidence gate is complete.

## Done when

All approved Phase 1 layout/state rules have automated coverage; required lint,
check and build pass; current docs match implemented behavior; real human
happy-path and edge-case smoke with visual proof is complete before review/merge.
AI/provider calls and practice persistence remain independent of tab navigation.
The separate hints plan may begin after this tabbed source foundation is verified.
