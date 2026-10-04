import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  appShellQueryKeys,
  getOverlayAppShellDataViaRuntime,
  useOverlayAppShellData,
  type OverlayAppShellData,
} from '@/features/app-shell'
import { createLeetCodeCaptureRemoteClient } from '@/features/leetcode-capture'
import { upsertProblemFromPageViaRuntime } from '@/features/problems'
import {
  createEmptyLeetCodeCaptureState,
  createLeetCodeProblemMetadataFingerprint,
  createLeetCodePageWatcher,
  parseLeetCodeProblemLocation,
  reduceLeetCodeCaptureState,
  type LeetCodePageEvent,
} from '@/lib/leetcode'
import { readErrorMessage } from '@/utils/errors'

export type OverlaySyncStatus =
  | 'booting'
  | 'reading-page'
  | 'syncing-problem'
  | 'ready'
  | 'error'

export type LeetCodeOverlayContext = OverlayAppShellData['overlay']

type UseLeetCodePageSyncOptions = {
  activeProblemSlug: string | null
  onPageChanged: () => void
  onProblemContextRefreshed: (context: LeetCodeOverlayContext) => void
  onProblemLoaded: (context: LeetCodeOverlayContext) => void
}

export function useLeetCodePageSync({
  activeProblemSlug,
  onPageChanged,
  onProblemContextRefreshed,
  onProblemLoaded,
}: UseLeetCodePageSyncOptions) {
  const initialLocation = parseLeetCodeProblemLocation(window.location.href)
  const [captureState, setCaptureState] = useState(() =>
    createEmptyLeetCodeCaptureState(initialLocation),
  )
  const [syncedProblemSlug, setSyncedProblemSlug] = useState<string | null>(
    null,
  )
  const [status, setStatus] = useState<OverlaySyncStatus>(
    initialLocation ? 'booting' : 'error',
  )
  const [feedback, setFeedback] = useState<string | null>(
    initialLocation ? null : 'CogniPace only runs on LeetCode problem pages.',
  )
  const syncTokenRef = useRef(0)
  const requestedMetadataFingerprintRef = useRef<string | null>(null)
  const syncedMetadataFingerprintRef = useRef<string | null>(null)
  const latestContextRef = useRef<LeetCodeOverlayContext | null>(null)
  const activeProblemSlugRef = useRef(activeProblemSlug)
  const onPageChangedRef = useRef(onPageChanged)
  const queryClient = useQueryClient()
  const overlayShell = useOverlayAppShellData(syncedProblemSlug)
  const context = overlayShell.data?.overlay ?? null
  const resolvedStatus = overlayShell.isError
    ? 'error'
    : context
      ? 'ready'
      : status
  const resolvedFeedback = overlayShell.isError
    ? readErrorMessage(overlayShell.error, 'Failed to load overlay data.')
    : context
      ? null
      : feedback

  useEffect(() => {
    activeProblemSlugRef.current = activeProblemSlug
  }, [activeProblemSlug])

  useEffect(() => {
    latestContextRef.current = context
  }, [context])

  useEffect(() => {
    onPageChangedRef.current = onPageChanged
  }, [onPageChanged])

  useEffect(() => {
    if (!context) {
      return
    }

    const problem = context.problem
    if (!problem) {
      return
    }

    if (activeProblemSlugRef.current === problem.problemSlug) {
      onProblemContextRefreshed(context)
      return
    }

    onProblemLoaded(context)
  }, [context, onProblemContextRefreshed, onProblemLoaded])

  const syncProblem = useCallback(
    async (
      event: LeetCodePageEvent & { type: 'page-ready' | 'metadata-updated' },
    ) => {
      const nextMetadata = event.metadata
      const fingerprint = createLeetCodeProblemMetadataFingerprint(nextMetadata)

      if (
        requestedMetadataFingerprintRef.current === fingerprint ||
        syncedMetadataFingerprintRef.current === fingerprint
      ) {
        return
      }

      const syncToken = syncTokenRef.current
      requestedMetadataFingerprintRef.current = fingerprint
      setStatus('syncing-problem')

      try {
        await upsertProblemFromPageViaRuntime({
          surface: 'content-script',
          url: nextMetadata.location.url,
          slug: nextMetadata.location.slug,
          title: nextMetadata.title,
          difficulty: nextMetadata.difficulty,
          isPremium: nextMetadata.isPremium,
          topicLabels: nextMetadata.topics.map((topic) => topic.name),
        })
        if (syncTokenRef.current !== syncToken) {
          return
        }

        syncedMetadataFingerprintRef.current = fingerprint
        setSyncedProblemSlug(nextMetadata.location.slug)
      } catch (error) {
        if (syncTokenRef.current !== syncToken) {
          return
        }

        if (requestedMetadataFingerprintRef.current === fingerprint) {
          requestedMetadataFingerprintRef.current = null
        }

        setStatus('error')
        setFeedback(error instanceof Error ? error.message : String(error))
      }
    },
    [],
  )

  useEffect(() => {
    const watcher = createLeetCodePageWatcher({
      remoteClient: createLeetCodeCaptureRemoteClient(),
      onEvent: handlePageEvent,
    })

    watcher.start()

    return () => watcher.stop()

    function handlePageEvent(event: LeetCodePageEvent) {
      setCaptureState((currentCaptureState) =>
        reduceLeetCodeCaptureState(currentCaptureState, event),
      )

      switch (event.type) {
        case 'page-changed':
          syncTokenRef.current += 1
          setSyncedProblemSlug(null)
          onPageChangedRef.current()
          requestedMetadataFingerprintRef.current = null
          syncedMetadataFingerprintRef.current = null
          setStatus('reading-page')
          setFeedback(null)
          return
        case 'page-ready':
        case 'metadata-updated':
          void syncProblem(event)
          return
        case 'problem-content-updated':
        case 'submit-clicked':
        case 'submission-started':
        case 'submission-polling-updated':
        case 'submission-result-updated':
          return
        case 'watcher-error':
          if (latestContextRef.current) {
            return
          }

          setStatus('error')
          setFeedback(event.error.message)
          return
      }
    }
  }, [syncProblem])

  const refreshContext = useCallback(
    async (problemSlug: string, expectedSyncToken: number) => {
      setSyncedProblemSlug(problemSlug)

      const nextShellData = await queryClient.fetchQuery({
        queryKey: appShellQueryKeys.overlay(problemSlug),
        queryFn: () => getOverlayAppShellDataViaRuntime(problemSlug),
        staleTime: 0,
      })

      if (syncTokenRef.current !== expectedSyncToken) {
        return null
      }

      return nextShellData.overlay
    },
    [queryClient],
  )

  return {
    capture: captureState,
    context,
    feedback: resolvedFeedback,
    latestContextRef,
    location: captureState.location,
    metadata: captureState.metadata,
    refreshContext,
    submission: {
      result: captureState.submissionResult,
    },
    status: resolvedStatus,
    syncTokenRef,
  }
}
