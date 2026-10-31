import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CumulativeTrend } from './cumulative-trend'
import { HistoricalChart } from './historical-chart'

const rows = [
  {
    id: 'prefix',
    bucketStart: '2026-09-01',
    bucketEnd: '2026-09-01',
    value: null,
    state: 'unavailable',
    rawCount: 0,
    lastUpdate: null,
  },
  {
    id: 'one',
    bucketStart: '2026-09-02',
    bucketEnd: '2026-09-02',
    value: 20,
    state: 'updated',
    rawCount: 2,
    lastUpdate: 'one',
  },
  {
    id: 'two',
    bucketStart: '2026-09-03',
    bucketEnd: '2026-09-03',
    value: 80,
    state: 'updated',
    rawCount: 3,
    lastUpdate: 'two',
  },
  {
    id: 'hold',
    bucketStart: '2026-09-04',
    bucketEnd: '2026-09-04',
    value: 80,
    state: 'held',
    rawCount: 0,
    lastUpdate: 'two',
  },
  {
    id: 'resume',
    bucketStart: '2026-09-05',
    bucketEnd: '2026-09-05',
    value: 50,
    state: 'updated',
    rawCount: 1,
    lastUpdate: 'resume',
  },
  {
    id: 'tail',
    bucketStart: '2026-09-06',
    bucketEnd: '2026-09-06',
    value: 50,
    state: 'held',
    rawCount: 0,
    lastUpdate: 'resume',
  },
] as const

function Fixture({
  diamond = false,
  data = rows,
  midnight = false,
}: {
  diamond?: boolean
  data?: readonly (typeof rows)[number][]
  midnight?: boolean
}) {
  return (
    <HistoricalChart
      compact={{ height: 180, showGroupingLabel: false }}
      cumulativeAsOf
      config={{ performance: { color: 'green' } }}
      description="Exact cumulative evidence"
      name="Cumulative evidence"
      rows={data}
      timeFrame={{
        asOf: midnight
          ? '2026-09-05T00:00:00.000Z'
          : '2026-09-06T02:00:00.123Z',
        timeZone: 'UTC',
        requestedDays: 30,
      }}
      tooltip={(row) => (
        <p>
          {row.id}: raw {row.rawCount}; cumulative {row.value ?? 'Unavailable'};
          last update {row.lastUpdate ?? 'None'}
        </p>
      )}
      yAxes={[
        {
          label: 'Performance',
          scale: { domain: [0, 100], ticks: [0, 50, 100] },
          format: String,
        },
      ]}
    >
      {(positioned, selected, visible) => (
        <CumulativeTrend
          rows={positioned}
          value={(row) => row.value}
          state={(row) => row.state}
          visibleEnd={positioned.at(-1)!.endX}
          color="green"
          markerShape={diamond ? 'diamond' : 'circle'}
          strokeDasharray={diamond ? '4 4' : undefined}
          selectedRow={visible ? selected : null}
          area={!diamond}
          testId="trend"
        />
      )}
    </HistoricalChart>
  )
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 320, 180),
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CumulativeTrend', () => {
  it('renders bounded active cubics, horizontal long-dash holds and only genuine update circles', async () => {
    render(<Fixture />)
    const markers = await screen.findAllByTestId(/trend-marker-/)
    expect(markers.map((marker) => marker.getAttribute('data-row-id'))).toEqual(
      ['one', 'two', 'resume'],
    )
    expect(
      markers.every(
        (marker) => marker.getAttribute('data-marker-shape') === 'circle',
      ),
    ).toBe(true)
    for (const path of screen.getAllByTestId(/trend-active-/)) {
      expect(path.getAttribute('d')).toContain('C')
      expect(path).not.toHaveAttribute('stroke-dasharray')
      expect(path.getAttribute('d')).not.toMatch(/NaN|Infinity/)
    }
    for (const hold of screen.getAllByTestId(/trend-held-/)) {
      expect(hold).toHaveAttribute('stroke-dasharray', '9 7')
      expect(hold.getAttribute('y1')).toBe(hold.getAttribute('y2'))
    }
    const firstMarkerX = Number(
      markers[0]!.querySelector('circle')!.getAttribute('cx'),
    )
    for (const area of screen.getAllByTestId(/trend-area-/)) {
      const coordinates = area
        .getAttribute('d')!
        .match(/-?\d+(?:\.\d+)?/g)!
        .map(Number)
      expect(coordinates[0]).toBeGreaterThanOrEqual(firstMarkerX)
    }
    const control = screen.getByRole('button', {
      name: 'Inspect Cumulative evidence',
    })
    fireEvent.keyDown(control, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'prefix: raw 0; cumulative Unavailable; last update None',
    )
    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(markers[0]).toHaveAttribute('data-active-marker', 'true')
    fireEvent.keyDown(control, { key: 'ArrowRight' })
    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'hold: raw 0; cumulative 80; last update two',
    )
    expect(
      markers.every(
        (marker) => marker.getAttribute('data-active-marker') === 'false',
      ),
    ).toBe(true)
  })

  it('uses short-dashed FSRS active curves and opaque diamond updates without area fill', async () => {
    render(<Fixture diamond />)
    const markers = await screen.findAllByTestId(/trend-marker-/)
    expect(
      markers.every(
        (marker) => marker.getAttribute('data-marker-shape') === 'diamond',
      ),
    ).toBe(true)
    expect(markers[0]!.querySelector('path')).toHaveAttribute('fill', 'green')
    expect(screen.queryAllByTestId(/trend-area-/)).toHaveLength(0)
    expect(
      screen
        .getAllByTestId(/trend-active-/)
        .every((path) => path.getAttribute('stroke-dasharray') === '4 4'),
    ).toBe(true)
    expect(
      screen
        .getAllByTestId(/trend-held-/)
        .every((path) => path.getAttribute('stroke-dasharray') === '9 7'),
    ).toBe(true)
  })

  it('retains singleton and exact-midnight resumed markers without inventing a cubic interval', async () => {
    const { rerender } = render(<Fixture data={[rows[1]]} />)
    expect(await screen.findAllByTestId(/trend-marker-/)).toHaveLength(1)
    expect(screen.queryAllByTestId(/trend-active-/)).toHaveLength(0)
    rerender(<Fixture data={rows.slice(0, 5)} midnight />)
    const markers = await screen.findAllByTestId(/trend-marker-/)
    expect(markers.map((marker) => marker.getAttribute('data-row-id'))).toEqual(
      ['one', 'two', 'resume'],
    )
    expect(screen.getAllByTestId(/trend-active-/)).toHaveLength(1)
    expect(markers[2]!.querySelector('circle')!.getAttribute('cx')).not.toMatch(
      /NaN|Infinity/,
    )
    const control = screen.getByRole('button', {
      name: 'Inspect Cumulative evidence',
    })
    fireEvent.keyDown(control, { key: 'End' })
    expect(markers[2]).toHaveAttribute('data-active-marker', 'true')
    expect(
      Number(markers[2]!.querySelector('circle')!.getAttribute('cx')) + 7,
    ).toBeLessThanOrEqual(
      Number.parseFloat(control.style.left) +
        Number.parseFloat(control.style.width),
    )
  })
})
