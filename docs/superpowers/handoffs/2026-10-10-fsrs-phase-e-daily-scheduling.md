# FSRS Phase E: Daily Scheduling Handoff

Status: implementation and independent SPEC and Ponytail QUALITY reviews are
complete. Automated validation passes. Human installed-extension happy-path and
edge-case smoke with screenshot or recording proof remains **pending** before PR
review or merge.

Branch: `codex/fsrs-phase-e-daily-scheduling`, from `origin/main` at `a7944466`.
Phase D was present in that baseline after merged PR #205 (`c6563ced`); its
recorded human extension proof is still pending. This work follows the
[reviewed Phase E plan](../plans/2026-10-10-fsrs-phase-e-daily-scheduling.md)
and the owner's October 10 native interval decision.

## Result

- Genuine Save now captures the effective daily FSRS profile with the saved
  retention target, `maximum_interval: 180`, long-term mode, empty learning and
  relearning steps, and fuzz disabled. Pinned ts-fsrs 5.4.0/FSRS 6 can return
  181–183 days after rating ordering. No post-library clamp changes its card or
  log. Generic defaults and Update reconstruction of an older event profile
  remain intact.
- Practice derives `eligibleOn` as the later of the raw due date's local day and
  the next local day after the actual last review. It leaves `dueAt` unchanged.
  Queue, current Analytics and forecast use this rule; reminders deduplicate on
  the browser-local day. Local midnight, both DST transitions and a timezone
  change are covered. The one-time migration of a legacy UTC reminder key uses
  the stored reminder clock to infer its local day; an old date-only key cannot
  recover an unrecorded notification instant exactly.
- Automatic Queue contains overdue, due-today and eligible New items, ordered
  deterministically and capped by the full Daily Goal. Popup and Overview
  request future reviewed cards only through the explicit **Extra Practice**
  action. Its response carries one selected item and the full available count;
  captured custom profiles inform retrievability ranking. The action has
  loading, empty and error states. Suspension, premium filtering, distinct
  daily credit and track progress retain their existing ownership.
- Historical Analytics resolves model values from recorded pre-card, profile,
  rating and event time. Captured, legacy-derived compatibility, mixed and
  unknown evidence are distinguished in Recall, Memory Strength and historical
  Overdue Backlog. Unknown model evidence does not erase observed outcomes;
  Recall omits the observed-minus-model difference when model coverage is
  incomplete. Current Retention Map uses a card's last recorded profile when
  available, retains unsuspended premium cards independent of Queue filters,
  and can show a low-retrievability future card without calling it due. The
  fixed Today-plus-thirteen forecast uses local eligibility and Queue premium
  filtering. Historical backlog keeps its separate reporting-timezone rule.
- Existing cards with raw due dates beyond 180 days, logs, history, earned
  credit, suspension and Settings survive reads and retention changes. Repeated
  Update uses the original event time/profile and can still produce a longer
  interval; a later genuine Save adopts the daily profile. Assessment locks,
  source/reason/policy evidence, reminders and independent Analytics goals
  remain in place. No schema, migration, backup codec, permission, sync or
  backend change was needed.

## Review repairs

Independent SPEC review found and verified repairs for premium Retention Map
inclusion, chronological observed repeat membership, a legacy card timestamp
fallback shared with Practice, stable ordering of mixed historical evidence,
and provenance in Memory Strength and Overdue Backlog. Its re-audit found no
remaining actionable Analytics mismatch. Independent Ponytail QUALITY review
found and prompted repairs for the partial-cohort Recall difference, captured
profile Extra Practice ranking, per-card timezone formatter allocation, the
oversized Extra Practice response, and the unused raw-due forecast query. The
new targeted regressions and final repository check cover those repairs.

## Automated validation

The final `npm run check` passed: database check, TypeScript, ESLint, 3,797
tests passing and nine existing skips across 247 files. The final Chrome MV3
build and whole-repo Prettier check passed. The build emitted only the existing
large-chunk warning. `git diff --check` and explicit touched-Markdown Prettier
checks passed after this handoff was formatted.

The exact final commands used the pinned Node 24.20.0 path because the host
shell defaults to Node 26, which the repository's `devEngines` rejects:

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin /opt/homebrew/bin/rtk npm run db:check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin /opt/homebrew/bin/rtk npm run lint
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin /opt/homebrew/bin/rtk npm run check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin /opt/homebrew/bin/rtk npm run build
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin /opt/homebrew/bin/rtk npm run format
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin ./node_modules/.bin/prettier --ignore-path /dev/null --check docs/product.md docs/architecture.md docs/testing.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-10-fsrs-phase-e-daily-scheduling.md docs/superpowers/README.md docs/superpowers/specs/2026-10-03-fsrs-remediation-design.md docs/superpowers/handoffs/2026-10-10-fsrs-phase-e-daily-scheduling.md
rtk git diff --check
```

Focused validation included `rtk npm run test --
src/features/practice/practice-core.integration.test.ts` (42 passing), the
affected Analytics/Queue/app-shell/popup/reminder/Settings set (975 passing
before final review repairs), eight historical provenance suites (284 passing),
eight Queue/profile suites (181 passing), the legacy Queue/Analytics fallback
pair (64 passing), and study-day/DST cases (17 passing). The first full check
failed six tests: three stale expectations for prospective due/one-item Extra
Practice, two storage fixtures that mislabeled a new daily event as old legacy
evidence or duplicated the old default profile, and one private Queue import.
Each was repaired without weakening its assertion; the final full check passed.
The first whole-repo Prettier check flagged two Analytics files; formatting them
and rerunning the gate passed. A review-only subagent's test attempt under host
Node 26 stopped at `EBADDEVENGINES`; pinned-Node full validation supersedes it.

`rtk npm run db:generate` was skipped because there is no schema change.
`rtk npm run zip` was skipped because package or artifact behavior did not
change. Live AI provider evaluation and Phase F previews/Phase G–H optimization
experiments were skipped as outside Phase E. The nine test skips reported by
Vitest are pre-existing suite skips, not Phase E acceptance proof.

## Human smoke and release gate

The human engineer must run the installed-extension checklist in
[`docs/testing.md`](../../testing.md) under “Phase E Daily Scheduling And
Study-Day Smoke” and attach screenshots or a recording before PR review or
merge. Required happy and edge cases include 75% Settings Save/reload, genuine
Save and repeated Update/Restart, old >180 dates and preserved progress,
midnight/DST/timezone boundaries, automatic versus Extra Practice in popup and
Overview, Library status, current and historical Analytics, reminder dedup,
assessment locks, and a reopened extension/backup. Automated fixtures and the
production build do not supply that human proof. PR status must remain draft
until it is supplied and reviewed.

Release impact is confined to the local Chrome extension's scheduling read and
new-review behavior; no server or data migration is required. If the release
needs rollback, restore the prior extension build. Existing stored cards and
recorded profiles remain readable, and no bulk due-date rewrite occurred.
