import * as THREE from 'three'

/**
 * Turning a folder of PNGs into the three `DataArrayTexture`s the layered
 * terrain material wants.
 *
 * It lives here rather than beside whichever surface needed it first because
 * EVERY consumer of `createLayeredTerrainMaterial` needs exactly this and needs
 * it identically: the albedo array must be sRGB and the height and normal arrays
 * must not be, every slice must be the same square size, and the mip chain has
 * to exist or an overlay's ranked coverage turns into crawling sparkle at
 * distance. Those are properties of the MATERIAL's contract, not of any one
 * surface, and a second copy of them is a second place for one of them to be
 * wrong.
 */

/** Every slice is resampled to this. The material requires one square size. */
const LAYER_SLICE_RESOLUTION = 1024

/** A 1x1 flat tangent-space normal, for layers that ship none. */
export const FLAT_NORMAL_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNggAIAAAoAAaK4ndIAAAAASUVORK5CYII='

/**
 * Decode one map and resample it to the slice size.
 *
 * `luminance` collapses the map to grey, for the height array — a height map is
 * one channel, and reading only the red of a map somebody authored as greyscale
 * throws away the other two thirds of its precision.
 */
export async function sliceOf(url: string, luminance: boolean, resolution = LAYER_SLICE_RESOLUTION): Promise<Uint8ClampedArray> {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`terrain layer map failed: ${url}`))
    image.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = resolution
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('terrain layers: no 2D context')
  context.drawImage(image, 0, 0, resolution, resolution)

  const data = context.getImageData(0, 0, resolution, resolution).data
  if (!luminance) return data
  for (let i = 0; i < data.length; i += 4) {
    const value = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    data[i] = data[i + 1] = data[i + 2] = value
  }
  return data
}

/**
 * Pack decoded slices into one array texture.
 *
 * `srgb` is not a detail: albedo is authored in sRGB and light is linear, so an
 * albedo array declared `NoColorSpace` comes out washed and an equally wrong
 * height array declared sRGB comes out with its relief crushed toward the dark.
 */
export function arrayFrom(slices: readonly Uint8ClampedArray[], srgb: boolean, resolution = LAYER_SLICE_RESOLUTION): THREE.DataArrayTexture {
  const packed = new Uint8Array(resolution * resolution * 4 * slices.length)
  slices.forEach((slice, index) => packed.set(slice, index * resolution * resolution * 4))

  const texture = new THREE.DataArrayTexture(packed, resolution, resolution, slices.length)
  texture.format = THREE.RGBAFormat
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}
