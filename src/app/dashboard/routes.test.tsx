import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import {
  readyPreview,
  validTwoQuestionTrackFileText,
} from '@/features/imports/testing/import-fixtures'
import { defaultUserSettings } from '@/features/settings/domain'
import type { SyncActionResult } from '@/features/sync'
import { createLibrarySelectionTrackDraft } from '@/features/tracks'
import { createDashboardAppShellData } from '@/testing/app-shell-fixtures'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import type { ReadinessFailure } from '@/features/analytics/api/analytics-contracts'
import {
  createProblemForEditResponse,
  createProblemLibraryResponse,
  createSerializedProblem,
} from '@/testing/problem-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'
import {
  createSerializedTrack,
  createTrackForEditResponse,
  createTrackProblemRow,
  createTrackWorkspaceResponse,
} from '@/testing/track-fixtures'

import {
  DashboardApp,
  createDashboardRouter,
  dashboardPaths,
} from './navigation/routes'
import { dashboardModalRouteMeta } from './navigation/route-manifest'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

let analyticsSummary = createSerializedAnalyticsSummary()
const analyticsTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

function createTrackImportFile(text = validTwoQuestionTrackFileText) {
  const file = new File([text], 'my-track.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve(text),
  })
  return file
}

function renderDashboard(initialEntry = '/') {
  const router = createDashboardRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  const { wrapper } = createQueryTestHarness()

  render(<DashboardApp router={router} />, { wrapper })

  return {
    router,
    user: userEvent.setup(),
  }
}

