import {
  Loader2,
  Plus,
  Search,
  X,
  ArrowDown,
  ArrowUp,
  Pencil,
  ChevronDown,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { InlineStatus } from '@/components/ui/inline-status'
import type { ProblemLibraryRow } from '@/features/problems'
import { cn } from '@/utils/cn'

import {
  useCreateTrack,
  useTrackForEdit,
  useUpdateTrack,
} from '../api/tracks-api'
import type {
  SerializedTrack,
  TrackForEditResponse,
  TracksCreateTrackRequest,
  TracksUpdateTrackRequest,
} from '../api/tracks-contracts'
import { getDateInputMin } from '../domain'
import { TrackQuestionGroupMenu } from './track-question-group-menu'
import {
  trackFormGroupByOptions,
  type TrackFormInitialDraft,
} from '../hooks/track-form-initial-draft'
import {
  useTrackForm,
  type TrackFormFieldErrors,
  type TrackFormGroupState,
} from '../hooks/use-track-form'

type TrackFormProps =
  | {
      initialDraft?: TrackFormInitialDraft | undefined
      mode: 'create'
      onCancel: () => void
      onSaved: () => void
    }
  | {
      mode: 'edit'
      onCancel: () => void
      onLoaded?: ((track: SerializedTrack) => void) | undefined
      onSaved: () => void
      trackId: string
    }

export function TrackForm(props: TrackFormProps) {
  const trackId = props.mode === 'edit' ? props.trackId : undefined
  const onLoaded = props.mode === 'edit' ? props.onLoaded : undefined
  const loadedTrackIdRef = useRef<string | null>(null)
  const editQuery = useTrackForEdit(
    trackId ? { surface: 'dashboard', trackId } : { surface: 'dashboard' },
  )

  useEffect(() => {
    const track = editQuery.data?.track

    if (!track || loadedTrackIdRef.current === track.id) {
      return
    }

    loadedTrackIdRef.current = track.id
    onLoaded?.(track)
  }, [editQuery.data?.track, onLoaded])

  if (editQuery.isPending) {
    return (
      <InlineStatus>
        <Loader2 aria-hidden="true" className="animate-spin" />
        Loading track form…
      </InlineStatus>
    )
  }

  if (editQuery.isError || !editQuery.data) {
    return (
      <InlineStatus role="alert" tone="danger">
        Failed to load track form.
      </InlineStatus>
    )
  }

  if (props.mode === 'edit' && !editQuery.data.track) {
    return (
      <InlineStatus role="alert" tone="danger">
        Track not found.
      </InlineStatus>
    )
  }

  return (
    <TrackFormFields
      initialDraft={props.mode === 'create' ? props.initialDraft : undefined}
      key={
        editQuery.data.track?.id ??
        (props.mode === 'create' && props.initialDraft
          ? `create:${props.initialDraft.id}`
          : props.mode)
      }
      mode={props.mode}
      onCancel={props.onCancel}
      onSaved={props.onSaved}
      source={editQuery.data}
      trackId={trackId}
    />
  )
}

function TrackFormFields({
  initialDraft,
  mode,
  onCancel,
  onSaved,
  source,
  trackId,
}: {
  initialDraft?: TrackFormInitialDraft | undefined
  mode: 'create' | 'edit'
  onCancel: () => void
  onSaved: () => void
  source: TrackForEditResponse
  trackId?: string | undefined
}) {
  const createTrack = useCreateTrack()
  const updateTrack = useUpdateTrack()
  const { canSubmit, dispatch, fieldErrors, payload, selectedGroup, state } =
    useTrackForm(source, initialDraft ? { initialDraft } : {})
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setSearchFocused] = useState(false)
  const [renamingGroupKey, setRenamingGroupKey] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const shouldShowGroupBy = mode === 'create' && Boolean(initialDraft)
  const pending = createTrack.isPending || updateTrack.isPending
  const errorId = 'track-form-error'
  const targetDateHelpId = 'track-target-date-help'
  const validationError = submitAttempted
    ? getFirstFieldError(fieldErrors)
    : null
  const visibleError = submitError ?? validationError
  const availableProblemRows = useMemo(
    () => mergeProblemRows(source.problemRows, initialDraft?.problemRows ?? []),
    [initialDraft?.problemRows, source.problemRows],
  )
  const eligibleProblemSlugs = useMemo(
    () => new Set(source.externalProgressProblemSlugs),
    [source.externalProgressProblemSlugs],
  )
  const eligibleSelectedCount = state.groups.reduce(
    (count, group) =>
      count +
      group.problemSlugs.filter((slug) => eligibleProblemSlugs.has(slug))
        .length,
    0,
  )
  const problemRowsBySlug = useMemo(
    () =>
      new Map(
        availableProblemRows.map((row) => [row.problem.slug, row] as const),
      ),
    [availableProblemRows],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitAttempted(true)
    setSubmitError(null)

    if (!canSubmit || !payload) {
      const firstInvalidGroupKey = Object.keys(fieldErrors.groupTitles)[0]

      if (firstInvalidGroupKey) {
        dispatch({ groupKey: firstInvalidGroupKey, type: 'select-group' })
        setRenamingGroupKey(firstInvalidGroupKey)
      }

      return
    }

    try {
      if (mode === 'create') {
        const request: TracksCreateTrackRequest = {
          ...payload,
          surface: 'dashboard',
        }

        if (state.setActiveAfterCreate) {
          request.setActive = true
        }

        await createTrack.mutateAsync(request)
      } else if (trackId) {
        const request: TracksUpdateTrackRequest = {
          ...payload,
          surface: 'dashboard',
          trackId,
        }

        await updateTrack.mutateAsync(request)
      }

      onSaved()
    } catch (caughtError) {
      setSubmitError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to save track.',
      )
    }
  }

  return (
    <form
      autoComplete="off"
      className="grid gap-5"
      noValidate
      onKeyDown={handleFormKeyDown}
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
    >
      {visibleError ? (
        <InlineStatus id={errorId} role="alert" tone="danger">
          {visibleError}
        </InlineStatus>
      ) : null}

      <section className="grid gap-4" aria-label="Track metadata">
        {initialDraft ? (
          <InlineStatus>
            {initialDraft.selectedCount} selected Library problems
          </InlineStatus>
        ) : null}
        <TrackTextField
          describedBy={
            submitAttempted && fieldErrors.title ? errorId : undefined
          }
          invalid={submitAttempted && Boolean(fieldErrors.title)}
          label="Title"
          name="track-title"
          onChange={(title) => dispatch({ type: 'set-title', title })}
          required
          value={state.title}
        />
        <TrackTextareaField
          label="Description"
          name="track-description"
          onChange={(description) =>
            dispatch({ type: 'set-description', description })
          }
          value={state.description}
        />
        <div
          className={cn('grid gap-4', shouldShowGroupBy && 'md:grid-cols-2')}
        >
          <TargetDateField
            describedBy={
              submitAttempted && fieldErrors.dueAt
                ? `${targetDateHelpId} ${errorId}`
                : targetDateHelpId
            }
            helperId={targetDateHelpId}
            invalid={submitAttempted && Boolean(fieldErrors.dueAt)}
            min={getDateInputMin(state.dueAt, state.initialDueAt)}
            onChange={(dueAt) => dispatch({ type: 'set-due-at', dueAt })}
            onClear={() => dispatch({ dueAt: '', type: 'set-due-at' })}
            value={state.dueAt}
          />
          {shouldShowGroupBy && initialDraft ? (
            <TrackSelectField
              label="Group by"
              name="track-group-by"
              onChange={(groupBy) =>
                dispatch({
                  groupBy,
                  problemRows: initialDraft.problemRows,
                  type: 'set-group-by',
                })
              }
              options={trackFormGroupByOptions}
              value={state.groupBy}
            />
          ) : null}
        </div>
        {mode === 'create' ? (
          <label className="inline-flex min-h-[var(--cp-control-height)] w-fit items-center gap-2 text-[length:var(--cp-control-font-size)] font-semibold text-foreground">
            <input
              checked={state.setActiveAfterCreate}
              className="size-4 rounded border-border accent-primary"
              name="track-set-active"
              onChange={(event) =>
                dispatch({
                  checked: event.target.checked,
                  type: 'set-active-after-create',
                })
              }
              type="checkbox"
            />
            <span>Set as active track</span>
          </label>
        ) : null}
        <div className="grid gap-1">
          <label className="inline-flex min-h-[var(--cp-control-height)] w-fit items-center gap-2 text-[length:var(--cp-control-font-size)] font-semibold text-foreground">
            <input
              checked={state.allowExternalProgress}
              className="size-4 rounded border-border accent-primary"
              name="track-allow-external-progress"
              aria-describedby="track-external-progress-help"
              onChange={(event) =>
                dispatch({
                  type: 'set-allow-external-progress',
                  checked: event.target.checked,
                })
              }
              type="checkbox"
            />
            <span>Allow external progress</span>
          </label>
          <p
            id="track-external-progress-help"
            className="m-0 text-[length:var(--cp-badge-font-size)] text-muted-foreground"
          >
            Count successful solves from anywhere in CogniPace, including
            earlier solves.
          </p>
          {state.allowExternalProgress ? (
            <p
              aria-live="polite"
              className="m-0 text-[length:var(--cp-badge-font-size)] font-semibold text-primary"
            >
              {eligibleSelectedCount} selected{' '}
              {eligibleSelectedCount === 1 ? 'question' : 'questions'} can count
              earlier progress.
            </p>
          ) : null}
        </div>
      </section>

      <div
        aria-label="Track composition editor"
        className="grid min-w-0 gap-3"
        role="group"
      >
        <TrackGroupList
          dispatch={dispatch}
          fieldErrors={fieldErrors}
          groups={state.groups}
          nextGroupNumber={state.nextGroupNumber}
          renamingGroupKey={renamingGroupKey}
          selectedGroupKey={state.selectedGroupKey}
          setRenamingGroupKey={setRenamingGroupKey}
          showErrors={submitAttempted}
        >
          {selectedGroup ? (
            <>
              <TrackProblemSearch
                dispatch={dispatch}
                groups={state.groups}
                inputRef={searchInputRef}
                isSearchFocused={isSearchFocused}
                setSearchFocused={setSearchFocused}
                problemRows={availableProblemRows}
                searchQuery={searchQuery}
                selectedGroup={selectedGroup}
                setSearchQuery={setSearchQuery}
              />
              <SelectedGroupProblems
                dispatch={dispatch}
                eligibleProblemSlugs={
                  state.allowExternalProgress ? eligibleProblemSlugs : new Set()
                }
                groups={state.groups}
                problemRowsBySlug={problemRowsBySlug}
                onFocusSearch={() => {
                  searchInputRef.current?.focus()
                  setSearchFocused(false)
                }}
                selectedGroup={selectedGroup}
              />
            </>
          ) : null}
        </TrackGroupList>
      </div>

      <div
        aria-label="Track form actions"
        className="-mx-[var(--cp-panel-padding)] sticky bottom-0 z-10 mt-1 flex justify-end gap-3 border-t border-border bg-card px-[var(--cp-panel-padding)] py-4"
        role="group"
      >
        <Button onClick={onCancel} type="button" variant="ghost">
          CANCEL
        </Button>
        <Button disabled={pending} type="submit">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          SAVE
        </Button>
      </div>
    </form>
  )
}

