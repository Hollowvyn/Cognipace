#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  STARTUP_OPENING_STAGES,
  decodeStartupOpening,
  startupOpeningStatus,
  summarizeStartupSamples,
} from './overlay-startup-samples.mjs'

const STATUSES = new Set(['ok', 'pending', 'timeout', 'error'])
const OPENING_KEYS = new Set([
  'mode',
  'index',
  'status',
  'timerStatus',
  'contextStatus',
  'isolatedContext',
  'wallMs',
  'failureStage',
  'failureCode',
  'values',
])

function requireShape(condition, message) {
  if (!condition) throw new Error(`Invalid startup report: ${message}`)
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateStartupReport(report) {
  requireShape(report?.probe === 'startup-only', 'wrong probe')
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
        STATUSES.has(opening.status) &&
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
  }
  requireShape(
    isDeepStrictEqual(Object.keys(startup.summary).sort(), ['cold', 'warm']),
    'summary modes differ',
  )
  return true
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 3)
      throw new Error(
        'Usage: node scripts/validate-overlay-startup-report.mjs <report.json>',
      )
    const report = JSON.parse(await readFile(process.argv[2], 'utf8'))
    validateStartupReport(report)
    process.stdout.write('Valid startup report\n')
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
