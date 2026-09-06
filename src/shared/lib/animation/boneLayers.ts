import type { AnimationClip, KeyframeTrack } from 'three'

/**
 * Splitting a take into BONE LAYERS: the cut is at the PELVIS, and two layers
 * whose tracks address disjoint bones both play at full weight.
 *
 * What that buys and what it costs: `docs/ragdoll-and-animation.md` §4.
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
 * Both spellings on purpose: three's glTF loader strips the colon out of
 * `mixamorig:LeftUpLeg`, an FBX keeps it, and matching one spelling produces an
 * EMPTY layer — a clip with no tracks, which plays perfectly and animates nothing.
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

/**
 * One layer of a take, as a new clip. The source is never touched — it belongs to
 * the asset cache and is shared by every body on screen.
 *
 * `bones` narrows the take further, to a few bones INSIDE the layer. A whole
 * layer is the right cut for locomotion; it is the wrong cut for a take that only
 * reacts, because a recoil plays over a body that is already running and already
 * aiming, and keying the rest of the upper body freezes it into one frame of the
 * run for the duration of the shot — on screen, the creature RAISES its arm to
 * fire something it was already pointing at.
 *
 * The filter lives here rather than in the asset because FBX export bakes every
 * bone whatever the source action keyed: the authored intent does not survive the
 * file, so it has to be restated where the clip is built.
 */
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
