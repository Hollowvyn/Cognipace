import { defineContentScript } from 'wxt/utils/define-content-script'

import { installLeetCodeEditorSnapshotBridge } from '@/lib/leetcode/editor/editor-snapshot-bridge'

export default defineContentScript({
  matches: [
    'https://leetcode.com/problems/*',
    'https://www.leetcode.com/problems/*',
  ],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    installLeetCodeEditorSnapshotBridge()
  },
})
