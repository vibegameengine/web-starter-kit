import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { BootstrapGate } from './bootstrap'

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

createRoot(document.getElementById('root')!).render(
  <BootstrapGate labels={{ progress: 'Loading', retry: 'Retry' }}>
    <App />
  </BootstrapGate>,
)
