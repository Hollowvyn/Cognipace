# Vertical Track Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved full-width group editor and Change button menu.

**Architecture:** Keep editor state in `use-track-form` and feature UI in Tracks.
Reuse the modal shell's scrolling and fixed-width constraints. Keep the existing
group/problem reducer actions and avoid new dependencies.

**Tech Stack:** React 19, TypeScript, existing Button/IconButton primitives,
Tailwind tokens, Vitest, Testing Library.

## Task 1: Accessible Group And Question Layout

**Files:**

- Modify: `src/features/tracks/components/track-form.tsx`
- Test: `src/features/tracks/components/track-form.test.tsx`
- Test: `src/app/dashboard/routes.test.tsx`

- [x] Add behavior tests for full-width group sections, explicit rename,
      selected-group Library picker, wrapping title content, and unchanged save
      ordering. Use role/label queries instead of CSS snapshots.

```tsx
await user.click(screen.getByRole('button', { name: 'Select Main' }))
expect(screen.getByRole('button', { name: 'Select Main' })).toHaveAttribute(
  'aria-expanded',
  'true',
)
await user.click(screen.getByRole('button', { name: 'Rename Main' }))
expect(screen.getByLabelText('Group title')).toHaveValue('Main')
```

- [x] Run `rtk npm run test -- src/features/tracks/components/track-form.test.tsx`
      and confirm the new accessibility/rename expectations fail before edits.
- [x] Replace the two-column fixed-height panes with a list of group sections.
      Use the existing `selectedGroupKey`; only the selected section contains
      rename, search, and ordered questions. New groups reveal rename immediately;
      Save reveals the first invalid group/title field.
- [x] Use wrapping titles and a responsive row layout. Question controls move
      below the title at narrow widths. Remove both `h-80` pane constraints and
      retain the sticky Save/Cancel footer.

```tsx
<li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
  <span>{index + 1}</span>
  <span className="min-w-0 break-words">{title}</span>
  <div className="col-start-2 flex flex-wrap justify-end gap-1 sm:col-start-auto">
    {actions}
  </div>
</li>
```

- [x] Run the component and route tests. Preserve create/edit/Library-selection
      behavior, duplicate exclusion, empty-group rules, activation, validation,
      loading/errors, and payload order.

## Task 2: Change Button Menu

**Files:**

- Create if useful: `src/features/tracks/components/track-question-group-menu.tsx`
- Modify: `src/features/tracks/components/track-form.tsx`
- Test: `src/features/tracks/components/track-form.test.tsx`

- [x] Add a failing test that clicks a button and selects a destination by
      `menuitem`; cover Escape closing the menu without closing the modal and
      focus moving to a surviving source control after successful movement.

```tsx
await user.click(screen.getByRole('button', { name: 'Change group for Two Sum' }))
expect(screen.getByRole('menu')).toBeVisible()
await user.click(screen.getByRole('menuitem', { name: 'Dynamic Programming' }))
expect(screen.queryByRole('menu')).not.toBeInTheDocument()
```

- [x] Run the component test and confirm the missing-button failure.
- [x] Implement a compact Button with `type="button"`, `aria-haspopup="menu"`,
      `aria-expanded`, and a chevron. Show full destination titles; omit the
      current group and omit Change when there is one group. Reuse the existing
      reducer command:

```ts
dispatch({
  type: 'move-problem-to-group',
  fromGroupKey: selectedGroup.key,
  toGroupKey: destination.key,
  problemSlug,
})
```

- [x] Add first-item focus, Arrow/Home/End navigation, Enter/Space activation,
      Escape with propagation stopped, outside/Tab dismissal, and end-aligned
      menu collision handling. Bound menu height and allow destination scrolling.
      Use a feature-local component if extracting these interactions keeps the
      form understandable; do not add a generic component framework.
- [x] Run focused tests, then browser-inspect a populated form at desktop and
      narrow widths. Treat agent browser evidence separately from required human
      application smoke.

## Task 3: Integration With External Progress Form Fields

This task starts after phase 3 publishes its contract. Owner: editor implementer.

**Files:**

- Modify: `src/features/tracks/hooks/use-track-form.ts`
- Modify: `src/features/tracks/components/track-form.tsx`
- Test: `src/features/tracks/hooks/use-track-form.test.tsx`
- Test: `src/features/tracks/components/track-form.test.tsx`

- [x] Add failing tests for default-off creation, edit restoration, saving the
      boolean, and eligible selected-question count/Previously solved labels.
- [x] Add reducer state/action and payload mapping using the phase 3 contract.

