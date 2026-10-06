import { act, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AnalyticsChartPanel,
  type AnalyticsCardGeometry,
  type AnalyticsCardMode,
} from './analytics-chart-panel'

afterEach(() => vi.unstubAllGlobals())

describe('AnalyticsChartPanel', () => {
  it('connects the panel title and description and renders an empty state', () => {
    render(
      <AnalyticsChartPanel
        historical
        question="How did they compare?"
        description="Observed correctness across the selected period."
        emptyMessage="Not enough review history yet."
        id="recall-quality"
        title="Recall quality"
      />,
    )

    const panel = screen.getByRole('region', { name: 'Recall quality' })

    expect(panel).toHaveAttribute('data-analytics-historical', '')
    expect(panel).toHaveAttribute(
      'aria-describedby',
      'recall-quality-question recall-quality-description',
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

    expect(
      screen.getByRole('region', { name: 'Predicted recall' }),
    ).not.toHaveAttribute('data-analytics-historical')
    expect(screen.getByTestId('chart-body')).toBeVisible()
    expect(
      screen.getByText('Predicted recall is an estimate, not a guarantee.'),
    ).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Predicted recall' }),
    ).toHaveAttribute('aria-describedby', 'predicted-recall-description')
  })

  it('opts into one compact description with persistent shell tracks', () => {
    const props = {
      compact: true,
      description: 'Your outcomes over the selected period.',
      historical: true,
      id: 'performance',
      question: 'A legacy question is not a second compact description.',
      title: 'Performance',
    }
    const { rerender } = render(
      <AnalyticsChartPanel
        {...props}
        headerAction={<button>Performance Details</button>}
        hero={<p>82%</p>}
        footer={<button>Performance Goals</button>}
      >
        <p>Plot</p>
      </AnalyticsChartPanel>,
    )
    const panel = screen.getByRole('region', { name: 'Performance' })
    const body = panel.querySelector('.cp-analytics-card-body')
    const header = panel.querySelector('header')
    const footer = panel.querySelector('footer')
    expect(panel).toHaveClass('cp-analytics-card')
    expect(panel).toHaveAttribute('data-mode', 'overview')
    expect(panel).toHaveAttribute('aria-describedby', 'performance-description')
    expect(screen.queryByText(props.question)).not.toBeInTheDocument()
    expect(within(header!).getAllByRole('heading')).toHaveLength(1)
    expect(header!.querySelectorAll('p')).toHaveLength(1)

    for (const mode of [
      'details',
      'goals',
      'selection',
    ] as AnalyticsCardMode[]) {
      rerender(
        <AnalyticsChartPanel {...props} mode={mode} hero={<p>82%</p>}>
          <p>{mode} body</p>
        </AnalyticsChartPanel>,
      )
      expect(screen.getByRole('region', { name: 'Performance' })).toBe(panel)
      expect(panel.querySelector('.cp-analytics-card-body')).toBe(body)
      expect(panel.querySelector('header')).toBe(header)
      expect(panel.querySelector('footer')).toBe(footer)
      expect(panel).toHaveAttribute('data-mode', mode)
      expect(screen.queryByText('82%')).not.toBeVisible()
    }
  })

  it('measures the mounted body and disconnects when removed', () => {
    let notify!: ResizeObserverCallback
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          notify = callback
        }
        observe = observe
        disconnect = disconnect
      },
    )
    const geometry = vi.fn((value: AnalyticsCardGeometry) => (
      <output>{`${value.width}/${value.bodyHeight}/${value.tablePageSize}/${value.problemPageSize}`}</output>
    ))
    const props = {
      compact: true,
      id: 'recall',
      title: 'Recall',
      description: 'Paired recall.',
    }
    const { rerender, unmount } = render(
      <AnalyticsChartPanel {...props}>{geometry}</AnalyticsChartPanel>,
    )
    const body = screen
      .getByRole('region')
      .querySelector('.cp-analytics-card-body')!
    expect(observe).toHaveBeenCalledWith(body)
    expect(geometry).toHaveBeenLastCalledWith({
      width: 400,
      bodyHeight: 234,
      tablePageSize: 4,
      problemPageSize: 3,
    })
    act(() =>
      notify(
        [
          {
            target: body,
            contentRect: { width: 300, height: 234 },
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      ),
    )
    expect(geometry).toHaveBeenLastCalledWith({
      width: 300,
      bodyHeight: 234,
      tablePageSize: 3,
      problemPageSize: 2,
    })
    rerender(
      <AnalyticsChartPanel {...props} mode="details">
        {geometry}
      </AnalyticsChartPanel>,
    )
    expect(observe).toHaveBeenCalledTimes(1)
    act(() =>
      notify(
        [
          {
            target: body,
            contentRect: { width: 460, height: 144 },
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      ),
    )
    expect(geometry).toHaveBeenLastCalledWith({
      width: 460,
      bodyHeight: 144,
      tablePageSize: 2,
      problemPageSize: 1,
    })
    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('keeps unavailable and loading content in the same reserved compact tracks', () => {
    const props = {
      compact: true,
      id: 'memory',
      title: 'Memory',
      description: 'Current memory strength.',
    }
    const { rerender } = render(
      <AnalyticsChartPanel {...props} emptyMessage="No evidence yet." />,
    )
    const panel = screen.getByRole('region', { name: 'Memory' })
    const body = panel.querySelector('.cp-analytics-card-body')
    expect(within(body as HTMLElement).getByRole('status')).toHaveTextContent(
      'No evidence yet.',
    )
    expect(panel.querySelector('footer')).toBeInTheDocument()
    expect(panel.querySelector('.cp-analytics-card-hero')).toBeInTheDocument()
    rerender(
      <AnalyticsChartPanel {...props}>
        <div aria-label="Loading memory" role="status">
          Loading…
        </div>
      </AnalyticsChartPanel>,
    )
    expect(panel.querySelector('.cp-analytics-card-body')).toBe(body)
    expect(
      within(body as HTMLElement).getByRole('status'),
    ).toHaveAccessibleName('Loading memory')
  })
})
