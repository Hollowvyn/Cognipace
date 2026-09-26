import { useCallback, useEffect, useRef, useState } from 'react'

import { maxImportBytes } from '@/features/imports/api/content-file-contracts'
import type { ImportPreviewResponse } from '@/features/imports/api/import-runtime-contracts'

import {
  useApplyContentImport,
  usePreviewContentImport,
  useRetryImportPersistence,
} from '../api/imports-api'

export type ContentImportStep =
  | 'idle'
  | 'reading'
  | 'previewing'
  | 'preview'
  | 'applying'
  | 'saved'
  | 'persistence-error'
  | 'retrying'
  | 'error'

export type ContentImportState = {
  step: ContentImportStep
  fileName: string | null
  fileText: string | null
  preview: ImportPreviewResponse | null
  message: string | null
}

type PreviewFailureStep = 'error' | 'persistence-error'

const initialState: ContentImportState = {
  step: 'idle',
  fileName: null,
  fileText: null,
  preview: null,
  message: null,
}

const oversizedFileMessage =
  'This file is larger than the 5 MiB limit. Choose a file that is 5 MiB or smaller.'
const readFailureMessage =
  'This file could not be read. Choose another file and try again.'
const previewFailureMessage =
  'This file could not be previewed. Check your connection and preview it again.'
const applyFailureMessage =
  'The import could not be confirmed. Preview the file again before trying another import.'
const retryFailureMessage =
  'The save could not be confirmed. You can retry saving this import.'

