import { Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
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
import { useEffect } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { PCFShadowMap } from 'three'

import { useReportInitialRenderReady } from '../../features/bootstrap'
import { ShadowGroup } from '../../shared/lib/ShadowGroup'
import { SunShadow } from '../../shared/lib/SunShadow'
import { ShadowCompositor } from '../../shared/lib/shadows'
import { FrameProbe, useFrameRateCap, useGraphicsSettings } from '../../shared/lib/graphics'
import { VfxLightPool } from '../../shared/lib/lights/VfxLights'
import { Debug } from '../demo-scene/Debug'
import { labStageGroundGeometry, labStageGroundMaterial } from './labStageMaterials'

/**
 * The one stage every DEV lab stands on: a lab mounts this and adds its SUBJECT,
 * never its own canvas, light rig, grid or post chain. When each lab lights its
 * subject its own way, two labs cannot be compared, and a material tuned in one
 * comes out wrong in the next and wrong again in the game.
 *
 * The lighting speaks the GAME's language rather than a neutral studio's, for the
 * same reason. Anything a lab might need to change is a PROP below — one more
 * prop is a smaller diff than a second copy of the stage, and the copy is what
 * the next author inherits. See the `dev-lab-authoring` skill, rule 2.
 */

/** Sun position relative to the stage centre. Shared with the game's own scenes. */
const SUN_OFFSET: [number, number, number] = [40, 52, 34]
const SUN_COLOR = '#ffe7c2'
const SUN_INTENSITY = 2.8

/** Neutral cool backdrop: dark enough for a bright subject, never a colour cast. */
const BACKGROUND = '#20262b'

/** The default ambient palette: cool sky above, warm ground bounce below. */
const SKY_COLOR = '#8bb4ef'
const BOUNCE_COLOR = '#b8a99a'
const FILL_COLOR = '#bcd2ec'

export type LabStageSun = {
  readonly color?: string
  readonly intensity?: number
  /** Sun position relative to the stage centre — direction and distance. */
  readonly offset?: [number, number, number]
  /** Half-size of the shadowed area in metres. Keep it just past the subject. */
  readonly radius?: number
}

export type LabStageRichPost = {
  readonly aoRadius?: number
  readonly aoSamples?: number
  readonly bloomIntensity?: number
  readonly denoiseRadius?: number
  readonly denoiseSamples?: number
  readonly distanceFalloff?: number
  readonly intensity?: number
  readonly vignetteDarkness?: number
  readonly vignetteOffset?: number
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
  /**
   * The AMBIENT PALETTE — the colour of the sky above, the bounce from the
   * ground, and the fill from the shadow side.
   *
   * They default to the game's own cool-sky-over-warm-ground rig, so a lab that
   * does not name them is lit exactly as it was before they existed, and they
   * exist because `ambient` alone cannot express every day. Turning the
   * stage's ambient up to reach a soft, skylight-driven look — a bright overcast
   * where shaded stone is only a quarter darker than lit stone — also turns the
   * blue of `#8bb4ef` up with it, and the subject arrives cold and grey. The
   * quantity a lab is trying to control there is the ambient's COLOUR, not its
   * strength, and no amount of the second one substitutes for the first.
   */
  readonly bounceColor?: string
  readonly fillColor?: string
  readonly skyColor?: string
  /**
   * Solid backdrop colour, or `null` for a scene that paints its own sky.
   *
   * `null` is not a tidiness option, it is a correctness one. R3F's `attach`
   * writes `scene.background` whenever this element renders, and a scene that
   * sets the background itself - a gradient sky, an environment map - loses it
   * the next time the stage re-renders for any reason at all.
   *
   * Measured: the level lab mounts its fight only once the collision grid
   * exists, so the stage re-rendered about three seconds in, re-attached this
   * colour over the sky texture, and the sky went black from that second
   * onwards. The scene's own sky effect had already run and had nothing left to
   * fight with. Logged at the seam: `background === texture` true, then
   * `Color` on the next tick.
   */
  readonly background?: string | null
  /** Fixed inspection camera. `target` is what the orbit controls pivot around. */
  readonly camera?: {
    readonly far?: number
    readonly fov?: number
    readonly near?: number
    readonly position?: [number, number, number]
  }
  /** The lab's subject. Wrap movers in `<ShadowGroup kind="dynamic">`. */
  readonly children?: ReactNode
  /**
   * The game's image-based light, for a subject made of METAL.
   *
   * Off by default, because it changes the look of every lab that turns it on
   * and most subjects do not need it. A metallic surface does: a
   * `MeshStandardMaterial` at `metalness = 1` has no diffuse term at all, so the
   * lights above contribute a specular highlight and nothing else, and the
   * subject renders as a near-black silhouette that no amount of key light
   * fixes. What it reflects IS its colour.
   *
   * The three lightformers mirror the arena's own `<Environment>`
   * (`quake-combat-arena/QuakeCombatArenaScene.tsx`) rather than a studio HDRI —
   * same sky panel overhead, same cool and warm side cards — which is the whole
   * point of rule 2: a gun that reads right here reads right in the raid.
   */
  readonly environment?: boolean
  /** Reference grid. One metre per cell, five metres per section — everywhere. */
  readonly grid?: boolean
  /**
   * Mount the VFX light pool for this lab. Off unless a lab lights something
   * with `<VfxLight>` — see `shared/lib/lights/VfxLights.tsx` for why the pool
   * is fixed-size and permanent, and why an unused one is not free: three.js
   * compiles the scene's light COUNT into every material, so eight idle lamps
   * change every program in the lab.
   */
  readonly vfxLights?: boolean
  /** Shadow-receiving floor under the subject. */
  readonly ground?: boolean
  /** Metres. Also sizes the shadow box, unless `sun.radius` says otherwise. */
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
   * distortion, a scanner overlay — can mount it without forking the post chain.
   * Before bloom on purpose: bloom must bleed from the image those effects
   * produced, not from the one they replaced.
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
  readonly richPost?: LabStageRichPost
  readonly sun?: LabStageSun
}

export function LabStage({
  ambient = 1,
  background = BACKGROUND,
  bounceColor = BOUNCE_COLOR,
  camera,
  children,
  effects,
  environment = false,
  fillColor = FILL_COLOR,
  grid = true,
  ground = true,
  groundSize = 120,
  orbit = {},
  perf = true,
  post = 'lean',
  richPost,
  skyColor = SKY_COLOR,
  sun,
  vfxLights = false,
}: LabStageProps) {
  // The stage owns the readiness handshake so no lab has to remember it: a lab
  // that forgets leaves the bootstrap overlay up over a perfectly good frame.
  useReportInitialRenderReady()

  const graphics = useGraphicsSettings()
  const frameRateCap = useFrameRateCap()

  const sunIntensity = sun?.intensity ?? SUN_INTENSITY
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
      <LabSceneSeam />

      {/* Omitted entirely when the scene owns its sky - see `background`. */}
      {background !== null && <color args={[background]} attach="background" />}

      {/* Same split the game runs: the static floor is baked once and only the
          lab's movers are redrawn. A lab with no static casters degrades to a
          throttled full update on its own. */}
      <ShadowCompositor every={graphics.shadowThrottle} />

      {/* Warm key — the game's sun, from the game's direction.
          Skipped entirely at zero intensity rather than rendered dark. A light
          that contributes nothing still CASTS: it costs a full shadow pass, and
          worse, it makes the scene hold two shadow-casting suns whenever the
          mounted subject brings its own. The cached shadow rig refuses to cache
          a scene with more than one — each would need its own baked map — so a
          stage that politely dims its sun to nothing was silently dropping the
          whole scene onto the uncached path. Measured in the arena, which passes
          `sun={{ intensity: 0 }}` and has its own sun:
          `[shadows] fallback (more than one shadow-casting light)`. */}
      {sunIntensity > 0 ? (
        <SunShadow
          color={sun?.color ?? SUN_COLOR}
          intensity={sunIntensity}
          offset={sunOffset}
          radius={sunRadius}
        />
      ) : null}
      {/* Cool sky above, warm ground bounce below. */}
      <hemisphereLight args={[skyColor, bounceColor, 0.55 * ambient]} />
      {/* Fill from the shadow side, so the dark half of a subject still has form. */}
      <directionalLight color={fillColor} intensity={0.35 * ambient} position={[-16, 8, -18]} />

      {/* The VFX lamps, opt-in. A lab that spawns flashes asks for the pool and
          then never pays for a shader recompile to show one; a lab that spawns
          none should not carry eight `pointLight`s it does not use, because the
          count is compiled into every material in the scene either way. */}
      {vfxLights ? <VfxLightPool /> : null}

      {/* The arena's image-based light, opt-in. `frames={1}` bakes it once: it
          is a static rig, and re-rendering the cube map every frame costs a lab
          more than the whole subject does. */}
      {environment ? (
        <Environment frames={1} resolution={128}>
          <Lightformer color="#dfeaf6" form="rect" intensity={0.7} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
          <Lightformer color="#c3d4ea" form="rect" intensity={0.35} position={[-12, 5, -6]} scale={[10, 10, 1]} />
          <Lightformer color="#f0e6d6" form="rect" intensity={0.3} position={[12, 5, 6]} scale={[10, 10, 1]} />
        </Environment>
      ) : null}

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
              aoRadius={richPost?.aoRadius ?? 5}
              aoSamples={richPost?.aoSamples ?? 16}
              color="#080b12"
              denoiseRadius={richPost?.denoiseRadius ?? 12}
              denoiseSamples={richPost?.denoiseSamples ?? 8}
              distanceFalloff={richPost?.distanceFalloff ?? 1}
              halfRes
              intensity={richPost?.intensity ?? 2.6}
            />
          ) : (
            <></>
          )}
          {effects ?? <></>}
          {post === 'rich' ? (
            <Bloom intensity={richPost?.bloomIntensity ?? 0.5} levels={5} luminanceSmoothing={0.3} luminanceThreshold={0.8} mipmapBlur />
          ) : (
            <></>
          )}
          <SMAA />
          {/* ACES, not AgX: brights read bright and darks read dark, instead of
              everything collapsing to mid-grey — the same call the game makes. */}
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <BrightnessContrast brightness={0} contrast={0.14} />
          {post === 'rich' ? <Vignette darkness={richPost?.vignetteDarkness ?? 0.4} eskil={false} offset={richPost?.vignetteOffset ?? 0.25} /> : <></>}
        </EffectComposer>
      )}

      {/* The frame-cost seam (`shared/lib/graphics/FrameProbe.tsx`). DEV-only and
          silent until a probe calls `window.__frameProbe.start()`, so it costs a
          no-op function call per frame and nothing else. It lives beside the
          r3f-perf panel because they answer the same question at different
          resolutions: the panel is for a human glancing at a running scene, the
          probe is for a script that has to write down 1200 individual frames and
          say which pass produced the slow ones. */}
      <FrameProbe />

      {perf ? <Debug /> : null}
    </Canvas>
  )
}

declare global {
  interface Window {
    __labScene?: unknown
  }
}

function LabSceneSeam() {
  const scene = useThree((state) => state.scene)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__labScene = scene
    return () => {
      if (window.__labScene === scene) window.__labScene = undefined
    }
  }, [scene])
  return null
}
