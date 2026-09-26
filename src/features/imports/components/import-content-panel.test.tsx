import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import type {
  ImportApplyResponse,
  ImportPreviewResponse,
  ImportRetryPersistenceResponse,
} from '@/features/imports/api/import-runtime-contracts'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { ImportContentPanel } from './import-content-panel'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getURL: (path: string) => `chrome-extension://test${path}`,
    },
  },
}))

const fileText =
  '{"format":"cognipace-content","version":1,"problems":["two-sum"]}'

describe('ImportContentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('previews first, then explicitly imports and hides apply after save', async () => {
    const user = userEvent.setup()
    const preview = createPreview({ additions: { problems: 1 } })
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce({ status: 'saved', preview })
    renderPanel()

    await user.upload(fileInput(), createFile())

    expect(await status()).toHaveTextContent(
      'Review the additions below before importing.',
    )
    expect(await status()).toHaveAttribute('data-cp-tone', 'neutral')
    expect(fileInput()).toHaveValue('')
    expect(screen.getByText('content.json')).toBeVisible()
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('imports.preview', {
      surface: 'dashboard',
      fileText,
    })
    expect(
      screen.getByRole('button', { name: 'Import 1 addition' }),
    ).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Import 1 addition' }))

    const savedStatus = await status()
    expect(savedStatus).toHaveTextContent('Content imported and saved.')
    expect(savedStatus).toHaveAttribute('data-cp-tone', 'success')
    expect(
      screen.queryByRole('button', { name: 'Import 1 addition' }),
    ).not.toBeInTheDocument()
    expect(sendMessage).toHaveBeenNthCalledWith(2, 'imports.apply', {
      surface: 'dashboard',
      fileText,
      fingerprint: preview.fingerprint,
    })
    expect(
      screen.queryByText(/fingerprint|transaction/i),
    ).not.toBeInTheDocument()
  })

  it('shows every addition count and labels relationship additions clearly', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createPreview({
        additions: {
          problems: 1,
          topics: 2,
          companies: 3,
          problemTopics: 4,
          problemCompanies: 5,
          tracks: 6,
          groups: 7,
          memberships: 8,
        },
      }),
    )
    renderPanel()

    await user.upload(fileInput(), createFile())
    const preview = screen.getByRole('region', { name: 'Import preview' })

    expect(within(preview).getByText('36 additions')).toBeVisible()
    for (const [label, count] of [
      ['Problems added', '1'],
      ['Topics added', '2'],
      ['Companies added', '3'],
      ['Problem-topic links added', '4'],
      ['Problem-company links added', '5'],
      ['Tracks added', '6'],
      ['Track groups added', '7'],
      ['Track-question links added', '8'],
    ] as const) {
      const labelElement = within(preview).getByText(label)
      expect(labelElement.nextElementSibling).toHaveTextContent(count)
    }
  })

  it('shows skipped diagnostics for a file containing null entries', async () => {
    const user = userEvent.setup()
    const nullFileText =
      '{"format":"cognipace-content","version":1,"problems":[null]}'
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createPreview({
        status: 'empty',
        fingerprint: null,
        diagnostics: [
          {
            severity: 'warning',
            code: 'entry-skipped',
            path: '$.problems[0]',
            message: 'Null entry was ignored.',
          },
        ],
      }),
    )
    renderPanel()

    await user.upload(fileInput(), createFile(nullFileText))
    expect(await status()).toHaveTextContent(
      'No usable content was found. Check the format and reported entries.',
    )
    await user.click(screen.getByText('Diagnostics (1)'))
    expect(screen.getByText('$.problems[0]')).toBeVisible()
    expect(screen.getByText('Null entry was ignored.')).toBeVisible()
    expect(sendMessage).toHaveBeenCalledWith('imports.preview', {
      surface: 'dashboard',
      fileText: nullFileText,
    })
    expect(
      screen.queryByRole('button', { name: /Import/ }),
    ).not.toBeInTheDocument()
  })

  it('paginates diagnostic rows and resets to the first page for new diagnostics', async () => {
    const user = userEvent.setup()
    const firstDiagnostics = Array.from({ length: 26 }, (_, index) => ({
      severity: 'warning' as const,
      code: 'entry-skipped',
      path: `$.problems[${index}]`,
      message: `Skipped entry ${index + 1}.`,
    }))
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(
        createPreview({
          status: 'empty',
          fingerprint: null,
          diagnostics: firstDiagnostics,
        }),
      )
      .mockResolvedValueOnce(
        createPreview({
          status: 'empty',
          fingerprint: null,
          diagnostics: [
            {
              severity: 'warning',
              code: 'entry-skipped',
              path: '$.topics[0]',
              message: 'Skipped the replacement entry.',
            },
          ],
        }),
      )
    renderPanel()

    await user.upload(fileInput(), createFile())
    await user.click(screen.getByText('Diagnostics (26)'))
    expect(screen.getByText('Showing 1–25 of 26')).toBeVisible()
    expect(screen.getByText('Skipped entry 25.')).toBeVisible()
    expect(screen.queryByText('Skipped entry 26.')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Next diagnostic page' }),
    )
    expect(screen.getByText('Showing 26–26 of 26')).toBeVisible()
    expect(screen.getByText('Skipped entry 26.')).toBeVisible()

    await user.upload(fileInput(), createFile('replacement.json'))
    await user.click(screen.getByText('Diagnostics (1)'))
    expect(screen.getByText('Showing 1–1 of 1')).toBeVisible()
    expect(screen.getByText('Skipped the replacement entry.')).toBeVisible()
  })

  it('jumps directly through a large diagnostic list and announces the result range', async () => {
    const user = userEvent.setup()
    const diagnostics = Array.from({ length: 50_000 }, (_, index) => ({
      severity: 'warning' as const,
      code: 'entry-skipped',
      path: `$.problems[${index}]`,
      message: `Skipped entry ${index + 1}.`,
    }))
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createPreview({
        status: 'empty',
        fingerprint: null,
        diagnostics,
      }),
    )
    renderPanel()

    await user.upload(fileInput(), createFile())
    await user.click(screen.getByText('Diagnostics (50000)'))

    const pageInput = screen.getByRole('spinbutton', {
      name: 'Diagnostic page number',
    })
    expect(pageInput).toHaveAttribute('max', '2000')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()

    await user.clear(pageInput)
    await user.type(pageInput, '2000')
    await user.click(
      screen.getByRole('button', { name: 'Go to diagnostic page' }),
    )

    const rangeAnnouncement = screen.getByRole('status', {
      name: 'Diagnostic results',
    })
    expect(rangeAnnouncement).toHaveAttribute('aria-live', 'polite')
    expect(rangeAnnouncement).toHaveTextContent('Showing 49976–50000 of 50000')
    expect(screen.getByText('Skipped entry 50000.')).toBeVisible()
  })

  it('paginates every planned item and renders HTML-looking values as text', async () => {
    const user = userEvent.setup()
    const items = Array.from({ length: 26 }, (_, index) => ({
      kind: 'problems' as const,
      identity: `problem-${index + 1}`,
      label:
        index === 25 ? '<img src=x onerror=alert(1)>' : `Problem ${index + 1}`,
      action: 'add' as const,
      path: `$.problems[${index}]`,
    }))
    vi.mocked(sendMessage).mockResolvedValueOnce(createPreview({ items }))
    renderPanel()

    await user.upload(fileInput(), createFile())
    await user.click(screen.getByText('Planned items (26)'))
    expect(screen.getByText('Showing 1–25 of 26')).toBeVisible()
    expect(
      screen.queryByText('<img src=x onerror=alert(1)>'),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Next planned item page' }),
    )
    expect(screen.getByText('Showing 26–26 of 26')).toBeVisible()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    const pageInput = screen.getByRole('spinbutton', {
      name: 'Planned item page number',
    })
    await user.clear(pageInput)
    await user.type(pageInput, '1{Enter}')
    expect(screen.getByText('Showing 1–25 of 26')).toBeVisible()
    expect(screen.getByText('Problem 1')).toBeVisible()
    expect(
      screen.queryByText('<img src=x onerror=alert(1)>'),
    ).not.toBeInTheDocument()
  })

  it('shows the stale preview message before generic ready copy', async () => {
    const user = userEvent.setup()
    const firstPreview = createPreview({ additions: { problems: 1 } })
    const updatedPreview = createPreview({ additions: { problems: 2 } })
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(firstPreview)
      .mockResolvedValueOnce({ status: 'stale', preview: updatedPreview })
    renderPanel()

    await user.upload(fileInput(), createFile())
    await user.click(screen.getByRole('button', { name: 'Import 1 addition' }))

    const staleStatus = await status()
    expect(staleStatus).toHaveTextContent(
      'Local content changed. Review the updated preview before importing.',
    )
    expect(staleStatus).toHaveAttribute('data-cp-tone', 'warning')
    expect(
      screen.getByRole('button', { name: 'Import 2 additions' }),
    ).toBeVisible()
  })

  it('offers only a persistence retry and reports a saved retry', async () => {
    const user = userEvent.setup()
    const preview = createPreview({ additions: { problems: 1 } })
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce({ status: 'persistence-error', preview })
      .mockResolvedValueOnce({
        status: 'saved',
      } satisfies ImportRetryPersistenceResponse)
    renderPanel()

    await user.upload(fileInput(), createFile())
    await user.click(screen.getByRole('button', { name: 'Import 1 addition' }))
    const persistenceStatus = await status()
    expect(persistenceStatus).toHaveTextContent(
      'Content was added, but saving it to browser storage failed. Retry saving before closing the extension.',
    )
    expect(persistenceStatus).toHaveAttribute('data-cp-tone', 'warning')
    expect(screen.getByRole('button', { name: 'Retry saving' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Dismiss import' }),
    ).toBeDisabled()
    expect(fileInput()).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /Import/ }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry saving' }))
    expect(await status()).toHaveTextContent('Content imported and saved.')
    expect(
      screen.queryByRole('button', { name: 'Retry saving' }),
    ).not.toBeInTheDocument()
  })

  it('explains when every entry already exists without offering apply', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createPreview({ status: 'unchanged', fingerprint: null }),
    )
    renderPanel()

    await user.upload(fileInput(), createFile())

    expect(await status()).toHaveTextContent(
      'Everything in this file is already present. No changes are needed.',
    )
    expect(
      screen.queryByRole('button', { name: /Import/ }),
    ).not.toBeInTheDocument()
  })

  it('blocks fatal files with an error status and no write action', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValueOnce(
      createPreview({
        status: 'blocked',
        fingerprint: null,
        diagnostics: [
          {
            severity: 'error',
            code: 'unsupported-version',
            path: '$.version',
            message: 'This format version is not supported.',
          },
        ],
      }),
    )
    renderPanel()

    await user.upload(fileInput(), createFile())
    const blockedStatus = await status()
    expect(blockedStatus).toHaveTextContent(
      'This file cannot be imported. Review the errors below.',
    )
    expect(blockedStatus).toHaveAttribute('data-cp-tone', 'danger')
    expect(
      screen.queryByRole('button', { name: /Import/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Retry saving' }),
    ).not.toBeInTheDocument()
  })

  it('exposes accessible loading state and disables duplicate write controls', async () => {
    const user = userEvent.setup()
    const preview = createPreview({ additions: { problems: 1 } })
    const apply = deferred<ImportApplyResponse>()
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(preview)
      .mockImplementationOnce(() => apply.promise)
    renderPanel()

    await user.upload(fileInput(), createFile())
    const panel = screen.getByRole('region', { name: 'Import content' })
    const applyButton = screen.getByRole('button', {
      name: 'Import 1 addition',
    })
    await user.click(applyButton)

    expect(await status()).toHaveTextContent('Importing content…')
    expect(panel).toHaveAttribute('aria-busy', 'true')
    expect(applyButton).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Dismiss import' }),
    ).toBeDisabled()
    expect(fileInput()).toBeDisabled()
    await user.click(applyButton)
    expect(sendMessage).toHaveBeenCalledTimes(2)

    await act(() => {
      apply.resolve({ status: 'saved', preview })
      return Promise.resolve()
    })
    expect(await status()).toHaveTextContent('Content imported and saved.')
  })

  it('announces file reading and previewing through the busy panel status', async () => {
    const user = userEvent.setup()
    const read = deferred<string>()
    const preview = deferred<ImportPreviewResponse>()
    vi.mocked(sendMessage).mockImplementation(() => preview.promise)
    renderPanel()
    const file = createFile()
    Object.defineProperty(file, 'text', { value: () => read.promise })

    await user.upload(fileInput(), file)
    const panel = screen.getByRole('region', { name: 'Import content' })
    expect(await status()).toHaveTextContent('Reading file…')
    expect(panel).toHaveAttribute('aria-busy', 'true')

    await act(() => {
      read.resolve(fileText)
      return Promise.resolve()
    })
    expect(await status()).toHaveTextContent('Checking content…')
    expect(sendMessage).toHaveBeenCalledWith('imports.preview', {
      surface: 'dashboard',
      fileText,
    })

    await act(() => {
      preview.resolve(createPreview())
      return Promise.resolve()
    })
    expect(await status()).toHaveTextContent(
      'Review the additions below before importing.',
    )
    expect(panel).not.toHaveAttribute('aria-busy', 'true')
  })

  it('announces a persistence retry while keeping dismissal disabled', async () => {
    const user = userEvent.setup()
    const preview = createPreview({ additions: { problems: 1 } })
    const retry = deferred<ImportRetryPersistenceResponse>()
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce({ status: 'persistence-error', preview })
      .mockImplementationOnce(() => retry.promise)
    renderPanel()

    await user.upload(fileInput(), createFile())
    await user.click(screen.getByRole('button', { name: 'Import 1 addition' }))
    await user.click(screen.getByRole('button', { name: 'Retry saving' }))

    const panel = screen.getByRole('region', { name: 'Import content' })
    expect(await status()).toHaveTextContent('Retrying save…')
    expect(panel).toHaveAttribute('aria-busy', 'true')
    expect(
      screen.getByRole('button', { name: 'Dismiss import' }),
    ).toBeDisabled()
    expect(fileInput()).toBeDisabled()

    await act(() => {
      retry.resolve({ status: 'saved' })
      return Promise.resolve()
    })
    expect(await status()).toHaveTextContent('Content imported and saved.')
    expect(panel).not.toHaveAttribute('aria-busy', 'true')
  })

  it('offers preview recovery after an unconfirmed apply delivery', async () => {
    const user = userEvent.setup()
    const preview = createPreview({ additions: { problems: 1 } })
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(preview)
      .mockRejectedValueOnce(new Error('worker unavailable'))
      .mockResolvedValueOnce(preview)
    renderPanel()

    await user.upload(fileInput(), createFile())
    await user.click(screen.getByRole('button', { name: 'Import 1 addition' }))

    expect(await status()).toHaveTextContent(
      'The import result could not be confirmed. Preview the file again before retrying.',
    )
    expect(
      screen.getByRole('button', { name: 'Preview file again' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Preview file again' }))
    expect(await status()).toHaveTextContent(
      'Review the additions below before importing.',
    )
  })

  it('provides packaged examples and schema links with the format help', async () => {
    renderPanel()
    const links = [
      ['Minimal questions', 'minimal-problems.json'],
      ['Detailed questions', 'detailed-problems.json'],
      ['Companies', 'companies.json'],
      ['Topics', 'topics.json'],
      ['Tracks', 'track-only.json'],
      ['Combined content', 'combined.json'],
    ] as const

    for (const [label, filename] of links) {
      const link = screen.getByRole('link', { name: label })
      expect(link).toHaveAttribute(
        'href',
        `chrome-extension://test/import/examples/${filename}`,
      )
      expect(link).toHaveAttribute('download', filename)
    }
    expect(screen.getByRole('link', { name: 'JSON schema' })).toHaveAttribute(
      'href',
      'chrome-extension://test/import/cognipace-content-v1.schema.json',
    )
    await userEvent.setup().click(screen.getByText('How importing works'))
    expect(screen.getByText(/null values are ignored/i)).toBeVisible()
    expect(
      screen.getByText(/preserving existing content and progress/i),
    ).toBeVisible()
    expect(screen.getByText(/5 MiB of UTF-8 bytes/i)).toBeVisible()
    expect(
      screen.getByText(
        /50,000 total entries across all arrays, including nested arrays/i,
      ),
    ).toBeVisible()
  })
})

function renderPanel() {
  const { wrapper } = createQueryTestHarness()
  return render(<ImportContentPanel />, { wrapper })
}

function fileInput() {
  return screen.getByLabelText('Choose content JSON file')
}

function createFile(contents = fileText, name = 'content.json') {
  return new File([contents], name, { type: 'application/json' })
}

async function status() {
  return screen.findByRole('status', { name: 'Content import status' })
}

function createPreview(
  overrides: Omit<Partial<ImportPreviewResponse>, 'additions'> & {
    additions?: Partial<ImportPreviewResponse['additions']>
  } = {},
): ImportPreviewResponse {
  const { additions, ...otherOverrides } = overrides
  return {
    status: 'ready',
    fingerprint: 'a'.repeat(64),
    items: [],
    diagnostics: [],
    ...otherOverrides,
    additions: {
      problems: 0,
      topics: 0,
      companies: 0,
      problemTopics: 0,
      problemCompanies: 0,
      tracks: 0,
      groups: 0,
      memberships: 0,
      ...additions,
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
