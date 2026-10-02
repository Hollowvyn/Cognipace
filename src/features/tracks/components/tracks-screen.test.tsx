import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pencil, Plus } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { sendMessage } from '@/extension/messaging'
import type { SerializedProblem } from '@/features/problems'
import {
  createSerializedTrack,
  createSerializedTrackGroup,
  createTrackProblemRow,
  createTrackWorkspaceResponse,
} from '@/testing/track-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { OtherTracksAccordion } from './other-tracks-accordion'
import { TracksScreen } from './tracks-screen'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('TracksScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the loading state', () => {
    vi.mocked(sendMessage).mockReturnValueOnce(new Promise(() => undefined))
    renderTracksScreen()

    expect(screen.getByText('Loading tracks…')).toBeVisible()
  })

  it('renders the error state with Retry', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(createTrackWorkspaceResponse())

    renderTracksScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load tracks.',
    )

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('renders the no tracks empty state', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createTrackWorkspaceResponse({
        activeTrack: null,
        activeTrackGroups: [],
        activeTrackRows: [],
        tracks: [],
      }),
    )

    renderTracksScreen()

    expect(await screen.findByText('No tracks yet.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'New Track' })).toHaveAttribute(
      'href',
      '#/tracks/new',
    )
  })

  it('renders all tracks expanded when no active track is selected', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createTrackWorkspaceResponse({
        activeTrack: null,
        activeTrackGroups: [],
        activeTrackRows: [],
        tracks: [
          {
            track: createSerializedTrack({
              id: 'grind-75',
              slug: 'grind-75',
              title: 'Grind 75',
            }),
            progress: {
              completedCount: 10,
              totalCount: 75,
              percent: 13,
            },
          },
        ],
      }),
    )

    renderTracksScreen()

    expect(await screen.findByText('No active track selected.')).toBeVisible()
    expect(screen.getByRole('region', { name: 'All tracks' })).toBeVisible()
    expect(screen.getByText('All tracks')).toBeVisible()
    expect(screen.getByText('Grind 75')).toBeVisible()

    const allTracksActions = screen.getByLabelText('All tracks actions')

    expect(
      within(allTracksActions).getByRole('link', { name: 'New Track' }),
    ).toHaveAttribute('href', '#/tracks/new')
    expect(
      within(allTracksActions).getByRole('button', {
        name: 'All tracks shown',
      }),
    ).toBeDisabled()
  })

  it('renders the active workspace title, summaries, metrics, groups, and active rows', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(twoGroupWorkspace)
    renderTracksScreen()

    expect(
      await screen.findByRole('heading', { name: 'LeetCode 75' }),
    ).toBeVisible()
    expect(screen.getByText('Core interview practice.')).toBeVisible()
    const progressSummary = screen.getByLabelText('Track progress summary')
    expect(within(progressSummary).getByText('Progress')).toBeVisible()
    expect(within(progressSummary).getByText('1 of 3')).toBeVisible()
    expect(within(progressSummary).getByText('2 problems left')).toBeVisible()
    expect(within(progressSummary).getByLabelText('33% complete')).toBeVisible()
    expect(screen.queryByLabelText('Progress metric')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Track target summary'),
    ).not.toBeInTheDocument()
    const dueMetric = screen.getByLabelText('Reviews due metric')
    expect(within(dueMetric).getByText('Reviews Due')).toBeVisible()
    expect(within(dueMetric).queryByText('Due Reviews')).not.toBeInTheDocument()
    expect(dueMetric).toHaveTextContent('2')
    expect(screen.getByText('Next')).toBeVisible()
    expect(screen.getAllByRole('link', { name: 'Two Sum' })[0]).toHaveAttribute(
      'href',
      'https://leetcode.com/problems/two-sum/',
    )
    expect(
      screen.queryByRole('link', { name: 'Open Next' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('tab', {
        name: 'Arrays and Hashing, 1 of 2 completed',
      }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('tab', {
        name: 'Dynamic Programming, 0 of 1 completed',
      }),
    ).toBeVisible()
    expect(screen.getByRole('tablist', { name: 'Track groups' })).toBeVisible()
    expect(getTrackProblemRow('Two Sum')).toBeVisible()
    expect(getTrackProblemRow('Binary Search')).toBeVisible()
    expect(queryTrackProblemRow('Maximum Subarray')).not.toBeInTheDocument()
  })

  it('renders track completion separately from review status', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(twoGroupWorkspace)
    renderTracksScreen()

    expect(
      await screen.findByRole('columnheader', { name: 'Completed' }),
    ).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'Review' })).toBeVisible()
    expect(screen.queryByRole('columnheader', { name: 'Track' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Status' })).toBeNull()

    const incompleteBadge = within(getTrackProblemRow('Two Sum')).getByText(
      'No',
    )

    expect(incompleteBadge).toBeVisible()
    expect(incompleteBadge).toHaveAttribute('data-cp-track-completed', 'false')
    expect(incompleteBadge).toHaveAttribute('data-cp-tone', 'danger')
    expect(
      within(getTrackProblemRow('Two Sum')).getByText('Due today'),
    ).toBeVisible()
    const completedBadge = within(
      getTrackProblemRow('Binary Search'),
    ).getByText('Yes')

    expect(completedBadge).toBeVisible()
    expect(completedBadge).toHaveAttribute('data-cp-track-completed', 'true')
    expect(completedBadge).toHaveAttribute('data-cp-tone', 'success')
    expect(
      within(getTrackProblemRow('Binary Search')).getByText('Scheduled'),
    ).toBeVisible()
  })

  it('uses the shared New label for unstarted Track problem review badges', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...twoGroupWorkspace,
      activeTrackRows: twoGroupWorkspace.activeTrackRows.map((row) =>
        row.problem.title === 'Binary Search'
          ? { ...row, status: 'not-started' as const }
          : row,
      ),
    })

    renderTracksScreen()

    await screen.findByRole('row', { name: /Binary Search/i })
    expect(
      within(getTrackProblemRow('Binary Search')).getByText('New'),
    ).toBeVisible()
  })

  it('keeps New Track reachable from the active workspace', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(twoGroupWorkspace)
    renderTracksScreen()

    expect(
      await screen.findByRole('heading', { name: 'LeetCode 75' }),
    ).toBeVisible()
    const allTracksActions = screen.getByLabelText('All tracks actions')

    expect(
      within(allTracksActions).getByRole('link', { name: 'New Track' }),
    ).toHaveAttribute('href', '#/tracks/new')
    expect(
      within(allTracksActions).getByRole('button', {
        name: 'Show all tracks',
      }),
    ).toBeVisible()
  })

  it('formats target summary and catalog metadata without local timezone drift', async () => {
    const dueAt = '2026-06-15T00:00:00.000Z'
    const activeTrack = twoGroupWorkspace.activeTrack

    if (!activeTrack) {
      throw new Error('Expected active track fixture.')
    }

    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...twoGroupWorkspace,
      generatedAt: '2026-06-01T12:00:00.000Z',
      activeTrack: {
        ...activeTrack,
        track: {
          ...activeTrack.track,
          dueAt,
        },
      },
      tracks: twoGroupWorkspace.tracks.map((row) =>
        row.track.id === 'grind-75'
          ? {
              ...row,
              track: {
                ...row.track,
                dueAt,
              },
            }
          : row,
      ),
    })
    renderTracksScreen()

    const targetSummary = await screen.findByLabelText('Track target summary')

    expect(within(targetSummary).getByText('Target')).toBeVisible()
    expect(within(targetSummary).getByText('Jun 15, 2026')).toBeVisible()
    expect(within(targetSummary).getByText('14 days left')).toBeVisible()
    expect(targetSummary).toHaveAttribute('data-cp-tone', 'success')
    expect(screen.queryByText('Due Jun 15, 2026')).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Show all tracks' }),
    )

    expect(screen.getAllByText('Target Jun 15 · 14 days left')).toHaveLength(1)
  })

  it('labels the aggregate as reviews due instead of the track target date', async () => {
    const activeTrack = twoGroupWorkspace.activeTrack

    if (!activeTrack) {
      throw new Error('Expected active track fixture.')
    }

    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...twoGroupWorkspace,
      generatedAt: '2026-06-01T12:00:00.000Z',
      dueCount: 0,
      activeTrack: {
        ...activeTrack,
        track: {
          ...activeTrack.track,
          dueAt: '2026-06-15T00:00:00.000Z',
        },
      },
    })
    renderTracksScreen()

    const dueMetric = await screen.findByLabelText('Reviews due metric')

    expect(within(dueMetric).getByText('Reviews Due')).toBeVisible()
    expect(within(dueMetric).queryByText('Due Reviews')).not.toBeInTheDocument()
    expect(dueMetric).toHaveTextContent('0')
    expect(
      within(dueMetric).queryByText('Jun 15, 2026'),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Track target summary')).toHaveTextContent(
      'Jun 15, 2026',
    )
  })

  it('marks overdue track targets without making the row an error state', async () => {
    const user = userEvent.setup()
    const activeTrack = twoGroupWorkspace.activeTrack

    if (!activeTrack) {
      throw new Error('Expected active track fixture.')
    }

    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...twoGroupWorkspace,
      generatedAt: '2026-06-01T12:00:00.000Z',
      activeTrack: {
        ...activeTrack,
        track: {
          ...activeTrack.track,
          dueAt: '2026-05-21T00:00:00.000Z',
        },
      },
      tracks: twoGroupWorkspace.tracks.map((row) => ({
        ...row,
        track: {
          ...row.track,
          dueAt: '2026-05-21T00:00:00.000Z',
        },
      })),
    })
    renderTracksScreen()

    const targetSummary = await screen.findByLabelText('Track target summary')

    expect(targetSummary).toHaveAttribute('data-cp-tone', 'danger')
    expect(within(targetSummary).getByText('Overdue')).toBeVisible()
    expect(within(targetSummary).getByText('11 days late')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Show all tracks' }))

    const overdueMetadata = screen.getAllByText(
      'Target May 21 · Overdue · 11 days late',
    )
    expect(overdueMetadata).toHaveLength(2)
    for (const metadata of overdueMetadata) {
      expect(metadata).toHaveAttribute('data-cp-tone', 'danger')
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders active groups as a single horizontally scrollable tab row', async () => {
    const activeTrack = twoGroupWorkspace.activeTrack

    if (!activeTrack) {
      throw new Error('Expected active track fixture.')
    }

    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...twoGroupWorkspace,
      activeTrackGroups: [
        createSerializedTrackGroup({
          id: 'leetcode-75:arrays-hashing',
          title: 'Arrays and Hashing',
          position: 1,
        }),
        createSerializedTrackGroup({
          id: 'leetcode-75:dynamic-programming',
          title: 'Dynamic Programming',
          position: 2,
        }),
        createSerializedTrackGroup({
          id: 'leetcode-75:graphs',
          title: 'Graphs',
          position: 3,
        }),
        createSerializedTrackGroup({
          id: 'leetcode-75:binary-search',
          title: 'Binary Search',
          position: 4,
        }),
      ],
    })
    renderTracksScreen()

    const tabList = await screen.findByRole('tablist', {
      name: 'Track groups',
    })
    const tabs = within(tabList).getAllByRole('tab')

    expect(tabs).toHaveLength(4)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveTextContent('1/2')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveTextContent('0/1')
  })

  it('reveals a restored active group later in the overflowing tab row', async () => {
    const { mock: scrollIntoView, restore: restoreScrollIntoView } =
      mockElementScrollIntoView(() => {
        expect(
          screen.getByRole('tablist', { name: 'Track groups' }),
        ).toHaveClass('px-9')
      })
    const restoreScrollMetrics = mockTrackGroupTabScrollMetrics({
      clientWidth: 320,
      scrollLeft: 0,
      scrollWidth: 960,
    })

    try {
      vi.mocked(sendMessage).mockResolvedValueOnce(
        createFourGroupWorkspace('leetcode-75:binary-search'),
      )
      renderTracksScreen()

      const activeTab = await screen.findByRole('tab', {
        name: /Binary Search/,
      })

      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'auto',
        block: 'nearest',
        inline: 'nearest',
      })
      expect(scrollIntoView.mock.instances[0]).toBe(activeTab)
      expect(activeTab).toHaveClass('scroll-mx-14')
    } finally {
      restoreScrollIntoView()
      restoreScrollMetrics.restore()
    }
  })

  it('reveals the newly selected group after the workspace is invalidated', async () => {
    const user = userEvent.setup()
    const { mock: scrollIntoView, restore: restoreScrollIntoView } =
      mockElementScrollIntoView()

    try {
      const initialWorkspace = createFourGroupWorkspace(
        'leetcode-75:arrays-hashing',
      )
      const updatedWorkspace = createFourGroupWorkspace(
        'leetcode-75:dynamic-programming',
      )
      let currentWorkspace = initialWorkspace

      vi.mocked(sendMessage).mockImplementation((method) => {
        if (method === 'tracks.getWorkspace') {
          return Promise.resolve(currentWorkspace)
        }

        if (method === 'tracks.setActiveGroup') {
          currentWorkspace = updatedWorkspace
        }

        return Promise.resolve(null)
      })
      renderTracksScreen()

      await screen.findByRole('tab', {
        name: 'Arrays and Hashing, 1 of 2 completed',
      })
      scrollIntoView.mockClear()

      await user.click(
        screen.getByRole('tab', {
          name: 'Dynamic Programming, 0 of 1 completed',
        }),
      )

      await waitFor(() => {
        expect(
          screen.getByRole('tab', {
            name: 'Dynamic Programming, 0 of 1 completed',
          }),
        ).toHaveAttribute('aria-selected', 'true')
      })
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'auto',
        block: 'nearest',
        inline: 'nearest',
      })
      expect(scrollIntoView.mock.instances[0]).toBe(
        screen.getByRole('tab', {
          name: 'Dynamic Programming, 0 of 1 completed',
        }),
      )
    } finally {
      restoreScrollIntoView()
    }
  })

  it('shows group scroll indicators as the tab row scrolls', async () => {
    const restoreScrollMetrics = mockTrackGroupTabScrollMetrics({
      clientWidth: 320,
      scrollLeft: 0,
      scrollWidth: 960,
    })

    try {
      vi.mocked(sendMessage).mockResolvedValueOnce({
        ...twoGroupWorkspace,
        activeTrackGroups: [
          createSerializedTrackGroup({
            id: 'leetcode-75:arrays-hashing',
            title: 'Arrays and Hashing',
            position: 1,
          }),
          createSerializedTrackGroup({
            id: 'leetcode-75:dynamic-programming',
            title: 'Dynamic Programming',
            position: 2,
          }),
          createSerializedTrackGroup({
            id: 'leetcode-75:graphs',
            title: 'Graphs',
            position: 3,
          }),
          createSerializedTrackGroup({
            id: 'leetcode-75:binary-search',
            title: 'Binary Search',
            position: 4,
          }),
        ],
      })
      renderTracksScreen()

      const tabList = await screen.findByRole('tablist', {
        name: 'Track groups',
      })

      expect(
        await screen.findByRole('button', {
          name: 'Scroll track groups right',
        }),
      ).toBeVisible()
      expect(
        screen.queryByRole('button', {
          name: 'Scroll track groups left',
        }),
      ).not.toBeInTheDocument()

      restoreScrollMetrics.metrics.scrollLeft = 320
      fireEvent.scroll(tabList)

      expect(
        await screen.findByRole('button', {
          name: 'Scroll track groups left',
        }),
      ).toBeVisible()
      expect(
        screen.getByRole('button', {
          name: 'Scroll track groups right',
        }),
      ).toBeVisible()

      restoreScrollMetrics.metrics.scrollLeft = 640
      fireEvent.scroll(tabList)

      await waitFor(() => {
        expect(
          screen.queryByRole('button', {
            name: 'Scroll track groups right',
          }),
        ).not.toBeInTheDocument()
      })
      expect(
        screen.getByRole('button', {
          name: 'Scroll track groups left',
        }),
      ).toBeVisible()
    } finally {
      restoreScrollMetrics.restore()
    }
  })

  it('hides group tabs for a single-group track', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(createTrackWorkspaceResponse())
    renderTracksScreen()

    expect(await getTrackProblemRowAsync('Two Sum')).toBeVisible()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('sets the active group from the group buttons', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(twoGroupWorkspace)
      }

      return Promise.resolve(null)
    })

    renderTracksScreen()

    await user.click(
      await screen.findByRole('tab', {
        name: 'Dynamic Programming, 0 of 1 completed',
      }),
    )

    expect(sendMessage).toHaveBeenCalledWith('tracks.setActiveGroup', {
      surface: 'dashboard',
      trackId: 'leetcode-75',
      groupId: 'leetcode-75:dynamic-programming',
    })
  })

  it('keeps all tracks collapsed by default and marks the active row when expanded', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(twoGroupWorkspace)
    renderTracksScreen()

    const allTracksButton = await screen.findByRole('button', {
      name: 'Show all tracks',
    })
    expect(screen.getByText('All tracks')).toBeVisible()
    expect(screen.queryByText('Grind 75')).not.toBeInTheDocument()

    await user.click(allTracksButton)

    expect(
      screen.getByRole('button', { name: 'Hide all tracks' }),
    ).toBeVisible()
    const activeRowActions = screen.getByLabelText(
      'LeetCode 75 catalog actions',
    )
    expect(screen.getByText('Active')).toBeVisible()
    expect(
      within(activeRowActions).getByRole('button', { name: 'Clear Active' }),
    ).toBeVisible()
    expect(
      within(activeRowActions).getByRole('link', { name: 'Edit Track' }),
    ).toHaveAttribute('href', '#/tracks/leetcode-75/edit')
    expect(screen.getByText('Grind 75')).toBeVisible()
  })

  it('opens all tracks when a track is added after the catalog mounts', () => {
    const activeTrackRow = twoGroupWorkspace.tracks.find(
      (row) => row.track.id === 'leetcode-75',
    )

    if (!activeTrackRow) {
      throw new Error('Expected active track catalog row fixture.')
    }

    const initialTracks = [activeTrackRow]
    const addedTrack = {
      track: createSerializedTrack({
        id: 'fresh-track',
        slug: 'fresh-track',
        title: 'Fresh Track',
      }),
      progress: {
        completedCount: 0,
        totalCount: 0,
        percent: 0,
      },
    }

    const { rerender } = renderOtherTracksAccordion(initialTracks)

    expect(screen.queryByText('Fresh Track')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Show all tracks' }),
    ).toBeVisible()

    rerender(createOtherTracksAccordionElement([...initialTracks, addedTrack]))

    expect(screen.getByText('Fresh Track')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Hide all tracks' }),
    ).toBeVisible()
  })

  it('toggles all tracks when the accordion header row is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(twoGroupWorkspace)
    renderTracksScreen()

    expect(await screen.findByText('All tracks')).toBeVisible()
    expect(screen.queryByText('Grind 75')).not.toBeInTheDocument()

    await user.click(screen.getByText('All tracks'))

    expect(screen.getByText('Grind 75')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Hide all tracks' }),
    ).toBeVisible()

    await user.click(screen.getByText('All tracks'))

    expect(screen.queryByText('Grind 75')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Show all tracks' }),
    ).toBeVisible()
  })

  it('does not toggle all tracks when New Track is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(twoGroupWorkspace)
    renderTracksScreen()

    const allTracksActions = await screen.findByLabelText('All tracks actions')

    await user.click(
      within(allTracksActions).getByRole('link', { name: 'New Track' }),
    )

    expect(screen.queryByText('Grind 75')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Show all tracks' }),
    ).toBeVisible()
  })

  it('keeps the forced-open all tracks row from collapsing when there is no active track', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...twoGroupWorkspace,
      activeTrack: null,
      activeTrackGroups: [],
      activeTrackRows: [],
    })
    renderTracksScreen()

    expect(await screen.findByText('No active track selected.')).toBeVisible()
    expect(screen.getByText('Grind 75')).toBeVisible()

    await user.click(screen.getByText('All tracks'))

    expect(screen.getByText('Grind 75')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'All tracks shown' }),
    ).toBeDisabled()
  })

  it('keeps all tracks actions available when expanded', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(twoGroupWorkspace)
    renderTracksScreen()

    await user.click(await screen.findByText('All tracks'))
    const activeRowActions = screen.getByLabelText(
      'LeetCode 75 catalog actions',
    )

    expect(
      within(activeRowActions).getByRole('button', { name: 'Reset Progress' }),
    ).toBeVisible()
    expect(
      within(activeRowActions).getByRole('button', { name: 'Delete Track' }),
    ).toBeVisible()
    expect(
      within(activeRowActions).queryByRole('button', {
        name: 'Set LeetCode 75 active',
      }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Grind 75')).toBeVisible()
    expect(screen.getByText('10 of 75')).toBeVisible()
    expect(screen.getByLabelText('Grind 75 progress: 10 of 75')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Set Grind 75 active' }),
    ).toBeVisible()
    expect(
      queryTrackProblemRow('Container With Most Water'),
    ).not.toBeInTheDocument()
  })

  it('sets another track active without rendering inactive track tables', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(twoGroupWorkspace)
      }

      return Promise.resolve(null)
    })

    renderTracksScreen()

    await user.click(
      await screen.findByRole('button', { name: 'Show all tracks' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Set Grind 75 active' }),
    )

    expect(sendMessage).toHaveBeenCalledWith('tracks.setActiveTrack', {
      surface: 'dashboard',
      trackId: 'grind-75',
    })
    expect(
      queryTrackProblemRow('Container With Most Water'),
    ).not.toBeInTheDocument()
  })

  it('clears the active track from the active workspace header', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(twoGroupWorkspace)
      }

      return Promise.resolve(null)
    })

    renderTracksScreen()

    await screen.findByRole('heading', { name: 'LeetCode 75' })
    const clearActiveButton = screen.getByRole('button', {
      name: 'Clear Active',
    })
    const activeHeaderActions = screen.getByLabelText(
      'LeetCode 75 track actions',
    )

    expect(
      within(activeHeaderActions).getByRole('link', { name: 'Edit Track' }),
    ).toHaveAttribute('href', '#/tracks/leetcode-75/edit')
    expect(
      within(activeHeaderActions).getByRole('button', {
        name: 'Reset Progress',
      }),
    ).toBeVisible()
    expect(
      within(activeHeaderActions).getByRole('button', { name: 'Delete Track' }),
    ).toBeVisible()

    await user.click(clearActiveButton)

    expect(sendMessage).toHaveBeenCalledWith('tracks.clearActiveTrack', {
      surface: 'dashboard',
    })
  })

  it('renders universal management actions for inactive track rows', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(twoGroupWorkspace)
      }

      return Promise.resolve(null)
    })

    renderTracksScreen()

    await user.click(
      await screen.findByRole('button', { name: 'Show all tracks' }),
    )

    const actions = screen.getByLabelText('Grind 75 catalog actions')

    const setActiveButton = within(actions).getByRole('button', {
      name: 'Set Grind 75 active',
    })
    const editLink = within(actions).getByRole('link', { name: 'Edit Track' })
    const resetButton = within(actions).getByRole('button', {
      name: 'Reset Progress',
    })
    const deleteButton = within(actions).getByRole('button', {
      name: 'Delete Track',
    })

    expect(setActiveButton).toBeVisible()
    expect(editLink).toHaveAttribute('href', '#/tracks/grind-75/edit')

    await user.click(resetButton)
    const resetDialog = screen.getByRole('dialog', {
      name: 'Reset track progress?',
    })
    await user.click(
      within(resetDialog).getByRole('button', { name: 'Reset Progress' }),
    )
    expect(sendMessage).toHaveBeenCalledWith('tracks.resetTrackProgress', {
      surface: 'dashboard',
      trackId: 'grind-75',
    })

    await user.click(deleteButton)
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete track?' })
    await user.click(
      within(deleteDialog).getByRole('button', { name: 'Delete Track' }),
    )
    expect(sendMessage).toHaveBeenCalledWith('tracks.deleteTrack', {
      surface: 'dashboard',
      trackId: 'grind-75',
    })
  })

  it('uses local confirmation dialogs for Delete and Reset Progress', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(twoGroupWorkspace)
      }

      return Promise.resolve(null)
    })

    renderTracksScreen()

    await screen.findByRole('heading', { name: 'LeetCode 75' })

    await user.click(screen.getByRole('button', { name: 'Reset Progress' }))
    const resetDialog = screen.getByRole('dialog', {
      name: 'Reset track progress?',
    })
    expect(resetDialog).toBeVisible()
    await user.click(
      within(resetDialog).getByRole('button', { name: 'Reset Progress' }),
    )
    expect(sendMessage).toHaveBeenCalledWith('tracks.resetTrackProgress', {
      surface: 'dashboard',
      trackId: 'leetcode-75',
    })

    await user.click(screen.getByRole('button', { name: 'Delete Track' }))
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete track?' })
    expect(deleteDialog).toBeVisible()
    await user.click(
      within(deleteDialog).getByRole('button', { name: 'Delete Track' }),
    )
    expect(sendMessage).toHaveBeenCalledWith('tracks.deleteTrack', {
      surface: 'dashboard',
      trackId: 'leetcode-75',
    })
  })

  it('shows delete and reset rejection errors inside the confirmation dialog', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(twoGroupWorkspace)
      }

      if (method === 'tracks.resetTrackProgress') {
        return Promise.reject(new Error('Reset failed'))
      }

      if (method === 'tracks.deleteTrack') {
        return Promise.reject(new Error('Delete failed'))
      }

      return Promise.resolve(null)
    })

    renderTracksScreen()

    await screen.findByRole('heading', { name: 'LeetCode 75' })

    await user.click(screen.getByRole('button', { name: 'Reset Progress' }))
    const resetDialog = screen.getByRole('dialog', {
      name: 'Reset track progress?',
    })
    await user.click(
      within(resetDialog).getByRole('button', { name: 'Reset Progress' }),
    )
    expect(await within(resetDialog).findByRole('alert')).toHaveTextContent(
      'Reset failed',
    )
    await user.click(
      within(resetDialog).getByRole('button', { name: 'Cancel' }),
    )

    await user.click(screen.getByRole('button', { name: 'Delete Track' }))
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete track?' })
    await user.click(
      within(deleteDialog).getByRole('button', { name: 'Delete Track' }),
    )
    expect(await within(deleteDialog).findByRole('alert')).toHaveTextContent(
      'Delete failed',
    )
  })

  it('traps confirmation focus, closes with Escape, and restores focus', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(twoGroupWorkspace)
      }

      return Promise.resolve(null)
    })

    renderTracksScreen()

    await screen.findByRole('heading', { name: 'LeetCode 75' })
    const resetButton = screen.getByRole('button', { name: 'Reset Progress' })

    await user.click(resetButton)
    const resetDialog = screen.getByRole('dialog', {
      name: 'Reset track progress?',
    })
    const cancelButton = within(resetDialog).getByRole('button', {
      name: 'Cancel',
    })
    const confirmButton = within(resetDialog).getByRole('button', {
      name: 'Reset Progress',
    })

    expect(cancelButton).toHaveFocus()

    await user.tab()
    expect(confirmButton).toHaveFocus()

    await user.tab()
    expect(cancelButton).toHaveFocus()

    await user.tab({ shift: true })
    expect(confirmButton).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('dialog', { name: 'Reset track progress?' }),
    ).not.toBeInTheDocument()
    expect(resetButton).toHaveFocus()
  })

  it('closes confirmation when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(twoGroupWorkspace)
      }

      return Promise.resolve(null)
    })

    renderTracksScreen()

    await screen.findByRole('heading', { name: 'LeetCode 75' })
    const resetButton = screen.getByRole('button', { name: 'Reset Progress' })

    await user.click(resetButton)

    const resetDialog = screen.getByRole('dialog', {
      name: 'Reset track progress?',
    })
    const backdrop = resetDialog.parentElement

    expect(backdrop).not.toBeNull()
    await user.click(backdrop as HTMLElement)

    expect(
      screen.queryByRole('dialog', { name: 'Reset track progress?' }),
    ).not.toBeInTheDocument()
    expect(resetButton).toHaveFocus()
  })

  it('keeps confirmation focus stable while an action is pending', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(twoGroupWorkspace)
      }

      if (method === 'tracks.resetTrackProgress') {
        return new Promise(() => undefined)
      }

      return Promise.resolve(null)
    })

    renderTracksScreen()

    await screen.findByRole('heading', { name: 'LeetCode 75' })
    await user.click(screen.getByRole('button', { name: 'Reset Progress' }))

    const resetDialog = screen.getByRole('dialog', {
      name: 'Reset track progress?',
    })
    await user.click(
      within(resetDialog).getByRole('button', { name: 'Reset Progress' }),
    )

    await waitFor(() => {
      expect(resetDialog).toHaveAttribute('aria-busy', 'true')
    })
    expect(resetDialog).toHaveFocus()
    expect(
      within(resetDialog).getByRole('button', { name: 'Reset Progress' }),
    ).toBeDisabled()
  })

  it('contains problem reset focus in Tracks and shows retryable errors in its dialog', async () => {
    const user = userEvent.setup()
    let reject = true
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace')
        return Promise.resolve(twoGroupWorkspace)
      if (method === 'practice.resetSchedule' && reject)
        return Promise.reject(new Error('Reset failed.'))
      return Promise.resolve(null)
    })
    renderTracksScreen()
    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    const opener = screen.getByRole('button', { name: 'Reset Schedule' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Reset schedule?' })
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const confirm = within(dialog).getByRole('button', {
      name: 'Reset Schedule',
    })
    expect(cancel).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.click(confirm)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Reset failed.',
    )
    reject = false
    await user.click(confirm)
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })

  it('removes a problem from its current track and refreshes the workspace', async () => {
    const user = userEvent.setup()
    let removed = false
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(
          removed
            ? {
                ...twoGroupWorkspace,
                activeTrackRows: twoGroupWorkspace.activeTrackRows.filter(
                  (row) => row.problem.slug !== 'two-sum',
                ),
              }
            : twoGroupWorkspace,
        )
      }
      if (method === 'tracks.removeProblem') removed = true
      return Promise.resolve(null)
    })
    renderTracksScreen()
    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    await user.click(screen.getByRole('button', { name: 'Remove from track' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Collapse Two Sum' }),
      ).toBeNull(),
    )
    expect(sendMessage).toHaveBeenCalledWith('tracks.removeProblem', {
      surface: 'dashboard',
      trackId: 'leetcode-75',
      problemSlug: 'two-sum',
    })
  })

  it('disables removal while pending and lets the user retry a failed removal', async () => {
    const user = userEvent.setup()
    let rejectRemoval: (error: Error) => void = () => undefined
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace')
        return Promise.resolve(twoGroupWorkspace)
      if (method === 'tracks.removeProblem')
        return new Promise((_, reject) => {
          rejectRemoval = reject
        })
      return Promise.resolve(null)
    })
    renderTracksScreen()
    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    const remove = screen.getByRole('button', { name: 'Remove from track' })
    await user.click(remove)
    expect(remove).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeDisabled()
    rejectRemoval(new Error('Could not save track.'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save track.',
    )
    expect(remove).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Collapse Two Sum' }),
    ).toBeVisible()
    await user.click(remove)
    expect(remove).toBeDisabled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears removal pending state if the row is collapsed while saving', async () => {
    const user = userEvent.setup()
    let finishRemoval: () => void = () => undefined
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace')
        return Promise.resolve(twoGroupWorkspace)
      if (method === 'tracks.removeProblem')
        return new Promise<null>((resolve) => {
          finishRemoval = () => resolve(null)
        })
      return Promise.resolve(null)
    })
    renderTracksScreen()
    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    await user.click(screen.getByRole('button', { name: 'Remove from track' }))
    await user.click(screen.getByRole('button', { name: 'Collapse Two Sum' }))
    finishRemoval()
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(3))
    await user.click(screen.getByRole('button', { name: 'Expand Two Sum' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove from track' }),
      ).toBeEnabled(),
    )
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeEnabled()
  })

  it('expands problem rows with reusable practice actions and no global Delete', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(twoGroupWorkspace)
      }

      return Promise.resolve(null)
    })

    renderTracksScreen()

    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )

    expect(screen.getByRole('heading', { name: 'Details' })).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Analytics and history' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '#/library/problems/two-sum/edit',
    )
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reset Schedule' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})

