# Contributing

This guide is for teammates and agents working on CogniPace. Keep the app
small, local-first, and easy to reason about.

## Working Agreement

- Start from `README.md` for orientation.
- Use the Node version in `.nvmrc`, the npm version declared in `package.json`,
  and `npm ci` before validation so local lockfile behavior matches CI and
  release builds.
- Read `docs/product.md` before product or behavior changes.
- Read `docs/architecture.md` before runtime, database, routing,
  feature-boundary, or state-flow changes.
- Read `docs/testing.md` before manual validation or friend-facing QA.
- Read `design.md` before visible UI changes.
- Agents should read their root guide, `docs/agent-governance.md`, and the
  relevant skill files in `.agents/skills`.
- Prefer the current architecture over generic framework advice.
- Keep changes scoped to the feature or layer that owns the behavior.
- Avoid adding ceremony unless it removes real duplication or prevents a real
  class of bugs.
- If a change increases LOC or indirection, explain what complexity it removes.

## Agent-Authored Changes

Agent-authored changes must follow
[`docs/agent-governance.md`](./docs/agent-governance.md). That document owns the
full agent lifecycle, skill rules, validation matrix, skipped-validation policy,
PR and issue expectations, release-impact notes, and smoke expectations.

For agent work, handoffs and PR summaries must include exact validation commands
run, commands skipped with reasons, remaining validation risk, risk areas,
release impact, issue context or a documented exception, and rollback or
recovery notes when relevant.

Agent output does not replace human smoke testing. For every code change that
touches product behavior, runtime behavior, persistence, release/package
behavior, or user experience, the human engineer must run real-time happy-path
and edge-case smoke tests before PR review or merge. The PR must name the flows
tested and attach a screenshot or screen recording that shows the changed UI or
UX behavior. Do not mark manual smoke testing or visual proof as N/A for
behavior-changing code.

Do not duplicate the full validation matrix here. Keep detailed validation rules
in `docs/agent-governance.md` so Codex, Claude, future agents, and human
reviewers use one canonical source.

## Pull Requests And Releases

CogniPace uses squash merge. Pull request titles must follow Conventional Commit
format because the squash commit title drives Release Please versioning and
changelog generation.

Use this format:

```text
<type>(optional-scope): short summary
```

Release-triggering title types:

- `feat`: minor version
- `fix`: patch version
- `deps`: patch version
- any allowed type with `!`: major version

Allowed maintenance types:

- `chore`
- `test`
- `ci`
- `build`
- `style`
- `docs`
- `perf`
- `refactor`

Examples:

```text
feat(tracks): add active group recovery
fix(sync): prevent dirty local data from auto-pulling
fix(docs): clarify Chrome Web Store release handoff
ci(release): upload extension zip to GitHub releases
```

CI publishes stable `Check`, `Build`, `Format`, `Dependency Review`, and
`Required Checks` results. `Dependency Review` runs only for pull requests and
fails when a pull request introduces a moderate-or-higher vulnerability.
`Required Checks`
is the branch-protection interface; it requires dependency review success on
pull requests and accepts the job's expected skip on pushes to `main`. The
individual validation jobs remain visible for diagnosis and are not required
directly.

After the hardened workflow and dependency review have passed their hosted
rollouts, `main` branch protection requires `Required Checks`,
`Validate PR title`, and `Validate PR body`.

Release Please maintains the release pull request on `main` with a hybrid
cadence: `fix` and `deps` commits open or update a patch release pull request
immediately, while other release-triggering work is batched into the Friday
15:00 UTC run. Maintainers can run the `Release Please` workflow manually for
off-cycle releases. Multiple merged pull requests can ship in one release.
Merging the release pull request creates the GitHub Release and triggers the
extension zip artifact upload. Chrome Web Store submission remains a manual maintainer step using the exact ZIP attached to the GitHub Release. The first item is Private for approved trusted testers. Store-facing copy, privacy disclosures, assets, reviewer instructions,
and the manual handoff are maintained in `docs/chrome-web-store.md` and
`docs/release.md`. WXT-native submission automation is a later phase after
the manual publication and update path is proven.

The Release Please workflow uses the `RELEASE_PLEASE_TOKEN` repository secret so
generated release pull requests still trigger normal pull request checks.

See `docs/release.md` for the complete release process.

## Architecture

CogniPace follows a small-app version of Bulletproof React:

```txt
entrypoints -> app -> features -> platform/lib/components
```

