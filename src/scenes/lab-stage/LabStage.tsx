import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  N8AO,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { ReactElement, ReactNode } from 'react'
import { PCFShadowMap } from 'three'

import { useReportInitialRenderReady } from '../../features/bootstrap'
import { ShadowGroup } from '../../shared/lib/ShadowGroup'
import { SunShadow } from '../../shared/lib/SunShadow'
import { ShadowCompositor } from '../../shared/lib/shadows'
import { useFrameRateCap, useGraphicsSettings } from '../../shared/lib/graphics'
import { Debug } from '../demo-scene/Debug'
import { labStageGroundGeometry, labStageGroundMaterial } from './labStageMaterials'

/**
 * The one stage every DEV lab stands on.
 *
 * See the `dev-lab-authoring` skill, rule 2. A lab mounts this and adds its
 * SUBJECT — it does not bring its own canvas, light rig, grid or post chain.
 * That is not a tidiness preference: when each lab lights its subject its own
 * way, two labs cannot be compared, and a material or a model tuned in one
 * comes out wrong in the next and wrong again in the game.
 *
 * So the lighting here deliberately speaks the GAME's language — the same sun
 * direction, the same warm key against a cool sky fill, the same ACES tone
 * mapping — rather than a neutral studio rig. A subject that reads well on this
 * stage reads well in the raid.
 *
 * Everything a lab could reasonably need to change is an OPTION. If a lab needs
 * something that is not one, add the option here rather than forking the stage:
 * one more prop is always a smaller diff than a second copy, and the copy is
 * what the next author will inherit.
 */

/** Sun position relative to the stage centre. Shared with the game's own scenes. */
const SUN_OFFSET: [number, number, number] = [40, 52, 34]
const SUN_COLOR = '#ffe7c2'
const SUN_INTENSITY = 2.8

/** Neutral cool backdrop: dark enough for a bright subject, never a colour cast. */
const BACKGROUND = '#20262b'

export type LabStageSun = {
  readonly color?: string
  readonly intensity?: number
  /** Sun position relative to the stage centre — direction and distance. */
  readonly offset?: [number, number, number]
  /** Half-size of the shadowed area in metres. Keep it just past the subject. */
  readonly radius?: number
}

export type LabStageProps = {
  /**
   * Scales the sky/bounce/fill lights together. 1 is daylight.
   *
   * For a lab whose subject EMITS — a VFX bench, a screen, a lamp — the ambient
   * has to come down or the subject cannot be judged at all: its glow is read
   * against the surface it lights, and a daylit floor flatters every emitter
   * equally. Turning the sun down alone is not enough, because the sky fill is
   * what actually sets the floor's black point.
   */
  readonly ambient?: number
  /** Solid backdrop colour. */
  readonly background?: string
  /** Fixed inspection camera. `target` is what the orbit controls pivot around. */
  readonly camera?: {
    readonly far?: number
    readonly fov?: number
    readonly near?: number
    readonly position?: [number, number, number]
  }
  /** The lab's subject. Wrap movers in `<ShadowGroup kind="dynamic">`. */
  readonly children?: ReactNode
  /** Reference grid. One metre per cell, five metres per section — everywhere. */
  readonly grid?: boolean
  /** Shadow-receiving floor under the subject. */
  readonly ground?: boolean
  /** Floor extent in metres. */
  readonly groundSize?: number
  /** Orbit inspection controls, or `false` when the lab drives its own camera. */
  readonly orbit?: false | {
    readonly maxDistance?: number
    readonly minDistance?: number
    readonly target?: [number, number, number]
  }
  /**
   * Extra composer effects, inserted after AO and BEFORE bloom.
   *
   * The slot exists so a lab whose subject IS a screen-space effect — refraction,
   * distortion, a scanner overlay — can mount it without forking the post chain
   * (rule 2: options, not copies). Before bloom on purpose: bloom must bleed from
   * the image those effects produced, not from the one they replaced.
   *
   * Typed as a single element rather than `ReactNode`: each child of a composer
   * must BE an effect, and a fragment or a string silently renders nothing.
   */
  readonly effects?: ReactElement
  /** In-canvas r3f-perf panel (toggled with "P"). */
  readonly perf?: boolean
  /**
   * `lean` — anti-aliasing, tone mapping, contrast: what the frame needs to be
   * judged at all. `rich` adds the game's AO, bloom and vignette, for a lab
   * whose subject is a look. `none` for a lab that owns its own composer.
   */
  readonly post?: 'lean' | 'none' | 'rich'
  readonly sun?: LabStageSun
}

