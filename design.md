---
name: Terra Compact
colors:
  surface: '#101414'
  surface-dim: '#101414'
  surface-bright: '#353a3a'
  surface-container-lowest: '#0a0f0f'
  surface-container-low: '#181c1c'
  surface-container: '#1c2020'
  surface-container-high: '#262b2b'
  surface-container-highest: '#313635'
  on-surface: '#dfe3e2'
  on-surface-variant: '#c0c9c1'
  inverse-surface: '#dfe3e2'
  inverse-on-surface: '#2d3131'
  outline: '#8b938c'
  outline-variant: '#414943'
  surface-tint: '#a1d1b4'
  primary: '#a1d1b4'
  on-primary: '#063824'
  primary-container: '#2d5a43'
  on-primary-container: '#9fcfb2'
  inverse-primary: '#3a674f'
  secondary: '#bec9c4'
  on-secondary: '#28332f'
  secondary-container: '#3e4945'
  on-secondary-container: '#acb8b3'
  tertiary: '#fbbc00'
  on-tertiary: '#402d00'
  tertiary-container: '#694d00'
  on-tertiary-container: '#f9bb00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#bceecf'
  primary-fixed-dim: '#a1d1b4'
  on-primary-fixed: '#002112'
  on-primary-fixed-variant: '#224f39'
  secondary-fixed: '#dae5e0'
  secondary-fixed-dim: '#bec9c4'
  on-secondary-fixed: '#141e1b'
  on-secondary-fixed-variant: '#3e4945'
  tertiary-fixed: '#ffdfa0'
  tertiary-fixed-dim: '#fbbc00'
  on-tertiary-fixed: '#261a00'
  on-tertiary-fixed-variant: '#5c4300'
  background: '#101414'
  on-background: '#dfe3e2'
  surface-variant: '#313635'
typography:
  display-lg:
    fontFamily: Literata
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Literata
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  title-sm:
    fontFamily: Nunito Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: '1.4'
  body-md:
    fontFamily: Nunito Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Nunito Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  label-caps:
    fontFamily: Nunito Sans
    fontSize: 11px
    fontWeight: '800'
    lineHeight: '1'
    letterSpacing: 0.05em
  metric-lg:
    fontFamily: Nunito Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gap-dense: 12px
  gap-standard: 16px
  margin-page: 24px
  container-padding: 12px
---

# Terra Compact

## Brand & Style

The design system is a high-density, technical framework designed for precision monitoring and complex data management. It adopts a **Corporate / Modern** aesthetic with a lean toward **Minimalism**, prioritizing information density and clarity over decorative flair.

The brand personality is deliberate and focused. It avoids the soft, organic tropes often associated with environmental themes in favor of an industrial, data-driven approach. The UI should evoke a sense of professional control, reliability, and technical rigor. Visual interest is derived from structured information hierarchies and sharp execution rather than imagery or ornamentation.

## Colors

The color palette is rooted in a deep, dark slate-green foundation, providing a low-fatigue environment for long-duration monitoring.

