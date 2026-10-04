import type { LeetCodeProblemContent } from '../domain/types'

export function createLeetCodeProblemContentFingerprint(
  content: Pick<
    LeetCodeProblemContent,
    | 'location'
    | 'statement'
    | 'examples'
    | 'constraints'
    | 'followUps'
    | 'hints'
    | 'completeness'
  >,
) {
  return stableHash(
    JSON.stringify({
      slug: content.location.slug,
      statement: normalizeFingerprintText(content.statement),
      examples: content.examples.map((example) => ({
        label: normalizeFingerprintText(example.label),
        input: normalizeFingerprintText(example.input ?? ''),
        output: normalizeFingerprintText(example.output ?? ''),
        explanation: normalizeFingerprintText(example.explanation ?? ''),
        rawText: normalizeFingerprintText(example.rawText),
      })),
      constraints: content.constraints.map(normalizeFingerprintText),
      hints: content.hints.map(normalizeFingerprintText),
      followUps: content.followUps.map(normalizeFingerprintText),
      completeness: content.completeness,
    }),
  )
}

function normalizeFingerprintText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stableHash(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return `lc-content-${(hash >>> 0).toString(16)}`
}
