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

## CogniPace Popup Rules

- The popup is a compact Chrome extension command surface, not a mini dashboard.
- The header shows only the brand and settings action in the normal state.
- Do not show persistent explanation banners or helper paragraphs in the normal state.
- Use stateful controls, concise inline feedback, and native tooltips for secondary explanations.
- The normal populated popup should answer: what to review now, and what to study next.

## CogniPace Analytics Historical Chart Rules

- The implemented treatment covers Observed Recall vs FSRS Estimate, Memory
  Strength, Practice Rhythm, and Ratings Mix. Topic Performance, Retention Map,
  Memory Signals, Recent Overdue Backlog, and Upcoming Review Load keep their
  current treatment until a separate design iteration.
- Keep the explicit 14-day daily, 30-day three-day, and 90-day weekly grouping
  and feature-supplied values. All four historical charts trim
  empty beginning and ending buckets only, using the same contiguous activity
  window for Chart, Table, and inspection. Preserve every internal gap and each
  retained interval's dates.
  Readiness does not control trimming. Keep the selected range, period totals,
  readiness, supplied scales, and report time unchanged; do not fabricate
  observations.
- Use a numeric local-calendar axis with marks at each interval's midpoint,
  including shortened edge buckets. Show sparse date ticks at readable calendar
  intervals rather than labeling every bucket. Dates use MM/DD in the report's
  as-of year and /YY outside it; full cross-year intervals include both years
  in inspection. Reducing tick density must not reduce observations.
- Keep axis quantities and units explicit, horizontal grid lines quiet, and
  top/bottom clearance sufficient for boundary markers and low whiskers. Retain
  supplied serialized value-axis domains and independent scales. Memory Strength
  uses its duration fit; the approved personal-goal work also fits Recall and
  Practice's percentage scales around their saved targets, including 0% and
  100%, while preserving Practice's review-count scale.
- The chart-target editor is implemented and has automated/fixture proof;
  human installed-extension smoke remains pending before review or merge. Place a small native
  **Target Recall 90%** or **Target Review Success 90%** button above the relevant
  plot with the target color and a subtle dashed-line key. Replace the generic
  Recall caption without duplicating it or adding a permanent bottom row.
  Either button opens the same compact inline panel with both labeled inputs
  for whole percentages (0–100 in one-point steps), rating-combination hints, Save,
  and Cancel. Focus the target for the chart that opened it; Enter saves and
  Escape cancels and returns focus. Keep the panel collapsed by default and
  reachable in Chart/Table, empty, sparse, narrow, light, and dark states.
  Explain **Review Success target must be at least your Recall target** for an
  invalid pair; never silently change the other input. This is an intentionally
  stricter aspiration, not a rule for measured rates. Show Saving, prevent
  duplicate submission, and keep failed drafts open with a useful error while
  retaining the prior saved references. Cancel leaves both goals unchanged.
- Inspection starts with the tooltip hidden. Pointer movement and taps select
  the nearest retained original bucket. A native focusable button covering the
  plot exposes the same values through focus, Left/Right arrows, Home/End, and
  Enter/Space, with Escape to hide details. Use a quiet vertical selection guide
  and highlight measured values only. Keep full range, grouping, report time,
  evidence, and complete/in-progress context in the tooltip; do not add a
  permanent bottom detail row.
- Recall uses a solid observed line with circles and an opaque FSRS estimate
  with short `4 4` dashes and diamonds. Missing-evidence bridges use visibly
  longer `9 7` dashes. Its dashed reference uses saved Target Recall, independent
  of FSRS retention, and names that goal in inspection and its accessible
  description. Keep the editable target caption above the data.
  Compact native series switches hide the relevant curve, markers, and tooltip
  rate together. Show the signed difference only when both series are visible,
  preserve shared sample counts, and keep the accessible description aligned
  with both, one, or neither series visible. Either known rate, including 0%,
  supports the activity window; toggling series must not reshape that window.
  With at least two retained intervals, start Recall's numeric X domain at the
  first interval's actual midpoint and use 12px of left scale clearance. Keep
  the last interval's end boundary and all marks' true calendar midpoints.
  Sparse ticks reflect dates inside this domain; the full interval remains in
  tooltip and Table. Series switches must not shift the domain. A singleton
  keeps its original interval domain and centered marker. Memory Strength,
  Practice Rhythm, and Ratings Mix retain their existing X domains and padding.
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
- Practice Rhythm uses muted review-volume columns and a clear mint Review
  Success line in one mixed plot. Label Reviews on the left and Review Success
  (%) on the right. Its matching dashed Target Review Success reference uses
  the right percentage axis, with an explicit target name in inspection and
  its accessible description. Editing either goal must preserve observations,
  dates, rows, gaps, counts, and trim rules. Measured success receives markers;
  unknown success receives only a dashed bridge between measured neighbors. Keep the visible
  association-only explanation. Completed reviews, valid ratings, or a known
  finite success rate support the activity window. Measured 0% success remains
  supported, while internal zero-volume gaps remain in place.
- Ratings Mix starts and ends with a slot containing valid ratings and keeps
  all internal slots. Keep exact Again/Hard/Good/Easy fractions as segment
  geometry. Empty internal composition is a full-height neutral gray diagonal
  hatch, while a true zero category in a populated slot stays zero-height. Keep
  the four rating categories distinct
  from the neutral missing-composition key. Center contrasting whole-percentage
  labels at 12px when both their width and height fit; omit labels that do not
  fit without shrinking the type or changing shares. More precise shares and
  counts stay in tooltip and Table;
  rounded labels may total 99% or 101%.
- Keep Chart/Table switching and seven-row table pagination. Preserve exact
  retained rows, feature-owned values, unavailable states, and current-interval
  context across both views. At narrow widths, reduce ticks and stack the
  Memory/Practice pair before its axes, keys, and controls become crowded. Keep panel alignment
  usable when neighboring readiness messages differ, and check light and dark
  themes.
