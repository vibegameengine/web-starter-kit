import { useEffect, useMemo, useRef } from 'react'
import type { Group } from 'three'
import { Howl } from 'howler'

import { getChannelGain, warmSoundMixer } from '../../../../shared/lib/audio/soundMixer'
import greetingVoiceUrl from './assets/audio/hello.mp3'
import { type TanyAnimation, useTanyRig } from './useTanyRig'

export type { TanyAnimation } from './useTanyRig'

interface TanyProps {
  /** Called after the untouched Mixamo greeting clip finishes. */
  onGreetingFinished?: () => void
  /** Called after Tany's greeting voice finishes. */
  onGreetingVoiceFinished?: () => void
  /** Starts the greeting clip; the caller owns its game/UI state. */
  onGreeting?: () => void
  position?: [number, number, number]
  rotationY?: number
  scale?: number
  isDancing?: boolean
  /** Explicit debug animation; otherwise gameplay derives it from `isDancing`. */
  animation?: TanyAnimation
}

/**
 * ECS "entity": the real Tany character — a Mixamo-rigged, animated Tripo GLB.
 * Rendered with the painted runtime material. Its imported idle and untouched
 * Mixamo dance actions cross-fade according to gameplay or an explicit debug mode.
 */
export function Tany({
  onGreeting,
  onGreetingFinished,
  onGreetingVoiceFinished,
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  isDancing = false,
  animation,
}: TanyProps) {
  const group = useRef<Group>(null)
  const greetingVoiceFinishedRef = useRef(onGreetingVoiceFinished)
  const greetingVoice = useMemo(() => new Howl({ src: [greetingVoiceUrl], volume: 0 }), [])
  const activeAnimation = animation ?? (isDancing ? 'dance' : 'idle')
  const scene = useTanyRig(group, activeAnimation, onGreetingFinished)

  useEffect(() => {
    greetingVoiceFinishedRef.current = onGreetingVoiceFinished
  }, [onGreetingVoiceFinished])

  useEffect(() => {
    return () => {
      greetingVoice.unload()
    }
  }, [greetingVoice])

  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation()
        if (!onGreeting || activeAnimation === 'greeting') return
        warmSoundMixer()
        greetingVoice.stop()
        greetingVoice.once('end', () => greetingVoiceFinishedRef.current?.())
        greetingVoice.volume(0.8 * getChannelGain('sfx'))
        greetingVoice.play()
        onGreeting()
      }}
      position={position}
      rotation-y={rotationY}
      scale={scale}
    >
      <primitive object={scene} />
    </group>
  )
}
