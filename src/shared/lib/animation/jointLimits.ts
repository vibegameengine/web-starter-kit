const degrees = (value: number) => (value * Math.PI) / 180

export type SignedRange = readonly [number, number]

/* @important These are the ragdoll's measured limits, in one place so the
   animation side and the physics side cannot drift apart. The ranges are
   asymmetric because the real ones are: the trunk flexes about 75 degrees and
   extends about 26, the hip 110-120 against 10-15. The signs were measured
   against a collapsing body, not derived — a wrong sign puts the allowed range
   on the side the joint will not travel, which once held a knee at 0-2 degrees
   through an entire collapse. Re-measure by opening the limits and logging the
   signed angle about the axis; do not re-guess. */
export const HUMANOID_JOINT_LIMITS = {
  elbowFlexion: [0, 2.5] as SignedRange,
  hipSwing: [-degrees(75), degrees(15)] as SignedRange,
  hipSwingSide: [-degrees(15), degrees(15)] as SignedRange,
  hipTwist: degrees(35),
  kneeFlexion: [-2.5, 0] as SignedRange,
  neckSwing: degrees(35),
  neckTwist: degrees(35),
  shoulderSwing: degrees(75),
  shoulderSwingSide: degrees(60),
  shoulderTwist: degrees(45),
  spineSwing: [-degrees(70), degrees(26)] as SignedRange,
  spineSwingSide: [-degrees(30), degrees(30)] as SignedRange,
  spineTwist: degrees(35),
} as const

export const KNEE_FLEXION_RADIANS = Math.abs(HUMANOID_JOINT_LIMITS.kneeFlexion[0])

/* @important A planted foot cannot outlast the hip that holds it: once the body
   has turned further than the hip can twist, the foot has to leave the ground.
   Without this an about-face dragged a locked foot 20 cm sideways, because the
   lock is a world point and only the reach clamp objected. */
export const PLANT_RELEASE_TWIST_RADIANS = HUMANOID_JOINT_LIMITS.hipTwist
