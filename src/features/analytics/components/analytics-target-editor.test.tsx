import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { defaultAnalyticsTargets } from '@/features/settings/domain'
import { AnalyticsTargetEditor } from './analytics-target-editor'

const targets = defaultAnalyticsTargets
const metrics = [
  [
    'recall',
    'Target Recall',
    'targetRecall',
    80,
    /Hard \+ Good \+ Easy.*Up to Review Success/,
  ],
  [
    'reviewSuccess',
    'Target Review Success',
    'targetReviewSuccess',
    100,
    /Good \+ Easy.*At least Recall/,
  ],
  [
    'firstAttemptSuccess',
    'Target First-attempt Success',
    'targetFirstAttemptSuccess',
    29,
    /Hard \+ Good \+ Easy.*first recorded/,
  ],
  [
    'firstAttemptGoodEasy',
    'Target Good + Easy',
    'targetFirstAttemptGoodEasy',
    29,
    /Good \+ Easy.*first recorded/,
  ],
] as const

type Metric = (typeof metrics)[number][0]
const input = () => screen.getByRole('spinbutton')
const change = (value: string) =>
  fireEvent.change(input(), { target: { value } })

async function open(
  metric: Metric = 'recall',
  save = vi.fn(),
  initial = targets,
) {
  const user = userEvent.setup()
  const result = render(
    <AnalyticsTargetEditor targets={initial} metric={metric} onSave={save} />,
  )
  const [, label, key] = metrics.find(([name]) => name === metric)!
  await user.click(
    screen.getByRole('button', { name: `${label} ${initial[key] * 100}%` }),
  )
  return { user, ...result }
}

describe('Analytics target editor', () => {
  it.each(metrics)(
    'opens and saves only %s with updated-caption focus',
    async (metric, label, key, value, hint) => {
      const user = userEvent.setup()
      const save = vi.fn()
      function SavedEditor() {
        const [saved, setSaved] = useState({
          ...targets,
          targetFirstAttemptGoodEasy: 1,
        })
        return (
          <AnalyticsTargetEditor
            targets={saved}
            metric={metric}
            onSave={(patch) => {
              save(patch)
              setSaved((current) => ({ ...current, ...patch }))
              return Promise.resolve()
            }}
          />
        )
      }
      render(<SavedEditor />)
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
      await user.click(
        screen.getByRole('button', {
          name: `${label} ${metric === 'firstAttemptGoodEasy' ? 100 : 90}%`,
        }),
      )
      expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
      expect(screen.getByLabelText(`${label} (%)`)).toHaveFocus()
      expect(screen.getByText(hint)).toBeVisible()
      await user.clear(input())
      await user.type(input(), `${value}{Enter}`)
      expect(save).toHaveBeenCalledExactlyOnceWith({ [key]: value / 100 })
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: `${label} ${value}%` }),
        ).toHaveFocus(),
      )
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    },
  )

  it.each([
    ['recall', '95'],
    ['reviewSuccess', '80'],
  ] as const)('blocks an invalid dependent %s pair', async (metric, value) => {
    const save = vi.fn()
    await open(metric, save)
    change(value)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Review Success target must be at least your Recall target',
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects malformed percentage text but accepts independent boundary values', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { user } = await open('firstAttemptSuccess', save)
    for (const value of ['', '-1', '101', '29.5']) {
      change(value)
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Use whole percentages from 0 to 100',
      )
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    }
    for (const value of ['0', '100']) {
      change(value)
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    }
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(save).toHaveBeenCalledExactlyOnceWith({
      targetFirstAttemptSuccess: 1,
    })
  })

  it('retains a draft while the latest counterpart changes its hint and validity', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { user, rerender } = await open('recall', save)
    change('85')
    for (const success of [0.8, 0.9]) {
      rerender(
        <AnalyticsTargetEditor
          targets={{
            ...targets,
            targetRecall: 0.8,
            targetReviewSuccess: success,
          }}
          metric="recall"
          onSave={save}
        />,
      )
      expect(input()).toHaveValue(85)
      expect(
        screen.getByText(
          `Hard + Good + Easy · Up to Review Success ${success * 100}%.`,
        ),
      ).toBeVisible()
      expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty(
        'disabled',
        success < 0.85,
      )
    }
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(save).toHaveBeenCalledExactlyOnceWith({ targetRecall: 0.85 })
  })

  it('retains a failed draft through refresh, then cancels to the latest saved caption', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Storage unavailable'))
    const { user, rerender } = await open('firstAttemptSuccess', save)
    change('100')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Storage unavailable',
    )
    rerender(
      <AnalyticsTargetEditor
        targets={{ ...targets, targetFirstAttemptSuccess: 0.7 }}
        metric="firstAttemptSuccess"
        onSave={save}
      />,
    )
    expect(input()).toHaveValue(100)
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Target First-attempt Success 70%' }),
    ).toBeVisible()
    await user.keyboard('{Escape}')
    expect(
      screen.getByRole('button', { name: 'Target First-attempt Success 70%' }),
    ).toHaveFocus()
  })

  it.each(['Escape', 'Cancel'])(
    'discards a draft with %s, restores focus, and resets on reopen',
    async (action) => {
      const save = vi.fn()
      const { user } = await open('recall', save)
      change('80')
      if (action === 'Escape') await user.keyboard('{Escape}')
      else await user.click(screen.getByRole('button', { name: 'Cancel' }))
      const trigger = screen.getByRole('button', { name: 'Target Recall 90%' })
      expect(trigger).toHaveFocus()
      expect(save).not.toHaveBeenCalled()
      await user.click(trigger)
      expect(input()).toHaveValue(90)
    },
  )

  it('prevents duplicate submits and cancellation while a save is pending', async () => {
    let resolve!: () => void
    const save = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    )
    const { user } = await open('recall', save)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(input()).toBeDisabled()
    await user.keyboard('{Enter}{Escape}')
    expect(save).toHaveBeenCalledTimes(1)
    resolve()
    await waitFor(() =>
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument(),
    )
  })
})

