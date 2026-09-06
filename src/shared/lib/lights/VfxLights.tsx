import { useFrame, useThree, type ThreeElements } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'

import { assignVfxLightSlots, type VfxLightSample } from './vfxLightRanking'

/**
 * Dynamic lights for VFX, without the shader recompile.
 *
 * A three.js material is compiled against the NUMBER of lights in the scene: the
 * count is part of the program's cache key and the light loop is unrolled to it.
 * Mounting one `<pointLight>` therefore does not add a light — it invalidates
 * every program in the scene and recompiles every material, on the main thread,
 * mid-frame. Every flash, rocket, spark and gib did that twice, once appearing
 * and once going away; lights inside a `visible={false}` group are not in the
 * count either, so the recompile fired on the trigger pull.
 *
 * So the count never changes. `<VfxLightPool>` mounts a fixed set of real
 * `PointLight`s once, at scene load, and they stay at intensity 0 forever.
 * `<VfxLight>` is not a light: it is an empty marking a place in the graph with
 * the colour and brightness something WANTS there. Once a frame the pool ranks
 * the markers (`vfxLightRanking.ts`) and points its lamps at the winners —
 * position, colour, intensity, distance and decay are plain uniforms, which cost
 * nothing to write and compile nothing.
 *
 * `priority` is the one prop `pointLight` lacks: raise it for a light the shot is
 * made of, so it cannot lose its lamp on a busy frame. The rig cannot cast
 * shadows — a shadowing light is another define and another sampler, which is the
 * same recompile by another name.
 */

/**
 * Lamps in the pool, and the whole cost model of the rig: every material in the
 * scene runs this many point-light iterations per fragment forever, lit or not.
 * Eight is a Quake-ish budget — a muzzle flash, two rockets and their impacts.
 * Raise it for a scene that needs more concurrent lights, not because one light
 * was dropped once.
 */
export const VFX_LIGHT_POOL_SIZE = 8

export interface VfxLightRequest {
  readonly color: THREE.Color
  decay: number
  distance: number
  readonly id: number
  intensity: number
  /** The empty in the scene graph whose world position this light sits at. */
  object: THREE.Object3D | null
  priority: number
}

interface VfxLightRegistry {
  /**
   * Which mounted pool drives the lamps this frame. Two pools in one scene is not
   * a mistake — a lab mounts the game's scene, which brings its own — so the
   * second is a no-op: the lamps belong to the registry and one mount owns them.
   */
  driver: symbol | null
  /** The scene's lamps, created by the first pool mounted and shared by all. */
  lamps: THREE.PointLight[]
  /** Mounted pools, so the last one out disposes the lamps. */
  mounts: number
  readonly requests: Set<VfxLightRequest>
}

/**
 * Registries are per-SCENE, not global: a lab and the game can be mounted in the
 * same tab, and a global one would have a pool chasing markers in the other
 * scene's graph. Both components find theirs from the r3f store they are in.
 */
const registries = new WeakMap<THREE.Object3D, VfxLightRegistry>()

/**
 * The scene a mounted object really belongs to, by walking the graph — NOT
 * `useThree(state => state.scene)`. r3f's `createPortal` injects a store whose
 * `scene` is the PORTAL TARGET, so a light portalled into another node reports
 * the wrong scene and follows an object nobody can see.
 */
function sceneOf(object: THREE.Object3D): THREE.Object3D {
  let node = object
  while (node.parent) node = node.parent
  return node
}

function vfxLightRegistry(scene: THREE.Object3D): VfxLightRegistry {
  const existing = registries.get(scene)
  if (existing) return existing
  const created: VfxLightRegistry = { driver: null, lamps: [], mounts: 0, requests: new Set() }
  registries.set(scene, created)
  return created
}

let nextVfxLightId = 1

