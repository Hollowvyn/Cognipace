import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { maxImportBytes } from '@/features/imports/api/content-file-contracts'
import type {
  ImportApplyResponse,
  ImportPreviewResponse,
} from '@/features/imports/api/import-runtime-contracts'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { readyPreview, secondPreview } from '../testing/import-fixtures'
import { useContentImport } from './use-content-import'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

const fileText = '{"format":"cognipace-content","version":1}'

describe('useContentImport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects files above 5 MiB before reading or calling the runtime', async () => {
    const file = createFile('large.json', fileText, maxImportBytes + 1)
    const { result } = setup()

    await act(async () => result.current.selectFile(file.file))

    expect(file.readText).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
    expect(result.current.state.step).toBe('error')
    expect(result.current.state.message).toContain('5 MiB')
  })

  it('does not preview or apply when reading the file fails', async () => {
    const file = createFile('broken.json', fileText)
    file.readText.mockRejectedValue(new Error('read failure'))
    const { result } = setup()

    await act(async () => result.current.selectFile(file.file))
    await act(async () => result.current.apply())

    expect(sendMessage).not.toHaveBeenCalled()
    expect(result.current.state.step).toBe('error')
    expect(result.current.state.fileText).toBeNull()
  })

  it('previews the exact file text and waits for an explicit apply', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(readyPreview)
    const file = createFile('content.json', fileText)
    const { result } = setup()

    await act(async () => result.current.selectFile(file.file))

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('imports.preview', {
      surface: 'dashboard',
      fileText,
    })
    expect(result.current.state).toMatchObject({
      step: 'preview',
      fileName: 'content.json',
      fileText,
      preview: readyPreview,
    })
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('uses FileReader when File.text is unavailable', async () => {
    const listeners = new Map<string, EventListener>()
    const reader = {
      result: fileText,
      error: null,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener)
      }),
      readAsText: vi.fn(() =>
        listeners.get('load')?.(new ProgressEvent('load')),
      ),
    }
    vi.stubGlobal('FileReader', function MockFileReader() {
      return reader as unknown as FileReader
    })
    vi.mocked(sendMessage).mockResolvedValueOnce(readyPreview)
    const file = { name: 'fallback.json', size: fileText.length } as File
    const { result } = setup()

    await act(async () => result.current.selectFile(file))

    expect(reader.readAsText).toHaveBeenCalledExactlyOnceWith(file)
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('imports.preview', {
      surface: 'dashboard',
      fileText,
    })
  })

  it('ignores a file read that finishes after clear', async () => {
    const read = deferred<string>()
    const file = createFile('old.json', fileText)
    file.readText.mockReturnValue(read.promise)
    const { result } = setup()

    let selecting!: Promise<void>
    act(() => {
      selecting = result.current.selectFile(file.file)
    })
    act(() => result.current.clear())
    await act(async () => {
      read.resolve(fileText)
      await selecting
    })

    expect(sendMessage).not.toHaveBeenCalled()
    expect(result.current.state.step).toBe('idle')
  })

  it('ignores an older file read after a replacement selection', async () => {
    const oldRead = deferred<string>()
    const oldFile = createFile('old.json', 'old text')
    oldFile.readText.mockReturnValue(oldRead.promise)
    const newFile = createFile('new.json', fileText)
    vi.mocked(sendMessage).mockResolvedValueOnce(readyPreview)
    const { result } = setup()

    let oldSelection!: Promise<void>
    act(() => {
      oldSelection = result.current.selectFile(oldFile.file)
    })
    await act(async () => result.current.selectFile(newFile.file))
    await act(async () => {
      oldRead.resolve('old text')
      await oldSelection
    })

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('imports.preview', {
      surface: 'dashboard',
      fileText,
    })
    expect(result.current.state.fileName).toBe('new.json')
    expect(result.current.state.fileText).toBe(fileText)
  })

  it('does not let a deferred preview for file A replace file B', async () => {
    const previewA = deferred<ImportPreviewResponse>()
    const previewB = deferred<ImportPreviewResponse>()
    vi.mocked(sendMessage)
      .mockImplementationOnce(() => previewA.promise)
      .mockImplementationOnce(() => previewB.promise)
    const { result } = setup()

    let selectingA!: Promise<void>
    act(() => {
      selectingA = result.current.selectFile(createFile('a.json', 'A').file)
    })
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    let selectingB!: Promise<void>
    act(() => {
      selectingB = result.current.selectFile(createFile('b.json', 'B').file)
    })
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    await act(async () => {
      previewB.resolve(secondPreview)
      await selectingB
    })
    await act(async () => {
      previewA.resolve(readyPreview)
      await selectingA
    })

    expect(result.current.state).toMatchObject({
      step: 'preview',
      fileName: 'b.json',
      fileText: 'B',
      preview: secondPreview,
    })
  })

  it('allows only one apply while the first request is in flight', async () => {
    const apply = deferred<ImportApplyResponse>()
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(readyPreview)
      .mockImplementationOnce(() => apply.promise)
    const { result } = setup()
    await act(async () => result.current.selectFile(createFile().file))

    let firstApply!: Promise<void>
    let duplicateApply!: Promise<void>
    act(() => {
      firstApply = result.current.apply()
      duplicateApply = result.current.apply()
    })
    expect(result.current.state.step).toBe('applying')
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    expect(sendMessage).toHaveBeenLastCalledWith('imports.apply', {
      surface: 'dashboard',
      fileText,
      fingerprint: readyPreview.fingerprint,
    })

    await act(async () => {
      apply.resolve({ status: 'saved', preview: readyPreview })
      await Promise.all([firstApply, duplicateApply])
    })
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('requires a second explicit apply after a stale fingerprint', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(readyPreview)
      .mockResolvedValueOnce({ status: 'stale', preview: secondPreview })
      .mockResolvedValueOnce({ status: 'saved', preview: secondPreview })
    const { result } = setup()
    await act(async () => result.current.selectFile(createFile().file))

    await act(async () => result.current.apply())

    expect(result.current.state).toMatchObject({
      step: 'preview',
      preview: secondPreview,
    })
    expect(result.current.state.message).toMatch(/changed/i)
    expect(sendMessage).toHaveBeenCalledTimes(2)

    await act(async () => result.current.apply())

    expect(sendMessage).toHaveBeenCalledTimes(3)
    expect(result.current.state.step).toBe('saved')
  })

  it('clears raw text after save and will not apply again', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(readyPreview)
      .mockResolvedValueOnce({ status: 'saved', preview: readyPreview })
    const { result } = setup()
    await act(async () => result.current.selectFile(createFile().file))

    await act(async () => result.current.apply())
    await act(async () => result.current.apply())

    expect(result.current.state).toMatchObject({
      step: 'saved',
      fileText: null,
      preview: readyPreview,
    })
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('retries a persistence snapshot without issuing a second apply', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(readyPreview)
      .mockResolvedValueOnce({
        status: 'persistence-error',
        preview: readyPreview,
      })
      .mockResolvedValueOnce({ status: 'saved' })
    const { result } = setup()
    await act(async () => result.current.selectFile(createFile().file))
    await act(async () => result.current.apply())
    expect(result.current.state.step).toBe('persistence-error')

    await act(async () => result.current.previewAgain())
    expect(sendMessage).toHaveBeenCalledTimes(2)

    await act(async () => result.current.retryPersistence())

    expect(sendMessage).toHaveBeenNthCalledWith(3, 'imports.retryPersistence', {
      surface: 'dashboard',
    })
    expect(sendMessage).toHaveBeenCalledTimes(3)
    expect(result.current.state).toMatchObject({
      step: 'saved',
      fileText: null,
    })
  })

  it('repreviews after a worker restart and waits for another explicit apply', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(readyPreview)
      .mockResolvedValueOnce({
        status: 'persistence-error',
        preview: readyPreview,
      })
      .mockResolvedValueOnce({ status: 'repreview' })
      .mockResolvedValueOnce(secondPreview)
      .mockResolvedValueOnce({ status: 'saved', preview: secondPreview })
    const { result } = setup()
    await act(async () => result.current.selectFile(createFile().file))
    await act(async () => result.current.apply())

    await act(async () => result.current.retryPersistence())

    expect(result.current.state).toMatchObject({
      step: 'preview',
      fileText,
      preview: secondPreview,
    })
    expect(sendMessage).toHaveBeenCalledTimes(4)

    await act(async () => result.current.apply())
    expect(sendMessage).toHaveBeenCalledTimes(5)
    expect(sendMessage).toHaveBeenLastCalledWith('imports.apply', {
      surface: 'dashboard',
      fileText,
      fingerprint: secondPreview.fingerprint,
    })
    expect(result.current.state.step).toBe('saved')
  })

  it('does not retry an apply delivery failure and offers preview recovery', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(readyPreview)
      .mockRejectedValueOnce(new Error('worker unavailable'))
      .mockResolvedValueOnce(secondPreview)
    const { result } = setup()
    await act(async () => result.current.selectFile(createFile().file))

    await act(async () => result.current.apply())

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(result.current.state).toMatchObject({ step: 'error', fileText })
    expect(result.current.state.message).toMatch(/preview the file again/i)

    await act(async () => result.current.previewAgain())
    expect(sendMessage).toHaveBeenCalledTimes(3)
    expect(result.current.state).toMatchObject({
      step: 'preview',
      preview: secondPreview,
    })
  })

  it('ignores file selection and clear while applying', async () => {
    const apply = deferred<ImportApplyResponse>()
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(readyPreview)
      .mockImplementationOnce(() => apply.promise)
    const { result } = setup()
    await act(async () => result.current.selectFile(createFile().file))

    let applying!: Promise<void>
    act(() => {
      applying = result.current.apply()
    })
    await act(async () =>
      result.current.selectFile(createFile('other.json', 'other').file),
    )
    act(() => result.current.clear())
    expect(result.current.state.step).toBe('applying')
    expect(result.current.state.fileText).toBe(fileText)

    await act(async () => {
      apply.resolve({ status: 'saved', preview: readyPreview })
      await applying
    })
    expect(result.current.state.step).toBe('saved')
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('keeps the persistence retry available when retry delivery fails', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(readyPreview)
      .mockResolvedValueOnce({
        status: 'persistence-error',
        preview: readyPreview,
      })
      .mockRejectedValueOnce(new Error('worker restarted again'))
    const { result } = setup()
    await act(async () => result.current.selectFile(createFile().file))
    await act(async () => result.current.apply())

    await act(async () => result.current.retryPersistence())

    expect(result.current.state).toMatchObject({
      step: 'persistence-error',
      fileText,
      preview: readyPreview,
    })
    expect(result.current.state.message).toMatch(/retry/i)
    expect(sendMessage).toHaveBeenCalledTimes(3)
  })

  it.each(['unchanged', 'blocked'] as const)(
    'does not offer another apply after the apply result is %s',
    async (status) => {
      const terminalPreview: ImportPreviewResponse = {
        ...readyPreview,
        status,
        fingerprint: null,
      }
      vi.mocked(sendMessage)
        .mockResolvedValueOnce(readyPreview)
        .mockResolvedValueOnce({ status, preview: terminalPreview })
      const { result } = setup()
      await act(async () => result.current.selectFile(createFile().file))

      await act(async () => result.current.apply())
      await act(async () => result.current.apply())

      expect(result.current.state).toMatchObject({
        step: 'preview',
        preview: terminalPreview,
      })
      expect(sendMessage).toHaveBeenCalledTimes(2)
    },
  )

  it('invalidates pending work when selection is canceled', async () => {
    const read = deferred<string>()
    const file = createFile('pending.json', fileText)
    file.readText.mockReturnValue(read.promise)
    const { result } = setup()

    let selecting!: Promise<void>
    act(() => {
      selecting = result.current.selectFile(file.file)
    })
    await act(async () => result.current.selectFile(null))
    await act(async () => {
      read.resolve(fileText)
      await selecting
    })

    expect(sendMessage).not.toHaveBeenCalled()
    expect(result.current.state.step).toBe('idle')
  })
})

function setup() {
  const { wrapper } = createQueryTestHarness()
  return renderHook(() => useContentImport(), { wrapper })
}

function createFile(
  name = 'content.json',
  contents = fileText,
  size = new TextEncoder().encode(contents).byteLength,
) {
  const readText = vi.fn<() => Promise<string>>().mockResolvedValue(contents)
  return {
    file: { name, size, text: readText } as unknown as File,
    readText,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
