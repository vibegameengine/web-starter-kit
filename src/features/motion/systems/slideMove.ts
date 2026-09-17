import type { TraceBox, Vector3Tuple } from './boxTrace'
import type { MotionProfile } from './motionProfile'
import { advanceAlong, cross, dot, normalized, offsetY, scaled, UP } from './motionVector'

export const OVERCLIP = 1.001

const MAX_CLIP_PLANES = 5
const MAX_BUMPS = 4
const PLANE_INTERACTION_EPSILON = 0.003
const REPEAT_PLANE_NUDGE = 0.03
const GROUND_PROBE_METERS = 0.02
const EMBED_ESCAPE_RADII_METERS = [0.03, 0.06, 0.12, 0.25, 0.5]

export type SlideBody = {
  readonly groundNormal: Vector3Tuple
  readonly halfExtents: Vector3Tuple
  readonly onGround: boolean
  readonly position: Vector3Tuple
  readonly velocity: Vector3Tuple
}

export type SlideContext = {
  readonly delta: number
  readonly gravity: number
  readonly profile: MotionProfile
  readonly trace: TraceBox
}

export type SlideMoveResult = SlideBody & {
  readonly clipped: boolean
  readonly steppedUp: number
}

export type GroundState = {
  readonly groundNormal: Vector3Tuple
  readonly onGround: boolean
}

export function clipVelocity(velocity: Vector3Tuple, normal: Vector3Tuple, overbounce: number): Vector3Tuple {
  const into = dot(velocity, normal)
  const backoff = into < 0 ? into * overbounce : into / overbounce
  return [
    velocity[0] - normal[0] * backoff,
    velocity[1] - normal[1] * backoff,
    velocity[2] - normal[2] * backoff,
  ]
}

export function groundStateAt(position: Vector3Tuple, body: SlideBody, context: SlideContext): GroundState {
  const probe = offsetY(position, -GROUND_PROBE_METERS)
  const hit = context.trace(position, probe, body.halfExtents)
  if (!hit.hit || hit.startSolid || hit.normal[1] < context.profile.walkableFloorNormalY) {
    return { groundNormal: UP, onGround: false }
  }
  return { groundNormal: hit.normal, onGround: true }
}

function buildEscapeOffsets(): readonly Vector3Tuple[] {
  const offsets: Vector3Tuple[] = []
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        if (x !== 0 || y !== 0 || z !== 0) offsets.push([x, y, z])
      }
    }
  }
  return offsets.sort((a, b) => Math.hypot(a[0], a[1], a[2]) - Math.hypot(b[0], b[1], b[2]))
}

const ESCAPE_OFFSETS = buildEscapeOffsets()

function freePointAtRadius(
  position: Vector3Tuple,
  halfExtents: Vector3Tuple,
  trace: TraceBox,
  radius: number,
): Vector3Tuple | null {
  for (const offset of ESCAPE_OFFSETS) {
    const candidate: Vector3Tuple = [
      position[0] + offset[0] * radius,
      position[1] + offset[1] * radius,
      position[2] + offset[2] * radius,
    ]
    if (!trace(candidate, candidate, halfExtents).startSolid) return candidate
  }
  return null
}

export function escapeEmbedding(
  position: Vector3Tuple,
  halfExtents: Vector3Tuple,
  trace: TraceBox,
): Vector3Tuple | null {
  for (const radius of EMBED_ESCAPE_RADII_METERS) {
    const freed = freePointAtRadius(position, halfExtents, trace, radius)
    if (freed) return freed
  }
  return null
}

type PlaneResolution = {
  readonly endVelocity: Vector3Tuple
  readonly stoppedDead: boolean
  readonly velocity: Vector3Tuple
}

function creaseResolution(
  planes: readonly Vector3Tuple[],
  indices: readonly [number, number],
  velocity: Vector3Tuple,
  endVelocity: Vector3Tuple,
): PlaneResolution {
  const crease = normalized(cross(planes[indices[0]], planes[indices[1]]))
  const slid = scaled(crease, dot(crease, velocity))
  const blocked = planes.some((plane, index) => (
    index !== indices[0] && index !== indices[1] && dot(slid, plane) < PLANE_INTERACTION_EPSILON
  ))
  if (blocked) return { endVelocity: [0, 0, 0], stoppedDead: true, velocity: [0, 0, 0] }
  return { endVelocity: scaled(crease, dot(crease, endVelocity)), stoppedDead: false, velocity: slid }
}