/** `PointLight` props, on an object that is not a light. */
export type VfxLightProps = Omit<ThreeElements['object3D'], 'ref'> & {
  readonly color?: THREE.ColorRepresentation
  readonly decay?: number
  /** Falloff radius in metres. 0 is three's "reaches forever". */
  readonly distance?: number
  readonly intensity?: number
  /**
   * Higher wins a lamp outright, whatever the ranking says. Reserve it for a
   * light the effect is made of — a muzzle flash without its light is a bug.
   */
  readonly priority?: number
  /**
   * Receives the mutable registration record, for an effect whose light has to
   * CHANGE within a shot.
   *
   * `intensity` as a prop is a React value: driving a decay through it would be
   * one re-render per frame. The record the frame loop actually reads is
   * mutable, so an effect can write `request.intensity` directly and the pool
   * picks it up on its next pass. A muzzle flash needs exactly this — its light
   * is at full brightness on the first frame and dark 100 ms later, and a light
   * that steps from on to off instead reads as a lamp being switched.
   */
  readonly requestRef?: MutableRefObject<VfxLightRequest | null>
}

/**
 * A light in the scene graph that costs no shader compile.
 *
 * Drop-in for `<pointLight>`: it renders an empty, so it sits where you put it,
 * moves with its parent, and goes dark under a `visible={false}` ancestor. What
 * it does NOT do is exist as a light, which is why mounting a hundred of them
 * mid-fight changes nothing about the scene's shaders.
 */
export function VfxLight({
  color = '#ffffff',
  decay = 2,
  distance = 0,
  intensity = 1,
  priority = 0,
  requestRef,
  ...markerProps
}: VfxLightProps) {
  const scene = useThree((state) => state.scene)
  const marker = useRef<THREE.Object3D>(null)
  // The registration, held in a ref rather than a memo: it is a mutable record
  // the frame loop reads, and a memo is a value React may hand back a copy of.
  // It is created ONCE per mount, so the light keeps its id — and with it the
  // incumbency the ranking's hysteresis is measured on — across every re-render
  // its props go through.
  const registered = useRef<VfxLightRequest | null>(null)

  useEffect(() => {
    const object = marker.current
    if (!object) return
    const registry = vfxLightRegistry(sceneOf(object))
    const request: VfxLightRequest = {
      color: new THREE.Color(color),
      decay,
      distance,
      id: nextVfxLightId++,
      intensity,
      object,
      priority,
    }
    registered.current = request
    if (requestRef) requestRef.current = request
    registry.requests.add(request)
    if (import.meta.env.DEV) {
      // Deferred: React runs a child's effects BEFORE its parent's, so a pool
      // mounted at the scene root has not registered yet at this point, and
      // checking now would warn about every correctly wired scene there is.
      queueMicrotask(() => {
        if (registry.mounts > 0 || !registry.requests.has(request)) return
        console.warn(
          '[VfxLight] no <VfxLightPool /> in this scene — VFX lights will not light anything.',
        )
      })
    }
    return () => {
      registered.current = null
      if (requestRef) requestRef.current = null
      registry.requests.delete(request)
    }
    // Deliberately mount-only. The props are pushed into the record by the
    // effect below; re-running this one would hand the light a NEW id every
    // time a VFX changed its intensity, and an id that changes is an incumbency
    // that never holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useEffect(() => {
    const request = registered.current
    if (!request) return
    request.color.set(color)
    request.decay = decay
    request.distance = distance
    request.intensity = intensity
    request.priority = priority
  }, [color, decay, distance, intensity, priority])

  return <object3D ref={marker} {...markerProps} />
}

const WORLD_POSITION = new THREE.Vector3()
const VIEWPOINT = new THREE.Vector3()

/** An ancestor turned off turns the light off — the way a real light behaves. */
function isEffectivelyVisible(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false
  }
  return true
}

export type VfxLightPoolProps = {
  /** Lamps to keep in the scene. See `VFX_LIGHT_POOL_SIZE`. */
  readonly count?: number
}

/**
 * The scene's permanent lamps. Mount it at the scene root, next to the sun.
 *
 * Mounting it is what fixes the freeze: the lamps exist before the first frame,
 * so every material in the scene compiles once, against a light count that will
 * never move again.
 *
 * Mounting it TWICE is harmless — a lab that puts the game's scene on the shared
 * lab stage gets two, and neither of them is the wrong one. The lamps belong to
 * the scene, the first mount creates them at its `count`, and the rest sit out
 * until they are the only one left.
 */
