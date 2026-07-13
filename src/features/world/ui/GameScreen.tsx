import { Howl } from 'howler'
import { useEffect, useMemo, useState } from 'react'

import { GameCanvas } from '../../../scenes/demo-scene/GameCanvas'
import { getChannelGain, warmSoundMixer } from '../../../shared/lib/audio/soundMixer'
import { DemoSceneHud, type DemoSceneHudLabels, type DemoSceneHudSourceLink } from '../../ui-kit'
import danceMusicUrl from './GameScreen/assets/audio/city-loop.mp3'

const DEMO_SCENE_HUD_LABELS: DemoSceneHudLabels = {
  badge: '3D Starter — drag to orbit',
  performanceHint: 'Press P for perf monitor',
  startDanceAriaLabel: 'Start Macarena dance',
  startDanceLabel: 'Dance',
  stopDanceAriaLabel: 'Stop Macarena dance',
  stopDanceLabel: 'Stop dance',
}

const DEMO_SCENE_SOURCE_LINK: DemoSceneHudSourceLink = {
  href: 'https://github.com/vibegameengine/web-starter-kit',
  label: 'Fork me on GitHub',
}

/** Main 3D surface and its scaled game UI. */
export function GameScreen() {
  const [isDancing, setIsDancing] = useState(false)
  const danceMusic = useMemo(() => new Howl({ loop: true, src: [danceMusicUrl], volume: 0 }), [])

  const toggleDance = () => {
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
    >
      <GameCanvas isDancing={isDancing} />
    </DemoSceneHud>
  )
}
