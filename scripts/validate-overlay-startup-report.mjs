#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { validateStartupReport } from './overlay-startup-samples.mjs'

try {
  if (process.argv.length !== 3)
    throw new Error(
      'Usage: node scripts/validate-overlay-startup-report.mjs <report.json>',
    )
  validateStartupReport(JSON.parse(await readFile(process.argv[2], 'utf8')))
  process.stdout.write('Valid startup report\n')
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
