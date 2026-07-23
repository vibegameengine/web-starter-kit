import { Howl } from 'howler'
import { useEffect, useMemo, useState } from 'react'
import { useHref } from 'react-router-dom'

import { GameCanvas } from '../../../scenes/demo-scene/GameCanvas'
import { getChannelGain, warmSoundMixer } from '../../../shared/lib/audio/soundMixer'
import { DemoSceneHud, type DemoSceneHudLabels, type DemoSceneHudSourceLink } from '../../ui-kit'
import type { TanyAnimation } from '../../character/entities/Tany/Tany'
import danceMusicUrl from './GameScreen/assets/audio/city-loop.mp3'

const DEMO_SCENE_HUD_LABELS: DemoSceneHudLabels = {
  badge: '3D Starter — drag to orbit',
  performanceHint: 'Press P for perf monitor',
  startDanceAriaLabel: 'Start scene burst',
  startDanceLabel: 'Burst',
  stopDanceAriaLabel: 'Stop scene burst',
  stopDanceLabel: 'Stop burst',
}

const DEMO_SCENE_SOURCE_LINK: DemoSceneHudSourceLink = {
  href: 'https://github.com/vibegameengine/web-starter-kit',
  label: 'Fork me on GitHub',
}

/** Main 3D surface and its scaled game UI. */
export function GameScreen() {
  const uiKitGalleryHref = useHref('/ui-kit/starter-showcase')
  const [isDancing, setIsDancing] = useState(false)
  const [isGreetingRequested, setIsGreetingRequested] = useState(false)
  const [greetingAnimationFinished, setGreetingAnimationFinished] = useState(false)
  const [greetingVoiceFinished, setGreetingVoiceFinished] = useState(false)
  const danceMusic = useMemo(() => new Howl({ loop: true, src: [danceMusicUrl], volume: 0 }), [])
  const isGreetingPlaying = isGreetingRequested && !(greetingAnimationFinished && greetingVoiceFinished)
  const tanyAnimation: TanyAnimation = isGreetingPlaying ? 'greeting' : isDancing ? 'dance' : 'idle'

  const toggleDance = () => {
    if (isGreetingPlaying) return
    const next = !isDancing
    setIsDancing(next)
    if (next) {
      warmSoundMixer()
      danceMusic.volume(0.28 * getChannelGain('ambient'))
      if (!danceMusic.playing()) danceMusic.play()
    } else {
      danceMusic.stop()
    }
  }

  const playGreeting = () => {
    if (isGreetingPlaying) return
    setIsDancing(false)
    danceMusic.stop()
    setGreetingAnimationFinished(false)
    setGreetingVoiceFinished(false)
    setIsGreetingRequested(true)
  }

  useEffect(() => {
    return () => {
      danceMusic.unload()
    }
  }, [danceMusic])

  return (
    <DemoSceneHud
      isDancing={isDancing}
      labels={DEMO_SCENE_HUD_LABELS}
      onDanceToggle={toggleDance}
      sourceLink={DEMO_SCENE_SOURCE_LINK}
      uiKitHref={uiKitGalleryHref}
    >
      <GameCanvas
        isDancing={isDancing}
        onGreeting={playGreeting}
        onGreetingFinished={() => setGreetingAnimationFinished(true)}
        onGreetingVoiceFinished={() => setGreetingVoiceFinished(true)}
        tanyAnimation={tanyAnimation}
      />
    </DemoSceneHud>
  )
}
