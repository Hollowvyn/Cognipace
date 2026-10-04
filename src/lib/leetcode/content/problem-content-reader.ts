import DOMPurify from 'dompurify'
import { createLeetCodeProblemContentFingerprint } from './content-fingerprint'
import {
  escapeRegExp,
  readMultilineText,
  readNormalizedText,
  readTextFromHtml,
  stripRepeatedWhitespace,
} from '../core/dom-text'
import { requestLeetCodeProblemContent } from '../api/problem-content-request'
import type { LeetCodeGraphQlFetch } from '../core/graphql-client'
import { isObjectRecord, readTrimmedString } from '../core/value-readers'
import type {
  LeetCodeCaptureCompleteness,
  LeetCodeExample,
  LeetCodeProblemContent,
  LeetCodeProblemContentConfidence,
  LeetCodeProblemContentResult,
  LeetCodeProblemContentSource,
  LeetCodeProblemLocation,
} from '../domain/types'

type ParsedGraphQlQuestionContent = {
  contentHtml: string | null
  hints: string[]
}

const leetCodeConstraintsHeadingPattern =
  /\bConstraints[^\S\r\n]*:|(?:^|\n)[^\S\r\n]*Constraints[^\S\r\n]*(?=\n|$)/i

const leetCodeHintRootSelector =
  '[data-e2e-locator*="hint" i], [data-cy*="hint" i], [class*="hint" i], details'

const leetCodeProblemContentRootSelectors = [
  '[data-track-load="description_content"]',
  '[data-cy="question-detail-main-tabs"]',
  '[data-e2e-locator="question-detail"]',
  '[class*="question-content" i]',
  '[class*="description" i]',
] as const

export async function readLeetCodeProblemContent(
  location: LeetCodeProblemLocation,
  options: {
    root?: ParentNode | undefined
    document?: Document | undefined
    fetch?: LeetCodeGraphQlFetch | undefined
    csrfToken?: string | null | undefined
    now?: (() => number) | undefined
  } = {},
): Promise<LeetCodeProblemContentResult> {
  const graphQlContentResult = await fetchLeetCodeProblemContent(location, {
    fetch: options.fetch,
    document: options.document,
    csrfToken: options.csrfToken,
    now: options.now,
  })

  if (graphQlContentResult.ok) {
    return graphQlContentResult
  }

  const fallbackRoot = options.root ?? readAvailableDocument(options.document)
  const domContent = fallbackRoot
    ? readLeetCodeProblemContentFromDom(fallbackRoot, {
        location,
        now: options.now,
      })
    : null

  if (domContent) {
    return { ok: true, content: domContent }
  }

  return {
    ok: true,
    content: createProblemContent({
      location,
      statement: '',
      examples: [],
      constraints: [],
      followUps: [],
      completeness: 'missing',
      hints: [],
      source: 'fallback',
      confidence: 'low',
      capturedAt: options.now?.() ?? Date.now(),
    }),
  }
}

export async function fetchLeetCodeProblemContent(
  location: LeetCodeProblemLocation,
  options: {
    fetch?: LeetCodeGraphQlFetch | undefined
    document?: Document | undefined
    csrfToken?: string | null | undefined
    now?: (() => number) | undefined
  } = {},
): Promise<LeetCodeProblemContentResult> {
  const graphQlResult = await requestLeetCodeProblemContent({
    locationUrl: location.url,
    slug: location.slug,
    fetch: options.fetch,
    document: options.document,
    csrfToken: options.csrfToken,
  })

  if (!graphQlResult.ok) {
    return graphQlResult
  }

  const parsedQuestionContent = readQuestionContentFromGraphQlPayload(
    graphQlResult.payload,
  )

  if (!parsedQuestionContent?.contentHtml) {
    return {
      ok: false,
      error: new Error('LeetCode GraphQL response did not include content.'),
    }
  }

  const contentDocument = createContentDocumentOrNull(
    parsedQuestionContent.contentHtml,
    options.document,
  )
  const contentParts = contentDocument
    ? readContentPartsFromRoot(contentDocument.body)
    : readContentPartsFromText(
        readTextFromHtml(parsedQuestionContent.contentHtml),
      )

  if (!contentParts.statement) {
    return {
      ok: false,
      error: new Error(
        'LeetCode GraphQL response did not include a meaningful statement.',
      ),
    }
  }

  return {
    ok: true,
    content: createProblemContent({
      location,
      statement: contentParts.statement,
      examples: contentParts.examples,
      constraints: contentParts.constraints,
      followUps: contentParts.followUps,
      completeness: 'complete',
      hints: parsedQuestionContent.hints,
      source: 'graphql',
      confidence: 'high',
      capturedAt: options.now?.() ?? Date.now(),
    }),
  }
}

