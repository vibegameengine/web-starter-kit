import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Logger, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import convertFbxToGltf from 'fbx2gltf'
import type { Plugin, ResolvedConfig } from 'vite'
import { normalizePath } from 'vite'

import { createAssetOptimizerCache } from './assetOptimizerCache'
import type { AssetOptimizerCache } from './assetOptimizerCache'

// Silences gltf-transform's per-transform INFO/WARN chatter (`prune: Removed
// types…`, `reorder: No qualifying primitives…`). On a cache hit nothing runs at
// all; this keeps even a cold conversion quiet.
const QUIET_LOGGER = new Logger(Logger.Verbosity.ERROR)

/**
 * Transparent `.fbx` → `.glb` loader (build-time). Import a Mixamo `.fbx`
 * animation and get a ready GLB URL back — no manual FBX2glTF step, no offline
 * merge script. Under the hood it runs FBX2glTF (the `fbx2gltf` prebuilt binary,
 * same tool the manique pipeline used) then STRIPS the result to animation-only
 * (drops the redundant mesh/skin/material/texture the FBX carries) so a 35 MB
 * capture ships as a few-KB clip. The retained node hierarchy keeps the
 * `mixamorig1:` joint names, so the clip plays straight onto the shared manique
 * skeleton via the `AnimationMixer` — the entity just adds it as another action.
 *
 * Follows the same plugin shape as the audio/GLB optimizers (see the
 * asset-optimization-pipeline skill): `resolveId` tags project `.fbx` imports,
 * `load` converts+strips (cached) and serves (dev) / emits (build).
 *
 * Per-import opt: `?fbx=raw` keeps the full converted GLB (mesh + skin) instead
 * of stripping to animation-only.
 */

const FBX_MODULE_QUERY = 'fbx-gltf'
const FBX_MODE_QUERY = 'fbx'
const FBX_SERVE_PREFIX = '/@fbx-loader/'
const FBX_CACHE_NAMESPACE = 'fbx-loader'
// Bump when the convert/strip/meshopt pipeline changes so stale entries are ignored.
const FBX_CACHE_VERSION = 1

type FbxResult = {
  readonly bytes: Uint8Array
  readonly inputBytes: number
  readonly outputBytes: number
  readonly path: string
  readonly version: string
  readonly fromCache: boolean
}

// Persisted alongside the converted bytes so a cache hit rebuilds the report
// without re-running FBX2glTF. `outputBytes`/`version` derive from `bytes`.
type FbxCacheMeta = {
  readonly inputBytes: number
}

export function fbxAssetLoaderPlugin(): Plugin {
  let config: ResolvedConfig | null = null
  let cache: AssetOptimizerCache | null = null
  const converted = new Map<string, Promise<FbxResult>>()
  const reports = new Map<string, FbxResult>()
  const serveKeyToId = new Map<string, string>()

  return {
    name: 'fbx-asset-loader',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      config = resolvedConfig
      cache = createAssetOptimizerCache(resolvedConfig.root, FBX_CACHE_NAMESPACE, FBX_CACHE_VERSION)
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = req.url
        if (!requestUrl?.startsWith(FBX_SERVE_PREFIX)) {
          next()
          return
        }
        const serveKey = decodeURIComponent((requestUrl.split('?')[0] ?? '').slice(FBX_SERVE_PREFIX.length))
        const moduleId = serveKeyToId.get(serveKey)
        if (!moduleId || !cache) {
          res.statusCode = 404
          res.end('FBX asset not found')
          return
        }
        const result = await getConverted(converted, reports, cache, moduleId)
        res.statusCode = 200
        res.setHeader('Content-Type', 'model/gltf-binary')
        res.setHeader('Content-Length', result.bytes.byteLength)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.end(result.bytes)
      })
    },
    async resolveId(source, importer) {
      if (!config || !isFbxImport(source) || source.includes(`?${FBX_MODULE_QUERY}`)) {
        return null
      }
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      if (!resolved || resolved.external) {
        return null
      }
      const filePath = stripQueryAndHash(resolved.id)
      if (!isProjectFbxAsset(filePath, config.root)) {
        return null
      }
      const query = extractQuery(source)
      const suffix = query ? `&${query}` : ''
      return `${filePath}?${FBX_MODULE_QUERY}${suffix}`
    },
    async load(id) {
      if (!config || !cache || !new URLSearchParams(extractQuery(id)).has(FBX_MODULE_QUERY)) {
        return null
      }
      const result = await getConverted(converted, reports, cache, id)

      if (config.command === 'serve') {
        const serveKey = toServeKey(id, config.root)
        serveKeyToId.set(serveKey, id)
        return `export default ${JSON.stringify(`${FBX_SERVE_PREFIX}${encodeURIComponent(serveKey)}?v=${result.version}`)};`
      }

      const base = path.basename(stripQueryAndHash(id), path.extname(stripQueryAndHash(id)))
      const assetId = this.emitFile({ name: `${base}.glb`, source: result.bytes, type: 'asset' })
      return `export default import.meta.ROLLUP_FILE_URL_${assetId};`
    },
    // Pre-warm on update: on an edited `.fbx`, drop the memoized clip, re-convert
    // it eagerly (warming the disk + memory caches), then hand HMR the changed
    // modules so the client refetches the freshly converted animation.
    async handleHotUpdate(context) {
      if (!config || !cache) return

      const file = normalizePath(context.file)
      if (!isProjectFbxAsset(file, config.root)) return

      const affected = [...converted.keys()].filter(
        (moduleId) => normalizePath(stripQueryAndHash(moduleId)) === file,
      )
      if (affected.length === 0) return

      const updatedModules = []
      for (const moduleId of affected) {
        converted.delete(moduleId)
        reports.delete(moduleId)

        const module = context.server.moduleGraph.getModuleById(moduleId)
        if (module) updatedModules.push(module)
      }

      await Promise.all(
        affected.map((moduleId) => getConverted(converted, reports, cache!, moduleId).catch(() => undefined)),
      )

      return updatedModules.length > 0 ? updatedModules : undefined
    },
    closeBundle() {
      if (reports.size === 0) {
        return
      }
      let count = 0
      let saved = 0
      for (const result of reports.values()) {
        count += 1
        saved += result.inputBytes - result.outputBytes
        console.log(`[fbx]${result.fromCache ? ' (cached)' : ''} ${toRelativePath(result.path)}: ${formatBytes(result.inputBytes)} -> ${formatBytes(result.outputBytes)}`)
      }
      console.log(`[fbx] done: ${count} converted, ${formatBytes(saved)} saved`)
    },
  }
}

