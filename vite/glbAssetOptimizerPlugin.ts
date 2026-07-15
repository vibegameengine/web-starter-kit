import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { Logger, NodeIO } from '@gltf-transform/core'
import type { Transform } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, meshopt, prune, textureCompress } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import type { Plugin, ResolvedConfig } from 'vite'
import { normalizePath } from 'vite'

import { createAssetOptimizerCache } from './assetOptimizerCache'
import type { AssetOptimizerCache } from './assetOptimizerCache'

type TextureFormat = 'webp' | 'jpeg' | 'png' | 'avif' | 'keep'

type GlbOptimizeOptions = {
  readonly albedoOnly: boolean
  readonly maxTextureSize: number
  readonly meshopt: boolean
  readonly textureFormat: TextureFormat
  readonly textureQuality: number
}

type GlbOptimizeResult = {
  readonly bytes: Uint8Array
  readonly inputBytes: number
  readonly outputBytes: number
  readonly path: string
  readonly wasOptimized: boolean
  readonly cacheKey: string
  readonly fromCache: boolean
}

// Persisted alongside the optimized bytes so a cache hit can rebuild the report
// without re-running the pipeline. `outputBytes` is always `bytes.byteLength`.
type GlbCacheMeta = {
  readonly inputBytes: number
  readonly wasOptimized: boolean
}

const GLB_MODULE_QUERY = 'glb-optimized'
const GLB_OPT_OUT_QUERY = 'glb-optimize'
const GLB_SERVE_PREFIX = '/@glb-optimizer/'
const GLB_CACHE_NAMESPACE = 'glb-optimizer'
// Bump when the optimization pipeline changes so stale cache entries are ignored.
const GLB_CACHE_VERSION = 1

// Per-import overrides, e.g. `?texture=1024&texture-format=keep`.
const TEXTURE_SIZE_QUERY = 'texture'
const TEXTURE_FORMAT_QUERY = 'texture-format'
const TEXTURE_QUALITY_QUERY = 'texture-quality'
// `?albedo` — keep only the base-color texture (drop normal/MR/emissive/AO), for
// models rendered with a flat "painted" look where extra maps are dead weight.
const ALBEDO_ONLY_QUERY = 'albedo'
// `?meshopt` — quantize + Meshopt-compress geometry/morph/animation buffers
// (EXT_meshopt_compression). drei's useGLTF wires the decoder automatically.
const MESHOPT_QUERY = 'meshopt'

// Silences gltf-transform's per-transform INFO/WARN chatter (`prune: Removed
// types…`, `reorder: …`) — cosmetic noise on every processed model.
const QUIET_LOGGER = new Logger(Logger.Verbosity.ERROR)

const DEFAULT_MAX_TEXTURE_SIZE = 2048
const DEFAULT_TEXTURE_FORMAT: TextureFormat = 'webp'
const DEFAULT_TEXTURE_QUALITY = 80

// gltf-transform texture slots we never lossy-recompress into webp/jpeg, since
// re-encoding tangent-space data corrupts lighting. They still get resized.
const NORMAL_LIKE_SLOTS = ['normalTexture']

/**
 * Repacks project `.glb` / `.gltf` models at build time. The default pipeline
 * cleans the document (`dedup` + `prune` + `flatten`) and shrinks every embedded
 * texture (resize to a max dimension, re-encode to WebP), then writes a single
 * self-contained `.glb`.
 *
 * Behaviour is tunable per import via query params (mirroring the audio plugin's
 * `?audio-optimize=off` convention):
 *   `?glb-optimize=off`     keep the original bytes untouched
 *   `?texture=1024`         cap texture dimension at 1024 px (default 2048)
 *   `?texture-format=keep`  resize only, keep each texture's source format
 *                           (or `webp` | `jpeg` | `png` | `avif`)
 *   `?texture-quality=90`   encoder quality 0-100 (default 80)
 * Models stay in the blocking preloader set by default; append
 * `?bootstrap=deferred` to keep one out. Works in `serve` (served URL) and
 * `build` (emitted asset). If repacking would not shrink the file it is kept
 * untouched.
 */
