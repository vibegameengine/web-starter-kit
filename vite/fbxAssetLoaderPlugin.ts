import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import convertFbxToGltf from 'fbx2gltf'
import type { Plugin, ResolvedConfig } from 'vite'

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

type FbxResult = {
  readonly bytes: Uint8Array
  readonly inputBytes: number
  readonly outputBytes: number
  readonly path: string
  readonly version: string
}

export function fbxAssetLoaderPlugin(): Plugin {
  let config: ResolvedConfig | null = null
  const converted = new Map<string, Promise<FbxResult>>()
  const reports = new Map<string, FbxResult>()
  const serveKeyToId = new Map<string, string>()

  return {
    name: 'fbx-asset-loader',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      config = resolvedConfig
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
        if (!moduleId) {
          res.statusCode = 404
          res.end('FBX asset not found')
          return
        }
        const result = await getConverted(converted, reports, moduleId)
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
      if (!config || !new URLSearchParams(extractQuery(id)).has(FBX_MODULE_QUERY)) {
        return null
      }
      const result = await getConverted(converted, reports, id)

      if (config.command === 'serve') {
        const serveKey = toServeKey(id, config.root)
        serveKeyToId.set(serveKey, id)
        return `export default ${JSON.stringify(`${FBX_SERVE_PREFIX}${encodeURIComponent(serveKey)}?v=${result.version}`)};`
      }

      const base = path.basename(stripQueryAndHash(id), path.extname(stripQueryAndHash(id)))
      const assetId = this.emitFile({ name: `${base}.glb`, source: result.bytes, type: 'asset' })
      return `export default import.meta.ROLLUP_FILE_URL_${assetId};`
    },
    handleHotUpdate(context) {
      if (!config || !isProjectFbxAsset(context.file, config.root)) return

      const updatedModules = []
      for (const moduleId of converted.keys()) {
        if (stripQueryAndHash(moduleId) !== context.file) continue
        converted.delete(moduleId)
        reports.delete(moduleId)

        const module = context.server.moduleGraph.getModuleById(moduleId)
        if (module) updatedModules.push(module)
      }
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
        console.log(`[fbx] ${toRelativePath(result.path)}: ${formatBytes(result.inputBytes)} -> ${formatBytes(result.outputBytes)}`)
      }
      console.log(`[fbx] done: ${count} converted, ${formatBytes(saved)} saved`)
    },
  }
}

async function getConverted(
  cache: Map<string, Promise<FbxResult>>,
  reports: Map<string, FbxResult>,
  moduleId: string,
): Promise<FbxResult> {
  let pending = cache.get(moduleId)
  if (!pending) {
    pending = convertFbxAsset(moduleId)
    cache.set(moduleId, pending)
  }
  const result = await pending
  reports.set(moduleId, result)
  return result
}

async function convertFbxAsset(moduleId: string): Promise<FbxResult> {
  const filePath = stripQueryAndHash(moduleId)
  const raw = new URLSearchParams(extractQuery(moduleId)).get(FBX_MODE_QUERY) === 'raw'
  const inputBytes = (await readFile(filePath)).byteLength

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
    return {
      bytes,
      inputBytes,
      outputBytes: bytes.byteLength,
      path: filePath,
      version: createHash('sha256').update(bytes).digest('hex').slice(0, 12),
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
