import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { contentFileSchema } from './content-file-contracts'

describe('content file authoring contract', () => {
  it('allows sparse questions and optional null metadata', () => {
    expect(
      contentFileSchema.safeParse({
        format: 'cognipace-content',
        version: 1,
        problems: [
          'two-sum',
          {
            url: 'https://leetcode.com/problems/valid-anagram/',
            difficulty: null,
          },
        ],
        companies: null,
      }).success,
    ).toBe(true)
  })

  it('catches misspelled fields and objects without identity', () => {
    for (const problem of [
      { title: 'Two Sum' },
      { slug: 'two-sum', difficulity: 'easy' },
    ]) {
      expect(
        contentFileSchema.safeParse({
          format: 'cognipace-content',
          version: 1,
          problems: [problem],
        }).success,
      ).toBe(false)
    }
  })

  it('keeps the published schema and examples aligned with the contract', () => {
    const importDirectory = join(process.cwd(), 'public/import')
    const exampleDirectory = join(importDirectory, 'examples')
    const exampleNames = [
      'minimal-problems.json',
      'detailed-problems.json',
      'companies.json',
      'topics.json',
      'track-only.json',
      'combined.json',
    ]

    for (const exampleName of exampleNames) {
      const value: unknown = JSON.parse(
        readFileSync(join(exampleDirectory, exampleName), 'utf8'),
      )
      expect(contentFileSchema.safeParse(value).success, exampleName).toBe(true)
    }

    const publishedSchema: unknown = JSON.parse(
      readFileSync(
        join(importDirectory, 'cognipace-content-v1.schema.json'),
        'utf8',
      ),
    )
    expect(publishedSchema).toEqual(
      z.toJSONSchema(contentFileSchema, { target: 'draft-2020-12' }),
    )
  })
})
