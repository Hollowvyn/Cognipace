import type { ExtensionSurface } from '@/extension/messaging'
import { isLeetCodeHost, parseLeetCodeProblemLocation } from '@/lib/leetcode'

const methodSurfaceAccess = {
  'notes.getArchiveUsage': ['dashboard'],
  'notes.openEditor': ['dashboard', 'content-script'],
  'notes.saveDocument': ['dashboard', 'content-script'],
  'notes.getProblemNotes': ['dashboard', 'content-script'],
  'notes.listSubmissions': ['dashboard', 'content-script'],
  'notes.getSubmission': ['dashboard', 'content-script'],
  'notes.getAssessment': ['dashboard', 'content-script'],
  'notes.setSavedAiNote': ['dashboard', 'content-script'],
  'analytics.getSummary': ['dashboard'],
  'cache.invalidate': ['background'],
  'runtime.ping': ['background', 'popup', 'dashboard', 'content-script'],
  'app.getShellData': ['popup', 'dashboard', 'content-script'],
  'app.openDashboard': ['content-script'],
  'backup.beginTransfer': ['dashboard'],
  'backup.readTransferChunk': ['dashboard'],
  'backup.appendTransferChunk': ['dashboard'],
  'backup.finishTransfer': ['dashboard'],
  'backup.cancelTransfer': ['dashboard'],
  'backup.exportFullBackup': [],
  'backup.validateFullBackup': [],
  'backup.restoreFullBackup': [],
  'backup.resetLocalData': ['dashboard'],
  'backup.getPendingReplacement': ['dashboard'],
  'backup.retryPendingReplacement': ['dashboard'],
  'genai.getAiProviderSecretPresence': ['popup', 'dashboard'],
  'genai.setAiProviderSecret': ['popup', 'dashboard'],
  'genai.clearAiProviderSecret': ['popup', 'dashboard'],
  'genai.testConnection': ['dashboard'],
  'genai.analyzeLeetCodeSubmission': ['content-script'],
  'genai.cancelLeetCodeAnalysis': ['content-script'],
  'genai.generateLeetCodeImplementation': ['content-script'],
  'genai.cancelLeetCodeImplementation': ['content-script'],
  'genai.getHintConnection': ['content-script'],
  'genai.generateLeetCodeHints': ['content-script'],
  'genai.cancelLeetCodeHints': ['content-script'],
  'imports.preview': ['dashboard'],
  'imports.apply': ['dashboard'],
  'imports.retryPersistence': ['dashboard'],
  'devSmoke.run': ['dashboard'],
  'sync.getStatus': ['popup', 'dashboard', 'content-script'],
  'sync.validateGithubToken': ['dashboard'],
  'sync.validateStoredGithubToken': ['dashboard'],
  'sync.saveGithubToken': ['dashboard'],
  'sync.deleteGithubToken': ['dashboard'],
  'sync.createGithubGist': ['dashboard'],
  'sync.connectGithubGist': ['dashboard'],
  'sync.setEnabled': ['dashboard'],
  'sync.checkRemoteOnOpen': ['popup', 'dashboard', 'content-script'],
  'sync.requestOpenCheck': ['popup', 'dashboard', 'content-script'],
  'sync.pullLatest': ['dashboard'],
  'sync.pushLocal': ['dashboard'],
  'problems.upsertFromPage': ['content-script', 'dashboard'],
  'problems.getLibrary': ['dashboard'],
  'problems.getProblemForEdit': ['dashboard'],
  'problems.createProblem': ['dashboard'],
  'problems.updateProblem': ['dashboard'],
  'problems.resetProblemData': ['dashboard'],
  'problems.deleteProblem': ['dashboard'],
  'problems.bulkUpdateProblems': ['dashboard'],
  'problems.bulkDelete': ['dashboard'],
  'practice.getDetails': ['popup', 'dashboard', 'content-script'],
  'practice.previewReview': ['content-script'],
  'practice.saveReviewResult': ['popup', 'dashboard', 'content-script'],
  'practice.overrideLastReviewResult': ['popup', 'dashboard', 'content-script'],
  'practice.setSuspended': ['popup', 'dashboard', 'content-script'],
  'practice.resetSchedule': ['popup', 'dashboard', 'content-script'],
  'queue.getTodayQueue': ['popup', 'dashboard'],
  'tracks.getActiveTrack': ['popup', 'dashboard'],
  'tracks.getWorkspace': ['dashboard'],
  'tracks.getTrackForEdit': ['dashboard'],
  'tracks.setActiveTrack': ['dashboard'],
  'tracks.clearActiveTrack': ['dashboard'],
  'tracks.createTrack': ['dashboard'],
  'tracks.updateTrack': ['dashboard'],
  'tracks.deleteTrack': ['dashboard'],
  'tracks.removeProblem': ['dashboard'],
  'tracks.resetTrackProgress': ['dashboard'],
  'settings.getSettings': ['popup', 'dashboard'],
  'settings.updateSettings': ['popup', 'dashboard'],
  'settings.toggleStudyMode': ['popup', 'dashboard'],
  'settings.cycleThemeMode': ['dashboard'],
  'leetcode.readProblemMetadata': ['content-script'],
  'leetcode.readProblemContent': ['content-script'],
  'leetcode.readSubmissionResult': ['content-script'],
} as const satisfies Record<string, readonly ExtensionSurface[]>

