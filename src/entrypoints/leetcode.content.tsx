import { createRoot, type Root } from 'react-dom/client'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'

import '@/app/styles.css'
import { OverlayApp } from '@/app/overlay/overlay-app'
import { AppProviders } from '@/app/providers/app-providers'
import { parseLeetCodeProblemLocation } from '@/lib/leetcode'
import { markOverlayStartup } from '@/lib/performance/overlay-startup-timing'

const overlayZIndex = 2147483000

export default defineContentScript({
  matches: [
    'https://leetcode.com/problems/*',
    'https://www.leetcode.com/problems/*',
  ],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    if (!parseLeetCodeProblemLocation(window.location.href)) {
      return
    }

    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'cognipace-overlay',
      position: 'overlay',
      anchor: 'body',
      append: 'last',
      alignment: 'top-right',
      zIndex: overlayZIndex,
      isolateEvents: true,
      onMount: (container) => {
        markOverlayStartup('content-mount')
        const root = createRoot(container)

        root.render(
          <AppProviders surface="content-script">
            <OverlayApp />
          </AppProviders>,
        )

        return root
      },
      onRemove: (root) => root?.unmount(),
    })

    ui.mount()
  },
})
