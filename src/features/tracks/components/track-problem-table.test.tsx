import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createSerializedProblem } from '@/testing/problem-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'
import {
  createSerializedActiveTrack,
  createSerializedTrack,
  createSerializedTrackGroup,
  createTrackProblemRow,
} from '@/testing/track-fixtures'

import { ActiveTrackWorkspace } from './active-track-workspace'
import { TrackProblemTable } from './track-problem-table'

describe('TrackProblemTable pagination', () => {
  it('pages ordered problems in fixed batches of 15 with correct navigation boundaries', async () => {
    const user = userEvent.setup()
    renderTable(createRows(31).reverse())

    expect(problemLinks()).toHaveLength(15)
    expect(problemLinks()[0]).toHaveTextContent('Problem 1')
    expect(problemLinks()[14]).toHaveTextContent('Problem 15')
    expect(screen.getByText('Rows per page: 15')).toBeVisible()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('1-15 of 31')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(problemLinks()).toHaveLength(15)
    expect(problemLinks()[0]).toHaveTextContent('Problem 16')
    expect(screen.getByText('16-30 of 31')).toBeVisible()
    expect(within(screen.getByRole('table')).getByText('16')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(problemLinks()).toHaveLength(1)
    expect(problemLinks()[0]).toHaveTextContent('Problem 31')
    expect(screen.getByText('31-31 of 31')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByText('16-30 of 31')).toBeVisible()
  })

  it.each([1, 15])('disables both controls for a %i-problem group', (count) => {
    renderTable(createRows(count))
    expect(problemLinks()).toHaveLength(count)
    expect(screen.getByText(`1-${count} of ${count}`)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('keeps the empty-group state without pagination', () => {
    renderTable([])
    expect(screen.getByText('No problems in this group.')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Next page' }),
    ).not.toBeInTheDocument()
  })

  it('keeps expansion attached to its problem without consuming a page slot', async () => {
    const user = userEvent.setup()
    renderTable(createRows(16))
    await user.click(screen.getByRole('button', { name: 'Expand Problem 15' }))
    expect(problemLinks()).toHaveLength(15)
    expect(
      screen.getByRole('button', { name: 'Collapse Problem 15' }),
    ).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(
      screen.queryByRole('button', { name: 'Collapse Problem 15' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand Problem 16' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(
      screen.getByRole('button', { name: 'Collapse Problem 15' }),
    ).toBeVisible()
  })

  it('preserves the current page across refreshed rows and clamps it after removal', async () => {
    const user = userEvent.setup()
    const view = renderTable(createRows(31))
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await user.click(screen.getByRole('button', { name: 'Next page' }))

    view.rerender(tableElement(createRows(31)))
    expect(screen.getByText('31-31 of 31')).toBeVisible()

    view.rerender(tableElement(createRows(30)))
    expect(screen.getByText('16-30 of 30')).toBeVisible()
    expect(problemLinks()).toHaveLength(15)
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()

    view.rerender(tableElement(createRows(31)))
    expect(screen.getByText('16-30 of 31')).toBeVisible()

    view.rerender(tableElement([]))
    expect(screen.getByText('No problems in this group.')).toBeVisible()
    view.rerender(tableElement(createRows(31)))
    expect(screen.getByText('1-15 of 31')).toBeVisible()
  })
})

describe('ActiveTrackWorkspace pagination', () => {
  it.each(['group', 'track'] as const)(
    'resets the page when the active %s changes',
    async (change) => {
      const user = userEvent.setup()
      const { wrapper } = createQueryTestHarness()
      const view = render(workspaceElement('leetcode-75', 'arrays'), {
        wrapper,
      })
      await user.click(screen.getByRole('button', { name: 'Next page' }))
      expect(screen.getByText('16-16 of 16')).toBeVisible()
      await user.click(
        screen.getByRole('button', { name: 'Expand Problem 16' }),
      )

      view.rerender(
        workspaceElement(
          change === 'track' ? 'other-track' : 'leetcode-75',
          change === 'group' ? 'trees' : 'arrays',
        ),
      )

      expect(screen.getByText('1-15 of 16')).toBeVisible()
      expect(problemLinks()).toHaveLength(15)
      expect(
        screen.getByRole('button', { name: 'Previous page' }),
      ).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Next page' }))
      expect(
        screen.getByRole('button', { name: 'Expand Problem 16' }),
      ).toHaveAttribute('aria-expanded', 'false')
    },
  )
})

function workspaceElement(trackId: string, groupId: string) {
  const group = createSerializedTrackGroup({ id: groupId, trackId })
  const track = createSerializedActiveTrack({
    track: createSerializedTrack({ id: trackId }),
    activeGroup: group,
    nextProblem: null,
  })!
  const rows = createRows(16).map((row) => ({
    ...row,
    membership: { ...row.membership, trackId, groupId },
  }))

  return (
    <ActiveTrackWorkspace
      activeTrack={track}
      dueCount={0}
      generatedAt="2026-10-02T04:00:00.000Z"
      groups={[group]}
      renderEditProblemAction={() => null}
      renderEditTrackAction={() => null}
      rows={rows}
    />
  )
}

function createRows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const row = createTrackProblemRow()
    return createTrackProblemRow({
      problem: createSerializedProblem({
        slug: `problem-${index + 1}`,
        title: `Problem ${index + 1}`,
      }),
      membership: { ...row.membership, problemPosition: index + 1 },
    })
  })
}

function tableElement(rows: ReturnType<typeof createRows>) {
  return <TrackProblemTable renderEditProblemAction={() => null} rows={rows} />
}

function renderTable(rows: ReturnType<typeof createRows>) {
  const { wrapper } = createQueryTestHarness()
  return render(tableElement(rows), { wrapper })
}

function problemLinks() {
  return within(screen.getByRole('table')).getAllByRole('link', {
    name: /^Problem \d+$/,
  })
}
