import type {
  LeetCodeCodeSnapshotSource,
  LeetCodeProblemLocation,
  LeetCodeSubmissionResult,
  LeetCodeSubmissionStatus,
  LeetCodeSubmittedCodeSnapshot,
} from '../domain/types'
import { readNormalizedText } from '../core/dom-text'
import { readBoundedTextAfterLabel as readLabeledTextAfter } from '../core/labeled-fields'
import { normalizeLeetCodeLanguageLabel } from '../domain/language'

type SubmissionStatusMatch = {
  status: LeetCodeSubmissionStatus
  statusText: string
}

type ResultCodeCandidate = {
  code: string
  source: LeetCodeCodeSnapshotSource
}

const submissionStatusLabels = [
  {
    status: 'accepted',
    statusText: 'Accepted',
    pattern: /\bAccepted\b/i,
  },
  {
    status: 'wrong-answer',
    statusText: 'Wrong Answer',
    pattern: /\bWrong Answer\b/i,
  },
  {
    status: 'runtime-error',
    statusText: 'Runtime Error',
    pattern: /\bRuntime Error\b/i,
  },
  {
    status: 'compile-error',
    statusText: 'Compile Error',
    pattern: /\bCompile Error\b/i,
  },
  {
    status: 'time-limit-exceeded',
    statusText: 'Time Limit Exceeded',
    pattern: /\bTime Limit Exceeded\b/i,
  },
  {
    status: 'memory-limit-exceeded',
    statusText: 'Memory Limit Exceeded',
    pattern: /\bMemory Limit Exceeded\b/i,
  },
  {
    status: 'output-limit-exceeded',
    statusText: 'Output Limit Exceeded',
    pattern: /\bOutput Limit Exceeded\b/i,
  },
] as const satisfies readonly SubmissionStatusMatchWithPattern[]

type SubmissionStatusMatchWithPattern = SubmissionStatusMatch & {
  pattern: RegExp
}

const submissionResultRootSelectors = [
  '[data-e2e-locator*="submission" i]',
  '[data-cy*="submission" i]',
  '[data-e2e-locator*="result" i]',
  '[data-cy*="result" i]',
  '[class*="submission" i]',
  '[class*="result" i]',
  '[role="dialog"]',
] as const

const fallbackSubmissionResultRootSelector =
  'section, article, aside, [role="tabpanel"], [role="region"], div'

const maximumFallbackResultTextLength = 3000

const resultCodeHeadingSelectors = [
  'h1',
  'h2',
  'h3',
  'h4',
  '[role="heading"]',
  'span',
  'p',
  'div',
] as const

const resultCodeBlockSelectors = [
  '.view-lines',
  'pre',
  'code',
  'textarea',
].join(',')

const boundedTextStopLabels = [
  'Last\\s+executed\\s+input',
  'Last\\s+Testcase',
  'Input',
  'Code\\s+Output',
  'Expected\\s+Output',
  'Output',
  'Expected',
  'Stdout',
  'Std\\s+Output',
  'Standard\\s+Output',
  'Code\\s*\\|',
  'More challenges',
] as const

