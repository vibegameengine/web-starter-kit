import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { NodeIO } from '@gltf-transform/core'
import type { Transform } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, meshopt, prune, textureCompress } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import type { Plugin, ResolvedConfig } from 'vite'

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
}

const GLB_MODULE_QUERY = 'glb-optimized'
const GLB_OPT_OUT_QUERY = 'glb-optimize'
const GLB_SERVE_PREFIX = '/@glb-optimizer/'

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
  const optimizedAssets = new Map<string, Promise<GlbOptimizeResult>>()
  const reports = new Map<string, GlbOptimizeResult>()
  const serveKeyToId = new Map<string, string>()

  return {
    name: 'glb-asset-optimizer',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      config = resolvedConfig
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

        if (!moduleId) {
          res.statusCode = 404
          res.end('GLB asset not found')
          return
        }

        const result = await getOptimizedAsset(optimizedAssets, reports, moduleId)

        res.statusCode = 200
        res.setHeader('Content-Type', 'model/gltf-binary')
        res.setHeader('Content-Length', result.bytes.byteLength)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.end(result.bytes)
      })
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
      if (!config || !isOptimizedModelModuleId(id)) {
        return null
      }

      const result = await getOptimizedAsset(optimizedAssets, reports, id)

      if (config.command === 'serve') {
        const serveKey = toServeKey(id, config.root)
        serveKeyToId.set(serveKey, id)

        return createUrlModule(createServeUrl(serveKey, result.outputBytes))
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
          `[glb] ${result.wasOptimized ? 'optimized' : 'kept'} ${toRelativePath(result.path)}: ${formatBytes(result.inputBytes)} -> ${formatBytes(result.outputBytes)}`,
        )
      }

      console.log(`[glb] done: ${optimizedCount} optimized, ${formatBytes(savedBytes)} saved`)
    },
  }
}

async function getOptimizedAsset(
  cache: Map<string, Promise<GlbOptimizeResult>>,
  reports: Map<string, GlbOptimizeResult>,
  moduleId: string,
): Promise<GlbOptimizeResult> {
  let pendingResult = cache.get(moduleId)

  if (!pendingResult) {
    pendingResult = optimizeModelAsset(moduleId)
    cache.set(moduleId, pendingResult)
  }

  const result = await pendingResult
  reports.set(moduleId, result)
  return result
}

async function optimizeModelAsset(moduleId: string): Promise<GlbOptimizeResult> {
  const filePath = stripQueryAndHash(moduleId)
  const options = parseOptimizeOptions(moduleId)
  const isBinaryInput = path.extname(filePath).toLowerCase() === '.glb'

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
    ? new Uint8Array(await readFile(filePath))
    : await new NodeIO().registerExtensions(ALL_EXTENSIONS).writeBinary(await io.read(filePath))
  const inputSize = originalBytes.byteLength

  // `?glb-optimize=off` opts a single import out — we still handle it (so the id
  // resolves) but emit the untouched bytes with no texture/geometry changes.
  if (shouldBypassOptimization(moduleId)) {
    return {
      bytes: originalBytes,
      inputBytes: inputSize,
      outputBytes: inputSize,
      path: filePath,
      wasOptimized: false,
    }
  }

  const document = await io.read(filePath)

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
    return {
      bytes: originalBytes,
      inputBytes: inputSize,
      outputBytes: inputSize,
      path: filePath,
      wasOptimized: false,
    }
  }

  return {
    bytes: encoded,
    inputBytes: inputSize,
    outputBytes: encoded.byteLength,
    path: filePath,
    wasOptimized: true,
  }
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

function createServeUrl(serveKey: string, version: number): string {
  return `${GLB_SERVE_PREFIX}${encodeURIComponent(serveKey)}?v=${version}`
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
