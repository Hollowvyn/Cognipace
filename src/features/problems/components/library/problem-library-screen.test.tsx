import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Plus } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import { sendMessage } from '@/extension/messaging'
import {
  ProblemRowActionsBar,
  ProblemRowDetails,
  ProblemRowPracticeActions,
  type ProblemLibraryResponse,
} from '@/features/problems'
import {
  createProblemLibraryResponse,
  createSerializedProblem,
} from '@/testing/problem-fixtures'
import {
  createSerializedNormalizedPracticeState,
  createSerializedPracticeDetails,
} from '@/testing/practice-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { ProblemLibraryScreen } from './problem-library-screen'
import { ProblemBulkActionBar } from './problem-bulk-action-bar'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('ProblemLibraryScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the loading state', () => {
    vi.mocked(sendMessage).mockReturnValueOnce(new Promise(() => undefined))
    renderProblemLibrary()

    expect(screen.getByText('Loading Library…')).toBeVisible()
  })

  it('renders the error state with retry affordance', async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error('offline'))
    renderProblemLibrary()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load the Library.',
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  it('renders the empty state', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createProblemLibraryResponse({
        rows: [],
        summary: {
          totalCount: 0,
          filteredCount: 0,
          dueCount: 0,
          suspendedCount: 0,
        },
      }),
    )
    renderProblemLibrary()

    expect(
      await screen.findByText('No problems are tracked yet.'),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'New Problem' })).toBeVisible()
  })

  it('filters Library rows by search and metadata controls', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(libraryResponse)
    renderProblemLibrary()

    expect(await findProblemRow('Two Sum')).toBeVisible()
    expect(getProblemRow('Binary Search')).toBeVisible()
    expect(getProblemRow('01 Matrix')).toBeVisible()

    await user.type(screen.getByLabelText('Search problems'), 'matrix')
    expect(getProblemRow('01 Matrix')).toBeVisible()
    expect(queryProblemRow('Two Sum')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Search problems'))
    expect(getProblemRow('Two Sum')).toBeVisible()

    expect(screen.getByRole('button', { name: 'Expand filters' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /All difficulties/i }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand filters' }))
    expect(
      within(
        screen.getByRole('region', { name: 'Library filters' }),
      ).queryByText('3 problems'),
    ).not.toBeInTheDocument()
    await selectLibraryFacetOption(user, 'Difficulty', 'Medium')
    expect(getProblemRow('01 Matrix')).toBeVisible()
    expect(queryProblemRow('Binary Search')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))
    await selectLibraryFacetOption(user, 'Status', 'Due today')
    expect(getProblemRow('Two Sum')).toBeVisible()
    expect(queryProblemRow('Binary Search')).not.toBeInTheDocument()
    expect(queryProblemRow('01 Matrix')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))
    await selectLibraryTopicOption(user, 'Array')
    expect(getProblemRow('Two Sum')).toBeVisible()
    expect(queryProblemRow('Binary Search')).not.toBeInTheDocument()

    await selectLibraryFacetOption(user, 'Companies', 'Netflix')
    expect(screen.getByText('No problems match these filters.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))
    await selectLibraryFacetOption(user, 'Track', 'LeetCode 75')
    expect(getProblemRow('Two Sum')).toBeVisible()
    expect(queryProblemRow('Binary Search')).not.toBeInTheDocument()
  })

  it('allows multiple values in one facet filter', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(libraryResponse)
    renderProblemLibrary()

    expect(await findProblemRow('Two Sum')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Expand filters' }))
    await user.click(
      within(screen.getByRole('region', { name: 'Library filters' })).getByRole(
        'button',
        { name: /Difficulty/i },
      ),
    )
    await user.click(screen.getByRole('option', { name: 'Easy' }))
    await user.click(screen.getByRole('option', { name: 'Medium' }))

    expect(
      screen.getByRole('button', { name: /Difficulty 2 selected/i }),
    ).toBeVisible()
    expect(getProblemRow('Two Sum')).toBeVisible()
    expect(getProblemRow('Binary Search')).toBeVisible()
    expect(getProblemRow('01 Matrix')).toBeVisible()

    await user.click(screen.getByRole('option', { name: 'Easy' }))
    expect(getProblemRow('01 Matrix')).toBeVisible()
    expect(queryProblemRow('Two Sum')).not.toBeInTheDocument()
    expect(queryProblemRow('Binary Search')).not.toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: 'All difficulties' }))
    expect(getProblemRow('Two Sum')).toBeVisible()
    expect(getProblemRow('Binary Search')).toBeVisible()
  })

  it('renders the MVP table columns and row selection controls', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(libraryResponse)
    renderProblemLibrary()

    await findProblemRow('Two Sum')

    expect(screen.getByRole('columnheader', { name: 'Problem' })).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Difficulty' }),
    ).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Retention' }),
    ).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Last Review' }),
    ).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Next Review' }),
    ).toBeVisible()
    expect(screen.queryByRole('columnheader', { name: 'Tracks' })).toBeNull()

    await user.click(screen.getByRole('checkbox', { name: 'Select Two Sum' }))
    expect(
      screen.getByRole('checkbox', { name: 'Select Two Sum' }),
    ).toBeChecked()
    expect(screen.getByText('1 selected')).toBeVisible()
    expect(screen.queryByText('two-sum')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Two Sum' })).toHaveAttribute(
      'href',
      'https://leetcode.com/problems/two-sum/',
    )

    await user.click(
      screen.getByRole('checkbox', { name: 'Select current page' }),
    )
    expect(
      screen.getByRole('checkbox', { name: 'Select Binary Search' }),
    ).toBeChecked()
    expect(screen.getByText('3 selected')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByText('3 selected')).not.toBeInTheDocument()
  })

  it('hides premium and suspended rows from switch filters', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(libraryResponse)
    renderProblemLibrary()

    expect(await findProblemRow('01 Matrix')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Expand filters' }))
    await user.click(screen.getByRole('switch', { name: 'Hide premium' }))
    expect(queryProblemRow('01 Matrix')).not.toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: 'Hide premium' }))
    expect(getProblemRow('01 Matrix')).toBeVisible()

    await user.click(screen.getByRole('switch', { name: 'Hide suspended' }))
    expect(queryProblemRow('01 Matrix')).not.toBeInTheDocument()
  })

  it('filters canonical topics by effective membership and keeps other facets active', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(topicFilteringResponse)
    renderProblemLibrary()

    await findProblemRow('Graph traversal')
    await user.click(screen.getByRole('button', { name: 'Expand filters' }))

    await openTopics(user)
    await user.click(screen.getByRole('checkbox', { name: /^Tree$/ }))
    expect(getProblemRow('BST lookup')).toBeVisible()
    expect(getProblemRow('Tree traversal')).toBeVisible()
    expect(queryProblemRow('Graph traversal')).not.toBeInTheDocument()
    expect(screen.getByText('Filtered').parentElement).toHaveTextContent('2')
    expect(screen.getByText('Reviews Due').parentElement).toHaveTextContent('0')

    await user.click(screen.getByLabelText('Include subtopics'))
    expect(queryProblemRow('BST lookup')).not.toBeInTheDocument()
    expect(queryProblemRow('Tree traversal')).not.toBeInTheDocument()
    expect(screen.getByText('No problems match these filters.')).toBeVisible()

    await user.click(screen.getByLabelText('Include subtopics'))
    expect(getProblemRow('BST lookup')).toBeVisible()

    await user.type(
      screen.getByRole('searchbox', { name: 'Search topics' }),
      'DFS',
    )
    expect(
      screen.getByRole('checkbox', { name: 'Depth-First Search' }),
    ).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: /^Tree$/ })).toBeNull()
    expect(getProblemRow('BST lookup')).toBeVisible()
    await user.click(
      screen.getByRole('checkbox', { name: 'Depth-First Search' }),
    )
    await user.selectOptions(screen.getByLabelText('Topic matching'), 'all')
    expect(getProblemRow('Tree traversal')).toBeVisible()
    expect(queryProblemRow('BST lookup')).not.toBeInTheDocument()
    expect(queryProblemRow('Graph traversal')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Collapse filters' }))
    expect(getProblemRow('Tree traversal')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Expand filters' }))
    expect(
      screen.getByRole('button', { name: 'Topics: 2 selected' }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))
    expect(screen.getByLabelText('Topic matching')).toHaveValue('any')
    expect(screen.getByLabelText('Include subtopics')).toBeChecked()
    await openTopics(user)
    expect(
      screen.getByRole('searchbox', { name: 'Search topics' }),
    ).toHaveValue('')
    expect(getProblemRow('Graph traversal')).toBeVisible()
    expect(getProblemRow('Tree traversal')).toBeVisible()
    expect(getProblemRow('BST lookup')).toBeVisible()
    expect(getProblemRow('Untagged problem')).toBeVisible()
    expect(screen.getByText('Reviews Due').parentElement).toHaveTextContent('1')
  })

  it('does not filter by topic search text or unused topics and keeps global search separate', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(topicFilteringResponse)
    renderProblemLibrary()

    await findProblemRow('Graph traversal')
    await user.click(screen.getByRole('button', { name: 'Expand filters' }))
    await openTopics(user)
    await user.type(
      screen.getByRole('searchbox', { name: 'Search topics' }),
      'DFS',
    )
    expect(getProblemRow('Graph traversal')).toBeVisible()
    expect(getProblemRow('Tree traversal')).toBeVisible()
    expect(getProblemRow('BST lookup')).toBeVisible()
    expect(getProblemRow('Untagged problem')).toBeVisible()

    await user.clear(screen.getByRole('searchbox', { name: 'Search topics' }))
    await user.click(screen.getByRole('checkbox', { name: /^Heap$/ }))
    expect(screen.getByText('No problems match these filters.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))

    await user.type(screen.getByLabelText('Search problems'), 'DFS')
    expect(screen.getByText('No problems match these filters.')).toBeVisible()
  })

  it('combines topic matching with difficulty, status, premium, and suspended filters', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(topicFilteringResponse)
    renderProblemLibrary()

    await findProblemRow('Graph traversal')
    await user.click(screen.getByRole('button', { name: 'Expand filters' }))
    await openTopics(user)
    await user.click(screen.getByRole('checkbox', { name: /^Tree$/ }))
    await selectLibraryFacetOption(user, 'Difficulty', 'Easy')
    expect(getProblemRow('BST lookup')).toBeVisible()
    expect(queryProblemRow('Graph traversal')).not.toBeInTheDocument()

    await selectLibraryFacetOption(user, 'Status', 'Suspended')
    expect(getProblemRow('BST lookup')).toBeVisible()
    await user.click(screen.getByRole('switch', { name: 'Hide premium' }))
    expect(screen.getByText('No problems match these filters.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))
    await openTopics(user)
    await user.click(screen.getByRole('checkbox', { name: /^Tree$/ }))
    await selectLibraryFacetOption(user, 'Difficulty', 'Easy')
    await user.click(screen.getByRole('switch', { name: 'Hide suspended' }))
    expect(screen.getByText('No problems match these filters.')).toBeVisible()
  })

  it('sends only filtered selected rows to bulk and selected-row actions without clearing selection', async () => {
    const user = userEvent.setup()
    const onMakeTrack = vi.fn()
    vi.mocked(sendMessage).mockImplementation((method) =>
      method === 'problems.getLibrary'
        ? Promise.resolve(topicFilteringResponse)
        : Promise.resolve(undefined),
    )
    renderProblemLibrary({
      renderSelectedRowsAction: (selectedRows) => (
        <Button
          onClick={() => {
            onMakeTrack(selectedRows.map((row) => row.problem.slug))
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Make Track
        </Button>
      ),
    })

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Graph traversal' }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'Select BST lookup' }),
    )
    await user.click(screen.getByRole('button', { name: 'Expand filters' }))
    await openTopics(user)
    await user.click(screen.getByRole('checkbox', { name: /^Tree$/ }))

    const bulkBar = screen.getByRole('region', { name: 'Bulk actions' })
    expect(within(bulkBar).getByText('1 selected')).toBeVisible()
    expect(
      screen.getByRole('checkbox', { name: 'Select BST lookup' }),
    ).toBeChecked()
    await user.click(
      within(bulkBar).getByRole('button', { name: 'Make Track' }),
    )
    expect(onMakeTrack).toHaveBeenCalledWith(['bst-lookup'])

    await user.click(within(bulkBar).getByRole('button', { name: 'Resume' }))
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith('practice.setSuspended', {
        surface: 'dashboard',
        problemSlug: 'bst-lookup',
        suspended: false,
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))
    expect(
      screen.getByRole('checkbox', { name: 'Select Graph traversal' }),
    ).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Select BST lookup' }),
    ).toBeChecked()
    expect(screen.getByText('2 selected')).toBeVisible()
  })

  it('shows summary counts and expandable row details', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(libraryResponse)
    renderProblemLibrary()

    expect(
      await screen.findByRole('heading', { name: 'All Tracked Problems' }),
    ).toBeVisible()
    expect(screen.getByText('Total')).toBeVisible()
    expect(screen.getByText('Filtered')).toBeVisible()
    expect(screen.getByText('Reviews Due')).toBeVisible()
    expect(
      within(getProblemRow('Two Sum')).getByText('Due today'),
    ).toBeVisible()
    expect(screen.getAllByText('Suspended').length).toBeGreaterThan(0)

    await user.click(getProblemRow('Two Sum'))

    expect(screen.getByRole('heading', { name: 'Details' })).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Analytics and history' }),
    ).toBeVisible()
    expect(screen.getByText('Last reviewed')).toBeVisible()
    expect(screen.getByText('Retrievability')).toBeVisible()
    expect(screen.getByText('Reps')).toBeVisible()

    expect(screen.getByText('Tracks')).toBeVisible()
    expect(screen.getByText('LeetCode 75')).toBeVisible()

    await user.click(getProblemRow('Two Sum'))
    expect(
      screen.queryByRole('button', { name: 'Collapse Two Sum' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand Two Sum' }))
    expect(
      screen.getByRole('button', { name: 'Collapse Two Sum' }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Expand 01 Matrix' }))
    expect(screen.queryByText('Retrievability')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Collapse Two Sum' }),
    ).not.toBeInTheDocument()
  })

  it('uses New for unstarted rows while retaining Due today for due rows', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...libraryResponse,
      rows: libraryResponse.rows.map((row) =>
        row.problem.title === 'Binary Search'
          ? { ...row, status: 'not-started' as const }
          : row,
      ),
    })

    renderProblemLibrary()

    expect(await findProblemRow('Two Sum')).toBeVisible()
    expect(
      within(getProblemRow('Two Sum')).getByText('Due today'),
    ).toBeVisible()
    expect(
      within(getProblemRow('Binary Search')).getByText('New'),
    ).toBeVisible()
  })

  it('sorts rows and uses contextual empty date labels', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(libraryResponse)
    renderProblemLibrary()

    await findProblemRow('Two Sum')

    expect(getProblemTitleOrder()).toEqual([
      '01 Matrix',
      'Binary Search',
      'Two Sum',
    ])
    expect(screen.getAllByText('Unscheduled').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Never reviewed').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Problem' }))
    expect(getProblemTitleOrder()).toEqual([
      'Two Sum',
      'Binary Search',
      '01 Matrix',
    ])

    await user.click(screen.getByRole('button', { name: 'Difficulty' }))
    expect(getProblemTitleOrder()).toEqual([
      'Two Sum',
      'Binary Search',
      '01 Matrix',
    ])

    await user.click(screen.getByRole('button', { name: 'Difficulty' }))
    expect(getProblemTitleOrder()[0]).toBe('01 Matrix')

    await user.click(screen.getByRole('button', { name: 'Status' }))
    expect(getProblemTitleOrder()).toEqual([
      'Two Sum',
      'Binary Search',
      '01 Matrix',
    ])

    await user.click(screen.getByRole('button', { name: 'Next Review' }))
    expect(getProblemTitleOrder()[0]).toBe('Two Sum')

    await user.click(screen.getByRole('button', { name: 'Last Review' }))
    expect(getProblemTitleOrder()[0]).toBe('Two Sum')
  })

  it('shows row actions and runs practice-owned suspend and reset writes', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(libraryResponse)
      }

      return Promise.resolve(createSerializedPracticeDetails())
    })
    renderProblemLibrary()

    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )

    expect(screen.queryByRole('link', { name: 'Open LeetCode' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Two Sum' })).toHaveAttribute(
      'href',
      'https://leetcode.com/problems/two-sum/',
    )
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '#/library/problems/two-sum/edit',
    )
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reset Schedule' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Suspend' }))
    expect(sendMessage).toHaveBeenCalledWith('practice.setSuspended', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
      suspended: true,
    })

    await user.click(screen.getByRole('button', { name: 'Reset Schedule' }))
    const resetDialog = screen.getByRole('dialog', { name: 'Reset schedule?' })
    expect(resetDialog).toBeVisible()

    await user.click(
      within(resetDialog).getByRole('button', { name: 'Reset Schedule' }),
    )
    expect(sendMessage).toHaveBeenCalledWith('practice.resetSchedule', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
    })
  })

  it('shows resume for suspended rows', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(libraryResponse)
      }

      return Promise.resolve(createSerializedPracticeDetails())
    })
    renderProblemLibrary()

    await user.click(
      await screen.findByRole('button', { name: 'Expand 01 Matrix' }),
    )
    await user.click(screen.getByRole('button', { name: 'Resume' }))

    expect(sendMessage).toHaveBeenCalledWith('practice.setSuspended', {
      surface: 'dashboard',
      problemSlug: '01-matrix',
      suspended: false,
    })
  })

  it('disables delete while a practice row action is pending', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(libraryResponse)
      }

      if (method === 'practice.setSuspended') {
        return new Promise(() => undefined)
      }

      return Promise.resolve(createSerializedPracticeDetails())
    })
    renderProblemLibrary()

    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    const deleteButton = screen.getByRole('button', { name: 'Delete' })

    expect(deleteButton).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Suspend' }))

    await waitFor(() => expect(deleteButton).toBeDisabled())
  })

  it('renders reusable practice-only row details without delete', () => {
    const { wrapper } = createQueryTestHarness()
    const [row] = libraryResponse.rows

    if (!row) {
      throw new Error('Expected library response to include a problem row.')
    }

    render(
      <ProblemRowDetails
        actions={
          <ProblemRowActionsBar>
            <ProblemRowPracticeActions
              renderEditProblemAction={(problem) => (
                <Button asChild size="sm" variant="ghost">
                  <a href={`#/tracks/problems/${problem.slug}`}>Edit</a>
                </Button>
              )}
              row={row}
            />
          </ProblemRowActionsBar>
        }
        row={row}
      />,
      { wrapper },
    )

    expect(screen.getByRole('heading', { name: 'Details' })).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Analytics and history' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '#/tracks/problems/two-sum',
    )
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reset Schedule' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('deletes any library problem with confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(libraryResponse)
      }

      return Promise.resolve(undefined)
    })
    renderProblemLibrary()

    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete problem?' })
    expect(deleteDialog).toBeVisible()

    await user.click(
      within(deleteDialog).getByRole('button', { name: 'Delete Problem' }),
    )
    expect(sendMessage).toHaveBeenCalledWith('problems.deleteProblem', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
    })
  })

  it('closes problem delete confirmation when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(libraryResponse)
      }

      return Promise.resolve(undefined)
    })
    renderProblemLibrary()

    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const deleteDialog = screen.getByRole('dialog', { name: 'Delete problem?' })
    const backdrop = deleteDialog.parentElement

    expect(backdrop).not.toBeNull()
    await user.click(backdrop as HTMLElement)

    expect(
      screen.queryByRole('dialog', { name: 'Delete problem?' }),
    ).not.toBeInTheDocument()
    expect(sendMessage).not.toHaveBeenCalledWith('problems.deleteProblem', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
    })
  })

  it('runs bulk suspend, resume, reset, and delete actions for selected rows', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(libraryResponse)
      }

      if (method === 'problems.bulkDelete') {
        return Promise.resolve(undefined)
      }

      return Promise.resolve(createSerializedPracticeDetails())
    })
    renderProblemLibrary()

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Binary Search' }),
    )

    const bulkBar = screen.getByRole('region', { name: 'Bulk actions' })
    expect(within(bulkBar).getByText('2 selected')).toBeVisible()

    await user.click(within(bulkBar).getByRole('button', { name: 'Suspend' }))
    expect(sendMessage).toHaveBeenCalledWith('practice.setSuspended', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
      suspended: true,
    })
    expect(sendMessage).toHaveBeenCalledWith('practice.setSuspended', {
      surface: 'dashboard',
      problemSlug: 'binary-search',
      suspended: true,
    })

    await user.click(within(bulkBar).getByRole('button', { name: 'Resume' }))
    expect(sendMessage).toHaveBeenCalledWith('practice.setSuspended', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
      suspended: false,
    })
    expect(sendMessage).toHaveBeenCalledWith('practice.setSuspended', {
      surface: 'dashboard',
      problemSlug: 'binary-search',
      suspended: false,
    })

    await user.click(
      within(bulkBar).getByRole('button', { name: 'Reset Schedule' }),
    )
    const resetDialog = screen.getByRole('dialog', {
      name: 'Reset selected schedules?',
    })
    await user.click(
      within(resetDialog).getByRole('button', { name: 'Reset Schedule' }),
    )
    expect(sendMessage).toHaveBeenCalledWith('practice.resetSchedule', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
    })
    expect(sendMessage).toHaveBeenCalledWith('practice.resetSchedule', {
      surface: 'dashboard',
      problemSlug: 'binary-search',
    })

    await user.click(screen.getByRole('checkbox', { name: 'Select Two Sum' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Binary Search' }),
    )
    await user.click(screen.getByRole('checkbox', { name: 'Select 01 Matrix' }))
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole(
        'button',
        { name: 'Delete Problems' },
      ),
    )
    const deleteDialog = screen.getByRole('dialog', {
      name: 'Delete selected problems?',
    })
    await user.click(
      within(deleteDialog).getByRole('button', { name: 'Delete Problems' }),
    )

    expect(sendMessage).toHaveBeenCalledWith('problems.bulkDelete', {
      surface: 'dashboard',
      problemSlugs: ['two-sum', 'binary-search', '01-matrix'],
    })
    expect(await screen.findByText('Deleted selected problems.')).toBeVisible()
  })

  it('renders a selected-row action with selected rows in bulk-selection order', async () => {
    const user = userEvent.setup()
    const onMakeTrack = vi.fn()
    vi.mocked(sendMessage).mockResolvedValueOnce(libraryResponse)
    renderProblemLibrary({
      renderSelectedRowsAction: (selectedRows) => (
        <Button
          onClick={() => {
            onMakeTrack(selectedRows.map((row) => row.problem.slug))
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Make Track
        </Button>
      ),
    })

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Binary Search' }),
    )

    const bulkBar = screen.getByRole('region', { name: 'Bulk actions' })

    await user.click(
      within(bulkBar).getByRole('button', { name: 'Make Track' }),
    )

    expect(onMakeTrack).toHaveBeenCalledWith(['two-sum', 'binary-search'])
  })

  it('bulk-edits metadata with explicit enabled replacement fields', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(libraryResponse)
      }

      if (method === 'problems.bulkUpdateProblems') {
        return Promise.resolve(undefined)
      }

      return Promise.resolve(createSerializedPracticeDetails())
    })
    renderProblemLibrary()

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Binary Search' }),
    )
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole(
        'button',
        { name: 'Edit Metadata' },
      ),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Edit selected metadata',
    })

    expect(
      within(dialog).getByRole('button', { name: 'Update Problems' }),
    ).toBeDisabled()

    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Set difficulty' }),
    )
    await user.selectOptions(
      within(dialog).getByLabelText('Difficulty'),
      'hard',
    )
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Set premium' }),
    )
    await user.selectOptions(within(dialog).getByLabelText('Premium'), 'true')
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Replace topics' }),
    )
    await addDialogLabel(user, dialog, 'Topics', 'array')
    await addDialogLabel(user, dialog, 'Topics', 'Graph')
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Replace companies' }),
    )
    expect(
      within(dialog).getByText(
        'No companies selected; this will clear companies.',
      ),
    ).toBeVisible()
    await user.click(
      within(dialog).getByRole('button', { name: 'Update Problems' }),
    )

    expect(sendMessage).toHaveBeenCalledWith('problems.bulkUpdateProblems', {
      surface: 'dashboard',
      problemSlugs: ['two-sum', 'binary-search'],
      set: {
        difficulty: 'hard',
        isPremium: true,
        topicLabels: ['Array', 'Graph'],
        companyLabels: [],
      },
    })
    expect(await screen.findByText('Updated selected problems.')).toBeVisible()
  })

  it('bulk metadata omits disabled fields and clears enabled empty labels', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(libraryResponse)
      }

      if (method === 'problems.bulkUpdateProblems') {
        return Promise.resolve(undefined)
      }

      return Promise.resolve(createSerializedPracticeDetails())
    })
    renderProblemLibrary()

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
    )
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole(
        'button',
        { name: 'Edit Metadata' },
      ),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Edit selected metadata',
    })

    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Replace topics' }),
    )
    expect(
      within(dialog).getByText('No topics selected; this will clear topics.'),
    ).toBeVisible()
    await user.click(
      within(dialog).getByRole('button', { name: 'Update Problems' }),
    )

    expect(sendMessage).toHaveBeenCalledWith('problems.bulkUpdateProblems', {
      surface: 'dashboard',
      problemSlugs: ['two-sum'],
      set: {
        topicLabels: [],
      },
    })
  })

  it('closes bulk metadata dialog when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(libraryResponse)
      }

      return Promise.resolve(createSerializedPracticeDetails())
    })
    renderProblemLibrary()

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
    )
    await user.click(
      within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole(
        'button',
        { name: 'Edit Metadata' },
      ),
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Edit selected metadata',
    })
    const backdrop = dialog.parentElement

    expect(backdrop).not.toBeNull()
    await user.click(backdrop as HTMLElement)

    expect(
      screen.queryByRole('dialog', { name: 'Edit selected metadata' }),
    ).not.toBeInTheDocument()
    expect(sendMessage).not.toHaveBeenCalledWith(
      'problems.bulkUpdateProblems',
      expect.anything(),
    )
  })

  it('contains confirmation focus and returns focus to the row opener', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(libraryResponse)
    renderProblemLibrary()

    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    const opener = screen.getByRole('button', { name: 'Delete' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Delete problem?' })
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const confirm = within(dialog).getByRole('button', {
      name: 'Delete Problem',
    })

    expect(cancel).toHaveFocus()
    await user.tab()
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(dialog).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('keeps confirmation focus and cancellation locked while deleting', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) =>
      method === 'problems.deleteProblem'
        ? new Promise(() => undefined)
        : Promise.resolve(libraryResponse),
    )
    renderProblemLibrary()
    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete problem?' })
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete Problem' }),
    )

    await waitFor(() => expect(dialog).toHaveAttribute('aria-busy', 'true'))
    expect(dialog).toHaveFocus()
    await user.tab()
    expect(dialog).toHaveFocus()
    await user.keyboard('{Escape}')
    await user.click(dialog.parentElement as HTMLElement)
    expect(dialog).toBeVisible()
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled()
  })

  it('contains bulk metadata focus as enabled controls change and restores its opener', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(libraryResponse)
    renderProblemLibrary()
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
    )
    const opener = screen.getByRole('button', { name: 'Edit Metadata' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', {
      name: 'Edit selected metadata',
    })
    const first = within(dialog).getByRole('checkbox', {
      name: 'Set difficulty',
    })
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })

    expect(cancel).toHaveFocus()
    await user.tab()
    expect(first).toHaveFocus()
    await user.tab({ shift: true })
    expect(cancel).toHaveFocus()
    await user.click(first)
    const confirm = within(dialog).getByRole('button', {
      name: 'Update Problems',
    })
    confirm.focus()
    await user.tab()
    expect(first).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(dialog).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it.each([
    ['topics', 'Topics', 'topic'],
    ['companies', 'Companies', 'company'],
  ] as const)(
    'keeps bulk metadata focus inside after removing a focused %s pill',
    async (field, inputLabel, itemName) => {
      const user = userEvent.setup()
      vi.mocked(sendMessage).mockResolvedValue(libraryResponse)
      renderProblemLibrary()
      await user.click(
        await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
      )
      await user.click(screen.getByRole('button', { name: 'Edit Metadata' }))
      const dialog = screen.getByRole('dialog', {
        name: 'Edit selected metadata',
      })
      await user.click(
        within(dialog).getByRole('checkbox', { name: `Replace ${field}` }),
      )
      await user.type(
        within(dialog).getByLabelText(inputLabel),
        'Focus Label{Enter}',
      )
      const remove = within(dialog).getByRole('button', {
        name: `Remove ${itemName} Focus Label`,
      })
      remove.focus()
      await user.keyboard('[Space]')
      expect(remove).not.toBeInTheDocument()
      expect(within(dialog).getByLabelText(inputLabel)).toHaveFocus()
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
      await user.tab({ shift: true })
      expect(dialog.contains(document.activeElement)).toBe(true)
    },
  )

  it('locks bulk metadata controls, focus and dismissal while an update is pending', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) =>
      method === 'problems.bulkUpdateProblems'
        ? new Promise(() => undefined)
        : Promise.resolve(libraryResponse),
    )
    renderProblemLibrary()
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
    )
    await user.click(screen.getByRole('button', { name: 'Edit Metadata' }))
    const dialog = screen.getByRole('dialog', {
      name: 'Edit selected metadata',
    })
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Set difficulty' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Update Problems' }),
    )

    await waitFor(() => expect(dialog).toHaveAttribute('aria-busy', 'true'))
    expect(dialog).toHaveFocus()
    expect(
      within(dialog).getByRole('checkbox', { name: 'Set difficulty' }),
    ).toBeDisabled()
    await user.tab()
    expect(dialog).toHaveFocus()
    await user.keyboard('{Escape}')
    await user.click(dialog.parentElement as HTMLElement)
    expect(dialog).toBeVisible()
  })

  it.each([
    ['Delete', 'Delete problem?', 'Delete Problem', 'problems.deleteProblem'],
    [
      'Reset Schedule',
      'Reset schedule?',
      'Reset Schedule',
      'practice.resetSchedule',
    ],
  ] as const)(
    'shows %s row failures inside the active dialog with retry and clean cancellation',
    async (openerName, title, confirmName, method) => {
      const user = userEvent.setup()
      let reject = true
      vi.mocked(sendMessage).mockImplementation((requestedMethod) => {
        if (requestedMethod === method && reject) {
          return Promise.reject(new Error('Row mutation failed.'))
        }
        return Promise.resolve(libraryResponse)
      })
      renderProblemLibrary()
      await user.click(
        await screen.findByRole('button', { name: 'Expand Two Sum' }),
      )
      const opener = screen.getByRole('button', { name: openerName })
      await user.click(opener)
      let dialog = screen.getByRole('dialog', { name: title })
      await user.click(
        within(dialog).getByRole('button', { name: confirmName }),
      )
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Row mutation failed.',
      )
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(opener).toHaveFocus()
      await user.click(opener)
      dialog = screen.getByRole('dialog', { name: title })
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
      reject = false
      await user.click(
        within(dialog).getByRole('button', { name: confirmName }),
      )
      await waitFor(() => expect(dialog).not.toBeInTheDocument())
    },
  )

  it.each([
    ['Delete Problems', 'Delete selected problems?', 'problems.bulkDelete'],
    ['Reset Schedule', 'Reset selected schedules?', 'practice.resetSchedule'],
  ] as const)(
    'shows %s bulk failures inside confirmation and retries without losing selection',
    async (confirmName, title, method) => {
      const user = userEvent.setup()
      let reject = true
      vi.mocked(sendMessage).mockImplementation((requestedMethod) => {
        if (requestedMethod === method && reject) {
          return Promise.reject(new Error('Bulk mutation failed.'))
        }
        return Promise.resolve(libraryResponse)
      })
      renderProblemLibrary()
      await user.click(
        await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
      )
      const opener = screen.getByRole('button', { name: confirmName })
      await user.click(opener)
      const dialog = screen.getByRole('dialog', { name: title })
      await user.click(
        within(dialog).getByRole('button', { name: confirmName }),
      )
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Bulk mutation failed.',
      )
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(
        screen.getByRole('checkbox', { name: 'Select Two Sum' }),
      ).toBeChecked()
      reject = false
      await user.click(
        within(dialog).getByRole('button', { name: confirmName }),
      )
      await waitFor(() => expect(dialog).not.toBeInTheDocument())
      expect(
        screen.getByRole('checkbox', { name: 'Select Two Sum' }),
      ).not.toBeChecked()
    },
  )

  it('shows bulk metadata failure inside the dialog and retains edits for retry', async () => {
    const user = userEvent.setup()
    let reject = true
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.bulkUpdateProblems' && reject) {
        return Promise.reject(new Error('Metadata mutation failed.'))
      }
      return Promise.resolve(libraryResponse)
    })
    renderProblemLibrary()
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
    )
    await user.click(screen.getByRole('button', { name: 'Edit Metadata' }))
    const dialog = screen.getByRole('dialog', {
      name: 'Edit selected metadata',
    })
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Set difficulty' }),
    )
    await user.selectOptions(
      within(dialog).getByLabelText('Difficulty'),
      'hard',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Update Problems' }),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Metadata mutation failed.',
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(within(dialog).getByLabelText('Difficulty')).toHaveValue('hard')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled()
    reject = false
    await user.click(
      within(dialog).getByRole('button', { name: 'Update Problems' }),
    )
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(sendMessage).toHaveBeenCalledWith('problems.bulkUpdateProblems', {
      surface: 'dashboard',
      problemSlugs: ['two-sum'],
      set: { difficulty: 'hard' },
    })
  })

  it('keeps bulk dialog focus and edits when the visible selection changes', async () => {
    const user = userEvent.setup()
    const { wrapper } = createQueryTestHarness()
    const props = {
      onClearSelection: vi.fn(),
      options: libraryResponse.options,
      selectedRows: libraryResponse.rows.slice(0, 2),
    }
    vi.mocked(sendMessage).mockResolvedValue(undefined)
    const { rerender } = render(<ProblemBulkActionBar {...props} />, {
      wrapper,
    })
    const opener = screen.getByRole('button', { name: 'Edit Metadata' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', {
      name: 'Edit selected metadata',
    })
    const difficulty = within(dialog).getByRole('checkbox', {
      name: 'Set difficulty',
    })
    await user.click(difficulty)
    await user.selectOptions(
      within(dialog).getByLabelText('Difficulty'),
      'hard',
    )
    const confirm = within(dialog).getByRole('button', {
      name: 'Update Problems',
    })
    confirm.focus()

    rerender(
      <ProblemBulkActionBar
        {...props}
        selectedRows={props.selectedRows.slice(0, 1)}
      />,
    )
    expect(confirm).toHaveFocus()
    expect(dialog).toHaveTextContent('1 selected problems')
    expect(within(dialog).getByLabelText('Difficulty')).toHaveValue('hard')
    await user.tab()
    expect(difficulty).toHaveFocus()
    await user.click(confirm)
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(sendMessage).toHaveBeenCalledWith('problems.bulkUpdateProblems', {
      surface: 'dashboard',
      problemSlugs: ['two-sum'],
      set: { difficulty: 'hard' },
    })
    expect(opener).toHaveFocus()
  })

  it.each([
    [
      'Edit Metadata',
      'Edit selected metadata',
      'Update Problems',
      'problems.bulkUpdateProblems',
    ],
    [
      'Delete Problems',
      'Delete selected problems?',
      'Delete Problems',
      'problems.bulkDelete',
    ],
    [
      'Reset Schedule',
      'Reset selected schedules?',
      'Reset Schedule',
      'practice.resetSchedule',
    ],
  ] as const)(
    'clears bulk dialog state when selection becomes empty for %s',
    async (openerName, title, confirmName, method) => {
      const user = userEvent.setup()
      const { wrapper } = createQueryTestHarness()
      const props = {
        onClearSelection: vi.fn(),
        options: libraryResponse.options,
        selectedRows: libraryResponse.rows.slice(0, 1),
      }
      vi.mocked(sendMessage).mockImplementation((requestedMethod) =>
        requestedMethod === method
          ? Promise.reject(new Error('Bulk mutation failed.'))
          : Promise.resolve(undefined),
      )
      const { rerender } = render(<ProblemBulkActionBar {...props} />, {
        wrapper,
      })
      for (const failBeforeClearingSelection of [false, true]) {
        await user.click(screen.getByRole('button', { name: openerName }))
        const dialog = screen.getByRole('dialog', { name: title })
        if (openerName === 'Edit Metadata') {
          await user.click(
            within(dialog).getByRole('checkbox', { name: 'Set difficulty' }),
          )
          await user.selectOptions(
            within(dialog).getByLabelText('Difficulty'),
            'hard',
          )
        }
        if (failBeforeClearingSelection) {
          await user.click(
            within(dialog).getByRole('button', { name: confirmName }),
          )
          expect(await within(dialog).findByRole('alert')).toHaveTextContent(
            'Bulk mutation failed.',
          )
        }

        rerender(<ProblemBulkActionBar {...props} selectedRows={[]} />)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        rerender(<ProblemBulkActionBar {...props} />)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      }
      await user.click(screen.getByRole('button', { name: openerName }))
      const reopenedDialog = screen.getByRole('dialog', { name: title })
      expect(
        within(reopenedDialog).queryByRole('alert'),
      ).not.toBeInTheDocument()
      if (openerName === 'Edit Metadata') {
        expect(
          within(reopenedDialog).getByRole('checkbox', {
            name: 'Set difficulty',
          }),
        ).not.toBeChecked()
        expect(within(reopenedDialog).getByLabelText('Difficulty')).toHaveValue(
          'unknown',
        )
      }
    },
  )

  it('clears a cancelled bulk metadata error before reopening another bulk action', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) =>
      method === 'problems.bulkUpdateProblems'
        ? Promise.reject(new Error('Metadata mutation failed.'))
        : Promise.resolve(libraryResponse),
    )
    renderProblemLibrary()
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
    )
    const opener = screen.getByRole('button', { name: 'Edit Metadata' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', {
      name: 'Edit selected metadata',
    })
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Set difficulty' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Update Problems' }),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Metadata mutation failed.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Delete Problems' }))
    expect(
      within(screen.getByRole('dialog')).queryByRole('alert'),
    ).not.toBeInTheDocument()
  })
})

