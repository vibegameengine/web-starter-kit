import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * A persisted optimizer result: the final bytes plus a small JSON metadata
 * record the plugin needs to reconstruct its report (input size, whether the
 * repack actually shrank the file, etc.). `outputBytes` is intentionally NOT
 * stored — it is always `bytes.byteLength`.
 */
export type AssetCacheEntry<Meta> = {
  readonly bytes: Uint8Array
  readonly meta: Meta
}

export type AssetOptimizerCache = {
  /** Absolute cache directory, for logging / debugging. */
  readonly directory: string
  /**
   * Content-addressed key over the SOURCE bytes plus a caller-supplied variant
   * tag (the resolved options). Because it hashes the source content — not the
   * import URL — editing an asset in place produces a new key, so a running dev
   * server never serves stale optimized bytes for a changed source.
   */
  computeKey(sourceBytes: Uint8Array, variant: string): string
  read<Meta>(key: string): Promise<AssetCacheEntry<Meta> | null>
  write<Meta>(key: string, entry: AssetCacheEntry<Meta>): Promise<void>
}

/**
 * A tiny on-disk cache shared by the build-time asset optimizers (GLB, audio).
 * Each optimizer owns a namespace under `node_modules/.cache/`. Entries survive
 * dev-server restarts and speed up `vite build`, since the expensive
 * gltf-transform / sharp / mp3 re-encode only runs on a genuine cache miss.
 *
 * Storage is two files per key: `<key>.bin` (the optimized bytes) and
 * `<key>.json` (the metadata). Writes are atomic (temp file + rename) and the
 * `.bin` is committed before the `.json`, so a reader that sees the metadata
 * always sees complete bytes. `version` lets a plugin invalidate every entry at
 * once when its optimization pipeline changes.
 */
export function createAssetOptimizerCache(
  root: string,
  namespace: string,
  version: number,
): AssetOptimizerCache {
  const directory = path.resolve(root, 'node_modules/.cache', namespace)

  return {
    directory,
    computeKey(sourceBytes, variant) {
      return createHash('sha1')
        .update(String(version))
        .update('\0')
        .update(variant)
        .update('\0')
        .update(sourceBytes)
        .digest('hex')
    },
    async read(key) {
      try {
        const [metaRaw, bytes] = await Promise.all([
          readFile(path.join(directory, `${key}.json`), 'utf8'),
          readFile(path.join(directory, `${key}.bin`)),
        ])

        return { bytes: new Uint8Array(bytes), meta: JSON.parse(metaRaw) }
      } catch {
        // Missing or corrupt entry — treat as a cache miss.
        return null
      }
    },
    async write(key, entry) {
      await mkdir(directory, { recursive: true })

      const token = `${process.pid}-${randomBytes(6).toString('hex')}`
      const binTmp = path.join(directory, `.${key}.${token}.bin`)
      const jsonTmp = path.join(directory, `.${key}.${token}.json`)

      await writeFile(binTmp, entry.bytes)
      await writeFile(jsonTmp, JSON.stringify(entry.meta))
      // Commit the bytes before the metadata so a concurrent reader never sees
      // metadata pointing at a half-written `.bin`.
      await rename(binTmp, path.join(directory, `${key}.bin`))
      await rename(jsonTmp, path.join(directory, `${key}.json`))
    },
  }
}
