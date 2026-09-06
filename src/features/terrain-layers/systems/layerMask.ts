// WHERE each layer is, baked once into a weight atlas.
//
// Four masks ride the four channels of one RGBA page — what a landscape editor
// calls a weightmap — so eight layers cost two texture reads instead of eight.
// Baking also settles cost: a mask may be an expensive field, because it is
// evaluated per texel at build time and never per pixel.
//
// Layer i lives at page `i >> 2`, channel `i & 3`. The shader follows the same
// rule, so adding a layer rewires neither side.

export type MaskField = (x: number, z: number) => number

export type RoutePoint = Readonly<{
  readonly x: number
  readonly z: number
  /** Full trodden width in metres at this point. */
  readonly width: number
  /** How strongly this point's layer claims the surface, 0..1. */
  readonly strength: number
}>

/** A road, a track, a river margin: coverage decided by a line, not by a region. */
export type MaskRoute = Readonly<{
  readonly points: readonly RoutePoint[]
  readonly falloffMeters: number
}>

export type MaskSource =
  | Readonly<{ readonly kind: 'constant'; readonly value: number }>
  | Readonly<{ readonly kind: 'field'; readonly field: MaskField }>
  | Readonly<{ readonly kind: 'route'; readonly route: MaskRoute }>

export type MaskAtlas = Readonly<{
  readonly pages: readonly Uint8Array[]
  readonly resolution: number
  readonly originX: number
  readonly originZ: number
  readonly sizeMeters: number
}>

function smoothstep01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return x * x * (3 - 2 * x)
}

/**
 * Coverage of a route. Width and strength interpolate ALONG the line, which is
 * what lets one route hand the surface from one layer to another as it runs —
 * a dirt track becoming asphalt is a crossfade, not a second route.
 */
function routeCoverageAt(route: MaskRoute, x: number, z: number): number {
  let best = 0
  for (let index = 0; index < route.points.length - 1; index += 1) {
    const a = route.points[index]
    const b = route.points[index + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lengthSquared = dx * dx + dz * dz
    const along = lengthSquared <= 1e-9 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared))
    const distance = Math.hypot(x - (a.x + dx * along), z - (a.z + dz * along))
    const halfWidth = (a.width + (b.width - a.width) * along) / 2
    if (distance >= halfWidth + route.falloffMeters) continue
    const strength = a.strength + (b.strength - a.strength) * along
    best = Math.max(best, strength * (1 - smoothstep01((distance - halfWidth) / Math.max(route.falloffMeters, 1e-6))))
  }
  return best
}

function maskValueAt(source: MaskSource, x: number, z: number): number {
  if (source.kind === 'constant') return source.value
  if (source.kind === 'field') return source.field(x, z)
  return routeCoverageAt(source.route, x, z)
}

export function bakeMaskAtlas(params: Readonly<{
  readonly sources: readonly MaskSource[]
  readonly resolution: number
  readonly originX: number
  readonly originZ: number
  readonly sizeMeters: number
}>): MaskAtlas {
  const { sources, resolution, originX, originZ, sizeMeters } = params
  const pages: Uint8Array[] = Array.from(
    { length: Math.max(1, Math.ceil(sources.length / 4)) },
    () => new Uint8Array(resolution * resolution * 4),
  )
  const step = sizeMeters / (resolution - 1)

  for (let index = 0; index < sources.length; index += 1) {
    const page = pages[index >> 2]
    const channel = index & 3
    const source = sources[index]
    for (let row = 0; row < resolution; row += 1) {
      const worldZ = originZ + row * step
      for (let column = 0; column < resolution; column += 1) {
        const value = maskValueAt(source, originX + column * step, worldZ)
        page[(row * resolution + column) * 4 + channel] = Math.round(255 * Math.min(1, Math.max(0, value)))
      }
    }
  }

  return { pages, resolution, originX, originZ, sizeMeters }
}
