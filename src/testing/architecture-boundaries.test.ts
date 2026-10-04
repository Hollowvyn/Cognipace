import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const srcRoot = join(repoRoot, 'src')
const featureDeepImportPattern =
  /(?:\bfrom\s+|\bimport\s+|\bimport\()\s*['"](@\/features\/([^/'"]+)\/(?!(?:domain|api\/[^'"]*(?:contracts|serializers)|server\/[^'"]*service)(?:['"]|\/))[^'"]+)['"]/g
const featureIndexRuntimeExportPattern =
  /export\s+(?:type\s+)?(?:\{[\s\S]*?\}|\*)\s+from\s+['"]\.\/(?:data|server)(?:\/|['"])/
const reviewSchedulingWritePattern =
  /\.\s*(?:insert|update|delete)\s*\(\s*(?:reviewAttempts|problemPractice|fsrsCards)\b/
const existingNonAiHostPermissions = [
  'https://leetcode.com/*',
  'https://www.leetcode.com/*',
  'https://api.github.com/*',
]
const approvedAiProviderHostPermissions = [
  'https://api.openai.com/*',
  'https://api.anthropic.com/*',
  'https://generativelanguage.googleapis.com/*',
]

describe('architecture boundaries', () => {
  it('keeps shared infrastructure from importing app or feature code', () => {
    const sharedFiles = sourceFiles([
      'components',
      'hooks',
      'lib',
      'platform',
      'types',
      'utils',
    ])
    const offenders = sharedFiles.filter((file) => {
      const content = readFileSync(file, 'utf8')
      return /from ['"]@\/(app|features|entrypoints)\//.test(content)
    })

    expect(offenders.map(toRepoPath)).toEqual([])
  })

  it('keeps app feature imports on public feature surfaces', () => {
    const offenders = sourceFiles(['app']).flatMap((file) =>
      findNestedFeatureImports(file).map(({ importPath }) =>
        formatImportOffender(file, importPath),
      ),
    )

    expect(offenders).toEqual([])
  })

  it('keeps cross-feature imports on public feature surfaces', () => {
    const offenders = sourceFiles(['features']).flatMap((file) => {
      const currentFeatureName = getOwningFeatureName(file)

      return findNestedFeatureImports(file)
        .filter(({ featureName }) => featureName !== currentFeatureName)
        .map(({ importPath }) => formatImportOffender(file, importPath))
    })

    expect(offenders).toEqual([])
  })

  it('keeps root feature barrels free of data and server exports', () => {
    const offenders = featureRootIndexFiles().filter((file) => {
      const content = readFileSync(file, 'utf8')
      return featureIndexRuntimeExportPattern.test(content)
    })

    expect(offenders.map(toRepoPath)).toEqual([])
  })

  it('does not introduce a custom runtime-rpc library', () => {
    const libEntries = readdirSync(join(srcRoot, 'lib'))

    expect(libEntries).not.toContain('runtime-rpc')
  })

  it('keeps review scheduling writes behind the practice repository', () => {
    const allowedWriteFiles = new Set([
      'src/features/practice/data/practice-repository.ts',
      'src/features/backup/data/backup-repository.ts',
    ])
    const offenders = productionSourceFiles()
      .filter((file) => !allowedWriteFiles.has(toRepoPath(file)))
      .filter((file) => {
        const content = readFileSync(file, 'utf8')
        return reviewSchedulingWritePattern.test(content)
      })

    expect(offenders.map(toRepoPath)).toEqual([])
  })

  it('keeps global styles free of legacy product class selectors', () => {
    const styleFiles = [
      join(srcRoot, 'app/styles.css'),
      join(srcRoot, 'styles/base.css'),
      join(srcRoot, 'styles/surfaces.css'),
      join(srcRoot, 'styles/tokens.css'),
    ]
    const offenders = styleFiles.filter((file) => {
      const content = readFileSync(file, 'utf8')
      return /\.cp-[a-z0-9-]+/.test(content)
    })

    expect(offenders.map(toRepoPath)).toEqual([])
  })

  it('keeps credential construction inside genai and the standalone AI integration', () => {
    const apiKeyPattern = /\bapiKey\b/
    const genaiPath = `${join(srcRoot, 'features/genai')}/`
    const libAiPath = `${join(srcRoot, 'lib/ai')}/`
    const offenders = sourceFiles([
      'app',
      'components',
      'entrypoints',
      'features',
      'hooks',
      'lib',
      'platform',
      'utils',
    ])
      .filter(
        (file) => !file.startsWith(genaiPath) && !file.startsWith(libAiPath),
      )
      .filter((file) => !toRepoPath(file).includes('/testing/'))
      .filter((file) => apiKeyPattern.test(readFileSync(file, 'utf8')))

    expect(offenders.map(toRepoPath)).toEqual([])
  })

  it('confines AI SDK and provider package imports to src/lib/ai', () => {
    const libAiPath = `${join(srcRoot, 'lib/ai')}/`
    const offenders = productionSourceFiles()
      .filter((file) => !file.startsWith(libAiPath))
      .filter((file) =>
        /(?:from\s+|import\s*\()\s*['"](?:ai|@ai-sdk\/[^'"]+)['"]/.test(
          readFileSync(file, 'utf8'),
        ),
      )
    expect(offenders.map(toRepoPath)).toEqual([])
  })

  it('declares only the approved AI provider host permissions', () => {
    const config = readFileSync(join(repoRoot, 'wxt.config.ts'), 'utf8')
    const hostPermissions = extractHostPermissions(config)
    const aiProviderHostPermissions = hostPermissions.filter(
      (hostPermission) =>
        !existingNonAiHostPermissions.includes(hostPermission),
    )

    expect(hostPermissions).toEqual(
      expect.arrayContaining(existingNonAiHostPermissions),
    )
    expect(aiProviderHostPermissions).toEqual(approvedAiProviderHostPermissions)
    expect(hostPermissions).not.toContain('https://*/*')
    expect(hostPermissions).not.toContain('*://*/*')
  })

  it('keeps the notifications permission documented for due reminders', () => {
    const config = readFileSync(join(repoRoot, 'wxt.config.ts'), 'utf8')

    expect(config).toContain("'notifications'")
  })

  it('keeps notification background code from importing FSRS internals directly', () => {
    const notificationFiles = sourceFiles(['extension']).filter(
      (file) =>
        file.includes('due-notification') || file.includes('alarm-scheduler'),
    )
    const offenders = notificationFiles.filter((file) => {
      const content = readFileSync(file, 'utf8')
      return /from ['"]@\/lib\/fsrs/.test(content)
    })

    expect(offenders.map(toRepoPath)).toEqual([])
  })

  it('keeps ts-fsrs package import to src/lib/fsrs only', () => {
    const libFsrsPath = join(srcRoot, 'lib', 'fsrs')
    const offenders = productionSourceFiles()
      .filter((file) => !file.startsWith(libFsrsPath + '/'))
      .filter((file) => {
        const content = readFileSync(file, 'utf8')
        return /from ['"]ts-fsrs['"]/.test(content)
      })

    expect(offenders.map(toRepoPath)).toEqual([])
  })

  it('keeps src/app/dashboard free of @/lib/fsrs imports', () => {
    const offenders = sourceFiles(['app']).filter((file) => {
      if (!file.includes('/dashboard/')) return false
      const content = readFileSync(file, 'utf8')
      return /from ['"]@\/lib\/fsrs/.test(content)
    })

    expect(offenders.map(toRepoPath)).toEqual([])
  })

  it('keeps queue feature free of tracks dependency', () => {
    const offenders = sourceFiles(['features']).filter((file) => {
      if (!file.includes('/features/queue/')) return false
      const content = readFileSync(file, 'utf8')
      return /from ['"]@\/features\/tracks/.test(content)
    })

    expect(offenders.map(toRepoPath)).toEqual([])
  })

  it('keeps settings components free of browser alarm and notification API calls', () => {
    const settingsComponentsPath = join(
      srcRoot,
      'features',
      'settings',
      'components',
    )
    const offenders = sourceFiles(['features']).filter((file) => {
      if (!file.startsWith(settingsComponentsPath + '/')) return false
      const content = readFileSync(file, 'utf8')
      return /browser\.alarms|chrome\.alarms|browser\.notifications|chrome\.notifications/.test(
        content,
      )
    })

    expect(offenders.map(toRepoPath)).toEqual([])
  })
})

function sourceFiles(directories: string[]) {
  return directories.flatMap((directory) =>
    walk(join(srcRoot, directory)).filter(
      (file) =>
        (file.endsWith('.ts') || file.endsWith('.tsx')) &&
        !file.endsWith('.test.ts') &&
        !file.endsWith('.test.tsx'),
    ),
  )
}

function productionSourceFiles() {
  return walk(srcRoot).filter(
    (file) =>
      (file.endsWith('.ts') || file.endsWith('.tsx')) &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('.test.tsx') &&
      !toRepoPath(file).startsWith('src/testing/'),
  )
}

function featureRootIndexFiles() {
  return sourceFiles(['features']).filter((file) => {
    const parts = relative(join(srcRoot, 'features'), file).split(/[\\/]/)

    return parts.length === 2 && parts[1] === 'index.ts'
  })
}

function extractHostPermissions(config: string) {
  const [, hostPermissionsBlock] =
    config.match(/host_permissions:\s*\[([\s\S]*?)\]/) ?? []

  if (!hostPermissionsBlock) {
    throw new Error('wxt.config.ts must declare manifest.host_permissions')
  }

  return Array.from(
    hostPermissionsBlock.matchAll(/['"]([^'"]+)['"]/g),
    ([, hostPermission]) => {
      if (!hostPermission) {
        throw new Error('host_permissions contains an unreadable host entry')
      }

      return hostPermission
    },
  )
}

function findNestedFeatureImports(file: string) {
  const content = readFileSync(file, 'utf8')
  const imports: Array<{ featureName: string; importPath: string }> = []

  for (const match of content.matchAll(featureDeepImportPattern)) {
    const importPath = match[1]
    const featureName = match[2]

    if (importPath && featureName) {
      imports.push({ featureName, importPath })
    }
  }

  return imports
}

function getOwningFeatureName(file: string) {
  const [featureName] = relative(join(srcRoot, 'features'), file).split(/[\\/]/)

  if (!featureName) {
    throw new Error(`Could not determine owning feature for ${file}`)
  }

  return featureName
}

function formatImportOffender(file: string, importPath: string) {
  return `${toRepoPath(file)} -> ${importPath}`
}

function walk(path: string): string[] {
  if (statSync(path).isFile()) {
    return [path]
  }

  return readdirSync(path).flatMap((entry) => walk(join(path, entry)))
}

function toRepoPath(path: string) {
  return relative(repoRoot, path)
}
