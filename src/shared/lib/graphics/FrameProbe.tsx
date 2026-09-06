import { addAfterEffect, addEffect, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

/**
 * DEV-only frame-cost seam: the instrument half of a frame-time probe, waiting
 * for a driver to start it.
 *
 * An external `requestAnimationFrame` loop sees the cadence the compositor
 * delivered — the symptom. It cannot see the draw calls, shader links or render
 * targets that produced it, nor say which of a frame's several passes grew.
 * Reaching in through r3f's private `canvas.__r3f` returns nothing in this
 * version (measured), and an instrument built on a private field is one
 * dependency bump from silently reporting zeros, which reads like a healthy
 * scene. So the renderer publishes itself, DEV-only, from inside the tree that
 * owns it: `start(segment)`, `mark(name)`, `stop()`, `info()`.
 *
 * WHERE the sample is taken is the whole of it. `gl.info.render` resets at the
 * START of every `gl.render()` while `autoReset` is true, and this scene renders
 * several times per frame (main, shadow, every composer pass) — a count read
 * after the frame describes only the LAST pass, and falls as the scene gets more
 * expensive. So this component owns the reset: `autoReset = false`, reset in
 * `addEffect` before any pass, read in `addAfterEffect` after all of them.
 * r3f-perf does the same when open, and both resets land before any render.
 */

export type FrameSample = {
  /** Draw calls issued for that frame, summed over every pass. */
  readonly calls: number
  /** Wall time between the END of the previous frame and the end of this one. */
  readonly delta: number
  /** Live buffer geometries. Growth inside a segment is churn or a leak. */
  readonly geometries: number
  /** Programs linked so far. A RISE inside a segment is a live shader compile. */
  readonly programs: number
  readonly segment: string
  /** Live GPU textures. Growth that never comes back down is a leak. */
  readonly textures: number
  /** Geometry submitted over every pass — main, shadow, post. */
  readonly triangles: number
  /**
   * JS heap in bytes — the only garbage-collection detector available in-page.
   *
   * Measured over three waves, a per-frame attribution could name a cause for
   * barely a third of the time spent over budget: 56-66% of it moved no draw
   * call, no program, no texture and no geometry. A collection shows up here as a
   * DROP. Chrome-only and quantized to about 100 KB (it is a fingerprinting
   * surface); `null` where the browser withholds it, never 0 — a zero would read
   * as an empty heap.
   */
  readonly heap: number | null
  /**
   * GPU time in ms via `EXT_disjoint_timer_query_webgl2`, or null.
   *
   * A slow frame with a flat heap and a high GPU time is the renderer waiting on
   * the card. The extension is often withheld, so null is common — and null is
   * reported rather than folded to zero, because "could not measure the GPU" and
   * "the GPU was idle" must never be confused. The result comes back some frames
   * late by construction: correlate it across a segment, never with one delta.
   */
  readonly gpu: number | null
}

export type FrameProbeInfo = {
  readonly calls: number
  readonly dpr: number
  readonly drawingBuffer: readonly [number, number]
  readonly geometries: number
  /** Every light in the scene, and the map size of each one that casts. */
  readonly lights: readonly { readonly castShadow: boolean; readonly mapSize: readonly [number, number] | null; readonly type: string }[]
  readonly programs: number
  readonly shadowAutoUpdate: boolean
  readonly shadowNeedsUpdate: boolean
  readonly textures: number
  readonly triangles: number
}

/** One row per group of identical draws — what the renderer is actually spending calls on. */
export type CensusRow = {
  /** How many of these are `visible` and would be submitted. */
  readonly drawn: number
  readonly geometry: string
  readonly material: string
  /** `instanced` collapses to ONE call however many instances it holds. */
  readonly kind: string
  readonly name: string
  readonly total: number
  readonly triangles: number
}

export type FrameProbeApi = {
  /**
   * The live scene graph, for checks a frame-time number cannot make. r3f's
   * private `canvas.__r3f` returns nothing in this version — measured, and the
   * reason this component exists: without a published handle, "where did that
   * body actually end up" has nowhere to look, and a placement regression is
   * caught only by a human noticing it.
   */
  scene: () => import('three').Scene
  /**
   * Names the draw calls. `info().calls` says a frame cost 195 of them; this says
   * which objects they were, so the fix is a decision instead of a guess.
   */
  census: () => readonly CensusRow[]
  info: () => FrameProbeInfo
  mark: (segment: string) => void
  /**
   * DEV-only resolution override — the cheapest CPU/GPU bisection there is.
   *
   * Draw calls, matrix updates and React work do not care how many pixels the
   * frame has; shading, post and overdraw care about almost nothing else. So if
   * halving the pixel ratio barely moves the frame time, the frame is CPU-bound
   * and the 325 draw calls are the thing to fix; if it drops sharply, the cost is
   * in the shaders and the post chain and cutting draw calls would buy nothing.
   * Guessing between those two is how a week gets spent on the wrong half.
   */
  setPixelRatio: (ratio: number) => void
  recording: () => boolean
  start: (segment?: string) => void
  stop: () => readonly FrameSample[]
}

declare global {
  interface Window {
    __frameProbe?: FrameProbeApi
  }
}

export function FrameProbe() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const viewport = useThree((state) => state.viewport)
  const samples = useRef<FrameSample[]>([])
  const recording = useRef(false)
  const segment = useRef('default')
  const frameStart = useRef(0)

  // eslint-disable-next-line react-hooks/immutability -- the probe owns renderer bookkeeping (info.autoReset) for the length of a recording and restores it on cleanup.
  useEffect(() => {
    if (!import.meta.env.DEV) return

    const previousAutoReset = gl.info.autoReset
    // eslint-disable-next-line react-hooks/immutability -- the probe owns render-info resetting for the length of a recording and restores it on cleanup.
    gl.info.autoReset = false

    // One query in flight at a time. The extension allows several; a queue of
    // them is a queue of objects to manage for a number only read in aggregate.
    const context = gl.getContext() as WebGL2RenderingContext
    const timer = (context.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null) as
      { readonly GPU_DISJOINT_EXT: number; readonly TIME_ELAPSED_EXT: number } | null
    let pending: WebGLQuery | null = null
    let queryActive = false
    let lastGpuMs: number | null = null

    const readGpu = () => {
      if (!timer || !pending) return
      const available = context.getQueryParameter(pending, context.QUERY_RESULT_AVAILABLE)
      const disjoint = context.getParameter(timer.GPU_DISJOINT_EXT)
      // A disjoint means the GPU was interrupted and the number is meaningless.
      // Thrown away rather than recorded — that is what the flag is for.
      if (available && !disjoint) lastGpuMs = context.getQueryParameter(pending, context.QUERY_RESULT) / 1e6
      if (available || disjoint) { context.deleteQuery(pending); pending = null }
    }

    const unsubscribeBefore = addEffect(() => {
      gl.info.reset()
      readGpu()
      if (timer && recording.current && !pending) {
        pending = context.createQuery()
        if (pending) {
          context.beginQuery(timer.TIME_ELAPSED_EXT, pending)
          queryActive = true
        }
      }
    })

    /*
     * Delta and counts now describe THE SAME FRAME, and that took a correction.
     *
     * The first version timed start-to-start in `addEffect` and paired the result
     * with the counts read after the following render — so every row was "the
     * previous frame's duration beside this frame's draw calls". The whole point
     * of recording both columns is to tell a spike caused by content arriving
     * (calls jump on the slow frame) from a spike with no content change; off by
     * one, the two columns point at neighbouring frames and the comparison says
     * the opposite of what it claims. Measured end-to-end here instead: the
     * interval that ENDS with this frame's render, next to what that render did.
     */
    const unsubscribeAfter = addAfterEffect(() => {
      const now = performance.now()
      const previous = frameStart.current
      frameStart.current = now
      if (timer && queryActive) {
        context.endQuery(timer.TIME_ELAPSED_EXT)
        queryActive = false
      }
      if (!recording.current) return
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      samples.current.push({
        calls: gl.info.render.calls,
        delta: previous === 0 ? 0 : now - previous,
        geometries: gl.info.memory.geometries,
        gpu: lastGpuMs,
        heap: memory ? memory.usedJSHeapSize : null,
        programs: gl.info.programs?.length ?? 0,
        segment: segment.current,
        textures: gl.info.memory.textures,
        triangles: gl.info.render.triangles,
      })
    })

    window.__frameProbe = {
      census: () => {
        const rows = new Map<string, { drawn: number; geometry: string; material: string; kind: string; name: string; total: number; triangles: number }>()
        scene.traverse((object) => {
          const mesh = object as unknown as {
            count?: number
            geometry?: { index?: { count: number } | null; attributes?: { position?: { count: number } }; type: string }
            isInstancedMesh?: boolean
            isLine?: boolean
            isMesh?: boolean
            isPoints?: boolean
            isSkinnedMesh?: boolean
            material?: { type: string } | { type: string }[]
            name: string
            type: string
            visible: boolean
          }
          if (!mesh.isMesh && !mesh.isPoints && !mesh.isLine) return
          // `visible` is false all the way up the chain for a hidden subtree, so
          // ask the ancestors too — a pooled effect parked under an invisible
          // group costs nothing and must not be counted as if it did.
          let visible = mesh.visible
          let parent = (object as unknown as { parent: { visible: boolean; parent: unknown } | null }).parent
          while (visible && parent) { visible = parent.visible; parent = parent.parent as typeof parent }

          const geometry = mesh.geometry
          const vertices = geometry?.index?.count ?? geometry?.attributes?.position?.count ?? 0
          const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
          const kind = mesh.isInstancedMesh ? `instanced x${mesh.count ?? 0}` : mesh.isSkinnedMesh ? 'skinned' : mesh.type
          // A mesh with N materials is N draw calls, not one — that is exactly the
          // arithmetic a raw object count hides.
          const key = `${mesh.name}|${kind}|${geometry?.type}|${materials.map((m) => m.type).join('+')}`
          const row = rows.get(key) ?? {
            drawn: 0,
            geometry: geometry?.type ?? 'none',
            kind,
            material: materials.map((m) => m.type).join('+') || 'none',
            name: mesh.name || '(unnamed)',
            total: 0,
            triangles: 0,
          }
          const groups = Math.max(1, materials.length)
          row.total += groups
          if (visible) {
            row.drawn += groups
            row.triangles += Math.round(vertices / 3) * (mesh.isInstancedMesh ? (mesh.count ?? 1) : 1)
          }
          rows.set(key, row)
        })
        return [...rows.values()].sort((a, b) => b.drawn - a.drawn)
      },
      info: () => {
        const lights: { castShadow: boolean; mapSize: readonly [number, number] | null; type: string }[] = []
        scene.traverse((object) => {
          const light = object as unknown as {
            castShadow?: boolean
            isLight?: boolean
            shadow?: { mapSize: { x: number; y: number } }
            type: string
          }
          if (!light.isLight) return
          lights.push({
            castShadow: Boolean(light.castShadow),
            mapSize: light.shadow ? [light.shadow.mapSize.x, light.shadow.mapSize.y] : null,
            type: light.type,
          })
        })
        return {
          calls: gl.info.render.calls,
          dpr: viewport.dpr,
          drawingBuffer: [gl.domElement.width, gl.domElement.height] as const,
          geometries: gl.info.memory.geometries,
          lights,
          programs: gl.info.programs?.length ?? 0,
          shadowAutoUpdate: gl.shadowMap.autoUpdate,
          shadowNeedsUpdate: gl.shadowMap.needsUpdate,
          textures: gl.info.memory.textures,
          triangles: gl.info.render.triangles,
        }
      },
      mark: (next) => { segment.current = next },
      scene: () => scene,
      setPixelRatio: (ratio) => { gl.setPixelRatio(ratio) },
      recording: () => recording.current,
      start: (next = 'default') => { segment.current = next; samples.current = []; recording.current = true },
      stop: () => { recording.current = false; return samples.current },
    }

    return () => {
      unsubscribeBefore()
      unsubscribeAfter()
      if (timer && queryActive) context.endQuery(timer.TIME_ELAPSED_EXT)
      if (pending) context.deleteQuery(pending)
      gl.info.autoReset = previousAutoReset
      delete window.__frameProbe
    }
  }, [gl, scene, viewport])

  return null
}
