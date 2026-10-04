import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { analyzeLeetCodeSubmissionViaRuntime } from '@/features/leetcode-review-assistant'
import { makeValidAnalysis } from '@/features/leetcode-review-assistant/testing'

import type { CodeAnalysisState } from '../../../hooks/use-leetcode-code-analysis'
import { OverlayCodeAnalysis } from './overlay-code-analysis'

vi.mock('@/features/leetcode-review-assistant', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/leetcode-review-assistant')
  >()),
  analyzeLeetCodeSubmissionViaRuntime: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

const ready = (
  report = makeValidAnalysis(),
  requestId = 'request-1',
): CodeAnalysisState => ({
  status: 'ready',
  requestId,
  report,
})

function mount(state: CodeAnalysisState = ready()) {
  const onRetry = vi.fn()
  const onSettings = vi.fn()
  return {
    ...render(
      <OverlayCodeAnalysis
        state={state}
        onRetry={onRetry}
        onSettings={onSettings}
      />,
    ),
    onRetry,
    onSettings,
  }
}

function disclosure(name: string) {
  return screen.getByText(name, { selector: 'summary' }).closest('details')!
}

function deferred() {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function clipboard(result: Promise<void>) {
  const writeText = vi.fn(() => result)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

describe('OverlayCodeAnalysis', () => {
  it('shows the factual summary, score chips, and four independent closed native disclosures', async () => {
    const user = userEvent.setup()
    const report = makeValidAnalysis()
    const { onRetry } = mount(ready(report))
    expect(
      screen.getByRole('region', { name: 'AI assessment' }),
    ).toBeInTheDocument()
    expect(screen.getByText(report.summary)).toBeVisible()
    for (const chip of ['Approach 3/5', 'Efficiency 3/5', 'Code Style 4/5'])
      expect(screen.getByText(chip)).toBeVisible()
    const details = [
      'Approach',
      'Efficiency',
      'Code Style',
      'Suggested implementation',
    ].map(disclosure)
    expect(document.querySelectorAll('details')).toHaveLength(4)
    for (const node of details) expect(node).not.toHaveAttribute('open')
    await user.click(
      within(details[0]!).getByText('Approach', { selector: 'summary' }),
    )
    await user.click(
      within(details[1]!).getByText('Efficiency', { selector: 'summary' }),
    )
    expect(details[0]).toHaveAttribute('open')
    expect(details[1]).toHaveAttribute('open')
    expect(details[2]).not.toHaveAttribute('open')
    expect(details[3]).not.toHaveAttribute('open')
    expect(onRetry).not.toHaveBeenCalled()
    expect(analyzeLeetCodeSubmissionViaRuntime).not.toHaveBeenCalled()
    expect(screen.queryByText('Use recommendation')).not.toBeInTheDocument()
    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
    expect(screen.queryByText('Edge case notes')).not.toBeInTheDocument()
  })

  it('renders all approach, efficiency, and style rows with independently colored resources', () => {
    const report = makeValidAnalysis()
    mount(ready(report))
    const approach = within(disclosure('Approach'))
    for (const label of ['Current', 'Suggested', 'Key idea', 'Consider'])
      expect(approach.getByText(label)).toBeInTheDocument()
    expect(approach.getByText('Pair enumeration / Array')).toBeInTheDocument()
    expect(approach.getByText('Hash map / Array')).toBeInTheDocument()
    expect(approach.getByText(report.approach.rationale)).toBeInTheDocument()
    const efficiency = within(disclosure('Efficiency'))
    for (const label of [
      'Current complexity',
      'Suggested complexity',
      'Suggestions',
    ])
      expect(efficiency.getByText(label)).toBeInTheDocument()
    expect(efficiency.getByText('O(n²)')).not.toHaveClass(
      'text-[color:var(--cp-tone-success-fg)]',
    )
    expect(efficiency.getByText('O(1)')).not.toHaveClass(
      'text-[color:var(--cp-tone-warning-fg)]',
    )
    expect(efficiency.getByText('Expected O(n)')).toHaveClass(
      'text-[color:var(--cp-tone-success-fg)]',
    )
    expect(efficiency.getByText('O(n)')).toHaveClass(
      'text-[color:var(--cp-tone-warning-fg)]',
    )
    expect(efficiency.getAllByText('Time')).toHaveLength(2)
    expect(efficiency.getAllByText('Auxiliary space')).toHaveLength(2)
    expect(
      efficiency.getByText(report.efficiency.current!.assumptions[0]!),
    ).toBeInTheDocument()
    expect(
      efficiency.getByText(report.efficiency.suggested!.assumptions[0]!),
    ).toBeInTheDocument()
    const style = within(disclosure('Code Style'))
    expect(style.getByText('Readability')).toBeInTheDocument()
    expect(style.getByText('Good')).toBeInTheDocument()
    expect(style.getByText('Structure')).toBeInTheDocument()
    expect(style.getByText('Excellent')).toBeInTheDocument()
    expect(style.getByText(report.codeStyle.rationale)).toBeInTheDocument()
  })

  it('keeps equivalent resources neutral and unknown resources muted without ranking Big O strings', () => {
    const report = makeValidAnalysis()
    report.efficiency.timeComparison = 'equivalent'
    report.efficiency.spaceComparison = 'unknown'
    mount(ready(report))
    const efficiency = within(disclosure('Efficiency'))
    expect(efficiency.getByText('Expected O(n)')).toHaveClass('text-foreground')
    expect(efficiency.getByText('O(n)')).toHaveClass('text-muted-foreground')
  })

  it('renders null dimensions and implementation truthfully and omits a null Consider row', () => {
    const report = makeValidAnalysis()
    report.approach.score = null
    report.approach.consider = null
    report.efficiency.score = null
    report.efficiency.current = null
    report.efficiency.suggested = null
    report.efficiency.suggestions = []
    report.codeStyle.score = null
    report.codeStyle.readability = 'Unavailable'
    report.codeStyle.structure = 'Needs improvement'
    report.codeStyle.suggestions = []
    report.suggestedImplementation = null
    report.suggestedImplementationUnavailableReason =
      'The full signature is unavailable.'
    mount(ready(report))
    for (const chip of [
      'Approach Unavailable',
      'Efficiency Unavailable',
      'Code Style Unavailable',
    ])
      expect(screen.getByText(chip)).toBeVisible()
    expect(
      within(disclosure('Approach')).queryByText('Consider'),
    ).not.toBeInTheDocument()
    expect(
      within(disclosure('Efficiency')).getAllByText('Unavailable').length,
    ).toBeGreaterThan(1)
    expect(screen.getAllByText('No suggestions provided')).toHaveLength(2)
    expect(screen.getByText('Needs improvement')).toBeInTheDocument()
    expect(
      screen.getByText('The full signature is unavailable.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Copy code' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/no meaningful change/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/0\/5/)).not.toBeInTheDocument()
  })

  it('preserves complete generated code, language, changes, and complexity inside the closed implementation disclosure', () => {
    const report = makeValidAnalysis()
    report.suggestedImplementation!.code =
      '  class Solution {\n' + 'x'.repeat(1000) + '\n}\n'
    mount(ready(report))
    const details = disclosure('Suggested implementation')
    expect(details).not.toHaveAttribute('open')
    const code = details.querySelector('pre > code')!
    expect(code.textContent).toBe(report.suggestedImplementation!.code)
    expect(code.parentElement).toHaveClass(
      'max-w-full',
      'overflow-x-auto',
      'min-w-0',
    )
    const implementation = within(details)
    expect(implementation.getByText('JavaScript')).toBeInTheDocument()
    expect(
      implementation.getByText('AI-generated · Untested'),
    ).toBeInTheDocument()
    expect(
      implementation.getByText(report.suggestedImplementation!.changes[0]!),
    ).toBeInTheDocument()
    expect(implementation.getByText('Auxiliary space')).toBeInTheDocument()
    expect(
      implementation.getByText(report.suggestedImplementation!.assumptions[0]!),
    ).toBeInTheDocument()
  })

  it('copies the exact full code only on explicit action and reports success after clipboard resolves', async () => {
    const user = userEvent.setup()
    const pending = deferred()
    const writeText = clipboard(pending.promise)
    const report = makeValidAnalysis()
    mount(ready(report))
    await user.click(
      screen.getByText('Suggested implementation', { selector: 'summary' }),
    )
    expect(writeText).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith(report.suggestedImplementation!.code)
    expect(screen.queryByText('Copied')).not.toBeInTheDocument()
    await act(async () => {
      pending.resolve()
      await pending.promise
    })
    expect(screen.getByRole('status')).toHaveTextContent('Copied')
    expect(analyzeLeetCodeSubmissionViaRuntime).not.toHaveBeenCalled()
  })

  it('reports a fixed safe clipboard failure without leaking rejected text', async () => {
    const user = userEvent.setup()
    const pending = deferred()
    clipboard(pending.promise)
    mount()
    await user.click(
      screen.getByText('Suggested implementation', { selector: 'summary' }),
    )
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    await act(async () => {
      pending.reject(new Error('secret provider text'))
      await pending.promise.catch(() => {})
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Copy failed. Select the code and copy it.',
    )
    expect(screen.queryByText('Copied')).not.toBeInTheDocument()
    expect(screen.queryByText('secret provider text')).not.toBeInTheDocument()
  })

  it.each(['success', 'failure'] as const)(
    'prevents an old pending copy %s from updating a replacement report',
    async (outcome) => {
      const user = userEvent.setup()
      const pending = deferred()
      clipboard(pending.promise)
      const { rerender, onRetry, onSettings } = mount()
      await user.click(
        screen.getByText('Suggested implementation', { selector: 'summary' }),
      )
      await user.click(screen.getByRole('button', { name: 'Copy code' }))
      rerender(
        <OverlayCodeAnalysis
          state={ready(
            makeValidAnalysis({ summary: 'New report.' }),
            'request-2',
          )}
          onRetry={onRetry}
          onSettings={onSettings}
        />,
      )
      await act(async () => {
        if (outcome === 'success') pending.resolve()
        else pending.reject(new Error('old failure'))
        await pending.promise.catch(() => {})
      })
      expect(screen.getByText('New report.')).toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      for (const details of document.querySelectorAll('details'))
        expect(details).not.toHaveAttribute('open')
    },
  )

  it('does not publish a pending clipboard result after unmount', async () => {
    const user = userEvent.setup()
    const pending = deferred()
    clipboard(pending.promise)
    const { unmount } = mount()
    await user.click(
      screen.getByText('Suggested implementation', { selector: 'summary' }),
    )
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    unmount()
    await act(async () => {
      pending.resolve()
      await pending.promise
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('resets opened disclosures and completed Copy feedback for a new request', async () => {
    const user = userEvent.setup()
    clipboard(Promise.resolve())
    const { rerender, onRetry, onSettings } = mount()
    for (const name of [
      'Approach',
      'Efficiency',
      'Code Style',
      'Suggested implementation',
    ])
      await user.click(screen.getByText(name, { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    expect(screen.getByText('Copied')).toBeInTheDocument()
    rerender(
      <OverlayCodeAnalysis
        state={ready(makeValidAnalysis(), 'request-2')}
        onRetry={onRetry}
        onSettings={onSettings}
      />,
    )
    for (const details of document.querySelectorAll('details'))
      expect(details).not.toHaveAttribute('open')
    expect(screen.queryByText('Copied')).not.toBeInTheDocument()
  })

  it('renders model text inertly and constrains long text containers', () => {
    const modelText =
      '<script>window.pwned = true</script> [link](https://malicious.example)'
    const report = makeValidAnalysis({ summary: modelText })
    report.approach.rationale = 'x'.repeat(800)
    report.approach.keyIdea = modelText
    mount(ready(report))
    expect(screen.getAllByText(modelText)).toHaveLength(2)
    expect(document.querySelector('script')).toBeNull()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(report.approach.rationale)).toHaveClass(
      'min-w-0',
      'break-words',
    )
    expect(screen.getByText(modelText, { selector: 'p' })).toHaveClass(
      'min-w-0',
      'break-words',
    )
    expect(screen.getByRole('region', { name: 'AI assessment' })).toHaveClass(
      'min-w-0',
      'break-words',
    )
    expect(screen.getByText('Current').parentElement).toHaveClass(
      'min-w-0',
      'grid-cols-[6rem_minmax(0,1fr)]',
    )
  })

  it('uses native keyboard-focusable summaries and Copy controls with visible focus styling', async () => {
    const user = userEvent.setup()
    mount()
    for (const name of [
      'Approach',
      'Efficiency',
      'Code Style',
      'Suggested implementation',
    ]) {
      await user.tab()
      expect(screen.getByText(name, { selector: 'summary' })).toHaveFocus()
      expect(screen.getByText(name, { selector: 'summary' })).toHaveClass(
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-ring',
      )
    }
    // jsdom does not emulate native Enter/Space disclosure activation; the browser owns it.
    await user.click(
      screen.getByText('Suggested implementation', { selector: 'summary' }),
    )
    await user.tab()
    expect(screen.getByRole('button', { name: 'Copy code' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Copy code' })).toHaveClass(
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
    )
  })

  it('hides disabled analysis and shows the idle submission instruction', () => {
    const { rerender, onRetry, onSettings } = mount({ status: 'disabled' })
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    rerender(
      <OverlayCodeAnalysis
        state={{ status: 'idle' }}
        onRetry={onRetry}
        onSettings={onSettings}
      />,
    )
    expect(
      screen.getByText('Submit on LeetCode to get an AI assessment.'),
    ).toBeInTheDocument()
  })

  it.each([
    ['capture', 'Preparing full submission context…'],
    ['analysis', 'Analyzing submission…'],
  ] as const)(
    'announces the %s phase while keeping its region busy',
    (phase, message) => {
      mount({ status: 'pending', phase, requestId: 'request-1' })
      expect(screen.getByRole('status')).toHaveTextContent(message)
      expect(
        screen.getByRole('region', { name: 'AI assessment' }),
      ).toHaveAttribute('aria-busy', 'true')
    },
  )

  it.each(['unavailable', 'error'] as const)(
    'wires Retry and Settings only when the %s state allows them',
    async (status) => {
      const user = userEvent.setup()
      const state: Extract<
        CodeAnalysisState,
        { status: 'unavailable' | 'error' }
      > = {
        status,
        code: 'auth',
        message: 'Configure AI assessment in Settings.',
        canRetry: true,
        showSettings: true,
      }
      const { onRetry, onSettings, rerender } = mount(state)
      expect(screen.getByRole('status')).toHaveTextContent(state.message)
      await user.click(screen.getByRole('button', { name: 'Retry' }))
      await user.click(screen.getByRole('button', { name: 'Settings' }))
      expect(onRetry).toHaveBeenCalledOnce()
      expect(onSettings).toHaveBeenCalledOnce()
      rerender(
        <OverlayCodeAnalysis
          state={{ ...state, canRetry: false, showSettings: false }}
          onRetry={onRetry}
          onSettings={onSettings}
        />,
      )
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    },
  )
})
