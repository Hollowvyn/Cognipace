export function summarizeStartupSamples(samples) {
  const successful = samples
    .filter((sample) => sample.status === 'ok' && Number.isFinite(sample.ms))
    .map((sample) => sample.ms)
    .sort((left, right) => left - right)
  const rank = (fraction) =>
    successful[Math.ceil(successful.length * fraction) - 1] ?? null
  return {
    count: successful.length,
    p50: successful.length >= 5 ? rank(0.5) : null,
    p95: successful.length >= 5 ? rank(0.95) : null,
  }
}

export const STARTUP_OPENING_STAGES = [
  'navigation-to-content-mount',
  'content-mount-to-url-ready',
  'content-mount-to-page-ready',
  'content-mount-to-timer-ready',
  'content-mount-to-context-ready',
  'page.snapshot',
  'page.metadata',
  'page.upsert',
  'page.app-shell',
  'page.preview',
  'worker.metadata',
  'worker.upsert',
  'worker.snapshot-publish',
  'worker.app-shell',
  'worker.overlay-practice',
  'worker.overlay-queue',
  'worker.overlay-track',
]

const SAMPLE_STATUSES = new Set(['pending', 'timeout', 'error'])
const OPENING_FIELDS = [
  'mode',
  'index',
  'status',
  'timerStatus',
  'contextStatus',
  'isolatedContext',
  'wallMs',
  'failureStage',
  'failureCode',
]

export function encodeStartupOpening(opening) {
  if (
    !Array.isArray(opening.samples) ||
    opening.samples.length !== STARTUP_OPENING_STAGES.length
  )
    throw new Error('Startup opening has the wrong stage count')
  const values = opening.samples.map((entry, index) => {
    if (entry?.stage !== STARTUP_OPENING_STAGES[index])
      throw new Error('Startup opening stage order differs')
    if (entry.status === 'ok' && Number.isFinite(entry.ms) && entry.ms >= 0)
      return entry.ms
    if (SAMPLE_STATUSES.has(entry.status) && entry.ms == null)
      return entry.status
    throw new Error('Startup opening has an invalid sample')
  })
  const result = Object.fromEntries(
    OPENING_FIELDS.filter((field) => Object.hasOwn(opening, field)).map(
      (field) => [field, opening[field]],
    ),
  )
  for (const field of ['failureStage', 'failureCode'])
    if (field in result && !/^[a-z0-9-]{1,64}$/.test(result[field]))
      throw new Error(`Startup opening has an unsafe ${field}`)
  return { ...result, values }
}

export function decodeStartupOpening(opening) {
  if (
    !Array.isArray(opening?.values) ||
    opening.values.length !== STARTUP_OPENING_STAGES.length
  )
    throw new Error('Startup opening has the wrong value count')
  const samples = opening.values.map((value, index) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      return sample(STARTUP_OPENING_STAGES[index], 'ok', value)
    if (SAMPLE_STATUSES.has(value))
      return sample(STARTUP_OPENING_STAGES[index], value)
    throw new Error('Startup opening has an invalid value')
  })
  return {
    ...Object.fromEntries(
      OPENING_FIELDS.filter((field) => Object.hasOwn(opening, field)).map(
        (field) => [field, opening[field]],
      ),
    ),
    samples,
  }
}

const sample = (stage, status, ms = null) => ({ stage, status, ms })