function renderTracksScreen() {
  const { wrapper } = createQueryTestHarness()

  return render(
    <TracksScreen
      newTrackAction={
        <Button asChild size="sm">
          <a href="#/tracks/new">
            <Plus aria-hidden="true" />
            New Track
          </a>
        </Button>
      }
      renderEditProblemAction={(problem: SerializedProblem) => (
        <Button asChild size="sm" variant="ghost">
          <a href={`#/library/problems/${problem.slug}/edit`}>Edit</a>
        </Button>
      )}
      renderEditTrackAction={(track) => (
        <IconButton
          asChild
          label="Edit Track"
          size="sm"
          tooltip="Edit Track"
          variant="ghost"
        >
          <a href={`#/tracks/${track.id}/edit`}>
            <Pencil aria-hidden="true" />
          </a>
        </IconButton>
      )}
    />,
    { wrapper },
  )
}

function renderOtherTracksAccordion(
  tracks: React.ComponentProps<typeof OtherTracksAccordion>['tracks'],
) {
  const { wrapper } = createQueryTestHarness()

  return render(createOtherTracksAccordionElement(tracks), { wrapper })
}

function mockElementScrollIntoView(implementation?: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  )
  const mock = vi.fn(implementation)

  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: mock,
  })

  return {
    mock,
    restore: () => restoreHTMLElementProperty('scrollIntoView', descriptor),
  }
}

