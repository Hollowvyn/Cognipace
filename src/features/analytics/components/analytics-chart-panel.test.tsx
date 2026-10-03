import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AnalyticsChartPanel } from './analytics-chart-panel'

describe('AnalyticsChartPanel', () => {
  it('connects the panel title and description and renders an empty state', () => {
    render(
      <AnalyticsChartPanel
        description="Observed correctness across the selected period."
        emptyMessage="Not enough review history yet."
        id="recall-quality"
        title="Recall quality"
      />,
    )

    const panel = screen.getByRole('region', { name: 'Recall quality' })

    expect(panel).toHaveAttribute(
      'aria-describedby',
      'recall-quality-description',
    )
    expect(
      within(panel).getByText(
        'Observed correctness across the selected period.',
      ),
    ).toBeVisible()
    expect(
      within(panel).getByText('Not enough review history yet.'),
    ).toBeVisible()
  })

  it('renders chart content and the optional footer when data is available', () => {
    render(
      <AnalyticsChartPanel
        description="FSRS model estimate over time."
        footer="Predicted recall is an estimate, not a guarantee."
        id="predicted-recall"
        title="Predicted recall"
      >
        <div data-testid="chart-body">Chart body</div>
      </AnalyticsChartPanel>,
    )

    expect(screen.getByTestId('chart-body')).toBeVisible()
    expect(
      screen.getByText('Predicted recall is an estimate, not a guarantee.'),
    ).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Predicted recall' }),
    ).toHaveAttribute('aria-describedby', 'predicted-recall-description')
  })

  it('opts only historical panels into their compact frame while retaining descriptions', () => {
    render(
      <>
        <AnalyticsChartPanel
          historical
          description="The same paired reviews."
          id="historical"
          question="How did they compare?"
          title="Recall"
        >
          <div>Historical plot</div>
        </AnalyticsChartPanel>
        <AnalyticsChartPanel
          description="Existing topic ranking."
          id="later"
          title="Topics"
        />
      </>,
    )

    const historical = screen.getByRole('region', { name: 'Recall' })
    expect(historical).toHaveAttribute('data-analytics-historical', '')
    expect(historical).toHaveAttribute(
      'aria-describedby',
      'historical-question historical-description',
    )
    expect(
      within(historical).getByText('The same paired reviews.'),
    ).toBeVisible()
    expect(screen.getByRole('region', { name: 'Topics' })).not.toHaveAttribute(
      'data-analytics-historical',
    )
  })
})
