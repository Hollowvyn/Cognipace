import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { makeValidAnalysis } from '../testing/code-analysis-fixtures'
import {
  codeAnalysisSchema,
  type CodeAnalysisReport,
} from './code-analysis-schema'

type ReportMutation = (report: CodeAnalysisReport) => void
type ReportObjectSelector = (report: CodeAnalysisReport) => object

const reportObjects: [string, ReportObjectSelector][] = [
  ['report', (report) => report],
  ['approach', (report) => report.approach],
  ['efficiency', (report) => report.efficiency],
  ['current complexity', (report) => report.efficiency.current!],
  ['suggested complexity', (report) => report.efficiency.suggested!],
  ['code style', (report) => report.codeStyle],
  ['suggested implementation', (report) => report.suggestedImplementation!],
  [
    'implementation complexity',
    (report) => report.suggestedImplementation!.complexity,
  ],
]

const nullableFields: [string, ReportObjectSelector, string][] = [
  ['approach score', (report) => report.approach, 'score'],
  ['approach consideration', (report) => report.approach, 'consider'],
  ['efficiency score', (report) => report.efficiency, 'score'],
  ['current complexity', (report) => report.efficiency, 'current'],
  ['suggested complexity', (report) => report.efficiency, 'suggested'],
  ['code style score', (report) => report.codeStyle, 'score'],
  ['suggested implementation', (report) => report, 'suggestedImplementation'],
  [
    'implementation unavailable reason',
    (report) => report,
    'suggestedImplementationUnavailableReason',
  ],
]

const proseFields: [string, ReportObjectSelector, string, unknown][] = [
  ['summary', (r) => r, 'summary', ' \n\t '],
  ['approach rationale', (r) => r.approach, 'rationale', ' \n\t '],
  ['current label', (r) => r.approach, 'current', [' \n\t ']],
  ['suggested label', (r) => r.approach, 'suggested', [' \n\t ']],
  ['key idea', (r) => r.approach, 'keyIdea', ' \n\t '],
  ['consideration', (r) => r.approach, 'consider', ' \n\t '],
  ['efficiency rationale', (r) => r.efficiency, 'rationale', ' \n\t '],
  ['complexity time', (r) => r.efficiency.current!, 'time', ' \n\t '],
  ['complexity space', (r) => r.efficiency.current!, 'space', ' \n\t '],
  [
    'complexity assumption',
    (r) => r.efficiency.current!,
    'assumptions',
    [' \n\t '],
  ],
  ['efficiency suggestion', (r) => r.efficiency, 'suggestions', [' \n\t ']],
  ['style rationale', (r) => r.codeStyle, 'rationale', ' \n\t '],
  ['style suggestion', (r) => r.codeStyle, 'suggestions', [' \n\t ']],
  [
    'implementation language',
    (r) => r.suggestedImplementation!,
    'language',
    ' \n\t ',
  ],
  [
    'implementation change',
    (r) => r.suggestedImplementation!,
    'changes',
    [' \n\t '],
  ],
  [
    'implementation assumption',
    (r) => r.suggestedImplementation!,
    'assumptions',
    [' \n\t '],
  ],
  [
    'implementation unavailable reason',
    (r) => r,
    'suggestedImplementationUnavailableReason',
    ' \n\t ',
  ],
]

