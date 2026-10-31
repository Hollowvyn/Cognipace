import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'

interface ResetLocalDataPanelProps {
  error: string | null
  isResetting: boolean
  isReplacementPending: boolean
  onOpenResetDialog: () => void
  status: string | null
}

export function ResetLocalDataPanel({
  error,
  isResetting,
  isReplacementPending,
  onOpenResetDialog,
  status,
}: ResetLocalDataPanelProps) {
  return (
    <Surface aria-labelledby="reset-local-data-title" className="grid gap-4">
      <header className="grid gap-1">
        <h2
          className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight"
          id="reset-local-data-title"
        >
          Clear local data
        </h2>
        <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
          Remove local CogniPace data from this extension install.
        </p>
      </header>

      {error ? (
        <InlineStatus role="alert" tone="danger">
          {error}
        </InlineStatus>
      ) : null}
      {status ? <InlineStatus>{status}</InlineStatus> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={isResetting || isReplacementPending}
          onClick={onOpenResetDialog}
          size="sm"
          variant="destructive"
        >
          <Trash2 aria-hidden="true" />
          Clear local data
        </Button>
      </div>
    </Surface>
  )
}
