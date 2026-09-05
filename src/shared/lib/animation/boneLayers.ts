import type { AnimationClip, KeyframeTrack } from 'three'

/**
 * Splitting a take into BONE LAYERS — the mechanism that lets one body do two
 * things at once.
 *
 * A clip animates every bone it was authored with, so two clips played together
 * fight over every bone they share and the mixer settles it by weight. Cutting
 * each clip down to the bones one layer owns removes the fight entirely: the
 * lower layer's tracks and the upper layer's tracks address disjoint sets of
 * bones, so both can play at full weight, at their own rate, at the same time.
 *
 * Two things in this project need exactly that:
 *   - **Striking while running.** The legs keep the stride while an attack takes
 *     the spine and arms, out of ONE authored run and ONE authored swing rather
 *     than a run-and-swing take per gait.
 *   - **Retiming the legs alone.** A run take played faster to keep the feet
 *     planted speeds up the whole body with it, and a body sped up wholesale
 *     reads as comedy fast-motion. Split, the stride can chase the ground speed
 *     while the torso keeps something close to its authored cadence.
 *
 * The cut is at the PELVIS. Hips and the legs below it belong to locomotion and
 * are never taken away, because a body that is running is running with its hips;
 * the spine and everything above it is what an action borrows.
 */

export type MobBoneLayer = 'lower' | 'upper'

const HIP_BONE_LEAF = /Hips$/
/**
 * `Toe_End` is in here for a reason that costs nothing now and everything later:
 * Mixamo ships leaf-end joints (`LeftToe_End`, `RightToe_End`) on most rigs, and
 * a pattern that matches `ToeBase` but not `Toe_End` hands the toe tips to the
 * UPPER layer — where an attack take would be free to write them. This rig has no
 * toe ends, so nothing moves today; the next rig would have failed silently.
 */
const LEG_BONE_LEAF = /(?:UpLeg|Leg|Foot|ToeBase|Toe_End)$/
/**
 * Both spellings on purpose. Mixamo bones are `mixamorig:LeftUpLeg`, and three's
 * glTF loader strips the colon out of every node name it binds against, so the
 * same bone reaches a clip's tracks as `mixamorigLeftUpLeg`. A rig read straight
 * from an FBX keeps the colon. Matching only one of the two silently produces an
 * EMPTY layer — a clip with no tracks, which plays perfectly and animates
 * nothing.
 */
const MIXAMO_BONE_PREFIX = /^mixamorig\d*:?/

function nodeNameFromTrack(trackName: string): string {
  const propertyStart = trackName.lastIndexOf('.')
  const target = propertyStart >= 0 ? trackName.slice(0, propertyStart) : trackName
  return target.split('/').at(-1) ?? target
}

/**
 * Which bones a creature's LOWER layer owns, when the humanoid rule does not fit.
 *
 * The rule below is a humanoid's, written against Mixamo spellings, and it is
 * right for every biped here. It is wrong for a rig this project builds itself:
 * a quadruped's bones are `legFL_upper`, `jaw`, `tail01`, with no vendor prefix
 * at all — and the prefix test alone drops EVERY track, leaving both layers
 * empty. An empty layer is not an error: the clip loads, plays, ends on time and
 * animates nothing.
 */
export type MobLowerBones = RegExp

/** Whether a track drives a bone the given layer owns. */
export function trackBelongsToLayer(
  trackName: string,
  layer: MobBoneLayer,
  lowerBones?: MobLowerBones,
): boolean {
  const boneName = nodeNameFromTrack(trackName)

  // A creature that brought its own split is judged by it alone — the Mixamo
  // rule below would answer about bones it has never heard of.
  if (lowerBones) {
    const isLower = lowerBones.test(boneName)
    return layer === 'lower' ? isLower : !isLower
  }

  if (!MIXAMO_BONE_PREFIX.test(boneName)) return false

  const isHip = HIP_BONE_LEAF.test(boneName)
  const isLeg = LEG_BONE_LEAF.test(boneName)
  if (layer === 'lower') return isHip || isLeg

  // The upper layer starts at the spine. The hips belong to locomotion alone, so
  // an action cannot twist or lift the pelvis out from under a stride.
  return !isHip && !isLeg
}

/**
 * One layer of a take, as a new clip. The source is never touched — it belongs to
 * the asset cache and is shared by every body on screen.
 */
/**
 * `bones` narrows a take to a few bones INSIDE its layer.
 *
 * A layer is the right cut for locomotion, where the whole upper body follows
 * the take. It is the wrong cut for a take that only reacts: a recoil plays
 * over a body that is already running and already aiming, so keying the rest of
 * the upper body freezes it into one frame of the run for the duration of the
 * shot. On screen that reads as the creature RAISING its arm to fire something
 * it was already pointing at.
 *
 * The filter lives here rather than in the asset because FBX export bakes every
 * bone whatever the source action keyed — the authored intent does not survive
 * the file, so it has to be restated where the clip is built.
 */
/**
 * Cached per (source clip, layer, name, bone filter).
 *
 * `source.clone()` deep-copies every track including its `times` and `values`
 * typed arrays, and then roughly half of them are thrown away by the filter
 * below. For one imp that is about 730 KB of copying and ~330 `KeyframeTrack`
 * objects, and it ran once per BODY — so a wave spawning ten of them did it ten
 * times, in one frame, for ten identical results.
 *
 * Sharing one clip between bodies is safe and is how three is meant to be used:
 * `AnimationMixer.clipAction` caches by (clip, root), so each body still gets its
 * own action and its own time. Nothing here mutates a clip after construction —
 * the one thing that touches a clip afterwards, `retimeAction`, only READS
 * `getClip().duration`. What must never be shared is a `Skeleton` or an
 * `AnimationMixer`; a clip is data.
 */
const layeredClips = new Map<string, AnimationClip>()

export function createLayeredClip(
  source: AnimationClip,
  layer: MobBoneLayer,
  name: string,
  bones?: RegExp,
  lowerBones?: MobLowerBones,
): AnimationClip {
  const key = `${source.uuid}|${layer}|${name}|${bones ? bones.source : ''}|${lowerBones ? lowerBones.source : ''}`
  const held = layeredClips.get(key)
  if (held) return held

  const layered = source.clone()
  layered.name = name
  layered.tracks = source.tracks.filter((track: KeyframeTrack) => (
    trackBelongsToLayer(track.name, layer, lowerBones)
    // Matched against the name WITHOUT its rig prefix, the same normalization
    // `trackBelongsToLayer` uses. A caller writing `/^RightArm$/` is writing the
    // bone's name as this project spells it everywhere else, and against the raw
    // `mixamorig:RightArm` such a pattern matches nothing — the clip then ships
    // EMPTY, plays perfectly and animates nothing. That is the failure this line
    // caused once already, caught only because the rig warns about empty layers.
    && (!bones || bones.test(nodeNameFromTrack(track.name).replace(MIXAMO_BONE_PREFIX, '')))
  ))
  layeredClips.set(key, layered)
  return layered
}
