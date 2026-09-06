import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

import { LabStage } from '../../../scenes/lab-stage/LabStage'
import { ShadowGroup } from '../../../shared/lib/ShadowGroup'
import { ControlChoice, ControlPanel, ControlSlider } from '../../ui-kit'

import wetGravelUrl from '../../anti-tiling-ground/assets/ground/wet-gravel-albedo.generated.png'
import roadUrl from '../assets/road/mud-road-albedo.generated.png'
// Drawn for this layer, because parallax needs a REAL height map: albedo, height
// and normal all describe the same generated stone surface.
import stoneUrl from '../assets/stone/stone-albedo.generated.png'
import stoneHeightUrl from '../assets/stone/stone-height.generated.png'
import stoneNormalUrl from '../assets/stone/stone-normal-derived.png'

import { createLayeredTerrainMaterial, type LayeredTerrainMaterial } from '../materials/layeredTerrainMaterial'
// Decoding and packing the slices is the MATERIAL's contract, not this lab's:
// albedo must be sRGB, height and normal must not, every slice must be the same
// square size and the mip chain has to exist or the stone overlay's ranked
// coverage crawls at distance. A second copy of those rules is a second place
// for one of them to be wrong, so they live next to the material.
import { FLAT_NORMAL_URL, arrayFrom, sliceOf } from '../systems/layerTextureArray'
import { bakeMaskAtlas, type MaskSource } from '../systems/layerMask'
import { ROAD_FIELD_FUNCTIONS, ROAD_TERRAIN_VERTEX_DECLARATIONS } from '../systems/roadField'
import type { TerrainLayer } from '../systems/terrainLayerStack'

import styles from './LayeredTerrainLabScreen.module.css'

/**
 * The bench for the layered terrain material: four surfaces on ONE mesh,
 * composed as data.
 *
 * What this lab is for is the seams. A stack of surfaces is easy to get to
 * "roughly right" and very hard to get right at the joins, and every join has
 * its own failure: the road is a painted stripe instead of a thing pressed into
 * the soil, the stones sit in front of the ground instead of on it, or a layer's
 * height is read from a different part of its map than its colour and the stone
 * gets cut somewhere the stone is not.
 *
 * So the controls isolate exactly those questions. LAYER shows one layer's mask
 * in greyscale instead of the blend — the only way to see where a mask actually
 * reaches, because a correct-looking blend can hide a mask that is wrong
 * everywhere the layer above it wins. DENSITY moves the stone coverage: the
 * channel is RANKED, so the number is the fraction of ground covered, and a
 * stack whose coverage does not track that number is broken regardless of how
 * it looks at one setting.
 *
 * The plate is the material's own local XY, ±5.8 m, which is the frame the road
 * field (`systems/roadField.ts`) is authored in.
 */

const SURFACE_SIZE = 11.6
const HALF = SURFACE_SIZE / 2

/** What the stone layer covers by default. The slider opens on this value. */
const DEFAULT_DENSITY = 0.32

/** The stone layer's index in `LAYERS`, so the density knob names one layer. */
const STONE_LAYER = 2

