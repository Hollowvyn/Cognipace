import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'wxt'

interface GeneratedManifestBranding {
  name: string
  action?:
    | {
        default_title?: string | undefined
      }
    | undefined
}

const productionIcons = {
  16: '/icon-16.png',
  32: '/icon-32.png',
  48: '/icon-48.png',
  128: '/icon-128.png',
}

const developmentIcons = {
  16: '/extension-icons/cognipace-dev-16.png',
  32: '/extension-icons/cognipace-dev-32.png',
  48: '/extension-icons/cognipace-dev-48.png',
  128: '/extension-icons/cognipace-dev-128.png',
}

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifest: ({ mode }) => {
    const isDevelopment = mode === 'development'
    const name = isDevelopment ? 'CogniPace Dev' : 'CogniPace'
    const icons = isDevelopment ? developmentIcons : productionIcons
    const description = isDevelopment
      ? 'Local-first LeetCode review and study pacing. (Dev Version)'
      : 'Local-first LeetCode review and study pacing.'

    return {
      name,
      description,
      icons,
      action: {
        default_icon: icons,
      },
      permissions: ['storage', 'alarms', 'notifications'],
      host_permissions: [
        'https://leetcode.com/*',
        'https://www.leetcode.com/*',
        'https://api.github.com/*',
        'https://api.openai.com/*',
        'https://api.anthropic.com/*',
        'https://generativelanguage.googleapis.com/*',
        'https://openrouter.ai/*',
      ],
      content_security_policy: {
        extension_pages:
          "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
      },
    }
  },
  hooks: {
    'build:manifestGenerated': (_, manifest: GeneratedManifestBranding) => {
      if (manifest.action) {
        manifest.action.default_title = manifest.name
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    optimizeDeps: {
      // WXT recreates dist during startup; scan only source entrypoints.
      entries: ['src/entrypoints/**/*.html'],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }),
})