function renderProblemLibrary(
  props: Partial<Parameters<typeof ProblemLibraryScreen>[0]> = {},
) {
  const { wrapper } = createQueryTestHarness()

  return render(
    <ProblemLibraryScreen
      newProblemAction={
        <Button asChild size="sm">
          <a href="#/library/problems/new">
            <Plus aria-hidden="true" />
            New Problem
          </a>
        </Button>
      }
      renderEditProblemAction={(problem) => (
        <Button asChild size="sm" variant="ghost">
          <a href={`#/library/problems/${problem.slug}/edit`}>Edit</a>
        </Button>
      )}
      {...props}
    />,
    { wrapper },
  )
}

function getProblemRow(title: string) {
  return screen.getByRole('row', { name: new RegExp(title, 'i') })
}

function queryProblemRow(title: string) {
  return screen.queryByRole('row', { name: new RegExp(title, 'i') })
}

function findProblemRow(title: string) {
  return screen.findByRole('row', { name: new RegExp(title, 'i') })
}

async function selectLibraryFacetOption(
  user: ReturnType<typeof userEvent.setup>,
  facetLabel: string,
  optionLabel: string,
) {
  await user.click(
    within(screen.getByRole('region', { name: 'Library filters' })).getByRole(
      'button',
      { name: new RegExp(facetLabel) },
    ),
  )
  await user.click(screen.getByRole('option', { name: optionLabel }))
}