describe('dashboard routes', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    analyticsSummary = createSerializedAnalyticsSummary()
    vi.mocked(sendMessage).mockImplementation((method, request) => {
      if (method === 'app.getShellData') {
        return Promise.resolve(createDashboardAppShellData())
      }

      if (method === 'analytics.getSummary') {
        return Promise.resolve(analyticsSummary)
      }

      if (method === 'sync.getStatus') {
        return Promise.resolve(notConfiguredSyncStatus)
      }

      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(createTrackWorkspaceResponse())
      }

      if (method === 'tracks.getTrackForEdit') {
        if (
          typeof request === 'object' &&
          request !== null &&
          'trackId' in request
        ) {
          return Promise.resolve(
            createTrackForEditResponse({
              track: createSerializedTrack({
                dueAt: '2026-06-15T00:00:00.000Z',
                id: 'leetcode-75',
                slug: 'leetcode-75',
                title: 'LeetCode 75',
              }),
              groups: [
                {
                  id: 'leetcode-75:arrays-hashing',
                  trackId: 'leetcode-75',
                  title: 'Arrays and Hashing',
                  position: 1,
                  problemSlugs: ['two-sum'],
                },
              ],
              problemRows: [
                createTrackProblemRow({
                  problem: createSerializedProblem({
                    slug: 'two-sum',
                    title: 'Two Sum',
                  }),
                }),
              ],
            }),
          )
        }

        return Promise.resolve(
          createTrackForEditResponse({
            track: null,
            groups: [],
            problemRows: [
              createTrackProblemRow({
                problem: createSerializedProblem({
                  slug: 'two-sum',
                  title: 'Two Sum',
                }),
              }),
            ],
          }),
        )
      }

      if (method === 'tracks.createTrack' || method === 'tracks.updateTrack') {
        return Promise.resolve(null)
      }

      if (method === 'problems.getLibrary') {
        return Promise.resolve(createProblemLibraryResponse())
      }

      if (method === 'problems.getProblemForEdit') {
        return Promise.resolve(
          createProblemForEditResponse({
            problem: createSerializedProblem({
              slug: 'two-sum',
              title: 'Two Sum',
            }),
          }),
        )
      }

      return Promise.resolve(defaultUserSettings)
    })
  })

  it('renders all top-level navigation links', async () => {
    renderDashboard()

    expect(await screen.findByRole('link', { name: 'Overview' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Tracks' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Library' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Analytics' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeVisible()
  })

  it.each([
    ['/', 'Overview', 'What should I practice now'],
    ['/tracks', 'Tracks', 'Core interview practice'],
    ['/library', 'Library', 'Total'],
    [
      '/analytics',
      'How your memory is changing',
      'A focused view of recall, practice patterns, weak spots, and workload',
    ],
    ['/settings', 'Settings', 'Daily goal'],
  ])('renders the %s route', async (path, heading, expectedCopy) => {
    renderDashboard(path)

    expect(await screen.findByRole('heading', { name: heading })).toBeVisible()
    expect(
      (await screen.findAllByText(new RegExp(expectedCopy, 'i')))[0],
    ).toBeVisible()
  })

  it('navigates from Settings to Overview through the brand link', async () => {
    const { router, user } = renderDashboard('/settings')

    expect(
      await screen.findByRole('heading', { name: 'Settings' }),
    ).toBeVisible()

    await user.click(screen.getByRole('link', { name: 'Open Overview' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
    expect(
      await screen.findByRole('heading', { name: 'Overview' }),
    ).toBeVisible()
  })

  it('updates the analytics URL and runtime request when the range changes', async () => {
    const { router, user } = renderDashboard('/analytics?range=14')

    expect(
      await screen.findByRole('button', { name: '14 days' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('group', { name: 'Analytics time range' }),
    ).toHaveClass('w-full', 'flex-wrap')

    await user.click(screen.getByRole('button', { name: '90 days' }))

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ range: 90 })
      expect(sendMessage).toHaveBeenCalledWith('analytics.getSummary', {
        surface: 'dashboard',
        range: 90,
        timeZone: analyticsTimeZone,
      })
    })
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('preserves analytics search context when a readiness recommendation changes the range', async () => {
    const readiness = {
      ...analyticsSummary.historicalReadiness.requested,
      requestedDays: 90,
      bucketDays: 7,
      requestedBuckets: 13,
      effectiveBuckets: 6,
      effectiveStart: '2026-05-01',
      assessments: 32,
      minimumAssessments: 45,
      activeBuckets: 4,
      minimumActiveBuckets: 5,
      failingReasons: [
        'insufficient-span',
        'insufficient-assessments',
        'insufficient-active-buckets',
      ] as ReadinessFailure[],
    }
    analyticsSummary = createSerializedAnalyticsSummary({
      range: 90,
      timeFrame: {
        ...analyticsSummary.timeFrame,
        requestedDays: 90,
      },
      historicalReadiness: {
        requested: readiness,
        recallQuality: readiness,
        practiceRhythm: readiness,
        ratingsMix: readiness,
        topics: readiness,
        stability: readiness,
        overdueBacklog: readiness,
        recommendedRange: 30,
      },
    })

    const { router } = renderDashboard(
      '/analytics?range=90&context=retention-health',
    )

    const recommendation = await screen.findByRole('link', {
      name: 'Use ready 30-day view',
    })

    expect(recommendation).toHaveAttribute(
      'href',
      expect.stringContaining('context=retention-health'),
    )
    expect(recommendation).toHaveAttribute(
      'href',
      expect.stringContaining('range=30'),
    )
    expect(router.state.location.search).toEqual({
      context: 'retention-health',
      range: 90,
    })
  })

  it.each(['14', '30', '90'])(
    'passes the numeric analytics range from %s URL search params',
    async (range) => {
      renderDashboard(`/analytics?range=${range}`)

      await screen.findByRole('heading', {
        name: 'How your memory is changing',
      })
      await waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith('analytics.getSummary', {
          surface: 'dashboard',
          range: Number(range),
          timeZone: analyticsTimeZone,
        }),
      )
    },
  )

  it.each(['/analytics', '/analytics?range=7', '/analytics?range='])(
    'defaults malformed analytics range URL %s to 30',
    async (path) => {
      renderDashboard(path)

      await screen.findByRole('heading', {
        name: 'How your memory is changing',
      })
      await waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith('analytics.getSummary', {
          surface: 'dashboard',
          range: 30,
          timeZone: analyticsTimeZone,
        }),
      )
    },
  )

  it('renders the hidden dev smoke route without adding it to primary navigation', async () => {
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'devSmoke.run') {
        return Promise.resolve({
          generatedAt: '2026-06-07T12:00:00.000Z',
          checks: [
            {
              id: 'health',
              label: 'Background runtime',
              status: 'pass',
              detail: 'Background smoke service is reachable.',
            },
          ],
        })
      }

      if (method === 'app.getShellData') {
        return Promise.resolve(createDashboardAppShellData())
      }

      if (method === 'sync.getStatus') {
        return Promise.resolve(notConfiguredSyncStatus)
      }

      return Promise.resolve(defaultUserSettings)
    })

    renderDashboard('/dev/smoke')

    expect(
      await screen.findByRole('heading', { name: 'Dev Smoke' }),
    ).toBeVisible()
    expect(await screen.findByText('Background runtime')).toBeVisible()
    expect(
      await screen.findByText('Background smoke service is reachable.'),
    ).toBeVisible()
    expect(
      screen.queryByRole('link', { name: 'Dev Smoke' }),
    ).not.toBeInTheDocument()
    expect(sendMessage).toHaveBeenCalledWith('devSmoke.run', {
      surface: 'dashboard',
      runLiveGenAi: false,
    })
  })

  it('renders the real Overview route with recommendation and route navigation', async () => {
    renderDashboard('/')

    expect(
      await screen.findByRole('heading', { name: 'Overview' }),
    ).toBeVisible()
    expect(
      await screen.findByRole('heading', { name: 'Add Binary' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Library' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open Tracks' })).toBeVisible()
  })

  it('applies the saved dashboard theme and cycles it from the header button', async () => {
    const darkSettings = {
      ...defaultUserSettings,
      appearance: {
        themeMode: 'dark' as const,
      },
    }
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'settings.getSettings') {
        return Promise.resolve(darkSettings)
      }

      if (method === 'settings.cycleThemeMode') {
        return Promise.resolve(null)
      }

      if (method === 'app.getShellData') {
        return Promise.resolve(createDashboardAppShellData())
      }

      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(createTrackWorkspaceResponse())
      }

      return Promise.resolve(defaultUserSettings)
    })

    const { user } = renderDashboard('/')

    await screen.findByRole('heading', { name: 'Overview' })
    const themeButton = await screen.findByRole('button', {
      name: 'Cycle theme mode. Current theme: Dark',
    })
    const dashboardRoot = document.querySelector(
      '[data-cp-surface="dashboard"]',
    )
    expect(dashboardRoot).toHaveAttribute('data-cp-theme', 'dark')

    await user.click(themeButton)

    expect(sendMessage).toHaveBeenCalledWith('settings.cycleThemeMode', {
      surface: 'dashboard',
    })
  })

  it('renders configured dashboard sync shortcuts and runs dashboard sync actions', async () => {
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'settings.getSettings') {
        return Promise.resolve(defaultUserSettings)
      }

      if (method === 'sync.getStatus') {
        return Promise.resolve(configuredSyncStatus)
      }

      if (method === 'sync.pullLatest') {
        return Promise.resolve(syncActionResult('pull-latest', 'pull'))
      }

      if (method === 'sync.pushLocal') {
        return Promise.resolve(syncActionResult('push-local', 'push'))
      }

      if (method === 'app.getShellData') {
        return Promise.resolve(createDashboardAppShellData())
      }

      throw new Error(
        `Unexpected runtime method in sync shortcut test: ${method}`,
      )
    })

    const { user } = renderDashboard('/')

    await screen.findByRole('heading', { name: 'Overview' })

    await user.click(
      await screen.findByRole('button', { name: 'Pull latest from Gist' }),
    )
    await user.click(screen.getByRole('button', { name: 'Push local to Gist' }))

    expect(sendMessage).toHaveBeenCalledWith('sync.pullLatest', {
      surface: 'dashboard',
      confirmLocalOverwrite: false,
    })
    expect(sendMessage).toHaveBeenCalledWith('sync.pushLocal', {
      surface: 'dashboard',
      confirmRemoteOverwrite: false,
    })
  })

  it('renders the Overview queue-clear route with Library and Tracks actions', async () => {
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'app.getShellData') {
        return Promise.resolve(
          createDashboardAppShellData({
            recommendation: {
              title: 'Queue is clear',
              detail: 'No due reviews or extra practice are queued right now.',
              category: null,
              problem: null,
              dueAt: null,
            },
            queue: {
              dueCount: 0,
              newCount: 0,
              reinforcementCount: 0,
              items: [],
            },
            overview: {
              practiceProgress: {
                completedToday: 4,
                dailyGoal: 4,
                currentStreak: 3,
                goalMetToday: true,
                todayDateKey: '2026-05-25',
              },
              queuePreview: [],
            },
            dashboard: {
              queuePreview: [],
            },
          }),
        )
      }

      return Promise.resolve(defaultUserSettings)
    })

    renderDashboard('/')

    expect(
      await screen.findByRole('heading', { name: 'Queue Clear' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open Library' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open Tracks' })).toBeVisible()
  })

  it.each([
    ['/tracks/new', 'Tracks', /New Track/i, null],
    ['/tracks/import', 'Tracks', /Import tracks/i, null],
    ['/tracks/leetcode-75/edit', 'Tracks', /Edit/i, null],
    ['/tracks/problems/two-sum/edit', 'Tracks', /Edit/i, null],
    ['/library/tracks/new?draft=missing-draft', 'Library', /New Track/i, null],
    ['/library/problems/new', 'Library', /Add problem/i, null],
    ['/library/problems/two-sum/edit', 'Library', /Edit/i, null],
  ])(
    'renders %s over the parent route',
    async (path, parentHeading, modalHeading, eyebrow) => {
      renderDashboard(path)

      expect(
        await screen.findByRole('heading', { name: parentHeading }),
      ).toBeVisible()
      expect(screen.getByRole('dialog', { name: modalHeading })).toBeVisible()

      if (eyebrow) {
        expect(screen.getByText(eyebrow)).toBeVisible()
      }
    },
  )

  it('opens template-first track import from the collection without collapsing it', async () => {
    const { user, router } = renderDashboard('/tracks')
    const collection = await screen.findByRole('region', { name: 'All tracks' })
    await user.click(
      within(collection).getByRole('link', { name: 'Import tracks' }),
    )

    const dialog = await screen.findByRole('dialog', { name: 'Import tracks' })
    expect(
      within(dialog).getByRole('link', { name: 'Download track template' }),
    ).toHaveAttribute('download', 'track-only.json')
    expect(
      within(dialog).getByLabelText('Choose track JSON file'),
    ).toBeVisible()
    expect(
      within(collection).getByRole('button', { name: 'All tracks' }),
    ).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/tracks'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sendMessage).not.toHaveBeenCalledWith(
      'imports.apply',
      expect.anything(),
    )
  })

  it('keeps import reachable when no tracks exist', async () => {
    const original = vi.mocked(sendMessage).getMockImplementation()!
    vi.mocked(sendMessage).mockImplementation((method, request) =>
      method === 'tracks.getWorkspace'
        ? Promise.resolve(
            createTrackWorkspaceResponse({
              tracks: [],
              activeTrack: null,
              activeTrackGroups: [],
              activeTrackRows: [],
            }),
          )
        : original(method, request),
    )
    const { user } = renderDashboard('/tracks')
    await screen.findByText('No tracks yet.')
    await user.click(screen.getByRole('link', { name: 'Import tracks' }))
    expect(
      await screen.findByRole('dialog', { name: 'Import tracks' }),
    ).toBeVisible()
  })

  it.each(['Close', 'Escape', 'backdrop'])(
    'cancels a track file preview with %s without applying it',
    async (dismissal) => {
      const original = vi.mocked(sendMessage).getMockImplementation()!
      vi.mocked(sendMessage).mockImplementation((method, request) =>
        method === 'imports.preview'
          ? Promise.resolve(readyPreview)
          : original(method, request),
      )
      const { user, router } = renderDashboard('/tracks/import')
      const dialog = await screen.findByRole('dialog', {
        name: 'Import tracks',
      })
      const file = createTrackImportFile()
      await user.upload(
        within(dialog).getByLabelText('Choose track JSON file'),
        file,
      )
      await within(dialog).findByRole('button', { name: 'Import 1 addition' })
      if (dismissal === 'Close') {
        await user.click(within(dialog).getByRole('link', { name: 'Close' }))
      } else if (dismissal === 'Escape') {
        await user.keyboard('{Escape}')
      } else {
        await user.click(dialog.parentElement as HTMLElement)
      }
      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/tracks'),
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(sendMessage).not.toHaveBeenCalledWith(
        'imports.apply',
        expect.anything(),
      )
    },
  )

  it('retains keyboard focus and refreshes the collection after a track import is saved', async () => {
    const original = vi.mocked(sendMessage).getMockImplementation()!
    const preview = {
      ...readyPreview,
      additions: { ...readyPreview.additions, tracks: 1 },
    }
    let imported = false
    vi.mocked(sendMessage).mockImplementation((method, request) => {
      if (method === 'imports.preview') return Promise.resolve(preview)
      if (method === 'imports.apply') {
        imported = true
        return Promise.resolve({ status: 'saved', preview })
      }
      if (method === 'tracks.getWorkspace' && imported) {
        const workspace = createTrackWorkspaceResponse()
        return Promise.resolve({
          ...workspace,
          tracks: [
            ...workspace.tracks,
            {
              track: createSerializedTrack({
                id: 'imported-interview-track',
                slug: 'imported-interview-track',
                title: 'Imported Interview Track',
              }),
              progress: { completedCount: 0, totalCount: 2, percent: 0 },
            },
          ],
        })
      }
      return original(method, request)
    })
    const { user, router } = renderDashboard('/tracks/import')
    const dialog = await screen.findByRole('dialog', { name: 'Import tracks' })
    const file = createTrackImportFile()
    await user.upload(
      within(dialog).getByLabelText('Choose track JSON file'),
      file,
    )
    const apply = await within(dialog).findByRole('button', {
      name: 'Import 2 additions',
    })
    apply.focus()
    await user.keyboard('{Enter}')
    const status = await within(dialog).findByRole('status', {
      name: 'Content import status',
    })
    await waitFor(() =>
      expect(status).toHaveTextContent('Content imported and saved.'),
    )
    expect(status).toHaveFocus()
    await user.tab()
    expect(
      within(dialog).getByRole('button', { name: 'Dismiss import' }),
    ).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(
      within(dialog).getByLabelText('Choose track JSON file'),
    ).toHaveFocus()
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/tracks'))
    const collection = screen.getByRole('region', { name: 'All tracks' })
    expect(
      await within(collection).findByRole('article', {
        name: 'Imported Interview Track',
      }),
    ).toBeVisible()
    expect(within(collection).getByText('2 tracks')).toBeVisible()
    expect(
      within(collection).getByRole('article', { name: 'LeetCode 75' }),
    ).toHaveTextContent('Active')
    expect(sendMessage).not.toHaveBeenCalledWith(
      'tracks.setActiveTrack',
      expect.anything(),
    )
  })

  it('keeps keyboard focus inside the dialog while retrying a failed preview', async () => {
    const original = vi.mocked(sendMessage).getMockImplementation()!
    let previewCalls = 0
    let finishPreview!: (response: typeof readyPreview) => void
    const previewing = new Promise<typeof readyPreview>((resolve) => {
      finishPreview = resolve
    })
    vi.mocked(sendMessage).mockImplementation((method, request) => {
      if (method === 'imports.preview') {
        previewCalls++
        return previewCalls === 1
          ? Promise.reject(new Error('Preview failed'))
          : previewing
      }
      return original(method, request)
    })
    const { user } = renderDashboard('/tracks/import')
    const dialog = await screen.findByRole('dialog', { name: 'Import tracks' })
    const file = createTrackImportFile()
    await user.upload(
      within(dialog).getByLabelText('Choose track JSON file'),
      file,
    )
    await user.click(
      await within(dialog).findByRole('button', { name: 'Preview file again' }),
    )
    expect(
      within(dialog).getByRole('status', { name: 'Content import status' }),
    ).toHaveFocus()
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await act(async () => {
      finishPreview(readyPreview)
      await previewing
    })
    expect(
      await within(dialog).findByRole('button', { name: 'Import 1 addition' }),
    ).toBeVisible()
  })

  it('guards modal dismissal during apply and save retry, then returns to Tracks', async () => {
    const original = vi.mocked(sendMessage).getMockImplementation()!
    const preview = {
      ...readyPreview,
      additions: { ...readyPreview.additions, tracks: 1, problems: 0 },
      items: [],
    }
    let finishApply!: (response: {
      status: 'persistence-error'
      preview: typeof preview
    }) => void
    const applying = new Promise<{
      status: 'persistence-error'
      preview: typeof preview
    }>((resolve) => {
      finishApply = resolve
    })
    let finishRetry!: (response: { status: 'saved' }) => void
    const retrying = new Promise<{ status: 'saved' }>((resolve) => {
      finishRetry = resolve
    })
    vi.mocked(sendMessage).mockImplementation((method, request) => {
      if (method === 'imports.preview') return Promise.resolve(preview)
      if (method === 'imports.apply') return applying
      if (method === 'imports.retryPersistence') return retrying
      return original(method, request)
    })
    const { user, router } = renderDashboard('/tracks/import')
    const dialog = await screen.findByRole('dialog', { name: 'Import tracks' })
    const fileText = '{"format":"cognipace-content","version":1,"tracks":[]}'
    const file = createTrackImportFile(fileText)
    await user.upload(
      within(dialog).getByLabelText('Choose track JSON file'),
      file,
    )
    await user.click(
      await within(dialog).findByRole('button', { name: 'Import 1 addition' }),
    )
    const close = await within(dialog).findByRole('button', { name: 'Close' })
    expect(close).toBeDisabled()
    expect(
      within(dialog).getByRole('status', { name: 'Content import status' }),
    ).toHaveFocus()
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    await user.click(dialog.parentElement as HTMLElement)
    expect(router.state.location.pathname).toBe('/tracks/import')
    await act(async () => {
      finishApply({ status: 'persistence-error', preview })
      await applying
    })
    expect(
      await within(dialog).findByRole('button', { name: 'Retry saving' }),
    ).toBeVisible()
    expect(
      within(dialog).getByRole('button', { name: 'Retry saving' }),
    ).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(router.state.location.pathname).toBe('/tracks/import')
    await user.click(
      within(dialog).getByRole('button', { name: 'Retry saving' }),
    )
    expect(
      within(dialog).getByRole('status', { name: 'Content import status' }),
    ).toHaveFocus()
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    await user.keyboard('{Escape}')
    await user.click(dialog.parentElement as HTMLElement)
    expect(router.state.location.pathname).toBe('/tracks/import')
    await act(async () => {
      finishRetry({ status: 'saved' })
      await retrying
    })
    expect(
      await within(dialog).findByRole('status', {
        name: 'Content import status',
      }),
    ).toHaveTextContent('Content imported and saved.')
    expect(
      within(dialog).getByRole('status', { name: 'Content import status' }),
    ).toHaveFocus()
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/tracks'))
    expect(sendMessage).toHaveBeenCalledWith('imports.apply', {
      surface: 'dashboard',
      fileText,
      fingerprint: preview.fingerprint,
    })
    expect(sendMessage).not.toHaveBeenCalledWith(
      'tracks.setActiveTrack',
      expect.anything(),
    )
  })

  it('/tracks/new renders the track form over Tracks and loads options', async () => {
    const { user } = renderDashboard('/tracks/new')

    expect(await screen.findByRole('heading', { name: 'Tracks' })).toBeVisible()
    const dialog = screen.getByRole('dialog', { name: 'New Track' })
    expect(dialog).toBeVisible()
    expect(await within(dialog).findByLabelText('Title')).toBeVisible()
    expect(
      within(dialog).getByRole('button', { name: 'Select Main' }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).queryByLabelText('Group title')).toBeNull()
    const searchInput = within(dialog).getByLabelText('Search Library problems')

    expect(searchInput).toBeVisible()
    expect(within(dialog).queryByText('Two Sum')).not.toBeInTheDocument()

    await user.type(searchInput, 'two')

    expect(await within(dialog).findByText('Two Sum')).toBeVisible()
    expect(within(dialog).queryByText('Placeholder')).not.toBeInTheDocument()
    expect(sendMessage).toHaveBeenCalledWith('tracks.getTrackForEdit', {
      surface: 'dashboard',
    })
  })

  it('/library/tracks/new direct route handles a missing selection draft', async () => {
    const { router, user } = renderDashboard(
      '/library/tracks/new?draft=missing-draft',
    )

    expect(
      await screen.findByRole('heading', { name: 'Library' }),
    ).toBeVisible()
    const dialog = screen.getByRole('dialog', { name: 'New Track' })

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Track selection draft was not found.',
    )

    await user.click(
      within(dialog).getByRole('button', { name: 'Return to Library' }),
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/library')
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('/library/tracks/new handles a failed Library selection load', async () => {
    const draft = createLibrarySelectionTrackDraft(['binary-search'], {
      id: 'failed-library-load',
    })
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.reject(new Error('library failed'))
      }

      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(createTrackWorkspaceResponse())
      }

      return Promise.resolve(defaultUserSettings)
    })

    const { router, user } = renderDashboard(
      `/library/tracks/new?draft=${draft.id}`,
    )

    const dialog = await screen.findByRole('dialog', { name: 'New Track' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Selected Library problems could not be loaded.',
    )

    await user.click(
      within(dialog).getByRole('button', { name: 'Return to Library' }),
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/library')
    })
  })

  it('/library/tracks/new handles a selection draft with no available problems', async () => {
    const draft = createLibrarySelectionTrackDraft(['missing-problem'], {
      id: 'missing-problem-row',
    })
    const { router, user } = renderDashboard(
      `/library/tracks/new?draft=${draft.id}`,
    )

    const dialog = await screen.findByRole('dialog', { name: 'New Track' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No selected Library problems are still available.',
    )

    await user.click(
      within(dialog).getByRole('button', { name: 'Return to Library' }),
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/library')
    })
  })

  it('creates a track from selected Library rows', async () => {
    const { router, user } = renderDashboard('/library')

    expect(
      await screen.findByRole('heading', { name: 'Library' }),
    ).toBeVisible()

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Binary Search' }),
    )
    await user.click(screen.getByRole('button', { name: 'Make Track' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/library/tracks/new')
    })

    const dialog = await screen.findByRole('dialog', { name: 'New Track' })

    expect(
      await within(dialog).findByText('1 selected Library problems'),
    ).toBeVisible()
    expect(
      within(dialog).getByRole('listitem', { name: '1. Binary Search' }),
    ).toBeVisible()
  })

  it('/tracks/$trackId/edit direct route loads existing track composition', async () => {
    renderDashboard('/tracks/leetcode-75/edit')

    expect(
      await screen.findByRole('dialog', { name: 'Edit: LeetCode 75' }),
    ).toBeVisible()
    const dialog = screen.getByRole('dialog', { name: 'Edit: LeetCode 75' })
    expect(within(dialog).getByLabelText('Title')).toHaveValue('LeetCode 75')
    expect(within(dialog).getByLabelText('Target date')).toHaveValue(
      '2026-06-15',
    )
    const groups = within(dialog).getByLabelText('Groups')
    const arraysRow = within(groups).getByRole('listitem', {
      name: /Arrays and Hashing, 1 problem/i,
    })
    expect(
      within(arraysRow).getByRole('button', {
        name: 'Select Arrays and Hashing',
      }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(within(arraysRow).queryByLabelText('Group title')).toBeNull()
    expect(within(dialog).getByText('Two Sum')).toBeVisible()
  })

  it('opens problem edit from Tracks without replacing the Tracks workspace', async () => {
    const { router, user } = renderDashboard('/tracks')

    expect(await screen.findByRole('heading', { name: 'Tracks' })).toBeVisible()

    await user.click(
      await screen.findByRole('button', { name: 'Expand Two Sum' }),
    )
    await user.click(screen.getByRole('link', { name: 'Edit' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        '/tracks/problems/two-sum/edit',
      )
    })
    expect(screen.getByRole('heading', { name: 'Tracks' })).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Library' }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole('dialog', { name: 'Edit: Two Sum' }),
    ).toBeVisible()
  })

  it('shows a Close link while track modal form data is loading', async () => {
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(createTrackWorkspaceResponse())
      }

      if (method === 'tracks.getTrackForEdit') {
        return new Promise(() => undefined)
      }

      return Promise.resolve(defaultUserSettings)
    })

    renderDashboard('/tracks/new')

    const dialog = await screen.findByRole('dialog', { name: 'New Track' })

    expect(within(dialog).getByText('Loading track form…')).toBeVisible()
    expect(within(dialog).getByRole('link', { name: 'Close' })).toHaveAttribute(
      'href',
      '/tracks',
    )
  })

  it('shows a Close link when track modal form data fails to load', async () => {
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'tracks.getWorkspace') {
        return Promise.resolve(createTrackWorkspaceResponse())
      }

      if (method === 'tracks.getTrackForEdit') {
        return Promise.reject(new Error('load failed'))
      }

      return Promise.resolve(defaultUserSettings)
    })

    renderDashboard('/tracks/new')

    const dialog = await screen.findByRole('dialog', { name: 'New Track' })

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Failed to load track form.',
    )
    expect(within(dialog).getByRole('link', { name: 'Close' })).toHaveAttribute(
      'href',
      '/tracks',
    )
  })

  it.each([
    ['/tracks/new', '/tracks'],
    ['/tracks/leetcode-75/edit', '/tracks'],
    ['/tracks/problems/two-sum/edit', '/tracks'],
    ['/library/tracks/new?draft=missing-draft', '/library'],
    ['/library/problems/new', '/library'],
    ['/library/problems/two-sum/edit', '/library'],
  ])('closes %s to %s', async (path, closePath) => {
    const { router, user } = renderDashboard(path)

    await screen.findByRole('dialog')
    const closeLink = screen.queryByRole('link', { name: 'Close' })

    if (closeLink) {
      await user.click(closeLink)
    } else {
      await user.click(await screen.findByRole('button', { name: 'CANCEL' }))
    }

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(closePath)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not mark implemented problem modals as placeholders', () => {
    expect(dashboardModalRouteMeta.trackNew.staticData.presentation).toBe(
      'modal',
    )
    expect(dashboardModalRouteMeta.trackEdit.staticData.presentation).toBe(
      'modal',
    )
    expect(
      dashboardModalRouteMeta.trackProblemEdit.staticData.presentation,
    ).toBe('modal')
    expect(dashboardModalRouteMeta.problemNew.staticData.presentation).toBe(
      'modal',
    )
    expect(dashboardModalRouteMeta.problemEdit.staticData.presentation).toBe(
      'modal',
    )
    expect(
      dashboardModalRouteMeta.libraryTrackNew.staticData.presentation,
    ).toBe('modal')
    expect(dashboardModalRouteMeta.problemNew.description).not.toMatch(
      /later phase/i,
    )
    expect(dashboardModalRouteMeta.problemEdit.description).not.toMatch(
      /later phase/i,
    )
    expect(dashboardModalRouteMeta.trackProblemEdit.description).not.toMatch(
      /later phase/i,
    )
    expect(dashboardModalRouteMeta.trackNew.description).not.toMatch(
      /later phase/i,
    )
    expect(dashboardModalRouteMeta.trackEdit.description).not.toMatch(
      /later phase/i,
    )
    expect(dashboardModalRouteMeta.libraryTrackNew.description).toBe(
      'Create a track from selected Library problems.',
    )
    expect(dashboardPaths.libraryTrackNew).toBe('/library/tracks/new')
    expect(dashboardModalRouteMeta.libraryTrackNew.closeTo).toBe('/library')
    expect(dashboardModalRouteMeta.libraryTrackNew.relativePath).toBe(
      'tracks/new',
    )
    expect(dashboardModalRouteMeta.libraryTrackNew.staticData).toEqual({
      presentation: 'modal',
      section: 'library',
      title: 'New Track',
    })
  })

  it('closes route modals with Escape', async () => {
    const { router, user } = renderDashboard('/tracks/new')

    await screen.findByRole('dialog', { name: 'New Track' })
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tracks')
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes route modals when the backdrop is clicked', async () => {
    const { router, user } = renderDashboard('/library/problems/new')

    const dialog = await screen.findByRole('dialog', { name: 'Add problem' })
    const backdrop = dialog.parentElement

    expect(backdrop).not.toBeNull()
    await user.click(backdrop as HTMLElement)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/library')
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    ['/tracks/new', '/tracks'],
    ['/library/problems/new', '/library'],
    ['/library/tracks/new?draft=missing-draft', '/library'],
  ])('rewrites %s to %s before browser reload', async (path, parentPath) => {
    window.history.replaceState(null, '', `/#${path}`)
    renderDashboard(path)

    await screen.findByRole('dialog')
    window.dispatchEvent(new Event('beforeunload'))

    expect(window.location.hash).toBe(`#${parentPath}`)
  })

  it.each([
    ['/library/problems/two-sum/edit', 'Library', 'Tracks'],
    ['/library/tracks/new?draft=missing-draft', 'Library', 'Tracks'],
    ['/tracks/problems/two-sum/edit', 'Tracks', 'Library'],
  ])(
    'keeps parent nav active for %s',
    async (path, activeNavLabel, inactiveNavLabel) => {
      renderDashboard(path)

      expect(
        await screen.findByRole('link', { name: activeNavLabel }),
      ).toHaveAttribute('aria-current', 'page')
      expect(
        screen.getByRole('link', { name: inactiveNavLabel }),
      ).not.toHaveAttribute('aria-current')
    },
  )

  it('skips to dashboard content without changing the hash route', async () => {
    const { router, user } = renderDashboard('/library')

    expect(
      await screen.findByRole('heading', { name: 'Library' }),
    ).toBeVisible()

    await user.tab()
    expect(
      screen.getByRole('button', { name: 'Skip to content' }),
    ).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(screen.getByRole('main')).toHaveFocus()
    expect(router.state.location.pathname).toBe('/library')
  })

  it('does not define deferred destructive or backup routes', () => {
    const router = createDashboardRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const routePaths = [
      ...Object.values(dashboardPaths),
      ...Object.keys(router.routesByPath),
    ]

    expect(routePaths).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/delete|reset|backup|data-management/i),
      ]),
    )
  })
})