export function useContentImport() {
  const previewMutation = usePreviewContentImport()
  const applyMutation = useApplyContentImport()
  const retryMutation = useRetryImportPersistence()
  const [state, setState] = useState<ContentImportState>(initialState)
  const selectionGeneration = useRef(0)
  const writeLock = useRef(false)

  useEffect(
    () => () => {
      selectionGeneration.current += 1
    },
    [],
  )

  const isCurrent = useCallback(
    (generation: number) => generation === selectionGeneration.current,
    [],
  )

  const previewText = useCallback(
    async (
      fileName: string,
      fileText: string,
      generation: number,
      failureStep: PreviewFailureStep = 'error',
    ) => {
      if (!isCurrent(generation)) return null

      setState({
        step: 'previewing',
        fileName,
        fileText,
        preview: null,
        message: null,
      })

      try {
        const preview = await previewMutation.mutateAsync(fileText)
        if (!isCurrent(generation)) return null

        setState({
          step: 'preview',
          fileName,
          fileText,
          preview,
          message: previewMessage(preview),
        })
        return preview
      } catch {
        if (!isCurrent(generation)) return null

        setState((current) => ({
          ...current,
          step: failureStep,
          fileName,
          fileText,
          preview: null,
          message:
            failureStep === 'persistence-error'
              ? retryFailureMessage
              : previewFailureMessage,
        }))
        return null
      }
    },
    [isCurrent, previewMutation],
  )

  const selectFile = useCallback(
    async (file: File | null) => {
      if (writeLock.current) return

      const generation = ++selectionGeneration.current
      if (file === null) {
        if (state.step === 'reading' || state.step === 'previewing') {
          setState(initialState)
        }
        return
      }

      if (file.size > maxImportBytes) {
        setState({
          step: 'error',
          fileName: file.name,
          fileText: null,
          preview: null,
          message: oversizedFileMessage,
        })
        return
      }

      setState({
        step: 'reading',
        fileName: file.name,
        fileText: null,
        preview: null,
        message: null,
      })

      let fileText: string
      try {
        fileText = await readFileText(file)
        if (!isCurrent(generation)) return
      } catch {
        if (!isCurrent(generation)) return
        setState({
          step: 'error',
          fileName: file.name,
          fileText: null,
          preview: null,
          message: readFailureMessage,
        })
        return
      }

      await previewText(file.name, fileText, generation)
    },
    [isCurrent, previewText, state.step],
  )

  const clear = useCallback(() => {
    if (writeLock.current) return

    selectionGeneration.current += 1
    previewMutation.reset()
    applyMutation.reset()
    retryMutation.reset()
    setState(initialState)
  }, [applyMutation, previewMutation, retryMutation])

  const apply = useCallback(async () => {
    if (writeLock.current) return

    const currentState = state
    const preview = currentState.preview
    const fileText = currentState.fileText
    const fileName = currentState.fileName
    if (
      currentState.step !== 'preview' ||
      preview?.status !== 'ready' ||
      !preview.fingerprint ||
      fileText === null
    ) {
      return
    }

    writeLock.current = true
    const generation = selectionGeneration.current
    setState({ ...currentState, step: 'applying', message: null })

    try {
      const response = await applyMutation.mutateAsync({
        fileText,
        fingerprint: preview.fingerprint,
      })
      if (!isCurrent(generation)) return

      switch (response.status) {
        case 'saved':
          setState({
            step: 'saved',
            fileName,
            fileText: null,
            preview: response.preview,
            message: 'Import saved.',
          })
          break
        case 'persistence-error':
          setState({
            step: 'persistence-error',
            fileName,
            fileText,
            preview: response.preview,
            message:
              'The import was applied, but its local save needs to be retried.',
          })
          break
        case 'stale':
          setState({
            step: 'preview',
            fileName,
            fileText,
            preview: response.preview,
            message:
              'Local data changed after this preview. Review the updated preview before importing.',
          })
          break
        case 'unchanged':
          setState({
            step: 'preview',
            fileName,
            fileText,
            preview: response.preview,
            message:
              'This content is already up to date. There is nothing to import.',
          })
          break
        case 'blocked':
          setState({
            step: 'preview',
            fileName,
            fileText,
            preview: response.preview,
            message: 'Review the diagnostics. This import is blocked.',
          })
          break
      }
    } catch {
      if (!isCurrent(generation)) return
      setState({
        step: 'error',
        fileName,
        fileText,
        preview,
        message: applyFailureMessage,
      })
    } finally {
      writeLock.current = false
    }
  }, [applyMutation, isCurrent, state])

  const retryPersistence = useCallback(async () => {
    if (writeLock.current || state.step !== 'persistence-error') return

    const fileName = state.fileName
    const fileText = state.fileText
    const preview = state.preview
    if (fileText === null) return

    writeLock.current = true
    const generation = selectionGeneration.current
    setState({ ...state, step: 'retrying', message: null })

    try {
      const response = await retryMutation.mutateAsync()
      if (!isCurrent(generation)) return

      if (response.status === 'saved') {
        setState({
          step: 'saved',
          fileName,
          fileText: null,
          preview,
          message: 'Import saved.',
        })
      } else if (response.status === 'persistence-error') {
        setState({
          step: 'persistence-error',
          fileName,
          fileText,
          preview,
          message: retryFailureMessage,
        })
      } else {
        const nextGeneration = ++selectionGeneration.current
        await previewText(
          fileName ?? 'Import file',
          fileText,
          nextGeneration,
          'persistence-error',
        )
      }
    } catch {
      if (!isCurrent(generation)) return
      setState({
        step: 'persistence-error',
        fileName,
        fileText,
        preview,
        message: retryFailureMessage,
      })
    } finally {
      writeLock.current = false
    }
  }, [isCurrent, previewText, retryMutation, state])

  const previewAgain = useCallback(async () => {
    if (
      writeLock.current ||
      state.fileText === null ||
      (state.step !== 'error' && state.step !== 'preview')
    ) {
      return
    }

    const generation = ++selectionGeneration.current
    await previewText(
      state.fileName ?? 'Import file',
      state.fileText,
      generation,
    )
  }, [previewText, state])

  return {
    state,
    selectFile,
    clear,
    apply,
    retryPersistence,
    previewAgain,
  }
}

async function readFileText(file: File) {
  if ('text' in file && typeof file.text === 'function') {
    return file.text()
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Failed to read import file.'))
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read import file.'))
    })
    reader.readAsText(file)
  })
}

function previewMessage(preview: ImportPreviewResponse) {
  switch (preview.status) {
    case 'ready':
      return null
    case 'unchanged':
      return 'This content is already up to date. There is nothing to import.'
    case 'empty':
      return 'This file does not contain any importable content.'
    case 'blocked':
      return 'Review the diagnostics. This import is blocked.'
  }
}
