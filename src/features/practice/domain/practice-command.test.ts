import { describe, expect, it } from 'vitest'
import {
  acceptedPracticeReviewCommandSchema,
  fingerprintPracticeReviewCommand,
  type AcceptedPracticeReviewCommand,
} from './practice-command'
import {
  practiceSaveReviewResultRequestSchema,
  practiceOverrideLastReviewResultRequestSchema,
  practiceReviewCommandResultSchema,
} from '../api/practice-contracts'

const command: AcceptedPracticeReviewCommand = {
  operation: 'save',
  commandId: 'one',
  problemSlug: 'two-sum',
  generation: { localGenerationToken: 'local', problemGenerationToken: null },
  reviewedAt: '2026-01-01T10:00:00.000Z',
  rating: 'good',
  reviewMode: 'leetcode',
}

describe('accepted command contracts and fingerprints', () => {
  it('requires strict command identity, generation and canonical review time', () => {
    const { operation: _operation, ...request } = command
    void _operation
    expect(
      practiceSaveReviewResultRequestSchema.safeParse({
        ...request,
        surface: 'content-script',
      }).success,
    ).toBe(true)
    for (const key of ['commandId', 'generation', 'reviewedAt']) {
      const invalid = {
        ...request,
        surface: 'content-script',
        [key]: undefined,
      }
      expect(
        practiceSaveReviewResultRequestSchema.safeParse(invalid).success,
      ).toBe(false)
    }
    expect(
      acceptedPracticeReviewCommandSchema.safeParse({
        ...command,
        reviewedAt: '2026-01-01T10:00:00Z',
      }).success,
    ).toBe(false)
    expect(
      acceptedPracticeReviewCommandSchema.safeParse({
        ...command,
        surface: 'popup',
      }).success,
    ).toBe(false)
    const { reviewMode: _mode, ...update } = request
    void _mode
    expect(
      practiceOverrideLastReviewResultRequestSchema.safeParse({
        ...update,
        surface: 'content-script',
        targetAttemptId: 'attempt',
        expectedRevision: 0,
      }).success,
    ).toBe(true)
    expect(
      practiceOverrideLastReviewResultRequestSchema.safeParse({
        ...update,
        surface: 'content-script',
      }).success,
    ).toBe(false)
  })
  it('hashes fixed-order semantic fields, preserving omitted versus null patches', async () => {
    const base = await fingerprintPracticeReviewCommand(command)
    expect(base).toMatch(/^[a-f0-9]{64}$/)
    expect(
      await fingerprintPracticeReviewCommand({
        ...command,
        commandId: 'another',
      }),
    ).toBe(base)
    expect(
      await fingerprintPracticeReviewCommand({
        ...command,
        log: { notes: 'note', languages: 'TypeScript' },
      }),
    ).toBe(
      await fingerprintPracticeReviewCommand({
        ...command,
        log: { languages: 'TypeScript', notes: 'note' },
      }),
    )
    for (const patch of [
      { elapsedSeconds: null },
      { isCorrect: null },
      { log: {} },
      { log: { notes: null } },
      { reviewMode: 'manual' as const },
      {
        generation: {
          ...command.generation,
          problemGenerationToken: 'problem',
        },
      },
      { problemSlug: '3sum' },
      { rating: 'hard' as const },
    ])
      expect(
        await fingerprintPracticeReviewCommand({ ...command, ...patch }),
      ).not.toBe(base)
    const { reviewMode: _mode, ...fields } = command
    void _mode
    const update = {
      ...fields,
      operation: 'update' as const,
      targetAttemptId: 'one',
      expectedRevision: 0,
    }
    expect(await fingerprintPracticeReviewCommand(update)).not.toBe(base)
    expect(
      await fingerprintPracticeReviewCommand({
        ...update,
        expectedRevision: 1,
      }),
    ).not.toBe(await fingerprintPracticeReviewCommand(update))
    expect(
      await fingerprintPracticeReviewCommand({
        ...update,
        targetAttemptId: 'two',
      }),
    ).not.toBe(await fingerprintPracticeReviewCommand(update))
  })
  it('rejects unbounded or incomplete command results', () => {
    expect(
      practiceReviewCommandResultSchema.safeParse({
        status: 'saved',
        current: {},
      }).success,
    ).toBe(false)
    expect(
      practiceReviewCommandResultSchema.safeParse({
        status: 'conflict',
        reason: 'unknown',
        message: 'test',
        current: {},
      }).success,
    ).toBe(false)
  })
})
