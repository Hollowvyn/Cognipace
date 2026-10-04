import { normalizeLeetCodeLanguageLabel } from '@/lib/leetcode'

import type { CodeAnalysisReport } from './code-analysis-schema'

export function isCodeAnalysisConsistent(
  report: CodeAnalysisReport,
  language: string,
) {
  const { approach, efficiency, codeStyle, suggestedImplementation } = report

  if (
    (approach.score === null) !==
    (approach.strategyAssessment === 'unavailable')
  ) {
    return false
  }

  if (
    approach.score === 5 &&
    (approach.strategyAssessment === 'material-improvement' ||
      approach.strategyAssessment === 'incorrect')
  ) {
    return false
  }

  if (
    (efficiency.current === null ||
      efficiency.suggested === null ||
      efficiency.score === null) &&
    (efficiency.timeComparison !== 'unknown' ||
      efficiency.spaceComparison !== 'unknown')
  ) {
    return false
  }

  if (
    codeStyle.score === null
      ? codeStyle.readability !== 'Unavailable' ||
        codeStyle.structure !== 'Unavailable'
      : codeStyle.readability === 'Unavailable' ||
        codeStyle.structure === 'Unavailable'
  ) {
    return false
  }

  if (suggestedImplementation !== null) {
    const normalizedLanguage = normalizeLeetCodeLanguageLabel(language)

    return (
      suggestedImplementation.code.trim().length > 0 &&
      report.suggestedImplementationUnavailableReason === null &&
      normalizedLanguage !== null &&
      normalizeLeetCodeLanguageLabel(suggestedImplementation.language) ===
        normalizedLanguage
    )
  }

  return (
    report.suggestedImplementationUnavailableReason !== null &&
    report.suggestedImplementationUnavailableReason.trim().length > 0
  )
}
