# Combined Outcomes Restoration Implementation Plan

> Execute the user's additive restoration using the existing approved chart design.

**Goal:** Restore the all-difficulty first-outcome chart without removing any
new Analytics view.

**Architecture:** Pool the canonical first-recorded difficulty counts in a local
presentation component. Reuse historical chart and Settings goal controls.

**Tech Stack:** TypeScript, React, Recharts, Vitest, existing extension runtime.

## Component And Focused Proof

- [x] Create `src/features/analytics/components/combined-problem-outcomes-view.tsx`
      and its focused component test. Sum all four difficulty count groups,
      derive the two pooled rates, trim valid-outcome edges and build the fitted
      percentage domain including both goals. Reuse historical plot, targets,
      line segments, exact table and inspection.
- [x] Run `npx vitest run src/features/analytics/components/combined-problem-outcomes-view.test.tsx`
      and confirm weighted/Unknown counts, gaps/zero, both targets and empty UI.

## Dashboard Integration

- [x] Modify `analytics-screen.tsx`: add New Problem Success/Recall pair before
      the full-width Problem Solving panel; wire both saved target editors.
      Use separate unique anchors. Keep every other panel.
- [x] Update `analytics-screen.test.tsx` to assert coexistence and both new
      target-editor save paths. Run both component suites and the unchanged
      difficulty component suite.
- [x] Update `docs/product.md`, `docs/architecture.md`, `design.md`,
      `docs/testing.md` and `docs/superpowers/README.md` for additive behavior.

## Validation And Handoff

- [x] Run `npm run check`, `npm run build`, `npm run format`, explicit Prettier
      on touched planning docs, and `git diff --check` with pinned Node/npm and
      the required RTK prefix. Record exact commands/results/skips.
- [x] In the temporary production-component harness, verify combined and
      difficulty charts coexist, both goals update, keyboard/table/legend work,
      and dark/light desktop/mobile layouts have no overflow or console errors.
      Save proof outside the repo.
- [x] Review the implementation against scope and for avoidable duplication.
      Leave the human installed-extension happy/edge smoke checklist explicit.

Done when the former chart and every new view coexist, automated and fixture UI
checks pass, and any remaining human smoke requirement is recorded honestly.

## Validation Record

Focused component integration passed **34 tests across three files**. The first
run caught the prior dashboard hierarchy assertion; it now verifies the restored
pair, full-width Problem Solving, every retained panel and unique anchors. The
four new component cases cover pooled counts/Unknown, trim/gaps/zero,
independent series/goals, keyboard/Table values and empty controls.

Final full check passed database checks, typecheck, lint and **209 files /
2,697 tests**. The existing opt-in provider evaluation file / six tests are
skipped by the suite. Build and formatting passed; the existing large-chunk
build warning remains. Independent scope and quality review passed.

Exact validation commands (pinned Node/npm; final runs passed):

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx vitest run src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/combined-problem-outcomes-view.test.tsx src/features/analytics/components/new-problem-success-view.test.tsx
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run build
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run format
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx prettier --check --ignore-path /dev/null docs/superpowers/README.md docs/superpowers/specs/2026-10-04-analytics-combined-outcomes-restoration.md docs/superpowers/plans/2026-10-04-analytics-combined-outcomes-restoration.md
rtk proxy git diff --check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH node /private/tmp/cognipace-solving-proof/combined-interactions.cjs
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH node /private/tmp/cognipace-solving-proof/restoration-interactions.cjs
```

Browser plugin not available; regular Playwright used the existing temporary
production-component harness at `http://127.0.0.1:5178/?theme=dark`. The initial
preview request returned a Vite resource error; the final rendered page is healthy.
A script assertion initially expected different description wording and was
aligned with the actual accessibility text. Visual inspection then caught
missing first-outcome color tokens, previously scoped only to the difficulty
wrapper. Sharing that existing CSS rule restored the visible mint/blue curves
and neutral target; the final browser checks also assert resolved colors.

All **seven combined-chart and nine existing difficulty-chart interaction
groups** passed with zero page/console errors, meaningful content, correct title
and no framework overlay. They exercise both saved targets/sibling references,
shared/split goals, keyboard gaps and counts, Chart/Table, legend isolation,
population/Compare independence, empty/Unknown populations and light/dark
1280/390/320 layouts without document overflow. Screenshot inspection confirms
the restored curves and responsive stacking.

Fixture proof remains outside the repository in this chat's durable visualization
directory: `restored-analytics-desktop.png` and
`restored-combined-{dark,light}-{1280,390,320}.png`. These are fixture checks,
not installed-extension human smoke evidence.

No required automated validation was skipped. `npm ci` was not repeated because
dependencies are unchanged; `npm run zip` was skipped because packaging is
unchanged; `npm run db:generate` was skipped because schema is unchanged.

Human smoke still pending: rebuild/reload the installed extension, confirm both
pooled first-outcome lines beside Recall and all new plots, inspect sparse and
Unknown/zero data, save both goals and reload, change ranges and difficulty
controls without affecting the combined population, exercise keyboard/Table and
mobile layout, and attach screenshot/recording proof.