const LAYERS: readonly TerrainLayer[] = [
  // The ground IS the host material's own surface — the anti-tiling wet gravel
  // and dry grass of `features/anti-tiling-ground`. Not a copy of it in the
  // layer array: two definitions of one surface never stay equal.
  { id: 'ground', tileMeters: 2.35, blend: 'weight', isHostSurface: true },

  // The road, painted AND pressed. The press returns the whole landform with
  // the road's cuts already taken out of it, exactly as `roadTerrainHeight`
  // defines it; pressing only the cut into a dead-flat plate leaves a
  // vertical-walled slot that lights black.
  {
    id: 'mud-road',
    tileMeters: 4.35,
    blend: 'alpha',
    // The surface's OWN coordinates, the same ones the press reads. World
    // position would tie the road to wherever the plate happens to stand.
    maskGlsl: 'roadCoverageAt(vLayerLocal)',
    pressGlsl: 'roadTerrainHeight(layerPressPoint)',
  },

  // STONE, over EVERYTHING. Not a layer competing for the ground: an overlay
  // laid over the finished stack, road included — a stone does not care what
  // it is lying on.
  //
  // It carries the three things that make a surface read as stone instead of a
  // picture of stone: its own NORMAL, so light breaks across each one;
  // PARALLAX, so a near side hides what is behind it as the camera moves; and
  // its own RELIEF as the coverage cut, so each stone has a hard edge and the
  // gaps between them show whatever is underneath.
  {
    id: 'stone',
    // The map holds roughly 25 stones across, so this puts an average stone at
    // seven or eight centimetres. Below about five, a stone is a couple of
    // pixels from a standing camera — too few for its own shading to be
    // visible, so it reads as flat speckle no matter how strong its normal is.
    tileMeters: 1.9,
    blend: 'overlay',
    // The slider writes this same number straight into the uniform.
    density: DEFAULT_DENSITY,
    // How far the near side of a stone may hide what is behind it — the
    // stone's own thickness, and what makes the field read as bodies lying on
    // the ground rather than as a pattern printed on it.
    parallaxMeters: 0.04,
    normalStrength: 2.5,
    // The shadow each stone throws on the soil beside it: the cue that says it
    // is lying ON the ground rather than pressed into it.
    contactShadow: 0.38,
  },
]

/** Slice 0 is unused — layer 0 takes the host surface — but the array needs a
 *  slice per layer index, so the ground's own map stands in for it. */
const ALBEDO_URLS = [wetGravelUrl, roadUrl, stoneUrl]
/** No ground layer ships relief, so each one's own luminance stands in for it. */
const HEIGHT_URLS: readonly (string | null)[] = [null, null, stoneHeightUrl]
/** Flat where a layer ships no normal of its own. */
const NORMAL_URLS: readonly (string | null)[] = [null, null, stoneNormalUrl]

// Both ground layers answer with GLSL, so nothing here needs a bake yet. The
// atlas stays because the architecture must carry painted masks too — a biome
// has no expression the shader could evaluate for free.
const MASKS: readonly MaskSource[] = [
  { kind: 'constant', value: 1 },
  { kind: 'constant', value: 0 },
  // EVERYWHERE. The stone overlay has no patch and no edge — its own relief is
  // what decides where an actual stone sits and where the ground between them
  // shows through. A mask that dipped to zero somewhere would make it a stain.
  { kind: 'constant', value: 1 },
]

const LAYERS_COUNT = LAYERS.length

const LAYER_OPTIONS = [
  { id: 'blended', label: 'Blended' },
  { id: '0', label: 'Ground' },
  { id: '1', label: 'Road' },
  { id: '2', label: 'Stone' },
] as const

