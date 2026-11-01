import { z } from 'zod'
import {
  assertArchiveReferences,
  emptyNotesArchive,
} from '../domain/archive-validation'
import type { LocalIdbStore } from '@/platform/db/local-store-types'
import {
  notesArchiveSchema,
  problemNoteRecordSchema,
  submissionRecordSchema,
  assessmentRecordSchema,
  savedAiNoteRecordSchema,
  notesPayloadSchema,
  type NotesArchive,
  type NotesPayload,
} from '../domain/notes-records'

const metadataStores = [
  'problemNotes',
  'submissions',
  'analysisReports',
  'savedAiNotes',
  'problemScopes',
] as const
const batchSize = 500
const progressSchema = z.object({
  identity: z.string(),
  status: z.enum(['staging', 'ready']),
  storeIndex: z.number().int().nonnegative(),
  lastKey: z.custom<IDBValidKey>().optional(),
})
type Progress = z.infer<typeof progressSchema>
const rowSchema = z.object({ problemSlug: z.string().optional() }).passthrough()

export function createArchiveGenerationRepository(local: LocalIdbStore) {
  async function start(nextGeneration: string, identity: string) {
    if (!nextGeneration) throw new Error('Archive generation is required.')
    return local.transact<Progress, 'records'>(
      ['records'],
      'readwrite',
      (s, done, fail) => {
        const request = s.records.get(['archive-generation', nextGeneration])
        request.onsuccess = () => {
          try {
            const progress =
              request.result === undefined
                ? { identity, status: 'staging' as const, storeIndex: 0 }
                : progressSchema.parse(request.result)
            if (progress.identity !== identity)
              throw new Error(
                'Archive generation is already owned by another candidate.',
              )
            s.records.put(progress, ['archive-generation', nextGeneration])
            done(progress)
          } catch (error) {
            fail(error)
          }
        }
      },
    )
  }
  return {
    readArchiveGeneration(generation: string): Promise<NotesArchive> {
      if (!generation)
        return Promise.reject(new Error('Archive generation is required.'))
      return local.transact(
        [
          'problemNotes',
          'submissions',
          'analysisReports',
          'savedAiNotes',
          'payloads',
        ],
        'readonly',
        (s, done, fail) => {
          const metadata: unknown[] = []
          const names = [
            'problemNotes',
            'submissions',
            'analysisReports',
            'savedAiNotes',
          ] as const
          let remaining = names.length
          names.forEach((name, index) => {
            const request = s[name].getAll(
              IDBKeyRange.bound([generation], [generation, []]),
            )
            request.onsuccess = () => {
              try {
                metadata[index] = request.result as unknown
                if (--remaining) return
                const archive: NotesArchive = {
                  formatVersion: 1,
                  notes: z
                    .array(problemNoteRecordSchema.strip())
                    .parse(metadata[0]),
                  submissions: z.array(submissionRecordSchema.strip()).parse(
                    z
                      .array(z.record(z.string(), z.unknown()))
                      .parse(metadata[1])
                      .filter(
                        (row) =>
                          !(
                            typeof row.attemptAlias === 'string' &&
                            row.id === undefined
                          ),
                      ),
                  ),
                  assessments: z
                    .array(assessmentRecordSchema.strip())
                    .parse(metadata[2]),
                  savedAiNotes: z
                    .array(savedAiNoteRecordSchema.strip())
                    .parse(metadata[3]),
                  payloads: [],
                }
                // Payloads are global immutable objects. Enumerating this store would
                // leak recovery-only/orphan bodies into an active-generation export.
                const ids = new Set<string>()
                for (const row of archive.submissions)
                  if (row.codePayloadId) ids.add(row.codePayloadId)
                for (const row of archive.assessments) {
                  ids.add(row.feedbackPayloadId)
                  if (row.implementationPayloadId)
                    ids.add(row.implementationPayloadId)
                }
                if (!ids.size) {
                  done(archive)
                  return
                }
                let pending = ids.size
                for (const id of ids) {
                  const body = s.payloads.get(id)
                  body.onsuccess = () => {
                    try {
                      // Validate shape without rewriting immutable digest-bearing bodies.
                      const raw: unknown = body.result
                      notesPayloadSchema.parse(raw)
                      const payload = raw as NotesPayload
                      if (payload.id !== id)
                        throw new Error(
                          'Archive payload identity does not match its reference.',
                        )
                      archive.payloads.push(payload)
                      if (--pending === 0) done(archive)
                    } catch (error) {
                      fail(error)
                    }
                  }
                }
              } catch (error) {
                fail(error)
              }
            }
          })
        },
      )
    },
    async stageArchiveGeneration(input: {
      sourceGeneration: string
      nextGeneration: string
      excludedProblemSlugs: readonly string[]
    }) {
      const { sourceGeneration, nextGeneration } = input
      if (sourceGeneration === nextGeneration)
        throw new Error('Archive staging requires a new generation.')
      const excluded = new Set(input.excludedProblemSlugs)
      const identity = JSON.stringify({
        sourceGeneration,
        excluded: [...excluded].sort(),
      })
      let progress = await start(nextGeneration, identity)
      while (progress.status !== 'ready') {
        const storeName = metadataStores[progress.storeIndex]
        if (!storeName) throw new Error('Invalid archive staging progress.')
        progress = await local.transact<Progress, 'records' | typeof storeName>(
          ['records', storeName],
          'readwrite',
          (s, done, fail) => {
            const range =
              progress.lastKey === undefined
                ? IDBKeyRange.bound([sourceGeneration], [sourceGeneration, []])
                : IDBKeyRange.bound(
                    progress.lastKey,
                    [sourceGeneration, []],
                    true,
                  )
            const request = s[storeName].openCursor(range)
            let count = 0
            request.onsuccess = () => {
              try {
                const cursor = request.result
                if (!cursor) {
                  const storeIndex = progress.storeIndex + 1
                  const next = {
                    identity,
                    status:
                      storeIndex === metadataStores.length
                        ? ('ready' as const)
                        : ('staging' as const),
                    storeIndex,
                  }
                  s.records.put(next, ['archive-generation', nextGeneration])
                  done(next)
                  return
                }
                const key = cursor.key
                if (!Array.isArray(key))
                  throw new Error('Invalid archive metadata key.')
                const row = rowSchema.parse(cursor.value)
                // Scope rows are keyed by slug and intentionally have no slug field.
                const slug =
                  storeName === 'problemScopes' ? key[1] : row.problemSlug
                if (typeof slug !== 'string' || !excluded.has(slug)) {
                  const value =
                    storeName === 'problemScopes' ||
                    storeName === 'problemNotes'
                      ? row
                      : { ...row, archiveGeneration: nextGeneration }
                  s[storeName].put(value, [nextGeneration, ...key.slice(1)])
                }
                count++
                if (count === batchSize) {
                  const next = { ...progress, lastKey: key }
                  s.records.put(next, ['archive-generation', nextGeneration])
                  done(next)
                  return
                }
                cursor.continue()
              } catch (error) {
                fail(error)
              }
            }
          },
        )
      }
    },
    async stageImportedArchive(input: {
      nextGeneration: string
      archive: NotesArchive
    }) {
      // Snapshot caller input before async validation so later caller mutation
      // cannot alter a validated body or staging identity.
      const original = structuredClone(input.archive)
      const archive = notesArchiveSchema.parse(original)
      // This boundary owns archive-local consistency; the backup owner separately
      // checks these slugs against the detached candidate core (Task8).
      const problemSlugs = [
        archive.notes,
        archive.submissions,
        archive.assessments,
        archive.savedAiNotes,
      ].flatMap((rows) => rows.map((row) => row.problemSlug))
      await assertArchiveReferences(original, problemSlugs)
      archive.payloads = original.payloads
      const externalAliases = new Set<string>()
      const attemptAliases = new Set<string>()
      for (const submission of archive.submissions) {
        if (submission.externalSubmissionId !== null) {
          const alias = JSON.stringify([
            submission.host,
            submission.externalSubmissionId,
          ])
          if (externalAliases.has(alias))
            throw new Error('Duplicate archive external submission alias.')
          externalAliases.add(alias)
        }
        for (const alias of submission.observedAttemptIds) {
          if (attemptAliases.has(alias))
            throw new Error('Duplicate archive observed attempt alias.')
          attemptAliases.add(alias)
        }
      }
      // Validate every existing immutable object before any staging write. Crypto
      // stays outside live IDB callbacks; final batch callbacks recheck the values
      // have not changed since this preflight.
      const existingPayloads = new Map<string, string>()
      for (
        let offset = 0;
        offset < archive.payloads.length;
        offset += batchSize
      ) {
        const incoming = archive.payloads.slice(offset, offset + batchSize)
        const existing = await local.transact<
          Array<{ id: string; value: unknown }>,
          'payloads'
        >(['payloads'], 'readonly', (s, done) => {
          const rows: Array<{ id: string; value: unknown }> = []
          for (const payload of incoming) {
            const request = s.payloads.get(payload.id)
            request.onsuccess = () => {
              rows.push({ id: payload.id, value: request.result as unknown })
              if (rows.length === incoming.length) done(rows)
            }
          }
        })
        const retained = existing.filter((row) => row.value !== undefined)
        await assertArchiveReferences(
          {
            ...emptyNotesArchive(),
            payloads: retained.map((row) => row.value) as NotesPayload[],
          },
          [],
        )
        const byId = new Map(incoming.map((payload) => [payload.id, payload]))
        for (const row of retained) {
          const payload = row.value as NotesPayload
          if (canonicalPayload(payload) !== canonicalPayload(byId.get(row.id)!))
            throw new Error('Immutable archive payload identity collision.')
          existingPayloads.set(row.id, stableJson(payload))
        }
      }
      const { nextGeneration } = input
      // Archive validation and hashing finish before opening staging writes.
      const identity = `import:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(archive)))), (n) => n.toString(16).padStart(2, '0')).join('')}`
      let progress = await start(nextGeneration, identity)
      const groups = [
        archive.notes,
        archive.submissions,
        archive.assessments,
        archive.savedAiNotes,
        archive.payloads,
      ] as const
      const names = [
        'problemNotes',
        'submissions',
        'analysisReports',
        'savedAiNotes',
        'payloads',
      ] as const
      while (progress.status !== 'ready') {
        const index = progress.storeIndex
        const rows = groups[index]
        const name = names[index]
        if (!rows || !name)
          throw new Error('Invalid imported archive progress.')
        const offset =
          typeof progress.lastKey === 'number' ? progress.lastKey : 0
        progress = await local.transact<Progress, 'records' | typeof name>(
          ['records', name],
          'readwrite',
          (s, done, fail) => {
            for (const row of rows.slice(offset, offset + batchSize)) {
              if (name === 'payloads') {
                const payload = row as NotesArchive['payloads'][number]
                const request = s.payloads.get(payload.id)
                request.onsuccess = () => {
                  try {
                    const current: unknown = request.result
                    if (current === undefined)
                      s.payloads.add(payload, payload.id)
                    else {
                      notesPayloadSchema.parse(current)
                      if (
                        stableJson(current) !== existingPayloads.get(payload.id)
                      )
                        throw new Error(
                          'Immutable archive payload changed during staging. Retry importing.',
                        )
                    }
                  } catch (error) {
                    fail(error)
                  }
                }
              } else {
                const value = row as unknown as Record<string, unknown>
                const key =
                  name === 'problemNotes'
                    ? [nextGeneration, String(value.problemSlug)]
                    : name === 'savedAiNotes'
                      ? [
                          nextGeneration,
                          String(value.problemSlug),
                          String(value.assessmentId),
                        ]
                      : [nextGeneration, String(value.id)]
                const stored =
                  name === 'problemNotes'
                    ? value
                    : { ...value, archiveGeneration: nextGeneration }
                s[name].put(stored, key)
              }
            }
            const complete = offset + batchSize >= rows.length
            const storeIndex = index + (complete ? 1 : 0)
            const next = {
              identity,
              status:
                storeIndex === groups.length
                  ? ('ready' as const)
                  : ('staging' as const),
              storeIndex,
              ...(complete ? {} : { lastKey: offset + batchSize }),
            }
            s.records.put(next, ['archive-generation', nextGeneration])
            done(next)
          },
        )
      }
    },
  }
}

// Property order is a serialization detail. Integrity is verified separately on
// each original body; semantically equal valid reports can reuse an immutable ID.
function canonicalPayload(payload: NotesPayload): string {
  return stableJson({ id: payload.id, kind: payload.kind, body: payload.body })
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