export function glbAssetOptimizerPlugin(): Plugin {
  let config: ResolvedConfig | null = null
  let cache: AssetOptimizerCache | null = null
  const optimizedAssets = new Map<string, Promise<GlbOptimizeResult>>()
  const reports = new Map<string, GlbOptimizeResult>()
  const serveKeyToId = new Map<string, string>()

  return {
    name: 'glb-asset-optimizer',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      config = resolvedConfig
      cache = createAssetOptimizerCache(resolvedConfig.root, GLB_CACHE_NAMESPACE, GLB_CACHE_VERSION)
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = req.url

        if (!requestUrl?.startsWith(GLB_SERVE_PREFIX)) {
          next()
          return
        }

        const serveKey = decodeServeKey(requestUrl)
        const moduleId = serveKeyToId.get(serveKey)

        if (!moduleId || !cache) {
          res.statusCode = 404
          res.end('GLB asset not found')
          return
        }

        const result = await getOptimizedAsset(optimizedAssets, reports, cache, moduleId)

        res.statusCode = 200
        res.setHeader('Content-Type', 'model/gltf-binary')
        res.setHeader('Content-Length', result.bytes.byteLength)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.end(result.bytes)
      })
    },
    // Pre-warm on update: when a source model changes while the dev server is
    // running, drop its memoized result, re-optimize it eagerly (so the disk +
    // memory caches are hot before the browser asks), then hand HMR the changed
    // modules so the client refetches the fresh bytes. Without this the in-memory
    // cache (keyed by import id, not content) would keep serving the STALE
    // optimized bytes for an edited-in-place model.
    async handleHotUpdate(context) {
      if (!config || !cache || !isProjectModelAsset(normalizePath(context.file), config.root)) {
        return
      }

      const file = normalizePath(context.file)
      const affected = [...optimizedAssets.keys()].filter(
        (moduleId) => normalizePath(stripQueryAndHash(moduleId)) === file,
      )

      if (affected.length === 0) {
        return
      }

      const modules = []
      for (const moduleId of affected) {
        optimizedAssets.delete(moduleId)
        reports.delete(moduleId)

        const module = context.server.moduleGraph.getModuleById(moduleId)
        if (module) {
          modules.push(module)
        }
      }

      await Promise.all(
        affected.map((moduleId) =>
          getOptimizedAsset(optimizedAssets, reports, cache!, moduleId).catch(() => undefined),
        ),
      )

      return modules.length > 0 ? modules : undefined
    },
    async resolveId(source, importer) {
      if (!config || !isInterceptableModelImport(source)) {
        return null
      }

      const resolved = await this.resolve(source, importer, { skipSelf: true })

      if (!resolved || resolved.external) {
        return null
      }

      const filePath = stripQueryAndHash(resolved.id)

      if (!isProjectModelAsset(filePath, config.root)) {
        return null
      }

      // Carry the source query onto the tagged id so per-import overrides
      // (texture size/format/quality, `bootstrap=deferred`) survive to `load`.
      const query = extractQuery(source)
      const suffix = query ? `&${query}` : ''
      return `${filePath}?${GLB_MODULE_QUERY}${suffix}`
    },
    async load(id) {
      if (!config || !cache || !isOptimizedModelModuleId(id)) {
        return null
      }

      const result = await getOptimizedAsset(optimizedAssets, reports, cache, id)

      if (config.command === 'serve') {
        const serveKey = toServeKey(id, config.root)
        serveKeyToId.set(serveKey, id)

        return createUrlModule(createServeUrl(serveKey, result.cacheKey))
      }

      const assetId = this.emitFile({
        name: `${path.basename(stripQueryAndHash(id), path.extname(stripQueryAndHash(id)))}.glb`,
        source: result.bytes,
        type: 'asset',
      })

      return `export default import.meta.ROLLUP_FILE_URL_${assetId};`
    },
    closeBundle() {
      if (reports.size === 0) {
        return
      }

      let optimizedCount = 0
      let savedBytes = 0

      for (const result of reports.values()) {
        if (result.wasOptimized) {
          optimizedCount += 1
          savedBytes += result.inputBytes - result.outputBytes
        }

        console.log(
          `[glb] ${result.wasOptimized ? 'optimized' : 'kept'}${result.fromCache ? ' (cached)' : ''} ${toRelativePath(result.path)}: ${formatBytes(result.inputBytes)} -> ${formatBytes(result.outputBytes)}`,
        )
      }

      console.log(`[glb] done: ${optimizedCount} optimized, ${formatBytes(savedBytes)} saved`)
    },
  }
}

async function getOptimizedAsset(
  memoryCache: Map<string, Promise<GlbOptimizeResult>>,
  reports: Map<string, GlbOptimizeResult>,
  diskCache: AssetOptimizerCache,
  moduleId: string,
): Promise<GlbOptimizeResult> {
  let pendingResult = memoryCache.get(moduleId)

  if (!pendingResult) {
    pendingResult = optimizeModelAsset(moduleId, diskCache)
    memoryCache.set(moduleId, pendingResult)
  }

  const result = await pendingResult
  reports.set(moduleId, result)
  return result
}

