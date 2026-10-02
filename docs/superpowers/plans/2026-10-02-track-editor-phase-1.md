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

- [ ] Add behavior tests for full-width group sections, explicit rename,
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

- [ ] Run `rtk npm run test -- src/features/tracks/components/track-form.test.tsx`
      and confirm the new accessibility/rename expectations fail before edits.
- [ ] Replace the two-column fixed-height panes with a list of group sections.
      Use the existing `selectedGroupKey`; only the selected section contains
      rename, search, and ordered questions. New groups reveal rename immediately;
      Save reveals the first invalid group/title field.
- [ ] Use wrapping titles and a responsive row layout. Question controls move
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

- [ ] Run the component and route tests. Preserve create/edit/Library-selection
      behavior, duplicate exclusion, empty-group rules, activation, validation,
      loading/errors, and payload order.

## Task 2: Change Button Menu

**Files:**

- Create if useful: `src/features/tracks/components/track-question-group-menu.tsx`
- Modify: `src/features/tracks/components/track-form.tsx`
- Test: `src/features/tracks/components/track-form.test.tsx`

- [ ] Add a failing test that clicks a button and selects a destination by
      `menuitem`; cover Escape closing the menu without closing the modal and
      focus moving to a surviving source control after successful movement.

```tsx
await user.click(screen.getByRole('button', { name: 'Change group for Two Sum' }))
expect(screen.getByRole('menu')).toBeVisible()
await user.click(screen.getByRole('menuitem', { name: 'Dynamic Programming' }))
expect(screen.queryByRole('menu')).not.toBeInTheDocument()
```

- [ ] Run the component test and confirm the missing-button failure.
- [ ] Implement a compact Button with `type="button"`, `aria-haspopup="menu"`,
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

- [ ] Add first-item focus, Arrow/Home/End navigation, Enter/Space activation,
      Escape with propagation stopped, outside/Tab dismissal, and end-aligned
      menu collision handling. Bound menu height and allow destination scrolling.
      Use a feature-local component if extracting these interactions keeps the
      form understandable; do not add a generic component framework.
- [ ] Run focused tests, then browser-inspect a populated form at desktop and
      narrow widths. Treat agent browser evidence separately from required human
      application smoke.

## Task 3: Integration With External Progress Form Fields

This task starts after phase 3 publishes its contract. Owner: editor implementer.

**Files:**

- Modify: `src/features/tracks/hooks/use-track-form.ts`
- Modify: `src/features/tracks/components/track-form.tsx`
- Test: `src/features/tracks/hooks/use-track-form.test.tsx`
- Test: `src/features/tracks/components/track-form.test.tsx`

- [ ] Add failing tests for default-off creation, edit restoration, saving the
      boolean, and eligible selected-question count/Previously solved labels.
- [ ] Add reducer state/action and payload mapping using the phase 3 contract.

```ts
case 'set-allow-external-progress':
  return { ...state, allowExternalProgress: action.checked }
```

- [ ] Render Allow external progress in both modes and count the selected slugs
      intersecting `source.externalProgressProblemSlugs`. Keep this a preview of
      background-provided evidence; never derive eligibility from last rating.
- [ ] Run component/hook/route tests and format the touched maintained files.

## Done When

The approved preview is implemented with complete titles, working menus,
consistent create/edit flows, accurate external-progress drafts, and passing
focused tests. Human realtime happy-path/edge-case smoke and screenshot or
recording proof remain required before review or merge.
