#!/usr/bin/env node

/**
 * Disposable, packaged-extension FSRS benchmark.
 *
 * Build first, then run:
 *   node scripts/fsrs-scaling-chrome.mjs --backup test-results/fsrs-phase-g/standard-backup.json --dataset standard
 *   node scripts/fsrs-scaling-chrome.mjs --backup test-results/fsrs-phase-g/stress-backup.json --dataset stress --chrome '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
 *
 * This program never attaches to a running Chrome instance or reuses a profile.
 * It stores only counts, hashes, durations, version strings and sanitized errors.
 */

import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { accessSync, constants, readdirSync } from 'node:fs'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
} from 'node:fs/promises'
import { platform, release, arch, cpus, totalmem, homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_DIST = join(ROOT, 'dist', 'chrome-mv3')
const DEFAULT_OUT = join(
  ROOT,
  'docs',
  'superpowers',
  'evidence',
  'fsrs-phase-g',
)
const DATASET_COUNTS = {
  standard: { problems: 250, reviewAttempts: 5_000 },
  stress: { problems: 2_500, reviewAttempts: 50_000 },
  'single-card': { problems: 1, reviewAttempts: 10_000 },
}
const TIMEOUT_MS = 120_000
const OPERATION_NAMES = [
  'queue',
  'practiceDetails',
  'analytics30',
  'analytics90',
  'analyticsall',
  'backupExport',
  'backupValidation',
  'save',
  'sameCommandRetry',
  'update',
  'backupRestore',
  'serviceWorkerReopen',
  'fullBrowserRestart',
]

function parseArgs(argv) {
  const args = {
    dist: DEFAULT_DIST,
    out: DEFAULT_OUT,
    samples: null,
    warmups: 3,
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--help' || flag === '-h') return { help: true }
    if (flag === '--initial-restore-only') {
      args.initialRestoreOnly = true
      continue
    }
    if (flag === '--preview-only') {
      args.previewOnly = true
      continue
    }
    if (
      ![
        '--backup',
        '--dataset',
        '--chrome',
        '--dist',
        '--out',
        '--samples',
        '--warmups',
        '--problem-url',
      ].includes(flag)
    )
      throw new Error(`Unknown option: ${flag}`)
    const value = argv[++i]
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for ${flag}`)
    args[flag.slice(2).replaceAll('-', '')] = value
  }
  if (!args.backup || !args.dataset)
    throw new Error('--backup and --dataset are required')
  if (!Object.hasOwn(DATASET_COUNTS, args.dataset))
    throw new Error('Dataset must be standard, stress, or single-card')
  args.samples =
    args.samples === null
      ? args.dataset === 'stress'
        ? 10
        : 20
      : Number(args.samples)
  args.warmups = Number(args.warmups)
  if (
    ![args.samples, args.warmups].every(Number.isSafeInteger) ||
    args.samples < 1 ||
    args.warmups < 0
  )
    throw new Error(
      '--samples must be positive and --warmups must be nonnegative integers',
    )
  args.backup = resolve(args.backup)
  args.dist = resolve(args.dist)
  args.out = resolve(args.out)
  if (args.chrome) args.chrome = resolve(args.chrome)
  return args
}

function usage() {
  return `Usage: node scripts/fsrs-scaling-chrome.mjs --backup <v6-synthetic-backup.json> --dataset <standard|stress|single-card> [options]

Options:
  --chrome <path>       Chrome executable (auto-detected on macOS/Linux)
  --dist <path>         Packaged Chrome MV3 directory (default: dist/chrome-mv3)
  --out <path>          Sanitized JSON evidence directory (default: docs/superpowers/evidence/fsrs-phase-g)
  --samples <n>        Timed samples (default: 20, stress: 10)
  --warmups <n>        Untimed warmups (default: 3)
  --problem-url <url>  HTTPS LeetCode problem URL for content-script preview attempt
  --initial-restore-only  Bounded setup/quota probe; no operation timings
  --preview-only    Bounded proper-sender content preview probe

The driver creates and removes a unique /private/tmp Chrome profile. It never
reads a user's Chrome profile. A failed operation is recorded as pending.
`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    )
  return value
}

function digestData(data) {
  return sha256(JSON.stringify(canonical(data)))
}

function protectedFixtureState(data, fixtureSlugs) {
  const slugs = new Set(fixtureSlugs)
  const { generations, ...practice } = data.practice
  const trackId = 'fixture-track-20261010'
  const groupId = 'fixture-group-20261010'
  return {
    fixtureProblems: data.problems.filter((row) => slugs.has(row.slug)),
    ...practice,
    generationScopes: generations
      .filter(
        (row) =>
          row.scopeId === 'local' ||
          (row.problemSlug && slugs.has(row.problemSlug)),
      )
      .map(({ scopeId, problemSlug }) => ({ scopeId, problemSlug })),
    tracks: data.tracks.tracks.filter((row) => row.id === trackId),
    groups: data.tracks.groups.filter((row) => row.id === groupId),
    memberships: data.tracks.memberships.filter(
      (row) => row.trackGroupId === groupId,
    ),
    progress: data.tracks.progress.filter((row) => row.trackId === trackId),
    session: data.tracks.session,
  }
}

function protectedFixtureDigest(data, fixtureSlugs) {
  return digestData(protectedFixtureState(data, fixtureSlugs))
}

async function directoryDigest(directory) {
  const hash = createHash('sha256')
  async function visit(path, relative = '') {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const child = join(path, entry.name)
      const name = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) await visit(child, name)
      else if (entry.isFile()) {
        hash.update(name)
        hash.update('\0')
        hash.update(await readFile(child))
      }
    }
  }
  await visit(directory)
  return hash.digest('hex')
}

async function installedVersion(packageName) {
  try {
    const manifest = JSON.parse(
      await readFile(
        join(ROOT, 'node_modules', packageName, 'package.json'),
        'utf8',
      ),
    )
    return manifest.version ?? null
  } catch {
    return null
  }
}

function countsOf(data) {
  return {
    problems: data.problems.length,
    reviewAttempts: data.practice.reviewAttempts.length,
    fsrsCards: data.practice.fsrsCards.length,
    reviewEvidence: data.practice.reviewEvidence.length,
    commandReceipts: data.practice.commandReceipts.length,
    schedulerProfiles: data.practice.schedulerProfiles.length,
    generationScopes: data.practice.generations.length,
  }
}

function assertSafeBackup(backup, dataset) {
  if (
    backup?.schemaVersion !== 6 ||
    backup?.app !== 'cognipace' ||
    !backup.data
  )
    throw new Error('Expected a CogniPace v6 full backup')
  const counts = countsOf(backup.data)
  const expected = DATASET_COUNTS[dataset]
  if (
    counts.problems !== expected.problems ||
    counts.reviewAttempts !== expected.reviewAttempts
  )
    throw new Error(`Fixture counts do not match ${dataset}`)
  const fixtureSlugs = Array.from(
    { length: expected.problems },
    (_, index) =>
      `fixture-${dataset}-20261010-${index.toString().padStart(5, '0')}`,
  )
  const slugSet = new Set(fixtureSlugs)
  const trackId = 'fixture-track-20261010'
  const groupId = 'fixture-group-20261010'
  const expectedProfiles = new Set([
    'fixture-profile-75-20261010',
    'fixture-profile-90-20261010',
  ])
  const expectedScopes = new Set([
    'local',
    ...fixtureSlugs.map((slug) => `problem:${slug}`),
  ])
  const expectedTrackLinks = Math.min(20, expected.problems)
  const attemptsPerCard = expected.reviewAttempts / expected.problems
  const attemptIds = new Set()
  for (const slug of fixtureSlugs)
    for (let index = 0; index < attemptsPerCard; index++)
      attemptIds.add(
        `${slug}:default:attempt-${index.toString().padStart(5, '0')}`,
      )
  if (
    backup.exportedAt !== '2026-10-10T12:00:00.000Z' ||
    counts.fsrsCards !== expected.problems ||
    counts.reviewEvidence !== expected.reviewAttempts ||
    counts.commandReceipts !== 1 ||
    counts.schedulerProfiles !== 2 ||
    counts.generationScopes !== expected.problems + 1 ||
    backup.data.topics.length !== 2 ||
    backup.data.topics.some(
      (row) =>
        !['fixture-topic-a-20261010', 'fixture-topic-b-20261010'].includes(
          row.id,
        ),
    ) ||
    backup.data.problemTopics.length !== expected.problems ||
    backup.data.problemTopics.some(
      (row) =>
        !slugSet.has(row.problemSlug) ||
        !['fixture-topic-a-20261010', 'fixture-topic-b-20261010'].includes(
          row.topicId,
        ),
    ) ||
    backup.data.topicAliases.length !== 0 ||
    backup.data.topicRelations.length !== 0 ||
    backup.data.companies.length !== 0 ||
    backup.data.problemCompanies.length !== 0 ||
    backup.data.practice.problemPractice.length !== expected.problems ||
    backup.data.practice.problemPractice.some(
      (row) => !slugSet.has(row.problemSlug),
    ) ||
    new Set(backup.data.practice.reviewAttempts.map((row) => row.id)).size !==
      expected.reviewAttempts ||
    new Set(backup.data.practice.fsrsCards.map((row) => row.id)).size !==
      expected.problems ||
    new Set(backup.data.problems.map((row) => row.slug)).size !==
      expected.problems ||
    backup.data.problems.some((row) => !slugSet.has(row.slug)) ||
    backup.data.practice.reviewAttempts.some(
      (row) =>
        !slugSet.has(row.problemSlug) ||
        !attemptIds.has(row.id) ||
        row.cardId !== `${row.problemSlug}:default`,
    ) ||
    backup.data.practice.fsrsCards.some(
      (row) =>
        !slugSet.has(row.problemSlug) ||
        row.id !== `${row.problemSlug}:default`,
    ) ||
    backup.data.practice.commandReceipts.some(
      (row) =>
        row.commandId !== 'fixture-command-20261010' ||
        row.problemSlug !== fixtureSlugs[0],
    ) ||
    backup.data.practice.schedulerProfiles.some(
      (row) => !expectedProfiles.has(row.id),
    ) ||
    backup.data.practice.generations.some(
      (row) => !expectedScopes.has(row.scopeId),
    ) ||
    backup.data.practice.reviewEvidence.some(
      (row) => !attemptIds.has(row.reviewAttemptId),
    ) ||
    backup.data.tracks.tracks.length !== 1 ||
    backup.data.tracks.tracks[0]?.id !== trackId ||
    backup.data.tracks.groups.length !== 1 ||
    backup.data.tracks.groups[0]?.id !== groupId ||
    backup.data.tracks.groups[0]?.trackId !== trackId ||
    backup.data.tracks.memberships.length !== expectedTrackLinks ||
    backup.data.tracks.memberships.some(
      (row) => row.trackGroupId !== groupId || !slugSet.has(row.problemSlug),
    ) ||
    backup.data.tracks.progress.length !== expectedTrackLinks ||
    backup.data.tracks.progress.some(
      (row) => row.trackId !== trackId || !slugSet.has(row.problemSlug),
    ) ||
    backup.data.tracks.session.length !== 1 ||
    backup.data.tracks.session[0]?.activeTrackId !== trackId ||
    backup.data.tracks.session[0]?.activeGroupId !== groupId ||
    backup.data.settings.length !== 0
  )
    throw new Error(
      'Backup does not match the approved synthetic fixture identity',
    )
  for (const row of backup.data.settings ?? []) {
    const settings = JSON.parse(row.value)
    if (settings.aiAssessment?.enabled !== false)
      throw new Error('Fixture must have AI assessment disabled before restore')
  }
  return counts
}

function detectChrome(explicit) {
  if (explicit) return explicit
  const candidates =
    platform() === 'darwin'
      ? [
          ...chromeForTestingCandidates(),
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ]
  for (const candidate of candidates) {
    try {
      statSyncSafe(candidate)
      return candidate
    } catch {
      /* try next */
    }
  }
  throw new Error('Chrome executable not found; pass --chrome <path>')
}

function chromeForTestingCandidates() {
  const directory = join(homedir(), '.cache', 'puppeteer', 'chrome')
  try {
    return readdirSync(directory)
      .sort()
      .reverse()
      .map((version) =>
        join(
          directory,
          version,
          'chrome-mac-arm64',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        ),
      )
  } catch {
    return []
  }
}

function statSyncSafe(path) {
  accessSync(path, constants.X_OK)
}

function safeError(error) {
  const message = String(error?.message ?? error).toLowerCase()
  const code = message.includes('invalid-read-response')
    ? 'invalid-read-response'
    : message.includes('sqlite') && message.includes('variable')
      ? 'sqlite-variable-limit'
      : message.includes('quota')
        ? 'storage-quota'
        : message.includes('persistence-pending')
          ? 'publication-pending'
          : message.includes('message length') ||
              message.includes('message size') ||
              message.includes('too large') ||
              message.includes('maximum allowed')
            ? 'chrome-message-size-limit'
            : message.includes('serialize') || message.includes('serialization')
              ? 'serialization-failed'
              : message.includes('out of memory') ||
                  message.includes('allocation failed')
                ? 'memory-exhausted'
                : message.includes('message port closed') ||
                    message.includes('receiving end does not exist') ||
                    message.includes('could not establish connection')
                  ? 'messaging-disconnected'
                  : message.includes('devtools port') ||
                      message.includes('devtools endpoint')
                    ? 'chrome-debugger-unavailable'
                    : message.includes('chrome exited')
                      ? 'chrome-exited'
                      : message.includes('service worker') ||
                          message.includes('service-worker')
                        ? 'service-worker-unavailable'
                        : message.includes('dashboard sender origin')
                          ? 'dashboard-origin-unavailable'
                          : message.includes('timed out')
                            ? 'timeout'
                            : message.includes('sync or ai is enabled')
                              ? 'isolation-check-failed'
                              : message.includes('digest') ||
                                  message.includes('differ from fixture')
                                ? 'fixture-integrity-failed'
                                : message.includes('restore')
                                  ? 'restore-failed'
                                  : message.includes('preview')
                                    ? 'preview-failed'
                                    : message.includes('message') ||
                                        message.includes('sender')
                                      ? 'messaging-failed'
                                      : 'unexpected-error'
  const allowedComponents = new Set([
    'fixtureProblems',
    'problemPractice',
    'fsrsCards',
    'reviewAttempts',
    'schedulerProfiles',
    'reviewEvidence',
    'commandReceipts',
    'generationScopes',
    'tracks',
    'groups',
    'memberships',
    'progress',
    'session',
  ])
  const allowedPreviewStages = new Set([
    'targetOpen',
    'isolatedContext',
    'pageOrigin',
    'senderPing',
    'targetDetails',
    'submit',
    'update',
    'concurrentSave',
  ])
  return {
    code,
    message: code,
    ...(allowedPreviewStages.has(error?.previewStage)
      ? { previewStage: error.previewStage }
      : {}),
    ...(Array.isArray(error?.components)
      ? {
          components: error.components.filter((name) =>
            allowedComponents.has(name),
          ),
        }
      : {}),
  }
}

function summary(samples) {
  const good = samples
    .filter((sample) => sample.status === 'ok')
    .map((sample) => sample.ms)
    .sort((a, b) => a - b)
  const rank = (q) => good[Math.ceil(good.length * q) - 1]
  return {
    attempted: samples.length,
    succeeded: good.length,
    p50Ms: good.length ? rank(0.5) : null,
    p95Ms: good.length >= 5 ? rank(0.95) : null,
  }
}

async function waitForJson(url, timeoutMs = 30_000) {
  const started = performance.now()
  while (performance.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return await response.json()
    } catch {
      /* Chrome is starting */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150))
  }
  throw new Error('Chrome DevTools endpoint did not start')
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Set()
  }
  async open() {
    await new Promise((resolveOpen, reject) => {
      this.ws.addEventListener('open', resolveOpen, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        if (message.error)
          pending.reject(
            new Error(`CDP ${message.error.code}: ${message.error.message}`),
          )
        else pending.resolve(message.result ?? {})
      } else for (const listener of this.listeners) listener(message)
    })
    this.ws.addEventListener('close', () => {
      for (const pending of this.pending.values())
        pending.reject(new Error('Chrome DevTools disconnected'))
      this.pending.clear()
    })
  }
  send(method, params = {}, sessionId, timeoutMs = TIMEOUT_MS) {
    return new Promise((resolveSend, reject) => {
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP ${method} timed out`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolveSend, reject, timer })
      this.ws.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      )
    })
  }
  on(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  close() {
    this.ws.close()
  }
}

