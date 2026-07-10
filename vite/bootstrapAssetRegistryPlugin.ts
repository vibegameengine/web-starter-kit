import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const VIRTUAL_BOOTSTRAP_ASSETS_ID = 'virtual:bootstrap-assets'
const RESOLVED_VIRTUAL_BOOTSTRAP_ASSETS_ID = '\0virtual:bootstrap-assets'

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
])

const ASSET_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
  '.mp3',
  '.wav',
  '.ogg',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.glb',
  '.gltf',
])

type BootstrapAssetKind = 'audio' | 'font' | 'image' | 'model' | 'other'

type CollectedAsset = {
  deferred: boolean
  importId: string
  kind: BootstrapAssetKind
  size: number
  source: string
}

type BootstrapAssetRegistryPluginOptions = {
  entry: string
}

type ResolvedImport = {
  external?: boolean | 'absolute'
  id: string
}

type ResolveContext = {
  resolve(
    source: string,
    importer?: string,
    options?: { skipSelf?: boolean },
  ): Promise<ResolvedImport | null>
}

/**
 * Walks the static import graph starting from `options.entry` and exposes every
 * reachable asset through the `virtual:bootstrap-assets` module. Consumers can
 * then preload the blocking subset before the first frame without maintaining a
 * hand-written manifest. Assets are `blocking` by default; append
 * `?bootstrap=deferred` (or `?deferred`) to an import to keep it out of the
 * blocking set. Lazy-imported routes/chunks never enter the graph.
 */
export function bootstrapAssetRegistryPlugin(
  options: BootstrapAssetRegistryPluginOptions,
): Plugin {
  let config: ResolvedConfig | null = null

  return {
    name: 'bootstrap-asset-registry',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    resolveId(id) {
      if (id === VIRTUAL_BOOTSTRAP_ASSETS_ID) {
        return RESOLVED_VIRTUAL_BOOTSTRAP_ASSETS_ID
      }

      return null
    },
    async load(id) {
      if (id !== RESOLVED_VIRTUAL_BOOTSTRAP_ASSETS_ID) {
        return null
      }

      if (!config) {
        throw new Error('bootstrap-asset-registry: Vite config is not ready.')
      }

      const assets = await collectBootstrapAssets(this, options.entry, config.root)
      return createBootstrapAssetModule(assets)
    },
  }
}

async function collectBootstrapAssets(
  context: ResolveContext,
  entry: string,
  root: string,
): Promise<CollectedAsset[]> {
  const visitedModules = new Set<string>()
  const collectedAssets = new Map<string, CollectedAsset>()
  const resolvedEntry = await resolveImport(context, entry, undefined)

  if (!resolvedEntry) {
    throw new Error(`bootstrap-asset-registry: Cannot resolve entry "${entry}".`)
  }

  await visitModule(context, resolvedEntry, root, visitedModules, collectedAssets)

  return [...collectedAssets.values()].sort((left, right) =>
    left.source.localeCompare(right.source),
  )
}

async function visitModule(
  context: ResolveContext,
  resolvedId: ResolvedImport,
  root: string,
  visitedModules: Set<string>,
  collectedAssets: Map<string, CollectedAsset>,
): Promise<void> {
  const moduleId = stripQueryAndHash(resolvedId.id)
  const extension = path.extname(moduleId).toLowerCase()

  if (ASSET_EXTENSIONS.has(extension)) {
    if (!collectedAssets.has(resolvedId.id)) {
      collectedAssets.set(resolvedId.id, {
        deferred: isDeferredAssetImport(resolvedId.id),
        importId: resolvedId.id,
        kind: getAssetKind(extension),
        size: await getFileSize(moduleId),
        source: toDisplayPath(moduleId, root),
      })
    }

    return
  }

  if (moduleId.includes('/node_modules/') && extension !== '.css') {
    return
  }

  if (!SOURCE_EXTENSIONS.has(extension) || visitedModules.has(moduleId)) {
    return
  }

  visitedModules.add(moduleId)

  let source: string
  try {
    source = await readFile(moduleId, 'utf8')
  } catch {
    return
  }

  const specifiers = extension === '.css'
    ? extractCssSpecifiers(source)
    : extractModuleSpecifiers(source)

  for (const specifier of specifiers) {
    if (shouldIgnoreSpecifier(specifier)) {
      continue
    }

    const resolvedChild = await resolveImport(context, specifier, moduleId)
    if (!resolvedChild || resolvedChild.external) {
      continue
    }

    await visitModule(
      context,
      resolvedChild,
      root,
      visitedModules,
      collectedAssets,
    )
  }
}

async function resolveImport(
  context: ResolveContext,
  source: string,
  importer: string | undefined,
): Promise<ResolvedImport | null> {
  return context.resolve(source, importer, { skipSelf: true })
}

function extractModuleSpecifiers(source: string): string[] {
  const specifiers = new Set<string>()
  const patterns = [
    /\bimport\s+(?!type\b)(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?!type\b)[^'"]+?\s+from\s+['"]([^'"]+)['"]/g,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier) {
        specifiers.add(specifier)
      }
    }
  }

  return [...specifiers]
}

function extractCssSpecifiers(source: string): string[] {
  const specifiers = new Set<string>()
  const patterns = [
    /@import\s+(?:url\()?['"]([^'")]+)['"]\)?/g,
    /url\(\s*['"]?([^'")]+)['"]?\s*\)/g,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier) {
        specifiers.add(specifier)
      }
    }
  }

  return [...specifiers]
}

function shouldIgnoreSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith('data:') ||
    specifier.startsWith('http:') ||
    specifier.startsWith('https:') ||
    specifier.startsWith('#') ||
    specifier.startsWith('virtual:')
  )
}

function stripQueryAndHash(id: string): string {
  const hashIndex = id.indexOf('#')
  const queryIndex = id.indexOf('?')
  const boundary = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]

  return boundary === undefined ? id : id.slice(0, boundary)
}

function getAssetKind(extension: string): BootstrapAssetKind {
  if (extension === '.woff' || extension === '.woff2' || extension === '.ttf' || extension === '.otf') {
    return 'font'
  }

  if (extension === '.mp3' || extension === '.wav' || extension === '.ogg') {
    return 'audio'
  }

  if (extension === '.glb' || extension === '.gltf') {
    return 'model'
  }

  if (
    extension === '.png' ||
    extension === '.jpg' ||
    extension === '.jpeg' ||
    extension === '.webp' ||
    extension === '.avif' ||
    extension === '.svg'
  ) {
    return 'image'
  }

  return 'other'
}

async function getFileSize(filePath: string): Promise<number> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.size
  } catch {
    return 0
  }
}

function toDisplayPath(filePath: string, root: string): string {
  const relativePath = path.relative(root, filePath)
  return relativePath.startsWith('..') ? filePath : relativePath
}

function isDeferredAssetImport(importId: string): boolean {
  return /(?:\?|&)(?:bootstrap=deferred|deferred)(?:&|$)/.test(importId)
}

function createBootstrapAssetModule(assets: CollectedAsset[]): string {
  const imports = assets.map((asset, index) =>
    `import assetUrl${index} from ${JSON.stringify(asset.importId)};`,
  )

  const entries = assets.map((asset, index) => `{
  deferred: ${asset.deferred},
  id: ${JSON.stringify(`bootstrap-asset-${index}`)},
  kind: ${JSON.stringify(asset.kind)},
  size: ${asset.size},
  source: ${JSON.stringify(asset.source)},
  url: assetUrl${index},
}`)

  return [
    ...imports,
    `export const bootstrapAssetEntries = [${entries.join(',\n')}];`,
  ].join('\n')
}
