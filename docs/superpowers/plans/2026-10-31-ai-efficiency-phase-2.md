# AI data-flow efficiency phase 2 implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development and TDD,
> with independent spec and quality reviews. The user explicitly approved
> feedback first and code generated on demand; do not pause for another scope
> approval. Execute after phase 1 measurements/context cleanup.

**Goal:** Show a validated scored assessment without generating hidden code;
generate and retain a full suggested implementation only on explicit request.

**Architecture:** The review-assistant feature owns separate strict feedback
and implementation contracts/prompts/services. The extension owns independent
operation authorization/cancellation. Overlay hooks retain the immutable assessed
submission and compose independent feedback and code states. Keep existing
feature placement and generic AI transport ownership.

**Tech stack:** TypeScript, Zod, AI SDK 7, React, WXT, Vitest.

## Task 1: Feedback-first assessment and on-demand implementation

Use one implementation worker for this coupled end-to-end change so the runtime,
controller and UI contracts converge before aggregate verification.

Files: `leetcode-review-assistant/domain/code-analysis-schema.ts` and consistency
helpers; adjacent feedback/implementation contract files and tests; feature API
client/exports; `server/code-analysis-service.ts`, prompt and runtime services;
new implementation prompt/service/runtime tests; `extension/messaging.ts`,
`extension/background/runtime-policy.ts`, `register-handlers.ts`,
`leetcode-analysis-operations.ts` and tests; overlay analysis hook, a separate
implementation hook where appropriate, session composition and expanded report
components/tests. Evaluation fixtures and projection must describe the new
operation shapes honestly. Root owns authority docs/handoff and publication.

- [x] RED contract/service tests: the initial provider schema contains only
      version, summary, Approach, Efficiency and Code Style. It excludes suggested
      implementation/code fields. All rubric constraints and consistency rules for
      those sections remain enforced. No initial code-generation call is made.
- [x] Create a clearly named/versioned feedback report schema and type rather
      than misusing unavailable-code fields or silently accepting a legacy full
      report. Extract/share existing core schemas and consistency rules. Keep
      legacy full-report helpers only where still needed by authored fixtures or
      evaluation; do not add a production compatibility endpoint solely for tests.
- [x] The initial generation prompt assesses the same complete problem and
      pinned source, requests concise scores/explanations and never requests a
      replacement implementation. Preserve exact language/constraints and no
      invented correctness claims. Keep bounded token headroom and metrics.
- [x] Add a strict implementation request binding a fresh request ID, the
      original successful assessment request ID, original problem/submission/
      attempt/configuration identity and validated feedback. Its response is either
      a complete implementation with language, changes, complexity and assumptions,
      or a responsible unavailable reason. Preserve raw code as inert text,
      AI-generated/Untested labels and Copy behavior. Validate language/signature
      consistency to the degree existing rules do, without claiming execution.
- [x] The implementation prompt uses compact original context plus the prior
      feedback. It asks only for suggested code and its explanation, not another
      scored assessment. Missing optional metadata remains unknown. Both services
      enable the approved bounded recovery policy and safe numeric metrics.
- [x] Add background service, runtime API and handler authorization using the
      same actual sender host/slug rules as assessment. Keys remain background-only.
      Recheck connection identity before publishing. Bound implementation background
      at 60 seconds and client at 80 seconds, including preparation and final checks.
- [x] Add independent volatile implementation operations to the existing owning
      helper. Repeated in-flight request IDs coalesce; superseding implementation
      work cancels only that operation. It must not cancel feedback or hints. Global
      reset/config changes abort obsolete implementation work as well.
- [x] Retain the exact original successful assessment request in session memory
      for code generation. A later editor change must not replace the assessed
      submission. New attempt, reset, navigation, disable or connection revision
      invalidates this owner and cancels code work. No new database/cache/sync data.
- [x] Extend overlay state through composition/a focused hook rather than a
      second sprawling controller. Implementation states: idle, pending, ready,
      unavailable/error with Retry. Use a Generate suggested code action inside the
      existing disclosure; opening/collapsing it alone does not make a provider call.
      Keep scores/feedback visible during code pending/error; a code failure must
      not trigger assessment regeneration. Double clicks coalesce. Keep successful
      code through disclosure toggles and unrelated local review saves.
- [x] Test happy path and edges: initial feedback requires one call and has no
      code; Generate makes one additional call with the original pin and feedback;
      double activation; saved code reused; implementation-only retry; almost
      complete/valid original approach; stale connection/navigation/reset/attempt
      results discarded; cancellation cleanup; no review/rating/FSRS writes.
- [x] Update opt-in evaluation to distinguish feedback and explicit
      implementation operations, preserving safe success/failure artifacts and
      metrics. Ordinary runs remain offline. Do not mark generated-code quality
      proven by feedback-only evaluation. Keep complete-code probes as a separate
      explicit evaluation action using authored fixtures.
- [x] Focused GREEN:

  ```sh
  rtk proxy npm test -- src/lib/ai src/features/leetcode-review-assistant src/features/overlay-session src/extension/background --run
  ```

- [x] Self-review, spec review then quality review; address findings before
      final commit. Run full typecheck/lint/tests/build and format after integration.

## Task 2: Evidence, documentation and reviewable PR

- [x] Root updates product, architecture, testing and `design.md` to the final
      behavior. Include user-visible loading/error/keyboard/focus smoke cases and
      a clear note that full code now requires an explicit action.
- [x] Repeat numeric-only offline payload measurements with the new feedback
      shape. Compare against commit `3e0e42e6`'s recorded baseline. Preserve byte
      and token distinctions. Record the two-call tradeoff for code-requesting users;
      no provider latency/token/cost gain is claimed without real measurements.
- [x] Run `rtk proxy npm run lint`, `rtk proxy npm run check`,
      `rtk proxy npm run build`, `rtk proxy npm run format`, explicit Prettier on
      ignored planning/proof files, and `rtk proxy git diff --check`.
- [x] Prepare component/browser proof if available, with real installed-extension
      human smoke and real-provider quality/performance still required. No app secret
      reads to obtain evaluation credentials. List exact skipped commands/reasons.
- [x] Commit Conventional Commit changes and create a separate draft PR. Stack
      on #213 if still open; if merged, use main after verifying the base. Update the
      hint PR separately for snapshot interning, keeping its explicit three-hint cap.
- [x] Keep conditional exact-result caching deferred until measurements justify
      it; do not add generic orchestration agents or infrastructure layers.

Implementation, independent reviews and automated checks completed on 2026-10-31.
Human realtime extension smoke and live-provider quality/performance remain
pending. The result-cache phase remains deferred as designed.
