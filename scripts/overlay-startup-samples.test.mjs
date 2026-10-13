import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  STARTUP_OPENING_STAGES,
  STARTUP_REPORT_GENERATOR_VERSION,
  decodeStartupOpening,
  encodeStartupOpening,
  finalizeStartupReport,
  projectStartupOpening,
  projectUnattributedWorkerEntries,
  isTraceTaskEvent,
  fillFailedStartupOpenings,
  startupOpeningStatus,
  summarizeStartupSamples,
  summarizeTraceEvidence,
  validateStartupReport,
} from './overlay-startup-samples.mjs'

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test')

test('nearest-rank summary excludes failures and stores only derived values', () => {
  const samples = [10, 20, 30, 40, 50].map((ms) => ({
    stage: 'content-mount-to-timer-ready',
    status: 'ok',
    ms,
    url: 'https://leetcode.com/problems/private/',
    slug: 'private',
    code: 'secret code',
    reviewPayload: 'secret review',
  }))
  samples.push({
    stage: 'content-mount-to-timer-ready',
    status: 'timeout',
    ms: null,
    code: 'secret code',
  })
  const result = summarizeStartupSamples(samples)
  assert.equal(result.count, 5)
  assert.equal(result.p50, 30)
  assert.equal(result.p95, 50)
  assert.deepEqual(Object.keys(result), ['count', 'p50', 'p95'])
  assert.doesNotMatch(
    JSON.stringify(result),
    /private|secret|reviewPayload|https:/,
  )
})

test('percentiles require five successes', () => {
  const result = summarizeStartupSamples([{ stage: 'x', status: 'ok', ms: 10 }])
  assert.equal(result.p50, null)
  assert.equal(result.p95, null)
})

test('every opening has one explicit result per expected stage', () => {
  const samples = projectStartupOpening({
    navigationStart: 0,
    entries: [
      { stage: 'content-mount', kind: 'mark', startTime: 10, duration: 0 },
      { stage: 'timer-ready', kind: 'mark', startTime: 30, duration: 0 },
      { stage: 'page.snapshot', kind: 'measure', startTime: 11, duration: 2 },
    ],
  })
  const byStage = Object.fromEntries(
    samples.map((sample) => [sample.stage, sample]),
  )
  assert.equal(samples.length, Object.keys(byStage).length)
  assert.deepEqual(byStage['content-mount-to-timer-ready'], {
    stage: 'content-mount-to-timer-ready',
    status: 'ok',
    ms: 20,
  })
  assert.deepEqual(byStage['page.preview'], {
    stage: 'page.preview',
    status: 'pending',
    ms: null,
  })
  assert.deepEqual(byStage['worker.metadata'], {
    stage: 'worker.metadata',
    status: 'pending',
    ms: null,
  })
})

test('duplicate page entries and missing timer do not produce false successes', () => {
  const samples = projectStartupOpening({
    navigationStart: 0,
    entries: [
      { stage: 'content-mount', kind: 'mark', startTime: 10, duration: 0 },
      { stage: 'page.upsert', kind: 'measure', startTime: 11, duration: 5 },
      { stage: 'page.upsert', kind: 'measure', startTime: 18, duration: 7 },
    ],
  })
  const byStage = Object.fromEntries(
    samples.map((sample) => [sample.stage, sample]),
  )
  assert.deepEqual(byStage['page.upsert'], {
    stage: 'page.upsert',
    status: 'error',
    ms: null,
  })
  assert.deepEqual(byStage['content-mount-to-timer-ready'], {
    stage: 'content-mount-to-timer-ready',
    status: 'timeout',
    ms: null,
  })
})

test('failed openings retain a status in every stage denominator', () => {
  const failed = projectStartupOpening({ failureStatus: 'error' })
  assert.equal(failed.length, 17)
  assert.ok(
    failed.every((sample) => sample.status === 'error' && sample.ms === null),
  )
  const summary = summarizeStartupSamples([
    failed.find((sample) => sample.stage === 'page.preview'),
  ])
  assert.equal(summary.count, 0)
})

test('trace status requires completion and usable events before attribution', () => {
  assert.equal(
    summarizeTraceEvidence({
      completed: false,
      eventCount: 5,
      runTaskCount: 2,
      attributedLongTasks: [],
    }).status,
    'unavailable',
  )
  assert.equal(
    summarizeTraceEvidence({
      completed: true,
      eventCount: 5,
      runTaskCount: 0,
      attributedLongTasks: [],
    }).status,
    'unavailable',
  )
  assert.equal(
    summarizeTraceEvidence({
      completed: true,
      eventCount: 5,
      runTaskCount: 2,
      attributedLongTasks: [],
    }).status,
    'attribution-unproven',
  )
})

