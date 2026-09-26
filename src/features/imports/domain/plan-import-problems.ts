import {
  createTopicId,
  normalizeTopicLookupKey,
} from '@/features/problems/domain/topic-taxonomy'
import { titleFromSlug } from '@/features/problems/domain/problem'

import { normalizeCompanyImportKey } from './import-identity'

import type {
  ImportDiagnostic,
  ImportItem,
  LabelDraft,
  NormalizedImport,
  ProblemDraft,
} from './import-types'
import type {
  ImportedCompanyLink,
  ImportedLabel,
  ImportedProblem,
  ImportedTopicLink,
  ProblemImportChanges,
  ProblemImportState,
} from '@/features/problems/domain/problem-import'
import type { PlannedTracks } from './plan-import-tracks'

export type PlannedProblems = {
  changes: ProblemImportChanges
  items: ImportItem[]
  diagnostics: ImportDiagnostic[]
  relevantState: ProblemImportState
}

type ResolvedLabel = {
  row: ImportedLabel
  isNew: boolean
}

type ProblemLookups = {
  problemsBySlug: Map<string, ProblemImportState['problems']>
  topicsById: Map<string, ImportedLabel[]>
  topicsByKey: Map<string, ImportedLabel[]>
  topicIds: Set<string>
  aliasesByKey: Map<string, ProblemImportState['aliases']>
  companiesById: Map<string, ImportedLabel[]>
  companiesByKey: Map<string, ImportedLabel[]>
}

const emptyChanges = (): ProblemImportChanges => ({
  problems: [],
  topics: [],
  companies: [],
  problemTopics: [],
  problemCompanies: [],
})

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function compositeKey(...parts: string[]) {
  return JSON.stringify(parts)
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values)]
}

function appendLookup<T>(map: Map<string, T[]>, key: string, row: T) {
  const values = map.get(key) ?? []
  values.push(row)
  map.set(key, values)
}

function createLookups(state: ProblemImportState): ProblemLookups {
  const topicsById = new Map<string, ImportedLabel[]>()
  const topicsByKey = new Map<string, ImportedLabel[]>()
  const topicIds = new Set<string>()
  const aliasesByKey = new Map<string, ProblemImportState['aliases']>()
  const companiesById = new Map<string, ImportedLabel[]>()
  const companiesByKey = new Map<string, ImportedLabel[]>()
  for (const topic of state.topics) {
    appendLookup(topicsById, topic.id, topic)
    topicIds.add(topic.id)
    appendLookup(topicsByKey, normalizeTopicLookupKey(topic.label), topic)
  }
  for (const alias of state.aliases) {
    const aliases = aliasesByKey.get(alias.aliasKey) ?? []
    aliases.push(alias)
    aliasesByKey.set(alias.aliasKey, aliases)
  }
  for (const company of state.companies) {
    appendLookup(companiesById, company.id, company)
    appendLookup(
      companiesByKey,
      normalizeCompanyImportKey(company.label),
      company,
    )
  }
  return {
    problemsBySlug: new Map(
      state.problems.map((problem) => [problem.slug, [problem]]),
    ),
    topicsById,
    topicsByKey,
    topicIds,
    aliasesByKey,
    companiesById,
    companiesByKey,
  }
}

