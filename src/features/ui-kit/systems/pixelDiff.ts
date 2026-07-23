export interface PixelDiffRegistration {
  readonly referenceSrc: string
  readonly resolveTarget: () => HTMLElement | null
}

export interface PixelDiffOptions {
  readonly threshold?: number
}

export interface PixelDiffResult {
  readonly comparedPixels: number
  readonly heatmapSrc: string
  readonly height: number
  readonly maxDelta: number
  readonly meanDelta: number
  readonly mismatchPercent: number
  readonly mismatchPixels: number
  readonly threshold: number
  readonly width: number
}

export interface PixelDiffAgentApi {
  clear: (id: string) => void
  compare: (id: string, options?: PixelDiffOptions) => Promise<PixelDiffResult>
  ids: () => readonly string[]
  last: (id: string) => PixelDiffResult | undefined
  register: (id: string, registration: PixelDiffRegistration) => () => void
  show: (id: string, options?: PixelDiffOptions) => Promise<PixelDiffResult>
}

declare global {
  interface Window {
    __uiKitPixelDiff?: PixelDiffAgentApi
  }
}

const registrations = new Map<string, PixelDiffRegistration>()
const results = new Map<string, PixelDiffResult>()

/** Rasterize a live DOM target and compare it with a prepared reference image. */
export async function compareElementPixels(target: HTMLElement, referenceSrc: string, options: PixelDiffOptions = {}): Promise<PixelDiffResult> {
  const threshold = options.threshold ?? 20
  const [capture, reference] = await Promise.all([captureElement(target), loadImage(referenceSrc)])
  return makeHeatmap(capture, reference, threshold)
}

/** DEV-only console API used by browser-control agents for reference-locked UI work. */
export function installPixelDiffAgentApi(): PixelDiffAgentApi | undefined {
  if (!import.meta.env.DEV) return undefined
  if (window.__uiKitPixelDiff) return window.__uiKitPixelDiff

  const api: PixelDiffAgentApi = {
    clear(id) {
      document.querySelector(`[data-pixel-diff-agent-overlay="${CSS.escape(id)}"]`)?.remove()
    },
    async compare(id, options) {
      const registration = registrations.get(id)
      const target = registration?.resolveTarget()
      if (!registration || !target) throw new Error(`No live pixel-diff target is registered as "${id}".`)
      const result = await compareElementPixels(target, registration.referenceSrc, options)
      results.set(id, result)
      return result
    },
    ids: () => [...registrations.keys()],
    last: (id) => results.get(id),
    register(id, registration) {
      registrations.set(id, registration)
      return () => {
        registrations.delete(id)
        results.delete(id)
        api.clear(id)
      }
    },
    async show(id, options) {
      const registration = registrations.get(id)
      const target = registration?.resolveTarget()
      if (!registration || !target) throw new Error(`No live pixel-diff target is registered as "${id}".`)
      const result = await api.compare(id, options)
      api.clear(id)
      const overlay = document.createElement('img')
      overlay.dataset.pixelDiffAgentOverlay = id
      overlay.alt = `Pixel diff heatmap for ${id}`
      overlay.src = result.heatmapSrc
      Object.assign(overlay.style, { height: `${result.height}px`, left: '0', pointerEvents: 'none', position: 'absolute', top: '0', width: `${result.width}px`, zIndex: '100' })
      target.append(overlay)
      return result
    },
  }
  window.__uiKitPixelDiff = api
  return api
}

async function captureElement(target: HTMLElement): Promise<ImageData> {
  await document.fonts.ready
  const bounds = target.getBoundingClientRect()
  const clone = target.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-pixel-diff-inspector], [data-pixel-diff-agent-overlay]').forEach((node) => node.remove())
  inlineComputedStyles(target, clone)
  await inlineImages(clone)
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bounds.width)
  canvas.height = Math.round(bounds.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable in this browser.')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function inlineComputedStyles(source: Element, clone: Element) {
  const sourceElements = [source, ...source.querySelectorAll('*')]
  const cloneElements = [clone, ...clone.querySelectorAll('*')]
  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index] as HTMLElement | undefined
    if (!cloneElement) return
    const computed = window.getComputedStyle(sourceElement)
    for (const property of computed) cloneElement.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property))
  })
}

async function inlineImages(root: HTMLElement) {
  await Promise.all([...root.querySelectorAll('img')].map(async (image) => {
    const source = image.currentSrc || image.src
    if (!source || source.startsWith('data:')) return
    const response = await fetch(source)
    if (!response.ok) throw new Error(`Could not include ${source} in the raster capture.`)
    const blob = await response.blob()
    image.src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }))
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The comparison image could not be decoded.'))
    image.src = source
  })
}

function makeHeatmap(current: ImageData, reference: HTMLImageElement, threshold: number): PixelDiffResult {
  const canvas = document.createElement('canvas')
  canvas.width = current.width
  canvas.height = current.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable in this browser.')
  context.drawImage(reference, 0, 0, current.width, current.height)
  const referencePixels = context.getImageData(0, 0, current.width, current.height)
  const heatmap = context.createImageData(current.width, current.height)
  let mismatchPixels = 0
  let totalDelta = 0
  let maxDelta = 0
  for (let index = 0; index < current.data.length; index += 4) {
    const delta = Math.max(
      Math.abs(current.data[index] - referencePixels.data[index]),
      Math.abs(current.data[index + 1] - referencePixels.data[index + 1]),
      Math.abs(current.data[index + 2] - referencePixels.data[index + 2]),
      Math.abs(current.data[index + 3] - referencePixels.data[index + 3]),
    )
    totalDelta += delta
    maxDelta = Math.max(maxDelta, delta)
    if (delta <= threshold) continue
    mismatchPixels += 1
    heatmap.data[index] = 255
    heatmap.data[index + 1] = Math.round(Math.max(30, 238 - delta * .75))
    heatmap.data[index + 2] = 0
    heatmap.data[index + 3] = Math.round(Math.min(230, 80 + delta * .65))
  }
  context.putImageData(heatmap, 0, 0)
  const comparedPixels = current.width * current.height
  return { comparedPixels, heatmapSrc: canvas.toDataURL('image/png'), height: current.height, maxDelta, meanDelta: totalDelta / comparedPixels, mismatchPercent: (mismatchPixels / comparedPixels) * 100, mismatchPixels, threshold, width: current.width }
}
