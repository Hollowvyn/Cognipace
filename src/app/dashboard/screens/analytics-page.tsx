// src/app/dashboard/screens/analytics-page.tsx
import { useSearch } from '@tanstack/react-router'

import { useDashboardChrome } from '@/app/dashboard/dashboard-shell'
import {
  DashboardPage,
  DashboardPageBody,
  DashboardPageHeader,
} from '@/app/dashboard/layout/dashboard-page'
import { AnalyticsRangeControl, AnalyticsScreen } from '@/features/analytics'

export function AnalyticsPage() {
  const { headerActions } = useDashboardChrome()
  const { range } = useSearch({ from: '/analytics' })

  return (
    <DashboardPage className="mx-auto w-full max-w-[80rem]">
      <DashboardPageHeader
        actions={
          <>
            <AnalyticsRangeControl range={range} />
            {headerActions}
          </>
        }
        title="How your memory is changing"
      >
        A focused view of recall, practice patterns, weak spots, and workload.
      </DashboardPageHeader>
      <DashboardPageBody>
        <AnalyticsScreen range={range} />
      </DashboardPageBody>
    </DashboardPage>
  )
}