export function readLeetCodeProblemContentFromDom(
  pageRoot: ParentNode,
  options: {
    location: LeetCodeProblemLocation
    now?: (() => number) | undefined
  },
): LeetCodeProblemContent | null {
  const contentRoot = findProblemContentRoot(pageRoot)

  if (!contentRoot) {
    return null
  }

  const contentParts = readContentPartsFromRoot(contentRoot)

  if (
    !contentParts.statement &&
    contentParts.examples.length === 0 &&
    contentParts.constraints.length === 0 &&
    contentParts.followUps.length === 0
  ) {
    return null
  }

  return createProblemContent({
    location: options.location,
    statement: contentParts.statement,
    examples: contentParts.examples,
    constraints: contentParts.constraints,
    followUps: contentParts.followUps,
    completeness: 'partial',
    hints: readHintsFromDomRoot(contentRoot),
    source: 'dom',
    confidence: contentParts.statement ? 'medium' : 'low',
    capturedAt: options.now?.() ?? Date.now(),
  })
}

function createProblemContent(options: {
  location: LeetCodeProblemLocation
  statement: string
  examples: LeetCodeExample[]
  constraints: string[]
  followUps: string[]
  completeness: LeetCodeCaptureCompleteness
  hints: string[]
  source: LeetCodeProblemContentSource
  confidence: LeetCodeProblemContentConfidence
  capturedAt: number
}): LeetCodeProblemContent {
  const contentWithoutFingerprint = {
    location: options.location,
    statement: options.statement,
    examples: options.examples,
    constraints: options.constraints,
    followUps: options.followUps,
    completeness: options.completeness,
    hints: options.hints,
    source: options.source,
    confidence: options.confidence,
    capturedAt: options.capturedAt,
  }

  return {
    ...contentWithoutFingerprint,
    contentFingerprint: createLeetCodeProblemContentFingerprint(
      contentWithoutFingerprint,
    ),
  }
}

function readQuestionContentFromGraphQlPayload(
  payload: unknown,
): ParsedGraphQlQuestionContent | null {
  if (!isObjectRecord(payload) || !isObjectRecord(payload.data)) {
    return null
  }

  const question = payload.data.question

  if (!isObjectRecord(question)) {
    return null
  }

  return {
    contentHtml: readTrimmedString(question.content),
    hints: readStringList(question.hints),
  }
}

function createContentDocumentOrNull(
  contentHtml: string,
  documentRef: Document | undefined,
) {
  const hostDocument = readAvailableDocument(documentRef)

  if (!hostDocument) {
    return null
  }

  const contentDocument = hostDocument.implementation.createHTMLDocument('')
  const fragment = DOMPurify.sanitize(contentHtml, {
    RETURN_DOM_FRAGMENT: true,
    RETURN_DOM: true,
  }) as DocumentFragment
  contentDocument.body.appendChild(fragment)

  return contentDocument
}

function readContentPartsFromRoot(contentRoot: ParentNode) {
  return readContentPartsFromText(readContentText(contentRoot))
}

function readContentPartsFromText(text: string) {
  const mainContentText = text.split(/\bFollow[\s-]*up\s*:/i)[0] ?? ''
  const exampleContentText =
    mainContentText.split(leetCodeConstraintsHeadingPattern)[0] ?? ''
  const namedExamples = Array.from(
    exampleContentText.matchAll(
      /\bExample\s+(\d+)\s*:\s*([\s\S]*?)(?=\bExample\s+\d+\s*:|\bConstraints\s*:|\bHint\s*\d*\s*:|$)/gi,
    ),
  ).map((match) => readExampleFromText(match[0], Number(match[1]) - 1))
  const examples =
    namedExamples.length > 0
      ? namedExamples
      : Array.from(
          exampleContentText.matchAll(
            /\bInput\s*:\s*[\s\S]*?(?=\bInput\s*:|\bConstraints\s*:|\bHint\s*\d*\s*:|$)/gi,
          ),
        ).map((match, index) => readExampleFromText(match[0], index))

  return {
    statement: readStatementFromText(text),
    examples: examples.filter((example): example is LeetCodeExample =>
      Boolean(example),
    ),
    constraints: readConstraintsFromText(text),
    followUps: readFollowUpsFromText(text),
  }
}

