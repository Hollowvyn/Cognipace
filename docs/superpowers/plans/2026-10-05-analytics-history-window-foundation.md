# Analytics History Window Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the tested, feature-local date foundation for 30 days / 90 days / All time, available young history, bounded calendar grouping, and independent daily backlog bounds.

**Architecture:** Add one pure Analytics domain module that uses the existing timezone and calendar helpers. Keep raw-history origin, nominal calculation/comparison bounds, and displayed bounds separate. This phase does not replace the current runtime contract or visible page; the following integration phase consumes this module instead of duplicating its rules in services or charts.

**Tech Stack:** TypeScript, existing Analytics calendar helpers, Vitest; no dependencies, database schema, persisted settings, permissions, or sync changes.

---

Status: implemented and independently reviewed; integrated into the completed Analytics page. Final automated gates and desktop state proof passed. Human installed-extension smoke/proof remains pending before PR review or merge; see `../handoffs/2026-10-05-analytics-performance-layout.md`.

Design: [Analytics Performance And Layout](../specs/2026-10-05-analytics-performance-layout-design.md#historical-range-and-available-history).

## Phase Boundary And File Map

| File                                                                    | Responsibility                                                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create `src/features/analytics/domain/analytics-history-window.ts`      | Selection parsing; shared origin; nominal/display/prior bounds; actual-span grouping; clipped calendar intervals; fixed daily backlog timeframe. |
| Create `src/features/analytics/domain/analytics-history-window.test.ts` | Behavioral fixtures for selection, raw origin, available history, prior cutoffs, interval coverage, DST, long spans, and workload independence.  |
| Read `src/features/analytics/domain/analytics-time.ts`                  | Existing resolved timezone, date keys, local midnight, calendar-day addition, wall-clock shifting, and serialized bucket type.                   |
| Read `src/features/analytics/domain/analytics-range-policy.ts`          | Existing conversion from half-open serialized intervals to measured as-of-capped presentation intervals.                                         |
| Modify `docs/architecture.md`                                           | Describe the tested foundation honestly while leaving current shipped range behavior explicit.                                                   |
| Modify `docs/superpowers/README.md`                                     | Record this phase's actual status and next integration boundary.                                                                                 |

Do not change `AnalyticsHistoricalRange`, `AnalyticsTimeFrame`, the service, summary schemas, route, cache keys, readiness, or chart components in this phase. Their coordinated migration belongs to the next plan. Do not expose a partially supported All time button. Do not implement weighted scores, natural curves, backlog coloring, or tooltip cleanup here.

The new module accepts the existing four-digit Gregorian date-key domain and reuses the current timezone resolution. Do not expand timestamp/calendar support or rewrite date infrastructure as part of this phase. Preserve the existing UTC fallback flag. Follow-up integration must not equate a returned bucket's exclusive `end` with its measured cutoff: use `min(end - 1ms, asOf)` when computing chart midpoints, as the existing presentation converter does.

## Task 1: Explicit Selection And Shared History Bounds

**Files:** Create `src/features/analytics/domain/analytics-history-window.ts` and `src/features/analytics/domain/analytics-history-window.test.ts`.

- [x] **Step 1: Write the failing bounds tests.** Create the test file with this content:

```ts
import { describe, expect, it } from 'vitest'

import {
  buildAnalyticsHistoryBounds,
  parseAnalyticsHistorySelection,
} from './analytics-history-window'

const asOf = new Date('2026-10-05T17:00:00.123Z')
const history = (...timestamps: string[]) =>
  timestamps.map((timestamp) => ({ reviewedAt: new Date(timestamp) }))

describe('analytics history bounds', () => {
  it.each([
    [30, 30],
    ['30', 30],
    [90, 90],
    ['90', 90],
    ['all', 'all'],
    [14, 30],
    ['14', 30],
    ['ALL', 30],
    ['', 30],
    [undefined, 30],
    [NaN, 30],
    [null, 30],
    [[], 30],
  ] as const)('parses %j as %j', (input, expected) => {
    expect(parseAnalyticsHistorySelection(input)).toBe(expected)
  })

  it('clips young raw history without moving the nominal comparison', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 30,
      asOf,
      timeZone: 'UTC',
      history: history('2026-09-24T12:00:00Z', '2026-10-02T12:00:00Z'),
    })
    expect(result).toMatchObject({
      selection: 30,
      nominalDays: 30,
      historyStart: '2026-09-24T12:00:00.000Z',
      nominalStart: '2026-09-06T00:00:00.000Z',
      displayStart: '2026-09-24T00:00:00.000Z',
      displayStartKey: '2026-09-24',
      availableDays: 12,
      periodEnd: '2026-10-06T00:00:00.000Z',
      previous: {
        start: '2026-08-07T00:00:00.000Z',
        asOf: '2026-09-05T17:00:00.123Z',
        periodEnd: '2026-09-06T00:00:00.000Z',
      },
    })
  })

  it('preserves old history with a long recent inactive gap', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 90,
      asOf,
      timeZone: 'UTC',
      history: history('2025-01-01T12:00:00Z', '2026-10-05T12:00:00Z'),
    })
    expect(result.displayStartKey).toBe('2026-07-08')
    expect(result.availableDays).toBe(90)
  })

  it('uses raw origin independently of rating or cohort eligibility', () => {
    const raw = [
      { reviewedAt: new Date('2026-09-10T12:00:00Z'), rating: 'invalid' },
      { reviewedAt: new Date('2026-10-02T12:00:00Z'), rating: 'good' },
    ]
    const result = buildAnalyticsHistoryBounds({
      selection: 'all',
      asOf,
      timeZone: 'UTC',
      history: raw,
    })
    expect(result.displayStartKey).toBe('2026-09-10')
    expect(result.nominalDays).toBeNull()
    expect(result.previous).toBeNull()
    expect(result.availableDays).toBe(26)
  })

  it('ignores invalid and future timestamps without creating fake history', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 'all',
      asOf,
      timeZone: 'UTC',
      history: history('invalid', '2026-10-06T00:00:00Z'),
    })
    expect(result.historyStart).toBeNull()
    expect(result.nominalStart).toBeNull()
    expect(result.displayStart).toBeNull()
    expect(result.displayStartKey).toBeNull()
    expect(result.availableDays).toBe(0)
    expect(result.previous).toBeNull()
  })

  it('supports same-day history and visibly resolves an invalid zone to UTC', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 30,
      asOf,
      timeZone: 'Not/A_Zone',
      history: history('2026-10-05T17:00:00.123Z'),
    })
    expect(result.timeZone).toBe('UTC')
    expect(result.timeZoneFallback).toBe(true)
    expect(result.availableDays).toBe(1)
  })

  it('rejects an invalid report time', () => {
    expect(() =>
      buildAnalyticsHistoryBounds({
        selection: 30,
        asOf: new Date('invalid'),
        timeZone: 'UTC',
        history: [],
      }),
    ).toThrow('Analytics as-of must be a valid date.')
  })
})
```

- [x] **Step 2: Verify the tests fail because the new module is absent.** Run `rtk npm run test -- src/features/analytics/domain/analytics-history-window.test.ts`. Expected: module resolution failure for `./analytics-history-window`, not an unrelated setup or dependency failure. If dependencies are absent, follow the repository's pinned Node/npm and lockfile install procedure before execution; record installation/network failures honestly.

- [x] **Step 3: Create the complete bounds implementation.** Write:

```ts
import {
  addAnalyticsCalendarDays,
  getAnalyticsDateKey,
  getAnalyticsLocalDayStart,
  resolveAnalyticsTimeZone,
  shiftAnalyticsCalendarDays,
} from './analytics-time'

export type AnalyticsHistorySelection = 30 | 90 | 'all'

export interface AnalyticsHistoryBounds {
  selection: AnalyticsHistorySelection
  nominalDays: 30 | 90 | null
  asOf: string
  timeZone: string
  timeZoneFallback: boolean
  historyStart: string | null
  nominalStart: string | null
  nominalStartKey: string | null
  displayStart: string | null
  displayStartKey: string | null
  todayKey: string
  periodEnd: string
  availableDays: number
  previous: { start: string; asOf: string; periodEnd: string } | null
}

export function parseAnalyticsHistorySelection(
  value: unknown,
): AnalyticsHistorySelection {
  if (value === 'all') return 'all'
  if (value === 90 || value === '90') return 90
  return 30
}

export function buildAnalyticsHistoryBounds(input: {
  selection: AnalyticsHistorySelection
  asOf: Date
  timeZone: string
  history: readonly { reviewedAt: Date }[]
}): AnalyticsHistoryBounds {
  if (!Number.isFinite(input.asOf.getTime())) {
    throw new RangeError('Analytics as-of must be a valid date.')
  }
  if (![30, 90, 'all'].includes(input.selection)) {
    throw new RangeError('Analytics selection must be 30, 90, or all.')
  }

  const resolved = resolveAnalyticsTimeZone(input.timeZone)
  const todayKey = getAnalyticsDateKey(input.asOf, resolved.timeZone)
  let earliest: Date | null = null
  for (const event of input.history) {
    const timestamp = event.reviewedAt.getTime()
    if (!Number.isFinite(timestamp) || timestamp > input.asOf.getTime())
      continue
    if (earliest === null || timestamp < earliest.getTime()) {
      earliest = event.reviewedAt
    }
  }
  const historyKey =
    earliest === null ? null : getAnalyticsDateKey(earliest, resolved.timeZone)
  const nominalDays = input.selection === 'all' ? null : input.selection
  const nominalStartKey =
    nominalDays === null
      ? historyKey
      : addAnalyticsCalendarDays(todayKey, -(nominalDays - 1))
  const displayStartKey =
    historyKey === null || nominalStartKey === null
      ? null
      : historyKey > nominalStartKey
        ? historyKey
        : nominalStartKey
  const periodEndKey = addAnalyticsCalendarDays(todayKey, 1)
  const previous =
    nominalDays === null || nominalStartKey === null
      ? null
      : {
          start: getAnalyticsLocalDayStart(
            addAnalyticsCalendarDays(nominalStartKey, -nominalDays),
            resolved.timeZone,
          ),
          asOf: shiftAnalyticsCalendarDays(
            input.asOf,
            -nominalDays,
            resolved.timeZone,
          ).toISOString(),
          periodEnd: getAnalyticsLocalDayStart(
            nominalStartKey,
            resolved.timeZone,
          ),
        }

  return {
    selection: input.selection,
    nominalDays,
    asOf: input.asOf.toISOString(),
    timeZone: resolved.timeZone,
    timeZoneFallback: resolved.fallback,
    historyStart: earliest?.toISOString() ?? null,
    nominalStartKey,
    nominalStart:
      nominalStartKey === null
        ? null
        : getAnalyticsLocalDayStart(nominalStartKey, resolved.timeZone),
    displayStartKey,
    displayStart:
      displayStartKey === null
        ? null
        : getAnalyticsLocalDayStart(displayStartKey, resolved.timeZone),
    todayKey,
    periodEnd: getAnalyticsLocalDayStart(periodEndKey, resolved.timeZone),
    availableDays:
      displayStartKey === null
        ? 0
        : calendarOrdinal(todayKey) - calendarOrdinal(displayStartKey) + 1,
    previous,
  }
}

function calendarOrdinal(key: string): number {
  // UTC is a calendar index here, not the elapsed duration of a local day.
  return Date.parse(`${key}T00:00:00.000Z`) / 86_400_000
}
```

- [x] **Step 4: Run the focused command again.** Expected: all bounds tests pass. Confirm no test substitutes a valid metric's first bucket for the raw origin.

- [x] **Step 5: Commit only the two new files.** Run `rtk git add src/features/analytics/domain/analytics-history-window.ts src/features/analytics/domain/analytics-history-window.test.ts`, then `rtk git commit -m "feat(analytics): add available history window bounds"`.

## Task 2: Bounded Calendar Buckets And Daily Backlog

**Files:** Modify both new files from Task 1; reuse the `AnalyticsTimeBucket` type from `analytics-time.ts`.

- [x] **Step 1: Add these imports and tests to the test file.** Replace its named import from the new module with:

```ts
import {
  buildAnalyticsBacklogTimeFrame,
  buildAnalyticsHistoryBounds,
  buildAnalyticsHistoryBucketPlan,
  parseAnalyticsHistorySelection,
} from './analytics-history-window'
```

Append these tests:

```ts
function planFor(start: string, selection: 30 | 90 | 'all' = 'all') {
  return buildAnalyticsHistoryBucketPlan(
    buildAnalyticsHistoryBounds({
      selection,
      asOf,
      timeZone: 'UTC',
      history: history(start),
    }),
  )
}

describe('analytics calendar bucket plans', () => {
  it('uses daily dates for twelve days and no buckets for empty history', () => {
    const young = planFor('2026-09-24T12:00:00Z', 30)
    expect(young.grouping).toEqual({ unit: 'day', step: 1 })
    expect(young.buckets).toHaveLength(12)
    const empty = buildAnalyticsHistoryBucketPlan(
      buildAnalyticsHistoryBounds({
        selection: 'all',
        asOf,
        timeZone: 'UTC',
        history: [],
      }),
    )
    expect(empty).toEqual({ grouping: null, buckets: [] })
  })

  it('preserves nominal three-day anchors and clips a young first interval', () => {
    const result = planFor('2026-09-16T12:00:00Z', 30)
    expect(result.grouping).toEqual({ unit: 'day', step: 3 })
    expect(result.buckets[0]).toMatchObject({
      startKey: '2026-09-16',
      endKey: '2026-09-17',
      start: '2026-09-16T00:00:00.000Z',
      end: '2026-09-18T00:00:00.000Z',
      isPartial: false,
    })
    expect(result.buckets.at(-1)).toMatchObject({
      endKey: '2026-10-05',
      isPartial: true,
    })
  })

  it('uses Monday weeks for ninety days and preserves all local dates', () => {
    const result = planFor('2025-01-01T00:00:00Z', 90)
    expect(result.grouping).toEqual({ unit: 'week', step: 1 })
    expect(result.buckets[0]).toMatchObject({
      startKey: '2026-07-08',
      endKey: '2026-07-12',
    })
    expect(result.buckets.at(-1)?.endKey).toBe('2026-10-05')
    for (let index = 1; index < result.buckets.length; index += 1) {
      expect(result.buckets[index]?.start).toBe(result.buckets[index - 1]?.end)
    }
  })

  it.each([
    ['2025-10-06T00:00:00Z', 'week', 1],
    ['2025-10-05T00:00:00Z', 'month', 1],
    ['2021-10-01T00:00:00Z', 'month', 3],
    ['2006-10-01T00:00:00Z', 'year', 1],
    ['1800-01-01T00:00:00Z', 'year', 5],
  ] as const)('bounds All time from %s using %s/%s', (start, unit, step) => {
    const result = planFor(start)
    expect(result.grouping).toEqual({ unit, step })
    expect(result.buckets.length).toBeLessThanOrEqual(60)
    expect(result.buckets[0]?.startKey).toBe(start.slice(0, 10))
    expect(result.buckets.at(-1)?.endKey).toBe('2026-10-05')
    for (let index = 0; index < result.buckets.length; index += 1) {
      const bucket = result.buckets[index]!
      expect(Date.parse(bucket.end)).toBeGreaterThan(Date.parse(bucket.start))
      if (index > 0) expect(bucket.start).toBe(result.buckets[index - 1]?.end)
    }
  })

  it('uses real local midnights across spring-forward and fall-back', () => {
    for (const [date, expectedStart, expectedEnd] of [
      ['2026-03-08', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z'],
      ['2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z'],
    ]) {
      const result = buildAnalyticsHistoryBucketPlan(
        buildAnalyticsHistoryBounds({
          selection: 30,
          asOf: new Date(`${date}T17:00:00Z`),
          timeZone: 'America/New_York',
          history: history(`${date}T12:00:00Z`),
        }),
      )
      expect(result.buckets[0]?.start).toBe(expectedStart)
      expect(result.buckets[0]?.end).toBe(expectedEnd)
    }
  })

  it('retains leap day and year boundaries as real local dates', () => {
    for (const [start, end, dates] of [
      ['2024-02-28', '2024-03-01', ['2024-02-28', '2024-02-29', '2024-03-01']],
      ['2025-12-31', '2026-01-02', ['2025-12-31', '2026-01-01', '2026-01-02']],
    ] as const) {
      const result = buildAnalyticsHistoryBucketPlan(
        buildAnalyticsHistoryBounds({
          selection: 'all',
          asOf: new Date(`${end}T17:00:00Z`),
          timeZone: 'UTC',
          history: history(`${start}T12:00:00Z`),
        }),
      )
      expect(result.buckets.map((bucket) => bucket.startKey)).toEqual(dates)
    }
  })

  it('keeps every retained record in one interval when resolution changes', () => {
    const events = history(
      '2025-10-06T12:00:00Z',
      '2026-02-28T12:00:00Z',
      '2026-09-24T12:00:00Z',
      '2026-10-05T17:00:00.123Z',
    )
    const bounds = buildAnalyticsHistoryBounds({
      selection: 'all',
      asOf,
      timeZone: 'UTC',
      history: events,
    })
    for (const report of [
      bounds,
      {
        ...bounds,
        asOf: '2026-10-06T17:00:00.123Z',
        todayKey: '2026-10-06',
        periodEnd: '2026-10-07T00:00:00.000Z',
        availableDays: 366,
      },
    ]) {
      const plan = buildAnalyticsHistoryBucketPlan(report)
      for (const event of events) {
        expect(
          plan.buckets.filter(
            (bucket) =>
              event.reviewedAt.getTime() >= Date.parse(bucket.start) &&
              event.reviewedAt.getTime() < Date.parse(bucket.end),
          ),
        ).toHaveLength(1)
      }
    }
  })

  it('keeps backlog at thirty daily slots independently of history selection', () => {
    const backlog = buildAnalyticsBacklogTimeFrame({ asOf, timeZone: 'UTC' })
    expect(backlog.buckets).toHaveLength(30)
    expect(backlog.periodStart).toBe('2026-09-06T00:00:00.000Z')
    expect(backlog.periodEnd).toBe('2026-10-06T00:00:00.000Z')
    expect(backlog.buckets[0]?.startKey).toBe('2026-09-06')
    expect(backlog.buckets.at(-1)?.endKey).toBe('2026-10-05')
    expect(
      backlog.buckets.every((bucket) => bucket.startKey === bucket.endKey),
    ).toBe(true)
  })
})
```

- [x] **Step 2: Run `rtk npm run test -- src/features/analytics/domain/analytics-history-window.test.ts`.** Expected: new tests fail because bucket/backlog exports do not exist. The Task 1 bounds tests must remain green.

- [x] **Step 3: Add the complete bucket implementation.** Replace the module's import from `./analytics-time` with:

```ts
import {
  addAnalyticsCalendarDays,
  getAnalyticsDateKey,
  getAnalyticsLocalDayStart,
  resolveAnalyticsTimeZone,
  shiftAnalyticsCalendarDays,
  type AnalyticsTimeBucket,
} from './analytics-time'
```

Append this code to the module:

```ts
export type AnalyticsHistoryGrouping =
  | { unit: 'day'; step: 1 | 3 }
  | { unit: 'week'; step: 1 }
  | { unit: 'month'; step: 1 | 3 }
  | { unit: 'year'; step: number }

export interface AnalyticsHistoryBucketPlan {
  grouping: AnalyticsHistoryGrouping | null
  buckets: AnalyticsTimeBucket[]
}

export function buildAnalyticsHistoryBucketPlan(
  bounds: AnalyticsHistoryBounds,
): AnalyticsHistoryBucketPlan {
  if (bounds.displayStartKey === null) return { grouping: null, buckets: [] }
  const grouping = chooseGrouping(bounds)
  const anchor = bounds.nominalStartKey ?? bounds.displayStartKey
  return {
    grouping,
    buckets: buildCalendarBuckets(
      bounds.displayStartKey,
      bounds.todayKey,
      bounds.timeZone,
      grouping,
      anchor,
    ),
  }
}

export function buildAnalyticsBacklogTimeFrame(input: {
  asOf: Date
  timeZone: string
}): {
  asOf: string
  timeZone: string
  timeZoneFallback: boolean
  periodStart: string
  periodEnd: string
  buckets: AnalyticsTimeBucket[]
} {
  if (!Number.isFinite(input.asOf.getTime())) {
    throw new RangeError('Analytics as-of must be a valid date.')
  }
  const resolved = resolveAnalyticsTimeZone(input.timeZone)
  const today = getAnalyticsDateKey(input.asOf, resolved.timeZone)
  const start = addAnalyticsCalendarDays(today, -29)
  return {
    asOf: input.asOf.toISOString(),
    timeZone: resolved.timeZone,
    timeZoneFallback: resolved.fallback,
    periodStart: getAnalyticsLocalDayStart(start, resolved.timeZone),
    periodEnd: getAnalyticsLocalDayStart(
      addAnalyticsCalendarDays(today, 1),
      resolved.timeZone,
    ),
    buckets: buildCalendarBuckets(
      start,
      today,
      resolved.timeZone,
      {
        unit: 'day',
        step: 1,
      },
      start,
    ),
  }
}

function chooseGrouping(
  bounds: AnalyticsHistoryBounds,
): AnalyticsHistoryGrouping {
  if (bounds.availableDays <= 14) return { unit: 'day', step: 1 }
  if (bounds.availableDays <= 30) return { unit: 'day', step: 3 }
  if (bounds.selection !== 'all' || bounds.availableDays <= 365) {
    return { unit: 'week', step: 1 }
  }
  const start = bounds.displayStartKey!
  const end = bounds.todayKey
  if (monthIndex(end) - monthIndex(start) + 1 <= 60) {
    return { unit: 'month', step: 1 }
  }
  if (
    Math.floor(monthIndex(end) / 3) - Math.floor(monthIndex(start) / 3) + 1 <=
    60
  ) {
    return { unit: 'month', step: 3 }
  }
  let step = 1
  while (
    Math.floor(yearOf(end) / step) - Math.floor(yearOf(start) / step) + 1 >
    60
  ) {
    const base = 10 ** Math.floor(Math.log10(step))
    step =
      step / base === 1 ? base * 2 : step / base === 2 ? base * 5 : base * 10
  }
  return { unit: 'year', step }
}

function buildCalendarBuckets(
  first: string,
  today: string,
  timeZone: string,
  grouping: AnalyticsHistoryGrouping,
  anchor: string,
): AnalyticsTimeBucket[] {
  const result: AnalyticsTimeBucket[] = []
  let naturalStart = alignStart(first, grouping, anchor)
  const periodEnd = addAnalyticsCalendarDays(today, 1)
  while (naturalStart <= today) {
    const naturalEnd = nextBoundary(naturalStart, grouping)
    const startKey = naturalStart < first ? first : naturalStart
    const endExclusiveKey = naturalEnd < periodEnd ? naturalEnd : periodEnd
    const endKey = addAnalyticsCalendarDays(endExclusiveKey, -1)
    result.push({
      key: startKey,
      startKey,
      endKey,
      start: getAnalyticsLocalDayStart(startKey, timeZone),
      end: getAnalyticsLocalDayStart(endExclusiveKey, timeZone),
      isPartial: endKey === today,
    })
    naturalStart = naturalEnd
  }
  if (result.length > 60)
    throw new RangeError('Historical buckets must be bounded.')
  return result
}

function alignStart(
  key: string,
  grouping: AnalyticsHistoryGrouping,
  anchor: string,
): string {
  switch (grouping.unit) {
    case 'day':
      return addAnalyticsCalendarDays(
        anchor,
        Math.floor(
          (calendarOrdinal(key) - calendarOrdinal(anchor)) / grouping.step,
        ) * grouping.step,
      )
    case 'week': {
      const weekday = new Date(`${key}T00:00:00.000Z`).getUTCDay()
      return addAnalyticsCalendarDays(key, -((weekday + 6) % 7))
    }
    case 'month':
      return monthKey(
        Math.floor(monthIndex(key) / grouping.step) * grouping.step,
      )
    case 'year':
      return `${String(Math.floor(yearOf(key) / grouping.step) * grouping.step).padStart(4, '0')}-01-01`
  }
}

function nextBoundary(key: string, grouping: AnalyticsHistoryGrouping): string {
  switch (grouping.unit) {
    case 'day':
      return addAnalyticsCalendarDays(key, grouping.step)
    case 'week':
      return addAnalyticsCalendarDays(key, 7)
    case 'month':
      return monthKey(monthIndex(key) + grouping.step)
    case 'year':
      return `${String(yearOf(key) + grouping.step).padStart(4, '0')}-01-01`
  }
}

function yearOf(key: string): number {
  return Number(key.slice(0, 4))
}

function monthIndex(key: string): number {
  return yearOf(key) * 12 + Number(key.slice(5, 7)) - 1
}

function monthKey(index: number): string {
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}-01`
}
```

- [x] **Step 4: Run the new tests and existing calendar/forecast regressions.** Run `rtk npm run test -- src/features/analytics/domain/analytics-history-window.test.ts src/features/analytics/domain/analytics-time.test.ts src/features/analytics/domain/analytics-range-policy.test.ts`. Expected: all pass; the old supported selector and fourteen-date forecast behavior remain unchanged.

- [x] **Step 5: Commit only this task's changes.** Run `rtk git add src/features/analytics/domain/analytics-history-window.ts src/features/analytics/domain/analytics-history-window.test.ts`, then `rtk git commit -m "feat(analytics): add bounded calendar history buckets"`.

## Task 3: Documentation And Phase Validation

**Files:** Modify `docs/architecture.md` and `docs/superpowers/README.md`; update this plan's execution status only after the named checks actually pass.

- [x] **Step 1: Add this paragraph after the current Analytics owner list in `docs/architecture.md`.** Leave its existing 14/30/90 current-behavior statement intact until runtime integration ships:

```markdown
The tested `src/features/analytics/domain/analytics-history-window.ts` foundation
prepares the approved 30 days / 90 days / All time migration. It separates raw
history origin, nominal comparison bounds, available display bounds, and bounded
calendar grouping, and supplies an independent thirty-date daily backlog frame.
It is not yet wired into the runtime summary or visible selector; the current
14/30/90 behavior above remains active until the integration phase lands.
```

- [x] **Step 2: Update this plan's index entry with the actual implementation/check status.** Use the following wording only when both tasks and the automated gates have passed:

```markdown
- [`plans/2026-10-05-analytics-history-window-foundation.md`](./plans/2026-10-05-analytics-history-window-foundation.md): tested pure selection, available-history bounds, bounded calendar intervals, and fixed daily backlog foundation; current runtime/UI remain unchanged. Range integration and production/human proof are separate pending phases.
```

- [x] **Step 3: Format the changed files and run the required automated gates.** Execute these commands sequentially and record every result:

```sh
rtk proxy npx prettier --ignore-path /dev/null --write src/features/analytics/domain/analytics-history-window.ts src/features/analytics/domain/analytics-history-window.test.ts docs/architecture.md docs/superpowers/README.md docs/superpowers/plans/2026-10-05-analytics-history-window-foundation.md
rtk npm run test -- src/features/analytics/domain/analytics-history-window.test.ts src/features/analytics/domain/analytics-time.test.ts src/features/analytics/domain/analytics-range-policy.test.ts
rtk npm run lint
rtk npm run check
rtk git diff --check
```

Expected: focused suite, lint, full check, formatting, and whitespace checks pass. `rtk npm run check` includes database checks, WXT type generation, TypeScript, lint, and the full test suite. Do not expand testing after a clean final run unless a new change or unresolved concern warrants it.

- [x] **Step 4: Verify the phase boundary.** Confirm only the pure module/tests and honest docs changed, no runtime schema/selector/database writes changed, and no chart or tooltip design was altered. `rtk npm run build` and installed-extension visual smoke may be skipped for this unwired foundation, with that exact reason recorded. The following runtime/dashboard integration phase must run build and prepare required human happy-path/edge-case screenshot or recording proof before PR review/merge; this phase cannot claim that proof is complete or N/A for the final feature.

- [x] **Step 5: Commit the documentation.** Run `rtk git add docs/architecture.md docs/superpowers/README.md docs/superpowers/plans/2026-10-05-analytics-history-window-foundation.md`, then `rtk git commit -m "docs(analytics): record history window foundation"`.

## Done-When And Integration Handoff

This phase is complete when the pure API and exact tests above are implemented, automated gates pass, and current behavior remains explicit. It is not completion of the analytics refactor or range UI.

The next phase must migrate the runtime selection to `30 | 90 | 'all'`, add the separate nullable numeric duration/origin/display/grouping context, allow empty history arrays, update response invariants, read complete history before building bounds, and consume these helpers. It must retain full prehistory for first-record classification and FSRS replay; keep previous nominal bounds independent of display clipping; omit All time prior deltas; route backlog through its daily fixed frame; retain fourteen-date forecast/current snapshots; update URL/control/cache keys and sample guidance together; and update product/testing/design authority docs to match implemented behavior. That phase needs its own exact implementation plan after inspecting the final foundation interfaces.

Inline plan self-review completed against the linked range section: selection/default/legacy values are Task 1; raw origin/young-versus-sparse/prior cutoffs are Task 1; grouping/DST/leap/year boundaries/record coverage/backlog independence are Task 2; honest scope and validation are Task 3. Imports and signatures match the implementation blocks, and every code-edit step includes concrete content. Weighted models, visual layout, runtime readiness, and tooltip cleanup are outside this phase. The bounded output does not cap retained-review scanning or future FSRS replay work.

## Original Planning Validation Record

Before implementation, this document was an unexecuted plan. Its code blocks have not been installed in application files or run as application tests. Planning validation consists of Prettier and `rtk git diff --check`, recorded with the accompanying design amendment. `rtk npm run lint`, `rtk npm run check`, and `rtk npm run build` are skipped for this Markdown-only planning pass. All implementation test results and remaining proof must be recorded during execution.

## Foundation Execution Record

Tasks 1 and 2 were executed with bounds RED/GREEN followed by bucket/backlog RED/GREEN. The missing generated `.wxt/tsconfig.json` was a setup failure, repaired with the pinned `prepare:wxt` command before accepting RED evidence. The code preserves the existing calendar-helper domain. A regression showed that nominal bin arithmetic could unnecessarily generate a year-10000 key for a supported year-9999 report; clipping arithmetic before conversion repaired it without expanding date infrastructure. Exact 60/61-bin transitions, spring/fall prior wall-clock/millisecond preservation, and complete displayed-date coverage were added.

Independent specification review approved the implementation after two persisted coverage additions. Independent quality review found no blocking issue. Its optional near-UTC-midnight origin fixture remains planned in the following service integration's local-boundary scenarios. Root verified the actual source and required automated output. Tasks 1/2 are recorded as one reviewed foundation commit rather than separate intermediate commits to the same two files.

Commands run successfully with Node 24.20.0/npm 11.19.0:

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm ci
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run prepare:wxt
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/domain/analytics-history-window.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/domain/analytics-history-window.test.ts src/features/analytics/domain/analytics-time.test.ts src/features/analytics/domain/analytics-range-policy.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run lint
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run check
rtk proxy node node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check src/features/analytics/domain/analytics-history-window.ts src/features/analytics/domain/analytics-history-window.test.ts docs/architecture.md docs/superpowers/README.md docs/superpowers/plans/2026-10-05-analytics-history-window-foundation.md
rtk git diff --check
```

Focused final result: 69 passed, including 50 new history-window tests. Final full check: database check, WXT preparation, TypeScript and lint passed; 217 test files passed, 2 skipped, 3,078 tests passed and 9 skipped under existing test conditions. The initial full check before the final coverage-only addition passed 3,077 tests; the final check above supersedes it.

Skipped `rtk npm run build` for this unwired pure-domain foundation, as this plan permits. Skipped installed-extension visual smoke for the same phase boundary; the final behavior-changing runtime/dashboard work must run build and prepare human happy-path/edge-case proof before PR review or merge. No database generation was run because no persisted schema changed. The date foundation does not complete the full Analytics refactor.
