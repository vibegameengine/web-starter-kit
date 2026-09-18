export type Gait = 'run' | 'walk'

export type GaitChoiceInput = {
  readonly hysteresis: number
  readonly previous: Gait
  readonly runSpeed: number
  readonly speed: number
  readonly walkSpeed: number
}

export const DEFAULT_GAIT_HYSTERESIS = 0.18

/* @important The gait is chosen by the speed the body actually carries, not by
   what the pose search likes: at 2.65 m/s the search still answered the walk
   clip, whose own travel is 1.633, and the stride warp stretched to 1.27 to
   cover the difference. GASP reaches the same answer through its chooser table,
   which picks the database before any pose is compared. The band around the
   crossover keeps the choice from flapping while the body hovers there. */
export function chooseGait({ hysteresis, previous, runSpeed, speed, walkSpeed }: GaitChoiceInput): Gait {
  const crossover = (walkSpeed + runSpeed) / 2
  if (speed > crossover + hysteresis) return 'run'
  if (speed < crossover - hysteresis) return 'walk'
  return previous
}
