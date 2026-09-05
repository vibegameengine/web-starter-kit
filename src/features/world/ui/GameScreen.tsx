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
  // Resolved unconditionally — a hook cannot be skipped — but only handed over in
  // Hrefs are computed unconditionally (hooks), but only handed over when the
  // build actually routes them. Same flag as the router, read the same raw way —
  // a link to a route this build does not contain is worse than no link.
  const labsHref = useHref('/labs')
  /* eslint-disable no-restricted-syntax -- four latches, not readings. Each one
     is written by a click or by a clip ending, and between them they decide
     WHICH animation the character plays; that decision has to reach the tree. A
     clip's progress never touches them. */
  const [isDancing, setIsDancing] = useState(false)
  const [isGreetingRequested, setIsGreetingRequested] = useState(false)
  const [greetingAnimationFinished, setGreetingAnimationFinished] = useState(false)
  const [greetingVoiceFinished, setGreetingVoiceFinished] = useState(false)
  /* eslint-enable no-restricted-syntax */
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
      labsHref={__SHOWCASE_SURFACES__ ? labsHref : undefined}
      onDanceToggle={toggleDance}
      sourceLink={DEMO_SCENE_SOURCE_LINK}
      uiKitHref={__SHOWCASE_SURFACES__ ? uiKitGalleryHref : undefined}
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