function relevantProblemState(
  document: NormalizedImport,
  references: PlannedTracks['references'],
  state: ProblemImportState,
): ProblemImportState {
  const problemSlugs = new Set([
    ...document.problems.map(({ slug }) => slug),
    ...references.map(({ slug }) => slug),
  ])
  const topicKeys = new Set(
    [
      ...document.topics,
      ...document.problems.flatMap(({ topics }) => topics),
    ].map(({ label }) => normalizeTopicLookupKey(label)),
  )
  const companyKeys = new Set(
    [
      ...document.companies,
      ...document.problems.flatMap(({ companies }) => companies),
    ].map(({ label }) => normalizeCompanyImportKey(label)),
  )
  const topicCandidateIds = new Set<string>()
  for (const topic of state.topics) {
    if (
      topicKeys.has(topic.id) ||
      topicKeys.has(normalizeTopicLookupKey(topic.label))
    ) {
      topicCandidateIds.add(topic.id)
    }
  }
  for (const alias of state.aliases) {
    if (topicKeys.has(alias.aliasKey)) topicCandidateIds.add(alias.topicId)
  }
  const companyCandidateIds = new Set<string>()
  for (const company of state.companies) {
    if (
      companyKeys.has(company.id) ||
      companyKeys.has(normalizeCompanyImportKey(company.label))
    ) {
      companyCandidateIds.add(company.id)
    }
  }

  return {
    problems: state.problems
      .filter(({ slug }) => problemSlugs.has(slug))
      .map((row) => ({ ...row }))
      .sort((left, right) => compareText(left.slug, right.slug)),
    topics: state.topics
      .filter(({ id }) => topicCandidateIds.has(id))
      .map((row) => ({ ...row }))
      .sort(
        (left, right) =>
          compareText(left.id, right.id) ||
          compareText(left.label, right.label),
      ),
    companies: state.companies
      .filter(({ id }) => companyCandidateIds.has(id))
      .map((row) => ({ ...row }))
      .sort(
        (left, right) =>
          compareText(left.id, right.id) ||
          compareText(left.label, right.label),
      ),
    aliases: state.aliases
      .filter(
        ({ aliasKey, topicId }) =>
          topicKeys.has(aliasKey) || topicCandidateIds.has(topicId),
      )
      .map((row) => ({ ...row }))
      .sort(
        (left, right) =>
          compareText(left.aliasKey, right.aliasKey) ||
          compareText(left.topicId, right.topicId),
      ),
    problemTopics: state.problemTopics
      .filter(({ problemSlug }) => problemSlugs.has(problemSlug))
      .map((row) => ({ ...row }))
      .sort(
        (left, right) =>
          compareText(left.problemSlug, right.problemSlug) ||
          compareText(left.topicId, right.topicId),
      ),
    problemCompanies: state.problemCompanies
      .filter(({ problemSlug }) => problemSlugs.has(problemSlug))
      .map((row) => ({ ...row }))
      .sort(
        (left, right) =>
          compareText(left.problemSlug, right.problemSlug) ||
          compareText(left.companyId, right.companyId),
      ),
  }
}

function fieldPath(path: string, field: string) {
  return `${path}.${field}`
}

function addDiagnostic(
  diagnostics: ImportDiagnostic[],
  code: string,
  path: string,
  message: string,
) {
  diagnostics.push({ severity: 'warning', code, path, message })
}

function stableTopicIdSeed(key: string) {
  let primary = 0x811c9dc5
  let secondary = 0x9e3779b9

  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index)
    primary = Math.imul(primary ^ code, 16777619)
    secondary = Math.imul(secondary ^ code, 1597334677)
  }

  return `${(primary >>> 0).toString(16)}${(secondary >>> 0).toString(16)}`
}

function createImportedTopicId(key: string, occupied: ReadonlySet<string>) {
  const seed = stableTopicIdSeed(key)
  let attempt = 0

  return createTopicId(occupied, () => `import-${seed}-${attempt++}`)
}

function item(
  kind: ImportItem['kind'],
  identity: string,
  label: string,
  action: ImportItem['action'],
  path: string,
): ImportItem {
  return { kind, identity, label, action, path }
}

function resolveTopic(
  draft: LabelDraft,
  lookups: ProblemLookups,
  plannedByKey: Map<string, ImportedLabel>,
  changes: ProblemImportChanges,
  diagnostics: ImportDiagnostic[],
): ResolvedLabel | null {
  const key = normalizeTopicLookupKey(draft.label)
  const byId = lookups.topicsById.get(key) ?? []
  if (byId.length > 0) return { row: byId[0]!, isNew: false }

  const planned = plannedByKey.get(key)
  if (planned) return { row: planned, isNew: true }

  const byLabel = lookups.topicsByKey.get(key) ?? []
  const distinctByLabel = [
    ...new Map(byLabel.map((topic) => [topic.id, topic])).values(),
  ]
  if (distinctByLabel.length > 1) {
    addDiagnostic(
      diagnostics,
      'ambiguous-topic',
      draft.path,
      `More than one stored topic matches "${draft.label}"; this label is skipped.`,
    )
    return null
  }
  if (distinctByLabel.length === 1) {
    return { row: distinctByLabel[0]!, isNew: false }
  }

  const aliases = lookups.aliasesByKey.get(key) ?? []
  const aliasTopicIds = uniqueStrings(aliases.map(({ topicId }) => topicId))
  if (aliasTopicIds.length > 1) {
    addDiagnostic(
      diagnostics,
      'ambiguous-topic',
      draft.path,
      `More than one stored topic alias matches "${draft.label}"; this label is skipped.`,
    )
    return null
  }
  if (aliasTopicIds.length === 1) {
    const canonical = (lookups.topicsById.get(aliasTopicIds[0]!) ?? [])[0]
    if (canonical) return { row: canonical, isNew: false }
  }

  const occupiedTopicIds = new Set(lookups.topicIds)
  for (const plannedTopic of changes.topics) {
    occupiedTopicIds.add(plannedTopic.id)
  }
  const row = {
    id: createImportedTopicId(key, occupiedTopicIds),
    label: draft.label,
  }
  changes.topics.push(row)
  lookups.topicIds.add(row.id)
  plannedByKey.set(key, row)
  return { row, isNew: true }
}