- `src/entrypoints` only boots WXT surfaces.
- `src/app` composes surfaces, providers, and dashboard routing.
- `src/features` owns product capabilities.
- `src/components` holds shared UI primitives only.
- `src/lib` holds product-owned integrations such as FSRS and LeetCode parsing.
- `src/platform` wraps browser, database, query, and time infrastructure.
- `src/extension` owns typed runtime messaging and background handlers.
- `src/testing` owns shared test helpers and architecture boundary tests.

Architecture boundaries are enforced in `src/testing/architecture-boundaries.test.ts`
and `eslint.config.js`. Treat those tests as documentation.

## Feature Folder Shape

Use only the folders a feature actually needs:

```txt
src/features/<feature>/
  api/          # runtime contracts, runtime hooks, serializers
  components/   # feature-specific UI
  data/         # Drizzle repositories and row mapping
  domain/       # pure rules, types, reducers, view models
  hooks/        # feature-specific React hooks
  server/       # background-safe use cases
```

Do not add folders preemptively.

## Ownership Map

| Area               | Owns                                                                    | Main files                    |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------- |
| `app-shell`        | surface read models, popup controller/view mapping                      | `features/app-shell/*`        |
| `overlay-session`  | LeetCode overlay state, timer, mode UI, review actions                  | `features/overlay-session/*`  |
| `practice`         | FSRS review writes, attempts, cards, practice logs                      | `features/practice/*`         |
| `problems`         | problem identity, normalization, catalog upsert, problem context        | `features/problems/*`         |
| `queue`            | daily queue policy and recommendation composition                       | `features/queue/*`            |
| `tracks`           | active track, active group, track progress                              | `features/tracks/*`           |
| `settings`         | user settings schema, defaults, persistence                             | `features/settings/*`         |
| `assessment`       | solve-time and rating decisions                                         | `features/assessment/*`       |
| `leetcode-capture` | LeetCode page/background capture contracts and services                 | `features/leetcode-capture/*` |
| `platform/db`      | SQLite WASM, Drizzle setup, migrations, snapshot persistence, seed data | `platform/db/*`               |
| `extension`        | runtime protocol, sender authorization, handler registration            | `extension/*`                 |

`app-shell` and `queue` are composition/read surfaces. They should not become
write owners for practice scheduling, settings, or tracks.

## React Patterns

Use modern React patterns, but keep them proportional to the app.

- Prefer custom hooks for reusable stateful logic.
- Prefer controller hooks plus presentational shells for surfaces with real
  workflow state. Example: popup controller feeds popup shell.
- Prefer pure domain mappers for view models before adding container components.
- Prefer explicit `view` and `commands` props for complex feature components.
- Use local `useState` for one-off UI state.
- Use `useReducer` only for state machines with multiple transitions.
- Use TanStack Query for runtime/server state and cache invalidation.

Avoid by default:

- HOCs
- render-prop abstractions
- global client stores
- compound component APIs
- broad context providers
- Storybook or a separate shared UI package
- Next.js, Remix, SSR, RSC, Redux, Zustand, tRPC, or GraphQL

Those tools can be added later only when the current app shape proves they are
cheaper than local code.

## Runtime Messaging

UI and content scripts should not call the database directly.

- Add or update protocol types in `src/extension/messaging.ts`.
- Validate message payloads with Zod schemas.
- Authorize senders in `src/extension/background/runtime-policy.ts`.
- Register handlers in `src/extension/background/register-handlers.ts`.
- Call feature `server` services from handlers.
- Serialize `Date` values to ISO strings at API boundaries.
- Broadcast cache invalidation after successful mutations.

Background handlers must parse and authorize before database access.

## Database And Drizzle

Schema lives in `src/platform/db/schema/*` and is exported from
`src/platform/db/schema/index.ts`. `src/platform/db` owns database setup,
migrations, snapshot persistence, and seed data. Feature repositories own
business reads/writes.

Table ownership:

- `problems` and taxonomy joins: `features/problems`
- `problem_practice`, `fsrs_cards`, `review_attempts`,
  `fsrs_scheduler_profiles`, `practice_review_evidence`,
  `practice_generations`, `practice_command_receipts`: `features/practice`
- `settings_kv`: `features/settings`
- `tracks`, `track_groups`, `track_group_problems`, `track_session`:
  `features/tracks`

Migration workflow:

```sh
npm run db:generate
npm run db:check
npm run check
```

