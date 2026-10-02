import { parseLeetCodeProblemLocation } from '../domain/problem-url'
import type {
  LeetCodePageEvent,
  LeetCodeProblemContent,
  LeetCodeProblemLocation,
  LeetCodeProblemMetadata,
} from '../domain/types'
import { createLeetCodeProblemMetadataFingerprint } from '../metadata/metadata-fingerprint'
import { readLeetCodePageSnapshot } from '../page/page-snapshot-reader'
import { createLeetCodeFetchRemoteClient } from '../remote/leetcode-fetch-remote-client'
import { readLeetCodeRemoteAuthFromDocument } from '../remote/leetcode-remote-auth'
import type { LeetCodeRemoteClient } from '../remote/leetcode-remote-client'
import { readLeetCodeSubmissionAttempt } from '../submission/submission-attempt-reader'
import { createLeetCodeHydrationScheduler } from './hydration-scheduler'
import { createLeetCodeNavigationObserver } from './navigation-observer'
import { createLeetCodeSubmissionResultWatch } from './submission-result-watch'
import { readLeetCodeSubmissionClickFromMouseEvent } from './submit-click-observer'

/** Controls the active LeetCode page watcher lifecycle. */
export interface LeetCodePageWatcher {
  start: () => void
  stop: () => void
  refresh: () => void
}

/** Options for wiring the LeetCode page watcher to a browser page. */
export interface LeetCodePageWatcherOptions {
  onEvent: (event: LeetCodePageEvent) => void
  windowRef?: Window | undefined
  documentRef?: Document | undefined
  fetch?: typeof fetch | undefined
  remoteClient?: LeetCodeRemoteClient | undefined
  getCurrentUrl?: (() => string) | undefined
  now?: (() => number) | undefined
  hydrationDelays?: readonly number[] | undefined
  submissionResultReadDelays?: readonly number[] | undefined
  submissionResultWatchDurationMs?: number | undefined
  domSubmissionResultFallbackDelayMs?: number | undefined
  mutationRefreshDebounceMs?: number | undefined
  samePageSnapshotRefreshCooldownMs?: number | undefined
}

/**
 * Watches a LeetCode problem page and emits normalized capture events.
 *
 * The watcher owns DOM/page observation only; consumers should reduce emitted
 * events with reduceLeetCodeCaptureState instead of reading internals directly.
 */