function readContentText(contentRoot: ParentNode) {
  const textRoot = contentRoot.cloneNode(true) as ParentNode
  for (const hint of textRoot.querySelectorAll(leetCodeHintRootSelector)) {
    if (
      !hint.matches('details') ||
      /^Hint\s*\d*/i.test(
        readNormalizedText(hint.querySelector('summary') ?? hint),
      )
    )
      hint.remove()
  }
  for (const element of textRoot.querySelectorAll('*')) {
    if (
      element.matches('p, div, pre, li, ul, ol, h1, h2, h3, h4, h5, h6, br') ||
      /^Follow[\s-]*up\s*:/i.test(readNormalizedText(element))
    ) {
      element.prepend('\n')
      element.append('\n')
    }
  }
  return readMultilineText(textRoot)
}

function readFollowUpsFromText(text: string) {
  const followUp = text.match(
    /\bFollow[\s-]*up\s*:\s*([\s\S]*?)(?=\bHint\s*\d*\s*:|$)/i,
  )?.[1]
  const normalizedFollowUp = followUp ? stripLeetCodeNoise(followUp) : ''
  return normalizedFollowUp ? [normalizedFollowUp] : []
}

function readStatementFromText(text: string) {
  return stripLeetCodeNoise(
    text
      .split(leetCodeConstraintsHeadingPattern)[0]
      ?.split(/\bExample\s+\d+\s*:|\bFollow[\s-]*up\s*:/i)[0] ?? '',
  )
}

function readExampleFromText(text: string, index: number) {
  const rawText = text.split(/\bFollow[\s-]*up\s*:/i)[0]?.trim() ?? ''

  if (!rawText || !/\bInput\s*:/i.test(rawText)) {
    return null
  }

  const label =
    rawText.match(/\bExample\s+\d+\s*:/i)?.[0].replace(/:$/, '') ??
    `Example ${index + 1}`

  return {
    label,
    input: readExampleField(rawText, 'Input', [
      'Output',
      'Explanation',
      'Constraints',
      'Example',
    ]),
    output: readExampleField(rawText, 'Output', [
      'Explanation',
      'Constraints',
      'Example',
    ]),
    explanation: readExampleField(rawText, 'Explanation', [
      'Constraints',
      'Example',
    ]),
    rawText,
  } satisfies LeetCodeExample
}

function readExampleField(
  text: string,
  label: string,
  stopLabels: readonly string[],
) {
  const stopPattern = stopLabels.map(escapeRegExp).join('|')
  const fieldPattern = new RegExp(
    `\\b${escapeRegExp(label)}\\s*:\\s*([\\s\\S]*?)(?=\\b(?:${stopPattern})\\s*:|$)`,
    'i',
  )
  const fieldValue = text.match(fieldPattern)?.[1]?.trim()

  return fieldValue || null
}

function readConstraintsFromText(text: string) {
  const mainContentText = text.split(/\bFollow[\s-]*up\s*:/i)[0] ?? ''
  const constraintsText = mainContentText
    .split(leetCodeConstraintsHeadingPattern)[1]
    ?.split(/\bHint\s*\d*\s*:/i)[0]

  if (!constraintsText) {
    return []
  }

  return uniqueStrings(
    splitConstraintCandidates(constraintsText)
      .map(stripLeetCodeNoise)
      .filter(Boolean),
  )
}

function splitConstraintCandidates(constraintsText: string) {
  const lineCandidates = constraintsText
    .split(/\n+/)
    .map(stripLeetCodeNoise)
    .filter(Boolean)

  return lineCandidates.flatMap((lineCandidate) =>
    lineCandidate.split(
      /(?<=[.;])\s+(?=(?:-?\d+\s*<=|[a-zA-Z_][\w.]*\s*(?:==|<=|>=|<|>)))/,
    ),
  )
}

function readHintsFromDomRoot(contentRoot: ParentNode) {
  const hintTexts = Array.from(
    contentRoot.querySelectorAll(leetCodeHintRootSelector),
  )
    .map((hintElement) =>
      stripLeetCodeNoise(
        readNormalizedText(hintElement).replace(/^Hint\s*\d*\s*:?\s*/i, ''),
      ),
    )
    .filter((hintText) => hintText && !/^hint\s*\d*$/i.test(hintText))

  return uniqueStrings(hintTexts)
}

function findProblemContentRoot(pageRoot: ParentNode) {
  for (const selector of leetCodeProblemContentRootSelectors) {
    const contentRoot = pageRoot.querySelector(selector)

    if (contentRoot) {
      return contentRoot
    }
  }

  return null
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(readTrimmedString)
    .map((text) =>
      text
        ? stripLeetCodeNoise(readTextFromHtml(DOMPurify.sanitize(text)))
        : null,
    )
    .filter((text): text is string => Boolean(text))
}

function readAvailableDocument(documentRef: Document | undefined) {
  if (documentRef) {
    return documentRef
  }

  return typeof document === 'undefined' ? null : document
}

function stripLeetCodeNoise(value: string) {
  return stripRepeatedWhitespace(value)
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values))
}
