import * as React from 'react'
import * as RechartsPrimitive from 'recharts'

import { cn } from '@/utils/cn'

const CHART_THEMES = {
  light: ":root, [data-cp-theme='light'], [data-cp-theme='system']",
  dark: "[data-cp-theme='dark']",
} as const

const DEFAULT_CHART_INITIAL_DIMENSION = { height: 192, width: 320 } as const
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const ANIMATED_CHART_COMPONENTS = new Set<unknown>([
  RechartsPrimitive.Area,
  RechartsPrimitive.Bar,
  RechartsPrimitive.Funnel,
  RechartsPrimitive.Line,
  RechartsPrimitive.Pie,
  RechartsPrimitive.Radar,
  RechartsPrimitive.RadialBar,
  RechartsPrimitive.Scatter,
  RechartsPrimitive.Tooltip,
])

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof CHART_THEMES, string> }
  )
>

export interface ChartContainerProps extends React.ComponentProps<'div'> {
  config: ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >['children']
  /** Provides deterministic dimensions before ResponsiveContainer measures the DOM. */
  initialDimension?: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >['initialDimension']
  accessibleName?: string
  accessibleDescription?: string
}

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  ChartContainerProps
>(
  (
    {
      id,
      className,
      children,
      config,
      initialDimension,
      accessibleName,
      accessibleDescription,
      ...props
    },
    ref,
  ) => {
    const uniqueId = React.useId()
    const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`
    const prefersReducedMotion = usePrefersReducedMotion()
    const accessibleChartChildren =
      React.isValidElement(children) &&
      (accessibleName !== undefined || accessibleDescription !== undefined)
        ? React.cloneElement(
            children as React.ReactElement<{ desc?: string; title?: string }>,
            {
              ...(accessibleName !== undefined
                ? { title: accessibleName }
                : {}),
              ...(accessibleDescription !== undefined
                ? { desc: accessibleDescription }
                : {}),
            },
          )
        : children
    const chartChildren = prefersReducedMotion
      ? disableChartAnimations(accessibleChartChildren)
      : accessibleChartChildren

    return (
      <div
        {...props}
        ref={ref}
        data-chart-animation={prefersReducedMotion ? 'disabled' : 'enabled'}
        data-chart={chartId}
        className={cn(
          'relative flex aspect-video min-h-48 w-full min-w-0 justify-center text-xs',
          '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground',
          '[&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-border/50',
          '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border',
          '[&_.recharts-dot[stroke="#fff"]]:stroke-transparent',
          '[&_.recharts-layer]:outline-none',
          '[&_.recharts-polar-grid_[stroke="#ccc"]]:stroke-border',
          '[&_.recharts-radial-bar-background-sector]:fill-muted',
          '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted',
          '[&_.recharts-reference-line_[stroke="#ccc"]]:stroke-border',
          '[&_.recharts-sector[stroke="#fff"]]:stroke-transparent',
          '[&_.recharts-surface]:outline-none',
          className,
        )}
      >
        <ChartStyle config={config} id={chartId} />
        <RechartsPrimitive.ResponsiveContainer
          height="100%"
          minHeight="12rem"
          width="100%"
          initialDimension={initialDimension ?? DEFAULT_CHART_INITIAL_DIMENSION}
        >
          {chartChildren}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    )
  },
)
ChartContainer.displayName = 'Chart'

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(() =>
    getPrefersReducedMotion(),
  )

  React.useEffect(() => {
    const mediaQuery = window.matchMedia?.(REDUCED_MOTION_QUERY)

    if (!mediaQuery) {
      return undefined
    }

    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches)
    }

    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)

    return () => {
      mediaQuery.removeEventListener('change', updatePreference)
    }
  }, [])

  return prefersReducedMotion
}

function getPrefersReducedMotion() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false
}

function disableChartAnimations(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) {
      return child
    }

    const element = child as React.ReactElement<{
      children?: React.ReactNode
      isAnimationActive?: boolean
    }>
    const hasChildren = element.props.children !== undefined

    return React.cloneElement(element, {
      ...(ANIMATED_CHART_COMPONENTS.has(element.type)
        ? { isAnimationActive: false }
        : {}),
      ...(hasChildren
        ? { children: disableChartAnimations(element.props.children) }
        : {}),
    })
  })
}

function ChartStyle({ config, id }: { config: ChartConfig; id: string }) {
  const colorConfig = Object.entries(config).filter(
    ([, itemConfig]) => itemConfig.theme || itemConfig.color,
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(CHART_THEMES)
          .map(
            ([theme, selector]) => `
${selector} [data-chart="${id}"] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof CHART_THEMES] ?? itemConfig.color

    return color ? `  --color-${key}: ${color};` : null
  })
  .filter(Boolean)
  .join('\n')}
}
`,
          )
          .join('\n'),
      }}
    />
  )
}

export const ChartTooltip = RechartsPrimitive.Tooltip

export { ChartStyle }
