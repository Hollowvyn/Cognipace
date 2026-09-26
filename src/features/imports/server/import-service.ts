import {
  insertProblemImportChanges,
  readProblemImportState,
} from '@/features/problems/server/problem-import-service'
import {
  insertTrackImportChanges,
  readTrackImportState,
} from '@/features/tracks/server/track-import-service'
import type { Db } from '@/platform/db'

import { normalizeImportFile } from '../domain/import-normalization'
import { buildImportPlan } from '../domain/import-plan'
import type {
  ImportPlan,
  ImportPreview,
  ImportState,
} from '../domain/import-types'

function emptyImportState(): ImportState {
  return {
    catalog: {
      problems: [],
      topics: [],
      companies: [],
      aliases: [],
      problemTopics: [],
      problemCompanies: [],
    },
    curriculum: { tracks: [], groups: [], memberships: [] },
  }
}

async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function planContentImport(
  db: Db,
  fileText: string,
): Promise<ImportPlan> {
  const normalized = normalizeImportFile(fileText)
  if (normalized.status === 'blocked') {
    return buildImportPlan(normalized, emptyImportState())
  }

  const [catalog, curriculum] = await Promise.all([
    readProblemImportState(db),
    readTrackImportState(db),
  ])
  const state: ImportState = { catalog, curriculum }
  return buildImportPlan(normalized, state)
}

async function previewPlan(plan: ImportPlan): Promise<ImportPreview> {
  if (plan.preview.status === 'blocked') return plan.preview
  return {
    ...plan.preview,
    fingerprint: await fingerprint(plan.fingerprintInput),
  }
}

export async function previewContentImport(
  db: Db,
  fileText: string,
): Promise<ImportPreview> {
  return previewPlan(await planContentImport(db, fileText))
}

export async function applyContentImport(
  db: Db,
  fileText: string,
  expectedFingerprint: string,
  now = new Date(),
): Promise<{
  status: 'committed' | 'unchanged' | 'stale' | 'blocked'
  preview: ImportPreview
}> {
  const plan = await planContentImport(db, fileText)
  const preview = await previewPlan(plan)

  if (preview.status === 'blocked' || preview.status === 'empty') {
    return { status: 'blocked', preview }
  }
  if (preview.fingerprint !== expectedFingerprint) {
    return { status: 'stale', preview }
  }
  if (preview.status === 'unchanged') {
    return { status: 'unchanged', preview }
  }

  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as Db
    await insertProblemImportChanges(tx, plan.changes.catalog, now)
    await insertTrackImportChanges(tx, plan.changes.curriculum, now)
  })

  return { status: 'committed', preview }
}