export function readLeetCodeSubmissionResult(
  pageRoot: ParentNode,
  options: {
    location: LeetCodeProblemLocation
    now?: (() => number) | undefined
  },
): LeetCodeSubmissionResult | null {
  const resultRoot = findLeetCodeSubmissionResultRoot(pageRoot)

  if (!resultRoot) {
    return null
  }

  const resultText = readNormalizedText(resultRoot)
  const statusMatch = findSubmissionStatusMatch(resultText)

  if (!statusMatch) {
    return null
  }

  const now = options.now ?? Date.now
  const compileError = readCompileError(statusMatch.status, resultText)
  const runtimeError = readRuntimeError(statusMatch.status, resultText)
  const lastTestcase = readLastTestcase(statusMatch.status, resultText)
  const codeOutput = readCodeOutput(statusMatch.status, resultText)
  const expectedOutput = readExpectedOutput(statusMatch.status, resultText)
  const stdOutput = readStdOutput(resultText)
  const errorMessage = readSubmissionErrorMessage({
    status: statusMatch.status,
    compileError,
    runtimeError,
    text: resultText,
  })

  return {
    location: options.location,
    submissionId: readSubmissionId(resultRoot, pageRoot),
    source: 'dom',
    status: statusMatch.status,
    statusText: statusMatch.statusText,
    checkedAt: now(),
    runtime: readRuntime(resultText),
    memory: readMemory(resultText),
    passedTestCount: readPassedTestCount(resultText),
    totalTestCount: readTotalTestCount(resultText),
    failingTestcase: lastTestcase,
    errorMessage,
    compileError,
    runtimeError,
    lastTestcase,
    codeOutput,
    expectedOutput,
    stdOutput,
    resultCodeSnapshot: readSubmissionResultCodeSnapshot(
      resultRoot,
      pageRoot,
      now,
    ),
  }
}

export function createLeetCodeSubmissionResultFingerprint(
  result: LeetCodeSubmissionResult,
) {
  return [
    result.location.slug,
    result.source,
    result.submissionId,
    result.status,
    result.statusText,
    result.runtime,
    result.memory,
    result.passedTestCount,
    result.totalTestCount,
    result.failingTestcase,
    result.errorMessage,
    result.compileError,
    result.runtimeError,
    result.lastTestcase,
    result.codeOutput,
    result.expectedOutput,
    result.stdOutput,
    result.resultCodeSnapshot.language,
    result.resultCodeSnapshot.source,
    result.resultCodeSnapshot.completeness,
    result.resultCodeSnapshot.code,
  ].join('|')
}

function findLeetCodeSubmissionResultRoot(pageRoot: ParentNode) {
  for (const selector of submissionResultRootSelectors) {
    const candidateRoots = Array.from(pageRoot.querySelectorAll(selector))

    for (const candidateRoot of candidateRoots) {
      const candidateText = readNormalizedText(candidateRoot)

      if (
        findSubmissionStatusMatch(candidateText) &&
        hasSubmissionResultContext(candidateText)
      ) {
        return candidateRoot
      }
    }
  }

  const fallbackCandidateRoot = findFallbackSubmissionResultRoot(pageRoot)

  if (fallbackCandidateRoot) {
    return fallbackCandidateRoot
  }

  return null
}

function hasSubmissionResultContext(text: string) {
  return (
    /\b\d+\s*\/\s*\d+\s*(?:testcases?|cases?)?\s*passed\b/i.test(text) ||
    /\bRuntime\s*:?\s*[0-9.]+\s*(?:ms|s)\b/i.test(text) ||
    /\bMemory\s*:?\s*[0-9.]+\s*(?:KB|MB|GB)\b/i.test(text) ||
    /\b(?:Compile Error|Runtime Error|Time Limit Exceeded|Memory Limit Exceeded|Output Limit Exceeded)\b/i.test(
      text,
    )
  )
}

function findFallbackSubmissionResultRoot(pageRoot: ParentNode) {
  const candidates = Array.from(
    pageRoot.querySelectorAll(fallbackSubmissionResultRootSelector),
  )

  return (
    candidates
      .map((candidate) => {
        const text = readNormalizedText(candidate)

        return {
          candidate,
          text,
          contextScore: scoreSubmissionResultContext(text),
        }
      })
      .filter(({ contextScore, text }) => {
        return (
          text.length > 0 &&
          text.length <= maximumFallbackResultTextLength &&
          findSubmissionStatusMatch(text) &&
          contextScore > 0 &&
          !hasProblemStatementMarkers(text)
        )
      })
      .sort(
        (left, right) =>
          right.contextScore - left.contextScore ||
          left.text.length - right.text.length,
      )[0]?.candidate ?? null
  )
}

