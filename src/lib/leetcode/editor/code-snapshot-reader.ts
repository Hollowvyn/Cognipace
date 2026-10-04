import type { LeetCodeCodeSnapshot } from '../domain/types'
import { readLeetCodeLanguageLabelFromText } from '../domain/language'

export function readLeetCodeCodeSnapshot(
  editorRoot: ParentNode = document,
  now = Date.now,
): LeetCodeCodeSnapshot {
  const visibleMonacoEditorCode = readVisibleMonacoEditorCode(editorRoot)
  const textareaEditorCode = readTextareaEditorCode(editorRoot)
  const detectedEditorCode = visibleMonacoEditorCode ?? textareaEditorCode

  return {
    code: detectedEditorCode,
    language: readSelectedLanguageLabel(editorRoot),
    source: visibleMonacoEditorCode
      ? 'monaco'
      : textareaEditorCode
        ? 'textarea'
        : 'none',
    completeness: detectedEditorCode ? 'partial' : 'missing',
    capturedAt: now(),
  }
}

function readVisibleMonacoEditorCode(editorRoot: ParentNode) {
  const visibleEditorLines = Array.from(
    editorRoot.querySelectorAll('.view-lines .view-line'),
  ).map((line) => line.textContent ?? '')

  const code = visibleEditorLines.join('\n').trimEnd()
  return code.trim() ? code : null
}

function readTextareaEditorCode(editorRoot: ParentNode) {
  const editorTextarea = editorRoot.querySelector<HTMLTextAreaElement>(
    '.monaco-editor textarea, textarea',
  )
  const textareaEditorCode = editorTextarea?.value

  return textareaEditorCode && textareaEditorCode.trim().length > 0
    ? textareaEditorCode
    : null
}

function readSelectedLanguageLabel(editorRoot: ParentNode) {
  const languageSelectorCandidates = [
    '[data-cy="lang-select"]',
    '[data-e2e-locator="console-language-picker"]',
    '[data-e2e-locator*="language" i]',
    '[data-cy*="language" i]',
    '[class*="language" i]',
    '[class*="lang" i]',
    'button[aria-haspopup="listbox"]',
    'button[aria-label*="language" i]',
    '[role="button"][aria-haspopup="listbox"]',
  ] as const

  for (const selector of languageSelectorCandidates) {
    const languageLabel = readLeetCodeLanguageLabelFromText(
      editorRoot.querySelector(selector)?.textContent,
    )

    if (languageLabel) {
      return languageLabel
    }
  }

  const compactTextCandidates = Array.from(
    editorRoot.querySelectorAll(
      'button, [role="button"], h1, h2, h3, h4, span, div',
    ),
  )

  for (const textCandidate of compactTextCandidates) {
    if (textCandidate.closest('.view-lines, .monaco-editor')) {
      continue
    }

    const languageLabel = readLeetCodeLanguageLabelFromText(
      textCandidate.textContent,
    )

    if (languageLabel) {
      return languageLabel
    }
  }

  return null
}
