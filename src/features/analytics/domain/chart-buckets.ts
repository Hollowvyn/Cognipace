export type LineContinuity =
  | { kind: 'solid'; fromIndex: number; toIndex: number }
  | { kind: 'bridge'; fromIndex: number; toIndex: number }

export function classifyLineContinuity(
  values: readonly (number | null)[],
): LineContinuity[] {
  const continuity: LineContinuity[] = []
  let previousValueIndex: number | null = null

  for (const [index, value] of values.entries()) {
    if (value === null) continue

    if (previousValueIndex !== null) {
      const gap = index - previousValueIndex - 1
      continuity.push({
        kind: gap === 0 ? 'solid' : 'bridge',
        fromIndex: previousValueIndex,
        toIndex: index,
      })
    }

    previousValueIndex = index
  }

  return continuity
}