export function projectStartupOpening({
  entries = [],
  navigationStart = 0,
  failureStatus = null,
}) {
  if (failureStatus)
    return STARTUP_OPENING_STAGES.map((stage) => sample(stage, failureStatus))

  const matches = (stage, kind) =>
    entries.filter((entry) => entry.stage === stage && entry.kind === kind)
  const mountMatches = matches('content-mount', 'mark')
  const mount = mountMatches.length === 1 ? mountMatches[0] : null
  const markDuration = (stage, mark, missingStatus = 'pending') => {
    const endMatches = matches(mark, 'mark')
    if (mountMatches.length > 1 || endMatches.length > 1)
      return sample(stage, 'error')
    const end = endMatches[0]
    const ms = mount && end ? end.startTime - mount.startTime : null
    return sample(
      stage,
      ms !== null
        ? Number.isFinite(ms) && ms >= 0
          ? 'ok'
          : 'error'
        : missingStatus,
      ms !== null && Number.isFinite(ms) && ms >= 0 ? ms : null,
    )
  }
  const navigationMs = mount ? mount.startTime - navigationStart : null
  const marks = [
    sample(
      'navigation-to-content-mount',
      mountMatches.length > 1
        ? 'error'
        : navigationMs !== null &&
            Number.isFinite(navigationMs) &&
            navigationMs >= 0
          ? 'ok'
          : 'pending',
      navigationMs !== null &&
        Number.isFinite(navigationMs) &&
        navigationMs >= 0
        ? navigationMs
        : null,
    ),
    markDuration('content-mount-to-url-ready', 'url-ready'),
    markDuration('content-mount-to-page-ready', 'page-ready'),
    markDuration('content-mount-to-timer-ready', 'timer-ready', 'timeout'),
    markDuration('content-mount-to-context-ready', 'context-ready'),
  ]
  const page = STARTUP_OPENING_STAGES.filter((stage) =>
    stage.startsWith('page.'),
  ).map((stage) => {
    const found = matches(stage, 'measure')
    if (found.length > 1) return sample(stage, 'error')
    const duration = found[0]?.duration
    return Number.isFinite(duration) && duration >= 0
      ? sample(stage, 'ok', duration)
      : sample(stage, found.length ? 'error' : 'pending')
  })
  const worker = STARTUP_OPENING_STAGES.filter((stage) =>
    stage.startsWith('worker.'),
  ).map((stage) => sample(stage, 'pending'))
  return [...marks, ...page, ...worker]
}

export function startupOpeningStatus(samples) {
  const statusFor = (stages) => {
    const statuses = stages.map(
      (stage) =>
        samples.find((entry) => entry.stage === stage)?.status ?? 'pending',
    )
    if (statuses.includes('error')) return 'error'
    if (statuses.includes('timeout')) return 'timeout'
    if (statuses.every((status) => status === 'ok')) return 'ok'
    return 'pending'
  }
  const timerStage = 'content-mount-to-timer-ready'
  const contextStage = 'content-mount-to-context-ready'
  return {
    timer: statusFor([timerStage]),
    context: statusFor([contextStage]),
    page: statusFor([
      timerStage,
      contextStage,
      'page.metadata',
      'page.upsert',
      'page.app-shell',
    ]),
  }
}

export function fillFailedStartupOpenings(
  existing,
  requested,
  { mode, failureStage, failureCode },
) {
  const openings = [...existing]
  for (let index = openings.length; index < requested; index++) {
    const failed = index === existing.length
    const status = failed
      ? failureCode === 'timeout'
        ? 'timeout'
        : 'error'
      : 'pending'
    openings.push({
      mode,
      index,
      status,
      timerStatus: status,
      contextStatus: status,
      isolatedContext: false,
      failureStage: failed ? failureStage : 'skipped-after-restart-failure',
      failureCode: failed ? failureCode : 'prior-restart-failure',
      samples: projectStartupOpening({ failureStatus: status }),
    })
  }
  return openings
}

export function summarizeTraceEvidence({
  completed,
  eventCount,
  runTaskCount,
  attributedLongTasks,
}) {
  return {
    status:
      !completed || eventCount === 0 || runTaskCount === 0
        ? 'unavailable'
        : attributedLongTasks.length === 0
          ? 'attribution-unproven'
          : 'captured',
    traceCompleted: completed,
    eventCount,
    runTaskCount,
    cogniPaceLongTasks: attributedLongTasks,
    attributionNote:
      'Task candidates cover all traced processes. CogniPace attribution requires an extension URL in the task arguments; absence of one does not prove no extension long task. Raw trace discarded.',
  }
}

export function projectUnattributedWorkerEntries(entries) {
  const allowed = new Set(
    STARTUP_OPENING_STAGES.filter((stage) => stage.startsWith('worker.')),
  )
  return entries.flatMap((entry) =>
    entry.kind === 'measure' &&
    allowed.has(entry.stage) &&
    Number.isFinite(entry.duration) &&
    entry.duration >= 0
      ? [[STARTUP_OPENING_STAGES.indexOf(entry.stage), entry.duration]]
      : [],
  )
}

export function isTraceTaskEvent(entry) {
  return (
    entry?.ph === 'X' &&
    Number.isFinite(entry.dur) &&
    /(?:^|::)RunTask$/.test(entry.name ?? '')
  )
}
