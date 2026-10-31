import {
  CheckCircle2,
  GitBranch,
  KeyRound,
  Loader2,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { PasswordManagerHelper } from '@/features/password-manager'
import { readErrorMessage } from '@/utils/errors'

import type {
  SerializedSyncStatus,
  SyncActionResult,
} from '../api/sync-contracts'
import type {
  GitHubSyncActionResult,
  GitHubSyncPanelActions,
} from './github-sync-panel'

type ConnectionFeedback = {
  message: string
  role?: 'alert' | 'status'
  tone: 'danger' | 'neutral' | 'success' | 'warning'
}

const maskedStoredToken = '................'

function createGitHubTokenCreationUrl(now: Date): string {
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const query = new URLSearchParams({
    name: `cognipace_gh_sync_${localDate}`,
    description: 'Sync CogniPace data through a private GitHub Gist',
    expires_in: 'none',
    gists: 'write',
  })

  return `https://github.com/settings/personal-access-tokens/new?${query}`
}

export function GitHubSyncConnectionDialog({
  actions,
  isPending,
  onActionResult,
  onClose,
  status,
}: {
  actions: GitHubSyncPanelActions
  isPending: boolean
  onActionResult: (
    result: SyncActionResult | null | undefined | void,
    fallbackMessage: string,
  ) => void
  onClose: () => void
  status: SerializedSyncStatus
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const [feedback, setFeedback] = useState<ConnectionFeedback | null>(null)
  const [gistDraft, setGistDraft] = useState(status.gistId ?? '')
  const [replacingToken, setReplacingToken] = useState(!status.tokenConfigured)
  const [token, setToken] = useState('')
  const [tokenSavedInSession, setTokenSavedInSession] = useState(false)

  const hasSavedToken = status.tokenConfigured && !replacingToken
  const hasTokenForGistActions = hasSavedToken || tokenSavedInSession
  const tokenInputValue = hasSavedToken ? maskedStoredToken : token
  const tokenCreationUrl = createGitHubTokenCreationUrl(new Date())
  const title = status.configured ? 'Manage GitHub Sync' : 'Connect GitHub Sync'
  const titleId = 'github-sync-connection-title'
  const descriptionId = 'github-sync-connection-description'
  const tokenGroupId = 'github-sync-token-group-label'
  const gistGroupId = 'github-sync-gist-group-label'

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    cancelButtonRef.current?.focus()

    return () => {
      previouslyFocused?.focus()
    }
  }, [])

  async function runConnectionAction(
    action: () => GitHubSyncActionResult,
    fallbackMessage: string,
    options: {
      afterSuccess?: () => void
      bubbleResult?: boolean
      conflictAsDecision?: boolean
    } = {},
  ) {
    try {
      const result = await action()

      if (isSuccessfulAction(result)) {
        options.afterSuccess?.()
      }

      if (options.bubbleResult) {
        onActionResult(result, fallbackMessage)
      }

      if (options.conflictAsDecision && isConfirmationRequired(result)) {
        setFeedback({
          message: result.message,
          role: 'alert',
          tone: 'warning',
        })
        return
      }

      setFeedback(readActionFeedback(result, fallbackMessage))
    } catch (error) {
      setFeedback({
        message: readErrorMessage(error, 'GitHub sync action failed.'),
        role: 'alert',
        tone: 'danger',
      })
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !isPending) {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const dialog = dialogRef.current
    const focusableElements = dialog ? getFocusableElements(dialog) : []

    if (focusableElements.length === 0) {
      event.preventDefault()
      dialog?.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (!firstElement || !lastElement) {
      return
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
      return
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/75 p-4"
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          if (!isPending) {
            onClose()
          }
        }
      }}
    >
      <section
        aria-busy={isPending || undefined}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="grid max-h-[calc(100dvh-2rem)] w-full max-w-2xl gap-5 overflow-y-auto rounded-[var(--cp-panel-radius)] border border-border bg-card p-[var(--cp-panel-padding)] text-card-foreground shadow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="grid gap-2">
          <h2
            className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight"
            id={titleId}
          >
            {title}
          </h2>
          <p
            className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground"
            id={descriptionId}
          >
            Use a GitHub token and a private Gist to keep this browser in sync.
          </p>
        </div>

        {feedback ? (
          <InlineStatus role={feedback.role} tone={feedback.tone}>
            {feedback.tone === 'success' ? (
              <CheckCircle2 aria-hidden="true" />
            ) : null}
            {feedback.message}
          </InlineStatus>
        ) : null}

        <div aria-labelledby={tokenGroupId} className="grid gap-2" role="group">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p
              className="m-0 text-[length:var(--cp-copy-font-size)] font-semibold"
              id={tokenGroupId}
            >
              GitHub token
            </p>
            {!hasSavedToken ? (
              <a
                className="inline-flex items-center gap-1 rounded-[var(--cp-control-radius)] text-[length:var(--cp-badge-font-size)] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                href={tokenCreationUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Create a token for CogniPace
              </a>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="github-sync-dialog-token">
              Access token
            </label>
            <input
              autoComplete="new-password"
              className="min-w-[16rem] flex-1 rounded-[var(--cp-control-radius)] border border-border bg-background px-3 py-2 text-[length:var(--cp-copy-font-size)]"
              id="github-sync-dialog-token"
              onChange={(event) => {
                setToken(event.currentTarget.value)
              }}
              placeholder="ghp_..."
              readOnly={hasSavedToken}
              spellCheck={false}
              type="password"
              value={tokenInputValue}
            />
            <Button
              disabled={isPending || (hasSavedToken ? false : !token.trim())}
              onClick={() => {
                void runConnectionAction(
                  () =>
                    hasSavedToken
                      ? actions.onValidateStoredToken()
                      : actions.onValidateToken(token.trim()),
                  'GitHub token validated.',
                )
              }}
              size="sm"
              variant="outline"
            >
              Test token
            </Button>
            {hasSavedToken ? (
              <Button
                disabled={isPending}
                onClick={() => {
                  setReplacingToken(true)
                  setToken('')
                  setFeedback(null)
                }}
                size="sm"
                variant="outline"
              >
                <KeyRound aria-hidden="true" />
                Replace token
              </Button>
            ) : (
              <Button
                disabled={isPending || !token.trim()}
                onClick={() => {
                  void runConnectionAction(
                    () => actions.onSaveToken(token.trim()),
                    'GitHub token saved.',
                    {
                      afterSuccess: () => {
                        setToken('')
                        setTokenSavedInSession(true)
                      },
                    },
                  )
                }}
                size="sm"
              >
                {isPending ? (
                  <Loader2
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <KeyRound aria-hidden="true" />
                )}
                Save token
              </Button>
            )}
          </div>
          <p className="m-0 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
            Stored locally in trusted extension storage. It is not included in
            backups or exports.
          </p>
        </div>

        <div aria-labelledby={gistGroupId} className="grid gap-2" role="group">
          <p
            className="m-0 text-[length:var(--cp-copy-font-size)] font-semibold"
            id={gistGroupId}
          >
            Private Gist
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="github-sync-dialog-gist">
              Gist ID
            </label>
            <input
              className="min-w-[16rem] flex-1 rounded-[var(--cp-control-radius)] border border-border bg-background px-3 py-2 text-[length:var(--cp-copy-font-size)]"
              id="github-sync-dialog-gist"
              onChange={(event) => {
                setGistDraft(event.currentTarget.value)
              }}
              placeholder="Existing Gist ID"
              spellCheck={false}
              value={gistDraft}
            />
            <Button
              disabled={
                isPending || !gistDraft.trim() || !hasTokenForGistActions
              }
              onClick={() => {
                void runConnectionAction(
                  () => actions.onConnectGist(gistDraft.trim()),
                  'GitHub Gist connected.',
                  { conflictAsDecision: true },
                )
              }}
              size="sm"
              variant="outline"
            >
              <GitBranch aria-hidden="true" />
              Connect
            </Button>
            <Button
              disabled={isPending || !hasTokenForGistActions}
              onClick={() => {
                void runConnectionAction(
                  () => actions.onCreateGist(),
                  'Private GitHub Gist created.',
                )
              }}
              size="sm"
              variant="outline"
            >
              <UploadCloud aria-hidden="true" />
              Create private Gist
            </Button>
          </div>
        </div>

        <PasswordManagerHelper
          disabled={isPending}
          website="https://gist.github.com"
          username="CogniPace GitHub sync"
          password={hasSavedToken ? '' : token}
          notes={`App: CogniPace\nPurpose: GitHub Gist sync\nGist ID: ${gistDraft.trim() || '(not connected)'}`}
        />

        {feedback?.role === 'alert' && feedback.tone === 'warning' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPending}
              onClick={() => {
                void runConnectionAction(
                  () =>
                    actions.onPullLatest({
                      confirmLocalOverwrite: false,
                    }),
                  'Latest Gist data pulled.',
                  { bubbleResult: true },
                )
              }}
              size="sm"
              variant="outline"
            >
              Pull latest
            </Button>
            <Button
              disabled={isPending}
              onClick={() => {
                void runConnectionAction(
                  () =>
                    actions.onPushLocal({
                      confirmRemoteOverwrite: false,
                    }),
                  'Local data pushed to Gist.',
                  { bubbleResult: true },
                )
              }}
              size="sm"
              variant="outline"
            >
              Push local
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {status.tokenConfigured ? (
            <Button
              disabled={isPending}
              onClick={() => {
                void runConnectionAction(
                  () => actions.onDeleteToken(),
                  'GitHub token deleted.',
                  {
                    afterSuccess: () => {
                      setReplacingToken(true)
                      setToken('')
                      setTokenSavedInSession(false)
                    },
                  },
                )
              }}
              size="sm"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
              Delete token
            </Button>
          ) : null}
          <Button
            disabled={isPending}
            onClick={onClose}
            ref={cancelButtonRef}
            size="sm"
            variant="ghost"
          >
            Close
          </Button>
        </div>
      </section>
    </div>
  )
}

function readActionFeedback(
  result: SyncActionResult | null | undefined | void,
  fallbackMessage: string,
): ConnectionFeedback {
  if (!isSyncActionResult(result)) {
    return {
      message: fallbackMessage,
      tone: 'success',
    }
  }

  if (result.outcome === 'success' || result.outcome === 'no-change') {
    return {
      message: result.message || fallbackMessage,
      tone: 'success',
    }
  }

  return {
    message: result.message || fallbackMessage,
    role: result.outcome === 'error' ? 'alert' : 'status',
    tone: result.outcome === 'error' ? 'danger' : 'warning',
  }
}

function isSuccessfulAction(result: unknown) {
  return !isSyncActionResult(result) || result.outcome === 'success'
}

function isConfirmationRequired(
  result: SyncActionResult | null | undefined | void,
): result is SyncActionResult {
  return (
    isSyncActionResult(result) && result.outcome === 'confirmation-required'
  )
}

function isSyncActionResult(result: unknown): result is SyncActionResult {
  return (
    result !== null &&
    typeof result === 'object' &&
    'outcome' in result &&
    (result.outcome === 'success' ||
      result.outcome === 'no-change' ||
      result.outcome === 'blocked' ||
      result.outcome === 'confirmation-required' ||
      result.outcome === 'error')
  )
}

function getFocusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'a[href]',
        'summary',
        '[tabindex]:not([tabindex="-1"])',
      ].join(','),
    ),
  ).filter((element) => element.offsetParent !== null)
}