export function createLeetCodePageWatcher(
  options: LeetCodePageWatcherOptions,
): LeetCodePageWatcher {
  const windowRef = options.windowRef ?? window
  const documentRef = options.documentRef ?? windowRef.document
  const now = options.now ?? Date.now
  const fetchLeetCode =
    options.fetch ??
    windowRef.fetch?.bind(windowRef) ??
    globalThis.fetch?.bind(globalThis)
  const remoteClient =
    options.remoteClient ??
    createLeetCodeFetchRemoteClient({
      document: documentRef,
      fetch: fetchLeetCode,
      now,
    })
  const submissionResultWatchDurationMs =
    options.submissionResultWatchDurationMs ?? 45000
  const hydrationDelays = options.hydrationDelays ?? [0, 500, 1500, 3000]
  const submissionResultReadDelays = options.submissionResultReadDelays ?? [
    500,
    1500,
    3000,
    5000,
    7000,
    9000,
    11000,
    13000,
    15000,
    17000,
    19000,
    22000,
    26000,
    30000,
    35000,
    40000,
    submissionResultWatchDurationMs,
  ]
  const domSubmissionResultFallbackDelayMs =
    options.domSubmissionResultFallbackDelayMs ??
    submissionResultWatchDurationMs
  const mutationRefreshDebounceMs = options.mutationRefreshDebounceMs ?? 500
  const samePageSnapshotRefreshCooldownMs =
    options.samePageSnapshotRefreshCooldownMs ?? 4000
  const getCurrentUrl = options.getCurrentUrl ?? (() => windowRef.location.href)
  const hydrationScheduler = createLeetCodeHydrationScheduler({
    windowRef,
    hydrationDelays,
    refreshProblemSnapshot,
  })
  const navigationObserver = createLeetCodeNavigationObserver({
    windowRef,
    onNavigate: handleLeetCodeNavigation,
  })
  const submissionResultWatch = createLeetCodeSubmissionResultWatch({
    windowRef,
    documentRef,
    onEvent: options.onEvent,
    isStaleRead: isStaleSnapshotRefresh,
    remoteClient,
    now,
    submissionResultReadDelays,
    submissionResultWatchDurationMs,
    domSubmissionResultFallbackDelayMs,
  })

  let activeLocation: LeetCodeProblemLocation | null = null
  let activeToken = 0
  let readySlug: string | null = null
  let mutationObserver: MutationObserver | null = null
  let mutationRefreshTimer: number | null = null
  let samePageSnapshotRefreshTimer: number | null = null
  let latestProblemMetadataFingerprint: string | null = null
  let latestProblemContentFingerprint: string | null = null
  let activeProblemDetailsRead: {
    slug: string
    promise: Promise<void>
  } | null = null
  let completedProblemDetailsReadSlug: string | null = null
  let lastSnapshotRefreshAt = Number.NEGATIVE_INFINITY

  function start() {
    navigationObserver.start()
    documentRef.addEventListener('click', handleClick, true)
    observeMutations()
    activateFromCurrentUrl()
  }

  function stop() {
    hydrationScheduler.clearScheduledRefreshes()
    submissionResultWatch.clear()
    mutationObserver?.disconnect()
    mutationObserver = null
    documentRef.removeEventListener('click', handleClick, true)
    navigationObserver.stop()

    if (mutationRefreshTimer !== null) {
      windowRef.clearTimeout(mutationRefreshTimer)
      mutationRefreshTimer = null
    }

    if (samePageSnapshotRefreshTimer !== null) {
      windowRef.clearTimeout(samePageSnapshotRefreshTimer)
      samePageSnapshotRefreshTimer = null
    }
  }

  function refresh() {
    activateFromCurrentUrl({ forceSamePageSnapshotRefresh: true })
  }

  function activateFromCurrentUrl(
    settings: { forceSamePageSnapshotRefresh?: boolean } = {},
  ) {
    const location = parseLeetCodeProblemLocation(getCurrentUrl())

    if (!location) {
      return
    }

    if (activeLocation?.slug === location.slug) {
      if (settings.forceSamePageSnapshotRefresh) {
        completedProblemDetailsReadSlug = null
        scheduleSamePageSnapshotRefresh(location, 0)
      }
      return
    }

    const previousLocation = activeLocation
    activeLocation = location
    activeToken += 1
    readySlug = null
    latestProblemMetadataFingerprint = null
    latestProblemContentFingerprint = null
    activeProblemDetailsRead = null
    completedProblemDetailsReadSlug = null
    lastSnapshotRefreshAt = Number.NEGATIVE_INFINITY
    hydrationScheduler.clearScheduledRefreshes()
    submissionResultWatch.clear()

    options.onEvent({
      type: 'page-changed',
      location,
      previousLocation,
      changedAt: now(),
    })
    hydrationScheduler.scheduleHydrationRefreshes(activeToken, location)
  }

  async function refreshProblemSnapshot(
    token: number,
    location: LeetCodeProblemLocation,
  ) {
    lastSnapshotRefreshAt = now()

    if (completedProblemDetailsReadSlug === location.slug) {
      return
    }

    if (activeProblemDetailsRead?.slug === location.slug) {
      await activeProblemDetailsRead.promise
      return
    }

    const problemDetailsRead = {
      slug: location.slug,
      promise: readAndEmitProblemDetails(token, location),
    }
    activeProblemDetailsRead = problemDetailsRead

    try {
      await problemDetailsRead.promise
    } finally {
      if (activeProblemDetailsRead === problemDetailsRead) {
        activeProblemDetailsRead = null
      }
    }
  }

  async function readAndEmitProblemDetails(
    token: number,
    location: LeetCodeProblemLocation,
  ) {
    try {
      const pageSnapshot = readLeetCodePageSnapshot(documentRef, {
        location,
        now,
      })
      const metadataReadResult = await remoteClient.readProblemMetadata({
        location,
        auth: readLeetCodeRemoteAuthFromDocument(documentRef),
      })

      if (isStaleSnapshotRefresh(token, location)) {
        return
      }

      if (!metadataReadResult.ok) {
        emitWatcherError(location, metadataReadResult.error)
        return
      }

      const problemMetadata = metadataReadResult.metadata

      if (readySlug !== location.slug) {
        readySlug = location.slug
        options.onEvent({
          type: 'page-ready',
          location,
          snapshot: pageSnapshot,
          metadata: problemMetadata,
          pageReadyAt: now(),
        })
      }

      emitProblemMetadataIfUseful(location, problemMetadata)

      const contentReadResult = await remoteClient.readProblemContent({
        location,
        auth: readLeetCodeRemoteAuthFromDocument(documentRef),
      })

      if (isStaleSnapshotRefresh(token, location)) {
        return
      }

      if (contentReadResult.ok) {
        emitProblemContentIfUseful(location, contentReadResult.content)
        if (
          problemMetadata.source === 'graphql' &&
          contentReadResult.content.source === 'graphql' &&
          isUsefulProblemContent(contentReadResult.content)
        ) {
          completedProblemDetailsReadSlug = location.slug
        }
      } else {
        emitWatcherError(location, contentReadResult.error)
      }
    } catch (error) {
      if (isStaleSnapshotRefresh(token, location)) {
        return
      }

      emitWatcherError(
        location,
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  function handleLeetCodeNavigation() {
    activateFromCurrentUrl()
  }

  function handleLeetCodePageMutation() {
    const location = parseLeetCodeProblemLocation(getCurrentUrl())

    if (!location) {
      return
    }

    if (activeLocation?.slug !== location.slug) {
      activateFromCurrentUrl()
      return
    }

    if (submissionResultWatch.isWatchingLocation(location)) {
      submissionResultWatch.readAfterMutation(location)
      return
    }

    scheduleThrottledSamePageSnapshotRefresh(location)
  }

  function handleClick(event: MouseEvent) {
    const location = activeLocation

    if (!location) {
      return
    }

    const click = readLeetCodeSubmissionClickFromMouseEvent(event, {
      location,
      now,
    })

    if (!click) {
      return
    }

    options.onEvent({ type: 'submit-clicked', click })
    const attempt = readLeetCodeSubmissionAttempt({
      click,
      editorRoot: documentRef,
    })

    options.onEvent({
      type: 'submission-started',
      attempt,
    })
    submissionResultWatch.start(
      click,
      attempt.submittedCodeSnapshot,
      activeToken,
    )
  }

  function emitProblemMetadataIfUseful(
    location: LeetCodeProblemLocation,
    metadata: LeetCodeProblemMetadata,
  ) {
    const metadataFingerprint =
      createLeetCodeProblemMetadataFingerprint(metadata)

    if (latestProblemMetadataFingerprint === metadataFingerprint) {
      return
    }

    latestProblemMetadataFingerprint = metadataFingerprint
    options.onEvent({
      type: 'metadata-updated',
      location,
      metadata,
    })
  }

  function emitProblemContentIfUseful(
    location: LeetCodeProblemLocation,
    content: LeetCodeProblemContent,
  ) {
    if (!isUsefulProblemContent(content)) {
      return
    }

    if (latestProblemContentFingerprint === content.contentFingerprint) {
      return
    }

    latestProblemContentFingerprint = content.contentFingerprint
    options.onEvent({
      type: 'problem-content-updated',
      location,
      content,
    })
  }

  function isUsefulProblemContent(content: LeetCodeProblemContent) {
    return (
      content.statement.length > 0 ||
      content.examples.length > 0 ||
      content.constraints.length > 0 ||
      content.hints.length > 0
    )
  }

  function observeMutations() {
    if (!documentRef.body) {
      return
    }

    const MutationObserverCtor =
      documentRef.defaultView?.MutationObserver ?? globalThis.MutationObserver

    if (!MutationObserverCtor) {
      return
    }

    const observer = new MutationObserverCtor(() => {
      if (mutationRefreshTimer !== null) {
        windowRef.clearTimeout(mutationRefreshTimer)
      }

      mutationRefreshTimer = windowRef.setTimeout(() => {
        mutationRefreshTimer = null
        handleLeetCodePageMutation()
      }, mutationRefreshDebounceMs)
    })
    mutationObserver = observer
    observer.observe(documentRef.body, {
      childList: true,
      subtree: true,
    })
  }

  function scheduleThrottledSamePageSnapshotRefresh(
    location: LeetCodeProblemLocation,
  ) {
    const millisecondsSinceLastSnapshotRefresh = now() - lastSnapshotRefreshAt
    const refreshDelay = Math.max(
      0,
      samePageSnapshotRefreshCooldownMs - millisecondsSinceLastSnapshotRefresh,
    )

    scheduleSamePageSnapshotRefresh(location, refreshDelay)
  }

  function scheduleSamePageSnapshotRefresh(
    location: LeetCodeProblemLocation,
    delayMs: number,
  ) {
    if (samePageSnapshotRefreshTimer !== null) {
      windowRef.clearTimeout(samePageSnapshotRefreshTimer)
    }

    samePageSnapshotRefreshTimer = windowRef.setTimeout(() => {
      samePageSnapshotRefreshTimer = null
      void refreshProblemSnapshot(activeToken, location)
    }, delayMs)
  }

  function isStaleSnapshotRefresh(
    token: number,
    location: LeetCodeProblemLocation,
  ) {
    return activeToken !== token || activeLocation?.slug !== location.slug
  }

  function emitWatcherError(
    location: LeetCodeProblemLocation | null,
    error: Error,
  ) {
    options.onEvent({
      type: 'watcher-error',
      location,
      error,
      occurredAt: now(),
    })
  }

  return { start, stop, refresh }
}