async function launchChrome(chromePath, dist, profile) {
  // A reused disposable profile can retain the previous process's CDP port.
  await rm(join(profile, 'DevToolsActivePort'), { force: true })
  const child = spawn(
    chromePath,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  let startupDiagnostic = ''
  let startupFailure = null
  child.stderr.on('data', (chunk) => {
    startupDiagnostic = `${startupDiagnostic}${chunk.toString()}`.slice(-4_000)
  })
  child.on('error', (error) => {
    startupFailure = error
  })
  let cdp
  try {
    let port
    const started = performance.now()
    while (performance.now() - started < 30_000) {
      if (startupFailure) throw startupFailure
      if (child.exitCode !== null)
        throw new Error(
          `Chrome exited with code ${child.exitCode}: ${startupDiagnostic.slice(-400)}`,
        )
      try {
        const activePort = await readFile(
          join(profile, 'DevToolsActivePort'),
          'utf8',
        )
        port = Number(activePort.split('\n')[0])
        if (Number.isSafeInteger(port) && port > 0) break
      } catch {
        /* Chrome has not written its port yet */
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    }
    if (!port)
      throw new Error(
        `Chrome did not publish a DevTools port: ${startupDiagnostic.slice(-400)}`,
      )
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`)
    cdp = new Cdp(version.webSocketDebuggerUrl)
    await cdp.open()
    return { child, cdp, version }
  } catch (error) {
    cdp?.close()
    await stopChild(child)
    throw error
  }
}

async function stopChrome(chrome) {
  if (!chrome) return
  chrome.cdp.close()
  await stopChild(chrome.child)
}

async function stopChild(child) {
  if (child.exitCode !== null || !child.pid) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await Promise.race([
      new Promise((resolveExit) => child.once('exit', resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
    ])
  }
}

async function extensionId(cdp) {
  const started = performance.now()
  let observed = []
  while (performance.now() - started < 30_000) {
    const { targetInfos } = await cdp.send('Target.getTargets')
    const workers = targetInfos.filter(
      (target) =>
        target.type === 'service_worker' &&
        /^chrome-extension:\/\/[a-p]{32}\//.test(target.url),
    )
    observed = workers.map((target) => new URL(target.url).pathname.slice(1))
    for (const worker of workers) {
      let sessionId
      try {
        ;({ sessionId } = await cdp.send('Target.attachToTarget', {
          targetId: worker.targetId,
          flatten: true,
        }))
        await cdp.send('Runtime.enable', {}, sessionId)
        const result = await cdp.send(
          'Runtime.evaluate',
          {
            expression: 'chrome.runtime.getManifest().name',
            returnByValue: true,
          },
          sessionId,
        )
        if (result.result?.value === 'CogniPace')
          return new URL(worker.url).hostname
      } catch {
        /* another extension worker or a worker restarting */
      } finally {
        if (sessionId)
          await cdp
            .send('Target.detachFromTarget', { sessionId })
            .catch(() => undefined)
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200))
  }
  throw new Error(
    `Packaged extension service worker was not discovered (observed: ${observed.join(', ') || 'none'})`,
  )
}

async function readWorkerBase64Capability(cdp, extensionId) {
  const { targetInfos } = await cdp.send('Target.getTargets')
  const worker = targetInfos.find(
    (target) =>
      target.type === 'service_worker' &&
      target.url.startsWith(`chrome-extension://${extensionId}/background.js`),
  )
  if (!worker) return null
  let sessionId
  try {
    ;({ sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: worker.targetId,
      flatten: true,
    }))
    const response = await cdp.send(
      'Runtime.evaluate',
      {
        expression: "typeof Uint8Array.prototype.toBase64 === 'function'",
        returnByValue: true,
      },
      sessionId,
    )
    return typeof response.result?.value === 'boolean'
      ? response.result.value
      : null
  } catch {
    return null
  } finally {
    if (sessionId)
      await cdp
        .send('Target.detachFromTarget', { sessionId })
        .catch(() => undefined)
  }
}

async function openTarget(cdp, url, onContext) {
  const { targetId } = await cdp.send('Target.createTarget', { url })
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  })
  const removeListener = onContext
    ? cdp.on((event) => {
        if (
          event.sessionId === sessionId &&
          event.method === 'Runtime.executionContextCreated'
        )
          onContext(event.params.context)
      })
    : null
  await cdp.send('Runtime.enable', {}, sessionId)
  return { targetId, sessionId, removeListener }
}