function createOtherTracksAccordionElement(
  tracks: React.ComponentProps<typeof OtherTracksAccordion>['tracks'],
) {
  return (
    <OtherTracksAccordion
      activeTrackId="leetcode-75"
      generatedAt="2026-06-01T12:00:00.000Z"
      newTrackAction={<a href="#/tracks/new">New Track</a>}
      renderEditTrackAction={(track) => (
        <a href={`#/tracks/${track.id}/edit`}>Edit Track</a>
      )}
      tracks={tracks}
    />
  )
}

function mockTrackGroupTabScrollMetrics(metrics: {
  clientWidth: number
  scrollLeft: number
  scrollWidth: number
}) {
  const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth',
  )
  const scrollLeftDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollLeft',
  )
  const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollWidth',
  )

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (isTrackGroupTabList(this)) {
        return metrics.clientWidth
      }

      return readNumericHTMLElementProperty(clientWidthDescriptor, this)
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
    configurable: true,
    get(this: HTMLElement) {
      if (isTrackGroupTabList(this)) {
        return metrics.scrollLeft
      }

      return readNumericHTMLElementProperty(scrollLeftDescriptor, this)
    },
    set(this: HTMLElement, value: number) {
      if (isTrackGroupTabList(this)) {
        metrics.scrollLeft = value
        return
      }

      scrollLeftDescriptor?.set?.call(this, value)
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (isTrackGroupTabList(this)) {
        return metrics.scrollWidth
      }

      return readNumericHTMLElementProperty(scrollWidthDescriptor, this)
    },
  })

  return {
    metrics,
    restore: () => {
      restoreHTMLElementProperty('clientWidth', clientWidthDescriptor)
      restoreHTMLElementProperty('scrollLeft', scrollLeftDescriptor)
      restoreHTMLElementProperty('scrollWidth', scrollWidthDescriptor)
    },
  }
}