export function VfxLightPool({ count = VFX_LIGHT_POOL_SIZE }: VfxLightPoolProps) {
  const scene = useThree((state) => state.scene)
  const assignment = useRef<Map<number, number>>(new Map())
  /** This mount's claim on the lamps — see `VfxLightRegistry.driver`. */
  const token = useMemo(() => Symbol('vfx-light-pool'), [])
  // The frame's candidates, in two arrays that stay index-aligned: the ranking
  // is pure and takes numbers only, so the request each number came from has to
  // ride alongside it. Both are reused every frame — this runs 60 times a
  // second and has no business allocating.
  const wanted = useRef<VfxLightSample[]>([])
  const wantedBy = useRef<VfxLightRequest[]>([])

  useEffect(() => {
    const registry = vfxLightRegistry(scene)
    registry.mounts += 1
    if (registry.lamps.length === 0) {
      registry.lamps = Array.from({ length: count }, () => {
        const lamp = new THREE.PointLight(0xffffff, 0, 0, 2)
        // Never toggled, never shadowed: `visible = false` takes a light out of
        // three's count exactly as unmounting it does, and `castShadow` is a
        // shader define. Either one would put the recompile straight back.
        lamp.visible = true
        lamp.castShadow = false
        // Added to the SCENE, not rendered as a child of this component: the
        // pool writes world positions, and a lamp parented under a group that
        // moves would have that transform applied to it a second time.
        scene.add(lamp)
        return lamp
      })
    }
    return () => {
      registry.mounts -= 1
      if (registry.driver === token) registry.driver = null
      if (registry.mounts > 0) return
      for (const lamp of registry.lamps) {
        scene.remove(lamp)
        lamp.dispose()
      }
      registry.lamps = []
    }
  }, [count, scene, token])

  useFrame((state) => {
    const registry = vfxLightRegistry(scene)
    // Claimed in the frame callback rather than on mount, so that when the pool
    // holding the lamps unmounts, whichever one is left picks them up on the
    // very next frame instead of leaving the scene unlit.
    if (registry.driver === null) registry.driver = token
    if (registry.driver !== token) return
    const lamps = registry.lamps
    const samples = wanted.current
    const owners = wantedBy.current
    samples.length = 0
    owners.length = 0

    for (const request of registry.requests) {
      const object = request.object
      if (!object || request.intensity <= 0 || !isEffectivelyVisible(object)) continue
      // r3f updates world matrices as part of the render, so inside a frame
      // callback they are one frame stale — which for a light spawned this
      // frame means the origin of the world. Walking this one branch is a
      // handful of matrix multiplies, and it puts the flash on the muzzle.
      object.updateWorldMatrix(true, false)
      object.getWorldPosition(WORLD_POSITION)
      samples.push({
        distance: request.distance,
        id: request.id,
        intensity: request.intensity,
        priority: request.priority,
        x: WORLD_POSITION.x,
        y: WORLD_POSITION.y,
        z: WORLD_POSITION.z,
      })
      owners.push(request)
    }

    state.camera.getWorldPosition(VIEWPOINT)
    const next = assignVfxLightSlots(samples, VIEWPOINT, lamps.length, assignment.current)
    assignment.current = next

    // Every lamp goes dark first, so a light that lost its slot — or whose VFX
    // unmounted between frames — cannot leave its colour burning in the arena.
    for (const lamp of lamps) lamp.intensity = 0
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]
      const slot = next.get(sample.id)
      if (slot === undefined) continue
      const request = owners[index]
      const lamp = lamps[slot]
      lamp.color.copy(request.color)
      lamp.decay = request.decay
      lamp.distance = request.distance
      lamp.intensity = request.intensity
      lamp.position.set(sample.x, sample.y, sample.z)
    }
  })

  return null
}
