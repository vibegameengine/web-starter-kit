export type Point = readonly [number, number, number]

/* @important Unreal's GetFootPivotAroundBallWS, as a point: the ball of the foot
   stays where it was planted, the ankle hangs off it the way the clip holds it.
   The clip's own rotation of the foot therefore survives — the heel lifts at
   toe-off because the animation lifts it — while the one point that is meant to
   be on the ground stays on the ground. */
export function pivotAroundBall(pinnedBall: Point, animatedAnkle: Point, animatedBall: Point): Point {
  return [
    pinnedBall[0] + animatedAnkle[0] - animatedBall[0],
    pinnedBall[1] + animatedAnkle[1] - animatedBall[1],
    pinnedBall[2] + animatedAnkle[2] - animatedBall[2],
  ]
}