async function optimizeModelAsset(
  moduleId: string,
  diskCache: AssetOptimizerCache,
): Promise<GlbOptimizeResult> {
  const filePath = stripQueryAndHash(moduleId)
  const options = parseOptimizeOptions(moduleId)
  const bypass = shouldBypassOptimization(moduleId)
  const isBinaryInput = path.extname(filePath).toLowerCase() === '.glb'

  // Hash the raw source bytes + resolved options, so an edit to the source (or a
  // changed option) is a cache miss and re-optimizes, while an unchanged source
  // is a hit across dev restarts and builds.
  const sourceBytes = new Uint8Array(await readFile(filePath))
  const cacheKey = diskCache.computeKey(sourceBytes, serializeVariant(options, bypass))

  const cached = await diskCache.read<GlbCacheMeta>(cacheKey)
  if (cached) {
    return {
      bytes: cached.bytes,
      inputBytes: cached.meta.inputBytes,
      outputBytes: cached.bytes.byteLength,
      path: filePath,
      wasOptimized: cached.meta.wasOptimized,
      cacheKey,
      fromCache: true,
    }
  }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

  if (options.meshopt) {
    // Writing EXT_meshopt_compression needs the encoder wired onto the IO.
    await MeshoptEncoder.ready
    io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  }

  // `.gltf` inputs resolve their external `.bin`/textures from disk; `.glb`
  // inputs are self-contained. Either way we write a single binary `.glb`.
  // Baseline = the true `.glb` file bytes, or, for `.gltf`, a plain repack into
  // a single `.glb` (the honest single-file equivalent to compare against).
  const originalBytes = isBinaryInput
    ? sourceBytes
    : await new NodeIO().registerExtensions(ALL_EXTENSIONS).writeBinary(await io.read(filePath))
  const inputSize = originalBytes.byteLength

  // `?glb-optimize=off` opts a single import out — we still handle it (so the id
  // resolves) but emit the untouched bytes with no texture/geometry changes.
  if (bypass) {
    return finalizeResult(diskCache, cacheKey, {
      bytes: originalBytes,
      inputBytes: inputSize,
      outputBytes: inputSize,
      path: filePath,
      wasOptimized: false,
      cacheKey,
      fromCache: false,
    })
  }

  const document = await io.read(filePath)
  document.setLogger(QUIET_LOGGER)

  const transforms = [
    ...(options.albedoOnly ? [stripToAlbedo()] : []),
    dedup(),
    flatten(),
    prune(),
    textureCompress({
      encoder: sharp,
      ...(options.textureFormat === 'keep' ? {} : { targetFormat: options.textureFormat }),
      resize: [options.maxTextureSize, options.maxTextureSize],
      quality: options.textureQuality,
      slots: /^(?!normalTexture$).*/,
    }),
    ...(NORMAL_LIKE_SLOTS.length > 0
      ? [
          textureCompress({
            encoder: sharp,
            resize: [options.maxTextureSize, options.maxTextureSize],
            slots: /^normalTexture$/,
          }),
        ]
      : []),
    // Geometry/animation compression runs last, on the final buffers.
    ...(options.meshopt ? [meshopt({ encoder: MeshoptEncoder, level: 'high' })] : []),
  ]

  await document.transform(...transforms)

  const encoded = await io.writeBinary(document)

  if (encoded.byteLength >= inputSize) {
    return finalizeResult(diskCache, cacheKey, {
      bytes: originalBytes,
      inputBytes: inputSize,
      outputBytes: inputSize,
      path: filePath,
      wasOptimized: false,
      cacheKey,
      fromCache: false,
    })
  }

  return finalizeResult(diskCache, cacheKey, {
    bytes: encoded,
    inputBytes: inputSize,
    outputBytes: encoded.byteLength,
    path: filePath,
    wasOptimized: true,
    cacheKey,
    fromCache: false,
  })
}

// Persist the freshly optimized result to the disk cache before returning it, so
// the next dev restart / build reuses it. Cache-write failures are non-fatal.
async function finalizeResult(
  diskCache: AssetOptimizerCache,
  cacheKey: string,
  result: GlbOptimizeResult,
): Promise<GlbOptimizeResult> {
  await diskCache
    .write<GlbCacheMeta>(cacheKey, {
      bytes: result.bytes,
      meta: { inputBytes: result.inputBytes, wasOptimized: result.wasOptimized },
    })
    .catch(() => undefined)

  return result
}

// A deterministic tag for the resolved options, so distinct per-import settings
// (texture size/format/quality, albedo, meshopt, opt-out) get distinct cache
// keys. Irrelevant query params (e.g. `bootstrap`) never reach here.
function serializeVariant(options: GlbOptimizeOptions, bypass: boolean): string {
  return JSON.stringify({
    albedoOnly: options.albedoOnly,
    bypass,
    maxTextureSize: options.maxTextureSize,
    meshopt: options.meshopt,
    textureFormat: options.textureFormat,
    textureQuality: options.textureQuality,
  })
}