export function LayeredTerrainLabScreen() {
  /* eslint-disable no-restricted-syntax -- both are choices a person makes with
     a control, and both are meant to redraw what is under them: the debug view
     switches which layer the surface shows, and the density number is also
     printed in the hint below the slider. Neither is written per frame — they
     land in uniforms, and the mesh, the geometry and the material are memoized,
     so the render they cause is the panel, not the terrain. */
  const [density, setDensity] = useState(DEFAULT_DENSITY)
  const [debugLayer, setDebugLayer] = useState('blended')
  /* eslint-enable no-restricted-syntax */

  const geometry = useMemo(
    // Subdivided: a press moves VERTICES, so a two-triangle quad has nothing to
    // press.
    () => new THREE.PlaneGeometry(SURFACE_SIZE, SURFACE_SIZE, 320, 320),
    [],
  )
  const atlas = useMemo(
    () => bakeMaskAtlas({ sources: MASKS, resolution: 512, originX: -HALF, originZ: -HALF, sizeMeters: SURFACE_SIZE }),
    [],
  )
  // eslint-disable-next-line no-restricted-syntax -- built from six decoded textures, once, asynchronously: going from nothing to a surface IS the render, and it happens once per visit to this lab.
  const [material, setMaterial] = useState<LayeredTerrainMaterial | null>(null)

  useEffect(() => {
    let disposed = false
    let built: LayeredTerrainMaterial | null = null

    Promise.all([
      Promise.all(ALBEDO_URLS.map((url) => sliceOf(url, false))),
      Promise.all(ALBEDO_URLS.map((url, index) => sliceOf(HEIGHT_URLS[index] ?? url, true))),
      Promise.all(ALBEDO_URLS.map((_url, index) => sliceOf(NORMAL_URLS[index] ?? FLAT_NORMAL_URL, false))),
    ])
      .then(([albedoSlices, heightSlices, normalSlices]) => {
        if (disposed) return
        built = createLayeredTerrainMaterial({
          layers: LAYERS,
          // The road field, declared in both stages: the fragment stage needs it
          // for the mask, the vertex stage for the press.
          vertexPressDeclarations: ROAD_TERRAIN_VERTEX_DECLARATIONS,
          fragmentDeclarations: ROAD_FIELD_FUNCTIONS,
          albedo: arrayFrom(albedoSlices, true),
          height: arrayFrom(heightSlices, false),
          normal: arrayFrom(normalSlices, false),
          atlas,
        })
        setMaterial(built)
      })
      .catch((error: unknown) => console.error('[terrain-layers] layered terrain failed', error))

    return () => {
      disposed = true
      const textures = built?.userData.layeredTerrainTextures as THREE.Texture[] | undefined
      textures?.forEach((texture) => texture.dispose())
      built?.dispose()
    }
  }, [atlas])

  // Both knobs are uniform writes, never rebuilds: a control that decoded every
  // slice again to answer would land a frame late and leak the textures the old
  // material owned, and the thing being judged — how the stack changes as the
  // number moves — is exactly what a stutter between the two states hides.
  useEffect(() => {
    material?.setLayerDebug(debugLayer === 'blended' ? -1 : Number(debugLayer))
  }, [debugLayer, material])

  useEffect(() => {
    material?.setOverlayDensity(STONE_LAYER, density)
  }, [density, material])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <main className={styles.screen} data-testid="layered-terrain-lab">
      <LabStage
        // High enough that the whole 11.6 m plate is inside the frame, and far
        // enough off-axis that the road's press reads as a cut rather than as a
        // stripe: a near-vertical view flattens the one thing this stack does
        // that a painted mask cannot.
        camera={{ far: 200, fov: 40, near: 0.05, position: [10.6, 9.4, 12.4] }}
        // The plate IS the subject: the stage's own floor would sit inside it
        // and its grid would draw a repeating pattern over the surface whose
        // blend is being judged.
        grid={false}
        ground={false}
        // 0.7 m at the near end rather than a comfortable couple of metres: a
        // stone here is the size of a palm, and the question this lab asks — is
        // it lying ON the ground or printed on it — cannot be answered from two
        // metres. The stone's edge, the soil between stones and the contact
        // shadow only read from up close.
        orbit={{ maxDistance: 26, minDistance: 0.7, target: [0, 0.2, 0] }}
        post="rich"
        sun={{ radius: 10 }}
      >
        {material ? (
          <ShadowGroup kind="static">
            <mesh geometry={geometry} material={material} receiveShadow rotation-x={-Math.PI / 2} />
          </ShadowGroup>
        ) : null}
      </LabStage>

      <div className={styles.hud}>
        <ControlPanel
          data-testid="layered-terrain-controls"
          maxWidth={430}
          readout={material ? `${LAYERS_COUNT} layers` : 'loading…'}
          title="Layered terrain"
        >
          <div className={styles.controls}>
            <ControlChoice
              activeId={debugLayer}
              label="Debug view"
              onSelect={setDebugLayer}
              options={[...LAYER_OPTIONS]}
              testIdPrefix="layered-terrain-view"
            />
            <ControlSlider
              data-testid="layered-terrain-density"
              format={(value) => value.toFixed(2)}
              label="Stone density"
              max={0.5}
              min={0}
              onChange={setDensity}
              step={0.01}
              value={density}
            />
            <p className={styles.hint}>
              {`density ${density.toFixed(2)} → \`{ id: 'stone', density: ${density.toFixed(2)} }\` in the layer at index ${STONE_LAYER}.`}
            </p>
          </div>
        </ControlPanel>
      </div>
    </main>
  )
}