function ControlledGoals({
  save,
  current = targets,
}: {
  save: (patch: Partial<typeof targets>) => Promise<unknown>
  current?: typeof targets
}) {
  const [open, setOpen] = useState(false)
  const returnFocusRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={returnFocusRef} onClick={() => setOpen(true)} type="button">
        Goals
      </button>
      <button onClick={() => setOpen(false)} type="button">
        Overview
      </button>
      <AnalyticsTargetEditor
        targets={current}
        metric="recall"
        onSave={save}
        surface="goals"
        open={open}
        onOpenChange={setOpen}
        returnFocusRef={returnFocusRef}
      />
    </>
  )
}

describe('controlled Goals surface', () => {
  it('retains a draft and associated failed-save error while the mounted form is hidden, then retries one key', async () => {
    const user = userEvent.setup()
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Try again'))
      .mockResolvedValueOnce(undefined)
    render(<ControlledGoals save={save} />)
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Goals' }))
    expect(input()).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: 'Target Recall 90%' }),
    ).not.toBeInTheDocument()
    change('80')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again')
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    expect(input().getAttribute('aria-describedby')).toContain(
      screen.getByRole('alert').id,
    )
    await user.click(screen.getByRole('button', { name: 'Overview' }))
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Goals' }))
    expect(input()).toHaveValue(80)
    expect(screen.getByRole('alert')).toHaveTextContent('Try again')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Goals' })).toHaveFocus(),
    )
    expect(save).toHaveBeenNthCalledWith(2, { targetRecall: 0.8 })
  })

  it('reads current targets on first opening and validates a preserved draft against the latest counterpart', async () => {
    const user = userEvent.setup()
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<ControlledGoals save={save} />)
    rerender(
      <ControlledGoals
        save={save}
        current={{ ...targets, targetRecall: 0.7 }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Goals' }))
    expect(input()).toHaveValue(70)
    change('85')
    await user.click(screen.getByRole('button', { name: 'Overview' }))
    rerender(
      <ControlledGoals
        save={save}
        current={{ ...targets, targetRecall: 0.7, targetReviewSuccess: 0.8 }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Goals' }))
    expect(input()).toHaveValue(85)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Review Success target must be at least your Recall target',
    )
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Goals' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Goals' }))
    expect(input()).toHaveValue(70)
  })

  it('guards pending saves across hiding and reopening and wraps controls without shrinking text', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const save = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    )
    render(<ControlledGoals save={save} />)
    await user.click(screen.getByRole('button', { name: 'Goals' }))
    const fieldset = screen.getByRole('group', { name: 'Target Recall' })
    expect(fieldset).toHaveClass('min-w-0')
    expect(screen.getByTestId('target-editor-controls')).toHaveClass(
      'flex-wrap',
    )
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Overview' }))
    await user.click(screen.getByRole('button', { name: 'Goals' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await user.keyboard('{Enter}{Escape}')
    expect(save).toHaveBeenCalledTimes(1)
    resolve()
    await waitFor(() =>
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Goals' })).toHaveFocus()
  })

  it('resets its successful hidden draft without restoring focus into the departed Goals surface', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const save = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    )
    render(<ControlledGoals save={save} />)
    await user.click(screen.getByRole('button', { name: 'Goals' }))
    change('80')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Overview' }))
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveFocus()
    await act(async () => {
      resolve()
      await Promise.resolve()
    })
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Goals' }))
    expect(input()).toHaveValue(90)
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(save).toHaveBeenCalledExactlyOnceWith({ targetRecall: 0.8 })
  })

  it('notifies the latest controlled owner when a visible save completes', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const save = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    )
    const oldOwner = vi.fn(),
      latestOwner = vi.fn()
    const { rerender } = render(
      <AnalyticsTargetEditor
        targets={targets}
        metric="recall"
        onSave={save}
        surface="goals"
        open
        onOpenChange={oldOwner}
      />,
    )
    change('80')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    rerender(
      <AnalyticsTargetEditor
        targets={targets}
        metric="recall"
        onSave={save}
        surface="goals"
        open
        onOpenChange={latestOwner}
      />,
    )
    await act(async () => {
      resolve()
      await Promise.resolve()
    })
    expect(oldOwner).not.toHaveBeenCalled()
    expect(latestOwner).toHaveBeenCalledExactlyOnceWith(false)
  })
})
