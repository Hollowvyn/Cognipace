import { defineBackground } from 'wxt/utils/define-background'

import { registerBackgroundHandlers } from '@/extension/background/register-handlers'
import { restrictSecretStorageAccess } from '@/platform/secrets'

export default defineBackground({
  type: 'module',
  main() {
    void startTrustedBackground()
  },
})

function startTrustedBackground() {
  registerBackgroundHandlers()
  void restrictSecretStorageAccess().catch(() => {
    console.error(
      'CogniPace trusted storage is unavailable; secret operations can retry.',
    )
  })
}
