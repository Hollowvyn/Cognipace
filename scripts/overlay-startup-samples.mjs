export function summarizeStartupSamples(samples) {
  const successful = samples
    .filter((sample) => sample.status === 'ok' && Number.isFinite(sample.ms))
    .map((sample) => sample.ms)
    .sort((left, right) => left - right)
  const rank = (fraction) =>
    successful[Math.ceil(successful.length * fraction) - 1] ?? null
  return {
    samples: samples.map(({ stage, status, ms }) => ({ stage, status, ms })),
    count: successful.length,
    p50: successful.length >= 5 ? rank(0.5) : null,
    p95: successful.length >= 5 ? rank(0.95) : null,
  }
}