function resolveAgainstPlane(
  planes: readonly Vector3Tuple[],
  index: number,
  velocity: Vector3Tuple,
  endVelocity: Vector3Tuple,
): PlaneResolution {
  let clipped = clipVelocity(velocity, planes[index], OVERCLIP)
  let endClipped = clipVelocity(endVelocity, planes[index], OVERCLIP)

  for (let other = 0; other < planes.length; other += 1) {
    if (other === index) continue
    if (dot(clipped, planes[other]) >= PLANE_INTERACTION_EPSILON) continue

    endClipped = clipVelocity(endClipped, planes[other], OVERCLIP)
    clipped = clipVelocity(clipped, planes[other], OVERCLIP)
    if (dot(clipped, planes[index]) >= 0) continue

    return creaseResolution(planes, [index, other], velocity, endVelocity)
  }

  return { endVelocity: endClipped, stoppedDead: false, velocity: clipped }
}

function resolveBlockedVelocity(
  planes: readonly Vector3Tuple[],
  velocity: Vector3Tuple,
  endVelocity: Vector3Tuple,
): PlaneResolution {
  for (let index = 0; index < planes.length; index += 1) {
    if (dot(velocity, planes[index]) >= PLANE_INTERACTION_EPSILON) continue
    return resolveAgainstPlane(planes, index, velocity, endVelocity)
  }
  return { endVelocity, stoppedDead: false, velocity }
}

function sweptEnd(position: Vector3Tuple, velocity: Vector3Tuple, timeLeft: number): Vector3Tuple {
  return [
    position[0] + velocity[0] * timeLeft,
    position[1] + velocity[1] * timeLeft,
    position[2] + velocity[2] * timeLeft,
  ]
}

function nudgedOffPlane(velocity: Vector3Tuple, normal: Vector3Tuple): Vector3Tuple {
  return [
    velocity[0] + normal[0] * REPEAT_PLANE_NUDGE,
    velocity[1] + normal[1] * REPEAT_PLANE_NUDGE,
    velocity[2] + normal[2] * REPEAT_PLANE_NUDGE,
  ]
}

type SweepState = {
  clipped: boolean
  endVelocity: Vector3Tuple
  position: Vector3Tuple
  stoppedDead: boolean
  velocity: Vector3Tuple
}

function gravityStart(body: SlideBody, context: SlideContext): { endVelocity: Vector3Tuple; velocity: Vector3Tuple } {
  if (context.gravity <= 0) return { endVelocity: body.velocity, velocity: body.velocity }
  const endVelocity: Vector3Tuple = [
    body.velocity[0],
    body.velocity[1] - context.gravity * context.delta,
    body.velocity[2],
  ]
  const averaged: Vector3Tuple = [body.velocity[0], (body.velocity[1] + endVelocity[1]) * 0.5, body.velocity[2]]
  const velocity = body.onGround ? clipVelocity(averaged, body.groundNormal, OVERCLIP) : averaged
  return { endVelocity, velocity }
}

function sweepWithPlanes(body: SlideBody, context: SlideContext, start: SweepState): SweepState {
  const state = start
  const planes: Vector3Tuple[] = []
  if (body.onGround) planes.push(body.groundNormal)
  planes.push(normalized(state.velocity))
  let timeLeft = context.delta

  for (let bump = 0; bump < MAX_BUMPS; bump += 1) {
    const end = sweptEnd(state.position, state.velocity, timeLeft)
    const hit = context.trace(state.position, end, body.halfExtents)
    if (hit.startSolid) {
      state.velocity = [state.velocity[0], 0, state.velocity[2]]
      state.stoppedDead = true
      break
    }
    if (hit.fraction > 0) state.position = advanceAlong(state.position, end, hit.fraction)
    if (!hit.hit) break

    state.clipped = true
    timeLeft -= timeLeft * hit.fraction

    if (planes.length >= MAX_CLIP_PLANES) {
      state.velocity = [0, 0, 0]
      state.stoppedDead = true
      break
    }

    if (planes.some((plane) => dot(hit.normal, plane) > 0.99)) {
      state.velocity = nudgedOffPlane(state.velocity, hit.normal)
      continue
    }
    planes.push(hit.normal)

    const resolved = resolveBlockedVelocity(planes, state.velocity, state.endVelocity)
    state.velocity = resolved.velocity
    state.endVelocity = resolved.endVelocity
    if (resolved.stoppedDead) {
      state.stoppedDead = true
      break
    }
  }

  return state
}

