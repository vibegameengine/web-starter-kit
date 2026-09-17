export type Vector3Tuple = readonly [number, number, number]

export type BoxTraceResult = {
  readonly fraction: number
  readonly hit: boolean
  readonly normal: Vector3Tuple
  readonly startSolid: boolean
}

export type TraceBox = (start: Vector3Tuple, end: Vector3Tuple, halfExtents: Vector3Tuple) => BoxTraceResult

export type SolidBox = {
  readonly center: Vector3Tuple
  readonly halfExtents: Vector3Tuple
}

const ZERO_NORMAL: Vector3Tuple = [0, 0, 0]

export const CLEAN_BOX_TRACE: BoxTraceResult = { fraction: 1, hit: false, normal: ZERO_NORMAL, startSolid: false }

export const SURFACE_CLIP_EPSILON_METERS = 0.001

const PARALLEL_EPSILON = 1e-9

const AXIS_NORMALS: readonly (readonly Vector3Tuple[])[] = [
  [[-1, 0, 0], [1, 0, 0]],
  [[0, -1, 0], [0, 1, 0]],
  [[0, 0, -1], [0, 0, 1]],
]

type SweptFace = {
  readonly axis: number
  readonly enter: number
  readonly startInside: boolean
  readonly towardStart: 0 | 1
}

function minkowskiBounds(solid: SolidBox, halfExtents: Vector3Tuple): { min: Vector3Tuple; max: Vector3Tuple } {
  const min: Vector3Tuple = [
    solid.center[0] - solid.halfExtents[0] - halfExtents[0],
    solid.center[1] - solid.halfExtents[1] - halfExtents[1],
    solid.center[2] - solid.halfExtents[2] - halfExtents[2],
  ]
  const max: Vector3Tuple = [
    solid.center[0] + solid.halfExtents[0] + halfExtents[0],
    solid.center[1] + solid.halfExtents[1] + halfExtents[1],
    solid.center[2] + solid.halfExtents[2] + halfExtents[2],
  ]
  return { min, max }
}

function sweepAgainstBounds(
  start: Vector3Tuple,
  delta: Vector3Tuple,
  min: Vector3Tuple,
  max: Vector3Tuple,
): SweptFace | null {
  let enter = Number.NEGATIVE_INFINITY
  let exit = Number.POSITIVE_INFINITY
  let enterAxis = 0
  let towardStart: 0 | 1 = 1

  for (let axis = 0; axis < 3; axis += 1) {
    const direction = delta[axis]
    if (Math.abs(direction) < PARALLEL_EPSILON) {
      if (start[axis] <= min[axis] || start[axis] >= max[axis]) return null
      continue
    }
    const inverse = 1 / direction
    const first = (min[axis] - start[axis]) * inverse
    const second = (max[axis] - start[axis]) * inverse
    const near = Math.min(first, second)
    const far = Math.max(first, second)
    if (near > enter) {
      enter = near
      enterAxis = axis
      towardStart = direction > 0 ? 0 : 1
    }
    if (far < exit) exit = far
    if (enter > exit) return null
  }

  if (exit <= 0 || enter > 1) return null
  return { axis: enterAxis, enter, startInside: enter <= 0, towardStart }
}

function faceNormal(face: SweptFace): Vector3Tuple {
  return AXIS_NORMALS[face.axis][face.towardStart]
}

function clippedFraction(enter: number, delta: Vector3Tuple): number {
  const distance = Math.hypot(delta[0], delta[1], delta[2])
  if (distance < PARALLEL_EPSILON) return 0
  return Math.max(0, enter - SURFACE_CLIP_EPSILON_METERS / distance)
}

export function createBoxWorldTrace(solids: readonly SolidBox[]): TraceBox {
  return (start, end, halfExtents) => {
    const delta: Vector3Tuple = [end[0] - start[0], end[1] - start[1], end[2] - start[2]]
    let nearest: SweptFace | null = null

    for (const solid of solids) {
      const { min, max } = minkowskiBounds(solid, halfExtents)
      const face = sweepAgainstBounds(start, delta, min, max)
      if (!face) continue
      if (face.startInside) return { fraction: 0, hit: true, normal: faceNormal(face), startSolid: true }
      if (!nearest || face.enter < nearest.enter) nearest = face
    }

    if (!nearest) return CLEAN_BOX_TRACE
    return {
      fraction: clippedFraction(nearest.enter, delta),
      hit: true,
      normal: faceNormal(nearest),
      startSolid: false,
    }
  }
}