- **Primary**: A resolute Forest Green (#2D5A43) used for high-importance actions and active states.
- **Surface**: The background and container layers use Dark Slate-Green (#1A2421), creating a monolithic, technical base.
- **Tertiary/Highlight**: Amber (#FFBF00) is reserved for status warnings, critical metrics, and precise highlights to ensure they pop against the dark backdrop.
- **Neutral**: Cool greys and off-whites are used for typography to maintain high legibility without the harshness of pure white.

## Typography

The typography strategy balances editorial authority with functional utility.

- **Brand/Titles**: Literata is used sparingly for page titles and high-level section headers to provide a grounded, authoritative voice.
- **UI/Body**: Nunito Sans handles all interface elements, navigation, and body copy. It is selected for its high legibility at small sizes.
- **Data/Metrics**: For all numerical values, timers, and coordinates, `tabular-nums` must be enabled to ensure alignment in dashboards and lists.
- **Mobile Scaling**: Headlines scale down by 15% on mobile devices, while body text remains consistent at 14px to ensure readability.

## Layout & Spacing

This design system utilizes a **Fixed Grid** philosophy for dashboard views and a fluid layout for data tables. The primary goal is high information density.

- **Grid**: A 12-column grid is standard for desktop, collapsing to 4 columns on mobile.
- **Gaps**: Use 12px gaps for related dashboard widgets and 16px for distinct functional sections.
- **Density**: Padding within components is tightened (12px) to maximize the amount of visible data on a single screen without sacrificing click targets.
- **Breakpoints**: Desktop (1280px+), Tablet (768px-1279px), Mobile (under 767px).

## Elevation & Depth

Depth is communicated through **Tonal Layers** rather than heavy shadows. In a dark, technical UI, stacking is achieved by lightening the surface color of the "elevated" element.

- **Base Layer**: The darkest slate-green.
- **Raised Layer (Cards/Panels)**: One step lighter than the base.
- **Overlays (Modals/Menus)**: The lightest surface value with a subtle 1px border (#FFFFFF15) to define edges.
- **Shadows**: If used, they should be sharp, low-spread, and high-opacity (e.g., `0 2px 4px rgba(0,0,0,0.5)`) to maintain a "heavy" and structured feel.

## Shapes

Shapes are disciplined but adopt a more approachable **Rounded** profile. This balance ensures the technical UI remains clean while avoiding an overly aggressive or "sharp" industrial feel.

- **Containers**: Cards and main panels use a substantial 16px (rounded-lg) radius to clearly define content boundaries.
- **Interactive Elements**: Primary and secondary buttons use a standard 8px radius (DEFAULT) to provide a soft, tactile feel that invites interaction.
- **Status/Tags**: Only chips, badges, and status indicators use a full pill-shape (999px) to provide a clear visual departure from the structural grid.

## Components

- **Buttons**: High-contrast Forest Green backgrounds with white text for primary actions. Use 1px borders for ghost/secondary buttons. Standard 8px corner radius.
- **Input Fields**: Darker than the card background to create an "inset" look. Use Amber for focus states to highlight the active entry point.
- **Cards**: Minimalist with 16px rounded corners. No drop shadows; use 1px borders or subtle value shifts to define edges. Title areas should have a distinct background tint.
- **Chips/Badges**: Small, pill-shaped, using the Amber tertiary color for warnings or specific status flags.
- **Data Lists**: High density, 40px row heights. Use alternating row stripes or subtle dividers.
- **Metrics**: Large Nunito Sans text with tabular numerals. Place units (e.g., "kg", "ms") in a smaller, low-opacity label style next to the value.

## CogniPace AI Connection Settings Rules

- Provide a collapsed **Save in your password manager** disclosure in both AI
  connection and the GitHub Sync dialog. Expanding shows compact Website,
  Username, Password and Notes rows with explicit per-field Copy buttons and an
  Open Google Password Manager action. Only the currently entered key is
  copyable; never render it in the helper. Explain that the user must add/save
  the entry in their manager and paste it back when needed. Keep local
  connection saving separate. Do not promise automatic saving or autofill.
  Keep the expanded GitHub dialog scrollable within the viewport and include
  its summary in the dialog's keyboard focus cycle.
- Keep AI connection in its own Settings form with the existing compact row,
  input, status, and panel tokens. Ordinary preference saves do not submit it.
- Selecting a provider fills an editable suggested model value; OpenRouter
  suggests `openrouter/free`. Saved custom models stay visible exactly; a
  blank reset model stays blank. Show **Use free models** only for OpenRouter,
  beside the model field, as a draft-only action. It clears test feedback,
  requires explicit saving/activation, and is disabled behind the shared operation
  gate. Discard restores the saved model.
- Mask entered keys and show availability only for the selected provider. Clear
  the input after saving and when switching providers. Keep Remove key, the
  Gemini Google AI Studio link, and an OpenRouter key-creation link. OpenRouter
  shows compact free-routing/usage guidance and code/context-forwarding copy
  with a provider-data-policy link. External links use the established new-tab
  attributes. Keep the existing compact row/input/status/panel tokens.

- Keep an Active provider row visible with the saved provider/model while the
  editor browses other providers. Show empty/loading states and missing active
  key availability separately. Returning to the active provider restores its
  saved custom model; other providers use their editable suggestions.
- Keep two separate buttons: Test connection and Save & make active. Use Make
  active for another provider with a saved key and no replacement key entered.
  Disable saving the unchanged active connection. Testing checks the saved
  active connection without writes; saving/activation sends no provider request.
  Disable testing unsaved edits with a hint to save or activate first. Name the
  current save/test step and disable conflicting controls.
- Show a compact inline success or actionable error. A failed test keeps saved
  configuration visible, and replacing configuration clears old verification.
- Keep AI assessment enablement separate. Testing works while assessment is off,
  and turning assessment off works after its key is removed. The enable hint
  describes completed-submission analysis for approach, efficiency, and code
  style.

## CogniPace LeetCode Analysis Rules

- Place focused Solve / AI / Notes text tabs below the shared header and problem
  context. Keep the full review footer only in Solve so AI has reading height.
- Make the selected tab explicit and retain visible keyboard focus. Support
  Left/Right wrapping and Home/End selection with paired tab panels and one tab
  stop in the tab list; hidden panels must exclude their controls from focus.
  Current-status cues are passive and do not navigate or start work.
- Retain each panel's scroll position and open native AI disclosures across
  ordinary tab switches. Keep Notes as a reserved future placeholder without
  suggesting an editor or saved notes.
- Keep Solve's Help shelf as one compact YouTube and Lightbulb AI action row.
  Show no empty hint card while idle. AI hints start only on explicit activation,
  show a busy state, then show the first code-aware hint when ready.
- Get next hint reads the complete current editor again and requests one new
  hint, keeping earlier hints visible during preparation, generation and errors.
  Show successful hints used out of three and label each Light, Medium or Heavy.
  Strength always follows successful hint count: Light, Medium, then Heavy. Show an honest final
  state after three successful hints; failures do not consume a slot. Explain
  that hints use the code snapshot at request time.
  Folding and reopening the hint block does not regenerate it.
- Render pointers as plain inert text that wraps at narrow widths. Keep busy,
  controlled error, Retry, and Settings states compact, readable, and keyboard
  accessible with visible focus. Retry is explicit; a missing connection leads
  to Settings without starting generation.
- Own the hint session above visual modes. Preserve its history, count,
  and disclosure through tab switches, collapse/dock/restore, accepted or failed
  saves, rating updates and ordinary code edits. Keep review controls immediate
  during generation.
- Use Option A inside the expanded overlay: a concise summary, Approach /5,
  Efficiency /5, and Code Style /5. Do not add an overall average or recall
  rating to the report.
- Use independent native details/summary disclosures, initially closed, for
  Approach, Efficiency, Code Style, and Suggested implementation. Preserve
  keyboard Enter/Space activation, visible focus, wrapping labels, and all
  content at 392px and 320px widths. A replacement report starts closed.
- Keep Approach rows Current, Suggested, Key idea, and optional Consider;
  Efficiency rows Current complexity, Suggested complexity, and Suggestions;
  Code Style rows Readability, Structure, and Suggestions. Show rationale and
  unavailable dimensions honestly.
- Style time and auxiliary-space comparisons separately: a time improvement
  must not make a memory regression look improved. Name complexity assumptions
  and preserve language-specific signatures and types, including Kotlin Long
  and retained generic collection types.
- Keep suggested code as literal text in a horizontally scrollable code block.
  Show Generate suggested code inside its disclosure until requested; opening
  the disclosure alone makes no API call. Keep the scored feedback visible
  during code pending/error states, and make Retry local to code generation.
  Reopening successful code reuses it. Generation always uses the original
  assessed submission, even if the editor has since changed.
  Show AI-generated and Untested labels, Copy success/failure feedback, changes,
  complexity, and assumptions. Opening or copying suggestions does not run or
  submit code.
- Show compact idle, preparation, generation, unavailable, and controlled-error
  messages with Settings/Retry when useful. Report disclosure, collapse, and
  docking do not trigger more API calls. Clearing/resetting keeps a retained
  handled attempt idle until explicit Retry.
- Keep manual review controls available in Solve while analysis is pending and preserve
  deterministic ratings, locks, correctness, timing, FSRS, and track guidance.
  Reports remain session-only and never become saved review fields.

## CogniPace Popup Rules

- The popup is a compact Chrome extension command surface, not a mini dashboard.
- The header shows only the brand and settings action in the normal state.
- Do not show persistent explanation banners or helper paragraphs in the normal state.
- Use stateful controls, concise inline feedback, and native tooltips for secondary explanations.
- The normal populated popup should answer: what to review now, and what to study next.

## CogniPace Analytics Historical Chart Rules

- Four equal 148px selected-period headline cards lead the page: Review days,
  Questions solved, Observed correctness, and Recorded solve time. Reflow four
  to two to one column. Use deduplicated raw events, persisted true/false flags
  without rating fallback, unique successful questions, exact positive successful
  seconds including repeats, and timed-success coverage. Wholly unknown correctness
  or missing successful timing is unavailable; empty/known zero successes stay
  zero. Positive subminute time must remain distinguishable from zero.
- Keep the ten-card reading order: Performance / Time vs target, Practice /
  Topic performance, Recall / Memory strength, Retention map / Memory signals,
  Overdue backlog / Upcoming reviews. At actual content width 736px or greater,
  use two equal cards at least 360px wide with a 16px gap; below it, stack.
  Every card is 464px in two columns and 512px stacked in Overview, Breakdown/
  Details, Chart, Table, goals, selection, loading, no-data, sparse, and error
  states. There are no full-width exceptions. Use measured remaining definite
  plot height; aspect ratios and nested minima do not control the shell.
- Keep Terra Compact tokens, short 4–9-word descriptions, quiet grid lines,
  meaningful values/units and compact local controls in both themes. Analytics
  uses locally bundled Latin Nunito Sans UI and Literata page-title fonts with
  system fallbacks for other glyphs, scoped to this surface. Breakdown/Details
  replaces the plot and reclaims hero space; Overview restores filters, visible
  series, selections, and trigger focus. Fitting subsections/field groups and
  bounded pages retain every original measurement, row, link, calculation,
  provenance, goal, action, and error without clipping, smaller text, or internal
  vertical scrolling. Recalculate/clamp paging on range/report/width changes
  even while hidden.
- Keep explicit 30 days (default), 90 days, and All time selection and supplied
  calendar grouping. Young history shortens displayed dates without changing
  the selection or nominal comparison; old sparse history preserves inactivity.
  The raw nonfuture history origin precedes metric filters. At most sixty real
  calendar intervals preserve all eligible records and actual clipped midpoints;
  this bounds chart output rather than full-history reads or replay. Finite
  prior periods use equal nominal local-calendar windows and matched wall-clock
  as-of cutoffs; All time has no delta. Legacy range 14 resolves to 30.
- Performance defaults to First attempts with optional Follow-up practice.
  Use the original raw first/later cohorts: invalid firsts never promote repeats.
  Its fixed 0–100 index is weighted points/units, using Again 0, Hard 50, Good 80,
  Easy 100 and current catalog Easy/Medium/Hard/Unknown influence 1/2/3/1.
  Display Unknown as Unclassified, retain its influence/count, and keep actual
  valid n distinct from weighted units. Show an integer /100 hero and one-decimal
  inspection from unrounded calculations; all Good is 80, Again is zero, and
  empty valid evidence is unavailable. No percentage target, extra time penalty,
  recency weight, or arbitrary grade belongs on the index.
- Performance Breakdown keeps Ratings / Difficulty / Mix / Intervals and the
  original Pooled outcomes / Difficulty outcomes / Goals / Method. Retain raw
  Hard + Good + Easy and Good + Easy rates, all difficulties including Unknown,
  count-based pooling, original goals, invalid exclusions, pooled invalid-only
  edge trimming/internal gaps/measured zero, Trend/Compare, known difficulty visibility, exact prior counts, assessment/time Mix and provenance.
  Mint Easy circles, blue Medium diamonds and amber Hard triangles retain their
  identities. Hidden series leave inspection but do not alter fits/dates; Mix
  retains the full raw cohort, including neutral Unclassified. Weighted finite
  deltas are unrounded score points; raw-rate deltas remain percentage points.
  Either actual valid n below ten gives Sparse comparison.
- Time vs target has its own first/follow-up cohort, independent of Performance,
  and defaults to all timed assessments. Lead with timed/eligible coverage,
  then horizontal known-difficulty period median bars with a shared 100%
  reference, uncapped overtime, and direct median/target/Under-Over-On labels.
  Percent is `100 * medianSeconds / (targetMinutes * 60)`; minute delta is
  `medianSeconds / 60 - targetMinutes`. Accent only excess above target;
  remaining allowance is reference space. Unknown has no allowance and pooled
  difficulty medians never produce a pooled hero. Fit all ratios and the 100%
  reference independently of visibility.
  Details preserves Trend/Compare, minutes/current-target percentage, all/
  successful subsets, difficulty controls, exact coverage/recorded seconds and
  distributions. One timed record supports a median; quartiles need four and
  Trend whiskers need one isolated difficulty. Positive Again/invalid durations
  enter all-timed data/time Mix; successful timing is valid Hard/Good/Easy.
  Pauses are excluded, running idle may remain, and unsaved work is unknown.
  Current targets/difficulty are not historical policy snapshots or a speed
  score; Strict Timing may record an accepted overtime solution as Again.
- Performance and paired Recall show Period to date accumulation. Leading
  unsupported rows stay unavailable. New evidence updates at actual interval
  midpoints with measured markers; inactive intervals hold the prior aggregate
  horizontally with long dashes through real as-of, zero new n, unchanged
  cumulative counts, and the actual last updated interval. Bounded natural
  supported connections cannot overshoot or move in unsupported time. Equal
  updates retain their true markers; holds create no samples, active buckets,
  or readiness. Keep raw interval versus cumulative counts/values distinct in
  Table/inspection. Do not apply holds/smoothing to counts, forecasts, stability,
  or current estimates.
- Recall uses exact paired repeats, including valid Again failures in the
  denominator, Hard/Good/Easy recalled counts, complete prehistory replay,
  initial exclusion, and genuine zero FSRS estimates. Pool cumulative recalled/
  pairs and pair-weighted unrounded FSRS means without difficulty weights.
  Zero pairs means both rates/difference unavailable; positive pairs require
  finite rates and exact observed-minus-estimate difference. The latest values
  agree with selected totals. Use solid observed circles and short-dashed FSRS
  diamonds; longer horizontal dashes mean no new paired reviews.
  Both native switches hide curve/marks/inspection rate together; show signed
  full-precision percentage-point difference only with both visible. Fit both
  cumulative series and saved Recall goal independently of visibility.
  Label Recall's supplied first-selected-pair-to-as-of frame/grouping while
  preserving the same pair population/totals and global-history readiness.
  Keep long sparse paired history, internal inactivity, and trailing holds.
  Multiple intervals start at the first actual midpoint with 12px left clearance
  and end at as-of; a singleton retains its interval domain/centered marker.
  One update plus holds still does not become a trend.
- Raw outcomes/time, Memory, and Practice retain their supported-edge slices,
  internal gaps, and original next-valid-point bridges. Their Chart/exact values/
  inspection share the same retained rows. Trimming never changes selected
  totals, readiness, supplied fits, or report context. Use numeric local-calendar
  axes and actual interval midpoints, including shortened edges. Sparse dates
  use MM/DD in the as-of year and /YY otherwise; cross-year intervals show both
  years. Reducing ticks does not remove observations. Keep explicit units,
  independent scales, boundary-marker clearance, and Memory/Practice's original
  interval-boundary domains.
- Saved goals retain their original Settings fields, units/defaults, atomic
  one-key updates, backup and configured sync behavior. Raw Performance goals
  remain reachable from Breakdown Ratings/Goals; weighted Topics exposes its
  raw rate/status/goal in rating Details. Recall overview keeps Recall, and
  Details Goals has both Recall/Review Success buttons with one editor visible.
  Practice keeps Review Success. Blocked pairs name “Review Success target must
  be at least your Recall target” and offer the counterpart without adjustment.
  Focus the single input; Enter/Save and Escape/Cancel/focus return remain.
  Refreshed counterpart limits preserve drafts; pending prevents duplicate
  saves. Associated errors persist beside the field across Overview/Details.
  References remain accessible at 0%/100%, empty/sparse/Table, both themes, and
  narrow widths. Goals change no observations, weighted score, readiness, FSRS
  schedule, or Retention values.
- Inspection starts hidden. Pointer/tap chooses the nearest original bucket;
  the native inspection button provides focus, Left/Right, Home/End, Enter/Space
  and Escape access to the same values. A quiet guide does not create a marker
  or value for unknown evidence. Keep full interval/grouping, complete/in-progress,
  report time, evidence and provenance without a permanent bottom detail row.
  Tooltip cleanup is deferred; retain existing access and truthful values.
- Routine sample/update/timing/backlog coverage and in-progress labels occupy
  reserved neutral slots, with full reasons in Details and no shortened-history
  page banner. Initial loading retains all shells; range changes clear incompatible
  values immediately. Same-key Updating may retain its snapshot; failed refresh
  retains that exact snapshot/as-of with persistent failure and Retry. Load errors
  fit the shell. Unknown remains unavailable, genuine zero/no flags measured.
  Use one polite range/refresh announcement. Any floating feedback is supplementary.
  Human installed-extension happy/edge smoke and screenshot/recording proof
  remains required before PR review or merge.
- Memory Strength uses a clear median line and discrete Q1–Q3 whiskers with a
  compact Median/Middle 50% key. Render whiskers only with at least four eligible
  reviews and known quartiles. Fit all finite median/Q1/Q3 extrema by choosing
  the larger of 1.2 times their span and two days, then splitting the padding
  equally above and below. Clamp lower padding at zero without transferring it
  upward, and enforce an actual minimum two-day window. Preserve all extrema
  and use readable duration ticks. Keep sub-day values meaningful. A finite
  median, including zero or a sub-day value, supports the activity window
  without requiring quartiles or four eligible reviews; that requirement
  applies only to whiskers.
- Practice stacks exact supplied rating shares bottom to top as Easy,
  Good, Hard, Again. The upper boundary of Good + Easy expresses Review Success;
  do not add another success line. Label the fixed left axis Rating share (%)
  and the right count axis Reviews. Draw supplied completed reviews as a thin,
  straight neutral line with small measured markers. A known zero count remains
  an observation, and an unavailable count does not become zero. Completed
  counts are independent of valid-rating counts and must not be derived from
  them. The matching dashed Target Review Success reference uses the left
  percentage axis, with an explicit target name in inspection and its accessible
  description. Goals at 0% and 100% stay visible. Editing either goal preserves
  observations, dates, rows, gaps, counts, and trim rules.
- Join the unchanged Practice and Ratings Mix rows by ID and exact
  start/end interval, retaining intervals supplied by either view and reporting
  absent counterparts as unavailable. Trim only unsupported outer rows: positive
  completed reviews, positive valid-rating counts in either view, or finite
  supplied success including 0% support an edge. Preserve internal gaps in the
  shared Chart, inspection, and Table slice. Internal unavailable composition
  uses a full-height neutral gray diagonal hatch; a true zero category in a
  populated slot stays zero-height. Soften Hard/Again in this chart, keep
  Easy/Good distinct, and keep all four categories distinct from the neutral
  missing-composition key. Center contrasting whole-percentage labels at 12px
  only when they fit without colliding with the count line or target. More
  precise shares and counts stay in tooltip and Table; rounded labels may total
  99% or 101% without changing geometry.
- The shared Practice tooltip includes completed reviews, each rating count and
  precise share, Good + Easy numerator/valid-rating denominator, supplied success,
  target, each metric's evidence, full interval, report timezone/as-of, and partial
  status. A small native Reviews switch hides the count line, markers, right axis,
  and tooltip count together. It never changes rows, dates, target, or Table
  values, and accessible chart copy follows the visible state. Details retains
  the selected-period Hard + Again summary, evidence-gated prior comparison,
  and distinct rating/count readiness reasons when they differ. Keep the
  visible association-only explanation: the two scales compare timing, and a
  count-line crossing with the target has no percentage meaning.
- Fitting exact-value pages preserve all retained rows, fields, unavailable
  states and interval context. Friendly Practice labels map Easy/Good/Hard/Again
  to Strong/Solid/Effortful/Needs practice while keeping original rating names in
  inspection and Details. At 320px and 200% zoom, reflow controls and reduce ticks
  without shrinking essential text or document overflow.
- Size bars from actual projected slots and interval boundaries, preserving
  missing calendar slots, shortened edges, and zero geometry. Normally leave
  6–14px gaps, no more than 20% of a slot, relaxing the minimum in small slots.
  Keep segment labels readable only where they fit; small positive workload
  segments use collision-aware outside labels without artificial height.

## CogniPace Topic and Workload Chart Rules

- Topic performance uses weighted /100 scores over All assessments, with at
  least ten valid ratings across three distinct valid-reviewed problems.
  Preserve direct overlapping assignments/no ancestors, unrounded score/
  count-descending/name ordering, full names and every qualifying row in fitting
  bounded pages. The sixteen rating-by-difficulty cells conserve valid n, Good/
  Easy numerator, and original raw Review Success. Keep the alphabetical first
  five returned low-evidence topics and exact additional count separate;
  omitted qualifying topics remains zero. Weighted scores have no percentage goal; the raw
  rate, unrounded goal status, and editor remain in rating Details.
- Memory signals uses rank and canonical linked title with every inline wrapping
  typed reason, quiet separators and fitting bounded pages inside the equal card.
  Keep severity, original reason order, and returned-top-25 versus qualifying-total
  counts explicit. Scope retains current as-of/timezone/fallback context without
  claiming the historical range. Clearly label model-estimated recall, its FSRS
  target, and total durability.
- Backlog uses its own Last 30 days daily frame, straight known-day connections
  and measured dots. Unknown breaks runs; zero/singleton dots and actual dates
  stay visible. Both line and markers are green strictly below five and amber
  at or above five, including flat five. Split crossings exactly without adding
  a measured observation. Unknown current day remains unavailable without carrying
  prior evidence; known-only threshold counts reconcile to known days. Native
  pointer/tap/keyboard inspection agrees.
- Upcoming uses a fixed Today-plus-thirteen-local-dates schedule snapshot with
  every actual date slot and separate exact
  Due/Overdue counts. Positive labels use contrasting hatch-safe backing when
  they fit and collision-aware outside positions otherwise. Do not inflate bars,
  shrink text or duplicate totals. Zero segments remain zero-height; inspection
  and fitting exact values preserve their zeros and current as-of/timezone/fallback
  context. Earlier today stays Due; prior local dates are Overdue only in Today.
  Do not simulate future reviews or rescheduling.

## CogniPace Retention Map Rules

- Show the full eligible memory landscape with exact points, a positive log
  durability axis and fitted estimated-recall axis. Keep the FSRS scheduling
  target and seven-day benchmark distinct from personal chart goals and due
  dates. Put reference captions above the plot and remove competing region text.
- Use three consistent circle/diamond/triangle status keys with full counts.
  Draw healthy points softly behind risk marks; highlight inspection without
  jitter, sampling or changing quantitative glyph sizes.
- Keep All/Below target controls compact and full-cohort domains stable across
  filters. Retain every filtered question and all eleven original fields in
  fitting paged exact values. Use a single native keyboard inspector and a
  bounded overlap chooser; complete pinned linked details replace the plot
  inside the fixed shell. Selection pages retain rank, status, estimate, target,
  gap, durability, last review, due date, FSRS difficulty and lapses. Return to
  map preserves viewport/selection; Close clears selection and restores focus.
- Primary drag draws a box and release magnifies the entire selected area.
  Double-click/Reset restores the full landscape without replacing a pin.
  Preserve anchored wheel/pinch zoom, Shift-drag/touch pan and accessible
  plus/minus controls. Keep true axes and screen-sized marks. Escape cancels a
  box before dismissing details; canceled/tiny drags must not pin a question.
- Reflow controls and details at 320px; reduce ticks rather than shrinking text.
  Use product tokens in both themes, subtle status bands and clear native focus.
