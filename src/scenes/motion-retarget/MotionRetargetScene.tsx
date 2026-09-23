/* eslint-disable react-hooks/immutability -- the two mixers and the playhead
   are advanced every frame, which is what three expects of them. */
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AnimationMixer, Vector3 } from 'three'
import type { AnimationClip, Object3D } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

import libraryUrl from '../../features/motion/assets/library/UAL1_Standard.glb'
import { LOCOMOTION_CLIP_SOURCES } from '../../features/motion/catalog/locomotionClips'
import { RETARGETED_CLIP_SOURCES, type RetargetedClipId } from '../../features/motion/catalog/retargetedClips'
import { useMannequinRig } from '../../features/motion/components/useMannequinRig'
import { hipsRestHeight, scaleClipPositions, unitScaleFor } from '../../features/motion/systems/clipScale'
import { UE5_TO_MIXAMO } from '../../shared/lib/animation/retarget'
import { LabStage } from '../lab-stage/LabStage'
import { MOTION_RETARGET_STEP_EVENT, RETARGET_STEP_SECONDS, type RetargetStore } from './retargetReadout'

const SOURCE_X = -0.6
const TARGET_X = 0.6
const PUBLISH_SECONDS = 0.1

const LIMBS: readonly (readonly [string, string])[] = [
  ['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r'],
  ['thigh_l', 'calf_l'], ['calf_l', 'foot_l'], ['thigh_r', 'calf_r'], ['calf_r', 'foot_r'],
  ['foot_l', 'ball_l'], ['foot_r', 'ball_r'],
]

export type MotionRetargetSceneProps = {
  readonly clipId: RetargetedClipId
  readonly playing: boolean
  readonly readout: RetargetStore
}

type Figure = {
  readonly mixer: AnimationMixer
  readonly root: Object3D
}

function nodeWhere(root: Object3D, test: (name: string) => boolean): Object3D | null {
  let found: Object3D | null = null
  root.traverse((node) => {
    if (!found && test(node.name)) found = node
  })
  return found
}

function targetName(source: string): string {
  return UE5_TO_MIXAMO.find((bone) => bone.source === source)?.target ?? source
}

function useSourceFigure(clipName: string): { figure: Figure; clip: AnimationClip } {
  const gltf = useGLTF(libraryUrl)
  return useMemo(() => {
    const root = cloneSkinned(gltf.scene)
    root.position.x = SOURCE_X
    const clip = gltf.animations.find((candidate) => candidate.name === clipName)
    if (!clip) throw new Error(`the library has no clip named ${clipName}`)
    const mixer = new AnimationMixer(root)
    mixer.clipAction(clip).play()
    return { clip, figure: { mixer, root } }
  }, [clipName, gltf])
}

function useTargetFigure(clipId: RetargetedClipId): Figure {
  const rig = useMannequinRig(0)
  const retargeted = useGLTF(RETARGETED_CLIP_SOURCES[clipId].url) as unknown as { animations: AnimationClip[] }
  const idle = useGLTF(LOCOMOTION_CLIP_SOURCES.idle.url) as unknown as { animations: AnimationClip[] }
  return useMemo(() => {
    rig.position.x = TARGET_X
    const clip = scaleClipPositions(retargeted.animations[0].clone(), unitScaleFor(idle.animations[0], hipsRestHeight(rig)))
    const mixer = new AnimationMixer(rig)
    mixer.clipAction(clip).play()
    return { mixer, root: rig }
  }, [idle, retargeted, rig])
}

type Pair = { readonly label: string; readonly source: readonly [Object3D, Object3D]; readonly target: readonly [Object3D, Object3D] }

function limbPairs(source: Object3D, target: Object3D): Pair[] {
  const pairs: Pair[] = []
  for (const [from, to] of LIMBS) {
    const sourceFrom = nodeWhere(source, (name) => name === from)
    const sourceTo = nodeWhere(source, (name) => name === to)
    const targetFrom = nodeWhere(target, (name) => name.endsWith(targetName(from)))
    const targetTo = nodeWhere(target, (name) => name.endsWith(targetName(to)))
    if (sourceFrom && sourceTo && targetFrom && targetTo) {
      pairs.push({ label: `${from}>${to}`, source: [sourceFrom, sourceTo], target: [targetFrom, targetTo] })
    }
  }
  return pairs
}

const scratch = { from: new Vector3(), to: new Vector3(), other: new Vector3() }

function directionOf([from, to]: readonly [Object3D, Object3D], into: Vector3): Vector3 {
  from.getWorldPosition(scratch.from)
  return to.getWorldPosition(into).sub(scratch.from).normalize()
}

function worstLimb(pairs: readonly Pair[]): { degrees: number; label: string } {
  let worst = { degrees: 0, label: '-' }
  for (const pair of pairs) {
    const degrees = (directionOf(pair.source, scratch.to).angleTo(directionOf(pair.target, scratch.other)) * 180) / Math.PI
    if (degrees > worst.degrees) worst = { degrees, label: pair.label }
  }
  return worst
}

function pelvisHeight(root: Object3D, test: (name: string) => boolean): number {
  const pelvis = nodeWhere(root, test)
  return pelvis ? pelvis.getWorldPosition(scratch.from).y : 0
}

function RetargetSubjects({ clipId, playing, readout }: MotionRetargetSceneProps) {
  const { clip, figure: source } = useSourceFigure(RETARGETED_CLIP_SOURCES[clipId].libraryClip)
  const target = useTargetFigure(clipId)
  const pairs = useMemo(() => limbPairs(source.root, target.root), [source, target])
  const time = useRef(0)
  const sincePublish = useRef(PUBLISH_SECONDS)

  useEffect(() => () => {
    source.mixer.stopAllAction()
    target.mixer.stopAllAction()
  }, [source, target])

  useEffect(() => {
    const onStep = (event: Event) => {
      const frames = Number((event as CustomEvent<number>).detail) || 1
      time.current = (time.current + frames * RETARGET_STEP_SECONDS + clip.duration) % clip.duration
    }
    window.addEventListener(MOTION_RETARGET_STEP_EVENT, onStep)
    return () => window.removeEventListener(MOTION_RETARGET_STEP_EVENT, onStep)
  }, [clip])

  useFrame((_, delta) => {
    if (playing) time.current = (time.current + delta) % clip.duration
    source.mixer.setTime(time.current)
    target.mixer.setTime(time.current)
    source.root.updateMatrixWorld(true)
    target.root.updateMatrixWorld(true)
    sincePublish.current += delta
    if (sincePublish.current < PUBLISH_SECONDS && playing) return
    sincePublish.current = 0
    const worst = worstLimb(pairs)
    readout.publish({
      duration: clip.duration,
      sourcePelvis: pelvisHeight(source.root, (name) => name === 'pelvis'),
      targetPelvis: pelvisHeight(target.root, (name) => /Hips$/.test(name)),
      time: time.current,
      worstLimb: worst.label,
      worstLimbDegrees: worst.degrees,
    })
  })

  return (
    <>
      <primitive object={source.root} />
      <primitive object={target.root} />
    </>
  )
}

export function MotionRetargetScene(props: MotionRetargetSceneProps) {
  return (
    <LabStage camera={{ position: [0, 1.3, 3.4] }} groundSize={16} orbit={{ maxDistance: 8, minDistance: 1, target: [0, 0.9, 0] }}>
      <RetargetSubjects {...props} />
    </LabStage>
  )
}