test('worker observations retain only fixed stage and duration without attributing an opening', () => {
  assert.deepEqual(
    projectUnattributedWorkerEntries([
      { stage: 'worker.upsert', kind: 'measure', duration: 12, url: 'private' },
      { stage: 'worker.upsert', kind: 'measure', duration: 14 },
      { stage: 'page.upsert', kind: 'measure', duration: 8 },
    ]),
    [
      [11, 12],
      [11, 14],
    ],
  )
})

test('trace task detection accepts current toplevel RunTask names', () => {
  assert.equal(
    isTraceTaskEvent({ name: 'RunTask', ph: 'X', dur: 51_000 }),
    true,
  )
  assert.equal(
    isTraceTaskEvent({
      name: 'ThreadControllerImpl::RunTask',
      ph: 'X',
      dur: 51_000,
    }),
    true,
  )
  assert.equal(
    isTraceTaskEvent({ name: 'RunTask', ph: 'B', dur: 51_000 }),
    false,
  )
  assert.equal(
    isTraceTaskEvent({ name: 'EvaluateScript', ph: 'X', dur: 51_000 }),
    false,
  )
})

test('duplicate timer mark makes both timer stage and opening ambiguous', () => {
  const samples = projectStartupOpening({
    navigationStart: 0,
    entries: [
      { stage: 'content-mount', kind: 'mark', startTime: 10, duration: 0 },
      { stage: 'timer-ready', kind: 'mark', startTime: 20, duration: 0 },
      { stage: 'timer-ready', kind: 'mark', startTime: 30, duration: 0 },
    ],
  })
  assert.deepEqual(
    samples.find((sample) => sample.stage === 'content-mount-to-timer-ready'),
    {
      stage: 'content-mount-to-timer-ready',
      status: 'error',
      ms: null,
    },
  )
  assert.deepEqual(startupOpeningStatus(samples), {
    timer: 'error',
    context: 'pending',
    page: 'error',
  })
})

test('timer readiness does not imply context or full page readiness', () => {
  const samples = projectStartupOpening({
    entries: [
      { stage: 'content-mount', kind: 'mark', startTime: 10 },
      { stage: 'timer-ready', kind: 'mark', startTime: 20 },
      { stage: 'page.metadata', kind: 'measure', duration: 2 },
      { stage: 'page.app-shell', kind: 'measure', duration: 3 },
    ],
  })
  assert.deepEqual(startupOpeningStatus(samples), {
    timer: 'ok',
    context: 'pending',
    page: 'pending',
  })
})

test('compact opening round trips all 17 ordered stages and exact durations', () => {
  const statuses = ['pending', 'timeout', 'error']
  const samples = STARTUP_OPENING_STAGES.map((stage, index) => ({
    stage,
    status: index < 14 ? 'ok' : statuses[index - 14],
    ms: index < 14 ? index + 0.123456789 : null,
  }))
  const opening = {
    mode: 'cold',
    index: 3,
    status: 'pending',
    timerStatus: 'ok',
    contextStatus: 'pending',
    isolatedContext: true,
    wallMs: 42.123456789,
    failureStage: 'timer-ready',
    failureCode: 'timeout',
    samples,
    url: 'https://leetcode.com/problems/private/',
    slug: 'private',
    code: 'secret code',
    backupPayload: { private: true },
  }
  const encoded = encodeStartupOpening(opening)
  assert.deepEqual(encoded.values, [
    ...samples.slice(0, 14).map((entry) => entry.ms),
    ...statuses,
  ])
  assert.deepEqual(decodeStartupOpening(encoded), {
    ...Object.fromEntries(
      [
        'mode',
        'index',
        'status',
        'timerStatus',
        'contextStatus',
        'isolatedContext',
        'wallMs',
        'failureStage',
        'failureCode',
      ].map((key) => [key, opening[key]]),
    ),
    samples,
  })
  assert.doesNotMatch(
    JSON.stringify(encoded),
    /private|secret|https:|backupPayload/,
  )
  for (const values of [
    encoded.values.slice(1),
    [...encoded.values.slice(0, -1), 'unattributed'],
    [...encoded.values.slice(0, -1), Number.POSITIVE_INFINITY],
  ]) {
    assert.throws(() => decodeStartupOpening({ ...encoded, values }))
  }
})

