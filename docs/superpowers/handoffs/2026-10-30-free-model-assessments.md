# Free-model assessment reliability handoff — 2026-10-30

Branch: `codex/free-model-assessments`, from current `origin/main`.
The user approved the written design and requested implementation and a draft
PR. This follow-up is separate from hint PR #203, whose approved sequence is
Light → Medium → Heavy with fresh snapshots.

## Behavior and limits

Assessments request concise reports while retaining all scored dimensions,
strict validation, the 8,192-token ceiling and complete suggested code. Their
whole background deadline is 60 seconds and client deadline is 80 seconds.
All assessment providers/models may recover once from a
recognized temporary upstream failure. Backoff is abortable, honors Retry-After
and fits inside the original operation deadline. Hints and connection tests retain their
existing attempt policy. Quota, auth, billing, refusal and invalid reports do not
trigger recovery. No model fallback, privacy override or provider-body logging.

The opt-in assessment evaluation writes safe success/failure artifacts before
assertions and summarizes current-run counts, categories and durations. It
cannot prove a reliability improvement until real provider measurements exist.

## Validation record

### All-model correction — 2026-10-31

The user explicitly requested retries for all models. The assessment service
now sets `retryTransientErrors` for every provider/model. The library tests
cover successful bounded recovery for OpenAI, Anthropic, Gemini and paid
OpenRouter models, identical request bodies and calls remaining single-attempt
without explicit opt-in. Error exclusions, strict validation, Retry-After,
cancellation and deadline bounds remain enforced. No broader agentic efficiency
claim is made: the current assessment still generates its full report and
suggested implementation in one model call.

- `rtk proxy npm test -- src/lib/ai/generate-json.test.ts src/features/leetcode-review-assistant/server/code-analysis-service.test.ts --run`:
  first produced 21 expected RED failures, then passed 174 tests.
- `rtk proxy npm run check`: passed database check, typecheck, lint and tests;
  3,932 passed, ten skipped across 251 passed and three skipped files.
- `rtk proxy npm run lint`, `rtk proxy npm run build` and
  `rtk proxy npm run format`: passed. The existing chunk-size warning remains.
- Explicit Prettier on the updated planning/proof files and
  `rtk proxy git diff --check`: passed. Skipped commands and human/live gates
  below still apply; all-model smoke now includes each provider and paid models.

The user clarified the broader objective is efficient data flow. The separate
`2026-10-31-ai-data-flow-efficiency.md` audit records measured offline payloads,
the current end-to-end flow and a proposed next phase. The temporary probe
initially failed on unsupported fake model identifiers, then passed using the
existing wire fixture model IDs and mocked responses. No provider was called.
Its source and numeric evidence are preserved under
`docs/superpowers/proof/2026-10-31-ai-efficiency`. Broader optimization remains
proposed; no feedback-first/on-demand-code behavior is implemented here.

### Original phase validation

- `rtk proxy npm test -- src/lib/ai src/features/leetcode-review-assistant src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx --run`:
  baseline 442 passed, nine opt-in live cases skipped.
- TDD RED: 14 expected failures for recovery/backoff/deadlines before production
  changes; evaluation projection and concise-prompt assertions also failed
  before their implementations.
- The same focused command passed after implementation: 479 tests, nine live
  cases skipped. Later targeted results and aggregate checks are recorded below.
- Final focused run after the added output/refusal and stale-transport
  regressions: 483 passed, nine opt-in live cases skipped. Independent SPEC
  review repeated the command and passed without findings.
- Initial `rtk proxy npm run lint` and `rtk proxy npm run check` found three
  lint issues in the new retry/test code; corrected before final validation.
  `rtk proxy npm run lint` then passed.
- Final `rtk proxy npm run check`: passed database check, typecheck, lint and
  tests; 251 files passed, three skipped; 3,927 tests passed, ten skipped.
  Existing jsdom `scrollTo` notices appeared.
- Final `rtk proxy npm run build`: passed Chrome MV3 production build; existing
  chunk-size warning remains. `rtk proxy npm run format`: passed.
- `rtk proxy npx prettier --check --ignore-path /dev/null docs/superpowers/specs/2026-10-30-free-model-assessment-reliability-design.md docs/superpowers/plans/2026-10-30-free-model-assessments.md docs/superpowers/handoffs/2026-10-30-free-model-assessments.md docs/superpowers/README.md`
  and `rtk proxy git diff --check`: passed after documentation updates.
- Independent QUALITY/final review approved without findings and ran
  `rtk proxy npm test -- src/lib/ai/generate-json.test.ts src/features/leetcode-review-assistant/testing/code-analysis-evaluation-results.test.ts --run`:
  152 tests passed.

## Required human and live-provider proof

**Human installed-extension realtime smoke and screenshots/recording are
pending. Live-provider assessment quality and reliability are pending.**
Follow `docs/testing.md` for normal and slow assessments, temporary failure and
recovery, quota/auth/output failures, cancellation during backoff, navigation
and connection changes. Confirm independent review saving, one published report
and no paid fallback. Attach proof before PR review or merge; neither gate is N/A.

Only environment-variable presence booleans were checked. Live evaluation is
not opted in and private test-only configuration is absent. No application
secret storage was read.

Exact skipped commands and reasons:

- `rtk proxy env COGNIPACE_AI_EVAL=1 npm test -- src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts --run`:
  no private test-only provider configuration. No before/after live success-rate
  claim is made.
- `rtk proxy npm run db:generate`: schema and persisted shapes are unchanged.
- `rtk proxy npm run zip` and `rtk proxy npm run store:check`: no release/package
  workflow change or store submission requested; production build is required.

## Release, runtime and rollback

Release intent: `fix(ai): improve free-model assessment recovery`.
Existing background sender authorization, strict Zod runtime/report validation,
secret loading/redaction, request identities and stale-connection checks remain
required. Report completion adds no invalidation, database/review writes or sync
side effects. Host permissions and database/backup formats do not change.

Rollback the implementation commits to restore the previous assessment budgets
and single-attempt behavior. No migration or data recovery is needed. Keep the
PR draft until human smoke and real-provider evidence are attached; no merge or
release is authorized.
