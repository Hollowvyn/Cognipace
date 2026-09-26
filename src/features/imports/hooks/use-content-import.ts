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
  issue:
    | 'too-large'
    | 'read-failed'
    | 'preview-failed'
    | 'apply-unconfirmed'
    | 'stale'
    | null
}

type PreviewFailureStep = 'error' | 'persistence-error'

const initialState: ContentImportState = {
  step: 'idle',
  fileName: null,
  fileText: null,
  preview: null,
  issue: null,
}

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
        issue: null,
      })

      try {
        const preview = await previewMutation.mutateAsync(fileText)
        if (!isCurrent(generation)) return null

        setState({
          step: 'preview',
          fileName,
          fileText,
          preview,
          issue: null,
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
          issue: failureStep === 'error' ? 'preview-failed' : null,
        }))
        return null
      }
    },
    [isCurrent, previewMutation],
  )

  const selectFile = useCallback(
    async (file: File) => {
      if (writeLock.current || state.step === 'persistence-error') return

      const generation = ++selectionGeneration.current
      if (file.size > maxImportBytes) {
        setState({
          step: 'error',
          fileName: file.name,
          fileText: null,
          preview: null,
          issue: 'too-large',
        })
        return
      }

      setState({
        step: 'reading',
        fileName: file.name,
        fileText: null,
        preview: null,
        issue: null,
      })

      let fileText: string
      try {
        fileText = await file.text()
        if (!isCurrent(generation)) return
      } catch {
        if (!isCurrent(generation)) return
        setState({
          step: 'error',
          fileName: file.name,
          fileText: null,
          preview: null,
          issue: 'read-failed',
        })
        return
      }

      await previewText(file.name, fileText, generation)
    },
    [isCurrent, previewText, state.step],
  )

  const clear = useCallback(() => {
    if (writeLock.current || state.step === 'persistence-error') return

    selectionGeneration.current += 1
    previewMutation.reset()
    applyMutation.reset()
    retryMutation.reset()
    setState(initialState)
  }, [applyMutation, previewMutation, retryMutation, state.step])

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
    setState({ ...currentState, step: 'applying', issue: null })

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
            issue: null,
          })
          break
        case 'persistence-error':
          setState({
            step: 'persistence-error',
            fileName,
            fileText,
            preview: response.preview,
            issue: null,
          })
          break
        case 'stale':
          setState({
            step: 'preview',
            fileName,
            fileText,
            preview: response.preview,
            issue: 'stale',
          })
          break
        case 'unchanged':
          setState({
            step: 'preview',
            fileName,
            fileText,
            preview: response.preview,
            issue: null,
          })
          break
        case 'blocked':
          setState({
            step: 'preview',
            fileName,
            fileText,
            preview: response.preview,
            issue: null,
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
        issue: 'apply-unconfirmed',
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
    setState({ ...state, step: 'retrying', issue: null })

    try {
      const response = await retryMutation.mutateAsync()
      if (!isCurrent(generation)) return

      if (response.status === 'saved') {
        setState({
          step: 'saved',
          fileName,
          fileText: null,
          preview,
          issue: null,
        })
      } else if (response.status === 'persistence-error') {
        setState({
          step: 'persistence-error',
          fileName,
          fileText,
          preview,
          issue: null,
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
        issue: null,
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