function TrackProblemSearch({
  dispatch,
  groups,
  inputRef,
  isSearchFocused,
  setSearchFocused,
  problemRows,
  searchQuery,
  selectedGroup,
  setSearchQuery,
}: {
  dispatch: ReturnType<typeof useTrackForm>['dispatch']
  groups: readonly TrackFormGroupState[]
  inputRef: RefObject<HTMLInputElement | null>
  isSearchFocused: boolean
  setSearchFocused: (focused: boolean) => void
  problemRows: readonly ProblemLibraryRow[]
  searchQuery: string
  selectedGroup: TrackFormGroupState
  setSearchQuery: (searchQuery: string) => void
}) {
  const normalizedSearchQuery = searchQuery.trim()
  const hasSearchQuery = normalizedSearchQuery.length > 0
  const selectedProblemSlugSet = new Set(
    groups.flatMap((group) => group.problemSlugs),
  )
  const shouldShowSuggestions = isSearchFocused || hasSearchQuery
  const filteredProblemRows = shouldShowSuggestions
    ? problemRows
        .filter(
          (row) =>
            !selectedProblemSlugSet.has(row.problem.slug) &&
            (!hasSearchQuery ||
              matchesProblemSearch(row, normalizedSearchQuery)),
        )
        .slice(0, 5)
    : []
  const showSuggestionPanel =
    shouldShowSuggestions && (filteredProblemRows.length > 0 || hasSearchQuery)

  function handleBlur(event: FocusEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget

    if (
      nextTarget instanceof Node &&
      event.currentTarget.contains(nextTarget)
    ) {
      return
    }

    setSearchFocused(false)
  }

  return (
    <section
      aria-label="Track problem search"
      className="relative z-20"
      onBlur={handleBlur}
    >
      <TrackTextField
        inputRef={inputRef}
        icon={<Search aria-hidden="true" />}
        label="Search Library problems"
        name="track-problem-search"
        onChange={setSearchQuery}
        onClick={() => setSearchFocused(true)}
        onFocus={() => setSearchFocused(true)}
        type="search"
        value={searchQuery}
      />
      {showSuggestionPanel ? (
        <div
          aria-label="Library problem suggestions"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-56 overflow-y-auto rounded-[var(--cp-control-radius)] border border-border bg-popover p-2 text-popover-foreground shadow-lg"
          role="region"
        >
          {filteredProblemRows.length > 0 ? (
            <div
              aria-label="Library problem results"
              className="grid gap-2"
              role="list"
            >
              {filteredProblemRows.map((row) => (
                <ProblemSearchResult
                  key={row.problem.slug}
                  onAdd={() => {
                    dispatch({
                      groupKey: selectedGroup.key,
                      problemSlug: row.problem.slug,
                      type: 'add-problem',
                    })
                    setSearchQuery('')
                    inputRef.current?.focus()
                    setSearchFocused(false)
                  }}
                  row={row}
                />
              ))}
            </div>
          ) : (
            <InlineStatus>No matching Library problems.</InlineStatus>
          )}
        </div>
      ) : null}
    </section>
  )
}

