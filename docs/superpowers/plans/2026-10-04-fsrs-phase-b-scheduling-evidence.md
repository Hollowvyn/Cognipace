# FSRS Phase B: Complete Scheduling Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing FSRS facade produce exact, immutable scheduling evidence and safe single-event correction calculations while retaining the shipped scheduling behavior.

**Architecture:** Keep native scheduling, parameter normalization and rollback inside `src/lib/fsrs/adapter`; expose feature-facing operations through the existing facade. Store immutable evidence as detached values with ISO dates, reconstruct supported profiles exactly, and separate captured corrections from explicitly estimated legacy corrections. Phase C owns persistence and deduplication; D owns transactional Save/Update integration.

**Tech Stack:** TypeScript, installed ts-fsrs 5.4.0/FSRS-6.0, Vitest, existing SQLite WASM integration tests and WXT. No dependency or permission expansion.

---

## Approval, predecessor and scope

Source: [approved design](../specs/2026-10-03-fsrs-remediation-design.md), especially priorities 2 and 4 and the legacy correction policy. The [execution map](./2026-10-03-fsrs-remediation.md) assigns B audit priority 2 and the internal weights foundation from 7. The user approved moving to this plan after completing A.

Phase A merged in [PR #190](https://github.com/Hollowvyn/Cognipace/pull/190) as `92ba67d5` on October 4, 2026. This plan is based on that `origin/main` commit on `codex/fsrs-phase-b-scheduling-evidence`, reusing the clean managed worktree. Historical Phase A proof remains in its handoff; merging does not manufacture additional smoke or screenshots.

Execution status: **planning only; implementation has not started**. Code blocks below are the new or changed contracts and functions to implement, rather than copies of unaffected source files. Execute each red/green boundary against this predecessor and record concrete repairs in the implementation handoff.

Read `README.md`, `docs/product.md`'s Practice/Queue sections, `docs/architecture.md`'s FSRS and runtime ownership sections, `docs/testing.md`, `CONTRIBUTING.md`, `docs/agent-governance.md` and the planning index before execution. Use the pinned Node 24.20.0/npm 11.19.0; dependencies and generated WXT types are present in this worktree. Fetch and check the working tree before execution; preserve unrelated work and revise this plan if relevant upstream contracts change.

B builds pure library operations. Keep the current `12h`/`23h` learning steps, `23h` relearning step, short-term mode, retention input and disabled fuzz. Existing Save/Update callers remain wired to their current APIs. The daily profile and calendar/queue changes belong to E; previews to F; training to H. Do not change SQL, schema, stored due dates, history, backup format, runtime messages, assessment locks, track credit or sync.

The profile's `source` describes **weight provenance**: `default` means effective upstream default weights for the recorded mode and steps; `custom` means explicitly provided weights after supported normalization. A legacy correction's accepted recipe is known, but its original historical profile remains unknown. C must preserve that distinction instead of assigning fabricated original provenance.

## Library facts that constrain the implementation

Context7 resolved `/open-spaced-repetition/ts-fsrs`; current parameter, scheduler and serialization documentation was fetched separately. Installed declarations, source and runtime probes verified the exact 5.4.0 behavior:

- `FSRSVersion` is `v5.4.0 using FSRS-6.0`. Record library and model versions separately; reject unsupported recorded versions instead of silently changing algorithms.
- `generatorParameters()` fills defaults and migrates supported input weights, but scheduler construction can further clip them. Capture the **final** scheduler parameters. In short-term mode, 17/19-weight inputs generated a zero at index 19, then scheduler construction changed it to `0.01`.
- Explicit generation before construction can also change omitted default weights with multiple relearning steps. Preserve the existing public scheduler construction; resolve new profiles separately into reconstructible effective values, without switching existing callers.
- The effective configuration has seven fields: retention, maximum interval, weights, fuzz, short-term mode and both step arrays. The scheduler exposes them through a Proxy; `structuredClone(scheduler.parameters)` throws. Copy the fields and three arrays explicitly.
- `checkParameters()` rejects unsupported lengths and nonfinite values; parameter generation alone can silently fall back. New configured input supports the library's 17/19/21 migration, while recorded effective profiles require 21 exact weights.
- Native rollback accepts structurally valid earlier logs. Its success does not prove latest identity. A reviewed-card log's `due` stores the prior review instant, and rollback cannot recover that card's original raw due date.
- Same-day reordered application is accepted by native scheduling because elapsed days can still be zero. Sorting those events by review time can break the log chain. Legacy ambiguity must reject before rollback.
- Freezing a `Date` does not disable `setTime()`. Immutable evidence uses ISO strings; decoding returns fresh Dates.

These are API constraints, not a capacity guarantee or permission to implement alternate memory equations. Keep `maximum_interval` as recorded internal configuration; the upstream grade-order behavior does not establish a strict user-facing cap.

## File map and dependency direction

| File                                                                                 | Responsibility                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/lib/fsrs/domain/scheduling-options.ts` and its test                             | Optional internal weights/maximum interval; shipped defaults retained.                                 |
| New `src/lib/fsrs/domain/scheduler-profile.ts` and its test                          | Complete effective value shape, version/source contract and canonical detached representation.         |
| New `src/lib/fsrs/domain/snapshot-validation.ts`                                     | Small shared value/date predicates used by the three codecs.                                           |
| `src/lib/fsrs/domain/card-snapshot.ts` and its test                                  | Centralized existing card validation and ISO-value serialization with fresh Date decoding.             |
| `src/lib/fsrs/domain/review-log-snapshot.ts` and its test                            | Validated, detached log codec retaining native log semantics.                                          |
| `src/lib/fsrs/adapter/ts-fsrs-adapter.ts`                                            | Native parameter capture/exact reconstruction, profile scheduling and inverse-log rollback conversion. |
| `src/lib/fsrs/scheduler/review-scheduler.ts` and its test                            | Public profile wrappers and forwarding new options through projections.                                |
| New `src/lib/fsrs/scheduler/review-correction.ts` and its test                       | Immutable captured context, exact replacement and guarded legacy compatibility.                        |
| `src/lib/fsrs/index.ts` and its test                                                 | Stable public exports; raw adapter conversions remain private.                                         |
| `docs/architecture.md`, execution map, planning index and new implementation handoff | Shipped capabilities, phase status, exact validation and affected human smoke.                         |

Domain value parsing must not import the native adapter. The adapter imports domain types/parsers, and scheduler modules compose those operations; this keeps the existing integration boundary without a circular dependency. Features continue to import only `@/lib/fsrs`. Canonical profile serialization provides C's deduplication basis; B adds no registry, hashing service or persisted IDs.

## Task order

Tasks 1–2 define the complete profile and card/log codecs. Task 3 uses those contracts for captured scheduling/correction. Task 4 adds the bounded legacy compatibility operation. Task 5 completes facade exports, compatibility verification and the handoff. Review specification adherence and code quality at each task boundary before proceeding.

## Task 1: Capture and reconstruct effective scheduler profiles

**Files:** modify `src/lib/fsrs/domain/scheduling-options.ts`, `src/lib/fsrs/adapter/ts-fsrs-adapter.ts`, `src/lib/fsrs/scheduler/review-scheduler.ts`, `src/lib/fsrs/index.ts`, and their existing tests; create `src/lib/fsrs/domain/scheduler-profile.ts` and `src/lib/fsrs/domain/scheduler-profile.test.ts`.

- [ ] **Write these tests first.** Add the new facade names to `index.test.ts`'s existing export assertion. Put profile tests in the new test file (upstream imports are permitted in tests):

```ts
import { describe, expect, it } from 'vitest'
import { default_w, FSRSVersion, fsrs, createEmptyCard, Rating } from 'ts-fsrs'
import {
  createFsrsSchedulerProfile,
  parseFsrsSchedulerProfile,
  serializeFsrsSchedulerProfile,
  parseSerializedFsrsSchedulerProfile,
  createInitialFsrsCard,
  scheduleReview,
  projectReviewSchedule,
} from '..'

const at = new Date('2026-10-04T10:00:00.000Z')
describe('effective FSRS profiles', () => {
  it('records the installed engine and round-trips a detached effective profile', () => {
    const weights = [...default_w]
    const steps = ['12h', '23h'] as const
    const profile = createFsrsSchedulerProfile({
      targetRetention: 0.75,
      maximumInterval: 10,
      weights,
      learningSteps: steps,
    })
    expect(FSRSVersion).toBe(
      `v${profile.libraryVersion} using ${profile.modelVersion}`,
    )
    expect(profile.parameters).toMatchObject({
      targetRetention: 0.75,
      maximumInterval: 10,
      enableShortTerm: true,
      learningSteps: ['12h', '23h'],
      relearningSteps: ['23h'],
    })
    expect(profile.source).toBe('custom')
    weights[0] = 99
    expect(profile.parameters.weights[0]).toBe(default_w[0])
    expect(Object.isFrozen(profile.parameters.weights)).toBe(true)
    expect(
      parseSerializedFsrsSchedulerProfile(
        serializeFsrsSchedulerProfile(profile),
      ),
    ).toEqual(profile)
    expect(createFsrsSchedulerProfile().source).toBe('default')
  })
  it.each([17, 19, 21])(
    'captures final normalization for %s weights',
    (length) => {
      const profile = createFsrsSchedulerProfile({
        weights: default_w.slice(0, length),
      })
      expect(profile.parameters.weights).toHaveLength(21)
      if (length < 21) expect(profile.parameters.weights[19]).toBe(0.01)
      expect(parseFsrsSchedulerProfile(profile)).toEqual(profile)
    },
  )
  it('rejects clipped imported weights and false default provenance', () => {
    const profile = createFsrsSchedulerProfile({
      relearningSteps: ['1m', '10m'],
    })
    const weights = [...profile.parameters.weights]
    weights[17] = 99
    expect(() =>
      parseFsrsSchedulerProfile({
        ...profile,
        source: 'custom',
        parameters: { ...profile.parameters, weights },
      }),
    ).toThrow('exactly')
    weights[17] = 0.01
    expect(() =>
      parseFsrsSchedulerProfile({
        ...profile,
        parameters: { ...profile.parameters, weights },
      }),
    ).toThrow('default')
    const signedZero = [...profile.parameters.weights]
    signedZero[8] = -0
    expect(() =>
      parseFsrsSchedulerProfile({
        ...profile,
        source: 'custom',
        parameters: { ...profile.parameters, weights: signedZero },
      }),
    ).toThrow('exactly')
  })
  it('carries internal maximum interval and weights through projection', () => {
    const options = { maximumInterval: 2, weights: [...default_w] }
    const card = createInitialFsrsCard(at)
    const expected = scheduleReview(card, 'easy', at, options)
    expect(
      projectReviewSchedule(card, {
        ...options,
        startAt: at,
        maxReviews: 1,
        assumedRating: 'easy',
      })[0],
    ).toEqual(expected)
    expect(expected.card.scheduledDays).toBeLessThanOrEqual(2)
  })
  it('preserves existing omitted-weight custom-step scheduling', () => {
    const options = { relearningSteps: ['1m', '10m'] } as const
    const native = fsrs({
      request_retention: 0.9,
      enable_fuzz: false,
      enable_short_term: true,
      learning_steps: ['12h', '23h'],
      relearning_steps: ['1m', '10m'],
    })
    let card = createInitialFsrsCard(at)
    let nativeCard = createEmptyCard(at)
    for (const [rating, grade, reviewedAt] of [
      ['easy', Rating.Easy, at],
      ['again', Rating.Again, new Date('2026-10-13T10:00:00.000Z')],
      ['good', Rating.Good, new Date('2026-10-13T10:05:00.000Z')],
    ] as const) {
      card = scheduleReview(card, rating, reviewedAt, options).card
      nativeCard = native.next(nativeCard, reviewedAt, grade).card
      expect([
        card.stability,
        card.difficulty,
        card.dueAt.toISOString(),
      ]).toEqual([
        nativeCard.stability,
        nativeCard.difficulty,
        nativeCard.due.toISOString(),
      ])
    }
    const profile = createFsrsSchedulerProfile(options)
    expect(parseFsrsSchedulerProfile(profile)).toEqual(profile)
    expect(profile.parameters.weights[17]).not.toBe(native.parameters.w[17])
  })
})
```

In `scheduling-options.test.ts`, import `createFsrsSchedulerProfile` from `../scheduler/review-scheduler` and add concrete boundary tests while keeping the existing exact default-shape assertion:

```ts
it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity])(
  'rejects maximum interval %s',
  (maximumInterval) => {
    expect(() => normalizeFsrsSchedulingOptions({ maximumInterval })).toThrow()
  },
)
it.each([
  { weights: [1] },
  { weights: Array.from({ length: 21 }, () => NaN) },
  { weights: Array.from({ length: 21 }, () => Infinity) },
])('rejects invalid model weights', ({ weights }) => {
  expect(() => createFsrsSchedulerProfile({ weights })).toThrow()
})
```

- [ ] **Verify RED.** `rtk npm run test -- src/lib/fsrs/domain/scheduling-options.test.ts src/lib/fsrs/domain/scheduler-profile.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/index.test.ts`. Expected: new facade operations are missing; existing defaults remain green. Missing-export failures are the expected setup for these new APIs; record that evidence without adding artificial production stubs.

- [ ] **Extend configured options without adding copied upstream defaults.** Add optional `weights?: readonly number[] | undefined` and `maximumInterval?: number | undefined` to both scheduling-option interfaces. Change the defaults object's `satisfies` target to `Required<Omit<FsrsSchedulingOptions, 'weights' | 'maximumInterval'>>`. Add these conditional fields to the existing normalization return; the default output retains its current exact shape:

```ts
...(options.weights === undefined ? {} : {
  weights: normalizeWeights(options.weights),
}),
...(options.maximumInterval === undefined ? {} : {
  maximumInterval: normalizeMaximumInterval(options.maximumInterval),
}),
```

```ts
function normalizeWeights(values: readonly number[]): number[] {
  const weights = Array.from(values)
  if (
    !weights.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    throw new Error(
      'Invalid FSRS model weights: all values must be finite numbers.',
    )
  }
  return weights
}
function normalizeMaximumInterval(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      'Invalid FSRS maximum interval: use a positive safe integer.',
    )
  }
  return value
}
```

Add `weights: options.weights` and `maximumInterval: options.maximumInterval` to projection's existing `readSchedulingOptions()` return.

- [ ] **Create the dependency-free profile contract.** `domain/scheduler-profile.ts`:

```ts
import { isFsrsStepUnit, type FsrsStepUnit } from './scheduling-options'

