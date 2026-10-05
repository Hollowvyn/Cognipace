export const queryKeys = {
  analytics: {
    all: ['analytics'] as const,
    summary: (range: 14 | 30 | 90, timeZone: string) =>
      [...queryKeys.analytics.all, 'summary', range, timeZone] as const,
  },
  appShell: {
    all: ['app-shell-data'] as const,
    popup: () => [...queryKeys.appShell.all, 'popup'] as const,
    dashboard: () => [...queryKeys.appShell.all, 'dashboard'] as const,
    overlay: (problemSlug?: string | null) =>
      [...queryKeys.appShell.all, 'overlay', problemSlug ?? null] as const,
  },
  backup: {
    all: ['backup'] as const,
    pendingReplacement: () =>
      [...queryKeys.backup.all, 'pending-replacement'] as const,
  },
  genai: {
    all: ['genai'] as const,
    configurationRevision: () =>
      [...queryKeys.genai.all, 'configuration-revision'] as const,
    secretPresence: () => [...queryKeys.genai.all, 'secret-presence'] as const,
  },
  practice: {
    all: ['practice-details'] as const,
    details: (problemSlug: string, at?: string | null) =>
      [...queryKeys.practice.all, problemSlug, at ?? null] as const,
  },
  problems: {
    all: ['problems'] as const,
    library: (at?: string | null) =>
      [...queryKeys.problems.all, 'library', at ?? 'now'] as const,
    edit: (problemSlug: string) =>
      [...queryKeys.problems.all, 'edit', problemSlug] as const,
  },
  queue: {
    all: ['today-queue'] as const,
    today: (at?: string | null) =>
      [...queryKeys.queue.all, at ?? 'now'] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
  sync: {
    all: ['sync'] as const,
    status: (surface = 'dashboard') =>
      [...queryKeys.sync.all, 'status', surface] as const,
  },
  tracks: {
    all: ['tracks'] as const,
    active: (surface?: string | null) =>
      [...queryKeys.tracks.all, 'active', surface ?? null] as const,
    workspace: (at?: string | null) =>
      [...queryKeys.tracks.all, 'workspace', at ?? 'now'] as const,
    edit: (trackId?: string | null) =>
      [...queryKeys.tracks.all, 'edit', trackId ?? 'new'] as const,
  },
} as const