function TrackGroupList({
  children,
  dispatch,
  fieldErrors,
  groups,
  nextGroupNumber,
  renamingGroupKey,
  selectedGroupKey,
  setRenamingGroupKey,
  showErrors,
}: {
  children: ReactNode
  dispatch: ReturnType<typeof useTrackForm>['dispatch']
  fieldErrors: TrackFormFieldErrors
  groups: readonly TrackFormGroupState[]
  nextGroupNumber: number
  renamingGroupKey: string | null
  selectedGroupKey: string | null
  setRenamingGroupKey: (groupKey: string | null) => void
  showErrors: boolean
}) {
  return (
    <section className="grid min-w-0 content-start gap-3" aria-label="Groups">
      <div
        aria-label="Track groups header"
        className={cn(editorPaneHeaderClassName, 'justify-between')}
      >
        <h3 className="m-0 text-[length:var(--cp-copy-font-size)] font-bold text-foreground">
          Groups
        </h3>
        <Button
          onClick={() => {
            dispatch({ type: 'add-group' })
            setRenamingGroupKey(`new-group-${nextGroupNumber}`)
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" />
          New Group
        </Button>
      </div>
      <div aria-label="Track groups" className="grid min-w-0 gap-3" role="list">
        {groups.map((group, index) => {
          const displayTitle = getGroupDisplayTitle(group, index)
          const isSelected = group.key === selectedGroupKey
          const groupTitleError = fieldErrors.groupTitles[group.key]
          return (
            <div
              aria-label={`${displayTitle}, ${formatProblemCount(group.problemSlugs.length)}`}
              className={cn(
                'grid min-w-0 gap-3 rounded-[var(--cp-control-radius)] border border-border bg-background/30 p-3',
                isSelected && 'border-primary bg-muted/20',
              )}
              key={group.key}
              role="listitem"
            >
              <div className="grid min-w-0 grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <button
                  aria-label={`Select ${displayTitle}`}
                  aria-controls={`track-group-panel-${group.key}`}
                  aria-expanded={isSelected}
                  className="grid min-w-0 justify-items-start gap-1 rounded-[var(--cp-control-radius)] px-1 py-1 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    dispatch({ groupKey: group.key, type: 'toggle-group' })
                    setRenamingGroupKey(null)
                  }}
                  type="button"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 size-4 shrink-0 transition-transform',
                        !isSelected && '-rotate-90',
                      )}
                    />
                    <span className="min-w-0 break-words text-[length:var(--cp-copy-font-size)] font-bold text-foreground">
                      {displayTitle}
                    </span>
                  </span>
                  <span className="pl-6 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
                    {formatProblemCount(group.problemSlugs.length)}
                  </span>
                </button>
                <div className="flex flex-wrap justify-end gap-1">
                  <IconButton
                    className="w-8 px-0"
                    label={`Rename ${displayTitle}`}
                    onClick={() => {
                      dispatch({ groupKey: group.key, type: 'select-group' })
                      setRenamingGroupKey(
                        renamingGroupKey === group.key ? null : group.key,
                      )
                    }}
                    size="sm"
                    tooltip="Rename group"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    className="w-8 px-0"
                    disabled={index === 0}
                    label={`Move ${displayTitle} up`}
                    onClick={() =>
                      dispatch({
                        direction: 'up',
                        groupKey: group.key,
                        type: 'move-group',
                      })
                    }
                    size="sm"
                    tooltip="Move up"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowUp aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    className="w-8 px-0"
                    disabled={index === groups.length - 1}
                    label={`Move ${displayTitle} down`}
                    onClick={() =>
                      dispatch({
                        direction: 'down',
                        groupKey: group.key,
                        type: 'move-group',
                      })
                    }
                    size="sm"
                    tooltip="Move down"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowDown aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    className="w-8 px-0"
                    disabled={
                      groups.length <= 1 || group.problemSlugs.length > 0
                    }
                    label={`Remove ${displayTitle}`}
                    onClick={() =>
                      dispatch({ groupKey: group.key, type: 'remove-group' })
                    }
                    size="sm"
                    tooltip="Remove empty group"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
              {isSelected ? (
                <div
                  id={`track-group-panel-${group.key}`}
                  className="grid min-w-0 gap-4"
                >
                  {renamingGroupKey === group.key ? (
                    <TrackTextField
                      autoFocus
                      describedBy={
                        showErrors && groupTitleError
                          ? 'track-form-error'
                          : undefined
                      }
                      invalid={showErrors && Boolean(groupTitleError)}
                      label="Group title"
                      name={`track-group-${index + 1}-title`}
                      onChange={(title) =>
                        dispatch({
                          groupKey: group.key,
                          title,
                          type: 'rename-group',
                        })
                      }
                      required
                      value={group.title}
                    />
                  ) : null}
                  {children}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SelectedGroupProblems({
  dispatch,
  eligibleProblemSlugs,
  groups,
  problemRowsBySlug,
  onFocusSearch,
  selectedGroup,
}: {
  dispatch: ReturnType<typeof useTrackForm>['dispatch']
  eligibleProblemSlugs: ReadonlySet<string>
  groups: readonly TrackFormGroupState[]
  problemRowsBySlug: ReadonlyMap<string, ProblemLibraryRow>
  onFocusSearch: () => void
  selectedGroup: TrackFormGroupState
}) {
  return (
    <section
      aria-label="Selected group problems"
      className="grid min-w-0 gap-3"
    >
      <div
        aria-label="Selected group problems header"
        className={cn(editorPaneHeaderClassName, 'flex-wrap gap-y-1')}
      >
        <h3 className="m-0 break-words text-[length:var(--cp-copy-font-size)] font-bold text-foreground">
          Questions
        </h3>
        <p className="m-0 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
          {selectedGroup.problemSlugs.length} selected
        </p>
      </div>
      <OrderedProblemList
        dispatch={dispatch}
        eligibleProblemSlugs={eligibleProblemSlugs}
        groups={groups}
        problemRowsBySlug={problemRowsBySlug}
        onFocusSearch={onFocusSearch}
        selectedGroup={selectedGroup}
      />
    </section>
  )
}

function OrderedProblemList({
  dispatch,
  eligibleProblemSlugs,
  groups,
  problemRowsBySlug,
  onFocusSearch,
  selectedGroup,
}: {
  dispatch: ReturnType<typeof useTrackForm>['dispatch']
  eligibleProblemSlugs: ReadonlySet<string>
  groups: readonly TrackFormGroupState[]
  problemRowsBySlug: ReadonlyMap<string, ProblemLibraryRow>
  onFocusSearch: () => void
  selectedGroup: TrackFormGroupState
}) {
  const [openMenuSlug, setOpenMenuSlug] = useState<string | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const pendingFocusSlugRef = useRef<string | null | undefined>(undefined)
  useLayoutEffect(() => {
    if (pendingFocusSlugRef.current === undefined) return
    const targetSlug = pendingFocusSlugRef.current
    const row = Array.from(
      rowsRef.current?.querySelectorAll<HTMLElement>('[data-problem-slug]') ??
        [],
    ).find((element) => element.dataset.problemSlug === targetSlug)
    const control = row?.querySelector<HTMLButtonElement>(
      'button:not([disabled])',
    )
    if (control) control.focus()
    else onFocusSearch()
    pendingFocusSlugRef.current = undefined
  }, [onFocusSearch, selectedGroup.problemSlugs])

  function moveProblem(problemSlug: string, toGroupKey: string) {
    const index = selectedGroup.problemSlugs.indexOf(problemSlug)
    pendingFocusSlugRef.current =
      selectedGroup.problemSlugs[index + 1] ??
      selectedGroup.problemSlugs[index - 1] ??
      null
    setOpenMenuSlug(null)
    dispatch({
      fromGroupKey: selectedGroup.key,
      problemSlug,
      toGroupKey,
      type: 'move-problem-to-group',
    })
  }

  return (
    <div
      aria-label="Selected problem rows"
      className="min-w-0"
      ref={rowsRef}
      role="region"
    >
      {selectedGroup.problemSlugs.length === 0 ? (
        <InlineStatus>No problems in this group.</InlineStatus>
      ) : (
        <ol
          aria-label="Selected problems"
          className="m-0 grid list-none gap-2 p-0"
        >
          {selectedGroup.problemSlugs.map((problemSlug, index) => {
            const row = problemRowsBySlug.get(problemSlug)
            const title = row?.problem.title ?? problemSlug
            return (
              <li
                aria-label={`${index + 1}. ${title}`}
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-[var(--cp-control-radius)] border border-border bg-background/30 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                data-problem-slug={problemSlug}
                key={problemSlug}
              >
                <span className="pt-1 text-[length:var(--cp-badge-font-size)] font-bold text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <ProblemSummary compact title={title} slug={problemSlug} />
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
                    {row && row.problem.difficulty !== 'unknown' ? (
                      <span>
                        {row.problem.difficulty.charAt(0).toUpperCase() +
                          row.problem.difficulty.slice(1)}
                      </span>
                    ) : null}
                    {eligibleProblemSlugs.has(problemSlug) ? (
                      <span className="font-semibold text-primary">
                        Previously solved
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="col-start-2 flex flex-wrap justify-end gap-1 sm:col-start-auto">
                  {groups.length > 1 ? (
                    <TrackQuestionGroupMenu
                      destinations={groups.filter(
                        (group) => group.key !== selectedGroup.key,
                      )}
                      isOpen={openMenuSlug === problemSlug}
                      onMove={(toGroupKey) =>
                        moveProblem(problemSlug, toGroupKey)
                      }
                      onOpenChange={(open) =>
                        setOpenMenuSlug(open ? problemSlug : null)
                      }
                      title={title}
                    />
                  ) : null}
                  <IconButton
                    className="w-8 px-0"
                    disabled={index === 0}
                    label={`Move ${title} up`}
                    onClick={() =>
                      dispatch({
                        direction: 'up',
                        groupKey: selectedGroup.key,
                        problemSlug,
                        type: 'move-problem',
                      })
                    }
                    size="sm"
                    tooltip="Move up"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowUp aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    className="w-8 px-0"
                    disabled={index === selectedGroup.problemSlugs.length - 1}
                    label={`Move ${title} down`}
                    onClick={() =>
                      dispatch({
                        direction: 'down',
                        groupKey: selectedGroup.key,
                        problemSlug,
                        type: 'move-problem',
                      })
                    }
                    size="sm"
                    tooltip="Move down"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowDown aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    className="w-8 px-0"
                    label={`Remove ${title}`}
                    onClick={() =>
                      dispatch({
                        groupKey: selectedGroup.key,
                        problemSlug,
                        type: 'remove-problem',
                      })
                    }
                    size="sm"
                    tooltip="Remove"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" />
                  </IconButton>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function ProblemSearchResult({
  onAdd,
  row,
}: {
  onAdd: () => void
  row: ProblemLibraryRow
}) {
  return (
    <div aria-label={row.problem.title} className="min-w-0" role="listitem">
      <button
        aria-label={`Add ${row.problem.title}`}
        className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--cp-control-radius)] border border-border px-3 py-2 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
        onClick={onAdd}
        type="button"
      >
        <ProblemSummary
          compact
          slug={row.problem.slug}
          title={row.problem.title}
        />
        <Plus aria-hidden="true" />
      </button>
    </div>
  )
}

function ProblemSummary({
  compact = false,
  slug,
  title,
}: {
  compact?: boolean | undefined
  slug: string
  title: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 max-w-full break-words text-[length:var(--cp-copy-font-size)] font-bold text-foreground">
          {title}
        </span>
      </div>
      {compact ? null : (
        <p className="m-0 mt-1 truncate text-[length:var(--cp-badge-font-size)] text-muted-foreground">
          {slug}
        </p>
      )}
    </div>
  )
}

function TrackTextField({
  autoFocus = false,
  describedBy,
  icon,
  invalid = false,
  inputRef,
  label,
  name,
  onBlur,
  onChange,
  onClick,
  onFocus,
  onKeyDown,
  required = false,
  type = 'text',
  value,
}: {
  autoFocus?: boolean
  describedBy?: string | undefined
  inputRef?: RefObject<HTMLInputElement | null>
  icon?: ReactNode | undefined
  invalid?: boolean
  label: string
  name: string
  onBlur?: ((event: FocusEvent<HTMLInputElement>) => void) | undefined
  onChange: (value: string) => void
  onClick?: (() => void) | undefined
  onFocus?: ((event: FocusEvent<HTMLInputElement>) => void) | undefined
  onKeyDown?: ((event: KeyboardEvent<HTMLInputElement>) => void) | undefined
  required?: boolean
  type?: 'date' | 'search' | 'text'
  value: string
}) {
  return (
    <label className="relative block pt-2">
      <span className={floatingLabelClassName}>{label}</span>
      {icon ? (
        <span className="pointer-events-none absolute left-3 top-[1.15rem] z-10 text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <input
        autoFocus={autoFocus}
        ref={inputRef}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className={cn(fieldClassName, icon && 'pl-9')}
        name={name}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        onClick={onClick}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        required={required}
        type={type}
        value={value}
      />
    </label>
  )
}

function TargetDateField({
  describedBy,
  helperId,
  invalid,
  min,
  onChange,
  onClear,
  value,
}: {
  describedBy: string
  helperId: string
  invalid: boolean
  min?: string | undefined
  onChange: (value: string) => void
  onClear: () => void
  value: string
}) {
  return (
    <div className="grid gap-1">
      <div className="flex min-w-0 items-start gap-2">
        <label className="relative block min-w-0 flex-1 pt-2">
          <span className={floatingLabelClassName}>Target date</span>
          <input
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            autoComplete="off"
            className={fieldClassName}
            min={min}
            name="track-due-at"
            onChange={(event) => onChange(event.target.value)}
            type="date"
            value={value}
          />
        </label>
        {value ? (
          <IconButton
            className="mt-3 shrink-0"
            label="Clear target date"
            onClick={onClear}
            size="sm"
            tooltip="Clear target date"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>
      <p
        className="m-0 text-[length:var(--cp-badge-font-size)] text-muted-foreground"
        id={helperId}
      >
        Optional finish target for this track.
      </p>
    </div>
  )
}

function TrackSelectField<TValue extends string>({
  label,
  name,
  onChange,
  options,
  value,
}: {
  label: string
  name: string
  onChange: (value: TValue) => void
  options: ReadonlyArray<{ label: string; value: TValue }>
  value: TValue
}) {
  return (
    <label className="relative block pt-2">
      <span className={floatingLabelClassName}>{label}</span>
      <select
        className={fieldClassName}
        name={name}
        onChange={(event) => onChange(event.target.value as TValue)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function TrackTextareaField({
  label,
  name,
  onChange,
  value,
}: {
  label: string
  name: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="relative block pt-2">
      <span className={floatingLabelClassName}>{label}</span>
      <textarea
        autoComplete="off"
        className={cn(fieldClassName, 'min-h-24 resize-y py-3')}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  )
}

function getFirstFieldError(fieldErrors: TrackFormFieldErrors) {
  if (fieldErrors.title) {
    return fieldErrors.title
  }

  if (fieldErrors.dueAt) {
    return fieldErrors.dueAt
  }

  if (fieldErrors.groups) {
    return fieldErrors.groups
  }

  if (fieldErrors.problemSlugs) {
    return fieldErrors.problemSlugs
  }

  return Object.values(fieldErrors.groupTitles)[0] ?? null
}

function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter') {
    return
  }

  const target = event.target

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement
  ) {
    event.preventDefault()
  }
}

function getGroupDisplayTitle(group: TrackFormGroupState, index: number) {
  return group.title.trim() || `Group ${index + 1}`
}

function formatProblemCount(count: number) {
  return `${count} ${count === 1 ? 'problem' : 'problems'}`
}

function matchesProblemSearch(row: ProblemLibraryRow, searchQuery: string) {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  if (normalizedSearchQuery.length === 0) {
    return true
  }

  return `${row.problem.title} ${row.problem.slug}`
    .toLowerCase()
    .includes(normalizedSearchQuery)
}

function mergeProblemRows(
  sourceRows: readonly ProblemLibraryRow[],
  draftRows: readonly ProblemLibraryRow[],
) {
  const rowsBySlug = new Map<string, ProblemLibraryRow>()

  for (const row of [...sourceRows, ...draftRows]) {
    rowsBySlug.set(row.problem.slug, row)
  }

  return [...rowsBySlug.values()]
}

const floatingLabelClassName =
  'absolute left-3 top-0 z-10 max-w-[calc(100%-1.5rem)] truncate bg-card px-1 text-[length:var(--cp-badge-font-size)] font-semibold leading-none text-muted-foreground'

const fieldClassName =
  'h-[var(--cp-control-height-lg)] w-full rounded-[var(--cp-control-radius)] border border-border bg-background px-3 pt-1 text-[length:var(--cp-control-font-size)] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70'

const editorPaneHeaderClassName =
  'flex min-h-[var(--cp-control-height-sm)] min-w-0 items-center gap-3'
