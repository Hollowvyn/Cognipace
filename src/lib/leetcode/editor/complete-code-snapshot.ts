import { z } from 'zod'

export const completeCodeSnapshotSchema = z.strictObject({
  code: z.string().max(32_000),
  language: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => value.trim().length > 0),
  capturedAt: z.number().finite().nonnegative(),
})

export type CompleteCodeSnapshot = z.infer<typeof completeCodeSnapshotSchema>

interface MonacoModel {
  getValue(): unknown
  getLanguageId(): unknown
  getValueLength?(): number
}

interface MonacoEditor {
  getDomNode(): unknown
  getModel(): MonacoModel | null
}

/** MAIN-world only. Never interpret Monaco's virtualized DOM as full source. */
export function captureCompleteLeetCodeEditorSnapshot(
  page: Window = window,
  now = Date.now,
): CompleteCodeSnapshot | null {
  try {
    // LeetCode's solution pane is #editor. Other Monaco instances include
    // testcase/helper editors; a model registry alone cannot identify source.
    const roots = page.document.querySelectorAll('#editor')
    const root = roots[0]
    if (roots.length !== 1 || !root) return null
    const monacoRoots = root.querySelectorAll('.monaco-editor')

    if (monacoRoots.length > 0) {
      const monacoRoot = monacoRoots[0]
      if (monacoRoots.length !== 1 || !monacoRoot) return null
      const monaco = (
        page as Window & {
          monaco?: { editor?: { getEditors?: () => unknown } }
        }
      ).monaco
      const editors = monaco?.editor?.getEditors?.()
      if (!Array.isArray(editors) || editors.length > 64) return null

      const matching = [...new Set(editors)].filter((candidate) => {
        if (!isMonacoEditor(candidate)) return false
        return candidate.getDomNode() === monacoRoot
      })
      if (matching.length !== 1 || !monacoRoot.isConnected) return null
      const model = (matching[0] as MonacoEditor).getModel()
      if (
        !model ||
        typeof model.getValue !== 'function' ||
        typeof model.getLanguageId !== 'function' ||
        (model.getValueLength && model.getValueLength() > 32_000)
      )
        return null

      return parseSnapshot(model.getValue(), model.getLanguageId(), now())
    }

    // A textarea may be a full editor only when the solution pane explicitly
    // identifies it as such. Generic textareas include testcase input/comments.
    const textareas = root.querySelectorAll<HTMLTextAreaElement>(
      'textarea[aria-label="Code editor"][data-language]',
    )
    const textarea = textareas[0]
    if (textareas.length !== 1 || !textarea) return null
    return parseSnapshot(textarea.value, textarea.dataset.language, now())
  } catch {
    // Page APIs can disappear during hydration/navigation or throw arbitrary
    // page-controlled errors. They never escape this untrusted boundary.
    return null
  }
}

function isMonacoEditor(value: unknown): value is MonacoEditor {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getDomNode' in value &&
    typeof value.getDomNode === 'function' &&
    'getModel' in value &&
    typeof value.getModel === 'function'
  )
}

function parseSnapshot(code: unknown, language: unknown, capturedAt: number) {
  const parsed = completeCodeSnapshotSchema.safeParse({
    code,
    language,
    capturedAt,
  })
  return parsed.success ? parsed.data : null
}
