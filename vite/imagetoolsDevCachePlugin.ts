import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Plugin, ResolvedConfig } from 'vite'

const IMAGETOOLS_SEGMENT = '/@imagetools/'

/**
 * In dev, vite-imagetools re-runs each transform on demand. This plugin serves
 * a previously written transform straight from `node_modules/.cache/imagetools`
 * so repeated requests for the same variant skip the sharp round-trip. It only
 * applies during `serve`; the production build already caches transforms.
 */
export function imagetoolsDevCachePlugin(): Plugin {
  let config: ResolvedConfig | null = null

  return {
    name: 'imagetools-dev-cache',
    apply: 'serve',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url

        if (!config || !requestUrl) {
          next()
          return
        }

        const basePath = createImagetoolsBasePath(config.base)

        if (!requestUrl.startsWith(basePath)) {
          next()
          return
        }

        const assetId = requestUrl.slice(basePath.length)

        if (!assetId) {
          next()
          return
        }

        const cachedImagePath = resolve(config.root, 'node_modules/.cache/imagetools', assetId)

        if (!existsSync(cachedImagePath)) {
          next()
          return
        }

        const stat = statSync(cachedImagePath)

        res.setHeader('Content-Length', stat.size)
        res.setHeader('Content-Type', detectImageMimeType(cachedImagePath))
        res.setHeader('Cache-Control', 'no-store')

        createReadStream(cachedImagePath).pipe(res)
      })
    },
  }
}

function createImagetoolsBasePath(base: string): string {
  const normalizedBase = base.replace(/\/$/, '')
  return `${normalizedBase}${IMAGETOOLS_SEGMENT}`
}

function detectImageMimeType(filePath: string): string {
  const header = readFileSync(filePath).subarray(0, 16)

  if (
    matchesBytes(header, [0x52, 0x49, 0x46, 0x46]) &&
    matchesBytes(header, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp'
  }

  if (matchesBytes(header, [0x89, 0x50, 0x4e, 0x47])) {
    return 'image/png'
  }

  if (matchesBytes(header, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg'
  }

  if (matchesBytes(header, [0x47, 0x49, 0x46, 0x38])) {
    return 'image/gif'
  }

  if (
    matchesBytes(header, [0x00, 0x00, 0x00], 0) &&
    matchesBytes(header, [0x66, 0x74, 0x79, 0x70], 4)
  ) {
    return 'image/avif'
  }

  return 'application/octet-stream'
}

function matchesBytes(buffer: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => buffer[offset + index] === byte)
}