function resolveCompany(
  draft: LabelDraft,
  lookups: ProblemLookups,
  plannedByKey: Map<string, ImportedLabel>,
  changes: ProblemImportChanges,
  diagnostics: ImportDiagnostic[],
): ResolvedLabel | null {
  const key = normalizeCompanyImportKey(draft.label)
  if (!key) {
    addDiagnostic(
      diagnostics,
      'invalid-company-identity',
      draft.path,
      'This company label cannot produce an ID using the existing company naming rules.',
    )
    return null
  }
  const matches = [
    ...(lookups.companiesById.get(key) ?? []),
    ...(lookups.companiesByKey.get(key) ?? []),
  ]
  const distinctMatches = [
    ...new Map(matches.map((company) => [company.id, company])).values(),
  ]
  if (distinctMatches.length > 1) {
    addDiagnostic(
      diagnostics,
      'ambiguous-company',
      draft.path,
      `More than one stored company matches "${draft.label}"; this label is skipped.`,
    )
    return null
  }
  if (distinctMatches.length === 1) {
    return { row: distinctMatches[0]!, isNew: false }
  }

  const planned = plannedByKey.get(key)
  if (planned) return { row: planned, isNew: true }

  const row = { id: key, label: draft.label }
  changes.companies.push(row)
  plannedByKey.set(key, row)
  return { row, isNew: true }
}

function labelItem(
  kind: 'topics' | 'companies',
  row: ImportedLabel,
  action: ImportItem['action'],
  path: string,
) {
  return item(kind, row.id, row.label, action, path)
}

function topicLinkItem(
  row: ImportedTopicLink,
  label: string,
  action: ImportItem['action'],
  path: string,
) {
  return item(
    'problemTopics',
    compositeKey(row.problemSlug, row.topicId),
    `${row.problemSlug} · ${label}`,
    action,
    path,
  )
}

function companyLinkItem(
  row: ImportedCompanyLink,
  label: string,
  action: ImportItem['action'],
  path: string,
) {
  return item(
    'problemCompanies',
    compositeKey(row.problemSlug, row.companyId),
    `${row.problemSlug} · ${label}`,
    action,
    path,
  )
}

function draftForReference(slug: string, path: string): ProblemDraft {
  return {
    slug,
    path,
    title: null,
    difficulty: null,
    isPremium: null,
    topics: [],
    companies: [],
  }
}

