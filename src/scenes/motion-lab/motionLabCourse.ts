import type { SolidBox, Vector3Tuple } from '../../features/motion/systems/boxTrace'

export const MOTION_LAB_FLOOR: SolidBox = { center: [0, -1, 0], halfExtents: [40, 1, 40] }

export const MOTION_LAB_STEP_HEIGHTS = [0.15, 0.3, 0.45, 0.6] as const

export const MOTION_LAB_STEP_X = [-7, -3.5, 0, 3.5] as const

const isolatedStep = (x: number, height: number): SolidBox => ({
  center: [x, height / 2, 1.2],
  halfExtents: [1.2, height / 2, 1.2],
})

export const MOTION_LAB_STEPS: readonly SolidBox[] = MOTION_LAB_STEP_HEIGHTS.map(
  (height, index) => isolatedStep(MOTION_LAB_STEP_X[index], height),
)

export const MOTION_LAB_STAIRCASE: readonly SolidBox[] = [0.15, 0.3, 0.45, 0.6].map((top, index) => ({
  center: [8.5, top / 2, 0.6 + index * 1.2],
  halfExtents: [1.2, top / 2, 0.6],
}))

export const MOTION_LAB_WALLS: readonly SolidBox[] = [
  { center: [-11.5, 1.2, 1.5], halfExtents: [0.25, 1.2, 4.5] },
  { center: [-8.5, 1.2, 5.75], halfExtents: [3.25, 1.2, 0.25] },
]

export const MOTION_LAB_LEDGE: SolidBox = { center: [3.5, 0.2, -5], halfExtents: [2, 0.2, 2] }

export const MOTION_LAB_JUMP_BLOCK: SolidBox = { center: [-3.5, 0.5, -5], halfExtents: [1.5, 0.5, 1.5] }

export const MOTION_LAB_SOLIDS: readonly SolidBox[] = [
  MOTION_LAB_FLOOR,
  ...MOTION_LAB_STEPS,
  ...MOTION_LAB_STAIRCASE,
  ...MOTION_LAB_WALLS,
  MOTION_LAB_LEDGE,
  MOTION_LAB_JUMP_BLOCK,
]

export const MOTION_LAB_BLOCKS: readonly SolidBox[] = [
  ...MOTION_LAB_STEPS,
  ...MOTION_LAB_STAIRCASE,
  ...MOTION_LAB_WALLS,
  MOTION_LAB_LEDGE,
  MOTION_LAB_JUMP_BLOCK,
]

export type MotionLabStation = {
  readonly id: string
  readonly label: string
  readonly position: Vector3Tuple
}

export const MOTION_LAB_STATIONS: readonly MotionLabStation[] = [
  { id: 'step-015', label: 'Step 0.15', position: [MOTION_LAB_STEP_X[0], 0.9, -1.2] },
  { id: 'step-030', label: 'Step 0.30', position: [MOTION_LAB_STEP_X[1], 0.9, -1.2] },
  { id: 'step-045', label: 'Step 0.45', position: [MOTION_LAB_STEP_X[2], 0.9, -1.2] },
  { id: 'step-060', label: 'Step 0.60', position: [MOTION_LAB_STEP_X[3], 0.9, -1.2] },
  { id: 'staircase', label: 'Staircase', position: [8.5, 0.9, -1.6] },
  { id: 'wall', label: 'Wall', position: [-10.5, 0.9, -1.5] },
  { id: 'corner', label: 'Corner', position: [-10.5, 0.9, 4.2] },
  { id: 'ledge', label: 'Ledge', position: [3.5, 0.9, -8.5] },
  { id: 'jump-block', label: 'Jump block', position: [-3.5, 0.9, -8.5] },
]

export const MOTION_LAB_START: Vector3Tuple = [0, 0.9, -4]

export const MOTION_LAB_WARP_EVENT = 'motion-lab-warp'