const notConfiguredSyncStatus = {
  enabled: false,
  configured: false,
  tokenConfigured: false,
  tokenStatus: {
    provider: 'github:gist',
    configured: false,
    updatedAt: null,
    fingerprint: null,
  },
  gistId: null,
  isSyncing: false,
  lastSyncAt: null,
  lastSyncDirection: null,
  lastPullAt: null,
  lastPushAt: null,
  needsPush: false,
  lastBlockingReason: null,
  lastError: null,
  conflict: null,
} as const

const configuredSyncStatus = {
  ...notConfiguredSyncStatus,
  enabled: true,
  configured: true,
  tokenConfigured: true,
  tokenStatus: {
    provider: 'github:gist',
    configured: true,
    updatedAt: '2026-05-26T12:00:00.000Z',
    fingerprint: 'abcdef123456',
  },
  gistId: 'gist_1',
  lastSyncAt: '2026-05-26T12:00:00.000Z',
  lastSyncDirection: 'push',
  lastPushAt: '2026-05-26T12:00:00.000Z',
} as const

function syncActionResult(
  action: SyncActionResult['action'],
  direction: SyncActionResult['direction'],
): SyncActionResult {
  return {
    action,
    direction,
    outcome: 'success',
    reason: null,
    retryable: false,
    message: 'Synced.',
    status: configuredSyncStatus,
    occurredAt: '2026-05-26T12:00:00.000Z',
  }
}
