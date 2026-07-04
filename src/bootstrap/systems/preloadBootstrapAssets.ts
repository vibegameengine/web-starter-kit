import {
  getBlockingBootstrapAssets,
  getBootstrapAssetWeight,
  type BootstrapAsset,
} from './bootstrapAssetRegistry'

export type BootstrapAssetProgressSnapshot = {
  completedCount: number
  completedWeight: number
  currentAssetSource: string | null
  totalCount: number
  totalWeight: number
}

type BootstrapAssetProgressListener = (
  snapshot: BootstrapAssetProgressSnapshot,
) => void

/**
 * Fetches (and, for images, decodes) every blocking asset in parallel. Image
 * decode is warmed via `Image.decode()` so canvas / background-image UI does
 * not pop in a frame after mount.
 */
export async function preloadBootstrapAssets(
  onProgress?: BootstrapAssetProgressListener,
): Promise<void> {
  const assets = getBlockingBootstrapAssets()
  const totalWeight = assets.reduce(
    (sum, asset) => sum + getBootstrapAssetWeight(asset),
    0,
  )

  let completedCount = 0
  let completedWeight = 0

  onProgress?.({
    completedCount,
    completedWeight,
    currentAssetSource: assets[0]?.source ?? null,
    totalCount: assets.length,
    totalWeight,
  })

  await Promise.all(
    assets.map(async (asset) => {
      await preloadAsset(asset)
      completedCount += 1
      completedWeight += getBootstrapAssetWeight(asset)
      onProgress?.({
        completedCount,
        completedWeight,
        currentAssetSource: asset.source,
        totalCount: assets.length,
        totalWeight,
      })
    }),
  )
}

async function preloadAsset(asset: BootstrapAsset): Promise<void> {
  if (asset.kind === 'image') {
    await preloadImageAsset(asset)
    return
  }

  const response = await fetch(asset.url, {
    cache: 'force-cache',
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throw new Error(`Bootstrap asset failed to load: ${asset.source}`)
  }

  await response.arrayBuffer()
}

async function preloadImageAsset(asset: BootstrapAsset): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      if (!image.decode) {
        resolve()
        return
      }

      image.decode().then(resolve, reject)
    }
    image.onerror = () => reject(new Error(`Bootstrap image failed to load: ${asset.source}`))
    image.src = asset.url
  })
}
