# Remove from Track Implementation Plan

> Execute inline with superpowers:executing-plans.

**Goal:** Remove one problem from the current track beside Edit.

**Architecture:** Tracks owns a focused membership mutation. The shared problem
footer accepts an optional action beside Edit; Library behavior stays unchanged.

**Tech Stack:** React, existing runtime messaging, Zod, Drizzle, Vitest.

- [x] Add failing repository tests in tracks-repository.test.ts for isolated
      removal, compact order, repeated removal, missing track, and the final problem.
- [x] Add failing tracks-screen.test.tsx tests for removal, refreshed rows,
      pending disable, and inline error/retry.
- [x] Add contracts and dashboard-only policy coverage plus handler flush and
      invalidation coverage using the existing expectTrackWrite helper.
- [x] Implement removeProblem in tracks-repository.ts: within a transaction,
      require the track, delete only its slug membership, compact the affected group,
      and update track timestamp. Keep the group, Library problem, and practice data.
- [x] Wire tracks.removeProblem through tracks-contracts.ts, tracks-service.ts,
      tracks-api.ts, messaging.ts, runtime-policy.ts, and register-handlers.ts.
- [x] Add track-problem-remove-action.tsx with pending/error/retry and inject
      beside Edit through an optional shared footer action slot.
- [x] Update product and testing docs with the removal and smoke flows.
- [x] Run npm run test -- followed by the focused modified test paths; then
      npm run lint, npm run check, npm run build, npm run format.
- [x] Inspect diff, report exact results and pending human smoke proof.

Done when automated checks pass and the button removes only the current track
membership. Human smoke: remove a middle and final problem; check Library,
other tracks, progress and Next; capture the footer and resulting state.

## Validation record

Passed:

```sh
npm run test -- src/features/tracks/data/tracks-repository.test.ts src/features/tracks/components/tracks-screen.test.tsx src/features/tracks/api/tracks-contracts.test.ts src/features/tracks/api/tracks-api.test.tsx src/extension/background/runtime-policy.test.ts src/extension/background/register-handlers.test.ts
npm run lint
npm run check
npm run build
npm run format
git diff --check
```

Focused suite: 177 tests. Full check: 185 files, 1,883 tests; includes db:check,
typecheck, lint, and the full test suite. The suite emitted existing jsdom
scrollTo notices. Test-first runs failed for missing removal UI, repository
method, runtime policy, and schema; a missing seeded test slug and a collapsed
row assertion were corrected before the successful focused run.

Skipped: `npm run db:generate` because no schema changed; `npm run zip` because
packaging was not changed. Human Chrome happy-path and edge-case smoke and
screenshot/recording proof remain pending in docs/testing.md#remove-from-track.
No manual or visual proof is claimed. Existing user changes remain in stash@{0}.

Release: feat(tracks): add remove-from-track action. No new permissions, schema,
secrets, or sync behavior; existing mutation snapshot and invalidation handling
is reused. Removing a membership clears only its track completion via existing
foreign-key cascade. Rollback: revert the change; re-add a removed problem via
Edit Track if needed (its global practice history remains).

## Visual follow-up

At the user's request, the button uses the existing destructive red text and
hover background with an aria-hidden ListMinus icon. The accessible label stays
“Remove from track”. The 34-test TracksScreen suite, full check (1,883 tests),
lint, build, and focused Prettier check passed after this change. Human smoke
results and screenshots are still pending; create the PR as draft.