async function waitForDashboard(cdp, target, extensionId) {
  const started = performance.now()
  let lastLocation = 'unavailable'
  while (performance.now() - started < 15_000) {
    try {
      const href = await evaluate(cdp, target, 'location.href')
      const url = new URL(href)
      lastLocation = `${url.protocol}${url.pathname}`
      if (
        url.protocol === 'chrome-extension:' &&
        url.hostname === extensionId &&
        url.pathname === '/dashboard.html'
      )
        return
    } catch {
      /* navigation in progress */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(
    `Dashboard sender origin was not established (last location: ${lastLocation})`,
  )
}

async function evaluate(
  cdp,
  target,
  expression,
  timeoutMs = TIMEOUT_MS,
  contextId,
) {
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...(contextId ? { contextId } : {}),
    },
    target.sessionId,
    timeoutMs,
  )
  if (exceptionDetails)
    throw new Error(
      `Page evaluation failed: ${exceptionDetails.text ?? 'unknown'}`,
    )
  if (result?.value === undefined)
    throw new Error('Page evaluation returned no value')
  return result.value
}

function browserCall(method, data, kind = 'status') {
  const methodJson = JSON.stringify(method)
  const dataJson = JSON.stringify(data)
  const kindJson = JSON.stringify(kind)
  const expectedRangeJson = JSON.stringify(
    kind === 'analytics' ? data.range : null,
  )
  return `(async () => {
    const before = performance.now();
    const envelope = await chrome.runtime.sendMessage({ id: Math.floor(Math.random() * 1e9), type: ${methodJson}, data: ${dataJson}, timestamp: Date.now() });
    const ms = performance.now() - before;
    if (!envelope || envelope.err) return { ms, status: 'error', error: { name: envelope?.err?.name ?? 'MessagingError', message: envelope?.err?.message ?? 'No response' } };
    const result = envelope.res;
    if (${kindJson} === 'ping' || ${kindJson} === 'contentPing') return { ms, status: result?.ok && result?.surface === (${kindJson} === 'ping' ? 'dashboard' : 'content-script') ? 'ok' : 'error', result: { ok: result?.ok, surface: result?.surface } };
    if (${kindJson} === 'backup') {
      const bytes = new TextEncoder().encode(JSON.stringify(result.data)).byteLength;
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(result.data)))), b => b.toString(16).padStart(2,'0')).join('');
      const data = result.data;
      return { ms, status: 'ok', result: { dataDigest: digest, dataBytes: bytes, counts: { problems: data.problems.length, reviewAttempts: data.practice.reviewAttempts.length, fsrsCards: data.practice.fsrsCards.length, reviewEvidence: data.practice.reviewEvidence.length, commandReceipts: data.practice.commandReceipts.length } } };
    }
    if (${kindJson} === 'details') return { ms, status: 'ok', result: { generation: result?.generation, latestReview: result?.latestReview ? { reviewAttemptId: result.latestReview.reviewAttemptId, revision: result.latestReview.revision, reviewedAt: result.latestReview.reviewedAt } : null, canOverrideLatestReview: result?.canOverrideLatestReview, reviewCount: result?.reviewCount, lastReviewedAt: result?.lastReviewedAt, problemSlug: result?.problemSlug } };
    if (${kindJson} === 'settings') return { ms, status: 'ok', result: { aiEnabled: result?.aiAssessment?.enabled } };
    if (${kindJson} === 'sync') return { ms, status: 'ok', result: { enabled: result?.enabled, configured: result?.configured, isSyncing: result?.isSyncing } };
    if (${kindJson} === 'queue') {
      const valid = Number.isSafeInteger(result?.dueCount) && result.dueCount >= 0 &&
        Number.isSafeInteger(result?.newCount) && result.newCount >= 0 && Array.isArray(result?.items);
      return { ms, status: valid ? 'ok' : 'error', ...(valid ? { result: { dueCount: result.dueCount, newCount: result.newCount, itemCount: result.items.length } } : { error: { message: 'invalid-read-response' } }) };
    }
    if (${kindJson} === 'analytics') {
      const valid = result?.range === ${expectedRangeJson} && Number.isSafeInteger(result?.totalReviews) &&
        result.totalReviews >= 0 && Number.isSafeInteger(result?.reviewDays) && result.reviewDays >= 0 &&
        result?.views && typeof result.views === 'object';
      return { ms, status: valid ? 'ok' : 'error', ...(valid ? { result: { range: result.range, totalReviews: result.totalReviews, reviewDays: result.reviewDays } } : { error: { message: 'invalid-read-response' } }) };
    }
    if (${kindJson} === 'validation') return { ms, status: 'ok', result: { schemaVersion: result?.schemaVersion, counts: result?.counts } };
    if (${kindJson} === 'smoke') return { ms, status: 'ok', result: { capacity: result?.capacity ?? null, readTimings: result?.readTimings ?? null, checkStatuses: result?.checks?.map(check => ({ id: check.id, status: check.status })) ?? [] } };
    if (${kindJson} === 'restore') return { ms, status: result?.status === 'durable' ? 'ok' : 'error', result: { status: result?.status, syncMetadataPending: result?.syncMetadataPending, counts: result?.summary?.counts } };
    if (${kindJson} === 'command') return { ms, status: result?.status === 'saved' ? 'ok' : 'error', result: { status: result?.status, reason: result?.reason, acknowledgement: result?.acknowledgement ? { commandId: result.acknowledgement.commandId, reviewAttemptId: result.acknowledgement.reviewAttemptId, revision: result.acknowledgement.revision } : null } };
    if (${kindJson} === 'preview') return { ms, status: result?.status === 'ready' ? 'ok' : 'error', result: { status: result?.status, reason: result?.reason, evidence: result?.evidence } };
    return { ms, status: 'ok', result: { status: result?.status } };
  })()`
}

