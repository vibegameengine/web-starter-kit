import * as THREE from 'three'

import dryGrassAlbedoUrl from '../assets/ground/dry-grass-albedo.generated.png'
import wetGravelAlbedoUrl from '../assets/ground/wet-gravel-albedo.generated.png'

import { createAntiTilingGroundMaterial } from './antiTilingGround'

function loadGroundColorTexture(url: string): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url)
  texture.anisotropy = 8
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/**
 * Built on first use, not at import.
 *
 * As module constants these ran the moment ANY file imported this module — and
 * `layeredTerrainMaterial.ts` imports it for the factory below, so opening the
 * layered-terrain lab constructed this lab's 44 m plane and started downloading
 * its two 3.5 MB textures, which nothing there draws and nothing ever disposes.
 */
let built: { geometries: AntiTilingGroundGeometries; materials: AntiTilingGroundMaterials } | null = null

type AntiTilingGroundGeometries = { readonly ground: THREE.PlaneGeometry; readonly marker: THREE.BoxGeometry }
type AntiTilingGroundMaterials = { readonly ground: THREE.MeshStandardMaterial; readonly marker: THREE.MeshStandardMaterial }

export function antiTilingGroundResources() {
  built ??= {
    geometries: { ground: new THREE.PlaneGeometry(44, 44), marker: new THREE.BoxGeometry(1, 1, 1) },
    materials: {
      ground: createAntiTilingGroundDemoMaterial(),
      marker: new THREE.MeshStandardMaterial({ color: '#b7b9bc', metalness: 0, roughness: 0.9 }),
    },
  }
  return built
}

/** Creates an isolated instance for a material workbench/sample scene. */
export function createAntiTilingGroundDemoMaterial(): THREE.MeshStandardMaterial {
  return createAntiTilingGroundMaterial(loadGroundColorTexture(wetGravelAlbedoUrl), {
    dryMap: loadGroundColorTexture(dryGrassAlbedoUrl),
    dryLayerStrength: 0.7,
    distortionStrength: 0.08,
    macroStrength: 0.13,
    secondLayerStrength: 0.1,
    variationStrength: 0.22,
    worldTileSize: new THREE.Vector2(2.35, 2.35),
  })
}

