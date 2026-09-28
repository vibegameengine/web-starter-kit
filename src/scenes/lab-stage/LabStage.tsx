import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'
import { useEffect } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { PCFShadowMap } from 'three'

import { DirectorPanel } from '../../features/ui-kit/components/DirectorPanel/DirectorPanel'
import { useReportInitialRenderReady } from '../../features/bootstrap'
import { ShadowGroup } from '../../shared/lib/ShadowGroup'
import { ShadowCompositor } from '../../shared/lib/shadows'
import { FrameProbe, useFrameRateCap, useGraphicsSettings } from '../../shared/lib/graphics'
import { VfxLightPool } from '../../shared/lib/lights/VfxLights'
import { DirectorCamera } from '../../shared/lib/director/DirectorCamera'
import { DirectorLights } from '../../shared/lib/director/DirectorLights'
import {
  DirectorDisplayContrast,
  DirectorGlare,
  DirectorGrain,
  DirectorLook,
  DirectorToneMapping,
  DirectorVignette,
} from '../../shared/lib/director/DirectorPost'
import { Debug } from '../demo-scene/Debug'
import { labStageGroundGeometry, labStageGroundMaterial } from './labStageMaterials'

const KIT_SKY = 'kit-sky'
const LARGEST_SHADOW_RADIUS = 60

export type LabStageSun = {
  readonly color?: string
  readonly intensity?: number
  readonly offset?: [number, number, number]
  readonly radius?: number
}

export type LabStageRichPost = {
  readonly aoRadius?: number
  readonly aoSamples?: number
  readonly denoiseRadius?: number
  readonly denoiseSamples?: number
  readonly distanceFalloff?: number
  readonly intensity?: number
}

export type LabStageProps = {
  readonly ambient?: number
  readonly bounceColor?: string
  readonly fillColor?: string
  readonly skyColor?: string
  readonly background?: typeof KIT_SKY | (string & {}) | null
  readonly camera?: {
    readonly far?: number
    readonly fov?: number
    readonly near?: number
    readonly position?: [number, number, number]
  }
  readonly children?: ReactNode
  readonly environment?: boolean
  readonly grid?: boolean
  readonly vfxLights?: boolean
  readonly ground?: boolean
  readonly groundSize?: number
  readonly orbit?: false | {
    readonly maxDistance?: number
    readonly minDistance?: number
    readonly target?: [number, number, number]
  }
  readonly effects?: ReactElement
  readonly perf?: boolean
  readonly post?: 'lean' | 'none' | 'rich'
  readonly richPost?: LabStageRichPost
  readonly sun?: LabStageSun
}

function LabGround({ grid, ground, groundSize }: { readonly grid: boolean; readonly ground: boolean; readonly groundSize: number }) {
  return (
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
  )
}

function LabPost({ effects, post, richPost }: { readonly effects?: ReactElement; readonly post: 'lean' | 'rich'; readonly richPost?: LabStageRichPost }) {
  const rich = post === 'rich'
  return (
    <EffectComposer multisampling={0}>
      {rich ? (
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
      {rich ? <DirectorGlare /> : <></>}
      <SMAA />
      <DirectorLook />
      <DirectorToneMapping />
      <DirectorDisplayContrast />
      {rich ? <DirectorVignette /> : <></>}
      <DirectorGrain />
    </EffectComposer>
  )
}

export function LabStage({
  ambient = 1,
  background = KIT_SKY,
  bounceColor,
  camera,
  children,
  effects,
  environment = true,
  fillColor,
  grid = true,
  ground = true,
  groundSize = 120,
  orbit = {},
  perf = true,
  post = 'lean',
  richPost,
  skyColor,
  sun,
  vfxLights = false,
}: LabStageProps) {
  useReportInitialRenderReady()

  const graphics = useGraphicsSettings()
  const frameRateCap = useFrameRateCap()
  const sunRadius = sun?.radius ?? Math.min(LARGEST_SHADOW_RADIUS, groundSize / 2)

  return (
    <>
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
        <DirectorCamera />
        {background !== null && background !== KIT_SKY ? <color args={[background]} attach="background" /> : null}
        <ShadowCompositor every={graphics.shadowThrottle} />

        <DirectorLights
          ambientScale={ambient}
          environment={environment}
          palette={{ fill: fillColor, ground: bounceColor, sky: skyColor }}
          rim
          sky={background === KIT_SKY}
          sun={{ color: sun?.color, intensity: sun?.intensity, offset: sun?.offset, radius: sunRadius }}
        />
        {vfxLights ? <VfxLightPool /> : null}

        <LabGround grid={grid} ground={ground} groundSize={groundSize} />

        {children}

        {orbit === false ? null : (
          <OrbitControls
            dampingFactor={0.08}
            enableDamping
            makeDefault
            maxDistance={orbit.maxDistance ?? 120}
            maxPolarAngle={Math.PI / 2 - 0.02}
            minDistance={orbit.minDistance ?? 0.4}
            target={orbit.target ?? [0, 1, 0]}
          />
        )}

        {post === 'none' ? null : <LabPost effects={effects} post={post} richPost={richPost} />}

        <FrameProbe />

        {perf ? <Debug /> : null}
      </Canvas>
      <DirectorPanel />
    </>
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