export const extensionMethodNames = Object.keys(methodSurfaceAccess) as Array<
  keyof typeof methodSurfaceAccess
>

export type ExtensionMethod = keyof typeof methodSurfaceAccess

export function isExtensionMethod(method: string): method is ExtensionMethod {
  return method in methodSurfaceAccess
}

export function canCallExtensionMethod(
  method: string,
  surface: ExtensionSurface,
) {
  return (
    isExtensionMethod(method) &&
    (methodSurfaceAccess[method] as readonly ExtensionSurface[]).includes(
      surface,
    )
  )
}

export function assertCanCallExtensionMethod(
  method: string,
  surface: ExtensionSurface,
) {
  if (!canCallExtensionMethod(method, surface)) {
    throw new Error(`Surface "${surface}" is not allowed to call "${method}".`)
  }
}

export function getMessageSenderSurface(
  sender: unknown,
): ExtensionSurface | null {
  const messageSender = readMessageSender(sender)
  const senderUrl = messageSender.url ?? messageSender.origin

  if (senderUrl) {
    const extensionPageSurface = getExtensionPageSurface(senderUrl)

    if (extensionPageSurface) {
      return extensionPageSurface
    }
  }

  if (messageSender.tab) {
    return 'content-script'
  }

  return null
}

function getExtensionPageSurface(value: string): ExtensionSurface | null {
  const senderUrl = readUrl(value)

  if (senderUrl?.protocol !== 'chrome-extension:') {
    return null
  }

  const senderPath = senderUrl.pathname

  if (senderPath.endsWith('/popup.html')) {
    return 'popup'
  }

  if (senderPath.endsWith('/dashboard.html')) {
    return 'dashboard'
  }

  return null
}

export function assertCanSenderCallExtensionMethod(
  method: string,
  requestedSurface: ExtensionSurface,
  sender: unknown,
) {
  const senderSurface = getMessageSenderSurface(sender)

  if (!senderSurface) {
    throw new Error(`Unable to resolve sender surface for "${method}".`)
  }

  if (senderSurface !== requestedSurface) {
    throw new Error(
      `Sender surface "${senderSurface}" cannot claim "${requestedSurface}".`,
    )
  }

  assertCanCallExtensionMethod(method, senderSurface)
  if (
    method === 'genai.generateLeetCodeImplementation' ||
    method === 'genai.cancelLeetCodeImplementation' ||
    method === 'genai.analyzeLeetCodeSubmission' ||
    method === 'genai.cancelLeetCodeAnalysis' ||
    method === 'genai.getHintConnection' ||
    method === 'genai.generateLeetCodeHints' ||
    method === 'genai.cancelLeetCodeHints'
  ) {
    const senderUrl = readMessageSender(sender).url
    const actualUrl = senderUrl ? readUrl(senderUrl) : null
    if (
      !actualUrl ||
      actualUrl.protocol !== 'https:' ||
      !isLeetCodeHost(actualUrl.hostname)
    )
      throw new Error('Analysis requires an actual HTTPS LeetCode sender.')
    if (
      (method === 'genai.generateLeetCodeImplementation' ||
        method === 'genai.analyzeLeetCodeSubmission' ||
        method === 'genai.getHintConnection' ||
        method === 'genai.generateLeetCodeHints') &&
      !parseLeetCodeProblemLocation(actualUrl)
    )
      throw new Error(
        'Analysis requires an actual LeetCode problem page sender.',
      )
  }
}

export function assertHintProblemSender(
  sender: unknown,
  problem: { host: string; slug: string },
) {
  const senderUrl = readMessageSender(sender).url
  const actualUrl = senderUrl ? readUrl(senderUrl) : null
  const location = actualUrl ? parseLeetCodeProblemLocation(actualUrl) : null
  if (
    !location ||
    location.host !== problem.host ||
    location.slug !== problem.slug
  )
    throw new Error('Hint problem must match the actual sender page.')
}

function readMessageSender(sender: unknown) {
  if (!isRecord(sender)) {
    return {}
  }

  return {
    tab: sender.tab,
    url: typeof sender.url === 'string' ? sender.url : undefined,
    origin: typeof sender.origin === 'string' ? sender.origin : undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function assertNotesProblemSender(sender: unknown, problemSlug: string) {
  const url = readMessageSender(sender).url
  const actual = url ? readUrl(url) : null
  if (
    !actual ||
    actual.protocol !== 'https:' ||
    !isLeetCodeHost(actual.hostname) ||
    parseLeetCodeProblemLocation(actual)?.slug !== problemSlug
  )
    throw new Error(
      'Notes problem must match the actual HTTPS LeetCode sender page.',
    )
}

/** Chrome supplies documentId even when an extension page has no sender.tab.
 * Never substitute caller data, tab identity, or a shared extension origin. */
export function backupTransferDocumentOwner(sender: unknown): string {
  if (
    !isRecord(sender) ||
    typeof sender.documentId !== 'string' ||
    !sender.documentId ||
    getMessageSenderSurface(sender) !== 'dashboard'
  )
    throw new Error(
      'Backup transfer requires an actual dashboard document identity.',
    )
  return sender.documentId
}
