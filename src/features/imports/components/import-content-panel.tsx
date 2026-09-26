import { useId, useRef, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'

import { useContentImport } from '../hooks/use-content-import'

import { ImportPreviewView } from './import-preview'
import { ImportTemplates } from './import-templates'

export function ImportContentPanel() {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const { state, selectFile, clear, apply, retryPersistence, previewAgain } =
    useContentImport()
  const isWriting = state.step === 'applying' || state.step === 'retrying'
  const isBusy =
    isWriting || state.step === 'reading' || state.step === 'previewing'
  const isPersistencePending = state.step === 'persistence-error'
  const preview = state.preview
  const isReady =
    (state.step === 'preview' || state.step === 'applying') &&
    preview?.status === 'ready'
  const additionCount = preview ? sumAdditionCounts(preview.additions) : 0
  const status = getStatus(state)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0] ?? null
    if (!file) return

    void (async () => {
      await selectFile(file)
      input.value = ''
    })()
  }

  return (
    <Surface
      aria-busy={isBusy || undefined}
      aria-labelledby={titleId}
      className="grid gap-3"
    >
      <header className="grid gap-1">
        <h2
          className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight"
          id={titleId}
        >
          Import content
        </h2>
        <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
          Add questions, tracks, companies, and topics while keeping your
          existing data and progress.
        </p>
      </header>

      <ImportTemplates />

      <div className="grid gap-1.5">
        <label
          className="text-[length:var(--cp-copy-font-size)] font-semibold"
          htmlFor="content-import-file"
        >
          Choose content JSON file
        </label>
        <input
          accept=".json,application/json"
          className="min-w-0 rounded-[var(--cp-control-radius)] border border-border bg-background px-3 py-2 text-[length:var(--cp-copy-font-size)] file:mr-3 file:rounded-[var(--cp-control-radius)] file:border-0 file:bg-primary file:px-3 file:py-2 file:font-semibold file:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          disabled={isWriting || isPersistencePending}
          id="content-import-file"
          onChange={handleFileChange}
          ref={inputRef}
          type="file"
        />
      </div>

      {state.fileName ? (
        <p className="m-0 break-all text-[length:var(--cp-copy-font-size)] text-muted-foreground">
          {state.fileName}
        </p>
      ) : null}

      {preview ? <ImportPreviewView preview={preview} /> : null}

      {status ? (
        <InlineStatus
          aria-label="Content import status"
          role="status"
          tone={status.tone}
        >
          {status.message}
        </InlineStatus>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {isReady ? (
          <Button disabled={isWriting} onClick={() => void apply()} size="sm">
            {`Import ${additionCount} ${additionCount === 1 ? 'addition' : 'additions'}`}
          </Button>
        ) : null}
        {state.step === 'persistence-error' ? (
          <Button
            disabled={isWriting}
            onClick={() => void retryPersistence()}
            size="sm"
          >
            Retry saving
          </Button>
        ) : null}
        {state.step === 'error' && state.fileText !== null ? (
          <Button
            disabled={isWriting}
            onClick={() => void previewAgain()}
            size="sm"
            variant="outline"
          >
            Preview file again
          </Button>
        ) : null}
        {state.step !== 'idle' ? (
          <Button
            disabled={isWriting || isPersistencePending}
            onClick={() => {
              clear()
              if (inputRef.current) inputRef.current.value = ''
            }}
            size="sm"
            variant="outline"
          >
            Dismiss import
          </Button>
        ) : null}
      </div>
    </Surface>
  )
}

function getStatus(state: ReturnType<typeof useContentImport>['state']) {
  switch (state.step) {
    case 'idle':
      return null
    case 'reading':
      return { message: 'Reading file…', tone: 'neutral' as const }
    case 'previewing':
      return { message: 'Checking content…', tone: 'neutral' as const }
    case 'applying':
      return { message: 'Importing content…', tone: 'neutral' as const }
    case 'retrying':
      return { message: 'Retrying save…', tone: 'neutral' as const }
    case 'saved':
      return {
        message: 'Content imported and saved.',
        tone: 'success' as const,
      }
    case 'persistence-error':
      return {
        message:
          'Content was added, but saving it to browser storage failed. Retry saving before closing the extension.',
        tone: 'warning' as const,
      }
    case 'error':
      switch (state.issue) {
        case 'too-large':
          return {
            message:
              'This file is larger than the 5 MiB limit. Choose a file that is 5 MiB or smaller.',
            tone: 'danger' as const,
          }
        case 'read-failed':
          return {
            message:
              'This file could not be read. Choose another file and try again.',
            tone: 'danger' as const,
          }
        case 'preview-failed':
          return {
            message:
              'This file could not be previewed. Check your connection and preview it again.',
            tone: 'danger' as const,
          }
        case 'apply-unconfirmed':
          return {
            message:
              'The import result could not be confirmed. Preview the file again before retrying.',
            tone: 'danger' as const,
          }
        default:
          return {
            message: 'The file could not be imported.',
            tone: 'danger' as const,
          }
      }
    case 'preview':
      if (state.issue === 'stale') {
        return {
          message:
            'Local content changed. Review the updated preview before importing.',
          tone: 'warning' as const,
        }
      }
      switch (state.preview?.status) {
        case 'ready':
          return {
            message: 'Review the additions below before importing.',
            tone: 'neutral' as const,
          }
        case 'unchanged':
          return {
            message:
              'Everything in this file is already present. No changes are needed.',
            tone: 'neutral' as const,
          }
        case 'empty':
          return {
            message:
              'No usable content was found. Check the format and reported entries.',
            tone: 'neutral' as const,
          }
        case 'blocked':
          return {
            message: 'This file cannot be imported. Review the errors below.',
            tone: 'danger' as const,
          }
        default:
          return null
      }
  }
}

function sumAdditionCounts(additions: Record<string, number>) {
  return Object.values(additions).reduce((total, count) => total + count, 0)
}