Current persistence is snapshot-based. Exact shipped migration prefixes through
0007, 0008 and 0009 support staged preserving upgrades. Each upgrade retains the
original in its own recovery slot, applies only appended SQL, prepares feature
metadata, validates the result and publishes last. Failed or unsupported opens
retain the original rather than clearing and reseeding. Matching current opens
validate existing Practice metadata without repairing or rotating it. Keep
historical SQL and snapshots unchanged; add a populated preservation test for
each persisted-shape change. See [Database And Persistence](docs/architecture.md#database-and-persistence)
and [Local Database Recovery](docs/testing.md#local-database-recovery).

Write rules:

- Keep multi-table writes transactional.
- Keep review scheduling writes behind `features/practice/data`.
- Use Drizzle through the app `Db` proxy so mutation hooks can persist snapshots.
- Keep raw SQLite calls inside platform setup, tests, or migration plumbing.

## Testing

Use Vitest and React Testing Library. Keep tests behavior-focused and local to
the code they protect.

- Unit test pure domain logic, reducers, serializers, parsing, scheduling, and
  validation.
- Component test visible behavior and accessibility semantics with Testing
  Library queries.
- Hook test returned state, actions, async transitions, and runtime calls.
- Integration test DB migrations, repositories, runtime handlers, and workflows
  crossing feature boundaries.
- Use `satisfies` for fixtures when validating app contracts.
- Avoid snapshots and CSS assertions unless they protect a meaningful contract.
- Prefer one high-signal integration test over duplicated low-signal unit tests.

Run before handing off substantial changes:

```sh
npm run check
npm run format
```

For docs-only changes, run Prettier on the changed markdown files. Do not claim
runtime validation unless `npm run check` or focused runtime tests were actually
run.

For any behavior-changing code, run and document real-time happy-path and
edge-case manual smoke tests before PR review or merge. Attach a screenshot or
screen recording for UI and UX proof. Manual smoke testing and visual proof may
be N/A only for docs/governance-only changes that do not touch app behavior.

If an existing branch is already failing, state the exact failing command and
test instead of hiding it.

## Common Change Checklists

Use `docs/architecture.md` for the full recipes.

- Runtime method: feature contract, feature API sender/hook, protocol map,
  runtime policy, handler registration, feature service, repository if needed,
  invalidation tags, focused tests.
- Database change: schema file, schema export, migration generation, seed update
  if needed, repository tests, `npm run db:check`.
- Dashboard route or modal: route manifest, route tree, screen file, route
  tests, feature screen when behavior is feature-owned.
- Feature mutation: Zod input, authorized runtime command, service rule,
  repository write, snapshot-safe mutation path, invalidation tags,
  service/handler/UI tests.
- Popup change: app-shell read model or popup controller first, popup components
  only for presentation, compact surface behavior preserved.
- Overlay change: overlay-session state and hooks first, leetcode-capture or
  `lib/leetcode` for page reads, collapsed/expanded/docked recovery preserved.

## Skill-Driven Agent Workflow

Agents should work from explicit skills and specs, not vibes.

Use these skills as lenses:

- `bulletproof-react-auditor`: structure, ownership, boundaries
- `react-2026`: stack fit and modern React defaults
- `react-composition-2026`: component API shape and prop complexity
- `hooks-pattern`: reusable stateful logic
- `presentational-container-pattern`: view/workflow separation
- `hoc-pattern` and `render-props-pattern`: mostly to avoid them unless needed
- `typescript-core`: strict typing, runtime validation, `satisfies`
- `drizzle-orm`: schema, repository, transaction, query safety
- `vitest`: test scope, mocks, async behavior, Testing Library usage

Recommended agent flow:

1. State the spec or product behavior being changed.
2. Ask one or more agents to inspect separate ownership areas.
3. Give each agent a read-only or disjoint write scope.
4. Merge findings into a small implementation plan.
5. Edit the minimum files needed.
6. Run focused validation first, then `npm run check` and `npm run format` for
   substantial changes.
7. Summarize what changed, what owns it, and any remaining risk.

Agent safety rules:

- Do not let two agents edit the same file set.
- Do not revert changes you did not make.
- Do not add architecture layers only because a skill mentions them.
- Prefer deleting stale ceremony over adding new wrappers.
- Keep generated docs honest about current behavior and failing checks.

## Review Checklist

- Does the change respect feature ownership?
- Are runtime payloads validated at the boundary?
- Are database writes owned by the right repository?
- Are multi-table writes transactional?
- Is UI state local unless it truly crosses components or surfaces?
- Did tests cover behavior rather than implementation details?
- Did the change avoid new ceremony for a small app?
- Did the appropriate validation pass, or are failures documented?
