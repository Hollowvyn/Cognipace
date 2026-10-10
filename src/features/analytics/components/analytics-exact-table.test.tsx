import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AnalyticsCardPager } from './analytics-card-controls'
import {
  AnalyticsExactTable,
  type AnalyticsExactField,
} from './analytics-exact-table'

interface Row {
  id: string
  title: string
  correct: number | null
  predicted?: number
  samples: number
  duration: number
}
const rows: Row[] = Array.from({ length: 7 }, (_, index) => ({
  id: String(index),
  title:
    index === 0
      ? 'A complete long problem title that must wrap without truncating any original words or evidence'
      : `Period ${index + 1}`,
  correct: index === 0 ? 0 : null,
  samples: index + 1,
  duration: 20 + index,
}))
const fields: AnalyticsExactField<Row>[] = [
  {
    key: 'correct',
    label: 'Observed correctness',
    value: (row) => row.correct,
  },
  {
    key: 'predicted',
    label: 'FSRS estimated recall',
    value: (row) => row.predicted,
  },
  { key: 'samples', label: 'Eligible samples', value: (row) => row.samples },
  {
    key: 'duration',
    label: 'Recorded duration in seconds',
    value: (row) => row.duration,
  },
]
const groups = [
  {
    key: 'recall',
    label: 'Recall evidence',
    fieldKeys: ['correct', 'predicted'],
  },
  { key: 'volume', label: 'Sample counts', fieldKeys: ['samples'] },
]
const props = {
  label: 'Recall exact values',
  rowLabel: (row: Row) => row.title,
  rowKey: (row: Row) => row.id,
  rowLabelHeading: 'Period or problem',
  fields,
  groups,
  width: 320,
  pageSize: 3,
}

