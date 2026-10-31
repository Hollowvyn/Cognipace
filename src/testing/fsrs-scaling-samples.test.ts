import { describe, expect, it } from 'vitest'

import {
  collectTimingSamples,
  summarizeTimingSamples,
} from './fsrs-scaling-samples'

describe('scaling sample protocol', () => {
  it('uses nearest rank and keeps failed samples visible', () => {
    const summary = summarizeTimingSamples([
      { elapsedMs: 8, error: null },
      { elapsedMs: null, error: 'QuotaExceededError' },
      { elapsedMs: 2, error: null },
      { elapsedMs: 4, error: null },
      { elapsedMs: 10, error: null },
      { elapsedMs: 6, error: null },
    ])

    expect(summary).toMatchObject({
      successes: 5,
      failures: 1,
      p50Ms: 6,
      p95Ms: 10,
    })
    expect(summary.samples[1]).toEqual({
      elapsedMs: null,
      error: 'QuotaExceededError',
    })
  })

  it('withholds p95 when fewer than five operations succeed', () => {
    expect(
      summarizeTimingSamples([
        { elapsedMs: 2, error: null },
        { elapsedMs: 3, error: null },
      ]),
    ).toMatchObject({ p50Ms: 2, p95Ms: null })
  })

  it('excludes warmup calls from raw samples', async () => {
    let calls = 0
    const result = await collectTimingSamples(
      () => {
        calls += 1
        if (calls === 3) throw new RangeError('private fixture value')
      },
      3,
      2,
    )

    expect(calls).toBe(5)
    expect(result.samples).toHaveLength(3)
    expect(result.samples[0]).toEqual({
      elapsedMs: null,
      error: 'RangeError',
    })
  })
})