function assertOk(sample, stage) {
  if (sample.status !== 'ok')
    throw new Error(
      `${stage}: ${sample.error?.message ?? sample.result?.status ?? 'unexpected response'}`,
    )
  return sample.result
}

async function call(cdp, page, method, data, kind, contextId) {
  const timeoutMs =
    data?.backup?.data?.practice?.reviewAttempts?.length > 10_000
      ? 300_000
      : TIMEOUT_MS
  const result = await evaluate(
    cdp,
    page,
    browserCall(method, data, kind),
    timeoutMs,
    contextId,
  )
  if (result.error) result.error = safeError(result.error)
  return result
}

async function verifyFixtureRows(cdp, page, fixtureSlugs) {
  return evaluate(
    cdp,
    page,
    `(async () => {
    const wire = await chrome.runtime.sendMessage({ id: Math.floor(Math.random() * 1e9), type: 'backup.exportFullBackup', data: { surface: 'dashboard' }, timestamp: Date.now() });
    if (!wire || wire.err) throw Error(wire?.err?.message ?? 'Backup export failed');
    const data = wire.res.data;
    const slugs = new Set(${JSON.stringify(fixtureSlugs)});
    const presentFixtureSlugs = data.problems.filter(row => slugs.has(row.slug)).length;
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    const { generations, ...practice } = data.practice;
    const trackId = 'fixture-track-20261010';
    const groupId = 'fixture-group-20261010';
    const protectedState = {
      fixtureProblems: data.problems.filter(row => slugs.has(row.slug)),
      ...practice,
      generationScopes: generations.filter(row => row.scopeId === 'local' || (row.problemSlug && slugs.has(row.problemSlug)))
        .map(({ scopeId, problemSlug }) => ({ scopeId, problemSlug })),
      tracks: data.tracks.tracks.filter(row => row.id === trackId),
      groups: data.tracks.groups.filter(row => row.id === groupId),
      memberships: data.tracks.memberships.filter(row => row.trackGroupId === groupId),
      progress: data.tracks.progress.filter(row => row.trackId === trackId),
      session: data.tracks.session,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(canonical(protectedState)));
    const protectedDigest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const componentDigests = {};
    for (const [key, value] of Object.entries(protectedState)) {
      const componentBytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
      componentDigests[key] = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', componentBytes)), b => b.toString(16).padStart(2, '0')).join('');
    }
    return {
      protectedDigest,
      componentDigests,
      presentFixtureSlugs,
      totalProblems: data.problems.length,
      reviewAttempts: data.practice.reviewAttempts.length,
      fsrsCards: data.practice.fsrsCards.length,
      reviewEvidence: data.practice.reviewEvidence.length,
      commandReceipts: data.practice.commandReceipts.length,
      schedulerProfiles: data.practice.schedulerProfiles.length,
      generationScopes: protectedState.generationScopes.length,
      fixtureTracks: protectedState.tracks.length,
      fixtureGroups: protectedState.groups.length,
      fixtureMemberships: protectedState.memberships.length,
      fixtureProgress: protectedState.progress.length,
      trackSessions: protectedState.session.length,
    };
  })()`,
  )
}

async function verifyDisabled(cdp, page) {
  const sync = assertOk(
    await call(cdp, page, 'sync.getStatus', { surface: 'dashboard' }, 'sync'),
    'Sync status',
  )
  const settings = assertOk(
    await call(
      cdp,
      page,
      'settings.getSettings',
      { surface: 'dashboard' },
      'settings',
    ),
    'Settings',
  )
  if (
    sync.enabled ||
    sync.configured ||
    sync.isSyncing ||
    settings.aiEnabled !== false
  )
    throw new Error('Sync or AI is enabled in disposable profile')
}

async function restoreAndVerify(cdp, page, backup, expected) {
  await verifyDisabled(cdp, page)
  const restored = assertOk(
    await call(
      cdp,
      page,
      'backup.restoreFullBackup',
      { surface: 'dashboard', backup },
      'restore',
    ),
    'Restore',
  )
  await verifyDisabled(cdp, page)
  const exported = assertOk(
    await call(
      cdp,
      page,
      'backup.exportFullBackup',
      { surface: 'dashboard' },
      'backup',
    ),
    'Post-restore export',
  )
  const protectedRows = await assertProtectedFixtureRows(
    cdp,
    page,
    backup,
    expected,
  )
  return { restored, exported, protectedRows }
}