export interface FsrsEffectiveParameters {
  readonly targetRetention: number
  readonly maximumInterval: number
  readonly weights: readonly number[]
  readonly enableFuzz: boolean
  readonly enableShortTerm: boolean
  readonly learningSteps: readonly FsrsStepUnit[]
  readonly relearningSteps: readonly FsrsStepUnit[]
}
export interface FsrsSchedulerProfile {
  readonly schemaVersion: 1
  readonly libraryVersion: '5.4.0'
  readonly modelVersion: 'FSRS-6.0'
  /** Weight provenance; an explicitly supplied vector is custom, even if equal to defaults. */
  readonly source: 'default' | 'custom'
  readonly parameters: FsrsEffectiveParameters
}

/** Structural decoding only; the adapter separately validates exact native reconstruction. */
export function readFsrsSchedulerProfile(value: unknown): FsrsSchedulerProfile {
  const record = (input: unknown): input is Record<string, unknown> =>
    typeof input === 'object' && input !== null && !Array.isArray(input)
  if (
    !record(value) ||
    Object.keys(value).length !== 5 ||
    value.schemaVersion !== 1 ||
    value.libraryVersion !== '5.4.0' ||
    value.modelVersion !== 'FSRS-6.0' ||
    (value.source !== 'default' && value.source !== 'custom') ||
    !record(value.parameters)
  ) {
    throw new Error('Invalid or unsupported FSRS scheduler profile.')
  }
  const p = value.parameters
  const steps = (input: unknown): input is FsrsStepUnit[] =>
    Array.isArray(input) &&
    Array.from(input).every(
      (step) => typeof step === 'string' && isFsrsStepUnit(step),
    )
  if (
    Object.keys(p).length !== 7 ||
    typeof p.targetRetention !== 'number' ||
    !Number.isFinite(p.targetRetention) ||
    p.targetRetention <= 0 ||
    p.targetRetention > 1 ||
    typeof p.maximumInterval !== 'number' ||
    !Number.isSafeInteger(p.maximumInterval) ||
    p.maximumInterval <= 0 ||
    typeof p.enableFuzz !== 'boolean' ||
    typeof p.enableShortTerm !== 'boolean' ||
    !Array.isArray(p.weights) ||
    p.weights.length !== 21 ||
    !Array.from(p.weights).every(
      (weight) => typeof weight === 'number' && Number.isFinite(weight),
    ) ||
    !steps(p.learningSteps) ||
    !steps(p.relearningSteps)
  ) {
    throw new Error('Invalid FSRS effective parameters.')
  }
  return Object.freeze({
    schemaVersion: 1,
    libraryVersion: '5.4.0',
    modelVersion: 'FSRS-6.0',
    source: value.source,
    parameters: Object.freeze({
      targetRetention: p.targetRetention,
      maximumInterval: p.maximumInterval,
      weights: Object.freeze([...p.weights] as number[]),
      enableFuzz: p.enableFuzz,
      enableShortTerm: p.enableShortTerm,
      learningSteps: Object.freeze([...p.learningSteps]),
      relearningSteps: Object.freeze([...p.relearningSteps]),
    }),
  })
}
```

- [ ] **Implement native resolution and exact reconstruction in the existing adapter.** Add upstream imports `checkParameters`, `generatorParameters`, `FSRSVersion`, `type FSRSParameters`; import the profile types and structural reader. Extract its current option mapping into `nativeSchedulerOptions()` and retain direct construction for existing APIs. New profiles deliberately resolve through explicit generation followed by construction:

```ts
function nativeSchedulerOptions(
  options: FsrsSchedulingOptions,
): Partial<FSRSParameters> {
  const normalized = normalizeFsrsSchedulingOptions(options)
  return {
    request_retention: normalized.targetRetention,
    enable_fuzz: normalized.enableFuzz,
    enable_short_term: normalized.enableShortTerm,
    learning_steps: normalized.learningSteps,
    relearning_steps: normalized.relearningSteps,
    ...(normalized.weights === undefined
      ? {}
      : { w: checkParameters(normalized.weights) }),
    ...(normalized.maximumInterval === undefined
      ? {}
      : {
          maximum_interval: normalized.maximumInterval,
        }),
  }
}
function createScheduler(options: FsrsSchedulingOptions) {
  return fsrs(nativeSchedulerOptions(options))
}
export function resolveFsrsSchedulerProfile(
  options: FsrsSchedulingOptions = {},
): FsrsSchedulerProfile {
  if (FSRSVersion !== 'v5.4.0 using FSRS-6.0') {
    throw new Error('Unsupported installed FSRS engine.')
  }
  const p = fsrs(
    generatorParameters(nativeSchedulerOptions(options)),
  ).parameters
  return readFsrsSchedulerProfile({
    schemaVersion: 1,
    libraryVersion: '5.4.0',
    modelVersion: 'FSRS-6.0',
    source: options.weights === undefined ? 'default' : 'custom',
    parameters: {
      targetRetention: p.request_retention,
      maximumInterval: p.maximum_interval,
      weights: [...p.w],
      enableFuzz: p.enable_fuzz,
      enableShortTerm: p.enable_short_term,
      learningSteps: [...p.learning_steps],
      relearningSteps: [...p.relearning_steps],
    },
  })
}
function nativeProfileParameters(p: FsrsEffectiveParameters): FSRSParameters {
  return {
    request_retention: p.targetRetention,
    maximum_interval: p.maximumInterval,
    w: [...p.weights],
    enable_fuzz: p.enableFuzz,
    enable_short_term: p.enableShortTerm,
    learning_steps: [...p.learningSteps],
    relearning_steps: [...p.relearningSteps],
  }
}
function sameValues(
  left: readonly unknown[],
  right: readonly unknown[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  )
}
export function assertExactFsrsSchedulerProfile(
  profile: FsrsSchedulerProfile,
): void {
  const p = readFsrsSchedulerProfile(profile).parameters
  const reconstructed = resolveFsrsSchedulerProfile(p).parameters
  const equal = Object.keys(p).every((key) => {
    const field = key as keyof FsrsEffectiveParameters
    const left = p[field],
      right = reconstructed[field]
    return Array.isArray(left) && Array.isArray(right)
      ? sameValues(left, right)
      : Object.is(left, right)
  })
  if (!equal) throw new Error('FSRS profile does not reconstruct exactly.')
  if (profile.source === 'default') {
    const defaults = resolveFsrsSchedulerProfile({
      targetRetention: p.targetRetention,
      maximumInterval: p.maximumInterval,
      enableFuzz: p.enableFuzz,
      enableShortTerm: p.enableShortTerm,
      learningSteps: p.learningSteps,
      relearningSteps: p.relearningSteps,
    })
    if (!sameValues(p.weights, defaults.parameters.weights)) {
      throw new Error('FSRS default profile has custom model weights.')
    }
  }
}
export function scheduleCardReviewWithProfile(
  card: FsrsCardSnapshot,
  rating: ReviewRating,
  reviewedAt: Date,
  profile: FsrsSchedulerProfile,
): TsFsrsScheduledReview {
  const canonical = readFsrsSchedulerProfile(profile)
  assertExactFsrsSchedulerProfile(canonical)
  const result = fsrs(nativeProfileParameters(canonical.parameters)).next(
    toTsFsrsCard(card),
    reviewedAt,
    toTsFsrsRating(rating),
  )
  return {
    card: fromTsFsrsCard(result.card),
    log: fromTsFsrsReviewLog(result.log),
  }
}
```

`resolveFsrsSchedulerProfile(p)` treats its supplied effective weights as custom during comparison; it does not relabel the imported profile. Every created profile is copied/frozen before escaping. The new profile path can normalize omitted weights differently for multiple relearning steps; it makes that effective configuration explicit and reconstructible. Existing `scheduleReview`, replay, retrievability and projection paths retain direct construction and their supported behavior. `nativeProfileParameters()` remains adapter-private; Task 4 may reuse it there.

- [ ] **Expose exact profile codecs through the existing scheduler facade.** Add imports for the domain reader/types and the adapter resolve/assert functions, then:

```ts
export function createFsrsSchedulerProfile(
  options: FsrsSchedulingOptions = {},
): FsrsSchedulerProfile {
  return resolveFsrsSchedulerProfile(options)
}
export function parseFsrsSchedulerProfile(
  value: unknown,
): FsrsSchedulerProfile {
  const profile = readFsrsSchedulerProfile(value)
  assertExactFsrsSchedulerProfile(profile)
  return profile
}
export function serializeFsrsSchedulerProfile(
  profile: FsrsSchedulerProfile,
): string {
  return JSON.stringify(parseFsrsSchedulerProfile(profile))
}
export function parseSerializedFsrsSchedulerProfile(
  value: string,
): FsrsSchedulerProfile {
  return parseFsrsSchedulerProfile(JSON.parse(value))
}
```

Export these four functions and both profile types from `index.ts`. No feature/runtime/storage call sites switch to new evidence yet.

- [ ] **Verify GREEN and commit.** Expected: existing learning/relearning output tests and new profile tests pass.

```sh
rtk npx prettier --write src/lib/fsrs/domain/scheduling-options.ts src/lib/fsrs/domain/scheduling-options.test.ts src/lib/fsrs/domain/scheduler-profile.ts src/lib/fsrs/domain/scheduler-profile.test.ts src/lib/fsrs/adapter/ts-fsrs-adapter.ts src/lib/fsrs/scheduler/review-scheduler.ts src/lib/fsrs/index.ts src/lib/fsrs/index.test.ts
rtk npm run test -- src/lib/fsrs/domain/scheduling-options.test.ts src/lib/fsrs/domain/scheduler-profile.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/index.test.ts
rtk npm run typecheck
rtk git diff --check
rtk git add src/lib/fsrs/domain/scheduling-options.ts src/lib/fsrs/domain/scheduling-options.test.ts src/lib/fsrs/domain/scheduler-profile.ts src/lib/fsrs/domain/scheduler-profile.test.ts src/lib/fsrs/adapter/ts-fsrs-adapter.ts src/lib/fsrs/scheduler/review-scheduler.ts src/lib/fsrs/index.ts src/lib/fsrs/index.test.ts
rtk git commit -m "feat(fsrs): capture reproducible effective scheduler profiles"
```

## Task 2: Add detached card codecs and strengthen stored-log validation

**Files:** modify `src/lib/fsrs/domain/card-snapshot.ts`, `src/lib/fsrs/domain/review-log-snapshot.ts`, `src/lib/fsrs/adapter/ts-fsrs-adapter.ts`, `src/lib/fsrs/index.ts`, and their tests; create `src/lib/fsrs/domain/snapshot-validation.ts`.

- [ ] **Write failing round-trip and rejection tests.** Append to the existing card and log suites; add imports for the referenced functions. The log tests retain the existing `createReviewLogSnapshot()` fixture.

```ts
it('round-trips valid New zeros/null without retaining mutable Dates', () => {
  const card = createInitialFsrsCard(new Date('2026-10-04T10:00:00.000Z'))
  const serialized = toSerializableFsrsCardSnapshot(card)
  const parsed = parseSerializedFsrsCardSnapshot(
    serializeFsrsCardSnapshot(card),
  )
  expect(parsed).toEqual(card)
  expect(parsed.dueAt).not.toBe(card.dueAt)
  expect(serialized.lastReviewAt).toBeNull()
  expect(
    parseFsrsCardSnapshot({ ...serialized, metadata: { owner: 'caller' } }),
  ).not.toHaveProperty('metadata')
  card.dueAt.setUTCFullYear(2030)
  expect(serialized.dueAt).toBe('2026-10-04T10:00:00.000Z')
  expect(Object.isFrozen(serialized)).toBe(true)
})
it.each([
  { state: 'invalid' },
  { dueAt: '2026-10-04' },
  { reps: -1 },
  { lapses: 1 },
  { scheduledDays: 0.5 },
  { stability: NaN },
  { state: 'review', lastReviewAt: null },
])('rejects malformed card values %j', (change) => {
  const card = toSerializableFsrsCardSnapshot(createInitialFsrsCard())
  expect(() => parseFsrsCardSnapshot({ ...card, ...change })).toThrow()
})
it('detaches parsed logs and rejects negative or fractional counters', () => {
  const input = createReviewLogSnapshot()
  const parsed = parseFsrsReviewLogSnapshot(input)
  input.learningSteps = 9
  expect(parsed.learningSteps).toBe(1)
  expect(Object.isFrozen(parsed)).toBe(true)
  for (const field of [
    'elapsedDays',
    'lastElapsedDays',
    'scheduledDays',
    'learningSteps',
  ]) {
    expect(isFsrsReviewLogSnapshot({ ...parsed, [field]: -1 })).toBe(false)
    expect(isFsrsReviewLogSnapshot({ ...parsed, [field]: 0.5 })).toBe(false)
  }
  expect(
    parseFsrsReviewLogSnapshot({
      ...parsed,
      state: 'new',
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      lastElapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
    }),
  ).toMatchObject({ state: 'new' })
})
```

- [ ] **Verify RED.** `rtk npm run test -- src/lib/fsrs/domain/card-snapshot.test.ts src/lib/fsrs/domain/review-log-snapshot.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/index.test.ts`. Observe missing codecs, mutable parsed logs and accepted negative/fractional counters. Missing-export failures are the expected setup for the new codecs; do not introduce artificial stubs.

- [ ] **Create four local validation helpers.** Move the existing canonical ISO check out of the log module; these helpers stay specific and unexported from the public barrel:

```ts
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function isCanonicalIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
```

- [ ] **Move existing card validation, preserving existing messages.** Move `validateCardSnapshot()` and its three assertion helpers from `adapter/ts-fsrs-adapter.ts` into `domain/card-snapshot.ts`; rename/export its declaration as `assertValidFsrsCardSnapshot()`. Keep its current checks/messages, change its integer helper from `Number.isInteger` to `Number.isSafeInteger`, and add the following checks at the start/end respectively. Do not require positive New stability/difficulty, guess raw due semantics, or reject extra record fields:

```ts
parseFsrsCardState(snapshot.state)
```

```ts
if (snapshot.lapses > snapshot.reps) {
  throw new Error('Invalid FSRS card snapshot: lapses cannot exceed reps.')
}
```

Update the adapter import and replace both existing `validateCardSnapshot()` calls with `assertValidFsrsCardSnapshot()`. Add these card codec definitions to the domain file (import `isRecord` and `isCanonicalIsoDateString`):

```ts
export type FsrsSerializedCardSnapshot = Readonly<
  Omit<FsrsCardSnapshot, 'dueAt' | 'lastReviewAt'> & {
    dueAt: string
    lastReviewAt: string | null
  }
