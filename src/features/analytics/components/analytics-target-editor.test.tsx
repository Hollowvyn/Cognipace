import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { AnalyticsTargets } from '@/features/settings/domain'

import { AnalyticsTargetEditor } from './analytics-target-editor'

const targets = { targetRecall: 0.9, targetReviewSuccess: 0.9 }

describe('Analytics target editor', () => {
  it.each(['recall', 'reviewSuccess'] as const)(
    'opens both fields and focuses the %s goal',
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
      expect(
        screen.getByRole('spinbutton', { name: 'Target Recall (%)' }),
      ).toHaveValue(90)
      expect(
        screen.getByRole('spinbutton', { name: 'Target Review Success (%)' }),
      ).toHaveValue(90)
      expect(
        screen.getByRole('spinbutton', { name: `${label} (%)` }),
      ).toHaveFocus()
      expect(screen.getByText('Hard + Good + Easy')).toBeVisible()
      expect(screen.getByText('Good + Easy')).toBeVisible()
    },
  )

  it('rejects an inverted goal pair and never changes the other input silently', async () => {
    const user = userEvent.setup()
    const save = vi.fn()
    render(
      <AnalyticsTargetEditor targets={targets} metric="recall" onSave={save} />,
    )
    await user.click(screen.getByRole('button', { name: 'Target Recall 90%' }))
    fireEvent.change(screen.getByLabelText('Target Recall (%)'), {
      target: { value: '95' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Review Success target must be at least your Recall target',
    )
    expect(screen.getByLabelText('Target Review Success (%)')).toHaveValue(90)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(save).not.toHaveBeenCalled()
  })

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

  it('saves the pair with Enter and returns focus to the updated caption', async () => {
    const user = userEvent.setup()
    const save = vi.fn<(next: AnalyticsTargets) => Promise<void>>(
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
            setSaved(next)
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
      targetReviewSuccess: 0.9,
    })
    await waitFor(() =>
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'Target Recall 80%' }),
    ).toHaveFocus()
  })

  it.each([
    [0, 0],
    [0, 100],
    [100, 100],
  ])('saves valid boundary goals %i/%i', async (recall, success) => {
    const user = userEvent.setup()
    const save = vi.fn().mockResolvedValue(undefined)
    render(
      <AnalyticsTargetEditor targets={targets} metric="recall" onSave={save} />,
    )
    await user.click(screen.getByRole('button', { name: 'Target Recall 90%' }))
    fireEvent.change(screen.getByLabelText('Target Recall (%)'), {
      target: { value: String(recall) },
    })
    fireEvent.change(screen.getByLabelText('Target Review Success (%)'), {
      target: { value: String(success) },
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(save).toHaveBeenCalledExactlyOnceWith({
      targetRecall: recall / 100,
      targetReviewSuccess: success / 100,
    })
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