async function openTopics(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Topics:/ }))
}

async function selectLibraryTopicOption(
  user: ReturnType<typeof userEvent.setup>,
  topicName: string,
) {
  await openTopics(user)
  await user.click(
    screen.getByRole('checkbox', { name: new RegExp(`^${topicName}$`) }),
  )
}

function getProblemTitleOrder() {
  const titles: string[] = []

  for (const row of screen.getAllByRole('row').slice(1)) {
    if (row.textContent?.includes('01 Matrix')) {
      titles.push('01 Matrix')
      continue
    }

    if (row.textContent?.includes('Binary Search')) {
      titles.push('Binary Search')
      continue
    }

    if (row.textContent?.includes('Two Sum')) {
      titles.push('Two Sum')
    }
  }

  return titles
}

async function addDialogLabel(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  groupLabel: 'Companies' | 'Topics',
  value: string,
) {
  const input = within(dialog).getByLabelText(groupLabel)

  await user.clear(input)
  await user.type(input, `${value}{Enter}`)
}

const topicArray = { id: 'array', label: 'Array', parentTopics: [] }
const topicSearch = {
  id: 'binary-search',
  label: 'Binary Search',
  parentTopics: [],
}
const companyMeta = { id: 'meta', label: 'Meta' }
const companyNetflix = { id: 'netflix', label: 'Netflix' }
const trackMembership = {
  trackId: 'leetcode-75',
  trackSlug: 'leetcode-75',
  trackTitle: 'LeetCode 75',
  groupId: 'leetcode-75:arrays-hashing',
  groupTitle: 'Arrays and Hashing',
  groupPosition: 1,
  problemPosition: 1,
}