export function LabStage({
  ambient = 1,
  background = BACKGROUND,
  camera,
  children,
  effects,
  grid = true,
  ground = true,
  groundSize = 120,
  orbit = {},
  perf = true,
  post = 'lean',
  sun,
}: LabStageProps) {
  // The stage owns the readiness handshake so no lab has to remember it: a lab
  // that forgets leaves the bootstrap overlay up over a perfectly good frame.
  useReportInitialRenderReady()

  const graphics = useGraphicsSettings()
  const frameRateCap = useFrameRateCap()

  const sunOffset = sun?.offset ?? SUN_OFFSET
  // The shadow box is the shadow resolution budget: sized to the ground rather
  // than to the world, so a lab's subject gets the sharp half of the map.
  const sunRadius = sun?.radius ?? Math.min(60, groundSize / 2)

  return (
    <Canvas
      camera={{
        far: camera?.far ?? 400,
        fov: camera?.fov ?? 40,
        near: camera?.near ?? 0.05,
        position: camera?.position ?? [6.2, 4.2, 8],
      }}
      dpr={graphics.dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      maxFps={frameRateCap}
      shadows={{ type: PCFShadowMap }}
    >
      <color args={[background]} attach="background" />

      {/* Same split the game runs: the static floor is baked once and only the
          lab's movers are redrawn. A lab with no static casters degrades to a
          throttled full update on its own. */}
      <ShadowCompositor every={graphics.shadowThrottle} />

      {/* Warm key — the game's sun, from the game's direction. */}
      <SunShadow
        color={sun?.color ?? SUN_COLOR}
        intensity={sun?.intensity ?? SUN_INTENSITY}
        offset={sunOffset}
        radius={sunRadius}
      />
      {/* Cool sky above, warm ground bounce below. */}
      <hemisphereLight args={['#8bb4ef', '#b8a99a', 0.55 * ambient]} />
      {/* Fill from the shadow side, so the dark half of a subject still has form. */}
      <directionalLight color="#bcd2ec" intensity={0.35 * ambient} position={[-16, 8, -18]} />

      <ShadowGroup kind="static">
        {ground ? (
          <mesh
            geometry={labStageGroundGeometry}
            material={labStageGroundMaterial}
            receiveShadow
            rotation-x={-Math.PI / 2}
            scale={[groundSize, groundSize, 1]}
          />
        ) : null}

        {/* The ruler. One metre a cell in every lab, so a subject that looks the
            right size in one is the right size in all of them. Lifted off the
            floor by a millimetre — coplanar with it, it z-fights. */}
        {grid ? (
          <Grid
            cellColor="#5d666c"
            cellSize={1}
            cellThickness={0.6}
            fadeDistance={Math.max(40, groundSize * 0.7)}
            fadeStrength={1.4}
            infiniteGrid
            position={[0, 0.001, 0]}
            sectionColor="#828e97"
            sectionSize={5}
            sectionThickness={1.1}
          />
        ) : null}
      </ShadowGroup>

      {children}

      {orbit === false ? null : (
        <OrbitControls
          dampingFactor={0.08}
          enableDamping
          // Registered in the r3f store so a lab that drags its subject with the
          // pointer can pause the camera for the length of the drag. Without it
          // `state.controls` is null and the only way to stop the camera fighting
          // a drag is for the lab to fork the stage.
          makeDefault
          maxDistance={orbit.maxDistance ?? 120}
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={orbit.minDistance ?? 0.4}
          target={orbit.target ?? [0, 1, 0]}
        />
      )}

      {post === 'none' ? null : (
        <EffectComposer multisampling={0}>
          {post === 'rich' ? (
            <N8AO
              aoRadius={5}
              aoSamples={16}
              color="#080b12"
              denoiseRadius={12}
              denoiseSamples={8}
              distanceFalloff={1}
              halfRes
              intensity={2.6}
            />
          ) : (
            <></>
          )}
          {effects ?? <></>}
          {post === 'rich' ? (
            <Bloom intensity={0.5} levels={5} luminanceSmoothing={0.3} luminanceThreshold={0.8} mipmapBlur />
          ) : (
            <></>
          )}
          <SMAA />
          {/* ACES, not AgX: brights read bright and darks read dark, instead of
              everything collapsing to mid-grey — the same call the game makes. */}
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <BrightnessContrast brightness={0} contrast={0.14} />
          {post === 'rich' ? <Vignette darkness={0.4} eskil={false} offset={0.25} /> : <></>}
        </EffectComposer>
      )}

      {perf ? <Debug /> : null}
    </Canvas>
  )
}
