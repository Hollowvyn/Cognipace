import { describe, expect, expectTypeOf, it } from 'vitest'

import type { ImportPreview } from '../domain/import-types'
import {
  importApplyRequestSchema,
  importApplyResponseSchema,
  importPreviewRequestSchema,
  importPreviewResponseSchema,
  importRetryPersistenceRequestSchema,
  importRetryPersistenceResponseSchema,
} from './import-runtime-contracts'

const emptyPreview = {
  status: 'unchanged',
  fingerprint: 'a'.repeat(64),
  additions: {
    problems: 0,
    topics: 0,
    companies: 0,
    problemTopics: 0,
    problemCompanies: 0,
    tracks: 0,
    groups: 0,
    memberships: 0,
  },
  items: [],
  diagnostics: [],
} as const

describe('import runtime contracts', () => {
  it('accepts only dashboard preview, apply, and retry requests', () => {
    expect(
      importPreviewRequestSchema.safeParse({
        surface: 'dashboard',
        fileText: '{"format":"cognipace-content"}',
      }).success,
    ).toBe(true)
    expect(
      importApplyRequestSchema.safeParse({
        surface: 'dashboard',
        fileText: '{}',
        fingerprint: 'a'.repeat(64),
      }).success,
    ).toBe(true)
    expect(
      importRetryPersistenceRequestSchema.safeParse({ surface: 'dashboard' })
        .success,
    ).toBe(true)
    expect(
      importRetryPersistenceRequestSchema.safeParse({ surface: 'popup' })
        .success,
    ).toBe(false)
  })

  it('rejects malformed fingerprints, oversized UTF-8 input, and unknown request fields', () => {
    for (const fingerprint of [
      'A'.repeat(64),
      'a'.repeat(63),
      'g'.repeat(64),
    ]) {
      expect(
        importApplyRequestSchema.safeParse({
          surface: 'dashboard',
          fileText: '{}',
          fingerprint,
        }).success,
      ).toBe(false)
    }

    expect(
      importPreviewRequestSchema.safeParse({
        surface: 'dashboard',
        fileText: 'é'.repeat(2_621_441),
      }).success,
    ).toBe(false)
    expect(
      importPreviewRequestSchema.safeParse({
        surface: 'dashboard',
        fileText: '{}',
        unexpected: true,
      }).success,
    ).toBe(false)
    expect(
      importRetryPersistenceRequestSchema.safeParse({
        surface: 'dashboard',
        unexpected: true,
      }).success,
    ).toBe(false)
    expect(
      importApplyRequestSchema.safeParse({
        surface: 'dashboard',
        fileText: '{}',
        fingerprint: 'a'.repeat(64),
        unexpected: true,
      }).success,
    ).toBe(false)
  })

  it('validates each preview discriminant and keeps the domain preview assignable', () => {
    expectTypeOf<
      ReturnType<typeof importPreviewResponseSchema.parse>
    >().toMatchTypeOf<ImportPreview>()

    for (const status of ['ready', 'unchanged', 'empty', 'blocked'] as const) {
      expect(
        importPreviewResponseSchema.safeParse({ ...emptyPreview, status })
          .success,
      ).toBe(true)
    }
    expect(
      importPreviewResponseSchema.safeParse({
        ...emptyPreview,
        additions: { ...emptyPreview.additions, problems: -1 },
      }).success,
    ).toBe(false)
    expect(
      importPreviewResponseSchema.safeParse({
        ...emptyPreview,
        status: 'blocked',
        fingerprint: null,
      }).success,
    ).toBe(true)
    expect(
      importPreviewResponseSchema.safeParse({
        ...emptyPreview,
        unknown: true,
      }).success,
    ).toBe(false)
    expect(
      importPreviewResponseSchema.safeParse({
        ...emptyPreview,
        additions: { ...emptyPreview.additions, extra: 0 },
      }).success,
    ).toBe(false)
    expect(
      importPreviewResponseSchema.safeParse({
        ...emptyPreview,
        diagnostics: [
          {
            severity: 'error',
            code: 'invalid',
            path: 'problems[0]',
            message: 'Invalid',
          },
        ],
      }).success,
    ).toBe(true)
    expect(
      importPreviewResponseSchema.safeParse({
        ...emptyPreview,
        items: [
          {
            kind: 'problems',
            identity: 'two-sum',
            label: 'Two Sum',
            action: 'add',
            path: 'problems[0]',
          },
        ],
      }).success,
    ).toBe(true)
  })

  it('validates every apply and persistence-retry discriminant with a preview', () => {
    for (const status of [
      'saved',
      'persistence-error',
      'stale',
      'unchanged',
      'blocked',
    ] as const) {
      expect(
        importApplyResponseSchema.safeParse({ status, preview: emptyPreview })
          .success,
      ).toBe(true)
    }

    for (const status of ['saved', 'persistence-error', 'repreview'] as const) {
      expect(
        importRetryPersistenceResponseSchema.safeParse({ status }).success,
      ).toBe(true)
    }

    expect(
      importApplyResponseSchema.safeParse({
        status: 'persistence-error',
        preview: emptyPreview,
        error: 'raw persistence detail',
      }).success,
    ).toBe(false)
  })
})