test('cold restart failure fills the requested slots with explicit statuses', () => {
  const existing = [
    {
      mode: 'cold',
      index: 0,
      status: 'ok',
      samples: projectStartupOpening({}),
    },
  ]
  const filled = fillFailedStartupOpenings(existing, 4, {
    mode: 'cold',
    failureStage: 'extension-discovery',
    failureCode: 'service-worker-unavailable',
  })
  assert.deepEqual(
    filled.map((opening) => opening.status),
    ['ok', 'error', 'pending', 'pending'],
  )
  assert.deepEqual(
    filled.map((opening) => opening.index),
    [0, 1, 2, 3],
  )
  assert.ok(filled.slice(1).every((opening) => opening.samples.length === 17))
  assert.equal(filled[1].failureCode, 'service-worker-unavailable')
  assert.equal(
    summarizeStartupSamples(
      filled.map((opening) =>
        opening.samples.find(
          (sample) => sample.stage === 'content-mount-to-timer-ready',
        ),
      ),
    ).count,
    0,
  )
})

test('report validator recomputes nearest-rank summaries and rejects tampering', () => {
  const makeOpening = (index, mode) => {
    const samples = STARTUP_OPENING_STAGES.map((stage) => ({
      stage,
      status: 'pending',
      ms: null,
    }))
    for (const stage of [
      'content-mount-to-timer-ready',
      'content-mount-to-context-ready',
      'page.metadata',
      'page.upsert',
      'page.app-shell',
    ]) {
      const entry = samples.find((item) => item.stage === stage)
      entry.status = 'ok'
      entry.ms = index + 1
    }
    return encodeStartupOpening({
      mode,
      index,
      status: 'ok',
      timerStatus: 'ok',
      contextStatus: 'ok',
      isolatedContext: true,
      wallMs: index + 10,
      samples,
    })
  }
  const warm = Array.from({ length: 5 }, (_, index) =>
    makeOpening(index, 'warm'),
  )
  const cold = Array.from({ length: 5 }, (_, index) =>
    makeOpening(index, 'cold'),
  )
  const summary = Object.fromEntries(
    ['warm', 'cold'].map((mode) => [
      mode,
      Object.fromEntries(
        STARTUP_OPENING_STAGES.map((stage) => [
          stage,
          [
            'content-mount-to-timer-ready',
            'content-mount-to-context-ready',
            'page.metadata',
            'page.upsert',
            'page.app-shell',
          ].includes(stage)
            ? { count: 5, p50: 3, p95: 5 }
            : { count: 0, p50: null, p95: null },
        ]),
      ),
    ]),
  )
  const report = {
    status: 'partial',
    probe: 'startup-only',
    dataset: 'standard',
    requested: { samples: 5, coldSamples: 5 },
    environment: {
      generatorVersion: STARTUP_REPORT_GENERATOR_VERSION,
      sourceCommit: 'a'.repeat(40),
      extensionBuildSha256: 'b'.repeat(64),
      chrome: 'Google Chrome for Testing 151.0.7922.47',
      extensionVersion: '2.2.0',
      os: 'darwin 27.0.0 arm64',
      cpu: 'Apple M2 Pro',
    },
    fixture: {
      inputDataDigest: 'c'.repeat(64),
      counts: {
        problems: 250,
        reviewAttempts: 5_000,
        fsrsCards: 250,
        reviewEvidence: 5_000,
        commandReceipts: 1,
        schedulerProfiles: 2,
        generationScopes: 251,
      },
    },
    startup: {
      schemaVersion: 2,
      stages: STARTUP_OPENING_STAGES,
      status: 'partial',
      pageReadinessStatus: 'measured',
      warm,
      cold,
      summary,
      traces: {
        warm: { status: 'pending', reason: 'not-collected' },
        cold: { status: 'pending', reason: 'not-collected' },
      },
      submit: { status: 'pending', reason: 'not-authenticated' },
      unattributedWorker: {
        warm: Array.from({ length: 5 }, (_, captureWindow) => ({
          captureWindow,
          values: captureWindow === 0 ? [[11, 1.23456789]] : [],
        })),
        cold: Array.from({ length: 5 }, (_, captureWindow) => ({
          captureWindow,
          values: [],
        })),
      },
    },
  }
  assert.equal(validateStartupReport(report), true)
  const dir = mkdtempSync(join(tmpdir(), 'startup-validator-'))
  const file = join(dir, 'report.json')
  const validator = join(
    process.cwd(),
    'scripts',
    'validate-overlay-startup-report.mjs',
  )
  try {
    writeFileSync(file, JSON.stringify(report))
    const validCli = spawnSync(process.execPath, [validator, file])
    assert.equal(validCli.status, 0, validCli.stderr.toString())
    assert.notEqual(spawnSync(process.execPath, [validator]).status, 0)
    assert.notEqual(
      spawnSync(process.execPath, [validator, file, file]).status,
      0,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const missingWindow = report.startup.unattributedWorker.warm.pop()
  assert.throws(() => validateStartupReport(report), /worker window/i)
  report.startup.unattributedWorker.warm.push(missingWindow)
  for (const [target, key, replacement] of [
    [report.startup, 'pageReadinessStatus', 'pending'],
    [report.startup, 'status', 'pending'],
    [report, 'status', 'pending'],
    [report.environment, 'sourceCommit', undefined],
    [report.environment, 'generatorVersion', undefined],
    [report.environment, 'generatorVersion', 'unknown-version'],
    [report.environment, 'extensionBuildSha256', undefined],
    [report.environment, 'chrome', undefined],
    [report.environment, 'extensionVersion', undefined],
    [report.environment, 'os', undefined],
    [report.environment, 'cpu', undefined],
    [report.fixture, 'inputDataDigest', undefined],
    [report.fixture, 'counts', undefined],
    [report.fixture.counts, 'problems', 251],
    [report.startup.traces, 'warm', undefined],
    [report.startup, 'submit', undefined],
    [report.startup.submit, 'code', 'secret code'],
  ]) {
    const hadKey = Object.hasOwn(target, key)
    const original = target[key]
    if (replacement === undefined) delete target[key]
    else target[key] = replacement
    assert.throws(
      () => validateStartupReport(report),
      /invalid startup report/i,
    )
    if (hadKey) target[key] = original
    else delete target[key]
  }
  report.startup.traces.warm = {
    status: 'captured',
    traceCompleted: true,
    eventCount: 3,
    runTaskCount: 1,
    cogniPaceLongTasks: [],
  }
  assert.throws(() => validateStartupReport(report), /trace metadata/i)
  report.startup.traces.warm = {
    status: 'pending',
    reason: 'not-collected',
  }
  report.startup.summary.warm['page.upsert'].p95 = 4
  assert.throws(() => validateStartupReport(report), /summary/i)
  report.startup.summary.warm['page.upsert'].p95 = 5
  report.startup.warm[0].values[0] = Number.POSITIVE_INFINITY
  assert.throws(() => validateStartupReport(report), /value/i)

  const invalidDir = mkdtempSync(join(tmpdir(), 'startup-validator-'))
  try {
    const invalidFile = join(invalidDir, 'invalid.json')
    writeFileSync(invalidFile, JSON.stringify(report))
    const result = spawnSync(process.execPath, [validator, invalidFile])
    assert.notEqual(result.status, 0)
  } finally {
    rmSync(invalidDir, { recursive: true, force: true })
  }
})

test('failed startup setup finalizes every requested slot and worker window', () => {
  const startup = finalizeStartupReport(
    {
      schemaVersion: 2,
      stages: STARTUP_OPENING_STAGES,
      warm: [],
      cold: [],
      unattributedWorker: { warm: [], cold: [] },
      traces: {},
      submit: { status: 'pending', reason: 'not-authenticated' },
    },
    { samples: 2, coldSamples: 2 },
    { failureStage: 'chrome-launch', failureCode: 'chrome-exited' },
  )
  assert.deepEqual(
    startup.warm.map((opening) => opening.status),
    ['error', 'pending'],
  )
  assert.deepEqual(
    startup.cold.map((opening) => opening.status),
    ['pending', 'pending'],
  )
  assert.equal(startup.warm[0].values.length, 17)
  assert.equal(startup.summary.warm['page.upsert'].count, 0)
  assert.equal(startup.unattributedWorker.warm.length, 2)
  assert.equal(startup.unattributedWorker.cold.length, 2)
  assert.deepEqual(startup.traces.warm, {
    status: 'pending',
    reason: 'not-collected',
  })
  assert.equal(startup.pageReadinessStatus, 'pending')
  assert.equal(startup.status, 'pending')
  assert.equal(
    validateStartupReport({
      probe: 'startup-only',
      status: 'pending',
      dataset: 'standard',
      requested: { samples: 2, coldSamples: 2 },
      environment: {
        generatorVersion: STARTUP_REPORT_GENERATOR_VERSION,
        sourceCommit: 'a'.repeat(40),
        extensionBuildSha256: 'b'.repeat(64),
        chrome: 'Google Chrome for Testing 151.0.7922.47',
        extensionVersion: '2.2.0',
        os: 'darwin 27.0.0 arm64',
        cpu: 'Apple M2 Pro',
      },
      fixture: {
        inputDataDigest: 'c'.repeat(64),
        counts: {
          problems: 250,
          reviewAttempts: 5_000,
          fsrsCards: 250,
          reviewEvidence: 5_000,
          commandReceipts: 1,
          schedulerProfiles: 2,
          generationScopes: 251,
        },
      },
      startup,
      failure: { code: 'chrome-exited', message: 'chrome-exited' },
    }),
    true,
  )
})
