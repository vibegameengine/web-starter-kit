# Rendering: the light rig, the post chain and the director settings

The kit renders every canvas (the demo scene and every DEV lab) from one light rig and one
post chain, and both read one persisted store of **director settings**. A person tunes the
picture in the DIRECTOR panel; the value survives a reload and applies to every canvas.

## Where the director settings came from

They are a WebGL port of the director layer of
[`web-starter-kit-webgpu-pipline`](https://github.com/vibegameengine/web-starter-kit-webgpu-pipline)
(`src/features/render-pipeline/cineCamera.ts`, `src/shared/render/look.ts`,
`src/shared/render/outputStage.ts`). What moved over, and what did not:

| Group | Ported | Not ported, and why |
|---|---|---|
| Cine camera | All six body/lens presets, focal override, horizontal FOV and the stop-difference readout | Shutter angle does not drive the kit's motion blur: the kit's blur is a velocity pass with its own `intensity`, not a shutter model |
| Exposure | Manual exposure in EV (`exposureEV`) | The auto-meter. In the pipeline it is a WebGPU compute histogram with atomics; a WebGL version needs a mip-chain luminance or a readback, and is a separate piece of work |
| Look | Contrast around 0.18, shadow lift, luminance-preserving saturation, RGB balance in stops, output transform, film grain | Nothing |
| Glare | Mapped onto the kit's existing bloom (intensity and threshold) | The pipeline's energy-conserving threshold-0 glare |
| Lighting | Sun azimuth/elevation/intensity/colour; `indirectEV` and `indirectChroma` as gains on the kit's ambient | Physical sky, clouds, froxel fog, baked lightmaps and probe volumes: all WebGPU/TSL |

### Sources the numbers depend on

- **Cine presets** are the manufacturers' frame-size tables (ARRI, Sony, RED, IMAX), as the
  pipeline recorded them. Change a sensor size only against a spec sheet: the point of a preset
  is that a 32 mm on an ALEXA 35 frames what a 32 mm on an ALEXA 35 frames.
- **The stop difference is reported, never applied.** The pipeline's contract, kept: a preset
  does not silently change exposure; a person moves the Exposure slider by the stops shown.
- **Saturation never drives a channel negative.** For a channel below grey the strength that
  would reach zero is `Y / (-d)`, at least 1, so the smallest of those caps oversaturation
  instead of clamping the HDR frame to [0, 1] and eating the highlights.
- **The grade scales RGB only.** In the pipeline a vec4 multiply took alpha with it and the page
  bled through the canvas: a ×2 exposure step measured 1.93 instead of 2 until alpha was left
  alone. The kit's look effect keeps alpha untouched for the same reason.
- **ColorChecker** values in the `director-look` lab are the published sRGB values of the
  X-Rite ColorChecker Classic (BabelColor averages). The grey ball is `#777777`, 18% linear.

## Decisions

- **Defaults reproduce the kit's look.** Every default is the value the scenes hard-coded
  before the store existed: the sun at `[40, 52, 34]` and 2.8, the sky/bounce/fill palette,
  bloom 0.5 at 0.8, display contrast 0.14, vignette 0.4, ACES filmic. The look stage is the
  identity at its defaults, and grain is off.
- **One rig for every canvas.** `StarterScene` and `LabStage` carried hand-copied light values;
  they now both mount `DirectorLights`. A lab's own `ambient`, palette and `sun` props still
  win over the director values, so a lab that needs a darker key keeps it.
- **Every lab starts in the demo scene's environment.** `LabStage` defaults to the kit sky
  (the same gradient and horizon haze as the demo), the same three-lightformer IBL and the
  same rim light. A new lab copied from any other lab is lit and framed like the game without
  asking for it. A solid `background` colour or `null` opts out of the sky and haze.
  The one deliberate difference is the floor: the stage keeps its neutral 18% grey, the
  reference a material is tuned over, instead of the demo's tiled floor.
- **The sky is not in the IBL.** Putting the sky dome into the environment capture was tried:
  the demo's warm clay turned pale blue and every lit face washed out. The environment keeps
  the three lightformers the demo has always had.
- **The fill light follows the sun.** It sits at a fixed azimuth offset from the sun, taken from
  the lab stage's `[-16, 8, -18]`, the shadow side. The demo scene used to put it at
  `[16, 8, 18]`, on the lit side, while its own description called it a shadow-side fill.
- **The demo sun is a `SunShadow` now**, with the same 20 m box around the origin it had as a
  bare `directionalLight`. Nothing in the demo moves far enough to need `follow`; a game scene
  passes the player root to it.

## Pitfalls found while wiring it

- **Anything that re-renders the component holding `<EffectComposer>` rebuilds every pass.**
  `@react-three/postprocessing` 3.0.4 re-collects its effects in a layout effect keyed on its
  `children` prop, and a parent re-render hands it new children. A slider wired through the
  canvas component would recompile the chain on every drag step. So each director effect is its
  own leaf component that subscribes to the store and changes uniforms and setters in place
  (`BloomEffect.intensity`, `luminanceMaterial.threshold`, `ToneMappingEffect.mode`, ...). Read
  in the package bundle, not measured.
- **Changing a wrapped effect's props replaces the effect object**, and the composer does not
  notice (its dependency list has not changed), so the new object never reaches a pass. The
  wrappers are therefore mounted with their initial values and driven through a ref.
- **`LabStage` is not tone-mapped twice.** The composer sets `renderer.toneMapping` to
  `NoToneMapping` while it is mounted, whatever the canvas asked for.
- **A dev server started from `C:\Projects\…` fails on every GLB** when the directory on disk
  is `C:\projects`: Vite loads `@gltf-transform/functions` and `@gltf-transform/core` under two
  path spellings, the optimizer's `prune` gets two copies of the graph classes, and every model
  request dies with `Cannot read properties of null (reading 'getRoot')`. Start it from the
  path with the on-disk casing.

## Moved here from the scene files

Rationale that used to sit beside the code in `GameCanvas.tsx`, `StarterScene.tsx` and
`LabStage.tsx`:

- **dpr 1** is the biggest frame-rate lever in the demo: every full-screen pass (N8AO, bloom,
  SMAA, tone map) scales with resolution, and the N8AO demo itself runs at dpr 1.
- **N8AO at half resolution** is about 4× cheaper; its depth-aware upsampling keeps it clean.
- **Bloom runs 5 mip levels**: the mip chain was the biggest draw-call cost in the chain.
- **ACES, not AgX, by default**: brights read bright and darks dark instead of everything
  collapsing to mid-grey. AgX and Khronos neutral are one click away in the panel.
- **The shadow map refreshes every second frame** in the demo (`ShadowThrottle`): objects move
  little between frames, so it is invisible and halves the shadow pass.
- **A lab stage with its sun at zero intensity mounts no sun at all.** A light that contributes
  nothing still casts, costs a full shadow pass, and gives the scene two shadow-casting suns
  whenever the subject brings its own. The cached shadow rig refuses to cache a scene with more
  than one. Measured in the arena of the game this kit came from, which passed
  `sun={{ intensity: 0 }}` and had its own sun: `[shadows] fallback (more than one
  shadow-casting light)`.
- **`background={null}` exists for correctness.** R3F's `attach` rewrites `scene.background`
  whenever the stage re-renders. Measured in the same game's level lab: the stage re-rendered
  about three seconds in, re-attached the colour over the sky texture, and the sky went black
  from then on (`background === texture` true, then `Color` on the next tick).
- **The lab ambient palette is a colour, not only a strength.** Turning the ambient up to reach
  a soft overcast, where shaded stone is only a quarter darker than lit stone, also turns the
  blue of `#8bb4ef` up with it, and the subject arrives cold and grey.
- **The lab environment matters most for metal**: a `metalness = 1` surface has no diffuse
  term, so without an environment it renders as a near-black silhouette whatever the key light
  does. Its three lightformers mirror the game's arena, not a studio HDRI. `frames={1}` bakes
  it once. It used to be opt-in; it is on by default now that labs share the demo environment.
- **The lab `effects` slot sits before bloom**, so bloom bleeds from the image a screen-space
  effect produced. It is typed as one element because each composer child must be an effect; a
  fragment or a string silently renders nothing.
- **Orbit controls are `makeDefault`** so a lab that drags its subject can pause the camera
  through `state.controls` for the length of the drag.
