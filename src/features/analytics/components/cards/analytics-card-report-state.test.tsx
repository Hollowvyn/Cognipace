import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { SerializedAnalyticsSummary } from '../../api/analytics-contracts'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import { PerformanceCard } from './performance-card'
import { TimeTargetCard } from './time-target-card'
import { PracticeCard } from './practice-card'
import { RecallCard } from './recall-card'
import { MemoryStrengthCard } from './memory-strength-card'
import { RetentionCard } from './retention-card'

function card(name: string, data: SerializedAnalyticsSummary) {
  const targets = data.views.problemSolving.targets
  switch (name) {
    case 'Performance':
      return (
        <PerformanceCard
          view={data.views.problemSolving}
          timeFrame={data.timeFrame}
        />
      )
    case 'Time':
      return (
        <TimeTargetCard
          view={data.views.problemSolving}
          timeFrame={data.timeFrame}
        />
      )
    case 'Practice':
      return (
        <PracticeCard
          view={data.views.practiceRhythm}
          ratingsView={data.views.ratingsMix}
          timeFrame={data.timeFrame}
          targets={targets}
        />
      )
    case 'Recall':
      return (
        <RecallCard
          view={data.views.observedRecallVsFsrs}
          timeFrame={data.timeFrame}
          targets={targets}
        />
      )
    case 'Memory strength':
      return (
        <MemoryStrengthCard
          view={data.views.memoryStrength}
          timeFrame={data.timeFrame}
        />
      )
    default:
      return (
        <RetentionCard
          view={data.views.retentionMap}
          timeFrame={data.timeFrame}
        />
      )
  }
}

describe('hidden Analytics detail pages', () => {
  it.each([
    ['Performance', 'Performance', 'method', 'Performance method pages'],
    ['Time', 'Time', 'method', 'Time method pages'],
    ['Practice', 'Practice', 'method', 'Practice method pages'],
    ['Recall', 'Recall', 'method', 'Recall method pages'],
    [
      'Memory strength',
      'Memory strength',
      'method',
      'Memory strength method pages',
    ],
    ['Retention', 'Retention Map', 'method', 'Retention method pages'],
    ['Retention', 'Retention Map', 'summary', 'Retention summary pages'],
  ])(
    'retains equivalent %s %s %s pages and resets changed report context',
    async (name, controls, section, pager) => {
      const user = userEvent.setup()
      const data = createSerializedAnalyticsSummary()
      const { rerender } = render(card(name, data))
      await user.click(
        screen.getByRole('button', { name: `${controls} Details` }),
      )
      await user.selectOptions(
        screen.getByLabelText(`${controls} detail section`),
        section,
      )
      await user.click(screen.getByRole('button', { name: `Next ${pager}` }))
      expect(screen.getByRole('navigation', { name: pager })).toHaveTextContent(
        '2–2 of',
      )
      await user.click(
        screen.getByRole('button', { name: `${controls} Overview` }),
      )
      rerender(card(name, structuredClone(data)))
      await user.click(
        screen.getByRole('button', { name: `${controls} Details` }),
      )
      expect(screen.getByRole('navigation', { name: pager })).toHaveTextContent(
        '2–2 of',
      )
      await user.click(
        screen.getByRole('button', { name: `${controls} Overview` }),
      )
      rerender(
        card(name, {
          ...data,
          timeFrame: { ...data.timeFrame, asOf: '2026-08-23T12:00:00.000Z' },
        }),
      )
      await user.click(
        screen.getByRole('button', { name: `${controls} Details` }),
      )
      const navigation = screen.getByRole('navigation', { name: pager })
      expect(navigation).toHaveTextContent('1–1 of')
      expect(
        within(navigation).getByRole('button', { name: `Previous ${pager}` }),
      ).toBeDisabled()
    },
  )
})