>

export function toSerializableFsrsCardSnapshot(
  card: FsrsCardSnapshot,
): FsrsSerializedCardSnapshot {
  assertValidFsrsCardSnapshot(card)
  return Object.freeze({
    dueAt: card.dueAt.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReviewAt: card.lastReviewAt?.toISOString() ?? null,
  })
}
export function parseFsrsCardSnapshot(value: unknown): FsrsCardSnapshot {
  if (
    !isRecord(value) ||
    !isCanonicalIsoDateString(value.dueAt) ||
    !(
      value.lastReviewAt === null ||
      isCanonicalIsoDateString(value.lastReviewAt)
    )
  ) {
    throw new Error('Invalid serialized FSRS card snapshot.')
  }
  const card = {
    dueAt: new Date(value.dueAt),
    stability: value.stability,
    difficulty: value.difficulty,
    elapsedDays: value.elapsedDays,
    scheduledDays: value.scheduledDays,
    learningSteps: value.learningSteps,
    reps: value.reps,
    lapses: value.lapses,
    state: value.state,
    lastReviewAt:
      value.lastReviewAt === null ? null : new Date(value.lastReviewAt),
  } as unknown as FsrsCardSnapshot
  assertValidFsrsCardSnapshot(card)
  return card
}
export function serializeFsrsCardSnapshot(card: FsrsCardSnapshot): string {
  return JSON.stringify(toSerializableFsrsCardSnapshot(card))
}
export function parseSerializedFsrsCardSnapshot(
  value: string,
): FsrsCardSnapshot {
  return parseFsrsCardSnapshot(JSON.parse(value))
}
```

- [ ] **Strengthen the existing log codec without altering its wire keys.** Import the four shared helpers and remove its old local record/date helpers. In `isFsrsReviewLogSnapshot()`, replace stability/difficulty finite checks with `isNonNegativeNumber`; replace all four counter finite checks with `isNonNegativeInteger`; replace both date checks with `isCanonicalIsoDateString`. Replace the parser and serializer bodies:

```ts
export function parseFsrsReviewLogSnapshot(
  value: unknown,
): FsrsReviewLogSnapshot {
  if (!isFsrsReviewLogSnapshot(value))
    throw new Error('Invalid FSRS review log snapshot.')
  return Object.freeze({
    rating: value.rating,
    state: value.state,
    dueAt: value.dueAt,
    stability: value.stability,
    difficulty: value.difficulty,
    elapsedDays: value.elapsedDays,
    lastElapsedDays: value.lastElapsedDays,
    scheduledDays: value.scheduledDays,
    learningSteps: value.learningSteps,
    reviewedAt: value.reviewedAt,
  })
}
export function serializeFsrsReviewLogSnapshot(
  log: FsrsReviewLogSnapshot,
): string {
  return JSON.stringify(parseFsrsReviewLogSnapshot(log))
}
```

The log's `dueAt` remains the library's `last_review || due`; do not compare it blindly to a card's raw `dueAt`. Add the four public card functions (`parseFsrsCardSnapshot`, `parseSerializedFsrsCardSnapshot`, `serializeFsrsCardSnapshot`, `toSerializableFsrsCardSnapshot`) and `FsrsSerializedCardSnapshot` to `index.ts` and its export test. `assertValidFsrsCardSnapshot` remains a domain export for the adapter; keep it private from the public barrel. Replace Task 1's profile-local `record` helper with imported `isRecord`; no larger validation layer is needed.

- [ ] **Verify GREEN and commit.** Expected: malformed inputs reject, all existing scheduler tests and New zero/null round trips pass.

```sh
rtk npx prettier --write src/lib/fsrs/domain/card-snapshot.ts src/lib/fsrs/domain/card-snapshot.test.ts src/lib/fsrs/domain/review-log-snapshot.ts src/lib/fsrs/domain/review-log-snapshot.test.ts src/lib/fsrs/domain/snapshot-validation.ts src/lib/fsrs/domain/scheduler-profile.ts src/lib/fsrs/adapter/ts-fsrs-adapter.ts src/lib/fsrs/index.ts src/lib/fsrs/index.test.ts
rtk npm run test -- src/lib/fsrs/domain/card-snapshot.test.ts src/lib/fsrs/domain/review-log-snapshot.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/index.test.ts
rtk npm run typecheck
rtk git diff --check
rtk git add src/lib/fsrs/domain/card-snapshot.ts src/lib/fsrs/domain/card-snapshot.test.ts src/lib/fsrs/domain/review-log-snapshot.ts src/lib/fsrs/domain/review-log-snapshot.test.ts src/lib/fsrs/domain/snapshot-validation.ts src/lib/fsrs/domain/scheduler-profile.ts src/lib/fsrs/adapter/ts-fsrs-adapter.ts src/lib/fsrs/index.ts src/lib/fsrs/index.test.ts
rtk git commit -m "feat(fsrs): add immutable card and review log codecs"
```

## Task 3: Capture immutable single-review context and correct from it

**Files:** modify `src/lib/fsrs/scheduler/review-scheduler.ts`; create `src/lib/fsrs/scheduler/review-correction.ts` and `review-correction.test.ts`. Depends on Tasks 1–2. Task 1 already supplies `scheduleCardReviewWithProfile`; do not duplicate it. Keep existing `scheduleReview`, replay, projection and feature consumers unchanged.

- [ ] **Step 1: Red:** add the captured-context tests below, then run:

```sh
rtk npm run test -- src/lib/fsrs/scheduler/review-correction.test.ts
```

Expected: missing correction/profile scheduling exports, then assertions fail until context and correction are implemented. Confirm failure reflects the intended missing behavior.

- [ ] **Step 2: Implement:** define these context types in the new correction module. The scheduler imports them with `import type`, so the correction module can import scheduler functions without a runtime cycle.

```ts
import {
  parseFsrsCardSnapshot,
  type FsrsSerializedCardSnapshot,
} from '../domain/card-snapshot'
import type { FsrsSchedulerProfile } from '../domain/scheduler-profile'
import type { ReviewRating } from '../domain/review-rating'
import {
  scheduleReviewWithProfile,
  type FsrsScheduledReview,
} from './review-scheduler'

