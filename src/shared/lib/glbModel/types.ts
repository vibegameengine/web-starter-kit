import type { Color } from 'three'

/**
 * Which texture channels get packed into a merged atlas. `albedo` (base-color) is
 * implemented today; `normal` is accepted by the API but is a NO-OP until the game
 * moves off its flat unlit look (right now `?albedo` strips normal maps at build and
 * the runtime renders through `MeshBasicMaterial`, which reads only base color).
 */
export interface MergeChannels {
  readonly albedo?: boolean
  readonly normal?: boolean
}

export interface MergeOptions {
  /** Channels to atlas. Default `{ albedo: true }`. */
  readonly channels?: MergeChannels
  /** Atlas cell size in px per part. Default 512; auto-halved if the atlas would exceed the GPU cap. */
  readonly cell?: number
  /** Whether the merged body participates in pointer raycasting (players: yes). */
  readonly interactive?: boolean
}

/** A resolved atlas grid: pure geometry, no canvas. */
export interface AtlasLayout {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly gutter: number
  readonly width: number
  readonly height: number
  /** Normalized inner rect for cell `index`: uv = { ox + u*sx, oy + v*sy }. */
  cellUv(index: number): { ox: number; oy: number; sx: number; sy: number }
  /** Pixel inner rect for cell `index` (for `drawImage`/`fillRect`). */
  cellPx(index: number): { x: number; y: number; w: number; h: number }
}

/** One cell's source: a base-color image, or a solid color fallback. */
export interface AtlasSource {
  readonly image?: CanvasImageSource | null
  readonly color?: Color | null
}