export function slideMove(body: SlideBody, context: SlideContext): SlideMoveResult {
  let position = body.position
  if (context.trace(position, position, body.halfExtents).startSolid) {
    position = escapeEmbedding(position, body.halfExtents, context.trace) ?? position
  }

  const { endVelocity, velocity } = gravityStart({ ...body, position }, context)
  const swept = sweepWithPlanes({ ...body, position }, context, {
    clipped: false,
    endVelocity,
    position,
    stoppedDead: false,
    velocity,
  })

  let resolvedVelocity = context.gravity > 0 && !swept.stoppedDead ? swept.endVelocity : swept.velocity
  const ground = groundStateAt(swept.position, body, context)
  if (ground.onGround && resolvedVelocity[1] < 0) {
    resolvedVelocity = clipVelocity(resolvedVelocity, ground.groundNormal, OVERCLIP)
  }

  return {
    clipped: swept.clipped || swept.stoppedDead,
    groundNormal: ground.groundNormal,
    halfExtents: body.halfExtents,
    onGround: ground.onGround,
    position: swept.position,
    steppedUp: 0,
    velocity: resolvedVelocity,
  }
}

function snapToGround(body: SlideBody, moved: SlideMoveResult, context: SlideContext): SlideMoveResult {
  if (!body.onGround || moved.onGround || moved.velocity[1] > 0) return moved

  const settleTo = offsetY(moved.position, -context.profile.maxStepHeight)
  const hit = context.trace(moved.position, settleTo, body.halfExtents)
  if (!hit.hit || hit.startSolid || hit.normal[1] < context.profile.walkableFloorNormalY) return moved

  return {
    ...moved,
    groundNormal: hit.normal,
    onGround: true,
    position: advanceAlong(moved.position, settleTo, hit.fraction),
    velocity: [moved.velocity[0], 0, moved.velocity[2]],
  }
}

function liftedStartForStep(body: SlideBody, context: SlideContext): Vector3Tuple | null {
  const probeUp = offsetY(body.position, context.profile.maxStepHeight)
  const upTrace = context.trace(body.position, probeUp, body.halfExtents)
  if (upTrace.startSolid) return null
  const lifted = advanceAlong(body.position, probeUp, upTrace.fraction)
  return lifted[1] - body.position[1] > 0 ? lifted : null
}

function settleAfterStep(
  stepped: SlideMoveResult,
  stepSize: number,
  body: SlideBody,
  context: SlideContext,
): { position: Vector3Tuple; velocity: Vector3Tuple } {
  const settleTo = offsetY(stepped.position, -stepSize)
  const hit = context.trace(stepped.position, settleTo, body.halfExtents)
  if (hit.startSolid) return { position: stepped.position, velocity: stepped.velocity }
  return {
    position: advanceAlong(stepped.position, settleTo, hit.fraction),
    velocity: hit.hit ? clipVelocity(stepped.velocity, hit.normal, OVERCLIP) : stepped.velocity,
  }
}

function horizontalTravel(from: Vector3Tuple, to: Vector3Tuple): number {
  return Math.hypot(to[0] - from[0], to[2] - from[2])
}

function canStepUp(body: SlideBody, flat: SlideMoveResult, context: SlideContext): boolean {
  if (flat.velocity[1] <= 0) return true
  const probeDown = offsetY(body.position, -context.profile.maxStepHeight)
  const downTrace = context.trace(body.position, probeDown, body.halfExtents)
  return downTrace.hit && downTrace.normal[1] >= context.profile.walkableFloorNormalY
}

export function stepSlideMove(body: SlideBody, context: SlideContext): SlideMoveResult {
  const flat = slideMove(body, context)
  if (!flat.clipped) return snapToGround(body, flat, context)
  if (!canStepUp(body, flat, context)) return snapToGround(body, flat, context)

  const lifted = liftedStartForStep(body, context)
  if (!lifted) return snapToGround(body, flat, context)

  const stepSize = lifted[1] - body.position[1]
  const stepped = slideMove({ ...body, position: lifted }, context)
  const settled = settleAfterStep(stepped, stepSize, body, context)

  if (horizontalTravel(body.position, settled.position) <= horizontalTravel(body.position, flat.position)) {
    return snapToGround(body, flat, context)
  }

  const ground = groundStateAt(settled.position, body, context)
  return {
    clipped: true,
    groundNormal: ground.groundNormal,
    halfExtents: body.halfExtents,
    onGround: ground.onGround,
    position: settled.position,
    steppedUp: settled.position[1] - body.position[1],
    velocity: settled.velocity,
  }
}
