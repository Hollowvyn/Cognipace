# Adaptive code hints handoff — 2026-10-05

Branch: `codex/adaptive-code-hints`, based on `origin/main` at `9cafaf7b`.
Design approved by the user in chat. Source implementation, independent SPEC and
QUALITY reviews for all three tasks, and automated validation are complete.
Human and real-provider gates below remain pending; no merge readiness is claimed.

## Intended behavior

Replace a problem-only precomputed batch with one hint per explicit request.
Each request reads complete current editor code and includes earlier hint/code
snapshots. Start light, strengthen when stuck, return to light after meaningful
progress, and cap successful hints at three. Retain earlier hints during edits,
subsequent requests and failures. No hint-related persistence or review writes.

## Validation record

Pinned toolchain: `rtk proxy node --version` returned `v24.20.0`;
`rtk proxy npm --version` returned `11.19.0`.

- `rtk git status --short --branch`: clean detached worktree before work.
- `rtk git fetch origin`: passed; original HEAD matched current `origin/main`.
- `rtk git switch -c codex/adaptive-code-hints origin/main`: passed.
- `rtk proxy npm ci`: passed with 481 installed packages and inherited audit and
  install-script warnings. No dependency or lockfile changes.
- Initial `rtk proxy npx prettier --write docs/superpowers/specs/2026-10-05-adaptive-code-hints-design.md docs/superpowers/plans/2026-10-05-adaptive-code-hints.md`
  and the equivalent `--check` failed with registry DNS lookup before local
  dependencies existed. Repeated after install with `--ignore-path /dev/null`:
  passed, including otherwise ignored planning files.
- Initial `rtk proxy npm test -- src/features/leetcode-review-assistant src/features/overlay-session --run`:
  failed before tests ran because generated `.wxt/tsconfig.json` was absent.
  `rtk proxy npm run prepare:wxt` passed. Repeating the exact focused command
  passed: 489 tests, nine opt-in live cases skipped.
- Interim `rtk proxy npm run check` stopped at typecheck on in-progress editor
  capture indexed-node guards; no full-check success was claimed.
- Task 1 `rtk proxy npm test -- src/lib/leetcode/editor src/lib/leetcode/index.test.ts`:
  passed, 38 tests. Initial complete-capture tests produced five expected RED
  failures before implementation; bridge tests subsequently passed.
- Task 1 `rtk proxy npm run typecheck`: passed after indexed-node guards.
- Task 1 `rtk proxy npx eslint src/lib/leetcode/editor/complete-code-snapshot.ts src/lib/leetcode/editor/complete-code-snapshot.test.ts src/lib/leetcode/editor/editor-snapshot-bridge.ts src/lib/leetcode/editor/editor-snapshot-bridge.test.ts src/entrypoints/leetcode-editor.content.ts src/lib/leetcode/index.ts src/lib/leetcode/index.test.ts`:
  passed; the same seven paths with `rtk proxy npx prettier --check` passed.
- Task 1 independent SPEC review: approved; `rtk proxy npm test -- src/lib/leetcode/editor --run`
  passed, 35 tests. QUALITY independently approved; `rtk npm exec vitest run src/lib/leetcode/editor/complete-code-snapshot.test.ts src/lib/leetcode/editor/editor-snapshot-bridge.test.ts src/lib/leetcode/index.test.ts` passed 38 tests.
- `rtk proxy npx prettier --check PRIVACY.md docs/product.md docs/architecture.md docs/testing.md design.md docs/chrome-web-store.md docs/superpowers/README.md`:
  passed for documentation edits.
- Task 2 `rtk proxy npm test -- src/features/leetcode-review-assistant src/extension/background --run`:
  passed, 562 tests; 14 opted-in live cases skipped. No real provider call or
  application key-store read.
- Task 2 scoped ESLint initially found one unused omitted-snapshot test variable;
  corrected without altering behavior. `rtk proxy npx eslint src/features/leetcode-review-assistant src/extension/background/register-handlers.test.ts`
  passed. `rtk proxy npm test -- src/features/leetcode-review-assistant/api/code-hint-contracts.test.ts --run`
  passed, 38 tests. `rtk proxy npx prettier --check src/features/leetcode-review-assistant src/extension/background/register-handlers.test.ts`
  passed.
- Task 2 independent SPEC then QUALITY reviews approved without findings.
  Interim typecheck had six expected obsolete overlay batch-consumer diagnostics;
  those are resolved in Task 3 before aggregate verification.

## Final verification and review

- Task 3 `rtk proxy npm test -- src/features/overlay-session --run`: passed,
  15 files and 230 tests; independent SPEC and QUALITY reviewers each repeated
  this command and approved without findings. Initial fixture/test/lint failures
  during implementation were corrected before this final run.
- `rtk proxy npm run typecheck`: passed after the overlay consumer updates.
- `rtk proxy npx eslint src/features/overlay-session/hooks/use-leetcode-code-hints.ts src/features/overlay-session/hooks/use-leetcode-code-hints.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/features/overlay-session/components/modes/expanded/overlay-hint-block.tsx src/features/overlay-session/components/modes/expanded/overlay-help-section.test.tsx src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx src/features/overlay-session/components/overlay-shell.test.tsx`:
  passed; equivalent `rtk proxy npx prettier --check` on those paths passed.
