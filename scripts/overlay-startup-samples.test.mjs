import assert from 'node:assert/strict'
import { summarizeStartupSamples } from './overlay-startup-samples.mjs'

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