function isTrackGroupTabList(element: HTMLElement) {
  return element.getAttribute('aria-label') === 'Track groups'
}

function readNumericHTMLElementProperty(
  descriptor: PropertyDescriptor | undefined,
  element: HTMLElement,
) {
  const value: unknown = descriptor?.get?.call(element)

  return typeof value === 'number' ? value : 0
}

function restoreHTMLElementProperty(
  propertyName: 'clientWidth' | 'scrollLeft' | 'scrollWidth' | 'scrollIntoView',
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(HTMLElement.prototype, propertyName, descriptor)
    return
  }

  delete (HTMLElement.prototype as unknown as Record<string, unknown>)[
    propertyName
  ]
}

function getTrackProblemRow(title: string) {
  return screen.getByRole('row', { name: new RegExp(title, 'i') })
}

function queryTrackProblemRow(title: string) {
  return screen.queryByRole('row', { name: new RegExp(title, 'i') })
}

async function getTrackProblemRowAsync(title: string) {
  await waitFor(() => {
    expect(getTrackProblemRow(title)).toBeVisible()
  })

  return getTrackProblemRow(title)
}

const twoGroupWorkspace = createTrackWorkspaceResponse({
  activeTrack: {
    track: createSerializedTrack({
      description: 'Core interview practice.',
      id: 'leetcode-75',
      slug: 'leetcode-75',
      title: 'LeetCode 75',
    }),
    activeGroup: createSerializedTrackGroup({
      id: 'leetcode-75:arrays-hashing',
      title: 'Arrays and Hashing',
    }),
    progress: {
      completedCount: 1,
      totalCount: 3,
      percent: 33,
    },
    nextProblem: {
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'easy',
      isPremium: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
  activeTrackGroups: [
    createSerializedTrackGroup({
      id: 'leetcode-75:arrays-hashing',
      title: 'Arrays and Hashing',
      position: 1,
    }),
    createSerializedTrackGroup({
      id: 'leetcode-75:dynamic-programming',
      title: 'Dynamic Programming',
      position: 2,
    }),
  ],
  activeTrackRows: [
    createTrackProblemRow({
      problem: {
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      status: 'due',
      nextReviewAt: '2026-01-02T00:00:00.000Z',
      lastReviewedAt: '2026-01-01T00:00:00.000Z',
      membership: {
        trackId: 'leetcode-75',
        groupId: 'leetcode-75:arrays-hashing',
        groupTitle: 'Arrays and Hashing',
        groupPosition: 1,
        problemPosition: 1,
        completion: { status: 'incomplete', reviewAttemptId: null },
      },
      trackMemberships: [
        {
          trackId: 'leetcode-75',
          trackSlug: 'leetcode-75',
          trackTitle: 'LeetCode 75',
          groupId: 'leetcode-75:arrays-hashing',
          groupTitle: 'Arrays and Hashing',
          groupPosition: 1,
          problemPosition: 1,
        },
      ],
    }),
    createTrackProblemRow({
      problem: {
        slug: 'binary-search',
        title: 'Binary Search',
        difficulty: 'easy',
        isPremium: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      status: 'scheduled',
      membership: {
        trackId: 'leetcode-75',
        groupId: 'leetcode-75:arrays-hashing',
        groupTitle: 'Arrays and Hashing',
        groupPosition: 1,
        problemPosition: 2,
        completion: {
          status: 'completed',
          completedAt: '2026-01-01T00:00:00.000Z',
          completedRating: 'good',
          reviewAttemptId: 'review-two-sum-1',
        },
      },
    }),
    createTrackProblemRow({
      problem: {
        slug: 'maximum-subarray',
        title: 'Maximum Subarray',
        difficulty: 'medium',
        isPremium: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      status: 'not-started',
      membership: {
        trackId: 'leetcode-75',
        groupId: 'leetcode-75:dynamic-programming',
        groupTitle: 'Dynamic Programming',
        groupPosition: 2,
        problemPosition: 1,
        completion: { status: 'incomplete', reviewAttemptId: null },
      },
    }),
  ],
  dueCount: 2,
  tracks: [
    {
      track: createSerializedTrack({
        id: 'leetcode-75',
        slug: 'leetcode-75',
        title: 'LeetCode 75',
      }),
      progress: {
        completedCount: 1,
        totalCount: 3,
        percent: 33,
      },
    },
    {
      track: createSerializedTrack({
        id: 'grind-75',
        slug: 'grind-75',
        title: 'Grind 75',
      }),
      progress: {
        completedCount: 10,
        totalCount: 75,
        percent: 13,
      },
    },
  ],
})

function createFourGroupWorkspace(activeGroupId: string) {
  const activeTrack = twoGroupWorkspace.activeTrack

  if (!activeTrack) {
    throw new Error('Expected active track fixture.')
  }

  const groups = [
    createSerializedTrackGroup({
      id: 'leetcode-75:arrays-hashing',
      title: 'Arrays and Hashing',
      position: 1,
    }),
    createSerializedTrackGroup({
      id: 'leetcode-75:dynamic-programming',
      title: 'Dynamic Programming',
      position: 2,
    }),
    createSerializedTrackGroup({
      id: 'leetcode-75:graphs',
      title: 'Graphs',
      position: 3,
    }),
    createSerializedTrackGroup({
      id: 'leetcode-75:binary-search',
      title: 'Binary Search',
      position: 4,
    }),
  ]

  return {
    ...twoGroupWorkspace,
    activeTrack: {
      ...activeTrack,
      activeGroup: groups.find((group) => group.id === activeGroupId) ?? null,
    },
    activeTrackGroups: groups,
  }
}