async function assertProtectedFixtureRows(cdp, page, backup, expected) {
  const fixtureSlugs = backup.data.problems.map((row) => row.slug)
  const protectedRows = await verifyFixtureRows(cdp, page, fixtureSlugs)
  if (
    protectedRows.presentFixtureSlugs !== expected.problems ||
    protectedRows.reviewAttempts !== expected.reviewAttempts ||
    protectedRows.fsrsCards !== expected.fsrsCards ||
    protectedRows.reviewEvidence !== expected.reviewEvidence ||
    protectedRows.commandReceipts !== expected.commandReceipts ||
    protectedRows.schedulerProfiles !== expected.schedulerProfiles ||
    protectedRows.generationScopes !== expected.generationScopes ||
    protectedRows.fixtureTracks !== backup.data.tracks.tracks.length ||
    protectedRows.fixtureGroups !== backup.data.tracks.groups.length ||
    protectedRows.fixtureMemberships !==
      backup.data.tracks.memberships.length ||
    protectedRows.fixtureProgress !== backup.data.tracks.progress.length ||
    protectedRows.trackSessions !== backup.data.tracks.session.length
  )
    throw new Error(
      'Post-restore fixture slugs or Practice counts differ from fixture',
    )
  if (
    protectedRows.protectedDigest !==
    protectedFixtureDigest(backup.data, fixtureSlugs)
  ) {
    const sourceState = protectedFixtureState(backup.data, fixtureSlugs)
    const changed = Object.entries(sourceState)
      .filter(
        ([key, value]) =>
          digestData(value) !== protectedRows.componentDigests[key],
      )
      .map(([key]) => key)
    const error = new Error(
      'Post-restore protected fixture rows differ from fixture',
    )
    error.components = changed
    throw error
  }
  return protectedRows
}

async function sampleOperation(report, name, count, warmups, fn) {
  const entry = { status: 'measured', warmups, samples: [], summary: null }
  report.operations[name] = entry
  for (let index = -warmups; index < count; index++) {
    try {
      const value = await fn(index)
      if (index >= 0) entry.samples.push({ status: 'ok', ms: value.ms })
    } catch (error) {
      if (index >= 0)
        entry.samples.push({ status: 'error', error: safeError(error) })
      else entry.warmupFailure = safeError(error)
      entry.status = 'pending'
      break
    }
  }
  entry.summary = summary(entry.samples)
  if (entry.summary.succeeded !== count) entry.status = 'pending'
}

function pending(report, name, reason) {
  report.operations[name] = {
    status: 'pending',
    reason,
    samples: [],
    summary: summary([]),
  }
}

function pickSlug(backup) {
  const problem = backup.data.problems[0]
  if (!problem?.slug) throw new Error('Backup contains no problem slug')
  return problem.slug
}

function commandTime(backup) {
  const latest = backup.data.practice.reviewAttempts.reduce(
    (max, row) => Math.max(max, Date.parse(row.reviewedAt ?? 0) || 0),
    0,
  )
  const asOf = Date.parse(backup.exportedAt)
  if (!Number.isFinite(asOf) || asOf <= latest)
    throw new Error(
      'Fixture exportedAt must be a fixed instant after all reviews',
    )
  return new Date(asOf).toISOString()
}

async function readStorageMetrics(cdp, dashboard) {
  return evaluate(
    cdp,
    dashboard,
    `(async () => {
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    const quotaBytes = typeof chrome.storage.local.QUOTA_BYTES === 'number'
      ? chrome.storage.local.QUOTA_BYTES : null;
    const keys = [
      'cognipace_db_snapshot_v1',
      'cognipace_db_snapshot_fingerprint_v1',
      'cognipace_db_recovery_topics_v1',
      'cognipace_db_recovery_tracks_v1',
      'cognipace_db_recovery_fsrs_v1',
    ];
    const keyBytes = {};
    for (const key of keys) keyBytes[key] = await chrome.storage.local.getBytesInUse(key);
    const raw = await chrome.storage.local.get(keys);
    const keyDigests = {};
    for (const key of keys) {
      if (!(key in raw)) { keyDigests[key] = null; continue; }
      const bytes = new TextEncoder().encode(JSON.stringify(raw[key]));
      keyDigests[key] = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    }
    return {
      bytesInUse, quotaBytes,
      headroomBytes: quotaBytes === null ? null : quotaBytes - bytesInUse,
      keyBytes, keyDigests,
      heapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
      heapMethod: performance.memory ? 'Chrome performance.memory.usedJSHeapSize (nonstandard estimate)' : 'unavailable',
    };
  })()`,
  )
}

async function observeHeap(report, cdp, dashboard, stage) {
  try {
    const usedBytes = await evaluate(
      cdp,
      dashboard,
      'performance.memory?.usedJSHeapSize ?? null',
    )
    report.memory.observations.push({ stage, usedBytes })
    report.memory.maxObservedBytes =
      Math.max(report.memory.maxObservedBytes ?? 0, usedBytes ?? 0) || null
  } catch {
    report.memory.observations.push({ stage, usedBytes: null })
  }
}

async function contentPreview(
  report,
  chrome,
  extensionId,
  problemUrl,
  slug,
  reviewedAt,
  dashboard,
  backup,
  expected,
) {
  const parsedUrl = new URL(problemUrl)
  if (
    parsedUrl.protocol !== 'https:' ||
    !['leetcode.com', 'www.leetcode.com'].includes(parsedUrl.hostname) ||
    !/^\/problems\/[^/]+\/?/.test(parsedUrl.pathname)
  )
    throw new Error('Preview URL must be an HTTPS leetcode.com problem page')
  const contexts = []
  let stage = 'targetOpen'
  let tab
  try {
    tab = await openTarget(chrome.cdp, parsedUrl.href, (context) =>
      contexts.push(context),
    )
    stage = 'isolatedContext'
    const started = performance.now()
    let isolated
    while (performance.now() - started < 30_000) {
      isolated = contexts.find(
        (context) =>
          context.origin === `chrome-extension://${extensionId}` &&
          context.auxData?.isDefault === false,
      )
      if (isolated) break
      await new Promise((resolveWait) => setTimeout(resolveWait, 200))
    }
    if (!isolated)
      throw new Error(
        'No installed extension content-script execution context on LeetCode problem page',
      )
    stage = 'pageOrigin'
    const pageLocation = new URL(
      await evaluate(chrome.cdp, tab, 'location.href'),
    )
    if (
      pageLocation.protocol !== 'https:' ||
      !['leetcode.com', 'www.leetcode.com'].includes(pageLocation.hostname) ||
      !/^\/problems\/[^/]+\/?/.test(pageLocation.pathname)
    )
      throw new Error(
        'LeetCode problem page did not load as a valid HTTPS sender',
      )
    stage = 'senderPing'
    assertOk(
      await call(
        chrome.cdp,
        tab,
        'runtime.ping',
        { surface: 'content-script' },
        'contentPing',
        isolated.id,
      ),
      'Content-script messaging preflight',
    )
    stage = 'targetDetails'
    const details = assertOk(
      await call(
        chrome.cdp,
        dashboard,
        'practice.getDetails',
        { surface: 'dashboard', problemSlug: slug, at: reviewedAt },
        'details',
      ),
      'Content preview target',
    )
    if (!details.generation)
      throw new Error('Content preview target has no generation')
    const submit = {
      surface: 'content-script',
      mode: 'submit',
      problemSlug: slug,
      generation: details.generation,
      previewedAt: reviewedAt,
    }
    const samples = []
    stage = 'submit'
    for (
      let index = -report.requested.warmups;
      index < report.requested.samples;
      index++
    ) {
      const value = await call(
        chrome.cdp,
        tab,
        'practice.previewReview',
        submit,
        'preview',
        isolated.id,
      )
      assertOk(value, 'Submit preview')
      if (index >= 0) samples.push({ status: 'ok', ms: value.ms })
    }
    report.contentScriptPreview = {
      status: 'measured',
      sender:
        'installed content-script isolated world on HTTPS LeetCode problem tab',
      submit: { samples, summary: summary(samples) },
    }
    if (!details.canOverrideLatestReview || !details.latestReview) {
      report.contentScriptPreview.update = {
        status: 'pending',
        reason: 'Fixture target has no eligible latest review',
      }
    } else {
      const update = {
        surface: 'content-script',
        mode: 'update',
        problemSlug: slug,
        generation: details.generation,
        targetAttemptId: details.latestReview.reviewAttemptId,
        expectedRevision: details.latestReview.revision,
        reviewedAt: details.latestReview.reviewedAt,
      }
      const updateSamples = []
      stage = 'update'
      for (
        let index = -report.requested.warmups;
        index < report.requested.samples;
        index++
      ) {
        const value = await call(
          chrome.cdp,
          tab,
          'practice.previewReview',
          update,
          'preview',
          isolated.id,
        )
        assertOk(value, 'Update preview')
        if (index >= 0) updateSamples.push({ status: 'ok', ms: value.ms })
      }
      report.contentScriptPreview.update = {
        status: 'measured',
        samples: updateSamples,
        summary: summary(updateSamples),
      }
    }
    const concurrent = { status: 'measured', samples: [], summary: null }
    report.contentScriptPreview.concurrentSave = concurrent
    stage = 'concurrentSave'
    for (
      let index = -report.requested.warmups;
      index < report.requested.samples;
      index++
    ) {
      try {
        await restoreAndVerify(chrome.cdp, dashboard, backup, expected)
        const fresh = assertOk(
          await call(
            chrome.cdp,
            dashboard,
            'practice.getDetails',
            { surface: 'dashboard', problemSlug: slug, at: reviewedAt },
            'details',
          ),
          'Concurrent preview target',
        )
        if (!fresh.generation)
          throw new Error('Concurrent preview target has no generation')
        const request = {
          surface: 'content-script',
          mode: 'submit',
          problemSlug: slug,
          generation: fresh.generation,
          previewedAt: reviewedAt,
        }
        const command = {
          surface: 'dashboard',
          commandId: randomUUID(),
          problemSlug: slug,
          generation: fresh.generation,
          rating: 'good',
          reviewedAt,
          reviewMode: 'manual',
        }
        const [preview, saved] = await Promise.all([
          call(
            chrome.cdp,
            tab,
            'practice.previewReview',
            request,
            'preview',
            isolated.id,
          ),
          call(
            chrome.cdp,
            dashboard,
            'practice.saveReviewResult',
            command,
            'command',
          ),
        ])
        assertOk(saved, 'Concurrent Save')
        if (!['ready', 'conflict'].includes(preview.result?.status))
          throw new Error(
            'Concurrent preview returned neither ready nor conflict',
          )
        if (index >= 0)
          concurrent.samples.push({
            status: 'ok',
            previewMs: preview.ms,
            saveMs: saved.ms,
            previewStatus: preview.result.status,
            previewReason: preview.result.reason ?? null,
            ms: preview.ms,
          })
      } catch (error) {
        if (index >= 0)
          concurrent.samples.push({ status: 'error', error: safeError(error) })
        concurrent.status = 'pending'
        break
      }
    }
    concurrent.summary = summary(concurrent.samples)
    if (concurrent.summary.succeeded !== report.requested.samples)
      concurrent.status = 'pending'
  } catch (error) {
    if (error && typeof error === 'object') error.previewStage = stage
    throw error
  } finally {
    tab?.removeListener?.()
    if (tab)
      await chrome.cdp
        .send('Target.closeTarget', { targetId: tab.targetId })
        .catch(() => undefined)
  }
}

