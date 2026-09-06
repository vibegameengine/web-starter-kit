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

export const antiTilingGroundGeometries = {
  ground: new THREE.PlaneGeometry(44, 44),
  marker: new THREE.BoxGeometry(1, 1, 1),
} as const

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

export const antiTilingGroundMaterials = {
  ground: createAntiTilingGroundDemoMaterial(),
  marker: new THREE.MeshStandardMaterial({ color: '#b7b9bc', metalness: 0, roughness: 0.9 }),
} as const
