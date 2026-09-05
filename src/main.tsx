import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { BootstrapGate } from './features/bootstrap'
import { trimUserTimingInDev } from './shared/lib/dev/trimUserTiming'
import { initAudioSettings } from './shared/lib/audio/audioSettings'

// The browser never evicts user-timing entries and React's DEV build writes one
// per component render, so a long session ends in an out-of-memory tab.
// Installed before anything renders.
trimUserTimingInDev()

// Suppress native browser gestures that fight app/game UI (right-click menu,
// text selection drag, native image drag). Optional — remove if your app wants
// default browser behavior.
const blockedNativeInteractionEvents = ['contextmenu', 'selectstart', 'dragstart'] as const

blockedNativeInteractionEvents.forEach((eventName) => {
  document.addEventListener(
    eventName,
    (event) => {
      event.preventDefault()
    },
    true,
  )
})

initAudioSettings()

createRoot(document.getElementById('root')!).render(
  <BootstrapGate labels={{ progress: 'Loading', retry: 'Retry' }}>
    <App />
  </BootstrapGate>,
)
