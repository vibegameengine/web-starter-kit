import type { Patch9Config, Patch9Insets } from './Patch9Button.types'

export type Patch9ImageSource = {
  readonly image: HTMLImageElement
  readonly height: number
  readonly width: number
}

type Patch9ImageCacheEntry = {
  readonly promise: Promise<string | null>
  references: number
  settled: boolean
  url: string | null
}

const patch9ImageCache = new Map<string, Patch9ImageCacheEntry>()

export async function waitForPatch9ImagesReady(): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const pendingRenders = Array.from(patch9ImageCache.values())
      .filter((entry) => !entry.settled)
      .map((entry) => entry.promise)

    if (pendingRenders.length === 0) return

    await Promise.allSettled(pendingRenders)
  }
}

export function retainPatch9Image({
  elementSize,
  patch9,
  source,
}: {
  readonly elementSize: { height: number; width: number }
  readonly patch9: Patch9Config
  readonly source: Patch9ImageSource
}): { cacheKey: string; promise: Promise<string | null> } {
  const pixelRatio = getPatch9CanvasPixelRatio()
  const cacheKey = getPatch9ImageCacheKey({ elementSize, patch9, pixelRatio, source })
  let cacheEntry = patch9ImageCache.get(cacheKey)

  if (!cacheEntry) {
    cacheEntry = {
      promise: renderPatch9ImageUrl({ elementSize, patch9, pixelRatio, source }).then((url) => {
        const latestEntry = patch9ImageCache.get(cacheKey)
        if (!latestEntry) {
          revokeObjectUrl(url)
          return url
        }

        latestEntry.settled = true
        latestEntry.url = url

        if (latestEntry.references <= 0) {
          patch9ImageCache.delete(cacheKey)
          revokeObjectUrl(url)
        }

        return url
      }),
      references: 0,
      settled: false,
      url: null,
    }
    patch9ImageCache.set(cacheKey, cacheEntry)
  }

  cacheEntry.references += 1
  return { cacheKey, promise: cacheEntry.promise }
}

export function releasePatch9Image(cacheKey: string | null): void {
  if (!cacheKey) return

  const cacheEntry = patch9ImageCache.get(cacheKey)
  if (!cacheEntry) return

  cacheEntry.references -= 1
  if (cacheEntry.references > 0) return

  patch9ImageCache.delete(cacheKey)
  revokeObjectUrl(cacheEntry.url)
}

async function renderPatch9ImageUrl({
  elementSize,
  patch9,
  pixelRatio,
  source,
}: {
  readonly elementSize: { height: number; width: number }
  readonly patch9: Patch9Config
  readonly pixelRatio: number
  readonly source: Patch9ImageSource
}): Promise<string | null> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(elementSize.width * pixelRatio)
  canvas.height = Math.ceil(elementSize.height * pixelRatio)

  const context = canvas.getContext('2d')
  if (!context) return null

  context.imageSmoothingEnabled = true
  context.scale(pixelRatio, pixelRatio)
  drawPatch9Image(context, source, patch9, elementSize)

  const blob = await canvasToBlob(canvas)
  return blob ? URL.createObjectURL(blob) : null
}

function getPatch9ImageCacheKey({
  elementSize,
  patch9,
  pixelRatio,
  source,
}: {
  readonly elementSize: { height: number; width: number }
  readonly patch9: Patch9Config
  readonly pixelRatio: number
  readonly source: Patch9ImageSource
}): string {
  return [
    patch9.image,
    source.width,
    source.height,
    getInsetsCacheKey(patch9.slice),
    getInsetsCacheKey(patch9.border),
    elementSize.width,
    elementSize.height,
    pixelRatio,
  ].join('|')
}

function getPatch9CanvasPixelRatio(): number {
  if (typeof window === 'undefined') return 1

  const devicePixelRatio = Number.isFinite(window.devicePixelRatio)
    ? window.devicePixelRatio
    : 1

  return Math.min(Math.max(1, devicePixelRatio), 2)
}

function getInsetsCacheKey(insets: Patch9Insets): string {
  return `${insets.top},${insets.right},${insets.bottom},${insets.left}`
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

function revokeObjectUrl(url: string | null): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

function drawPatch9Image(
  context: CanvasRenderingContext2D,
  source: Patch9ImageSource,
  patch9: Patch9Config,
  elementSize: { height: number; width: number },
) {
  const sourceCenterWidth = source.width - patch9.slice.left - patch9.slice.right
  const sourceCenterHeight = source.height - patch9.slice.top - patch9.slice.bottom
  const targetCenterWidth = elementSize.width - patch9.border.left - patch9.border.right
  const targetCenterHeight = elementSize.height - patch9.border.top - patch9.border.bottom

  if (sourceCenterWidth <= 0 || sourceCenterHeight <= 0 || targetCenterWidth <= 0 || targetCenterHeight <= 0) {
    context.drawImage(source.image, 0, 0, elementSize.width, elementSize.height)
    return
  }

  const sourceColumns = [0, patch9.slice.left, source.width - patch9.slice.right]
  const sourceRows = [0, patch9.slice.top, source.height - patch9.slice.bottom]
  const sourceWidths = [patch9.slice.left, sourceCenterWidth, patch9.slice.right]
  const sourceHeights = [patch9.slice.top, sourceCenterHeight, patch9.slice.bottom]
  const targetColumns = [0, patch9.border.left, elementSize.width - patch9.border.right]
  const targetRows = [0, patch9.border.top, elementSize.height - patch9.border.bottom]
  const targetWidths = [patch9.border.left, targetCenterWidth, patch9.border.right]
  const targetHeights = [patch9.border.top, targetCenterHeight, patch9.border.bottom]

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      context.drawImage(
        source.image,
        sourceColumns[column],
        sourceRows[row],
        sourceWidths[column],
        sourceHeights[row],
        targetColumns[column],
        targetRows[row],
        targetWidths[column],
        targetHeights[row],
      )
    }
  }
}
