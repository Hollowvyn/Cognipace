export function readNormalizedText(node: ParentNode) {
  if (node.nodeType === Node.DOCUMENT_NODE) {
    return readNormalizedText((node as Document).body)
  }

  return stripRepeatedWhitespace(node.textContent ?? '')
}

export function readMultilineText(node: ParentNode) {
  return (node.textContent ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function preserveMathNotation(root: ParentNode) {
  for (const element of root.querySelectorAll('sup, sub')) {
    element.prepend(element.tagName.toLowerCase() === 'sup' ? '^(' : '_(')
    element.append(')')
  }
}

export function readTextFromHtml(value: string) {
  return value
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<(sup|sub)\b[^>]*>/gi, (_, tag: string) =>
      tag.toLowerCase() === 'sup' ? '^(' : '_(',
    )
    .replace(/<\/(?:sup|sub)\s*>/gi, ')')
    .replace(/<\/?(?:code|span|strong|em|b|i|a)\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|pre|li|ul|ol|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function stripRepeatedWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
