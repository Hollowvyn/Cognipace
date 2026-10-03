import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
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
