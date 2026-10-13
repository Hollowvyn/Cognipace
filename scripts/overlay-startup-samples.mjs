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
  { mode, failureStage, failureCode, firstFailed = true },
) {
  const openings = [...existing]
  for (let index = openings.length; index < requested; index++) {
    const failed = firstFailed && index === existing.length
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

export function finalizeStartupReport(
  startup,
  { samples: warmCount, coldSamples: coldCount },
  {
    failureStage = 'incomplete-collection',
    failureCode = 'incomplete-collection',
    failed = false,
  } = {},
) {
  const warmIncomplete = startup.warm.length < warmCount
  const warm = warmIncomplete
    ? fillFailedStartupOpenings(startup.warm, warmCount, {
        mode: 'warm',
        failureStage,
        failureCode,
      })
    : startup.warm
  const cold =
    startup.cold.length < coldCount
      ? fillFailedStartupOpenings(startup.cold, coldCount, {
          mode: 'cold',
          failureStage: warmIncomplete
            ? 'skipped-after-startup-failure'
            : failureStage,
          failureCode: warmIncomplete ? 'prior-startup-failure' : failureCode,
          firstFailed: !warmIncomplete,
        })
      : startup.cold
  const openings = { warm, cold }
  const summary = Object.fromEntries(
    ['warm', 'cold'].map((mode) => [
      mode,
      Object.fromEntries(
        STARTUP_OPENING_STAGES.map((stage) => [
          stage,
          summarizeStartupSamples(
            openings[mode].map((opening) =>
              opening.samples.find((entry) => entry.stage === stage),
            ),
          ),
        ]),
      ),
    ]),
  )
  const pageReadinessStatus =
    warm.every((opening) => opening.status === 'ok') &&
    cold.every((opening) => opening.status === 'ok')
      ? 'measured'
      : 'pending'
  return {
    ...startup,
    warm: warm.map(encodeStartupOpening),
    cold: cold.map(encodeStartupOpening),
    summary,
    unattributedWorker: {
      ...startup.unattributedWorker,
      warm: warm.map((opening) => ({
        captureWindow: opening.index,
        values: opening.workerObservations ?? [],
      })),
      cold: cold.map((opening) => ({
        captureWindow: opening.index,
        values: opening.workerObservations ?? [],
      })),
    },
    traces: {
      warm: { status: 'pending', reason: 'not-collected' },
      cold: { status: 'pending', reason: 'not-collected' },
      ...startup.traces,
    },
    pageReadinessStatus,
    status:
      pageReadinessStatus === 'measured' && !failed ? 'partial' : 'pending',
  }
}

const REPORT_STATUSES = new Set(['ok', 'pending', 'timeout', 'error'])
const OPENING_KEYS = new Set([...OPENING_FIELDS, 'values'])
const DATASET_FIXTURE_COUNTS = Object.fromEntries(
  [
    ['standard', 250, 5_000],
    ['stress', 2_500, 50_000],
    ['single-card', 1, 10_000],
  ].map(([name, problems, reviewAttempts]) => [
    name,
    {
      problems,
      reviewAttempts,
      fsrsCards: problems,
      reviewEvidence: reviewAttempts,
      commandReceipts: 1,
      schedulerProfiles: 2,
      generationScopes: problems + 1,
    },
  ]),
)

function requireShape(condition, message) {
  if (!condition) throw new Error(`Invalid startup report: ${message}`)
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateStartupReport(report) {
  requireShape(report?.probe === 'startup-only', 'wrong probe')
  requireShape(
    /^[a-f0-9]{40}$/.test(report.environment?.sourceCommit),
    'source commit missing',
  )
  requireShape(
    /^[a-f0-9]{64}$/.test(report.environment?.extensionBuildSha256),
    'extension build digest missing',
  )
  requireShape(
    /^[a-f0-9]{64}$/.test(report.fixture?.inputDataDigest) &&
      Object.hasOwn(DATASET_FIXTURE_COUNTS, report.dataset) &&
      isDeepStrictEqual(
        report.fixture?.counts,
        DATASET_FIXTURE_COUNTS[report.dataset],
      ),
    'fixture digest or counts missing',
  )
  const startup = report.startup
  requireShape(plainObject(startup), 'missing startup section')
  requireShape(startup.schemaVersion === 2, 'wrong startup schema version')
  requireShape(
    isDeepStrictEqual(startup.stages, STARTUP_OPENING_STAGES),
    'stage order differs',
  )
  requireShape(plainObject(startup.summary), 'missing summary')
  requireShape(
    plainObject(startup.unattributedWorker),
    'missing worker windows',
  )
  requireShape(plainObject(startup.traces), 'missing trace metadata')
  requireShape(
    plainObject(startup.submit) &&
      isDeepStrictEqual(Object.keys(startup.submit).sort(), [
        'reason',
        'status',
      ]) &&
      startup.submit.status === 'pending' &&
      typeof startup.submit.reason === 'string' &&
      startup.submit.reason.length > 0,
    'missing Submit state',
  )

  for (const mode of ['warm', 'cold']) {
    const openings = startup[mode]
    const requested =
      mode === 'warm'
        ? report.requested?.samples
        : report.requested?.coldSamples
    requireShape(
      Number.isSafeInteger(requested) &&
        requested > 0 &&
        Array.isArray(openings) &&
        openings.length === requested,
      `${mode} opening count differs`,
    )
    const decoded = openings.map((opening, index) => {
      requireShape(plainObject(opening), `${mode} opening is not an object`)
      requireShape(
        Object.keys(opening).every((key) => OPENING_KEYS.has(key)),
        `${mode} opening contains an unapproved field`,
      )
      requireShape(
        opening.mode === mode && opening.index === index,
        `${mode} opening identity differs`,
      )
      requireShape(
        typeof opening.isolatedContext === 'boolean',
        `${mode} isolated context missing`,
      )
      requireShape(
        !Object.hasOwn(opening, 'wallMs') ||
          (Number.isFinite(opening.wallMs) && opening.wallMs >= 0),
        `${mode} wall duration invalid`,
      )
      for (const field of ['failureStage', 'failureCode'])
        requireShape(
          !Object.hasOwn(opening, field) ||
            (typeof opening[field] === 'string' &&
              /^[a-z0-9-]{1,64}$/.test(opening[field])),
          `${mode} ${field} invalid`,
        )
      const result = decodeStartupOpening(opening)
      const readiness = startupOpeningStatus(result.samples)
      requireShape(
        REPORT_STATUSES.has(opening.status) &&
          opening.status === readiness.page &&
          opening.timerStatus === readiness.timer &&
          opening.contextStatus === readiness.context,
        `${mode} opening readiness differs`,
      )
      return result
    })

    const modeSummary = startup.summary[mode]
    requireShape(
      plainObject(modeSummary) &&
        isDeepStrictEqual(
          Object.keys(modeSummary).sort(),
          [...STARTUP_OPENING_STAGES].sort(),
        ),
      `${mode} summary stages differ`,
    )
    for (const stage of STARTUP_OPENING_STAGES) {
      const expected = summarizeStartupSamples(
        decoded.map((opening) =>
          opening.samples.find((entry) => entry.stage === stage),
        ),
      )
      requireShape(
        isDeepStrictEqual(modeSummary[stage], expected),
        `${mode} summary for ${stage} differs`,
      )
    }

    const windows = startup.unattributedWorker[mode]
    requireShape(
      Array.isArray(windows) && windows.length === requested,
      `${mode} worker windows missing`,
    )
    for (const [index, window] of windows.entries()) {
      requireShape(
        plainObject(window) &&
          isDeepStrictEqual(Object.keys(window).sort(), [
            'captureWindow',
            'values',
          ]) &&
          window.captureWindow === index &&
          Array.isArray(window.values),
        `${mode} worker window invalid`,
      )
      for (const value of window.values)
        requireShape(
          Array.isArray(value) &&
            value.length === 2 &&
            Number.isSafeInteger(value[0]) &&
            STARTUP_OPENING_STAGES[value[0]]?.startsWith('worker.') &&
            Number.isFinite(value[1]) &&
            value[1] >= 0,
          `${mode} worker value invalid`,
        )
    }

    const trace = startup.traces[mode]
    requireShape(plainObject(trace), `${mode} trace metadata missing`)
    if (trace.status === 'pending')
      requireShape(
        isDeepStrictEqual(Object.keys(trace).sort(), ['reason', 'status']) &&
          typeof trace.reason === 'string' &&
          trace.reason.length > 0,
        `${mode} trace pending reason missing`,
      )
    else
      requireShape(
        ['captured', 'unavailable', 'attribution-unproven'].includes(
          trace.status,
        ) &&
          typeof trace.traceCompleted === 'boolean' &&
          Number.isSafeInteger(trace.eventCount) &&
          trace.eventCount >= 0 &&
          Number.isSafeInteger(trace.runTaskCount) &&
          trace.runTaskCount >= 0 &&
          trace.runTaskCount <= trace.eventCount &&
          Number.isSafeInteger(trace.allProcessLongTaskCandidateCount) &&
          trace.allProcessLongTaskCandidateCount >= 0 &&
          trace.allProcessLongTaskCandidateCount <= trace.runTaskCount &&
          isDeepStrictEqual(trace.taskNamesChecked, [
            'RunTask',
            'ThreadControllerImpl::RunTask',
          ]) &&
          typeof trace.attributionNote === 'string' &&
          trace.attributionNote.length > 0 &&
          Array.isArray(trace.cogniPaceLongTasks),
        `${mode} trace metadata invalid`,
      )
  }
  requireShape(
    isDeepStrictEqual(Object.keys(startup.summary).sort(), ['cold', 'warm']),
    'summary modes differ',
  )
  const pageReadinessStatus =
    startup.warm.every((opening) => opening.status === 'ok') &&
    startup.cold.every((opening) => opening.status === 'ok')
      ? 'measured'
      : 'pending'
  const expectedStatus =
    pageReadinessStatus === 'measured' && !report.failure
      ? 'partial'
      : 'pending'
  requireShape(
    startup.pageReadinessStatus === pageReadinessStatus,
    'page readiness status differs',
  )
  requireShape(startup.status === expectedStatus, 'startup status differs')
  requireShape(report.status === expectedStatus, 'report status differs')
  return true
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
import { isDeepStrictEqual } from 'node:util'