export interface FsrsReviewContext {
  readonly preCard: FsrsSerializedCardSnapshot
  readonly reviewedAt: string
  readonly profile: FsrsSchedulerProfile
}
```

Add `scheduleReviewWithProfile` to `review-scheduler.ts`, using its existing rating/card/result types and Task 1 profile parser. Add imports for `toSerializableFsrsCardSnapshot`, `parseFsrsCardSnapshot`, `scheduleCardReviewWithProfile`, and the context type.

```ts
export function scheduleReviewWithProfile(
  card: FsrsCardSnapshot,
  rating: ReviewRating,
  reviewedAt: Date,
  inputProfile: FsrsSchedulerProfile,
): FsrsScheduledReview & { readonly context: FsrsReviewContext } {
  const preCard = toSerializableFsrsCardSnapshot(card)
  if (!(reviewedAt instanceof Date) || !Number.isFinite(reviewedAt.getTime())) {
    throw new Error('Invalid FSRS review time.')
  }
  if (card.lastReviewAt && reviewedAt.getTime() < card.lastReviewAt.getTime()) {
    throw new Error('FSRS review time precedes the captured last review.')
  }
  const profile = parseFsrsSchedulerProfile(inputProfile)
  const context: FsrsReviewContext = Object.freeze({
    preCard,
    reviewedAt: reviewedAt.toISOString(),
    profile,
  })
  const scheduled = scheduleCardReviewWithProfile(
    parseFsrsCardSnapshot(preCard),
    rating,
    new Date(context.reviewedAt),
    profile,
  )
  return {
    ...scheduled,
    rating,
    reviewedAt: new Date(context.reviewedAt),
    context,
  }
}
```

Add the pure captured correction to `review-correction.ts` (imports from scheduler plus Task 2 card decoder). The context stores no mutable Date references; profile/card codecs clone and freeze nested serializable values. New review times equal to the prior time remain supported; durable sequence/identity belongs to D.

```ts
export function correctReviewFromEvidence(
  context: FsrsReviewContext,
  replacementRating: ReviewRating,
): FsrsScheduledReview & { readonly context: FsrsReviewContext } {
  const reviewedAt = new Date(context.reviewedAt)
  if (
    typeof context.reviewedAt !== 'string' ||
    !Number.isFinite(reviewedAt.getTime()) ||
    reviewedAt.toISOString() !== context.reviewedAt
  ) {
    throw new Error('Invalid FSRS review context time.')
  }
  return scheduleReviewWithProfile(
    parseFsrsCardSnapshot(context.preCard),
    replacementRating,
    reviewedAt,
    context.profile,
  )
}
```

- [ ] **Step 3: Meaningful captured tests:** start `review-correction.test.ts` with these imports and fixtures. Add the legacy helper and entry-type imports in Task 4, after those operations exist:

```ts
import { expect, it } from 'vitest'
import { fsrs, createEmptyCard, Rating, State, type Card } from 'ts-fsrs'
import type { FsrsCardSnapshot } from '../domain/card-snapshot'
import type { FsrsSchedulerProfile } from '../domain/scheduler-profile'
import type { ReviewRating } from '../domain/review-rating'
import {
  createInitialFsrsCard,
  createFsrsSchedulerProfile,
  scheduleReview,
  scheduleReviewWithProfile,
} from './review-scheduler'
import { correctReviewFromEvidence } from './review-correction'