function scoreSubmissionResultContext(text: string) {
  return [
    /\b\d+\s*\/\s*\d+\s*(?:testcases?|cases?)?\s*passed\b/i,
    /\bRuntime\s*:?\s*[0-9.]+\s*(?:ms|s)\b/i,
    /\bMemory\s*:?\s*[0-9.]+\s*(?:KB|MB|GB)\b/i,
    /\b(?:Compile Error|Runtime Error|Time Limit Exceeded|Memory Limit Exceeded|Output Limit Exceeded)\b/i,
  ].filter((pattern) => pattern.test(text)).length
}

function hasProblemStatementMarkers(text: string) {
  return /\b(Example\s+\d+|Constraints|Companies|Editorial|Solutions|More challenges)\b/i.test(
    text,
  )
}

function findSubmissionStatusMatch(text: string): SubmissionStatusMatch | null {
  const match = submissionStatusLabels.find((statusLabel) =>
    statusLabel.pattern.test(text),
  )

  return match ? { status: match.status, statusText: match.statusText } : null
}

function readRuntime(text: string) {
  return text.match(/\bRuntime\s*:?\s*([0-9.]+\s*(?:ms|s))\b/i)?.[1] ?? null
}

function readMemory(text: string) {
  return text.match(/\bMemory\s*:?\s*([0-9.]+\s*(?:KB|MB|GB))\b/i)?.[1] ?? null
}

function readPassedTestCount(text: string) {
  const passedTestCount = text.match(
    /\b(\d+)\s*\/\s*(\d+)\s*(?:testcases?|cases?)?\s*passed\b/i,
  )?.[1]

  return passedTestCount ? Number(passedTestCount) : null
}

function readTotalTestCount(text: string) {
  const totalTestCount = text.match(
    /\b(\d+)\s*\/\s*(\d+)\s*(?:testcases?|cases?)?\s*passed\b/i,
  )?.[2]

  return totalTestCount ? Number(totalTestCount) : null
}

function readLastTestcase(status: LeetCodeSubmissionStatus, text: string) {
  if (status === 'accepted') {
    return null
  }

  return readBoundedTextAfterLabel(text, [
    'Last executed input',
    'Last Testcase',
    'Input',
  ])
}

function readCodeOutput(status: LeetCodeSubmissionStatus, text: string) {
  return status === 'accepted'
    ? null
    : readBoundedTextAfterLabel(text, ['Code Output', 'Output'])
}

function readExpectedOutput(status: LeetCodeSubmissionStatus, text: string) {
  return status === 'accepted'
    ? null
    : readBoundedTextAfterLabel(text, ['Expected Output', 'Expected'])
}

function readStdOutput(text: string) {
  return readBoundedTextAfterLabel(
    text,
    ['Stdout', 'Std Output', 'Standard Output'],
    ['Code\\s*\\|', 'More challenges'],
  )
}

function readRuntimeError(status: LeetCodeSubmissionStatus, text: string) {
  return status === 'runtime-error'
    ? readBoundedTextAfterLabel(text, ['Runtime Error'])
    : null
}

function readCompileError(status: LeetCodeSubmissionStatus, text: string) {
  return status === 'compile-error'
    ? readBoundedTextAfterLabel(text, ['Compile Error'])
    : null
}

function readSubmissionErrorMessage(options: {
  status: LeetCodeSubmissionStatus
  compileError: string | null
  runtimeError: string | null
  text: string
}) {
  if (options.status === 'accepted') {
    return null
  }

  return (
    options.runtimeError ??
    options.compileError ??
    readBoundedTextAfterLabel(options.text, [
      'Time Limit Exceeded',
      'Memory Limit Exceeded',
      'Output Limit Exceeded',
    ])
  )
}

function readBoundedTextAfterLabel(
  text: string,
  labels: readonly string[],
  stopLabels: readonly string[] = boundedTextStopLabels,
) {
  return readLabeledTextAfter({
    text,
    labels,
    stopLabelPatterns: stopLabels,
  })
}

