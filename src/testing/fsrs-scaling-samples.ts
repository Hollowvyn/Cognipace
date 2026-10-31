export interface TimingSample {
  elapsedMs: number | null
  error: string | null
}

export interface TimingSummary {
  samples: TimingSample[]
  successes: number
  failures: number
  p50Ms: number | null
  p95Ms: number | null
}

/** Nearest-rank percentiles retain failures in the raw sample list. */
export function summarizeTimingSamples(
  samples: readonly TimingSample[],
): TimingSummary {
  const elapsed = samples
    .flatMap((sample) => (sample.elapsedMs === null ? [] : [sample.elapsedMs]))
    .sort((left, right) => left - right)

  return {
    samples: [...samples],
    successes: elapsed.length,
    failures: samples.length - elapsed.length,
    p50Ms: nearestRank(elapsed, 0.5),
    p95Ms: elapsed.length >= 5 ? nearestRank(elapsed, 0.95) : null,
  }
}

function nearestRank(values: readonly number[], percentile: number) {
  if (values.length === 0) return null
  return values[Math.ceil(percentile * values.length) - 1] ?? null
}

export async function collectTimingSamples(
  run: () => unknown,
  count: number,
  warmups = 0,
): Promise<TimingSummary> {
  for (let index = 0; index < warmups; index += 1) await run()

  const samples: TimingSample[] = []
  for (let index = 0; index < count; index += 1) {
    const started = performance.now()
    try {
      await run()
      samples.push({ elapsedMs: performance.now() - started, error: null })
    } catch (error) {
      samples.push({
        elapsedMs: null,
        error: error instanceof Error ? error.name : 'UnknownError',
      })
    }
  }
  return summarizeTimingSamples(samples)
}