const firstAt = new Date('2026-01-01T10:00:00.000Z')
const secondAt = new Date('2026-01-10T10:00:00.000Z')
const legacy75 = {
  targetRetention: 0.75,
  maximumInterval: 36_500,
  enableFuzz: false,
  enableShortTerm: true,
  learningSteps: ['12h', '23h'],
  relearningSteps: ['23h'],
} as const
const profile75 = createFsrsSchedulerProfile(legacy75)
const native75 = fsrs({
  request_retention: 0.75,
  maximum_interval: 36_500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['12h', '23h'],
  relearning_steps: ['23h'],
})

it.each([
  ['again', Rating.Again],
  ['hard', Rating.Hard],
  ['good', Rating.Good],
  ['easy', Rating.Easy],
] as const)(
  'corrects %s from original 75% context after retention changes',
  (rating, grade) => {
    const preCard = scheduleReview(
      createInitialFsrsCard(firstAt),
      'easy',
      firstAt,
      legacy75,
    ).card
    const saved = scheduleReviewWithProfile(
      preCard,
      'good',
      secondAt,
      profile75,
    )
    const before = JSON.stringify(saved.context)
    const active90 = createFsrsSchedulerProfile({
      ...legacy75,
      targetRetention: 0.9,
    })
    expect(active90.parameters.targetRetention).toBe(0.9)
    const corrected = correctReviewFromEvidence(saved.context, rating)
    const nativePre = native75.next(
      createEmptyCard(firstAt),
      firstAt,
      Rating.Easy,
    ).card
    const expected = native75.next(nativePre, secondAt, grade)
    expectNativeCard(corrected.card, expected.card)
    expect(corrected.log.rating).toBe(rating)
    expect(corrected.log.reviewedAt).toBe(secondAt.toISOString())
    expect(corrected.context.profile.parameters.targetRetention).toBe(0.75)
    expect(JSON.stringify(saved.context)).toBe(before)
    expect(correctReviewFromEvidence(saved.context, rating)).toEqual(corrected)
    const alternate = correctReviewFromEvidence(saved.context, 'again')
    expect(correctReviewFromEvidence(alternate.context, rating)).toEqual(
      corrected,
    )
    expect(corrected.card.reps).toBe(preCard.reps + 1)
  },
)

