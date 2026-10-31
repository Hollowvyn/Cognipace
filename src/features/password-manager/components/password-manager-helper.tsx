import { Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { openGooglePasswordManager } from '@/platform/chrome/password-manager'

type Feedback = { message: string; failed: boolean }

export function PasswordManagerHelper({
  website,
  username,
  password,
  notes,
  disabled = false,
}: {
  website: string
  username: string
  password: string
  notes: string
  disabled?: boolean
}) {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pending, setPending] = useState(false)
  const enteredPassword = password.trim()
  const fields = [
    { label: 'Website', value: website },
    { label: 'Username', value: username },
    { label: 'Password', value: enteredPassword },
    { label: 'Notes', value: notes },
  ]

  async function copyField(label: string, value: string) {
    if (disabled || pending || !value) return
    setPending(true)
    setFeedback(null)
    try {
      await navigator.clipboard.writeText(value)
      setFeedback({ message: `${label} copied.`, failed: false })
    } catch {
      setFeedback({
        message: 'Could not copy. Try again or copy the field manually.',
        failed: true,
      })
    } finally {
      setPending(false)
    }
  }

  async function openManager() {
    if (disabled || pending) return
    setPending(true)
    setFeedback(null)
    try {
      await openGooglePasswordManager()
    } catch {
      setFeedback({
        message:
          'Open Google Password Manager from Chrome’s Passwords and autofill menu.',
        failed: true,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <details
      aria-busy={pending || undefined}
      className="min-w-0 rounded-[var(--cp-control-radius)] border border-border bg-background text-[length:var(--cp-badge-font-size)]"
    >
      <summary className="cursor-pointer rounded-[var(--cp-control-radius)] px-3 py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Save in your password manager
      </summary>
      <div className="grid min-w-0 gap-3 border-t border-border p-3">
        <p className="m-0 text-muted-foreground">
          Add a password in Google Password Manager or your preferred manager.
          Use the fields below and save the entry there. Paste saved values back
          here when you need them.
        </p>
        <div>
          <Button
            className="h-auto min-h-[var(--cp-control-height-sm)] whitespace-normal py-2 text-left"
            disabled={disabled || pending}
            onClick={() => {
              void openManager()
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <ExternalLink aria-hidden="true" />
            Open Google Password Manager
          </Button>
        </div>
        <dl className="m-0 grid min-w-0 gap-2">
          {fields.map(({ label, value }) => (
            <div
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2"
              key={label}
            >
              <dt className="col-start-1 font-semibold">{label}</dt>
              <dd className="col-start-1 row-start-2 m-0 min-w-0 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
                {label === 'Password'
                  ? enteredPassword
                    ? 'Use the key entered above'
                    : 'Key not entered'
                  : value}
              </dd>
              <dd className="col-start-2 row-span-2 row-start-1 m-0">
                <Button
                  aria-label={`Copy ${label}`}
                  disabled={disabled || pending || !value}
                  onClick={() => {
                    void copyField(label, value)
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Copy aria-hidden="true" />
                  Copy
                </Button>
              </dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-muted-foreground">
          {enteredPassword
            ? 'Copy the key before saving it in CogniPace. Saving here clears the key field.'
            : 'Enter or paste the key above to copy it. Already saved keys cannot be read back here.'}{' '}
          Automatic password-manager saving and autofill are unavailable on this
          extension page.
        </p>
        {feedback ? (
          <InlineStatus
            role={feedback.failed ? 'alert' : 'status'}
            tone={feedback.failed ? 'danger' : 'neutral'}
          >
            {feedback.message}
          </InlineStatus>
        ) : null}
      </div>
    </details>
  )
}
