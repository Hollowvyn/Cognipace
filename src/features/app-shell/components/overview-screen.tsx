import { RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'
import { useExtraPractice } from '@/features/queue'
import { readErrorMessage } from '@/utils/errors'

import { useDashboardAppShellData } from '../api/app-shell-api'
import { createDashboardOverviewView } from '../domain/dashboard-overview'
import {
  OverviewActiveTrackPanel,
  OverviewMetrics,
  OverviewPrimaryPanel,
  OverviewQueuePreview,
} from './overview/overview-panels'

export interface OverviewScreenProps {
  libraryAction: ReactNode
  tracksAction: ReactNode
}

export function OverviewScreen({
  libraryAction,
  tracksAction,
}: OverviewScreenProps) {
  const overviewQuery = useDashboardAppShellData()
  const [hasRequestedExtraPractice, setHasRequestedExtraPractice] =
    useState(false)
  const extraPracticeRequest = useExtraPractice(
    'dashboard',
    hasRequestedExtraPractice,
  )
  const data = overviewQuery.data

  if (overviewQuery.isPending) {
    return (
      <OverviewFrame>
        <Surface className="w-full">
          <InlineStatus>Loading overview...</InlineStatus>
        </Surface>
      </OverviewFrame>
    )
  }

  if (overviewQuery.isError || !data) {
    return (
      <OverviewFrame>
        <Surface className="grid w-full gap-3">
          <InlineStatus role="alert" tone="danger">
            Failed to load Overview.
          </InlineStatus>
          <div>
            <Button
              onClick={() => {
                void overviewQuery.refetch()
              }}
              size="sm"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" />
              Retry
            </Button>
          </div>
        </Surface>
      </OverviewFrame>
    )
  }

  const overview = createDashboardOverviewView(data)

  return (
    <OverviewFrame>
      <OverviewPrimaryPanel
        extraPractice={{
          item: hasRequestedExtraPractice
            ? (extraPracticeRequest.data?.items[0] ?? null)
            : null,
          isLoading:
            hasRequestedExtraPractice && extraPracticeRequest.isFetching,
          hasRequested:
            hasRequestedExtraPractice && extraPracticeRequest.isSuccess,
          error:
            hasRequestedExtraPractice && extraPracticeRequest.isError
              ? readErrorMessage(
                  extraPracticeRequest.error,
                  'Failed to load extra practice.',
                )
              : null,
        }}
        libraryAction={libraryAction}
        onRequestExtraPractice={() => {
          if (hasRequestedExtraPractice) {
            void extraPracticeRequest.refetch()
          } else {
            setHasRequestedExtraPractice(true)
          }
        }}
        primary={overview.primary}
      />
      <OverviewMetrics metrics={overview.metrics} />
      <OverviewActiveTrackPanel
        activeTrack={overview.activeTrack}
        tracksAction={tracksAction}
      />
      <OverviewQueuePreview items={overview.queuePreview} />
    </OverviewFrame>
  )
}

function OverviewFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 w-full max-w-[72rem] gap-[var(--cp-surface-gap)]">
      {children}
    </div>
  )
}