it('captures detached dates and freezes serialized context', () => {
  const at = new Date(firstAt)
  const card = createInitialFsrsCard(at)
  const saved = scheduleReviewWithProfile(card, 'good', at, profile75)
  const before = JSON.stringify(saved.context)
  at.setFullYear(2040)
  card.dueAt.setFullYear(2041)
  expect(JSON.stringify(saved.context)).toBe(before)
  expect(Object.isFrozen(saved.context)).toBe(true)
  expect(Object.isFrozen(saved.context.preCard)).toBe(true)
  expect(Object.isFrozen(saved.context.profile.parameters.weights)).toBe(true)
  expect(saved.context.preCard.lastReviewAt).toBeNull()
})

it('rejects invalid original time/profile and keeps the captured value intact', () => {
  const saved = scheduleReviewWithProfile(
    createInitialFsrsCard(firstAt),
    'good',
    firstAt,
    profile75,
  )
  const before = JSON.stringify(saved.context)
  expect(() =>
    correctReviewFromEvidence(
      { ...saved.context, reviewedAt: '2026-01-01' },
      'easy',
    ),
  ).toThrow()
  expect(() =>
    correctReviewFromEvidence(
      {
        ...saved.context,
        profile: {
          ...profile75,
          libraryVersion: 'unsupported',
        } as unknown as FsrsSchedulerProfile,
      },
      'easy',
    ),
  ).toThrow()
  expect(() =>
    scheduleReviewWithProfile(
      saved.card,
      'good',
      new Date('2025-12-31T10:00:00.000Z'),
      profile75,
    ),
  ).toThrow('precedes')
  expect(JSON.stringify(saved.context)).toBe(before)
})

function expectNativeCard(actual: FsrsCardSnapshot, expected: Card) {
  expect([
    actual.dueAt.toISOString(),
    actual.stability,
    actual.difficulty,
    actual.elapsedDays,
    actual.scheduledDays,
    actual.learningSteps,
    actual.reps,
    actual.lapses,
    actual.state,
    actual.lastReviewAt?.toISOString() ?? null,
  ]).toEqual([
    expected.due.toISOString(),
    expected.stability,
    expected.difficulty,
    expected.elapsed_days,
    expected.scheduled_days,
    expected.learning_steps,
    expected.reps,
    expected.lapses,
    State[expected.state].toLowerCase(),
    expected.last_review?.toISOString() ?? null,
  ])
}
```

Task 4's state table below completes New/Learning/Relearning coverage without hand-calculated memory assertions.

- [ ] **Step 4: Green/commit:**

```sh
rtk npm run test -- src/lib/fsrs/scheduler/review-correction.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts
rtk proxy npx prettier --write src/lib/fsrs/scheduler/review-scheduler.ts src/lib/fsrs/scheduler/review-correction.ts src/lib/fsrs/scheduler/review-correction.test.ts
rtk proxy git add src/lib/fsrs/scheduler/review-scheduler.ts src/lib/fsrs/scheduler/review-correction.ts src/lib/fsrs/scheduler/review-correction.test.ts
rtk proxy git commit -m 'feat(fsrs): capture reproducible single-review context'
```

## Task 4: Guard native latest-legacy rollback and label compatibility results

**Files:** modify `src/lib/fsrs/adapter/ts-fsrs-adapter.ts`, `scheduler/review-correction.ts`, and `scheduler/review-correction.test.ts`. No feature wiring. The caller must eventually supply complete owned history in the approved inferred legacy order (`reviewedAt,id`), and independently guard attempt ID/revision/latest identity inside Practice D's transaction. This fallback does not prove original arrival order; the log-chain and tied/reordered guards below must still reject ambiguity. Passing only the apparent latest event is insufficient.

- [ ] **Step 1: Red:** add the legacy tests below and run:

```sh
rtk npm run test -- src/lib/fsrs/scheduler/review-correction.test.ts
```

Expected: missing compatibility helper, then guard/provenance assertions fail. A native rollback succeeding is explicitly demonstrated before the rejected earlier-log assertion.

- [ ] **Step 2: Native bridge:** adapter imports `parseFsrsReviewLogSnapshot`; add these operations, keeping raw adapter functions out of `index.ts` exports.

```ts
export function rollbackCardReview(
  card: FsrsCardSnapshot,
  log: FsrsReviewLogSnapshot,
): FsrsCardSnapshot {
  const parsed = parseFsrsReviewLogSnapshot(log)
  return fromTsFsrsCard(
    fsrs().rollback(toTsFsrsCard(card), {
      rating: toTsFsrsRating(parsed.rating),
      state: toTsFsrsState(parsed.state),
      due: new Date(parsed.dueAt),
      stability: parsed.stability,
      difficulty: parsed.difficulty,
      elapsed_days: parsed.elapsedDays,
      last_elapsed_days: parsed.lastElapsedDays,
      scheduled_days: parsed.scheduledDays,
      learning_steps: parsed.learningSteps,
      review: new Date(parsed.reviewedAt),
    }),
  )
}
```

- [ ] **Step 3: Compatibility operation:** in `review-correction.ts`, import card assertion, log parser/types, native rollback and profile scheduling, and public profile factory. Returned profile is the known correction recipe; no captured-original context is returned, and original profile remains explicitly unknown.

```ts
export interface FsrsLegacyReviewEntry {
  readonly reviewedAt: Date
  readonly rating: ReviewRating
  readonly log: FsrsReviewLogSnapshot | null
}

export function correctLegacyReview(
  card: FsrsCardSnapshot,
  history: readonly FsrsLegacyReviewEntry[],
  rating: ReviewRating,
  capturedTargetRetention: number,
): FsrsScheduledReview & {
  readonly evidence: 'legacy-derived'
  readonly profile: FsrsSchedulerProfile
  readonly originalProfile: null
} {
  assertValidFsrsCardSnapshot(card)
  const latest = history.at(-1)
  if (!latest || card.reps !== history.length) rejectLegacyCorrection()
  const logs = history.map((entry, index) => {
    const log = parseFsrsReviewLogSnapshot(entry.log)
    const previous = history[index - 1]
    if (
      !(entry.reviewedAt instanceof Date) ||
      !Number.isFinite(entry.reviewedAt.getTime()) ||
      log.reviewedAt !== entry.reviewedAt.toISOString() ||
      log.rating !== entry.rating ||
      (index === 0 ? log.state !== 'new' : log.state === 'new') ||
      (previous &&
        (entry.reviewedAt.getTime() <= previous.reviewedAt.getTime() ||
          log.dueAt !== previous.reviewedAt.toISOString()))
    )
      rejectLegacyCorrection()
    return log
  })
  const latestLog = logs.at(-1)!
  const observedLapses = logs.filter(
    (log) => log.state === 'review' && log.rating === 'again',
  ).length
  if (
    card.lastReviewAt?.getTime() !== latest.reviewedAt.getTime() ||
    card.elapsedDays !== latestLog.elapsedDays ||
    card.lapses !== observedLapses
  )
    rejectLegacyCorrection()
  const profile = createFsrsSchedulerProfile({
    targetRetention: capturedTargetRetention,
    maximumInterval: 36_500,
    enableFuzz: false,
    enableShortTerm: true,
    learningSteps: ['12h', '23h'],
    relearningSteps: ['23h'],
  })
  const preCard = rollbackCardReview(card, latestLog)
  const eventAt = new Date(latest.reviewedAt)
  const diagnostic = scheduleCardReviewWithProfile(
    preCard,
    latest.rating,
    eventAt,
    profile,
  ).card
  const invariantFields = [
    'stability',
    'difficulty',
    'elapsedDays',
    'learningSteps',
    'reps',
    'lapses',
    'state',
  ] as const
  if (invariantFields.some((field) => diagnostic[field] !== card[field]))
    rejectLegacyCorrection()
  const scheduled = scheduleCardReviewWithProfile(
    preCard,
    rating,
    eventAt,
    profile,
  )
  return {
    ...scheduled,
    rating,
    reviewedAt: new Date(latest.reviewedAt),
    evidence: 'legacy-derived',
    profile,
    originalProfile: null,
  }
}