const libraryResponse: ProblemLibraryResponse = createProblemLibraryResponse({
  summary: {
    totalCount: 3,
    filteredCount: 3,
    dueCount: 1,
    suspendedCount: 1,
  },
  options: {
    topics: [
      { id: topicArray.id, label: topicArray.label, aliases: [] },
      { id: topicSearch.id, label: topicSearch.label, aliases: [] },
    ],
    companies: [companyMeta, companyNetflix],
  },
  rows: [
    {
      problem: createSerializedProblem({
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
      }),
      status: 'due',
      state: createSerializedNormalizedPracticeState({
        phase: 'review',
        isDue: true,
        isStarted: true,
        lastReviewedAt: '2026-01-01T10:00:00.000Z',
        dueAt: '2026-01-01T10:00:00.000Z',
        retrievability: 83,
        reviewCount: 3,
        stability: 2.5,
      }),
      nextReviewAt: '2026-01-01T10:00:00.000Z',
      lastReviewedAt: '2026-01-01T10:00:00.000Z',
      lastSolvedAt: '2026-01-01T10:00:00.000Z',
      topics: [topicArray],
      effectiveTopicIds: ['array'],
      companies: [companyMeta],
      trackMemberships: [trackMembership],
    },
    {
      problem: createSerializedProblem({
        slug: 'binary-search',
        title: 'Binary Search',
        difficulty: 'easy',
      }),
      status: 'scheduled',
      state: createSerializedNormalizedPracticeState({
        phase: 'review',
        isStarted: true,
        dueAt: '2026-01-04T10:00:00.000Z',
      }),
      nextReviewAt: '2026-01-04T10:00:00.000Z',
      lastReviewedAt: null,
      lastSolvedAt: null,
      topics: [topicSearch],
      effectiveTopicIds: ['binary-search'],
      companies: [companyNetflix],
      trackMemberships: [],
    },
    {
      problem: createSerializedProblem({
        slug: '01-matrix',
        title: '01 Matrix',
        difficulty: 'medium',
        isPremium: true,
      }),
      status: 'suspended',
      state: createSerializedNormalizedPracticeState({
        isSuspended: true,
      }),
      nextReviewAt: null,
      lastReviewedAt: null,
      lastSolvedAt: null,
      topics: [],
      effectiveTopicIds: [],
      companies: [],
      trackMemberships: [],
    },
  ],
})