describe('AnalyticsExactTable', () => {
  it('stacks a complete long topic label and keeps final fields reachable at 222px', async () => {
    const user = userEvent.setup()
    const title =
      'A deliberately long topic name covering advanced graph traversal and state compression techniques'
    const topicFields: AnalyticsExactField<Row>[] = [
      { key: 'samples', label: 'Valid ratings', value: (row) => row.samples },
      { key: 'correct', label: 'Good + Easy', value: (row) => row.correct },
      { key: 'target', label: 'Raw target Review Success', value: () => '90%' },
    ]
    const topicGroups = [
      {
        key: 'ratings',
        label: 'Ratings',
        fieldKeys: topicFields.map((field) => field.key),
      },
    ]
    const { container, rerender } = render(
      <AnalyticsExactTable
        {...props}
        width={222}
        rows={[{ ...rows[0]!, title }]}
        page={0}
        pageSize={1}
        groups={topicGroups}
        fields={topicFields}
        onPageChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('table')).toHaveAttribute('data-layout', 'stacked')
    const next = screen.getByRole('button', {
      name: 'Next Recall exact values fields',
    })
    for (const [index, field] of topicFields.entries()) {
      expect(screen.getByRole('rowheader', { name: title })).toBeVisible()
      expect(
        screen.getByRole('columnheader', { name: field.label }),
      ).toBeVisible()
      expect(screen.getAllByRole('columnheader')).toHaveLength(2)
      if (index < topicFields.length - 1) {
        next.focus()
        await user.keyboard('{Enter}')
      }
    }
    expect(screen.getByRole('cell', { name: '90%' })).toBeVisible()
    expect(next).toBeDisabled()
    expect(container.innerHTML).not.toMatch(
      /overflow|truncate|line-clamp|ellipsis/,
    )
    rerender(
      <AnalyticsExactTable
        {...props}
        width={400}
        rows={[{ ...rows[0]!, title }]}
        page={0}
        pageSize={1}
        groups={topicGroups}
        fields={topicFields}
        onPageChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('table')).toHaveAttribute('data-layout', 'columns')
  })

  it('preserves complete row labels, measured zero and unavailable values', () => {
    const { container } = render(
      <AnalyticsExactTable
        {...props}
        rows={rows}
        page={0}
        onPageChange={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('rowheader', { name: rows[0]!.title }),
    ).toBeVisible()
    expect(screen.getByRole('cell', { name: '0' })).toBeVisible()
    expect(screen.getAllByRole('cell', { name: '—' })).toHaveLength(2)
    expect(screen.getAllByRole('rowheader')).toHaveLength(3)
    expect(
      container.querySelector('.cp-analytics-card-pager'),
    ).not.toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(
      /overflow|truncate|line-clamp|ellipsis/,
    )
  })

  it('keeps every field reachable with native keyboard group navigation at narrow widths', async () => {
    const user = userEvent.setup()
    render(
      <AnalyticsExactTable
        {...props}
        rows={rows}
        page={0}
        onPageChange={vi.fn()}
      />,
    )
    const navigation = screen.getByRole('navigation', {
      name: 'Recall exact values fields',
    })
    expect(navigation).toHaveTextContent('1 of 4')
    expect(
      screen.getByRole('button', {
        name: 'Previous Recall exact values fields',
      }),
    ).toBeDisabled()
    const next = screen.getByRole('button', {
      name: 'Next Recall exact values fields',
    })
    next.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('columnheader', { name: fields[1]!.label }),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', {
        name: 'Previous Recall exact values fields',
      }),
    )
    for (const [index, field] of fields.entries()) {
      expect(screen.getAllByRole('columnheader')).toHaveLength(2)
      expect(
        screen.getByRole('columnheader', { name: field.label }),
      ).toBeVisible()
      expect(navigation).toHaveTextContent(field.label)
      if (index < fields.length - 1) await user.click(next)
    }
    expect(next).toBeDisabled()
  })

  it('allows every row through a controlled pager rendered outside the table', async () => {
    const user = userEvent.setup()
    function Table() {
      const [page, setPage] = useState(0)
      return (
        <>
          <AnalyticsExactTable
            {...props}
            rows={rows}
            page={page}
            onPageChange={setPage}
          />
          <footer>
            <AnalyticsCardPager
              label="Recall rows"
              page={page}
              pageSize={3}
              rowCount={rows.length}
              onPageChange={setPage}
            />
          </footer>
        </>
      )
    }
    render(<Table />)
    for (const first of [0, 3, 6]) {
      for (const row of rows.slice(first, first + 3))
        expect(screen.getByRole('rowheader', { name: row.title })).toBeVisible()
      if (first < 6)
        await user.click(
          screen.getByRole('button', { name: 'Next Recall rows' }),
        )
    }
    expect(
      screen
        .getByRole('button', { name: 'Next Recall rows' })
        .closest('footer'),
    ).toBeInTheDocument()
  })

  it('clamps invalid pages and explicitly normalizes data, reset-key and width changes', () => {
    const onPageChange = vi.fn()
    const { rerender } = render(
      <AnalyticsExactTable
        {...props}
        rows={rows}
        page={99}
        onPageChange={onPageChange}
        resetKey="30"
      />,
    )
    expect(screen.getByRole('rowheader', { name: 'Period 7' })).toBeVisible()
    expect(onPageChange).toHaveBeenLastCalledWith(2)
    onPageChange.mockClear()
    rerender(
      <AnalyticsExactTable
        {...props}
        rows={rows.slice(0, 2)}
        page={2}
        onPageChange={onPageChange}
        resetKey="30"
      />,
    )
    expect(onPageChange).toHaveBeenLastCalledWith(0)
    expect(screen.getAllByRole('rowheader')).toHaveLength(2)
    rerender(
      <AnalyticsExactTable
        {...props}
        rows={rows}
        page={2}
        onPageChange={onPageChange}
        resetKey="90"
      />,
    )
    expect(onPageChange).toHaveBeenLastCalledWith(0)
    onPageChange.mockClear()
    rerender(
      <AnalyticsExactTable
        {...props}
        width={500}
        rows={rows}
        page={1}
        pageSize={4}
        onPageChange={onPageChange}
        resetKey="90"
      />,
    )
    expect(onPageChange).toHaveBeenLastCalledWith(0)
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
  })

  it('renders a compact unavailable state without discarding the field definitions', () => {
    render(
      <AnalyticsExactTable
        {...props}
        rows={[]}
        page={0}
        onPageChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'No exact values available.',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('preserves controlled navigation when equivalent rows are derived again', () => {
    const onPageChange = vi.fn()
    const { rerender } = render(
      <AnalyticsExactTable
        {...props}
        rows={rows}
        page={1}
        onPageChange={onPageChange}
        resetKey="30"
      />,
    )
    rerender(
      <AnalyticsExactTable
        {...props}
        rows={rows.map((row) => ({ ...row }))}
        page={1}
        onPageChange={onPageChange}
        resetKey="30"
      />,
    )
    expect(screen.getByRole('rowheader', { name: 'Period 4' })).toBeVisible()
    expect(onPageChange).not.toHaveBeenCalled()
  })
})
