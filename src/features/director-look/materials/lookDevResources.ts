import * as THREE from 'three'

const COLOR_CHECKER_ROWS: readonly (readonly string[])[] = [
  ['#735244', '#c29682', '#627a9d', '#576c43', '#8580b1', '#67bdaa'],
  ['#d67e2c', '#505ba6', '#c15a63', '#5e3c6c', '#9dbc40', '#e0a32e'],
  ['#383d96', '#469449', '#af363c', '#e7c71f', '#bb5695', '#0885a1'],
  ['#f3f3f2', '#c8c8c8', '#a0a0a0', '#7a7a79', '#555555', '#343434'],
]

const MIDDLE_GREY_SRGB = '#777777'

function colorCheckerTexture(): THREE.DataTexture {
  const columns = COLOR_CHECKER_ROWS[0].length
  const rows = COLOR_CHECKER_ROWS.length
  const pixels = new Uint8Array(columns * rows * 4)
  COLOR_CHECKER_ROWS.forEach((row, rowIndex) => {
    row.forEach((hex, columnIndex) => {
      const offset = ((rows - 1 - rowIndex) * columns + columnIndex) * 4
      const value = Number.parseInt(hex.slice(1), 16)
      pixels.set([(value >> 16) & 255, (value >> 8) & 255, value & 255, 255], offset)
    })
  })
  const texture = new THREE.DataTexture(pixels, columns, rows)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
}

type LookDevResources = {
  readonly geometries: {
    readonly box: THREE.BoxGeometry
    readonly chart: THREE.PlaneGeometry
    readonly sphere: THREE.SphereGeometry
  }
  readonly materials: {
    readonly chart: THREE.MeshStandardMaterial
    readonly chrome: THREE.MeshStandardMaterial
    readonly clay: THREE.MeshStandardMaterial
    readonly frame: THREE.MeshStandardMaterial
    readonly middleGrey: THREE.MeshStandardMaterial
    readonly mover: THREE.MeshStandardMaterial
  }
}

let built: LookDevResources | null = null

export function lookDevResources(): LookDevResources {
  built ??= {
    geometries: {
      box: new THREE.BoxGeometry(1, 1, 1),
      chart: new THREE.PlaneGeometry(1, 1),
      sphere: new THREE.SphereGeometry(1, 48, 32),
    },
    materials: {
      chart: new THREE.MeshStandardMaterial({ map: colorCheckerTexture(), metalness: 0, roughness: 0.95 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.04 }),
      clay: new THREE.MeshStandardMaterial({ color: '#d9d6d0', metalness: 0, roughness: 0.9 }),
      frame: new THREE.MeshStandardMaterial({ color: '#2b2f33', metalness: 0, roughness: 0.8 }),
      middleGrey: new THREE.MeshStandardMaterial({ color: MIDDLE_GREY_SRGB, metalness: 0, roughness: 0.85 }),
      mover: new THREE.MeshStandardMaterial({ color: '#c8503c', metalness: 0, roughness: 0.6 }),
    },
  }
  return built
}
