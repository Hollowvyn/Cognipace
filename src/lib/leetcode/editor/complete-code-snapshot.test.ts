import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  captureCompleteLeetCodeEditorSnapshot,
  completeCodeSnapshotSchema,
} from './complete-code-snapshot'

function editor(code: string, root: Element, language = 'typescript') {
  return {
    getDomNode: () => root,
    getModel: () => ({
      getValue: () => code,
      getLanguageId: () => language,
    }),
  }
}

function mountEditor() {
  document.body.innerHTML =
    '<div id="editor"><div class="monaco-editor"><div class="view-lines"><div class="view-line">visible only</div></div><textarea>input fragment</textarea></div></div>'
  return document.querySelector('.monaco-editor')!
}

function exposeEditors(editors: unknown[]) {
  vi.stubGlobal('monaco', { editor: { getEditors: () => editors } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('complete editor snapshots', () => {
  it('reads the full attached model beyond virtualized visible lines', () => {
    const root = mountEditor()
    const code = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')
    exposeEditors([editor(code, root)])

    expect(captureCompleteLeetCodeEditorSnapshot(window, () => 123)).toEqual({
      code,
      language: 'typescript',
      capturedAt: 123,
    })
  })

  it('selects the solution editor rather than an arbitrary first model or helper editor', () => {
    const root = mountEditor()
    const helper = document.createElement('div')
    helper.className = 'monaco-editor'
    document.body.append(helper)
    exposeEditors([editor('testcase', helper), editor('solution', root)])

    expect(captureCompleteLeetCodeEditorSnapshot()?.code).toBe('solution')
  })

  it('rejects multiple solution editors and duplicate solution roots', () => {
    const root = mountEditor()
    exposeEditors([editor('first', root), editor('second', root)])
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
    exposeEditors([editor('first', root)])
    document.body.insertAdjacentHTML('beforeend', '<div id="editor"></div>')
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
  })

  it('deduplicates repeated references to the same editor', () => {
    const current = editor('solution', mountEditor())
    exposeEditors([current, current])
    expect(captureCompleteLeetCodeEditorSnapshot()?.code).toBe('solution')
  })

  it('rejects missing globals, disconnected models, and missing models', () => {
    const root = mountEditor()
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
    exposeEditors([editor('detached', document.createElement('div'))])
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
    exposeEditors([{ getDomNode: () => root, getModel: () => null }])
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
  })

  it('does not use visible lines or the Monaco typing textarea when the model is unavailable', () => {
    mountEditor()
    exposeEditors([])
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
  })

  it('supports only a real full-text code editor textarea outside Monaco', () => {
    document.body.innerHTML =
      '<div id="editor"><textarea aria-label="Code editor" data-language="python">complete source\nlast line</textarea></div><textarea>unrelated</textarea>'
    expect(captureCompleteLeetCodeEditorSnapshot(window, () => 123)).toEqual({
      code: 'complete source\nlast line',
      language: 'python',
      capturedAt: 123,
    })
    document.querySelector('#editor textarea')!.removeAttribute('aria-label')
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
  })

  it('preserves empty code and enforces exact snapshot bounds', () => {
    const root = mountEditor()
    exposeEditors([editor('', root)])
    expect(captureCompleteLeetCodeEditorSnapshot()?.code).toBe('')
    exposeEditors([editor('x'.repeat(32_000), root)])
    expect(captureCompleteLeetCodeEditorSnapshot()?.code).toHaveLength(32_000)
    exposeEditors([editor('x'.repeat(32_001), root)])
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
    exposeEditors([editor('x', root, ' '.repeat(2))])
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
    exposeEditors([editor('x', root, 'x'.repeat(81))])
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
    expect(
      completeCodeSnapshotSchema.safeParse({
        code: '',
        language: 'python',
        capturedAt: NaN,
      }).success,
    ).toBe(false)
    expect(
      completeCodeSnapshotSchema.safeParse({
        code: '',
        language: 'python',
        capturedAt: 1,
        extra: true,
      }).success,
    ).toBe(false)
  })

  it('returns controlled unavailable when page editor methods throw', () => {
    mountEditor()
    vi.stubGlobal('monaco', {
      editor: {
        getEditors: () => {
          throw new Error('page secret')
        },
      },
    })
    expect(captureCompleteLeetCodeEditorSnapshot()).toBeNull()
  })
})
