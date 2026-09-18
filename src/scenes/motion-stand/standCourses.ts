import type { SolidBox } from '../../features/motion/systems/boxTrace'

export type StandCourseId = 'flat' | 'ledge' | 'stairs'

export const STAIR_RISE = 0.15

export const STAIR_RUN = 0.32

export const STAIR_COUNT = 6

export const STAIR_START_Z = 0.9

const FLOOR: SolidBox = { center: [0, -1, 0], halfExtents: [40, 1, 40] }

const LEDGE: SolidBox = { center: [0.18, 0.1, 1.4], halfExtents: [0.22, 0.1, 0.7] }

/* @important A staircase with a tread the length of a stride is four platforms,
   not stairs — the lab's has 1.2 m treads, so a foot only ever meets an edge
   by accident. These are domestic proportions, 15 cm up and 32 cm deep, which
   puts a footfall on a different step almost every time and a toe or a heel
   over a nosing on most of them: the case foot placement exists for. Each step
   is a solid block from the floor up, so there is no gap under a tread for a
   probe to fall through. */
function stairs(): readonly SolidBox[] {
  const flight: SolidBox[] = []
  for (let index = 0; index < STAIR_COUNT; index += 1) {
    const top = STAIR_RISE * (index + 1)
    const nearEdge = STAIR_START_Z + STAIR_RUN * index
    const farEdge = STAIR_START_Z + STAIR_RUN * STAIR_COUNT + 1.5
    flight.push({
      center: [0, top / 2, (nearEdge + farEdge) / 2],
      halfExtents: [1, top / 2, (farEdge - nearEdge) / 2],
    })
  }
  return flight
}

export const STAND_COURSES: Readonly<Record<StandCourseId, readonly SolidBox[]>> = {
  flat: [FLOOR],
  ledge: [FLOOR, LEDGE],
  stairs: [FLOOR, ...stairs()],
}

export function surfaceHeightAt(course: readonly SolidBox[], x: number, z: number): number {
  let highest = Number.NEGATIVE_INFINITY
  for (const box of course) {
    const inside = Math.abs(x - box.center[0]) <= box.halfExtents[0] && Math.abs(z - box.center[2]) <= box.halfExtents[2]
    if (inside) highest = Math.max(highest, box.center[1] + box.halfExtents[1])
  }
  return highest
}
