# Focused overlay tabs — Phase 1 handoff

Recorded on 2026-10-05. The approved design and artifact filenames retain their
2026-10-04 date. This handoff covers focused tabs only.

## Behavior and source

Source revision: `18c0d896fa23dc80daf25220fce54ff68cd56bf0` on
`codex/overlay-tabs-design`. Phase 1 source tasks 1–5 are implemented and passed
independent specification and code-quality review. Required automated checks and
production-component browser fixture checks passed. Human installed-extension
happy-path and edge-case smoke with screenshot or recording proof remains
pending; this handoff does not claim PR review or merge readiness.

The expanded overlay has Solve, AI, and reserved Notes tabs under its shared
header and problem context. Solve owns the timer, assessment, submission dates,
Help, feedback, review actions, and next-step guidance. Only Solve shows the
full review footer. AI displays the existing completed-submission analysis and
useful disabled, idle, loading, unavailable, and error states with Settings or
Retry where appropriate. Notes is a placeholder with no editing or persistence.

The overlay-session reducer owns selected-tab state above visual modes.
`ExpandedOverlay` retains mounted panels, native AI disclosures, Copy feedback,
and separate panel scroll positions across ordinary tab switches. Hidden
panels and controls leave the accessibility and keyboard sequence. Left/Right
wrap, Home/End select endpoints, and the tab list has one keyboard stop using
ShadowRoot-compatible focus handling. Status cues remain passive.

A save completed while expanded preserves the tab selected at completion. A
save completed while collapsed or docked opens Solve. Collapse/dock/restore
retains selected-tab and report session state. New-problem navigation and
Restart select Solve. Tab navigation starts no provider call or Practice write;
AI generation remains owned by the session controller. Existing review locks,
elapsed time, single-attempt updates, FSRS scheduling, and historical log fields
remain owned by their existing flows.

Source paths:

- `src/features/overlay-session/domain/overlay-session-state.ts`
- `src/features/overlay-session/components/modes/expanded/overlay-tabs.tsx`
- `src/features/overlay-session/components/modes/expanded/expanded-overlay.tsx`
- `src/features/overlay-session/components/modes/expanded/overlay-code-analysis.tsx`
- `src/features/overlay-session/components/overlay-shell.tsx`
- `src/features/overlay-session/hooks/use-overlay-review-actions.ts`

Commit `111c86ec` contains Task 3 source plus documentation formatting because
of overlapping Git staging in the root workflow. The correct files were
preserved; history has not been rewritten. Follow-up `7564acac` adds the
status/focus regression coverage. The source revision above includes both.

Saved Notes and Phase 2 hints are outside this implementation. The separate
[hint plan](../plans/2026-10-04-overlay-ai-hints.md) is authored and reviewed;
its execution is next. See the
[approved design](../specs/2026-10-04-tabbed-overlay-and-ai-hints-design.md).

## Automated validation

The root execution agent verified these commands on the source revision above
before this documentation-only handoff. They were not rerun for unchanged
source. The baseline dependency installation (`npm ci`) passed with pinned Node
24.20.0 and npm 11.19.0.

```sh
rtk proxy npm test -- src/features/overlay-session/domain/overlay-session-state.test.ts src/features/overlay-session/components/modes/expanded/overlay-tabs.test.tsx src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx src/features/overlay-session/components/modes/expanded/overlay-code-analysis.test.tsx src/features/overlay-session/components/overlay-shell.test.tsx src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx --run
rtk proxy npm run lint
rtk proxy npm run check
rtk proxy npm run build
rtk git diff --check
```

Results:

- Focused tests: 6 files, 85 tests passed.
- Lint: passed.
- Full check: database checks, WXT preparation, TypeScript, ESLint, and full
  tests passed; 210 files passed and 1 file skipped, with 2,711 tests passed and
  6 skipped. The skipped cases are existing opt-in provider evaluations.
  Existing JSDOM `Window.scrollTo` warnings appeared.
- Build: passed; Chrome MV3 output in `dist/chrome-mv3`, 4.71 MB. Vite reported
  its warning for chunks larger than 500 kB.
- Diff whitespace check: passed.

Task 6 documentation formatting and whitespace validation:

```sh
rtk proxy npx prettier --write --ignore-path /dev/null docs/product.md docs/architecture.md docs/testing.md design.md docs/superpowers/handoffs/2026-10-04-overlay-focused-tabs.md docs/superpowers/README.md
rtk proxy npx prettier --check --ignore-path /dev/null docs/product.md docs/architecture.md docs/testing.md design.md docs/superpowers/handoffs/2026-10-04-overlay-focused-tabs.md docs/superpowers/README.md
rtk git diff --check
```

No required Phase 1 automated code check was skipped. Full-repository
`rtk proxy npm run format` was not run: this handoff requires formatting only
the six touched Markdown files, avoiding unrelated file rewrites. The targeted
Prettier check and whitespace check passed.

