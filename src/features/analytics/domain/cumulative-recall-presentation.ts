import type { ObservedRecallVsFsrsRow } from './historical-presentation'
import type {
  CumulativeEvidenceState,
  PresentationInterval,
} from './performance-presentation'

export interface CumulativeRecallStats {
  pairedReviews: number
  recalledCount: number
  estimateSum: number
  observedRecall: number | null
  fsrsEstimate: number | null
  difference: number | null
}

export interface CumulativeRecallPresentationRow extends ObservedRecallVsFsrsRow {
  cumulativePairedReviews: number
  cumulativeRecalledCount: number
  cumulativeEstimateSum: number
  cumulativeObservedRecall: number | null
  cumulativeFsrsEstimate: number | null
  cumulativeDifference: number | null
  state: CumulativeEvidenceState
  lastUpdatedInterval: PresentationInterval | null
}

export interface CumulativeRecallPresentation {
  totals: CumulativeRecallStats
  rows: CumulativeRecallPresentationRow[]
}

/** Pool identical observed/predicted pairs without rounding the interval mean. */
export function buildCumulativeRecallPresentation(
  source: readonly ObservedRecallVsFsrsRow[],
): CumulativeRecallPresentation {
  let pairedReviews = 0
  let recalledCount = 0
  let estimateSum = 0
  let lastUpdatedInterval: PresentationInterval | null = null
  let totals: CumulativeRecallStats = {
    pairedReviews,
    recalledCount,
    estimateSum,
    observedRecall: null,
    fsrsEstimate: null,
    difference: null,
  }
  const rows: CumulativeRecallPresentationRow[] = source.map((row) => {
    if (row.pairedReviews > 0) {
      pairedReviews += row.pairedReviews
      recalledCount += row.recalledCount
      // The runtime contract requires a finite estimate for positive pair counts.
      estimateSum += row.pairedReviews * row.fsrsEstimate!
      const observedRecall = recalledCount / pairedReviews
      const fsrsEstimate = estimateSum / pairedReviews
      totals = {
        pairedReviews,
        recalledCount,
        estimateSum,
        observedRecall,
        fsrsEstimate,
        difference: observedRecall - fsrsEstimate,
      }
      lastUpdatedInterval = {
        id: row.id,
        bucketStart: row.bucketStart,
        bucketEnd: row.bucketEnd,
      }
    }
    return {
      ...row,
      cumulativePairedReviews: totals.pairedReviews,
      cumulativeRecalledCount: totals.recalledCount,
      cumulativeEstimateSum: totals.estimateSum,
      cumulativeObservedRecall: totals.observedRecall,
      cumulativeFsrsEstimate: totals.fsrsEstimate,
      cumulativeDifference: totals.difference,
      state:
        row.pairedReviews > 0
          ? 'updated'
          : pairedReviews > 0
            ? 'held'
            : 'unavailable',
      lastUpdatedInterval,
    }
  })
  return { totals, rows }
}
