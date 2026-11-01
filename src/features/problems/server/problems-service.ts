import {
  parseLeetCodeProblemInput,
  parseLeetCodeProblemLocation,
} from '@/lib/leetcode'
import type { Db } from '@/platform/db'

import {
  createProblemsRepository,
  type ProblemLibraryReadOptions,
} from '../data/problems-repository'
import type {
  ProblemsBulkDeleteRequest,
  ProblemsBulkUpdateProblemsRequest,
  ProblemsCreateProblemRequest,
  ProblemsDeleteProblemRequest,
  ProblemsGetLibraryRequest,
  ProblemsGetProblemForEditRequest,
  ProblemsUpdateProblemRequest,
} from '../api/problems-contracts'
import {
  serializeProblem,
  serializeProblemForEdit,
  serializeProblemLibrary,
  serializeProblemLibraryRow,
} from '../api/problems-serializers'
import type { UpsertProblemInput } from '../domain'

export interface UpsertProblemFromPageInput extends Omit<
  UpsertProblemInput,
  'slug'
> {
  slug?: string | null | undefined
  url: string
  topicLabels?: readonly string[] | undefined
}

export async function upsertProblemFromPage(
  db: Db,
  input: UpsertProblemFromPageInput,
  now = new Date(),
) {
  const location = parseLeetCodeProblemLocation(input.url)
  const slug = input.slug ?? location?.slug

  if (!slug) {
    throw new Error('Current page is not a canonical LeetCode problem URL.')
  }

  return serializeProblem(
    await createProblemsRepository(db).upsertFromLeetCode(
      {
        slug,
        title: input.title,
        difficulty: input.difficulty,
        isPremium: input.isPremium,
        topicLabels: input.topicLabels,
      },
      now,
    ),
  )
}

export async function getProblemContext(db: Db, slug: string) {
  return createProblemsRepository(db).getContextBySlug(slug)
}

export async function getProblemLibrary(
  db: Db,
  request: ProblemsGetLibraryRequest,
) {
  const library = await createProblemsRepository(db).getLibrary({
    ...(request.at ? { now: new Date(request.at) } : {}),
  })

  return serializeProblemLibrary(library)
}

export async function getProblemLibraryRowsBySlug(
  db: Db,
  problemSlugs: readonly string[],
  options: ProblemLibraryReadOptions = {},
) {
  const rows = await createProblemsRepository(db).getLibraryRowsBySlug(
    problemSlugs,
    {
      now: options.now,
    },
  )

  return rows.map(serializeProblemLibraryRow)
}

export async function getProblemForEdit(
  db: Db,
  request: ProblemsGetProblemForEditRequest,
) {
  const problemForEdit = await createProblemsRepository(db).getForEdit(
    request.problemSlug,
  )

  if (!problemForEdit) {
    throw new Error(`Problem "${request.problemSlug}" was not found.`)
  }

  return serializeProblemForEdit(problemForEdit)
}

export async function createProblem(
  db: Db,
  request: ProblemsCreateProblemRequest,
) {
  return serializeProblemForEdit(
    await createProblemsRepository(db).createProblem(request),
  )
}

export async function updateProblem(
  db: Db,
  request: ProblemsUpdateProblemRequest,
) {
  const problemForEdit =
    await createProblemsRepository(db).updateProblem(request)

  if (!problemForEdit) {
    throw new Error(`Problem "${request.problemSlug}" was not found.`)
  }

  return serializeProblemForEdit(problemForEdit)
}

export async function deleteProblem(
  db: Db,
  request: ProblemsDeleteProblemRequest,
) {
  await createProblemsRepository(db).deleteProblems([request.problemSlug])
}

export async function bulkDeleteProblems(
  db: Db,
  request: ProblemsBulkDeleteRequest,
) {
  await createProblemsRepository(db).deleteProblems(request.problemSlugs)
}

export async function bulkUpdateProblems(
  db: Db,
  request: ProblemsBulkUpdateProblemsRequest,
) {
  await createProblemsRepository(db).bulkUpdateProblems(request)
}

export function readProblemSlugFromSlugOrUrl(slugOrUrl: string) {
  return parseLeetCodeProblemInput(slugOrUrl)?.slug ?? null
}

export function listProblemSlugs(db: Db) {
  return createProblemsRepository(db).listProblemSlugs()
}