Human installed-extension smoke was not run and remains required: it needs a
human engineer using the installed extension on actual LeetCode pages and
attaching happy-path and edge-case proof. Live Phase 2 hint provider quality
checks are separately pending: no private `COGNIPACE_AI_EVAL_PROVIDER`,
`COGNIPACE_AI_EVAL_MODEL`, and `COGNIPACE_AI_EVAL_KEY` configuration was
available in the presence-only check; no secret values were printed. The future
command below is not runnable yet because its Phase 2 test file is unimplemented;
it is not a skipped required Phase 1 check.

```sh
rtk proxy env COGNIPACE_AI_EVAL=1 npm test -- src/features/leetcode-review-assistant/server/code-hint-provider-evaluation.test.ts --run
```

## Browser and human evidence

Browser evidence used the production `ExpandedOverlay` component inside a
ShadowRoot with a public Two Sum report, served from the temporary fixture
`/private/tmp/cognipace-focused-tabs-preview` at `http://127.0.0.1:57026/`.
This is component-fixture proof, not human installed-Chrome-extension proof or
live provider-quality evidence.

Passed fixture checks:

- AI uses the available reading height with no Solve footer. Approach,
  Efficiency, and Suggested implementation native disclosures remained open;
  Copied feedback and the exact AI scroll position `565.5` survived
  Solve → Notes → AI.
- Left/Right wrapping, Home/End selection, visible focus, and one tab-list
  keyboard stop passed in the ShadowRoot. Tab entered the active AI Approach
  disclosure and, in the disabled state, Settings, skipping hidden Solve
  controls. Notes had no editor.
- Light Solve at 392px measured client/scroll widths of 390/390. Light AI at
  320px measured 318/318. Dark AI at 320px with long literal code kept the panel
  contained while the code block measured client/scroll widths of 276/421.
- A short 424×480 viewport gave Solve a 100px scroll body with 432px content and
  a fixed footer. No browser error or warning was observed.

The WebKit preview did not honor ShadowRoot `@property` registration, so the
fixture registered the same production `@property` rules at document scope.
It used no production CSS overrides. Initial loopback startup failed with a
sandbox EPERM and succeeded after automatically approved escalation. A stale
Vite preview cache from disabled file watching was corrected by enabling
watching in the temporary server. These were fixture-environment corrections,
not application failures.

Screenshots and tested flows:

| Screenshot                                                                                                                        | Fixture flow                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a109eb-84ec-7973-8911-b8ff68aa56fd/overlay-phase1-ai-dark.jpg`          | Dark AI report, open disclosures, Copy feedback, retained scroll and footer absence |
| `/Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a109eb-84ec-7973-8911-b8ff68aa56fd/overlay-phase1-solve-light-392.jpg`  | Light Solve at 392px with review controls and footer                                |
| `/Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a109eb-84ec-7973-8911-b8ff68aa56fd/overlay-phase1-ai-light-320.jpg`     | Light AI at 320px with contained panel width                                        |
| `/Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a109eb-84ec-7973-8911-b8ff68aa56fd/overlay-phase1-ai-dark-code-320.jpg` | Dark AI at 320px with code-only horizontal overflow                                 |
| `/Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a109eb-84ec-7973-8911-b8ff68aa56fd/overlay-phase1-solve-dark-short.jpg` | Short dark Solve viewport with scrolling body and fixed footer                      |
| `/Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a109eb-84ec-7973-8911-b8ff68aa56fd/overlay-phase1-notes-dark-short.jpg` | Short dark Notes placeholder without editor or full footer                          |
| `/Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a109eb-84ec-7973-8911-b8ff68aa56fd/overlay-phase1-ai-disabled-dark.jpg` | Disabled AI explanation and Settings access without full footer                     |

Status: **HUMAN INSTALLED-EXTENSION SMOKE PENDING**. The
[focused overlay tabs checklist](../../testing.md#focused-overlay-tabs) covers
actual-page Solve/AI/Notes, native disclosure replacement, ShadowRoot keyboard
navigation, delayed saves, mode restoration, new problems/Restart, review
variants, strict overtime, AI and next-step errors, historical-log preservation,
and narrow/short layouts. Existing real-submission analysis and historical-log
checks remain required. The human engineer must attach happy-path and edge-case
screenshots or a recording, with the extension version and tested flows, before
PR review or merge.

## Risk, recovery, and release impact

The remaining risk is integration with the installed content script, real
LeetCode submission timing, delayed saves, and actual browser focus/layout.
Automated and fixture coverage reduce those risks but cannot complete the
required human proof. Live hint quality belongs to Phase 2 and remains pending.

Recovery is to restore the prior expanded-overlay composition and corresponding
reducer/controller wiring. There is no database migration to roll back. This
phase adds a user-visible feature without changing database shape, sync,
Chrome permissions, or provider ownership. Historical log values remain
preserved. Project version stays 2.1.0; no version bump is made here. The
feature's eventual Conventional Commit PR title should carry its additive
feature release impact under the existing Release Please workflow.