describe('codeAnalysisSchema', () => {
  it('accepts the concrete accepted Two Sum report', () => {
    const report = makeValidAnalysis()

    expect(codeAnalysisSchema.parse(report)).toEqual(report)
    expect(report.version).toBe('leetcode-code-analysis-v1')
  })

  it.each(reportObjects)(
    'rejects extra fields on %s',
    (_label, selectObject) => {
      const report = makeValidAnalysis()
      Object.assign(selectObject(report), { unknownExtra: 'unexpected' })

      expect(codeAnalysisSchema.safeParse(report).success).toBe(false)
    },
  )

  it.each(nullableFields)(
    'requires the nullable %s field',
    (_label, selectObject, key) => {
      const report = makeValidAnalysis()
      Reflect.deleteProperty(selectObject(report), key)

      expect(codeAnalysisSchema.safeParse(report).success).toBe(false)
    },
  )

  it.each(['approach', 'efficiency', 'codeStyle'] as const)(
    'rejects out-of-range and fractional %s scores',
    (section) => {
      for (const score of [0, 6, 2.5]) {
        const report = makeValidAnalysis()
        report[section].score = score

        expect(codeAnalysisSchema.safeParse(report).success).toBe(false)
      }
    },
  )

  it.each(['approach', 'efficiency', 'codeStyle'] as const)(
    'accepts nullable and bounded integer %s scores structurally',
    (section) => {
      for (const score of [null, 1, 5]) {
        const report = makeValidAnalysis()
        report[section].score = score

        expect(codeAnalysisSchema.safeParse(report).success).toBe(true)
      }
    },
  )

  it.each(proseFields)('rejects blank %s', (_label, select, key, value) => {
    const report = makeValidAnalysis()
    Reflect.set(select(report), key, value)
    expect(codeAnalysisSchema.safeParse(report).success).toBe(false)
  })

  it('trims prose and labels while preserving generated code exactly', () => {
    const report = makeValidAnalysis()
    const code = '\n  function twoSum(nums, target) { return []; }\n\n'
    report.summary = '  Passed with an explicit resource tradeoff. \n'
    report.approach.rationale = '  Pair enumeration works. \n'
    report.approach.current = ['  Pair enumeration \n']
    report.approach.suggested = ['  Hash map \n']
    report.efficiency.current!.time = '  O(n²) \n'
    report.efficiency.suggestions = ['  Use expected constant-time lookups. \n']
    report.suggestedImplementation!.language = '  JavaScript \n'
    report.suggestedImplementation!.code = code

    expect(codeAnalysisSchema.parse(report)).toMatchObject({
      summary: 'Passed with an explicit resource tradeoff.',
      approach: {
        rationale: 'Pair enumeration works.',
        current: ['Pair enumeration'],
        suggested: ['Hash map'],
      },
      efficiency: {
        current: { time: 'O(n²)' },
        suggestions: ['Use expected constant-time lookups.'],
      },
      suggestedImplementation: { language: 'JavaScript', code },
    })
  })

  it.each([
    ['summary', (report) => (report.summary = 'x'.repeat(281))],
    ['common text', (report) => (report.approach.rationale = 'x'.repeat(801))],
    ['label', (report) => (report.approach.current = ['x'.repeat(81)])],
    [
      'complexity',
      (report) => (report.efficiency.current!.time = 'x'.repeat(161)),
    ],
    [
      'language',
      (report) => (report.suggestedImplementation!.language = 'x'.repeat(121)),
    ],
    [
      'generated code',
      (report) => (report.suggestedImplementation!.code = 'x'.repeat(32_001)),
    ],
  ] satisfies [string, ReportMutation][])(
    'rejects oversized %s',
    (_label, mutate) => {
      const report = makeValidAnalysis()
      mutate(report)

      expect(codeAnalysisSchema.safeParse(report).success).toBe(false)
    },
  )

  it('accepts text and code at their size bounds', () => {
    const report = makeValidAnalysis()
    report.summary = 'x'.repeat(280)
    report.approach.rationale = 'x'.repeat(800)
    report.approach.current = ['x'.repeat(80)]
    report.efficiency.current!.time = 'x'.repeat(160)
    report.suggestedImplementation!.language = 'x'.repeat(120)
    report.suggestedImplementation!.code = 'x'.repeat(32_000)

    expect(codeAnalysisSchema.safeParse(report).success).toBe(true)
  })

  it.each(['current', 'suggested'] as const)(
    'bounds the %s approach labels to one through eight',
    (field) => {
      for (const labels of [[], Array.from({ length: 9 }, () => 'Array')]) {
        const report = makeValidAnalysis()
        report.approach[field] = labels

        expect(codeAnalysisSchema.safeParse(report).success).toBe(false)
      }

      const report = makeValidAnalysis()
      report.approach[field] = Array.from({ length: 8 }, () => 'Array')
      expect(codeAnalysisSchema.safeParse(report).success).toBe(true)
    },
  )

  it.each([
    [
      'complexity assumptions',
      (report) => report.efficiency.current!.assumptions,
    ],
    ['efficiency suggestions', (report) => report.efficiency.suggestions],
    ['style suggestions', (report) => report.codeStyle.suggestions],
    [
      'implementation changes',
      (report) => report.suggestedImplementation!.changes,
    ],
    [
      'implementation assumptions',
      (report) => report.suggestedImplementation!.assumptions,
    ],
  ] satisfies [string, (report: CodeAnalysisReport) => string[]][])(
    'bounds %s to zero through four items',
    (_label, selectItems) => {
      const report = makeValidAnalysis()
      const items = selectItems(report)
      items.splice(0, items.length)
      expect(codeAnalysisSchema.safeParse(report).success).toBe(true)

      items.push(...Array.from({ length: 4 }, () => 'Explicit assumption.'))
      expect(codeAnalysisSchema.safeParse(report).success).toBe(true)

      items.push('One item too many.')
      expect(codeAnalysisSchema.safeParse(report).success).toBe(false)
    },
  )

  it('rejects empty generated code structurally', () => {
    const report = makeValidAnalysis()
    report.suggestedImplementation!.code = ''

    expect(codeAnalysisSchema.safeParse(report).success).toBe(false)
  })

  it('preserves whitespace-only generated code for the consistency check', () => {
    const report = makeValidAnalysis()
    report.suggestedImplementation!.code = ' \n\t '

    expect(codeAnalysisSchema.parse(report).suggestedImplementation!.code).toBe(
      ' \n\t ',
    )
  })

  it('rejects an unsupported report version', () => {
    expect(
      codeAnalysisSchema.safeParse({
        ...makeValidAnalysis(),
        version: 'leetcode-code-analysis-v2',
      }).success,
    ).toBe(false)
  })

  it('rejects unknown rubric enums', () => {
    const report = makeValidAnalysis()

    for (const [object, key] of [
      [report.approach, 'confidence'],
      [report.approach, 'strategyAssessment'],
      [report.efficiency, 'confidence'],
      [report.efficiency, 'timeComparison'],
      [report.efficiency, 'spaceComparison'],
      [report.codeStyle, 'confidence'],
      [report.codeStyle, 'readability'],
      [report.codeStyle, 'structure'],
    ] as const) {
      const priorValue: unknown = Reflect.get(object, key)
      Reflect.set(object, key, 'unknown-enum-value')
      expect(codeAnalysisSchema.safeParse(report).success).toBe(false)
      Reflect.set(object, key, priorValue)
    }
  })

  it('converts input JSON Schema with required nullable keys, strict objects, and bounds', () => {
    const jsonSchema = z.toJSONSchema(codeAnalysisSchema, { io: 'input' })

    expectStrictRequiredObjects(jsonSchema)
    expect(jsonSchema).toMatchObject({
      properties: {
        version: { const: 'leetcode-code-analysis-v1' },
        summary: { type: 'string', minLength: 1, maxLength: 280 },
        approach: {
          properties: {
            score: {
              anyOf: [
                { type: 'integer', minimum: 1, maximum: 5 },
                { type: 'null' },
              ],
            },
            rationale: { minLength: 1, maxLength: 800 },
            current: {
              minItems: 1,
              maxItems: 8,
              items: { type: 'string', minLength: 1, maxLength: 80 },
            },
            consider: {
              anyOf: [
                { type: 'string', minLength: 1, maxLength: 800 },
                { type: 'null' },
              ],
            },
          },
        },
        efficiency: {
          properties: {
            current: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    time: { minLength: 1, maxLength: 160 },
                    space: { minLength: 1, maxLength: 160 },
                    assumptions: { maxItems: 4 },
                  },
                },
                { type: 'null' },
              ],
            },
            suggestions: {
              maxItems: 4,
              items: { minLength: 1, maxLength: 800 },
            },
          },
        },
        suggestedImplementation: {
          anyOf: [
            {
              type: 'object',
              properties: {
                language: { minLength: 1, maxLength: 120 },
                code: { type: 'string', minLength: 1, maxLength: 32_000 },
              },
            },
            { type: 'null' },
          ],
        },
        suggestedImplementationUnavailableReason: {
          anyOf: [
            { type: 'string', minLength: 1, maxLength: 800 },
            { type: 'null' },
          ],
        },
      },
    })
  })
})

function expectStrictRequiredObjects(value: unknown) {
  if (!value || typeof value !== 'object') {
    return
  }

  if (!Array.isArray(value)) {
    const object = value as Record<string, unknown>

    if (object.type === 'object') {
      expect(object.additionalProperties).toBe(false)
      expect(object.required).toEqual(Object.keys(object.properties as object))
    }
  }

  for (const child of Object.values(value)) {
    expectStrictRequiredObjects(child)
  }
}