const topicFilteringResponse: ProblemLibraryResponse =
  createProblemLibraryResponse({
    summary: {
      totalCount: 4,
      filteredCount: 4,
      dueCount: 1,
      suspendedCount: 1,
    },
    options: {
      topics: [
        {
          id: 'depth-first-search',
          label: 'Depth-First Search',
          aliases: ['DFS'],
        },
        { id: 'graph-theory', label: 'Graph Theory', aliases: ['Graph'] },
        { id: 'binary-tree', label: 'Binary Tree', aliases: [] },
        { id: 'tree', label: 'Tree', aliases: ['Trees'] },
        {
          id: 'binary-search-tree',
          label: 'Binary Search Tree',
          aliases: ['BST'],
        },
        { id: 'heap', label: 'Heap', aliases: [] },
      ],
      companies: [],
    },
    rows: [
      createTopicFilteringRow({
        slug: 'graph-traversal',
        title: 'Graph traversal',
        difficulty: 'hard',
        status: 'overdue',
        topics: [
          {
            id: 'depth-first-search',
            label: 'Depth-First Search',
            parentTopics: [],
          },
          { id: 'graph-theory', label: 'Graph Theory', parentTopics: [] },
        ],
        effectiveTopicIds: ['depth-first-search', 'graph-theory'],
      }),
      createTopicFilteringRow({
        slug: 'tree-traversal',
        title: 'Tree traversal',
        difficulty: 'medium',
        status: 'scheduled',
        topics: [
          {
            id: 'depth-first-search',
            label: 'Depth-First Search',
            parentTopics: [],
          },
          {
            id: 'binary-tree',
            label: 'Binary Tree',
            parentTopics: [{ id: 'tree', label: 'Tree' }],
          },
        ],
        effectiveTopicIds: ['depth-first-search', 'binary-tree', 'tree'],
      }),
      createTopicFilteringRow({
        slug: 'bst-lookup',
        title: 'BST lookup',
        difficulty: 'easy',
        status: 'suspended',
        isPremium: true,
        topics: [
          {
            id: 'binary-search-tree',
            label: 'Binary Search Tree',
            parentTopics: [{ id: 'binary-tree', label: 'Binary Tree' }],
          },
        ],
        effectiveTopicIds: ['binary-search-tree', 'binary-tree', 'tree'],
      }),
      createTopicFilteringRow({
        slug: 'untagged-problem',
        title: 'Untagged problem',
        difficulty: 'easy',
        status: 'not-started',
        topics: [],
        effectiveTopicIds: [],
      }),
    ],
  })

function createTopicFilteringRow({
  slug,
  title,
  difficulty,
  status,
  topics,
  effectiveTopicIds,
  isPremium = false,
}: {
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  status: 'due' | 'overdue' | 'scheduled' | 'suspended' | 'not-started'
  topics: ProblemLibraryResponse['rows'][number]['topics']
  effectiveTopicIds: string[]
  isPremium?: boolean
}): ProblemLibraryResponse['rows'][number] {
  return {
    problem: createSerializedProblem({ slug, title, difficulty, isPremium }),
    status,
    state: createSerializedNormalizedPracticeState({
      isSuspended: status === 'suspended',
      isDue: status === 'due' || status === 'overdue',
      isOverdue: status === 'overdue',
      overdueDays: status === 'overdue' ? 1 : 0,
      isStarted: status !== 'not-started',
      dueAt:
        status === 'due' || status === 'overdue'
          ? '2026-09-25T10:00:00.000Z'
          : null,
    }),
    nextReviewAt:
      status === 'due' || status === 'overdue'
        ? '2026-09-25T10:00:00.000Z'
        : null,
    lastReviewedAt: null,
    lastSolvedAt: null,
    topics,
    effectiveTopicIds,
    companies: [],
    trackMemberships: [],
  }
}
