import {
  bootstrapAssetEntries,
  type BootstrapAssetEntry,
} from 'virtual:bootstrap-assets'

export type BootstrapAsset = BootstrapAssetEntry

/**
 * The blocking subset of assets reachable from the entry's static import graph,
 * collected at build time by `bootstrapAssetRegistryPlugin`. Assets marked
 * `deferred` (via `?bootstrap=deferred`) are excluded.
 */
export function getBlockingBootstrapAssets(): BootstrapAsset[] {
  return bootstrapAssetEntries.filter((asset) => !asset.deferred)
}

/** Weights larger assets so the progress bar tracks bytes, not file count. */
export function getBootstrapAssetWeight(asset: BootstrapAsset): number {
  return Math.max(1, Math.round(asset.size / 8192))
}