function readSubmissionResultCodeSnapshot(
  resultRoot: ParentNode,
  pageRoot: ParentNode,
  now: () => number,
): LeetCodeSubmittedCodeSnapshot {
  const resultRootCodeHeading = findResultCodeHeading(resultRoot)
  const pageCodeHeading =
    resultRootCodeHeading ?? findResultCodeHeading(pageRoot)

  if (!pageCodeHeading) {
    return {
      code: null,
      language: null,
      source: 'none',
      completeness: 'missing',
      capturedAt: now(),
    }
  }

  const codeSearchRoot = resultRootCodeHeading ? resultRoot : pageRoot
  const resultCodeCandidate = findResultCodeCandidateAfterHeading(
    codeSearchRoot,
    pageCodeHeading,
  )

  return {
    code: resultCodeCandidate?.code ?? null,
    language: readLanguageFromCodeHeading(pageCodeHeading),
    source: resultCodeCandidate?.source ?? 'none',
    completeness: resultCodeCandidate ? 'partial' : 'missing',
    capturedAt: now(),
  }
}

function findResultCodeHeading(resultRoot: ParentNode) {
  for (const selector of resultCodeHeadingSelectors) {
    const candidates = Array.from(resultRoot.querySelectorAll(selector))

    for (const candidate of candidates) {
      const text = readNormalizedText(candidate)

      if (text.length <= 80 && /^Code\s*\|\s*\S+/i.test(text)) {
        return candidate
      }
    }
  }

  return null
}

function readLanguageFromCodeHeading(codeHeading: Element) {
  return normalizeLeetCodeLanguageLabel(
    readNormalizedText(codeHeading).match(/^Code\s*\|\s*(.+)$/i)?.[1],
  )
}

function findResultCodeCandidateAfterHeading(
  resultRoot: ParentNode,
  codeHeading: Element,
): ResultCodeCandidate | null {
  const codeCandidates = Array.from(
    resultRoot.querySelectorAll(resultCodeBlockSelectors),
  ).filter((candidate) => isElementAfterHeading(codeHeading, candidate))

  for (const codeCandidate of codeCandidates) {
    const code = readCodeFromCandidate(codeCandidate)

    if (code) {
      return {
        code,
        source: readCodeCandidateSource(codeCandidate),
      }
    }
  }

  return null
}

function isElementAfterHeading(heading: Element, element: Element) {
  return Boolean(
    heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
  )
}

function readCodeFromCandidate(candidate: Element) {
  if (candidate.matches('.view-lines')) {
    const monacoLines = Array.from(
      candidate.querySelectorAll('.view-line'),
    ).map((line) => line.textContent ?? '')

    return monacoLines.length > 0 ? monacoLines.join('\n').trimEnd() : null
  }

  if (candidate instanceof HTMLTextAreaElement) {
    return candidate.value.trimEnd() || null
  }

  return candidate.textContent?.trimEnd() || null
}

function readCodeCandidateSource(
  candidate: Element,
): LeetCodeCodeSnapshotSource {
  if (candidate.matches('.view-lines')) {
    return 'monaco'
  }

  if (candidate instanceof HTMLTextAreaElement) {
    return 'textarea'
  }

  return 'code-block'
}

function readSubmissionId(resultRoot: ParentNode, pageRoot: ParentNode) {
  const submissionDetailHref = resultRoot.querySelector<HTMLAnchorElement>(
    'a[href*="/submissions/detail/"]',
  )?.href
  const submissionIdFromHref = submissionDetailHref?.match(
    /\/submissions\/detail\/(\d+)/,
  )?.[1]

  if (submissionIdFromHref) {
    return submissionIdFromHref
  }

  const documentUrl = readDocumentUrl(pageRoot)

  return documentUrl?.match(/\/submissions\/detail\/(\d+)/)?.[1] ?? null
}

function readDocumentUrl(pageRoot: ParentNode) {
  const rootDocument =
    pageRoot.nodeType === Node.DOCUMENT_NODE
      ? (pageRoot as Document)
      : pageRoot.ownerDocument

  return rootDocument?.location?.href ?? null
}
