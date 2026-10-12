import assert from 'node:assert/strict'
import {
  projectStartupOpening,
  projectUnattributedWorkerEntries,
  isTraceTaskEvent,
  summarizeStartupSamples,
  summarizeTraceEvidence,
} from './overlay-startup-samples.mjs'

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test')

test('nearest-rank summary excludes failures and strips payload fields', () => {
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
  assert.equal(result.samples[5].status, 'timeout')
  assert.deepEqual(Object.keys(result.samples[0]), ['stage', 'status', 'ms'])
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
    status: 'pending',
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
  assert.equal(summary.samples.length, 1)
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
      { stage: 'worker.upsert', status: 'unattributed', ms: 12 },
      { stage: 'worker.upsert', status: 'unattributed', ms: 14 },
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
