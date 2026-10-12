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

const sample = (stage, status, ms = null) => ({ stage, status, ms })

export function projectStartupOpening({
  entries = [],
  navigationStart = 0,
  failureStatus = null,
}) {
  if (failureStatus)
    return STARTUP_OPENING_STAGES.map((stage) => sample(stage, failureStatus))

  const one = (stage, kind) => {
    const matches = entries.filter(
      (entry) => entry.stage === stage && entry.kind === kind,
    )
    return matches.length === 1 ? matches[0] : null
  }
  const mount = one('content-mount', 'mark')
  const markDuration = (stage, mark, missingStatus = 'pending') => {
    const end = one(mark, 'mark')
    const ms = mount && end ? end.startTime - mount.startTime : null
    return sample(
      stage,
      ms !== null && ms >= 0 ? 'ok' : missingStatus,
      ms !== null && ms >= 0 ? ms : null,
    )
  }
  const navigationMs = mount ? mount.startTime - navigationStart : null
  const marks = [
    sample(
      'navigation-to-content-mount',
      navigationMs !== null && navigationMs >= 0 ? 'ok' : 'pending',
      navigationMs !== null && navigationMs >= 0 ? navigationMs : null,
    ),
    markDuration('content-mount-to-url-ready', 'url-ready'),
    markDuration('content-mount-to-page-ready', 'page-ready'),
    markDuration('content-mount-to-timer-ready', 'timer-ready', 'timeout'),
    markDuration('content-mount-to-context-ready', 'context-ready'),
  ]
  const page = STARTUP_OPENING_STAGES.filter((stage) =>
    stage.startsWith('page.'),
  ).map((stage) => {
    const entry = one(stage, 'measure')
    return sample(stage, entry ? 'ok' : 'pending', entry?.duration ?? null)
  })
  const worker = STARTUP_OPENING_STAGES.filter((stage) =>
    stage.startsWith('worker.'),
  ).map((stage) => sample(stage, 'pending'))
  return [...marks, ...page, ...worker]
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
    Number.isFinite(entry.duration)
      ? [sample(entry.stage, 'unattributed', entry.duration)]
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
