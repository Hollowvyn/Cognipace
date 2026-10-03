import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { AnalyticsTargets } from '@/features/settings/domain'

import { AnalyticsTargetEditor } from './analytics-target-editor'

const targets = { targetRecall: 0.9, targetReviewSuccess: 0.9 }

describe('Analytics target editor', () => {
  it.each(['recall', 'reviewSuccess'] as const)(
    'opens only the %s goal and focuses its single field',
    async (metric) => {
      const user = userEvent.setup()
      render(
        <AnalyticsTargetEditor
          targets={targets}
          metric={metric}
          onSave={vi.fn()}
        />,
      )
      const label =
        metric === 'recall' ? 'Target Recall' : 'Target Review Success'
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: `${label} 90%` }))
      expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
      expect(
        screen.getByRole('spinbutton', { name: `${label} (%)` }),
      ).toHaveFocus()
      expect(
        screen.getByText(
          metric === 'recall'
            ? /Hard \+ Good \+ Easy.*Up to Review Success 90%/
            : /Good \+ Easy.*At least Recall 90%/,
        ),
      ).toBeVisible()
    },
  )

  it.each(['recall', 'reviewSuccess'] as const)(
    'rejects an invalid %s goal without changing the counterpart',
    async (metric) => {
      const user = userEvent.setup()
      const save = vi.fn()
      render(
        <AnalyticsTargetEditor
          targets={targets}
          metric={metric}
          onSave={save}
        />,
      )
      const label =
        metric === 'recall' ? 'Target Recall' : 'Target Review Success'
      await user.click(screen.getByRole('button', { name: `${label} 90%` }))
      fireEvent.change(screen.getByLabelText(`${label} (%)`), {
        target: { value: metric === 'recall' ? '95' : '80' },
      })
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Review Success target must be at least your Recall target',
      )
      expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
      expect(screen.getByRole('button', { name: `${label} 90%` })).toBeVisible()
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      expect(save).not.toHaveBeenCalled()
    },
  )

  it.each(['', '-1', '101', '80.5'])(
    'rejects invalid whole-percentage text %j',
    async (value) => {
      const user = userEvent.setup()
      render(
        <AnalyticsTargetEditor
          targets={targets}
          metric="recall"
          onSave={vi.fn()}
        />,
      )
      await user.click(
        screen.getByRole('button', { name: 'Target Recall 90%' }),
      )
      fireEvent.change(screen.getByLabelText('Target Recall (%)'), {
        target: { value },
      })
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Use whole percentages from 0 to 100',
      )
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    },
  )

  it('saves only Recall with Enter and returns focus to the updated caption', async () => {
    const user = userEvent.setup()
    const save = vi.fn<(next: Partial<AnalyticsTargets>) => Promise<void>>(
      async () => {},
    )
    function SavedEditor() {
      const [saved, setSaved] = useState(targets)
      return (
        <AnalyticsTargetEditor
          targets={saved}
          metric="recall"
          onSave={async (next) => {
            await save(next)
            setSaved((current) => ({ ...current, ...next }))
          }}
        />
      )
    }
    render(<SavedEditor />)
    await user.click(screen.getByRole('button', { name: 'Target Recall 90%' }))
    await user.clear(screen.getByLabelText('Target Recall (%)'))
    await user.type(screen.getByLabelText('Target Recall (%)'), '80{Enter}')
    expect(save).toHaveBeenCalledExactlyOnceWith({
      targetRecall: 0.8,
    })
    await waitFor(() =>
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'Target Recall 80%' }),
    ).toHaveFocus()
  })

  it.each([
    { metric: 'recall', initial: targets, value: 0 },
    {
      metric: 'recall',
      initial: { targetRecall: 0.9, targetReviewSuccess: 1 },
      value: 100,
    },
    {
      metric: 'reviewSuccess',
      initial: { targetRecall: 0, targetReviewSuccess: 0.9 },
      value: 0,
    },
    { metric: 'reviewSuccess', initial: targets, value: 100 },
  ] as const)(
    'saves only $metric at $value%',
    async ({ metric, initial, value }) => {
      const user = userEvent.setup()
      const save = vi.fn().mockResolvedValue(undefined)
      render(
        <AnalyticsTargetEditor
          targets={initial}
          metric={metric}
          onSave={save}
        />,
      )
      const label =
        metric === 'recall' ? 'Target Recall' : 'Target Review Success'
      await user.click(screen.getByRole('button', { name: `${label} 90%` }))
      fireEvent.change(screen.getByLabelText(`${label} (%)`), {
        target: { value: String(value) },
      })
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(save).toHaveBeenCalledExactlyOnceWith({
        [metric === 'recall' ? 'targetRecall' : 'targetReviewSuccess']:
          value / 100,
      })
    },
  )

  it('keeps the active draft while a refreshed counterpart updates the hint and validation', async () => {
    const user = userEvent.setup()
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <AnalyticsTargetEditor targets={targets} metric="recall" onSave={save} />,
    )
    await user.click(screen.getByRole('button', { name: 'Target Recall 90%' }))
    fireEvent.change(screen.getByLabelText('Target Recall (%)'), {
      target: { value: '85' },
    })
    rerender(
      <AnalyticsTargetEditor
        targets={{ targetRecall: 0.8, targetReviewSuccess: 0.8 }}
        metric="recall"
        onSave={save}
      />,
    )
    expect(screen.getByLabelText('Target Recall (%)')).toHaveValue(85)
    expect(screen.getByText(/Up to Review Success 80%/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    rerender(
      <AnalyticsTargetEditor
        targets={{ targetRecall: 0.8, targetReviewSuccess: 0.9 }}
        metric="recall"
        onSave={save}
      />,
    )
    expect(screen.getByLabelText('Target Recall (%)')).toHaveValue(85)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(save).toHaveBeenCalledExactlyOnceWith({ targetRecall: 0.85 })
  })

  it.each(['Escape', 'Cancel'])(
    'discards unsaved changes with %s and restores focus',
    async (action) => {
      const user = userEvent.setup()
      const save = vi.fn()
      render(
        <AnalyticsTargetEditor
          targets={targets}
          metric="recall"
          onSave={save}
        />,
      )
      const trigger = screen.getByRole('button', { name: 'Target Recall 90%' })
      await user.click(trigger)
      fireEvent.change(screen.getByLabelText('Target Recall (%)'), {
        target: { value: '80' },
      })
      if (action === 'Escape') await user.keyboard('{Escape}')
      else await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
      expect(save).not.toHaveBeenCalled()
      await user.click(trigger)
      expect(screen.getByLabelText('Target Recall (%)')).toHaveValue(90)
    },
  )

  it('keeps a failed draft open and the saved caption unchanged', async () => {
    const user = userEvent.setup()
    const save = vi.fn().mockRejectedValue(new Error('Could not save targets.'))
    render(
      <AnalyticsTargetEditor targets={targets} metric="recall" onSave={save} />,
    )
    await user.click(screen.getByRole('button', { name: 'Target Recall 90%' }))
    fireEvent.change(screen.getByLabelText('Target Recall (%)'), {
      target: { value: '80' },
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save targets.',
    )
    expect(screen.getByLabelText('Target Recall (%)')).toHaveValue(80)
    expect(
      screen.getByRole('button', { name: 'Target Recall 90%' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('prevents duplicate submits and cancellation while saving', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const save = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    )
    render(
      <AnalyticsTargetEditor targets={targets} metric="recall" onSave={save} />,
    )
    await user.click(screen.getByRole('button', { name: 'Target Recall 90%' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Enter}{Escape}')
    expect(save).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Target Recall (%)')).toBeDisabled()
    resolve()
    await waitFor(() =>
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument(),
    )
  })
})