```ts
case 'set-allow-external-progress':
  return { ...state, allowExternalProgress: action.checked }
```

- [x] Render Allow external progress in both modes and count the selected slugs
      intersecting `source.externalProgressProblemSlugs`. Keep this a preview of
      background-provided evidence; never derive eligibility from last rating.
- [x] Run component/hook/route tests and format the touched maintained files.

## Done When

The approved preview is implemented with complete titles, working menus,
consistent create/edit flows, accurate external-progress drafts, and passing
focused tests. Human realtime happy-path/edge-case smoke and screenshot or
recording proof remain required before review or merge.

## Follow-up: Collapse The Open Group

The user requested this correction after trying the implemented editor. Allow
zero expanded groups while retaining the existing one-open-group behavior.
Header clicks toggle; Rename, New Group, and invalid-title Save explicitly open
the relevant group. Collapse changes only local form presentation.

- [x] Add failing component tests for click/keyboard collapse and reopen in
      create/edit mode, Rename reopening, and invalid-title Save from all closed.
- [x] Add a hook regression that collapse preserves the mutation payload,
      reorder/removal preserves all closed, and New Group opens the new section.
- [x] Make selectedGroupKey nullable and add toggle-group, retaining select-group
      for explicit opening. Render no question/search panel while all closed.
- [x] Run focused form/hook/routes tests, required check/build/format, and an
      implemented-component browser check. Update current docs and handoff;
      human extension smoke and visual proof remain pending before review/merge.

## Follow-up: Distinguish Group Headers From Question Rows

Approved by the user on 2026-10-02 through the **Section headers** preview.
Owner: focused form implementer; root owns documentation and full validation.

**Files:**

- Modify: `src/features/tracks/components/track-form.tsx`
- Validate: `src/features/tracks/components/track-form.test.tsx`
- Validate: `src/features/tracks/hooks/use-track-form.test.tsx`
- Validate: `src/app/dashboard/routes.test.tsx`
- Update: `docs/product.md`, `docs/testing.md`, and this feature's handoff.

- [x] Keep the outer group outline and remove its shared card padding/fill
      treatment from the header/body layout. Put padding on the shaded header
      and expanded body separately. Keep overflow visible so suggestions fit.
      The header uses semantic `bg-muted` tones, with stronger expanded state:

```tsx
className={cn(
  'grid min-w-0 grid-cols-1 items-start gap-2 rounded-[var(--cp-control-radius)] bg-muted/45 p-3 sm:grid-cols-[minmax(0,1fr)_auto]',
  isSelected && 'rounded-b-none border-b border-border bg-muted/80',
)}
```

- [x] Use a 16px bold wrapping group title and an adjacent quieter count at
      desktop; count and controls wrap at narrow widths. Preserve native header
      button, disclosure state, focus rings, labels, and action handlers.
- [x] Replace repeated question-card chrome with one divided list:

```tsx
<ol className="m-0 grid list-none divide-y divide-border p-0">
  <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
    {/* Existing order, full title, metadata, and controls. */}
  </li>
</ol>
```

      Use semibold selected-question titles through a scoped ProblemSummary
      title class; keep Library suggestion emphasis. Remove bold order-number
      weight. Do not alter reducers, request payloads, or menu implementation.
- [x] Apply the browser-confirmed form width constraint for large text: use
      `className="grid min-w-0 grid-cols-1 gap-5"` on TrackFormFields' form.
      At 200% root text scaling, its implicit auto grid column otherwise expands
      native fields beyond a narrow modal. Keep field/metadata behavior intact.
- [x] Keep Groups/New Group usable with large text by adding `flex-wrap` to
      Track groups header and `max-w-full` to the bold group-title span. Browser
      experiments confirmed these minimal additions prevent internal label
      overflow; count, metadata, footer, and action-row overrides are unnecessary.
- [x] Run existing focused tests before required full checks; no new tests that
      merely assert class strings for this reversible styling change:

```sh
rtk npm run test -- src/features/tracks/components/track-form.test.tsx src/features/tracks/hooks/use-track-form.test.tsx src/app/dashboard/routes.test.tsx
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
```

- [x] Review spec compliance, then source quality. Browser-inspect actual
      components at 736px and 320px in both themes, including full title wrapping,
      all controls, collapse/reopen, Change/menu focus, and unclipped Library
      suggestions. Inspect 200% text scaling, record screenshots and exact
      commands in the handoff, then commit with a Conventional Commit title.
      Human installed-extension smoke remains pending before PR review/merge.