async function main(args) {
  const raw = await readFile(args.backup, 'utf8')
  const backup = JSON.parse(raw)
  const expected = assertSafeBackup(backup, args.dataset)
  const distManifest = JSON.parse(
    await readFile(join(args.dist, 'manifest.json'), 'utf8'),
  )
  if (distManifest.manifest_version !== 3)
    throw new Error('Build is not packaged Chrome MV3')
  const buildDigest = await directoryDigest(args.dist)
  const [
    wxtVersion,
    sqliteVersion,
    drizzleVersion,
    fsrsVersion,
    messagingVersion,
  ] = await Promise.all([
    installedVersion('wxt'),
    installedVersion('@sqlite.org/sqlite-wasm'),
    installedVersion('drizzle-orm'),
    installedVersion('ts-fsrs'),
    installedVersion('@webext-core/messaging'),
  ])
  const chromePath = detectChrome(args.chrome)
  const chromeVersion = execFileSync(chromePath, ['--version'], {
    encoding: 'utf8',
  }).trim()
  const report = {
    schemaVersion: 1,
    status: 'pending',
    startedAt: new Date().toISOString(),
    dataset: args.dataset,
    ...(args.initialRestoreOnly
      ? { probe: 'initial-restore-only' }
      : args.previewOnly
        ? { probe: 'preview-only' }
        : {}),
    fixture: {
      seed: 20261010,
      inputBytes: Buffer.byteLength(raw),
      inputDataDigest: digestData(backup.data),
      counts: expected,
    },
    environment: {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim(),
      node: process.version,
      chrome: chromeVersion,
      os: `${platform()} ${release()} ${arch()}`,
      cpu: cpus()[0]?.model ?? null,
      memoryBytes: totalmem(),
      extensionVersion: distManifest.version,
      extensionBuild: basename(args.dist),
      extensionBuildSha256: buildDigest,
      dependencies: {
        source: 'installed node_modules package.json versions',
        wxt: wxtVersion,
        sqliteWasm: sqliteVersion,
        drizzle: drizzleVersion,
        fsrs: fsrsVersion,
        messaging: messagingVersion,
      },
      profile: 'unique disposable /private/tmp directory; removed after run',
      definition:
        'Warm: same opened Chrome worker and persisted database. Request duration is performance.now() around dashboard chrome.runtime.sendMessage to response. Restore/reset and setup are outside warm operation timers.',
    },
    requested: { samples: args.samples, warmups: args.warmups },
    operations: {},
    memory: {
      method:
        'Sampled dashboard performance.memory.usedJSHeapSize where Chrome exposes it; not a continuous peak or service-worker heap',
      observations: [],
      maxObservedBytes: null,
    },
    contentScriptPreview: {
      status: 'pending',
      reason: 'No valid content-script execution context measured yet',
    },
  }
  const profile = await mkdtemp('/private/tmp/cognipace-fsrs-phase-g-')
  let chrome
  let dashboard
  let stage = 'chromeLaunch'
  try {
    chrome = await launchChrome(chromePath, args.dist, profile)
    stage = 'extensionDiscovery'
    let id = await extensionId(chrome.cdp)
    stage = 'dashboardOrigin'
    dashboard = await openTarget(
      chrome.cdp,
      `chrome-extension://${id}/dashboard.html`,
    )
    await waitForDashboard(chrome.cdp, dashboard, id)
    stage = 'messagingPreflight'
    assertOk(
      await call(
        chrome.cdp,
        dashboard,
        'runtime.ping',
        { surface: 'dashboard' },
        'ping',
      ),
      'Messaging preflight',
    )
    report.environment.extensionId = id
    report.environment.workerUint8ArrayToBase64 =
      await readWorkerBase64Capability(chrome.cdp, id)
    stage = 'isolationBeforeRestore'
    await verifyDisabled(chrome.cdp, dashboard)
    try {
      report.storageBeforeRestore = await readStorageMetrics(
        chrome.cdp,
        dashboard,
      )
    } catch (error) {
      report.storageBeforeRestore = {
        status: 'pending',
        error: safeError(error),
      }
    }
    stage = 'initialRestore'
    const initial = await restoreAndVerify(
      chrome.cdp,
      dashboard,
      backup,
      expected,
    )
    const baselineDigest = initial.exported.dataDigest
    report.fixture.installedDataDigest = baselineDigest
    report.fixture.observedDataDigests = [baselineDigest]
    report.fixture.installedCounts = initial.exported.counts
    report.fixture.protectedFixtureDigest =
      initial.protectedRows.protectedDigest
    report.fixture.presentFixtureSlugs =
      initial.protectedRows.presentFixtureSlugs
    report.fixture.seededCatalogRows =
      initial.protectedRows.totalProblems - expected.problems
    report.fixture.installedDataBytes = initial.exported.dataBytes
    if (args.initialRestoreOnly) {
      try {
        report.storage = await readStorageMetrics(chrome.cdp, dashboard)
      } catch (error) {
        report.storage = { status: 'pending', error: safeError(error) }
      }
      for (const name of OPERATION_NAMES)
        pending(report, name, 'Initial-restore-only probe')
      process.exitCode = 1
      return
    }
    if (args.previewOnly) {
      const slug = pickSlug(backup)
      const reviewedAt = commandTime(backup)
      report.fixture.asOf = reviewedAt
      try {
        await contentPreview(
          report,
          chrome,
          id,
          args.problemurl ?? 'https://leetcode.com/problems/two-sum/',
          slug,
          reviewedAt,
          dashboard,
          backup,
          expected,
        )
      } catch (error) {
        report.contentScriptPreview = {
          status: 'pending',
          error: safeError(error),
        }
      }
      for (const name of OPERATION_NAMES)
        pending(report, name, 'Preview-only probe')
      process.exitCode = 1
      return
    }
    stage = 'measurements'
    try {
      report.storage = await readStorageMetrics(chrome.cdp, dashboard)
    } catch (error) {
      report.storage = { status: 'pending', error: safeError(error) }
    }
    try {
      const smoke = assertOk(
        await call(
          chrome.cdp,
          dashboard,
          'devSmoke.run',
          { surface: 'dashboard', includeCapacity: true, runLiveGenAi: false },
          'smoke',
        ),
        'Packaged dev smoke',
      )
      const direct = await readStorageMetrics(chrome.cdp, dashboard)
      report.storage = direct
      const capacity =
        smoke.capacity?.status === 'available' ? smoke.capacity.storage : null
      const storageMatches =
        capacity !== null &&
        capacity.totalBytes === direct.bytesInUse &&
        capacity.quotaBytes === direct.quotaBytes &&
        capacity.activeSnapshotBytes ===
          direct.keyBytes.cognipace_db_snapshot_v1 &&
        capacity.activeFingerprintBytes ===
          direct.keyBytes.cognipace_db_snapshot_fingerprint_v1 &&
        capacity.recoveryTopicsBytes ===
          direct.keyBytes.cognipace_db_recovery_topics_v1 &&
        capacity.recoveryTracksBytes ===
          direct.keyBytes.cognipace_db_recovery_tracks_v1 &&
        capacity.recoveryFsrsBytes ===
          direct.keyBytes.cognipace_db_recovery_fsrs_v1
      report.devSmoke = {
        status: storageMatches ? 'measured' : 'pending',
        capacity: smoke.capacity,
        readTimings: smoke.readTimings,
        checkStatuses: smoke.checkStatuses,
        matchesDirectStorage: storageMatches,
        liveGenAiRequested: false,
      }
    } catch (error) {
      report.devSmoke = {
        status: 'pending',
        error: safeError(error),
        liveGenAiRequested: false,
      }
    }
    await observeHeap(report, chrome.cdp, dashboard, 'postRestore')
    const slug = pickSlug(backup)
    const reviewedAt = commandTime(backup)
    report.fixture.asOf = reviewedAt
    const readPlan = [
      [
        'queue',
        'queue.getTodayQueue',
        { surface: 'dashboard', at: reviewedAt },
        'queue',
      ],
      [
        'practiceDetails',
        'practice.getDetails',
        { surface: 'dashboard', problemSlug: slug, at: reviewedAt },
        'details',
      ],
      ...[30, 90, 'all'].map((range) => [
        `analytics${range}`,
        'analytics.getSummary',
        { surface: 'dashboard', range, timeZone: 'UTC', at: reviewedAt },
        'analytics',
      ]),
      [
        'backupExport',
        'backup.exportFullBackup',
        { surface: 'dashboard' },
        'backup',
      ],
      [
        'backupValidation',
        'backup.validateFullBackup',
        { surface: 'dashboard', backup },
        'validation',
      ],
    ]
    for (const [name, method, data, kind] of readPlan)
      await sampleOperation(
        report,
        name,
        args.samples,
        args.warmups,
        async () => {
          const value = await call(chrome.cdp, dashboard, method, data, kind)
          assertOk(value, name)
          return value
        },
      )
    await observeHeap(report, chrome.cdp, dashboard, 'afterReads')
    for (const name of ['save', 'sameCommandRetry', 'update'])
      report.operations[name] = {
        status: 'measured',
        warmups: args.warmups,
        samples: [],
        summary: null,
      }
    for (let index = -args.warmups; index < args.samples; index++) {
      try {
        await restoreAndVerify(chrome.cdp, dashboard, backup, expected)
        const details = assertOk(
          await call(
            chrome.cdp,
            dashboard,
            'practice.getDetails',
            { surface: 'dashboard', problemSlug: slug, at: reviewedAt },
            'details',
          ),
          'Fresh Practice details',
        )
        if (!details.generation)
          throw new Error('Restored target has no Practice generation')
        const save = {
          surface: 'dashboard',
          commandId: randomUUID(),
          problemSlug: slug,
          generation: details.generation,
          rating: 'good',
          reviewedAt,
          reviewMode: 'manual',
        }
        const saved = await call(
          chrome.cdp,
          dashboard,
          'practice.saveReviewResult',
          save,
          'command',
        )
        assertOk(saved, 'Save')
        if (index >= 0)
          report.operations.save.samples.push({ status: 'ok', ms: saved.ms })
        const retry = await call(
          chrome.cdp,
          dashboard,
          'practice.saveReviewResult',
          save,
          'command',
        )
        assertOk(retry, 'Same-command Retry')
        if (
          retry.result.acknowledgement?.reviewAttemptId !==
          saved.result.acknowledgement?.reviewAttemptId
        )
          throw new Error('Retry returned a different review receipt')
        if (index >= 0)
          report.operations.sameCommandRetry.samples.push({
            status: 'ok',
            ms: retry.ms,
          })
        await restoreAndVerify(chrome.cdp, dashboard, backup, expected)
        let beforeUpdate = assertOk(
          await call(
            chrome.cdp,
            dashboard,
            'practice.getDetails',
            { surface: 'dashboard', problemSlug: slug, at: reviewedAt },
            'details',
          ),
          'Update target',
        )
        if (
          !beforeUpdate.canOverrideLatestReview ||
          !beforeUpdate.latestReview
        ) {
          const setup = {
            ...save,
            commandId: randomUUID(),
            generation: beforeUpdate.generation,
          }
          assertOk(
            await call(
              chrome.cdp,
              dashboard,
              'practice.saveReviewResult',
              setup,
              'command',
            ),
            'Update setup',
          )
          beforeUpdate = assertOk(
            await call(
              chrome.cdp,
              dashboard,
              'practice.getDetails',
              { surface: 'dashboard', problemSlug: slug, at: reviewedAt },
              'details',
            ),
            'Fresh Update target',
          )
        }
        if (
          !beforeUpdate.canOverrideLatestReview ||
          !beforeUpdate.latestReview ||
          !beforeUpdate.generation
        )
          throw new Error('No eligible latest review for Update')
        const update = {
          surface: 'dashboard',
          commandId: randomUUID(),
          problemSlug: slug,
          generation: beforeUpdate.generation,
          rating: 'hard',
          reviewedAt: beforeUpdate.latestReview.reviewedAt,
          targetAttemptId: beforeUpdate.latestReview.reviewAttemptId,
          expectedRevision: beforeUpdate.latestReview.revision,
        }
        const updated = await call(
          chrome.cdp,
          dashboard,
          'practice.overrideLastReviewResult',
          update,
          'command',
        )
        assertOk(updated, 'Update')
        if (index >= 0)
          report.operations.update.samples.push({
            status: 'ok',
            ms: updated.ms,
          })
      } catch (error) {
        for (const name of ['save', 'sameCommandRetry', 'update']) {
          const entry = report.operations[name]
          if (index >= 0 && entry.samples.length <= index)
            entry.samples.push({ status: 'error', error: safeError(error) })
          entry.status = 'pending'
        }
        break
      }
    }
    for (const name of ['save', 'sameCommandRetry', 'update']) {
      const entry = report.operations[name]
      entry.summary = summary(entry.samples)
      if (entry.summary.succeeded !== args.samples) entry.status = 'pending'
    }
    await observeHeap(report, chrome.cdp, dashboard, 'afterCommands')
    await sampleOperation(
      report,
      'backupRestore',
      args.samples,
      args.warmups,
      async () => {
        await restoreAndVerify(chrome.cdp, dashboard, backup, expected)
        await verifyDisabled(chrome.cdp, dashboard)
        const value = await call(
          chrome.cdp,
          dashboard,
          'backup.restoreFullBackup',
          { surface: 'dashboard', backup },
          'restore',
        )
        assertOk(value, 'Timed restore')
        await verifyDisabled(chrome.cdp, dashboard)
        const exported = assertOk(
          await call(
            chrome.cdp,
            dashboard,
            'backup.exportFullBackup',
            { surface: 'dashboard' },
            'backup',
          ),
          'Timed restore verification',
        )
        report.fixture.observedDataDigests.push(exported.dataDigest)
        await assertProtectedFixtureRows(
          chrome.cdp,
          dashboard,
          backup,
          expected,
        )
        return value
      },
    )
    await observeHeap(report, chrome.cdp, dashboard, 'afterBackupRestore')
    const workerCold = {
      status: 'measured',
      samples: [],
      summary: null,
      definition:
        'CDP closes the CogniPace service-worker target; elapsed wall time ends after dashboard ping and Practice details reopen the same published snapshot',
    }
    report.operations.serviceWorkerReopen = workerCold
    await restoreAndVerify(chrome.cdp, dashboard, backup, expected)
    for (let index = 0; index < 5; index++) {
      try {
        const { targetInfos } = await chrome.cdp.send('Target.getTargets')
        const worker = targetInfos.find(
          (target) =>
            target.type === 'service_worker' &&
            target.url.startsWith(`chrome-extension://${id}/background.js`),
        )
        if (!worker)
          throw new Error(
            'CogniPace service-worker target unavailable for restart',
          )
        const started = performance.now()
        const closed = await chrome.cdp.send('Target.closeTarget', {
          targetId: worker.targetId,
        })
        if (!closed.success)
          throw new Error('CDP did not stop the service worker')
        assertOk(
          await call(
            chrome.cdp,
            dashboard,
            'runtime.ping',
            { surface: 'dashboard' },
            'ping',
          ),
          'Worker reopen ping',
        )
        assertOk(
          await call(
            chrome.cdp,
            dashboard,
            'practice.getDetails',
            { surface: 'dashboard', problemSlug: slug, at: reviewedAt },
            'details',
          ),
          'Worker reopen details',
        )
        workerCold.samples.push({
          status: 'ok',
          ms: performance.now() - started,
        })
        await assertProtectedFixtureRows(
          chrome.cdp,
          dashboard,
          backup,
          expected,
        )
      } catch (error) {
        workerCold.samples.push({ status: 'error', error: safeError(error) })
        workerCold.status = 'pending'
        break
      }
    }
    workerCold.summary = summary(workerCold.samples)
    if (workerCold.summary.succeeded !== 5) workerCold.status = 'pending'
    // Full-browser restart is a separate diagnostic, not a worker-only sample.
    const cold = {
      status: 'measured',
      samples: [],
      summary: null,
      definition:
        'Chrome stop/relaunch and first dashboard details response on the same published snapshot',
    }
    report.operations.fullBrowserRestart = cold
    await restoreAndVerify(chrome.cdp, dashboard, backup, expected)
    for (let index = 0; index < 5; index++) {
      let restartStage = 'stop'
      try {
        await stopChrome(chrome)
        const started = performance.now()
        restartStage = 'launch'
        chrome = await launchChrome(chromePath, args.dist, profile)
        restartStage = 'extensionDiscovery'
        id = await extensionId(chrome.cdp)
        restartStage = 'dashboardOrigin'
        dashboard = await openTarget(
          chrome.cdp,
          `chrome-extension://${id}/dashboard.html`,
        )
        await waitForDashboard(chrome.cdp, dashboard, id)
        restartStage = 'ping'
        assertOk(
          await call(
            chrome.cdp,
            dashboard,
            'runtime.ping',
            { surface: 'dashboard' },
            'ping',
          ),
          'Cold ping',
        )
        restartStage = 'details'
        assertOk(
          await call(
            chrome.cdp,
            dashboard,
            'practice.getDetails',
            { surface: 'dashboard', problemSlug: slug, at: reviewedAt },
            'details',
          ),
          'Cold details',
        )
        cold.samples.push({ status: 'ok', ms: performance.now() - started })
        restartStage = 'verification'
        const reopened = assertOk(
          await call(
            chrome.cdp,
            dashboard,
            'backup.exportFullBackup',
            { surface: 'dashboard' },
            'backup',
          ),
          'Cold reopen verification',
        )
        report.fixture.observedDataDigests.push(reopened.dataDigest)
        await assertProtectedFixtureRows(
          chrome.cdp,
          dashboard,
          backup,
          expected,
        )
      } catch (error) {
        cold.samples.push({
          status: 'error',
          stage: restartStage,
          error: safeError(error),
        })
        cold.status = 'pending'
        break
      }
    }
    cold.summary = summary(cold.samples)
    if (cold.summary.succeeded !== 5) cold.status = 'pending'
    try {
      await contentPreview(
        report,
        chrome,
        id,
        args.problemurl ?? 'https://leetcode.com/problems/two-sum/',
        slug,
        reviewedAt,
        dashboard,
        backup,
        expected,
      )
    } catch (error) {
      report.contentScriptPreview = {
        status: 'pending',
        error: safeError(error),
      }
    }
    report.status =
      Object.values(report.operations).every(
        (entry) => entry.status === 'measured',
      ) &&
      report.contentScriptPreview.status === 'measured' &&
      report.contentScriptPreview.update?.status === 'measured' &&
      report.contentScriptPreview.concurrentSave?.status === 'measured' &&
      report.devSmoke?.status === 'measured'
        ? 'measured'
        : 'pending'
  } catch (error) {
    report.failure = safeError(error)
    report.failureStage = stage
    if (stage === 'initialRestore' && chrome && dashboard) {
      try {
        report.storageAfterFailedRestore = await readStorageMetrics(
          chrome.cdp,
          dashboard,
        )
        const before = report.storageBeforeRestore?.keyDigests
        const after = report.storageAfterFailedRestore.keyDigests
        if (before && after)
          report.durableSnapshotUnchanged = Object.keys(before).every(
            (key) => before[key] === after[key],
          )
      } catch (storageError) {
        report.storageAfterFailedRestore = {
          status: 'pending',
          error: safeError(storageError),
        }
      }
      try {
        const reached = assertOk(
          await call(
            chrome.cdp,
            dashboard,
            'backup.exportFullBackup',
            { surface: 'dashboard' },
            'backup',
          ),
          'Failed restore readback',
        )
        report.reachedAfterFailedRestore = {
          interpretation:
            'live-worker readback after failure; durability is determined by unchanged storage key digests',
          counts: reached.counts,
          dataBytes: reached.dataBytes,
          dataDigest: reached.dataDigest,
        }
      } catch (readError) {
        report.reachedAfterFailedRestore = {
          status: 'pending',
          error: safeError(readError),
        }
      }
    }
    for (const name of OPERATION_NAMES)
      if (!report.operations[name])
        pending(report, name, 'Packaged Chrome setup or verification failed')
  } finally {
    await stopChrome(chrome)
    await rm(profile, { recursive: true, force: true })
    report.completedAt = new Date().toISOString()
    await mkdir(args.out, { recursive: true })
    const file = join(
      args.out,
      `fsrs-phase-g-chrome-${args.dataset}-${new Date().toISOString().replaceAll(':', '-')}.json`,
    )
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`)
    process.stdout.write(`${file}\n`)
    process.stdout.write(
      `${report.status}: ${Object.values(report.operations).filter((entry) => entry.status === 'measured').length} operations measured\n`,
    )
  }
  if (report.status !== 'measured') process.exitCode = 1
}

let args
try {
  args = parseArgs(process.argv.slice(2))
  if (args.help) process.stdout.write(usage())
  else await main(args)
} catch (error) {
  process.stderr.write(`${safeError(error).message}\n${usage()}`)
  process.exitCode = 1
}
