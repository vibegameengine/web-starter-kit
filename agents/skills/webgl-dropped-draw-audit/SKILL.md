---
name: webgl-dropped-draw-audit
description: >-
  Catch draws the GPU driver silently rejects. A WebGL/Three.js render that ends
  up in a state its shaders were not compiled for does not throw, does not warn
  in most builds, and does not always look broken — the driver drops the
  offending draw calls and the frame renders without them. MANDATORY before
  calling any render-pass change done: a new render pass, a shadow/depth/GBuffer
  target, swapping what a light samples, custom material or program swaps,
  interleaving your own gl.render() with the frame, postprocessing changes, or
  anything touching renderer state (autoClear, render targets, layer masks,
  overrideMaterial). Trigger on: "an object disappeared", "the scene is
  half-missing", "shadows broke", "it works in one scene but not another",
  "GL_INVALID_OPERATION", "sampler type mismatch", "feedback loop", "the diff
  looks fine but something is off", extra render pass, RTT, depth copy, blit,
  program/shader variant. Pairs with visual-verification-gate (which proves what
  a frame LOOKS like; this proves the frame is COMPLETE).
---

# Dropped-draw audit — the frame that renders without half its draws

## The failure mode this exists for

A draw call whose bound textures do not match its program's sampler types (or
whose framebuffer is also bound as one of its inputs) is **rejected by the
driver**. What happens then:

- No exception. No rejected promise. Nothing to catch.
- The console *may* carry `GL_INVALID_OPERATION`, but browsers stop reporting
  after a couple hundred messages per context, so a steady leak looks like a
  short burst at startup and then silence.
- The frame is composed from the draws that survived, so it looks like a
  rendering *choice*, not a failure: a world that vanished behind its own
  vegetation, a room missing exactly one lamp, a character with no shadow.

Screenshots and pixel diffs do not catch this reliably. A missing object moves a
few percent of pixels, which is the same order as animation, camera easing and
tone-mapping jitter between two runs. **You cannot eyeball completeness — you
have to count.**

## The probe

Patch the draw entry points before the app boots, count the calls that leave an
error behind, and read the counter after the scene has run. In a browser
automation script this goes in the page's init script, so it is installed before
any GL context exists:

```js
// injected before page scripts run
const proto = WebGL2RenderingContext.prototype
window.__dropped = 0
for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
  const original = proto[name]
  proto[name] = function (...args) {
    const out = original.apply(this, args)
    if (this.getError() !== 0) window.__dropped += 1
    return out
  }
}
```

`getError()` per draw is a full pipeline flush — this is a **diagnostic build
only**, never something the app ships or a benchmark runs behind.

## The acceptance bar

**Zero.** Not "fewer than before", not "only at startup". Every scene the change
can reach, in every mode the change can run in (settings toggles, quality
presets, DEV overrides), boots to a steady state and walks around with a count of
exactly zero. A non-zero count is a defect even when the frame looks right — you
are looking at draws the driver threw away, and which ones get thrown away
changes with the driver, the machine and the load order.

Record the count per second, not just the total: a burst that stops tells you the
problem is a warm-up race (something compiled before the renderer settled), while
a steady rate tells you it is structural (every frame re-creates the bad state).

## Attributing the drops to a pass

When the app renders more than once per frame, the count alone does not say
whose draws are failing. Mark your own passes and read the marker at error time:

```js
// in the pass under suspicion
window.__inPass = 'compose'   // before your render
renderer.render(scene, camera)
window.__inPass = ''          // after

// in the probe
if (this.getError() !== 0) tally[window.__inPass || 'main'] += 1
```

Beware the obvious-looking discriminator that is wrong: `FRAMEBUFFER_BINDING !==
null` does **not** mean "my offscreen pass" in a post-processed app — the main
scene render also targets a framebuffer there.

## Localizing the cause

Once a pass is implicated, bisect it in the live app with URL flags rather than
by editing and reloading blind. Guard each suspect step behind a query parameter
in a DEV build, then run the probe with the flag on and off. Two or three runs
narrow a multi-step pass (bake / copy / draw / swap) to the single step that
introduces the drops. Remove the flags before finishing — they are scaffolding,
not features.

To identify *which* program is failing, read the current program at error time
and dump its `#define` lines: the shadow/envmap/lighting defines tell you what
the shader was compiled to expect, and the mismatch with what is bound is the
answer.

```js
const program = this.getParameter(this.CURRENT_PROGRAM)
// keep a shader-source map by patching shaderSource/attachShader, then print
// the fragment source's `#define` lines for that program
```

## What the mismatch usually is

Three recurring causes, all of which produce the same symptom:

1. **Drawing into a target that is also an input.** A depth/shadow map is bound
   to every material that reads it; rendering *into* it in the same frame makes
   those draws illegal. Copying into it (a blit) is fine — a copy is not a draw
   and has no samplers to conflict with. Assemble in scratch, copy home.
2. **A pass that cannot see the lights.** If a pass's camera layer mask excludes
   the scene's lights, the renderer builds a light state with none in it. Light
   uniforms — shadow map samplers among them — are shared across renders in a
   frame, so the *next* pass draws against a light state that no longer matches
   what its programs expect.
3. **Programs compiled before the renderer settled.** Shader variants bake in
   the shadow-map type, texture presence and light counts at compile time. A
   material compiled while the renderer still held a placeholder/deprecated
   setting declares, say, a plain sampler where a comparison sampler will be
   bound. Pin renderer-level settings (shadow map type first of all) at context
   creation, before anything warms up or compiles.

## Where this sits in the workflow

`visual-verification-gate` answers "does the frame look right". This skill
answers "is the frame complete". Run both: the gate on the way in (define what
you expect to see) and this audit on the way out (prove nothing was silently
discarded), and report the number alongside the screenshots.