function rejectLegacyCorrection(): never {
  throw new Error('Unsupported or ambiguous legacy FSRS correction evidence.')
}
```

The original-rating diagnostic is required, not optional: it verifies saved-card memory/counters/state against the matching log under the known historical memory recipe. It deliberately excludes raw due/scheduled days, which depend on unknown original retention. It never replays history. Lapse count from actual log states/ratings prevents upstream rollback clamping negative counters into apparent success. The final replacement still applies exactly one event from recovered pre-memory. Native 5.4.0's lost prior due is never advertised as captured original evidence.

- [ ] **Step 4: Legacy tests:** append these to the same test module. `legacyHistory` preserves input application order; do not sort the helper.

```ts
function legacyHistory(
  times = [firstAt, secondAt, new Date('2026-01-20T10:00:00.000Z')],
  ratings: readonly ReviewRating[] = ['easy', 'good', 'again'],
) {
  let card = createInitialFsrsCard(times[0])
  const history: FsrsLegacyReviewEntry[] = []
  for (const [index, at] of times.entries()) {
    const result = scheduleReview(card, ratings[index]!, at, legacy75)
    history.push({ reviewedAt: at, rating: result.rating, log: result.log })
    card = result.card
  }
  return { card, history }
}

it('corrects verified latest memory with an explicitly unknown original profile', () => {
  const { card, history } = legacyHistory()
  const corrected = correctLegacyReview(card, history, 'easy', 0.9)
  const nativeA = native75.next(createEmptyCard(firstAt), firstAt, Rating.Easy)
  const nativeB = native75.next(nativeA.card, secondAt, Rating.Good)
  const at = history[2]!.reviewedAt
  const nativeC = native75.next(nativeB.card, at, Rating.Again)
  const recovered = native75.rollback(nativeC.card, nativeC.log)
  expect(recovered.due).not.toEqual(nativeB.card.due)
  const expected = fsrs({
    ...native75.parameters,
    request_retention: 0.9,
  }).next(recovered, at, Rating.Easy)
  expectNativeCard(corrected.card, expected.card)
  expect(corrected.card.lapses).toBe(0)
  expect(corrected).toMatchObject({
    evidence: 'legacy-derived',
    originalProfile: null,
  })
  expect(corrected).not.toHaveProperty('context')
  expect(corrected.profile.parameters.targetRetention).toBe(0.9)
})

it('rejects an earlier valid log even though native rollback accepts it', () => {
  const { card, history } = legacyHistory()
  expect(() => rollbackCardReview(card, history[1]!.log!)).not.toThrow()
  const replaced = history.map((event, index) =>
    index === 2 ? { ...event, log: history[1]!.log } : event,
  )
  const before = JSON.stringify({ card, replaced })
  expect(() => correctLegacyReview(card, replaced, 'easy', 0.9)).toThrow()
  expect(JSON.stringify({ card, replaced })).toBe(before)
})