- `rtk proxy npm run lint`: passed.
- `rtk proxy npm run check`: passed database check, typecheck, lint and tests;
  219 test files passed, two live-provider files skipped, 3,097 tests passed and
  14 opt-in live cases skipped. Existing jsdom `scrollTo` notices appeared.
- `rtk proxy npm run build`: passed Chrome MV3 production build. Existing large
  chunk warning remains. `rtk proxy cat dist/chrome-mv3/manifest.json` confirmed
  unchanged storage/alarms/notifications permissions and existing host list;
  the new static MAIN script is limited to the two HTTPS LeetCode problem hosts.
- `rtk proxy npm run format`: passed.
- `rtk proxy npx prettier --check --ignore-path /dev/null docs/superpowers/specs/2026-10-05-adaptive-code-hints-design.md docs/superpowers/plans/2026-10-05-adaptive-code-hints.md docs/superpowers/handoffs/2026-10-05-adaptive-code-hints.md docs/superpowers/README.md`:
  passed after final documentation updates.
- `rtk git diff --check`: passed on the complete change.

## Production-component fixture proof

The Browser plugin was unavailable; used existing bundled Playwright with
installed Google Chrome, with production `OverlayHelpSection`, production CSS,
theme attributes and a ShadowRoot. Only provider/state transitions are mocked.
The fixture does not prove hook transport, live capture or semantic hint quality.

`rtk proxy node /private/tmp/cognipace-adaptive-hints-proof/server.mjs` serves
the local fixture. Initial sandbox server startup was denied; approved execution
served it. An attempted restart reported the already-running port. First browser
launch failed because the bundled headless shell was absent; using installed
Chrome resolved it without installing browser dependencies. A fixture favicon
404 was corrected, and missing production theme attributes were added before
final screenshots.

`rtk proxy node /private/tmp/cognipace-adaptive-hints-proof/verify.cjs`: passed
in installed Chrome. Verified 392px dark and 320px light cards, first light,
medium/heavy progression, retained earlier hints while pending and after error,
disabled pending action, retry preserving count, three-success cap, progressing
light hints, no hint horizontal overflow, no page/console errors, expected page
identity/content and no framework error overlay. Agent inspected the final
screenshots. Ten screenshots remain in that temporary directory. Four selected screenshots and
`checks.json` are committed under `docs/superpowers/proof/2026-10-05-adaptive-code-hints`.

- [392px dark final fixture](../proof/2026-10-05-adaptive-code-hints/final-dark-392.png)
- [320px light final fixture](../proof/2026-10-05-adaptive-code-hints/final-light-320.png)
- [320px retained hints during error](../proof/2026-10-05-adaptive-code-hints/error-light-320.png)
- [392px retained hints while pending](../proof/2026-10-05-adaptive-code-hints/pending-dark-392.png)

## Skipped commands and remaining human/provider gates

- `rtk proxy env COGNIPACE_AI_EVAL=1 npm test -- src/features/leetcode-review-assistant/server/code-hint-provider-evaluation.test.ts --run`:
  skipped because private test-only provider configuration was not prepared.
  Do not infer real-provider quality from mocked unit or browser fixtures.
- `rtk proxy npm run db:generate`: skipped because database schema and persisted
  shapes are unchanged; `db:check` passed through the full check.
- `rtk proxy npm run zip` and `rtk proxy npm run store:check`: skipped because
  release packaging/store submission was not requested and artifact workflow is
  unchanged; production extension build and static manifest review passed.

**HUMAN INSTALLED-EXTENSION SMOKE PENDING**, **LIVE EDITOR COMPATIBILITY
PENDING**, and **LIVE PROVIDER QUALITY EVALUATION PENDING**. Follow the adaptive
hints checklist in `docs/testing.md`. Verify full off-screen solution code,
unchanged escalation, progressing-light guidance, cosmetic edits, regressions,
near-complete code, later-turn retries, edited pending snapshots, immediate review
saves and stale output after reset/navigation/connection changes. Attach human
screenshots or a recording before PR review or merge. Agent fixtures and model
tests do not complete these gates; neither gate is N/A.

Do not read application key storage to evaluate a provider. The existing opted-in
test-only environment harness is the evaluation path; no private key is copied
into this handoff, shell commands, logs or screenshots.

## Release and recovery

Release intent: `feat(overlay): adapt AI hints to current code and progress`.
The user subsequently requested a PR. Publish this branch as a draft while the
human/provider gates remain pending; merge and release are not requested. Avoid requesting hints to recover from provider/capture issues.
Review saving and completed-submission analysis keep their existing owners.
Permission/host access, database shape and backup/sync format do not expand.
Privacy and Store copy disclose the newly transmitted current code and prior
hint snapshots. Live Monaco globals and LeetCode solution-root markup can vary;
capture must report unavailable rather than substitute partial code.
