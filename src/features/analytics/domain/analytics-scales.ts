export type AnalyticsDomain = readonly [number, number]

const percentageStep = 0.05
const durationMinimumWindow = 2
const durationTargetTickIntervals = 5

export interface AnalyticsScale {
  domain: AnalyticsDomain
  ticks: readonly number[]
}

export function buildAdaptivePercentageDomain(
  values: readonly number[],
  references: readonly number[] = [],
): AnalyticsDomain {
  const visibleValues = finiteValues([...values, ...references])
  if (visibleValues.length === 0) return [0, 1]

  const lo = Math.min(...visibleValues)
  const hi = Math.max(...visibleValues)
  const window = Math.max((hi - lo) * 1.5, 0.25)
  const center = (lo + hi) / 2
  let lower = center - window / 2
  let upper = center + window / 2

  if (lower < 0) {
    upper = Math.min(1, upper - lower)
    lower = 0
  }
  if (upper > 1) {
    lower = Math.max(0, lower - (upper - 1))
    upper = 1
  }

  return [roundDown(lower, percentageStep), roundUp(upper, percentageStep)]
}

export function buildMagnitudeDomain(
  values: readonly number[],
  requiredReference = 0,
): AnalyticsDomain {
  return buildMagnitudeScale(values, requiredReference).domain
}

export function buildMagnitudeScale(
  values: readonly number[],
  requiredReference = 0,
): AnalyticsScale {
  const peak = Math.max(0, requiredReference, ...finiteValues(values))
  if (peak === 0) return { domain: [0, 1], ticks: [0, 1] }

  const upper = niceCeil(Math.max(1, peak) * 1.1)
  // The approved upper formula leaves peak 1 at 0..2. Preserve that truthful
  // small-count domain and prefer its integer ticks over extra empty space.
  const step = Math.max(1, selectMagnitudeTickStep(upper))

  return {
    domain: [0, upper],
    ticks: buildTicks(0, upper, step),
  }
}

export function buildAdaptiveDurationScale(
  values: readonly number[],
): AnalyticsScale {
  const visibleValues = finiteValues(values)
  if (visibleValues.length === 0)
    return buildNiceScale(0, durationMinimumWindow)

  const lo = Math.min(...visibleValues)
  const hi = Math.max(...visibleValues)
  const span = hi - lo
  const window = Math.max(span * 1.2, durationMinimumWindow)
  const padding = (window - span) / 2
  const lower = Math.max(0, lo - padding)
  // Clamping does not move negative lower padding to the upper edge. The
  // minimum window remains useful for a single or sub-day observation.
  const upper = Math.max(hi + padding, lower + durationMinimumWindow)

  return buildNiceScale(lower, upper)
}

export function buildAdaptiveDurationDomain(
  values: readonly number[],
): AnalyticsDomain {
  return buildAdaptiveDurationScale(values).domain
}

export function buildLogDurationDomain(
  values: readonly number[],
  benchmark = 7,
): AnalyticsDomain {
  const positiveValues = finiteValues([...values, benchmark]).filter(
    (value) => value > 0,
  )
  if (positiveValues.length === 0) return [1, 10]

  return [
    10 ** Math.floor(Math.log10(Math.min(...positiveValues))),
    10 ** Math.ceil(Math.log10(Math.max(...positiveValues))),
  ]
}

function finiteValues(values: readonly number[]): number[] {
  return values.filter(Number.isFinite)
}

function roundDown(value: number, step: number): number {
  return roundToStepPrecision(
    Math.max(0, Math.floor((value + Number.EPSILON) / step) * step),
    step,
  )
}

function roundUp(value: number, step: number): number {
  return roundToStepPrecision(
    Math.min(1, Math.ceil((value - Number.EPSILON) / step) * step),
    step,
  )
}

function roundToStepPrecision(value: number, step: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)))
  return Number(value.toFixed(decimals))
}

function niceCeil(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value))
  const normalized = value / power
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10

  return nice * power
}

function buildNiceScale(lower: number, upper: number): AnalyticsScale {
  const step = selectNiceTickStep((upper - lower) / durationTargetTickIntervals)
  const domain: AnalyticsDomain = [
    roundDownToStep(lower, step),
    roundUpToStep(upper, step),
  ]

  return {
    domain,
    ticks: buildTicks(domain[0], domain[1], step),
  }
}

function selectMagnitudeTickStep(upper: number): number {
  const fiveIntervals = upper / 5
  if (isNiceStep(fiveIntervals)) return fiveIntervals

  return upper / 4
}

function selectNiceTickStep(minimumStep: number): number {
  const power = 10 ** Math.floor(Math.log10(minimumStep))
  const normalized = minimumStep / power
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10

  return factor * power
}

function isNiceStep(value: number): boolean {
  const power = 10 ** Math.floor(Math.log10(value))
  const normalized = value / power

  return [1, 2, 5].some(
    (candidate) => Math.abs(normalized - candidate) < Number.EPSILON * 10,
  )
}

function roundDownToStep(value: number, step: number): number {
  return roundToStepPrecision(
    Math.floor((value + Number.EPSILON) / step) * step,
    step,
  )
}

function roundUpToStep(value: number, step: number): number {
  return roundToStepPrecision(
    Math.ceil((value - Number.EPSILON) / step) * step,
    step,
  )
}

function buildTicks(lower: number, upper: number, step: number): number[] {
  const intervalCount = Math.round((upper - lower) / step)

  return Array.from({ length: intervalCount + 1 }, (_, index) =>
    roundToStepPrecision(lower + index * step, step),
  )
}