export function planImportProblems(
  document: NormalizedImport,
  references: PlannedTracks['references'],
  state: ProblemImportState,
): PlannedProblems {
  const relevantState = relevantProblemState(document, references, state)
  const lookups = createLookups(state)
  const changes = emptyChanges()
  const items: ImportItem[] = []
  const diagnostics: ImportDiagnostic[] = []
  const topicLabelsByKey = new Map<string, ImportedLabel>()
  const companyLabelsByKey = new Map<string, ImportedLabel>()
  const topicItems = new Set<string>()
  const companyItems = new Set<string>()
  const problemTopicKeys = new Set(
    relevantState.problemTopics.map(({ problemSlug, topicId }) =>
      compositeKey(problemSlug, topicId),
    ),
  )
  const problemCompanyKeys = new Set(
    relevantState.problemCompanies.map(({ problemSlug, companyId }) =>
      compositeKey(problemSlug, companyId),
    ),
  )
  const topicLinkItems = new Set<string>()
  const companyLinkItems = new Set<string>()

  for (const label of document.topics) {
    const resolved = resolveTopic(
      label,
      lookups,
      topicLabelsByKey,
      changes,
      diagnostics,
    )
    if (!resolved || topicItems.has(resolved.row.id)) continue
    topicItems.add(resolved.row.id)
    items.push(
      labelItem(
        'topics',
        resolved.row,
        resolved.isNew ? 'add' : 'retain',
        label.path,
      ),
    )
  }
  for (const label of document.companies) {
    const resolved = resolveCompany(
      label,
      lookups,
      companyLabelsByKey,
      changes,
      diagnostics,
    )
    if (!resolved || companyItems.has(resolved.row.id)) continue
    companyItems.add(resolved.row.id)
    items.push(
      labelItem(
        'companies',
        resolved.row,
        resolved.isNew ? 'add' : 'retain',
        label.path,
      ),
    )
  }

  const draftsBySlug = new Map<string, ProblemDraft>()
  for (const draft of document.problems) draftsBySlug.set(draft.slug, draft)
  for (const reference of references) {
    if (!draftsBySlug.has(reference.slug)) {
      draftsBySlug.set(
        reference.slug,
        draftForReference(reference.slug, reference.path),
      )
    }
  }

  for (const draft of draftsBySlug.values()) {
    const existing = lookups.problemsBySlug.get(draft.slug)?.[0]
    if (existing) {
      items.push(
        item('problems', existing.slug, existing.title, 'retain', draft.path),
      )
      if (draft.title !== null && draft.title !== existing.title) {
        addDiagnostic(
          diagnostics,
          'existing-value-preserved',
          fieldPath(draft.path, 'title'),
          'The stored title is preserved; imports do not update existing questions.',
        )
      }
      if (
        draft.difficulty !== null &&
        draft.difficulty !== existing.difficulty
      ) {
        addDiagnostic(
          diagnostics,
          'existing-value-preserved',
          fieldPath(draft.path, 'difficulty'),
          'The stored difficulty is preserved; imports do not update existing questions.',
        )
      }
      if (draft.isPremium !== null && draft.isPremium !== existing.isPremium) {
        addDiagnostic(
          diagnostics,
          'existing-value-preserved',
          fieldPath(draft.path, 'isPremium'),
          'The stored premium value is preserved; imports do not update existing questions.',
        )
      }
    } else {
      const created: ImportedProblem = {
        slug: draft.slug,
        title: draft.title ?? titleFromSlug(draft.slug),
        difficulty: draft.difficulty ?? 'unknown',
        isPremium: draft.isPremium ?? false,
      }
      changes.problems.push(created)
      items.push(
        item('problems', created.slug, created.title, 'add', draft.path),
      )
    }

    for (const label of draft.topics) {
      const resolved = resolveTopic(
        label,
        lookups,
        topicLabelsByKey,
        changes,
        diagnostics,
      )
      if (!resolved) continue
      if (!topicItems.has(resolved.row.id)) {
        topicItems.add(resolved.row.id)
        items.push(
          labelItem(
            'topics',
            resolved.row,
            resolved.isNew ? 'add' : 'retain',
            label.path,
          ),
        )
      }
      const linkKey = compositeKey(draft.slug, resolved.row.id)
      if (problemTopicKeys.has(linkKey)) {
        if (!topicLinkItems.has(linkKey)) {
          topicLinkItems.add(linkKey)
          items.push(
            topicLinkItem(
              { problemSlug: draft.slug, topicId: resolved.row.id },
              resolved.row.label,
              'retain',
              label.path,
            ),
          )
        }
        continue
      }
      problemTopicKeys.add(linkKey)
      const link = { problemSlug: draft.slug, topicId: resolved.row.id }
      changes.problemTopics.push(link)
      topicLinkItems.add(linkKey)
      items.push(topicLinkItem(link, resolved.row.label, 'add', label.path))
    }

    for (const label of draft.companies) {
      const resolved = resolveCompany(
        label,
        lookups,
        companyLabelsByKey,
        changes,
        diagnostics,
      )
      if (!resolved) continue
      if (!companyItems.has(resolved.row.id)) {
        companyItems.add(resolved.row.id)
        items.push(
          labelItem(
            'companies',
            resolved.row,
            resolved.isNew ? 'add' : 'retain',
            label.path,
          ),
        )
      }
      const linkKey = compositeKey(draft.slug, resolved.row.id)
      if (problemCompanyKeys.has(linkKey)) {
        if (!companyLinkItems.has(linkKey)) {
          companyLinkItems.add(linkKey)
          items.push(
            companyLinkItem(
              { problemSlug: draft.slug, companyId: resolved.row.id },
              resolved.row.label,
              'retain',
              label.path,
            ),
          )
        }
        continue
      }
      problemCompanyKeys.add(linkKey)
      const link = { problemSlug: draft.slug, companyId: resolved.row.id }
      changes.problemCompanies.push(link)
      companyLinkItems.add(linkKey)
      items.push(companyLinkItem(link, resolved.row.label, 'add', label.path))
    }
  }

  return { changes, items, diagnostics, relevantState }
}
