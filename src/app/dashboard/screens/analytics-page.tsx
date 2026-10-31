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
    <DashboardPage className="cp-analytics-dashboard mx-auto w-full max-w-[80rem]">
      <DashboardPageHeader
        actions={
          <>
            <AnalyticsRangeControl range={range} />
            {headerActions}
          </>
        }
        title="Analytics"
      >
        Your progress, memory, and next reviews.
      </DashboardPageHeader>
      <DashboardPageBody>
        <AnalyticsScreen range={range} />
      </DashboardPageBody>
    </DashboardPage>
  )
}