it('rejects tied and reordered histories in original and sorted order without mutation', () => {
  for (const hours of [
    [10, 10, 14],
    [10, 18, 14],
  ]) {
    const times = hours.map((hour) => new Date(`2026-01-01T${hour}:00:00.000Z`))
    const { card, history } = legacyHistory(times, ['again', 'hard', 'good'])
    const before = JSON.stringify({ card, history })
    expect(() => correctLegacyReview(card, history, 'easy', 0.9)).toThrow()
    expect(() =>
      correctLegacyReview(
        card,
        history.toSorted(
          (a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime(),
        ),
        'easy',
        0.9,
      ),
    ).toThrow()
    expect(JSON.stringify({ card, history })).toBe(before)
  }
})

it('rejects missing, incomplete and inconsistent saved evidence without mutation', () => {
  const { card, history } = legacyHistory()
  const before = JSON.stringify({ card, history })
  const missing = history.map((event, index) =>
    index === 2 ? { ...event, log: null } : event,
  )
  for (const [candidateCard, entries] of [
    [card, []],
    [card, history.slice(1)],
    [card, missing],
    [{ ...card, lapses: 0 }, history],
    [{ ...card, stability: card.stability + 1 }, history],
    [{ ...card, lastReviewAt: secondAt }, history],
  ] as const)
    expect(() =>
      correctLegacyReview(candidateCard, entries, 'easy', 0.9),
    ).toThrow()
  expect(JSON.stringify({ card, history })).toBe(before)
})
```

Test-only imports include `rollbackCardReview` from the private adapter, `FsrsLegacyReviewEntry` from correction, and required rating/profile types. Append the following table to complete New/Learning/Relearning positive cases and equal-time captured context. The last pair is the original event being replaced; each preceding pair builds its pre-card. All legacy event times in this table are distinct. The explicit equal-time captured review uses trustworthy evidence and is supported, while tied legacy evidence rejects above.

```ts
it.each([
  [['easy', Rating.Easy]],
  [
    ['again', Rating.Again],
    ['again', Rating.Again],
  ],
  [
    ['easy', Rating.Easy],
    ['again', Rating.Again],
    ['again', Rating.Again],
  ],
] as const)(
  'supports captured and verified legacy state transitions',
  (...pairs) => {
    let card = createInitialFsrsCard(firstAt)
    let nativeCard = createEmptyCard(firstAt)
    const history: FsrsLegacyReviewEntry[] = []
    for (const [index, pair] of pairs.entries()) {
      const at = new Date(firstAt.getTime() + index * 86_400_000)
      const saved = scheduleReviewWithProfile(card, pair[0], at, profile75)
      const nativeSaved = native75.next(nativeCard, at, pair[1])
      history.push({ reviewedAt: at, rating: pair[0], log: saved.log })
      if (index === pairs.length - 1) {
        for (const [replacement, grade] of [
          ['again', Rating.Again],
          ['hard', Rating.Hard],
          ['good', Rating.Good],
          ['easy', Rating.Easy],
        ] as const) {
          const expected = native75.next(nativeCard, at, grade)
          expectNativeCard(
            correctReviewFromEvidence(saved.context, replacement).card,
            expected.card,
          )
          expectNativeCard(
            correctLegacyReview(saved.card, history, replacement, 0.75).card,
            expected.card,
          )
        }
      }
      card = saved.card
      nativeCard = nativeSaved.card
    }
    const again = correctLegacyReview(card, history, 'again', 0.75)
    expect(again.card.lapses).toBe(pairs.length === 3 ? 1 : 0)
    expect(
      scheduleReviewWithProfile(
        card,
        'good',
        history.at(-1)!.reviewedAt,
        profile75,
      ).card.reps,
    ).toBe(card.reps + 1)
  },
)
```

- [ ] **Step 5: Green/commit:**

```sh
rtk npm run test -- src/lib/fsrs/scheduler/review-correction.test.ts src/lib/fsrs/scheduler/review-scheduler.test.ts src/lib/fsrs/domain/review-log-snapshot.test.ts
rtk proxy npx prettier --write src/lib/fsrs/adapter/ts-fsrs-adapter.ts src/lib/fsrs/scheduler/review-correction.ts src/lib/fsrs/scheduler/review-correction.test.ts
rtk proxy git add src/lib/fsrs/adapter/ts-fsrs-adapter.ts src/lib/fsrs/scheduler/review-correction.ts src/lib/fsrs/scheduler/review-correction.test.ts
rtk proxy git commit -m 'feat(fsrs): guard legacy latest-review correction'
```

## Task 5: Publish the facade and verify compatibility

**Files:** modify `src/lib/fsrs/index.ts`, `index.test.ts`, `docs/architecture.md`, the execution map and planning index; create `docs/superpowers/handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md` during implementation.

- [ ] **Step 1: Complete the public exports and protect the facade contract.**

Tasks 1–2 already export the profile/card codecs and their types. Retain those entries once; add `scheduleReviewWithProfile` to the existing scheduler export block and add this correction block. Adapter parameter proxies, conversions and native rollback are internal:

```ts
export {
  correctLegacyReview,
  correctReviewFromEvidence,
  type FsrsLegacyReviewEntry,
  type FsrsReviewContext,
} from './scheduler/review-correction'
```

```ts
scheduleReviewWithProfile,
```

Update the existing exact export-name test by adding these three runtime names to its expected array; retain its previous names, Task 1–2 profile/card names and checks:

```ts
'correctLegacyReview',
'correctReviewFromEvidence',
'scheduleReviewWithProfile',
```

Extend its raw-helper checks:

```ts
expect('rollbackCardReview' in fsrs).toBe(false)
expect('resolveFsrsSchedulerProfile' in fsrs).toBe(false)
expect('assertExactFsrsSchedulerProfile' in fsrs).toBe(false)
```

Run `rtk npm run test -- src/lib/fsrs/index.test.ts src/testing/architecture-boundaries.test.ts` after updating expected exports but before adding barrel exports; expect a facade mismatch. Then add the exports and rerun; both suites must pass.

- [ ] **Step 2: Document the implemented boundary.**

Insert this paragraph after the opening FSRS integration paragraph in `docs/architecture.md`; retain the current due-date and queue semantics below it:

```markdown
The facade also provides validated immutable scheduler profiles and captured
review-context calculations. Profiles record the effective weights, retention,
maximum interval, scheduler mode, step arrays and supported library/model
versions. Their canonical representation reconstructs exactly; imports that
would change during native normalization reject. Correction calculations use
the recorded pre-review card, event time and profile. The legacy compatibility
operation requires an unambiguous complete history and labels its inferred
evidence explicitly. Practice's existing Save/Update wiring remains the current
consumer path; persisted evidence and guarded command integration have separate
implementation phases.
```

Mark B implemented only after its code and required automated checks pass. Record exact proof and human smoke status in the implementation handoff. Keep C–H pending and do not describe a pure helper as an already shipped original-profile Update flow.

- [ ] **Step 3: Run the full facade and existing consumer regressions.**

```sh
rtk npm run test -- src/lib/fsrs src/testing/architecture-boundaries.test.ts src/features/practice/practice-core.integration.test.ts src/features/analytics/domain/review-cohorts.test.ts src/features/analytics/domain/chart-data.test.ts src/features/backup/api/backup-contracts.test.ts src/features/backup/server/backup-service.test.ts src/platform/db/fsrs-preservation.integration.test.ts
```

Expect all suites to pass, including the unchanged saved card/log shapes, legacy supported backups, observed Analytics cohorts and Phase A original-column preservation. Preserve current replay behavior for existing callers; its feature-level replacement is D. Concrete incompatibilities must be investigated before continuing, rather than loosening the new profile's exact reconstruction rule or rewriting old data.

- [ ] **Step 4: Format and run governance-required automated checks.**

```sh
rtk npx prettier --write src/lib/fsrs
rtk npx prettier --ignore-path /dev/null --write docs/architecture.md docs/superpowers/README.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-04-fsrs-phase-b-scheduling-evidence.md docs/superpowers/handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md
rtk npx prettier --ignore-path /dev/null --check src/lib/fsrs docs/architecture.md docs/superpowers/README.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-04-fsrs-phase-b-scheduling-evidence.md docs/superpowers/handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md
rtk npm run lint
rtk npm run check
rtk npm run build
rtk git diff --check
```

Expect every command to exit successfully. The build verifies that current consumers still bundle after shared codec changes. `rtk npm run db:generate` is skipped because B adds no schema or migration; `rtk npm run zip` is skipped because packaging/archive behavior is unchanged. Database checks run inside `rtk npm run check`. Record actual suite/test counts and any repaired failures, without treating a previous run as fresh validation.

- [ ] **Step 5: Prepare and obtain the human compatibility smoke proof.**

Load `dist/chrome-mv3` in a disposable Chrome profile with ordinary existing history. Capture happy-path and edge-case screenshots or a recording, following `docs/testing.md`:

1. Inspect history, due dates, suspension, Daily Goal/streak and track progress before/after extension reload. These values must remain intact.
2. Save an ordinary review and explicitly reselect then Update its rating using the current product flow. Verify a single corrected attempt, existing assessment locks and persistence after reload.
3. Change retention from 75% to 90%; inspect existing due timestamps before the next genuine review and confirm Settings/reload preserve the preference. Pure recorded-context correction parity is covered by the new tests; the future UI integration is D.
4. Restore a valid currently supported backup containing New zeros/null last review and existing logs. Confirm the current backup workflow still accepts supported data without activating the new evidence format.

Agents prepare this checklist; a human performs the realtime smoke and supplies visual proof before behavior-changing PR review or merge. If proof is outstanding, keep that status explicit in the handoff and PR. Pure helper tests do not establish end-to-end guarded Update, durable receipts, daily eligibility or optimizer compatibility.

- [ ] **Step 6: Commit the completed phase handoff.**

```sh
rtk git add src/lib/fsrs/index.ts src/lib/fsrs/index.test.ts docs/architecture.md docs/superpowers/README.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-04-fsrs-phase-b-scheduling-evidence.md docs/superpowers/handoffs/2026-10-04-fsrs-phase-b-scheduling-evidence.md
rtk git diff --cached --check
rtk git commit -m "docs(fsrs): record scheduling evidence and correction boundary"
```

The PR summary must describe B's helpers and compatibility limits independently of this conversation. Use the repository template, Conventional Commit title, exact commands run/skipped, remaining human proof and rollback notes. No schema or stored schedule changes are required to revert B.

## Done when

- All seven final effective parameters and supported library/model metadata round-trip exactly, including normalized 17/19-weight inputs and caller mutation isolation.
- Complete profiles serialize canonically for C's later deduplication; unsupported or differently clipped imported models reject.
- Card and log codecs validate detached values; New zeros/null last review remain valid, and decoded Dates do not share caller references.
- Captured correction schedules a replacement once from the original immutable pre-card, event time and recorded profile, preserving input values and avoiding compounding.
- Legacy correction accepts only complete unambiguous compatible history, rejects earlier/tied/reordered/malformed evidence before rollback, and reports its unknown original provenance honestly.
- Existing public scheduling, projections, Analytics, Practice and supported backup consumers retain their compatibility under the shipped defaults.
- No SQL, schema, persisted evidence, runtime command, queue/calendar policy, assessment lock, backup version, sync or training change is included.
- Focused/full/build/formatting checks pass and the human compatibility smoke proof is attached before review/merge, or explicitly remains outstanding.

## Planning validation and implementation limits

The planning pass fetched Context7 parameter, rollback and serialization documentation, then verified installed 5.4.0 declarations/source rather than treating unversioned examples as authoritative for this package. Read-only probes confirmed the final parameter round trip, 17/19/21 normalization, invalid-weight rejection, preserved direct-construction behavior with multiple relearning steps, exact reconstruction of separately normalized profiles, unsafe earlier-log rollback, loss of raw prior due, accepted same-day reordered application and mutable frozen Dates:

```sh
rtk proxy env TZ=America/New_York node /private/tmp/cognipace-fsrs-phase-b-probe.mjs
rtk npm run test -- src/lib/fsrs src/testing/architecture-boundaries.test.ts src/features/practice/practice-core.integration.test.ts
```

Both commands passed; the existing baseline contains 75 tests across eight suites. An earlier exploratory attempt to structured-clone the parameter Proxy failed with `DataCloneError`; the corrected explicit-field probe passed. These probes and baseline suites validate the plan's premises, not the unimplemented Phase B functions.

Planning Markdown formatting and whitespace checks passed:

```sh
rtk npx prettier --ignore-path /dev/null --write docs/superpowers/README.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-04-fsrs-phase-b-scheduling-evidence.md
rtk npx prettier --ignore-path /dev/null --check docs/superpowers/README.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-04-fsrs-phase-b-scheduling-evidence.md
rtk git diff --check
rtk git diff --cached --check
```

`rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk npm run db:generate`, `rtk npm run db:check`, `rtk npm run zip` and the new red/green test commands are not run in this planning-only pass because application code and schema are unchanged. Their applicable implementation commands are listed above. Human Phase B smoke and later C/D integration proof remain implementation work.

Primary references: [parameter configuration](https://github.com/open-spaced-repetition/ts-fsrs/blob/v5.4.0/packages/fsrs/src/default.ts), [native scheduler](https://github.com/open-spaced-repetition/ts-fsrs/blob/v5.4.0/packages/fsrs/src/fsrs.ts), [algorithm normalization](https://github.com/open-spaced-repetition/ts-fsrs/blob/v5.4.0/packages/fsrs/src/algorithm.ts), and the locally installed `node_modules/ts-fsrs/dist/index.d.ts` / `index.mjs` inspected during planning.