function parseOptimizeOptions(moduleId: string): GlbOptimizeOptions {
  const params = new URLSearchParams(extractQuery(moduleId))

  return {
    albedoOnly: params.has(ALBEDO_ONLY_QUERY),
    maxTextureSize: parsePositiveInt(params.get(TEXTURE_SIZE_QUERY), DEFAULT_MAX_TEXTURE_SIZE),
    meshopt: params.has(MESHOPT_QUERY),
    textureFormat: parseTextureFormat(params.get(TEXTURE_FORMAT_QUERY)),
    textureQuality: clampQuality(
      parsePositiveInt(params.get(TEXTURE_QUALITY_QUERY), DEFAULT_TEXTURE_QUALITY),
    ),
  }
}

// Detaches every non-base-color texture slot from all materials; the orphaned
// textures are then dropped by the following `prune()`.
function stripToAlbedo(): Transform {
  return (document) => {
    for (const material of document.getRoot().listMaterials()) {
      material.setNormalTexture(null)
      material.setMetallicRoughnessTexture(null)
      material.setEmissiveTexture(null)
      material.setOcclusionTexture(null)
    }
  }
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (value === null) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function clampQuality(value: number): number {
  return Math.max(1, Math.min(100, value))
}

function parseTextureFormat(value: string | null): TextureFormat {
  if (value === 'keep' || value === 'webp' || value === 'jpeg' || value === 'png' || value === 'avif') {
    return value
  }

  if (value === 'jpg') {
    return 'jpeg'
  }

  return DEFAULT_TEXTURE_FORMAT
}

// Intercept every project `.glb`/`.gltf` import — including `?glb-optimize=off`
// — so the id always resolves through this plugin. The opt-out is handled later
// by emitting the untouched bytes; leaving it to Vite fails because a `.glb`
// specifier still carrying a query is not a loadable path.
function isInterceptableModelImport(source: string): boolean {
  return isModelImport(source) && !source.includes(`?${GLB_MODULE_QUERY}`)
}

function isModelImport(source: string): boolean {
  const file = stripQueryAndHash(source).toLowerCase()
  return file.endsWith('.glb') || file.endsWith('.gltf')
}

function isOptimizedModelModuleId(id: string): boolean {
  return new URLSearchParams(extractQuery(id)).has(GLB_MODULE_QUERY)
}

function shouldBypassOptimization(id: string): boolean {
  const value = new URLSearchParams(extractQuery(id)).get(GLB_OPT_OUT_QUERY)
  return value === 'off' || value === '0' || value === 'false' || value === 'original'
}

function isProjectModelAsset(filePath: string, root: string): boolean {
  const lower = filePath.toLowerCase()
  if (!lower.endsWith('.glb') && !lower.endsWith('.gltf')) {
    return false
  }

  const normalizedPath = path.relative(root, filePath).split(path.sep).join('/')
  return !normalizedPath.startsWith('../') && normalizedPath.startsWith('src/')
}

function createUrlModule(url: string): string {
  return `export default ${JSON.stringify(url)};`
}

function createServeUrl(serveKey: string, version: string): string {
  // `version` is the content-addressed cache key, so the served URL changes iff
  // the optimized bytes change — the browser's immutable cache never sticks on a
  // stale variant after a source edit + dev refresh.
  return `${GLB_SERVE_PREFIX}${encodeURIComponent(serveKey)}?v=${version.slice(0, 16)}`
}

function decodeServeKey(requestUrl: string): string {
  const pathname = requestUrl.split('?')[0] ?? ''
  return decodeURIComponent(pathname.slice(GLB_SERVE_PREFIX.length))
}

function toServeKey(moduleId: string, root: string): string {
  // Keep the query so distinct per-import options map to distinct served URLs.
  const filePath = stripQueryAndHash(moduleId)
  const query = extractQuery(moduleId)
  const relative = path.relative(root, filePath).split(path.sep).join('/')
  return query ? `${relative}?${query}` : relative
}

function stripQueryAndHash(id: string): string {
  const hashIndex = id.indexOf('#')
  const queryIndex = id.indexOf('?')
  const boundary = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]

  return boundary === undefined ? id : id.slice(0, boundary)
}

function extractQuery(id: string): string {
  const queryIndex = id.indexOf('?')
  if (queryIndex < 0) {
    return ''
  }

  const hashIndex = id.indexOf('#', queryIndex)
  return hashIndex < 0 ? id.slice(queryIndex + 1) : id.slice(queryIndex + 1, hashIndex)
}

function toRelativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kib = bytes / 1024
  if (kib < 1024) {
    return `${roundToOneDecimal(kib)} KB`
  }

  return `${roundToOneDecimal(kib / 1024)} MB`
}

function roundToOneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '')
}
