import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onMessage, sendMessage } from '@/extension/messaging'
import { ProblemLibraryScreen } from '@/features/problems'
import { TracksScreen } from '@/features/tracks'
import {
  createProblemLibraryResponse,
  createSerializedProblem,
} from '@/testing/problem-fixtures'
import { createTrackWorkspaceResponse } from '@/testing/track-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'
import { CacheInvalidationListener } from './cache-invalidation-listener'
vi.mock('@/extension/messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/extension/messaging')>()),
  sendMessage: vi.fn(),
  onMessage: vi.fn(() => () => undefined),
}))
const defaultLibrary = createProblemLibraryResponse()
const libraryResponse = createProblemLibraryResponse({
  rows: [
    {
      ...defaultLibrary.rows[0]!,
      problem: createSerializedProblem({ slug: 'two-sum', title: 'Two Sum' }),
      status: 'due',
    },
    defaultLibrary.rows[0]!,
  ],
})
const twoGroupWorkspace = createTrackWorkspaceResponse()
describe('Problem data confirmations across publication broadcasts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it.each([
    'reset',
    'delete',
    'bulk-reset',
    'bulk-delete',
    'filtered-reset',
  ] as const)(
    'retains the accepted %s dialog after a metadata-pending broadcast removes its rows',
    async (action) => {
      const user = userEvent.setup()
      const bulk = action.startsWith('bulk')
      const resetting = action.endsWith('reset')
      const method = resetting
        ? 'problems.resetProblemData'
        : bulk
          ? 'problems.bulkDelete'
          : 'problems.deleteProblem'
      let calls = 0
      let published = false
      vi.mocked(sendMessage).mockImplementation((name) => {
        if (name === 'problems.getLibrary')
          return Promise.resolve(
            published
              ? {
                  ...libraryResponse,
                  rows:
                    action === 'filtered-reset'
                      ? libraryResponse.rows.map((row) => ({
                          ...row,
                          status: 'not-started' as const,
                        }))
                      : [],
                }
              : libraryResponse,
          )
        if (name === method)
          return ++calls === 1
            ? Promise.resolve({
                status: 'durable',
                kind: resetting ? 'problem-reset' : 'problem-delete',
                summary: null,
                syncMetadataPending: true,
              })
            : Promise.resolve({
                status: 'durable',
                kind: resetting ? 'problem-reset' : 'problem-delete',
                summary: null,
                syncMetadataPending: false,
              })
        return Promise.resolve(undefined)
      })
      renderProblemLibrary()
      if (action === 'filtered-reset') {
        await screen.findByRole('button', { name: 'Expand Two Sum' })
        await user.click(screen.getByRole('button', { name: 'Expand filters' }))
        await selectLibraryFacetOption(user, 'Status', 'Due today')
      }
      if (bulk) {
        await user.click(
          await screen.findByRole('checkbox', { name: 'Select Two Sum' }),
        )
        await user.click(
          screen.getByRole('checkbox', { name: 'Select Binary Search' }),
        )
        await user.click(
          within(
            screen.getByRole('region', { name: 'Bulk actions' }),
          ).getByRole('button', {
            name: resetting ? 'Reset problem' : 'Delete Problems',
          }),
        )
      } else {
        await user.click(
          await screen.findByRole('button', { name: 'Expand Two Sum' }),
        )
        await user.click(
          screen.getByRole('button', {
            name: resetting ? 'Reset problem' : 'Delete',
          }),
        )
      }
      const dialog = screen.getByRole('dialog')
      const label = resetting
        ? 'Reset problem'
        : bulk
          ? 'Delete Problems'
          : 'Delete Problem'
      await user.click(within(dialog).getByRole('button', { name: label }))
      await within(dialog).findByRole('button', { name: 'Retry saving' })
      published = true
      const handler = vi
        .mocked(onMessage)
        .mock.calls.find(([name]) => name === 'cache.invalidate')![1]
      await act(async () => {
        await handler({
          data: {
            emittedAt: '2026-01-01T10:00:00.000Z',
            reason: 'problem-catalog-updated',
            source: 'dashboard',
            tags: ['problems', 'practice', 'queue', 'tracks', 'app-shell'],
          },
        } as never)
      })
      await screen.findByText(
        action === 'filtered-reset'
          ? 'No problems match these filters.'
          : 'No problems are tracked yet.',
      )
      expect(screen.getByRole('dialog')).toBe(dialog)
      if (bulk && resetting)
        expect(dialog).toHaveTextContent('2 selected problems')
      const accepted = vi
        .mocked(sendMessage)
        .mock.calls.find(([name]) => name === method)![1]
      await user.click(
        within(dialog).getByRole('button', { name: 'Retry saving' }),
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(
        vi
          .mocked(sendMessage)
          .mock.calls.filter(([name]) => name === method)
          .map(([, request]) => request),
      ).toEqual([accepted, accepted])
    },
  )

  it('retains the accepted problem reset across a broadcast removing its track group', async () => {
    const user = userEvent.setup()
    let published = false
    let calls = 0
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace')
        return Promise.resolve(
          published
            ? {
                ...twoGroupWorkspace,
                activeTrackGroups: [],
                activeTrackRows: [],
              }
            : twoGroupWorkspace,
        )
      if (method === 'problems.resetProblemData')
        return Promise.resolve({
          status: 'durable',
          kind: 'problem-reset',
          summary: null,
          syncMetadataPending: ++calls === 1,
        })
      return Promise.resolve(undefined)
    })
    renderTracksScreen()
    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    await user.click(screen.getByRole('button', { name: 'Reset problem' }))
    const dialog = screen.getByRole('dialog', { name: 'Reset problem?' })
    await user.click(
      within(dialog).getByRole('button', { name: 'Reset problem' }),
    )
    await within(dialog).findByRole('button', { name: 'Retry saving' })
    const accepted = vi
      .mocked(sendMessage)
      .mock.calls.find(([name]) => name === 'problems.resetProblemData')![1]
    published = true
    const handler = vi
      .mocked(onMessage)
      .mock.calls.find(([name]) => name === 'cache.invalidate')![1]
    await act(async () => {
      await handler({
        data: {
          emittedAt: '2026-01-01T10:00:00.000Z',
          reason: 'problem-catalog-updated',
          source: 'dashboard',
          tags: ['problems', 'practice', 'queue', 'tracks', 'app-shell'],
        },
      } as never)
    })
    await screen.findByText('No groups in this track.')
    expect(screen.getByRole('dialog')).toBe(dialog)
    await user.click(
      within(dialog).getByRole('button', { name: 'Retry saving' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      vi
        .mocked(sendMessage)
        .mock.calls.filter(([name]) => name === 'problems.resetProblemData')
        .map(([, request]) => request),
    ).toEqual([accepted, accepted])
  })
})
function renderProblemLibrary() {
  const { wrapper } = createQueryTestHarness()
  return render(
    <>
      <CacheInvalidationListener />
      <ProblemLibraryScreen
        newProblemAction={null}
        renderEditProblemAction={() => null}
      />
    </>,
    { wrapper },
  )
}
function renderTracksScreen() {
  const { wrapper } = createQueryTestHarness()
  return render(
    <>
      <CacheInvalidationListener />
      <TracksScreen
        newTrackAction={null}
        renderEditProblemAction={() => null}
        renderEditTrackAction={() => null}
      />
    </>,
    { wrapper },
  )
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
