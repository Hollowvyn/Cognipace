import { Bar, BarChart } from 'recharts'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { tooltipSpy } = vi.hoisted(() => ({
  tooltipSpy: vi.fn<(props: { isAnimationActive?: boolean }) => void>(),
}))

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()

  return {
    ...actual,
    Tooltip: (props: { isAnimationActive?: boolean }) => {
      tooltipSpy(props)
      return null
    },
  }
})

import { ChartContainer, ChartTooltip, type ChartConfig } from './chart'

const chartConfig = {
  reviews: 'var(--chart-1)',
} satisfies ChartConfig

describe('Chart primitive', () => {
  it('provides stable identity, configured colors, and an accessible description', () => {
    const chart = (
      <>
        <p id="review-chart-description">
          Daily review outcomes for the selected period.
        </p>
        <ChartContainer
          aria-describedby="review-chart-description"
          accessibleDescription="Daily review outcomes for the selected period."
          accessibleName="Review quality"
          config={chartConfig}
          id="analytics-review-quality"
          initialDimension={{ height: 180, width: 320 }}
        >
          <BarChart
            accessibilityLayer
            data={[{ day: 'Monday', reviews: 3 }]}
            responsive
          >
            <Bar dataKey="reviews" fill="var(--color-reviews)" />
          </BarChart>
        </ChartContainer>
      </>
    )

    const { rerender } = render(chart)

    const chartContainer = document.querySelector('#analytics-review-quality')

    expect(chartContainer).toBeInTheDocument()
    expect(chartContainer).toHaveAttribute(
      'aria-describedby',
      'review-chart-description',
    )
    expect(
      (chartContainer as HTMLDivElement).style.getPropertyValue(
        '--color-reviews',
      ),
    ).toBe('var(--chart-1)')
    const chartSurface = screen.getByRole('application')
    expect(chartSurface).toHaveAttribute('tabindex', '0')
    expect(chartSurface.querySelector('title')).toHaveTextContent(
      'Review quality',
    )
    expect(chartSurface.querySelector('desc')).toHaveTextContent(
      'Daily review outcomes for the selected period.',
    )

    rerender(chart)

    expect(document.querySelector('#analytics-review-quality')).toBe(
      chartContainer,
    )
  })

  it('marks the generic chart surface as non-animated when reduced motion is preferred', () => {
    const matchMedia = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('matchMedia', matchMedia)

    render(
      <ChartContainer config={chartConfig} id="reduced-motion-chart">
        <BarChart data={[{ day: 'Monday', reviews: 3 }]} responsive>
          <Bar dataKey="reviews" fill="var(--color-reviews)" />
        </BarChart>
      </ChartContainer>,
    )

    expect(document.querySelector('#reduced-motion-chart')).toHaveAttribute(
      'data-chart-animation',
      'disabled',
    )
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })

  it('clones Recharts tooltip children with animation disabled for reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      }),
    )

    render(
      <ChartContainer config={chartConfig} id="reduced-motion-tooltip-chart">
        <BarChart data={[{ day: 'Monday', reviews: 3 }]} responsive>
          <Bar dataKey="reviews" fill="var(--color-reviews)" />
          <ChartTooltip />
        </BarChart>
      </ChartContainer>,
    )

    expect(tooltipSpy.mock.calls.map(([props]) => props)).toContainEqual(
      expect.objectContaining({ isAnimationActive: false }),
    )
  })

  it('uses deterministic initial dimensions when no size is supplied', () => {
    render(
      <ChartContainer config={chartConfig} id="default-dimensions-chart">
        <BarChart data={[{ day: 'Monday', reviews: 3 }]} responsive>
          <Bar dataKey="reviews" fill="var(--color-reviews)" />
        </BarChart>
      </ChartContainer>,
    )

    expect(
      document.querySelector('#default-dimensions-chart svg'),
    ).toHaveAttribute('width', '320')
    expect(
      document.querySelector('#default-dimensions-chart svg'),
    ).toHaveAttribute('height', '192')
  })
})

afterEach(() => {
  tooltipSpy.mockClear()
  vi.unstubAllGlobals()
})