async function getConverted(
  memoryCache: Map<string, Promise<FbxResult>>,
  reports: Map<string, FbxResult>,
  diskCache: AssetOptimizerCache,
  moduleId: string,
): Promise<FbxResult> {
  let pending = memoryCache.get(moduleId)
  if (!pending) {
    pending = convertFbxAsset(moduleId, diskCache)
    memoryCache.set(moduleId, pending)
  }
  const result = await pending
  reports.set(moduleId, result)
  return result
}

// Short content hash of the converted bytes — versions the dev serve URL so the
// browser's immutable cache busts iff the output changes.
function versionOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 12)
}

async function convertFbxAsset(moduleId: string, diskCache: AssetOptimizerCache): Promise<FbxResult> {
  const filePath = stripQueryAndHash(moduleId)
  const raw = new URLSearchParams(extractQuery(moduleId)).get(FBX_MODE_QUERY) === 'raw'
  const source = new Uint8Array(await readFile(filePath))
  const inputBytes = source.byteLength

  // Content-addressed by the FBX source + the `raw` mode, so an unchanged `.fbx`
  // is a hit across dev restarts and builds — no FBX2glTF re-conversion, and no
  // gltf-transform prune/reorder chatter on every server start.
  const cacheKey = diskCache.computeKey(source, raw ? 'raw' : 'stripped')
  const cached = await diskCache.read<FbxCacheMeta>(cacheKey)
  if (cached) {
    return {
      bytes: cached.bytes,
      inputBytes: cached.meta.inputBytes,
      outputBytes: cached.bytes.byteLength,
      path: filePath,
      version: versionOf(cached.bytes),
      fromCache: true,
    }
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'fbx2gltf-'))
  const out = path.join(dir, 'out.glb')
  try {
    // FBX2glTF writes a self-contained `.glb` (binary, `-b`) at `out`.
    await convertFbxToGltf(filePath, out, ['--binary'])
    // Writing EXT_meshopt_compression needs the encoder wired onto the IO; drei's
    // useGLTF sets the matching decoder automatically, so the runtime needs nothing.
    await MeshoptEncoder.ready
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
    const document = await io.read(out)
    document.setLogger(QUIET_LOGGER)
    if (!raw) {
      // Strip to animation-only: drop the mesh/skin/material/texture the FBX ships,
      // keep the node hierarchy the animation channels target (mixamorig1 joints).
      // Then Meshopt-compress the (dense keyframe) animation buffers.
      const root = document.getRoot()
      for (const node of root.listNodes()) node.setMesh(null)
      for (const mesh of root.listMeshes()) mesh.dispose()
      for (const skin of root.listSkins()) skin.dispose()
      await document.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }))
    }

    const bytes = await io.writeBinary(document)
    await diskCache.write<FbxCacheMeta>(cacheKey, { bytes, meta: { inputBytes } }).catch(() => undefined)
    return {
      bytes,
      inputBytes,
      outputBytes: bytes.byteLength,
      path: filePath,
      version: versionOf(bytes),
      fromCache: false,
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function isFbxImport(source: string): boolean {
  return stripQueryAndHash(source).toLowerCase().endsWith('.fbx')
}

function isProjectFbxAsset(filePath: string, root: string): boolean {
  if (!filePath.toLowerCase().endsWith('.fbx')) {
    return false
  }
  const normalized = path.relative(root, filePath).split(path.sep).join('/')
  return !normalized.startsWith('../') && normalized.startsWith('src/')
}

function toServeKey(moduleId: string, root: string): string {
  const filePath = stripQueryAndHash(moduleId)
  const query = extractQuery(moduleId)
  const relative = path.relative(root, filePath).split(path.sep).join('/')
  return query ? `${relative}?${query}` : relative
}

function stripQueryAndHash(id: string): string {
  const hashIndex = id.indexOf('#')
  const queryIndex = id.indexOf('?')
  const boundary = [hashIndex, queryIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0]
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
  return kib < 1024 ? `${roundOne(kib)} KB` : `${roundOne(kib / 1024)} MB`
}

function roundOne(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '')
}
